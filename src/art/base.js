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

  // >>> generated font tables (tools/art/font.py)
  /* Scale2x of GLYPHS: 10x14, drawn at half-unit steps so the face
     occupies the same 5x7 LOGICAL cell and no layout moves. The 3x5
     micro face is deliberately NOT doubled -- see tools/art/font.py. */
  const GLYPHS_HD = {
    A: [252, 510, 903, 771, 771, 903, 1023, 1023, 903, 771, 771, 771, 771, 771],
    B: [508, 1022, 903, 771, 771, 903, 1020, 1020, 903, 771, 771, 903, 1022, 508],
    C: [252, 510, 903, 771, 768, 768, 768, 768, 768, 768, 771, 903, 510, 252],
    D: [508, 1022, 903, 771, 771, 771, 771, 771, 771, 771, 771, 903, 1022, 508],
    E: [511, 1023, 896, 768, 768, 896, 1020, 1020, 896, 768, 768, 896, 1023, 511],
    F: [511, 1023, 896, 768, 768, 896, 1020, 1020, 896, 768, 768, 768, 768, 768],
    G: [252, 510, 903, 771, 768, 768, 782, 783, 775, 771, 771, 903, 510, 252],
    H: [771, 771, 771, 771, 771, 903, 1023, 1023, 903, 771, 771, 771, 771, 771],
    I: [1023, 1023, 120, 48, 48, 48, 48, 48, 48, 48, 48, 120, 1023, 1023],
    J: [63, 63, 30, 12, 12, 12, 12, 12, 12, 12, 780, 924, 504, 240],
    K: [771, 775, 782, 796, 824, 816, 960, 960, 816, 824, 796, 782, 775, 771],
    L: [768, 768, 768, 768, 768, 768, 768, 768, 768, 768, 768, 896, 1023, 511],
    M: [771, 903, 975, 975, 819, 819, 771, 771, 771, 771, 771, 771, 771, 771],
    N: [771, 899, 899, 963, 963, 931, 819, 819, 791, 783, 783, 775, 775, 771],
    O: [252, 510, 903, 771, 771, 771, 771, 771, 771, 771, 771, 903, 510, 252],
    P: [508, 1022, 903, 771, 771, 903, 1022, 1020, 896, 768, 768, 768, 768, 768],
    Q: [252, 510, 903, 771, 771, 771, 771, 771, 819, 819, 780, 908, 499, 243],
    R: [508, 1022, 903, 771, 771, 903, 1022, 1020, 816, 816, 796, 782, 775, 771],
    S: [255, 511, 896, 768, 768, 896, 508, 254, 7, 3, 3, 7, 1022, 1020],
    T: [1023, 1023, 120, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48],
    U: [771, 771, 771, 771, 771, 771, 771, 771, 771, 771, 771, 903, 510, 252],
    V: [771, 771, 771, 771, 771, 771, 771, 771, 771, 903, 462, 204, 120, 48],
    W: [771, 771, 771, 771, 771, 771, 771, 771, 819, 819, 975, 975, 903, 771],
    X: [771, 771, 771, 903, 462, 204, 48, 48, 204, 462, 903, 771, 771, 771],
    Y: [771, 771, 771, 903, 462, 204, 120, 48, 48, 48, 48, 48, 48, 48],
    Z: [1022, 1023, 3, 3, 14, 28, 56, 112, 224, 448, 768, 768, 1023, 511],
    0: [252, 510, 899, 771, 783, 799, 819, 819, 995, 963, 771, 775, 510, 252],
    1: [48, 112, 240, 240, 112, 48, 48, 48, 48, 48, 48, 120, 252, 252],
    2: [252, 510, 903, 771, 3, 7, 14, 28, 56, 112, 192, 448, 1023, 1023],
    3: [1020, 1022, 7, 3, 3, 7, 252, 252, 7, 3, 3, 7, 1022, 1020],
    4: [12, 28, 60, 124, 204, 460, 780, 798, 1023, 511, 30, 12, 12, 12],
    5: [511, 1023, 768, 768, 1020, 510, 7, 3, 3, 3, 771, 903, 510, 252],
    6: [252, 510, 903, 771, 768, 896, 1020, 1022, 903, 771, 771, 903, 510, 252],
    7: [1022, 1023, 3, 3, 14, 28, 56, 112, 224, 192, 192, 192, 192, 192],
    8: [252, 510, 903, 771, 771, 903, 252, 252, 903, 771, 771, 903, 510, 252],
    9: [252, 510, 903, 771, 771, 903, 511, 255, 7, 3, 771, 903, 510, 252],
    ' ': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    '.': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 96, 240, 240, 96],
    ',': [0, 0, 0, 0, 0, 0, 0, 0, 96, 240, 240, 224, 224, 192],
    ':': [0, 0, 96, 240, 240, 96, 0, 0, 96, 240, 240, 96, 0, 0],
    '!': [48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 0, 0, 48, 48],
    '?': [252, 510, 903, 771, 3, 7, 14, 28, 56, 48, 0, 0, 48, 48],
    '-': [0, 0, 0, 0, 0, 0, 252, 252, 0, 0, 0, 0, 0, 0],
    '+': [0, 0, 48, 48, 48, 120, 1023, 1023, 120, 48, 48, 48, 0, 0],
    '/': [3, 3, 3, 7, 14, 28, 56, 112, 224, 448, 896, 768, 768, 768],
    '%': [771, 771, 3, 7, 14, 28, 56, 112, 224, 448, 896, 768, 771, 771],
    '"': [204, 204, 204, 204, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    '(': [12, 28, 56, 112, 224, 192, 192, 192, 192, 224, 112, 56, 28, 12],
    ')': [192, 224, 112, 56, 28, 12, 12, 12, 12, 28, 56, 112, 224, 192],
    '[': [28, 60, 56, 48, 48, 48, 48, 48, 48, 48, 48, 56, 60, 28],
    ']': [224, 240, 112, 48, 48, 48, 48, 48, 48, 48, 48, 112, 240, 224],
    '<': [3, 7, 14, 28, 56, 112, 192, 192, 112, 56, 28, 14, 7, 3],
    '>': [768, 896, 448, 224, 112, 56, 12, 12, 56, 112, 224, 448, 896, 768],
    '=': [0, 0, 0, 0, 1023, 1023, 0, 0, 1023, 1023, 0, 0, 0, 0],
    '_': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1023, 1023],
    '*': [0, 0, 819, 819, 120, 252, 1023, 1023, 252, 120, 819, 819, 0, 0],
    '#': [204, 462, 1023, 1023, 204, 204, 1023, 1023, 462, 204, 0, 0, 0, 0],
    '@': [252, 510, 899, 771, 799, 831, 819, 819, 830, 796, 768, 896, 508, 252],
    '~': [0, 0, 0, 0, 195, 483, 819, 819, 798, 780, 0, 0, 0, 0],
    '|': [48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48]
  };
  // <<< generated font tables

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

  function makeCanvas(w, h, detail) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    /* uw/uh are the sprite's size in LOGICAL units. `detail` is how many
       canvas pixels make up one logical unit, so art authored at 2x detail
       still occupies the same space in the world. The renderer always blits
       to uw/uh, which is what lets 1x and 2x art coexist. */
    const d = detail || 1;
    cv.uw = w / d; cv.uh = h / d; cv.detail = d;
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    return cv;
  }

  /* rows: array of equal-length strings. Characters index PAL; '.' or ' ' is
     transparent. Returns a canvas ready to blit. */
  function makeSprite(rows, overrides, detail) {
    const d = detail || 1;
    const h = rows.length;
    const w = rows[0].length;
    const cv = makeCanvas(w, h, d);
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
  function makeSheet(map, overrides, detail) {
    const out = {};
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        out[key] = makeSprite(map[key], overrides, detail);
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
    const cv = makeCanvas(sprite.width, sprite.height, sprite.detail || 1);
    const cx = cv.getContext('2d');
    cx.drawImage(sprite, 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  // Horizontal mirror, baked once so the render loop never has to transform.
  function flipped(sprite) {
    const cv = makeCanvas(sprite.width, sprite.height, sprite.detail || 1);
    const cx = cv.getContext('2d');
    cx.translate(sprite.width, 0);
    cx.scale(-1, 1);
    cx.drawImage(sprite, 0, 0);
    return cv;
  }

  /* Uniform integer upscale — used for the title logo, big item icons and the
     paper doll. Memoised, because the screens that want a 3x doll want it
     every frame, and building a fresh canvas sixty times a second to draw the
     same twelve by seventeen pixels is how a menu starts eating memory. */
  const scaleCache = new Map();

  function scaled(sprite, factor) {
    let bySize = scaleCache.get(sprite);
    if (!bySize) { bySize = new Map(); scaleCache.set(sprite, bySize); }
    const hit = bySize.get(factor);
    if (hit) return hit;

    const cv = makeCanvas(sprite.width * factor, sprite.height * factor, sprite.detail || 1);
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(sprite, 0, 0, cv.width, cv.height);
    bySize.set(factor, cv);
    return cv;
  }

  DS.PAL = PAL;
  DS.Art = {
    GLYPHS: GLYPHS,
    GLYPHS_HD: GLYPHS_HD,
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
