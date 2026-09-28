/* Notifications (v6): toasts and title cards, in HTML.

   g.toast(text, color) and g.showBanner(title, subtitle, color, opts) in
   src/scenes/game.js forward here (they still set the old fields too, which
   the WebGL fallback reads when DS.HUI_ENABLED is false).

   Toasts   stack on the right edge under the momentum meter: at most four,
            newest on top, each sliding in, holding ~3 s and fading out. The
            colour a caller passes becomes the accent rail, so rarity and
            element colours still say what the line is about.
   Banners  a cinematic title card across the upper third: an eyebrow (act /
            depth, or BOSS), the title, a subtitle, and rules that draw out
            from the centre. They QUEUE. Two banners on the same frame used to
            overwrite each other -- the act-clear card hid the boss essence
            card that was raised a line earlier -- and now each gets its turn.

   Timers run on real milliseconds but only while the layer is visible, so a
   bag or the pause menu holds a card rather than eating it. Each entry
   remembers which run raised it; entries from an earlier run are dropped. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const HUI = DS.HUI;
  const el = HUI.el;

  const TOAST_MAX = 4;
  const TOAST_MS = 3200;
  const TOAST_OUT = 320;
  const BANNER_IN = 420;
  const BANNER_HOLD = 2300;
  const BANNER_OUT = 420;
  const QUEUE_MAX = 4;

  let root = null, toastHost = null, bannerNode = null;
  const B = {};
  let visible = false;
  let lastNow = 0;
  let game = null;

  const toasts = [];        // { node, t, g, idx }
  const queue = [];         // banner specs waiting
  let current = null;       // banner on screen: { spec, t }

  function build() {
    if (root) return;
    root = el('div', 'ntf');
    root.hidden = true;
    toastHost = el('div', 'ntf-toasts');
    root.appendChild(toastHost);

    bannerNode = el('div', 'ntf-banner');
    B.eyebrow = el('div', 'eyebrow');
    B.title = el('div', 'title');
    B.sub = el('div', 'sub');
    B.ruleT = el('i', 'rule top');
    B.ruleB = el('i', 'rule bot');
    [B.ruleT, B.eyebrow, B.title, B.sub, B.ruleB].forEach(function (n) { bannerNode.appendChild(n); });
    bannerNode.hidden = true;
    root.appendChild(bannerNode);
    HUI.layer('overlay').appendChild(root);
  }

  // --- toasts -------------------------------------------------------------------

  function toast(text, color, g) {
    build();
    const node = el('div', 'ntf-toast', null, [el('i', 'rail'), el('span', 'txt', { text: String(text) })]);
    node.style.setProperty('--c', color || 'var(--ink)');
    toastHost.appendChild(node);
    toasts.unshift({ node: node, t: 0, g: g || game, idx: -1 });
    while (toasts.length > TOAST_MAX) {
      const old = toasts.pop();
      old.node.remove();
    }
    layoutToasts();
  }

  /* Each toast sits in its own row, moved by transform only. */
  function layoutToasts() {
    for (let i = 0; i < toasts.length; i++) {
      const t = toasts[i];
      if (t.idx === i) continue;
      t.idx = i;
      t.node.style.setProperty('--row', String(i));
    }
  }

  function tickToasts(dt) {
    let changed = false;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      t.t += dt;
      if (t.t > TOAST_MS && !t.out) { t.out = true; t.node.classList.add('is-out'); }
      if (t.t > TOAST_MS + TOAST_OUT) { t.node.remove(); toasts.splice(i, 1); changed = true; }
    }
    if (changed) layoutToasts();
  }

  // --- banners ------------------------------------------------------------------

  function banner(g, title, subtitle, color, opts) {
    build();
    const o = opts || {};
    const spec = {
      g: g || game,
      kind: o.kind || 'plain',
      eyebrow: o.eyebrow || '',
      title: String(o.title || title || ''),
      sub: String(o.subtitle != null ? o.subtitle : (subtitle || '')),
      color: color || '#d8d5e8'
    };
    // The same card twice in a row is one card.
    const last = queue.length ? queue[queue.length - 1] : current && current.spec;
    if (last && last.title === spec.title && last.sub === spec.sub) return;
    queue.push(spec);
    while (queue.length > QUEUE_MAX) queue.shift();
  }

  function startBanner(spec) {
    current = { spec: spec, t: 0 };
    bannerNode.className = 'ntf-banner k-' + spec.kind;
    bannerNode.style.setProperty('--c', spec.color);
    B.eyebrow.textContent = spec.eyebrow;
    B.eyebrow.hidden = !spec.eyebrow;
    B.title.textContent = spec.title;
    B.sub.textContent = spec.sub;
    B.sub.hidden = !spec.sub;
    bannerNode.hidden = false;
    // Two class names on one keyframe set would not restart it; the class is
    // set fresh on a node whose className was just rewritten.
    bannerNode.classList.add('is-in');
  }

  function tickBanner(dt) {
    if (!current) {
      while (queue.length && queue[0].g !== game) queue.shift();
      if (queue.length) startBanner(queue.shift());
      return;
    }
    current.t += dt;
    const total = BANNER_IN + BANNER_HOLD + BANNER_OUT;
    if (current.t > BANNER_IN + BANNER_HOLD && !current.out) {
      current.out = true;
      bannerNode.classList.remove('is-in');
      bannerNode.classList.add('is-out');
    }
    if (current.t > total) {
      current = null;
      bannerNode.hidden = true;
    }
  }

  // --- entry --------------------------------------------------------------------

  function setVisible(on) {
    if (visible === on) return;
    visible = on;
    if (root) root.hidden = !on;
  }

  function update(g) {
    build();
    const now = performance.now();
    const dt = lastNow ? Math.min(50, now - lastNow) : 16;
    lastNow = now;
    if (g !== game) {
      // A new run: drop whatever an earlier one left behind.
      game = g;
      for (let i = toasts.length - 1; i >= 0; i--) {
        if (toasts[i].g && toasts[i].g !== g) { toasts[i].node.remove(); toasts.splice(i, 1); }
      }
      if (current && current.spec.g !== g) { current = null; bannerNode.hidden = true; }
      layoutToasts();
    }
    const on = !g.modal && !g.paused;
    setVisible(on);
    if (!on) return;
    tickToasts(dt);
    tickBanner(dt);
  }

  DS.Notify = {
    toast: function (text, color) { toast(text, color, DS.currentGame); },
    banner: banner,
    update: update,
    hide: function () { setVisible(false); lastNow = 0; },
    /* For tools and tests: how much is waiting. */
    pending: function () { return { toasts: toasts.length, banners: queue.length + (current ? 1 : 0) }; }
  };
})(window.DS);
