/* The character screen: make your walker, and dress him from the wardrobe.

   Left, the categories and what is in them; middle, the hero on his plinth
   (src/scenes/lookstage.js); right, what you are looking at, its price and what
   it does to you. Everything on the BODY and FACE pages is free. The wardrobe is
   bought with KEYS carried out of the dungeon (DS.Look wallet), and the LIMITED
   pieces cannot be bought at all: each says what to do to earn it.

   Hovering or moving onto a piece tries it on; ENTER or a click wears it, or, for
   a piece you do not own, arms the purchase (a second ENTER, or the BUY button,
   spends the keys). Like the Options screen it is an object with update()
   (keyboard and pad, in the fixed step) and draw() (the HTML), so the menu can
   host it as a page and the first-run flow can open it before the name prompt. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  function h(tag, cls, props, kids) { return DS.HUI.el(tag, cls, props, kids); }
  function K() { return DS.HKit; }
  function Lk() { return DS.Look; }

  const SLOT_LABEL = { hair: 'Hair', facial: 'Facial hair', mark: 'Marks', hat: 'Headwear', top: 'Top', pants: 'Legs', boots: 'Boots',
                       gloves: 'Gloves', cape: 'Cape', extra: 'Extras', weapon: 'Weapon skins' };
  const TRAIT_LABEL = { skin: 'Skin tone', build: 'Build', height: 'Height', eyes: 'Eyes', eyeColor: 'Eye colour', brows: 'Brows',
                        mouth: 'Mouth', hairColor: 'Hair colour' };
  const COLS = { chip: 4, swatch: 8, item: 3, wtype: 3 };
  const RARITY_NAME = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', mythic: 'MYTHIC', limited: 'LIMITED' };
  const cap = function (s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); };

  const dyeSec = function (slot, key) { return { kind: 'dye', slot: slot, key: key, label: SLOT_LABEL[slot] + ' dye' }; };
  const itemsTab = function (id, label, view, slot, dye) {
    return { id: id, label: label, view: view, secs: [{ kind: 'items', slot: slot, label: SLOT_LABEL[slot] }].concat(dye ? [dyeSec(slot, dye)] : []) };
  };

  const TABS = [
    { id: 'body', label: 'BODY', view: 'full', secs: [{ kind: 'swatch', key: 'skin' }, { kind: 'chips', key: 'build' }, { kind: 'chips', key: 'height' }] },
    { id: 'face', label: 'FACE', view: 'head', secs: [{ kind: 'chips', key: 'eyes' }, { kind: 'swatch', key: 'eyeColor' }, { kind: 'chips', key: 'brows' },
                                                        { kind: 'chips', key: 'mouth' }, { kind: 'items', slot: 'facial', label: SLOT_LABEL.facial },
                                                        { kind: 'items', slot: 'mark', label: SLOT_LABEL.mark }] },
    { id: 'hair', label: 'HAIR', view: 'head', secs: [{ kind: 'items', slot: 'hair', label: SLOT_LABEL.hair }, { kind: 'swatch', key: 'hairColor' }] },
    itemsTab('hat', 'HEADWEAR', 'head', 'hat', 'hatDye'),
    itemsTab('top', 'TOP', 'full', 'top', 'topDye'),
    itemsTab('pants', 'LEGS', 'full', 'pants', 'pantsDye'),
    itemsTab('boots', 'FEET', 'full', 'boots', 'bootsDye'),
    itemsTab('gloves', 'HANDS', 'full', 'gloves', 'glovesDye'),
    itemsTab('cape', 'BACK', 'full', 'cape', 'capeDye'),
    itemsTab('extra', 'EXTRAS', 'full', 'extra', 'extraDye'),
    { id: 'weapon', label: 'WEAPONS', view: 'weapon', secs: [{ kind: 'wtype', label: 'Weapon' }, { kind: 'items', slot: 'weapon', label: 'Skins' }] }
  ];

  const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // --- the controls a page is made of -------------------------------------------------------

  function itemsFor(slot, weaponType) {
    const order = Lk().RARITIES;
    return Lk().itemsIn(slot, weaponType).slice().sort(function (a, b) {
      return (b.starter - a.starter) || (order.indexOf(a.rarity) - order.indexOf(b.rarity));
    });
  }

  /* The sections of a page as lines of controls: the shape keyboard navigation
     walks and the DOM lays out. */
  function sectionsOf(tab, weaponType) {
    return tab.secs.map(function (sec, si) {
      let ctrls;
      if (sec.kind === 'chips') {
        ctrls = Lk().TRAITS[sec.key].map(function (v) { return { kind: 'chip', key: sec.key, value: v, label: cap(v) }; });
      } else if (sec.kind === 'swatch' || sec.kind === 'dye') {
        const list = Lk().TRAITS[sec.kind === 'dye' ? 'dye' : sec.key];
        ctrls = list.map(function (row) {
          return { kind: 'swatch', key: sec.key, value: row[0], hex: row[1], label: cap(row[0]), dyeSlot: sec.kind === 'dye' ? sec.slot : null };
        });
      } else if (sec.kind === 'wtype') {
        ctrls = Lk().WEAPON_TYPES.map(function (t) { return { kind: 'wtype', value: t, label: t === 'greataxe' ? 'Great axe' : cap(t) }; });
      } else {
        ctrls = itemsFor(sec.slot, sec.slot === 'weapon' ? weaponType : null).map(function (it) { return { kind: 'item', item: it, label: it.name }; });
      }
      const kind = ctrls.length ? ctrls[0].kind : 'chip';
      return { label: sec.label || TRAIT_LABEL[sec.key] || '', ctrls: ctrls, cols: COLS[kind] || 4, index: si, kind: sec.kind };
    });
  }

  const linesOf = function (secs) {
    const lines = [];
    secs.forEach(function (sec) {
      for (let i = 0; i < sec.ctrls.length; i += sec.cols) lines.push(sec.ctrls.slice(i, i + sec.cols));
    });
    return lines;
  };

  // --- the screen -----------------------------------------------------------------------------

  function create(ctx) {
    ctx = ctx || {};
    const st = { tab: 0, col: 1, y: 0, x: 0, weaponType: 'sword', note: '', noteT: 0, done: false, armed: null, hold: {}, frames: 0 };
    const ui = { nodes: new Map(), tabNodes: [], list: null, sig: '', dollSig: '' };
    let secs = [], lines = [];

    function layout() {
      secs = sectionsOf(TABS[st.tab], st.weaponType);
      lines = linesOf(secs);
      st.y = clamp(st.y, 0, Math.max(0, lines.length - 1));
      st.x = clamp(st.x, 0, Math.max(0, (lines[st.y] || []).length - 1));
    }
    layout();

    /* Start on what is already worn, so the hero on the stage is the hero you have
       until you move onto something to try. */
    function focusWorn() {
      for (let y = 0; y < lines.length; y++) {
        for (let x = 0; x < lines[y].length; x++) if (worn(lines[y][x])) { st.y = y; st.x = x; return; }
      }
      st.y = 0; st.x = 0;
    }

    const cur = function () { return st.col === 1 && lines[st.y] ? lines[st.y][st.x] : null; };
    const say = function (text) { st.note = text; st.noteT = 300; };
    const sound = function (name) { if (DS.Audio) DS.Audio.play(name); };
    const worn = function (c) {
      const look = Lk().look;
      if (c.kind === 'chip' || c.kind === 'swatch') return look[c.key] === c.value;
      if (c.kind === 'wtype') return st.weaponType === c.value;
      const it = c.item;
      return it.slot === 'weapon' ? look.weapon[it.w] === it.id : look[it.slot] === it.id;
    };
    const dyeable = function (slot) { const it = Lk().itemOf(slot, Lk().look[slot]); return !!(it && it.dyed); };

    function close() {
      if (st.done) return;
      st.done = true;
      if (ctx.first || !Lk().created) Lk().markCreated();
      if (ctx.onClose) ctx.onClose();
    }

    function gotoTab(i) {
      st.tab = (i + TABS.length) % TABS.length;
      st.armed = null;
      layout();
      focusWorn();
      sound('menuMove');
    }

    // --- acting on a control ------------------------------------------------------------------

    function activateItem(it, direct) {
      const type = it.slot === 'weapon' ? it.w : undefined;
      if (Lk().owns(it)) {
        if (Lk().equip(it.slot, it.id, type)) { sound('menuPick'); say(it.name + ' is on.'); }
        return;
      }
      if (it.rarity === 'limited') { sound('error'); say('LIMITED · ' + it.earn.text + '. It cannot be bought.'); return; }
      if (!direct && st.armed !== it.key) {
        st.armed = it.key;
        sound('menuMove');
        say('Press ENTER again to buy ' + it.name + ' for ' + it.price + ' keys.');
        return;
      }
      const res = Lk().buy(it);
      if (res.ok) {
        Lk().equip(it.slot, it.id, type);
        st.armed = null;
        sound('coin');
        say('Bought ' + it.name + ' for ' + it.price + ' keys.');
      } else {
        sound('error');
        say(res.reason === 'keys' ? 'Not enough keys: ' + res.need + ' more needed.' : 'You cannot buy that.');
      }
    }

    function activate(c) {
      if (!c) return;
      if (c.kind === 'wtype') { st.weaponType = c.value; st.y = 0; layout(); ui.sig = ''; sound('menuMove'); return; }
      if (c.kind === 'item') { activateItem(c.item, false); return; }
      if (c.dyeSlot && !dyeable(c.dyeSlot)) { sound('error'); say('This piece has its own colours.'); return; }
      if (Lk().equip(c.key, c.value)) sound('menuPick');
    }

    function randomize() {
      const look = Lk().randomLook();
      TABS.forEach(function (t) { t.secs.forEach(function (s) {
        if (s.kind === 'chips' || s.kind === 'swatch') Lk().equip(s.key, look[s.key]);
        else if (s.kind === 'items' && s.slot !== 'weapon') Lk().equip(s.slot, look[s.slot]);
      }); });
      ['hatDye', 'topDye', 'pantsDye', 'bootsDye', 'glovesDye', 'capeDye', 'extraDye'].forEach(function (k) { Lk().equip(k, look[k]); });
      sound('menuPick');
      say('A new look, from what you own.');
    }

    // --- what the panel on the right says about the focused control ---------------------------

    function describe(c) {
      if (!c) return { name: TABS[st.tab].label, lines: ['Move into the list to try things on.'], act: null };
      if (c.kind !== 'item') {
        const on = worn(c);
        const off = c.dyeSlot && !dyeable(c.dyeSlot);
        return { name: (TRAIT_LABEL[c.key] || 'Dye') + ': ' + c.label, lines: [off ? 'This piece has its own colours.' : 'Free, always.'],
                 act: c.kind === 'wtype' ? { label: 'CHOOSE', enabled: true } : { label: on ? 'SELECTED' : 'SELECT', enabled: !on && !off } };
      }
      const it = c.item, keys = Lk().profile.wallet.keys, owned = Lk().owns(it), on = worn(c);
      const out = { name: it.name, rarity: it.rarity, lines: [SLOT_LABEL[it.slot] + (it.w ? ' · ' + it.w : '') + (it.set ? ' · set' : '')] };
      if (it.starter) out.lines.push('A free starter piece.');
      else if (it.rarity === 'limited') {
        const have = Math.min(it.earn.n, Lk().profile.counters[it.earn.counter] || 0);
        out.lines.push('Cannot be bought. ' + it.earn.text + '.');
        out.lines.push(owned ? 'Earned.' : 'Progress ' + have + ' / ' + it.earn.n);
      } else if (!owned) out.lines.push('Price ' + it.price + ' keys. You have ' + keys + '.');
      else out.lines.push('Owned.');
      if (it.dyed) out.lines.push('Takes your dye.');
      if (it.glow) out.lines.push('It glows.');
      if (on) out.act = { label: 'WORN', enabled: false };
      else if (owned) out.act = { label: 'WEAR', enabled: true };
      else if (it.rarity === 'limited') out.act = { label: 'LOCKED', enabled: false };
      else out.act = { label: 'BUY · ' + it.price, enabled: keys >= it.price, item: it };
      return out;
    }

    // --- DOM -------------------------------------------------------------------------------------------

    function ctlNode(c) {
      let node;
      if (c.kind === 'swatch') {
        node = h('button', 'hc-ctl hc-swatch', { type: 'button', tabindex: '-1', title: c.label });
        node.style.setProperty('--sw', c.hex);
      } else if (c.kind === 'item') {
        const it = c.item;
        node = h('button', 'hc-ctl hc-card rar-' + it.rarity, { type: 'button', tabindex: '-1' }, [
          h('span', 'hc-card-name', { text: it.name }),
          h('span', 'hc-card-tag')
        ]);
      } else {
        node = h('button', 'hc-ctl hc-chip', { type: 'button', tabindex: '-1', text: c.label });
      }
      node.addEventListener('pointerenter', function () {
        const at = position(c);
        if (at && (st.y !== at.y || st.x !== at.x || st.col !== 1)) { st.col = 1; st.y = at.y; st.x = at.x; st.armed = null; }
      });
      node.addEventListener('click', function () { st.col = 1; const at = position(c); if (at) { st.y = at.y; st.x = at.x; } activate(c); });
      ui.nodes.set(c, node);
      return node;
    }

    function position(c) {
      for (let y = 0; y < lines.length; y++) { const x = lines[y].indexOf(c); if (x >= 0) return { y: y, x: x }; }
      return null;
    }

    function build(root) {
      ui.nodes = new Map(); ui.tabNodes = [];
      const first = !!ctx.first;
      root.appendChild(h('div', 'hc-shade'));
      root.appendChild(K().masthead({
        eyebrow: first ? 'FIRST TIME' : (ctx.fromMenu ? 'TITLE' : 'WARDROBE'),
        title: first ? 'Create your walker' : 'Character', accent: 'var(--accent)',
        sub: first ? 'Everything on Body and Face is free. The wardrobe is bought with keys from the dungeon.' : 'Try anything on. Wear what you own; buy the rest with keys.',
        right: h('div', 'hc-wallet', null, [DS.SPR && DS.SPR.key ? K().icon(DS.SPR.key, 'hc-key-icon') : h('span'), h('span', 'hc-keys ui-num'), h('span', 'hc-wallet-l', { text: 'KEYS' })])
      }));

      const tabCol = h('nav', 'hc-tabs');
      TABS.forEach(function (t, i) {
        const n = h('button', 'hc-tab', { type: 'button', tabindex: '-1', text: t.label });
        n.addEventListener('click', function () { st.col = 1; gotoTab(i); });
        tabCol.appendChild(n);
        ui.tabNodes.push(n);
      });

      ui.list = h('div', 'hc-list');
      secs.forEach(function (sec) {
        const box = h('section', 'hc-sec', null, [h('div', 'hk-section-label', { text: sec.label })]);
        const grid = h('div', 'hc-grid hc-grid-' + (sec.ctrls[0] ? sec.ctrls[0].kind : 'chip'));
        grid.style.setProperty('--cols', String(sec.cols));
        sec.ctrls.forEach(function (c) { grid.appendChild(ctlNode(c)); });
        box.appendChild(grid);
        ui.list.appendChild(box);
      });
      ui.noteNode = h('div', 'hc-note');
      const listPanel = h('section', 'ui-panel hc-panel', null, [ui.list, ui.noteNode]);

      const stage = h('div', 'hc-stage');
      let dragging = false, lastX = 0;
      stage.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; try { stage.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } });
      stage.addEventListener('pointermove', function (e) { if (dragging && DS.LookStage) { DS.LookStage.nudge((e.clientX - lastX) * 0.012); lastX = e.clientX; } });
      const stop = function () { dragging = false; };
      stage.addEventListener('pointerup', stop); stage.addEventListener('pointercancel', stop);
      ui.stageHint = h('div', 'hc-stage-hint', { text: 'DRAG TO TURN' });
      stage.appendChild(ui.stageHint);
      ui.fallback = h('canvas', 'hc-fallback');
      stage.appendChild(ui.fallback);

      ui.dName = h('div', 'hc-d-name');
      ui.dRar = h('div', 'hc-d-rar');
      ui.dLines = h('div', 'hc-d-lines');
      ui.dAct = h('button', 'ui-btn hm-btn hc-d-act', { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label')]);
      ui.dAct.addEventListener('click', function () {
        const d = describe(cur());
        if (!d.act || !d.act.enabled) { sound('error'); return; }
        const c = cur();
        if (c && c.kind === 'item') activateItem(c.item, true); else activate(c);
      });
      ui.doll = h('canvas', 'hc-doll');
      const rnd = h('button', 'ui-btn hm-btn hm-foot-btn hc-rnd', { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label', { text: 'RANDOM' })]);
      rnd.addEventListener('click', randomize);
      const detail = h('aside', 'ui-panel hc-detail', null, [
        ui.dName, ui.dRar, ui.dLines, ui.dAct,
        h('div', 'hk-section-label', { text: 'IN THE BAG' }),
        h('div', 'hc-doll-row', null, [ui.doll, rnd])
      ]);

      root.appendChild(h('main', 'hk-body hc-wrap', null, [tabCol, listPanel, stage, detail]));

      const done = h('button', 'ui-btn hm-btn hm-foot-btn is-primary', { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label', { text: first ? 'BEGIN' : 'DONE' })]);
      done.addEventListener('click', function () { sound('menuPick'); close(); });
      root.appendChild(K().foot([['↑ ↓ ← →', 'Move'], ['ENTER', 'Wear · buy'], ['Q E', 'Page'], ['R', 'Random'], ['ESC', first ? 'Begin' : 'Back']],
                                h('div', 'hk-foot-left', null, [done])));
    }

    function refresh() {
      const wallet = Lk().profile.wallet.keys;
      const keysNode = ui.root.querySelector('.hc-keys');
      if (keysNode && keysNode.textContent !== String(wallet)) keysNode.textContent = String(wallet);
      for (let i = 0; i < ui.tabNodes.length; i++) {
        ui.tabNodes[i].classList.toggle('is-on', i === st.tab);
        ui.tabNodes[i].classList.toggle('is-focus', i === st.tab && st.col === 0);
      }
      const focus = cur();
      ui.nodes.forEach(function (node, c) {
        node.classList.toggle('is-focus', c === focus);
        node.classList.toggle('is-worn', worn(c));
        if (c.kind === 'swatch') node.classList.toggle('is-off', !!(c.dyeSlot && !dyeable(c.dyeSlot)));
        if (c.kind === 'item') {
          const it = c.item, owned = Lk().owns(it);
          node.classList.toggle('is-owned', owned);
          node.classList.toggle('is-locked', !owned && it.rarity === 'limited');
          node.classList.toggle('is-armed', st.armed === it.key);
          const tag = node.lastChild;
          const text = worn(c) ? 'WORN' : owned ? (it.starter ? 'FREE' : 'OWNED') : it.rarity === 'limited' ? 'LIMITED' : String(it.price);
          if (tag.textContent !== text) tag.textContent = text;
          tag.classList.toggle('is-price', !owned && it.rarity !== 'limited');
          tag.classList.toggle('is-short', !owned && it.rarity !== 'limited' && Lk().profile.wallet.keys < it.price);
        }
      });
      const d = describe(focus);
      if (ui.dName.textContent !== d.name) ui.dName.textContent = d.name;
      const rar = d.rarity ? RARITY_NAME[d.rarity] : '';
      if (ui.dRar.textContent !== rar) { ui.dRar.textContent = rar; ui.dRar.className = 'hc-d-rar' + (d.rarity ? ' rar-' + d.rarity : ''); }
      const linesText = d.lines.join('\n');
      if (ui.dLines.textContent !== linesText) ui.dLines.textContent = linesText;
      ui.dAct.hidden = !d.act;
      if (d.act) {
        const label = ui.dAct.firstChild;
        if (label.textContent !== d.act.label) label.textContent = d.act.label;
        ui.dAct.classList.toggle('is-locked', !d.act.enabled);
      }
      if (st.noteT > 0) st.noteT--;
      const note = st.noteT > 0 ? st.note : '';
      if (ui.noteNode.textContent !== note) ui.noteNode.textContent = note;
    }

    /* The hero and his pixel twin, for whatever is being tried on. */
    function show() {
      const c = cur();
      const look = clone(Lk().look);
      let weapon = TABS[st.tab].id === 'weapon' ? st.weaponType : null;
      if (c) {
        if (c.kind === 'chip') look[c.key] = c.value;
        else if (c.kind === 'swatch' && (!c.dyeSlot || dyeable(c.dyeSlot))) look[c.key] = c.value;
        else if (c.kind === 'item') {
          if (c.item.slot === 'weapon') { look.weapon[c.item.w] = c.item.id; weapon = c.item.w; }
          else look[c.item.slot] = c.item.id;
        }
      }
      const stageOk = DS.LookStage && DS.LookStage.setLook(look, { weapon: weapon });
      if (stageOk) DS.LookStage.view(TABS[st.tab].view);
      const R = DS.R;
      R.begin();
      R.uiMode();
      const live = stageOk && DS.LookStage.attach(1 / 60);
      ui.fallback.style.display = live ? 'none' : 'block';
      ui.stageHint.style.display = live ? 'block' : 'none';
      if (!live && DS.Look2D) paintFallback(look);
      paintDoll(look);
    }

    function paintDoll(look) {
      const s = DS.HUI.frame.s;
      const k = Math.max(2, Math.round(3 * s));
      const idx = Math.floor(st.frames / 40) % 2;
      const sig = DS.Look3D.keyOf(look) + '|' + idx + '|' + k;
      if (sig === ui.dollSig || !DS.Look2D) return;
      ui.dollSig = sig;
      blit(ui.doll, DS.Look2D.frames(look)[idx], k);
    }
    function paintFallback(look) {
      const k = Math.max(2, Math.round(6 * DS.HUI.frame.s));
      const sig = DS.Look3D.keyOf(look) + '|' + k;
      if (ui.fbSig === sig) return;
      ui.fbSig = sig;
      blit(ui.fallback, DS.Look2D.frames(look)[0], k);
    }
    function blit(cv, src, k) {
      if (cv.width !== src.width * k || cv.height !== src.height * k) {
        cv.width = src.width * k; cv.height = src.height * k;
        cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
      }
      const cx = cv.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.drawImage(src, 0, 0, cv.width, cv.height);
    }

    // --- update: keyboard and pad ---------------------------------------------------------------------

    const held = function (name, action) {
      if (DS.Input.isDown(action)) st.hold[name] = (st.hold[name] || 0) + 1; else st.hold[name] = 0;
      const n = st.hold[name];
      return n === 1 || (n > 22 && (n - 22) % 4 === 0);
    };

    function step(dx, dy) {
      if (!lines.length) return;
      const before = st.y + ':' + st.x;
      if (dy) {
        st.y = clamp(st.y + dy, 0, lines.length - 1);
        st.x = Math.min(st.x, lines[st.y].length - 1);
      } else {
        const len = lines[st.y].length;
        if (st.x + dx < 0) { st.col = 0; sound('menuMove'); return; }
        st.x = clamp(st.x + dx, 0, len - 1);
      }
      if (st.y + ':' + st.x !== before) { st.armed = null; sound('menuMove'); }
    }

    focusWorn();

    return {
      state: st,
      get done() { return st.done; },
      update: function () {
        const In = DS.Input;
        st.frames++;
        /* Counted every tick, in every mode: a key still down from leaving the tab
           column must not read as a fresh press on the first piece it lands on. */
        const goU = held('u', 'up'), goD = held('d', 'down'), goL = held('l', 'left'), goR = held('r', 'right');
        if (In.justPressed('back') || In.justPressed('pause')) { In.consume('back'); In.consume('pause'); close(); return; }
        if (In.justPressed('swap')) gotoTab(st.tab - 1);
        if (In.justPressed('skill')) gotoTab(st.tab + 1);
        if (In.justPressed('reroll')) randomize();
        if (st.col === 0) {
          if (goU) gotoTab(st.tab - 1);
          if (goD) gotoTab(st.tab + 1);
          if (In.justPressed('right') || In.justPressed('confirm')) { In.consume('confirm'); st.col = 1; sound('menuMove'); }
          return;
        }
        if (goU) step(0, -1);
        if (goD) step(0, 1);
        if (goL) step(-1, 0);
        if (goR) step(1, 0);
        if (In.justPressed('confirm')) { In.consume('confirm'); activate(cur()); }
      },
      draw: function () {
        const s = K().screen('creator');
        ui.root = s.root;
        K().rebuild(s, 'creator|' + st.tab + '|' + st.weaponType + '|' + Math.round(DS.HUI.frame.h) + '|' + (ctx.first ? 1 : 0), build);
        show();
        refresh();
        const node = ui.nodes.get(cur());
        if (node && node.scrollIntoView && st.scrolled !== st.tab + ':' + st.y + ':' + st.x) {
          st.scrolled = st.tab + ':' + st.y + ':' + st.x;
          node.scrollIntoView({ block: 'nearest' });
        }
      },
      // For the tests and the QA tool.
      controls: function () { return lines; },
      activate: activate, describe: describe, randomize: randomize, gotoTab: gotoTab, close: close
    };
  }

  DS.Creator = { create: create, TABS: TABS, sectionsOf: sectionsOf, linesOf: linesOf };
})(window.DS);
