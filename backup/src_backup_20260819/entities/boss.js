/* The Slime King. Two phases: a grounded slam-and-summon opener, then a
   faster rolling charge with a projectile rain once he drops below half. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const Phys = DS.Phys;

  function create(g, x, y) {
    const e = Ent.make(x, y - 18, 24, 18);

    e.kind = 'boss';
    e.isBoss = true;
    e.tier = 'boss';
    e.cfg = { sight: 9999, sprite: 'boss' };
    e.gore = ['#7f45b8', '#3c2154', '#c86ee0'];
    e.heavy = true;
    e.armor = 2;

    e.maxHp = Math.round(240 * (1 + (g.depth - 1) * 0.22));
    e.hp = e.maxHp;
    e.touchDamage = 2;

    e.phase = 1;
    e.state = 'INTRO';
    e.stateTimer = 90;
    e.attackCooldown = 0;
    e.invuln = 0;
    e.minions = 0;
    e.facing = -1;
    e.hurtFlash = 0;

    e.onDeath = function (gg) {
      DS.Audio.play('victory');
      DS.R.shake(10);
      DS.FX.burst(Ent.centerX(e), Ent.centerY(e), 60,
        ['#c86ee0', '#7f45b8', '#ffffff'], { speed: 3.2, life: 40 });
      gg.onBossDefeated();
    };

    g.enemies.push(e);
    g.boss = e;
    DS.Audio.play('bossRoar');
    return e;
  }

  function update(g, e) {
    e.frame++;
    if (e.invuln > 0) e.invuln--;
    if (e.hurtFlash > 0) e.hurtFlash--;
    if (e.attackCooldown > 0) e.attackCooldown--;

    Ent.tickStatus(g, e);
    if (e.dead) return;

    // Phase change is a one-time event with its own tell.
    if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      e.state = 'ENRAGE';
      e.stateTimer = 70;
      e.invuln = 70;
      DS.Audio.play('bossRoar');
      DS.R.shake(7);
      DS.FX.ring(Ent.centerX(e), Ent.centerY(e), 24, '#c86ee0', 2.6);
      DS.Audio.setMusic('boss');
    }

    const player = g.player;
    const dx = player ? Ent.centerX(player) - Ent.centerX(e) : 0;

    switch (e.state) {
      case 'INTRO':   intro(g, e); break;
      case 'ENRAGE':  enrage(g, e); break;
      case 'IDLE':    idle(g, e, dx); break;
      case 'SLAM':    slam(g, e); break;
      case 'SUMMON':  summon(g, e); break;
      case 'CHARGE':  charge(g, e); break;
      case 'RAIN':    rain(g, e); break;
      default:        e.state = 'IDLE'; break;
    }

    Phys.step(g.boss === e ? e : e, g.map);
    touchPlayer(g, e);
  }

  function touchPlayer(g, e) {
    const p = g.player;
    if (!p || p.dead) return;
    if (M.overlap(e, p)) DS.Player.touch(g, p, e, e.touchDamage);
  }

  function intro(g, e) {
    e.vx = 0;
    if (--e.stateTimer <= 0) { e.state = 'IDLE'; e.stateTimer = 40; }
  }

  function enrage(g, e) {
    e.vx = 0;
    if (e.frame % 5 === 0) {
      DS.FX.trail(Ent.centerX(e) + DS.rand.float(-14, 14),
                  e.y + DS.rand.float(0, e.h), '#c86ee0');
    }
    if (--e.stateTimer <= 0) { e.state = 'IDLE'; e.stateTimer = 20; }
  }

  function idle(g, e, dx) {
    e.facing = M.sign(dx) || e.facing;
    e.vx = M.approach(e.vx, M.sign(dx) * 0.35, 0.05);

    if (--e.stateTimer > 0) return;

    // Phase 2 unlocks the charge and the rain, and shortens the gaps.
    const options = e.phase === 1
      ? ['SLAM', 'SUMMON', 'SLAM']
      : ['CHARGE', 'RAIN', 'SLAM', 'CHARGE'];

    e.state = DS.rand.pick(options);
    e.stateTimer = e.state === 'CHARGE' ? 70 : e.state === 'RAIN' ? 90 : 46;
    e.actionDone = false;

    if (e.state === 'SLAM') { e.vy = -5.4; e.vx = M.sign(dx) * 1.4; }
    if (e.state === 'CHARGE') e.vx = e.facing * 3.4;
  }

  function slam(g, e) {
    e.stateTimer--;

    if (!e.actionDone && e.onGround && e.vy >= 0 && e.frame > 4) {
      e.actionDone = true;
      DS.Audio.play('slam');
      DS.R.shake(6);
      DS.FX.ring(Ent.centerX(e), e.y + e.h, 18, '#c86ee0', 2.4);
      DS.FX.dust(Ent.centerX(e), e.y + e.h, 14);

      // Shockwave: two low projectiles running along the floor.
      [-1, 1].forEach(function (dir) {
        Ent.spawnProjectile(g, {
          x: Ent.centerX(e) + dir * 12, y: e.y + e.h - 6,
          vx: dir * 2.2, vy: 0, gravity: 0,
          damage: 2, friendly: false, kind: 'orb', element: 'dark',
          life: 90, w: 6, h: 6
        });
      });
    }

    if (e.stateTimer <= 0 && e.onGround) { e.state = 'IDLE'; e.stateTimer = 34; }
  }

  function summon(g, e) {
    e.stateTimer--;
    e.vx *= 0.85;

    if (!e.actionDone && e.stateTimer < 24) {
      e.actionDone = true;
      const count = 2 + (e.phase === 2 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const sx = Ent.centerX(e) + DS.rand.float(-30, 30);
        DS.Enemies.create(g, sx, e.y, 'slime', false);
      }
      DS.Audio.play('cast');
      DS.FX.ring(Ent.centerX(e), Ent.centerY(e), 14, '#a3e86b', 1.8);
    }

    if (e.stateTimer <= 0) { e.state = 'IDLE'; e.stateTimer = 40; }
  }

  function charge(g, e) {
    e.stateTimer--;
    e.vx = e.facing * 3.4;

    if (e.frame % 3 === 0) {
      DS.FX.trail(Ent.centerX(e), Ent.centerY(e) + DS.rand.float(-6, 6), '#7f45b8');
    }

    // Bouncing off a wall ends the charge early.
    if (Phys.wallAhead(g.map, e, e.facing)) {
      e.facing *= -1;
      e.vx = 0;
      e.stateTimer = Math.min(e.stateTimer, 12);
      DS.R.shake(5);
      DS.Audio.play('slam');
      DS.FX.dust(Ent.centerX(e), Ent.centerY(e), 10);
    }

    if (e.stateTimer <= 0) { e.state = 'IDLE'; e.stateTimer = 30; }
  }

  function rain(g, e) {
    e.stateTimer--;
    e.vx *= 0.9;

    if (e.stateTimer % 12 === 0 && e.stateTimer > 20) {
      DS.Audio.play('cast');
      const spread = DS.rand.float(-1.6, 1.6);
      Ent.spawnProjectile(g, {
        x: Ent.centerX(e), y: e.y,
        vx: spread, vy: -3.6, gravity: 0.13,
        damage: 2, friendly: false, kind: 'orb', element: 'dark',
        life: 180, w: 6, h: 6
      });
    }

    if (e.stateTimer <= 0) { e.state = 'IDLE'; e.stateTimer = 30; }
  }

  function draw(g, e) {
    const R = DS.R, S = DS.SPR;
    const set = e.facing < 0 ? S.flip.boss : S.boss;
    const sprite = set[e.onGround ? 1 : 0];

    DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), 34, 'rgba(127,69,184,0.18)');

    if (e.hurtFlash > 0) R.spr(DS.Art.silhouette(sprite, '#ffffff'), e.x, e.y);
    else R.spr(sprite, e.x, e.y);

    // Crown rides on top, bobbing with the body.
    const bob = e.onGround ? 2 : 0;
    R.spr(S.crown, e.x + 7, e.y - 5 + bob);

    if (e.invuln > 0 && Math.floor(e.frame / 4) % 2 === 0) {
      DS.Map.glow(R, Ent.centerX(e), Ent.centerY(e), 40, 'rgba(255,255,255,0.12)');
    }
  }

  DS.Boss = { create: create, update: update, draw: draw };
})(window.DS);
