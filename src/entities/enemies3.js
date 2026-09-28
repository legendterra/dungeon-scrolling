/* The act II and act III bestiary.

   Four monsters for the drowned deep and the burning crown, registered into
   the same TYPES table and run on the same wind -> strike -> recover machine
   as everything before them, so nothing the player learned on floor one stops
   being true. Each is an old body with a new job rather than a new system:

     ice wisp    a hovering caster that keeps its distance and fans ice shards
     harpy       the bat's dive, plus a feather volley from out of reach
     cultist     marks the ground under you and calls fire down on it
     magma crab  an armoured scuttler whose charge leaves burning embers

   Their minDepth keeps them out of act I entirely, and spawnTable's biome
   affinity (enemies.js) is what puts the wisps in the flooded halls and the
   crabs in the forge. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;
  const E = DS.Enemies;
  const ART = E.ART || {};

  /* Recolours laid over the act I silhouettes (see PAL in art/base.js). */
  const ICE_PAL = { P: '#4fb3e0', p: '#2f6fa8', m: '#a8e4ff' };
  const CULT_PAL = { E: '#c0303c', e: '#6e1b28', L: '#e8743b', Y: '#fff0a8', w: '#f0c79c' };
  const MAGMA_PAL = { D: '#e8743b', p: '#6e1b28', P: '#f2c14e', W: '#fff0a8' };

  // --- ice wisp ---------------------------------------------------------------

  /* Hangs off to one side of the player at shoulder height and never closes
     in. The answer is to close in yourself, or to shoot it down. */
  const WISP_STANDOFF = 72;

  function icewisp(g, e, dx, dy, dist, sees, slow, phase) {
    e.animTimer += 0.1;

    if (phase === 'wind') {
      e.vx *= 0.8; e.vy *= 0.8;
      e.x += e.vx; e.y += e.vy;
      if (e.frame % 3 === 0) DS.FX.spark(Ent.centerX(e), Ent.centerY(e), 1, '#a8e4ff');
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) { e.struck = true; shardFan(g, e, dx, dy); }
      return;
    }
    if (phase === 'recover') {
      e.vy = M.approach(e.vy, -0.2, 0.05);
      e.x += e.vx * 0.5; e.y += e.vy;
      return;
    }

    if (sees && e.attackCooldown <= 0 && dist < e.cfg.range) {
      e.facing = M.sign(dx) || e.facing;
      E.beginAttack(e);
      return;
    }

    const p = g.player;
    const side = M.sign(dx) || 1;
    const wantX = sees ? Ent.centerX(p) - side * WISP_STANDOFF : Ent.centerX(e) + e.facing * 20;
    const wantY = sees ? Ent.centerY(p) - 30 : e.baseY;
    e.vx = M.approach(e.vx, M.clamp((wantX - Ent.centerX(e)) * 0.03, -e.speed, e.speed) * slow, 0.05);
    e.vy = M.approach(e.vy, (wantY - e.y) * 0.03, 0.06);
    e.x += e.vx;
    e.y += e.vy + Math.sin(e.animTimer) * 0.2;
    if (sees) e.facing = side;
    if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) { e.vx *= -1; e.facing = -e.facing; }
  }

  function shardFan(g, e, dx, dy) {
    DS.Audio.play('cast');
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const base = Math.atan2(dy / len, dx / len);
    const count = e.tier === 'normal' ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.22;
      Ent.spawnProjectile(g, {
        x: Ent.centerX(e) - 3, y: Ent.centerY(e) - 3,
        vx: Math.cos(a) * 2.3, vy: Math.sin(a) * 2.3, gravity: 0,
        damage: e.attackDamage, friendly: false, kind: 'orb', element: 'ice',
        life: 140, w: 6, h: 6, trailColor: '#a8e4ff'
      });
    }
  }

  // --- harpy ------------------------------------------------------------------

  /* Flies on the bat's brain - hover, telegraph, dive - but every other
     attack from outside dive range is a volley of feathers instead, so
     backing off is not a safe answer to it either. */
  function harpy(g, e, dx, dy, dist, sees, slow, phase) {
    if (e.volley && phase === 'none') e.volley = false;

    if (e.volley) {
      e.touchDamage = 0;
      e.animTimer += 0.12;
      if (phase === 'strike' && !e.struck) {
        e.struck = true;
        featherVolley(g, e, dx, dy);
      }
      e.vx *= 0.88; e.vy = M.approach(e.vy, -0.2, 0.05);
      e.x += e.vx; e.y += e.vy;
      return;
    }

    if (phase === 'none' && sees && e.attackCooldown <= 0 &&
        dist >= e.cfg.range && dist < e.cfg.range * 1.8) {
      e.facing = M.sign(dx) || e.facing;
      e.volley = true;
      E.beginAttack(e);
      return;
    }

    E.flyerBrain(g, e, dx, dy, dist, sees, slow, phase);
  }

  function featherVolley(g, e, dx, dy) {
    DS.Audio.play('swing');
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    for (let i = -1; i <= 1; i++) {
      Ent.spawnProjectile(g, {
        x: Ent.centerX(e), y: Ent.centerY(e),
        vx: (dx / len) * 2.8 + i * 0.3, vy: (dy / len) * 2.8 + i * 0.4, gravity: 0.01,
        damage: Math.max(1, e.attackDamage - 1), friendly: false, kind: 'arrow',
        life: 120, w: 6, h: 3
      });
    }
  }

  // --- cultist ----------------------------------------------------------------

  /* Marks the floor where the player stands when it starts to chant and calls
     fire down on that mark when the chant ends. The mark sparks the whole
     time, so the lesson is the Arbiter's in miniature: do not stand still. */
  const MARK_W = 18, MARK_H = 58;

  function cultist(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') {
      e.vx *= 0.7;
      if (e.mark && e.frame % 3 === 0) {
        DS.FX.spark(e.mark.x + DS.rand.float(-MARK_W / 2, MARK_W / 2), e.mark.y - 2, 1, '#e8743b');
      }
      if (e.frame % 5 === 0) DS.FX.trail(Ent.centerX(e), e.y + 2, '#c0303c');
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) { e.struck = true; callFire(g, e); }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }

    const p = g.player;
    if (sees && e.attackCooldown <= 0 && dist < e.cfg.range) {
      e.facing = M.sign(dx) || e.facing;
      e.mark = { x: Ent.centerX(p), y: p.y + p.h };
      E.beginAttack(e);
      DS.Audio.play('cast');
      return;
    }

    // Keeps a casting distance: backs off from a player who closes in.
    if (sees && dist < 60) {
      E.walkToward(g, e, -dx, true, slow, 0.1);
      e.facing = M.sign(dx) || e.facing;
    } else {
      E.walkToward(g, e, dx, sees, slow, 0.08);
    }
  }

  function callFire(g, e) {
    const m = e.mark;
    if (!m) return;
    e.mark = null;
    DS.Audio.play('lightning');
    DS.R.shake(3);
    DS.FX.burst(m.x, m.y - 8, 14, ['#e8743b', '#f2c14e', '#c0303c'],
                { speed: 2.2, life: 20, grav: -0.02 });
    if (!g.bolts) g.bolts = [];
    g.bolts.push({ x1: m.x, y1: m.y - 120, x2: m.x, y2: m.y, life: 10, color: '#e8743b' });

    const p = g.player;
    if (p && !p.dead &&
        M.rectsOverlap(m.x - MARK_W / 2, m.y - MARK_H, MARK_W, MARK_H + 2, p.x, p.y, p.w, p.h)) {
      p.hurt(g, e.attackDamage, M.sign(Ent.centerX(p) - m.x) || 1);
    }
  }

  // --- magma crab ---------------------------------------------------------------

  /* Armoured, so light weapons chip at it (the armour floor in base.js is
     what keeps them from bouncing off entirely). Its charge is a straight
     scuttle that drops embers behind it - the floor it crossed stays
     dangerous for a moment after it has gone. */
  const EMBER_EVERY = 8;

  function magmacrab(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') {
      e.vx *= 0.6;
      if (e.frame % 3 === 0) DS.FX.spark(Ent.centerX(e), e.y + e.h, 1, '#e8743b');
      return;
    }
    if (phase === 'strike') {
      e.vx = e.facing * 2.6 * slow;
      e.touchDamage = e.attackDamage;
      if (e.attackTimer % EMBER_EVERY === 0) dropEmber(g, e);
      if (Phys.wallAhead(g.map, e, e.facing) || !Phys.floorAhead(g.map, e, e.facing)) {
        e.vx = 0;
        e.attackTimer = 1;
      }
      return;
    }
    e.touchDamage = 0;
    if (phase === 'recover') { e.vx *= 0.7; return; }

    if (sees && dist < e.cfg.range && Math.abs(dy) < 20 * e.sizeScale && e.attackCooldown <= 0) {
      e.facing = M.sign(dx) || e.facing;
      E.beginAttack(e);
      return;
    }

    E.walkToward(g, e, dx, sees, slow, 0.1);
  }

  function dropEmber(g, e) {
    Ent.spawnProjectile(g, {
      x: Ent.centerX(e) - 4, y: e.y + e.h - 6,
      vx: 0, vy: 0, gravity: 0,
      damage: Math.max(1, e.attackDamage - 1), friendly: false, kind: 'orb',
      element: 'fire', life: 90, w: 8, h: 5, trailColor: '#e8743b'
    });
  }

  // --- definitions ------------------------------------------------------------

  /* The 2D sheets are the act I bodies recoloured (enemies2.js shares its
     rows and its registration for exactly this). */
  function register(key, cfg, frames, pal) {
    E.defineArt(key, cfg, frames, pal);
  }

  register('icewisp', {
    w: 12, h: 14, hp: 16, touch: 0, speed: 0.7, sight: 210, armor: 0,
    flying: true, gore: ['#a8e4ff', '#4fb3e0'], sprite: 'icewisp',
    wind: 30, strike: 6, recover: 50, range: 150, damage: 1,
    behavior: icewisp, minDepth: 11
  }, [ART.WRAITH, ART.WRAITH, ART.WRAITH_HURT], ICE_PAL);

  // The harpy wears the bat's sheet in 2D; its voxel model is its own.
  E.TYPES.harpy = {
    w: 10, h: 8, hp: 14, touch: 0, speed: 1.2, sight: 190, armor: 0,
    flying: true, gore: ['#b98d5c', '#6e1b28'], sprite: 'bat',
    wind: 24, strike: 26, recover: 36, range: 80, damage: 2,
    behavior: harpy, minDepth: 13
  };

  register('cultist', {
    w: 10, h: 16, hp: 24, touch: 0, speed: 0.45, sight: 230, armor: 1,
    gore: ['#c0303c', '#6e1b28'], sprite: 'cultist',
    wind: 44, strike: 6, recover: 70, range: 170, damage: 2,
    behavior: cultist, minDepth: 16
  }, [ART.NECRO, ART.NECRO, ART.NECRO_HURT], CULT_PAL);

  register('magmacrab', {
    w: 12, h: 10, hp: 30, touch: 0, speed: 0.6, sight: 170, armor: 3,
    heavy: true, gore: ['#e8743b', '#6e1b28', '#f2c14e'], sprite: 'magmacrab',
    wind: 26, strike: 40, recover: 36, range: 90, damage: 2,
    behavior: magmacrab, minDepth: 21
  }, [ART.SPIDER, ART.SPIDER_TUCK, ART.SPIDER_HURT], MAGMA_PAL);
})(window.DS);
