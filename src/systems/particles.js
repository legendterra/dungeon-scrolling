/* Particles and floating damage numbers. Both live in fixed-size pools so a
   busy fight never allocates mid-frame. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const MAX_PARTICLES = 260;
  const MAX_NUMBERS = 40;

  const parts = [];
  const numbers = [];
  let pIndex = 0, nIndex = 0;

  for (let i = 0; i < MAX_PARTICLES; i++) {
    parts.push({
      life: 0, x: 0, y: 0, vx: 0, vy: 0, size: 1, color: '#fff',
      grav: 0, drag: 1, maxLife: 1,
      /* Shaped particles: `spr` swaps the square dot for a baked sprite,
         `rot`/`spin` tumble it, and `wob` gives it a sideways drift so a
         leaf flutters and a bubble weaves instead of travelling straight. */
      spr: null, rot: 0, spin: 0, wob: 0, wobT: 0, shrink: true
    });
  }
  for (let i = 0; i < MAX_NUMBERS; i++) {
    numbers.push({ life: 0, x: 0, y: 0, vy: 0, text: '', color: '#fff', scale: 1 });
  }

  // Oldest slot is overwritten once the pool is full — visually unnoticeable.
  function nextPart() {
    const p = parts[pIndex];
    pIndex = (pIndex + 1) % MAX_PARTICLES;
    return p;
  }

  function emit(o) {
    const p = nextPart();
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = p.maxLife = o.life || 20;
    p.size = o.size || 1;
    p.color = o.color || '#ffffff';
    p.grav = o.grav == null ? 0.12 : o.grav;
    p.drag = o.drag == null ? 0.98 : o.drag;
    p.fade = o.fade !== false;
    p.spr = o.spr || null;
    p.rot = o.rot || 0;
    p.spin = o.spin || 0;
    p.wob = o.wob || 0;
    p.wobT = o.wobT || 0;
    p.shrink = o.shrink !== false;
    return p;
  }

  const R = DS.rand;

  function burst(x, y, count, colors, opts) {
    opts = opts || {};
    const speed = opts.speed || 1.6;
    for (let i = 0; i < count; i++) {
      const a = R.float(0, Math.PI * 2);
      const s = R.float(speed * 0.3, speed);
      emit({
        x: x, y: y,
        vx: Math.cos(a) * s + (opts.vx || 0),
        vy: Math.sin(a) * s + (opts.vy || 0),
        life: R.int(opts.life || 16, (opts.life || 16) + 12),
        size: opts.size || R.int(1, 2),
        color: colors[R.int(0, colors.length - 1)],
        grav: opts.grav == null ? 0.14 : opts.grav,
        drag: opts.drag
      });
    }
  }

  const BLOOD = ['#c0303c', '#6e1b28', '#e8743b'];
  const DUST = ['#6f6a90', '#9b96b8', '#514c72'];
  const SPARK = ['#fff0a8', '#f2c14e', '#ffffff'];

  function hit(x, y, dir) {
    const spark = shape('spark', 'holy');
    if (spark) {
      for (let i = 0; i < 4; i++) {
        const a = dir * R.float(-0.9, 0.9);
        emit({
          x: x + dir * R.float(1, 4), y: y + R.float(-3, 3),
          vx: Math.cos(a) * R.float(1.2, 2.5), vy: Math.sin(a) * R.float(1.2, 2.5),
          life: R.int(8, 14), grav: 0.04, drag: 0.88,
          spr: spark, rot: a, spin: R.float(-0.08, 0.08)
        });
      }
    }
    burst(x, y, 8, SPARK, { speed: 2.2, vx: dir * 0.8, life: 12, grav: 0.05 });
  }

  function blood(x, y, dir, colors) {
    burst(x, y, 10, colors || BLOOD, { speed: 2.0, vx: dir * 0.9, life: 22 });
  }

  function dust(x, y, amount) {
    burst(x, y, amount || 5, DUST, { speed: 0.9, vy: -0.3, life: 16, grav: 0.04 });
  }

  function trail(x, y, color) {
    emit({
      x: x + R.float(-1, 1), y: y + R.float(-1, 1),
      vx: R.float(-0.2, 0.2), vy: R.float(-0.4, -0.1),
      life: 12, size: 1, color: color, grav: 0, drag: 0.94
    });
  }

  function spark(x, y, dir) {
    const spr = shape('spark', 'star') || shape('spark', 'holy');
    emit({
      x: x, y: y,
      vx: (dir || 0) * R.float(0.8, 1.8) + R.float(-0.4, 0.4),
      vy: R.float(-1.5, -0.3),
      life: R.int(8, 14), grav: 0.12, drag: 0.90,
      spr: spr, rot: R.float(0, 6.2), spin: R.float(-0.15, 0.15)
    });
  }

  function star(x, y, count, tint) {
    const spr = shape('star', tint || 'star');
    const n = count || 4;
    for (let i = 0; i < n; i++) {
      const a = R.float(0, Math.PI * 2);
      const s = R.float(0.8, 2.2);
      emit({
        x: x + R.float(-2, 2), y: y + R.float(-2, 2),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5,
        life: R.int(16, 28), grav: 0.04, drag: 0.92,
        spr: spr, rot: a, spin: R.float(-0.1, 0.1)
      });
    }
  }

  function heart(x, y, count) {
    const spr = shape('heart', 'cute');
    const n = count || 3;
    for (let i = 0; i < n; i++) {
      emit({
        x: x + R.float(-4, 4), y: y + R.float(-2, 2),
        vx: R.float(-0.4, 0.4), vy: R.float(-1.2, -0.6),
        life: R.int(24, 38), grav: -0.01, drag: 0.96,
        spr: spr, wob: R.float(0.1, 0.25), wobT: R.float(0, 6.2)
      });
    }
  }

  function pop(x, y, color) {
    const spr = shape('pop', 'magic');
    emit({
      x: x, y: y,
      vx: 0, vy: -0.2,
      life: 10, grav: 0, drag: 0.9, spr: spr
    });
    burst(x, y, 6, [color || '#ffd56b', '#ffffff'], { speed: 1.4, life: 10, grav: 0 });
  }

  function ring(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      emit({
        x: x, y: y,
        vx: Math.cos(a) * (speed || 1.8),
        vy: Math.sin(a) * (speed || 1.8) * 0.6,
        life: 18, size: 1, color: color, grav: 0, drag: 0.9
      });
    }
  }

  function number(x, y, text, color, scale) {
    const n = numbers[nIndex];
    nIndex = (nIndex + 1) % MAX_NUMBERS;
    n.x = x; n.y = y;
    n.vy = -0.9;
    n.life = 45;
    n.text = String(text);
    n.color = color || '#ffffff';
    n.scale = scale || 1;
  }

  function update() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = parts[i];
      if (p.life <= 0) continue;
      p.life--;
      p.vy += p.grav;
      p.vx *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      if (p.spin) p.rot += p.spin;
      if (p.wob) {
        p.wobT += 0.22;
        p.x += Math.sin(p.wobT) * p.wob;
      }
    }
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const n = numbers[i];
      if (n.life <= 0) continue;
      n.life--;
      n.y += n.vy;
      n.vy *= 0.92;
    }
  }

  function draw() {
    const R2 = DS.R;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = parts[i];
      if (p.life <= 0) continue;
      // Particles shrink to a single pixel as they die rather than dimming,
      // which reads better at this resolution than alpha fading.
      const t = p.life / p.maxLife;
      if (p.spr) {
        /* Shaped particles fade by dropping out on alternating frames near the
           end of their life -- at this resolution that reads cleaner than a
           real alpha ramp, and it costs nothing. */
        if (t < 0.35 && (p.life & 1)) continue;
        if (p.rot) {
          R2.sprRot(p.spr, p.x, p.y, p.rot, false);
        } else {
          R2.spr(p.spr, p.x - p.spr.uw / 2, p.y - p.spr.uh / 2);
        }
        continue;
      }
      const size = p.fade ? Math.max(1, Math.round(p.size * t)) : p.size;
      R2.rect(p.x, p.y, size, size, p.color);
    }
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const n = numbers[i];
      if (n.life <= 0) continue;
      const w = R2.textWidth(n.text, n.scale);
      R2.text(n.text, n.x - w / 2 - R2.camOffsetX(), n.y - R2.camOffsetY(), n.color, n.scale);
    }
  }

  function clear() {
    for (let i = 0; i < MAX_PARTICLES; i++) parts[i].life = 0;
    for (let i = 0; i < MAX_NUMBERS; i++) numbers[i].life = 0;
  }


  /* --- elemental bursts ----------------------------------------------------

     One emitter per element, each pairing its own shape with motion that reads
     as the thing it is named after. This is the whole point of the shaped
     particles: fire has to rise and taper, earth has to fall heavy, a leaf has
     to flutter. Before this every element was the same square dot in a
     different colour and they were indistinguishable in motion. */

  function shape(name, element) {
    return DS.FXArt ? DS.FXArt.get(name, element) : null;
  }

  const ELEMENT_FX = {
    // Licks that rise, lean and shrink out.
    fire: function (x, y, n, power) {
      const spr = shape('flame', 'fire');
      for (let i = 0; i < n; i++) {
        emit({
          x: x + R.float(-4, 4), y: y + R.float(-2, 3),
          vx: R.float(-0.35, 0.35), vy: R.float(-1.5, -0.7) * power,
          life: R.int(16, 28), grav: -0.02, drag: 0.96, spr: spr
        });
      }
      burst(x, y, n, ['#f2c14e', '#fff0a8'], { speed: 1.4 * power, life: 12, grav: -0.03 });
    },

    // Shards thrown outward, hanging in the air as they fade.
    ice: function (x, y, n, power) {
      const spr = shape('shard', 'ice');
      for (let i = 0; i < n; i++) {
        const a = R.float(0, Math.PI * 2);
        emit({
          x: x, y: y,
          vx: Math.cos(a) * R.float(0.6, 1.7) * power,
          vy: Math.sin(a) * R.float(0.6, 1.4) * power,
          life: R.int(20, 32), grav: 0.01, drag: 0.90,
          spr: spr, rot: a, spin: R.float(-0.04, 0.04)
        });
      }
    },

    // Bolts snapping outward plus a fast white crackle.
    lightning: function (x, y, n, power) {
      const spr = shape('bolt', 'lightning');
      for (let i = 0; i < n; i++) {
        const a = R.float(0, Math.PI * 2);
        emit({
          x: x, y: y,
          vx: Math.cos(a) * R.float(1.6, 3.2) * power,
          vy: Math.sin(a) * R.float(1.6, 3.0) * power,
          life: R.int(7, 13), grav: 0, drag: 0.86,
          spr: spr, rot: a + Math.PI / 2
        });
      }
      burst(x, y, n * 2, ['#ffffff', '#fff0a8'], { speed: 3.2 * power, life: 7, grav: 0 });
    },

    // Bubbles that rise and weave.
    poison: function (x, y, n, power) {
      const spr = shape('bubble', 'poison');
      for (let i = 0; i < n; i++) {
        emit({
          x: x + R.float(-5, 5), y: y + R.float(-2, 2),
          vx: R.float(-0.2, 0.2), vy: R.float(-0.9, -0.35) * power,
          life: R.int(26, 44), grav: -0.006, drag: 0.99,
          spr: spr, wob: R.float(0.10, 0.30), wobT: R.float(0, 6.2)
        });
      }
    },

    // Droplets thrown up that fall back down.
    water: function (x, y, n, power) {
      const spr = shape('droplet', 'water');
      for (let i = 0; i < n; i++) {
        emit({
          x: x, y: y,
          vx: R.float(-1.5, 1.5) * power, vy: R.float(-2.2, -0.8) * power,
          life: R.int(18, 30), grav: 0.16, drag: 0.99, spr: spr
        });
      }
    },

    // Heavy chunks that tumble and land.
    earth: function (x, y, n, power) {
      const spr = shape('rock', 'earth');
      for (let i = 0; i < n; i++) {
        emit({
          x: x, y: y,
          vx: R.float(-1.8, 1.8) * power, vy: R.float(-2.4, -0.9) * power,
          life: R.int(22, 36), grav: 0.24, drag: 0.99,
          spr: spr, rot: R.float(0, 6.2), spin: R.float(-0.12, 0.12)
        });
      }
      dust(x, y, Math.max(4, n));
    },

    // Leaves that tumble and flutter down.
    leaf: function (x, y, n, power) {
      const spr = shape('leaf', 'leaf');
      for (let i = 0; i < n; i++) {
        emit({
          x: x, y: y,
          vx: R.float(-1.2, 1.2) * power, vy: R.float(-1.8, -0.5) * power,
          life: R.int(34, 54), grav: 0.045, drag: 0.98,
          spr: spr, rot: R.float(0, 6.2), spin: R.float(-0.10, 0.10),
          wob: R.float(0.18, 0.42), wobT: R.float(0, 6.2)
        });
      }
    }
  };

  /* Emit any shape directly, for effects that are not an element as such --
     the white slashes of a blade dash, the shadow motes of a flurry. */
  function shaped(name, tint, x, y, n, opts) {
    opts = opts || {};
    const spr = shape(name, tint);
    if (!spr) {
      burst(x, y, n, opts.colors || SPARK, { speed: opts.speed || 2, life: opts.life || 14 });
      return;
    }
    const speed = opts.speed || 1.8;
    for (let i = 0; i < n; i++) {
      const a = opts.angle == null ? R.float(0, Math.PI * 2)
                                   : opts.angle + R.float(-(opts.spread || 0), opts.spread || 0);
      const sp = R.float(speed * 0.4, speed);
      emit({
        x: x + R.float(-(opts.jitter || 0), opts.jitter || 0),
        y: y + R.float(-(opts.jitter || 0), opts.jitter || 0),
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp + (opts.vy || 0),
        life: R.int(opts.life || 14, (opts.life || 14) + 10),
        grav: opts.grav == null ? 0 : opts.grav,
        drag: opts.drag == null ? 0.94 : opts.drag,
        spr: spr,
        rot: opts.align ? a + Math.PI / 2 : R.float(0, 6.2),
        spin: opts.spin || 0,
        wob: opts.wob || 0, wobT: R.float(0, 6.2)
      });
    }
  }

  /* Emit an elemental effect. Falls back to the old coloured dots for any
     element without a bespoke emitter, so callers never have to check. */
  function element(kind, x, y, opts) {
    opts = opts || {};
    const n = opts.count || 7;
    const power = opts.power == null ? 1 : opts.power;
    /* Mirror the emission onto the 3D floor so voxel mode gets ground FX too:
       a burst of glowing shards scattering along the real terrain surface. */
    if (DS.R3D && DS.R3D.spawnGroundBurst && DS.R3D.isEnabled &&
        kind !== 'lightning') {
      const map = (DS.currentGame && DS.currentGame.map) || null;
      const gy = map && map.floorBelow
        ? map.floorBelow(Math.floor(x / 16), Math.floor(y / 16))
        : y;
      DS.R3D.spawnGroundBurst(kind, x, Math.min(y, gy || y), power);
    }
    const fn = ELEMENT_FX[kind];
    if (fn) { fn(x, y, n, power); return; }
    const colors = opts.colors || SPARK;
    burst(x, y, n, colors, { speed: 1.8 * power, life: 16 });
  }

  DS.FX = {
    emit: emit,
    burst: burst,
    hit: hit,
    blood: blood,
    dust: dust,
    trail: trail,
    spark: spark,
    star: star,
    heart: heart,
    pop: pop,
    ring: ring,
    element: element,
    shaped: shaped,
    number: number,
    update: update,
    draw: draw,
    clear: clear,
    BLOOD: BLOOD,
    DUST: DUST,
    SPARK: SPARK
  };
})(window.DS);
