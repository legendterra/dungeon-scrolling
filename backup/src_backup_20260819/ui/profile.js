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
    const state = g.profile;

    if (In.justPressed('pause') || In.justPressed('back')) {
      In.consume('pause'); In.consume('back');
      close(g);
      return;
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
    const slots = slotList(g);
    if (In.justPressed('down')) { state.cursor = (state.cursor + 1) % slots.length; DS.Audio.play('menuMove'); }
    if (In.justPressed('up')) { state.cursor = (state.cursor + slots.length - 1) % slots.length; DS.Audio.play('menuMove'); }

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');

    // ENTER on a weapon slot swaps hands; the bag handles everything else.
    const entry = slots[state.cursor];
    if (entry.key === 'weaponA' || entry.key === 'weaponB') {
      if (DS.Inv.swapActive(g.inv)) {
        g.player.refreshStats();
        DS.Audio.play('menuPick');
      } else DS.Audio.play('error');
    } else {
      close(g);
      DS.UI.openBag(g);
    }
  }

  function updateRun(g, state, In) {
    if (In.justPressed('down')) { state.action = (state.action + 1) % ACTIONS.length; DS.Audio.play('menuMove'); }
    if (In.justPressed('up')) { state.action = (state.action + ACTIONS.length - 1) % ACTIONS.length; DS.Audio.play('menuMove'); }

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');
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

    for (let i = 0; i < TABS.length; i++) {
      const x = 24 + i * 92;
      const on = i === state.tab;
      R.rectS(x, 6, 88, 12, on ? 'rgba(79,179,224,0.16)' : 'rgba(28,26,43,0.6)');
      R.frameS(x, 6, 88, 12, on ? CYAN : '#3a3654');
      R.textCenter(TABS[i], x + 44, 9, on ? '#ffffff' : MUTED);
    }

    if (state.tab === 0) drawCharacter(g, state);
    else if (state.tab === 1) drawStats(g);
    else drawRun(g, state);

    R.hintsCenter([['Q', ''], ['E', 'TABS'], ['ESC', 'CLOSE']], C.W / 2, C.H - 9, MUTED, CYAN);
  }

  function drawCharacter(g, state) {
    const R = DS.R;
    const p = g.player;
    const doll = p.doll || DS.Paperdoll.bare();

    // Paper doll, 4x, breathing on the idle cycle.
    const frame = doll.idle[Math.floor(g.frames / 40) % doll.idle.length];
    const big = DS.Art.scaled(frame, 4);
    R.panelS(20, 26, 56, 76, 'rgba(28,26,43,0.7)', '#3a3654');
    R.sprS(big, 20 + (56 - big.width) / 2, 30);

    const set = p.stats.setBonus;
    if (set) {
      R.textCenter('SET', 48, 104, GOLD);
    }

    const slots = slotList(g);
    for (let i = 0; i < slots.length; i++) {
      const entry = slots[i];
      const y = 26 + i * 16;
      const selected = i === state.cursor;
      const color = entry.item ? W.rarityColor(entry.item.rarity) : '#3a3654';

      R.panelS(84, y, C.W - 104, 14, selected ? 'rgba(28,26,43,0.95)' : 'rgba(13,11,18,0.8)',
               selected ? color : '#2a2740');
      R.text(entry.label, 88, y + 4, MUTED);

      if (entry.item) {
        if (entry.item.kind === 'armor') {
          R.rectS(112, y + 3, 8, 8, A.MATERIALS[entry.item.material].mid);
          R.frameS(112, y + 3, 8, 8, A.MATERIALS[entry.item.material].dark);
        } else {
          R.sprS(DS.SPR.iconFor(entry.item.type, entry.item.rarity), 110, y + 1);
        }
        R.text(entry.item.name, 124, y + 4, color);
      } else {
        R.text('EMPTY', 124, y + 4, '#3a3654');
      }
    }

    if (set) R.textCenter(set.desc, C.W / 2, 110, GOLD);
    R.hintsCenter([['ENTER', 'SWAP / BAG']], C.W / 2, C.H - 22, MUTED, GOLD);
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

    for (let i = 0; i < rows.length; i++) {
      const y = 26 + i * 13;
      R.text(rows[i][0], 20, y, MUTED);
      R.textRight(String(rows[i][1]), C.W - 20, y, INK);
      if (rows[i][2]) R.text(rows[i][2], 20, y + 6, '#514c72');
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

    R.text('DEPTH', 20, 26, MUTED);
    R.textRight(String(g.depth) + ' / ' + C.FINAL_DEPTH, C.W - 20, 26, INK);
    R.text('KILLS', 20, 38, MUTED);
    R.textRight(String(g.kills), C.W - 20, 38, INK);
    R.text('BEST MOMENTUM', 20, 50, MUTED);
    R.textRight('x' + g.streakBest, C.W - 20, 50, INK);

    R.text('FLOOR RULE', 20, 66, MUTED);
    if (g.modifier) {
      R.textRight(g.modifier.name, C.W - 20, 66, g.modifier.color);
    } else {
      R.textRight('NONE', C.W - 20, 66, '#514c72');
    }

    R.text('BOONS', 20, 80, MUTED);
    const boons = g.inv.boons || [];
    if (!boons.length) {
      R.text('NONE TAKEN', 20, 88, '#514c72');
    } else {
      for (let i = 0; i < boons.length && i < 4; i++) {
        const boon = DS.Boons.BY_KEY[boons[i]];
        if (!boon) continue;
        R.text(boon.name, 20, 88 + i * 8, boon.color);
        R.textRight(boon.desc, C.W - 20, 88 + i * 8, '#514c72');
      }
    }

    // Controls live here permanently now that the page no longer shows them.
    R.text('CONTROLS', 20, C.H - 62, MUTED);
    R.hints([['A', ''], ['D', 'MOVE'], ['SPACE', 'JUMP x2'], ['SHIFT', 'DASH']],
            20, C.H - 52, '#514c72', '#3a3654');
    R.hints([['J', 'ATTACK'], ['E', 'SKILL'], ['X', 'ULT'], ['F', 'USE'], ['Q', 'SWAP']],
            20, C.H - 42, '#514c72', '#3a3654');

    for (let i = 0; i < ACTIONS.length; i++) {
      const selected = i === state.action;
      const x = 24 + i * 92;
      R.rectS(x, C.H - 32, 88, 12, selected ? 'rgba(192,48,60,0.16)' : 'rgba(28,26,43,0.6)');
      R.frameS(x, C.H - 32, 88, 12, selected ? RED : '#3a3654');
      let label = ACTIONS[i];
      if (i === 1) label = DS.Audio.isMuted() ? 'UNMUTE' : 'MUTE';
      R.textCenter(label, x + 44, C.H - 29, selected ? '#ffffff' : MUTED);
    }
  }

  DS.Profile = { open: open, close: close, update: update, draw: draw };
})(window.DS);
