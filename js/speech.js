// Text-to-speech, microphone capture, pitch tracking and pronunciation scoring.
(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const TONE_NAMES = { 1: '1st tone (high & flat →)', 2: '2nd tone (rising ↗)', 3: '3rd tone (dipping ↘↗)', 4: '4th tone (falling ↘)', 5: 'neutral tone' };
  // Chao tone letters on a 1-5 scale, used to draw the target contour.
  const TONE_SHAPES = { 1: [5, 5], 2: [3, 5], 3: [2, 1, 1.5, 4], 4: [5, 1], 5: [3, 3] };

  /* ---------- Text to speech ---------- */

  let voice = null;
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    voice = voices.find((v) => /zh[-_]CN/i.test(v.lang) && /google|xiaoxiao|tingting|yunxi/i.test(v.name))
      || voices.find((v) => /zh[-_]CN/i.test(v.lang))
      || voices.find((v) => /^zh/i.test(v.lang))
      || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text, rate) {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      if (voice) u.voice = voice;
      u.rate = rate ?? Store.state.settings.rate;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
      setTimeout(resolve, 4000);
    });
  }

  /* ---------- Pinyin helpers ---------- */

  function splitSyllable(numbered) {
    const m = /^([a-zü]+?)([1-5])?$/.exec(numbered.toLowerCase().replace('u:', 'ü').replace('v', 'ü'));
    if (!m) return { base: numbered, tone: 5 };
    return { base: m[1], tone: Number(m[2] || 5) };
  }

  const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
  function initialOf(base) {
    return INITIALS.find((i) => base.startsWith(i)) || '';
  }

  const TONE_MARK = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
  function mark(numbered) {
    const { base, tone } = splitSyllable(numbered);
    if (tone === 5) return base;
    const put = (i) => base.slice(0, i) + TONE_MARK[base[i]][tone - 1] + base.slice(i + 1);
    if (base.includes('a')) return put(base.indexOf('a'));
    if (base.includes('e')) return put(base.indexOf('e'));
    if (base.includes('ou')) return put(base.indexOf('o'));
    for (let i = base.length - 1; i >= 0; i--) if (TONE_MARK[base[i]]) return put(i);
    return base;
  }

  // Convert a tone-marked syllable back to numbered form ('zhōng' -> 'zhong1').
  function unmark(syl) {
    let tone = 5;
    let out = '';
    for (const ch of syl.toLowerCase()) {
      let found = false;
      for (const [v, marks] of Object.entries(TONE_MARK)) {
        const i = marks.indexOf(ch);
        if (i >= 0) { out += v; tone = i + 1; found = true; break; }
      }
      if (!found) out += ch;
    }
    return out + tone;
  }

  function readingsOf(ch) {
    const r = window.READINGS[ch];
    return r ? r.split(',') : [];
  }

  /* ---------- Microphone + pitch tracking ---------- */

  let stream = null;
  let audioCtx = null;

  async function getStream() {
    if (stream && stream.active) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    return stream;
  }

  // YIN-style fundamental frequency estimate. Returns 0 when unvoiced.
  function detectPitch(buf, sampleRate) {
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < 0.012) return { f0: 0, rms };
    const minLag = Math.floor(sampleRate / 500);
    const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(buf.length / 2));
    const n = buf.length - maxLag;
    const d = new Float32Array(maxLag + 1);
    for (let tau = 1; tau <= maxLag; tau++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const diff = buf[i] - buf[i + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    // Cumulative mean normalized difference
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      running += d[tau];
      d[tau] = running ? (d[tau] * tau) / running : 1;
    }
    let best = -1;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (d[tau] < 0.2) {
        while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;
        best = tau;
        break;
      }
    }
    if (best < 0) return { f0: 0, rms };
    // Parabolic interpolation around the minimum
    const a = d[best - 1] ?? d[best];
    const b = d[best];
    const c = d[best + 1] ?? d[best];
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    return { f0: sampleRate / (best + (Number.isFinite(shift) ? shift : 0)), rms };
  }

  let active = null;

  // Records until speech recognition finishes, silence follows speech, or maxMs passes.
  // onLevel(rms) is called while recording so the UI can show a live meter.
  async function listen({ maxMs = 4000, onLevel } = {}) {
    if (active) active.stop();
    const s = await getStream();
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(s);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const frames = [];
    const transcripts = [];
    let recognition = null;
    let recognitionDone = !Recognition;
    let recognitionError = null;
    let recorder = null;
    const chunks = [];
    const started = performance.now();
    let heardAt = 0;

    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearInterval(timer);
        clearTimeout(hardStop);
        try { recognition && recognition.abort(); } catch (e) { /* already stopped */ }
        source.disconnect();
        active = null;
        const done = (audioUrl) => resolve({ frames, transcripts, audioUrl, recognitionAvailable: !!Recognition, recognitionError });
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = () => done(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })) : null);
          recorder.stop();
        } else done(null);
      };

      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const t = performance.now() - started;
        const { f0, rms } = detectPitch(buf, audioCtx.sampleRate);
        frames.push({ t, f0, rms });
        if (onLevel) onLevel(rms);
        if (rms > 0.02 && !heardAt) heardAt = t;
        // Stop on ~700ms of silence after speech; recognition (if any) usually ends first.
        if (heardAt && t - heardAt > 500) {
          const tail = frames.slice(-28);
          if (tail.length === 28 && tail.every((f) => f.rms < 0.015)) {
            if (recognitionDone) finish();
          }
        }
      }, 25);
      const hardStop = setTimeout(finish, maxMs + 1500);

      if (window.MediaRecorder) {
        try {
          recorder = new MediaRecorder(s);
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.start();
        } catch (e) { recorder = null; }
      }

      if (Recognition) {
        recognition = new Recognition();
        recognition.lang = 'zh-CN';
        recognition.maxAlternatives = 5;
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onresult = (e) => {
          for (const result of e.results) {
            for (const alt of result) transcripts.push({ text: alt.transcript, confidence: alt.confidence });
          }
        };
        recognition.onerror = (e) => { recognitionError = e.error; recognitionDone = true; };
        recognition.onend = () => { recognitionDone = true; setTimeout(finish, 150); };
        try { recognition.start(); } catch (e) { recognitionDone = true; }
        setTimeout(() => { try { recognition.stop(); } catch (e) { /* ignore */ } }, maxMs);
      } else {
        setTimeout(finish, maxMs);
      }

      active = { stop: finish };
    });
  }

  function stop() {
    if (active) active.stop();
  }

  /* ---------- Tone contour analysis ---------- */

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  // Returns the main voiced stretch as semitones relative to the speaker's typical pitch.
  function contourOf(frames) {
    let best = [];
    let cur = [];
    let gap = 0;
    for (const f of frames) {
      if (f.f0 > 0) { cur.push(f); gap = 0; }
      else if (cur.length && ++gap > 3) { if (cur.length > best.length) best = cur; cur = []; gap = 0; }
    }
    if (cur.length > best.length) best = cur;
    if (best.length < 6) return null;

    let hz = best.map((f) => f.f0);
    // Remove octave errors relative to the segment median
    const m = median(hz);
    hz = hz.filter((f) => Math.abs(12 * Math.log2(f / m)) < 8);
    if (hz.length < 6) return null;
    // 3-point median smoothing
    hz = hz.map((_, i) => median(hz.slice(Math.max(0, i - 1), i + 2)));
    // Drop onset/offset transients
    const trim = Math.floor(hz.length * 0.1);
    hz = hz.slice(trim, hz.length - trim);

    const voice = Store.state.voice;
    const ref = voice.samples >= 3 ? voice.median : m;
    return { st: hz.map((f) => 12 * Math.log2(f / ref)), segMedianHz: m };
  }

  function classifyTone(st) {
    const n = st.length;
    const k = Math.max(1, Math.round(n * 0.2));
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const s = avg(st.slice(0, k));
    const e = avg(st.slice(-k));
    let minI = 0;
    st.forEach((v, i) => { if (v < st[minI]) minI = i; });
    const min = st[minI];
    const max = Math.max(...st);
    const range = max - min;
    const delta = e - s;
    const level = avg(st);
    const minPos = minI / (n - 1);

    if (minPos > 0.2 && minPos < 0.8 && s - min > 1.2 && e - min > 1.5) return 3;
    if (delta >= 1.8) return s - min > 1.5 ? 3 : 2;
    if (delta <= -2.2) return level < -2 && delta > -4 ? 3 : 4;
    if (range < 2.5) return level < -2.5 ? 3 : 1;
    return delta > 0 ? 2 : 4;
  }

  function updateVoiceProfile(segMedianHz) {
    const v = Store.state.voice;
    const w = Math.min(v.samples, 20);
    v.median = v.samples ? (v.median * w + segMedianHz) / (w + 1) : segMedianHz;
    v.samples += 1;
  }

  /* ---------- Scoring ---------- */

  function compareSyllable(heardChar, target) {
    // target: { char, base, tone }
    if (heardChar === target.char) return { score: 100, kind: 'exact', heard: target };
    let best = { score: 10, kind: 'different', heard: null };
    for (const r of readingsOf(heardChar)) {
      const h = splitSyllable(r);
      let score = 10;
      let kind = 'different';
      if (h.base === target.base && (h.tone === target.tone || target.tone === 5)) { score = 92; kind = 'homophone'; }
      else if (h.base === target.base) { score = 60; kind = 'tone'; }
      else if (initialOf(h.base) === initialOf(target.base) || h.base.slice(initialOf(h.base).length) === target.base.slice(initialOf(target.base).length)) {
        score = h.tone === target.tone ? 40 : 30; kind = 'close';
      }
      if (score > best.score) best = { score, kind, heard: { char: heardChar, base: h.base, tone: h.tone } };
    }
    return best;
  }

  // text: the characters to say; syllables: numbered pinyin, one per character.
  function score(result, text, syllables) {
    const targets = [...text].map((char, i) => ({ char, ...splitSyllable(syllables[i] || '') }));
    const out = { score: null, recognized: null, toneHeard: null, contour: null, messages: [], kind: null };

    // 1. Speech recognition result
    let rec = null;
    for (const t of result.transcripts) {
      const chars = [...t.text.replace(/[^一-鿿]/g, '')];
      if (!chars.length) continue;
      let cand;
      if (chars.join('').includes(text)) {
        cand = { score: 100, parts: targets.map((tg) => ({ score: 100, kind: 'exact', heard: tg })), text: t.text };
      } else if (targets.length === 1) {
        // Single character: the recognizer may return a homophone or add filler; take the best char.
        const parts = chars.map((c) => compareSyllable(c, targets[0])).sort((a, b) => b.score - a.score);
        cand = { score: parts[0].score - (chars.length > 2 ? 5 : 0), parts: [parts[0]], text: t.text };
      } else {
        const parts = targets.map((tg, i) => (chars[i] ? compareSyllable(chars[i], tg) : { score: 0, kind: 'missing', heard: null }));
        cand = { score: parts.reduce((a, p) => a + p.score, 0) / parts.length, parts, text: t.text };
      }
      if (!rec || cand.score > rec.score) rec = cand;
    }
    if (rec) out.recognized = rec.text.replace(/[。，？！.,?!\s]/g, '');

    // 2. Pitch contour (single syllables only)
    let toneScore = null;
    const c = targets.length === 1 ? contourOf(result.frames) : null;
    if (c) {
      out.contour = c.st;
      updateVoiceProfile(c.segMedianHz);
      if (targets[0].tone !== 5) {
        out.toneHeard = classifyTone(c.st);
        const want = targets[0].tone;
        const confusable = (a, b) => (a === 2 && b === 3) || (a === 3 && b === 2) || (a === 3 && b === 4) || (a === 4 && b === 3);
        toneScore = out.toneHeard === want ? 100 : confusable(out.toneHeard, want) ? 55 : 20;
      }
    }

    const offline = result.recognitionError === 'network' || !navigator.onLine;
    const voiced = result.frames.filter((f) => f.rms > 0.02).length;
    if (!rec && !c && voiced < 4) {
      out.messages.push(result.recognitionAvailable ? "I didn't hear anything — check your mic and speak a little louder." : 'No voice detected. Try again, a bit louder.');
      return out;
    }

    if (rec) {
      const recTone = rec.parts.length === 1 ? rec.parts[0] : null;
      out.score = toneScore == null ? rec.score : Math.round(rec.score * 0.75 + toneScore * 0.25);
      if (rec.score >= 100) out.score = Math.max(out.score, 85);
      out.kind = recTone ? recTone.kind : rec.score >= 90 ? 'exact' : 'partial';

      if (targets.length === 1) {
        const t = targets[0];
        const p = rec.parts[0];
        if (p.kind === 'exact') out.messages.push(`Recognized “${t.char}” — clear and correct!`);
        else if (p.kind === 'homophone') out.messages.push(`Heard “${p.heard.char}” (${mark(p.heard.base + p.heard.tone)}) — same sound and tone. Nice!`);
        else if (p.kind === 'tone') out.messages.push(`Right syllable, but it sounded like ${mark(p.heard.base + p.heard.tone)} — ${TONE_NAMES[p.heard.tone]}. Aim for ${mark(t.base + t.tone)}: ${TONE_NAMES[t.tone]}.`);
        else if (p.kind === 'close') out.messages.push(`Close — heard “${p.heard.char}” (${mark(p.heard.base + p.heard.tone)}). Listen again and match the sound of ${mark(t.base + t.tone)}.`);
        else out.messages.push(`Heard “${out.recognized}”. Listen to the model and try again.`);
      } else {
        const wrong = rec.parts.map((p, i) => ({ p, t: targets[i] })).filter((x) => x.p.score < 90);
        if (!wrong.length) out.messages.push(`Recognized “${text}” — great!`);
        else out.messages.push(`Heard “${out.recognized}”. Work on: ${wrong.map((x) => `${x.t.char} ${mark(x.t.base + x.t.tone)}`).join(', ')}.`);
      }
    } else if (toneScore == null) {
      out.messages.push(offline ? "You're offline, so word recognition is off, and this syllable has no tone to measure — compare yourself with the model." : Recognition ? "I couldn't make out a word. Try again, a little slower and closer to the mic." : "This browser can't recognize speech and this syllable has no tone to measure — check yourself against the model.");
      return out;
    } else {
      // No recognizer (or it returned nothing): judge by tone only.
      out.score = toneScore;
      out.kind = 'tone-only';
      out.messages.push(offline ? "You're offline, so word recognition is off — scoring the tone only." : Recognition ? "The recognizer couldn't make out a word — scoring the tone only." : 'Speech recognition is not available in this browser (try Chrome, Edge or Safari) — scoring the tone only.');
    }

    if (toneScore != null && out.toneHeard) {
      const want = targets[0].tone;
      if (out.toneHeard === want) out.messages.push(`Pitch: your voice followed the ${TONE_NAMES[want]}. ✓`);
      else out.messages.push(`Pitch: your voice sounded like the ${TONE_NAMES[out.toneHeard]}; the target is the ${TONE_NAMES[want]}.`);
    }
    return out;
  }

  /* ---------- Contour drawing ---------- */

  function drawContour(canvas, tone, contour) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const pad = 10;
    const y = (level) => h - pad - ((level - 1) / 4) * (h - pad * 2);

    g.strokeStyle = css.getPropertyValue('--line').trim();
    g.lineWidth = 1;
    for (let l = 1; l <= 5; l++) { g.beginPath(); g.moveTo(pad, y(l)); g.lineTo(w - pad, y(l)); g.stroke(); }

    const shape = TONE_SHAPES[tone] || TONE_SHAPES[5];
    g.strokeStyle = css.getPropertyValue('--target').trim();
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = 0.35;
    g.beginPath();
    shape.forEach((lv, i) => {
      const x = pad + (i / (shape.length - 1)) * (w - pad * 2);
      i ? g.lineTo(x, y(lv)) : g.moveTo(x, y(lv));
    });
    g.stroke();
    g.globalAlpha = 1;

    if (contour && contour.length > 1) {
      // Map ±7 semitones around the speaker's typical pitch onto levels 1-5 (3 = typical).
      g.strokeStyle = css.getPropertyValue('--accent').trim();
      g.lineWidth = 3.5;
      g.beginPath();
      contour.forEach((st, i) => {
        const lv = Math.max(1, Math.min(5, 3 + st / 3.5));
        const x = pad + (i / (contour.length - 1)) * (w - pad * 2);
        i ? g.lineTo(x, y(lv)) : g.moveTo(x, y(lv));
      });
      g.stroke();
    }
  }

  window.Speech = {
    speak, listen, stop, score, drawContour, mark, unmark, splitSyllable, readingsOf, TONE_NAMES,
    recognitionSupported: !!Recognition,
    micSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    _detectPitch: detectPitch, _classifyTone: classifyTone, _compareSyllable: compareSyllable,
  };
})();
