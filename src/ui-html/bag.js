/* The bag, as an HTML character screen (v6).

   Three columns, read left to right the way the decision is made:
     equipment  the hero in what he wears, both hands down his left and the
                three armour pieces down his right, over a lit plinth
     bag        twelve rarity-edged tiles, the essences he knows, and the floor
     detail     whatever is hovered, focused or being dragged, in full, with
                ▲/▼ against the piece it would replace

   Every slot and tile carries data-ref ("weapon:0", "armor:head", "bag:3"),
   the same {kind,...} refs DS.Inv.readRef/accepts/moveTo speak, so drag and
   drop is one moveTo between two refs whatever the two panels are.

   Input: arrows/stick walk the tiles by layout (DS.HKit.spatial), ENTER equips
   (or swaps hands on a weapon slot), F drops, Q swaps hands, TAB/B/ESC close.
   The mouse hovers to inspect, drags to equip or reorder, drops on the floor
   strip to discard, and double-clicks to equip. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const K = function () { return DS.HKit; };
  function h(tag, cls, props, kids) { return DS.HUI.el(tag, cls, props, kids); }

  const SLOTS = [
    { ref: { kind: 'weapon', index: 0 }, label: 'MAIN HAND', glyph: 'weapon', side: 'l' },
    { ref: { kind: 'weapon', index: 1 }, label: 'OFF HAND', glyph: 'weapon', side: 'l' },
    { ref: { kind: 'armor', slot: 'head' }, label: 'HEAD', glyph: 'head', side: 'r' },
    { ref: { kind: 'armor', slot: 'chest' }, label: 'BODY', glyph: 'chest', side: 'r' },
    { ref: { kind: 'armor', slot: 'legs' }, label: 'LEGS', glyph: 'legs', side: 'r' }
  ];

  // Live nodes for the open bag, rebuilt with the screen.
  const B = { nodes: [], doll: null, dollFrame: -1, detail: null, detailSig: '', drag: null, g: null };

  function refKey(ref) {
    return ref.kind + ':' + (ref.kind === 'armor' ? ref.slot : ref.index);
  }

  function refFromKey(key) {
    const p = key.split(':');
    if (p[0] === 'armor') return { kind: 'armor', slot: p[1] };
    return { kind: p[0], index: Number(p[1]) };
  }

  function targets(g) {
    const out = [];
    for (let i = 0; i < SLOTS.length; i++) out.push(SLOTS[i].ref);
    for (let i = 0; i < DS.Inv.BAG_SIZE; i++) out.push({ kind: 'bag', index: i });
    return out;
  }

  // --- actions --------------------------------------------------------------

  function refresh(g) { g.player.refreshStats(); }

  function dropRef(g, ref) {
    const item = DS.Inv.takeFrom(g.inv, ref);
    if (!item) { DS.Audio.play('error'); return; }
    DS.Ent.addPickup(g, DS.Ent.centerX(g.player), g.player.y, 'item', item, 1);
    refresh(g);
    DS.Audio.play('pickup');
    g.toast('DROPPED ' + item.name, '#9b96b8');
  }

  function moveRef(g, from, to) {
    const result = DS.Inv.moveTo(g.inv, from, to);
    if (result.ok) {
      if (result.moved) DS.Audio.play(to && to.kind !== 'bag' ? 'uiEquip' : 'menuPick');   // onto the hero, not just around the bag
      refresh(g);
    } else {
      DS.Audio.play('error');
      g.toast(result.reason, '#ff4d6d');
    }
  }

  function useRef(g, index) {
    const ref = targets(g)[index];
    if (!ref) return;
    DS.UI.act.keyboardUse(g, { ref: ref, item: DS.Inv.readRef(g.inv, ref) });
  }

  // --- update (fixed step) --------------------------------------------------

  function update(g) {
    const In = DS.Input;
    const state = g.modal;
    const all = targets(g);

    if (In.justPressed('bag') || In.justPressed('back')) {
      In.consume('bag'); In.consume('back');
      cancelDrag();
      DS.UI.closeModal(g);
      return;
    }
    const dir = K().navDir();
    if (dir && B.nodes.length) K().move(state, 'cursor', K().spatial(B.nodes, state.cursor, dir));
    state.cursor = Math.max(0, Math.min(all.length - 1, state.cursor));

    if (In.justPressed('confirm')) { In.consume('confirm'); useRef(g, state.cursor); }
    if (In.justPressed('interact')) {
      In.consume('interact');
      if (DS.Inv.readRef(g.inv, all[state.cursor])) dropRef(g, all[state.cursor]);
    }
    if (In.justPressed('swap')) {
      In.consume('swap');
      if (DS.Inv.swapActive(g.inv)) { refresh(g); DS.Audio.play('menuPick'); } else DS.Audio.play('error');
    }
  }

  // --- drag and drop --------------------------------------------------------

  /* Pointer-driven, not HTML5 drag-and-drop: the ghost is ours (a tile, not a
     browser screenshot), and the drop target is resolved with
     elementFromPoint so a drop lands wherever the ghost visibly is. */
  function onPointerDown(e) {
    if (e.button !== 0) return;
    const node = e.target.closest('[data-ref]');
    const g = B.g;
    if (!node || !g) return;
    const ref = refFromKey(node.dataset.ref);
    const item = DS.Inv.readRef(g.inv, ref);
    const index = B.nodes.indexOf(node);
    if (index >= 0) K().move(g.modal, 'cursor', index);
    if (!item) return;
    B.drag = { ref: ref, item: item, node: node, x: e.clientX, y: e.clientY, live: false, ghost: null, over: null };
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
  }

  function onPointerMove(e) {
    const d = B.drag;
    if (!d) return;
    const s = DS.HUI.frame.s || 1;
    if (!d.live) {
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6 * s) return;
      d.live = true;
      d.ghost = h('div', 'hb-ghost ' + K().rarityClass(d.item.rarity), null, [K().itemIcon(d.item, 'hb-ghost-icon')]);
      DS.HUI.layer('overlay').appendChild(d.ghost);
      d.node.classList.add('is-lifted');
      document.documentElement.classList.add('hb-dragging');
      DS.Audio.play('menuMove');
    }
    const f = DS.HUI.frame;
    d.ghost.style.transform = 'translate(' + (e.clientX - f.x) + 'px,' + (e.clientY - f.y) + 'px)';
    markOver(e.clientX, e.clientY);
  }

  function dropTargetAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    return hit.closest('[data-ref]') || hit.closest('.hb-floor');
  }

  function markOver(x, y) {
    const d = B.drag;
    const over = dropTargetAt(x, y);
    if (d.over && d.over !== over) d.over.classList.remove('is-drop-ok', 'is-drop-bad');
    d.over = over;
    if (!over) return;
    if (over.classList.contains('hb-floor')) { over.classList.add('is-drop-ok'); return; }
    const ok = DS.Inv.accepts(refFromKey(over.dataset.ref), d.item);
    over.classList.toggle('is-drop-ok', ok);
    over.classList.toggle('is-drop-bad', !ok);
  }

  function onPointerUp(e) {
    const d = B.drag;
    const g = B.g;
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    if (!d || !g || !g.modal || g.modal.kind !== 'bag') { cancelDrag(); return; }
    if (d.live) {
      const over = dropTargetAt(e.clientX, e.clientY);
      if (over && over.classList.contains('hb-floor')) dropRef(g, d.ref);
      else if (over) moveRef(g, d.ref, refFromKey(over.dataset.ref));
      else DS.Audio.play('menuMove');
    }
    cancelDrag();
  }

  function cancelDrag() {
    const d = B.drag;
    B.drag = null;
    document.documentElement.classList.remove('hb-dragging');
    if (!d) return;
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    if (d.node) d.node.classList.remove('is-lifted');
    if (d.over) d.over.classList.remove('is-drop-ok', 'is-drop-bad');
  }

  // --- building -------------------------------------------------------------

  function slotNode(g, def, i) {
    const item = DS.Inv.readRef(g.inv, def.ref);
    const isHand = def.ref.kind === 'weapon';
    const active = isHand && def.ref.index === g.inv.active;
    const cls = 'hb-slot hk-tile' + (item ? ' ' + K().rarityClass(item.rarity) : ' is-empty') +
      (active ? ' is-active' : '');
    const node = h('div', cls, { dataset: { ref: refKey(def.ref) } }, [
      item ? K().itemIcon(item, 'hk-tile-icon') : K().icon(DS.SPR.slotIcon[def.glyph], 'hb-glyph'),
      active ? h('span', 'hk-tile-tag is-active', { text: 'HELD' }) : null
    ]);
    bindTile(g, node, i);
    return h('div', 'hb-slotwrap is-' + def.side, null, [
      node,
      h('div', 'hb-slot-label', { text: def.label })
    ]);
  }

  function cellNode(g, i) {
    const item = g.inv.bag[i] || null;
    const node = h('div', 'hb-cell hk-tile' + (item ? ' ' + K().rarityClass(item.rarity) : ' is-empty'),
      { dataset: { ref: 'bag:' + i } }, [
        item ? K().itemIcon(item, 'hk-tile-icon') : null
      ]);
    /* A weapon's live element as a lit stud in the corner, ringed when it is
       an infusion rather than what the steel dropped with. */
    const el = item && !DS.Armor.isArmor(item) ? DS.Weapons.activeElement(item) : null;
    if (el) {
      const dot = h('span', 'hb-eldot' + (item.infusion ? ' is-infused' : ''));
      dot.style.setProperty('--el', K().elColor(el));
      node.appendChild(dot);
    }
    bindTile(g, node, SLOTS.length + i);
    return node;
  }

  function bindTile(g, node, index) {
    B.nodes[index] = node;
    node.addEventListener('pointerenter', function () {
      g.modal.hover = index;
      if (!B.drag) K().move(g.modal, 'cursor', index);
    });
    node.addEventListener('pointerleave', function () { if (g.modal.hover === index) g.modal.hover = -1; });
    node.addEventListener('dblclick', function () { useRef(g, index); });
  }

  function stage(g) {
    const p = g.player;
    const left = h('div', 'hb-col is-l');
    const right = h('div', 'hb-col is-r');
    for (let i = 0; i < SLOTS.length; i++) {
      (SLOTS[i].side === 'l' ? left : right).appendChild(slotNode(g, SLOTS[i], i));
    }
    B.doll = h('canvas', 'hb-doll');
    B.dollFrame = -1;
    const set = p.stats.setBonus;
    const held = DS.Inv.weapon(g.inv);
    const dmg = held ? Math.round(held.stats.damage * DS.Player.damageMult(g, p)) : 0;
    const crit = held ? Math.min(0.9, held.stats.crit + (p.stats.critBonus || 0)) : 0;
    const vitals = h('div', 'hb-vitals', null, [
      vital('DMG', String(dmg)),
      vital('CRIT', Math.round(crit * 100) + '%'),
      vital('HEARTS', String(p.stats.maxHp)),
      vital('SHIELD', String(p.stats.shield)),
      vital('SPEED', p.stats.moveSpeed.toFixed(2))
    ]);
    return h('section', 'hb-stage', null, [
      h('div', 'hb-stage-head', null, [
        h('div', 'hk-section-label', { text: 'EQUIPMENT' }),
        h('div', 'hb-hero-name', { text: (DS.Board && DS.Board.name) || 'HERO' })
      ]),
      h('div', 'hb-stage-mid', null, [
        left,
        h('div', 'hb-plinth', null, [h('div', 'hb-halo'), B.doll, h('div', 'hb-floorring')]),
        right
      ]),
      set ? h('div', 'hk-set is-active hb-setbar', null, [
        h('span', 'hk-set-tag', { text: 'SET ACTIVE' }),
        h('span', 'hk-set-desc', { text: set.desc })
      ]) : h('div', 'hk-set hb-setbar', null, [
        h('span', 'hk-set-tag', { text: 'SET BONUS' }),
        h('span', 'hk-set-desc', { text: 'Wear three pieces of one material' })
      ]),
      vitals
    ]);
  }

  function vital(label, val) {
    return h('div', 'hb-vital', null, [
      h('span', 'hb-vital-val ui-num', { text: val }),
      h('span', 'hb-vital-label', { text: label })
    ]);
  }

  function bagColumn(g) {
    const grid = h('div', 'hb-grid');
    for (let i = 0; i < DS.Inv.BAG_SIZE; i++) grid.appendChild(cellNode(g, i));
    const full = g.inv.bag.length >= DS.Inv.BAG_SIZE;
    return h('section', 'hb-bag', null, [
      h('div', 'hb-bag-head', null, [
        h('div', 'hk-section-label', { text: 'BAG' }),
        h('div', 'hb-count ui-num' + (full ? ' is-full' : ''), { text: g.inv.bag.length + ' / ' + DS.Inv.BAG_SIZE })
      ]),
      grid,
      essences(g),
      h('div', 'hb-floor', null, [
        h('span', 'hb-floor-mark'),
        h('span', '', { text: 'DRAG HERE TO DROP ON THE FLOOR' })
      ])
    ]);
  }

  function essences(g) {
    const W = DS.Weapons;
    const known = DS.Inv.essences(g.inv);
    const held = DS.Inv.weapon(g.inv);
    const live = held ? W.activeElement(held) : null;
    const row = h('div', 'hb-essence-row');
    for (let i = 0; i < W.ELEMENT_KEYS.length; i++) {
      const k = W.ELEMENT_KEYS[i];
      const on = known.indexOf(k) >= 0;
      const chip = h('span', 'hb-essence' + (on ? ' is-known' : '') + (k === live ? ' is-live' : ''),
        { title: W.ELEMENTS[k].label }, [h('i', ''), h('span', '', { text: W.ELEMENTS[k].label })]);
      chip.style.setProperty('--el', K().elColor(k));
      row.appendChild(chip);
    }
    return h('div', 'hb-essences', null, [
      h('div', 'hb-essence-head', null, [
        h('div', 'hk-section-label', { text: 'ESSENCES ' + known.length + ' / ' + W.ELEMENT_KEYS.length }),
        h('div', 'hb-infuse-hint', null, [K().keycap('R'), K().keycap('T'),
          h('span', '', { text: known.length ? 'Cycle infusion in a fight' : 'Find an essence to infuse' })])
      ]),
      row
    ]);
  }

  function bagSig(g) {
    const inv = g.inv;
    let sig = inv.active + '|' + inv.coins + '|' + inv.shards + '|' + DS.Inv.essences(inv).join(',') + '|';
    for (let i = 0; i < 2; i++) sig += K().itemSig(inv.equipped[i]) + ',';
    sig += K().itemSig(inv.armor.head) + ',' + K().itemSig(inv.armor.chest) + ',' + K().itemSig(inv.armor.legs) + '|';
    for (let i = 0; i < inv.bag.length; i++) sig += K().itemSig(inv.bag[i]) + ',';
    return sig + '|' + Math.round(DS.HUI.frame.h);
  }

  // --- draw -----------------------------------------------------------------

  function draw(g) {
    const s = K().screen('bag');
    B.g = g;
    if (!s.bound) {
      s.bound = true;
      s.root.addEventListener('pointerdown', onPointerDown);
      s.onHide = function () { cancelDrag(); B.g = null; };
    }
    const state = g.modal;
    if (state.hover == null) state.hover = -1;
    K().rebuild(s, bagSig(g), function (root) {
      B.nodes = [];
      root.appendChild(h('div', 'hk-scrim'));
      root.appendChild(K().masthead({
        eyebrow: 'CHARACTER', title: 'Inventory', accent: 'var(--accent)',
        sub: 'Drag to equip. Armour counts for what it does; how he looks is the Character screen.', right: K().purse(g.inv)
      }));
      B.detail = h('section', 'hb-detail');
      B.detailSig = '';
      root.appendChild(h('main', 'hk-body hb-body', null, [stage(g), bagColumn(g), B.detail]));
      root.appendChild(K().foot([['ENTER', 'Equip'], ['F', 'Drop'], ['Q', 'Swap hands'], ['TAB', 'Close']]));
    });

    K().setFocus(B.nodes, state.cursor);
    drawDoll(g);
    drawDetail(g, state);
    K().status(s.root, g);
  }

  /* The paperdoll art the game ships with, blown up by a whole number so its
     pixels stay square, breathing on the same idle cycle as before. */
  function drawDoll(g) {
    const cv = B.doll;
    if (!cv) return;
    /* v7: the doll is the hero's look in pixels (src/items/look2d.js), so the
       person in the bag is the person in the world; the paper doll is the
       fallback for a build without it. */
    const look = DS.Look2D && DS.Look ? DS.Look.look : null;
    const doll = look ? null : ((g.player && g.player.doll) || DS.Paperdoll.bare());
    const index = Math.floor(g.frames / 40) % (look ? 2 : doll.idle.length);
    const sig = index + '|' + (look ? DS.Look3D.keyOfCurrent() : '');
    if (sig === B.dollFrame) return;
    B.dollFrame = sig;
    const frame = look ? DS.Look2D.frames(look)[index] : doll.idle[index];
    const targetH = 250 * DS.HUI.frame.s;
    const k = Math.max(1, Math.floor(targetH / frame.height));
    if (cv.width !== frame.width * k || cv.height !== frame.height * k) {
      cv.width = frame.width * k;
      cv.height = frame.height * k;
      cv.style.width = cv.width + 'px';
      cv.style.height = cv.height + 'px';
    }
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(frame, 0, 0, cv.width, cv.height);
  }

  function drawDetail(g, state) {
    const all = targets(g);
    const index = state.hover >= 0 ? state.hover : state.cursor;
    const item = B.drag && B.drag.live ? B.drag.item : DS.Inv.readRef(g.inv, all[index]);
    const sig = K().itemSig(item) + '|' + index + '|' + B.nodes.length + '|' + g.inv.active;
    if (sig === B.detailSig || !B.detail) return;
    B.detailSig = sig;
    const host = B.detail;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!item) {
      host.appendChild(h('div', 'hb-detail-empty', null, [
        h('div', 'hk-section-label', { text: 'DETAILS' }),
        h('div', 'hb-empty-big', { text: 'Empty slot' }),
        h('div', 'hb-empty-note', { text: 'Hover or select an item to inspect it. Drag it onto the hero to wear it.' })
      ]));
      return;
    }
    // The screen footer already carries ENTER / F / Q, so the card does not.
    /* One frame, always the same size and in the same place: hovering only swaps what is written
       in it. (It used to slide in afresh for every item the pointer crossed, and change height
       with every affix list.) */
    host.appendChild(K().itemCard(item, { inv: g.inv, player: g.player }));
  }

  DS.HBag = { update: update, draw: draw };
})(window.DS);
