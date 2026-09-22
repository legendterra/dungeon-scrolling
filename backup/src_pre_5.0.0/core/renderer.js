/* Canvas setup, integer upscaling, camera, and every drawing primitive.
   World-space helpers subtract the camera; the *S variants take screen pixels. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const Art = DS.Art;

  let cv = null, cx = null;
  let scale = 1;

  const cam = { x: C.W / 2, y: C.H / 2 };
  let shakeAmount = 0, shakeX = 0, shakeY = 0;
  let offX = 0, offY = 0; // rounded camera offset used for this frame

  /* How much the 320x180 frame is blown up to fill the window.

     Two candidates: the scale that fills the window exactly, and the largest
     whole multiple of RS that fits inside it (even device pixels). The even
     one wins while it wastes little of the window; otherwise the game fills
     the screen edge to edge.

     The old rule floored to a multiple of RS after subtracting a 24px pad, so
     a 1920x1080 window rendered at 1280x720 — two thirds of the screen — and
     the player had to reach for browser zoom to see the game at a sane size.
     Gameplay is untouched either way: the logical grid stays 320x180 and
     nearest-neighbour sampling keeps the voxel look. */
  const FIT_SLACK = 0.08;   // how much letterbox we accept for even pixels

  function fitScale() {
    const sx = window.innerWidth / C.W;
    const sy = window.innerHeight / C.H;
    const fill = Math.max(0.5, Math.min(sx, sy));
    const even = Math.floor(fill / C.RS) * C.RS;
    if (even >= C.RS && even / fill >= 1 - FIT_SLACK) return even;
    return fill;
  }

  function resize() {
    scale = fitScale();
    cv.style.width = Math.round(C.W * scale) + 'px';
    cv.style.height = Math.round(C.H * scale) + 'px';
    if (DS.R3D && DS.R3D.resize) DS.R3D.resize();
  }

  /* Real fullscreen, so the game can own the whole monitor instead of however
     tall the browser chrome leaves the viewport. F2 rather than F (interact)
     or F11 (the browser's own toggle) - nothing else in the game wants it, and
     the fit scale above then fills the screen exactly. */
  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && p.catch) p.catch(function () { /* denied: stay windowed */ });
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  function init() {
    cv = document.getElementById('game');
    cv.width = C.W * C.RS;
    cv.height = C.H * C.RS;
    cx = cv.getContext('2d', { alpha: true });
    cx.imageSmoothingEnabled = false;
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', function (e) {
      if (e.code === 'F2') { e.preventDefault(); toggleFullscreen(); }
    });
    // Fullscreen swaps the viewport out from under us; re-fit when it lands.
    document.addEventListener('fullscreenchange', resize);
    resize();
    if (DS.R3D && DS.R3D.init) DS.R3D.init();
  }

  // --- camera ---------------------------------------------------------------

  function setCam(x, y) { cam.x = x; cam.y = y; }

  function clampCam(minX, maxX, minY, maxY) {
    const halfW = C.W / 2, halfH = C.H / 2;
    if (maxX - minX < C.W) cam.x = (minX + maxX) / 2;
    else cam.x = DS.M.clamp(cam.x, minX + halfW, maxX - halfW);
    if (maxY - minY < C.H) cam.y = (minY + maxY) / 2;
    else cam.y = DS.M.clamp(cam.y, minY + halfH, maxY - halfH);
  }

  function shake(amount) {
    shakeAmount = Math.max(shakeAmount, amount);
  }

  /* Camera punch: a brief push past 1.0 that eases back. Applied as a canvas
     transform around the screen centre, so every world draw inherits it and
     the HUD is unaffected once uiMode() resets the transform. */
  let zoomLevel = 1, zoomTarget = 1;
  let flashFrames = 0, flashMax = 1, flashColor = '#ffffff';

  function punch(amount) {
    zoomLevel = Math.max(zoomLevel, 1 + amount);
  }

  function flash(color, frames) {
    flashColor = color || '#ffffff';
    flashFrames = flashMax = frames || 6;
  }

  function begin() {
    if (shakeAmount > 0.1) {
      shakeX = (DS.rand.next() * 2 - 1) * shakeAmount;
      shakeY = (DS.rand.next() * 2 - 1) * shakeAmount;
      shakeAmount *= 0.86;
    } else {
      shakeAmount = shakeX = shakeY = 0;
    }
    offX = Math.round(cam.x - C.W / 2 + shakeX);
    offY = Math.round(cam.y - C.H / 2 + shakeY);

    zoomLevel = DS.M.approach(zoomLevel, zoomTarget, 0.012);
    if (zoomLevel < 1.0005) zoomLevel = 1;

    cx.setTransform(C.RS, 0, 0, C.RS, 0, 0);
    if (zoomLevel !== 1) {
      cx.translate(C.W / 2, C.H / 2);
      cx.scale(zoomLevel, zoomLevel);
      cx.translate(-C.W / 2, -C.H / 2);
    }
  }

  // Drop back to screen space for the HUD, menus and the lighting composite.
  function uiMode() {
    cx.setTransform(C.RS, 0, 0, C.RS, 0, 0);
  }

  function drawFlash() {
    if (flashFrames <= 0) return;
    flashFrames--;
    const alpha = (flashFrames / flashMax) * 0.5;
    cx.save();
    cx.setTransform(C.RS, 0, 0, C.RS, 0, 0);
    cx.globalAlpha = alpha;
    cx.fillStyle = flashColor;
    cx.fillRect(0, 0, C.W, C.H);
    cx.restore();
  }

  function toScreenX(worldX) {
    return (worldX - offX - C.W / 2) * zoomLevel + C.W / 2;
  }

  function toScreenY(worldY) {
    return (worldY - offY - C.H / 2) * zoomLevel + C.H / 2;
  }

  function camOffsetX() { return offX; }
  function camOffsetY() { return offY; }

  // --- primitives -----------------------------------------------------------

  function clear(color) {
    if (DS.R3D && DS.R3D.isEnabled) {
      cx.save();
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.restore();
    } else {
      cx.fillStyle = color || '#0d0b12';
      cx.fillRect(0, 0, C.W, C.H);
    }
  }

  // Logical width/height of a sprite; 1x art has no uw and blits as before.
  function uw(img) { return img.uw == null ? img.width : img.uw; }
  function uh(img) { return img.uh == null ? img.height : img.uh; }

  function spr(img, x, y) {
    if (!img) return;
    cx.drawImage(img, Math.round(x) - offX, Math.round(y) - offY, uw(img), uh(img));
  }

  function sprS(img, x, y) {
    if (!img) return;
    cx.drawImage(img, Math.round(x), Math.round(y), uw(img), uh(img));
  }

  // Screen-space alpha blit — used by HUD panels, which never scroll.
  function sprAlphaS(img, x, y, alpha) {
    if (!img) return;
    const prev = cx.globalAlpha;
    cx.globalAlpha = alpha;
    cx.drawImage(img, Math.round(x), Math.round(y), uw(img), uh(img));
    cx.globalAlpha = prev;
  }

  function sprAlpha(img, x, y, alpha) {
    if (!img) return;
    const prev = cx.globalAlpha;
    cx.globalAlpha = alpha;
    cx.drawImage(img, Math.round(x) - offX, Math.round(y) - offY, uw(img), uh(img));
    cx.globalAlpha = prev;
  }

  /* Draw a sprite rotated about a pivot given in sprite-local pixels.
     Used for weapon swings — the only place the game needs a transform. */
  function sprRot(img, x, y, angle, flip, pivotX, pivotY) {
    if (!img) return;
    const px = pivotX == null ? uw(img) / 2 : pivotX;
    const py = pivotY == null ? uh(img) / 2 : pivotY;

    cx.save();
    cx.translate(Math.round(x) - offX, Math.round(y) - offY);
    if (flip) cx.scale(-1, 1);
    cx.rotate(angle);
    cx.drawImage(img, -px, -py, uw(img), uh(img));
    cx.restore();
  }

  function sprScaled(img, x, y, scaleX, scaleY, flip, pivotX, pivotY) {
    if (!img) return;
    const px = pivotX == null ? uw(img) / 2 : pivotX;
    const py = pivotY == null ? uh(img) : pivotY;
    cx.save();
    cx.translate(Math.round(x) - offX, Math.round(y) - offY);
    if (flip) cx.scale(-1, 1);
    cx.scale(scaleX || 1, scaleY || 1);
    cx.drawImage(img, -px, -py, uw(img), uh(img));
    cx.restore();
  }

  /* Stroked arc in world space — the swing trails follow the weapon through
     its rotation, which no sprite can do on its own. */
  function arc(x, y, radius, from, to, color, width, flip) {
    cx.save();
    cx.translate(Math.round(x) - offX, Math.round(y) - offY);
    if (flip) cx.scale(-1, 1);
    cx.beginPath();
    cx.strokeStyle = color;
    cx.lineWidth = width || 2;
    cx.lineCap = 'round';
    // Angles here are measured the same way the weapon sprite is rotated:
    // 0 points up, positive sweeps forward.
    cx.arc(0, 0, radius, from - Math.PI / 2, to - Math.PI / 2);
    cx.stroke();
    cx.restore();
  }

  function line(x1, y1, x2, y2, color, width) {
    cx.save();
    cx.beginPath();
    cx.strokeStyle = color;
    cx.lineWidth = width || 1;
    cx.moveTo(Math.round(x1) - offX, Math.round(y1) - offY);
    cx.lineTo(Math.round(x2) - offX, Math.round(y2) - offY);
    cx.stroke();
    cx.restore();
  }

  function rect(x, y, w, h, color) {
    cx.fillStyle = color;
    cx.fillRect(Math.round(x) - offX, Math.round(y) - offY, Math.round(w), Math.round(h));
  }

  function rectS(x, y, w, h, color) {
    cx.fillStyle = color;
    cx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function frameS(x, y, w, h, color) {
    cx.fillStyle = color;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    cx.fillRect(x, y, w, 1);
    cx.fillRect(x, y + h - 1, w, 1);
    cx.fillRect(x, y, 1, h);
    cx.fillRect(x + w - 1, y, 1, h);
  }

  // A filled panel with a border, used by every menu and overlay.
  function panelS(x, y, w, h, fill, border) {
    rectS(x, y, w, h, fill || 'rgba(13,11,18,0.92)');
    frameS(x, y, w, h, border || '#514c72');
  }

  function fade(alpha, color) {
    cx.fillStyle = color || '#0d0b12';
    const prev = cx.globalAlpha;
    cx.globalAlpha = DS.M.clamp(alpha, 0, 1);
    cx.fillRect(0, 0, C.W, C.H);
    cx.globalAlpha = prev;
  }

  // --- text -----------------------------------------------------------------

  const GW = Art.GLYPH_W, GH = Art.GLYPH_H, GAP = Art.GLYPH_GAP;

  /* Text is drawn from the doubled font when the render scale can actually
     show it: a 10x14 glyph stepped at half a logical unit occupies the same
     5x7 logical cell, so textWidth and every layout built on it are unchanged
     while the letterforms gain real detail. At RS 1 a half unit would be a
     blurry half pixel, so the original face is used instead.

     Only the 5x7 prose face is doubled. The 3x5 micro face used for key caps
     is not: its letters are only three pixels wide, so M, N, V and W are built
     from single-pixel diagonals that the doubling rounds into blobs -- SHIFT
     came out reading as SHIFY. Legibility on a key cap beats crispness. */
  const HD_TEXT = (C.RS || 1) >= 2 && !!Art.GLYPHS_HD;
  const HGW = GW * 2, HGH = GH * 2;

  function textWidth(str, s) {
    s = s || 1;
    if (!str.length) return 0;
    return (str.length * (GW + GAP) - GAP) * s;
  }

  function textS(str, x, y, color, s) {
    s = s || 1;
    cx.fillStyle = color || '#d8d5e8';
    str = String(str).toUpperCase();
    let px = Math.round(x);
    const py = Math.round(y);

    const hd = HD_TEXT;
    const step = hd ? s / 2 : s;
    const rows = hd ? HGH : GH;
    const cols = hd ? HGW : GW;

    for (let i = 0; i < str.length; i++) {
      const table = hd ? Art.GLYPHS_HD : Art.GLYPHS;
      const glyph = table[str[i]] || Art.GLYPHS[str[i]];
      if (glyph) {
        const gRows = glyph.length, gCols = gRows === rows ? cols : GW;
        const gStep = gRows === rows ? step : s;
        for (let row = 0; row < gRows; row++) {
          const bits = glyph[row];
          if (!bits) continue;
          for (let col = 0; col < gCols; col++) {
            if (bits & (1 << (gCols - 1 - col))) {
              cx.fillRect(px + col * gStep, py + row * gStep, gStep, gStep);
            }
          }
        }
      }
      px += (GW + GAP) * s;
    }
  }

  // Same text drawn one pixel down-right in near-black first, for legibility
  // over busy dungeon tiles.
  function textShadowS(str, x, y, color, s) {
    s = s || 1;
    textS(str, x + s, y + s, 'rgba(13,11,18,0.85)', s);
    textS(str, x, y, color, s);
  }

  function textCenterS(str, cxPos, y, color, s) {
    textShadowS(str, cxPos - textWidth(str, s) / 2, y, color, s);
  }

  function textRightS(str, rightX, y, color, s) {
    textShadowS(str, rightX - textWidth(str, s), y, color, s);
  }

  // --- micro text -----------------------------------------------------------

  const SW = Art.SMALL_W, SH = Art.SMALL_H, SGAP = Art.SMALL_GAP;

  function textSmallWidth(str) {
    if (str == null) return 0;
    str = String(str);
    if (!str.length) return 0;
    return str.length * (SW + SGAP) - SGAP;
  }

  function textSmallS(str, x, y, color) {
    cx.fillStyle = color || '#d8d5e8';
    str = String(str).toUpperCase();
    let px = Math.round(x);
    const py = Math.round(y);

    for (let i = 0; i < str.length; i++) {
      const glyph = Art.SMALL[str[i]];
      if (glyph) {
        for (let row = 0; row < SH; row++) {
          const bits = glyph[row];
          if (!bits) continue;
          for (let col = 0; col < SW; col++) {
            if (bits & (1 << (SW - 1 - col))) cx.fillRect(px + col, py + row, 1, 1);
          }
        }
      }
      px += SW + SGAP;
    }
  }

  // --- key hints ------------------------------------------------------------

  /* A key cap: a small pixel button with a lit top edge and a dropped shadow,
     so a control reads as a thing you press rather than as more prose. */
  const CAP_H = 7;

  function keycap(label, x, y, accent) {
    const w = textSmallWidth(label) + 4;
    rectS(x, y, w, CAP_H, '#241f36');
    frameS(x, y, w, CAP_H, accent || '#6f6a90');
    textSmallS(label, x + 2, y + 1, '#ffffff');
    return w;
  }

  /* pairs: [['Q','TABS'], ['ESC','CLOSE']]. Returns the total width so callers
     can centre a row without measuring it themselves. */
  const HINT_GAP = 3;
  const HINT_PAD = 7;

  function hintsWidth(pairs) {
    let w = 0;
    for (let i = 0; i < pairs.length; i++) {
      w += textSmallWidth(pairs[i][0]) + 4 + HINT_GAP;
      if (pairs[i][1]) w += textSmallWidth(pairs[i][1]) + HINT_PAD;
      else w += HINT_PAD - HINT_GAP;
    }
    return Math.max(0, w - HINT_PAD);
  }

  function hints(pairs, x, y, color, accent) {
    let cursor = x;
    for (let i = 0; i < pairs.length; i++) {
      cursor += keycap(pairs[i][0], cursor, y, accent) + HINT_GAP;
      if (pairs[i][1]) {
        textSmallS(pairs[i][1], cursor, y + 1, color || '#9b96b8');
        cursor += textSmallWidth(pairs[i][1]);
      }
      cursor += HINT_PAD;
    }
    return cursor - x - HINT_PAD;
  }

  function hintsCenter(pairs, cxPos, y, color, accent) {
    return hints(pairs, cxPos - hintsWidth(pairs) / 2, y, color, accent);
  }

  // --- bars -----------------------------------------------------------------

  function barS(x, y, w, h, pct, fg, bg, border) {
    pct = DS.M.clamp(pct, 0, 1);
    rectS(x, y, w, h, bg || '#2a2740');
    if (pct > 0) rectS(x + 1, y + 1, Math.max(1, Math.round((w - 2) * pct)), h - 2, fg);
    if (border !== false) frameS(x, y, w, h, '#0d0b12');
  }

  // --- background -----------------------------------------------------------

  const BG_TINTS = [
    ['#171325', '#0d0b12'],
    ['#141c26', '#0b0d12'],
    ['#1d1420', '#120b12'],
    ['#101f1c', '#0a1210'],
    ['#22161a', '#120a0c'],
    ['#1a1030', '#0c0818']
  ];

  /* Three baked parallax layers per biome — see src/art/backdrop.js. The sky
     is fixed, the mid architecture drifts at a quarter of camera speed and the
     near silhouette at three quarters, which is what sells the depth. */
  function background(depthOrBiome) {
    if (DS.R3D && DS.R3D.isEnabled) {
      // Clear the 2D overlay each frame so sprites don't ghost and
      // the Three.js canvas behind remains visible through transparent areas.
      cx.save();
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.restore();
      return;
    }
    const biome = (depthOrBiome && depthOrBiome.sky)
      ? depthOrBiome
      : DS.Biomes.forDepth(depthOrBiome || 1);
    const L = DS.Backdrop.layersFor(biome);

    cx.drawImage(L.sky, 0, 0, C.W, C.H);
    scrollLayer(L.mid, 0.25);

    /* The backdrop sits behind the darkness layer, so without its own veil the
       player's torch would light up scenery that is supposedly rooms away. This
       keeps the far layers reading as depth rather than as wallpaper. */
    cx.fillStyle = 'rgba(6,5,12,0.55)';
    cx.fillRect(0, 0, C.W, C.H);

    scrollLayer(L.near, 0.7);
    cx.fillStyle = 'rgba(6,5,12,0.30)';
    cx.fillRect(0, 0, C.W, C.H);
  }

  /* Blit a 640-wide looping layer twice so the wrap point is always covered.
     The layer canvas is baked at C.RS resolution, so it is blitted to its
     LOGICAL size the same way sprites are. */
  function scrollLayer(layer, factor) {
    const w = DS.Backdrop.W;
    const h = DS.Backdrop.H;
    let shift = (offX * factor) % w;
    if (shift < 0) shift += w;
    cx.drawImage(layer, -shift, 0, w, h);
    if (w - shift < C.W) cx.drawImage(layer, w - shift, 0, w, h);
  }

  // Screen pixels back to world pixels — the exact inverse of toScreenX/Y, so
  // an aim reticle drawn in UI space points at the world tile under it.
  function toWorldX(screenX) {
    return (screenX - C.W / 2) / zoomLevel + C.W / 2 + offX;
  }

  function toWorldY(screenY) {
    return (screenY - C.H / 2) / zoomLevel + C.H / 2 + offY;
  }

  DS.R = {
    init: init,
    get ctx() { return cx; },
    get canvas() { return cv; },
    cam: cam,
    setCam: setCam,
    clampCam: clampCam,
    shake: shake,
    punch: punch,
    flash: flash,
    drawFlash: drawFlash,
    uiMode: uiMode,
    zoom: function () { return zoomLevel; },
    toScreenX: toScreenX,
    toScreenY: toScreenY,
    toWorldX: toWorldX,
    toWorldY: toWorldY,
    begin: begin,
    camOffsetX: camOffsetX,
    camOffsetY: camOffsetY,
    clear: clear,
    background: background,
    spr: spr,
    sprS: sprS,
    sprAlpha: sprAlpha,
    sprAlphaS: sprAlphaS,
    sprRot: sprRot,
    sprScaled: sprScaled,
    arc: arc,
    line: line,
    rect: rect,
    rectS: rectS,
    frameS: frameS,
    panelS: panelS,
    fade: fade,
    text: textShadowS,
    textPlain: textS,
    textCenter: textCenterS,
    textRight: textRightS,
    textWidth: textWidth,
    bar: barS,
    textSmall: textSmallS,
    textSmallWidth: textSmallWidth,
    keycap: keycap,
    hints: hints,
    hintsCenter: hintsCenter,
    hintsWidth: hintsWidth,
    toggleFullscreen: toggleFullscreen,
    fitScale: fitScale,
    CAP_H: CAP_H
  };
})(window.DS);
