/* HUD, item cards, the bag screen and the enchant table screen.
   Modal screens own their own input handling so the game scene only has to ask
   "is a modal open?" before running the world. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const M = DS.M;
  const W = DS.Weapons;
  const Inv = DS.Inv;

  const DIM = 'rgba(13,11,18,0.82)';
  const INK = '#d8d5e8';
  const MUTED = '#9b96b8';
  const GOLD = '#f2c14e';
  const CYAN = '#a8e4ff';
  const RED = '#c0303c';

  // Short element codes, so the weapon card never has to truncate mid-word.
  const ELEMENT_SHORT = {
    fire: 'FIRE', ice: 'ICE', lightning: 'BOLT', poison: 'TOXIN',
    water: 'WATER', earth: 'STONE', leaf: 'LEAF'
  };

  // --- HUD ------------------------------------------------------------------

  function hud(g) {
    const R = DS.R, S = DS.SPR;
    const p = g.player;
    if (!p) return;

    // Hearts
    for (let i = 0; i < p.stats.maxHp; i++) {
      const x = 4 + i * 9, y = 4;
      if (i < p.hp) R.sprS(S.heart, x, y);
      else R.rectS(x + 1, y + 1, 5, 4, '#3a3654');
    }

    // Shield sits directly under the hearts it protects.
    if (p.stats.shield > 0) {
      R.bar(4, 11, 54, 3, p.shield / p.stats.shield, '#a8e4ff', '#16324f');
    }

    R.bar(4, 15, 54, 4, p.stamina / p.stats.maxStamina, '#5cbf62', '#1c1a2b');
    // Mana is always shown now that every weapon spends it on skills.
    const held = Inv.weapon(p.inv);
    R.bar(4, 21, 54, 4, p.mana / p.stats.maxMana, '#4fb3e0', '#1c1a2b');
    drawMiniDash(p, 4, 27);
    if (held) drawSkills(p, held, 4, 34);

    // Currency
    R.sprS(S.coin, C.W - 46, 4);
    R.text(String(g.inv.coins), C.W - 38, 4, GOLD);
    R.sprS(S.shard, C.W - 46, 13);
    R.text(String(g.inv.shards), C.W - 38, 13, CYAN);
    if (g.inv.keys > 0) {
      R.sprS(S.key, C.W - 46, 22);
      R.text(String(g.inv.keys), C.W - 38, 22, GOLD);
    }

    // Depth
    const label = g.levelKind === 'safe' ? 'SAFE ROOM'
                : g.levelKind === 'boss' ? 'THRONE ROOM'
                : 'DEPTH ' + g.depth;
    R.textCenter(label, C.W / 2, 4, MUTED);

    drawMomentum(g);
    drawBoons(g);
    drawWeaponSlot(g, held);
    if (g.boss && !g.boss.dead) drawBossBar(g);
    drawToast(g);
    drawControls(g);
    if (g.prompt) R.hintsCenter([[g.prompt.key, g.prompt.text]], C.W / 2, C.H - 46, INK, CYAN);
  }

  /* The control sheet, drawn in the canvas instead of as HTML under it.
     It shows itself at the start of a run and fades out, because after a minute
     of play it is clutter — the full list stays in the profile and the menu. */
  /* Three short rows rather than two long ones — at 320px wide a row of more
     than about five hints runs off both edges. */
  const CONTROL_ROWS = [
    [['A', ''], ['D', 'MOVE'], ['SPACE', 'JUMP x2'], ['SHIFT', 'DASH'], ['RMB', 'MINI']],
    [['J', 'ATTACK'], ['E', 'SKILL'], ['X', 'ULT']],
    [['F', 'USE'], ['Q', 'SWAP'], ['TAB', 'BAG'], ['ESC', 'MENU']]
  ];

  function drawControls(g) {
    if (!g.controlsTimer || g.controlsTimer <= 0) return;
    g.controlsTimer--;

    const R = DS.R;
    const fade = Math.min(1, g.controlsTimer / 90);
    if (fade <= 0) return;

    /* A centred card rather than a bottom strip: the bottom of the screen is
       already the weapon card and the interaction prompt. */
    const h = 36, y = 96;
    R.rectS(0, y - 3, C.W, h, 'rgba(10,8,16,' + (0.78 * fade).toFixed(2) + ')');
    R.rectS(0, y - 4, C.W, 1, 'rgba(111,106,144,' + (0.8 * fade).toFixed(2) + ')');
    R.rectS(0, y + h - 4, C.W, 1, 'rgba(111,106,144,' + (0.8 * fade).toFixed(2) + ')');

    const strong = fade > 0.4;
    const ink = strong ? MUTED : '#3a3654';
    for (let i = 0; i < CONTROL_ROWS.length; i++) {
      R.hintsCenter(CONTROL_ROWS[i], C.W / 2, y + i * 10, ink, strong ? CYAN : '#2a2740');
    }
  }

  /* Right-click dash charges as pips, with the shared recharge draining across
     the empty ones so the wait is legible without a number. */
  function drawMiniDash(p, x, y) {
    const R = DS.R;
    const max = DS.Player.MINI_CHARGES;
    const refill = 1 - DS.M.clamp(p.miniTimer / DS.Player.MINI_RECHARGE, 0, 1);

    for (let i = 0; i < max; i++) {
      const px = x + i * 9;
      R.rectS(px, y, 7, 4, '#1c1a2b');
      if (i < p.miniLeft) {
        R.rectS(px + 1, y + 1, 5, 2, '#a3e86b');
      } else if (p.miniLeft < max) {
        R.rectS(px + 1, y + 1, Math.max(0, Math.round(5 * refill)), 2, '#3d6b3f');
      }
    }
  }

  /* Skill and ultimate readouts. The key is drawn as the same pixel button the
     rest of the game uses, and it dims or greys to show why a skill is not
     available — cooling down, or short on mana. */
  function drawSkills(p, item, x, y) {
    const R = DS.R;
    const S = DS.Skills;
    const names = S.names(item);
    const rarityColor = W.rarityColor(item.rarity);
    const discount = 1 - (p.stats.skillDiscount || 0);

    const rows = [
      { key: 'E', name: names.skill, cd: p.skillCooldown, max: S.SKILL_COOLDOWN, cost: S.SKILL_COST },
      { key: 'X', name: names.ult,   cd: p.ultCooldown,   max: S.ULT_COOLDOWN,   cost: S.ULT_COST }
    ];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ry = y + i * 9;
      const cooling = row.cd > 0;
      const poor = p.mana < Math.round(row.cost * discount);
      const accent = cooling ? '#3a3654' : poor ? '#2f6fa8' : rarityColor;

      const capW = R.keycap(row.key, x, ry, accent);
      const tx = x + capW + 3;

      if (cooling) {
        // The name is replaced by the wait, with a bar draining underneath.
        R.textSmall(Math.ceil(row.cd / 60) + 'S', tx, ry + 1, '#6f6a90');
        R.rectS(tx, ry + 7, 44, 1, '#1c1a2b');
        R.rectS(tx, ry + 7, Math.round(44 * (1 - row.cd / row.max)), 1, '#514c72');
      } else {
        R.textSmall(row.name, tx, ry + 1, poor ? '#3a3654' : rarityColor);
      }
    }
  }

  // Boons taken this run, as coloured initials down the right edge.
  function drawBoons(g) {
    const list = g.inv.boons || [];
    if (!list.length) return;
    const R = DS.R;

    for (let i = 0; i < list.length; i++) {
      const boon = DS.Boons.BY_KEY[list[i]];
      if (!boon) continue;
      const y = 34 + i * 9;
      R.rectS(C.W - 12, y, 8, 8, 'rgba(13,11,18,0.7)');
      R.frameS(C.W - 12, y, 8, 8, boon.color);
      R.text(boon.name[0], C.W - 10, y + 1, boon.color);
    }
  }

  /* The weapon card, bottom left. Rather than a bare icon and a number it now
     reads as a card: a rarity-coloured rail down the side, the weapon's own
     art, its name, its damage, and the ammunition or element it runs on. The
     off-hand hangs beside it under its swap key. */
  function drawWeaponSlot(g, item) {
    const R = DS.R, S = DS.SPR;
    if (!item) return;

    const w = 66, h = 22;
    const x = 4, y = C.H - h - 3;
    const color = W.rarityColor(item.rarity);
    const base = W.WEAPONS[item.type];

    R.panelS(x, y, w, h, 'rgba(10,8,16,0.82)', color);
    R.rectS(x + 1, y + 1, 2, h - 2, color);          // rarity rail

    R.sprS(S.iconFor(item.type, item.rarity), x + 4, y + 5);

    // Name, trimmed to the card rather than overflowing it.
    const tx = x + 18;
    const room = Math.floor((w - 21) / 4);
    const name = item.name.length > room ? item.name.slice(0, room - 1) + '.' : item.name;
    R.textSmall(name, tx, y + 3, color);

    // One string, so the label and the number can never collide.
    R.textSmall('DMG ' + item.stats.damage, tx, y + 10, INK);

    if (base.key === 'bow') {
      R.textSmall('ARROWS ' + g.inv.arrows, tx, y + 16, g.inv.arrows > 0 ? MUTED : RED);
    } else if (item.element) {
      const el = W.ELEMENTS[item.element];
      R.rectS(tx, y + 16, 4, 4, el.color);
      R.textSmall(ELEMENT_SHORT[item.element] || el.label, tx + 6, y + 16, el.color);
    } else {
      R.textSmall(W.rarityLabel(item.rarity), tx, y + 16, MUTED);
    }

    const other = Inv.offhand(g.inv);
    if (other) {
      const ox = x + w + 3;
      const oc = W.rarityColor(other.rarity);
      R.panelS(ox, y + 6, 16, 16, 'rgba(10,8,16,0.7)', oc);
      R.sprS(S.iconFor(other.type, other.rarity), ox + 2, y + 8);
      R.keycap('Q', ox, y - 2, oc);
    } else if (g.inv.bag.length) {
      R.keycap('TAB', x + w + 3, y + 8, MUTED);
    }
  }

  function drawBossBar(g) {
    const R = DS.R;
    const b = g.boss;
    const w = 180, x = (C.W - w) / 2, y = C.H - 14;
    R.textCenter('SLIME KING', C.W / 2, y - 9, '#c86ee0');
    R.bar(x, y, w, 6, b.hp / b.maxHp, '#c86ee0', '#1c1a2b');
  }

  function drawToast(g) {
    if (!g.toastTimer || g.toastTimer <= 0) return;
    const R = DS.R;
    const alpha = Math.min(1, g.toastTimer / 20);
    const y = 40 - (1 - alpha) * 4;
    R.textCenter(g.toastText, C.W / 2, y, g.toastColor || INK);
  }

  // --- item card ------------------------------------------------------------

  function cardHeight(item) {
    return 30 + item.affixes.length * 7;
  }

  function itemCard(item, x, y, w, compareTo) {
    if (DS.Armor.isArmor(item)) return armorCard(item, x, y, w);

    const R = DS.R;
    const color = W.rarityColor(item.rarity);
    const base = W.WEAPONS[item.type];
    const h = cardHeight(item);

    R.panelS(x, y, w, h, 'rgba(13,11,18,0.94)', color);
    R.text(item.name, x + 4, y + 4, color);
    R.text(W.rarityLabel(item.rarity) + ' ' + base.label, x + 4, y + 12, MUTED);

    // Damage, and the delta against whatever is currently held.
    const dmg = item.stats.damage;
    R.text('DMG ' + dmg, x + 4, y + 20, INK);
    if (compareTo && compareTo !== item) {
      const diff = dmg - compareTo.stats.damage;
      if (diff !== 0) {
        R.text((diff > 0 ? '+' : '') + diff, x + 40, y + 20, diff > 0 ? '#5cbf62' : RED);
      }
    }

    const spd = (60 / item.stats.cooldown).toFixed(1);
    R.text(spd + '/S', x + 58, y + 20, INK);
    R.text(Math.round(item.stats.crit * 100) + '% CRIT', x + 92, y + 20, INK);

    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      R.text(a.desc, x + 4, y + 28 + i * 7, a.color);
    }

    return h;
  }

  function armorCard(item, x, y, w) {
    const R = DS.R;
    const color = W.rarityColor(item.rarity);
    const mat = DS.Armor.MATERIALS[item.material];
    const h = cardHeight(item);

    R.panelS(x, y, w, h, 'rgba(13,11,18,0.94)', color);
    R.text(item.name, x + 4, y + 4, color);
    R.text(W.rarityLabel(item.rarity) + ' ARMOUR', x + 4, y + 12, MUTED);
    R.text('SHIELD ' + item.stats.shield, x + 4, y + 20, CYAN);
    R.text('WEIGHT ' + item.stats.weight, x + 58, y + 20, item.stats.weight > 2 ? RED : INK);
    R.rectS(x + w - 12, y + 4, 8, 8, mat.mid);
    R.frameS(x + w - 12, y + 4, 8, 8, mat.dark);

    for (let i = 0; i < item.affixes.length; i++) {
      R.text(item.affixes[i].desc, x + 4, y + 28 + i * 7, item.affixes[i].color);
    }
    return h;
  }

  // --- modal helpers --------------------------------------------------------

  function openBag(g) {
    g.modal = { kind: 'bag', cursor: 0 };
    DS.Audio.play('menuPick');
  }

  function openEnchant(g) {
    g.modal = { kind: 'enchant', cursor: 0, action: 0, picking: true };
    DS.Audio.play('menuPick');
  }

  function openShrine(g) {
    const shrine = g.shrine;
    if (!shrine.offers) shrine.offers = DS.Boons.offer(g.rng, g.inv.boons);
    if (!shrine.offers.length) {
      DS.Audio.play('error');
      g.toast('THE SHRINE IS SPENT', MUTED);
      shrine.used = true;
      return;
    }
    g.modal = { kind: 'shrine', cursor: 0 };
    DS.Audio.play('enchant');
  }

  function updateShrine(g) {
    const In = DS.Input;
    const state = g.modal;
    const offers = g.shrine.offers;

    if (In.justPressed('back')) {
      In.consume('back');
      closeModal(g);
      return;
    }
    if (In.justPressed('up')) moveCursor(state, -1, offers.length);
    if (In.justPressed('down')) moveCursor(state, 1, offers.length);
    state.cursor = M.clamp(state.cursor, 0, offers.length - 1);

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');

    const boon = offers[state.cursor];
    g.inv.boons.push(boon.key);
    g.shrine.used = true;
    g.player.refreshStats();
    // Losing a max heart to Bloodthirst should never be what kills you.
    g.player.hp = M.clamp(g.player.hp, 1, g.player.stats.maxHp);

    DS.Audio.play('upgrade');
    DS.R.flash(boon.color, 10);
    DS.FX.ring(DS.Ent.centerX(g.player), DS.Ent.centerY(g.player), 18, boon.color, 2.4);
    g.showBanner(boon.name, boon.desc, boon.color);
    closeModal(g);
  }

  function drawShrine(g) {
    const R = DS.R;
    const state = g.modal;
    const offers = g.shrine.offers;

    R.fade(0.84);
    R.textCenter('THE SHRINE OFFERS', C.W / 2, 12, '#a8e4ff');
    R.textCenter('TAKE ONE', C.W / 2, 22, MUTED);

    for (let i = 0; i < offers.length; i++) {
      const boon = offers[i];
      const y = 38 + i * 34;
      const selected = i === state.cursor;

      R.panelS(24, y, C.W - 48, 28, selected ? 'rgba(28,26,43,0.96)' : 'rgba(13,11,18,0.9)',
               selected ? boon.color : '#3a3654');
      R.text(boon.name, 32, y + 6, boon.color);
      R.text(boon.desc, 32, y + 16, selected ? INK : MUTED);
      if (selected) R.text('>', 26, y + 6, '#ffffff');
    }

    R.hintsCenter([['ENTER', 'TAKE'], ['ESC', 'WALK AWAY']], C.W / 2, C.H - 11, MUTED, CYAN);
  }

  /* Full-width title card used for floors, biomes and boon pickups. */
  function drawBanner(g) {
    if (!g.bannerTimer || g.bannerTimer <= 0 || !g.banner) return;
    const R = DS.R;
    const t = g.bannerTimer;

    // Slide in, hold, slide out.
    const enter = M.clamp((130 - t) / 14, 0, 1);
    const exit = M.clamp(t / 18, 0, 1);
    const alpha = Math.min(enter, exit);
    const slide = (1 - enter) * 20;

    const y = 52;
    R.rectS(0, y - 2, C.W, 26, 'rgba(13,11,18,' + (0.72 * alpha).toFixed(2) + ')');
    R.rectS(0, y - 3, C.W, 1, g.banner.color);
    R.rectS(0, y + 24, C.W, 1, g.banner.color);
    R.textCenter(g.banner.title, C.W / 2 + slide, y + 2, g.banner.color, 2);
    if (g.banner.subtitle) {
      R.textCenter(g.banner.subtitle, C.W / 2 - slide, y + 16, MUTED);
    }
  }

  /* Momentum meter — only appears once a streak is actually going. */
  function drawMomentum(g) {
    if (g.streak < 2) return;
    const R = DS.R;
    const tier = DS.Boons.tier(g.streak);
    const pct = g.streakTimer / DS.Boons.DECAY_FRAMES;
    const bonus = Math.round(DS.Boons.bonus(g) * 100);

    const x = C.W / 2 - 30, y = 16;
    R.textCenter('x' + g.streak + (tier.label ? '  ' + tier.label : ''),
                 C.W / 2, y, tier.color);
    R.rectS(x, y + 9, 60, 2, '#1c1a2b');
    R.rectS(x, y + 9, Math.round(60 * pct), 2, tier.color);
    if (bonus > 0) R.textRight('+' + bonus + '%', x + 60, y + 13, tier.color);
  }

  function openShop(g) {
    if (!g.shopStock) g.shopStock = DS.Shop.makeStock(g.rng, g.depth);
    g.modal = { kind: 'shop', cursor: 0 };
    DS.Audio.play('menuPick');
  }

  function closeModal(g) {
    g.modal = null;
    DS.Audio.play('menuMove');
  }

  // Everything the player owns, as a flat addressable list.
  function ownedList(inv) {
    const out = [];
    for (let i = 0; i < inv.equipped.length; i++) {
      if (inv.equipped[i]) out.push({ item: inv.equipped[i], source: 'slot', index: i });
    }
    for (let i = 0; i < inv.bag.length; i++) {
      out.push({ item: inv.bag[i], source: 'bag', index: i });
    }
    return out;
  }

  function moveCursor(state, delta, length) {
    if (!length) return;
    state.cursor = (state.cursor + delta + length) % length;
    DS.Audio.play('menuMove');
  }

  // --- bag screen -----------------------------------------------------------

  function updateBag(g) {
    const In = DS.Input;
    const state = g.modal;
    const list = ownedList(g.inv);

    if (In.justPressed('bag') || In.justPressed('back')) {
      In.consume('bag'); In.consume('back');
      closeModal(g);
      return;
    }

    if (In.justPressed('left')) moveCursor(state, -1, list.length);
    if (In.justPressed('right')) moveCursor(state, 1, list.length);
    if (In.justPressed('up')) moveCursor(state, -4, list.length);
    if (In.justPressed('down')) moveCursor(state, 4, list.length);

    state.cursor = M.clamp(state.cursor, 0, Math.max(0, list.length - 1));
    const entry = list[state.cursor];
    if (!entry) return;

    if (In.justPressed('confirm')) {
      In.consume('confirm');
      if (entry.source === 'bag') {
        Inv.equipFromBag(g.inv, entry.index);
        g.player.refreshStats();
        DS.Audio.play('menuPick');
        g.toast('EQUIPPED ' + entry.item.name, W.rarityColor(entry.item.rarity));
      } else {
        if (Inv.swapActive(g.inv)) {
          g.player.refreshStats();
          DS.Audio.play('menuPick');
        }
      }
    }

    if (In.justPressed('interact') && entry.source === 'bag') {
      In.consume('interact');
      const dropped = Inv.dropFromBag(g.inv, entry.index);
      if (dropped) {
        DS.Ent.addPickup(g, DS.Ent.centerX(g.player), g.player.y, 'item', dropped, 1);
        DS.Audio.play('pickup');
      }
    }
  }

  function drawBag(g) {
    const R = DS.R, S = DS.SPR;
    const state = g.modal;
    const list = ownedList(g.inv);

    R.fade(0.75);
    R.textCenter('INVENTORY', C.W / 2, 8, INK);

    const cols = 4, cellW = 22, cellH = 22;
    const gridW = cols * cellW;
    const gx = (C.W - gridW) / 2, gy = 22;

    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const cx = gx + (i % cols) * cellW;
      const cy = gy + Math.floor(i / cols) * cellH;
      const color = W.rarityColor(entry.item.rarity);

      R.panelS(cx, cy, cellW - 2, cellH - 2, 'rgba(28,26,43,0.9)', color);
      if (DS.Armor.isArmor(entry.item)) {
        const mat = DS.Armor.MATERIALS[entry.item.material];
        R.rectS(cx + 6, cy + 6, 8, 8, mat.mid);
        R.frameS(cx + 6, cy + 6, 8, 8, mat.dark);
      } else {
        R.sprS(S.iconFor(entry.item.type, entry.item.rarity), cx + 4, cy + 4);
      }

      if (entry.source === 'slot') {
        R.text(entry.index === g.inv.active ? 'A' : 'B', cx + 1, cy + 1,
               entry.index === g.inv.active ? GOLD : MUTED);
      }
      if (i === state.cursor) R.frameS(cx - 1, cy - 1, cellW, cellH, '#ffffff');
    }

    const entry = list[state.cursor];
    if (entry) {
      const cardY = gy + Math.ceil(list.length / cols) * cellH + 4;
      itemCard(entry.item, 20, Math.min(cardY, C.H - cardHeight(entry.item) - 12),
               C.W - 40, Inv.weapon(g.inv));
    }

    R.hintsCenter([['ENTER', 'EQUIP'], ['F', 'DROP'], ['TAB', 'CLOSE']], C.W / 2, C.H - 11, MUTED, CYAN);
  }

  // --- enchant screen -------------------------------------------------------

  const ACTIONS = ['REROLL', 'ADD AFFIX', 'UPGRADE', 'SALVAGE'];

  function actionCost(inv, item, index) {
    if (index === 0) return Inv.rerollCost(item);
    if (index === 1) return Inv.addAffixCost(item);
    if (index === 2) return Inv.upgradeCost(item);
    return { coins: 0, shards: 0 };
  }

  function updateEnchant(g) {
    const In = DS.Input;
    const state = g.modal;
    const list = ownedList(g.inv);

    if (In.justPressed('back') || In.justPressed('bag')) {
      In.consume('back'); In.consume('bag');
      if (!state.picking) { state.picking = true; DS.Audio.play('menuMove'); }
      else closeModal(g);
      return;
    }

    if (state.picking) {
      if (In.justPressed('left')) moveCursor(state, -1, list.length);
      if (In.justPressed('right')) moveCursor(state, 1, list.length);
      state.cursor = M.clamp(state.cursor, 0, Math.max(0, list.length - 1));
      if (In.justPressed('confirm') && list.length) {
        In.consume('confirm');
        state.picking = false;
        state.action = 0;
        DS.Audio.play('menuPick');
      }
      return;
    }

    if (In.justPressed('up')) { state.action = (state.action + 3) % 4; DS.Audio.play('menuMove'); }
    if (In.justPressed('down')) { state.action = (state.action + 1) % 4; DS.Audio.play('menuMove'); }

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');

    const entry = list[state.cursor];
    if (!entry) return;
    applyEnchant(g, entry, state);
  }

  function applyEnchant(g, entry, state) {
    const item = entry.item;
    let result;

    if (state.action === 0) result = Inv.reroll(g.inv, item, g.rng);
    else if (state.action === 1) result = Inv.addAffix(g.inv, item, g.rng);
    else if (state.action === 2) result = Inv.upgradeRarity(g.inv, item);
    else result = Inv.salvage(g.inv, item, entry.source, entry.index);

    if (!result.ok) {
      DS.Audio.play('error');
      g.toast(result.reason, RED);
      return;
    }

    if (state.action === 3) {
      DS.Audio.play('salvage');
      g.toast('+' + result.shards + ' SHARDS', CYAN);
      state.picking = true;
      state.cursor = 0;
    } else if (state.action === 2) {
      DS.Audio.play('upgrade');
      g.toast(W.rarityLabel(item.rarity) + '!', W.rarityColor(item.rarity));
    } else {
      DS.Audio.play('enchant');
      g.toast(item.name, W.rarityColor(item.rarity));
    }

    DS.FX.ring(DS.Ent.centerX(g.player), DS.Ent.centerY(g.player), 12, '#c86ee0', 1.6);
    g.player.refreshStats();
  }

  function drawEnchant(g) {
    const R = DS.R, S = DS.SPR;
    const state = g.modal;
    const list = ownedList(g.inv);

    R.fade(0.8);
    R.textCenter('ENCHANT TABLE', C.W / 2, 6, '#c86ee0');
    R.textCenter(g.inv.coins + ' COINS   ' + g.inv.shards + ' SHARDS', C.W / 2, 15, MUTED);

    // Item strip
    const cellW = 20;
    const startX = (C.W - list.length * cellW) / 2;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const cx = startX + i * cellW, cy = 26;
      const color = W.rarityColor(entry.item.rarity);
      R.panelS(cx, cy, cellW - 2, 20, 'rgba(28,26,43,0.9)', color);
      if (DS.Armor.isArmor(entry.item)) {
        const mat2 = DS.Armor.MATERIALS[entry.item.material];
        R.rectS(cx + 5, cy + 5, 8, 8, mat2.mid);
        R.frameS(cx + 5, cy + 5, 8, 8, mat2.dark);
      } else {
        R.sprS(S.iconFor(entry.item.type, entry.item.rarity), cx + 3, cy + 3);
      }
      if (i === state.cursor) {
        R.frameS(cx - 1, cy - 1, cellW, 22, state.picking ? '#ffffff' : '#c86ee0');
      }
    }

    const entry = list[state.cursor];
    if (!entry) {
      R.textCenter('NOTHING TO ENCHANT', C.W / 2, 70, MUTED);
      return;
    }

    itemCard(entry.item, 12, 50, C.W - 24, Inv.weapon(g.inv));

    if (state.picking) {
      R.hintsCenter([['ENTER', 'SELECT'], ['ESC', 'LEAVE']], C.W / 2, C.H - 11, MUTED, CYAN);
      return;
    }

    // Action list
    const ay = 50 + cardHeight(entry.item) + 4;
    for (let i = 0; i < ACTIONS.length; i++) {
      const cost = actionCost(g.inv, entry.item, i);
      const affordable = i === 3 || Inv.canAfford(g.inv, cost);
      const selected = i === state.action;
      const y = ay + i * 9;

      R.text((selected ? '> ' : '  ') + ACTIONS[i], 16, y, selected ? '#ffffff' : MUTED);

      const label = i === 3
        ? '+' + Inv.salvageValue(entry.item) + ' SHARDS'
        : cost.coins + 'C ' + (cost.shards ? cost.shards + 'S' : '');
      R.textRight(label, C.W - 16, y, affordable ? GOLD : RED);
    }

    R.hintsCenter([['ENTER', 'CONFIRM'], ['ESC', 'BACK']], C.W / 2, C.H - 11, MUTED, CYAN);
  }

  // --- shop -----------------------------------------------------------------

  function updateShop(g) {
    const In = DS.Input;
    const state = g.modal;
    const stock = g.shopStock;

    if (In.justPressed('back') || In.justPressed('bag')) {
      In.consume('back'); In.consume('bag');
      closeModal(g);
      return;
    }

    if (In.justPressed('up')) moveCursor(state, -1, stock.length);
    if (In.justPressed('down')) moveCursor(state, 1, stock.length);
    state.cursor = M.clamp(state.cursor, 0, stock.length - 1);

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');

    const result = DS.Shop.buy(g, stock[state.cursor]);
    if (!result.ok) {
      DS.Audio.play('error');
      g.toast(result.reason, RED);
      return;
    }

    DS.Audio.play('coin');
    g.toast('BOUGHT ' + stock[state.cursor].label, GOLD);
    DS.FX.ring(DS.Ent.centerX(g.player), DS.Ent.centerY(g.player), 10, '#f2c14e', 1.4);
  }

  function drawShop(g) {
    const R = DS.R;
    const state = g.modal;
    const stock = g.shopStock;

    R.fade(0.8);
    R.textCenter('MERCHANT', C.W / 2, 8, GOLD);
    R.textCenter(g.inv.coins + ' COINS   ' + g.inv.shards + ' SHARDS', C.W / 2, 18, MUTED);

    const top = 32;
    R.panelS(18, top - 4, C.W - 36, stock.length * 11 + 10);

    for (let i = 0; i < stock.length; i++) {
      const entry = stock[i];
      const y = top + i * 11;
      const selected = i === state.cursor;
      const affordable = !entry.sold && g.inv.coins >= entry.coins;

      const color = entry.sold ? '#514c72' : selected ? '#ffffff' : INK;
      R.text((selected ? '>' : ' ') + entry.label, 24, y, color);
      R.textRight(entry.sold ? 'SOLD' : entry.coins + 'C', C.W - 24, y,
                  entry.sold ? '#514c72' : affordable ? GOLD : RED);
    }

    const entry = stock[state.cursor];
    if (entry) {
      const infoY = top + stock.length * 11 + 8;
      R.textCenter(entry.desc, C.W / 2, infoY, CYAN);
      if (entry.kind === 'item') {
        itemCard(entry.item, 16, infoY + 10, C.W - 32, Inv.weapon(g.inv));
      }
    }

    R.hintsCenter([['ENTER', 'BUY'], ['ESC', 'LEAVE']], C.W / 2, C.H - 11, MUTED, GOLD);
  }

  // --- dispatch -------------------------------------------------------------

  function updateModal(g) {
    if (!g.modal) return false;
    if (g.modal.kind === 'bag') updateBag(g);
    else if (g.modal.kind === 'enchant') updateEnchant(g);
    else if (g.modal.kind === 'shop') updateShop(g);
    else if (g.modal.kind === 'shrine') updateShrine(g);
    return true;
  }

  function drawModal(g) {
    if (!g.modal) return;
    if (g.modal.kind === 'bag') drawBag(g);
    else if (g.modal.kind === 'enchant') drawEnchant(g);
    else if (g.modal.kind === 'shop') drawShop(g);
    else if (g.modal.kind === 'shrine') drawShrine(g);
  }

  DS.UI = {
    hud: hud,
    itemCard: itemCard,
    cardHeight: cardHeight,
    openBag: openBag,
    openEnchant: openEnchant,
    openShop: openShop,
    openShrine: openShrine,
    drawBanner: drawBanner,
    closeModal: closeModal,
    updateModal: updateModal,
    drawModal: drawModal,
    ownedList: ownedList,
    COLORS: { INK: INK, MUTED: MUTED, GOLD: GOLD, CYAN: CYAN, RED: RED, DIM: DIM }
  };
})(window.DS);
