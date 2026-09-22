/* Floor modifiers and the horror curve.

   A modifier is one rule that reshapes an entire floor, announced on the way
   in. They are what makes depth 9 feel different from depth 3 beyond bigger
   numbers — the floor itself is hostile, not just the things standing on it.

   The horror value is a separate, continuous 0..1 that rises with depth and
   drives darkness, grain, vignette and ambience. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;

  const LIST = [
    {
      key: 'darkness', name: 'DARKNESS', color: '#514c72',
      desc: 'NO TORCHES BURN HERE',
      darkness: 0.22, noTorches: true
    },
    {
      key: 'thickblood', name: 'THICK BLOOD', color: '#c0303c',
      desc: 'EVERYTHING HERE IS HARDER TO KILL',
      enemyHp: 1.8
    },
    {
      key: 'frenzy', name: 'FRENZY', color: '#e8743b',
      desc: 'THEY MOVE AND STRIKE FASTER',
      enemySpeed: 1.25, enemyWind: 0.78
    },
    {
      key: 'horde', name: 'HORDE', color: '#f2c14e',
      desc: 'FAR MORE OF THEM',
      spawnMult: 1.5
    },
    {
      key: 'honorguard', name: 'HONOR GUARD', color: '#e8a05a',
      desc: 'EVERY GUARD IS AN ELITE',
      allElite: true
    },
    {
      key: 'brittle', name: 'BRITTLE', color: '#a8e4ff',
      desc: 'EVERY WOUND CUTS DEEPER',
      extraDamage: 1
    },
    {
      key: 'famine', name: 'FAMINE', color: '#8a4550',
      desc: 'NOTHING BLEEDS HEALING',
      noHearts: true
    },
    {
      key: 'starved', name: 'STARVED', color: '#b98d5c',
      desc: 'NO COIN, BUT RICHER CHESTS',
      noCoins: true, chestBonus: 2
    }
  ];

  const BY_KEY = {};
  LIST.forEach(function (m) { BY_KEY[m.key] = m; });

  /* Chance rises with depth. Nothing before depth 4 — the early floors are the
     tutorial for everything else the game does. */
  function chanceFor(depth) {
    if (depth < 4) return 0;
    if (depth < 7) return 0.35;
    if (depth < 10) return 0.6;
    return 1;
  }

  /* level.hasPit matters: total darkness plus a parkour pit is not difficulty,
     it is a coin flip. */
  function roll(rng, depth, level) {
    if (!rng.chance(chanceFor(depth))) return null;

    const hasPit = !!(level && level.map && level.map.pitColumns &&
                      level.map.pitColumns.length);
    const pool = LIST.filter(function (m) {
      return !(m.key === 'darkness' && hasPit);
    });
    return rng.pick(pool);
  }

  function get(g, field) {
    return (g.modifier && g.modifier[field]) || null;
  }

  function has(g, field) {
    return !!(g.modifier && g.modifier[field]);
  }

  function mult(g, field) {
    return (g.modifier && g.modifier[field]) || 1;
  }

  // --- horror ---------------------------------------------------------------

  // 0 through depth 3, ramping to 1 at the throne room.
  function horrorFor(depth) {
    return M.clamp((depth - 3) / 7, 0, 1);
  }

  function darknessFor(g) {
    let dark = g.biome.darkness + g.horror * 0.26;
    if (has(g, 'darkness')) dark += g.modifier.darkness;
    return M.clamp(dark, 0, 0.92);
  }

  /* Ambience that only exists deep down: a drip, a whisper, a heartbeat when
     you are nearly dead. Sparse on purpose — constant noise stops being scary. */
  function ambience(g) {
    if (g.horror <= 0) return;

    const rate = Math.round(600 - g.horror * 360);
    if (g.frames % rate === 0 && DS.rand.chance(0.5)) {
      DS.Audio.play(DS.rand.chance(0.5) ? 'shard' : 'locked');
    }

    // Heartbeat on low health, faster as the run gets closer to ending.
    const p = g.player;
    if (p && !p.dead && p.hp <= 2) {
      const beat = p.hp === 1 ? 44 : 64;
      if (g.frames % beat === 0) {
        DS.Audio.play('slam');
        DS.R.shake(0.6);
      }
    }

    // The deepest floors never sit perfectly still.
    if (g.horror > 0.7 && g.frames % 6 === 0) DS.R.shake(0.35);
  }

  /* Drawn over the finished, lit frame: a vignette that tightens with depth and
     a light film of grain. */
  function drawAtmosphere(g) {
    if (g.horror <= 0.01) return;
    const R = DS.R;
    const cx = R.ctx;
    const C = DS.C;

    cx.save();
    cx.setTransform(C.RS, 0, 0, C.RS, 0, 0);

    const inner = C.W * (0.52 - g.horror * 0.16);
    const grd = cx.createRadialGradient(C.W / 2, C.H / 2, inner,
                                        C.W / 2, C.H / 2, C.W * 0.78);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(4,2,6,' + (0.35 + g.horror * 0.45).toFixed(2) + ')');
    cx.fillStyle = grd;
    cx.fillRect(0, 0, C.W, C.H);

    // Grain: a scatter of dark specks reseeded every few frames.
    if (g.horror > 0.35) {
      const count = Math.round(g.horror * 90);
      cx.fillStyle = 'rgba(0,0,0,0.20)';
      for (let i = 0; i < count; i++) {
        const seed = (g.frames >> 2) + i * 2654435761;
        const x = (seed % C.W + C.W) % C.W;
        const y = ((seed >> 8) % C.H + C.H) % C.H;
        cx.fillRect(x, y, 1, 1);
      }
    }

    cx.restore();
  }

  DS.Modifiers = {
    LIST: LIST,
    BY_KEY: BY_KEY,
    roll: roll,
    get: get,
    has: has,
    mult: mult,
    horrorFor: horrorFor,
    darknessFor: darknessFor,
    ambience: ambience,
    drawAtmosphere: drawAtmosphere
  };
})(window.DS);
