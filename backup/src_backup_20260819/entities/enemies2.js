/* The deep-floor bestiary.

   These register themselves into the same TYPES table and run the same
   wind -> strike -> recover state machine as the starting four, so everything
   the player learned on floor one still applies. What changes is the shape of
   the threat: something that cannot be approached, something that cannot be
   walked away from, something that must be hit from behind. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;
  const A = DS.Art;

  // --- art ------------------------------------------------------------------

  const SPITTER = [
    '....kkkk....',
    '..kkllllkk..',
    '.klLLLLLLlk.',
    'klLLkkkkLLlk',
    'klLLkRRkLLlk',
    'klLLkkkkLLlk',
    '.klLLLLLLlk.',
    '..keeeeeek..',
    '..keeeeeek..',
    '...keeeek...',
    '..keEEEEek..',
    '..kkkkkkkk..'
  ];

  const SPITTER_OPEN = [
    '....kkkk....',
    '..kkllllkk..',
    '.klLLLLLLlk.',
    'klLkkkkkkLlk',
    'klkRRRRRRklk',
    'klLkkkkkkLlk',
    '.klLLLLLLlk.',
    '..keeeeeek..',
    '..keeeeeek..',
    '...keeeek...',
    '..keEEEEek..',
    '..kkkkkkkk..'
  ];

  const SPIDER = [
    'k..k....k..k',
    '.k.k....k.k.',
    '..kkkkkkkk..',
    '.kKKKKKKKKk.',
    'kKKWKKKKWKKk',
    'kKKKKKKKKKKk',
    '.kKKKKKKKKk.',
    '..kkKKKKkk..',
    '...kkkkkk...',
    '..k.k..k.k..'
  ];

  const SPIDER_TUCK = [
    '.k.k....k.k.',
    '..kk....kk..',
    '..kkkkkkkk..',
    '.kKKKKKKKKk.',
    'kKKWKKKKWKKk',
    'kKKKKKKKKKKk',
    '.kKKKKKKKKk.',
    '..kkKKKKkk..',
    '...kkkkkk...',
    '...k.kk.k...'
  ];

  const BOMBER = [
    '.....y......',
    '....y.......',
    '...kkkk.....',
    '..kRRRRkk...',
    '.kRRRRRRRk..',
    'kRRrrrrRRRk.',
    'kRrWrrWrRRk.',
    'kRRrrrrRRRk.',
    'kRRRRRRRRRk.',
    '.kRRRRRRRk..',
    '..kRRRRRk...',
    '...kkkkk....'
  ];

  const SHIELDER = [
    '..kkkkkk....',
    '.kGGGGGGk...',
    '.kGkGGkGk...',
    '.kGGGGGGk...',
    '..kGGGGk.kk.',
    '.kGGGGGGkkGk',
    '.kGGGGGGkkGk',
    '.kGGGGGGkkGk',
    '.kGGGGGGkkGk',
    '..kGGGGk.kk.',
    '..kGGGGk....',
    '..kGGkGGk...',
    '..kGk.kGk...',
    '..kGk.kGk...',
    '..kkk.kkk...',
    '............'
  ];

  const WRAITH = [
    '...kkkk.....',
    '..kGGGGk....',
    '.kGkGGkGk...',
    '.kGGGGGGk...',
    '..kGGGGk....',
    '.kGGGGGGk...',
    'kGGGGGGGGk..',
    'kGGGGGGGGk..',
    '.kGGGGGGk...',
    '.kGGGGGGk...',
    '..kGGGGk....',
    '..kG.Gk.....',
    '...k.k......',
    '............'
  ];

  const NECRO = [
    '...kkkk...',
    '..kppppk..',
    '.kpwwwwpk.',
    '.kpwRRwpk.',
    '.kpwwwwpk.',
    '..kppppk..',
    '.kPPPPPPk.',
    'kPPPPPPPPk',
    'kPPPPPPPPk',
    '.kPPPPPPk.',
    '.kPPPPPPk.',
    '..kPPPPk..',
    '..kPPPPk..',
    '..kPPPPk..',
    '..kkkkkk..',
    '..........'
  ];

  const GOLEM = [
    '....kkkkkkkk....',
    '..kkGGGGGGGGkk..',
    '.kGGGGGGGGGGGGk.',
    '.kGGkkGGGGkkGGk.',
    '.kGGkYGGGGYkGGk.',
    '.kGGkkGGGGkkGGk.',
    '.kGGGGGGGGGGGGk.',
    'kGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGk',
    'kGGgggGGGGgggGGk',
    'kGGGGGGGGGGGGGGk',
    '.kGGGGGGGGGGGGk.',
    '.kGGGGGGGGGGGGk.',
    '..kGGGGkkGGGGk..',
    '..kGGGk..kGGGk..',
    '..kGGGk..kGGGk..',
    '..kkkkk..kkkkk..',
    '................'
  ];

  const GOLEM_POUND = GOLEM.slice(0, 13).concat([
    '..kGGGGkkGGGGk..',
    '..kGGGGkkGGGGk..',
    '..kGGGk..kGGGk..',
    '..kkkk....kkkk..',
    '................'
  ]);

  function sheet(frames, pal) {
    return frames.map(function (rows) { return A.makeSprite(rows, pal); });
  }

  // --- registration ---------------------------------------------------------

  const ELITE_PAL = {
    l: '#e8743b', L: '#f2c14e', G: '#e8a05a', P: '#e8743b', K: '#4a2b1a'
  };

  function define(key, cfg, frames) {
    DS.Enemies.TYPES[key] = cfg;

    const S = DS.SPR;
    S[key] = sheet(frames, null);
    S.elite[key] = sheet(frames, ELITE_PAL);
    S.mini[key] = S[key].map(function (spr) { return A.scaled(spr, 2); });

    S.flip[key] = S[key].map(A.flipped);
    S.flip.elite[key] = S.elite[key].map(A.flipped);
    S.flip.mini[key] = S.mini[key].map(A.flipped);
  }

  // --- behaviours -----------------------------------------------------------

  /* Spitter — rooted. It never chases, so the pressure comes from the arc it
     lobs: you either close the distance or shoot it down. */
  function spitter(g, e, dx, dy, dist, sees, slow, phase) {
    e.vx = 0;
    e.facing = M.sign(dx) || e.facing;

    if (phase === 'strike' && !e.struck) {
      e.struck = true;
      DS.Audio.play('cast');
      Ent.spawnProjectile(g, {
        x: Ent.centerX(e), y: e.y - 2,
        vx: M.clamp(dx / 34, -2.6, 2.6), vy: -2.4,
        gravity: 0.09, damage: e.attackDamage, friendly: false,
        kind: 'orb', element: 'poison', life: 200, w: 6, h: 6,
        trailColor: '#5cbf62'
      });
      return;
    }

    if (phase === 'none' && sees && e.attackCooldown <= 0 && dist < e.cfg.range) {
      DS.Enemies.beginAttack(e);
    }
  }

  /* Spider — hangs from the ceiling until you walk underneath, then drops. On
     the ground it is fast and skittish. */
  function spider(g, e, dx, dy, dist, sees, slow, phase) {
    if (e.hanging) {
      e.vy = 0;
      if (sees && Math.abs(dx) < 30 && dy > 0) {
        e.hanging = false;
        e.vy = 1.4;
        DS.Audio.play('swing');
        DS.FX.dust(Ent.centerX(e), e.y, 4);
      }
      return;
    }

    if (phase === 'strike') {
      e.vx = e.facing * 2.9 * slow;
      e.touchDamage = e.attackDamage;
      return;
    }
    e.touchDamage = 0;

    if (phase === 'wind' || phase === 'recover') { e.vx *= 0.6; return; }

    if (sees && dist < e.cfg.range && e.attackCooldown <= 0) {
      e.facing = M.sign(dx) || e.facing;
      DS.Enemies.beginAttack(e);
      return;
    }

    DS.Enemies.walkToward(g, e, dx, sees, slow, 0.12);
  }

  /* Bomber — commits to a straight run and detonates. Killing it still sets the
     bomb off, so standing next to one is a mistake either way. */
  function bomber(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.8; return; }

    if (phase === 'strike' && !e.struck) {
      e.struck = true;
      detonate(g, e);
      return;
    }

    if (phase === 'none' && sees && dist < e.cfg.range && e.attackCooldown <= 0) {
      DS.Enemies.beginAttack(e);
      DS.Audio.play('error');
      return;
    }

    DS.Enemies.walkToward(g, e, dx, sees, slow, 0.1, 1.6);
  }

  function detonate(g, e) {
    const radius = 40 * e.sizeScale;
    DS.Audio.play('slam');
    DS.R.shake(6);
    DS.R.flash('#e8743b', 6);
    DS.FX.burst(Ent.centerX(e), Ent.centerY(e), 26,
                ['#e8743b', '#f2c14e', '#c0303c'], { speed: 3, life: 26 });
    DS.Elements.spawnField(g, Ent.centerX(e), e.y + e.h, 'fire', e.attackDamage * 12);

    const p = g.player;
    if (p && !p.dead &&
        M.dist(Ent.centerX(p), Ent.centerY(p), Ent.centerX(e), Ent.centerY(e)) < radius) {
      p.hurt(g, e.attackDamage, M.sign(Ent.centerX(p) - Ent.centerX(e)) || 1);
    }
    for (let i = 0; i < g.enemies.length; i++) {
      const o = g.enemies[i];
      if (o === e || o.dead) continue;
      if (M.dist(Ent.centerX(o), Ent.centerY(o), Ent.centerX(e), Ent.centerY(e)) > radius) continue;
      Ent.damageEnemy(g, o, e.maxHp * 0.5, { dir: 1, knockback: 3 });
    }
    Ent.killEnemy(g, e);
  }

  /* Shielder — light hits bounce off the front. The answer is a heavy attack, a
     skill, or getting behind it. */
  function shielder(g, e, dx, dy, dist, sees, slow, phase) {
    e.shieldUp = phase !== 'strike' && phase !== 'recover';

    if (phase === 'wind') { e.vx *= 0.5; return; }
    if (phase === 'strike') {
      e.vx = e.facing * 1.6;
      DS.Enemies.strikePlayer(g, e, DS.Enemies.meleeBox(e));
      return;
    }
    if (phase === 'recover') { e.vx *= 0.7; return; }

    const inRange = Math.abs(dx) < e.cfg.range * e.sizeScale && Math.abs(dy) < 18 * e.sizeScale;
    if (sees && inRange && e.attackCooldown <= 0) {
      e.facing = M.sign(dx) || e.facing;
      DS.Enemies.beginAttack(e);
      return;
    }

    DS.Enemies.walkToward(g, e, dx, sees, slow, 0.06);
  }

  /* Wraith — walks through the level itself. No wall, no pit and no ledge will
     save you; it just keeps coming, slowly, and drains mana on contact. */
  function wraith(g, e, dx, dy, dist, sees, slow, phase) {
    e.phaseAlpha = 0.55 + Math.sin(e.frame * 0.06) * 0.2;

    if (phase === 'strike') {
      e.touchDamage = e.attackDamage;
      const len = Math.max(1, dist);
      e.x += (dx / len) * 2.4 * slow;
      e.y += (dy / len) * 2.4 * slow;
      return;
    }
    e.touchDamage = 0;

    if (phase === 'wind') return;

    if (sees && dist < 44 && e.attackCooldown <= 0) {
      DS.Enemies.beginAttack(e);
      return;
    }

    if (sees) {
      const len = Math.max(1, dist);
      e.x += (dx / len) * e.speed * slow;
      e.y += (dy / len) * e.speed * slow;
      e.facing = M.sign(dx) || e.facing;
    } else {
      e.x += e.facing * e.speed * 0.4;
    }

    drainMana(g, e);
  }

  function drainMana(g, e) {
    const p = g.player;
    if (!p || p.dead || !M.overlap(e, p)) return;
    p.mana = Math.max(0, p.mana - 0.7);
  }

  /* Necromancer — never fights you directly. It raises skeletons and blinks
     away, so it has to be chased down or picked off at range. */
  function necromancer(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') {
      e.vx *= 0.7;
      if (e.frame % 4 === 0) {
        DS.FX.trail(Ent.centerX(e) + DS.rand.float(-8, 8), e.y + e.h, '#c86ee0');
      }
      return;
    }

    if (phase === 'strike' && !e.struck) {
      e.struck = true;
      const count = e.tier === 'normal' ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const sx = Ent.centerX(e) + DS.rand.float(-24, 24);
        DS.Enemies.create(g, sx, e.y + e.h - 16, 'skeleton', 'normal');
      }
      DS.Audio.play('cast');
      DS.FX.ring(Ent.centerX(e), e.y + e.h, 16, '#c86ee0', 2);
      blink(g, e, dx);
      return;
    }

    if (phase === 'recover') { e.vx *= 0.8; return; }

    if (sees && e.attackCooldown <= 0 && g.enemies.length < 14) {
      DS.Enemies.beginAttack(e);
      return;
    }

    // Backs away while the cooldown runs.
    if (sees && dist < 70) {
      DS.Enemies.walkToward(g, e, -dx, true, slow, 0.1);
      e.facing = M.sign(dx) || e.facing;
    } else {
      e.vx *= 0.85;
    }
  }

  function blink(g, e, dx) {
    const away = -(M.sign(dx) || 1);
    const target = e.x + away * 56;
    const tx = Math.floor(target / DS.C.TILE);
    if (tx < 1 || tx >= g.map.w - 1) return;
    if (g.map.floorBelow(tx, 0) >= g.map.pixelH) return;   // never blink into a pit

    DS.FX.burst(Ent.centerX(e), Ent.centerY(e), 12, ['#3c2154', '#c86ee0'],
                { speed: 2, life: 16, grav: 0 });
    e.x = target;
    DS.FX.burst(Ent.centerX(e), Ent.centerY(e), 12, ['#3c2154', '#c86ee0'],
                { speed: 2, life: 16, grav: 0 });
  }

  /* Golem — a wall with legs. Its pound hits the whole floor in front of it, so
     the only safe place is off the ground. */
  function golem(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.5; return; }

    if (phase === 'strike' && !e.struck) {
      e.struck = true;
      DS.Audio.play('slam');
      DS.R.shake(7);
      DS.FX.ring(Ent.centerX(e), e.y + e.h, 22, '#b98d5c', 2.6);
      DS.FX.dust(Ent.centerX(e), e.y + e.h, 14);

      const p = g.player;
      if (p && !p.dead && p.onGround &&
          Math.abs(Ent.centerX(p) - Ent.centerX(e)) < 70) {
        p.hurt(g, e.attackDamage, M.sign(Ent.centerX(p) - Ent.centerX(e)) || 1);
      }
      [-1, 1].forEach(function (side) {
        Ent.spawnProjectile(g, {
          x: Ent.centerX(e) + side * 16, y: e.y + e.h - 8,
          vx: side * 2.0, vy: 0, gravity: 0, damage: e.attackDamage,
          friendly: false, kind: 'orb', element: 'earth', life: 80, w: 8, h: 8
        });
      });
      return;
    }

    if (phase === 'recover') { e.vx *= 0.8; return; }

    if (sees && dist < e.cfg.range && e.attackCooldown <= 0) {
      e.facing = M.sign(dx) || e.facing;
      DS.Enemies.beginAttack(e);
      return;
    }

    DS.Enemies.walkToward(g, e, dx, sees, slow, 0.05);
  }

  // --- extra drawing --------------------------------------------------------

  function drawSpiderThread(g, e, R) {
    if (!e.hanging) return;
    R.line(Ent.centerX(e), e.ceiling || e.y - 40, Ent.centerX(e), e.y,
           'rgba(216,213,232,0.5)', 1);
  }

  function drawBomberSwell(g, e, R) {
    if (e.attackState !== 'wind') return;
    const ratio = 1 - e.attackTimer / Math.max(1, e.cfg.wind);
    if (Math.floor(e.frame / Math.max(2, Math.round(6 - ratio * 4))) % 2 === 0) {
      DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), 14 + ratio * 18,
                  'rgba(232,116,59,0.35)');
    }
  }

  function drawShield(g, e, R) {
    if (!e.shieldUp) return;
    const x = e.facing > 0 ? e.x + e.w - 3 : e.x - 1;
    R.rect(x, e.y + 4, 4, e.h - 8, 'rgba(168,228,255,0.30)');
  }

  function drawNecroCircle(g, e, R) {
    if (e.attackState !== 'wind') return;
    const ratio = 1 - e.attackTimer / Math.max(1, e.cfg.wind);
    R.arc(Ent.centerX(e), e.y + e.h, 14, -Math.PI, -Math.PI + Math.PI * 2 * ratio,
          '#c86ee0', 2, false);
  }

  function drawGolemCracks(g, e, R) {
    if (e.attackState !== 'wind') return;
    const ratio = 1 - e.attackTimer / Math.max(1, e.cfg.wind);
    R.rect(Ent.centerX(e) - 70 * ratio, e.y + e.h - 1, 140 * ratio, 1,
           'rgba(232,116,59,0.5)');
  }

  // --- definitions ----------------------------------------------------------

  define('spitter', {
    w: 12, h: 12, hp: 14, touch: 0, speed: 0, sight: 190, armor: 0,
    rooted: true, gore: ['#5cbf62', '#2f7d4f'], sprite: 'spitter',
    wind: 34, strike: 8, recover: 44, range: 180, damage: 1,
    behavior: spitter, minDepth: 2
  }, [SPITTER, SPITTER_OPEN]);

  define('spider', {
    w: 12, h: 10, hp: 8, touch: 0, speed: 1.3, sight: 150, armor: 0,
    gore: ['#1c1a2b', '#6e1b28'], sprite: 'spider',
    wind: 20, strike: 22, recover: 30, range: 56, damage: 1,
    behavior: spider, drawExtra: drawSpiderThread, hangs: true, minDepth: 3
  }, [SPIDER, SPIDER_TUCK]);

  define('bomber', {
    w: 12, h: 12, hp: 10, touch: 0, speed: 0.9, sight: 170, armor: 0,
    gore: ['#c0303c', '#e8743b'], sprite: 'bomber',
    wind: 46, strike: 4, recover: 10, range: 40, damage: 2,
    behavior: bomber, drawExtra: drawBomberSwell, explodes: detonate, minDepth: 3
  }, [BOMBER]);

  define('shielder', {
    w: 11, h: 16, hp: 26, touch: 0, speed: 0.4, sight: 170, armor: 2,
    heavy: true, gore: ['#9b96b8', '#6e1b28'], sprite: 'shielder',
    wind: 28, strike: 10, recover: 34, range: 24, damage: 2,
    hitbox: { w: 22, h: 14, oy: 1 }, blocksFront: true,
    behavior: shielder, drawExtra: drawShield, minDepth: 4
  }, [SHIELDER]);

  define('wraith', {
    w: 12, h: 14, hp: 18, touch: 0, speed: 0.55, sight: 260, armor: 1,
    flying: true, ghost: true, gore: ['#9b96b8', '#514c72'], sprite: 'wraith',
    wind: 24, strike: 30, recover: 40, range: 44, damage: 2,
    behavior: wraith, minDepth: 5
  }, [WRAITH]);

  define('necromancer', {
    w: 10, h: 16, hp: 22, touch: 0, speed: 0.5, sight: 220, armor: 1,
    gore: ['#7f45b8', '#3c2154'], sprite: 'necromancer',
    wind: 40, strike: 6, recover: 90, range: 200, damage: 1,
    behavior: necromancer, drawExtra: drawNecroCircle, minDepth: 6
  }, [NECRO]);

  define('golem', {
    w: 16, h: 18, hp: 60, touch: 0, speed: 0.3, sight: 200, armor: 4,
    heavy: true, gore: ['#9b96b8', '#6f6a90'], sprite: 'golem',
    wind: 44, strike: 12, recover: 50, range: 42, damage: 3,
    hitbox: { w: 30, h: 18, oy: 0 },
    behavior: golem, drawExtra: drawGolemCracks, minDepth: 7
  }, [GOLEM, GOLEM_POUND]);
})(window.DS);
