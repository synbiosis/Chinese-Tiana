// UI: home screen, daily lesson engine, character browser and settings.
(function () {
  const HANZI = window.HANZI;
  const BY_CHAR = Object.fromEntries(HANZI.map((h) => [h.c, h]));
  const S = Store.state;
  const $view = document.getElementById('view');
  const $modal = document.getElementById('modal');
  const $modalBody = document.getElementById('modal-body');

  /* ---------- Helpers ---------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const toneOf = (h) => Speech.splitSyllable(h.n).tone;
  const shortMeaning = (h) => {
    const parts = h.m.split('; ');
    let out = parts[0];
    if (out.length < 18 && parts[1]) out += '; ' + parts[1];
    return out.length > 60 ? out.slice(0, 57) + '…' : out;
  };
  const learnedChars = () => Object.keys(S.cards);

  function speakChar(h) { return Speech.speak(h.c); }

  /* ---------- Navigation ---------- */

  let currentTab = 'home';
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

  function show(tab) {
    stopWriter();
    currentTab = tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.body.classList.remove('in-lesson');
    window.scrollTo(0, 0);
    ({ home: renderHome, chars: renderChars, settings: renderSettings })[tab]();
  }

  /* ---------- Home ---------- */

  function plan() {
    const due = Store.dueCards();
    let newCount = S.settings.newPerDay;
    if (due.length > 120) newCount = 0;
    else if (due.length > 60) newCount = Math.ceil(newCount / 2);
    newCount = Math.min(newCount, HANZI.length - S.nextNew);
    return { due, newCount };
  }

  function renderHome() {
    const learned = learnedChars().length;
    const known = Panda.masteredCount();
    const { due, newCount } = plan();
    const day = S.days[Store.today()];
    const doneToday = day?.completed;
    const streak = Store.streak();
    const pct = learned / HANZI.length;
    const C = 2 * Math.PI * 48;
    const next = HANZI.slice(S.nextNew, S.nextNew + newCount).map((h) => h.c).join('');

    const week = [];
    for (let i = -6; i <= 0; i++) {
      const key = Store.today(i);
      const d = S.days[key];
      const mins = d ? Math.round(d.seconds / 60) : 0;
      const label = new Date(key + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' });
      const h = Math.min(100, (mins / S.settings.minutes) * 100);
      week.push(`<div class="bar" title="${key}: ${mins} min"><i class="${d?.completed ? 'done' : mins ? 'part' : ''}" style="height:${Math.max(6, h)}%"></i>${label}</div>`);
    }

    const warnings = [];
    if (!navigator.onLine) warnings.push('You’re offline. Lessons, audio and progress all still work; speaking is scored by tone only until you’re back online.');
    if (S.settings.mic && !Speech.micSupported) warnings.push('Your browser can’t access a microphone here. Open the app over https or localhost to use speaking practice.');
    else if (S.settings.mic && !Speech.recognitionSupported) warnings.push('Speech recognition isn’t available in this browser, so speaking is judged by tone only. Chrome, Edge or Safari give full feedback.');

    $view.innerHTML = `
      <h1><span class="hz">汉字</span> 1000</h1>
      <p class="muted" style="margin-top:0">Read and say the 1,000 most common Chinese characters, ${S.settings.minutes} minutes a day.</p>
      ${warnings.map((w) => `<div class="notice">${esc(w)}</div>`).join('')}
      <div class="card">
        <div class="hero">
          <div class="ring">
            <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
              <circle cx="56" cy="56" r="48" fill="none" stroke="var(--line)" stroke-width="10"/>
              <circle cx="56" cy="56" r="48" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
            </svg>
            <div class="ring-label"><div><b>${learned}</b><span class="small muted">of 1000</span></div></div>
          </div>
          <div>
            <div style="font-size:20px;font-weight:700">${doneToday ? 'Today’s lesson is done ✓' : 'Today’s lesson'}</div>
            <div class="muted small">${due.length} review${due.length === 1 ? '' : 's'} due · ${newCount} new character${newCount === 1 ? '' : 's'}</div>
            ${next ? `<div class="next-chars hz" aria-label="New characters today">${esc(next)}</div>` : ''}
          </div>
        </div>
        <button class="btn block big" id="start" style="margin-top:16px">${doneToday ? 'Practice again' : `Start ${S.settings.minutes}-minute lesson`}</button>
        ${redoButtonHTML()}
      </div>
      ${Panda.card()}
      <div class="stats">
        <div class="stat"><b>${streak}🔥</b><span>day streak</span></div>
        <div class="stat"><b>${known}</b><span>mastered</span></div>
        <div class="stat"><b>${Math.max(0, Math.ceil((HANZI.length - S.nextNew) / S.settings.newPerDay))}</b><span>days to finish</span></div>
      </div>
      <h2>This week</h2>
      <div class="card"><div class="week">${week.join('')}</div></div>
      <h2>How a lesson works</h2>
      <div class="card small">
        <ol style="margin:0;padding-left:20px">
          <li><b>Review</b> characters that are due (spaced repetition brings them back just before you’d forget).</li>
          <li><b>Learn</b> ${S.settings.newPerDay} new characters in frequency order: see, hear and say each one.</li>
          <li><b>Practice</b> — meaning, pinyin, listening and speaking drills. Tap 🎤 and say the character; you’ll get a score for the sound and the tone.</li>
          <li>If time remains, bonus practice fills the ${S.settings.minutes} minutes.</li>
        </ol>
      </div>`;
    document.getElementById('start').onclick = startLesson;
    bindRedo();
    Panda.animate();
  }

  /* ---------- Lesson engine ---------- */

  let L = null; // active lesson

  function exerciseTypes() {
    return S.settings.mic ? ['meaning', 'pinyin', 'listen', 'speak', 'speak'] : ['meaning', 'pinyin', 'listen'];
  }

  function buildQueue() {
    const { due, newCount } = plan();
    const queue = due.slice(0, 80).map((ch) => ({ type: pick(exerciseTypes()), ch, phase: 'review' }));
    const fresh = HANZI.slice(S.nextNew, S.nextNew + newCount).map((h) => h.c);
    for (let i = 0; i < fresh.length; i += 5) {
      const batch = fresh.slice(i, i + 5);
      batch.forEach((ch) => queue.push({ type: 'intro', ch, phase: 'learn' }));
      shuffle(batch).forEach((ch) => queue.push({ type: 'meaning', ch, phase: 'practice' }));
      shuffle(batch).forEach((ch) => queue.push({ type: Math.random() < 0.5 ? 'pinyin' : 'listen', ch, phase: 'practice', final: !S.settings.mic }));
      if (S.settings.mic) shuffle(batch).forEach((ch) => queue.push({ type: 'speak', ch, phase: 'practice', final: true }));
    }
    return queue;
  }

  /* ---------- Redo the last lesson ---------- */

  // Saves what the current lesson covered so it can be redone later. A lesson
  // only replaces the previous record once it has covered something.
  function remember(kind, ch) {
    const rec = L.record;
    if (!rec || rec[kind].includes(ch)) return;
    rec[kind].push(ch);
    S.lastLesson = rec;
  }

  function lastLesson() {
    if (S.lastLesson && (S.lastLesson.learned.length || S.lastLesson.reviewed.length)) return S.lastLesson;
    // Lessons from before this was recorded: use the most recent day's new characters.
    const dates = Object.values(S.cards).map((c) => c.introduced).filter(Boolean).sort();
    if (!dates.length) return null;
    const date = dates[dates.length - 1];
    const learned = HANZI.filter((h) => S.cards[h.c]?.introduced === date).map((h) => h.c);
    return { date, learned, reviewed: [] };
  }

  function redoButtonHTML() {
    const last = lastLesson();
    if (!last) return '';
    const when = last.date === Store.today() ? 'today’s' : last.date === Store.today(-1) ? 'yesterday’s' : 'last';
    const parts = [];
    if (last.learned.length) parts.push(`<span class="hz">${esc(last.learned.slice(0, 8).join(''))}</span>${last.learned.length > 8 ? '…' : ''}`);
    if (last.reviewed.length) parts.push(`${last.reviewed.length} review${last.reviewed.length === 1 ? '' : 's'}`);
    return `<button class="btn block ghost" id="redo" style="margin-top:10px">↺ Redo ${when} lesson <span class="muted small">${parts.join(' + ')}</span></button>`;
  }

  function bindRedo() {
    const btn = document.getElementById('redo');
    if (btn) btn.onclick = () => startRedo(lastLesson());
  }

  // Replays a lesson's characters as practice: same intros and drills, but it
  // doesn't change review dates, add new characters or count toward the streak.
  function startRedo(last) {
    if (!last) return;
    const queue = [];
    for (let i = 0; i < last.learned.length; i += 5) {
      const batch = last.learned.slice(i, i + 5);
      batch.forEach((ch) => queue.push({ type: 'intro', ch, phase: 'redo-learn' }));
      shuffle(batch).forEach((ch) => queue.push({ type: 'meaning', ch, phase: 'redo' }));
      shuffle(batch).forEach((ch) => queue.push({ type: Math.random() < 0.5 ? 'pinyin' : 'listen', ch, phase: 'redo' }));
      if (S.settings.mic) shuffle(batch).forEach((ch) => queue.push({ type: 'speak', ch, phase: 'redo' }));
    }
    shuffle(last.reviewed).forEach((ch) => queue.push({ type: pick(exerciseTypes()), ch, phase: 'redo' }));
    if (!queue.length) return;
    L = {
      queue, i: 0, elapsed: 0, total: S.settings.minutes * 60, replay: true, replayOf: last,
      misses: {}, learned: [], reviewed: new Set(), correct: 0, answered: 0, spoken: 0, scoreSum: 0, startedAt: Date.now(),
    };
    Store.dayStats();
    L.timer = setInterval(tick, 1000);
    document.body.classList.add('in-lesson');
    nextItem(true);
  }

  function startLesson() {
    L = {
      queue: buildQueue(), i: 0, elapsed: 0, total: S.settings.minutes * 60,
      timeUpShown: false, misses: {}, learned: [], reviewed: new Set(), correct: 0, answered: 0, spoken: 0, scoreSum: 0,
      startedAt: Date.now(), record: { date: Store.today(), learned: [], reviewed: [] },
    };
    Store.dayStats();
    L.timer = setInterval(tick, 1000);
    document.body.classList.add('in-lesson');
    nextItem(true);
  }

  function tick() {
    if (!L || document.visibilityState !== 'visible') return;
    L.elapsed += 1;
    const day = Store.dayStats();
    day.seconds += 1;
    if (!L.replay && L.elapsed >= L.total && !day.completed) day.completed = true;
    if (L.elapsed % 10 === 0) Store.save();
    const clock = document.querySelector('.clock');
    if (L.replay) { if (clock) clock.textContent = fmtTime(L.elapsed); return; }
    const bar = document.querySelector('.timebar i');
    if (bar) bar.style.width = `${Math.min(100, (L.elapsed / L.total) * 100)}%`;
    if (clock) clock.textContent = L.elapsed < L.total ? fmtTime(L.total - L.elapsed) : '+' + fmtTime(L.elapsed - L.total);
  }

  function bonusItem() {
    const pool = learnedChars();
    if (!pool.length) return null;
    // Favour characters with low ease or low recent speaking scores.
    const weighted = pool.map((ch) => {
      const c = S.cards[ch];
      const avg = c.scores?.length ? c.scores.reduce((a, b) => a + b, 0) / c.scores.length : 70;
      return { ch, w: (3.1 - c.ease) + (100 - avg) / 50 + (L.misses[ch] ? 1 : 0) + Math.random() };
    }).sort((a, b) => b.w - a.w);
    return { type: pick(exerciseTypes()), ch: pick(weighted.slice(0, 8)).ch, phase: 'bonus' };
  }

  function nextItem(first) {
    if (first !== true) L.i += 1;
    if (L.replay) return L.i >= L.queue.length ? finishLesson() : renderItem(L.queue[L.i]);
    // Keep reviews from crowding out new characters when there is a backlog.
    if (L.elapsed > L.total * 0.55) {
      while (L.queue[L.i]?.phase === 'review' && L.queue.slice(L.i).some((q) => q.phase === 'learn')) L.i += 1;
    }
    if (L.elapsed >= L.total && !L.timeUpShown) {
      L.timeUpShown = true;
      return renderTimeUp();
    }
    if (L.i >= L.queue.length) {
      const day = Store.dayStats();
      if (!day.completed) { day.completed = true; Store.save(); }
      if (L.elapsed >= L.total) return finishLesson();
      const b = bonusItem();
      if (!b) return finishLesson();
      L.queue.push(b);
    }
    renderItem(L.queue[L.i]);
  }

  function lessonFrame(item, inner) {
    stopWriter();
    const left = L.total - L.elapsed;
    const remaining = L.queue.slice(L.i).filter((q) => q.phase !== 'bonus').length;
    const phaseLabel = {
      review: 'Review', learn: 'New character', practice: 'Practice', bonus: 'Bonus practice', retry: 'Try again',
      'redo-learn': 'Redo · character', redo: 'Redo · practice',
    }[item.phase];
    // A redo has no time limit: its bar shows progress through the queue and the clock counts up.
    const barPct = L.replay ? (L.i / L.queue.length) * 100 : Math.min(100, (L.elapsed / L.total) * 100);
    $view.innerHTML = `
      <div class="lesson-top">
        <button class="icon-btn" id="quit" aria-label="End lesson">✕</button>
        <div class="timebar" title="${L.replay ? 'Progress' : 'Lesson time'}"><i style="width:${barPct}%"></i></div>
        <div class="clock">${L.replay ? fmtTime(L.elapsed) : left > 0 ? fmtTime(left) : '+' + fmtTime(-left)}</div>
      </div>
      <div class="card">
        <div class="phase">${phaseLabel}${remaining ? ` · ${remaining} left` : ''}</div>
        ${inner}
      </div>`;
    document.getElementById('quit').onclick = finishLesson;
  }

  function renderItem(item) {
    const h = BY_CHAR[item.ch];
    ({ intro: renderIntro, meaning: renderMeaning, pinyin: renderPinyin, listen: renderListen, speak: renderSpeak })[item.type](item, h);
  }

  // Called once per exercise with the outcome. quality: 0..3, or null for ungraded.
  function complete(item, ok, speakScore) {
    const h = BY_CHAR[item.ch];
    L.answered += 1;
    if (ok) L.correct += 1;
    if (speakScore != null) {
      L.spoken += 1;
      L.scoreSum += speakScore;
      Store.recordScore(item.ch, speakScore);
      const day = Store.dayStats();
      day.spoken += 1;
      day.scoreSum += speakScore;
    }
    if (!ok && item.phase !== 'bonus') {
      L.misses[item.ch] = (L.misses[item.ch] || 0) + 1;
      // Bring it back a few items later with a different drill.
      const types = exerciseTypes().filter((t) => t !== item.type);
      L.queue.splice(Math.min(L.queue.length, L.i + 4), 0, { type: pick(types), ch: item.ch, phase: 'retry' });
    }
    if (item.phase === 'review') {
      let q = ok ? 2 : 0;
      if (ok && speakScore != null && speakScore < 75) q = 1;
      if (ok && item.hinted) q = 1;
      Store.grade(item.ch, q);
      L.reviewed.add(item.ch);
      remember('reviewed', item.ch);
      Store.dayStats().reviewed += 1;
    }
    if (item.phase === 'practice' && item.final) {
      Store.grade(item.ch, L.misses[item.ch] ? 0 : 2);
    }
    Store.save();
    return h;
  }

  /* ---------- Exercises ---------- */

  function charHeader(h, { showPinyin = true, showMeaning = true } = {}) {
    return `
      <div class="big-hanzi" lang="zh-CN">${h.c}</div>
      ${showPinyin ? `<div class="pinyin">${esc(h.p)}</div>` : ''}
      ${showMeaning ? `<div class="meaning">${esc(shortMeaning(h))}</div>` : ''}`;
  }

  function examplesHTML(h) {
    if (!h.w.length) return '';
    return `<ul class="examples">${h.w.map((w, i) => `
      <li><button class="icon-btn small" data-say-word="${i}" aria-label="Play ${esc(w[0])}">🔊</button>
        <div><span class="w" lang="zh-CN">${esc(w[0])}</span> <span class="wp">${esc(w[1])}</span><div class="wm">${esc(w[2])}</div></div></li>`).join('')}</ul>`;
  }

  function bindExamples(root, h) {
    root.querySelectorAll('[data-say-word]').forEach((b) => { b.onclick = () => Speech.speak(h.w[Number(b.dataset.sayWord)][0]); });
  }

  // Only one stroke animation runs at a time; it loops forever unless paused.
  let activeWriter = null;
  function stopWriter() {
    if (activeWriter) { try { activeWriter.pauseAnimation(); } catch (e) { /* already gone */ } }
    activeWriter = null;
  }

  function strokeOrder(container, h) {
    stopWriter();
    if (!window.HanziWriter) { container.innerHTML = '<p class="muted small center">Stroke order needs an internet connection.</p>'; return; }
    container.innerHTML = '';
    const css = getComputedStyle(document.documentElement);
    const writer = HanziWriter.create(container, h.c, {
      width: 180, height: 180, padding: 8, showOutline: true, strokeAnimationSpeed: 1.2, delayBetweenStrokes: 180,
      strokeColor: css.getPropertyValue('--ink').trim(), outlineColor: css.getPropertyValue('--line').trim(),
      radicalColor: css.getPropertyValue('--accent').trim(),
      onLoadCharDataError: () => { container.innerHTML = '<p class="muted small center">Stroke data unavailable.</p>'; },
    });
    activeWriter = writer;
    writer.loopCharacterAnimation();
  }

  function renderIntro(item, h) {
    if (L.replay) {
      if (!L.learned.includes(h.c)) L.learned.push(h.c);
    } else if (!L.learned.includes(h.c)) {
      Store.introduce(h.c);
      remember('learned', h.c);
      L.learned.push(h.c);
      S.nextNew = Math.max(S.nextNew, h.r);
      Store.dayStats().learned += 1;
      Store.save();
    }
    const tone = toneOf(h);
    lessonFrame(item, `
      <p class="prompt muted center" style="margin:0">#${h.r} most common character</p>
      ${charHeader(h)}
      <div class="center"><span class="tone-tag">${esc(Speech.TONE_NAMES[tone])}</span></div>
      ${h.alt.length ? `<p class="center small muted" style="margin:6px 0 0">Also read: ${esc(h.alt.join(', '))}</p>` : ''}
      <div class="tools">
        <button class="icon-btn" id="hear">🔊 Listen</button>
        <button class="icon-btn" id="slow">🐢 Slow</button>
        <button class="icon-btn" id="strokes">✍️ Strokes</button>
      </div>
      <div class="writer" id="writer"></div>
      ${examplesHTML(h)}
      ${S.settings.mic ? '<div id="mic-slot"></div>' : ''}
      <div class="footer-actions"><button class="btn big" id="next">Got it →</button></div>`);
    bindExamples($view, h);
    document.getElementById('hear').onclick = () => speakChar(h);
    document.getElementById('slow').onclick = () => Speech.speak(h.c, 0.5);
    document.getElementById('strokes').onclick = () => strokeOrder(document.getElementById('writer'), h);
    if (S.settings.mic) micWidget(document.getElementById('mic-slot'), h, { label: 'Try saying it' });
    const next = () => { complete(item, true, null); nextItem(); };
    document.getElementById('next').onclick = next;
    onKeys({ Enter: next });
    if (S.settings.autoplay) speakChar(h);
  }

  function distractors(h, n, keyFn) {
    const pool = shuffle([...learnedChars().filter((c) => c !== h.c).map((c) => BY_CHAR[c]),
      ...HANZI.slice(Math.max(0, h.r - 40), h.r + 40)]);
    const seen = new Set([keyFn(h)]);
    const out = [];
    for (const d of pool) {
      if (d.c === h.c || seen.has(keyFn(d))) continue;
      seen.add(keyFn(d));
      out.push(d);
      if (out.length === n) break;
    }
    return out;
  }

  // Generic multiple choice. options: [{label, correct}], cls: extra option class
  function multipleChoice(item, h, { prompt, header, options, cls = '', grid = false, afterHTML = '' }) {
    lessonFrame(item, `
      ${header}
      <p class="prompt center">${prompt}</p>
      <div class="options ${grid ? 'grid2' : ''}">
        ${options.map((o, i) => `<button class="option ${cls}" data-i="${i}">${grid ? '' : `<span class="key">${i + 1}</span>`}<span>${o.label}</span></button>`).join('')}
      </div>
      ${afterHTML}
      <div id="after"></div>`);
    const buttons = [...$view.querySelectorAll('.option')];
    let answered = false;
    const choose = (i) => {
      if (answered) return;
      answered = true;
      const ok = options[i].correct;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (options[j].correct) b.classList.add('correct');
        else if (j === i) b.classList.add('wrong');
      });
      complete(item, ok, null);
      speakChar(h);
      document.getElementById('after').innerHTML = `
        <div class="feedback ${ok ? 'good' : 'bad'}">
          ${ok ? '✓ Correct!' : '✗ Not quite.'} <span class="hz" lang="zh-CN" style="font-size:22px">${h.c}</span>
          <b>${esc(h.p)}</b> — ${esc(shortMeaning(h))}
        </div>
        <div class="footer-actions"><button class="icon-btn" id="again">🔊</button><button class="btn big" id="next">Continue →</button></div>`;
      document.getElementById('again').onclick = () => speakChar(h);
      document.getElementById('next').onclick = nextItem;
      onKeys({ Enter: nextItem });
      if (ok) setTimeout(() => { if (L && L.queue[L.i] === item && document.getElementById('next')) nextItem(); }, 900);
    };
    buttons.forEach((b, i) => { b.onclick = () => choose(i); });
    const keys = {};
    options.forEach((_, i) => { keys[String(i + 1)] = () => choose(i); });
    onKeys(keys);
  }

  function renderMeaning(item, h) {
    const opts = shuffle([{ label: esc(shortMeaning(h)), correct: true },
      ...distractors(h, 3, shortMeaning).map((d) => ({ label: esc(shortMeaning(d)), correct: false }))]);
    multipleChoice(item, h, { prompt: 'What does this character mean?', header: charHeader(h, { showPinyin: false, showMeaning: false }), options: opts });
  }

  function renderPinyin(item, h) {
    const { base, tone } = Speech.splitSyllable(h.n);
    const tones = shuffle([1, 2, 3, 4].filter((t) => t !== tone)).slice(0, 2).map((t) => Speech.mark(base + t));
    const other = distractors(h, 3, (d) => d.p).map((d) => d.p).filter((p) => !tones.includes(p) && p !== h.p);
    const labels = [...new Set([...tones, ...other])].slice(0, 3);
    const opts = shuffle([{ label: esc(h.p), correct: true }, ...labels.map((p) => ({ label: esc(p), correct: false }))]);
    multipleChoice(item, h, {
      prompt: 'How is it pronounced?', header: charHeader(h, { showPinyin: false, showMeaning: true }),
      options: opts, cls: 'py-opt', grid: true,
    });
  }

  function renderListen(item, h) {
    const opts = shuffle([{ label: h.c, correct: true },
      ...distractors(h, 3, (d) => Speech.splitSyllable(d.n).base).map((d) => ({ label: d.c, correct: false }))]);
    multipleChoice(item, h, {
      prompt: 'Which character did you hear?',
      header: '<div class="tools"><button class="btn soft big" id="play">🔊 Play again</button><button class="icon-btn" id="play-slow">🐢</button></div>',
      options: opts, cls: 'hz-opt', grid: true,
    });
    document.getElementById('play').onclick = () => speakChar(h);
    document.getElementById('play-slow').onclick = () => Speech.speak(h.c, 0.5);
    speakChar(h);
  }

  function renderSpeak(item, h) {
    if (!S.settings.mic || !Speech.micSupported) return renderSelfCheck(item, h);
    lessonFrame(item, `
      <p class="prompt center">Read this character aloud</p>
      ${charHeader(h, { showPinyin: false, showMeaning: true })}
      <div class="center" id="hint-slot"><button class="link-btn" id="hint">Show pinyin (hint)</button></div>
      <div id="mic-slot"></div>
      <div id="after"><p class="center" style="margin:8px 0 0"><button class="link-btn" id="self">Can’t talk right now? Check yourself instead</button></p></div>`);
    document.getElementById('self').onclick = () => renderSelfCheck(item, h);
    let graded = false;
    const reveal = () => {
      document.getElementById('hint-slot').innerHTML = `<div class="pinyin">${esc(h.p)}</div>
        <button class="icon-btn small" id="model" aria-label="Hear it">🔊</button>`;
      document.getElementById('model').onclick = () => speakChar(h);
    };
    document.getElementById('hint').onclick = () => { if (!graded) item.hinted = true; reveal(); };
    const finishWith = (score) => {
      graded = true;
      complete(item, score >= 55, score);
      reveal();
      document.getElementById('after').innerHTML = `<div class="footer-actions"><button class="btn big" id="next">Continue →</button></div>`;
      document.getElementById('next').onclick = nextItem;
    };
    micWidget(document.getElementById('mic-slot'), h, {
      autoFocus: true,
      onScore: (res) => {
        if (graded || res.score == null) return;
        finishWith(res.score);
        if (res.score < 55) {
          const slot = document.getElementById('after');
          slot.insertAdjacentHTML('afterbegin', '<p class="center small muted" style="margin:10px 0 0">Listen, then try again — only your first try counts.<br><button class="link-btn" id="override">I said it right — count it</button></p>');
          document.getElementById('override').onclick = (e) => {
            e.target.parentElement.remove();
            L.correct += 1;
            if (L.misses[item.ch]) L.misses[item.ch] -= 1;
            // Remove the retry that was scheduled for this miss.
            const r = L.queue.findIndex((q, j) => j > L.i && q.phase === 'retry' && q.ch === item.ch);
            if (r >= 0) L.queue.splice(r, 1);
            if (item.phase === 'review') Store.grade(item.ch, 1);
          };
        }
      },
    });
  }

  function renderSelfCheck(item, h) {
    lessonFrame(item, `
      <p class="prompt center">Say this character out loud, then check yourself</p>
      ${charHeader(h, { showPinyin: false, showMeaning: true })}
      <div id="after"><div class="footer-actions"><button class="btn big" id="reveal">Reveal</button></div></div>`);
    const reveal = () => {
      speakChar(h);
      document.getElementById('after').innerHTML = `
        <div class="pinyin" style="margin-top:10px">${esc(h.p)}</div>
        <div class="footer-actions"><button class="btn ghost big" id="no">Not quite</button><button class="btn good big" id="yes">I said it right</button></div>`;
      const done = (ok) => { complete(item, ok, null); nextItem(); };
      document.getElementById('no').onclick = () => done(false);
      document.getElementById('yes').onclick = () => done(true);
      onKeys({ 1: () => done(false), 2: () => done(true) });
    };
    document.getElementById('reveal').onclick = reveal;
    onKeys({ Enter: reveal, ' ': reveal });
  }

  /* ---------- Microphone widget ---------- */

  function micWidget(container, h, { label = 'Tap and say it', onScore, autoFocus, text, syllables } = {}) {
    text = text || h.c;
    syllables = syllables || [h.n];
    const single = [...text].length === 1;
    container.innerHTML = `
      <div class="mic">
        <div class="small muted" style="margin-bottom:8px">${esc(label)}</div>
        <button class="mic-btn" aria-label="Record pronunciation">🎤</button>
        <div class="meter"><i></i></div>
        <div class="mic-status"></div>
        <div class="result-slot"></div>
      </div>`;
    const btn = container.querySelector('.mic-btn');
    const meter = container.querySelector('.meter i');
    const status = container.querySelector('.mic-status');
    const slot = container.querySelector('.result-slot');
    let recording = false;

    const run = async () => {
      if (recording) { Speech.stop(); return; }
      recording = true;
      speechSynthesis?.cancel();
      btn.classList.add('listening');
      btn.textContent = '■';
      status.textContent = 'Listening… say it now';
      let result;
      try {
        result = await Speech.listen({ maxMs: single ? 3500 : 5000, onLevel: (rms) => { meter.style.width = `${Math.min(100, rms * 900)}%`; } });
      } catch (e) {
        status.textContent = e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser settings.' : 'Could not start the microphone.';
        recording = false;
        btn.classList.remove('listening');
        btn.textContent = '🎤';
        return;
      }
      recording = false;
      btn.classList.remove('listening');
      btn.textContent = '🎤';
      meter.style.width = '0';
      const res = Speech.score(result, text, syllables);
      Store.save();
      status.textContent = res.score == null ? '' : 'Tap 🎤 to try again';
      const cls = res.score >= 80 ? 's-good' : res.score >= 55 ? 's-ok' : 's-bad';
      const tone = Speech.splitSyllable(syllables[0]).tone;
      slot.innerHTML = res.score == null
        ? `<div class="result"><ul>${res.messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`
        : `<div class="result">
            <div class="score">
              <div class="score-badge ${cls}">${res.score}</div>
              <ul>${res.messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
            </div>
            ${single && res.contour ? `<canvas aria-label="Pitch of your voice compared with the target tone"></canvas>
              <div class="legend"><span><i style="background:var(--target);opacity:.5"></i>target tone</span><span><i style="background:var(--accent)"></i>your pitch</span></div>` : ''}
            <div class="tools" style="margin-bottom:0">
              <button class="icon-btn small" data-act="model">🔊 Model</button>
              ${result.audioUrl ? '<button class="icon-btn small" data-act="mine">▶ My recording</button>' : ''}
            </div>
          </div>`;
      const canvas = slot.querySelector('canvas');
      if (canvas) Speech.drawContour(canvas, tone, res.contour);
      slot.querySelector('[data-act=model]')?.addEventListener('click', () => Speech.speak(text));
      slot.querySelector('[data-act=mine]')?.addEventListener('click', () => new Audio(result.audioUrl).play());
      if (onScore) onScore(res);
    };
    btn.onclick = run;
    if (autoFocus) onKeys({ ' ': run, Enter: () => document.getElementById('next')?.click() });
  }

  /* ---------- End of lesson ---------- */

  function renderTimeUp() {
    stopWriter();
    const left = L.queue.slice(L.i).filter((q) => q.phase !== 'bonus').length;
    $view.innerHTML = `
      <div class="card center">
        <div class="confetti">⏰</div>
        <h1>${S.settings.minutes} minutes done!</h1>
        <p class="muted">Today’s goal is complete.${left ? ` There ${left === 1 ? 'is' : 'are'} ${left} exercise${left === 1 ? '' : 's'} left in this lesson.` : ''}</p>
        <div class="footer-actions">
          ${left ? '<button class="btn ghost big" id="more">Keep going</button>' : ''}
          <button class="btn big" id="finish">See results</button>
        </div>
      </div>`;
    document.getElementById('finish').onclick = finishLesson;
    const more = document.getElementById('more');
    if (more) more.onclick = () => renderItem(L.queue[L.i] || bonusItem());
    onKeys({ Enter: finishLesson });
  }

  function finishLesson() {
    if (!L) return show('home');
    clearInterval(L.timer);
    stopWriter();
    Speech.stop();
    Store.save();
    const acc = L.answered ? Math.round((L.correct / L.answered) * 100) : 0;
    const avg = L.spoken ? Math.round(L.scoreSum / L.spoken) : null;
    const lesson = L;
    L = null;
    onKeys({});
    $view.innerHTML = `
      <div class="card center">
        <div class="confetti">${Store.dayStats().completed ? '🎉' : '👏'}</div>
        <h1>${lesson.replay ? 'Redo complete!' : Store.dayStats().completed ? 'Lesson complete!' : 'Nice work'}</h1>
        <p class="muted">${fmtTime(lesson.elapsed)} practiced · streak ${Store.streak()}🔥</p>
        <div class="stats" style="margin:16px 0">
          ${lesson.replay
            ? `<div class="stat"><b>${new Set(lesson.queue.slice(0, lesson.i + 1).map((q) => q.ch)).size}</b><span>characters practiced</span></div>
               <div class="stat"><b>${lesson.answered}</b><span>drills done</span></div>`
            : `<div class="stat"><b>${lesson.learned.length}</b><span>new characters</span></div>
               <div class="stat"><b>${lesson.reviewed.size}</b><span>reviewed</span></div>`}
          <div class="stat"><b>${acc}%</b><span>accuracy</span></div>
        </div>
        ${avg != null ? `<p>Average pronunciation score: <b>${avg}</b> / 100</p>` : ''}
        ${lesson.learned.length ? `<p class="muted small">${lesson.replay ? 'Characters in this lesson' : 'Learned today'}</p><div class="learned-list" lang="zh-CN">${lesson.learned.join('')}</div>` : ''}
        <div class="footer-actions"><button class="btn ghost big" id="redo-again">↺ Redo</button><button class="btn big" id="done">Done</button></div>
      </div>
      ${Panda.card()}`;
    document.getElementById('redo-again').onclick = () => startRedo(lesson.replay ? lesson.replayOf : lastLesson());
    if (!lesson.replay && !lastLesson()) document.getElementById('redo-again').remove();
    Panda.animate();
    document.getElementById('done').onclick = () => show('home');
  }

  /* ---------- Characters ---------- */

  let charFilter = 'all';
  let charQuery = '';

  function renderChars() {
    $view.innerHTML = `
      <h1>Characters</h1>
      <p class="muted" style="margin-top:0">The 1,000 most frequent characters, in order. Tap one to study it.</p>
      <input class="search" id="q" type="search" placeholder="Search: 你, ni, you…" value="${esc(charQuery)}" autocomplete="off">
      <div class="chips">
        ${['all', 'learned', 'new'].map((f) => `<button class="chip ${charFilter === f ? 'active' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
      </div>
      <div class="key-legend">
        <span><i></i>not started</span><span><i style="background:var(--l1)"></i>learning</span>
        <span><i style="background:var(--l2)"></i>familiar</span><span><i style="background:var(--l3)"></i>known (3+ weeks)</span>
      </div>
      <div class="grid" id="grid"></div>`;
    const draw = () => {
      const q = charQuery.trim().toLowerCase();
      const plainQ = q.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'u');
      const list = HANZI.filter((h) => {
        const lv = Store.level(h.c);
        if (charFilter === 'learned' && !lv) return false;
        if (charFilter === 'new' && lv) return false;
        if (!q) return true;
        const plain = h.p.normalize('NFD').replace(/[̀-ͯ]/g, '');
        return h.c === q || plain === plainQ || h.p === q || (q.length > 2 && h.m.toLowerCase().includes(q));
      });
      document.getElementById('grid').innerHTML = list.map((h) => `<button class="tile l${Store.level(h.c)}" data-c="${h.c}" title="#${h.r} ${esc(h.p)}">${h.c}</button>`).join('')
        || '<p class="muted">No matches.</p>';
    };
    draw();
    let searchTimer;
    document.getElementById('q').oninput = (e) => { charQuery = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(draw, 150); };
    $view.querySelectorAll('.chip').forEach((c) => { c.onclick = () => { charFilter = c.dataset.f; renderChars(); }; });
    document.getElementById('grid').onclick = (e) => { const t = e.target.closest('.tile'); if (t) openChar(BY_CHAR[t.dataset.c]); };
  }

  function openChar(h) {
    const c = S.cards[h.c];
    const tone = toneOf(h);
    const avg = c?.scores?.length ? Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length) : null;
    $modalBody.innerHTML = `
      <p class="muted small center" style="margin:0">#${h.r} · ${c ? `next review ${c.due}` : 'not learned yet'}${avg != null ? ` · speaking avg ${avg}` : ''}</p>
      ${charHeader(h)}
      <div class="center"><span class="tone-tag">${esc(Speech.TONE_NAMES[tone])}</span></div>
      ${h.alt.length ? `<p class="center small muted" style="margin:6px 0 0">Also read: ${esc(h.alt.join(', '))}</p>` : ''}
      <p class="center small" style="margin:8px 0 0">${esc(h.m)}</p>
      <div class="tools">
        <button class="icon-btn" id="m-hear">🔊 Listen</button>
        <button class="icon-btn" id="m-strokes">✍️ Strokes</button>
      </div>
      <div class="writer" id="m-writer"></div>
      ${examplesHTML(h)}
      ${S.settings.mic && Speech.micSupported ? '<div id="m-mic"></div>' : ''}`;
    $modal.hidden = false;
    bindExamples($modalBody, h);
    document.getElementById('m-hear').onclick = () => speakChar(h);
    document.getElementById('m-strokes').onclick = () => strokeOrder(document.getElementById('m-writer'), h);
    if (S.settings.mic && Speech.micSupported) micWidget(document.getElementById('m-mic'), h, { label: 'Practice saying it' });
    speakChar(h);
  }

  function closeModal() { stopWriter(); $modal.hidden = true; Speech.stop(); $modalBody.innerHTML = ''; }
  $modal.querySelector('.modal-close').onclick = closeModal;
  $modal.onclick = (e) => { if (e.target === $modal) closeModal(); };

  /* ---------- Settings ---------- */

  function renderSettings() {
    const st = S.settings;
    $view.innerHTML = `
      <h1>Settings</h1>
      <div class="card">
        <div class="setting"><label for="s-new">New characters per day<div class="small muted">10 a day finishes all 1,000 in about 100 days.</div></label>
          <select id="s-new">${[5, 8, 10, 12, 15, 20].map((n) => `<option ${n === st.newPerDay ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="setting"><label for="s-min">Lesson length</label>
          <select id="s-min">${[5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${n === st.minutes ? 'selected' : ''}>${n} min</option>`).join('')}</select></div>
        <div class="setting"><label>Speaking practice with microphone<div class="small muted">${Speech.recognitionSupported ? 'Speech recognition + tone detection' : 'Tone detection only in this browser'}</div></label>
          <button class="switch" id="s-mic" role="switch" aria-checked="${st.mic}" aria-label="Speaking practice"></button></div>
        <div class="setting"><label>Auto-play audio for new characters</label>
          <button class="switch" id="s-auto" role="switch" aria-checked="${st.autoplay}" aria-label="Auto-play"></button></div>
        <div class="setting"><label for="s-rate">Voice speed</label>
          <input id="s-rate" type="range" min="0.5" max="1.2" step="0.1" value="${st.rate}"><button class="icon-btn small" id="s-test">🔊</button></div>
      </div>
      <h2>Microphone check</h2>
      <div class="card">
        <p class="small muted" style="margin-top:0">Say <b class="hz">妈</b> (mā, high and flat) to test your mic. This also helps the tone detector learn your natural pitch.</p>
        <div id="s-mic-test"></div>
      </div>
      <h2>Your progress</h2>
      <div class="card">
        <p class="small muted" style="margin-top:0">Progress is saved in this browser. Export it to back it up or move it to another device.</p>
        <div class="row wrap">
          <button class="btn ghost" id="s-export">Export</button>
          <label class="btn ghost">Import<input type="file" id="s-import" accept="application/json" hidden></label>
          <span class="spacer"></span>
          <button class="btn soft" id="s-reset">Reset all</button>
        </div>
      </div>
      <p class="small muted">Character frequency: Jun Da, Modern Chinese Character Frequency List. Definitions: CC-CEDICT (CC BY-SA 4.0). Stroke order: Hanzi Writer / Make Me a Hanzi.</p>`;
    const save = () => { Store.save(); };
    document.getElementById('s-new').onchange = (e) => { st.newPerDay = Number(e.target.value); save(); };
    document.getElementById('s-min').onchange = (e) => { st.minutes = Number(e.target.value); save(); };
    const toggle = (id, key) => {
      const el = document.getElementById(id);
      el.onclick = () => { st[key] = !st[key]; el.setAttribute('aria-checked', st[key]); save(); };
    };
    toggle('s-mic', 'mic');
    toggle('s-auto', 'autoplay');
    document.getElementById('s-rate').oninput = (e) => { st.rate = Number(e.target.value); save(); };
    document.getElementById('s-test').onclick = () => Speech.speak('你好，欢迎学习中文');
    if (Speech.micSupported) {
      micWidget(document.getElementById('s-mic-test'), { c: '妈', n: 'ma1' }, { label: 'Tap and say mā' });
    } else {
      document.getElementById('s-mic-test').innerHTML = '<p class="small">Microphone access isn’t available. Open the app over https (or http://localhost).</p>';
    }
    document.getElementById('s-export').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([Store.exportJSON()], { type: 'application/json' }));
      a.download = `hanzi1000-progress-${Store.today()}.json`;
      a.click();
    };
    document.getElementById('s-import').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { Store.importJSON(await f.text()); } catch (err) { alert('That file could not be imported: ' + err.message); }
    };
    document.getElementById('s-reset').onclick = () => { if (confirm('Erase all progress? This cannot be undone.')) Store.reset(); };
  }

  /* ---------- Keyboard shortcuts ---------- */

  let keyMap = {};
  function onKeys(map) { keyMap = map; }
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey || !$modal.hidden) return;
    const fn = keyMap[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });

  window.addEventListener('beforeunload', () => Store.save());
  show('home');
})();
