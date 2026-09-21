/* Parallax backdrops.

   The old background was two rows of grey rectangles drawn every frame. This
   bakes three real layers per biome once at load — sky, mid architecture, near
   silhouette — into offscreen canvases, and the render loop just blits them at
   different scroll rates. Baking costs nothing per frame and lets each layer
   carry actual detail: dithered gradients, arch mouldings, stalactites, cell
   bars, crystal clusters.

   Layers are 640 wide so they loop cleanly across the 320-wide view, and the
   motif spacing always divides 640 so the seam never shows. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const LAYER_W = 640;
  const LAYER_H = C.H;          // 180

  /* Layers are baked at C.RS times the logical size. Every motif below still
     works in logical units -- the layer context is pre-scaled -- but `px` snaps
     to the DEVICE grid, so a half-unit moulding is a real pixel rather than
     something that rounds away. The dithered sky is generated at full device
     resolution, which is where most of the extra detail actually lands. */
  const D = C.RS || 1;
  const SUB = 1 / D;            // one device pixel, in logical units

  function canvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w * D; cv.height = h * D;
    cv.uw = w; cv.uh = h;
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.setTransform(D, 0, 0, D, 0, 0);
    return { cv: cv, cx: cx };
  }

  /* Ordered 4x4 Bayer dither. Blending two colours through this instead of a
     real gradient keeps every pixel on-palette, which is what makes the result
     read as pixel art rather than as a photo shrunk down. */
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  /* Vertical two-tone gradient, dithered. Each row picks between the two
     nearest quantised steps using the Bayer threshold, so bands break up into
     stipple instead of hard stripes. */
  function ditherGradient(cx, w, h, topHex, botHex, steps) {
    const top = hexToRgb(topHex), bot = hexToRgb(botHex);
    const img = cx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const scaled = t * (steps - 1);
      const lo = Math.floor(scaled);
      const frac = scaled - lo;
      const cLo = mix(top, bot, lo / (steps - 1));
      const cHi = mix(top, bot, Math.min(lo + 1, steps - 1) / (steps - 1));
      for (let x = 0; x < w; x++) {
        const threshold = BAYER[y & 3][x & 3] / 16;
        const c = frac > threshold ? cHi : cLo;
        const i = (y * w + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
  }

  // --- shared shape helpers -------------------------------------------------

  function snap(v) { return Math.round(v * D) / D; }

  function px(cx, x, y, w, h, color) {
    cx.fillStyle = color;
    cx.fillRect(snap(x), snap(y), Math.max(SUB, snap(w)), Math.max(SUB, snap(h)));
  }

  /* A gothic arch: two jambs, a stepped head, and a keystone. Stepping the head
     in bands rather than curving it keeps every edge on the pixel grid. */
  function arch(cx, x, base, w, h, dark, mid, light) {
    const top = base - h;
    px(cx, x, top + 12, w, h - 12, dark);
    px(cx, x + 2, top + 12, 2, h - 12, mid);
    px(cx, x + w - 4, top + 12, 2, h - 12, mid);
    px(cx, x + 3, top + 8, w - 6, 5, dark);
    px(cx, x + 6, top + 4, w - 12, 5, dark);
    px(cx, x + 10, top, w - 20, 5, dark);
    px(cx, x + w / 2 - 2, top, 4, 4, light);
    // half-unit mouldings: a lit top lip on each step and on the jambs
    px(cx, x + 3, top + 8, w - 6, SUB, mid);
    px(cx, x + 6, top + 4, w - 12, SUB, mid);
    px(cx, x + 10, top, w - 20, SUB, light);
    px(cx, x + 2, top + 12, SUB, h - 12, light);
    px(cx, x + w - 4, top + 12, SUB, h - 12, light);
    // hollow the opening so the sky reads through the colonnade
    cx.clearRect(snap(x + 6), snap(top + 16), snap(w - 12), snap(h - 16));
  }

  function stalactite(cx, x, y, w, len, dark, light) {
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const ww = Math.max(1, Math.round(w * (1 - t)));
      px(cx, x + (w - ww) / 2, y + i, ww, 1, i < len * 0.3 ? light : dark);
    }
  }

  function bars(cx, x, y, w, h, dark, light) {
    for (let bx = x; bx < x + w; bx += 5) {
      px(cx, bx, y, 2, h, dark);
      px(cx, bx, y, 1, h, light);
    }
    px(cx, x, y, w, 2, dark);
    px(cx, x, y + h - 2, w, 2, dark);
  }

  function crystal(cx, x, base, w, h, dark, mid, light) {
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const ww = Math.max(1, Math.round(w * (1 - t * 0.85)));
      px(cx, x + (w - ww) / 2, base - i, ww, 1, dark);
      if (ww > 2) px(cx, x + (w - ww) / 2 + 1, base - i, 1, 1, t > 0.4 ? light : mid);
    }
  }

  function rib(cx, x, y, h, w, dark, light) {
    for (let i = 0; i < h; i++) {
      const bow = Math.round(Math.sin((i / h) * Math.PI) * w);
      px(cx, x + bow, y + i, 2, 1, dark);
      px(cx, x + bow, y + i, 1, 1, light);
    }
  }

  function chain(cx, x, y, len, dark, light) {
    for (let i = 0; i < len; i += 4) {
      px(cx, x, y + i, 2, 3, dark);
      px(cx, x, y + i, 1, 1, light);
    }
  }

  // --- per-biome mid layers -------------------------------------------------

  const MID = {
    halls: function (cx, p, rng) {
      const base = LAYER_H - 18;
      for (let x = 0; x < LAYER_W; x += 80) {
        arch(cx, x + 8, base, 64, 104, p.dark, p.mid, p.light);
        if (rng.chance(0.5)) chain(cx, x + 40, base - 104, 26, p.dark, p.mid);
      }
      px(cx, 0, base, LAYER_W, 3, p.dark);
    },

    caves: function (cx, p, rng) {
      const base = LAYER_H - 14;
      for (let x = 0; x < LAYER_W; x += 8) {
        const len = 10 + Math.round(Math.sin(x * 0.11) * 6) + rng.int(0, 10);
        stalactite(cx, x, 22, 7, len, p.dark, p.mid);
      }
      for (let x = 0; x < LAYER_W; x += 16) {
        const hgt = 8 + rng.int(0, 12);
        px(cx, x, base - hgt, 12, hgt, p.dark);
        px(cx, x + 1, base - hgt, 3, hgt, p.mid);
      }
      px(cx, 0, base, LAYER_W, 4, p.mid);
    },

    prison: function (cx, p, rng) {
      const base = LAYER_H - 16;
      for (let x = 0; x < LAYER_W; x += 64) {
        px(cx, x, base - 76, 60, 76, p.dark);
        bars(cx, x + 8, base - 62, 44, 50, p.mid, p.light);
        px(cx, x, base - 78, 60, 4, p.mid);
        if (rng.chance(0.6)) chain(cx, x + 56, base - 74, 20, p.mid, p.light);
      }
      px(cx, 0, base, LAYER_W, 3, p.dark);
    },

    vault: function (cx, p, rng) {
      const base = LAYER_H - 16;
      for (let x = 0; x < LAYER_W; x += 40) {
        px(cx, x + 12, base - 88, 16, 88, p.dark);
        px(cx, x + 14, base - 88, 3, 88, p.mid);
      }
      for (let x = 0; x < LAYER_W; x += 12) {
        crystal(cx, x, base, 6 + rng.int(0, 5), 14 + rng.int(0, 22), p.dark, p.mid, p.light);
      }
      px(cx, 0, base, LAYER_W, 3, p.dark);
    },

    nest: function (cx, p, rng) {
      const base = LAYER_H - 14;
      for (let x = 0; x < LAYER_W; x += 20) {
        rib(cx, x, 20, base - 30, 8, p.dark, p.mid);
      }
      for (let x = 0; x < LAYER_W; x += 26) {
        const r = 5 + rng.int(0, 4);
        px(cx, x + 6, base - r * 2, r * 2, r * 2, p.dark);
        px(cx, x + 8, base - r * 2 + 2, r, r, p.mid);
      }
      px(cx, 0, base, LAYER_W, 4, p.dark);
    },

    throne: function (cx, p, rng) {
      const base = LAYER_H - 16;
      for (let x = 0; x < LAYER_W; x += 80) {
        px(cx, x + 16, base - 96, 20, 96, p.dark);
        px(cx, x + 18, base - 96, 4, 96, p.light);
        px(cx, x + 12, base - 100, 28, 6, p.mid);
        // ooze running down the gilding
        const drip = 20 + rng.int(0, 40);
        px(cx, x + 24, base - 94, 3, drip, '#2f7d4f');
        px(cx, x + 24, base - 94 + drip, 3, 4, '#5cbf62');
      }
      px(cx, 0, base, LAYER_W, 3, p.dark);
      px(cx, 0, base + 3, LAYER_W, 2, '#2f7d4f');
    }
  };

  // --- near layer -----------------------------------------------------------

  /* Foreground pillars sit hard left and hard right with a wide gap between,
     so the play space stays readable. Near-black, no interior detail — this
     layer is a frame, not scenery. */
  function nearLayer(cx, ink, rng) {
    const base = LAYER_H;
    for (let x = 0; x < LAYER_W; x += 160) {
      const w = 22 + rng.int(0, 10);
      const h = 120 + rng.int(0, 40);
      px(cx, x, base - h, w, h, ink);
      px(cx, x - 3, base - h, w + 6, 6, ink);
      px(cx, x - 2, base - 14, w + 4, 14, ink);
    }
    // rubble along the very bottom so the layer meets the floor
    for (let x = 0; x < LAYER_W; x += 7) {
      if (rng.chance(0.45)) px(cx, x, base - 3 - rng.int(0, 3), 3 + rng.int(0, 4), 6, ink);
    }
  }

  // --- sky ceiling ----------------------------------------------------------

  function skyLayer(cx, biome, rng) {
    /* putImageData ignores the transform, so the gradient is generated at the
       real backing-store size: twice the rows and columns of stipple. */
    cx.save();
    cx.setTransform(1, 0, 0, 1, 0, 0);
    ditherGradient(cx, C.W * D, LAYER_H * D, biome.sky[0], biome.sky[1], 6 * D);
    cx.restore();
    // A vaulted ceiling silhouette, barely darker than the sky behind it.
    cx.globalAlpha = 0.5;
    for (let x = 0; x < C.W; x += 48) {
      const h = 14 + Math.round(Math.sin(x * 0.07) * 5);
      px(cx, x, 0, 48, h, biome.sky[1]);
      px(cx, x + 6, h, 36, 4, biome.sky[1]);
    }
    cx.globalAlpha = 1;
    // Dust motes, static — the particle system handles the moving ones.
    for (let i = 0; i < 40 * D; i++) {
      px(cx, rng.int(0, C.W - 1) + rng.int(0, D - 1) * SUB,
         rng.int(10, LAYER_H - 30) + rng.int(0, D - 1) * SUB,
         SUB, SUB, biome.dust);
    }
  }

  // --- baking ---------------------------------------------------------------

  /* Mid-layer palettes derive from the biome's own tile palette so the
     backdrop always belongs to the floor it sits behind. */
  function midPalette(biome) {
    const p = biome.pal || {};
    return {
      dark: p.d || '#2a2740',
      mid: p.D || '#514c72',
      light: p.g || '#6f6a90'
    };
  }

  const cache = {};

  function bake(biome, index) {
    const rng = DS.makeRng(0x5eed + index * 977);
    const sky = canvas(C.W, LAYER_H);
    const mid = canvas(LAYER_W, LAYER_H);
    const near = canvas(LAYER_W, LAYER_H);

    skyLayer(sky.cx, biome, rng);
    (MID[biome.key] || MID.halls)(mid.cx, midPalette(biome), rng);
    nearLayer(near.cx, '#0d0b14', rng);

    return { sky: sky.cv, mid: mid.cv, near: near.cv };
  }

  function layersFor(biome) {
    const key = biome && biome.key ? biome.key : 'halls';
    if (!cache[key]) {
      const list = DS.Biomes.LIST;
      let index = 0;
      for (let i = 0; i < list.length; i++) if (list[i].key === key) index = i;
      cache[key] = bake(biome, index);
    }
    return cache[key];
  }

  DS.Backdrop = {
    layersFor: layersFor,
    W: LAYER_W,          // logical width; the canvas itself is D times wider
    H: LAYER_H
  };
})(window.DS);
