/* Elements, status effects, ground fields, and elemental reactions.

   Every element does three things:
     1. its own status on the target        (burn, freeze, shock, ...)
     2. its own ground field where it lands (fire patch, poison mist, puddle)
     3. a reaction when it meets a different element already on a target

   Reactions are the point. A lightning bolt into a wet enemy is not a bolt plus
   a splash — it is an ELECTROCUTE that jumps to every wet enemy on the floor.
   Fields react with each other too: fire dropped into a puddle becomes steam. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const T = DS.C.TILE;

  const ELEMENTS = {
    fire: {
      key: 'fire', label: 'Fire', color: '#e8743b', spark: ['#e8743b', '#f2c14e', '#fff0a8'],
      sfx: 'fire', field: 'fire'
    },
    ice: {
      key: 'ice', label: 'Ice', color: '#4fb3e0', spark: ['#a8e4ff', '#4fb3e0', '#ffffff'],
      sfx: 'ice', field: 'ice'
    },
    lightning: {
      key: 'lightning', label: 'Lightning', color: '#f2c14e', spark: ['#fff0a8', '#f2c14e', '#ffffff'],
      sfx: 'lightning', field: null
    },
    poison: {
      key: 'poison', label: 'Poison', color: '#5cbf62', spark: ['#5cbf62', '#a3e86b', '#2f7d4f'],
      sfx: 'cast', field: 'poison'
    },
    water: {
      key: 'water', label: 'Water', color: '#2f6fa8', spark: ['#4fb3e0', '#a8e4ff', '#2f6fa8'],
      sfx: 'ice', field: 'water'
    },
    earth: {
      key: 'earth', label: 'Earth', color: '#b98d5c', spark: ['#b98d5c', '#8a6340', '#5c3f2a'],
      sfx: 'slam', field: null
    },
    leaf: {
      key: 'leaf', label: 'Leaf', color: '#a3e86b', spark: ['#a3e86b', '#5cbf62', '#2f7d4f'],
      sfx: 'swing', field: 'leaf'
    }
  };

  const KEYS = Object.keys(ELEMENTS);

  // How long an applied element stays on a target as a reactable aura.
  const AURA_FRAMES = 200;

  // --- status application ---------------------------------------------------

  function ensureStatus(e) {
    if (!e.status) e.status = {};
    const s = e.status;
    if (s.burn === undefined) s.burn = 0;
    if (s.chill === undefined) s.chill = 0;
    return s;
  }

  /* Put an element on a target. If a *different* element is already on it, the
     pair reacts instead and both auras are consumed. */
  function apply(g, target, element, power, opts) {
    if (!ELEMENTS[element] || !target || target.dead) return null;
    opts = opts || {};
    const s = ensureStatus(target);

    const existing = target.aura && target.aura.frames > 0 ? target.aura.element : null;

    if (existing && existing !== element) {
      const reaction = react(g, target, existing, element, power);
      target.aura = null;
      return reaction;
    }

    target.aura = { element: element, frames: AURA_FRAMES };
    baseEffect(g, target, element, power);
    if (ELEMENTS[element].field && !opts.noField) {
      spawnField(g, DS.Ent.centerX(target), target.y + target.h, element, power);
    }
    return null;
  }

  function baseEffect(g, e, element, power) {
    const s = e.status;

    if (element === 'fire') {
      s.burn = 150;
      s.burnTick = 22;
      s.burnDamage = Math.max(1, Math.round(power * 0.16));

    } else if (element === 'ice') {
      s.chill = 140;
      s.chillSlow = 0.45;
      s.chillStacks = (s.chillStacks || 0) + 1;
      // Three chills lock the target solid.
      if (s.chillStacks >= 3) {
        s.chillStacks = 0;
        freeze(g, e, 100);
      }

    } else if (element === 'lightning') {
      s.shock = 34;
      arc(g, e, power * 0.45, 2);

    } else if (element === 'poison') {
      s.poison = 240;
      s.poisonTick = 30;
      s.poisonDamage = Math.max(1, Math.round(power * 0.12));

    } else if (element === 'water') {
      s.wet = 260;
      s.chillSlow = 0.15;

    } else if (element === 'earth') {
      s.brittle = 300;          // armour cracked open
      e.vy = Math.min(e.vy, -2.2);
      DS.FX.burst(DS.Ent.centerX(e), e.y + e.h, 10, ELEMENTS.earth.spark,
                  { speed: 2, life: 22, grav: 0.3 });

    } else if (element === 'leaf') {
      s.root = 90;
      DS.FX.burst(DS.Ent.centerX(e), e.y + e.h, 8, ELEMENTS.leaf.spark,
                  { speed: 1.2, life: 26, grav: -0.02 });
    }

    DS.FX.burst(DS.Ent.centerX(e), DS.Ent.centerY(e), 6, ELEMENTS[element].spark,
                { speed: 1.4, life: 14, grav: 0.02 });
  }

  function freeze(g, e, frames) {
    e.status.frozen = frames;
    e.status.chill = Math.max(e.status.chill, frames);
    e.vx = 0;
    DS.Audio.play('ice');
    DS.FX.ring(DS.Ent.centerX(e), DS.Ent.centerY(e), 10, '#a8e4ff', 1.6);
  }

  /* Lightning jumps. Drawn as a real jagged bolt between the two bodies rather
     than a generic ring, so chains read at a glance. */
  function arc(g, from, damage, count) {
    const hits = [];
    for (let i = 0; i < g.enemies.length && hits.length < count; i++) {
      const other = g.enemies[i];
      if (other === from || other.dead) continue;
      if (M.dist(DS.Ent.centerX(from), DS.Ent.centerY(from),
                 DS.Ent.centerX(other), DS.Ent.centerY(other)) > 64) continue;
      hits.push(other);
    }
    for (let i = 0; i < hits.length; i++) {
      addBolt(g, from, hits[i]);
      hits[i].status = hits[i].status || {};
      hits[i].status.shock = 26;
      DS.Ent.damageEnemy(g, hits[i], damage, { dir: 1, knockback: 0.6, isChain: true });
    }
    if (hits.length) DS.Audio.play('lightning');
  }

  function addBolt(g, a, b) {
    if (!g.bolts) g.bolts = [];
    g.bolts.push({
      x1: DS.Ent.centerX(a), y1: DS.Ent.centerY(a),
      x2: DS.Ent.centerX(b), y2: DS.Ent.centerY(b),
      life: 10, color: '#fff0a8'
    });
  }

  // A bolt that falls from off-screen onto a target — the "called down" look.
  function strikeDown(g, x, y, color) {
    if (!g.bolts) g.bolts = [];
    g.bolts.push({ x1: x, y1: y - 120, x2: x, y2: y, life: 12, color: color || '#fff0a8' });
  }

  // --- reactions ------------------------------------------------------------

  function pairKey(a, b) { return [a, b].sort().join('|'); }

  const REACTIONS = {

    'lightning|water': {
      name: 'ELECTROCUTE', color: '#a8e4ff',
      run: function (g, e, power) {
        // Every wet enemy on the floor takes it, not just this one.
        strikeDown(g, DS.Ent.centerX(e), DS.Ent.centerY(e), '#a8e4ff');
        const targets = g.enemies.filter(function (o) {
          return !o.dead && (o === e || (o.status && o.status.wet > 0));
        });
        targets.forEach(function (o) {
          addBolt(g, e, o);
          o.status.shock = 70;
          DS.Ent.damageEnemy(g, o, power * 1.5, { dir: 1, knockback: 1.4, crit: true });
        });
        DS.R.flash('#a8e4ff', 8);
        DS.R.shake(4);
      }
    },

    'ice|water': {
      name: 'DEEP FREEZE', color: '#a8e4ff',
      run: function (g, e, power) {
        freeze(g, e, 200);
        e.status.deepFrozen = 200;   // takes extra damage while locked
        DS.Ent.damageEnemy(g, e, power * 0.8, { dir: 1, knockback: 0 });
      }
    },

    'fire|water': {
      name: 'STEAM', color: '#d8d5e8',
      run: function (g, e, power) {
        spawnField(g, DS.Ent.centerX(e), DS.Ent.centerY(e), 'steam', power);
        DS.Ent.damageEnemy(g, e, power * 0.9, { dir: 1, knockback: 1 });
      }
    },

    'fire|ice': {
      name: 'SHATTER', color: '#ffffff',
      run: function (g, e, power) {
        // Thermal shock: one big hit, both statuses wiped.
        e.status.chill = 0; e.status.burn = 0; e.status.frozen = 0;
        DS.Ent.damageEnemy(g, e, power * 2.4, { dir: 1, knockback: 3.5, crit: true });
        DS.FX.burst(DS.Ent.centerX(e), DS.Ent.centerY(e), 20,
                    ['#ffffff', '#a8e4ff', '#e8743b'], { speed: 3, life: 22 });
        DS.R.shake(5);
      }
    },

    'fire|poison': {
      name: 'TOXIC BLAST', color: '#a3e86b',
      run: function (g, e, power) {
        radial(g, DS.Ent.centerX(e), DS.Ent.centerY(e), 48, power * 1.3);
        spawnField(g, DS.Ent.centerX(e), DS.Ent.centerY(e), 'poison', power * 1.6);
        DS.R.shake(5);
        DS.Audio.play('fire');
      }
    },

    'fire|leaf': {
      name: 'WILDFIRE', color: '#e8743b',
      run: function (g, e, power) {
        const f = spawnField(g, DS.Ent.centerX(e), e.y + e.h, 'fire', power * 1.4);
        if (f) { f.spread = 0.5; f.maxR = 70; }
        DS.Ent.damageEnemy(g, e, power * 0.8, { dir: 1, knockback: 0 });
      }
    },

    'earth|lightning': {
      name: 'CONDUCT', color: '#f2c14e',
      run: function (g, e, power) {
        // Travels along the ground: everything standing gets stunned.
        g.enemies.forEach(function (o) {
          if (o.dead || !o.onGround) return;
          if (Math.abs(DS.Ent.centerX(o) - DS.Ent.centerX(e)) > 90) return;
          o.status = o.status || {};
          o.status.shock = 60;
          DS.Ent.damageEnemy(g, o, power * 0.9, { dir: 1, knockback: 1 });
        });
        DS.FX.ring(DS.Ent.centerX(e), e.y + e.h, 26, '#f2c14e', 3);
        DS.R.shake(6);
      }
    },

    'earth|ice': {
      name: 'PERMAFROST', color: '#a8e4ff',
      run: function (g, e, power) {
        const f = spawnField(g, DS.Ent.centerX(e), e.y + e.h, 'ice', power);
        if (f) f.r = 48;
        freeze(g, e, 120);
      }
    },

    'poison|water': {
      name: 'CONTAGION', color: '#5cbf62',
      run: function (g, e, power) {
        // Poison hops to everything nearby and re-applies itself.
        g.enemies.forEach(function (o) {
          if (o.dead) return;
          if (M.dist(DS.Ent.centerX(e), DS.Ent.centerY(e),
                     DS.Ent.centerX(o), DS.Ent.centerY(o)) > 70) return;
          o.status = o.status || {};
          o.status.poison = 300;
          o.status.poisonTick = 24;
          o.status.poisonDamage = Math.max(1, Math.round(power * 0.14));
        });
        spawnField(g, DS.Ent.centerX(e), DS.Ent.centerY(e), 'poison', power * 1.4);
      }
    },

    'earth|leaf': {
      name: 'OVERGROWTH', color: '#a3e86b',
      run: function (g, e, power) {
        g.enemies.forEach(function (o) {
          if (o.dead) return;
          if (M.dist(DS.Ent.centerX(e), DS.Ent.centerY(e),
                     DS.Ent.centerX(o), DS.Ent.centerY(o)) > 64) return;
          o.status = o.status || {};
          o.status.root = 150;
          DS.Ent.damageEnemy(g, o, power * 0.7, { dir: 1, knockback: 0 });
        });
        DS.FX.ring(DS.Ent.centerX(e), e.y + e.h, 20, '#a3e86b', 2.2);
      }
    },

    'ice|lightning': {
      name: 'SUPERCONDUCT', color: '#a89bff',
      run: function (g, e, power) {
        // Strips armour off everything close by.
        g.enemies.forEach(function (o) {
          if (o.dead) return;
          if (M.dist(DS.Ent.centerX(e), DS.Ent.centerY(e),
                     DS.Ent.centerX(o), DS.Ent.centerY(o)) > 72) return;
          o.status = o.status || {};
          o.status.brittle = 300;
        });
        DS.Ent.damageEnemy(g, e, power * 1.4, { dir: 1, knockback: 2, crit: true });
        DS.FX.ring(DS.Ent.centerX(e), DS.Ent.centerY(e), 18, '#a89bff', 2.6);
      }
    },

    'earth|fire': {
      name: 'MAGMA', color: '#e8743b',
      run: function (g, e, power) {
        const f = spawnField(g, DS.Ent.centerX(e), e.y + e.h, 'fire', power * 1.8);
        if (f) { f.r = 40; f.life = f.maxLife = 420; }
        radial(g, DS.Ent.centerX(e), e.y + e.h, 40, power);
        DS.R.shake(5);
      }
    },

    'leaf|water': {
      name: 'BLOOM', color: '#a3e86b',
      run: function (g, e, power) {
        // The one friendly reaction: it heals you.
        const p = g.player;
        if (p && p.hp < p.stats.maxHp) {
          p.hp++;
          DS.FX.number(DS.Ent.centerX(p), p.y - 4, '+1', '#5cbf62');
          DS.Audio.play('heal');
        }
        e.status.root = 120;
        DS.Ent.damageEnemy(g, e, power * 0.6, { dir: 1, knockback: 0 });
      }
    },

    'leaf|poison': {
      name: 'BLIGHT', color: '#2f7d4f',
      run: function (g, e, power) {
        e.status.poison = 400;
        e.status.poisonTick = 16;
        e.status.poisonDamage = Math.max(2, Math.round(power * 0.2));
        e.status.root = 90;
      }
    },

    'leaf|lightning': {
      name: 'BRUSHFIRE', color: '#f2c14e',
      run: function (g, e, power) {
        spawnField(g, DS.Ent.centerX(e), e.y + e.h, 'fire', power);
        e.status.shock = 45;
        DS.Ent.damageEnemy(g, e, power, { dir: 1, knockback: 1 });
      }
    }
  };

  function react(g, e, a, b, power) {
    const def = REACTIONS[pairKey(a, b)];
    if (!def) {
      baseEffect(g, e, b, power);
      return null;
    }

    def.run(g, e, power);
    DS.FX.number(DS.Ent.centerX(e), e.y - 10, def.name, def.color);
    DS.FX.ring(DS.Ent.centerX(e), DS.Ent.centerY(e), 12, def.color, 2);
    DS.Audio.play('upgrade');
    if (g.onReaction) g.onReaction(def);
    return def;
  }

  function radial(g, x, y, radius, damage) {
    for (let i = 0; i < g.enemies.length; i++) {
      const o = g.enemies[i];
      if (o.dead) continue;
      if (M.dist(x, y, DS.Ent.centerX(o), DS.Ent.centerY(o)) > radius) continue;
      DS.Ent.damageEnemy(g, o, damage, {
        dir: M.sign(DS.Ent.centerX(o) - x) || 1, knockback: 2
      });
    }
  }

  // --- ground fields --------------------------------------------------------

  const FIELD_DEFS = {
    fire:   { color: 'rgba(232,116,59,0.20)', edge: '#e8743b', life: 300, r: 22, tick: 20, dmg: 0.14, spread: 0.10, maxR: 40, lights: true },
    poison: { color: 'rgba(92,191,98,0.20)',  edge: '#5cbf62', life: 420, r: 30, tick: 30, dmg: 0.10, spread: 0.06, maxR: 52, mist: true },
    water:  { color: 'rgba(47,111,168,0.22)', edge: '#4fb3e0', life: 480, r: 26, tick: 0,  dmg: 0,    spread: 0,    maxR: 26 },
    ice:    { color: 'rgba(79,179,224,0.18)', edge: '#a8e4ff', life: 360, r: 26, tick: 0,  dmg: 0,    spread: 0,    maxR: 34 },
    leaf:   { color: 'rgba(163,232,107,0.18)',edge: '#a3e86b', life: 300, r: 22, tick: 0,  dmg: 0,    spread: 0,    maxR: 30 },
    steam:  { color: 'rgba(216,213,232,0.24)',edge: '#d8d5e8', life: 240, r: 34, tick: 40, dmg: 0.06, spread: 0.04, maxR: 48, mist: true, blinds: true }
  };

  function spawnField(g, x, y, element, power) {
    const def = FIELD_DEFS[element];
    if (!def) return null;
    if (!g.fields) g.fields = [];

    // Merge into an overlapping field of the same kind instead of stacking.
    for (let i = 0; i < g.fields.length; i++) {
      const f = g.fields[i];
      if (f.element !== element) continue;
      if (M.dist(f.x, f.y, x, y) > f.r) continue;
      f.life = f.maxLife;
      f.r = Math.min(f.maxR, f.r + 3);
      return f;
    }

    const field = {
      element: element, x: x, y: y,
      r: def.r, maxR: def.maxR,
      life: def.life, maxLife: def.life,
      tick: def.tick, dmg: def.dmg, spread: def.spread,
      power: power || 10, def: def
    };
    g.fields.push(field);
    return field;
  }

  /* Fields react with each other as well as with enemies: fire landing in water
     becomes steam and both are consumed. */
  function mergeFields(g) {
    for (let i = g.fields.length - 1; i >= 0; i--) {
      const a = g.fields[i];
      for (let j = i - 1; j >= 0; j--) {
        const b = g.fields[j];
        if (a.element === b.element) continue;
        if (M.dist(a.x, a.y, b.x, b.y) > (a.r + b.r) * 0.5) continue;

        const pair = pairKey(a.element, b.element);
        if (pair === 'fire|water') {
          spawnField(g, (a.x + b.x) / 2, (a.y + b.y) / 2, 'steam', a.power);
          a.life = 0; b.life = 0;
          DS.Audio.play('ice');
        } else if (pair === 'fire|leaf') {
          a.element === 'fire' ? (a.maxR = 70, a.spread = 0.4) : (b.maxR = 70, b.spread = 0.4);
          if (a.element === 'leaf') a.life = 0; else b.life = 0;
        } else if (pair === 'ice|water') {
          if (a.element === 'water') a.life = 0; else b.life = 0;
        }
        break;
      }
    }
  }

  function updateFields(g) {
    if (!g.fields) g.fields = [];
    if (!g.bolts) g.bolts = [];

    mergeFields(g);

    for (let i = g.fields.length - 1; i >= 0; i--) {
      const f = g.fields[i];
      f.life--;
      if (f.spread) f.r = Math.min(f.maxR, f.r + f.spread);

      if (f.def.mist && g.frames % 3 === 0) {
        DS.FX.emit({
          x: f.x + DS.rand.float(-f.r, f.r), y: f.y - DS.rand.float(0, 14),
          vx: DS.rand.float(-0.15, 0.15), vy: -DS.rand.float(0.05, 0.25),
          life: 40, size: 2, color: f.def.edge, grav: -0.004, drag: 0.99
        });
      } else if (f.element === 'fire' && g.frames % 2 === 0) {
        DS.FX.emit({
          x: f.x + DS.rand.float(-f.r, f.r), y: f.y - DS.rand.float(0, 4),
          vx: DS.rand.float(-0.2, 0.2), vy: -DS.rand.float(0.3, 0.8),
          life: 22, size: 1, color: DS.rand.pick(ELEMENTS.fire.spark), grav: -0.01
        });
      }

      if (f.tick && f.life % f.tick === 0) {
        const damage = Math.max(1, Math.round(f.power * f.dmg));
        for (let k = 0; k < g.enemies.length; k++) {
          const e = g.enemies[k];
          if (e.dead) continue;
          if (Math.abs(DS.Ent.centerX(e) - f.x) > f.r) continue;
          if (Math.abs(DS.Ent.centerY(e) - f.y) > f.r) continue;
          DS.Ent.damageEnemy(g, e, damage, { dir: 1, knockback: 0 });
          if (f.def.blinds) { e.status = e.status || {}; e.status.blind = 60; }
        }
        // Player-made fields never hurt the player; enemy-made ones do not exist yet.
      }

      if (f.life <= 0) g.fields.splice(i, 1);
    }

    for (let i = g.bolts.length - 1; i >= 0; i--) {
      if (--g.bolts[i].life <= 0) g.bolts.splice(i, 1);
    }
  }

  function drawFields(g) {
    if (!g.fields) return;
    const R = DS.R;

    for (let i = 0; i < g.fields.length; i++) {
      const f = g.fields[i];
      const fade = Math.min(1, f.life / 60);
      const h = f.def.mist ? f.r * 0.9 : 6;

      R.ctx.save();
      R.ctx.globalAlpha = fade;
      R.rect(f.x - f.r, f.y - h, f.r * 2, h, f.def.color);
      R.rect(f.x - f.r, f.y - h, f.r * 2, 1, f.def.edge);
      R.ctx.restore();
    }

    // Jagged lightning, redrawn each frame so it flickers on its own.
    if (!g.bolts) return;
    for (let i = 0; i < g.bolts.length; i++) {
      const b = g.bolts[i];
      const steps = 6;
      let px = b.x1, py = b.y1;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const nx = M.lerp(b.x1, b.x2, t) + (s === steps ? 0 : DS.rand.float(-4, 4));
        const ny = M.lerp(b.y1, b.y2, t) + (s === steps ? 0 : DS.rand.float(-4, 4));
        R.line(px, py, nx, ny, b.color, b.life > 6 ? 2 : 1);
        px = nx; py = ny;
      }
    }
  }

  // --- per-enemy ticking ----------------------------------------------------

  function tick(g, e) {
    const s = ensureStatus(e);

    if (e.aura && e.aura.frames > 0) e.aura.frames--;

    if (s.burn > 0) {
      s.burn--;
      if (s.burn % s.burnTick === 0) {
        e.hp -= s.burnDamage;
        e.hurtFlash = 3;
        DS.FX.number(DS.Ent.centerX(e), e.y - 2, s.burnDamage, '#e8743b');
        if (e.hp <= 0) { DS.Ent.killEnemy(g, e); return; }
      }
      if (DS.rand.chance(0.4)) {
        DS.FX.trail(DS.Ent.centerX(e) + DS.rand.float(-4, 4),
                    e.y + DS.rand.float(0, e.h), '#e8743b');
      }
    }

    if (s.poison > 0) {
      s.poison--;
      if (s.poison % s.poisonTick === 0) {
        e.hp -= s.poisonDamage;
        e.hurtFlash = 2;
        DS.FX.number(DS.Ent.centerX(e), e.y - 2, s.poisonDamage, '#5cbf62');
        if (e.hp <= 0) { DS.Ent.killEnemy(g, e); return; }
      }
      if (DS.rand.chance(0.25)) {
        DS.FX.trail(DS.Ent.centerX(e) + DS.rand.float(-5, 5),
                    e.y + DS.rand.float(0, e.h), '#5cbf62');
      }
    }

    if (s.chill > 0) {
      s.chill--;
      if (DS.rand.chance(0.15)) {
        DS.FX.trail(DS.Ent.centerX(e) + DS.rand.float(-4, 4),
                    e.y + DS.rand.float(0, e.h), '#a8e4ff');
      }
    }

    if (s.wet > 0) s.wet--;
    if (s.shock > 0) s.shock--;
    if (s.root > 0) s.root--;
    if (s.frozen > 0) s.frozen--;
    if (s.brittle > 0) s.brittle--;
    if (s.blind > 0) s.blind--;
    if (s.deepFrozen > 0) s.deepFrozen--;
  }

  // Frozen, rooted or shocked enemies cannot act.
  function disabled(e) {
    const s = e.status;
    if (!s) return false;
    return s.frozen > 0 || s.root > 0 || s.shock > 0;
  }

  function speedScale(e) {
    const s = e.status;
    if (!s) return 1;
    if (s.frozen > 0 || s.root > 0) return 0;
    let scale = 1;
    if (s.chill > 0) scale *= (1 - (s.chillSlow || 0.4));
    if (s.wet > 0) scale *= 0.9;
    return scale;
  }

  // Extra damage taken from statuses (deep freeze) and armour loss (brittle).
  function damageScale(e) {
    const s = e.status;
    if (!s) return 1;
    return s.deepFrozen > 0 ? 1.8 : 1;
  }

  function armorOf(e) {
    if (e.status && e.status.brittle > 0) return 0;
    return e.armor || 0;
  }

  // Tint an enemy sprite by whatever status is loudest right now.
  function statusTint(e) {
    const s = e.status;
    if (!s) return null;
    if (s.frozen > 0) return '#a8e4ff';
    if (s.shock > 0) return '#fff0a8';
    if (s.poison > 0) return '#5cbf62';
    if (s.burn > 0) return '#e8743b';
    if (s.root > 0) return '#a3e86b';
    if (s.wet > 0) return '#4fb3e0';
    return null;
  }

  DS.Elements = {
    ELEMENTS: ELEMENTS,
    KEYS: KEYS,
    REACTIONS: REACTIONS,
    FIELD_DEFS: FIELD_DEFS,
    apply: apply,
    freeze: freeze,
    spawnField: spawnField,
    updateFields: updateFields,
    drawFields: drawFields,
    strikeDown: strikeDown,
    tick: tick,
    disabled: disabled,
    speedScale: speedScale,
    damageScale: damageScale,
    armorOf: armorOf,
    statusTint: statusTint
  };
})(window.DS);
