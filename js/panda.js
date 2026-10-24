// Panda progress tracker: the panda grows as characters are mastered.
(function () {
  const TOTAL = 1000;
  const STAGES = [
    [0, 'Newborn cub'],
    [50, 'Cub'],
    [150, 'Young panda'],
    [300, 'Teen panda'],
    [500, 'Grown panda'],
    [750, 'Big panda'],
    [1000, 'Giant panda'],
  ];

  // A character counts as mastered once reviews have pushed it to a 7+ day interval.
  function masteredCount() {
    return Object.keys(Store.state.cards).filter((c) => Store.level(c) >= 2).length;
  }

  // Scale grows with the square root of progress so the panda's area is
  // proportional to characters mastered, and early growth is visible.
  function scaleFor(n) {
    return 0.25 + 0.75 * Math.sqrt(Math.min(n, TOTAL) / TOTAL);
  }

  function stageFor(n) {
    let i = 0;
    while (i + 1 < STAGES.length && n >= STAGES[i + 1][0]) i++;
    return { name: STAGES[i][1], next: STAGES[i + 1] || null };
  }

  const SVG = (crown) => `
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <g fill="#2a2522">
        <circle cx="58" cy="44" r="19"/><circle cx="142" cy="44" r="19"/>
        <ellipse cx="66" cy="182" rx="22" ry="15"/><ellipse cx="134" cy="182" rx="22" ry="15"/>
      </g>
      <ellipse cx="100" cy="146" rx="54" ry="44" fill="#fff" stroke="#2a2522" stroke-width="3"/>
      <path d="M50 128 q-6 26 16 34 q14 4 16-12 q0-18-14-30z" fill="#2a2522"/>
      <rect x="128" y="96" width="9" height="92" rx="4" fill="#5aa64a" transform="rotate(14 132 142)"/>
      <path d="M140 102 q14-10 24-6 q-10 8-24 10z" fill="#74c062"/>
      <path d="M150 128 q6 26-16 34 q-14 4-16-12 q0-18 14-30z" fill="#2a2522"/>
      <ellipse cx="100" cy="82" rx="52" ry="45" fill="#fff" stroke="#2a2522" stroke-width="3"/>
      <ellipse cx="78" cy="80" rx="13" ry="17" fill="#2a2522" transform="rotate(28 78 80)"/>
      <ellipse cx="122" cy="80" rx="13" ry="17" fill="#2a2522" transform="rotate(-28 122 80)"/>
      <circle cx="80" cy="78" r="5" fill="#fff"/><circle cx="120" cy="78" r="5" fill="#fff"/>
      <circle cx="81" cy="79" r="2.4" fill="#2a2522"/><circle cx="119" cy="79" r="2.4" fill="#2a2522"/>
      <ellipse cx="100" cy="98" rx="7" ry="5" fill="#2a2522"/>
      <path d="M92 106 q8 7 16 0" fill="none" stroke="#2a2522" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="68" cy="100" r="7" fill="#f7a8b8" opacity=".7"/><circle cx="132" cy="100" r="7" fill="#f7a8b8" opacity=".7"/>
      ${crown ? '<path d="M72 40 l8-22 l12 14 l8-18 l8 18 l12-14 l8 22z" fill="#f5c518" stroke="#b8860b" stroke-width="2" stroke-linejoin="round"/>' : ''}
    </svg>`;

  // Returns the card HTML. Call Panda.animate() after it is in the DOM.
  function card() {
    const n = masteredCount();
    const seen = Math.min(Store.state.pandaSeen ?? 0, n);
    const { name, next } = stageFor(n);
    const gained = n - seen;
    return `
      <div class="card panda-card">
        <div class="row">
          <div><div style="font-size:20px;font-weight:700">Your panda: ${name}${n >= TOTAL ? ' 👑' : ''}</div>
            <div class="muted small">${n} of ${TOTAL} characters mastered${next ? ` · ${next[1]} at ${next[0]}` : ' — all done!'}</div></div>
        </div>
        <div class="panda-stage">
          <div class="panda" data-from="${scaleFor(seen)}" data-to="${scaleFor(n)}" style="transform:scale(${scaleFor(seen)})">${SVG(n >= TOTAL)}</div>
          <div class="panda-ground"></div>
        </div>
        <div class="panda-bar"><i style="width:${(n / TOTAL) * 100}%"></i></div>
        ${gained > 0 ? `<p class="center panda-gain">+${gained} mastered since you last checked — your panda grew! 🎋</p>` : ''}
        <p class="small muted" style="margin:6px 0 0">A character counts as mastered once you've recalled it well enough that its next review is a week or more away.</p>
      </div>`;
  }

  function animate() {
    const el = document.querySelector('.panda');
    if (!el) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `scale(${el.dataset.to})`; }));
    Store.state.pandaSeen = masteredCount();
    Store.save();
  }

  window.Panda = { card, animate, masteredCount, scaleFor };
})();
