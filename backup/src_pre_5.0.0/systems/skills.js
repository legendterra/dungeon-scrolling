/* Weapon skills. Every archetype has two, and both scale with the weapon's
   rarity — a legendary skill throws more, reaches further and inherits the
   weapon's own enchant procs.

     E  skill     cheap, short cooldown, the bread and butter
     X  ultimate  expensive, long cooldown, the run-saver

   Multi-frame skills install a routine on the player that ticks each frame
   until it expires, which keeps timing logic out of the main update. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const W = DS.Weapons;

  const SKILL_COST = 25;
  const ULT_COST = 60;
  const SKILL_COOLDOWN = 100;
  const ULT_COOLDOWN = 620;

  // How much stronger a skill gets per rarity step, and how many extra
  // projectiles/hits the higher tiers add on top.
  function power(item) { return 1 + item.rarity * 0.26; }

  // Skills inherit the player's global damage bonuses just like normal hits.
  function scaled(g, p, item, base) {
    return item.stats.damage * base * power(item) * DS.Player.damageMult(g, p);
  }
  function extra(item) { return Math.floor(item.rarity / 2); }

  const DEFS = {
    sword:    { skill: 'STAR BLADE DASH',       ult: 'STARFALL TEMPEST' },
    dagger:   { skill: 'PHANTOM FLURRY',        ult: 'PHANTOM FLASH' },
    greataxe: { skill: 'MEGA SLAM',             ult: 'RAGNAROK SPIKES' },
    spear:    { skill: 'DRAGON PIERCER',        ult: 'DRAGON COMET' },
    bow:      { skill: 'SHOOTING STAR VOLLEY',  ult: 'SUPERNOVA ARROW' },
    staff:    { skill: 'BOUNCY BUBBLE NOVA',    ult: 'COSMIC CATACLYSM' }
  };

  function names(item) { return DEFS[item.type] || DEFS.sword; }

  // --- shared helpers -------------------------------------------------------

  /* Damage everything inside a world-space box. `hits` remembers who has
     already been struck so a multi-frame sweep cannot double-dip per tick. */
  function sweep(g, box, damage, opts, hits) {
    let any = false;
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;
      if (hits && hits.indexOf(e) >= 0) continue;
      if (!M.rectsOverlap(box.x, box.y, box.w, box.h, e.x, e.y, e.w, e.h)) continue;
      if (hits) hits.push(e);
      Ent.damageEnemy(g, e, damage, opts);
      any = true;
    }
    return any;
  }

  function radial(g, x, y, radius, damage, opts, hits) {
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;
      if (hits && hits.indexOf(e) >= 0) continue;
      if (M.dist(x, y, Ent.centerX(e), Ent.centerY(e)) > radius) continue;
      if (hits) hits.push(e);
      Ent.damageEnemy(g, e, damage, Object.assign({
        dir: M.sign(Ent.centerX(e) - x) || 1
      }, opts));
    }
  }

  function elementColor(item) {
    return item.element ? W.ELEMENTS[item.element].color : '#a8e4ff';
  }

  function nearestEnemies(g, x, y, count, range) {
    const list = g.enemies.filter(function (e) {
      return !e.dead && M.dist(x, y, Ent.centerX(e), Ent.centerY(e)) < range;
    });
    list.sort(function (a, b) {
      return M.dist(x, y, Ent.centerX(a), Ent.centerY(a)) -
             M.dist(x, y, Ent.centerX(b), Ent.centerY(b));
    });
    return list.slice(0, count);
  }

  // --- skills ---------------------------------------------------------------

  const SKILLS = {

    sword: function (g, p, item) {
      const hits = [];
      const dmg = scaled(g, p, item, 1.7);
      // STAR BLADE DASH: constellation burst at launch
      DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 12, '#fff0a8', 2.4);
      DS.FX.star(Ent.centerX(p), Ent.centerY(p), 5, 'star');
      routine(p, 16, function (gg, pp, frame) {
        pp.vx = pp.facing * 4.6;
        pp.vy = 0;
        pp.iframes = Math.max(pp.iframes, 2);
        DS.Phys.moveX(pp, gg.map, pp.vx);
        DS.FX.trail(Ent.centerX(pp), Ent.centerY(pp), '#ffd56b');
        if (frame % 2 === 0) {
          DS.FX.star(Ent.centerX(pp), Ent.centerY(pp), 1, 'star');
          DS.FX.shaped('spark', 'holy', Ent.centerX(pp) - pp.facing * 6,
                       Ent.centerY(pp), 2,
                       { angle: pp.facing > 0 ? Math.PI : 0, spread: 0.5,
                         speed: 1.6, life: 10, jitter: 3 });
        }
        if (frame % 4 === 0) {
          DS.FX.burst(Ent.centerX(pp) - pp.facing * 8, Ent.centerY(pp),
                     3, ['#fff0a8', '#ffffff'], { speed: 1.2, life: 10, grav: 0 });
        }
        sweep(gg, { x: pp.x - 6, y: pp.y - 3, w: pp.w + 12, h: pp.h + 6 },
              dmg, { dir: pp.facing, knockback: 3, procs: item.procs, crit: true }, hits);
        if (frame % 4 === 0) {
          DS.R.arc(Ent.centerX(pp), Ent.centerY(pp), 12, -1.2, 1.2, '#ffffff', 2, pp.facing < 0);
        }
      });
      DS.Audio.play('dash');
      DS.R.shake(3);
    },

    dagger: function (g, p, item) {
      const dmg = scaled(g, p, item, 0.75);
      const strikes = 5 + extra(item) * 2;
      let done = 0;
      const COMICS = ['BAM!', 'POW!', 'ZAP!', 'HIT!'];
      routine(p, strikes * 5, function (gg, pp, frame) {
        pp.vx *= 0.7;
        if (frame % 5 !== 0 || done >= strikes) return;
        done++;
        const ox = pp.facing > 0 ? pp.x + pp.w - 4 : pp.x - 18;
        sweep(gg, { x: ox, y: pp.y - 2, w: 22, h: pp.h + 4 }, dmg,
              { dir: pp.facing, knockback: 0.8, procs: item.procs,
                crit: DS.rand.chance(0.5) }, null);
        // PHANTOM FLURRY: shadow poof + comic BAM!/POW! text
        DS.FX.shaped('spark', 'dark', ox + 11, Ent.centerY(pp), 3,
                     { speed: 1.7, life: 10, jitter: 3 });
        DS.FX.pop(ox + 11, Ent.centerY(pp), '#ff99c8');
        DS.FX.number(ox + 11, pp.y - 8 - done * 2,
                     COMICS[done % COMICS.length], '#ffd56b', 1.5);
        if (frame % 10 === 0) DS.FX.pop(ox + 11, Ent.centerY(pp), '#ff99c8');
        DS.FX.burst(ox + 11, Ent.centerY(pp), 3, ['#ffffff', '#c86ee0'],
                    { speed: 1.6, life: 8, grav: 0 });
        DS.Audio.play('swing');
      });
    },

    greataxe: function (g, p, item) {
      const dmg = scaled(g, p, item, 2.2);
      p.vy = -3.4;
      routine(p, 34, function (gg, pp, frame) {
        if (!pp.onGround || frame < 4) return;
        // Lands once, then the routine ends itself.
        radial(gg, Ent.centerX(pp), Ent.centerY(pp), 46 + extra(item) * 10, dmg,
               { knockback: 5, procs: item.procs, crit: true }, []);
        // MEGA SLAM: comic ground crack + orbiting dizzy stars
        DS.FX.ring(Ent.centerX(pp), pp.y + pp.h, 22, '#f2c14e', 2.6);
        DS.FX.star(Ent.centerX(pp), pp.y - 8, 5, 'star');
        DS.FX.ring(Ent.centerX(pp), pp.y + pp.h, 32, '#e8a05a', 1.8);
        DS.FX.star(Ent.centerX(pp), pp.y - 8, 8, 'star');
        DS.FX.element('earth', Ent.centerX(pp), pp.y + pp.h, { count: 14, power: 1.7 });
        DS.FX.dust(Ent.centerX(pp), pp.y + pp.h, 18);
        // Orbiting dizzy stars around hero
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * Math.PI * 2;
          DS.FX.burst(Ent.centerX(pp) + Math.cos(a) * 16,
                      Ent.centerY(pp) + Math.sin(a) * 10,
                      2, ['#ffd56b', '#ffffff'], { speed: 0.4, life: 22, grav: 0 });
        }
        DS.Audio.play('slam');
        DS.R.shake(7);
        shockwaves(gg, pp, dmg * 0.6, item, 1 + extra(item));
        pp.routine = null;
      });
    },

    spear: function (g, p, item) {
      const hits = [];
      const dmg = scaled(g, p, item, 1.9);
      // DRAGON PIERCER: spiraling dragon spirit aura & flaming motes
      DS.FX.element('fire', Ent.centerX(p), Ent.centerY(p), { count: 8, power: 1.2 });
      DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 16, '#f97316', 2.5);
      DS.FX.spark(Ent.centerX(p), Ent.centerY(p), 4, '#ffedd5');

      routine(p, 18, function (gg, pp, frame) {
        pp.vx = pp.facing * 3.2;
        pp.vy = 0;
        DS.Phys.moveX(pp, gg.map, pp.vx);
        const reach = 40 + extra(item) * 8;
        const ox = pp.facing > 0 ? pp.x + pp.w : pp.x - reach;
        sweep(gg, { x: ox, y: pp.y + 2, w: reach, h: 10 }, dmg,
              { dir: pp.facing, knockback: 2.6, procs: Object.assign({ pierce: true }, item.procs) },
              hits);

        // Spiraling flame thrust trail instead of flat line
        if (frame % 2 === 0) {
          const fxX = Ent.centerX(pp) + pp.facing * reach * (frame / 18);
          DS.FX.shaped('spark', 'holy', fxX, Ent.centerY(pp), 3,
                       { angle: pp.facing > 0 ? 0 : Math.PI, spread: 0.35,
                         speed: 2.6, life: 10, jitter: 2 });
          DS.FX.element('fire', fxX, Ent.centerY(pp), { count: 2, power: 1.0 });
        }
      });
      DS.Audio.play('swing');
    },

    bow: function (g, p, item) {
      const shots = 5 + extra(item) * 2;
      const dmg = scaled(g, p, item, 0.85);
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * 0.16;
        Ent.spawnProjectile(g, {
          x: Ent.centerX(p) + p.facing * 6, y: Ent.centerY(p) - 2,
          vx: p.facing * 4.2, vy: spread * 4 - 1.2,
          damage: dmg, friendly: true, kind: 'arrow', procs: item.procs,
          gravity: 0.05, life: 150, knockback: 1.2, w: 8, h: 3,
          pierce: item.rarity >= 3 ? 1 : 0,
          trailColor: '#ffd56b'
        });
        // Each arrow gets a golden star shimmer
        if (i % 2 === 0) {
          DS.FX.burst(Ent.centerX(p) + p.facing * 6, Ent.centerY(p) - 2,
                      2, ['#fff0a8', '#ffd56b'], { speed: 0.8, life: 10, grav: -0.04 });
        }
      }
      // SHOOTING STAR VOLLEY: golden ring at launch
      DS.FX.ring(Ent.centerX(p) + p.facing * 12, Ent.centerY(p) - 2, 8, '#ffd56b', 2.0);
      DS.FX.shaped('spark', 'holy', Ent.centerX(p) + p.facing * 8,
                   Ent.centerY(p) - 2, 5,
                   { angle: p.facing > 0 ? 0 : Math.PI, spread: 0.6,
                     speed: 2.4, life: 12, jitter: 3 });
      DS.Audio.play('shoot');
    },

    staff: function (g, p, item) {
      const orbs = 10 + extra(item) * 2;
      const dmg = scaled(g, p, item, 1.25);
      const isWater = !item.element || item.element === 'water';
      const col = isWater ? '#38bdf8' : elementColor(item);
      const splashCols = isWater ? ['#38bdf8', '#7dd3fc', '#ffffff', '#0284c7'] : [col, '#ffffff'];

      // HYDRO VORTEX NOVA: cascading water splash ring & foaming bubble bursts
      DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 26, col, 3.2);
      DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 16, '#ffffff', 2.0);
      DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 8, isWater ? '#0284c7' : col, 1.5);
      DS.FX.burst(Ent.centerX(p), Ent.centerY(p), 12, splashCols, { speed: 2.8, life: 18, grav: 0.05 });
      DS.FX.pop(Ent.centerX(p), Ent.centerY(p), col);

      for (let i = 0; i < orbs; i++) {
        const a = (i / orbs) * Math.PI * 2;
        Ent.spawnProjectile(g, {
          x: Ent.centerX(p), y: Ent.centerY(p),
          vx: Math.cos(a) * 2.8, vy: Math.sin(a) * 2.8,
          damage: dmg, friendly: true, kind: 'orb', element: item.element || 'water',
          procs: item.procs, gravity: 0, life: 95, knockback: 1.6, w: 7, h: 7,
          trailColor: col
        });
        DS.FX.pop(Ent.centerX(p) + Math.cos(a) * 12,
                  Ent.centerY(p) + Math.sin(a) * 10,
                  col);
      }
      if (item.element) {
        DS.FX.element(item.element, Ent.centerX(p), Ent.centerY(p),
                      { count: 14, power: 1.5 });
      }
      DS.Audio.play('cast');
      DS.R.shake(2);
    }
  };

  function shockwaves(g, p, damage, item, count) {
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < count; i++) {
        Ent.spawnProjectile(g, {
          x: Ent.centerX(p) + side * (10 + i * 6), y: p.y + p.h - 8,
          vx: side * (2.2 + i * 0.3), vy: 0, gravity: 0,
          damage: damage, friendly: true, kind: 'orb', element: item.element,
          procs: item.procs, life: 70, knockback: 2.4, w: 8, h: 8,
          trailColor: '#f2c14e'
        });
      }
    }
  }

  // --- ultimates ------------------------------------------------------------

  const ULTS = {

    sword: function (g, p, item) {
      const dmg = scaled(g, p, item, 1.5);
      const slashes = 6 + extra(item) * 2;
      let done = 0;
      routine(p, slashes * 9, function (gg, pp, frame) {
        pp.vx *= 0.85;
        pp.iframes = Math.max(pp.iframes, 3);
        if (frame % 9 !== 0 || done >= slashes) return;
        done++;
        const side = done % 2 === 0 ? 1 : -1;
        radial(gg, Ent.centerX(pp), Ent.centerY(pp), 40, dmg,
               { knockback: 2.4, procs: item.procs, crit: DS.rand.chance(0.6) }, []);
        DS.R.arc(Ent.centerX(pp), Ent.centerY(pp), 22, -1.5, 1.5, '#ffffff', 3, side < 0);
        DS.FX.ring(Ent.centerX(pp), Ent.centerY(pp), 10, '#ffffff', 2.4);
        // STARFALL TEMPEST: rainbow starburst per slash
        DS.FX.star(Ent.centerX(pp), Ent.centerY(pp), 4, 'star');
        DS.FX.shaped('spark', 'holy', Ent.centerX(pp), Ent.centerY(pp), 8,
                     { speed: 3.0, life: 15, jitter: 6, spin: 0.25 });
        DS.FX.burst(Ent.centerX(pp), Ent.centerY(pp),
                    4, ['#fff0a8', '#c86ee0', '#a8e4ff'],
                    { speed: 2.2, life: 14, grav: 0 });
        DS.Audio.play('swing');
        DS.R.shake(2);
      });
    },

    dagger: function (g, p, item) {
      const targets = nearestEnemies(g, Ent.centerX(p), Ent.centerY(p),
                                     3 + extra(item), 150);
      const dmg = scaled(g, p, item, 4.5);
      if (!targets.length) { DS.Audio.play('error'); return false; }

      let index = 0;
      routine(p, targets.length * 12, function (gg, pp, frame) {
        pp.vx = 0; pp.vy = 0;
        pp.iframes = Math.max(pp.iframes, 12);
        if (frame % 12 !== 0 || index >= targets.length) return;
        const target = targets[index++];
        if (target.dead) return;
        // Blink behind the target and strike.
        pp.x = Ent.centerX(target) - pp.w / 2;
        pp.y = target.y + target.h - pp.h;
        // PHANTOM FLASH: white flash + shadow implosion
        DS.R.flash('#ffffff', 3);
        DS.FX.shaped('spark', 'dark', Ent.centerX(pp), Ent.centerY(pp), 10,
                     { speed: 2.4, life: 18, jitter: 5, spin: 0.16 });
        DS.FX.burst(Ent.centerX(pp), Ent.centerY(pp), 8, ['#ffffff', '#c86ee0', '#ffd56b'],
                    { speed: 2.4, life: 16, grav: 0 });
        DS.FX.ring(Ent.centerX(pp), Ent.centerY(pp), 8, '#c86ee0', 2.2);
        Ent.damageEnemy(gg, target, dmg, {
          crit: true, knockback: 3, dir: pp.facing, procs: item.procs
        });
        DS.Audio.play('crit');
        DS.R.shake(4);
      });
      return true;
    },

    greataxe: function (g, p, item) {
      const dmg = scaled(g, p, item, 3.0);
      let wave = 0;
      routine(p, 90, function (gg, pp, frame) {
        pp.vx *= 0.8;
        if (frame % 26 !== 0 || wave >= 3 + extra(item)) return;
        wave++;
        radial(gg, Ent.centerX(pp), Ent.centerY(pp), 60 + wave * 8, dmg,
               { knockback: 6, procs: item.procs, crit: true }, []);
        // RAGNAROK SPIKES: each wave erupts rock pillars + fire
        DS.FX.ring(Ent.centerX(pp), pp.y + pp.h, 26 + wave * 6, '#e8743b', 3.2);
        DS.FX.element('earth', Ent.centerX(pp), pp.y + pp.h, { count: 14, power: 1.8 });
        DS.FX.element('fire', Ent.centerX(pp), pp.y + pp.h - 4, { count: 10, power: 1.4 });
        DS.FX.star(Ent.centerX(pp), pp.y - 6, 4, 'star');
        shockwaves(gg, pp, dmg * 0.5, item, 2);
        DS.Audio.play('slam');
        DS.R.shake(9);
      });
    },

    spear: function (g, p, item) {
      const hits = [];
      const dmg = scaled(g, p, item, 3.2);
      // DRAGON COMET: arc upward then drill forward
      p.vy = -2.8;
      routine(p, 40, function (gg, pp) {
        pp.vx = pp.facing * 5.4;
        pp.vy = Math.min(pp.vy + 0.18, 2.0);
        pp.iframes = Math.max(pp.iframes, 4);
        DS.Phys.moveX(pp, gg.map, pp.vx);
        DS.FX.trail(Ent.centerX(pp), Ent.centerY(pp), '#a8e4ff');
        DS.FX.element('fire', Ent.centerX(pp) - pp.facing * 8, Ent.centerY(pp),
                      { count: 2, power: 1.0 });
        DS.FX.burst(Ent.centerX(pp) - pp.facing * 4, Ent.centerY(pp),
                    2, ['#a8e4ff', '#ffffff'], { speed: 1.2, life: 10, grav: 0 });
        sweep(gg, { x: pp.x - 10, y: pp.y - 4, w: pp.w + 20, h: pp.h + 8 }, dmg,
              { dir: pp.facing, knockback: 4,
                procs: Object.assign({ pierce: true }, item.procs), crit: true }, hits);
      });
      DS.Audio.play('dash');
      DS.R.shake(5);
    },

    bow: function (g, p, item) {
      const volleys = 14 + extra(item) * 4;
      const dmg = scaled(g, p, item, 1.2);
      let fired = 0;
      routine(p, volleys * 4, function (gg, pp, frame) {
        pp.vx *= 0.9;
        if (frame % 4 !== 0 || fired >= volleys) return;
        fired++;
        const ox = Ent.centerX(pp) + pp.facing * DS.rand.float(8, 120);
        Ent.spawnProjectile(gg, {
          x: ox, y: DS.R.camOffsetY() - 8,
          vx: DS.rand.float(-0.3, 0.3), vy: 3.4, gravity: 0.06,
          damage: dmg, friendly: true, kind: 'arrow', procs: item.procs,
          life: 180, knockback: 1.4, w: 3, h: 8, pierce: 1,
          trailColor: '#ffd56b'
        });
        // SUPERNOVA ARROW: firework blossom per cluster
        if (fired % 3 === 0) {
          DS.FX.ring(ox, DS.R.camOffsetY() + 8, 6, '#ffd56b', 1.4);
          DS.FX.burst(ox, DS.R.camOffsetY() + 8,
                      5, ['#fff0a8', '#e8743b', '#ffffff'],
                      { speed: 1.8, life: 14, grav: 0.02 });
        }
        if (fired % 4 === 0) {
          DS.FX.element('lightning', ox, DS.R.camOffsetY() + 10, { count: 2, power: 1.1 });
        }
        if (fired % 3 === 0) DS.Audio.play('shoot');
      });
    },

    staff: function (g, p, item) {
      const dmg = scaled(g, p, item, 1.5);
      const total = 18 + extra(item) * 4;
      const isWater = !item.element || item.element === 'water';
      const col = isWater ? '#38bdf8' : elementColor(item);
      const splashCols = isWater ? ['#38bdf8', '#bae6fd', '#ffffff', '#0284c7'] : [col, '#ffd56b', '#ffffff'];
      let fired = 0;

      // TIDAL MAELSTROM: swirling vortex ripples & explosive splash
      DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 34, col, 3.8);
      DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 20, '#ffffff', 2.6);
      DS.FX.burst(Ent.centerX(p), Ent.centerY(p), 16, splashCols, { speed: 3.2, life: 24, grav: 0.04 });
      DS.R.shake(5);

      if (item.element) {
        DS.FX.element(item.element, Ent.centerX(p), Ent.centerY(p),
                      { count: 18, power: 1.8 });
      }
      routine(p, 72, function (gg, pp, frame) {
        pp.vx *= 0.9;
        if (frame % 4 !== 0 || fired >= total) return;
        const a = (fired / total) * Math.PI * 6;
        fired++;
        Ent.spawnProjectile(gg, {
          x: Ent.centerX(pp), y: Ent.centerY(pp),
          vx: Math.cos(a) * 3.0, vy: Math.sin(a) * 3.0,
          damage: dmg, friendly: true, kind: 'orb', element: item.element || 'water',
          procs: item.procs, gravity: 0, life: 115, knockback: 1.6, w: 7, h: 7,
          trailColor: col
        });
        if (fired % 3 === 0) {
          DS.FX.pop(Ent.centerX(pp), Ent.centerY(pp), col);
          DS.FX.ring(Ent.centerX(pp), Ent.centerY(pp),
                     6 + (fired / total) * 14, '#ffffff', 1.4);
          DS.FX.burst(Ent.centerX(pp), Ent.centerY(pp), 4, splashCols, { speed: 1.8, life: 14, grav: 0.02 });
          DS.Audio.play('cast');
        }
      });
    }
  };

  // --- plumbing -------------------------------------------------------------

  function routine(p, frames, tick) {
    p.routine = { frames: frames, elapsed: 0, tick: tick };
  }

  function updateRoutine(g, p) {
    const r = p.routine;
    if (!r) return false;
    r.tick(g, p, r.elapsed);
    r.elapsed++;
    if (p.routine === r && r.elapsed >= r.frames) p.routine = null;
    return true;
  }

  function ready(p, which) {
    const cd = which === 'ult' ? p.ultCooldown : p.skillCooldown;
    return cd <= 0 && !p.routine;
  }

  function use(g, p, which) {
    const item = DS.Inv.weapon(p.inv);
    if (!item) return false;
    if (!ready(p, which)) { DS.Audio.play('error'); return false; }

    const discount = 1 - (p.stats.skillDiscount || 0);
    const cost = Math.round((which === 'ult' ? ULT_COST : SKILL_COST) * discount);
    if (p.mana < cost) {
      DS.Audio.play('error');
      g.toast('NOT ENOUGH MANA', '#4fb3e0');
      return false;
    }

    const fn = (which === 'ult' ? ULTS : SKILLS)[item.type];
    if (!fn) return false;

    p.mana -= cost;
    const result = fn(g, p, item);
    if (result === false) { p.mana += cost; return false; }

    if (which === 'ult') p.ultCooldown = ULT_COOLDOWN;
    else p.skillCooldown = SKILL_COOLDOWN;

    g.toast(which === 'ult' ? names(item).ult : names(item).skill,
            W.rarityColor(item.rarity));
    return true;
  }

  DS.Skills = {
    SKILL_COST: SKILL_COST,
    ULT_COST: ULT_COST,
    SKILL_COOLDOWN: SKILL_COOLDOWN,
    ULT_COOLDOWN: ULT_COOLDOWN,
    names: names,
    use: use,
    ready: ready,
    updateRoutine: updateRoutine
  };
})(window.DS);
