/* Moving obstacles, generated per level.

   Three kinds, all driven by the same ping-pong motion:
     platform — solid to stand on, carries the player with it
     ball     — spiked weight that hurts on contact
     saw      — blade that sweeps along a horizontal track

   Tilemap collision is grid-based, so these carry their own resolution. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const M = DS.M;

  function make(kind, x, y, w, h, opts) {
    return {
      kind: kind,
      baseX: x, baseY: y,
      x: x, y: y, w: w, h: h,
      dx: 0, dy: 0,
      axis: opts.axis || 'y',
      range: opts.range || 32,
      speed: opts.speed || 0.02,
      phase: opts.phase || 0,
      damage: opts.damage || 1
    };
  }

  function update(g) {
    for (let i = 0; i < g.hazards.length; i++) {
      const h = g.hazards[i];
      const prevX = h.x, prevY = h.y;

      h.phase += h.speed;
      const wave = Math.sin(h.phase);

      if (h.axis === 'x') { h.x = h.baseX + wave * h.range; h.y = h.baseY; }
      else { h.x = h.baseX; h.y = h.baseY + wave * h.range; }

      // Per-frame delta, so a rider can be moved by exactly the same amount.
      h.dx = h.x - prevX;
      h.dy = h.y - prevY;

      if (h.kind === 'crumble') updateCrumble(g, h);
      else if (h.kind !== 'platform') hurtOnTouch(g, h);
    }
  }

  /* The zonk: a platform in a pit crossing that looks like all the others but
     gives way a moment after it takes weight. It always comes back, so a pit
     can never become permanently uncrossable — it just costs you the timing. */
  const CRUMBLE_DELAY = 26;   // frames from first touch to collapse
  const CRUMBLE_GONE = 150;   // frames before it reforms

  function updateCrumble(g, h) {
    h.x = h.baseX;
    h.y = h.baseY;
    h.dx = 0; h.dy = 0;

    if (h.broken > 0) {
      h.broken--;
      if (h.broken === 0) {
        h.triggered = 0;
        DS.FX.burst(h.x + h.w / 2, h.y, 6, ['#8a6340', '#b98d5c'],
                    { speed: 0.8, life: 14, grav: -0.02 });
      }
      return;
    }

    if (h.triggered > 0) {
      h.triggered--;
      // Shudder harder as it is about to go.
      const shake = 1 - h.triggered / CRUMBLE_DELAY;
      h.x += DS.rand.float(-1, 1) * shake;
      if (h.triggered % 6 === 0) {
        DS.FX.dust(h.x + h.w / 2, h.y + h.h, 2);
      }
      if (h.triggered === 0) {
        h.broken = CRUMBLE_GONE;
        DS.Audio.play('locked');
        DS.FX.burst(h.x + h.w / 2, h.y + 2, 12, ['#8a6340', '#5c3f2a', '#2e2018'],
                    { speed: 1.6, life: 30, grav: 0.3 });
      }
    }
  }

  function hurtOnTouch(g, h) {
    const p = g.player;
    if (!p || p.dead) return;
    if (!M.rectsOverlap(h.x, h.y, h.w, h.h, p.x, p.y, p.w, p.h)) return;

    const dir = M.sign(DS.Ent.centerX(p) - (h.x + h.w / 2)) || 1;
    p.hurt(g, h.damage, dir);
  }

  /* Called from the player update after tile physics have run. A rider is
     anyone falling onto the top face of a platform. */
  function carry(g, p) {
    for (let i = 0; i < g.hazards.length; i++) {
      const h = g.hazards[i];
      if (h.kind !== 'platform' && h.kind !== 'crumble') continue;
      if (h.kind === 'crumble' && h.broken > 0) continue;
      if (p.x + p.w <= h.x || p.x >= h.x + h.w) continue;

      const feet = p.y + p.h;
      // Land only when coming down onto the upper lip of the platform.
      if (p.vy < 0) continue;
      if (feet < h.y - 2 || feet > h.y + h.h) continue;

      p.y = h.y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.x += h.dx;
      p.y += h.dy;
      if (h.kind === 'crumble' && !h.triggered && !h.broken) {
        h.triggered = CRUMBLE_DELAY;
        DS.Audio.play('land');
      }
      return h;
    }
    return null;
  }

  function draw(g) {
    const R = DS.R;
    for (let i = 0; i < g.hazards.length; i++) {
      const h = g.hazards[i];

      if (h.kind === 'crumble') {
        if (h.broken > 0) continue;
        for (let x = 0; x < h.w; x += T) {
          R.spr(DS.SPR.tile.platform, h.x + x, h.y);
        }
        // Cracks are the tell — the trap is readable, just not free.
        R.rect(h.x + 3, h.y, 2, 3, '#2e2018');
        R.rect(h.x + 9, h.y + 1, 2, 2, '#2e2018');
        R.rect(h.x + h.w - 6, h.y, 2, 3, '#2e2018');
        if (h.triggered > 0 && Math.floor(h.triggered / 3) % 2 === 0) {
          R.rect(h.x, h.y - 1, h.w, 1, '#c0303c');
        }
      } else if (h.kind === 'platform') {
        for (let x = 0; x < h.w; x += T) {
          R.spr(DS.SPR.tile.platform, h.x + x, h.y);
        }
        // Chain back to the anchor so the motion reads as mechanical.
        const anchorY = h.baseY - h.range - 8;
        if (h.axis === 'y') {
          for (let y = anchorY; y < h.y; y += 4) {
            R.rect(h.x + h.w / 2 - 1, y, 2, 2, '#514c72');
          }
        }
      } else if (h.kind === 'ball') {
        const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
        const anchorY = h.baseY - h.range - 10;
        for (let y = anchorY; y < h.y; y += 4) {
          R.rect(cx - 1, y, 2, 2, '#514c72');
        }
        R.rect(h.x + 2, h.y + 2, h.w - 4, h.h - 4, '#6f6a90');
        R.rect(h.x + 3, h.y + 3, h.w - 6, h.h - 6, '#3a3654');
        // Four spikes.
        R.rect(cx - 1, h.y - 2, 2, 4, '#d8d5e8');
        R.rect(cx - 1, h.y + h.h - 2, 2, 4, '#d8d5e8');
        R.rect(h.x - 2, cy - 1, 4, 2, '#d8d5e8');
        R.rect(h.x + h.w - 2, cy - 1, 4, 2, '#d8d5e8');
      } else if (h.kind === 'saw') {
        const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
        R.rect(h.x, h.baseY + h.h / 2 - 1, 2, 2, '#3a3654');
        R.rect(h.x + 1, h.y + 1, h.w - 2, h.h - 2, '#9b96b8');
        R.rect(h.x + 3, h.y + 3, h.w - 6, h.h - 6, '#3a3654');
        // Teeth flick with the frame counter so the blade looks like it spins.
        const spin = Math.floor(g.frames / 3) % 2 === 0;
        R.rect(cx - 1, h.y - 2 + (spin ? 0 : 1), 2, 3, '#d8d5e8');
        R.rect(cx - 1, h.y + h.h - 1 - (spin ? 0 : 1), 2, 3, '#d8d5e8');
        R.rect(h.x - 2 + (spin ? 0 : 1), cy - 1, 3, 2, '#d8d5e8');
        R.rect(h.x + h.w - 1 - (spin ? 0 : 1), cy - 1, 3, 2, '#d8d5e8');
      }
    }
  }

  // --- generation -----------------------------------------------------------

  /* Hazards are placed room by room, never in the first or last room, and only
     where there is enough headroom for the full sweep. */
  function generate(g, level) {
    g.hazards.length = 0;
    if (level.kind !== 'normal') return;

    seedCrumblers(g);

    const map = g.map;
    const rooms = level.roomCount;
    const chance = DS.M.clamp(0.30 + g.depth * 0.09, 0.3, 0.8);

    for (let room = 1; room < rooms - 1; room++) {
      if (!g.rng.chance(chance)) continue;

      const tx = room * DS.LevelGen.ROOM_W + g.rng.int(5, 14);
      const floorY = map.floorBelow(tx, 2);
      // No floor in this column means we are over a pit — leave the parkour
      // crossing alone rather than hanging a saw in the void.
      if (floorY <= 0 || floorY >= map.pixelH) continue;

      const kind = g.rng.weighted([
        { weight: 40, value: 'platform' },
        { weight: 34, value: 'ball' },
        { weight: 26, value: 'saw' }
      ]);

      if (kind === 'platform') {
        const w = 32;
        const x = tx * T - w / 2;
        if (blocked(map, x, floorY - 56, w, 48)) continue;
        g.hazards.push(make('platform', x, floorY - 40, w, 5, {
          axis: g.rng.chance(0.6) ? 'y' : 'x',
          range: g.rng.int(18, 30),
          speed: g.rng.float(0.012, 0.024),
          phase: g.rng.float(0, Math.PI * 2)
        }));
      } else if (kind === 'ball') {
        const x = tx * T;
        if (blocked(map, x - 6, floorY - 64, 12, 56)) continue;
        g.hazards.push(make('ball', x - 6, floorY - 40, 12, 12, {
          axis: 'y',
          range: g.rng.int(16, 26),
          speed: g.rng.float(0.02, 0.038),
          phase: g.rng.float(0, Math.PI * 2),
          damage: 1 + (g.depth >= 4 ? 1 : 0)
        }));
      } else {
        const x = tx * T;
        if (blocked(map, x - 26, floorY - 22, 52, 18)) continue;
        g.hazards.push(make('saw', x - 6, floorY - 14, 12, 12, {
          axis: 'x',
          range: g.rng.int(20, 34),
          speed: g.rng.float(0.016, 0.03),
          phase: g.rng.float(0, Math.PI * 2),
          damage: 1 + (g.depth >= 4 ? 1 : 0)
        }));
      }
    }
  }

  /* Turn a couple of the authored pit platforms into zonks. Only tiles that
     sit over a genuine void are eligible, and never the first or last step of
     a chain, so there is always somewhere safe to start and land. */
  function seedCrumblers(g) {
    const map = g.map;
    const candidates = [];

    for (let ty = 0; ty < map.h - 2; ty++) {
      for (let tx = 1; tx < map.w - 1; tx++) {
        if (!map.isPlatform(tx, ty)) continue;
        if (map.floorBelow(tx, ty + 1) < map.pixelH) continue; // not over a pit
        if (map.isPlatform(tx - 1, ty) && map.isPlatform(tx + 1, ty)) continue;
        candidates.push({ tx: tx, ty: ty });
      }
    }
    if (candidates.length < 4) return;

    const picks = g.rng.sample(candidates, g.rng.int(1, 2));
    for (let i = 0; i < picks.length; i++) {
      const spot = picks[i];
      // Replace the whole two-tile step, not just the tile we found.
      const left = map.isPlatform(spot.tx - 1, spot.ty) ? spot.tx - 1 : spot.tx;
      const width = map.isPlatform(left + 1, spot.ty) ? 2 : 1;

      for (let x = left; x < left + width; x++) map.set(x, spot.ty, DS.TILE.EMPTY);

      g.hazards.push({
        kind: 'crumble',
        baseX: left * T, baseY: spot.ty * T,
        x: left * T, y: spot.ty * T,
        w: width * T, h: 5,
        dx: 0, dy: 0,
        axis: 'y', range: 0, speed: 0, phase: 0, damage: 0,
        triggered: 0, broken: 0
      });
    }
  }

  function blocked(map, x, y, w, h) {
    const x0 = Math.floor(x / T), x1 = Math.floor((x + w) / T);
    const y0 = Math.floor(y / T), y1 = Math.floor((y + h) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (map.isBlocked(tx, ty)) return true;
      }
    }
    return false;
  }

  DS.Hazards = {
    generate: generate,
    update: update,
    draw: draw,
    carry: carry
  };
})(window.DS);
