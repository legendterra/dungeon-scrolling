/* Screen drawing API, backed by Three.js.

   This module used to own a 2D canvas. The game shipped two canvases -- a WebGL
   one for the dungeon and a 2D one stacked on top for the HUD, menus and world
   FX -- which meant two renderers, two coordinate systems, and world-anchored
   marks (labels, damage numbers, HP bars) that were painted over the 3D scene no
   matter what depth they belonged at.

   The API is unchanged on purpose. Nearly every screen in the game is built
   from these primitives (rect/panelS/text/textSmall/bar/spr/fade), roughly three
   thousand call sites in total; rewriting them all by hand is how a migration
   turns into a rewrite. Instead the primitives now append quads into the
   Three.js screen layer (`src/ui3/screen.js`), which flushes them as a couple of
   instanced meshes after the world pass.

   Coordinate rules, exactly as before:
     * x/y are logical pixels in a 320x180 frame, +y downward;
     * world-space calls (rect/spr/line/arc) subtract the camera offset and the
       current punch zoom; screen-space calls (rectS/sprS/...) do not;
     * text metrics are byte-identical to the 2D faces, so no layout moved. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const UI = () => DS.UI3;

  let cv = null;
  let scale = 1;

  const cam = { x: C.W / 2, y: C.H / 2 };
  let shakeAmount = 0, shakeX = 0, shakeY = 0;
  let offX = 0, offY = 0; // rounded camera offset used for this frame

  /* How much the logical 320x180 frame is blown up. Two candidates: the scale
     that fills the window, and the largest whole multiple of RS that fits. The
     even one wins while it wastes little of the window. */
  const FIT_SLACK = 0.08;

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
    if (DS.UI3 && DS.UI3.ready) DS.UI3.resize();
    if (DS.R3D && DS.R3D.resize) DS.R3D.resize();
  }

  /* Real fullscreen, so the game can own the whole monitor. F2 rather than F
     (interact) or F11 (the browser's own toggle). */
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
    // The 3D renderer owns the only canvas now. It has to come up first, because
    // the screen layer draws through its WebGL context.
    if (DS.R3D && DS.R3D.init) DS.R3D.init();
    cv = (DS.R3D && DS.R3D.canvas) || null;
    if (DS.UI3) DS.UI3.init(DS.R3D && DS.R3D.gl);
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', function (e) {
      if (e.code === 'F2') { e.preventDefault(); toggleFullscreen(); }
    });
    document.addEventListener('fullscreenchange', resize);
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

  let zoomLevel = 1, zoomTarget = 1;
  let flashFrames = 0, flashMax = 1, flashColorLight = 0xffffff;

  function punch(amount) {
    zoomLevel = Math.max(zoomLevel, 1 + amount);
  }

  function flash(color, frames) {
    flashColorLight = DS.UI3 ? DS.UI3.hexOf(color || '#ffffff') : 0xffffff;
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

    if (DS.UI3) {
      DS.UI3.setSpace('world');
      DS.UI3.begin();
    }
  }

  // Drop back to screen space for the HUD, menus and the overlay.
  function uiMode() {
    if (DS.UI3) DS.UI3.setSpace('ui');
  }

  function drawFlash() {
    if (flashFrames <= 0) return;
    flashFrames--;
    if (!DS.UI3) return;
    DS.UI3.post.flashColor = flashColorLight;
    DS.UI3.post.flash = (flashFrames / flashMax) * 0.5;
  }

  /* Flush the screen layer and the full-window overlay. Called once at the end
     of a frame, after the world has been drawn and every DS.R call has been
     queued. */
  function present(time) {
    if (DS.UI3 && DS.UI3.ready) DS.UI3.render(time);
    /* The inventory doll draws on top of the panels rather than into a hole in
       them: with no 2D canvas there is no rectangle to erase, and a scissored
       pass after the UI lands in exactly the same slot. */
    if (DS.R3D && DS.R3D.renderDoll) DS.R3D.renderDoll();
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
    /* The world pass clears the canvas; nothing to do here, kept so callers
       that used to clear the 2D overlay still read correctly. */
  }

  // Logical width/height of a sprite; 1x art has no uw and blits as before.
  function uw(img) { return img.uw == null ? img.width : img.uw; }
  function uh(img) { return img.uh == null ? img.height : img.uh; }

  function spr(img, x, y) {
    if (!img || !DS.UI3) return;
    DS.UI3.quad(DS.UI3.texFor(img), toScreenX(x), toScreenY(y),
                uw(img) * zoomLevel, uh(img) * zoomLevel,
                0, 1, 1, 0, '#ffffff', 1);
  }

  function sprS(img, x, y) {
    if (!img || !DS.UI3) return;
    DS.UI3.quad(DS.UI3.texFor(img), Math.round(x), Math.round(y),
                uw(img), uh(img), 0, 1, 1, 0, '#ffffff', 1);
  }

  function sprAlphaS(img, x, y, alpha) {
    if (!img || !DS.UI3) return;
    DS.UI3.quad(DS.UI3.texFor(img), Math.round(x), Math.round(y),
                uw(img), uh(img), 0, 1, 1, 0, '#ffffff', alpha);
  }

  function sprAlpha(img, x, y, alpha) {
    if (!img || !DS.UI3) return;
    DS.UI3.quad(DS.UI3.texFor(img), toScreenX(x), toScreenY(y),
                uw(img) * zoomLevel, uh(img) * zoomLevel,
                0, 1, 1, 0, '#ffffff', alpha);
  }

  /* A sprite rotated about a pivot given in sprite-local pixels. */
  function sprRot(img, x, y, angle, flip, pivotX, pivotY) {
    if (!img || !DS.UI3) return;
    const w = uw(img) * zoomLevel, h = uh(img) * zoomLevel;
    const px = (pivotX == null ? uw(img) / 2 : pivotX) * zoomLevel;
    const py = (pivotY == null ? uh(img) / 2 : pivotY) * zoomLevel;
    const sx = toScreenX(x), sy = toScreenY(y);
    DS.UI3.quadAt(DS.UI3.texFor(img), sx - px, sy - py, w, h,
                  0, 1, 1, 0, '#ffffff', 1, angle, flip, false, px, py);
  }

  function sprScaled(img, x, y, scaleX, scaleY, flip, pivotX, pivotY) {
    if (!img || !DS.UI3) return;
    const w = uw(img) * zoomLevel * (scaleX || 1);
    const h = uh(img) * zoomLevel * (scaleY || 1);
    const px = (pivotX == null ? uw(img) / 2 : pivotX) * zoomLevel;
    const py = (pivotY == null ? uh(img) : pivotY) * zoomLevel;
    DS.UI3.quadAt(DS.UI3.texFor(img), toScreenX(x) - px, toScreenY(y) - py, w, h,
                  0, 1, 1, 0, '#ffffff', 1, 0, flip, false, px, py);
  }

  /* Stroked arc in world space — swing trails. Approximated with quads along
     the arc, which is what the 2D stroker did anyway. */
  function arc(x, y, radius, from, to, color, width, flip) {
    if (!DS.UI3) return;
    const cx = toScreenX(x), cy = toScreenY(y);
    const r = radius * zoomLevel;
    const w = Math.max(1, width || 2) * zoomLevel;
    const steps = 12;
    const span = to - from;
    const dir = flip ? -1 : 1;
    for (let i = 0; i < steps; i++) {
      const a0 = from + span * (i / steps);
      const a1 = from + span * ((i + 1) / steps);
      const x0 = cx + Math.sin(a0) * r * dir, y0 = cy - Math.cos(a0) * r;
      const x1 = cx + Math.sin(a1) * r * dir, y1 = cy - Math.cos(a1) * r;
      seg(x0, y0, x1, y1, w, color);
    }
  }

  function seg(x0, y0, x1, y1, w, color) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const ang = Math.atan2(dy, dx);
    DS.UI3.quadAt(DS.UI3.white(), x0, y0 - w / 2, len, w,
                  0, 1, 1, 0, color, 1, ang, false, false, 0, w / 2);
  }

  function line(x1, y1, x2, y2, color, width) {
    if (!DS.UI3) return;
    seg(toScreenX(x1), toScreenY(y1), toScreenX(x2), toScreenY(y2),
        Math.max(1, width || 1) * zoomLevel, color);
  }

  function fillQuad(x, y, w, h, color, alpha) {
    if (!DS.UI3) return;
    DS.UI3.quad(DS.UI3.white(), x, y, w, h, 0, 1, 1, 0, color, alpha == null ? 1 : alpha);
  }

  function rect(x, y, w, h, color) {
    fillQuad(toScreenX(x), toScreenY(y), Math.round(w) * zoomLevel,
             Math.round(h) * zoomLevel, color);
  }

  function rectS(x, y, w, h, color) {
    fillQuad(Math.round(x), Math.round(y), Math.round(w), Math.round(h), color);
  }

  function frameS(x, y, w, h, color) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    fillQuad(x, y, w, 1, color);
    fillQuad(x, y + h - 1, w, 1, color);
    fillQuad(x, y, 1, h, color);
    fillQuad(x + w - 1, y, 1, h, color);
  }

  // A filled panel with a border, used by every menu and overlay.
  function panelS(x, y, w, h, fill, border) {
    rectS(x, y, w, h, fill || 'rgba(13,11,18,0.92)');
    frameS(x, y, w, h, border || '#514c72');
  }

  function fade(alpha, color) {
    if (!DS.UI3) return;
    DS.UI3.post.fade = DS.M.clamp(alpha, 0, 1);
    if (color) DS.UI3.post.fadeColor = DS.UI3.hexOf(color);
  }

  // --- text -----------------------------------------------------------------

  function textWidth(str, s) {
    s = s || 1;
    if (str == null) return 0;
    str = String(str);
    if (!str.length) return 0;
    return (str.length * (5 + 1) - 1) * s;
  }

  function textS(str, x, y, color, s) {
    if (!DS.UI3) return;
    DS.UI3.text(str, Math.round(x), Math.round(y), color || '#d8d5e8', s || 1, 'BODY', false);
  }

  // Same text drawn one pixel down-right in near-black first, for legibility
  // over busy dungeon tiles.
  function textShadowS(str, x, y, color, s) {
    if (!DS.UI3) return;
    DS.UI3.text(str, Math.round(x), Math.round(y), color || '#d8d5e8', s || 1, 'BODY', true);
  }

  function textCenterS(str, cxPos, y, color, s) {
    textShadowS(str, cxPos - textWidth(str, s) / 2, y, color, s);
  }

  function textRightS(str, rightX, y, color, s) {
    textShadowS(str, rightX - textWidth(str, s), y, color, s);
  }

  /* The heading face: a serif cut of the prose face at twice the detail, drawn
     with the same logical metrics as the old scale-N prose text. */
  function textTitle(str, x, y, color, s) {
    if (!DS.UI3) return;
    DS.UI3.text(str, Math.round(x), Math.round(y), color || '#d8d5e8', (s || 1) / 2, 'TITLE', true);
  }

  function textTitleCenter(str, cxPos, y, color, s) {
    s = s || 1;
    const w = (String(str == null ? '' : str).length * 6 - 1) * s;
    textTitle(str, cxPos - w / 2, y, color, s);
  }

  // --- micro text -----------------------------------------------------------

  function textSmallWidth(str) {
    if (str == null) return 0;
    str = String(str);
    if (!str.length) return 0;
    return str.length * (3 + 1) - 1;
  }

  function textSmallS(str, x, y, color) {
    if (!DS.UI3) return;
    DS.UI3.text(str, Math.round(x), Math.round(y), color || '#d8d5e8', 1, 'MICRO', false);
  }

  // --- key hints ------------------------------------------------------------

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

  /* A soft light bloom. Was a canvas radial gradient per draw site (camp fire,
     torches, the intro's single torch, skills); now one tinted quad off the
     shared radial texture. */
  function glow(x, y, radius, color, alpha, screenSpace) {
    if (!DS.UI3) return;
    const cx = screenSpace ? x : toScreenX(x);
    const cy = screenSpace ? y : toScreenY(y);
    const r = radius * (screenSpace ? 1 : zoomLevel);
    DS.UI3.quad(DS.UI3.radial(), cx - r, cy - r, r * 2, r * 2,
                0, 1, 1, 0, color, alpha == null ? 1 : alpha);
  }

  function textAlphaS(str, cxPos, y, color, s, alpha) {
    if (!DS.UI3) return;
    DS.UI3.text(str, Math.round(cxPos - textWidth(str, s) / 2), Math.round(y),
                color, s || 1, 'BODY', true, alpha);
  }

  function barS(x, y, w, h, pct, fg, bg, border) {
    pct = DS.M.clamp(pct, 0, 1);
    rectS(x, y, w, h, bg || '#2a2740');
    if (pct > 0) rectS(x + 1, y + 1, Math.max(1, Math.round((w - 2) * pct)), h - 2, fg);
    if (border !== false) frameS(x, y, w, h, '#0d0b12');
  }

  /* A bar with a lit top edge and a shadow under it, so the new HUD reads as
     carved metal instead of as two flat rectangles. */
  function barRPG(x, y, w, h, pct, fg, bg) {
    pct = DS.M.clamp(pct, 0, 1);
    rectS(x - 1, y - 1, w + 2, h + 2, 'rgba(6,5,10,0.85)');
    rectS(x, y, w, h, bg || '#241f36');
    const inner = Math.max(0, Math.round((w - 2) * pct));
    if (inner > 0) {
      rectS(x + 1, y + 1, inner, h - 2, fg);
      rectS(x + 1, y + 1, inner, 1, 'rgba(255,255,255,0.35)');
    }
    frameS(x, y, w, h, '#6f6a90');
  }

  // --- background -----------------------------------------------------------

  /* The dungeon's own backdrop is Three.js geometry now (renderer3d), so there
     is nothing to paint behind the world. Kept so callers read the same. */
  function background(depthOrBiome) { }

  function scrollLayer(layer, factor) { }

  // Screen pixels back to world pixels — the exact inverse of toScreenX/Y, so
  // an aim reticle drawn in UI space points at the world tile under it.
  function toWorldX(screenX) {
    return (screenX - C.W / 2) / zoomLevel + C.W / 2 + offX;
  }

  function toWorldY(screenY) {
    return (screenY - C.H / 2) / zoomLevel + C.H / 2 + offY;
  }

  function uiScale() { return scale; }

  /* A browser pointer position in logical game pixels. The canvas fills the
     window now and the 16:9 play frame is letterboxed inside it, so a bare
     client->canvas ratio would put the reticle on the wrong tile whenever the
     window is not exactly 16:9 (which is most of the time). */
  function pointerToGame(clientX, clientY) {
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const v = DS.UI3 && DS.UI3.view;
    const vx = v ? v.x : 0, vy = v ? v.y : 0;
    const vw = v ? v.w : rect.width, vh = v ? v.h : rect.height;
    const px = (clientX - rect.left) - vx;
    const py = (clientY - rect.top) - vy;
    return {
      x: DS.M.clamp(px / vw * C.W, 0, C.W),
      y: DS.M.clamp(py / vh * C.H, 0, C.H)
    };
  }

  DS.R = {
    init: init,
    get ctx() { return null; },
    get canvas() { return cv; },
    cam: cam,
    setCam: setCam,
    clampCam: clampCam,
    shake: shake,
    punch: punch,
    flash: flash,
    drawFlash: drawFlash,
    present: present,
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
    textTitle: textTitle,
    textTitleCenter: textTitleCenter,
    bar: barS,
    barRPG: barRPG,
    glow: glow,
    textCenterAlpha: textAlphaS,
    textSmall: textSmallS,
    textSmallWidth: textSmallWidth,
    keycap: keycap,
    hints: hints,
    hintsCenter: hintsCenter,
    hintsWidth: hintsWidth,
    toggleFullscreen: toggleFullscreen,
    fitScale: fitScale,
    uiScale: uiScale,
    pointerToGame: pointerToGame,
    CAP_H: CAP_H
  };
})(window.DS);
