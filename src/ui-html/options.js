/* The Options screen: graphics, audio, controls, gameplay, accessibility and
   an About page. One implementation for both places it is reached from -- the
   title screen and the pause menu -- as an object with update() (keyboard and
   gamepad, in the fixed step) and draw() (the HTML), exactly like the scenes
   that host it. The mouse talks to the DOM directly and lands on the same
   state, so the three inputs can never disagree.

   Every value lives in DS.Settings (src/core/settings.js) and is applied by
   DS.Prefs (src/core/prefs.js); this file only edits. Keys are the exception:
   they live in DS.Input, and are written down through DS.Prefs.saveControls. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  function h(tag, cls, props, kids) { return DS.HUI.el(tag, cls, props, kids); }
  function K() { return DS.HKit; }
  function S() { return DS.Settings; }
  const pct = function (v) { return Math.round(v * 100) + '%'; };

  // --- what there is to change -------------------------------------------------

  const slider = function (label, sec, key, fmt, note) { return { kind: 'slider', label: label, sec: sec, key: key, fmt: fmt || pct, note: note }; };
  const toggle = function (label, sec, key, note) { return { kind: 'toggle', label: label, sec: sec, key: key, note: note }; };

  const ACTION_NAMES = {
    left: 'Move left', right: 'Move right', up: 'Climb up', down: 'Climb down · drop', jump: 'Jump',
    attack: 'Attack', dash: 'Dash', minidash: 'Quick-step', interact: 'Interact', skill: 'Weapon skill',
    ult: 'Ultimate', swap: 'Swap hands', bag: 'Bag', infuse: 'Infuse · next', infuseBack: 'Infuse · previous', pause: 'Pause'
  };

  const QUALITY = [['auto', 'AUTO'], ['low', 'LOW'], ['med', 'MEDIUM'], ['high', 'HIGH']];
  const FPS = [['30', '30'], ['60', '60'], ['max', 'MAX']];

  function qualityGet() {
    const P = DS.PostFX;
    if (!P) return 'high';
    return P.locked ? P.requested : 'auto';
  }
  function qualitySet(v) {
    const P = DS.PostFX;
    if (!P) return;
    if (v === 'auto') { P.locked = false; P.setQuality('high', { quiet: true }); }
    else P.setQuality(v, { lock: true, quiet: true });
  }

  function tabs(ctx) {
    const about = [
      { kind: 'toggle', label: 'Show the startup notice at launch', note: 'The research notice shown before the title screen.',
        get: function () { return !S().get('notice', 'hide'); },
        set: function (v) { S().set('notice', 'hide', !v); } }
    ];
    if (ctx.fromMenu) {
      about.push({ kind: 'button', label: 'Read the notice now', text: 'OPEN', run: function (o) { o.close(); DS.Scenes.notice(); } });
    }
    about.push(
      { kind: 'info', label: 'Version', text: 'Dungeon Scrolling ' + (DS.VERSION || 'v7.0.0') },
      { kind: 'info', label: 'Textures', text: 'CC0 photo scans by Poly Haven (polyhaven.com)' },
      { kind: 'info', label: 'Engine', text: 'three.js (MIT) · fonts Rajdhani and Nunito Sans (OFL, Google Fonts)' },
      { kind: 'info', label: 'Everything else', text: 'Art, sound and music are generated in code' },
      { kind: 'button', label: 'Reset every setting to its default', text: 'RESET', danger: true, run: function (o) {
        S().reset();
        DS.Prefs.resetControls();
        o.note('All settings restored.');
      } }
    );
    return [
      { id: 'gfx', label: 'GRAPHICS', rows: [
        { kind: 'choice', label: 'Quality', opts: QUALITY, get: qualityGet, set: qualitySet, note: 'AUTO steps itself down when the frame rate drops.' },
        slider('Render scale', 'gfx', 'renderScale', pct, 'Lower is faster and softer.'),
        slider('Bloom', 'gfx', 'bloom', pct, 'The glow around flames and magic.'),
        slider('Vignette', 'gfx', 'vignette', pct),
        slider('Brightness', 'gfx', 'brightness', pct),
        slider('Particles', 'gfx', 'particles', pct, 'How many sparks, embers and puffs.'),
        slider('Interface size', 'gfx', 'uiScale', pct),
        { kind: 'choice', label: 'Frame rate cap', opts: FPS, sec: 'gfx', key: 'fpsCap' },
        toggle('Show FPS', 'gfx', 'showFps')
      ] },
      { id: 'audio', label: 'AUDIO', rows: [
        slider('Master volume', 'audio', 'master'),
        slider('Music', 'audio', 'music'),
        slider('Effects', 'audio', 'sfx'),
        toggle('Mute when the window loses focus', 'audio', 'muteUnfocused'),
        { kind: 'toggle', label: 'Sound on', get: function () { return !DS.Audio.isMuted(); },
          set: function (v) { if (DS.Audio.isMuted() === v) DS.Audio.toggleMute(); } }
      ] },
      { id: 'controls', label: 'CONTROLS', rows: DS.Input.REBINDABLE.map(function (a) {
        return { kind: 'bind', label: ACTION_NAMES[a] || a, action: a };
      }).concat([
        { kind: 'button', label: 'Restore the default keys', text: 'RESET', run: function (o) { DS.Prefs.resetControls(); o.note('Default keys restored.'); } },
        { kind: 'info', label: 'Gamepad', text: 'A pad works everywhere with its own fixed layout.' }
      ]) },
      { id: 'game', label: 'GAMEPLAY', rows: [
        toggle('Damage numbers', 'game', 'damageNumbers'),
        toggle('Contextual hints', 'game', 'hints', 'The short tips that appear the first time something matters.'),
        slider('Camera shake', 'game', 'shake')
      ] },
      { id: 'access', label: 'ACCESSIBILITY', rows: [
        toggle('Reduce motion', 'access', 'reduceMotion', 'No camera shake, zoom punches or screen flashes.'),
        toggle('Screen flashes', 'access', 'flashes', 'Full-screen colour flashes on big hits.'),
        slider('Interface size', 'gfx', 'uiScale', pct, 'Larger text and panels.')
      ] },
      { id: 'about', label: 'ABOUT', rows: about }
    ];
  }

  // --- value access ------------------------------------------------------------

  function getv(r) {
    if (r.get) return r.get();
    return S().get(r.sec, r.key);
  }
  function setv(r, v) {
    if (r.set) r.set(v); else S().set(r.sec, r.key, v);
  }
  const focusable = function (r) { return r.kind !== 'info'; };

  // --- the screen --------------------------------------------------------------

  function create(ctx) {
    ctx = ctx || {};
    const TABS = tabs(ctx);
    const st = { tab: 0, row: 0, col: 0, slot: 0, note: '', noteT: 0, done: false, hold: { l: 0, r: 0 }, armed: -1 };
    const ui = { rows: [], tabNodes: [], list: null, sig: '' };

    function rows() { return TABS[st.tab].rows; }
    function firstFocusable(from, dir) {
      const list = rows();
      let i = from;
      for (let n = 0; n < list.length; n++) {
        i = (i + dir + list.length) % list.length;
        if (focusable(list[i])) return i;
      }
      return from;
    }
    function say(text) { st.note = text; st.noteT = 240; }
    function close() {
      if (st.done) return;
      st.done = true;
      DS.Input.captureNext(null);
      if (ctx.onClose) ctx.onClose();
    }
    const api = { close: close, note: say };

    function adjust(r, dir) {
      if (r.kind === 'slider') {
        const spec = S().schemaOf(r.sec, r.key);
        S().set(r.sec, r.key, getv(r) + dir * (spec.step || 0.05));
        DS.Audio.play('menuMove');
      } else if (r.kind === 'toggle') {
        setv(r, !getv(r));
        DS.Audio.play('menuPick');
      } else if (r.kind === 'choice') {
        const cur = r.opts.findIndex(function (o) { return o[0] === getv(r); });
        const next = r.opts[(cur + dir + r.opts.length) % r.opts.length];
        setv(r, next[0]);
        DS.Audio.play('menuMove');
      } else if (r.kind === 'bind') {
        st.slot = Math.max(0, Math.min(DS.Input.SLOTS - 1, st.slot + dir));
        DS.Audio.play('menuMove');
      }
    }

    function activate(r) {
      if (r.kind === 'toggle' || r.kind === 'choice') adjust(r, 1);
      else if (r.kind === 'bind') beginCapture(r);
      else if (r.kind === 'button') {
        if (r.danger && st.armed !== TABS[st.tab].rows.indexOf(r)) {
          st.armed = TABS[st.tab].rows.indexOf(r);
          say('Select it again to confirm.');
          DS.Audio.play('error');
          return;
        }
        st.armed = -1;
        DS.Audio.play('menuPick');
        r.run(api);
      }
    }

    function beginCapture(r) {
      say('Press the key or mouse button for ' + r.label.toUpperCase() + ' — ESC cancels.');
      DS.Audio.play('menuPick');
      DS.Input.captureNext(function (code) {
        if (code === 'Escape') { say('Cancelled.'); return; }
        const res = DS.Input.bind(r.action, st.slot, code);
        DS.Prefs.saveControls();
        say(res.stolenFrom
          ? DS.Input.label(code) + ' moved here from ' + (ACTION_NAMES[res.stolenFrom] || res.stolenFrom).toUpperCase() + '.'
          : DS.Input.label(code) + ' is now ' + r.label.toUpperCase() + '.');
        DS.Audio.play('menuPick');
      });
    }

    // --- DOM ----------------------------------------------------------------------

    function rowNode(r, i) {
      const node = h('div', 'ho-row ho-' + r.kind, { dataset: { i: String(i) } });
      node.appendChild(h('span', 'ho-label', { text: r.label }));
      const ctl = h('span', 'ho-ctl');
      const rec = { node: node, r: r, i: i };
      if (r.kind === 'slider') {
        const spec = S().schemaOf(r.sec, r.key);
        rec.range = h('input', 'ho-range', { type: 'range', min: String(spec.min), max: String(spec.max), step: String(spec.step || 0.05), tabindex: '-1' });
        rec.range.addEventListener('input', function () { S().set(r.sec, r.key, parseFloat(rec.range.value)); });
        rec.val = h('span', 'ho-val ui-num');
        ctl.appendChild(rec.range); ctl.appendChild(rec.val);
      } else if (r.kind === 'toggle') {
        rec.sw = h('span', 'ho-switch', null, [h('i', ''), h('span', 'ho-sw-text')]);
        node.addEventListener('click', function () { st.row = i; st.col = 1; adjust(r, 1); });
        ctl.appendChild(rec.sw);
      } else if (r.kind === 'choice') {
        rec.opts = r.opts.map(function (o) {
          const seg = h('span', 'ho-seg', { text: o[1] });
          seg.addEventListener('click', function (e) { e.stopPropagation(); st.row = i; st.col = 1; setv(r, o[0]); DS.Audio.play('menuMove'); });
          ctl.appendChild(seg);
          return { v: o[0], node: seg };
        });
      } else if (r.kind === 'bind') {
        rec.keys = [];
        for (let s = 0; s < DS.Input.SLOTS; s++) {
          const b = h('button', 'ho-key', { type: 'button', tabindex: '-1' });
          b.addEventListener('click', function (e) { e.stopPropagation(); st.row = i; st.col = 1; st.slot = s; activate(r); });
          ctl.appendChild(b);
          rec.keys.push(b);
        }
      } else if (r.kind === 'button') {
        rec.btn = h('button', 'ui-btn ho-btn' + (r.danger ? ' is-danger' : ''), { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label', { text: r.text })]);
        rec.btn.addEventListener('click', function (e) { e.stopPropagation(); st.row = i; st.col = 1; activate(r); });
        ctl.appendChild(rec.btn);
      } else {
        ctl.appendChild(h('span', 'ho-info', { text: r.text }));
      }
      node.appendChild(ctl);
      if (r.note) node.appendChild(h('span', 'ho-rnote', { text: r.note }));
      node.addEventListener('pointerenter', function () { if (focusable(r) && (st.row !== i || st.col !== 1)) { st.row = i; st.col = 1; } });
      ui.rows.push(rec);
      return node;
    }

    function build(root) {
      ui.rows = []; ui.tabNodes = [];
      root.appendChild(h('div', 'hm-scrim-full'));
      root.appendChild(K().masthead({ eyebrow: ctx.fromMenu ? 'TITLE' : 'PAUSED', title: 'Options', accent: 'var(--accent)',
        sub: 'Saved on this device as you change them.' }));
      const tabCol = h('nav', 'ho-tabs');
      TABS.forEach(function (t, i) {
        const n = h('button', 'ho-tab', { type: 'button', tabindex: '-1', text: t.label });
        n.addEventListener('click', function () { st.tab = i; st.row = firstFocusable(-1, 1); st.col = 0; st.armed = -1; DS.Audio.play('menuMove'); });
        tabCol.appendChild(n);
        ui.tabNodes.push(n);
      });
      ui.list = h('div', 'ho-list');
      TABS[st.tab].rows.forEach(function (r, i) { ui.list.appendChild(rowNode(r, i)); });
      ui.noteNode = h('div', 'ho-note');
      root.appendChild(h('main', 'hk-body ho-wrap', null, [
        tabCol,
        h('section', 'ui-panel ho-panel', null, [ui.list, ui.noteNode])
      ]));
      const back = h('button', 'ui-btn hm-btn hm-foot-btn', { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label', { text: 'BACK' })]);
      back.addEventListener('click', close);
      root.appendChild(K().foot([['↑ ↓', 'Select'], ['← →', 'Adjust'], ['ENTER', 'Change'], ['ESC', 'Back']], h('div', 'hk-foot-left', null, [back])));
    }

    function refresh() {
      const cur = TABS[st.tab];
      for (let i = 0; i < ui.tabNodes.length; i++) {
        ui.tabNodes[i].classList.toggle('is-on', i === st.tab);
        ui.tabNodes[i].classList.toggle('is-focus', i === st.tab && st.col === 0);
      }
      for (let i = 0; i < ui.rows.length; i++) {
        const rec = ui.rows[i], r = rec.r;
        const focus = st.col === 1 && st.row === i;
        rec.node.classList.toggle('is-focus', focus);
        if (r.kind === 'slider') {
          const v = getv(r);
          if (document.activeElement !== rec.range) rec.range.value = String(v);
          rec.val.textContent = r.fmt(v);
          const spec = S().schemaOf(r.sec, r.key);
          rec.range.style.setProperty('--fill', ((v - spec.min) / (spec.max - spec.min) * 100).toFixed(1) + '%');
        } else if (r.kind === 'toggle') {
          const on = !!getv(r);
          rec.sw.classList.toggle('is-on', on);
          rec.sw.lastChild.textContent = on ? 'ON' : 'OFF';
        } else if (r.kind === 'choice') {
          const v = getv(r);
          rec.opts.forEach(function (o) { o.node.classList.toggle('is-on', o.v === v); });
        } else if (r.kind === 'bind') {
          const keys = DS.Input.keysOf(r.action);
          rec.keys.forEach(function (b, s) {
            const text = keys[s] ? DS.Input.label(keys[s]) : '—';
            if (b.textContent !== text) b.textContent = text;
            const capturing = focus && st.slot === s && DS.Input.isCapturing();
            b.classList.toggle('is-focus', focus && st.slot === s);
            b.classList.toggle('is-capturing', capturing);
            if (capturing) b.textContent = 'PRESS…';
          });
        } else if (r.kind === 'button') {
          rec.btn.classList.toggle('is-armed', st.armed === i);
        }
      }
      if (st.noteT > 0) st.noteT--;
      const text = st.noteT > 0 ? st.note : (cur.rows[st.row] && st.col === 1 && cur.rows[st.row].note) || '';
      if (ui.noteNode.textContent !== text) ui.noteNode.textContent = text;
    }

    // --- update (keyboard and gamepad) --------------------------------------------

    function held(dir, action) {
      const In = DS.Input;
      const k = dir === -1 ? 'l' : 'r';
      if (In.isDown(action)) st.hold[k]++; else st.hold[k] = 0;
      const n = st.hold[k];
      return n === 1 || (n > 24 && (n - 24) % 4 === 0);
    }

    return {
      state: st,
      get done() { return st.done; },

      update: function () {
        const In = DS.Input;
        if (In.isCapturing()) return;
        if (In.justPressed('back') || In.justPressed('pause')) {
          In.consume('back'); In.consume('pause');
          if (st.armed >= 0) { st.armed = -1; return; }
          if (st.col === 1) { st.col = 0; DS.Audio.play('menuMove'); return; }
          DS.Audio.play('menuMove');
          close();
          return;
        }
        if (st.col === 0) {
          if (In.justPressed('up')) { st.tab = (st.tab + TABS.length - 1) % TABS.length; st.row = firstFocusable(-1, 1); st.armed = -1; DS.Audio.play('menuMove'); }
          if (In.justPressed('down')) { st.tab = (st.tab + 1) % TABS.length; st.row = firstFocusable(-1, 1); st.armed = -1; DS.Audio.play('menuMove'); }
          if (In.justPressed('right') || In.justPressed('confirm')) {
            In.consume('confirm');
            st.col = 1; st.row = firstFocusable(-1, 1); st.slot = 0;
            DS.Audio.play('menuMove');
          }
          return;
        }
        const list = rows();
        const r = list[st.row];
        if (In.justPressed('up')) { st.row = firstFocusable(st.row, -1); st.armed = -1; DS.Audio.play('menuMove'); }
        if (In.justPressed('down')) { st.row = firstFocusable(st.row, 1); st.armed = -1; DS.Audio.play('menuMove'); }
        if (r && held(-1, 'left')) adjust(r, -1);
        if (r && held(1, 'right')) adjust(r, 1);
        if (r && In.justPressed('confirm')) { In.consume('confirm'); activate(r); }
      },

      draw: function () {
        const s = K().screen('options');
        K().rebuild(s, 'options|' + st.tab + '|' + Math.round(DS.HUI.frame.h), build);
        refresh();
        const row = ui.rows[st.row];
        if (row && st.col === 1 && row.node.scrollIntoView && st.scrolled !== st.tab + ':' + st.row) {
          st.scrolled = st.tab + ':' + st.row;
          row.node.scrollIntoView({ block: 'nearest' });
        }
      }
    };
  }

  DS.Options = { create: create, ACTION_NAMES: ACTION_NAMES };
})(window.DS);
