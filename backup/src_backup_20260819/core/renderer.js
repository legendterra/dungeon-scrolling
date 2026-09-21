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

  function resize() {
    const pad = 24;
    const sx = Math.floor((window.innerWidth - pad) / C.W);
    const sy = Math.floor((window.innerHeight - pad) / C.H);
    scale = Math.max(1, Math.min(sx, sy));
    cv.style.width = (C.W * scale) + 'px';
    cv.style.height = (C.H * scale) + 'px';
  }

  function init() {
    cv = document.getElementById('game');
    cv.width = C.W;
    cv.height = C.H;
    cx = cv.getContext('2d', { alpha: false });
    cx.imageSmoothingEnabled = false;
    window.addEventListener('resize', resize);
    resize();
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

    cx.setTransform(1, 0, 0, 1, 0, 0);
    if (zoomLevel !== 1) {
      cx.translate(C.W / 2, C.H / 2);
      cx.scale(zoomLevel, zoomLevel);
      cx.translate(-C.W / 2, -C.H / 2);
    }
  }

  // Drop back to screen space for the HUD, menus and the lighting composite.
  function uiMode() {
    cx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawFlash() {
    if (flashFrames <= 0) return;
    flashFrames--;
    const alpha = (flashFrames / flashMax) * 0.5;
    cx.save();
    cx.setTransform(1, 0, 0, 1, 0, 0);
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
    cx.fillStyle = color || '#0d0b12';
    cx.fillRect(0, 0, C.W, C.H);
  }

  function spr(img, x, y) {
    if (!img) return;
    cx.drawImage(img, Math.round(x) - offX, Math.round(y) - offY);
  }

  function sprS(img, x, y) {
    if (!img) return;
    cx.drawImage(img, Math.round(x), Math.round(y));
  }

  function sprAlpha(img, x, y, alpha) {
    if (!img) return;
    const prev = cx.globalAlpha;
    cx.globalAlpha = alpha;
    cx.drawImage(img, Math.round(x) - offX, Math.round(y) - offY);
    cx.globalAlpha = prev;
  }

  /* Draw a sprite rotated about a pivot given in sprite-local pixels.
     Used for weapon swings — the only place the game needs a transform. */
  function sprRot(img, x, y, angle, flip, pivotX, pivotY) {
    if (!img) return;
    const px = pivotX == null ? img.width / 2 : pivotX;
    const py = pivotY == null ? img.height / 2 : pivotY;

    cx.save();
    cx.translate(Math.round(x) - offX, Math.round(y) - offY);
    if (flip) cx.scale(-1, 1);
    cx.rotate(angle);
    cx.drawImage(img, -px, -py);
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

    for (let i = 0; i < str.length; i++) {
      const glyph = Art.GLYPHS[str[i]];
      if (glyph) {
        for (let row = 0; row < GH; row++) {
          const bits = glyph[row];
          if (!bits) continue;
          for (let col = 0; col < GW; col++) {
            if (bits & (1 << (GW - 1 - col))) {
              cx.fillRect(px + col * s, py + row * s, s, s);
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

  /* Two parallax layers of arches drawn straight from rectangles — no art
     assets, and it keeps depth reading differently as you descend. */
  function background(depthOrBiome) {
    const sky = (depthOrBiome && depthOrBiome.sky)
      ? depthOrBiome.sky
      : BG_TINTS[((depthOrBiome || 1) - 1) % BG_TINTS.length];
    const grad = cx.createLinearGradient(0, 0, 0, C.H);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(1, sky[1]);
    cx.fillStyle = grad;
    cx.fillRect(0, 0, C.W, C.H);

    drawArches(0.25, 64, 44, 96, 'rgba(255,255,255,0.030)');
    drawArches(0.5, 40, 30, 64, 'rgba(255,255,255,0.045)');
  }

  function drawArches(factor, spacing, width, height, color) {
    cx.fillStyle = color;
    const shift = (offX * factor) % spacing;
    for (let x = -spacing - shift; x < C.W + spacing; x += spacing) {
      const top = C.H - height;
      cx.fillRect(Math.round(x), top + 10, width, height);
      // rounded-ish arch head, stepped in three bands
      cx.fillRect(Math.round(x) + 4, top + 5, width - 8, 6);
      cx.fillRect(Math.round(x) + 10, top, width - 20, 6);
    }
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
    begin: begin,
    camOffsetX: camOffsetX,
    camOffsetY: camOffsetY,
    clear: clear,
    background: background,
    spr: spr,
    sprS: sprS,
    sprAlpha: sprAlpha,
    sprRot: sprRot,
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
    CAP_H: CAP_H
  };
})(window.DS);
