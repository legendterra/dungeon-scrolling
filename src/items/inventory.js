/* The bag, the two weapon slots, the run's currencies, and the enchant table.
   Also derives the player's live stats from whatever weapon is currently held —
   only the *active* weapon grants its suffix bonuses, so swapping is a real
   decision rather than a free stat stack. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const W = DS.Weapons;
  const AFX = DS.Affixes;
  const Loot = DS.Loot;

  /* Eight was tight enough that the bag was full by depth three, and a full
     bag is what forced the swap path that used to break. Twelve leaves room to
     carry a spare set of armour (3) plus a few weapons without turning the run
     into an inventory management game. */
  const BAG_SIZE = 12;

  const BASE = {
    maxHp: 6,
    maxStamina: 100,
    staminaRegen: 0.55,
    maxMana: 100,
    manaRegen: 0.28,
    moveSpeed: 1.45,
    dashCharges: 1,
    iframes: 34,
    jumpVel: 5.3,
    coinBonus: 0,
    thorns: 0
  };

  function create(weaponType) {
    return {
      equipped: [Loot.startingWeapon(weaponType), null],
      active: 0,
      bag: [],
      coins: 0,
      shards: 0,
      keys: 0,
      arrows: 20,
      // Run-scoped upgrades bought from the merchant. Permadeath applies here
      // too: these die with the run like everything else.
      perks: { maxHp: 0, maxStamina: 0, maxMana: 0, dashCharges: 0 },
      // Three armour slots, freely mixed.
      armor: { head: null, chest: null, legs: null },
      // Shrine boons taken this run, by key.
      boons: [],
      /* Elemental essences unlocked this run (element keys). Any weapon can be
         infused with any of them - see the infusion section below. The run
         starts with none: the first elemental weapon you pick up, a shrine
         essence or a boss kill is what opens the mechanic. */
      essences: []
    };
  }

  function weapon(inv) { return inv.equipped[inv.active]; }
  function offhand(inv) { return inv.equipped[1 - inv.active]; }

  /* Derived player stats. Recomputed whenever equipment changes rather than
     every frame — the result is cached on the player. */
  function derive(inv) {
    const out = Object.assign({}, BASE);

    const perks = inv.perks || {};
    out.maxHp += perks.maxHp || 0;
    out.maxStamina += perks.maxStamina || 0;
    out.maxMana += perks.maxMana || 0;
    out.dashCharges += perks.dashCharges || 0;

    DS.Boons.applyStats(inv, out);
    applyArmor(inv, out);

    const item = weapon(inv);
    if (!item) return out;

    const b = item.bonus;
    out.maxHp += b.maxHp;
    out.maxStamina += b.maxStamina;
    out.staminaRegen += b.staminaRegen;
    out.maxMana += b.maxMana;
    out.manaRegen += b.manaRegen;
    out.moveSpeed *= (1 + b.moveSpeed);
    out.dashCharges += b.dashCharges;
    out.iframes += b.iframes;
    out.jumpVel *= (1 + b.jump);
    out.coinBonus += b.coinBonus;
    out.thorns += b.thorns;
    return out;
  }

  /* Armour contributes Shield, weight, and whatever its suffixes rolled. The
     set bonus lands last so it can override the pieces it completes. */
  function applyArmor(inv, out) {
    out.shield = 0;
    out.weight = 0;
    out.shieldRegen = 1;
    out.shieldDelay = 0;
    out.airJumpBonus = 0;
    out.noKnockback = false;
    out.setBonus = null;

    const worn = inv.armor || {};
    for (let i = 0; i < DS.Armor.SLOTS.length; i++) {
      const piece = worn[DS.Armor.SLOTS[i]];
      if (!piece) continue;
      out.shield += piece.stats.shield;
      out.weight += piece.stats.weight;
      out.shieldRegen *= piece.stats.regen;
      out.shieldDelay += piece.stats.regenDelay;
      out.maxHp += piece.bonus.maxHp;
      out.maxStamina += piece.bonus.maxStamina;
      out.maxMana += piece.bonus.maxMana;
      out.thorns += piece.bonus.thorns;
    }

    const set = DS.Armor.setBonus(worn);
    if (set) {
      out.setBonus = set;
      if (set.moveSpeed) out.moveSpeed *= (1 + set.moveSpeed);
      if (set.airJump) out.airJumpBonus += set.airJump;
      if (set.regen) out.shieldRegen *= set.regen;
      if (set.damage) out.damageBonus = (out.damageBonus || 0) + set.damage;
      if (set.shieldMult) out.shield *= set.shieldMult;
      if (set.noKnockback) out.noKnockback = true;
      if (set.coinBonus) out.coinBonus += set.coinBonus;
      if (set.maxMana) out.maxMana += set.maxMana;
      if (set.skillDiscount) out.skillDiscount = (out.skillDiscount || 0) + set.skillDiscount;
      if (set.thorns) out.thorns += set.thorns;
    }

    out.shield = Math.round(out.shield);
    // Every point of weight shaves 2% off movement.
    out.moveSpeed *= Math.max(0.45, 1 - out.weight * 0.02);
    return out;
  }

  // --- bag ------------------------------------------------------------------

  function bagFull(inv) { return inv.bag.length >= BAG_SIZE; }

  /* A rarer piece of armour goes straight on. The worn one is bagged, or, when
     the bag is full, handed back as `overflow` for the caller to drop at the
     player's feet — addItem has no world to drop it into. */
  function addItem(inv, item) {
    if (DS.Armor.isArmor(item)) {
      const current = inv.armor[item.slot];
      if (!current) { inv.armor[item.slot] = item; return { ok: true, where: 'armor' }; }
      if (item.rarity > current.rarity) {
        inv.armor[item.slot] = item;
        const overflow = bagFull(inv) ? current : null;
        if (!overflow) inv.bag.push(current);
        return { ok: true, where: 'upgrade', replaced: current, overflow: overflow };
      }
      if (bagFull(inv)) return { ok: false, reason: 'BAG FULL' };
      inv.bag.push(item);
      return { ok: true, where: 'bag' };
    }

    if (!inv.equipped[1]) {           // second weapon slot is free — fill it first
      inv.equipped[1] = item;
      return { ok: true, where: 'slot', essence: unlockFromItem(inv, item) };
    }
    if (bagFull(inv)) return { ok: false, reason: 'BAG FULL' };
    inv.bag.push(item);
    return { ok: true, where: 'bag', essence: unlockFromItem(inv, item) };
  }

  // Equip a bagged item into the active slot; whatever was held goes to the bag.
  function equipFromBag(inv, index) {
    const item = inv.bag[index];
    if (!item) return false;

    if (DS.Armor.isArmor(item)) {
      const previous = inv.armor[item.slot];
      inv.armor[item.slot] = item;
      inv.bag.splice(index, 1);
      if (previous) inv.bag.splice(index, 0, previous);
      return true;
    }

    const current = inv.equipped[inv.active];
    inv.equipped[inv.active] = item;
    inv.bag.splice(index, 1);
    if (current) inv.bag.splice(index, 0, current);
    unlockFromItem(inv, item);
    return true;
  }

  /* --- addressable slots ---------------------------------------------------

     Everything the player owns can be named by a reference:

       { kind: 'bag',    index }
       { kind: 'weapon', index: 0 | 1 }
       { kind: 'armor',  slot: 'head' | 'chest' | 'legs' }

     which is what lets the inventory screen drag an item from anywhere to
     anywhere without the screen knowing how any of it is stored. */

  function readRef(inv, ref) {
    if (!ref) return null;
    if (ref.kind === 'bag') return inv.bag[ref.index] || null;
    if (ref.kind === 'weapon') return inv.equipped[ref.index] || null;
    if (ref.kind === 'armor') return inv.armor[ref.slot] || null;
    return null;
  }

  // Would this slot hold this item? Bags hold anything; the others are typed.
  function accepts(ref, item) {
    if (!item) return true;
    if (ref.kind === 'bag') return true;
    if (ref.kind === 'weapon') return !DS.Armor.isArmor(item);
    if (ref.kind === 'armor') return DS.Armor.isArmor(item) && item.slot === ref.slot;
    return false;
  }

  function sameRef(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'armor') return a.slot === b.slot;
    return a.index === b.index;
  }

  /* Move an item from one slot to another, swapping with whatever is already
     there when both ends will take each other. Returns { ok, reason } so the
     screen can say why a drop was refused rather than silently snapping the
     item back. */
  function moveTo(inv, from, to) {
    if (sameRef(from, to)) return { ok: true, moved: false };

    const moving = readRef(inv, from);
    if (!moving) return { ok: false, reason: 'NOTHING TO MOVE' };

    const target = readRef(inv, to);
    if (!accepts(to, moving)) {
      return { ok: false, reason: to.kind === 'weapon' ? 'NOT A WEAPON' : 'WRONG SLOT' };
    }
    if (target && !accepts(from, target)) return { ok: false, reason: 'CANNOT SWAP' };
    if (!target && to.kind === 'bag' && from.kind !== 'bag' && bagFull(inv)) {
      return { ok: false, reason: 'BAG FULL' };
    }

    // Bag to bag is a straight swap or a reorder into an empty cell.
    if (from.kind === 'bag' && to.kind === 'bag') {
      if (to.index < inv.bag.length) {
        inv.bag[from.index] = target;
        inv.bag[to.index] = moving;
      } else {
        inv.bag.splice(from.index, 1);
        inv.bag.push(moving);
      }
      return { ok: true, moved: true };
    }

    if (from.kind === 'bag') {
      writeRef(inv, to, moving);
      if (target) inv.bag[from.index] = target;
      else inv.bag.splice(from.index, 1);
      return { ok: true, moved: true };
    }

    if (to.kind === 'bag') {
      if (to.index < inv.bag.length) inv.bag[to.index] = moving;
      else inv.bag.push(moving);
      writeRef(inv, from, target && to.index < inv.bag.length ? target : null);
      return { ok: true, moved: true };
    }

    // Slot to slot: weapon hand to weapon hand, or armour piece to its twin.
    writeRef(inv, to, moving);
    writeRef(inv, from, target);
    return { ok: true, moved: true };
  }

  function writeRef(inv, ref, item) {
    if (ref.kind === 'weapon') inv.equipped[ref.index] = item || null;
    else if (ref.kind === 'armor') inv.armor[ref.slot] = item || null;
  }

  // Lift an item out of any slot, leaving it empty. Used to drop on the floor.
  function takeFrom(inv, ref) {
    const item = readRef(inv, ref);
    if (!item) return null;
    if (ref.kind === 'bag') inv.bag.splice(ref.index, 1);
    else writeRef(inv, ref, null);
    return item;
  }

  function swapActive(inv) {
    if (!inv.equipped[1 - inv.active]) return false;
    inv.active = 1 - inv.active;
    return true;
  }

  function dropFromBag(inv, index) {
    if (!inv.bag[index]) return null;
    return inv.bag.splice(index, 1)[0];
  }

  function addCoins(inv, amount, stats) {
    const mult = 1 + (stats ? stats.coinBonus : 0);
    const total = Math.max(1, Math.round(amount * mult));
    inv.coins += total;
    return total;
  }

  // --- enchant table --------------------------------------------------------

  const SALVAGE_VALUE = [2, 4, 8, 15, 28];

  function salvageValue(item) {
    return SALVAGE_VALUE[DS.M.clamp(item.rarity, 0, W.MAX_RARITY)];
  }

  /* Reroll gets more expensive each time on the same item, so the table cannot
     be farmed into a perfect roll with enough patience alone. */
  function rerollCost(item) {
    return { coins: 20 + item.rerolls * 12 + item.rarity * 6, shards: 0 };
  }

  function addAffixCost(item) {
    return { coins: 35 + item.rarity * 15, shards: 2 + item.rarity };
  }

  function upgradeCost(item) {
    return { coins: 40 + item.rarity * 25, shards: 5 + item.rarity * 6 };
  }

  function canAfford(inv, cost) {
    return inv.coins >= cost.coins && inv.shards >= cost.shards;
  }

  function pay(inv, cost) {
    inv.coins -= cost.coins;
    inv.shards -= cost.shards;
  }

  function slotsFor(item) { return W.RARITY[item.rarity].slots; }

  function reroll(inv, item, rng) {
    if (!item.affixes.length) return { ok: false, reason: 'NO AFFIXES' };
    const cost = rerollCost(item);
    if (!canAfford(inv, cost)) return { ok: false, reason: 'CANNOT AFFORD' };

    pay(inv, cost);
    item.affixes = AFX.roll(rng, item.affixes.length);
    item.rerolls++;
    Loot.computeStats(item);
    return { ok: true };
  }

  function addAffix(inv, item, rng) {
    if (item.affixes.length >= slotsFor(item)) return { ok: false, reason: 'NO FREE SLOT' };
    const cost = addAffixCost(item);
    if (!canAfford(inv, cost)) return { ok: false, reason: 'CANNOT AFFORD' };

    pay(inv, cost);
    const taken = item.affixes.map(function (a) { return a.key; });
    const extra = AFX.roll(rng, 1, taken);
    if (extra.length) item.affixes.push(extra[0]);
    Loot.computeStats(item);
    return { ok: true };
  }

  function upgradeRarity(inv, item) {
    if (item.rarity >= W.MAX_RARITY) return { ok: false, reason: 'ALREADY LEGENDARY' };
    const cost = upgradeCost(item);
    if (!canAfford(inv, cost)) return { ok: false, reason: 'CANNOT AFFORD' };

    pay(inv, cost);
    item.rarity++;
    Loot.computeStats(item);
    return { ok: true };
  }

  function salvage(inv, item, source, index) {
    const value = salvageValue(item);
    if (source === 'bag') inv.bag.splice(index, 1);
    else if (source === 'slot') {
      if (index === inv.active && !inv.equipped[1 - inv.active]) {
        return { ok: false, reason: 'NEED A WEAPON' };
      }
      inv.equipped[index] = null;
      if (index === inv.active) inv.active = 1 - index;
    }
    inv.shards += value;
    return { ok: true, shards: value };
  }

  // --- elemental infusion ---------------------------------------------------

  /* Genshin-style infusion. Essences are run-scoped and live on the inventory;
     once an element is known, ANY weapon can carry it. R cycles the held
     weapon forward through the known elements, T cycles back (Shift+R would
     also fire dash, which lives on Shift). Pad: the View/Select button.

     Unlock sources:
       - picking up (or equipping) a weapon that dropped with an element
       - a shrine essence card (boon key 'essence:<element>', see boons.js)
       - every boss kill grants a random element you do not know yet
     The run starts with none; the starter sword gets STARTER_SHARE so its
     first infusion is worth having. */
  const INFUSE_COOLDOWN = 45;   // frames between two infusion switches
  const INFUSE_MANA = 8;        // a small price, so it is a choice not a tic
  const ESSENCE_BOON = 'essence:';

  // Known essences, always in the canonical element order so cycling is stable.
  function essences(inv) {
    const own = (inv && inv.essences) || [];
    const boons = (inv && inv.boons) || [];
    return W.ELEMENT_KEYS.filter(function (k) {
      return own.indexOf(k) >= 0 || boons.indexOf(ESSENCE_BOON + k) >= 0;
    });
  }

  function hasEssence(inv, element) { return essences(inv).indexOf(element) >= 0; }

  // Returns the element when it was newly learned, null when already known.
  function unlockEssence(inv, element) {
    if (!inv || !W.ELEMENTS[element] || hasEssence(inv, element)) return null;
    if (!inv.essences) inv.essences = [];
    inv.essences.push(element);
    return element;
  }

  function unlockFromItem(inv, item) {
    if (!item || DS.Armor.isArmor(item)) return null;
    return unlockEssence(inv, W.nativeElement(item));
  }

  function lockedEssences(inv) {
    return W.ELEMENT_KEYS.filter(function (k) { return !hasEssence(inv, k); });
  }

  // The elements this weapon can be switched between: every known essence
  // plus whatever it dropped with.
  function infusionRing(inv, item) {
    const native = W.nativeElement(item);
    return W.ELEMENT_KEYS.filter(function (k) {
      return k === native || hasEssence(inv, k);
    });
  }

  /* The element the next press lands on, or null when there is nowhere to go.
     A weapon whose live element is not on the ring (a plain starter) enters
     at the first known element going forward and at the last going back. */
  function nextInfusion(inv, item, dir) {
    const ring = infusionRing(inv, item);
    if (!ring.length) return null;
    const live = W.activeElement(item);
    const at = ring.indexOf(live);
    let next;
    if (at < 0) next = dir < 0 ? ring[ring.length - 1] : ring[0];
    else next = ring[(at + (dir < 0 ? ring.length - 1 : 1)) % ring.length];
    return next === live ? null : next;
  }

  /* Push an element into a weapon (null clears the infusion). Infusing with the
     weapon's own element is the same as clearing it. Stats are rebuilt because
     the element share follows the live element. */
  function setInfusion(item, element) {
    if (!item || DS.Armor.isArmor(item)) return false;
    const native = W.nativeElement(item);
    if (item.baseElement === undefined) item.baseElement = native;
    const next = element && W.ELEMENTS[element] ? element : null;
    item.infusion = next && next !== native ? next : null;
    item.element = item.infusion || native;
    Loot.computeStats(item);
    return true;
  }

  /* The whole press: cooldown, mana, the switch, and the feedback. Returns
     { ok, element } or { ok: false, reason } so tests and callers can tell a
     refusal from a switch. */
  function tryInfuse(g, p, dir) {
    const inv = p.inv;
    const item = weapon(inv);
    if (!item) return { ok: false, reason: 'NO WEAPON' };
    if ((p.infuseCooldown || 0) > 0) return { ok: false, reason: 'COOLDOWN' };

    if (!essences(inv).length) {
      feedback(g, 'NO ESSENCES YET - FIND ELEMENTAL WEAPONS', '#9b96b8', 'error');
      return { ok: false, reason: 'NO ESSENCES' };
    }
    const next = nextInfusion(inv, item, dir);
    if (!next) {
      feedback(g, 'NO OTHER ESSENCE KNOWN', '#9b96b8', 'error');
      return { ok: false, reason: 'NO OTHER ESSENCE' };
    }
    if ((p.mana || 0) < INFUSE_MANA) {
      feedback(g, 'NOT ENOUGH MANA TO INFUSE', '#4fb3e0', 'error');
      return { ok: false, reason: 'NO MANA' };
    }

    p.mana -= INFUSE_MANA;
    p.infuseCooldown = INFUSE_COOLDOWN;
    setInfusion(item, next);
    if (p.refreshStats) p.refreshStats();

    const E = W.ELEMENTS[next];
    const passive = DS.Elements && DS.Elements.PASSIVE && DS.Elements.PASSIVE[next];
    feedback(g, 'INFUSED ' + E.label.toUpperCase() + (passive ? ' - ' + passive.name : ''),
             E.color, E.sfx);
    if (DS.FX && DS.FX.ring && DS.Ent) {
      DS.FX.ring(DS.Ent.centerX(p), DS.Ent.centerY(p), 12, E.color, 1.8);
    }
    if (g && g.onInfuse) g.onInfuse(item, next);
    return { ok: true, element: next };
  }

  function feedback(g, text, color, sfx) {
    if (g && g.toast) g.toast(text, color);
    if (DS.Audio && sfx) DS.Audio.play(sfx);
  }

  // Per-frame: tick the cooldown and read the two infusion actions.
  function updateInfusion(g, p) {
    if (!p || p.dead) return null;
    if (p.infuseCooldown > 0) p.infuseCooldown--;
    const In = DS.Input;
    if (!In) return null;
    let dir = 0;
    if (In.justPressed('infuse')) { In.consume('infuse'); dir = 1; }
    else if (In.justPressed('infuseBack')) { In.consume('infuseBack'); dir = -1; }
    return dir ? tryInfuse(g, p, dir) : null;
  }

  /* A boss kill teaches an element you do not have yet, picked at random so
     two runs do not unlock in the same order. */
  function grantRandomEssence(inv, rng) {
    const locked = lockedEssences(inv);
    if (!locked.length) return null;
    const pick = rng && rng.pick ? rng.pick(locked) : locked[0];
    return unlockEssence(inv, pick);
  }

  // Banner for a newly learned essence; shared by pickups, shrines and bosses.
  function announceEssence(g, element) {
    const E = element && W.ELEMENTS[element];
    if (!E || !g || !g.showBanner) return;
    g.showBanner('ESSENCE OF ' + E.label.toUpperCase(),
                 'R / T TO INFUSE ANY WEAPON', E.color);
  }

  function grantBossEssence(g) {
    if (!g || !g.inv) return null;
    const el = grantRandomEssence(g.inv, g.rng);
    if (el) announceEssence(g, el);
    return el;
  }

  // Best item held anywhere, for the game-over summary.
  /* The run summary asks "what did you fight with", so armour and every other
     non-weapon is out, and a tie is broken toward the weapon actually in hand
     rather than whatever happens to sit first in the bag. */
  function bestWeapon(inv) {
    const held = inv.equipped[inv.active] || null;
    const all = inv.equipped.concat(inv.bag);
    let best = null;
    for (let i = 0; i < all.length; i++) {
      const it = all[i];
      if (!it || !DS.Weapons.WEAPONS[it.type]) continue;
      if (!best) { best = it; continue; }
      const better = it.rarity > best.rarity ||
        (it.rarity === best.rarity && (it.stats.damage || 0) > (best.stats.damage || 0)) ||
        (it.rarity === best.rarity && (it.stats.damage || 0) === (best.stats.damage || 0) &&
         it === held);
      if (better) best = it;
    }
    return best || held;
  }


  /* The merchant, who stands next to the enchant table in every safe room.
     Coins buy consumables and run-scoped upgrades; shards stay the enchanting
     currency, and the shard pouch is the bridge between the two. */
  const SHOP = (function () {

    function makeStock(rng, depth) {
      const stock = [
        { key: 'bread',  label: 'BREAD',        desc: 'RESTORE 2 HEARTS',  coins: 20 + depth * 5,  kind: 'heal',    amount: 2 },
        { key: 'quiver', label: 'QUIVER',       desc: '+15 ARROWS',        coins: 16 + depth * 3,  kind: 'arrows',  amount: 15 },
        { key: 'pouch',  label: 'SHARD POUCH',  desc: '+4 SHARDS',         coins: 50 + depth * 12, kind: 'shards',  amount: 4 },
        { key: 'vessel', label: 'HEART VESSEL', desc: '+1 MAX HEART',      coins: 80 + depth * 20, kind: 'maxhp',   amount: 1 },
        { key: 'boots',  label: 'SWIFT BOOTS',  desc: '+1 DASH CHARGE',    coins: 95 + depth * 22, kind: 'dash',    amount: 1 },
        { key: 'flask',  label: 'GREEN FLASK',  desc: '+30 MAX STAMINA',   coins: 45 + depth * 10, kind: 'stamina', amount: 30 }
      ];

      // One weapon on the rack, priced by what it rolled.
      const item = Loot.makeItem(rng, depth, { bias: 0.8 });
      stock.push({
        key: 'weapon', label: item.name, desc: 'DMG ' + item.stats.damage,
        coins: 45 + item.rarity * 60 + depth * 12, kind: 'item', item: item
      });

      // Vessels and boots are the run-defining buys, so only one shows up.
      const luxury = rng.chance(0.5) ? 'vessel' : 'boots';
      return stock.filter(function (entry) {
        return entry.key === luxury || (entry.key !== 'vessel' && entry.key !== 'boots');
      });
    }

    function buy(g, entry) {
      const inv = g.inv;
      if (entry.sold) return { ok: false, reason: 'SOLD OUT' };
      if (inv.coins < entry.coins) return { ok: false, reason: 'NOT ENOUGH COINS' };

      const p = g.player;

      if (entry.kind === 'heal') {
        if (p.hp >= p.stats.maxHp) return { ok: false, reason: 'ALREADY FULL' };
        p.hp = Math.min(p.stats.maxHp, p.hp + entry.amount);
      } else if (entry.kind === 'arrows') {
        inv.arrows = Math.min(60, inv.arrows + entry.amount);
      } else if (entry.kind === 'shards') {
        inv.shards += entry.amount;
      } else if (entry.kind === 'maxhp') {
        inv.perks.maxHp += entry.amount;
      } else if (entry.kind === 'dash') {
        inv.perks.dashCharges += entry.amount;
      } else if (entry.kind === 'stamina') {
        inv.perks.maxStamina += entry.amount;
      } else if (entry.kind === 'item') {
        const result = addItem(inv, entry.item);
        if (!result.ok) return { ok: false, reason: result.reason };
        if (result.overflow) {
          DS.Ent.addPickup(g, DS.Ent.centerX(p), p.y, 'item', result.overflow, 1);
        }
      }

      inv.coins -= entry.coins;
      entry.sold = true;
      p.refreshStats();
      return { ok: true };
    }

    return { makeStock: makeStock, buy: buy };
  })();

  DS.Shop = SHOP;

  DS.Inv = {
    BAG_SIZE: BAG_SIZE,
    BASE: BASE,
    create: create,
    weapon: weapon,
    offhand: offhand,
    derive: derive,
    addItem: addItem,
    bagFull: bagFull,
    equipFromBag: equipFromBag,
    readRef: readRef,
    accepts: accepts,
    moveTo: moveTo,
    takeFrom: takeFrom,
    swapActive: swapActive,
    dropFromBag: dropFromBag,
    addCoins: addCoins,
    salvageValue: salvageValue,
    rerollCost: rerollCost,
    addAffixCost: addAffixCost,
    upgradeCost: upgradeCost,
    canAfford: canAfford,
    slotsFor: slotsFor,
    reroll: reroll,
    addAffix: addAffix,
    upgradeRarity: upgradeRarity,
    salvage: salvage,
    applyArmor: applyArmor,
    bestWeapon: bestWeapon,
    INFUSE_COOLDOWN: INFUSE_COOLDOWN,
    INFUSE_MANA: INFUSE_MANA,
    ESSENCE_BOON: ESSENCE_BOON,
    essences: essences,
    hasEssence: hasEssence,
    unlockEssence: unlockEssence,
    unlockFromItem: unlockFromItem,
    lockedEssences: lockedEssences,
    infusionRing: infusionRing,
    nextInfusion: nextInfusion,
    setInfusion: setInfusion,
    tryInfuse: tryInfuse,
    updateInfusion: updateInfusion,
    grantRandomEssence: grantRandomEssence,
    grantBossEssence: grantBossEssence,
    announceEssence: announceEssence
  };
})(window.DS);
