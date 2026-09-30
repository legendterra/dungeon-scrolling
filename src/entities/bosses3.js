/* The bosses of the gods, act III. Three hold a vault on the floors that have one
   (the Minotaur in the labyrinth, Medusa in her garden, Talos in the forge) and two
   hold the boss rooms (Hades under the world, Zeus above the storm).

   They run on the DS.Bosses brain (bosses.js) exactly as the Frost Wyrm and the Lich
   do: a rotation of telegraphed moves from a list, a second angrier list from half
   health, and moves of their own registered into DS.Bosses.MOVES. What each one
   asks of the hero:

     Minotaur   a rush you sidestep, so that he drives his horns into the wall and
                is dazed: the opening. A whirl of the axe you jump or leave.
     Medusa     a stone gaze drawn as a line to you before it fires; a pillar
                between you and her stops it. A fan of snakes. A pit of stone snakes.
     Talos      the Magma Colossus's furnace moves in bronze, and the anvil: he
                hammers out automatons to fight beside him.
     Hades      a wave of soul fire that walks toward you, a bident that sweeps a
                wide arc, and shades that step out behind you.
     Zeus       thunderbolts marked on the floor before they fall, storm spirits
                overhead, and a thunderclap. From half health the storm is on: a
                stray bolt is marked every few seconds whatever he is doing. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;
  const B = DS.Bosses;
  const K = B.kit;
  const go = B.go;
  const cx = Ent.centerX;
  const cy = Ent.centerY;
  const T = DS.C.TILE;
  const shot = K.shot, feetY = K.feetY, aimAt = K.aimAt, ring = K.ring;

  // --- what the moves share ---------------------------------------------------

  function lash(g, x1, y1, x2, y2, color, life) {
    const kit = DS.Enemies && DS.Enemies.kit;
    if (kit) kit.lash(g, x1, y1, x2, y2, color, life);
  }

  function weigh(p, frames, mul) {
    p.slowT = Math.max(p.slowT || 0, frames);
    p.slowMul = mul;
  }

  /* The room the boss fights in, in pixels: the floor boss's arena, or the whole boss
     room minus a margin at each wall. */
  function span(g) {
    const lo = (g.arena ? g.arena.x0 : 2 * T) + 12;
    const hi = (g.arena ? g.arena.x1 : g.map.pixelW - 2 * T) - 12;
    return { lo: lo, hi: Math.max(lo + 40, hi) };
  }

  function clampX(g, x) {
    const s = span(g);
    return M.clamp(x, s.lo, s.hi);
  }

  /* The walking surface under x, or `fallback` over a pit. */
  function floorAt(g, x, fallback) {
    const y = g.map.groundBelow(Math.floor(x / T));
    return y >= g.map.pixelH ? fallback : y;
  }

  function alive(g, kind) {
    let n = 0;
    for (let i = 0; i < g.enemies.length; i++) {
      if (!g.enemies[i].dead && g.enemies[i].kind === kind) n++;
    }
    return n;
  }

  /* Bring `n` of a kind into the fight, never more than `cap` of them at once. */
  function summon(g, kind, xs, y, cap) {
    if (!DS.Enemies.TYPES[kind]) return 0;
    const room = Math.max(0, cap - alive(g, kind));
    const n = Math.min(room, xs.length);
    for (let i = 0; i < n; i++) DS.Enemies.create(g, xs[i], y, kind, 'normal');
    return n;
  }

  function hurtRect(g, e, x, y, w, h, dmg) {
    const p = g.player;
    if (!p || p.dead || !M.rectsOverlap(x, y, w, h, p.x, p.y, p.w, p.h)) return false;
    return !!p.hurt(g, dmg == null ? e.attackDamage : dmg, M.sign(cx(p) - cx(e)) || 1);
  }

  /* A pillar that lands where it was marked. It shows a ring and sparks on the floor for
     `delay` frames, then a column of light or fire falls 18 px wide. Held on the boss and
     run every frame by tick(), so a move can mark a wave and be over before it lands. */
  function pillar(e, x, y, delay, color) {
    if (!e.pillars) e.pillars = [];
    e.pillars.push({ x: x, y: y, t: delay, warn: delay, color: color });
  }

  function tickPillars(g, e) {
    const list = e.pillars;
    if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      s.t--;
      if (s.t > 0) {
        if (s.t % 3 === 0) DS.FX.spark(s.x + DS.rand.float(-6, 6), s.y - 2, 1, s.color);
        if (s.t % 10 === 0) DS.FX.ring(s.x, s.y - 1, 5 + (1 - s.t / s.warn) * 9, s.color, 1);
      } else if (s.t === 0) {
        DS.Audio.play('lightning');
        DS.R.shake(3);
        lash(g, s.x, s.y - 150, s.x, s.y, s.color, 10);
        DS.FX.burst(s.x, s.y - 8, 14, [s.color, '#ffffff'], { speed: 2, life: 18, grav: -0.02 });
        hurtRect(g, e, s.x - 9, s.y - 56, 18, 58);
      }
      if (s.t < -8) list.splice(i, 1);
    }
  }

  // --- the Minotaur -----------------------------------------------------------

  /* A bull's rush, and the wall at the end of it. He paws the floor with his head down
     (the tell is long and loud), then runs the length of the room in a straight line: step
     aside and he hits the wall with his horns and stands dazed, with none of his armour.
     A whirl of the axe on the ground, a leap and a shockwave from the Warden's own list. */
  const RUSH_T = 170;      // long enough to cross the room from any side: the wall ends it, not the clock

  B.MOVES.RUSH = function (g, e, dx) {
    e.stateTimer--;
    const t = RUSH_T - e.stateTimer;
    if (t < 34) {
      e.vx *= 0.6;
      if (t < 3) e.facing = M.sign(dx) || e.facing;
      if (t === 4) DS.Audio.play('growl');
      if (t % 5 === 0) DS.FX.dust(cx(e) + e.facing * 12, feetY(e), 3);
      if (t > 10 && t % 6 === 0) DS.FX.spark(cx(e) + e.facing * 14, e.y + 10, 2, '#ffb060');
      return;
    }
    e.vx = e.facing * (e.phase === 2 ? 4.1 : 3.5);
    if (e.frame % 3 === 0) DS.FX.trail(cx(e), cy(e) + DS.rand.float(-8, 8), e.def.tint);
    const wall = Phys.wallAhead(g.map, e, e.facing) ||
                 (g.arena && (e.x <= g.arena.x0 + 1 || e.x + e.w >= g.arena.x1 - 1));
    if (wall) {
      e.vx = 0;
      DS.R.shake(9);
      DS.Audio.play('slam');
      DS.FX.dust(cx(e) + e.facing * 14, feetY(e), 14);
      DS.FX.burst(cx(e) + e.facing * 16, e.y + 8, 12, ['#e8e0c8', '#c88a5a', '#ffffff'], { speed: 2.2, life: 20 });
      go(e, 'STUN', 74);
      return;
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 26);
  };

  /* Dazed against the wall: the window. */
  B.MOVES.STUN = function (g, e) {
    e.stateTimer--;
    e.vx = 0;
    e.armor = 0;
    if (e.frame % 6 === 0) DS.FX.spark(cx(e) + DS.rand.float(-8, 8), e.y - 2, 1, '#fff0a8');
    if (e.stateTimer <= 0) {
      e.armor = e.armorBase != null ? e.armorBase : e.def.armor;
      go(e, 'IDLE', 22);
    }
  };

  const SPIN_T = 100;

  B.MOVES.AXESPIN = function (g, e, dx) {
    e.stateTimer--;
    const t = SPIN_T - e.stateTimer;
    const reach = e.phase === 2 ? 58 : 48;
    if (t < 30) {                                      // the axe goes up
      e.vx *= 0.7;
      e.facing = M.sign(dx) || e.facing;
      if (t % 6 === 0) DS.FX.spark(cx(e), e.y - 2, 2, '#ffb060');
    } else if (t < 88) {                               // and comes round, and round
      e.vx = M.approach(e.vx, M.sign(dx) * 0.9, 0.06);
      if (t === 30) DS.Audio.play('swingHeavy');
      if (t % 8 === 0) {
        DS.Audio.play('swing');
        DS.FX.ring(cx(e), feetY(e) - 6, reach * 0.55, '#ffb060', 1.6);
        hurtRect(g, e, cx(e) - reach, feetY(e) - 24, reach * 2, 26);
      }
    } else {
      e.vx *= 0.7;
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  };

  function minotaurInit(g, e) { e.armorBase = e.armor; }

  function minotaurEnrage(g, e) {
    e.armor = e.armorBase != null ? e.armorBase : e.armor;     // a stun cannot carry into the second half
    ring(g, e, 8, 2, 'earth', '#c88a5a');
    DS.R.flash('#ff8a4a', 8);
  }

  // --- Medusa -----------------------------------------------------------------

  /* Her gaze is a line, and the line is drawn at you before it is anything else: green and
     thin while she looks for you, white when she has found you and it will not move again,
     and then it fires. It stops at the first wall, so a pillar between you and her is the
     answer; so is a step to the side once it has locked, or a jump. Whoever it catches goes
     heavy as stone for a good while. From half health she fires it twice. */
  const GAZE_T = 112;
  const GAZE_AIM = 34;
  const GAZE_FIRE = 58;
  const GAZE_REACH = 320;

  function eyeOf(e) { return { x: cx(e) + e.facing * 5, y: e.y + 9 }; }

  /* Where the ray is stopped: by the first wall, or at the end of its reach. */
  function rayEnd(g, x, y, ux, uy) {
    let px = x, py = y;
    for (let i = 1; i <= GAZE_REACH / 4; i++) {
      const nx = x + ux * i * 4, ny = y + uy * i * 4;
      if (g.map.isSolid(Math.floor(nx / T), Math.floor(ny / T))) return { x: px, y: py, blocked: true };
      px = nx; py = ny;
    }
    return { x: px, y: py, blocked: false };
  }

  function rayTouches(x0, y0, x1, y1, p) {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (x >= p.x - 2 && x <= p.x + p.w + 2 && y >= p.y - 2 && y <= p.y + p.h + 2) return true;
    }
    return false;
  }

  function fireGaze(g, e, eye, ux, uy) {
    const p = g.player;
    const end = rayEnd(g, eye.x, eye.y, ux, uy);
    DS.Audio.play('gaze');
    lash(g, eye.x, eye.y, end.x, end.y, '#ffffff', 9);
    DS.FX.burst(end.x, end.y, 8, ['#d8d4c0', '#5cbf62', '#ffffff'], { speed: 1.8, life: 16 });
    if (p && !p.dead && rayTouches(eye.x, eye.y, end.x, end.y, p) &&
        p.hurt(g, e.attackDamage, M.sign(cx(p) - cx(e)) || 1)) {
      weigh(p, 150, 0.3);
    }
  }

  function unit(dx, dy) {
    const len = Math.max(1, Math.hypot(dx, dy));
    return { x: dx / len, y: dy / len };
  }

  B.MOVES.GAZE = function (g, e, dx) {
    e.stateTimer--;
    e.vx *= 0.7;
    const p = g.player;
    const t = GAZE_T - e.stateTimer;
    if (t === 2) DS.Audio.play('gaze');
    if (t <= GAZE_AIM) {
      e.facing = M.sign(dx) || e.facing;
      if (p) e.aim = { x: cx(p), y: cy(p) };
    }
    if (!e.aim) { if (e.stateTimer <= 0) go(e, 'IDLE', 34); return; }
    const eye = eyeOf(e);
    if (t < GAZE_FIRE) {
      if (t % 3 === 0) {
        const u = unit(e.aim.x - eye.x, e.aim.y - eye.y);
        const end = rayEnd(g, eye.x, eye.y, u.x, u.y);
        lash(g, eye.x, eye.y, end.x, end.y, t > GAZE_AIM ? '#f4f0d8' : '#8ad070', 2);
      }
    } else if (t === GAZE_FIRE) {
      const u = unit(e.aim.x - eye.x, e.aim.y - eye.y);
      fireGaze(g, e, eye, u.x, u.y);
    } else if (e.phase === 2 && t === GAZE_FIRE + 26) {
      if (p) e.aim = { x: cx(p), y: cy(p) };
      const u = unit(e.aim.x - eye.x, e.aim.y - eye.y);
      fireGaze(g, e, eye, u.x, u.y);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  };

  function venom(g, proj, p) { weigh(p, 80, 0.6); }

  B.MOVES.SNAKES = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    const waves = e.phase === 2 ? [46, 26] : [40];
    if (waves.indexOf(e.stateTimer) >= 0) {
      DS.Audio.play('hiss');
      const n = e.phase === 2 ? 5 : 4;
      const fromY = e.y + 12;
      const aim = aimAt(g, e, 1.9, fromY);
      const base = Math.atan2(aim.vy, aim.vx);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.3;
        shot(g, e, {
          x: cx(e) - 3, y: fromY, vx: Math.cos(a) * 1.9, vy: Math.sin(a) * 1.9,
          element: 'poison', trailColor: '#a3e86b', life: 170, onHit: venom
        });
      }
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 28);
  };

  B.MOVES.PIT = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    if (!e.actionDone && e.stateTimer < 28) {
      e.actionDone = true;
      const xs = [cx(e) - DS.rand.float(22, 46), cx(e) + DS.rand.float(22, 46), cx(e) + DS.rand.float(-10, 10)];
      const n = summon(g, 'stonesnake', xs.slice(0, e.phase === 2 ? 3 : 2), feetY(e) - 8, 4);
      DS.Audio.play('hiss');
      DS.FX.ring(cx(e), feetY(e) - 4, 18, e.def.color, 2);
      if (!n) DS.FX.burst(cx(e), feetY(e) - 8, 8, ['#5cbf62', '#d8d4c0'], { speed: 1.4, life: 14 });
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  };

  /* She cannot be kept out by a pillar: she coils and springs over it, and bites where she
     lands. The way to use cover is to use it, not to sit in it. */
  B.MOVES.LEAP = function (g, e, dx) {
    e.stateTimer--;
    if (!e.moveBegun) {
      e.moveBegun = true;
      e.lunged = false;
      e.facing = M.sign(dx) || e.facing;
      e.vy = -6.6;
      e.vx = 0;                                   // straight up first: a pillar at her side must be cleared, not hit
      DS.Audio.play('hiss');
    }
    if (!e.lunged && e.vy > -3.4) {               // and over, once she is above it: it lands about where you stood
      e.lunged = true;
      e.vx = (M.sign(dx) || e.facing) * M.clamp(Math.abs(dx) / 29, 2.8, 3.6);   // never a short hop: a pillar is cleared
    }
    if (!e.actionDone && e.onGround && e.vy >= 0 && e.stateTimer < 50) {
      e.actionDone = true;
      e.vx = 0;
      DS.Audio.play('landHard');
      DS.R.shake(5);
      DS.FX.dust(cx(e), feetY(e), 10);
      hurtRect(g, e, cx(e) - 22, feetY(e) - 30, 44, 32);
    }
    if (e.stateTimer <= 0 && e.onGround) go(e, 'IDLE', 30);
  };

  function medusaEnrage(g, e) {
    ring(g, e, 10, 1.7, 'poison', '#a3e86b');
    DS.R.flash('#8ad070', 8);
  }

  // --- Talos ------------------------------------------------------------------

  /* The furnace moves of the Magma Colossus in bronze (ERUPT, METEOR, LAVAWAVE, bosses2.js),
     and the anvil: he raises both fists and brings them down, and the floor answers with an
     automaton at his side, hammered out and already hot. Two at a time at the most. */
  B.MOVES.ANVIL = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    if (e.stateTimer > 34 && e.frame % 5 === 0) DS.FX.spark(cx(e), e.y - 2, 2, '#ffb060');
    if (!e.actionDone && e.stateTimer < 30) {
      e.actionDone = true;
      DS.Audio.play('slam');
      DS.R.shake(8);
      DS.FX.ring(cx(e), feetY(e), 24, e.def.color, 2.6);
      DS.FX.dust(cx(e), feetY(e), 14);
      const xs = [cx(e) - 48, cx(e) + 48];
      summon(g, 'automaton', xs.slice(0, e.phase === 2 ? 2 : 1), feetY(e) - 22, 2);
      [-1, 1].forEach(function (dir) {
        shot(g, e, {
          x: cx(e) + dir * 14, y: feetY(e) - 8, vx: dir * 2.1, vy: 0, w: 10, h: 8,
          element: 'fire', trailColor: '#ffb060', life: 110
        });
      });
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 32);
  };

  function talosInit(g, e) { e.armorBase = e.armor; }

  function talosEnrage(g, e) {
    e.armor = Math.max(2, e.armor - 3);
    e.armorBase = e.armor;
    ring(g, e, 12, 2.2, 'fire', '#ffb060');
    DS.R.flash('#ffb060', 10);
  }

  // --- Hades ------------------------------------------------------------------

  /* SOULFIRE walks toward you in a line of pillars, one every half second's breath, and puts
     one where you are standing right now. BIDENT is a wide sweep he winds up for; from half
     health it throws two flames along the floor as well. SHADES steps two of the dead out
     behind you. */
  const SOUL = '#7ff0ff';

  B.MOVES.SOULFIRE = function (g, e, dx) {
    e.stateTimer--;
    e.vx *= 0.8;
    const p = g.player;
    const t = 90 - e.stateTimer;
    if (t === 6) { DS.Audio.play('whisper'); e.facing = M.sign(dx) || e.facing; }
    if (t === 14) {
      const n = e.phase === 2 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const x = clampX(g, cx(e) + e.facing * (34 + i * 30));
        pillar(e, x, floorAt(g, x, feetY(e)), 38 + i * 7, SOUL);
      }
      if (p) {
        const x = clampX(g, cx(p));
        pillar(e, x, floorAt(g, x, feetY(e)), 52, SOUL);
      }
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  };

  const BIDENT_T = 78;

  B.MOVES.BIDENT = function (g, e, dx) {
    e.stateTimer--;
    const t = BIDENT_T - e.stateTimer;
    if (t < 32) {
      e.vx *= 0.7;
      e.facing = M.sign(dx) || e.facing;
      if (t % 4 === 0) DS.FX.spark(cx(e) + e.facing * 10, e.y + 4, 1, SOUL);
    } else if (t === 32) {
      e.vx = e.facing * 2.4;
      DS.Audio.play('swingHeavy');
      DS.R.shake(3);
      const reach = 66;
      hurtRect(g, e, e.facing > 0 ? cx(e) : cx(e) - reach, e.y + 4, reach, e.h - 4);
      lash(g, cx(e), e.y + 12, cx(e) + e.facing * reach, e.y + 14, SOUL, 6);
      if (e.phase === 2) {
        [-1, 1].forEach(function (dir) {
          shot(g, e, {
            x: cx(e) + dir * 14, y: feetY(e) - 10, vx: dir * 2.4, vy: 0, w: 10, h: 10,
            element: 'ice', trailColor: SOUL, life: 110
          });
        });
      }
    } else {
      e.vx *= 0.85;
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  };

  B.MOVES.SHADES = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    if (!e.actionDone && e.stateTimer < 30) {
      e.actionDone = true;
      const p = g.player;
      const x0 = p ? cx(p) : cx(e);
      const xs = [x0 + DS.rand.float(50, 110), x0 - DS.rand.float(50, 110), x0 + DS.rand.float(-30, 30)]
        .map(function (x) { return clampX(g, x); });
      summon(g, 'shade', xs.slice(0, e.phase === 2 ? 3 : 2), feetY(e) - 18, 4);
      DS.Audio.play('whisper');
      DS.FX.ring(cx(e), cy(e), 20, SOUL, 2);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  };

  function hadesEnrage(g, e) {
    ring(g, e, 10, 1.9, 'ice', SOUL);
    const p = g.player;
    if (p) {
      for (let i = -1; i <= 1; i++) {
        const x = clampX(g, cx(p) + i * 44);
        pillar(e, x, floorAt(g, x, feetY(e)), 46 + Math.abs(i) * 8, SOUL);
      }
    }
    DS.R.flash('#7ff0ff', 8);
  }

  // --- Zeus -------------------------------------------------------------------

  /* BOLTS marks the floor in several places at once and one under you; the marks last most of
     a second. STORM calls spirits into the air over the room. THUNDERCLAP is a leap and a
     shockwave along the floor both ways, a jump each. From half health the storm is on: a
     stray bolt is marked every few seconds whatever he is doing (zeusTick). */
  const BOLT = '#fff0a8';

  B.MOVES.BOLTS = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    const p = g.player;
    const t = 100 - e.stateTimer;
    if (t === 8) DS.Audio.play('cast');
    if (t === 16) {
      const s = span(g);
      const n = e.phase === 2 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const x = M.clamp(s.lo + (s.hi - s.lo) * (i + 0.5 + DS.rand.float(-0.3, 0.3)) / n, s.lo, s.hi);
        pillar(e, x, floorAt(g, x, feetY(e)), 44 + (i % 3) * 10, BOLT);
      }
      if (p) {
        const x = clampX(g, cx(p));
        pillar(e, x, floorAt(g, x, feetY(e)), 50, BOLT);
      }
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  };

  B.MOVES.STORM = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    if (e.stateTimer > 36 && e.frame % 4 === 0) DS.FX.spark(cx(e), e.y - 4, 2, BOLT);
    if (!e.actionDone && e.stateTimer < 36) {
      e.actionDone = true;
      const s = span(g);
      const xs = [s.lo + (s.hi - s.lo) * 0.25, s.lo + (s.hi - s.lo) * 0.75, s.lo + (s.hi - s.lo) * 0.5];
      summon(g, 'stormspirit', xs.slice(0, e.phase === 2 ? 3 : 2), feetY(e) - 90, 3);
      DS.Audio.play('thunder');
      DS.R.flash(BOLT, 4);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  };

  B.MOVES.THUNDERCLAP = function (g, e, dx) {
    e.stateTimer--;
    if (!e.moveBegun) {
      e.moveBegun = true;
      e.vy = -7.4;
      e.vx = M.clamp(dx / 34, -3, 3);
      DS.Audio.play('dash');
    }
    if (!e.actionDone && e.onGround && e.vy >= 0 && e.stateTimer < 74) {
      e.actionDone = true;
      e.vx = 0;
      DS.Audio.play('thunder');
      DS.R.shake(10);
      DS.R.flash('#fff8d0', 5);
      DS.FX.ring(cx(e), feetY(e), 26, e.def.color, 2.8);
      DS.FX.dust(cx(e), feetY(e), 16);
      hurtRect(g, e, cx(e) - 18, feetY(e) - 28, 36, 30);
      const waves = e.phase === 2 ? 3 : 2;
      [-1, 1].forEach(function (dir) {
        for (let i = 0; i < waves; i++) {
          shot(g, e, {
            x: cx(e) + dir * 12, y: feetY(e) - 8, vx: dir * (2.1 + i * 0.7), vy: 0, w: 10, h: 8,
            element: 'lightning', trailColor: BOLT, life: 130, damage: e.attackDamage
          });
        }
      });
    }
    if (e.stateTimer <= 0 && e.onGround) go(e, 'IDLE', 34);
  };

  B.MOVES.THUNDERBALLS = function (g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    if ([40, 30, 20].indexOf(e.stateTimer) >= 0) {
      DS.Audio.play('zap');
      const fromY = e.y + 10;
      const aim = aimAt(g, e, 2.6, fromY);
      shot(g, e, {
        x: cx(e) - 3, y: fromY, vx: aim.vx, vy: aim.vy,
        element: 'lightning', trailColor: BOLT, life: 150, damage: e.attackDamage
      });
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 28);
  };

  /* Every frame, whatever he is doing. Once the storm is on (phase 2) a bolt is marked
     somewhere in the room every few seconds. */
  function zeusTick(g, e) {
    tickPillars(g, e);
    if (e.phase !== 2 || e.state === 'INTRO' || e.state === 'ENRAGE') return;
    e.stormT = (e.stormT == null ? 120 : e.stormT) - 1;
    if (e.stormT > 0) return;
    e.stormT = DS.rand.int(150, 240);
    const s = span(g);
    const x = DS.rand.float(s.lo, s.hi);
    pillar(e, x, floorAt(g, x, feetY(e)), 50, BOLT);
  }

  function zeusEnrage(g, e) {
    ring(g, e, 12, 2.2, 'lightning', BOLT);
    const p = g.player;
    if (p) {
      for (let i = -1; i <= 1; i += 2) {
        const x = clampX(g, cx(p) + i * 50);
        pillar(e, x, floorAt(g, x, feetY(e)), 48, BOLT);
      }
    }
    DS.R.flash('#ffffff', 10);
    DS.R.shake(8);
  }

  function pillarsOnly(g, e) { tickPillars(g, e); }

  // --- registration -----------------------------------------------------------

  B.KINDS.minotaur = {
    name: 'THE MINOTAUR',
    sprite: 'golem', scale: 3, tint: '#c88a5a', color: '#d8703a',
    w: 30, h: 34, hp: 340, armor: 5, touch: 3, damage: 3,
    gore: ['#7a5230', '#e8e0c8', '#c0303c'],
    phase1: ['RUSH', 'AXESPIN', 'SLAM', 'RUSH'],
    phase2: ['RUSH', 'AXESPIN', 'QUAKE', 'RUSH', 'AXESPIN'],
    timers: { RUSH: RUSH_T, AXESPIN: SPIN_T },
    init: minotaurInit,
    onEnrage: minotaurEnrage
  };

  B.KINDS.medusa = {
    name: 'MEDUSA',
    sprite: 'necromancer', scale: 3, tint: '#8ad070', color: '#7ad06a',
    w: 22, h: 34, hp: 300, armor: 3, touch: 2, damage: 3,
    gore: ['#b8b4a8', '#5cbf62', '#f4f0d8'],
    phase1: ['GAZE', 'SNAKES', 'LEAP', 'GAZE', 'PIT'],
    phase2: ['GAZE', 'SNAKES', 'PIT', 'LEAP', 'GAZE', 'SNAKES'],
    timers: { GAZE: GAZE_T, SNAKES: 60, PIT: 60, LEAP: 70 },
    onEnrage: medusaEnrage
  };

  B.KINDS.talos = {
    name: 'TALOS',
    sprite: 'golem', scale: 3, tint: '#d8a04a', color: '#e8a83a',
    w: 34, h: 38, hp: 420, armor: 6, touch: 3, damage: 3,
    gore: ['#c98a3a', '#8a5a1e', '#ffb060'],
    phase1: ['ERUPT', 'METEOR', 'ANVIL', 'LAVAWAVE'],
    phase2: ['ERUPT', 'METEOR', 'ANVIL', 'LAVAWAVE', 'CHARGE'],
    timers: { ERUPT: 70, METEOR: 60, LAVAWAVE: 70, ANVIL: 76 },
    init: talosInit,
    onEnrage: talosEnrage
  };

  B.KINDS.hades = {
    name: 'HADES',
    sprite: 'necromancer', scale: 3, tint: '#6a7ad8', color: '#7f9cff',
    w: 24, h: 36, hp: 380, armor: 4, touch: 2, damage: 3,
    gore: ['#7f9cff', '#2a2444', '#7ff0ff'],
    phase1: ['SOULFIRE', 'BIDENT', 'SHADES', 'BIDENT'],
    phase2: ['SOULFIRE', 'BIDENT', 'SHADES', 'SMITE', 'BIDENT'],
    timers: { SOULFIRE: 90, BIDENT: BIDENT_T, SHADES: 60 },
    tick: pillarsOnly,
    onEnrage: hadesEnrage
  };

  B.KINDS.zeus = {
    name: 'ZEUS',
    sprite: 'necromancer', scale: 3, tint: '#fff0a8', color: '#ffe45c',
    w: 26, h: 38, hp: 440, armor: 4, touch: 3, damage: 3,
    gore: ['#ffe45c', '#f4f0d8', '#6a728c'],
    phase1: ['BOLTS', 'STORM', 'THUNDERCLAP', 'BOLTS'],
    phase2: ['BOLTS', 'THUNDERCLAP', 'STORM', 'THUNDERBALLS', 'THUNDERCLAP'],
    timers: { BOLTS: 100, STORM: 70, THUNDERCLAP: 84, THUNDERBALLS: 50 },
    tick: zeusTick,
    onEnrage: zeusEnrage
  };

})(window.DS);
