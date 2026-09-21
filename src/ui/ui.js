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

    /* Hearts. Boons can push the maximum well past the starting six, so the
       row wraps rather than running off the screen edge, and everything below
       it shifts down by however many rows the wrap actually used. */
    const PER_ROW = 12;
    const rows = Math.max(1, Math.ceil(p.stats.maxHp / PER_ROW));
    const heartPulse = Math.floor(g.frames / 60) % 2 === 0
                       ? Math.sin((g.frames % 60) / 60 * Math.PI) * 1 : 0;
    for (let i = 0; i < p.stats.maxHp; i++) {
      const x = 4 + (i % PER_ROW) * 9;
      const y = 4 + Math.floor(i / PER_ROW) * 8;
      if (i < p.hp) {
        // Last full heart pulses gently
        const pulse = (i === Math.floor(p.hp) - 1) ? heartPulse : 0;
        if (pulse > 0.3 && R.sprScaled) {
          const sc = 1 + pulse * 0.18;
          R.sprScaled(S.heart, x + 3, y + 3, sc, sc, false, 3, 3);
        } else {
          R.sprS(S.heart, x, y);
        }
      } else {
        R.rectS(x + 1, y + 1, 5, 4, '#3a3654');
      }
    }

    let barY = 11 + (rows - 1) * 8;

    // Shield sits directly under the hearts it protects.
    if (p.stats.shield > 0) {
      R.bar(4, barY, 54, 3, p.shield / p.stats.shield, '#a8e4ff', '#16324f');
    }
    barY += 4;

    R.bar(4, barY, 54, 4, p.stamina / p.stats.maxStamina, '#5cbf62', '#1c1a2b');
    // Mana is always shown now that every weapon spends it on skills.
    const held = Inv.weapon(p.inv);
    R.bar(4, barY + 6, 54, 4, p.mana / p.stats.maxMana, '#4fb3e0', '#1c1a2b');
    drawMiniDash(p, 4, barY + 12);
    if (held) drawSkills(g, p, held, 4, barY + 19);

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
                : g.levelKind === 'trial' ? 'THE TRIAL'
                : 'DEPTH ' + g.depth;
    R.textCenter(label, C.W / 2, 4, MUTED);

    drawBreath(g, p);
    drawMomentum(g);
    drawBoons(g);
    drawWeaponSlot(g, held);
    if (g.boss && !g.boss.dead) drawBossBar(g);
    drawToast(g);
    drawControls(g);
    // A modal owns the screen; the world's interaction hint underneath it is
    // just text bleeding through a panel.
    if (g.prompt && !g.modal && !g.paused) {
      R.hintsCenter([[g.prompt.key, g.prompt.text]], C.W / 2, C.H - 46, INK, CYAN);
    }
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

  /* Right-click dash charges as glowing circles (more candy than rectangles). */
  function drawMiniDash(p, x, y) {
    const R = DS.R;
    const max = DS.Player.MINI_CHARGES;
    const refill = 1 - DS.M.clamp(p.miniTimer / DS.Player.MINI_RECHARGE, 0, 1);

    for (let i = 0; i < max; i++) {
      const cx = x + 3 + i * 10;
      const cy = y + 3;
      // Dark background circle
      R.rectS(cx - 3, cy - 3, 6, 6, '#1c1a2b');
      if (i < p.miniLeft) {
        // Fully charged: bright green circle
        R.rectS(cx - 2, cy - 2, 4, 4, '#a3e86b');
        R.rectS(cx - 1, cy - 1, 2, 2, '#d4ffa0');
      } else if (p.miniLeft < max) {
        // Recharging: partial fill arc-ish with a narrow strip
        const fill = Math.max(0, Math.round(4 * refill));
        if (fill > 0) R.rectS(cx - 2, cy + 2 - fill, 4, fill, '#3d6b3f');
      }
    }
  }

  /* Skill and ultimate readouts. The key is drawn as the same pixel button the
     rest of the game uses, and it dims or greys to show why a skill is not
     available — cooling down, or short on mana. */
  /* Skill slots. Two 16x16 tiles with the skill's own icon, a keycap badge on
     the corner and the cooldown drawn as a shutter wiping down over the art.
     The old version printed the skill's name in 3px type next to a key, which
     at this resolution was an unreadable smear that told you nothing. */
  function drawSkills(g, p, item, x, y) {
    const R = DS.R, S = DS.Skills, SPR = DS.SPR;
    const names = S.names(item);
    const rarityColor = W.rarityColor(item.rarity);
    const discount = 1 - (p.stats.skillDiscount || 0);

    const rows = [
      { key: 'E', which: 'skill', name: names.skill,
        cd: p.skillCooldown, max: S.SKILL_COOLDOWN, cost: S.SKILL_COST },
      { key: 'X', which: 'ult', name: names.ult,
        cd: p.ultCooldown, max: S.ULT_COOLDOWN, cost: S.ULT_COST }
    ];

    // Track previous cooldowns for READY! pop
    if (!p._prevSkillCd) p._prevSkillCd = {};

    const SIZE = 18;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sx = x + i * (SIZE + 4);
      const cooling = row.cd > 0;
      const cost = Math.round(row.cost * discount);
      const poor = p.mana < cost;
      const ready = !cooling && !poor;
      const accent = cooling ? '#3a3654' : poor ? '#2f6fa8' : rarityColor;

      // READY! bounce when skill just became available
      const prevCd = p._prevSkillCd[row.which] || 0;
      if (prevCd > 0 && row.cd === 0 && !poor) {
        DS.FX.pop(sx + SIZE / 2, y - 2, rarityColor);
        DS.FX.number(sx + SIZE / 2, y - 10, 'READY!', rarityColor, 1);
      }
      p._prevSkillCd[row.which] = row.cd;

      R.rectS(sx, y, SIZE, SIZE, 'rgba(10,8,16,0.85)');
      R.frameS(sx, y, SIZE, SIZE, accent);

      const icon = SPR.skillIcon(item.type, row.which);
      if (ready) R.sprS(icon, sx + 3, y + 3);
      else R.sprAlphaS(icon, sx + 3, y + 3, cooling ? 0.30 : 0.45);

      // Cooldown shutter: fills from the top and retreats as it recharges.
      if (cooling) {
        const covered = Math.round((SIZE - 2) * (row.cd / row.max));
        R.rectS(sx + 1, y + 1, SIZE - 2, covered, 'rgba(13,11,18,0.72)');
        R.textSmall(String(Math.ceil(row.cd / 60)), sx + SIZE / 2 - 1, y + 6, '#9b96b8');
      }

      // A ready skill gets a lit rail along the bottom edge + subtle glow pulse
      if (ready) {
        R.rectS(sx + 1, y + SIZE - 2, SIZE - 2, 1, rarityColor);
        // Pulse glow on the frame
        if (Math.floor(g.frames / 20) % 2 === 0) {
          R.frameS(sx - 1, y - 1, SIZE + 2, SIZE + 2, accent);
        }
      }

      R.keycap(row.key, sx - 1, y + SIZE - 1, accent);
      if (poor && !cooling) {
        R.textSmall(String(cost), sx + SIZE - 7, y + SIZE - 7, '#2f6fa8');
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
  /* The weapon selector: BOTH hands shown side by side as real slots — the
     active one raised, lit and labelled, the off-hand dimmed under its swap
     key — plus a strip of the three armour slots, so what you wear is
     visible at a glance without opening the bag. */
  function drawWeaponSlot(g, item) {
    const R = DS.R, S = DS.SPR;
    const inv = g.inv;
    if (!item && !Inv.offhand(inv)) return;

    const slotW = 24, slotH = 20, gap = 3;
    const y = C.H - slotH - 3;
    const totalW = slotW * 2 + gap + 3 + 9;   // hands + divider + 3 mini armour slots
    const x0 = 4;

    // Backing panel for the whole cluster.
    R.panelS(x0 - 2, y - 2, totalW + 2, slotH + 4, 'rgba(10,8,16,0.82)', '#3a3654');

    const hands = [inv.equipped[0], inv.equipped[1]];
    for (let i = 0; i < 2; i++) {
      const it = hands[i];
      const active = i === inv.active;
      const sx = x0 + i * (slotW + gap);
      // Active slot floats up and glows in its rarity colour; the off-hand
      // sits flat and dim — hierarchy you can read at a glance.
      const sy = active ? y - 2 : y;
      const col = it ? W.rarityColor(it.rarity) : '#3a3654';
      R.panelS(sx, sy, slotW, slotH, active ? 'rgba(16,14,26,0.9)' : 'rgba(8,7,14,0.7)', active ? col : '#26233a');
      if (it) {
        R.sprS(S.itemIcon(it), sx + 4, sy + 4);
        if (active) {
          // Under-glow strip + element pip, reading "this is what you hold".
          R.rectS(sx + 2, sy + slotH - 2, slotW - 4, 1, col);
          if (it.element) {
            const el = W.ELEMENTS[it.element];
            R.rectS(sx + slotW - 6, sy + 2, 3, 3, el.color);
          }
        }
      } else {
        R.textSmall('_', sx + 10, sy + 7, '#2a2740');
      }
      R.keycap(String(i + 1), sx - 1, sy - 3, active ? col : '#2a2740');
    }

    // Armour strip: head / chest / legs mini-slots.
    const slots = ['head', 'chest', 'legs'];
    const ax = x0 + slotW * 2 + gap + 4;
    R.rectS(ax - 2, y + 2, 1, slotH - 4, '#26233a');   // divider
    for (let a = 0; a < slots.length; a++) {
      const piece = inv.armor[slots[a]];
      const ay = y + 1 + a * 6;
      R.rectS(ax, ay, 9, 5, piece ? 'rgba(16,14,26,0.9)' : 'rgba(8,7,14,0.6)');
      if (piece) {
        const mc = (DS.Armor && DS.Armor.MATERIALS[piece.material]) || {};
        R.rectS(ax + 1, ay + 1, 7, 3, mc.mid || '#9b96b8');
      }
    }
  }

  /* One bar, whoever is wearing it. Bosses carry their own name and colour so
     the bar reads as that fight rather than as a generic health strip, and the
     pool behind it is deep enough that the segments are worth drawing. */
  function drawBossBar(g) {
    const R = DS.R;
    const b = g.boss;
    const w = 180, x = (C.W - w) / 2, y = C.H - 14;
    const color = b.barColor || '#c86ee0';

    R.textCenter(b.name || 'SLIME KING', C.W / 2, y - 9, color);
    R.bar(x, y, w, 6, b.hp / b.maxHp, color, '#1c1a2b');

    // Ticks every quarter, so progress through a long fight is legible.
    for (let i = 1; i < 4; i++) {
      R.rectS(x + (w / 4) * i, y + 1, 1, 4, 'rgba(13,11,18,0.7)');
    }
    if (b.phase === 2) R.textSmall('ENRAGED', x + w + 3, y, '#c0303c');
  }

  /* Breath. Only ever on screen while it matters: under water, or during the
     few seconds after surfacing while it fills back up. */
  function drawBreath(g, p) {
    if (!p.inWater && p.breath >= 60 * 14) return;
    const R = DS.R;
    const pct = M.clamp(p.breath / (60 * 14), 0, 1);
    const w = 60, x = (C.W - w) / 2, y = 26;
    const low = pct < 0.3;

    R.textSmall('BREATH', x, y - 7, low ? RED : CYAN);
    R.bar(x, y, w, 4, pct, low ? '#c0303c' : '#4fb3e0', '#16324f');
    if (pct > 0) return;
    if (Math.floor(g.frames / 8) % 2 === 0) {
      R.textCenter('DROWNING', C.W / 2, y + 7, RED);
    }
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
    // A weapon card carries one extra line for its element (see itemCard).
    const extra = (item.element && !DS.Armor.isArmor(item)) ? 7 : 0;
    return 30 + extra + item.affixes.length * 7;
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

    /* The element line: which element, how much of the hit lands as it, and how
       hard its reactions hit. Without this the share and the Elemental Power
       affixes were invisible numbers doing real work behind the scenes. */
    if (item.element) {
      const E = W.ELEMENTS[item.element];
      const share = Math.round((item.stats.elementShare || 0) * 100);
      const power = Math.round(((item.stats.elemPower || 1) - 1) * 100);
      const line = E.label.toUpperCase() + ' ' + share + '%' +
                   (power > 0 ? '  +' + power + '% REACT' : '');
      R.text(line, x + 4, y + 28, E.color);
    }

    const affixY = y + 28 + (item.element ? 7 : 0);
    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      R.text(a.desc, x + 4, affixY + i * 7, a.color);
    }

    return h;
  }

  function armorCard(item, x, y, w) {
    const R = DS.R;
    const color = W.rarityColor(item.rarity);
    const mat = DS.Armor.MATERIALS[item.material];
    const h = cardHeight(item);

    R.panelS(x, y, w, h, 'rgba(13,11,18,0.94)', color);
    R.sprS(DS.SPR.itemIcon(item), x + w - 14, y + 3);
    R.text(item.name, x + 4, y + 4, color);
    R.text(mat.label.toUpperCase() + ' ' + DS.Armor.SLOT_LABEL[item.slot], x + 4, y + 12, MUTED);
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
    g.modal = { kind: 'bag', cursor: 0, hover: -1 };
    DS.Audio.play('menuPick');
  }

  function openEnchant(g) {
    g.modal = { kind: 'enchant', cursor: 0, action: 0, hoverRite: -1, hoverItem: -1 };
    DS.Audio.play('menuPick');
  }

  /* --- the shrine ---------------------------------------------------------

     Three cards, take one. Two things make a shrine worth walking to now:
     coins can reroll the offer, and the offer itself can come up as a weapon
     instead of a boon. That gift is the run's luckiest single moment, so it is
     deliberately loot and not a stat — it can be swapped, sold or beaten by a
     later drop, where a permanent stat spike could not. */

  const REROLL_BASE = 18;
  const REROLL_STEP = 14;
  const GIFT_CHANCE = 0.14;

  function rerollCost(shrine) {
    return REROLL_BASE + REROLL_STEP * (shrine.rerolls || 0);
  }

  function rollOffers(g) {
    const shrine = g.shrine;
    const boons = DS.Boons.offer(g.rng, g.inv.boons);
    const cards = boons.map(function (boon) {
      return { kind: 'boon', boon: boon, color: boon.color,
               name: boon.name, desc: boon.desc };
    });

    // One card in seven becomes an offering instead. Deeper floors offer
    // better steel, which keeps the shrine relevant late without inflating it.
    if (cards.length && g.rng.chance(GIFT_CHANCE + g.depth * 0.01)) {
      const item = DS.Loot.makeDrop(g.rng, g.depth, {
        minRarity: 2, bias: 1.6 + g.depth * 0.2
      });
      cards[g.rng.int(0, cards.length - 1)] = {
        kind: 'gift', item: item, color: W.rarityColor(item.rarity),
        name: item.kind === 'armor' ? 'AN OFFERING OF PLATE' : "THE KING'S OFFERING",
        desc: 'TAKE ' + item.name.toUpperCase()
      };
    }

    shrine.offers = cards;
    return cards;
  }

  function openShrine(g) {
    const shrine = g.shrine;
    if (!shrine.offers) rollOffers(g);
    if (!shrine.offers.length) {
      DS.Audio.play('error');
      g.toast('THE SHRINE IS SPENT', MUTED);
      shrine.used = true;
      return;
    }
    g.modal = { kind: 'shrine', cursor: 0 };
    DS.Audio.play('enchant');
  }

  function takeShrineCard(g, card) {
    const p = g.player;
    g.shrine.used = true;

    if (card.kind === 'gift') {
      /* Dropped at the shrine rather than forced into the hand, so the pickup
         prompt still shows the comparison card against what you carry. */
      DS.Ent.addPickup(g, g.shrine.x + 8, g.shrine.y - 6, 'item', card.item, 1);
      DS.Audio.play('upgrade');
      DS.R.flash(card.color, 12);
      DS.FX.ring(DS.Ent.centerX(p), DS.Ent.centerY(p), 22, card.color, 2.6);
      DS.FX.burst(DS.Ent.centerX(p), DS.Ent.centerY(p), 26,
                  [card.color, '#ffffff', '#f2c14e'], { speed: 2.4, life: 34 });
      g.showBanner(card.item.name.toUpperCase(), 'THE SHRINE GIVES UP ITS STEEL',
                   card.color);
      return;
    }

    const boon = card.boon;
    g.inv.boons.push(boon.key);
    p.refreshStats();
    // Losing a max heart to Bloodthirst should never be what kills you.
    p.hp = M.clamp(p.hp, 1, p.stats.maxHp);

    DS.Audio.play('upgrade');
    DS.R.flash(boon.color, 10);
    DS.FX.ring(DS.Ent.centerX(p), DS.Ent.centerY(p), 18, boon.color, 2.4);
    g.showBanner(boon.name, boon.desc, boon.color);
  }

  function updateShrine(g) {
    const In = DS.Input;
    const state = g.modal;
    const shrine = g.shrine;
    const offers = shrine.offers;

    if (In.justPressed('back')) {
      In.consume('back');
      closeModal(g);
      return;
    }

    if (In.justPressed('reroll')) {
      In.consume('reroll');
      const cost = rerollCost(shrine);
      if (g.inv.coins < cost) {
        DS.Audio.play('error');
        g.toast('NEED ' + cost + ' COINS', RED);
      } else {
        g.inv.coins -= cost;
        shrine.rerolls = (shrine.rerolls || 0) + 1;
        rollOffers(g);
        state.cursor = 0;
        DS.Audio.play('enchant');
        DS.R.flash('#a8e4ff', 6);
      }
      return;
    }

    // Cards are clickable, and hovering one selects it.
    const Ptr = DS.Ptr;
    for (let i = 0; i < offers.length; i++) {
      const y = 28 + i * 28;
      if (!Ptr.inRect(22, y, C.W - 44, 24)) continue;
      setCursor(state, i);
      if (Ptr.clicked(22, y, C.W - 44, 24)) {
        takeShrineCard(g, offers[i]);
        closeModal(g);
        return;
      }
      break;
    }

    if (In.justPressed('up')) moveCursor(state, -1, offers.length);
    if (In.justPressed('down')) moveCursor(state, 1, offers.length);
    state.cursor = M.clamp(state.cursor, 0, offers.length - 1);

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');

    takeShrineCard(g, offers[state.cursor]);
    closeModal(g);
  }

  function drawShrine(g) {
    const R = DS.R;
    const state = g.modal;
    const shrine = g.shrine;
    const offers = shrine.offers;

    R.fade(0.88);

    R.textCenter('THE SHRINE OFFERS', C.W / 2, 8, '#a8e4ff');
    const sub = 'TAKE ONE';
    R.textSmall(sub, (C.W - R.textSmallWidth(sub)) / 2, 18, MUTED);

    for (let i = 0; i < offers.length; i++) {
      const card = offers[i];
      const y = 28 + i * 28;
      const selected = i === state.cursor;

      R.panelS(22, y, C.W - 44, 24, selected ? 'rgba(28,26,43,0.96)' : 'rgba(13,11,18,0.9)',
               selected ? card.color : '#2a2740');
      // A rarity-style colour bar on the left edge reads faster than a caret.
      R.rectS(22, y, 2, 24, card.color);

      if (card.kind === 'gift') {
        R.sprS(DS.SPR.itemIcon(card.item), 26, y + 4);
        R.text(card.name, 44, y + 5, card.color);
        R.textSmall(card.desc, 44, y + 15, selected ? INK : MUTED);
      } else {
        R.text(card.name, 30, y + 5, card.color);
        R.textSmall(card.desc, 30, y + 15, selected ? INK : MUTED);
      }
      if (selected) R.rectS(C.W - 28, y + 9, 4, 4, '#ffffff');
    }

    // Reroll price, greyed out when it is out of reach.
    const cost = rerollCost(shrine);
    const afford = g.inv.coins >= cost;
    const line = 'REROLL  ' + cost + ' COINS   (YOU HAVE ' + g.inv.coins + ')';
    R.textSmall(line, (C.W - R.textSmallWidth(line)) / 2, C.H - 21,
                afford ? GOLD : '#6f6a90');

    R.hintsCenter([['ENTER', 'TAKE'], ['R', 'REROLL'], ['ESC', 'WALK AWAY']],
                  C.W / 2, C.H - 11, MUTED, CYAN);
    DS.Ptr.cursor();
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
    g.modal = { kind: 'shop', cursor: 0, hover: -1 };
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

  // --- shared screen furniture ---------------------------------------------

  /* The pieces every full-screen panel is built from. They exist so the shop,
     the enchanter and the bag look like three rooms in one building rather
     than three programmers' idea of a list. */

  function screenBack(title, subtitle, color) {
    const R = DS.R;
    R.fade(0.86);
    // A banded header strip, so the title is a masthead and not floating text.
    R.rectS(0, 0, C.W, 22, 'rgba(28,26,43,0.9)');
    R.rectS(0, 22, C.W, 1, color);
    R.text(title, 30, 4, color);
    if (subtitle) R.textSmall(subtitle, 30, 14, MUTED);
  }

  // Coins and shards, with their icons, in the top right of every shop screen.
  function purse(g, y) {
    const R = DS.R, S = DS.SPR;
    const coins = String(g.inv.coins), shards = String(g.inv.shards);
    const cw = R.textWidth(coins), sw = R.textWidth(shards);
    const right = C.W - 6;

    R.sprS(S.shard, right - sw - 10, y);
    R.text(shards, right - sw, y, CYAN);
    R.sprS(S.coin, right - sw - cw - 32, y);
    R.text(coins, right - sw - cw - 22, y, GOLD);
  }

  /* A framed icon plate. Everything selectable in these screens wears one, so
     the eye can find the pictures before it starts reading. */
  function iconPlate(x, y, size, icon, color, dim) {
    const R = DS.R;
    R.rectS(x, y, size, size, dim ? 'rgba(13,11,18,0.75)' : 'rgba(28,26,43,0.95)');
    R.frameS(x, y, size, size, color);
    if (!icon) return;
    const w = icon.uw == null ? icon.width : icon.uw;
    const h = icon.uh == null ? icon.height : icon.uh;
    const px = x + Math.round((size - w) / 2);
    const py = y + Math.round((size - h) / 2);
    if (dim) R.sprAlphaS(icon, px, py, 0.4);
    else R.sprS(icon, px, py);
  }

  // A row plate: the body of one shop line or one enchant rite.
  function rowPlate(x, y, w, h, color, on) {
    const R = DS.R;
    R.rectS(x, y, w, h, on ? 'rgba(40,37,62,0.96)' : 'rgba(18,16,28,0.86)');
    R.frameS(x, y, w, h, on ? color : '#2a2740');
    // A colour tab down the left edge is what makes a list of rows scan.
    R.rectS(x, y, 2, h, on ? color : '#3a3654');
  }

  function priceTag(x, y, coins, shards, state) {
    const R = DS.R, S = DS.SPR;
    const color = state === 'sold' ? '#514c72' : state === 'poor' ? RED : GOLD;
    if (state === 'sold') {
      R.text('SOLD', x - R.textWidth('SOLD'), y, color);
      return;
    }
    let right = x;
    if (shards) {
      const label = String(shards);
      R.text(label, right - R.textWidth(label), y, state === 'poor' ? RED : CYAN);
      right -= R.textWidth(label) + 2;
      R.sprS(S.shard, right - 8, y - 1);
      right -= 12;
    }
    const label = String(coins);
    R.text(label, right - R.textWidth(label), y, color);
    right -= R.textWidth(label) + 2;
    R.sprS(S.coin, right - 8, y - 1);
  }

  // Keyboard and mouse agree on one cursor: this moves it and plays the click.
  function setCursor(state, index) {
    if (state.cursor === index) return;
    state.cursor = index;
    DS.Audio.play('menuMove');
  }

  // --- bag screen -----------------------------------------------------------

  /* The inventory is a character sheet you can rummage in.

     Left: the hero as he actually looks, with the five slots he is wearing
     arranged around him - drag a sword onto the hand and he is holding it, and
     the paper doll redraws.
     Right: the bag itself, as a grid you can reorder by dragging.
     Bottom: whatever the pointer is over, described in full.

     The old screen was one flat list of everything owned with a cursor you
     walked along; nothing about it said which sword was in your hand. */

  /* The doll stands in the middle of his own gear: hands down the left, armour
     down the right, each cell labelled above itself so no label ever has to
     live outside the panel it belongs to. */
  const DOLL_SLOTS = [
    { ref: { kind: 'weapon', index: 0 }, label: 'MAIN', x: 10, y: 44, glyph: 'weapon' },
    { ref: { kind: 'weapon', index: 1 }, label: 'OFF',  x: 10, y: 76, glyph: 'weapon' },
    { ref: { kind: 'armor', slot: 'head' },  label: 'HEAD', x: 84, y: 40, glyph: 'head' },
    { ref: { kind: 'armor', slot: 'chest' }, label: 'BODY', x: 84, y: 72, glyph: 'chest' },
    { ref: { kind: 'armor', slot: 'legs' },  label: 'LEGS', x: 84, y: 104, glyph: 'legs' }
  ];

  /* Where the doll stands, in logical screen units. With voxels running this is
     a WINDOW: the renderer draws the live 3D doll into exactly this rect (see
     R3D.renderArmory) and this screen leaves it transparent, so what you see in
     the bag is the same model that walks around the dungeon — armour, both
     hands and all. The 2D paperdoll still draws here when WebGL is unavailable. */
  const DOLL_WINDOW = { x: 34, y: 41, w: 48, h: 86 };
  /* Where the doll's feet land inside that window, given the armory camera's
     framing in renderer3d.js — the ledge is drawn on the glass, not the model. */
  const DOLL_FEET_Y = 117;

  function dollRect() { return DOLL_WINDOW; }

  /* Punch the doll's window out of the 2D canvas so the WebGL pass behind it
     shows through. The screen dim (R.fade) is painted on this same canvas, so
     erasing the rect REVEALS the 3D doll instead of darkening it — which is
     what would happen if the doll were drawn under the veil. */
  function punchDollHole() {
    const R = DS.R;
    const cx = R.ctx;
    if (!cx) return;
    const s = DS.C.RS;
    cx.save();
    cx.setTransform(s, 0, 0, s, 0, 0);
    cx.globalCompositeOperation = 'destination-out';
    cx.fillStyle = '#000000';
    cx.fillRect(DOLL_WINDOW.x, DOLL_WINDOW.y, DOLL_WINDOW.w, DOLL_WINDOW.h);
    cx.restore();
  }

  const SLOT_SIZE = 22;
  const BAG_COLS = 6;
  const CELL = 30;
  const BAG_X = 128;
  const BAG_Y = 34;
  const DROP_Y = 150;
  const PANEL = { x: 6, y: 26, w: 106, h: 120 };

  function bagCellRect(i) {
    return {
      x: BAG_X + (i % BAG_COLS) * CELL,
      y: BAG_Y + Math.floor(i / BAG_COLS) * CELL,
      w: CELL - 3, h: CELL - 3
    };
  }

  // Bag cells are big enough to show the icon at double size, which is what
  // makes a grid of loot readable at a glance instead of a grid of specks.
  function bagIcon(item) {
    const icon = DS.SPR.itemIcon(item);
    return icon ? DS.Art.scaled(icon, 2) : null;
  }

  /* Every place an item can be picked up from or dropped onto, as one list, so
     the drag code never has to care which panel it is over. */
  function bagTargets(g) {
    const out = [];
    for (let i = 0; i < DOLL_SLOTS.length; i++) {
      const slot = DOLL_SLOTS[i];
      out.push({
        ref: slot.ref, label: slot.label, glyph: slot.glyph,
        x: slot.x, y: slot.y, w: SLOT_SIZE, h: SLOT_SIZE,
        item: Inv.readRef(g.inv, slot.ref)
      });
    }
    for (let i = 0; i < Inv.BAG_SIZE; i++) {
      const r = bagCellRect(i);
      out.push({
        ref: { kind: 'bag', index: i }, label: '', glyph: null,
        x: r.x, y: r.y, w: r.w, h: r.h, item: g.inv.bag[i] || null, bag: true
      });
    }
    return out;
  }

  function updateBag(g) {
    const In = DS.Input;
    const Ptr = DS.Ptr;
    const state = g.modal;
    const targets = bagTargets(g);

    if (In.justPressed('bag') || In.justPressed('back')) {
      In.consume('bag'); In.consume('back');
      Ptr.clearDrag();
      closeModal(g);
      return;
    }

    // --- pointer ---
    state.hover = -1;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!Ptr.inRect(t.x, t.y, t.w, t.h)) continue;
      state.hover = i;
      if (Ptr.justPressed() && t.item && !Ptr.dragging()) {
        Ptr.startDrag(t.item, t.ref);
        DS.Audio.play('menuMove');
      }
      break;
    }

    if (Ptr.dragging() && Ptr.justReleased()) {
      const dropped = Ptr.drag;
      const target = state.hover >= 0 ? targets[state.hover] : null;

      if (target) {
        const result = Inv.moveTo(g.inv, dropped.from, target.ref);
        if (result.ok) {
          if (result.moved) DS.Audio.play('menuPick');
          g.player.refreshStats();
        } else {
          DS.Audio.play('error');
          g.toast(result.reason, RED);
        }
      } else if (Ptr.inRect(0, DROP_Y, C.W, C.H - DROP_Y)) {
        const item = Inv.takeFrom(g.inv, dropped.from);
        if (item) {
          DS.Ent.addPickup(g, DS.Ent.centerX(g.player), g.player.y, 'item', item, 1);
          g.player.refreshStats();
          DS.Audio.play('pickup');
          g.toast('DROPPED ' + item.name, MUTED);
        }
      } else {
        DS.Audio.play('menuMove');
      }
      Ptr.clearDrag();
    }

    // --- keyboard, still a first-class way to use the screen ---
    const bagFirst = DOLL_SLOTS.length;
    if (In.justPressed('left')) setCursor(state, wrapCursor(state.cursor - 1, targets.length));
    if (In.justPressed('right')) setCursor(state, wrapCursor(state.cursor + 1, targets.length));
    if (In.justPressed('up')) setCursor(state, wrapCursor(state.cursor - (state.cursor >= bagFirst ? BAG_COLS : 1), targets.length));
    if (In.justPressed('down')) setCursor(state, wrapCursor(state.cursor + (state.cursor >= bagFirst ? BAG_COLS : 1), targets.length));
    state.cursor = M.clamp(state.cursor, 0, targets.length - 1);

    const entry = targets[state.cursor];
    if (!entry) return;

    if (In.justPressed('confirm')) {
      In.consume('confirm');
      keyboardUse(g, entry);
    }

    if (In.justPressed('interact') && entry.item) {
      In.consume('interact');
      const item = Inv.takeFrom(g.inv, entry.ref);
      if (item) {
        DS.Ent.addPickup(g, DS.Ent.centerX(g.player), g.player.y, 'item', item, 1);
        g.player.refreshStats();
        DS.Audio.play('pickup');
      }
    }
  }

  function wrapCursor(index, length) {
    return (index + length) % length;
  }

  /* ENTER on a bag item equips it the obvious way; on a hand it swaps hands.
     This is the fallback path - the screen is built for the pointer. */
  function keyboardUse(g, entry) {
    if (entry.ref.kind === 'bag') {
      if (!entry.item) { DS.Audio.play('error'); return; }
      Inv.equipFromBag(g.inv, entry.ref.index);
      g.player.refreshStats();
      DS.Audio.play('menuPick');
      g.toast('EQUIPPED ' + entry.item.name, W.rarityColor(entry.item.rarity));
      return;
    }
    if (entry.ref.kind === 'weapon') {
      if (Inv.swapActive(g.inv)) { g.player.refreshStats(); DS.Audio.play('menuPick'); }
      else DS.Audio.play('error');
    }
  }

  function drawBag(g) {
    const R = DS.R, S = DS.SPR;
    const Ptr = DS.Ptr;
    const state = g.modal;
    const targets = bagTargets(g);

    screenBack('INVENTORY', 'DRAG TO EQUIP - THE DOLL SHOWS WHAT YOU WEAR', CYAN);
    purse(g, 5);

    // --- the doll panel ---
    R.rectS(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 'rgba(18,16,28,0.9)');
    R.frameS(PANEL.x, PANEL.y, PANEL.w, PANEL.h, '#3a3654');
    R.textSmall('CURRENTLY WEARING', PANEL.x + 4, PANEL.y + 4, MUTED);

    const p = g.player;
    const armory = !!(DS.R3D && DS.R3D.voxels);

    if (armory) {
      /* Carve the window out of this canvas and let the 3D doll through, then
         dress the hole: a rim and a ledge to stand on. Everything drawn after
         the punch sits ON TOP of the hole, so it has to stay outside it. */
      punchDollHole();
      R.frameS(DOLL_WINDOW.x - 1, DOLL_WINDOW.y - 1,
               DOLL_WINDOW.w + 2, DOLL_WINDOW.h + 2, 'rgba(79,179,224,0.35)');
      // A pool of light under the feet, so the doll stands somewhere.
      R.rectS(DOLL_WINDOW.x + 5, DOLL_FEET_Y, DOLL_WINDOW.w - 10, 1,
              'rgba(79,179,224,0.30)');
      R.rectS(DOLL_WINDOW.x + 10, DOLL_FEET_Y + 1, DOLL_WINDOW.w - 20, 1,
              'rgba(79,179,224,0.18)');
    } else {
      const doll = (p && p.doll) || DS.Paperdoll.bare();
      const frame = doll.idle[Math.floor(g.frames / 40) % doll.idle.length];
      const big = DS.Art.scaled(frame, 2);
      const dollW = big.uw == null ? big.width : big.uw;
      const dollX = 58 - dollW / 2;

      // A plinth of light, so he is standing somewhere rather than floating.
      R.rectS(dollX - 4, 88, dollW + 8, 2, 'rgba(79,179,224,0.20)');
      R.sprS(big, dollX, 54);
    }

    const set = p && p.stats.setBonus;
    if (set) R.textSmall(set.name || 'SET BONUS', PANEL.x + 4, PANEL.y + PANEL.h - 10, GOLD);

    // --- slots and bag cells ---
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const dragged = Ptr.dragging() && sameSlot(Ptr.drag.from, t.ref);
      const item = dragged ? null : t.item;
      const color = item ? W.rarityColor(item.rarity) : '#3a3654';
      const hovered = state.hover === i;
      const selected = state.cursor === i;

      iconPlate(t.x, t.y, t.w, item ? (t.bag ? bagIcon(item) : S.itemIcon(item)) : null,
                hovered || selected ? '#ffffff' : color, false);

      if (!item && t.glyph) {
        R.sprAlphaS(S.slotIcon[t.glyph], t.x + (t.w - 12) / 2, t.y + (t.h - 12) / 2, 0.5);
      }
      // The label belongs over its own cell: beside it, it would hang off the
      // panel and read as though it belonged to the doll instead.
      if (t.label) R.textSmall(t.label, t.x, t.y - 6, MUTED);

      /* Which hand is live. A gold sill under the cell and a lit corner stud,
         rather than the word HELD - at 22 pixels wide the label and the slot
         name were printing over each other. */
      if (t.ref.kind === 'weapon' && t.ref.index === g.inv.active) {
        R.rectS(t.x, t.y + t.h - 3, t.w, 3, GOLD);
        R.rectS(t.x + t.w - 4, t.y + 1, 3, 3, GOLD);
      }

      // A drop target lights up while something compatible is over it.
      if (Ptr.dragging() && hovered) {
        const ok = Inv.accepts(t.ref, Ptr.drag.item);
        R.frameS(t.x - 1, t.y - 1, t.w + 2, t.h + 2, ok ? '#5cbf62' : RED);
      }
    }

    R.textSmall('BAG', BAG_X, 28, MUTED);
    const count = g.inv.bag.length + '/' + Inv.BAG_SIZE;
    R.textSmall(count, C.W - 8 - R.textSmallWidth(count), 28,
                g.inv.bag.length >= Inv.BAG_SIZE ? RED : MUTED);

    // --- what the pointer is on ---
    const focus = targets[state.hover >= 0 ? state.hover : state.cursor];
    const shown = Ptr.dragging() ? Ptr.drag.item : (focus && focus.item);
    if (shown) {
      const h = cardHeight(shown);
      itemCard(shown, BAG_X - 4, Math.min(98, C.H - h - 22), C.W - BAG_X + 0,
               Inv.weapon(g.inv));
    }

    // --- the floor ---
    const overDrop = Ptr.dragging() && Ptr.inRect(0, DROP_Y, C.W, C.H - DROP_Y);
    R.rectS(6, DROP_Y, 106, 12, overDrop ? 'rgba(192,48,60,0.35)' : 'rgba(18,16,28,0.8)');
    R.frameS(6, DROP_Y, 106, 12, overDrop ? RED : '#3a3654');
    R.textSmall('DRAG HERE TO DROP', 12, DROP_Y + 4, overDrop ? '#ffffff' : '#514c72');

    R.hintsCenter([['DRAG', 'TO EQUIP'], ['F', 'DROP'], ['TAB', 'CLOSE']],
                  C.W / 2 + 40, C.H - 10, MUTED, CYAN);

    Ptr.dragGhost();
    Ptr.cursor();
  }

  function sameSlot(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'armor') return a.slot === b.slot;
    return a.index === b.index;
  }

  // --- enchant screen -------------------------------------------------------

  /* Four rites, each one a picture, a name, a sentence of plain English and a
     price. The old screen was four words in a column with a number beside
     them, which meant the only way to learn what ADD AFFIX did was to buy it. */
  const RITES = [
    { key: 'reroll',  name: 'REROLL POWERS', icon: 'reroll',
      desc: 'SPIN EVERY AFFIX ON IT ANEW', color: GOLD },
    { key: 'affix',   name: 'BIND AN AFFIX', icon: 'affix',
      desc: 'BURN ONE MORE POWER INTO IT', color: '#c86ee0' },
    { key: 'upgrade', name: 'RAISE RARITY',  icon: 'upgrade',
      desc: 'PUSH IT ONE TIER HIGHER', color: '#fff0a8' },
    { key: 'salvage', name: 'BREAK IT DOWN', icon: 'salvage',
      desc: 'DESTROY IT AND KEEP THE SHARDS', color: CYAN }
  ];
  const ACTIONS = RITES.map(function (r) { return r.name; });

  const STRIP_Y = 28;
  const STRIP_CELL = 20;
  const RITE_X = 158;
  const RITE_Y = 54;
  const RITE_H = 26;

  function actionCost(inv, item, index) {
    if (index === 0) return Inv.rerollCost(item);
    if (index === 1) return Inv.addAffixCost(item);
    if (index === 2) return Inv.upgradeCost(item);
    return { coins: 0, shards: 0 };
  }

  function stripRect(i, count) {
    const startX = Math.max(6, (C.W - count * STRIP_CELL) / 2);
    return { x: startX + i * STRIP_CELL, y: STRIP_Y, w: STRIP_CELL - 2, h: 18 };
  }

  function updateEnchant(g) {
    const In = DS.Input;
    const Ptr = DS.Ptr;
    const state = g.modal;
    const list = ownedList(g.inv);

    if (In.justPressed('back') || In.justPressed('bag')) {
      In.consume('back'); In.consume('bag');
      closeModal(g);
      return;
    }

    // The item strip is always live: clicking a different item just switches.
    for (let i = 0; i < list.length; i++) {
      const r = stripRect(i, list.length);
      if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
      state.hoverItem = i;
      if (Ptr.clicked(r.x, r.y, r.w, r.h)) {
        setCursor(state, i);
        state.picking = false;
        DS.Audio.play('menuPick');
      }
      break;
    }

    if (In.justPressed('left')) { setCursor(state, wrapCursor(state.cursor - 1, list.length)); state.picking = false; }
    if (In.justPressed('right')) { setCursor(state, wrapCursor(state.cursor + 1, list.length)); state.picking = false; }
    state.cursor = M.clamp(state.cursor, 0, Math.max(0, list.length - 1));

    const entry = list[state.cursor];
    if (!entry) return;

    state.hoverRite = -1;
    for (let i = 0; i < RITES.length; i++) {
      const y = RITE_Y + i * RITE_H;
      if (!Ptr.inRect(RITE_X, y, C.W - RITE_X - 6, RITE_H - 3)) continue;
      state.hoverRite = i;
      if (Ptr.clicked(RITE_X, y, C.W - RITE_X - 6, RITE_H - 3)) {
        state.action = i;
        applyEnchant(g, entry, state);
      }
      break;
    }

    if (In.justPressed('up')) { state.action = (state.action + 3) % 4; DS.Audio.play('menuMove'); }
    if (In.justPressed('down')) { state.action = (state.action + 1) % 4; DS.Audio.play('menuMove'); }

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');
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
    const Ptr = DS.Ptr;
    const state = g.modal;
    const list = ownedList(g.inv);

    screenBack('ENCHANT TABLE', 'PAY IN COIN AND SHARD - THE STEEL ANSWERS', '#c86ee0');
    R.sprS(S.tile.table, 6, 6);
    purse(g, 5);

    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const r = stripRect(i, list.length);
      const color = W.rarityColor(entry.item.rarity);
      const on = i === state.cursor;
      iconPlate(r.x, r.y, r.w, S.itemIcon(entry.item), on ? '#ffffff' : color);
      if (entry.source === 'slot') {
        R.rectS(r.x, r.y + r.h - 2, r.w, 2, entry.index === g.inv.active ? GOLD : '#6f6a90');
      }
    }

    const entry = list[state.cursor];
    if (!entry) {
      R.textCenter('NOTHING TO ENCHANT', C.W / 2, 80, MUTED);
      R.hintsCenter([['ESC', 'LEAVE']], C.W / 2, C.H - 10, MUTED, '#c86ee0');
      Ptr.cursor();
      return;
    }

    // The item under the hammer, shown large on the left.
    const item = entry.item;
    const color = W.rarityColor(item.rarity);
    R.rectS(6, 50, 146, 118, 'rgba(18,16,28,0.9)');
    R.frameS(6, 50, 146, 118, color);

    const bigIcon = DS.Art.scaled(S.itemIcon(item), 2);
    R.sprS(bigIcon, 14, 56);
    R.text(item.name, 46, 58, color);
    R.textSmall(W.rarityLabel(item.rarity) + '  ' +
                (DS.Armor.isArmor(item) ? DS.Armor.SLOT_LABEL[item.slot]
                                        : W.WEAPONS[item.type].label.toUpperCase()),
                46, 68, MUTED);

    if (DS.Armor.isArmor(item)) {
      R.textSmall('SHIELD ' + item.stats.shield, 14, 84, CYAN);
      R.textSmall('WEIGHT ' + item.stats.weight, 80, 84, INK);
    } else {
      R.textSmall('DAMAGE ' + item.stats.damage, 14, 84, INK);
      R.textSmall('CRIT ' + Math.round(item.stats.crit * 100) + '%', 80, 84, INK);
    }

    R.textSmall('AFFIXES  ' + item.affixes.length + '/' + Inv.slotsFor(item), 14, 96, MUTED);
    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      R.rectS(12, 105 + i * 11, 134, 10, 'rgba(28,26,43,0.7)');
      R.rectS(12, 105 + i * 11, 2, 10, a.color);
      R.textSmall(a.desc, 18, 108 + i * 11, a.color);
    }
    if (!item.affixes.length) R.textSmall('NO POWERS BOUND YET', 18, 108, '#514c72');

    // The four rites.
    for (let i = 0; i < RITES.length; i++) {
      const rite = RITES[i];
      const y = RITE_Y + i * RITE_H;
      const w = C.W - RITE_X - 6;
      const cost = actionCost(g.inv, item, i);
      const affordable = i === 3 || Inv.canAfford(g.inv, cost);
      const on = i === state.action || state.hoverRite === i;

      rowPlate(RITE_X, y, w, RITE_H - 3, rite.color, on);
      iconPlate(RITE_X + 4, y + 3, 17, S.uiIcon[rite.icon],
                on ? rite.color : '#2a2740', !affordable);
      R.text(rite.name, RITE_X + 25, y + 4, on ? '#ffffff' : INK);
      R.textSmall(rite.desc, RITE_X + 25, y + 14, affordable ? MUTED : '#514c72');

      if (i === 3) {
        const label = '+' + Inv.salvageValue(item);
        R.text(label, RITE_X + w - R.textWidth(label) - 12, y + 4, CYAN);
        R.sprS(S.shard, RITE_X + w - 10, y + 3);
      } else {
        priceTag(RITE_X + w - 4, y + 4, cost.coins, cost.shards,
                 affordable ? 'ok' : 'poor');
      }
    }

    R.hintsCenter([['ENTER', 'PERFORM'], ['ESC', 'LEAVE']], C.W / 2, C.H - 10, MUTED, '#c86ee0');
    Ptr.cursor();
  }

  // --- shop -----------------------------------------------------------------

  const SHOP_Y = 28;
  const SHOP_ROW = 21;

  function shopRowRect(i) {
    return { x: 8, y: SHOP_Y + i * SHOP_ROW, w: C.W - 16, h: SHOP_ROW - 2 };
  }

  function updateShop(g) {
    const In = DS.Input;
    const Ptr = DS.Ptr;
    const state = g.modal;
    const stock = g.shopStock;

    if (In.justPressed('back') || In.justPressed('bag')) {
      In.consume('back'); In.consume('bag');
      closeModal(g);
      return;
    }

    state.hover = -1;
    for (let i = 0; i < stock.length; i++) {
      const r = shopRowRect(i);
      if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
      state.hover = i;
      setCursor(state, i);
      if (Ptr.clicked(r.x, r.y, r.w, r.h)) buy(g, stock[i]);
      break;
    }

    if (In.justPressed('up')) setCursor(state, wrapCursor(state.cursor - 1, stock.length));
    if (In.justPressed('down')) setCursor(state, wrapCursor(state.cursor + 1, stock.length));
    state.cursor = M.clamp(state.cursor, 0, stock.length - 1);

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');
    buy(g, stock[state.cursor]);
  }

  function buy(g, entry) {
    const result = DS.Shop.buy(g, entry);
    if (!result.ok) {
      DS.Audio.play('error');
      g.toast(result.reason, RED);
      return;
    }
    DS.Audio.play('coin');
    g.toast('BOUGHT ' + entry.label, GOLD);
    DS.FX.ring(DS.Ent.centerX(g.player), DS.Ent.centerY(g.player), 10, '#f2c14e', 1.4);
  }

  function drawShop(g) {
    const R = DS.R, S = DS.SPR;
    const Ptr = DS.Ptr;
    const state = g.modal;
    const stock = g.shopStock;

    screenBack('MERCHANT', 'HE KEEPS NOTHING YOU CANNOT CARRY OUT', GOLD);
    // The trader himself, so the screen has a face in it.
    const idle = S.merchant[Math.floor(g.frames / 40) % 2];
    R.sprS(idle, 6, 2);
    purse(g, 5);

    for (let i = 0; i < stock.length; i++) {
      const entry = stock[i];
      const r = shopRowRect(i);
      const on = i === state.cursor;
      const affordable = !entry.sold && g.inv.coins >= entry.coins;
      const color = entry.kind === 'item'
        ? W.rarityColor(entry.item.rarity)
        : entry.sold ? '#514c72' : GOLD;

      rowPlate(r.x, r.y, r.w, r.h, color, on);
      iconPlate(r.x + 3, r.y + 2, 15, S.shopIcon(entry),
                on ? color : '#2a2740', entry.sold);

      R.text(entry.label, r.x + 23, r.y + 3,
             entry.sold ? '#514c72' : on ? '#ffffff' : INK);
      R.textSmall(entry.desc, r.x + 23, r.y + 12,
                  entry.sold ? '#3a3654' : affordable ? MUTED : '#6f6a90');

      priceTag(r.x + r.w - 4, r.y + 4, entry.coins, 0,
               entry.sold ? 'sold' : affordable ? 'ok' : 'poor');
    }

    // The weapon on the rack gets its full card, since it is the real decision.
    const entry = stock[state.cursor];
    if (entry && entry.kind === 'item') {
      const h = cardHeight(entry.item);
      itemCard(entry.item, 8, C.H - h - 16, C.W - 16, Inv.weapon(g.inv));
    }

    R.hintsCenter([['ENTER', 'BUY'], ['ESC', 'LEAVE']], C.W / 2, C.H - 10, MUTED, GOLD);
    Ptr.cursor();
  }

  /* Aim reticle. The system cursor is hidden over the canvas and replaced by a
     weapon-coloured X drawn in screen space, so the pointer reads as part of
     the game and shows at a glance what a click will do: a wide X for melee
     reach, a tighter cross with a draw ring for the bow and staff. */
  function reticle(g) {
    const R = DS.R, In = DS.Input;
    if (!In.hasMouse()) return;

    /* The system cursor is hidden everywhere now, not only during play: the
       menus draw their own pixel arrow, and an OS pointer floating over them
       was the one part of the screen that did not belong to the game. */
    const cv = R.canvas;
    if (cv) cv.style.cursor = 'none';
    if (g.modal || g.paused || !g.player || g.player.dead) return;

    const p = g.player;
    const item = Inv.weapon(g.inv);
    const base = item ? W.WEAPONS[item.type] : null;
    const ranged = !!(base && base.ranged);
    const ready = p.attackCooldown <= 0;
    const color = !ready ? '#6f6a90'
      : item ? W.rarityColor(item.rarity) : INK;

    const x = Math.round(In.mouse.x);
    const y = Math.round(In.mouse.y);
    const arm = ranged ? 2 : 3;
    const gap = ranged ? 2 : 1;

    for (let i = gap; i <= gap + arm; i++) {
      R.rectS(x - i, y - i, 1, 1, color);
      R.rectS(x + i, y - i, 1, 1, color);
      R.rectS(x - i, y + i, 1, 1, color);
      R.rectS(x + i, y + i, 1, 1, color);
    }
    R.rectS(x, y, 1, 1, ready ? '#ffffff' : color);

    // Drawing a ranged weapon tightens a ring onto the reticle.
    if (ranged && p.charging && base) {
      const ratio = M.clamp(p.holdFrames / base.chargeMax, 0, 1);
      const r = Math.round(9 - ratio * 4);
      const ringColor = ratio >= 1 ? '#fff0a8' : '#a8e4ff';
      R.rectS(x - r, y, 2, 1, ringColor);
      R.rectS(x + r - 1, y, 2, 1, ringColor);
      R.rectS(x, y - r, 1, 2, ringColor);
      R.rectS(x, y + r - 1, 1, 2, ringColor);
    }

    // Out of arrows is a state you want to read from the cursor, not the log.
    if (base && base.key === 'bow' && g.inv.arrows <= 0) {
      R.textSmall('0', x + 5, y - 9, RED);
    }
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
    reticle: reticle,
    itemCard: itemCard,
    cardHeight: cardHeight,
    openBag: openBag,
    openEnchant: openEnchant,
    openShop: openShop,
    openShrine: openShrine,
    drawBanner: drawBanner,
    closeModal: closeModal,
    dollRect: dollRect,
    updateModal: updateModal,
    drawModal: drawModal,
    ownedList: ownedList,
    COLORS: { INK: INK, MUTED: MUTED, GOLD: GOLD, CYAN: CYAN, RED: RED, DIM: DIM }
  };
})(window.DS);
