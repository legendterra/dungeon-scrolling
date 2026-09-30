/* The bestiary of act III, the crown of the gods: eight monsters that belong to a
   place, and six variations. The same wind -> strike -> recover machine as the
   acts before, and the shared kit E.kit (enemies4.js):

     hoplite      a shield wall and a long thrust
     centaur      an archer that gallops away as you close
     gorgonite    a gaze that turns your legs to stone, if you stand in front of it
     fury         a flyer that cracks a whip along your height
     shade        a shadow that comes up behind you
     automaton    bronze that heats as it fights; hot it hits hard and cannot turn a blade
     cyclops      a stamp, and a boulder from far away
     sun priest   a beam of light that falls where you were

   and the satyr, the stone snake, the titan's slave, the Cerberus pup, the storm spirit
   and the griffin for variety. Which of them live on which floor is the map's roster
   (src/world/maps/act3.js). */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;
  const E = DS.Enemies;
  const K = E.kit;
  if (!K) return;
  const def = K.def, face = K.face, tellFx = K.tellFx, near = K.near, lash = K.lash;
  const hitBox = K.hitBox, weigh = K.weigh, hop = K.hop, blocked = K.blocked;
  const cx = Ent.centerX;
  const cy = Ent.centerY;

  // --- hoplite ---------------------------------------------------------------------

  const THRUST = 36;

  /* Shield up while it walks at you: light blows from the front are turned, as the
     crab's are. It draws the spear back to thrust, and the thrust is long and thin:
     step out of the line, or under it, and it has spent itself. */
  function hoplite(g, e, dx, dy, dist, sees, slow, phase) {
    e.shieldUp = phase === 'none' && sees;
    if (phase === 'wind') { e.vx *= 0.3; tellFx(e, '#f2c14e', 5); return; }
    if (phase === 'strike') {
      e.vx *= 0.3;
      if (!e.struck) {
        const len = THRUST * e.sizeScale;
        const x0 = e.facing > 0 ? e.x + e.w - 2 : e.x + 2 - len;
        if (hitBox(g, e, x0, cy(e) - 5, len, 10, e.attackDamage, e.facing)) e.struck = true;
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && near(e, dx, dy, e.cfg.range, 16) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.06, 0.9);
  }

  def('hoplite', {
    w: 11, h: 16, hp: 28, touch: 0, speed: 0.4, sight: 160, armor: 2, heavy: true, blocksFront: true,
    gore: ['#e8e4dc', '#b8860b', '#7a5230'], sprite: 'shielder',
    wind: 32, strike: 9, recover: 42, range: THRUST, damage: 3,
    behavior: hoplite, minDepth: 21, tell: 'clack'
  });

  // --- centaur ------------------------------------------------------------------------

  /* It keeps its distance: closer than sixty pixels and it gallops away, and only
     when it has room does it stop to draw. The arrow is the skeleton's, and so is the
     dotted line before it. With a wall behind it, it stands and shoots. */
  function shootArrow(g, e) {
    const len = Math.max(1, Math.sqrt(e.aimX * e.aimX + e.aimY * e.aimY));
    DS.Audio.play('shoot');
    Ent.spawnProjectile(g, {
      x: cx(e) + e.facing * 8, y: cy(e) - 4, vx: (e.aimX / len) * 3.1, vy: (e.aimY / len) * 3.1 - 0.25,
      gravity: 0.02, damage: e.attackDamage, friendly: false, kind: 'arrow', life: 180, w: 8, h: 3
    });
  }

  function centaur(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.7; e.aimX = dx; e.aimY = dy; face(e, dx); return; }
    if (phase === 'strike') {
      if (!e.struck) { e.struck = true; shootArrow(g, e); }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.85; return; }
    const dir = M.sign(dx) || e.facing;
    if (sees) {
      e.facing = dir;
      if (dist < 60 && !blocked(g, { x: e.x, y: e.y, w: e.w, h: e.h, facing: -dir }) ) {
        e.vx = M.approach(e.vx, -dir * e.speed * 1.7 * slow, 0.16);
      } else if (dist > 150) {
        e.vx = M.approach(e.vx, dir * e.speed * slow, 0.08);
      } else e.vx *= 0.8;
      if (e.attackCooldown <= 0 && Math.abs(dx) > 30 && dist < e.cfg.range) E.beginAttack(e);
    } else {
      E.walkToward(g, e, dx, false, slow, 0.06);
    }
  }

  def('centaur', {
    w: 16, h: 18, hp: 22, touch: 0, speed: 0.75, sight: 210, armor: 0,
    gore: ['#8a5a34', '#f2c14e'], sprite: 'skeleton',
    wind: 30, strike: 4, recover: 46, range: 190, damage: 2,
    behavior: centaur, minDepth: 22, tell: 'neigh'
  });

  // --- gorgonite -------------------------------------------------------------------------

  const GAZE_REACH = 96;

  /* Stone in the eyes. It turns to face you, its eyes go white, and a line is drawn
     to you: what stands in front of it when the line goes hard has its legs turned to
     stone for a good while. Behind it, or high over it, or not in its sight, and it
     does nothing at all. */
  function gorgonite(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') {
      e.vx *= 0.2;
      face(e, dx);
      tellFx(e, '#f4f0d8', 3);
      if (e.frame % 5 === 0) lash(g, cx(e) + e.facing * 4, cy(e) - 3, cx(e) + e.facing * GAZE_REACH * e.sizeScale, cy(e) - 3, '#d8d4c0', 3);
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        const p = g.player;
        const reach = GAZE_REACH * e.sizeScale;
        DS.Audio.play('gaze');
        lash(g, cx(e) + e.facing * 4, cy(e) - 3, cx(e) + e.facing * reach, cy(e) - 3, '#ffffff', 8);
        const x0 = e.facing > 0 ? cx(e) : cx(e) - reach;
        if (hitBox(g, e, x0, cy(e) - 14, reach, 28, e.attackDamage, e.facing)) weigh(p, 150, 0.28);
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && Math.abs(dx) < GAZE_REACH * e.sizeScale && Math.abs(dy) < 30 && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.06, 0.9);
  }

  def('gorgonite', {
    w: 12, h: 17, hp: 24, touch: 0, speed: 0.42, sight: 170, armor: 1,
    gore: ['#b8b4a8', '#5cbf62', '#f4f0d8'], sprite: 'zombie',
    wind: 48, strike: 8, recover: 60, range: GAZE_REACH, damage: 1,
    behavior: gorgonite, minDepth: 23, tell: 'gaze'
  });

  // --- fury --------------------------------------------------------------------------------

  const WHIP = 84;

  /* A winged tormentor that hovers a little over your head and out of reach, and
     when it has your height it cracks a whip along it. The whip is a line at the
     height it was flying: jump it, or go under. */
  function fury(g, e, dx, dy, dist, sees, slow, phase) {
    e.animTimer += 0.16;
    e.touchDamage = 0;
    if (phase === 'wind') {
      e.vx *= 0.8; e.vy *= 0.8;
      face(e, dx);
      if (e.frame % 4 === 0) lash(g, cx(e), cy(e), cx(e) + e.facing * WHIP * e.sizeScale * (0.3 + 0.7 * E.windRatio(e)), cy(e) - 6, '#c0303c', 2);
      e.x += e.vx; e.y += e.vy;
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        const len = WHIP * e.sizeScale;
        DS.Audio.play('swing');
        lash(g, cx(e), cy(e), cx(e) + e.facing * len, cy(e) + 2, '#ffe0e0', 6);
        const x0 = e.facing > 0 ? cx(e) : cx(e) - len;
        hitBox(g, e, x0, cy(e) - 5, len, 12, e.attackDamage, e.facing);
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.9; e.vy = M.approach(e.vy, -0.3, 0.05); e.x += e.vx; e.y += e.vy; return; }
    if (sees && dist < e.cfg.range && Math.abs(dy) < 22 && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    const want = sees ? (Math.abs(dx) < 50 ? -M.sign(dx) : (Math.abs(dx) > 84 ? M.sign(dx) : 0)) * e.speed : e.facing * e.speed * 0.4;
    e.vx = M.approach(e.vx, want * slow, 0.06);
    e.facing = M.sign(e.vx) || e.facing;
    const hover = sees ? cy(g.player) - 4 : e.baseY;
    e.vy = M.approach(e.vy, (hover - e.y) * 0.05, 0.07);
    e.x += e.vx;
    e.y += e.vy + Math.sin(e.animTimer) * 0.3;
    if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) e.vx *= -1;
  }

  def('fury', {
    w: 11, h: 14, hp: 20, touch: 0, speed: 0.95, sight: 200, armor: 0, flying: true,
    gore: ['#c0303c', '#2c2624'], sprite: 'bat',
    wind: 26, strike: 8, recover: 44, range: WHIP + 20, damage: 2,
    behavior: fury, minDepth: 24, tell: 'screech'
  });

  // --- shade -----------------------------------------------------------------------------------

  /* A shadow that has been walking to you unseen. While it is away it is a dark
     smear on the floor and nothing can hurt it; close by it steps out BEHIND you and
     the claw comes a beat later. Turn and it is a body like any other, and it fades
     again when the blow is spent. */
  function shade(g, e, dx, dy, dist, sees, slow, phase) {
    const p = g.player;
    if (phase === 'wind') { e.hidden = false; e.invuln = 0; e.vx *= 0.3; face(e, dx); tellFx(e, '#7ff0ff', 3); return; }
    if (phase === 'strike') {
      e.hidden = false; e.invuln = 0;
      E.strikePlayer(g, e, E.meleeBox(e));
      return;
    }
    if (phase === 'recover') { e.hidden = false; e.vx *= 0.7; return; }
    e.hidden = true;
    e.invuln = Math.max(e.invuln, 2);
    if (sees && dist < 46 && e.attackCooldown <= 0 && p) {
      const behind = p.facing > 0 ? -1 : 1;
      e.x = p.x + p.w / 2 + behind * 20 - e.w / 2;
      e.y = p.y + p.h - e.h;
      e.vx = 0; e.vy = 0;
      e.facing = -behind;
      e.hidden = false; e.invuln = 0;
      DS.Audio.play('whisper');
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.1, 1.5);
  }

  def('shade', {
    w: 10, h: 15, hp: 18, touch: 0, speed: 0.8, sight: 190, armor: 0,
    gore: ['#5a4a88', '#7ff0ff'], sprite: 'zombie',
    wind: 24, strike: 8, recover: 50, range: 46, damage: 2,
    hitbox: { w: 20, h: 15, oy: 0 }, behavior: shade, minDepth: 25, tell: 'gaze'
  });

  // --- automaton -----------------------------------------------------------------------------------

  /* Bronze, built by a god and left to run. It heats as it fights. Cool, it turns a blade
     (armour); hot, it glows, hits harder and is soft. At full heat it vents: it stops
     and screams steam for a moment, and that is the moment to hit it. */
  function automaton(g, e, dx, dy, dist, sees, slow, phase) {
    if (e.heat == null) e.heat = 0;
    if (e.venting > 0) {
      e.venting--;
      e.vx = 0;
      e.armor = 0;
      if (e.frame % 3 === 0) DS.FX.burst(cx(e), e.y + 2, 3, ['#ffffff', '#c8d0d8'], { speed: 1.2, life: 18, grav: -0.03 });
      if (e.venting === 0) e.heat = 15;
      return;
    }
    e.heat = M.clamp(e.heat + (sees ? 0.32 : -0.4) + (phase === 'wind' ? 0.3 : 0), 0, 100);
    e.armor = e.heat < 70 ? e.cfg.armor : 0;
    if (e.heat >= 100) { e.venting = 70; DS.Audio.play('steam'); return; }
    if (phase === 'wind') { e.vx *= 0.3; tellFx(e, '#ffb060', 4); return; }
    if (phase === 'strike') {
      e.vx *= 0.3;
      const dmg = e.heat >= 70 ? e.attackDamage + 1 : e.attackDamage;
      if (!e.struck && hitBox(g, e, E.meleeBox(e).x, E.meleeBox(e).y, E.meleeBox(e).w, E.meleeBox(e).h, dmg)) e.struck = true;
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && near(e, dx, dy, e.cfg.range) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.05, e.heat >= 70 ? 1.5 : 1);
  }

  def('automaton', {
    w: 14, h: 20, hp: 40, touch: 0, speed: 0.4, sight: 160, armor: 3, heavy: true,
    gore: ['#c98a3a', '#8a5a1e', '#ffb060'], sprite: 'shielder',
    wind: 34, strike: 8, recover: 44, range: 30, damage: 3,
    hitbox: { w: 26, h: 20, oy: 0 }, behavior: automaton, minDepth: 27, tell: 'chain'
  });

  // --- cyclops ---------------------------------------------------------------------------------------

  /* One eye, one great stride. Far away it lifts a boulder over its head (the tell) and
     throws it in an arc; up close it stamps, and the stamp is a ring around its feet,
     wide and low: jump it. */
  function cyclops(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') {
      e.vx *= 0.2;
      face(e, dx);
      if (e.mode == null) e.mode = dist > 84 ? 'throw' : 'stamp';
      tellFx(e, e.mode === 'throw' ? '#c8b48a' : '#ffb060', 4);
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        if (e.mode === 'throw') {
          DS.Audio.play('boulder');
          const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          Ent.spawnProjectile(g, {
            x: cx(e) + e.facing * 8 - 5, y: e.y - 6, vx: (dx / len) * 2.3, vy: (dy / len) * 2.3 - 1.5, gravity: 0.05,
            damage: e.attackDamage, friendly: false, kind: 'orb', element: 'earth', life: 160, w: 10, h: 10, trailColor: '#c8b48a'
          });
        } else {
          const r = 40 * e.sizeScale;
          DS.Audio.play('landHard');
          DS.R.shake(6);
          DS.FX.ring(cx(e), e.y + e.h - 2, r, '#c8b48a', 2);
          hitBox(g, e, cx(e) - r, e.y + e.h - 14, r * 2, 18, e.attackDamage);
        }
      }
      return;
    }
    if (phase === 'recover') { e.mode = null; e.vx *= 0.7; return; }
    if (sees && e.attackCooldown <= 0 && (dist < e.cfg.range || (dist < 190 && Math.abs(dy) < 60))) {
      face(e, dx);
      e.mode = dist > 84 ? 'throw' : 'stamp';
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.05, 0.9);
  }

  def('cyclops', {
    w: 20, h: 28, hp: 60, touch: 0, speed: 0.36, sight: 200, armor: 2, heavy: true,
    gore: ['#a88a5a', '#7a5230', '#f4f0d8'], sprite: 'shielder',
    wind: 50, strike: 10, recover: 60, range: 36, damage: 3,
    behavior: cyclops, minDepth: 28, tell: 'growl'
  });

  // --- sun priest -----------------------------------------------------------------------------------------

  const BEAM_W = 30;

  /* Keeps its distance and prays. A ring of light marks the ground under you and follows
     you for the first half of the prayer; then it holds, and a column of light falls on
     it. Be somewhere else when the ring stops. */
  function sunpriest(g, e, dx, dy, dist, sees, slow, phase) {
    const p = g.player;
    if (e.tx == null && p) { e.tx = cx(p); e.ty = p.y + p.h; }
    if (phase === 'wind') {
      e.vx *= 0.5;
      face(e, dx);
      if (p && E.windRatio(e) < 0.55) { e.tx = cx(p); e.ty = p.y + p.h; }
      tellFx(e, '#fff0a8', 4);
      if (e.frame % 4 === 0) DS.FX.ring(e.tx, e.ty - 2, BEAM_W * 0.5, '#f2c14e', 1.2);
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        DS.Audio.play('thunder');
        DS.R.flash('#fff0a8', 4);
        lash(g, e.tx, e.ty - 150, e.tx, e.ty, '#fff8d0', 10);
        DS.FX.burst(e.tx, e.ty - 6, 12, ['#fff0a8', '#f2c14e', '#ffffff'], { speed: 2, life: 16, grav: -0.02 });
        hitBox(g, e, e.tx - BEAM_W / 2, e.ty - 150, BEAM_W, 160, e.attackDamage, M.sign(e.tx - cx(e)) || 1);
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.85; return; }
    if (sees) {
      const dir = M.sign(dx) || e.facing;
      e.facing = dir;
      if (dist < 70) e.vx = M.approach(e.vx, -dir * e.speed * slow, 0.1);
      else if (dist > 150) e.vx = M.approach(e.vx, dir * e.speed * slow, 0.08);
      else e.vx *= 0.85;
      if (e.attackCooldown <= 0 && dist < e.cfg.range) E.beginAttack(e);
    } else {
      E.walkToward(g, e, dx, false, slow, 0.05);
    }
  }

  def('sunpriest', {
    w: 11, h: 17, hp: 24, touch: 0, speed: 0.55, sight: 200, armor: 0,
    gore: ['#f2c14e', '#fff0a8', '#f4f0d8'], sprite: 'skeleton',
    wind: 52, strike: 8, recover: 70, range: 170, damage: 3,
    behavior: sunpriest, minDepth: 29, tell: 'chime'
  });

  // --- variations ----------------------------------------------------------------------------------------

  /* Satyr: a leaper. It hops in from a distance and jabs on the landing. */
  function satyr(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.3; tellFx(e, '#c8ff8a', 5); return; }
    if (phase === 'strike') {
      if (!e.leapt) { e.leapt = true; hop(e, e.facing, 2.4 * slow, 4.6); DS.Audio.play('bleat'); }
      if (!e.struck && hitBox(g, e, e.x - 3, e.y - 3, e.w + 6, e.h + 6)) e.struck = true;
      return;
    }
    e.leapt = false;
    if (phase === 'recover') { if (e.onGround) e.vx *= 0.7; return; }
    if (sees && dist < e.cfg.range && dist > 30 && e.attackCooldown <= 0 && e.onGround) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.1, 1.3);
  }

  def('satyr', {
    w: 11, h: 15, hp: 16, touch: 0, speed: 0.8, sight: 180, armor: 0,
    gore: ['#8a5a34', '#c8ff8a'], sprite: 'zombie',
    wind: 24, strike: 26, recover: 40, range: 100, damage: 2,
    behavior: satyr, minDepth: 22, tell: 'bleat'
  });

  /* Stone snake: low and slow, and the bite turns the legs heavy. */
  function stonesnake(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.3; tellFx(e, '#d8d4c0', 5); return; }
    if (phase === 'strike') {
      e.vx = e.facing * 2.2 * slow;
      if (!e.struck && hitBox(g, e, e.x - 2, e.y - 2, e.w + 4, e.h + 4)) { e.struck = true; weigh(g.player, 90, 0.55); }
      if (blocked(g, e)) { e.vx = 0; e.attackTimer = 1; }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.75; return; }
    if (sees && near(e, dx, dy, e.cfg.range, 14) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.07);
  }

  def('stonesnake', {
    w: 15, h: 6, hp: 12, touch: 0, speed: 0.55, sight: 130, armor: 1,
    gore: ['#d8d4c0', '#8a8478'], sprite: 'zombie',
    wind: 26, strike: 20, recover: 46, range: 34, damage: 1,
    behavior: stonesnake, minDepth: 23, tell: 'hiss'
  });

  /* A titan's slave: a chain on a ball, swung round its head. The spin is a ring
     around it, hurting anything in reach for as long as it lasts. */
  const SPIN_R = 40;
  function titanslave(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.3; tellFx(e, '#8a8478', 4); e.spin = 0; return; }
    if (phase === 'strike') {
      e.vx *= 0.2;
      e.spin = (e.spin || 0) + 0.5;
      const r = SPIN_R * e.sizeScale;
      if (e.frame % 4 === 0) {
        DS.Audio.play('chain');
        lash(g, cx(e), cy(e) - 2, cx(e) + Math.cos(e.spin) * r, cy(e) - 2 + Math.sin(e.spin) * 6, '#c8c0b0', 3);
      }
      if (e.frame % 6 === 0) hitBox(g, e, cx(e) - r, e.y - 4, r * 2, e.h + 8, e.attackDamage);
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && near(e, dx, dy, e.cfg.range, 22) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.05, 0.9);
  }

  def('titanslave', {
    w: 13, h: 19, hp: 30, touch: 0, speed: 0.38, sight: 140, armor: 1, heavy: true,
    gore: ['#8a8478', '#5a4a3a'], sprite: 'zombie',
    wind: 34, strike: 30, recover: 50, range: SPIN_R - 6, damage: 2,
    behavior: titanslave, minDepth: 24, tell: 'chain'
  });

  /* A Cerberus pup: three heads, three bites, one after the other. */
  function cerberuspup(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.4; tellFx(e, '#ff7a3d', 4); e.bites = 0; return; }
    if (phase === 'strike') {
      e.vx = e.facing * 0.9 * slow;
      const slot = Math.floor((1 - e.attackTimer / Math.max(1, e.cfg.strike)) * 3);
      if (slot > (e.bites || 0) - 1 && (e.bites || 0) < 3) {
        e.bites = (e.bites || 0) + 1;
        DS.Audio.play('growl');
        hitBox(g, e, e.facing > 0 ? e.x + e.w - 4 : e.x + 4 - 20, e.y - 2, 20, e.h + 4, e.attackDamage, e.facing);
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.7; return; }
    if (sees && near(e, dx, dy, e.cfg.range, 16) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.1, 1.4);
  }

  def('cerberuspup', {
    w: 13, h: 11, hp: 18, touch: 0, speed: 0.85, sight: 170, armor: 0,
    gore: ['#2c2624', '#ff7a3d'], sprite: 'zombie',
    wind: 24, strike: 30, recover: 44, range: 30, damage: 1,
    behavior: cerberuspup, minDepth: 25, tell: 'growl'
  });

  /* A storm spirit: a cloud that comes over you and rains sparks straight down, one at
     a time, from where it hangs. Get out from under it. */
  function stormspirit(g, e, dx, dy, dist, sees, slow, phase) {
    e.animTimer += 0.1;
    e.touchDamage = 0;
    if (phase === 'wind') { e.vx *= 0.8; e.vy *= 0.8; tellFx(e, '#ffe45c', 3); e.x += e.vx; e.y += e.vy; return; }
    if (phase === 'strike') {
      if (e.frame % 8 === 0) {
        DS.Audio.play('zap');
        Ent.spawnProjectile(g, {
          x: cx(e) - 3 + M.clamp(dx * 0.05, -8, 8), y: e.y + e.h, vx: 0, vy: 1.2, gravity: 0.05, damage: e.attackDamage,
          friendly: false, kind: 'orb', element: 'lightning', life: 60, w: 6, h: 8, trailColor: '#ffe45c'
        });
      }
      e.x += e.vx; e.y += e.vy;
      return;
    }
    if (phase === 'recover') { e.vx *= 0.9; e.vy *= 0.9; e.x += e.vx; e.y += e.vy; return; }
    if (sees && Math.abs(dx) < 44 && dy > 20 && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    const want = sees ? M.sign(dx) * e.speed : e.facing * e.speed * 0.4;
    e.vx = M.approach(e.vx, want * slow, 0.05);
    e.facing = M.sign(e.vx) || e.facing;
    const hover = sees ? cy(g.player) - 54 : e.baseY;
    e.vy = M.approach(e.vy, (hover - e.y) * 0.04, 0.06);
    e.x += e.vx;
    e.y += e.vy + Math.sin(e.animTimer) * 0.25;
    if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) e.vx *= -1;
  }

  def('stormspirit', {
    w: 14, h: 10, hp: 12, touch: 0, speed: 0.7, sight: 200, armor: 0, flying: true,
    gore: ['#ffe45c', '#6a728c'], sprite: 'bat',
    wind: 26, strike: 40, recover: 60, range: 60, damage: 2,
    behavior: stormspirit, minDepth: 26, tell: 'thunder'
  });

  /* The griffin: the bat's dive on a far bigger animal. */
  def('griffin', {
    w: 17, h: 13, hp: 26, touch: 0, speed: 1.0, sight: 210, armor: 1, flying: true,
    gore: ['#c8a458', '#f4f0d8'], sprite: 'bat',
    wind: 24, strike: 20, recover: 46, range: 130, damage: 3,
    behavior: E.flyerBrain, minDepth: 29, tell: 'screech'
  });
})(window.DS);
