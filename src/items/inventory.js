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
      boons: []
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

  function addItem(inv, item) {
    if (DS.Armor.isArmor(item)) {
      const current = inv.armor[item.slot];
      if (!current) { inv.armor[item.slot] = item; return { ok: true, where: 'armor' }; }
      if (bagFull(inv)) return { ok: false, reason: 'BAG FULL' };
      inv.bag.push(item);
      return { ok: true, where: 'bag' };
    }

    if (!inv.equipped[1]) {           // second weapon slot is free — fill it first
      inv.equipped[1] = item;
      return { ok: true, where: 'slot' };
    }
    if (bagFull(inv)) return { ok: false, reason: 'BAG FULL' };
    inv.bag.push(item);
    return { ok: true, where: 'bag' };
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
    bestWeapon: bestWeapon
  };
})(window.DS);
