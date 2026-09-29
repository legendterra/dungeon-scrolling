/* The bestiary of act I: nine monsters that belong to a place, and four
   variations of the old animals.

   Each is an old body given one new job, and each job is something you can read
   before it hurts you -- the same wind -> strike -> recover machine as every
   monster before them (enemies.js), so what the player learned on floor one is
   still true:

     crab          claws up: light blows from the front are turned; it opens them to pinch
     spore shroom  rooted; a puff of poison you leave by walking out of it
     crystal beetle  curls into a ball and rolls; the shell is armour, the wall is its end
     jailer        a chain that hauls you in by the ribs
     prisoner      lunges exactly as far as its chain reaches, then hangs on it
     bogman        lies in the mud; comes up under your feet
     mountain goat rams, and the ram shoves you off the ledge
     drowned knight  a shield and a cleave that leaves you soaked and slow
     ash hound     a pack; every stride leaves embers on the floor

   and gull, sewer rats, frog shaman and eagle for the variety. Which of them
   live on which floor is the map's roster (src/world/maps/act1.js), not this
   file. The shared kit at the top (E.kit) is what the act II and III files use. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;
  const E = DS.Enemies;
  const P2U = 0.1;

  // --- the kit ----------------------------------------------------------------

  function def(key, cfg) {
    E.TYPES[key] = cfg;
    if (cfg.tell) E.TELL_SFX[key] = cfg.tell;
  }
  const cx = Ent.centerX;
  const cy = Ent.centerY;
  function face(e, dx) { e.facing = M.sign(dx) || e.facing; }
  function tellFx(e, color, every) {
    if (e.frame % (every || 4) === 0) DS.FX.spark(cx(e), cy(e), 1, color);
  }
  /* Is the player inside a box reach px in front of (either side of) e? */
  function near(e, dx, dy, r, tall) {
    return Math.abs(dx) < r * e.sizeScale && Math.abs(dy) < (tall || 20) * e.sizeScale;
  }
  /* A straight bright line in the world: a chain, a whip. The pooled 3D layer
     draws it as a bolt with no jitter; without it, the plain bolt list does. */
  function lash(g, x1, y1, x2, y2, color, life) {
    const F = DS.FX3D;
    if (F && F.ready && F.bolt) {
      F.bolt(x1 * P2U, -y1 * P2U, 0.3, x2 * P2U, -y2 * P2U, 0.3, 2, 0.02, 0.05, F.cssHex(color), life || 4, 1.4);
    } else {
      if (!g.bolts) g.bolts = [];
      g.bolts.push({ x1: x1, y1: y1, x2: x2, y2: y2, life: life || 4, color: color });
    }
  }
  /* A hostile hit from a rectangle: true when the player was hurt by it. */
  function hitBox(g, e, x, y, w, h, dmg, dir) {
    const p = g.player;
    if (!p || p.dead) return false;
    if (!M.rectsOverlap(x, y, w, h, p.x, p.y, p.w, p.h)) return false;
    return p.hurt(g, dmg == null ? e.attackDamage : dmg, dir || M.sign(cx(p) - cx(e)) || 1);
  }
  /* What a bite, a stare or a splash does to the legs: slow the player down. */
  function weigh(p, frames, mul) { p.slowT = Math.max(p.slowT || 0, frames); p.slowMul = mul; }
  /* Fire left on the floor: a still orb that burns whoever steps on it. */
  function ember(g, e, x, life) {
    Ent.spawnProjectile(g, {
      x: x - 4, y: e.y + e.h - 6, vx: 0, vy: 0, gravity: 0,
      damage: Math.max(1, e.attackDamage - 1), friendly: false, kind: 'orb',
      element: 'fire', life: life || 90, w: 8, h: 5, trailColor: '#e8743b'
    });
  }
  /* A hop for anything that gets about by jumping. */
  function hop(e, dir, vx, vy) {
    e.facing = dir;
    e.vx = dir * vx;
    e.vy = -vy;
  }
  /* The ledge test every charger needs: a wall or a drop ends the run. */
  function blocked(g, e) {
    return Phys.wallAhead(g.map, e, e.facing) || !Phys.floorAhead(g.map, e, e.facing);
  }

  E.kit = { def: def, face: face, tellFx: tellFx, near: near, lash: lash, hitBox: hitBox,
            weigh: weigh, ember: ember, hop: hop, blocked: blocked };

  // --- crab -------------------------------------------------------------------

  /* Claws up while it walks at you: a light blow from the front is turned (the
     shielder's rule, base.js). It has to open them to pinch, and that is the
     window. Heavy blows and anything from behind ignore the guard. */
  function crab(g, e, dx, dy, dist, sees, slow, phase) {
    e.shieldUp = phase === 'none' && sees;
    if (phase === 'wind') { e.vx *= 0.6; tellFx(e, '#f0c890', 5); return; }
    if (phase === 'strike') { e.vx *= 0.4; E.strikePlayer(g, e, E.meleeBox(e)); return; }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && near(e, dx, dy, e.cfg.range) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.09);
  }

  def('crab', {
    w: 12, h: 9, hp: 12, touch: 0, speed: 0.55, sight: 150, armor: 1,
    gore: ['#c8552a', '#8a3a1c', '#f0c890'], sprite: 'magmacrab', blocksFront: true,
    wind: 26, strike: 8, recover: 34, range: 22, damage: 1,
    hitbox: { w: 22, h: 9, oy: 0 }, behavior: crab, minDepth: 1, tell: 'clack'
  });

  // --- spore shroom -----------------------------------------------------------

  const CLOUD_R = 32, CLOUD_LIFE = 150;

  /* Rooted, like the spitter. When you come close it swells and puffs a cloud of
     poison; the cloud hangs where it was let go and hurts anyone in it. The
     answer is to go past quickly, or not to stand there. */
  function sporeshroom(g, e, dx, dy, dist, sees, slow, phase) {
    const c = e.cloud;
    if (c) {
      c.t--;
      c.r = Math.min(CLOUD_R * e.sizeScale, c.r + 2);
      if (c.t % 5 === 0) {
        DS.FX.burst(c.x + DS.rand.float(-c.r, c.r) * 0.7, c.y - DS.rand.float(0, c.r * 0.6), 1,
                    ['#a3e86b', '#5cbf62'], { speed: 0.35, life: 22, grav: -0.015 });
      }
      const p = g.player;
      if (p && !p.dead && c.t % 34 === 0 &&
          M.dist(cx(p), cy(p), c.x, c.y - c.r * 0.3) < c.r + 4) {
        p.hurt(g, e.attackDamage, M.sign(cx(p) - c.x) || 1);
        weigh(p, 50, 0.8);
      }
      if (c.t <= 0) e.cloud = null;
    }

    if (phase === 'wind') {
      if (e.frame % 4 === 0) DS.FX.burst(cx(e), e.y + 2, 2, ['#a3e86b', '#d8f090'], { speed: 0.6, life: 14, grav: -0.02 });
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        e.cloud = { x: cx(e), y: e.y + e.h * 0.6, r: 6, t: CLOUD_LIFE };
        DS.Audio.play('spore');
      }
      return;
    }
    if (phase === 'recover') return;
    if (sees && !e.cloud && dist < e.cfg.range * e.sizeScale && e.attackCooldown <= 0) E.beginAttack(e);
  }

  def('sporeshroom', {
    w: 12, h: 13, hp: 14, touch: 0, speed: 0, sight: 120, armor: 0,
    rooted: true, gore: ['#a3e86b', '#6a8a3a', '#e8dcc0'], sprite: 'spitter',
    wind: 40, strike: 6, recover: 90, range: 72, damage: 1,
    behavior: sporeshroom, minDepth: 2, tell: 'spore'
  });

  // --- crystal beetle ---------------------------------------------------------

  /* Curls into a ball and rolls at you. The ball is armour (three points while it
     rolls); the wall it hits, or the edge, ends the roll and leaves it dizzy,
     which is when to hit it. */
  function beetle(g, e, dx, dy, dist, sees, slow, phase) {
    if (e.armor0 == null) e.armor0 = e.armor;
    e.armor = e.armor0 + (phase === 'strike' ? 3 : 0);
    e.curled = phase === 'strike';
    e.touchDamage = 0;

    if (phase === 'wind') {
      e.vx *= 0.5;
      tellFx(e, '#7fe8ff', 4);
      return;
    }
    if (phase === 'strike') {
      e.vx = e.facing * 2.5 * slow;
      e.touchDamage = e.attackDamage;
      if (blocked(g, e)) {
        e.vx = 0;
        e.attackTimer = 1;
        e.dazed = 30;
        DS.R.shake(1.5);
        DS.FX.burst(cx(e) + e.facing * 6, cy(e), 6, ['#7fe8ff', '#6a5cae'], { speed: 1.4, life: 12, grav: 0.05 });
        DS.Audio.play('block');
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.6; if (e.dazed > 0) { e.dazed--; e.attackTimer++; } return; }
    if (sees && dist < e.cfg.range && Math.abs(dy) < 22 && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.1);
  }

  def('crystalbeetle', {
    w: 12, h: 9, hp: 16, touch: 0, speed: 0.6, sight: 160, armor: 2,
    heavy: true, gore: ['#7fe8ff', '#6a5cae', '#2c2650'], sprite: 'spider',
    wind: 30, strike: 52, recover: 44, extra: 30, range: 110, damage: 2,
    behavior: beetle, minDepth: 3, tell: 'clack'
  });

  // --- jailer -----------------------------------------------------------------

  const CHAIN_REACH = 116;

  /* A skeleton with a lantern and a chain. The chain is thrown along the floor at
     the height of your ribs; if it lands you are hauled in for a lantern-bash. A
     dash goes through it: iframes are the answer. */
  function jailer(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') {
      e.vx *= 0.5;
      if (e.mode === 'chain') {
        const len = CHAIN_REACH * (0.25 + 0.75 * E.windRatio(e));
        lash(g, cx(e), cy(e) - 2, cx(e) + e.facing * len, cy(e) - 2, '#8a8478', 2);
      } else tellFx(e, '#ffb040', 5);
      return;
    }
    if (phase === 'strike') {
      if (e.struck) return;
      if (e.mode === 'bash') { E.strikePlayer(g, e, E.meleeBox(e)); return; }
      e.struck = true;
      DS.Audio.play('chain');
      const p = g.player;
      const x0 = cx(e), y0 = cy(e) - 2;
      const box = { x: e.facing > 0 ? x0 : x0 - CHAIN_REACH, y: e.y - 2, w: CHAIN_REACH, h: e.h + 4 };
      const landed = p && !p.dead && hitBox(g, e, box.x, box.y, box.w, box.h, e.attackDamage, e.facing);
      lash(g, x0, y0, landed ? cx(p) : x0 + e.facing * CHAIN_REACH, landed ? cy(p) : y0, '#c8c0b0', 8);
      if (landed) { p.pullT = 24; p.pullX = x0 + e.facing * 12; p.pullSpeed = 2.6; }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.7; return; }

    if (sees) {
      const adx = Math.abs(dx);
      face(e, dx);
      if (e.attackCooldown <= 0 && Math.abs(dy) < 26) {
        if (adx < 26) { e.mode = 'bash'; E.beginAttack(e); return; }
        if (adx < CHAIN_REACH - 8) { e.mode = 'chain'; E.beginAttack(e); return; }
      }
      // A jailer keeps its distance and lets the chain do the work.
      if (adx < 60 && Phys.floorAhead(g.map, e, -e.facing) && !Phys.wallAhead(g.map, e, -e.facing)) {
        e.vx = M.approach(e.vx, -e.facing * e.speed * slow, 0.1);
      } else if (adx > CHAIN_REACH) {
        E.walkToward(g, e, dx, true, slow, 0.08);
      } else e.vx *= 0.8;
    } else E.walkToward(g, e, dx, false, slow, 0.08);
  }

  def('jailer', {
    w: 9, h: 15, hp: 18, touch: 0, speed: 0.5, sight: 230, armor: 0,
    gore: ['#d8d5e8', '#9b96b8', '#ffb040'], sprite: 'skeleton',
    wind: 34, strike: 8, recover: 40, range: 30, damage: 1,
    hitbox: { w: 22, h: 14, oy: 1 }, behavior: jailer, minDepth: 4, tell: 'chain'
  });

  // --- chained prisoner -------------------------------------------------------

  /* Tied to the spot it woke on. It strains at the end of its chain, and lunges
     exactly as far as the chain lets it; then it is hauled up short and hangs
     there, dazed. Stand just outside the leash and hit it. */
  function prisoner(g, e, dx, dy, dist, sees, slow, phase) {
    const home = e.homeX, leash = e.cfg.leash;
    /* Physics moves it by vx after this returns, so the step it is about to take
       is clamped too: the chain is the end of the world, not a suggestion. */
    const pin = function () {
      const c = M.clamp(e.x, home - leash, home + leash);
      if (c !== e.x) { e.x = c; e.vx = 0; }
      e.vx = M.clamp(e.x + e.vx, home - leash, home + leash) - e.x;
    };
    if (e.frame % 3 === 0) lash(g, home + 4, e.y + e.h - 3, cx(e), cy(e) + 2, '#8a8478', 4);
    e.touchDamage = 0;

    if (phase === 'wind') {
      e.vx = 0;
      if (e.frame % 3 === 0) DS.FX.dust(cx(e), e.y + e.h, 1);
      pin();
      return;
    }
    if (phase === 'strike') {
      e.vx = e.facing * 2.9 * slow;
      e.touchDamage = e.attackDamage;
      if (Math.abs(e.x - home) >= leash - 0.6 || blocked(g, e)) {
        e.vx = 0;
        e.attackTimer = 1;
        e.jerked = true;
        DS.Audio.play('chain');
        DS.R.shake(1.5);
      }
      pin();
      return;
    }
    if (phase === 'recover') {
      e.vx *= 0.5;
      if (e.jerked) { e.jerked = false; e.attackTimer += 40; }
      pin();
      return;
    }
    if (sees && e.attackCooldown <= 0 && Math.abs(dx) < e.cfg.range && Math.abs(dy) < 24) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.08);
    pin();
  }

  def('prisoner', {
    w: 10, h: 15, hp: 22, touch: 0, speed: 0.5, sight: 170, armor: 0,
    heavy: true, gore: ['#b0a090', '#6e1b28'], sprite: 'zombie', leash: 56,
    wind: 28, strike: 24, recover: 34, extra: 40, range: 92, damage: 2,
    behavior: prisoner, minDepth: 4, tell: 'growl'
  });

  // --- bogman -----------------------------------------------------------------

  /* Lies under the mud, untouchable, until you walk over it. It comes up under
     your feet with a grip that slows you. Then it is a plain walker for a while,
     and sinks again once you have gone. */
  function bogman(g, e, dx, dy, dist, sees, slow, phase) {
    if (e.buried == null) { e.buried = true; e.exposed = 0; }
    if (e.buried) { e.hidden = true; e.invuln = Math.max(e.invuln, 2); e.vx = 0; }

    if (phase === 'wind') {
      e.vx *= 0.5;
      if (e.frame % 4 === 0) {
        DS.FX.burst(cx(e), e.y + e.h - 2, 2, ['#6a5a3a', '#3a3020'], { speed: 0.7, life: 12, grav: 0.03 });
      }
      return;
    }
    if (phase === 'strike') {
      if (e.buried) {
        e.buried = false;
        e.hidden = false;
        e.exposed = 260;
        DS.Audio.play('bubble');
        DS.FX.dust(cx(e), e.y + e.h, 4);
      }
      const was = e.struck;
      E.strikePlayer(g, e, E.meleeBox(e));
      if (!was && e.struck && g.player) weigh(g.player, 70, 0.55);
      return;
    }
    if (phase === 'recover') { e.vx *= 0.7; return; }

    if (e.buried) {
      if (e.awake && e.attackCooldown <= 0 && Math.abs(dx) < 40 && Math.abs(dy) < 28) {
        face(e, dx);
        E.beginAttack(e);
      }
      return;
    }
    e.exposed--;
    if (e.exposed <= 0 && dist > 70) {
      e.buried = true;
      e.hidden = true;
      DS.FX.dust(cx(e), e.y + e.h, 3);
      return;
    }
    if (sees && near(e, dx, dy, e.cfg.range) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.07);
  }

  def('bogman', {
    w: 10, h: 14, hp: 20, touch: 0, speed: 0.4, sight: 140, armor: 0,
    heavy: true, gore: ['#6a7a44', '#3a2c1c'], sprite: 'zombie',
    wind: 22, strike: 12, recover: 46, range: 24, damage: 2,
    hitbox: { w: 22, h: 14, oy: 0 }, behavior: bogman, minDepth: 6, tell: 'bubble'
  });

  // --- mountain goat ----------------------------------------------------------

  /* Paws the ground, then rams. The ram is a shove first and a wound second:
     on a ledge it takes you off it. A climber too, it hops what a walker would
     turn back at. */
  function goat(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') {
      e.vx *= 0.3;
      if (e.frame % 4 === 0) DS.FX.dust(cx(e) - e.facing * 4, e.y + e.h, 1);
      return;
    }
    if (phase === 'strike') {
      e.vx = e.facing * 3.0 * slow;
      const p = g.player;
      const was = e.struck;
      E.strikePlayer(g, e, E.meleeBox(e));
      if (!was && e.struck && p) { p.vx = e.facing * 4.8; p.vy = -1.8; }
      if (blocked(g, e)) { e.vx = 0; e.attackTimer = 1; }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.75; return; }
    if (sees && dist < e.cfg.range && Math.abs(dy) < 26 && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    if (sees && e.onGround && Phys.wallAhead(g.map, e, e.facing)) hop(e, e.facing, 1.4, 4.4);
    else E.walkToward(g, e, dx, sees, slow, 0.1);
  }

  def('mountaingoat', {
    w: 14, h: 12, hp: 20, touch: 0, speed: 0.8, sight: 170, armor: 0,
    gore: ['#e8e0d0', '#8a8478'], sprite: 'zombie',
    wind: 26, strike: 34, recover: 44, range: 92, damage: 2,
    hitbox: { w: 16, h: 12, oy: 0 }, behavior: goat, minDepth: 7, tell: 'bleat'
  });

  // --- drowned knight ---------------------------------------------------------

  /* A shield and a heavy cleave, and everything about it drips. A blow that lands
     leaves you soaked: slower for a while. The shield is the shielder's, so the
     same answer holds: heavy blows, or the back. */
  function drownedknight(g, e, dx, dy, dist, sees, slow, phase) {
    e.shieldUp = phase === 'none' && sees;
    if (phase === 'wind') {
      e.vx *= 0.5;
      if (e.frame % 4 === 0) DS.FX.burst(cx(e), e.y + 2, 1, ['#a8e4ff', '#4fb3e0'], { speed: 0.4, life: 16, grav: 0.06 });
      return;
    }
    if (phase === 'strike') {
      e.vx *= 0.5;
      const was = e.struck;
      E.strikePlayer(g, e, E.meleeBox(e));
      if (!was && e.struck && g.player) {
        weigh(g.player, 90, 0.6);
        DS.FX.burst(cx(g.player), cy(g.player), 6, ['#a8e4ff', '#ffffff'], { speed: 1.4, life: 12, grav: 0.05 });
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && near(e, dx, dy, e.cfg.range) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.07);
  }

  def('drownedknight', {
    w: 11, h: 16, hp: 30, touch: 0, speed: 0.36, sight: 160, armor: 2,
    heavy: true, blocksFront: true, gore: ['#86a89a', '#4fb3e0'], sprite: 'shielder',
    wind: 38, strike: 10, recover: 42, range: 26, damage: 2,
    hitbox: { w: 24, h: 15, oy: 1 }, behavior: drownedknight, minDepth: 8, tell: 'block'
  });

  // --- ash hound --------------------------------------------------------------

  /* Comes in a pair and runs in a straight line, and where it has run the floor
     burns for a while. It leaps at you from a crouch. */
  function hound(g, e, dx, dy, dist, sees, slow, phase) {
    if (e.onGround && Math.abs(e.vx) > 0.7 && e.frame % 13 === 0) ember(g, e, cx(e) - e.facing * 6, 80);
    if (phase === 'wind') { e.vx *= 0.4; tellFx(e, '#e8743b', 4); return; }
    if (phase === 'strike') {
      if (!e.leapt) { e.leapt = true; hop(e, e.facing, 2.7 * slow, 3.3); DS.Audio.play('howl'); }
      e.touchDamage = e.attackDamage;
      return;
    }
    e.touchDamage = 0;
    e.leapt = false;
    if (phase === 'recover') { if (e.onGround) e.vx *= 0.7; return; }
    if (sees && dist < e.cfg.range && e.attackCooldown <= 0 && e.onGround) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.12, 1.6);
  }

  def('ashhound', {
    w: 13, h: 9, hp: 12, touch: 0, speed: 0.95, sight: 190, armor: 0, pack: 2,
    gore: ['#e8743b', '#2c2624'], sprite: 'zombie',
    wind: 20, strike: 22, recover: 34, range: 64, damage: 2,
    behavior: hound, minDepth: 9, tell: 'howl'
  });

  // --- variations -------------------------------------------------------------

  /* Gull and eagle fly on the bat's brain, the eagle from further off and with a
     longer warning. */
  def('gull', {
    w: 10, h: 8, hp: 6, touch: 0, speed: 1.2, sight: 170, armor: 0, flying: true,
    gore: ['#f4f2f8', '#a8b0c0'], sprite: 'bat',
    wind: 22, strike: 24, recover: 36, range: 72, damage: 1,
    behavior: E.flyerBrain, minDepth: 1, tell: 'screech'
  });

  def('eagle', {
    w: 12, h: 9, hp: 10, touch: 0, speed: 1.3, sight: 250, armor: 0, flying: true,
    gore: ['#8a6340', '#f4f2f8'], sprite: 'bat',
    wind: 36, strike: 28, recover: 46, range: 140, damage: 2,
    behavior: E.flyerBrain, minDepth: 7, tell: 'screech'
  });

  /* Rats: small, quick, always three. A leap, a bite. */
  function rat(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.5; return; }
    if (phase === 'strike') {
      if (!e.leapt) { e.leapt = true; hop(e, e.facing, 2.2 * slow, 2.6); }
      e.touchDamage = e.attackDamage;
      return;
    }
    e.touchDamage = 0;
    e.leapt = false;
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && dist < e.cfg.range && e.attackCooldown <= 0 && e.onGround) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.14, 1.6);
  }

  def('sewerrat', {
    w: 8, h: 5, hp: 4, touch: 0, speed: 1.0, sight: 150, armor: 0, pack: 3,
    gore: ['#8a6a48', '#6e1b28'], sprite: 'slime',
    wind: 14, strike: 12, recover: 28, range: 36, damage: 1,
    behavior: rat, minDepth: 4, tell: 'squish'
  });

  /* The frog shaman keeps its distance and spits mud: a hit is a weight on the
     legs, not a wound. */
  function frogshaman(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.5; face(e, dx); e.aimX = dx; e.aimY = dy; return; }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        DS.Audio.play('shoot');
        const len = Math.max(1, Math.sqrt(e.aimX * e.aimX + e.aimY * e.aimY));
        Ent.spawnProjectile(g, {
          x: cx(e) + e.facing * 5, y: cy(e) - 3,
          vx: (e.aimX / len) * 2.2, vy: (e.aimY / len) * 2.2 - 0.4, gravity: 0.02,
          damage: Math.max(1, e.attackDamage - 1), friendly: false, kind: 'orb', element: 'poison',
          life: 150, w: 7, h: 7, trailColor: '#6a5a3a',
          onHit: function (gg, pr, pl) { weigh(pl, 110, 0.5); }
        });
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (!sees) { E.walkToward(g, e, dx, false, slow, 0.06); return; }
    face(e, dx);
    if (e.attackCooldown <= 0 && dist < e.cfg.range && dist > 40) { E.beginAttack(e); return; }
    e.hopTimer--;
    if (e.onGround) {
      e.vx *= 0.8;
      if (e.hopTimer <= 0) {
        const dir = dist < 70 ? -M.sign(dx) : (dist > 130 ? M.sign(dx) : 0);
        if (dir && Phys.floorAhead(g.map, e, dir) && !Phys.wallAhead(g.map, e, dir)) hop(e, dir, 1.3, 3.0);
        e.hopTimer = DS.rand.int(36, 60);
      }
    }
  }

  def('frogshaman', {
    w: 11, h: 11, hp: 14, touch: 0, speed: 0.5, sight: 210, armor: 0,
    gore: ['#5aa04a', '#d8e8a0'], sprite: 'spitter',
    wind: 36, strike: 6, recover: 50, range: 170, damage: 1,
    behavior: frogshaman, minDepth: 6, tell: 'bubble'
  });
})(window.DS);
