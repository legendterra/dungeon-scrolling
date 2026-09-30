/* The act II and act III bosses: the Frost Wyrm (depth 20), the Lich (25) and
   the Magma Colossus (30), and every lap of the endless rotation after that.

   They run on the DS.Bosses brain (bosses.js) - telegraphed moves picked from
   a list, a second angrier list from half health - and only bring what makes
   them themselves: three moves each, registered into DS.Bosses.MOVES, and an
   enrage that changes the fight rather than just the numbers. Where a shared
   move already says the right thing (the Warden's QUAKE, the Arbiter's SMITE,
   anyone's CHARGE) they borrow it. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const B = DS.Bosses;
  const go = B.go;

  function shot(g, e, o) {
    return Ent.spawnProjectile(g, Object.assign({
      friendly: false, kind: 'orb', gravity: 0, life: 150, w: 6, h: 6,
      damage: e.attackDamage - 1
    }, o));
  }

  function feetY(e) { return e.y + e.h; }

  function aimAt(g, e, speed, fromY) {
    const p = g.player;
    const dx = p ? Ent.centerX(p) - Ent.centerX(e) : e.facing;
    const dy = p ? Ent.centerY(p) - fromY : 0;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    return { vx: (dx / len) * speed, vy: (dy / len) * speed };
  }

  function ring(g, e, count, speed, element, color) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      shot(g, e, {
        x: Ent.centerX(e) - 3, y: Ent.centerY(e) - 3,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        element: element, trailColor: color, life: 90
      });
    }
  }

  // --- the Frost Wyrm ---------------------------------------------------------

  /* A long, low ice serpent. It breathes a stream of frost along the floor,
     leaps and crashes down in a spray of shards, and brings the ceiling down
     in icicles. Enraged it moves faster and the breath comes twice as thick. */

  // BREATH - a frost stream from the jaw, aimed where the player stood.
  B.MOVES.BREATH = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    const rate = e.phase === 2 ? 3 : 5;
    if (e.stateTimer === 64) DS.Audio.play('cast');
    if (e.stateTimer < 60 && e.stateTimer > 16 && e.stateTimer % rate === 0) {
      const mouthY = e.y + 6;
      const aim = aimAt(g, e, 2.8, mouthY);
      shot(g, e, {
        x: Ent.centerX(e) + e.facing * (e.w / 2 - 4), y: mouthY,
        vx: aim.vx, vy: aim.vy + DS.rand.float(-0.35, 0.35),
        element: 'ice', trailColor: '#a8e4ff', life: 110
      });
    }
    if (e.stateTimer > 60 && e.frame % 3 === 0) {
      DS.FX.spark(Ent.centerX(e) + e.facing * (e.w / 2), e.y + 6, 2, '#a8e4ff');
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  };

  // DIVE - a leap at the player and a crash that sprays shards both ways.
  B.MOVES.DIVE = function (g, e, dx) {
    e.stateTimer--;
    if (!e.moveBegun) {
      e.moveBegun = true;
      e.vy = -7;
      e.vx = M.clamp(dx / 30, -3.2, 3.2);
      DS.Audio.play('dash');
    }
    if (!e.actionDone && e.onGround && e.vy >= 0 && e.stateTimer < 60) {
      e.actionDone = true;
      e.vx = 0;
      DS.Audio.play('slam');
      DS.R.shake(8);
      DS.FX.ring(Ent.centerX(e), feetY(e), 24, e.def.color, 2.6);
      DS.FX.dust(Ent.centerX(e), feetY(e), 16);
      const count = e.phase === 2 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        [-1, 1].forEach(function (dir) {
          shot(g, e, {
            x: Ent.centerX(e) + dir * 10, y: feetY(e) - 10,
            vx: dir * (1.2 + i * 0.7), vy: -3.2 - i * 0.4, gravity: 0.14,
            element: 'ice', trailColor: '#a8e4ff', life: 120
          });
        });
      }
    }
    if (e.stateTimer <= 0 && e.onGround) go(e, 'IDLE', 34);
  };

  // ICICLES - shards drop from above the player, one after another. Each
  // one sparks where it hangs before it falls, and it falls slowly at first.
  B.MOVES.ICICLES = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.85;
    const p = g.player;
    const every = e.phase === 2 ? 9 : 13;
    if (p && !p.dead && e.stateTimer > 14 && e.stateTimer % every === 0) {
      const x = Ent.centerX(p) + DS.rand.float(-36, 36);
      const y = hangPoint(g, x, p.y);
      DS.FX.burst(x, y, 6, ['#a8e4ff', '#ffffff'], { speed: 1, life: 14, grav: 0 });
      shot(g, e, {
        x: x - 3, y: y, vx: 0, vy: 0.3, gravity: 0.16, w: 6, h: 10,
        element: 'ice', trailColor: '#a8e4ff', life: 160, damage: e.attackDamage - 1
      });
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  };

  /* Up to six tiles above the player, stopping under the ceiling - an icicle
     spawned inside rock would shatter before anyone saw it. */
  function hangPoint(g, x, fromY) {
    const T = DS.C.TILE;
    const tx = Math.floor(x / T);
    let y = fromY;
    for (let i = 0; i < 6; i++) {
      if (y - T < 0 || g.map.isSolid(tx, Math.floor((y - T) / T))) break;
      y -= T;
    }
    return y;
  }

  function wyrmEnrage(g, e) {
    ring(g, e, 10, 2, 'ice', '#a8e4ff');
    DS.R.flash('#a8e4ff', 8);
  }

  // --- the Lich ---------------------------------------------------------------

  /* A caster that will not stand and trade. It throws aimed volleys of dark
     orbs, raises the dead around itself and blinks across the room the moment
     you close in. Enraged it borrows the Arbiter's pillars as well. */

  // ORBS - a fan of dark orbs thrown at the player, twice when enraged.
  B.MOVES.ORBS = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    const waves = e.phase === 2 ? [44, 22] : [36];
    if (waves.indexOf(e.stateTimer) >= 0) {
      DS.Audio.play('cast');
      const n = e.phase === 2 ? 5 : 3;
      const fromY = e.y + 8;
      const aim = aimAt(g, e, 2.1, fromY);
      const base = Math.atan2(aim.vy, aim.vx);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.28;
        shot(g, e, {
          x: Ent.centerX(e) - 3, y: fromY,
          vx: Math.cos(a) * 2.1, vy: Math.sin(a) * 2.1,
          element: 'dark', trailColor: '#7fe0a0', life: 170
        });
      }
    }
    if (e.stateTimer > 36 && e.frame % 4 === 0) {
      DS.FX.trail(Ent.centerX(e) + DS.rand.float(-8, 8), e.y + DS.rand.float(0, 10), '#7fe0a0');
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 28);
  };

  // RAISE - the dead climb out of the floor beside it. Capped, so a long
  // fight never becomes a crowd.
  const RAISE_CAP = 10;

  B.MOVES.RAISE = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    if (!e.actionDone && e.stateTimer < 26) {
      e.actionDone = true;
      const room = RAISE_CAP - g.enemies.length;
      const count = Math.min(room, e.phase === 2 ? 3 : 2);
      for (let i = 0; i < count; i++) {
        const kind = (e.phase === 2 && i === count - 1) ? 'wraith' : 'skeleton';
        const sx = Ent.centerX(e) + (i % 2 ? 1 : -1) * DS.rand.float(24, 48);
        if (DS.Enemies.TYPES[kind]) DS.Enemies.create(g, sx, feetY(e) - 16, kind, 'normal');
      }
      DS.Audio.play('cast');
      DS.FX.ring(Ent.centerX(e), feetY(e), 20, e.def.color, 2);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  };

  // BLINK - vanish and reappear on the far side of the player.
  B.MOVES.BLINK = function (g, e) {
    e.stateTimer--;
    e.vx = 0;
    if (e.stateTimer > 16 && e.frame % 2 === 0) {
      DS.FX.spark(Ent.centerX(e), Ent.centerY(e), 2, '#7fe0a0');
    }
    if (!e.actionDone && e.stateTimer === 16) {
      e.actionDone = true;
      blink(g, e);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 20);
  };

  function blink(g, e) {
    const p = g.player;
    if (!p) return;
    const T = DS.C.TILE;
    const side = Ent.centerX(p) < Ent.centerX(e) ? -1 : 1;
    const lo = g.arena ? g.arena.x0 : 2 * T;
    const hi = (g.arena ? g.arena.x1 : g.map.pixelW - 2 * T) - e.w;
    const target = M.clamp(Ent.centerX(p) + side * 90 - e.w / 2, lo, hi);
    const tx = Math.floor((target + e.w / 2) / T);
    if (g.map.groundBelow(tx) >= g.map.pixelH) return;   // never into a pit

    DS.FX.burst(Ent.centerX(e), Ent.centerY(e), 16, ['#1c1a2b', '#7fe0a0'],
                { speed: 2.2, life: 18, grav: 0 });
    e.x = target;
    e.vy = 0;
    e.facing = -side;
    DS.FX.burst(Ent.centerX(e), Ent.centerY(e), 16, ['#1c1a2b', '#7fe0a0'],
                { speed: 2.2, life: 18, grav: 0 });
    DS.Audio.play('dash');
  }

  function lichEnrage(g, e) {
    ring(g, e, 8, 1.8, 'dark', '#7fe0a0');
    blink(g, e);
  }

  // --- the Magma Colossus -----------------------------------------------------

  /* The last boss of the scripted run: a mountain of slag with a furnace for a
     heart. Everything it does leaves the floor dangerous - burning puddles,
     lobbed slag, rolling waves of magma to jump. Enraged its crust cracks
     open: less armour, but it starts to charge. */

  function puddle(g, e, x) {
    shot(g, e, {
      x: x - 6, y: feetY(e) - 6, vx: 0, vy: 0, w: 12, h: 6,
      element: 'fire', trailColor: '#e8743b', life: e.phase === 2 ? 170 : 120
    });
  }

  // ERUPT - a stomp that leaves burning puddles and spits slag straight up.
  B.MOVES.ERUPT = function (g, e, dx) {
    e.stateTimer--;
    if (!e.moveBegun) {
      e.moveBegun = true;
      e.vy = -4.6;
      e.vx = M.sign(dx) * 1.2;
    }
    if (!e.actionDone && e.onGround && e.vy >= 0 && e.stateTimer < 56) {
      e.actionDone = true;
      e.vx = 0;
      DS.Audio.play('slam');
      DS.R.shake(9);
      DS.FX.ring(Ent.centerX(e), feetY(e), 26, e.def.color, 2.8);
      DS.FX.dust(Ent.centerX(e), feetY(e), 18);
      const cx = Ent.centerX(e);
      [-1, 1].forEach(function (dir) {
        puddle(g, e, cx + dir * (e.w / 2 + 10));
        puddle(g, e, cx + dir * (e.w / 2 + 38));
        shot(g, e, {
          x: cx + dir * 8, y: e.y, vx: dir * DS.rand.float(0.6, 1.6), vy: -4.2,
          gravity: 0.13, element: 'fire', trailColor: '#e8743b', life: 160, w: 8, h: 8,
          damage: e.attackDamage
        });
      });
    }
    if (e.stateTimer <= 0 && e.onGround) go(e, 'IDLE', 32);
  };

  // METEOR - slag lobbed in high arcs at the player, a handful at a time.
  B.MOVES.METEOR = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.85;
    const count = e.phase === 2 ? 6 : 4;
    const t = 60 - e.stateTimer;
    if (t > 12 && t % 8 === 0 && (t - 12) / 8 < count) {
      DS.Audio.play('cast');
      const p = g.player;
      const dx = p ? Ent.centerX(p) + DS.rand.float(-30, 30) - Ent.centerX(e) : e.facing * 60;
      shot(g, e, {
        x: Ent.centerX(e), y: e.y + 4,
        vx: M.clamp(dx / 46, -3.2, 3.2), vy: -4, gravity: 0.13,
        element: 'fire', trailColor: '#e8743b', life: 220, w: 8, h: 8,
        damage: e.attackDamage
      });
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  };

  // LAVAWAVE - waves of magma roll out along the floor in both directions.
  // Each one is a jump; enraged there are more of them, closer together.
  B.MOVES.LAVAWAVE = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.7;
    const gap = e.phase === 2 ? 14 : 20;
    const t = 70 - e.stateTimer;
    if (t === 8) { DS.Audio.play('slam'); DS.R.shake(4); }
    if (t > 14 && e.stateTimer > 8 && (t - 14) % gap === 0) {
      [-1, 1].forEach(function (dir) {
        shot(g, e, {
          x: Ent.centerX(e) + dir * (e.w / 2) - 6, y: feetY(e) - 10,
          vx: dir * 2.2, vy: 0, w: 12, h: 10,
          element: 'fire', trailColor: '#f2c14e', life: 150
        });
      });
      DS.FX.dust(Ent.centerX(e), feetY(e), 6);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  };

  function magmaEnrage(g, e) {
    e.armor = Math.max(2, e.armor - 3);
    ring(g, e, 12, 2.2, 'fire', '#e8743b');
    DS.R.flash('#e8743b', 10);
  }

  // --- registration -----------------------------------------------------------

  // The helpers the bosses of the gods (bosses3.js) share.
  B.kit = { shot: shot, feetY: feetY, aimAt: aimAt, ring: ring };

  /* Sizes are the collision box; the voxel models (core/voxel.js) are built
     to the same footprint. `sprite` is the 2D fallback sheet, scaled up and
     tinted by bosses.js like the Warden's and the Arbiter's. */
  B.KINDS.wyrm = {
    name: 'THE FROST WYRM',
    sprite: 'wraith', scale: 3, tint: '#a8e4ff', color: '#4fb3e0',
    w: 40, h: 22, hp: 340, armor: 4, touch: 2, damage: 3,
    gore: ['#a8e4ff', '#4fb3e0', '#2f6fa8'],
    phase1: ['BREATH', 'DIVE', 'ICICLES', 'BREATH'],
    phase2: ['BREATH', 'DIVE', 'ICICLES', 'CHARGE', 'DIVE'],
    timers: { BREATH: 80, DIVE: 80, ICICLES: 100 },
    onEnrage: wyrmEnrage
  };

  B.KINDS.lich = {
    name: 'THE LICH',
    sprite: 'necromancer', scale: 3, tint: '#9be0b0', color: '#7fe0a0',
    w: 22, h: 32, hp: 300, armor: 3, touch: 1, damage: 3,
    gore: ['#e8e4dc', '#7fe0a0', '#3c2154'],
    phase1: ['ORBS', 'RAISE', 'BLINK', 'ORBS'],
    phase2: ['ORBS', 'SMITE', 'RAISE', 'BLINK', 'ORBS'],
    timers: { ORBS: 64, RAISE: 60, BLINK: 40 },
    onEnrage: lichEnrage
  };

  B.KINDS.magma = {
    name: 'THE MAGMA COLOSSUS',
    sprite: 'golem', scale: 3, tint: '#e8743b', color: '#ff7a2a',
    w: 34, h: 36, hp: 380, armor: 6, touch: 3, damage: 3,
    gore: ['#e8743b', '#6e1b28', '#f2c14e'],
    phase1: ['ERUPT', 'METEOR', 'LAVAWAVE', 'QUAKE'],
    phase2: ['ERUPT', 'METEOR', 'LAVAWAVE', 'CHARGE', 'ERUPT'],
    timers: { ERUPT: 70, METEOR: 60, LAVAWAVE: 70 },
    onEnrage: magmaEnrage
  };
})(window.DS);
