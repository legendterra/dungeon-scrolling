/* The floor bosses: the Stone Warden at the bottom of the mountain shaft, and
   the Arbiter chained in the trial chamber.

   Both run the same brain. A boss is a rotation of telegraphed moves picked
   from a list, with a second, angrier list unlocked at half health - the same
   shape as the Slime King, generalised so a new one is a table entry rather
   than a new file. What separates them is the moveset and how much punishment
   they soak: these are meant to be fought, not brushed past, so their health
   pools are deep and their armour is real. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;
  const A = DS.Art;

  /* Health is deliberately heavy. A floor boss that dies in four swings is a
     mini-boss with a health bar, and the whole point of gating the vault and
     the trial behind one is that the fight is the content. */
  const KINDS = {
    warden: {
      name: 'THE STONE WARDEN',
      sprite: 'golem', scale: 3, tint: '#b98d5c', color: '#e8a05a',
      w: 30, h: 30, hp: 320, armor: 5, touch: 2, damage: 3,
      gore: ['#9b96b8', '#6f6a90', '#b98d5c'],
      phase1: ['SLAM', 'BOULDER', 'QUAKE', 'SLAM'],
      phase2: ['CHARGE', 'QUAKE', 'BOULDER', 'SLAM', 'CHARGE']
    },
    arbiter: {
      name: 'THE ARBITER',
      sprite: 'necromancer', scale: 3, tint: '#f2c14e', color: '#f2c14e',
      w: 24, h: 32, hp: 300, armor: 4, touch: 2, damage: 3,
      gore: ['#f2c14e', '#fff0a8', '#7f45b8'],
      phase1: ['SMITE', 'VOLLEY', 'SUMMON', 'SMITE'],
      phase2: ['SMITE', 'VOLLEY', 'CHARGE', 'SUMMON', 'SMITE']
    }
  };

  // --- construction ---------------------------------------------------------

  function artFor(cfg) {
    const S = DS.SPR;
    const base = S[cfg.sprite] || S.golem;
    if (!cfg.cache) {
      cfg.cache = base.map(function (spr) { return A.scaled(spr, cfg.scale); });
      cfg.cacheFlip = cfg.cache.map(A.flipped);
    }
    return cfg.cache;
  }

  function create(g, x, y, key) {
    const cfg = KINDS[key] || KINDS.warden;
    artFor(cfg);

    const e = Ent.make(x - cfg.w / 2, y - cfg.h, cfg.w, cfg.h);
    e.kind = 'boss';
    e.bossKey = key;
    e.isBoss = true;
    e.tier = 'boss';
    e.cfg = { sight: 9999, sprite: cfg.sprite };
    e.def = cfg;
    e.name = cfg.name;
    e.barColor = cfg.color;
    e.gore = cfg.gore;
    e.heavy = true;
    e.armor = cfg.armor;

    /* Depth scaling on top of an already deep pool. The floor a boss appears
       on is never the first, so this is always at least a doubling. */
    e.maxHp = Math.round(cfg.hp * (1 + (g.depth - 1) * 0.26) *
                         DS.Modifiers.mult(g, 'enemyHp'));
    e.hp = e.maxHp;
    e.touchDamage = cfg.touch;
    e.attackDamage = cfg.damage;

    e.phase = 1;
    e.state = 'INTRO';
    e.stateTimer = 80;
    e.attackCooldown = 0;
    e.invuln = 0;
    e.facing = -1;
    e.hurtFlash = 0;
    e.smites = [];
    e.brain = update;
    e.drawFn = draw;

    e.onDeath = function (gg, self) {
      DS.Audio.play('victory');
      DS.R.shake(12);
      DS.R.flash('#ffffff', 14);
      DS.FX.burst(Ent.centerX(self), Ent.centerY(self), 60,
                  [cfg.color, '#ffffff', '#f2c14e'], { speed: 3.4, life: 44 });
      if (gg.onFloorBossDown) gg.onFloorBossDown(self);
    };

    g.enemies.push(e);
    g.boss = e;
    DS.Audio.play('bossRoar');
    DS.R.shake(6);
    return e;
  }

  // --- brain ----------------------------------------------------------------

  function update(g, e) {
    e.frame++;
    if (e.invuln > 0) e.invuln--;
    if (e.hurtFlash > 0) e.hurtFlash--;
    if (e.attackCooldown > 0) e.attackCooldown--;

    Ent.tickStatus(g, e);
    if (e.dead) return;

    if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      e.state = 'ENRAGE';
      e.stateTimer = 66;
      e.invuln = 66;
      DS.Audio.play('bossRoar');
      DS.R.shake(8);
      DS.FX.ring(Ent.centerX(e), Ent.centerY(e), 26, e.def.color, 2.6);
    }

    const p = g.player;
    const dx = p ? Ent.centerX(p) - Ent.centerX(e) : 0;

    switch (e.state) {
      case 'INTRO':   e.vx = 0; if (--e.stateTimer <= 0) go(e, 'IDLE', 36); break;
      case 'ENRAGE':  enrage(g, e); break;
      case 'IDLE':    idle(g, e, dx); break;
      case 'SLAM':    slam(g, e); break;
      case 'QUAKE':   quake(g, e); break;
      case 'BOULDER': boulder(g, e, dx); break;
      case 'VOLLEY':  volley(g, e, dx); break;
      case 'SUMMON':  summon(g, e); break;
      case 'SMITE':   smite(g, e); break;
      case 'CHARGE':  charge(g, e); break;
      default:        go(e, 'IDLE', 30); break;
    }

    updateSmites(g, e);
    Phys.step(e, g.map);
    keepInArena(g, e);
    touchPlayer(g, e);
  }

  function go(e, state, timer) {
    e.state = state;
    e.stateTimer = timer;
    e.actionDone = false;
  }

  /* Arenas are carved rooms with a door at one end. Without this a charging
     boss ends up standing in the doorway, or worse, wandering out of the room
     the player is locked into. */
  function keepInArena(g, e) {
    if (!g.arena) return;
    if (e.x < g.arena.x0) { e.x = g.arena.x0; e.vx = Math.abs(e.vx); }
    if (e.x + e.w > g.arena.x1) { e.x = g.arena.x1 - e.w; e.vx = -Math.abs(e.vx); }
  }

  function touchPlayer(g, e) {
    const p = g.player;
    if (!p || p.dead) return;
    if (M.overlap(e, p)) DS.Player.touch(g, p, e, e.touchDamage);
  }

  function enrage(g, e) {
    e.vx = 0;
    if (e.frame % 4 === 0) {
      DS.FX.trail(Ent.centerX(e) + DS.rand.float(-16, 16),
                  e.y + DS.rand.float(0, e.h), e.def.color);
    }
    if (--e.stateTimer <= 0) go(e, 'IDLE', 20);
  }

  function idle(g, e, dx) {
    e.facing = M.sign(dx) || e.facing;
    e.vx = M.approach(e.vx, M.sign(dx) * 0.4, 0.05);
    if (--e.stateTimer > 0) return;

    const list = e.phase === 1 ? e.def.phase1 : e.def.phase2;
    const next = DS.rand.pick(list);
    go(e, next, next === 'CHARGE' ? 74 : next === 'SMITE' ? 96 : 56);

    if (next === 'SLAM') { e.vy = -5.6; e.vx = M.sign(dx) * 1.5; }
    if (next === 'CHARGE') e.vx = e.facing * 3.2;
  }

  // --- moves ----------------------------------------------------------------

  function slam(g, e) {
    e.stateTimer--;
    if (!e.actionDone && e.onGround && e.vy >= 0 && e.frame > 4) {
      e.actionDone = true;
      DS.Audio.play('slam');
      DS.R.shake(7);
      DS.FX.ring(Ent.centerX(e), e.y + e.h, 20, e.def.color, 2.4);
      DS.FX.dust(Ent.centerX(e), e.y + e.h, 16);
      [-1, 1].forEach(function (dir) {
        Ent.spawnProjectile(g, {
          x: Ent.centerX(e) + dir * 14, y: e.y + e.h - 6,
          vx: dir * 2.3, vy: 0, gravity: 0,
          damage: e.attackDamage, friendly: false, kind: 'orb', element: 'earth',
          life: 100, w: 7, h: 7
        });
      });
    }
    if (e.stateTimer <= 0 && e.onGround) go(e, 'IDLE', 30);
  }

  /* Ground spikes marching outward. The tell is the dust line, which appears a
     full second before anything can hurt you. */
  function quake(g, e) {
    e.stateTimer--;
    e.vx *= 0.8;

    if (e.stateTimer === 30) {
      DS.Audio.play('slam');
      DS.R.shake(4);
    }
    if (e.stateTimer < 30 && e.stateTimer % 6 === 0) {
      const step = (30 - e.stateTimer) * 2;
      [-1, 1].forEach(function (dir) {
        const x = Ent.centerX(e) + dir * step;
        DS.FX.dust(x, e.y + e.h, 3);
        Ent.spawnProjectile(g, {
          x: x - 4, y: e.y + e.h - 10,
          vx: 0, vy: -1.1, gravity: 0.06,
          damage: e.attackDamage - 1, friendly: false, kind: 'orb',
          element: 'earth', life: 44, w: 8, h: 10
        });
      });
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  }

  function boulder(g, e, dx) {
    e.stateTimer--;
    e.vx *= 0.85;
    if (!e.actionDone && e.stateTimer < 30) {
      e.actionDone = true;
      DS.Audio.play('cast');
      for (let i = -1; i <= 1; i++) {
        Ent.spawnProjectile(g, {
          x: Ent.centerX(e), y: e.y + 4,
          vx: M.clamp(dx / 40, -2.8, 2.8) + i * 0.5, vy: -3.4,
          gravity: 0.12, damage: e.attackDamage, friendly: false,
          kind: 'orb', element: 'earth', life: 200, w: 8, h: 8
        });
      }
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  }

  function volley(g, e, dx) {
    e.stateTimer--;
    e.vx *= 0.85;
    if (!e.actionDone && e.stateTimer < 26) {
      e.actionDone = true;
      DS.Audio.play('cast');
      const dir = M.sign(dx) || e.facing;
      for (let i = 0; i < 5; i++) {
        const spread = -0.9 + i * 0.45;
        Ent.spawnProjectile(g, {
          x: Ent.centerX(e), y: Ent.centerY(e),
          vx: dir * 2.6, vy: spread, gravity: 0.02,
          damage: e.attackDamage - 1, friendly: false, kind: 'orb',
          element: 'dark', life: 150, w: 6, h: 6
        });
      }
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 28);
  }

  function summon(g, e) {
    e.stateTimer--;
    e.vx *= 0.85;
    if (!e.actionDone && e.stateTimer < 24) {
      e.actionDone = true;
      const count = 2 + (e.phase === 2 ? 1 : 0);
      const table = DS.Enemies.spawnTable(g.depth);
      for (let i = 0; i < count; i++) {
        const sx = Ent.centerX(e) + DS.rand.float(-40, 40);
        DS.Enemies.create(g, sx, e.y + e.h - 16, g.rng.weighted(table), false);
      }
      DS.Audio.play('cast');
      DS.FX.ring(Ent.centerX(e), Ent.centerY(e), 18, e.def.color, 2);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 34);
  }

  /* Pillars of light dropped on where the player is standing. Each one shows
     its footprint for most of a second before it lands, so it punishes staying
     still rather than punishing existing. */
  const SMITE_WARN = 46;

  function smite(g, e) {
    e.stateTimer--;
    e.vx *= 0.8;
    const p = g.player;

    if (p && !p.dead && e.stateTimer % 26 === 0 && e.stateTimer > 20) {
      e.smites.push({
        x: Ent.centerX(p), y: p.y + p.h, timer: SMITE_WARN, hit: false
      });
      DS.Audio.play('cast');
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 30);
  }

  function updateSmites(g, e) {
    if (!e.smites || !e.smites.length) return;
    const p = g.player;

    for (let i = e.smites.length - 1; i >= 0; i--) {
      const s = e.smites[i];
      s.timer--;

      if (s.timer === 0) {
        DS.Audio.play('lightning');
        DS.R.shake(5);
        DS.FX.burst(s.x, s.y - 8, 18, [e.def.color, '#ffffff'],
                    { speed: 2.2, life: 22, grav: -0.02 });
        if (!g.bolts) g.bolts = [];
        g.bolts.push({ x1: s.x, y1: s.y - 140, x2: s.x, y2: s.y, life: 12,
                       color: e.def.color });
        if (p && !p.dead &&
            M.rectsOverlap(s.x - 10, s.y - 60, 20, 62, p.x, p.y, p.w, p.h)) {
          p.hurt(g, e.attackDamage, M.sign(Ent.centerX(p) - s.x) || 1);
        }
      }
      if (s.timer <= -10) e.smites.splice(i, 1);
    }
  }

  function charge(g, e) {
    e.stateTimer--;
    e.vx = e.facing * 3.2;
    if (e.frame % 3 === 0) {
      DS.FX.trail(Ent.centerX(e), Ent.centerY(e) + DS.rand.float(-8, 8), e.def.tint);
    }
    const wall = Phys.wallAhead(g.map, e, e.facing) ||
                 (g.arena && (e.x <= g.arena.x0 + 1 || e.x + e.w >= g.arena.x1 - 1));
    if (wall) {
      e.facing *= -1;
      e.vx = 0;
      e.stateTimer = Math.min(e.stateTimer, 14);
      DS.R.shake(6);
      DS.Audio.play('slam');
      DS.FX.dust(Ent.centerX(e), e.y + e.h, 12);
    }
    if (e.stateTimer <= 0) go(e, 'IDLE', 28);
  }

  // --- draw -----------------------------------------------------------------

  function draw(g, e) {
    const R = DS.R;
    const cfg = e.def;
    const frames = e.facing < 0 ? cfg.cacheFlip : cfg.cache;
    const busy = e.state !== 'IDLE' && e.state !== 'INTRO';
    let sprite = frames[busy ? Math.min(1, frames.length - 1) : 0];
    if (e.hurtFlash > 0 && frames.length > 2) sprite = frames[2];

    const ax = Math.round(Ent.centerX(e) - sprite.uw / 2);
    const ay = e.y + e.h - sprite.uh;

    // Warning footprints go under the body, so the boss never hides them.
    drawSmites(g, e, R);

    DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), 52, glowOf(cfg.color));

    if (e.hurtFlash > 0) {
      R.spr(A.silhouette(sprite, '#ffffff'), ax, ay);
    } else {
      R.spr(sprite, ax, ay);
      R.sprAlpha(A.silhouette(sprite, cfg.tint), ax, ay, 0.45);
    }

    if (e.invuln > 0 && Math.floor(e.frame / 4) % 2 === 0) {
      DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), 58, 'rgba(255,255,255,0.12)');
    }

    // The wind-up on a charge or a slam reads from the body itself.
    if (e.state === 'CHARGE') {
      if (e.frame % 3 === 0) {
        DS.FX.dust(Ent.centerX(e), e.y + e.h, 2);
        DS.FX.spark(Ent.centerX(e), Ent.centerY(e), 2, '#c0303c');
      }
    }
  }

  function drawSmites(g, e, R) {
    if (!e.smites) return;
    for (let i = 0; i < e.smites.length; i++) {
      const s = e.smites[i];
      if (s.timer <= 0) continue;
      const ratio = 1 - s.timer / SMITE_WARN;
      DS.Map.glow(R, s.x, s.y - 12, 16 + ratio * 14, 'rgba(242,193,78,' + (0.2 + ratio * 0.4).toFixed(2) + ')');
      if (s.timer % 4 === 0) {
        DS.FX.spark(s.x, s.y - 2, 2, '#fff0a8');
      }
    }
  }

  function glowOf(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const gg = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + gg + ',' + b + ',0.20)';
  }

  DS.Bosses = { create: create, KINDS: KINDS };
})(window.DS);
