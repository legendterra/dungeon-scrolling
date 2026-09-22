/* Item creation: roll a type, a rarity, its affixes, then bake final stats.
   Also owns the loot tables that decide what enemies and chests hand out. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const W = DS.Weapons;
  const AFX = DS.Affixes;

  let nextId = 1;

  /* Recomputes stats/bonus/procs from base + rarity + affixes. Called on
     creation and again after every enchant, so an item is always consistent
     with the affixes it currently carries. */
  function computeStats(item) {
    const base = W.WEAPONS[item.type];
    const rarity = W.RARITY[item.rarity];
    const scale = W.depthScale(item.depth);

    const stats = {
      damage: base.damage * rarity.mult * scale,
      cooldown: base.cooldown,
      crit: base.crit,
      critDamage: 1.6,
      knockback: base.knockback,
      stamina: base.stamina || 0,
      mana: base.mana || 0,
      reach: 1
    };

    const bonus = {
      maxHp: 0, maxStamina: 0, staminaRegen: 0, maxMana: 0, manaRegen: 0,
      moveSpeed: 0, dashCharges: 0, coinBonus: 0, thorns: 0,
      iframes: 0, jump: 0, arrowBonus: 0, critDamage: 0
    };

    const procs = {};

    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];

      if (a.mods) {
        // Multipliers compose; crit is a flat addition because it is a chance.
        if (a.mods.damage) stats.damage *= a.mods.damage;
        if (a.mods.cooldown) stats.cooldown *= a.mods.cooldown;
        if (a.mods.knockback) stats.knockback *= a.mods.knockback;
        if (a.mods.reach) stats.reach *= a.mods.reach;
        if (a.mods.crit) stats.crit += a.mods.crit;
      }

      if (a.bonus) {
        for (const key in a.bonus) {
          if (Object.prototype.hasOwnProperty.call(a.bonus, key)) {
            bonus[key] = (bonus[key] || 0) + a.bonus[key];
          }
        }
      }

      if (a.proc) {
        for (const key in a.proc) {
          if (Object.prototype.hasOwnProperty.call(a.proc, key)) {
            procs[key] = a.proc[key];
          }
        }
      }
    }

    stats.damage = Math.max(1, Math.round(stats.damage));
    stats.cooldown = Math.max(6, Math.round(stats.cooldown));
    stats.crit = DS.M.clamp(stats.crit, 0, 0.85);
    stats.critDamage += bonus.critDamage;

    /* How much of this weapon's damage arrives as its element, and how hard
       its reactions hit. Rarity decides the split - a common blade is mostly
       steel with an elemental edge, a legendary is mostly element - so the
       same archetype keeps improving after the base damage curve flattens.
       Elemental Power (bonus.elemPower, an affix/boon stat) scales reactions
       only, which is what makes a build feel different rather than bigger. */
    stats.elementShare = item.element ? W.ELEMENT_SHARE[item.rarity] : 0;
    stats.elemPower = 1 + (bonus.elemPower || 0);

    item.stats = stats;
    item.bonus = bonus;
    item.procs = procs;
    item.name = buildName(item);
    return item;
  }

  function buildName(item) {
    const base = W.WEAPONS[item.type];
    let prefix = '', suffix = '';

    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i];
      if (a.kind === 'prefix' && !prefix) prefix = a.name + ' ';
      else if (a.kind === 'suffix' && !suffix) suffix = ' ' + a.name;
    }

    let label = base.label;
    if (item.element) label = W.ELEMENTS[item.element].label + ' ' + label;

    return (prefix + label + suffix).trim();
  }

  /* Rarity odds shift upward with depth and with any luck bonus a chest adds. */
  function rarityWeights(depth, bias) {
    bias = bias || 0;
    const push = (depth - 1) * 0.22 + bias;
    return W.RARITY.map(function (r, i) {
      // Higher tiers gain weight with depth; common loses it.
      const factor = i === 0 ? Math.max(0.15, 1 - push * 0.55) : 1 + push * i * 0.8;
      return { weight: r.weight * factor, value: i };
    });
  }

  /* A drop is a weapon or a piece of armour. The total drop rate is unchanged;
     the split just decides which kind lands, so bags fill no faster than before. */
  const ARMOR_SHARE = 0.45;

  function makeDrop(rng, depth, opts) {
    if (rng.chance(ARMOR_SHARE)) return DS.Armor.makeArmor(rng, depth, opts);
    return makeItem(rng, depth, opts);
  }

  /* opts: { type, rarity, minRarity, maxRarity, bias, element } */
  function makeItem(rng, depth, opts) {
    opts = opts || {};

    const type = opts.type || rng.pick(W.WEAPON_KEYS);

    let rarity = opts.rarity;
    if (rarity == null) rarity = rng.weighted(rarityWeights(depth, opts.bias));
    if (opts.minRarity != null) rarity = Math.max(rarity, opts.minRarity);
    if (opts.maxRarity != null) rarity = Math.min(rarity, opts.maxRarity);
    rarity = DS.M.clamp(rarity, 0, W.MAX_RARITY);

    const item = {
      id: nextId++,
      type: type,
      rarity: rarity,
      depth: depth,
      affixes: AFX.roll(rng, W.RARITY[rarity].slots),
      element: null,
      rerolls: 0
    };

    /* EVERY weapon carries an element now. Only the archetype that is all
       element all the time (the staff) used to roll one, which meant a sword,
       axe, spear, dagger or bow could not take part in the reaction system at
       all unless it happened to roll an elemental prefix. The run's first
       weapon stays deliberately plain (see startingWeapon). */
    if (!opts.noElement) {
      item.element = opts.element || rng.pick(W.ELEMENT_KEYS);
    }

    return computeStats(item);
  }

  // The weapon every run begins with: a plain, unremarkable sword.
  /* The run always opens on the plainest possible weapon: common rarity, no
     affixes, no element. Only the archetype is the player's to choose. */
  function startingWeapon(type) {
    const rng = DS.makeRng(1);
    const key = W.WEAPONS[type] ? type : 'sword';
    return makeItem(rng, 1, { type: key, rarity: 0, noElement: true });
  }

  // --- loot tables ----------------------------------------------------------

  const DROP_CHANCE = {
    normal: 0.18,
    elite: 0.55,
    boss: 1.0,
    heart: 0.09   // chance a regular enemy leaves 1-2 hearts behind
  };

  /* Elemental drops. Enemies that died to (or while carrying) an element
     sometimes bleed a mote of it: a free elemental shard that feeds the
     player's own arsenal. More elements on the field, more elemental play. */
  const ELEM_SHARD_CHANCE = { normal: 0.18, elite: 0.65, miniboss: 0.85, boss: 1.0 };

  function elementShard(rng, depth, tier, element) {
    if (!element || !W.ELEMENT_KEYS) return null;
    if (!rng.chance(ELEM_SHARD_CHANCE[tier] || 0.08)) return null;
    // Pick a weapon archetype that can actually hold an element.
    const pool = W.WEAPON_KEYS.filter(function (k) { return W.WEAPONS[k].elemental; });
    if (!pool.length) return null;
    const type = rng.pick(pool);
    const rarity = tier === 'boss' || tier === 'miniboss' ? 2 : (rng.chance(0.25) ? 2 : 1);
    const gift = makeItem(rng, depth, { type: type, rarity: rarity, element: element });
    // Guarantee the matching elemental prefix so the gift always procs the
    // element it represents — a "Frozen" drop that does not freeze is a lie.
    const prefix = DS.Affixes.PREFIXES.find(function (a) {
      return a.proc && a.proc.element === element;
    });
    if (prefix) {
      gift.affixes = gift.affixes.filter(function (a) { return a !== prefix; });
      gift.affixes.unshift(prefix);
      computeStats(gift);
    }
    return gift;
  }

  const CHEST_TIERS = {
    wood:   { label: 'Wooden Chest',  minRarity: 0, maxRarity: 2, bias: 0.0, items: 1, coins: [8, 18],  locked: false },
    iron:   { label: 'Iron Chest',    minRarity: 1, maxRarity: 3, bias: 0.9, items: 1, coins: [18, 34], locked: true },
    cursed: { label: 'Cursed Chest',  minRarity: 3, maxRarity: 4, bias: 2.4, items: 1, coins: [30, 55], locked: false, ambush: 3 },
    /* The reward for a floor boss. Never rolled at random - it is placed
       inside a sealed vault, so it does not need a lock of its own. */
    vault:  { label: 'Vault Chest',   minRarity: 2, maxRarity: 4, bias: 2.0, items: 2, coins: [45, 80], locked: false }
  };

  const CHEST_WEIGHTS = [
    { weight: 62, value: 'wood' },
    { weight: 27, value: 'iron' },
    { weight: 11, value: 'cursed' }
  ];

  function rollChestTier(rng) { return rng.weighted(CHEST_WEIGHTS); }

  function chestLoot(rng, depth, tier, g) {
    const cfg = CHEST_TIERS[tier];
    const bonus = (g && DS.Modifiers.get(g, 'chestBonus')) || 0;
    const items = [];
    for (let i = 0; i < cfg.items; i++) {
      items.push(makeDrop(rng, depth, {
        minRarity: cfg.minRarity + bonus, maxRarity: cfg.maxRarity + bonus,
        bias: cfg.bias + bonus
      }));
    }
    return {
      items: items,
      coins: rng.int(cfg.coins[0], cfg.coins[1]),
      shards: tier === 'wood' ? rng.int(0, 1) : rng.int(1, 3)
    };
  }

  /* What an enemy leaves behind. kind is 'normal' | 'elite' | 'boss'. */
  /* g is optional; when present the floor modifier can suppress drops. */
  /* enemyStatusElement: optional override — the status element still ticking
     on the corpse, threaded in from the kill site. */
  function enemyLoot(rng, depth, kind, g, enemyStatusElement) {
    const out = { item: null, coins: 0, shards: 0, hearts: 0, key: false };

    out.coins = kind === 'boss' ? rng.int(30, 50)
              : kind === 'miniboss' ? rng.int(16, 30)
              : kind === 'elite' ? rng.int(8, 16)
              : rng.int(1, 5);

    // Which element was involved in this kill? The killing blow's element
    // first, then any status still ticking on the corpse (a burning body is
    // fire loot no matter what landed the last hit), else the aura the enemy
    // was carrying (a poisoned rat is poison loot waiting to happen).
    let elem = (g && g.lastHitElement) || (g && g.killElement) || null;
    if (!elem && g && enemyStatusElement) elem = enemyStatusElement;
    if (!elem && g && g.player && g.player.lastElement) elem = g.player.lastElement;

    if (kind === 'boss') {
      out.item = makeDrop(rng, depth, { minRarity: 2, bias: 2.0 });
      out.shards = rng.int(3, 6);
      out.hearts = 2;
    } else if (kind === 'miniboss') {
      // The key is the whole point of this fight, so it is never a roll.
      out.key = true;
      out.shards = rng.int(1, 3);
      out.hearts = rng.int(1, 2);
      out.item = makeDrop(rng, depth, { minRarity: 1, bias: 1.2 });
    } else if (kind === 'elite') {
      // Elites can cough up a spare key, but the mini-boss is the reliable one.
      out.key = rng.chance(0.35);
      out.shards = rng.int(0, 2);
      if (rng.chance(DROP_CHANCE.elite)) out.item = makeDrop(rng, depth, { bias: 0.8 });
      if (rng.chance(0.35)) out.hearts = 1;
    } else {
      if (rng.chance(DROP_CHANCE.normal)) out.item = makeDrop(rng, depth, {});
      // A rare, small heart drop — enough to keep a good run alive, not enough
      // to make the dungeon forgiving.
      if (rng.chance(DROP_CHANCE.heart)) out.hearts = rng.int(1, 2);
      if (rng.chance(0.06)) out.shards = 1;
    }

    /* The elemental bonus: an extra elemental weapon rolls IN ADDITION to the
       normal drop, so an elemental kill always feels like it taught you
       something. Boss/miniboss/elite get the generous rates. */
    if (elem) {
      const gift = elementShard(rng, depth, kind === 'normal' ? 'normal' : kind, elem);
      if (gift && !out.item) out.item = gift;
      else if (gift) out.item2 = gift;   // rare: two items from one kill
    }

    if (g && DS.Modifiers.has(g, 'noHearts')) out.hearts = 0;
    if (g && DS.Modifiers.has(g, 'noCoins')) out.coins = 0;

    return out;
  }

  DS.Loot = {
    makeItem: makeItem,
    makeDrop: makeDrop,
    computeStats: computeStats,
    buildName: buildName,
    rarityWeights: rarityWeights,
    startingWeapon: startingWeapon,
    rollChestTier: rollChestTier,
    chestLoot: chestLoot,
    enemyLoot: enemyLoot,
    CHEST_TIERS: CHEST_TIERS,
    DROP_CHANCE: DROP_CHANCE,
    ELEM_SHARD_CHANCE: ELEM_SHARD_CHANCE
  };
})(window.DS);
