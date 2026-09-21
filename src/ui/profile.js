/* The profile screen, which is also the pause screen.

   Three tabs:
     CHARACTER  the paper doll at 4x with every slot around it
     STATS      not just the final number but where the number came from
     RUN        boons, floor rule, run totals, and the pause actions

   Opened with ESC, or with C, or by clicking the portrait in the HUD. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const M = DS.M;
  const A = DS.Armor;
  const W = DS.Weapons;

  const INK = '#d8d5e8';
  const MUTED = '#9b96b8';
  const GOLD = '#f2c14e';
  const CYAN = '#a8e4ff';
  const RED = '#c0303c';

  const TABS = ['CHARACTER', 'STATS', 'RUN'];
  const ACTIONS = ['RESUME', 'MUTE', 'ABANDON RUN'];

  /* Screen geometry, named once so the click test and the drawing can never
     drift apart - which is exactly what happens when a panel is laid out with
     literals in two places. */
  const TAB_W = 62, TAB_GAP = 4, TAB_Y = 6, TAB_H = 9;
  const SLOT_X = 84, SLOT_Y = 26, SLOT_H = 14, SLOT_STEP = 16;
  const ACT_W = 88, ACT_H = 10;

  function tabRect(i) {
    const x = (C.W - (TABS.length * TAB_W + (TABS.length - 1) * TAB_GAP)) / 2 +
              i * (TAB_W + TAB_GAP);
    return { x: x, y: TAB_Y, w: TAB_W, h: TAB_H };
  }

  function slotRect(i) {
    return { x: SLOT_X, y: SLOT_Y + i * SLOT_STEP, w: C.W - SLOT_X - 20, h: SLOT_H };
  }

  function actionRect(i) {
    return { x: 24 + i * 92, y: C.H - 32, w: ACT_W, h: ACT_H };
  }

  function open(g) {
    g.profile = g.profile || { tab: 0, cursor: 0, action: 0 };
    g.paused = true;
    DS.Audio.play('menuPick');
  }

  function close(g) {
    g.paused = false;
    DS.Audio.play('menuMove');
  }

  // Every slot the profile can point at, in the order the cursor walks them.
  function slotList(g) {
    const inv = g.inv;
    return [
      { key: 'weaponA', label: 'MAIN', item: inv.equipped[0] },
      { key: 'weaponB', label: 'OFF',  item: inv.equipped[1] },
      { key: 'head',    label: 'HEAD', item: inv.armor.head },
      { key: 'chest',   label: 'BODY', item: inv.armor.chest },
      { key: 'legs',    label: 'LEGS', item: inv.armor.legs }
    ];
  }

  function update(g) {
    const In = DS.Input;
    const Ptr = DS.Ptr;
    const state = g.profile;

    if (In.justPressed('pause') || In.justPressed('back')) {
      In.consume('pause'); In.consume('back');
      close(g);
      return;
    }

    // Tabs are chips you click, not a key you have to know about.
    state.hoverTab = -1;
    for (let i = 0; i < TABS.length; i++) {
      const r = tabRect(i);
      if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
      state.hoverTab = i;
      if (Ptr.clicked(r.x, r.y, r.w, r.h) && state.tab !== i) {
        state.tab = i;
        DS.Audio.play('menuMove');
      }
      break;
    }

    if (In.justPressed('swap')) {
      In.consume('swap');
      state.tab = (state.tab + TABS.length - 1) % TABS.length;
      DS.Audio.play('menuMove');
      return;
    }
    if (In.justPressed('skill')) {
      In.consume('skill');
      state.tab = (state.tab + 1) % TABS.length;
      DS.Audio.play('menuMove');
      return;
    }

    if (state.tab === 0) updateCharacter(g, state, In);
    else if (state.tab === 2) updateRun(g, state, In);
  }

  function updateCharacter(g, state, In) {
    const Ptr = DS.Ptr;
    const slots = slotList(g);

    state.hoverSlot = -1;
    for (let i = 0; i < slots.length; i++) {
      const r = slotRect(i);
      if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
      state.hoverSlot = i;
      if (state.cursor !== i) { state.cursor = i; DS.Audio.play('menuMove'); }
      if (Ptr.clicked(r.x, r.y, r.w, r.h)) useSlot(g, state, slots[i]);
      break;
    }

    if (In.justPressed('down')) { state.cursor = (state.cursor + 1) % slots.length; DS.Audio.play('menuMove'); }
    if (In.justPressed('up')) { state.cursor = (state.cursor + slots.length - 1) % slots.length; DS.Audio.play('menuMove'); }

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');
    useSlot(g, state, slots[state.cursor]);
  }

  // A weapon slot swaps hands; anything else hands you over to the bag, which
  // is the screen that can actually change what is in that slot.
  function useSlot(g, state, entry) {
    if (!entry) return;
    if (entry.key === 'weaponA' || entry.key === 'weaponB') {
      if (DS.Inv.swapActive(g.inv)) {
        g.player.refreshStats();
        DS.Audio.play('menuPick');
      } else DS.Audio.play('error');
      return;
    }
    close(g);
    DS.UI.openBag(g);
  }

  function updateRun(g, state, In) {
    const Ptr = DS.Ptr;

    state.hoverAction = -1;
    for (let i = 0; i < ACTIONS.length; i++) {
      const r = actionRect(i);
      if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
      state.hoverAction = i;
      if (state.action !== i) { state.action = i; DS.Audio.play('menuMove'); }
      if (Ptr.clicked(r.x, r.y, r.w, r.h)) { runAction(g, state); return; }
      break;
    }

    if (In.justPressed('down')) { state.action = (state.action + 1) % ACTIONS.length; DS.Audio.play('menuMove'); }
    if (In.justPressed('up')) { state.action = (state.action + ACTIONS.length - 1) % ACTIONS.length; DS.Audio.play('menuMove'); }

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');
    runAction(g, state);
  }

  function runAction(g, state) {
    DS.Audio.play('menuPick');
    if (state.action === 0) close(g);
    else if (state.action === 1) DS.Audio.toggleMute();
    else DS.Scenes.gameOver(g, false);
  }

  // --- drawing --------------------------------------------------------------

  function draw(g) {
    const R = DS.R;
    const state = g.profile || { tab: 0, cursor: 0, action: 0 };

    R.fade(0.86);

    /* Tabs are chips, not banners: 8px tall with micro type. The old 12px
       bars ate a tenth of a 180px screen before any content was drawn. */
    for (let i = 0; i < TABS.length; i++) {
      const r = tabRect(i);
      const on = i === state.tab;
      const hot = state.hoverTab === i;
      R.rectS(r.x, r.y, r.w, r.h,
              on ? 'rgba(79,179,224,0.18)' : hot ? 'rgba(79,179,224,0.10)' : 'rgba(28,26,43,0.55)');
      R.frameS(r.x, r.y, r.w, r.h, on ? CYAN : hot ? '#6f6a90' : '#2a2740');
      const label = TABS[i];
      R.textSmall(label, r.x + (r.w - R.textSmallWidth(label)) / 2, r.y + 2,
                  on ? '#ffffff' : hot ? INK : MUTED);
    }

    if (state.tab === 0) drawCharacter(g, state);
    else if (state.tab === 1) drawStats(g);
    else drawRun(g, state);

    R.hintsCenter([['CLICK', 'A TAB'], ['ESC', 'CLOSE']], C.W / 2, C.H - 9, MUTED, CYAN);
    DS.Ptr.cursor();
  }

  function drawCharacter(g, state) {
    const R = DS.R;
    const p = g.player;
    const doll = p.doll || DS.Paperdoll.bare();

    // Paper doll, 4x, breathing on the idle cycle.
    const frame = doll.idle[Math.floor(g.frames / 40) % doll.idle.length];
    const big = DS.Art.scaled(frame, 4);
    R.panelS(20, 26, 56, 76, 'rgba(28,26,43,0.7)', '#3a3654');
    R.sprS(big, 20 + (56 - (big.uw == null ? big.width : big.uw)) / 2, 30);

    const set = p.stats.setBonus;
    if (set) {
      R.textSmall('SET', 48 - R.textSmallWidth('SET') / 2, 104, GOLD);
    }

    const slots = slotList(g);
    for (let i = 0; i < slots.length; i++) {
      const entry = slots[i];
      const r = slotRect(i);
      const selected = i === state.cursor;
      const color = entry.item ? W.rarityColor(entry.item.rarity) : '#3a3654';

      R.panelS(r.x, r.y, r.w, r.h,
               selected ? 'rgba(28,26,43,0.95)' : 'rgba(13,11,18,0.8)',
               selected ? color : '#2a2740');
      R.textSmall(entry.label, r.x + 4, r.y + 5, MUTED);

      if (entry.item) {
        R.sprS(DS.SPR.itemIcon(entry.item), r.x + 26, r.y + 1);
        R.textSmall(entry.item.name, r.x + 40, r.y + 5, color);
      } else {
        R.sprAlphaS(slotGlyph(entry.key), r.x + 26, r.y + 1, 0.45);
        R.textSmall('EMPTY', r.x + 40, r.y + 5, '#3a3654');
      }
    }

    /* The HUD now shows skills as icons only, so this is where their names
       live — otherwise a player has no way to learn what E and X are called. */
    const held = DS.Inv.weapon(g.inv);
    if (held) {
      const names = DS.Skills.names(held);
      const wc = W.rarityColor(held.rarity);
      R.sprS(DS.SPR.skillIcon(held.type, 'skill'), 84, 118);
      R.textSmall(names.skill, 98, 121, wc);
      R.keycap('E', C.W - 32, 118, wc);
      R.sprS(DS.SPR.skillIcon(held.type, 'ult'), 84, 132);
      R.textSmall(names.ult, 98, 135, wc);
      R.keycap('X', C.W - 32, 132, wc);
    }

    if (set) R.textSmall(set.desc, (C.W - R.textSmallWidth(set.desc)) / 2, 110, GOLD);
    R.hintsCenter([['CLICK', 'SWAP HANDS / OPEN BAG']], C.W / 2, C.H - 22, MUTED, GOLD);
  }

  // The dim outline of whatever belongs in an empty slot.
  function slotGlyph(key) {
    const S = DS.SPR.slotIcon;
    if (key === 'weaponA' || key === 'weaponB') return S.weapon;
    return S[key] || S.chest;
  }

  /* Rows read "final ( source + source )" so a number is never a mystery. */
  function drawStats(g) {
    const R = DS.R;
    const p = g.player;
    const s = p.stats;
    const base = DS.Inv.BASE;

    const rows = [
      ['DAMAGE', damageLine(g, p)],
      ['CRIT', Math.round(critOf(p) * 100) + '%',
        '8% BASE  +' + Math.round((s.critBonus || 0) * 100) + '% BOON'],
      ['MAX HEARTS', String(s.maxHp),
        base.maxHp + ' BASE  ' + delta(s.maxHp - base.maxHp) + ' GEAR'],
      ['SHIELD', Math.round(p.shield) + ' / ' + s.shield, armorLine(g)],
      ['MOVE SPEED', s.moveSpeed.toFixed(2),
        base.moveSpeed.toFixed(2) + ' BASE  -' + (s.weight * 2) + '% WEIGHT'],
      ['WEIGHT', String(s.weight), weightLine(g)],
      ['MANA', Math.round(p.mana) + ' / ' + s.maxMana,
        base.maxMana + ' BASE  ' + delta(s.maxMana - base.maxMana) + ' GEAR'],
      ['SKILL COST', String(Math.round(DS.Skills.SKILL_COST * (1 - (s.skillDiscount || 0)))),
        DS.Skills.SKILL_COST + ' BASE  -' + Math.round((s.skillDiscount || 0) * 100) + '%'],
      ['MOMENTUM', 'x' + g.streak,
        '+' + Math.round(DS.Boons.bonus(g) * 100) + '% DAMAGE']
    ];

    /* Two-line rows at 5x7 needed 13px each and ran off the bottom. Micro type
       fits the same nine stats in half the height, with the value kept at
       normal size so the number you actually came to read still stands out. */
    for (let i = 0; i < rows.length; i++) {
      const y = 22 + i * 12;
      if (i % 2 === 0) R.rectS(16, y - 2, C.W - 32, 12, 'rgba(28,26,43,0.35)');
      R.textSmall(rows[i][0], 20, y, MUTED);
      R.textRight(String(rows[i][1]), C.W - 20, y - 1, INK);
      if (rows[i][2]) R.textSmall(rows[i][2], 20, y + 6, '#514c72');
    }
  }

  function critOf(p) {
    const item = DS.Inv.weapon(p.inv);
    const base = item ? item.stats.crit : 0;
    return M.clamp(base + (p.stats.critBonus || 0), 0, 0.9);
  }

  function damageLine(g, p) {
    const item = DS.Inv.weapon(p.inv);
    if (!item) return '-';
    return Math.round(item.stats.damage * DS.Player.damageMult(g, p));
  }

  function armorLine(g) {
    const worn = g.inv.armor;
    const parts = [];
    A.SLOTS.forEach(function (slot) {
      if (worn[slot]) {
        parts.push(A.MATERIALS[worn[slot].material].label.toUpperCase() +
                   ' ' + worn[slot].stats.shield);
      }
    });
    return parts.length ? parts.join('  ') : 'NO ARMOUR WORN';
  }

  function weightLine(g) {
    const worn = g.inv.armor;
    const parts = [];
    A.SLOTS.forEach(function (slot) {
      if (worn[slot]) parts.push(worn[slot].stats.weight);
    });
    return parts.length ? parts.join(' + ') : '0';
  }

  function delta(v) { return (v >= 0 ? '+' : '') + v; }

  function drawRun(g, state) {
    const R = DS.R;

    R.textSmall('DEPTH', 20, 24, MUTED);
    R.textRight(String(g.depth) + ' / ' + C.FINAL_DEPTH, C.W - 20, 22, INK);
    R.textSmall('KILLS', 20, 36, MUTED);
    R.textRight(String(g.kills), C.W - 20, 34, INK);
    R.textSmall('BEST MOMENTUM', 20, 48, MUTED);
    R.textRight('x' + g.streakBest, C.W - 20, 46, INK);

    R.textSmall('FLOOR RULE', 20, 62, MUTED);
    if (g.modifier) {
      R.textSmall(g.modifier.name, C.W - 20 - R.textSmallWidth(g.modifier.name), 62, g.modifier.color);
    } else {
      R.textSmall('NONE', C.W - 20 - R.textSmallWidth('NONE'), 62, '#514c72');
    }

    R.textSmall('BOONS', 20, 74, MUTED);
    const boons = g.inv.boons || [];
    if (!boons.length) {
      R.textSmall('NONE TAKEN', 20, 82, '#514c72');
    } else {
      for (let i = 0; i < boons.length && i < 4; i++) {
        const boon = DS.Boons.BY_KEY[boons[i]];
        if (!boon) continue;
        R.textSmall(boon.name, 20, 82 + i * 7, boon.color);
        R.textSmall(boon.desc, C.W - 20 - R.textSmallWidth(boon.desc), 82 + i * 7, '#514c72');
      }
    }

    // Controls live here permanently now that the page no longer shows them.
    R.textSmall('CONTROLS', 20, C.H - 62, MUTED);
    R.hints([['A', ''], ['D', 'MOVE'], ['SPACE', 'JUMP x2'], ['SHIFT', 'DASH']],
            20, C.H - 52, '#514c72', '#3a3654');
    R.hints([['J', 'ATTACK'], ['E', 'SKILL'], ['X', 'ULT'], ['F', 'USE'], ['Q', 'SWAP']],
            20, C.H - 42, '#514c72', '#3a3654');

    for (let i = 0; i < ACTIONS.length; i++) {
      const selected = i === state.action;
      const r = actionRect(i);
      R.rectS(r.x, r.y, r.w, r.h, selected ? 'rgba(192,48,60,0.16)' : 'rgba(28,26,43,0.6)');
      R.frameS(r.x, r.y, r.w, r.h, selected ? RED : '#3a3654');
      let label = ACTIONS[i];
      if (i === 1) label = DS.Audio.isMuted() ? 'UNMUTE' : 'MUTE';
      R.textSmall(label, r.x + r.w / 2 - R.textSmallWidth(label) / 2, r.y + 4,
                  selected ? '#ffffff' : MUTED);
    }
  }

  DS.Profile = { open: open, close: close, update: update, draw: draw };
})(window.DS);
