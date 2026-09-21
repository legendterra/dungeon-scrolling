/* The tile grid: storage, collision queries, and drawing.
   Only tiles inside the camera window are ever drawn. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;

  const TILE = {
    EMPTY: 0,
    WALL: 1,
    PLATFORM: 2,
    SPIKE: 3,
    DOOR: 4,
    /* The killing floor at the bottom of a pit. The map's own bottom edge reads
       as solid wall, so without this an entity that fell into a pit landed on an
       invisible floor instead of dying. */
    DEATHSPIKE: 5
  };

  function create(w, h) {
    const data = new Uint8Array(w * h);

    const map = {
      w: w,
      h: h,
      data: data,
      decor: [],          // { kind, x, y } in pixels — torches, tables, signs
      solids: [],         // dynamic blocking boxes — crates and closed gates
      pixelW: w * T,
      pixelH: h * T,

      inside: function (tx, ty) {
        return tx >= 0 && ty >= 0 && tx < w && ty < h;
      },

      get: function (tx, ty) {
        if (tx < 0 || tx >= w) return TILE.WALL;   // sealed sides
        if (ty < 0) return TILE.EMPTY;             // open sky
        if (ty >= h) return TILE.WALL;             // sealed floor
        return data[ty * w + tx];
      },

      set: function (tx, ty, value) {
        if (!map.inside(tx, ty)) return;
        data[ty * w + tx] = value;
      },

      isSolid: function (tx, ty) { return map.get(tx, ty) === TILE.WALL; },
      isPlatform: function (tx, ty) { return map.get(tx, ty) === TILE.PLATFORM; },
      isSpike: function (tx, ty) { return map.get(tx, ty) === TILE.SPIKE; },
      isDeath: function (tx, ty) { return map.get(tx, ty) === TILE.DEATHSPIKE; },
      isDoor: function (tx, ty) { return map.get(tx, ty) === TILE.DOOR; },

      // Any solid or platform tile blocks a spawn point.
      isBlocked: function (tx, ty) {
        const t = map.get(tx, ty);
        return t === TILE.WALL || t === TILE.PLATFORM;
      },

      /* Does an entity box touch a spike? Hazards use a smaller box than the
         tile so brushing the edge does not count as a hit. */
      spikeOverlap: function (x, y, bw, bh) {
        const x0 = Math.floor(x / T), x1 = Math.floor((x + bw - 0.01) / T);
        const y0 = Math.floor(y / T), y1 = Math.floor((y + bh - 0.01) / T);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (!map.isSpike(tx, ty)) continue;
            const sy = ty * T + 8; // spikes only occupy the lower half
            if (y + bh > sy) return true;
          }
        }
        return false;
      },

      // Anything touching the killing floor dies outright, no damage roll.
      deathOverlap: function (x, y, bw, bh) {
        const x0 = Math.floor(x / T), x1 = Math.floor((x + bw - 0.01) / T);
        const y0 = Math.floor(y / T), y1 = Math.floor((y + bh - 0.01) / T);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (map.isDeath(tx, ty)) return true;
          }
        }
        return false;
      },

      /* Line the bottom row of every bottomless column with death spikes, and
         report which columns are pits so other systems can avoid them. */
      sealPits: function () {
        const pits = [];
        for (let tx = 0; tx < w; tx++) {
          let open = true;
          for (let ty = 0; ty < h; ty++) {
            const t = map.get(tx, ty);
            if (t === TILE.WALL || t === TILE.PLATFORM) { open = false; break; }
          }
          if (!open) continue;
          map.set(tx, h - 1, TILE.DEATHSPIKE);
          pits.push(tx);
        }
        map.pitColumns = pits;
        return pits;
      },

      isPitColumn: function (tx) {
        return map.pitColumns ? map.pitColumns.indexOf(tx) >= 0 : false;
      },

      // Drop a rectangle of tiles — used by the level generator.
      fill: function (tx, ty, tw, th, value) {
        for (let y = ty; y < ty + th; y++) {
          for (let x = tx; x < tx + tw; x++) map.set(x, y, value);
        }
      },

      /* Y position that puts a sprite of the given height flat on the floor.
         Props used to be placed at their marker's tile row, which left NPCs and
         furniture hovering above the ground. */
      groundY: function (px, height) {
        const tx = Math.floor(px / T);
        const ty = Math.floor(0);
        const floor = map.floorBelow(tx, ty);
        return floor - height;
      },

      // First solid surface at or below a tile column, in pixels.
      floorBelow: function (tx, ty) {
        for (let y = ty; y < h; y++) {
          if (map.isSolid(tx, y) || map.isPlatform(tx, y)) return y * T;
        }
        return h * T;
      }
    };

    return map;
  }

  function draw(map, frame, biome) {
    const R = DS.R;
    const S = (biome && biome.tile) || DS.SPR.tile;
    const ox = R.camOffsetX(), oy = R.camOffsetY();

    const x0 = Math.max(0, Math.floor(ox / T));
    const x1 = Math.min(map.w - 1, Math.floor((ox + DS.C.W) / T));
    const y0 = Math.max(0, Math.floor(oy / T));
    const y1 = Math.min(map.h - 1, Math.floor((oy + DS.C.H) / T));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = map.get(tx, ty);
        if (t === TILE.EMPTY) continue;
        const px = tx * T, py = ty * T;

        if (t === TILE.WALL) {
          // Exposed top faces get the lit variant so ground reads clearly.
          R.spr(map.get(tx, ty - 1) === TILE.EMPTY ? S.floor : S.wall, px, py);
        } else if (t === TILE.PLATFORM) {
          R.spr(S.platform, px, py);
        } else if (t === TILE.SPIKE) {
          R.spr(S.spike, px, py + 8);
        } else if (t === TILE.DEATHSPIKE) {
          // Taller, redder, and lit from below so a pit reads as lethal.
          R.rect(px, py + 4, T, T - 4, '#1a0508');
          R.spr(DS.SPR.tile.deathspike, px, py + 2);
          DS.Map.glow(R, px + 8, py + 8, 16, 'rgba(192,48,60,0.22)');
        } else if (t === TILE.DOOR) {
          // The 32px doorway is drawn once, from its top tile.
          if (map.get(tx, ty - 1) !== TILE.DOOR) R.spr(S.door, px, py);
        }
      }
    }

    // Decor sits on top of tiles and flickers on its own cycle.
    for (let i = 0; i < map.decor.length; i++) {
      const d = map.decor[i];
      if (d.x < ox - 32 || d.x > ox + DS.C.W + 32) continue;

      if (d.kind === 'torch') {
        // Body stays put; only the flame cycles.
        const frames = S.torchFrames || [S.torch];
        const step = Math.floor((frame + d.seed) / 8) % frames.length;
        R.spr(frames[step], d.x, d.y);
      } else if (d.kind === 'table') {
        R.spr(S.table, d.x, d.y);
      } else if (d.kind === 'merchant') {
        const idle = DS.SPR.merchant[Math.floor(frame / 40) % 2];
        R.spr(idle, d.x, d.y);
        R.spr(DS.SPR.coin, d.x + 2, d.y - 10 + (Math.sin(frame * 0.06) * 1.5));
      }
    }
  }

  function glow(R, x, y, radius, color) {
    const cx = R.ctx;
    const g = cx.createRadialGradient(
      x - R.camOffsetX(), y - R.camOffsetY(), 0,
      x - R.camOffsetX(), y - R.camOffsetY(), radius
    );
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g;
    cx.fillRect(
      x - R.camOffsetX() - radius, y - R.camOffsetY() - radius,
      radius * 2, radius * 2
    );
  }

  DS.TILE = TILE;
  DS.Map = { create: create, draw: draw, glow: glow };
})(window.DS);
