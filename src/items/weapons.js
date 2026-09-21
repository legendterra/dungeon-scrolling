/* Weapon archetypes and rarity tiers — the tuning surface for combat.
   Every number a designer would want to touch lives in this file.

   holdMode decides what holding the attack button does:
     'heavy'   melee — the tap lands immediately, holding winds up a heavy blow
               that releases when you let go
     'release' ranged — nothing fires until you release, and the longer you
               held it the harder the shot hits                                */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  // Cooldowns and charge times are in frames at 60fps.
  const WEAPONS = {
    sword: {
      key: 'sword', label: 'Sword', icon: 'sword',
      damage: 8, cooldown: 26, crit: 0.08, knockback: 2.2, stamina: 6,
      combo: 3, hit: { w: 24, h: 16, oy: -1 },
      holdMode: 'heavy', chargeMax: 40, chargeBonus: 2.1, heavyReach: 1.35,
      blurb: 'Balanced three-hit combo'
    },
    dagger: {
      key: 'dagger', label: 'Dagger', icon: 'dagger',
      damage: 5, cooldown: 13, crit: 0.26, knockback: 1.1, stamina: 3,
      combo: 3, hit: { w: 18, h: 14, oy: 0 },
      holdMode: 'heavy', chargeMax: 26, chargeBonus: 2.5, heavyReach: 1.6,
      blurb: 'Fast, high crit, short reach'
    },
    greataxe: {
      key: 'greataxe', label: 'Greataxe', icon: 'greataxe',
      damage: 17, cooldown: 46, crit: 0.06, knockback: 4.6, stamina: 14,
      combo: 1, hit: { w: 30, h: 22, oy: -3 },
      holdMode: 'heavy', chargeMax: 48, chargeBonus: 1.9, heavyReach: 1.3,
      blurb: 'Slow, huge damage, big knockback'
    },
    spear: {
      key: 'spear', label: 'Spear', icon: 'spear',
      damage: 9, cooldown: 30, crit: 0.1, knockback: 2.6, stamina: 7,
      combo: 2, hit: { w: 34, h: 10, oy: 2 },
      holdMode: 'heavy', chargeMax: 36, chargeBonus: 2.0, heavyReach: 1.45,
      blurb: 'Long straight thrust, safe range'
    },
    bow: {
      key: 'bow', label: 'Bow', icon: 'bow',
      damage: 9, cooldown: 26, crit: 0.14, knockback: 1.4, stamina: 4,
      ranged: true, holdMode: 'release', chargeMax: 34, chargeBonus: 2.2,
      shot: { kind: 'arrow', speed: 4.4, gravity: 0.045, life: 150 },
      blurb: 'Hold to draw, release to loose'
    },
    staff: {
      key: 'staff', label: 'Staff', icon: 'staff',
      damage: 7, cooldown: 30, crit: 0.08, knockback: 1.8, stamina: 0, mana: 9,
      ranged: true, elemental: true,
      holdMode: 'release', chargeMax: 40, chargeBonus: 1.9,
      shot: { kind: 'orb', speed: 2.7, gravity: 0, life: 120 },
      blurb: 'Costs mana, charge for a bigger bolt'
    }
  };

  const WEAPON_KEYS = Object.keys(WEAPONS);

  // Frames of hold before a melee wind-up counts as a real charge.
  const CHARGE_MIN = 10;

  /* Rarity drives both how many affixes an item can hold and how strongly its
     base damage rolls. Weights are the drop distribution at depth 1; the
     generator shifts them toward the top as you descend. */
  const RARITY = [
    { key: 'common',    label: 'Common',    color: '#d8d5e8', slots: 0, mult: 1.00, weight: 55 },
    { key: 'uncommon',  label: 'Uncommon',  color: '#5cbf62', slots: 1, mult: 1.12, weight: 27 },
    { key: 'rare',      label: 'Rare',      color: '#4fb3e0', slots: 2, mult: 1.28, weight: 13 },
    { key: 'epic',      label: 'Epic',      color: '#c86ee0', slots: 3, mult: 1.50, weight: 4.5 },
    { key: 'legendary', label: 'Legendary', color: '#e8743b', slots: 4, mult: 1.85, weight: 0.5 }
  ];

  const MAX_RARITY = RARITY.length - 1;

  /* Eight elements. Each one has a distinct on-hit status and its own ground
     field; every pair of them reacts (28 pairs, all defined). The full
     behaviour lives in src/systems/elements.js - this table is only what the
     item layer needs. */
  const ELEMENTS = {
    fire:      { key: 'fire',      label: 'Fire',      color: '#e8743b', orb: 'fire',      sfx: 'fire' },
    ice:       { key: 'ice',       label: 'Ice',       color: '#4fb3e0', orb: 'ice',       sfx: 'ice' },
    lightning: { key: 'lightning', label: 'Lightning', color: '#f2c14e', orb: 'lightning', sfx: 'lightning' },
    poison:    { key: 'poison',    label: 'Poison',    color: '#5cbf62', orb: 'poison',    sfx: 'cast' },
    water:     { key: 'water',     label: 'Water',     color: '#2f6fa8', orb: 'water',     sfx: 'ice' },
    earth:     { key: 'earth',     label: 'Earth',     color: '#b98d5c', orb: 'earth',     sfx: 'slam' },
    leaf:      { key: 'leaf',      label: 'Leaf',      color: '#a3e86b', orb: 'leaf',      sfx: 'swing' },
    wind:      { key: 'wind',      label: 'Wind',      color: '#cfe8e0', orb: 'wind',      sfx: 'swing' }
  };

  const ELEMENT_KEYS = Object.keys(ELEMENTS);

  /* What fraction of a weapon's damage lands as its element, per rarity. The
     play this creates: a common weapon is a physical weapon with a flavour,
     a legendary is a spell that happens to have a handle, and the reactions
     in between are what a build is actually built out of. */
  const ELEMENT_SHARE = [0.15, 0.26, 0.38, 0.50, 0.62];

  // Damage scales with depth so a depth-1 sword is not still relevant at depth 6.
  function depthScale(depth) {
    return 1 + (depth - 1) * 0.34;
  }

  DS.Weapons = {
    WEAPONS: WEAPONS,
    WEAPON_KEYS: WEAPON_KEYS,
    RARITY: RARITY,
    MAX_RARITY: MAX_RARITY,
    ELEMENTS: ELEMENTS,
    ELEMENT_KEYS: ELEMENT_KEYS,
    ELEMENT_SHARE: ELEMENT_SHARE,
    CHARGE_MIN: CHARGE_MIN,
    depthScale: depthScale,
    rarityColor: function (index) {
      return RARITY[DS.M.clamp(index, 0, MAX_RARITY)].color;
    },
    rarityLabel: function (index) {
      return RARITY[DS.M.clamp(index, 0, MAX_RARITY)].label;
    }
  };
})(window.DS);
