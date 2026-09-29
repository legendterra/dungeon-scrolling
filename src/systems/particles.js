/* Particles and floating damage numbers. Both live in fixed-size pools so a
   busy fight never allocates mid-frame. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const MAX_PARTICLES = 260;
  /* 64: the HTML number layer (src/ui-html/world.js) mirrors this pool slot
     for slot, so its size is the ceiling on numbers on screen at once. */
  const MAX_NUMBERS = 64;

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
    numbers.push({ life: 0, max: 45, x: 0, y: 0, vx: 0, vy: 0, text: '', color: '#fff', scale: 1,
                   hint: null, serial: 0 });
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

  /* `hint` is optional: the element a hit landed as, so the HTML layer can
     colour the number by element. `serial` tells a reader a slot was reused.
     Numbers now drift sideways a little as they rise, so a flurry of hits
     fans out instead of stacking into one unreadable column. */
  let serial = 0;
  function number(x, y, text, color, scale, hint) {
    if (DS.Settings && DS.Settings.get('game', 'damageNumbers') === false && /^[0-9+-]/.test(String(text))) return;
    const n = numbers[nIndex];
    nIndex = (nIndex + 1) % MAX_NUMBERS;
    n.x = x; n.y = y;
    n.vx = (Math.random() - 0.5) * 0.9;
    n.vy = -1.15;
    n.text = String(text);
    // Words (reactions, BLOCK) hold a beat longer than a number.
    n.max = /^[0-9+-]/.test(n.text) ? 45 : 58;
    n.life = n.max;
    n.color = color || '#ffffff';
    n.scale = scale || 1;
    n.hint = hint || null;
    n.serial = ++serial;
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
      n.x += n.vx;
      n.vx *= 0.94;
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
    // With the HTML layer on, the numbers are drawn there (src/ui-html/world.js).
    if (DS.HUI_ENABLED && DS.World) return;
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const n = numbers[i];
      if (n.life <= 0) continue;
      const w = R2.textWidth(n.text, n.scale);
      /* Through the world camera, both coordinates at once: under the 3D
         lens a number placed with a flat offset drifted off its target. */
      R2.text(n.text, R2.toScreenX(n.x, n.y) - w / 2, R2.toScreenY(n.y, n.x), n.color, n.scale);
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

    /* Wind finally has a body of its own: pale streaks thrown out on a spiral,
       each one leaving a faint gust dot, so a wind hit reads as air being
       shoved sideways rather than as generic sparks. */
    wind: function (x, y, n, power) {
      const spr = shape('spark', 'magic');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R.float(-0.2, 0.2);
        const r = R.float(2, 5);
        // Tangent plus a little outward push: the spiral.
        const vx = (-Math.sin(a) * 1.6 + Math.cos(a) * 0.7) * power;
        const vy = (Math.cos(a) * 1.6 + Math.sin(a) * 0.7) * power * 0.7;
        emit({
          x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7,
          vx: vx, vy: vy, life: R.int(12, 18), grav: -0.01, drag: 0.9,
          spr: spr, rot: a, spin: 0.12
        });
      }
      burst(x, y, n, ['#ffffff', '#cfe8e0', '#9fb8b0'], { speed: 1.6 * power, life: 10, grav: -0.02 });
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

  /* Smoke. A charge attack drags a wake behind it, and the voxel layer gets a
     real puff from the same call so the 2D dots and the 3D boxes stay in step. */
  function smoke(x, y, vx, vy, opts) {
    opts = opts || {};
    const size = opts.size || 2;
    emit({
      x: x, y: y, vx: vx || 0, vy: vy || 0,
      life: opts.life || 22,
      size: size,
      color: opts.color || '#9b96b8',
      grav: opts.grav == null ? -0.01 : opts.grav,
      drag: opts.drag == null ? 0.94 : opts.drag,
      shrink: false
    });
    if (DS.R3D && DS.R3D.isEnabled && DS.R3D.spawnSmokePuff) {
      DS.R3D.spawnSmokePuff(x, y, vx, vy, {
        color: opts.color || '#9b96b8',
        life: opts.life || 22,
        size: size
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

  /* --- the 3D route ----------------------------------------------------------

     While the voxel world is on screen (DS.FX3D.live()), the world effects go
     to the pooled 3D layer instead of these 2D quads: real sparks, flames,
     debris and rings standing in the scene, lit by its bloom and hidden by
     its bodies. Every call keeps its 2D meaning; only the drawing changes.
     Floating numbers, hearts and the UI pop stay 2D - they are read, not seen.
     With voxels off (or in a menu/cutscene) every call falls straight through
     to the 2D emitters above, exactly as before. */
  const P2U = 0.1;
  function fx3d() { return DS.FX3D && DS.FX3D.live() ? DS.FX3D : null; }
  function wz() { return DS.FX3D.Z + (Math.random() - 0.5) * 0.3; }

  // Reused option bags: the 3D presets never keep them.
  const HIT3 = { dir: 1, el: null, crit: false, heavy: false };
  const BLOOD3 = { dir: 0, colors: null };
  const RING3 = { color: 0xffffff, r1: 1, count: 8 };

  const TINT_HEX = {};
  function tintHex(tint) {
    if (TINT_HEX[tint] != null) return TINT_HEX[tint];
    const t = DS.FXArt && DS.FXArt.tints && DS.FXArt.tints[tint];
    const hex = t ? DS.FX3D.cssHex(t[1]) : 0xfff0a8;
    TINT_HEX[tint] = hex;
    return hex;
  }

  function hit3(x, y, dir, opts) {
    const F = fx3d();
    if (!F) { hit(x, y, dir); return; }
    HIT3.dir = dir || 1;
    HIT3.el = opts ? (opts.element || (opts.procs && opts.procs.element) || null) : null;
    HIT3.crit = !!(opts && opts.crit);
    HIT3.heavy = !!(opts && opts.heavy);
    F.spawn('hit', x, y, HIT3);
  }

  function blood3(x, y, dir, colors) {
    const F = fx3d();
    if (!F) { blood(x, y, dir, colors); return; }
    BLOOD3.dir = dir || 0; BLOOD3.colors = colors || BLOOD;
    F.spawn('blood', x, y, BLOOD3);
  }

  function dust3(x, y, amount) {
    const F = fx3d();
    if (!F) { dust(x, y, amount); return; }
    const n = F.n(Math.min(12, amount || 5));
    for (let i = 0; i < n; i++) {
      F.puffAt(x * P2U + F.rnd(-0.15, 0.15), -y * P2U + 0.05, wz(), F.rnd(-0.02, 0.02), F.rnd(0.004, 0.014), 0,
               0.12, 0.34, 0x9b96a8, 0.42, F.rnd(18, 28));
    }
  }

  function trail3(x, y, color) {
    const F = fx3d();
    if (!F) { trail(x, y, color); return; }
    const s = F.add.spec();
    s.x = x * P2U + F.rnd(-0.08, 0.08); s.y = -y * P2U + F.rnd(-0.08, 0.08); s.z = wz();
    s.vx = F.rnd(-0.01, 0.01); s.vy = F.rnd(0.008, 0.02); s.drag = 0.94;
    s.cell = DS.FX3DAtlas.CELL.ember; s.size = 0.08; s.size1 = 0.02; s.life = 14;
    F.col(s, F.cssHex(color), 1.8); s.a = 0.9; s.a1 = 0;
    F.add.emit(s);
  }

  function spark3(x, y, dir) {
    const F = fx3d();
    if (!F) { spark(x, y, dir); return; }
    F.sparkAt(x * P2U, -y * P2U, wz(), (dir || 0) * F.rnd(0.08, 0.16) + F.rnd(-0.04, 0.04),
              F.rnd(0.03, 0.14), F.rnd(-0.03, 0.03), 0xfff0a8, 2.2, F.rnd(8, 13), 0.045, 2, 0.01, 0.9);
  }

  function star3(x, y, count, tint) {
    const F = fx3d();
    if (!F) { star(x, y, count, tint); return; }
    const hex = tintHex(tint || 'star');
    const n = F.n(count || 4);
    for (let i = 0; i < n; i++) {
      const a = F.rnd(0, Math.PI * 2), sp = F.rnd(0.08, 0.2);
      const s = F.add.spec();
      s.x = x * P2U; s.y = -y * P2U; s.z = wz();
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp + 0.04; s.drag = 0.9; s.grav = 0.003;
      s.cell = DS.FX3DAtlas.CELL.star; s.size = F.rnd(0.35, 0.55); s.size1 = 0.1; s.life = F.rnd(16, 26);
      s.rot = a; s.spin = F.rnd(-0.1, 0.1);
      F.col(s, hex, 2.2); s.a = 1; s.a1 = 0;
      F.add.emit(s);
    }
  }

  function ring3(x, y, count, color, speed) {
    const F = fx3d();
    if (!F) { ring(x, y, count, color, speed); return; }
    RING3.color = F.cssHex(color);
    RING3.r1 = (speed || 1.8) * 8.5 * P2U;
    RING3.count = count;
    F.spawn('ring', x, y, RING3);
  }

  function burst3(x, y, count, colors, opts) {
    const F = fx3d();
    if (!F) { burst(x, y, count, colors, opts); return; }
    opts = opts || {};
    const speed = (opts.speed || 1.6) * P2U;
    const grav = (opts.grav == null ? 0.14 : opts.grav) * P2U;
    const life = opts.life || 16;
    const n = F.n(Math.min(40, count));
    for (let i = 0; i < n; i++) {
      const a = F.rnd(0, Math.PI * 2), sp = F.rnd(0.3, 1) * speed;
      const vx = Math.cos(a) * sp + (opts.vx || 0) * P2U, vy = -(Math.sin(a) * sp + (opts.vy || 0) * P2U);
      const hex = F.cssHex(colors[i % colors.length]);
      if (i & 1) {
        F.sparkAt(x * P2U, -y * P2U, wz(), vx, vy, F.rnd(-0.4, 0.4) * sp, hex, 2, life * F.rnd(0.6, 1),
                  0.045, 2, grav, 0.9);
      } else {
        const s = F.add.spec();
        s.x = x * P2U; s.y = -y * P2U; s.z = wz(); s.vx = vx; s.vy = vy; s.vz = F.rnd(-0.4, 0.4) * sp;
        s.grav = grav; s.drag = 0.93; s.cell = DS.FX3DAtlas.CELL.ember;
        s.size = F.rnd(0.08, 0.13); s.size1 = 0.03; s.life = life * F.rnd(0.8, 1.3);
        F.col(s, hex, 1.9); s.a = 1; s.a1 = 0;
        F.add.emit(s);
      }
    }
  }

  // FXArt shape -> 3D look.
  const SHAPE3 = { spark: 1, star: 2, flame: 5, shard: 6, leaf: 7, bubble: 8, droplet: 9, heart: 0, pop: 4, bolt: 1, rock: -1 };

  function shaped3(name, tint, x, y, n, opts) {
    const F = fx3d();
    if (!F) { shaped(name, tint, x, y, n, opts); return; }
    opts = opts || {};
    const hex = tintHex(tint);
    const speed = (opts.speed || 1.8) * P2U;
    const cell = SHAPE3[name] == null ? 0 : SHAPE3[name];
    const soft = cell === 7 || cell === 8 || cell === 9;
    const k = F.n(n);
    for (let i = 0; i < k; i++) {
      const a = opts.angle == null ? F.rnd(0, Math.PI * 2)
                                   : opts.angle + F.rnd(-(opts.spread || 0), opts.spread || 0);
      const sp = F.rnd(0.4, 1) * speed;
      const j = (opts.jitter || 0) * P2U;
      const X = x * P2U + F.rnd(-j, j), Y = -y * P2U + F.rnd(-j, j), Z = wz();
      const vx = Math.cos(a) * sp + (opts.vx || 0) * P2U, vy = -(Math.sin(a) * sp + (opts.vy || 0) * P2U);
      const life = F.rnd(opts.life || 14, (opts.life || 14) + 10);
      if (cell === -1) { F.chunkAt(X, Y, Z, vx, vy, 0, F.rnd(0.05, 0.09), 0x8a6340, life + 10, Y - 0.8); continue; }
      if (cell === 1) { F.sparkAt(X, Y, Z, vx, vy, F.rnd(-0.3, 0.3) * sp, hex, 2.2, life, 0.05, 2.2, 0, 0.9); continue; }
      const sys = soft ? F.soft : F.add;
      const s = sys.spec();
      s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.drag = opts.drag == null ? 0.94 : opts.drag;
      s.grav = (opts.grav || 0) * P2U; s.cell = cell; s.size = 0.28; s.size1 = 0.1; s.life = life;
      s.rot = F.rnd(0, 6.28); s.spin = opts.spin || 0; s.wob = (opts.wob || 0) * P2U;
      F.col(s, hex, soft ? 1 : 2); s.a = 1; s.a1 = 0;
      sys.emit(s);
    }
  }

  function element3(kind, x, y, opts) {
    const F = fx3d();
    if (!F) { element(kind, x, y, opts); return; }
    opts = opts || {};
    const count = opts.count || 7;
    const power = opts.power == null ? 1 : opts.power;
    const k = F.kit(kind);
    const X = x * P2U, Y = -y * P2U, Z = wz();
    if (count <= 2) k.ambient(X, Y, Z, power);
    else k.hit(X, Y, Z, 0, Math.min(1.5, power * Math.max(0.6, count / 9)));
  }

  function smoke3(x, y, vx, vy, opts) {
    if (!fx3d()) { smoke(x, y, vx, vy, opts); return; }
    opts = opts || {};
    DS.R3D.spawnSmokePuff(x, y, vx, vy, opts);
  }

  function emit3(o) {
    const F = fx3d();
    if (!F || o.spr) return emit(o);
    F.puffAt(o.x * P2U, -o.y * P2U, wz(), (o.vx || 0) * P2U, -(o.vy || 0) * P2U, 0,
             (o.size || 1) * 0.08, (o.size || 1) * 0.2, F.cssHex(o.color || '#ffffff'), 0.35, o.life || 20);
    return null;
  }

  /* Reactions announce themselves by name; in 3D the name also sets off the
     reaction's burst (see src/fx3d/kits.js) at the target it floats over. */
  function number3(x, y, text, color, scale, hint) {
    number(x, y, text, color, scale, hint);
    const F = fx3d();
    if (F && typeof text === 'string' && F.isReactionName && F.isReactionName(text)) {
      F.reaction(text, x * P2U, -(y + 17) * P2U, F.Z, 1);
    }
  }

  DS.FX = {
    emit: emit3,
    burst: burst3,
    hit: hit3,
    blood: blood3,
    dust: dust3,
    trail: trail3,
    smoke: smoke3,
    spark: spark3,
    star: star3,
    heart: heart,
    pop: pop,
    ring: ring3,
    element: element3,
    shaped: shaped3,
    number: number3,
    // Read-only view of the number pool for the HTML layer.
    numbers: numbers,
    update: update,
    draw: draw,
    clear: clear,
    BLOOD: BLOOD,
    DUST: DUST,
    SPARK: SPARK
  };
})(window.DS);
