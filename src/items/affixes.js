/* Affixes are what make two swords feel different. A prefix changes how the
   weapon hits; a suffix changes what the wielder can do.

   mods    — multiplicative/additive tweaks to the weapon's own stats
   bonus   — flat additions to the player's derived stats while equipped
   proc    — an on-hit effect resolved by the combat code */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const PREFIXES = [
    /* Elemental prefixes now carry a real element, so they feed the reaction
       system: a Flaming sword into an enemy a Drenched bow already soaked
       triggers STEAM, not two separate procs. */
    {
      key: 'flaming', name: 'Flaming', color: '#e8743b',
      desc: 'FIRE - burns and leaves flames',
      proc: { element: 'fire' }
    },
    {
      key: 'frozen', name: 'Frozen', color: '#4fb3e0',
      desc: 'ICE - chills, 3 stacks freeze',
      proc: { element: 'ice' }
    },
    {
      key: 'shocking', name: 'Shocking', color: '#f2c14e',
      desc: 'LIGHTNING - stuns and arcs',
      proc: { element: 'lightning' }
    },
    {
      key: 'toxic', name: 'Toxic', color: '#5cbf62',
      desc: 'POISON - leaves a draining mist',
      proc: { element: 'poison' }
    },
    {
      key: 'drenching', name: 'Drenching', color: '#2f6fa8',
      desc: 'WATER - soaks, sets up reactions',
      proc: { element: 'water' }
    },
    {
      key: 'stony', name: 'Stony', color: '#b98d5c',
      desc: 'EARTH - shatters armour',
      proc: { element: 'earth' }
    },
    {
      key: 'verdant', name: 'Verdant', color: '#a3e86b',
      desc: 'LEAF - roots the target',
      proc: { element: 'leaf' }
    },
    {
      key: 'vampiric', name: 'Vampiric', color: '#c0303c',
      desc: 'Heals 8% of damage dealt',
      proc: { lifesteal: 0.08 }
    },
    {
      key: 'cruel', name: 'Cruel', color: '#c0303c',
      desc: '+25% damage, -10% speed',
      mods: { damage: 1.25, cooldown: 1.10 }
    },
    {
      key: 'swift', name: 'Swift', color: '#5cbf62',
      desc: '+22% attack speed',
      mods: { cooldown: 0.78 }
    },
    {
      key: 'piercing', name: 'Piercing', color: '#9b96b8',
      desc: 'Ignores enemy armour',
      proc: { pierce: true }
    },
    {
      key: 'heavy', name: 'Heavy', color: '#b98d5c',
      desc: '+90% knockback, +10% damage',
      mods: { knockback: 1.9, damage: 1.1 }
    },
    {
      key: 'keen', name: 'Keen', color: '#a8e4ff',
      desc: '+14% critical chance',
      mods: { crit: 0.14 }
    },
    {
      key: 'reaching', name: 'Reaching', color: '#a3e86b',
      desc: '+30% reach',
      mods: { reach: 1.3 }
    }
  ];

  const SUFFIXES = [
    {
      key: 'bear', name: 'of the Bear', color: '#b98d5c',
      desc: '+2 max hearts',
      bonus: { maxHp: 2 }
    },
    {
      key: 'cat', name: 'of the Cat', color: '#5cbf62',
      desc: '+15% move speed, +1 dash',
      bonus: { moveSpeed: 0.15, dashCharges: 1 }
    },
    {
      key: 'greed', name: 'of Greed', color: '#f2c14e',
      desc: '+35% coins',
      bonus: { coinBonus: 0.35 }
    },
    {
      key: 'owl', name: 'of the Owl', color: '#a8e4ff',
      desc: '+25 stamina, faster regen',
      bonus: { maxStamina: 25, staminaRegen: 0.12 }
    },
    {
      key: 'thorns', name: 'of Thorns', color: '#c0303c',
      desc: 'Reflects 40% of contact damage',
      bonus: { thorns: 0.4 }
    },
    {
      key: 'mage', name: 'of the Adept', color: '#c86ee0',
      desc: '+30 mana, faster regen',
      bonus: { maxMana: 30, manaRegen: 0.1 }
    },
    {
      key: 'ghost', name: 'of the Ghost', color: '#9b96b8',
      desc: '+12 frames of mercy after a hit',
      bonus: { iframes: 12 }
    },
    {
      key: 'giant', name: 'of the Giant', color: '#e8743b',
      desc: '+1 max heart, +8% damage',
      bonus: { maxHp: 1 }, mods: { damage: 1.08 }
    },
    {
      key: 'wind', name: 'of the Wind', color: '#a8e4ff',
      desc: '+18% jump height',
      bonus: { jump: 0.18 }
    },
    {
      key: 'hunter', name: 'of the Hunter', color: '#a3e86b',
      desc: '+1 arrow on pickup, +10% crit damage',
      bonus: { arrowBonus: 1, critDamage: 0.1 }
    }
  ];

  const ALL = PREFIXES.concat(SUFFIXES);

  const BY_KEY = {};
  PREFIXES.forEach(function (a) { a.kind = 'prefix'; BY_KEY[a.key] = a; });
  SUFFIXES.forEach(function (a) { a.kind = 'suffix'; BY_KEY[a.key] = a; });

  /* Roll affixes for an item. An item may hold at most one prefix and one
     suffix by name, so higher rarities stack repeats of the same slot type
     rather than producing "Flaming Flaming Sword". */
  function roll(rng, count, exclude) {
    const taken = {};
    (exclude || []).forEach(function (key) { taken[key] = true; });

    const out = [];
    // Alternate prefix/suffix so a 2-slot item reads as "X Sword of Y".
    for (let i = 0; i < count; i++) {
      const pool = (i % 2 === 0 ? PREFIXES : SUFFIXES).filter(function (a) {
        return !taken[a.key];
      });
      const fallback = ALL.filter(function (a) { return !taken[a.key]; });
      const source = pool.length ? pool : fallback;
      if (!source.length) break;
      const picked = rng.pick(source);
      taken[picked.key] = true;
      out.push(picked);
    }
    return out;
  }

  DS.Affixes = {
    PREFIXES: PREFIXES,
    SUFFIXES: SUFFIXES,
    ALL: ALL,
    BY_KEY: BY_KEY,
    roll: roll
  };
})(window.DS);
