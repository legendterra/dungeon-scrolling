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
    parts.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, size: 1, color: '#fff', grav: 0, drag: 1, maxLife: 1 });
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

  // Expanding ring of dots — used for dashes, casts and boss slams.
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
    n.vy = -0.7;
    n.life = 42;
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

  DS.FX = {
    emit: emit,
    burst: burst,
    hit: hit,
    blood: blood,
    dust: dust,
    trail: trail,
    ring: ring,
    number: number,
    update: update,
    draw: draw,
    clear: clear,
    BLOOD: BLOOD,
    DUST: DUST,
    SPARK: SPARK
  };
})(window.DS);
