/* Palette, bitmap font, and the sprite builder.
   Every sprite in the game is authored as rows of single characters that index
   into PAL, then baked once into an offscreen canvas at load time. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  // 30-colour palette. '.' means transparent and never appears here.
  const PAL = {
    k: '#0d0b12', K: '#1c1a2b', x: '#2a2740', d: '#3a3654', D: '#514c72',
    g: '#6f6a90', G: '#9b96b8', w: '#d8d5e8', W: '#ffffff',

    r: '#6e1b28', R: '#c0303c', o: '#e8743b', y: '#f2c14e', Y: '#fff0a8',

    n: '#2e2018', N: '#5c3f2a', b: '#8a6340', B: '#b98d5c',

    e: '#1b4436', E: '#2f7d4f', l: '#5cbf62', L: '#a3e86b',

    c: '#16324f', C: '#2f6fa8', s: '#4fb3e0', S: '#a8e4ff',

    p: '#3c2154', P: '#7f45b8', m: '#c86ee0',

    u: '#c98f63', U: '#f0c79c', t: '#8a3b2a', f: '#e0dff0'
  };

  /* 5x7 bitmap font. Each glyph is seven rows of five bits, MSB = leftmost.
     Uppercase only — lowercase input is folded before lookup. */
  const GLYPHS = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
    C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
    E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 19, 17, 17, 14], H: [17, 17, 17, 31, 17, 17, 17],
    I: [31, 4, 4, 4, 4, 4, 31],      J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 17, 17, 17, 17], N: [17, 25, 25, 21, 19, 19, 17],
    O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30],   T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
    W: [17, 17, 17, 17, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4],     Z: [31, 1, 2, 4, 8, 16, 31],

    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
    2: [14, 17, 1, 2, 4, 8, 31],     3: [30, 1, 1, 14, 1, 1, 30],
    4: [2, 6, 10, 18, 31, 2, 2],     5: [31, 16, 30, 1, 1, 17, 14],
    6: [14, 17, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
    8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 17, 14],

    ' ': [0, 0, 0, 0, 0, 0, 0],      '.': [0, 0, 0, 0, 0, 12, 12],
    ',': [0, 0, 0, 0, 12, 12, 8],    ':': [0, 12, 12, 0, 12, 12, 0],
    '!': [4, 4, 4, 4, 4, 0, 4],      '?': [14, 17, 1, 2, 4, 0, 4],
    '-': [0, 0, 0, 14, 0, 0, 0],     '+': [0, 4, 4, 31, 4, 4, 0],
    '/': [1, 1, 2, 4, 8, 16, 16],    '%': [17, 1, 2, 4, 8, 16, 17],
    "'": [4, 4, 0, 0, 0, 0, 0],      '"': [10, 10, 0, 0, 0, 0, 0],
    '(': [2, 4, 8, 8, 8, 4, 2],      ')': [8, 4, 2, 2, 2, 4, 8],
    '[': [6, 4, 4, 4, 4, 4, 6],      ']': [12, 4, 4, 4, 4, 4, 12],
    '<': [1, 2, 4, 8, 4, 2, 1],      '>': [16, 8, 4, 2, 4, 8, 16],
    '=': [0, 0, 31, 0, 31, 0, 0],    '_': [0, 0, 0, 0, 0, 0, 31],
    '*': [0, 21, 14, 31, 14, 21, 0], '#': [10, 31, 10, 31, 10, 0, 0],
    '@': [14, 17, 23, 21, 22, 16, 14], '~': [0, 0, 9, 21, 18, 0, 0],
    '|': [4, 4, 4, 4, 4, 4, 4]
  };

  const GLYPH_W = 5, GLYPH_H = 7, GLYPH_GAP = 1;

  /* A 3x5 micro font for key caps and dense numbers. The 5x7 face is the right
     size for prose, but a key cap built from it ends up bigger than the thing
     it labels. Same encoding, three bits per row. */
  const SMALL = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3],
    D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
    G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7],
    J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
    M: [5, 7, 7, 5, 5], N: [5, 7, 7, 7, 5], O: [2, 5, 5, 5, 2],
    P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
    S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 3],
    V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
    Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],

    0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7],
    3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6],
    6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7],
    9: [7, 5, 7, 1, 6],

    ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], '-': [0, 0, 7, 0, 0],
    '/': [1, 1, 2, 4, 4], ':': [0, 2, 0, 2, 0], '+': [0, 2, 7, 2, 0],
    '%': [5, 1, 2, 4, 5], '<': [1, 2, 4, 2, 1], '>': [4, 2, 1, 2, 4],
    '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], ',': [0, 0, 0, 2, 4]
  };

  const SMALL_W = 3, SMALL_H = 5, SMALL_GAP = 1;

  function makeCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    return cv;
  }

  /* rows: array of equal-length strings. Characters index PAL; '.' or ' ' is
     transparent. Returns a canvas ready to blit. */
  function makeSprite(rows, overrides) {
    const h = rows.length;
    const w = rows[0].length;
    const cv = makeCanvas(w, h);
    const cx = cv.getContext('2d');
    const pal = overrides ? Object.assign({}, PAL, overrides) : PAL;

    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ' || ch === undefined) continue;
        const col = pal[ch];
        if (!col) continue;
        cx.fillStyle = col;
        cx.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  // Build several sprites at once from a map of name -> rows.
  function makeSheet(map, overrides) {
    const out = {};
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        out[key] = makeSprite(map[key], overrides);
      }
    }
    return out;
  }

  /* Re-render a sprite with every opaque pixel replaced by one colour.
     Used for hit flashes. Results are cached because this is called from the
     render loop — building a canvas per frame per enemy would be wasteful. */
  const silhouetteCache = new Map();

  function silhouette(sprite, color) {
    let byColor = silhouetteCache.get(sprite);
    if (!byColor) { byColor = new Map(); silhouetteCache.set(sprite, byColor); }
    const cached = byColor.get(color);
    if (cached) return cached;

    const cv = makeSilhouette(sprite, color);
    byColor.set(color, cv);
    return cv;
  }

  function makeSilhouette(sprite, color) {
    const cv = makeCanvas(sprite.width, sprite.height);
    const cx = cv.getContext('2d');
    cx.drawImage(sprite, 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  // Horizontal mirror, baked once so the render loop never has to transform.
  function flipped(sprite) {
    const cv = makeCanvas(sprite.width, sprite.height);
    const cx = cv.getContext('2d');
    cx.translate(sprite.width, 0);
    cx.scale(-1, 1);
    cx.drawImage(sprite, 0, 0);
    return cv;
  }

  // Uniform integer upscale — used for the title logo and big item icons.
  function scaled(sprite, factor) {
    const cv = makeCanvas(sprite.width * factor, sprite.height * factor);
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(sprite, 0, 0, cv.width, cv.height);
    return cv;
  }

  DS.PAL = PAL;
  DS.Art = {
    GLYPHS: GLYPHS,
    GLYPH_W: GLYPH_W,
    GLYPH_H: GLYPH_H,
    GLYPH_GAP: GLYPH_GAP,
    SMALL: SMALL,
    SMALL_W: SMALL_W,
    SMALL_H: SMALL_H,
    SMALL_GAP: SMALL_GAP,
    makeCanvas: makeCanvas,
    makeSprite: makeSprite,
    makeSheet: makeSheet,
    silhouette: silhouette,
    flipped: flipped,
    scaled: scaled
  };
})(window.DS);
