/* The bestiary of act II, the drowned depths: five monsters that belong to a
   place, and three variations. The same wind -> strike -> recover machine as
   everything before them (enemies.js), and the shared kit E.kit of enemies4.js:

     eel          coils, then throws a ring of lightning around itself: stay out or be above it
     glowworm     hangs in the dark with a lit lure; anything under it is snared
     drowner      a village ghost that takes you by the legs and drags you under
     egg sac      rooted; when you come near it hatches spiders, a few at a time
     ice troll    a slam that sends two frost waves along the floor

   and the mosquito, the lake spirit and the ice wolf for variety. Which of them
   live on which floor is the map's roster (src/world/maps/act2.js). */
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
  const hitBox = K.hitBox, weigh = K.weigh, hop = K.hop;
  const cx = Ent.centerX;
  const cy = Ent.centerY;

  // --- eel ----------------------------------------------------------------------

  const SHOCK_R = 30;

  /* It slides at you along the floor, and when it is close it rears and crackles:
     that is the tell. The blow is a ring of lightning around the whole body, wide
     and shallow, so the answers are to stay out of it, jump over it, or dash
     through it. */
  function eel(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.3; tellFx(e, '#7fe8ff', 3); return; }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        const r = SHOCK_R * e.sizeScale;
        DS.Audio.play('zap');
        DS.FX.ring(cx(e), cy(e), r, '#7fe8ff', 2);
        for (let s = -1; s <= 1; s += 2) lash(g, cx(e), cy(e), cx(e) + s * r, cy(e) - 5, '#bff4ff', 6);
        hitBox(g, e, cx(e) - r, e.y - 16, r * 2, e.h + 24, e.attackDamage);
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && near(e, dx, dy, e.cfg.range, 22) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.08);
  }

  def('eel', {
    w: 16, h: 7, hp: 14, touch: 0, speed: 0.7, sight: 140, armor: 0,
    gore: ['#4a6a78', '#7fe8ff'], sprite: 'zombie',
    wind: 30, strike: 12, recover: 52, range: 34, damage: 2,
    behavior: eel, minDepth: 11, tell: 'zap'
  });

  // --- glowworm ---------------------------------------------------------------------

  const LURE_REACH = 96;

  /* It hangs where it was hung, a little over your head, with a lit lure. When you
     are under it or near it the lure brightens and a faint line shows where the
     strand will fall: the line follows you for the first half of the wind-up and then
     holds. The strand is quick, and what it catches is slowed for a good while. The
     answer is to move once the line stops, or to cut the worm down from the air. */
  function glowworm(g, e, dx, dy, dist, sees, slow, phase) {
    if (e.pinY == null) e.pinY = e.y - 44;
    e.vx = 0; e.vy = 0; e.x = e.homeX; e.y = e.pinY;
    const p = g.player;
    if (e.tx == null && p) { e.tx = cx(p); e.ty = cy(p); }
    if (phase === 'wind') {
      if (p && E.windRatio(e) < 0.55) { e.tx = cx(p); e.ty = cy(p); }
      tellFx(e, '#a3ffd8', 3);
      if (e.frame % 5 === 0) lash(g, cx(e), e.y + e.h, e.tx, e.ty, '#5cbf9a', 3);
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        DS.Audio.play('hiss');
        lash(g, cx(e), e.y + e.h, e.tx, e.ty, '#a3ffd8', 10);
        if (hitBox(g, e, e.tx - 12, e.ty - 15, 24, 30, e.attackDamage, M.sign(e.tx - cx(e)) || 1)) weigh(p, 120, 0.4);
      }
      return;
    }
    if (phase === 'recover') return;
    if (sees && Math.abs(dx) < 60 * e.sizeScale && dy > 6 && dist < LURE_REACH * e.sizeScale && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
    }
  }

  def('glowworm', {
    w: 8, h: 14, hp: 12, touch: 0, speed: 0, sight: 130, armor: 0, flying: true, rooted: true,
    gore: ['#a3ffd8', '#5cbf9a'], sprite: 'spitter',
    wind: 40, strike: 10, recover: 90, range: LURE_REACH, damage: 2,
    behavior: glowworm, minDepth: 14, tell: 'hiss'
  });

  // --- drowner ------------------------------------------------------------------------

  /* A ghost of the drowned village, pale and dripping, arms out. It takes you by
     the legs: a blow that lands slows you and drags you toward it, and it will
     not let go for a moment. Dash out before it closes, or kill it before it does. */
  function drowner(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.vx *= 0.4; tellFx(e, '#a8e4ff', 4); return; }
    if (phase === 'strike') {
      e.vx *= 0.5;
      const p = g.player;
      if (E.strikePlayer(g, e, E.meleeBox(e)) && p) {
        weigh(p, 100, 0.4);
        p.pullT = 22; p.pullX = cx(e); p.pullSpeed = 1.6;
        DS.FX.burst(cx(p), cy(p), 6, ['#a8e4ff', '#ffffff'], { speed: 1.2, life: 12, grav: 0.05 });
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.8; return; }
    if (sees && near(e, dx, dy, e.cfg.range) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.06, 0.9);
  }

  def('drowner', {
    w: 11, h: 15, hp: 20, touch: 0, speed: 0.42, sight: 150, armor: 0,
    gore: ['#a8e4ff', '#4a6a70'], sprite: 'zombie',
    wind: 34, strike: 8, recover: 46, range: 24, damage: 2,
    hitbox: { w: 22, h: 15, oy: 0 }, behavior: drowner, minDepth: 16, tell: 'bubble'
  });

  // --- egg sac -------------------------------------------------------------------------

  const BROOD_MAX = 4;

  /* Rooted, swollen, and it knows when you are near. It pulses and then hatches two
     young; it will not hatch more while four are alive. Kill it early and there are
     none, kill it late and it bursts with one last. */
  function eggsac(g, e, dx, dy, dist, sees, slow, phase) {
    e.kids = (e.kids || []).filter(function (k) { return !k.dead; });
    if (!e.wired) {
      e.wired = true;
      e.onDeath = function (gg, self) { hatch(gg, self, 1); };
    }
    if (phase === 'wind') { tellFx(e, '#c8ff8a', 5); return; }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        hatch(g, e, Math.min(2, BROOD_MAX - e.kids.length));
      }
      return;
    }
    if (phase === 'recover') return;
    if (sees && dist < e.cfg.range && e.kids.length < BROOD_MAX && e.attackCooldown <= 0) E.beginAttack(e);
  }

  function hatch(g, e, n) {
    if (n <= 0) return;
    DS.Audio.play('squish');
    DS.FX.burst(cx(e), cy(e), 10, ['#c8ff8a', '#f4f0d8', '#6a8a3a'], { speed: 1.8, life: 18, grav: 0.05 });
    for (let i = 0; i < n; i++) {
      const kid = E.create(g, cx(e) + (i ? 8 : -8) - 5, e.y - 2, 'spider', 'normal');
      if (!kid) continue;
      /* A hatchling is a spider that has come down already, and half as tough. */
      kid.hanging = false;
      kid.x = cx(e) + (i ? 8 : -8) - kid.w / 2;
      kid.y = e.y - 2;
      kid.baseY = kid.y;
      kid.vy = -1.6;
      kid.maxHp = Math.max(1, Math.ceil(kid.maxHp * 0.5));
      kid.hp = kid.maxHp;
      (e.kids = e.kids || []).push(kid);
    }
  }

  def('eggsac', {
    w: 14, h: 14, hp: 18, touch: 0, speed: 0, sight: 130, armor: 1, rooted: true,
    gore: ['#c8ff8a', '#6a8a3a', '#f4f0d8'], sprite: 'spitter',
    wind: 46, strike: 6, recover: 150, range: 110, damage: 1,
    behavior: eggsac, minDepth: 17, tell: 'squish'
  });

  // --- ice troll -------------------------------------------------------------------------

  /* Slow, heavy, and it lifts the club over its head to let you see it coming. The
     slam sends a frost wave along the floor each way, low enough to jump, and the
     club itself hurts anything under it. */
  function trollice(g, e, dx, dy, dist, sees, slow, phase) {
    if (phase === 'wind') { e.slammed = false; e.vx *= 0.3; tellFx(e, '#a8e4ff', 5); return; }
    if (phase === 'strike') {
      if (!e.slammed) {
        e.slammed = true;
        DS.Audio.play('boulder');
        DS.R.shake(4);
        const y = e.y + e.h - 6;
        for (let s = -1; s <= 1; s += 2) {
          Ent.spawnProjectile(g, {
            x: cx(e) + s * 10 - 5, y: y, vx: s * 1.9, vy: 0, gravity: 0, damage: e.attackDamage,
            friendly: false, kind: 'orb', element: 'ice', life: 46, w: 10, h: 6, trailColor: '#a8e4ff'
          });
        }
        DS.FX.burst(cx(e), e.y + e.h, 8, ['#a8e4ff', '#ffffff'], { speed: 1.6, life: 16, grav: 0.05 });
      }
      E.strikePlayer(g, e, E.meleeBox(e));
      return;
    }
    if (phase === 'recover') { e.vx *= 0.7; return; }
    if (sees && near(e, dx, dy, e.cfg.range) && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.05, 0.9);
  }

  def('trollice', {
    w: 16, h: 22, hp: 44, touch: 0, speed: 0.38, sight: 150, armor: 2, heavy: true,
    gore: ['#a8e4ff', '#6a8aa0', '#ffffff'], sprite: 'shielder',
    wind: 46, strike: 10, recover: 62, range: 34, damage: 3,
    hitbox: { w: 26, h: 20, oy: 2 }, behavior: trollice, minDepth: 19, tell: 'boulder'
  });

  // --- variations ---------------------------------------------------------------------------

  /* Mosquito: a bat that stays close and whines. It dives, and a bite that lands
     leaves you sluggish for a moment. */
  function mosquito(g, e, dx, dy, dist, sees, slow, phase) {
    e.animTimer += 0.35;
    e.touchDamage = 0;
    if (phase === 'wind') {
      e.vx *= 0.8; e.vy *= 0.8;
      e.diveX = dx; e.diveY = dy;
      e.x += e.vx; e.y += e.vy + Math.sin(e.animTimer) * 0.4;
      return;
    }
    if (phase === 'strike') {
      if (!e.diving) {
        e.diving = true;
        const len = Math.max(1, Math.sqrt(e.diveX * e.diveX + e.diveY * e.diveY));
        e.vx = (e.diveX / len) * 3.0;
        e.vy = (e.diveY / len) * 3.0;
        DS.Audio.play('dash');
      }
      e.x += e.vx * slow;
      e.y += e.vy * slow;
      if (!e.struck && hitBox(g, e, e.x - 1, e.y - 1, e.w + 2, e.h + 2)) { e.struck = true; weigh(g.player, 50, 0.75); }
      if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) e.attackTimer = 0;
      return;
    }
    if (phase === 'recover') {
      e.diving = false;
      e.vx *= 0.9;
      e.vy = M.approach(e.vy, -0.6, 0.08);
      e.x += e.vx; e.y += e.vy;
      return;
    }
    if (sees && dist < e.cfg.range && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    const targetX = sees ? M.sign(dx) * e.speed : e.facing * e.speed * 0.5;
    e.vx = M.approach(e.vx, targetX * slow, 0.09);
    e.facing = M.sign(e.vx) || e.facing;
    const hover = sees ? cy(g.player) - 16 : e.baseY;
    e.vy = M.approach(e.vy, (hover - e.y) * 0.05, 0.1);
    e.x += e.vx;
    e.y += e.vy + Math.sin(e.animTimer * 1.7) * 0.5;
    if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) e.vx *= -1;
  }

  def('mosquito', {
    w: 7, h: 6, hp: 6, touch: 0, speed: 1.3, sight: 170, armor: 0, flying: true,
    gore: ['#6a4a3a', '#c0303c'], sprite: 'bat',
    wind: 16, strike: 16, recover: 34, range: 110, damage: 1,
    behavior: mosquito, minDepth: 12, tell: 'buzz'
  });

  /* Lake spirit: keeps its distance, drifts at head height, and throws three drops
     in a fan. The drops soak whatever they hit, which is what lightning likes. */
  function lakespirit(g, e, dx, dy, dist, sees, slow, phase) {
    e.animTimer += 0.08;
    if (phase === 'wind') {
      e.vx *= 0.8; e.vy *= 0.8;
      tellFx(e, '#7fd0ff', 4);
      e.x += e.vx; e.y += e.vy;
      return;
    }
    if (phase === 'strike') {
      if (!e.struck) {
        e.struck = true;
        DS.Audio.play('gaze');
        const aim = Math.atan2(dy, dx);
        for (let i = -1; i <= 1; i++) {
          const a = aim + i * 0.22;
          Ent.spawnProjectile(g, {
            x: cx(e) - 4, y: cy(e) - 4, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, gravity: 0,
            damage: e.attackDamage, friendly: false, kind: 'orb', element: 'water', life: 90, w: 8, h: 8,
            trailColor: '#7fd0ff'
          });
        }
      }
      return;
    }
    if (phase === 'recover') { e.vx *= 0.9; e.vy *= 0.9; e.x += e.vx; e.y += e.vy; return; }
    if (sees && dist < e.cfg.range && e.attackCooldown <= 0) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    const want = sees ? (dist < 60 ? -M.sign(dx) : (dist > 95 ? M.sign(dx) : 0)) * e.speed : e.facing * e.speed * 0.4;
    e.vx = M.approach(e.vx, want * slow, 0.05);
    e.facing = M.sign(e.vx) || e.facing;
    const hover = sees ? cy(g.player) - 20 : e.baseY;
    e.vy = M.approach(e.vy, (hover - e.y) * 0.03, 0.05);
    e.x += e.vx;
    e.y += e.vy + Math.sin(e.animTimer) * 0.2;
    if (Phys.wallAhead(g.map, e, M.sign(e.vx) || 1)) e.vx *= -1;
  }

  def('lakespirit', {
    w: 10, h: 12, hp: 10, touch: 0, speed: 0.6, sight: 190, armor: 0, flying: true,
    gore: ['#7fd0ff', '#c8ecff'], sprite: 'bat',
    wind: 32, strike: 6, recover: 70, range: 150, damage: 2,
    behavior: lakespirit, minDepth: 18, tell: 'gaze'
  });

  /* Ice wolf: comes in threes and leaps from a crouch. A bite that lands leaves you
     chilled and slow, so the second wolf finds you standing still. */
  function icewolf(g, e, dx, dy, dist, sees, slow, phase) {
    e.touchDamage = 0;
    if (phase === 'wind') { e.vx *= 0.4; tellFx(e, '#d8f4ff', 4); return; }
    if (phase === 'strike') {
      if (!e.leapt) { e.leapt = true; hop(e, e.facing, 2.9 * slow, 3.0); DS.Audio.play('howl'); }
      if (!e.struck && hitBox(g, e, e.x - 2, e.y - 2, e.w + 4, e.h + 4)) { e.struck = true; weigh(g.player, 80, 0.6); }
      return;
    }
    e.leapt = false;
    if (phase === 'recover') { if (e.onGround) e.vx *= 0.7; return; }
    if (sees && dist < e.cfg.range && e.attackCooldown <= 0 && e.onGround) {
      face(e, dx);
      E.beginAttack(e);
      return;
    }
    E.walkToward(g, e, dx, sees, slow, 0.13, 1.7);
  }

  def('icewolf', {
    w: 14, h: 10, hp: 13, touch: 0, speed: 1.0, sight: 200, armor: 0, pack: 3,
    gore: ['#d8f4ff', '#6a8aa0'], sprite: 'zombie',
    wind: 18, strike: 22, recover: 36, range: 70, damage: 2,
    behavior: icewolf, minDepth: 19, tell: 'howl'
  });
})(window.DS);
