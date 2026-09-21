/* Armour: three slots, eight materials, freely mixed.

   Armour does not reduce damage. With six hearts and one-point hits, flat
   reduction turns straight into invulnerability. Instead each piece grants
   Shield — a separate bar that soaks hits and regenerates a few seconds after
   the last one. Weight is the cost: the heavier you dress, the slower you move.

   A full set of one material adds a bonus on top, which is what makes a gold
   helm on an obsidian body a real decision rather than pure arithmetic. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const SLOTS = ['head', 'chest', 'legs'];

  const SLOT_LABEL = { head: 'Helm', chest: 'Chestplate', legs: 'Greaves' };

  /* mid/dark/light are the palette the paper doll paints the hero with. */
  const MATERIALS = {
    cloth: {
      key: 'cloth', label: 'Cloth', shield: 2, weight: 0, tier: 0,
      mid: '#9b96b8', dark: '#514c72', light: '#d8d5e8',
      set: { key: 'nimble', desc: 'FULL CLOTH: +12% MOVE SPEED', moveSpeed: 0.12 }
    },
    leaf: {
      key: 'leaf', label: 'Leaf', shield: 3, weight: 0, tier: 1,
      mid: '#5cbf62', dark: '#1b4436', light: '#a3e86b',
      set: { key: 'grove', desc: 'FULL LEAF: +20% SPEED, +1 AIR JUMP',
             moveSpeed: 0.20, airJump: 1 }
    },
    leather: {
      key: 'leather', label: 'Leather', shield: 5, weight: 1, tier: 1,
      mid: '#8a6340', dark: '#2e2018', light: '#b98d5c',
      set: { key: 'tanner', desc: 'FULL LEATHER: SHIELD REGENERATES TWICE AS FAST',
             regen: 2 }
    },
    bone: {
      key: 'bone', label: 'Bone', shield: 7, weight: 1, tier: 2,
      mid: '#d8d5e8', dark: '#6f6a90', light: '#ffffff',
      set: { key: 'ossuary', desc: 'FULL BONE: +15% DAMAGE, -30% SHIELD',
             damage: 0.15, shieldMult: 0.7 }
    },
    iron: {
      key: 'iron', label: 'Iron', shield: 10, weight: 3, tier: 3,
      mid: '#6f6a90', dark: '#2a2740', light: '#9b96b8',
      set: { key: 'bulwark', desc: 'FULL IRON: IMMUNE TO KNOCKBACK',
             noKnockback: true }
    },
    gold: {
      key: 'gold', label: 'Gold', shield: 9, weight: 2, tier: 3,
      mid: '#f2c14e', dark: '#8a7440', light: '#fff0a8',
      set: { key: 'midas', desc: 'FULL GOLD: +40% COINS, +1 SHARD PER CHEST',
             coinBonus: 0.40, chestShards: 1 }
    },
    crystal: {
      key: 'crystal', label: 'Crystal', shield: 12, weight: 2, tier: 4,
      mid: '#4fb3e0', dark: '#16324f', light: '#a8e4ff',
      set: { key: 'resonance', desc: 'FULL CRYSTAL: +40 MANA, SKILLS COST 25% LESS',
             maxMana: 40, skillDiscount: 0.25 }
    },
    obsidian: {
      key: 'obsidian', label: 'Obsidian', shield: 14, weight: 4, tier: 4,
      mid: '#7f45b8', dark: '#1c1a2b', light: '#c86ee0',
      set: { key: 'shardskin', desc: 'FULL OBSIDIAN: REFLECTS 50% OF CONTACT DAMAGE',
             thorns: 0.5 }
    }
  };

  const MATERIAL_KEYS = Object.keys(MATERIALS);

  // Silhouette weight class, chosen by material tier — heavier metals look bulkier.
  function styleFor(material) {
    const tier = MATERIALS[material].tier;
    return tier <= 1 ? 'light' : tier <= 3 ? 'medium' : 'heavy';
  }

  /* Defensive suffixes. Armour rolls from its own pool so a chestplate never
     comes back with "+22% attack speed". */
  const ARMOR_AFFIXES = [
    { key: 'turtle',  name: 'of the Turtle', color: '#5cbf62', kind: 'suffix',
      desc: '+6 SHIELD', armor: { shield: 6 } },
    { key: 'wind',    name: 'of the Wind',   color: '#a8e4ff', kind: 'suffix',
      desc: '-2 WEIGHT', armor: { weight: -2 } },
    { key: 'warding', name: 'of Warding',    color: '#4fb3e0', kind: 'suffix',
      desc: 'SHIELD RETURNS SOONER', armor: { regenDelay: -90 } },
    { key: 'bear2',   name: 'of the Ox',     color: '#b98d5c', kind: 'suffix',
      desc: '+1 MAX HEART', armor: { maxHp: 1 } },
    { key: 'mender',  name: 'of Mending',    color: '#a3e86b', kind: 'suffix',
      desc: 'SHIELD REGENERATES FASTER', armor: { regen: 1.6 } },
    { key: 'vigour',  name: 'of Vigour',     color: '#f2c14e', kind: 'suffix',
      desc: '+25 STAMINA', armor: { maxStamina: 25 } },
    { key: 'focus',   name: 'of Focus',      color: '#c86ee0', kind: 'suffix',
      desc: '+30 MANA', armor: { maxMana: 30 } },
    { key: 'spite',   name: 'of Spite',      color: '#c0303c', kind: 'suffix',
      desc: 'REFLECTS 25% CONTACT DAMAGE', armor: { thorns: 0.25 } }
  ];

  let nextId = 10000;

  function computeArmor(item) {
    const mat = MATERIALS[item.material];
    const rarity = DS.Weapons.RARITY[item.rarity];
    const depthScale = 1 + (item.depth - 1) * 0.22;

    const stats = {
      shield: mat.shield * rarity.mult * depthScale,
      weight: mat.weight,
      regen: 1,
      regenDelay: 0
    };

    const bonus = { maxHp: 0, maxStamina: 0, maxMana: 0, thorns: 0 };

    for (let i = 0; i < item.affixes.length; i++) {
      const a = item.affixes[i].armor;
      if (!a) continue;
      if (a.shield) stats.shield += a.shield;
      if (a.weight) stats.weight += a.weight;
      if (a.regen) stats.regen *= a.regen;
      if (a.regenDelay) stats.regenDelay += a.regenDelay;
      if (a.maxHp) bonus.maxHp += a.maxHp;
      if (a.maxStamina) bonus.maxStamina += a.maxStamina;
      if (a.maxMana) bonus.maxMana += a.maxMana;
      if (a.thorns) bonus.thorns += a.thorns;
    }

    stats.shield = Math.max(1, Math.round(stats.shield));
    stats.weight = Math.max(0, stats.weight);

    item.stats = stats;
    item.bonus = bonus;
    item.name = buildName(item);
    return item;
  }

  function buildName(item) {
    const mat = MATERIALS[item.material];
    let suffix = '';
    for (let i = 0; i < item.affixes.length; i++) {
      if (!suffix) suffix = ' ' + item.affixes[i].name;
    }
    return (mat.label + ' ' + SLOT_LABEL[item.slot] + suffix).trim();
  }

  /* Material availability climbs with depth, so early floors hand out cloth and
     leaf and the good metals stay something to descend for. */
  function materialWeights(depth) {
    return MATERIAL_KEYS.map(function (key) {
      const tier = MATERIALS[key].tier;
      const reach = depth / 2.5;
      // Tiers above the player's depth are rare but never impossible.
      const weight = tier <= reach ? 20 - tier * 2 : Math.max(0.6, 6 - (tier - reach) * 4);
      return { weight: weight, value: key };
    });
  }

  function makeArmor(rng, depth, opts) {
    opts = opts || {};

    const slot = opts.slot || rng.pick(SLOTS);
    const material = opts.material || rng.weighted(materialWeights(depth));

    let rarity = opts.rarity;
    if (rarity == null) rarity = rng.weighted(DS.Loot.rarityWeights(depth, opts.bias));
    if (opts.minRarity != null) rarity = Math.max(rarity, opts.minRarity);
    if (opts.maxRarity != null) rarity = Math.min(rarity, opts.maxRarity);
    rarity = DS.M.clamp(rarity, 0, DS.Weapons.MAX_RARITY);

    // Armour carries at most two suffixes even at legendary — it is defence,
    // not a second weapon.
    const slots = Math.min(2, DS.Weapons.RARITY[rarity].slots);

    const item = {
      id: nextId++,
      kind: 'armor',
      slot: slot,
      material: material,
      style: styleFor(material),
      rarity: rarity,
      depth: depth,
      affixes: rng.sample(ARMOR_AFFIXES, slots),
      rerolls: 0
    };

    return computeArmor(item);
  }

  // The set bonus, if all three worn pieces share a material.
  function setBonus(armor) {
    if (!armor.head || !armor.chest || !armor.legs) return null;
    const mat = armor.head.material;
    if (armor.chest.material !== mat || armor.legs.material !== mat) return null;
    return MATERIALS[mat].set;
  }

  function isArmor(item) { return !!item && item.kind === 'armor'; }

  DS.Armor = {
    SLOTS: SLOTS,
    SLOT_LABEL: SLOT_LABEL,
    MATERIALS: MATERIALS,
    MATERIAL_KEYS: MATERIAL_KEYS,
    ARMOR_AFFIXES: ARMOR_AFFIXES,
    makeArmor: makeArmor,
    computeArmor: computeArmor,
    setBonus: setBonus,
    isArmor: isArmor,
    styleFor: styleFor
  };
})(window.DS);
