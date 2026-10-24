// Progress storage and spaced-repetition scheduling (a simplified SM-2).
(function () {
  const KEY = 'hanzi1000.v1';

  const DEFAULTS = {
    settings: { newPerDay: 10, minutes: 15, mic: true, rate: 0.8, autoplay: true },
    cards: {},        // char -> { ease, interval, due, reps, lapses, introduced, scores: [] }
    nextNew: 0,       // index into HANZI of the next character to introduce
    days: {},         // 'YYYY-MM-DD' -> { seconds, learned, reviewed, spoken, scoreSum, completed }
    voice: { median: 0, samples: 0 }, // speaker's typical pitch, used by the tone detector
  };

  function today(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return dateKey(d);
  }

  function dateKey(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw) return { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...raw.settings } };
    } catch (e) { /* fall through to defaults */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  const state = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function dayStats(key = today()) {
    if (!state.days[key]) state.days[key] = { seconds: 0, learned: 0, reviewed: 0, spoken: 0, scoreSum: 0, completed: false };
    return state.days[key];
  }

  function card(ch) {
    return state.cards[ch];
  }

  function introduce(ch) {
    if (!state.cards[ch]) {
      state.cards[ch] = { ease: 2.5, interval: 0, due: today(), reps: 0, lapses: 0, introduced: today(), scores: [] };
    }
    return state.cards[ch];
  }

  // quality: 0 = forgot, 1 = hard, 2 = good, 3 = easy
  function grade(ch, quality) {
    const c = introduce(ch);
    if (quality === 0) {
      c.lapses += 1;
      c.reps = 0;
      c.interval = 1;
      c.ease = Math.max(1.3, c.ease - 0.2);
    } else {
      c.reps += 1;
      if (c.reps === 1) c.interval = quality === 3 ? 2 : 1;
      else if (c.reps === 2) c.interval = quality === 1 ? 2 : quality === 3 ? 4 : 3;
      else c.interval = Math.max(c.interval + 1, Math.round(c.interval * c.ease * (quality === 1 ? 0.7 : quality === 3 ? 1.3 : 1)));
      c.ease = Math.min(3.0, Math.max(1.3, c.ease + (quality === 1 ? -0.15 : quality === 3 ? 0.1 : 0)));
    }
    c.due = today(c.interval);
    save();
  }

  function recordScore(ch, score) {
    const c = introduce(ch);
    c.scores = [...(c.scores || []), score].slice(-5);
  }

  function dueCards() {
    const t = today();
    return Object.entries(state.cards)
      .filter(([, c]) => c.due <= t)
      .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].ease - b[1].ease))
      .map(([ch]) => ch);
  }

  // 0 = new, 1 = learning, 2 = familiar, 3 = known
  function level(ch) {
    const c = state.cards[ch];
    if (!c) return 0;
    if (c.interval >= 21) return 3;
    if (c.interval >= 7) return 2;
    return 1;
  }

  function streak() {
    let n = 0;
    let offset = state.days[today()]?.completed ? 0 : -1;
    while (state.days[today(offset)]?.completed) { n += 1; offset -= 1; }
    return n;
  }

  function reset() {
    localStorage.removeItem(KEY);
    location.reload();
  }

  function exportJSON() {
    return JSON.stringify(state);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data.cards !== 'object') throw new Error('Not a progress file');
    localStorage.setItem(KEY, JSON.stringify(data));
    location.reload();
  }

  window.Store = { state, save, today, dateKey, dayStats, card, introduce, grade, recordScore, dueCards, level, streak, reset, exportJSON, importJSON };
})();
