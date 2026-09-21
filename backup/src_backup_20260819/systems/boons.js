/* Shrine boons and the momentum meter.

   Boons are run-scoped modifiers picked from a shrine, three offered and one
   taken. They are what makes two runs with the same weapon play differently:
   the weapon decides how you attack, the boons decide who you are.

   Momentum is the moment-to-moment layer — kills without being hit stack a
   multiplier that decays on its own and collapses the instant you take damage. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;

  /* stat  — folded into the derived player stats
     flag  — read at runtime by combat and loot code                         */
  const BOONS = [
    { key: 'bloodthirst', name: 'BLOODTHIRST', color: '#c0303c',
      desc: '+15% DAMAGE, -1 MAX HEART',
      stat: { damage: 0.15, maxHp: -1 } },

    { key: 'ironhide', name: 'IRONHIDE', color: '#9b96b8',
      desc: '+2 MAX HEARTS, -10% SPEED',
      stat: { maxHp: 2, moveSpeed: -0.10 } },

    { key: 'featherweight', name: 'FEATHERWEIGHT', color: '#a3e86b',
      desc: '+20% MOVE SPEED, +20 STAMINA',
      stat: { moveSpeed: 0.20, maxStamina: 20 } },

    { key: 'sharpshooter', name: 'SHARPSHOOTER', color: '#a8e4ff',
      desc: '+12% CRIT CHANCE',
      stat: { crit: 0.12 } },

    { key: 'overflow', name: 'OVERFLOW', color: '#4fb3e0',
      desc: '+50 MAX MANA, FASTER REGEN',
      stat: { maxMana: 50, manaRegen: 0.14 } },

    { key: 'conduit', name: 'CONDUIT', color: '#c86ee0',
      desc: 'SKILLS COST 35% LESS MANA',
      stat: { skillDiscount: 0.35 } },

    { key: 'greed', name: 'GOLDEN TOUCH', color: '#f2c14e',
      desc: '+30% COINS, +1 SHARD PER CHEST',
      stat: { coinBonus: 0.30 }, flag: { chestShards: 1 } },

    { key: 'berserker', name: 'BERSERKER', color: '#e8743b',
      desc: '+35% DAMAGE UNDER 3 HEARTS',
      flag: { berserk: 0.35 } },

    { key: 'momentum', name: 'MOMENTUM', color: '#fff0a8',
      desc: 'MOMENTUM BUILDS TWICE AS FAST',
      flag: { momentum: 2 } },

    { key: 'harvest', name: 'BLOOD HARVEST', color: '#c0303c',
      desc: 'EVERY 10 KILLS RESTORES A HEART',
      flag: { harvest: 10 } },

    { key: 'fleetfoot', name: 'FLEETFOOT', color: '#5cbf62',
      desc: '+1 MINI DASH CHARGE',
      flag: { miniCharges: 1 } },

    { key: 'ricochet', name: 'RICOCHET', color: '#a89bff',
      desc: 'PROJECTILES PIERCE ONE MORE FOE',
      flag: { pierce: 1 } },

    { key: 'vigil', name: 'VIGIL', color: '#d8d5e8',
      desc: '+20 FRAMES OF MERCY AFTER A HIT',
      stat: { iframes: 20 } },

    { key: 'ruin', name: 'RUIN', color: '#8a4550',
      desc: 'HEAVY ATTACKS DEAL +50%',
      flag: { heavyBonus: 0.5 } }
  ];

  const BY_KEY = {};
  BOONS.forEach(function (b) { BY_KEY[b.key] = b; });

  function offer(rng, taken) {
    const pool = BOONS.filter(function (b) { return taken.indexOf(b.key) < 0; });
    return rng.sample(pool, Math.min(3, pool.length));
  }

  // Fold every taken boon into a derived stat block.
  function applyStats(inv, out) {
    const list = inv.boons || [];
    for (let i = 0; i < list.length; i++) {
      const boon = BY_KEY[list[i]];
      if (!boon || !boon.stat) continue;
      const s = boon.stat;
      if (s.maxHp) out.maxHp += s.maxHp;
      if (s.maxStamina) out.maxStamina += s.maxStamina;
      if (s.maxMana) out.maxMana += s.maxMana;
      if (s.manaRegen) out.manaRegen += s.manaRegen;
      if (s.moveSpeed) out.moveSpeed *= (1 + s.moveSpeed);
      if (s.iframes) out.iframes += s.iframes;
      if (s.damage) out.damageBonus = (out.damageBonus || 0) + s.damage;
      if (s.crit) out.critBonus = (out.critBonus || 0) + s.crit;
      if (s.skillDiscount) out.skillDiscount = (out.skillDiscount || 0) + s.skillDiscount;
    }
    out.maxHp = Math.max(1, out.maxHp);
    return out;
  }

  function flag(inv, name) {
    const list = inv.boons || [];
    let total = 0;
    for (let i = 0; i < list.length; i++) {
      const boon = BY_KEY[list[i]];
      if (boon && boon.flag && boon.flag[name]) total += boon.flag[name];
    }
    return total;
  }

  function has(inv, key) { return (inv.boons || []).indexOf(key) >= 0; }

  // --- momentum -------------------------------------------------------------

  const TIERS = [
    { at: 0,  label: '',            color: '#6f6a90' },
    { at: 4,  label: 'SHARP',       color: '#a3e86b' },
    { at: 9,  label: 'FEROCIOUS',   color: '#4fb3e0' },
    { at: 18, label: 'MERCILESS',   color: '#c86ee0' },
    { at: 30, label: 'UNSTOPPABLE', color: '#e8743b' }
  ];

  const DECAY_FRAMES = 330;   // 5.5s without a kill and the streak lapses
  const MAX_BONUS = 0.30;     // damage ceiling from momentum alone

  function tier(streak) {
    let found = TIERS[0];
    for (let i = 0; i < TIERS.length; i++) if (streak >= TIERS[i].at) found = TIERS[i];
    return found;
  }

  function bonus(g) {
    const rate = 0.012 * (1 + flag(g.inv, 'momentum') * 0.5);
    return Math.min(MAX_BONUS, g.streak * rate);
  }

  function onKill(g) {
    const gain = 1 + (flag(g.inv, 'momentum') ? 1 : 0);
    const before = tier(g.streak);
    g.streak += gain;
    g.streakTimer = DECAY_FRAMES;
    if (g.streak > g.streakBest) g.streakBest = g.streak;

    const now = tier(g.streak);
    if (now.label && now.label !== before.label) {
      g.toast(now.label, now.color);
      DS.Audio.play('upgrade');
      DS.R.punch(0.02);
    }

    const harvest = flag(g.inv, 'harvest');
    if (harvest) {
      g.harvestCount = (g.harvestCount || 0) + 1;
      if (g.harvestCount >= harvest) {
        g.harvestCount = 0;
        const p = g.player;
        if (p.hp < p.stats.maxHp) {
          p.hp++;
          DS.FX.number(DS.Ent.centerX(p), p.y - 4, '+1', '#c0303c');
          DS.Audio.play('heal');
        }
      }
    }
  }

  function onHurt(g) {
    if (g.streak >= TIERS[1].at) {
      g.toast('MOMENTUM LOST', '#6f6a90');
      DS.FX.burst(DS.Ent.centerX(g.player), g.player.y, 10,
                  ['#6f6a90', '#3a3654'], { speed: 1.4, life: 18 });
    }
    g.streak = 0;
    g.streakTimer = 0;
  }

  function update(g) {
    if (g.streakTimer > 0) {
      g.streakTimer--;
      if (g.streakTimer === 0) g.streak = 0;
    }
  }

  DS.Boons = {
    LIST: BOONS,
    BY_KEY: BY_KEY,
    offer: offer,
    applyStats: applyStats,
    flag: flag,
    has: has,
    tier: tier,
    bonus: bonus,
    onKill: onKill,
    onHurt: onHurt,
    update: update,
    DECAY_FRAMES: DECAY_FRAMES
  };
})(window.DS);
