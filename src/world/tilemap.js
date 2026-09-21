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
    DEATHSPIKE: 5,
    /* Passable tiles. Water slows and drowns; rope is a climbing surface. Both
       are transparent to every solid query, so nothing that walks on the grid
       has to learn about them. */
    WATER: 6,
    ROPE: 7
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
      isWater: function (tx, ty) { return map.get(tx, ty) === TILE.WATER; },
      isRope: function (tx, ty) { return map.get(tx, ty) === TILE.ROPE; },

      // Pixel-space helpers, which is how the player asks about both.
      waterAt: function (px, py) {
        return map.isWater(Math.floor(px / T), Math.floor(py / T));
      },
      ropeAt: function (px, py) {
        return map.isRope(Math.floor(px / T), Math.floor(py / T));
      },

      // Does any part of a box sit in water?
      waterOverlap: function (x, y, bw, bh) {
        const x0 = Math.floor(x / T), x1 = Math.floor((x + bw - 0.01) / T);
        const y0 = Math.floor(y / T), y1 = Math.floor((y + bh - 0.01) / T);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (map.isWater(tx, ty)) return true;
          }
        }
        return false;
      },

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

      /* Give every bottomless run of columns a bottom, and decide what kind of
         bottom it is. Two kinds, rolled per pit rather than per level, so one
         floor can hold both:

           chasm  the killing floor - touching it ends the run outright
           trench a shallow bed of spikes three tiles down - it wounds you and
                  costs you the climb back out, but the run survives it

         Falling used to be one flat rule (always fatal), which made every gap
         in the floor the same decision. Mixing them means a hole has to be
         read before it is jumped. `rng` is optional: without one every pit is
         a chasm, which is what the boss and safe rooms want. */
      sealPits: function (rng, opts) {
        const chasmOdds = (opts && opts.chasmOdds != null) ? opts.chasmOdds : 0.55;
        const pits = [];
        const spiked = [];

        /* A column with no floor under its opening. The roof does not count -
           a room with a stone ceiling still has holes in its floor, and
           testing the whole column for any solid at all meant those holes
           were never given a bottom and swallowed the player into the dead
           space under the map. */
        function bottomless(tx) {
          let ty = 0;
          while (ty < h && map.isBlocked(tx, ty)) ty++;
          if (ty >= h) return false;               // solid rock, not a column
          for (; ty < h; ty++) {
            if (map.isBlocked(tx, ty)) return false;
          }
          return true;
        }

        // The walking surface either side of a run, so a trench knows how deep
        // it is allowed to be.
        function lipRow(tx) {
          const y = map.groundBelow(tx);
          return y >= h * T ? h - 2 : Math.floor(y / T);
        }

        let run = -1;
        for (let tx = 0; tx <= w; tx++) {
          const open = tx < w && bottomless(tx);
          if (open && run < 0) run = tx;
          if (open || run < 0) continue;

          const from = run, to = tx - 1;
          run = -1;

          const trench = rng && !rng.chance(chasmOdds);
          if (!trench) {
            for (let x = from; x <= to; x++) {
              map.set(x, h - 1, TILE.DEATHSPIKE);
              pits.push(x);
            }
            continue;
          }

          /* A trench is floored with rock and topped with spikes, three rows
             under the lip it opens from - deep enough to hurt, shallow enough
             that a jump gets you out again. */
          const lip = Math.min(lipRow(from - 1), lipRow(to + 1));
          const bed = Math.min(h - 1, lip + 3);
          for (let x = from; x <= to; x++) {
            for (let y = bed; y < h; y++) map.set(x, y, TILE.WALL);
            map.set(x, bed - 1, TILE.SPIKE);
            spiked.push(x);
          }
        }

        map.pitColumns = pits;
        map.trenchColumns = spiked;
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

      /* The walking surface of a column, in pixels.

         `floorBelow` answers "first solid at or below this row", which is the
         right question everywhere except the top of a roofed room - there it
         answers with the ceiling, and every prop placed by it ends up stuck to
         the rock overhead. This skips the roof first and then asks the same
         question, so a cave, a mountain shaft and an open corridor all report
         the ground the player actually stands on. */
      groundBelow: function (tx) {
        let ty = 0;
        while (ty < h && map.isBlocked(tx, ty)) ty++;
        for (; ty < h; ty++) {
          if (map.isBlocked(tx, ty)) return ty * T;
        }
        return h * T;
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
    const is3D = DS.R3D && DS.R3D.isEnabled;
    const vox = DS.R3D && DS.R3D.voxels;
    const R = DS.R;
    const S = (biome && biome.tile) || DS.SPR.tile;
    const ox = R.camOffsetX(), oy = R.camOffsetY();

    /* In 3D mode the architecture comes from Three.js, but water and ropes
       have no 3D stand-in: drawing them on the 2D overlay keeps the flooded
       rooms and mountain shafts playable (and visible) in both modes. The
       blit path is shared, so everything after this is mode-agnostic. */
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
          if (!is3D) {
            // Exposed top faces get the lit variant so ground reads clearly.
            R.spr(map.get(tx, ty - 1) === TILE.EMPTY ? S.floor : S.wall, px, py);
          }
        } else if (is3D) {
          // 3D mode: the wall/platform/spike/door geometry is Three.js's job;
          // only water and ropes ride on the 2D overlay.
          if (t === TILE.WATER) {
            R.rect(px, py, T, T, 'rgba(22,50,79,0.72)');
            if (!map.isWater(tx, ty + 1) && !map.isBlocked(tx, ty + 1)) {
              R.rect(px, py + T - 2, T, 2, 'rgba(11,26,42,0.7)');
            }
          } else if (t === TILE.ROPE) {
            drawRope(R, map, tx, ty, frame);
          }
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
        } else if (t === TILE.WATER) {
          // The body of the water only; the lit surface is a later pass so it
          // can sit over whatever is swimming in it.
          R.rect(px, py, T, T, 'rgba(22,50,79,0.72)');
          if (!map.isWater(tx, ty + 1) && !map.isBlocked(tx, ty + 1)) {
            R.rect(px, py + T - 2, T, 2, 'rgba(11,26,42,0.7)');
          }
        } else if (t === TILE.ROPE) {
          drawRope(R, map, tx, ty, frame);
        }
      }
    }

    // Decor sits on top of tiles and flickers on its own cycle.
    for (let i = 0; i < map.decor.length; i++) {
      const d = map.decor[i];
      if (d.x < ox - 32 || d.x > ox + DS.C.W + 32) continue;

      if (d.kind === 'torch') {
        if (!is3D) {
          // Body stays put; only the flame cycles.
          const frames = S.torchFrames || [S.torch];
          const step = Math.floor((frame + d.seed) / 8) % frames.length;
          R.spr(frames[step], d.x, d.y);
        }
      } else if (d.kind === 'table') {
        if (!vox) R.spr(S.table, d.x, d.y);
      } else if (d.kind === 'merchant') {
        if (vox) continue;   // the merchant is a 3D model now
        // Shares the hero silhouette, so it needs the same 12x17 offset.
        const idle = DS.SPR.merchant[Math.floor(frame / 40) % 2];
        R.spr(idle, d.x - 2, d.y - 3);
        R.spr(DS.SPR.coin, d.x + 2, d.y - 13 + (Math.sin(frame * 0.06) * 1.5));
      }
    }
  }

  /* A hanging rope: a braided line with knots every few pixels, and a fixing
     ring wherever it is anchored to something solid. Ropes are the only way up
     and down a mountain shaft, so they are drawn thick enough to read as a
     handhold rather than as a crack in the wall. */
  function drawRope(R, map, tx, ty, frame) {
    const px = tx * T, py = ty * T;
    // A slow sway, strongest the further the rope hangs from its anchor.
    const anchor = map.isRope(tx, ty - 1) ? 0 : 1;
    const sway = anchor ? 0 : Math.sin(frame * 0.03 + ty * 0.5) * 0.6;
    const cx = Math.round(px + T / 2 + sway);

    if (anchor) {
      R.rect(px + 3, py, 10, 3, '#5c3f2a');
      R.rect(px + 4, py + 1, 8, 1, '#8a6340');
    }
    R.rect(cx - 2, py, 4, T, '#5c3f2a');
    R.rect(cx - 1, py, 2, T, '#b98d5c');
    for (let k = (ty % 2) * 3; k < T; k += 6) {
      R.rect(cx - 2, py + k, 4, 2, '#8a6340');
      R.rect(cx - 2, py + k, 1, 2, '#5c3f2a');
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
