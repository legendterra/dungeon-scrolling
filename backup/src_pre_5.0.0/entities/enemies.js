/* The four dungeon dwellers plus their elite and mini-boss ranks.

   Contact damage is no longer the main threat — every enemy commits to a
   telegraphed attack instead:

     wind    a visible wind-up (colour flash, aim line, squash) you can react to
     strike  the frames that actually hurt
     recover a punish window where the enemy is open

   Only a slime's body and a bat mid-dive still hurt on touch, and both are
   moving in a readable way when they do. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;

  const TYPES = {
    slime: {
      w: 12, h: 9, hp: 9, touch: 1, speed: 0.55, sight: 110, armor: 0,
      gore: ['#5cbf62', '#2f7d4f', '#a3e86b'], sprite: 'slime',
      // The slime is a body: it hurts while airborne on a pounce, not idling.
      wind: 26, strike: 30, recover: 34, range: 60, damage: 1
    },
    zombie: {
      w: 9, h: 14, hp: 20, touch: 0, speed: 0.42, sight: 160, armor: 1,
      heavy: true, gore: ['#2f7d4f', '#6e1b28'], sprite: 'zombie',
      wind: 30, strike: 10, recover: 30, range: 22, damage: 2,
      hitbox: { w: 20, h: 14, oy: 0 }
    },
    bat: {
      w: 10, h: 8, hp: 5, touch: 0, speed: 1.15, sight: 150, armor: 0,
      flying: true, gore: ['#514c72', '#6e1b28'], sprite: 'bat',
      wind: 26, strike: 26, recover: 40, range: 70, damage: 1
    },
    skeleton: {
      w: 9, h: 14, hp: 11, touch: 0, speed: 0.5, sight: 200, armor: 0,
      ranged: true, gore: ['#d8d5e8', '#9b96b8'], sprite: 'skeleton',
      wind: 32, strike: 6, recover: 46, range: 190, damage: 1
    }
  };

  const RANKS = {
    normal:   { hp: 1,   touch: 0, speed: 1,    armor: 0, size: 1, wind: 1,    damage: 0 },
    elite:    { hp: 2.5, touch: 1, speed: 1.15, armor: 1, size: 1, wind: 0.8,  damage: 1 },
    miniboss: { hp: 6.5, touch: 1, speed: 0.95, armor: 2, size: 2, wind: 0.72, damage: 1 },
    /* Colossal: three times the sprite, but the body box only covers the lower
       third. You fight its legs, the way you fight a dragon — walking into the
       silhouette of its head should not cost a heart. */
    colossal: { hp: 14, touch: 1, speed: 0.7, armor: 3, size: 3, wind: 0.62,
                damage: 2, footBox: 0.42 }
  };

  /* The starting four thin out as the deeper bestiary unlocks, so floor 8 is
     not still mostly slimes. Anything with a minDepth joins automatically. */
  function spawnTable(depth) {
    const table = [
      // The starting four stay the spine of the table at every depth; everything
      // else ramps in over them (see the minDepth gate below).
      { weight: Math.max(4, 40 - depth * 6), value: 'slime' },
      { weight: depth >= 2 ? Math.max(8, 26 - depth * 2) : 12, value: 'zombie' },
      { weight: depth >= 2 ? Math.max(8, 22 - depth) : 14, value: 'bat' },
      { weight: depth >= 3 ? 24 : 8, value: 'skeleton' }
    ];

    for (const key in TYPES) {
      if (!Object.prototype.hasOwnProperty.call(TYPES, key)) continue;
      const cfg = TYPES[key];
      if (cfg.noSpawn) continue;
      if (!cfg.minDepth || depth < cfg.minDepth) continue;
      // Newer monsters ramp in rather than flooding the floor they unlock on.
      table.push({ weight: 8 + (depth - cfg.minDepth) * 5, value: key });
    }
    return table;
  }

  function create(g, x, y, kind, rank) {
    const cfg = TYPES[kind];
    let tier = rank === true ? 'elite' : (RANKS[rank] ? rank : 'normal');
    // HONOR GUARD promotes every ordinary spawn on the floor.
    if (tier === 'normal' && DS.Modifiers.has(g, 'allElite')) tier = 'elite';
    const mult = RANKS[tier];

    const drawW = cfg.w * mult.size;
    const drawH = cfg.h * mult.size;

    /* Big monsters keep their full sprite but shrink their collision box to the
       feet. `bodyOffX/Y` is how far the art sits from that box, so the renderer
       can still draw the whole creature. */
    const foot = mult.footBox || 1;
    const w = Math.round(drawW * (foot < 1 ? 0.55 : 1));
    const h = Math.round(drawH * foot);
    const e = Ent.make(x, y + (16 - h), w, h);
    settleSpawn(g, e);
    e.drawW = drawW;
    e.drawH = drawH;
    e.bodyOffX = Math.round((drawW - w) / 2);
    e.bodyOffY = drawH - h;

    e.kind = kind;
    e.cfg = cfg;
    e.tier = tier;
    e.sizeScale = mult.size;
    e.colossal = tier === 'colossal';
    e.gore = cfg.gore;
    e.heavy = !!cfg.heavy || tier === 'miniboss';
    e.flying = !!cfg.flying;
    e.armor = cfg.armor + mult.armor;

    /* Depth scaling comes from the difficulty curve, which is one place that
       can be tuned and asserted - the old inline `1 + (depth - 1) * 0.38` lived
       here while the hazard curve lived in hazards.js and the loot curve in the
       generator, and none of the three could be read side by side. */
    const diff = DS.Difficulty ? DS.Difficulty.forDepth(g.depth) : null;
    const scale = diff ? diff.hpMult : 1 + (g.depth - 1) * 0.38;
    e.maxHp = Math.round(cfg.hp * scale * mult.hp * DS.Modifiers.mult(g, 'enemyHp'));
    e.hp = e.maxHp;
    e.touchDamage = cfg.touch ? cfg.touch + mult.touch : 0;
    e.attackDamage = cfg.damage + mult.damage
      + (diff ? Math.round(cfg.damage * (diff.damageMult - 1)) : 0);
    e.speed = cfg.speed * mult.speed * (diff ? diff.speedMult : 1)
      * DS.Modifiers.mult(g, 'enemySpeed');
    e.windScale = mult.wind * DS.Modifiers.mult(g, 'enemyWind');

    e.state = 'PATROL';
    e.stateTimer = 0;
    e.attackState = 'none';
    e.attackTimer = 0;
    e.attackCooldown = DS.rand.int(40, 110);
    e.struck = false;
    e.invuln = 0;
    e.facing = DS.rand.chance(0.5) ? 1 : -1;
    e.animTimer = 0;
    e.baseY = e.y;
    e.hopTimer = DS.rand.int(20, 60);
    e.stuckTimer = 0;
    e.ghost = !!cfg.ghost;

    // Ceiling dwellers start hanging above their spawn column.
    if (cfg.hangs) {
      const ceiling = ceilingAbove(g.map, x);
      e.hanging = true;
      e.ceiling = ceiling;
      e.y = ceiling + 2;
      e.baseY = e.y;
    }

    settleSpawn(g, e);

    g.enemies.push(e);
    return e;
  }

  function ceilingAbove(map, px) {
    const tx = Math.floor(px / DS.C.TILE);
    for (let ty = 0; ty < map.h; ty++) {
      if (!map.isBlocked(tx, ty)) return ty * DS.C.TILE;
    }
    return 0;
  }

  /* The 'monster standing knee-deep in the floor' bug: template markers and
     spawn callers place entities at a nominal y, but carved floors change
     height every few tiles, so the box could overlap solid tiles. Snap the
     box up onto the first clear floor at or below the spawn column — and if
     the column itself is buried, nudge to the nearest column that isn't. */
  function settleSpawn(g, e) {
    const map = g.map;
    if (!map) return;
    const T = DS.C.TILE;

    for (let tries = 0; tries < 8; tries++) {
      const tx = Math.floor((e.x + e.w * 0.5) / T);
      // Lowest blocked row overlapping the box.
      let buried = false;
      for (let probe = e.y + e.h - 1; probe >= e.y; probe -= T / 2) {
        if (map.isSolid(tx, Math.floor(probe / T))) { buried = true; break; }
      }
      if (!buried) return;          // clear torso already

      // Find the real floor row under this column and stand on it.
      const floor = map.groundBelow(tx);
      if (floor < map.pixelH) {
        e.y = floor - e.h;
        return;
      }
      // Column is solid rock all the way down (a wall spawn): walk outward.
      for (let step = 1; step <= 6; step++) {
        for (let side = -1; side <= 1; side += 2) {
          const ntx = tx + step * side;
          const nf = map.groundBelow(ntx);
          if (nf < map.pixelH) {
            e.x = ntx * T + (T - e.w) / 2;
            e.y = nf - e.h;
            return;
          }
        }
      }
      return;
    }
  }

  /* Shared ground movement with an anti-stick guard.

     Enemies used to press into a wall forever: when they could see the player
     they were never allowed to turn around, so a chaser that met a ledge or a
     corner just ground against it. Now, if forward progress stalls for half a
     second, the enemy hops — and if that fails too, it turns around. */
  function walkToward(g, e, dx, sees, slow, accel, chaseBoost) {
    const dir = sees ? (M.sign(dx) || e.facing) : e.facing;
    e.facing = dir;

    const wall = Phys.wallAhead(g.map, e, dir);
    const ledge = !Phys.floorAhead(g.map, e, dir);
    const blocked = wall || ledge;

    if (!blocked) {
      e.stuckTimer = 0;
      e.vx = M.approach(e.vx, dir * e.speed * (sees ? (chaseBoost || 1.35) : 1) * slow, accel);
      return;
    }

    e.vx *= 0.5;

    if (!sees) { e.facing = -dir; e.stuckTimer = 0; return; }

    e.stuckTimer++;
    if (e.stuckTimer === 30 && e.onGround && !e.flying) {
      // One attempt to climb whatever is in the way.
      e.vy = -4.2;
      e.vx = dir * 1.2;
    } else if (e.stuckTimer > 70) {
      e.facing = -dir;
      e.stuckTimer = 0;
    }
  }

  // --- attack state machine -------------------------------------------------

  function beginAttack(e) {
    e.attackState = 'wind';
    e.attackTimer = Math.round(e.cfg.wind * e.windScale);
    e.struck = false;
  }

  /* Advances wind -> strike -> recover -> none and returns the current phase,
     so each enemy's own code only has to say what happens during each. */
  function tickAttack(g, e) {
    if (e.attackState === 'none') return 'none';

    e.attackTimer--;
    if (e.attackTimer > 0) return e.attackState;

    if (e.attackState === 'wind') {
      e.attackState = 'strike';
      e.attackTimer = e.cfg.strike;
      return 'strike';
    }
    if (e.attackState === 'strike') {
      e.attackState = 'recover';
      e.attackTimer = Math.round(e.cfg.recover * e.windScale);
      return 'recover';
    }
    e.attackState = 'none';
    e.attackCooldown = DS.rand.int(24, 60);
    return 'none';
  }

  function windRatio(e) {
    if (e.attackState !== 'wind') return 0;
    return 1 - e.attackTimer / Math.max(1, Math.round(e.cfg.wind * e.windScale));
  }

  // A melee strike box in front of the enemy; hits the player once per swing.
  function strikePlayer(g, e, box) {
    if (e.struck) return;
    const p = g.player;
    if (!p || p.dead) return;
    if (!M.rectsOverlap(box.x, box.y, box.w, box.h, p.x, p.y, p.w, p.h)) return;

    e.struck = true;
    const dir = M.sign(Ent.centerX(p) - Ent.centerX(e)) || 1;
    p.hurt(g, e.attackDamage, dir);
  }

  function meleeBox(e) {
    const cfg = e.cfg.hitbox || { w: 18, h: e.h, oy: 0 };
    const w = cfg.w * e.sizeScale;
    const h = cfg.h * e.sizeScale;
    return {
      x: e.facing > 0 ? e.x + e.w - 3 : e.x + 3 - w,
      y: e.y + cfg.oy,
      w: w, h: h
    };
  }

  // --- update ---------------------------------------------------------------

  function update(g, e) {
    e.frame++;
    if (e.invuln > 0) e.invuln--;
    if (e.hurtFlash > 0) e.hurtFlash--;
    if (e.painFace > 0) e.painFace--;
    if (e.attackCooldown > 0) e.attackCooldown--;

    Ent.tickStatus(g, e);
    if (e.dead) return;

    const player = g.player;
    const dx = player ? Ent.centerX(player) - Ent.centerX(e) : 0;
    const dy = player ? Ent.centerY(player) - Ent.centerY(e) : 0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    /* A monster only fights what it can be seen fighting. Being off-camera is
       a hard veto on noticing the player at all, so nothing winds up, shoots,
       dives or pounces from outside the window - the fight always starts with
       both parties on screen. */
    e.awake = Ent.onScreen(e, 20);
    const sees = player && !player.dead && dist < e.cfg.sight && e.awake;

    if (sees) {
      e.state = 'CHASE';
      e.stateTimer = 90;
    } else if (e.stateTimer > 0) {
      e.stateTimer--;
    } else {
      e.state = 'PATROL';
    }

    /* Frozen, rooted or shocked enemies are out of the fight entirely — they
       cannot move, turn, or continue a wind-up. This is what makes crowd
       control feel worth building for. */
    if (DS.Elements.disabled(e)) {
      e.attackState = 'none';
      e.attackTimer = 0;
      if (!e.flying) { e.vx = 0; Phys.step(e, g.map); }
      if (e.touchDamage > 0) touchPlayer(g, e);
      return;
    }

    const slow = Ent.speedScale(e);
    const phase = tickAttack(g, e);

    if (e.cfg.behavior) e.cfg.behavior(g, e, dx, dy, dist, sees, slow, phase);
    else if (e.kind === 'slime') updateSlime(g, e, dx, dist, sees, slow, phase);
    else if (e.kind === 'zombie') updateZombie(g, e, dx, dy, dist, sees, slow, phase);
    else if (e.kind === 'bat') updateBat(g, e, dx, dy, dist, sees, slow, phase);
    else if (e.kind === 'skeleton') updateSkeleton(g, e, dx, dy, dist, sees, slow, phase);

    if (!e.flying && !e.cfg.rooted) {
      // Water holds a body up: monsters wade rather than plummet through it.
      const wet = g.map.waterOverlap(e.x, e.y, e.w, e.h);
      if (wet) { e.vy = Math.min(e.vy, 1.1); e.vx *= 0.86; }
      Phys.step(e, g.map, wet ? 0.26 : 1);
      pitGuard(g, e);
    }

    if (g.map.spikeOverlap(e.x, e.y, e.w, e.h) && e.frame % 30 === 0) {
      Ent.damageEnemy(g, e, 2, { dir: e.facing, knockback: 0 });
    }
    // Ghosts drift through the level, so the pit floor cannot claim them.
    if (!e.ghost && g.map.deathOverlap(e.x, e.y, e.w, e.h)) Ent.killEnemy(g, e);
    if (e.y > g.map.pixelH + 40) Ent.killEnemy(g, e);

    if (e.touchDamage > 0) touchPlayer(g, e);
  }

  /* Monsters do not fall into pits.

     Walking off a ledge is already guarded by `floorAhead`, but that is only
     one of the ways a body ends up over a hole: knockback throws them, a
     pounce overshoots, a crumbling step gives way underneath them. Losing a
     monster - and its loot, and sometimes the floor's only key - to a hole it
     never chose to enter reads as the level eating it.

     So every monster remembers the last honest ground it stood on, and the
     moment it is falling down a column with nothing to land on, it scrambles
     back to that ground instead of dying. */
  function pitGuard(g, e) {
    if (e.dead || e.ghost) return;
    const map = g.map;
    const T = DS.C.TILE;
    const tx = Math.floor(Ent.centerX(e) / T);

    if (e.onGround) {
      if (!map.deathOverlap(e.x, e.y, e.w, e.h)) { e.safeX = e.x; e.safeY = e.y; }
      return;
    }

    const feetRow = Math.floor((e.y + e.h) / T);
    const doomed = map.floorBelow(tx, feetRow) >= map.pixelH ||
                   map.deathOverlap(e.x, e.y + 2, e.w, e.h);
    if (!doomed || e.vy < 0) return;

    const home = e.safeX === undefined ? solidGroundNear(map, e) : { x: e.safeX, y: e.safeY };
    if (!home) return;

    e.x = home.x;
    e.y = home.y;
    e.vx = 0;
    e.vy = 0;
    e.stuckTimer = 0;
    e.facing = -e.facing;
    DS.FX.dust(Ent.centerX(e), e.y + e.h, 3);
  }

  // Nearest column with a real walking surface, scanning outward from a body.
  function solidGroundNear(map, e) {
    const T = DS.C.TILE;
    const from = Math.floor(Ent.centerX(e) / T);
    for (let step = 1; step < 24; step++) {
      for (let side = -1; side <= 1; side += 2) {
        const tx = from + step * side;
        if (tx < 1 || tx >= map.w - 1) continue;
        /* groundBelow: a cave answers floorBelow(tx, 0) with its ceiling, which
           is how a monster could be settled into solid rock. */
        const floor = map.groundBelow(tx);
        if (floor >= map.pixelH) continue;
        return { x: tx * T, y: floor - e.h - 1 };
      }
    }
    return null;
  }

  function touchPlayer(g, e) {
    const p = g.player;
    if (!p || p.dead || e.dead) return;
    if (!M.overlap(e, p)) return;
    DS.Player.touch(g, p, e, e.touchDamage);
  }

  /* Slime: shuffles, then squashes down and pounces. Its body only hurts while
     it is in the air on that pounce. */
  function updateSlime(g, e, dx, dist, sees, slow, phase) {
    e.touchDamage = (phase === 'strike') ? e.attackDamage : 0;

    if (phase === 'wind') {
      e.vx *= 0.7;
      e.facing = M.sign(dx) || e.facing;
      return;
    }

    if (phase === 'strike') {
      if (!e.pounced) {
        e.pounced = true;
        e.vy = -4.2;
        e.vx = e.facing * 2.4 * slow;
        DS.Audio.play('jump');
      }
      return;
    }

    if (phase === 'recover') {
      e.pounced = false;
      if (e.onGround) e.vx *= 0.7;
      return;
    }

    if (sees && dist < e.cfg.range && e.attackCooldown <= 0 && e.onGround) {
      beginAttack(e);
      return;
    }

    // Idle hopping.
    e.hopTimer--;
    if (e.onGround) {
      e.vx *= 0.82;
      if (e.hopTimer <= 0) {
        const dir = sees ? M.sign(dx) || 1 : e.facing;
        e.facing = dir;
        e.vx = dir * e.speed * 2.4 * slow;
        e.vy = -2.9;
        e.hopTimer = sees ? DS.rand.int(34, 52) : DS.rand.int(70, 120);
        if (!Phys.floorAhead(g.map, e, dir) || Phys.wallAhead(g.map, e, dir)) {
          e.facing = -dir;
          e.vx = -e.vx;
        }
      }
    }
  }

  /* Zombie: walks you down, then plants its feet and swings. The wind-up is
     long and loud — it is the enemy that teaches the game's timing. */
  function updateZombie(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.6; return; }

    if (phase === 'strike') {
      e.vx *= 0.5;
      strikePlayer(g, e, meleeBox(e));
      return;
    }

    if (phase === 'recover') { e.vx *= 0.8; return; }

    const inRange = Math.abs(dx) < e.cfg.range * e.sizeScale && Math.abs(dy) < 16 * e.sizeScale;
    if (sees && inRange && e.attackCooldown <= 0) {
      e.facing = M.sign(dx) || e.facing;
      beginAttack(e);
      DS.Audio.play('swing');
      return;
    }

    walkToward(g, e, dx, sees, slow, 0.08);
  }

  /* Bat: hovers out of reach, locks on with a visible line, then dives. The
     dive is the only time it can hurt you. */
  function updateBat(g, e, dx, dy, dist, sees, slow, phase) {
    e.animTimer += 0.12;
    e.touchDamage = (phase === 'strike') ? e.attackDamage : 0;

    if (phase === 'wind') {
      // Hold position and show the player exactly where it is going.
      e.vx *= 0.85; e.vy *= 0.85;
      e.diveX = dx; e.diveY = dy;
      e.x += e.vx; e.y += e.vy;
      return;
    }

    if (phase === 'strike') {
      if (!e.diving) {
        e.diving = true;
        const len = Math.max(1, Math.sqrt(e.diveX * e.diveX + e.diveY * e.diveY));
        e.vx = (e.diveX / len) * 3.4;
        e.vy = (e.diveY / len) * 3.4;
        DS.Audio.play('dash');
      }
      e.x += e.vx * slow;
      e.y += e.vy * slow;
      if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) e.attackTimer = 0;
      return;
    }

    if (phase === 'recover') {
      e.diving = false;
      e.vx *= 0.9;
      e.vy = M.approach(e.vy, -0.4, 0.06);
      e.x += e.vx; e.y += e.vy;
      return;
    }

    if (sees && dist < e.cfg.range && e.attackCooldown <= 0) {
      e.facing = M.sign(dx) || e.facing;
      beginAttack(e);
      return;
    }

    const targetX = sees ? M.sign(dx) * e.speed : e.facing * e.speed * 0.5;
    e.vx = M.approach(e.vx, targetX * slow, 0.06);
    e.facing = M.sign(e.vx) || e.facing;

    const hover = sees ? Ent.centerY(g.player) - 26 : e.baseY;
    e.vy = M.approach(e.vy, (hover - e.y) * 0.04, 0.08);

    e.x += e.vx;
    e.y += e.vy + Math.sin(e.animTimer) * 0.28;

    if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) e.vx *= -1;
  }

  /* Skeleton: keeps its distance and draws a bow. The draw is visible as a
     dotted line, so an arrow is always something you saw coming. */
  function updateSkeleton(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.7; e.aimX = dx; e.aimY = dy; return; }

    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        shootArrow(g, e);
      }
      return;
    }

    if (phase === 'recover') { e.vx *= 0.85; return; }

    const dir = M.sign(dx) || e.facing;

    if (sees) {
      e.facing = dir;
      if (dist < 58) {
        if (Phys.floorAhead(g.map, e, -dir) && !Phys.wallAhead(g.map, e, -dir)) {
          e.vx = M.approach(e.vx, -dir * e.speed * slow, 0.1);
        } else e.vx *= 0.7;
      } else if (dist > 130) {
        e.vx = M.approach(e.vx, dir * e.speed * slow, 0.08);
      } else {
        e.vx *= 0.8;
      }

      if (e.attackCooldown <= 0 && Math.abs(dx) > 26 && dist < e.cfg.range) {
        beginAttack(e);
      }
    } else {
      updateZombie(g, e, dx, dy, dist, false, slow, 'none');
    }
  }

  function shootArrow(g, e) {
    const len = Math.max(1, Math.sqrt(e.aimX * e.aimX + e.aimY * e.aimY));
    const speed = 2.9;
    DS.Audio.play('shoot');
    Ent.spawnProjectile(g, {
      x: Ent.centerX(e) + e.facing * 6,
      y: Ent.centerY(e) - 2,
      vx: (e.aimX / len) * speed,
      vy: (e.aimY / len) * speed - 0.3,
      gravity: 0.022,
      damage: e.attackDamage,
      friendly: false,
      kind: 'arrow',
      life: 180,
      w: 8, h: 3
    });
  }

  // --- draw -----------------------------------------------------------------

  function draw(g, e) {
    const R = DS.R, S = DS.SPR;
    const flipSet = e.facing < 0;
    const root = flipSet ? S.flip : S;
    const pack = e.tier === 'colossal' ? (root.colossal[e.cfg.sprite] || root.mini[e.cfg.sprite])
               : e.tier === 'miniboss' ? root.mini[e.cfg.sprite]
               : e.tier === 'elite' ? root.elite[e.cfg.sprite]
               : root[e.cfg.sprite];

    // Art hangs above and around the collision box for foot-boxed monsters.
    const ax = e.x - (e.bodyOffX || 0);
    const ay = e.y - (e.bodyOffY || 0);
    const seed = e.cfg.sprite ? e.cfg.sprite.length * 0.7 : e.kind.length;
    const idleBob = e.attackState === 'none'
      ? Math.round(Math.sin(e.frame * 0.16 + seed) * (e.flying ? 1.2 : 0.5))
      : 0;
    const strikePush = e.attackState === 'strike' ? e.facing * (e.frame % 2) : 0;
    const drawX = ax + strikePush;
    const drawY = ay - idleBob;

    if (!e.flying && e.onGround) {
      R.arc(Ent.centerX(e), e.y + e.h + 1, Math.max(3, e.w * 0.55),
            0, Math.PI, 'rgba(13,11,18,0.45)', 1);
    }

    let index = 0;
    if (e.kind === 'slime') index = e.onGround ? 1 : 0;
    else if (e.kind === 'bat') index = Math.floor(e.frame / 6) % 2;
    else if (e.kind === 'skeleton') index = e.attackState === 'none' ? 0 : 1;
    else index = e.attackState === 'wind' ? 1 : Math.floor(e.frame / 10) % 2;

    let sprite = pack[index] || pack[0];
    if (e.cfg.behavior) {
      // Registered monsters animate on their own frame count.
      sprite = pack[e.attackState === 'wind' || e.attackState === 'strike'
        ? Math.min(1, pack.length - 1) : 0];
    }

    /* Frame 2 of every pack is the hurt face. It is held past the white impact
       flash -- during the flash the body is a solid silhouette, so a pained
       expression drawn then would never be seen. */
    if (e.painFace > 0 && e.hurtFlash <= 0 && pack.length > 2) sprite = pack[2];

    drawTelegraph(g, e, R);
    if (e.cfg.drawExtra) e.cfg.drawExtra(g, e, R);

    if (e.tier === 'elite') {
      DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), e.w + 12, 'rgba(232,116,59,0.16)');
    } else if (e.tier === 'miniboss') {
      DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), e.w + 18, 'rgba(192,48,60,0.20)');
    }
    if (e.status.chill > 0) {
      DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), e.w + 6, 'rgba(79,179,224,0.20)');
    }

    // Wind-up tints the whole body red and pulses faster as it peaks.
    const tint = DS.Elements.statusTint(e);

    if (e.hurtFlash > 0) {
      R.spr(DS.Art.silhouette(sprite, '#ffffff'), drawX, drawY);
    } else if (tint) {
      // Whatever status is loudest colours the body, so you can read the board.
      R.spr(sprite, drawX, drawY);
      R.sprAlpha(DS.Art.silhouette(sprite, tint), drawX, drawY,
                 e.status.frozen > 0 ? 0.65 : 0.4);
    } else if (e.attackState === 'wind') {
      const ratio = windRatio(e);
      const blink = Math.floor(e.frame / Math.max(2, Math.round(7 - ratio * 5))) % 2 === 0;
      const windY = e.kind === 'slime' ? 0 : Math.round(ratio * 2);
      R.spr(sprite, drawX, drawY - windY);
      if (blink) R.sprAlpha(DS.Art.silhouette(sprite, '#c0303c'), drawX, drawY, 0.55);
    } else {
      R.spr(sprite, drawX, drawY);
    }

    if (e.hp < e.maxHp && e.tier !== 'normal') {
      R.rect(e.x, e.y - 4, e.w, 2, '#0d0b12');
      R.rect(e.x, e.y - 4, e.w * (e.hp / e.maxHp), 2, '#c0303c');
    }

    if (e.keyholder) {
      const bob = Math.sin(e.frame * 0.09) * 2;
      const kx = Ent.centerX(e) - 4;
      const ky = e.y - 15 + bob;
      DS.Map.glow(R, kx + 4, ky + 4, 12, 'rgba(242,193,78,0.24)');
      R.spr(S.key, kx, ky);
    }
  }

  /* The visual promise that an attack is coming. Each enemy gets a tell that
     matches how its attack travels. */
  function drawTelegraph(g, e, R) {
    if (e.attackState === 'wind') {
      const ratio = windRatio(e);
      const cx = Ent.centerX(e), cy = Ent.centerY(e);

      // Shared: a filling arc over the head.
      R.arc(cx, e.y - 5, 6, -1.2, -1.2 + 2.4 * ratio, '#c0303c', 2, false);

      if (e.kind === 'zombie') {
        const box = meleeBox(e);
        if (e.attackTimer % 3 === 0) {
          DS.FX.dust(box.x + box.w * 0.5, box.y + box.h, 1);
        }
      } else if (e.kind === 'bat' || e.kind === 'skeleton') {
        const tx = e.kind === 'bat' ? e.diveX : e.aimX;
        const ty = e.kind === 'bat' ? e.diveY : e.aimY;
        if (tx !== undefined) {
          const len = Math.max(1, Math.sqrt(tx * tx + ty * ty));
          const reach = (e.kind === 'bat' ? 70 : 150) * ratio;
          R.line(cx, cy, cx + (tx / len) * reach, cy + (ty / len) * reach,
                 'rgba(192,48,60,' + (0.25 + ratio * 0.4).toFixed(2) + ')', 1);
        }
      } else if (e.kind === 'slime') {
        const landX = cx + e.facing * 34;
        if (e.attackTimer % 4 === 0) {
          DS.FX.dust(landX, e.y + e.h, 1);
        }
      }
    } else if (e.attackState === 'strike' && e.kind === 'zombie') {
      const box = meleeBox(e);
      DS.FX.spark(box.x + box.w * 0.5, box.y + box.h * 0.5, 2, '#c0303c');
    }
  }

  DS.Enemies = {
    TYPES: TYPES,
    create: create,
    update: update,
    draw: draw,
    spawnTable: spawnTable,
    // Shared pieces the deep bestiary builds on.
    beginAttack: beginAttack,
    strikePlayer: strikePlayer,
    meleeBox: meleeBox,
    walkToward: walkToward
  };
})(window.DS);
