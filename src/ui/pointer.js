/* The mouse, as every screen in the game wants to use it.

   Menus used to be driven entirely by A and D, which is fine for a HUD but
   wrong for a screen full of things you are meant to look at and choose
   between. This is the small layer underneath all of them: hit tests in screen
   space, a click that is separate from attacking, a drag payload that survives
   between frames, and a drawn cursor so the pointer belongs to the game rather
   than to the operating system.

   Everything here is in logical screen units (320x180), which is what the
   `...S` renderer calls and DS.Input.mouse both already speak. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;

  // The item currently being carried by the cursor, if any.
  const drag = { item: null, from: null, offX: 0, offY: 0, moved: false };

  // Where the current press started, so a press-and-release in place reads as a
  // click rather than as a drag, and so a drag knows what it picked up.
  const press = { x: 0, y: 0, down: false };

  function active() { return DS.Input.hasMouse(); }
  function x() { return DS.Input.mouse.x; }
  function y() { return DS.Input.mouse.y; }

  function inRect(rx, ry, rw, rh) {
    if (!active()) return false;
    const px = x(), py = y();
    return px >= rx && px < rx + rw && py >= ry && py < ry + rh;
  }

  function down() { return DS.Input.isDown('click'); }
  function justPressed() { return DS.Input.justPressed('click'); }
  function justReleased() { return DS.Input.justReleased('click'); }

  // A press that began inside this rectangle, this frame.
  function pressedIn(rx, ry, rw, rh) {
    return justPressed() && inRect(rx, ry, rw, rh);
  }

  // A release inside this rectangle, this frame.
  function releasedIn(rx, ry, rw, rh) {
    return justReleased() && inRect(rx, ry, rw, rh);
  }

  /* A click, in the sense a person means it: press and release without having
     dragged anything away in between. */
  function clicked(rx, ry, rw, rh) {
    if (!releasedIn(rx, ry, rw, rh)) return false;
    return !drag.moved;
  }

  function beginFrame() {
    if (justPressed()) {
      press.x = x(); press.y = y(); press.down = true;
      drag.moved = false;
    }
    if (press.down && (Math.abs(x() - press.x) > 2 || Math.abs(y() - press.y) > 2)) {
      drag.moved = true;
    }
    if (justReleased()) press.down = false;
  }

  function startDrag(item, from) {
    drag.item = item;
    drag.from = from;
    drag.moved = true;
  }

  function clearDrag() {
    drag.item = null;
    drag.from = null;
  }

  function dragging() { return !!drag.item; }

  // --- drawing --------------------------------------------------------------

  /* Screens that draw their own cursor hide the system one, so the pointer is
     the same pixel arrow everywhere instead of an OS arrow over a pixel game. */
  /* The canvas also carries `cursor: none` in CSS; this is the belt to that
     brace, for a host that styles the canvas after load. */
  function hideSystemCursor() {
    const cv = DS.R.canvas;
    if (cv && cv.style.cursor !== 'none') cv.style.cursor = 'none';
  }

  const ARROW = [
    'W.......',
    'WW......',
    'WkW.....',
    'WkkW....',
    'WkkkW...',
    'WkkkkW..',
    'WkkkkkW.',
    'WkkkkkkW',
    'WkkkkW..',
    'WkWkkW..',
    'W..WkkW.',
    '....WkW.',
    '.....WW.'
  ];

  /* --- sizing ---------------------------------------------------------------

     The pointer is UI, not world: it has to be the same physical size on every
     monitor, so its size is stated in SCREEN pixels and converted, never drawn
     in logical units -- which is how it ended up 48x78 px tall on a 1080p
     display (the logical frame is blown up 6x there). Two screen pixels per art
     pixel matches the RS=2 art the whole game is authored at, so the arrow
     stays sharp at every integer scale. */
  const CURSOR_PX = 2;

  /* Logical units per art pixel, for anything else that wants to draw at the
     pointer's scale (the aim reticle in ui.js). */
  function unit() {
    const s = (DS.UI3 && DS.UI3.view && DS.UI3.view.scale) || 1;
    return CURSOR_PX / s;
  }

  // Height of the pointer in screen pixels -- 26, whatever the window is.
  function height() { return ARROW.length * CURSOR_PX; }

  /* The arrow, baked once at screen-pixel detail and drawn as ONE quad instead
     of thirty pixel runs. Cached per edge colour, because the accent is a
     per-screen choice and the bake is a canvas fill. */
  const arrowCache = {};

  function arrowCanvas(accent) {
    const key = accent || '#0d0b12';
    if (arrowCache[key]) return arrowCache[key];
    const cols = ARROW[0].length, rows = ARROW.length;
    const cv = document.createElement('canvas');
    cv.width = cols * CURSOR_PX;
    cv.height = rows * CURSOR_PX;
    const g = cv.getContext('2d');
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const ch = ARROW[row][col];
        if (ch === '.') continue;
        g.fillStyle = ch === 'W' ? '#ffffff' : key;
        g.fillRect(col * CURSOR_PX, row * CURSOR_PX, CURSOR_PX, CURSOR_PX);
      }
    }
    arrowCache[key] = cv;
    return cv;
  }

  function cursor(accent) {
    if (!active()) return;
    /* An HTML screen is up: the system cursor is the pointer there (see
       html.hk-open in styles/panels.css), so the drawn arrow stands down
       rather than doubling it. */
    if (DS.HKit && DS.HKit.anyOpen()) return;
    const U = DS.UI3;
    if (!U || !U.ready) return;
    hideSystemCursor();

    const cv = arrowCanvas(accent);
    const u = unit();
    /* The art's tip is its top-left pixel, and it is placed unfrounded so the
       tip sits exactly on the point the game hit-tests. */
    U.topQuad(U.texFor(cv), x(), y(), cv.width * u, cv.height * u, '#ffffff', 1);
  }

  /* Every cursor this game has. The loop draws the active one after the scene
     has drawn itself, so a screen cannot forget it and two cursors can never
     appear at once. */
  const CURSORS = { arrow: cursor, none: function () { hideSystemCursor(); } };

  function drawCursor(name) {
    const fn = CURSORS[name || 'arrow'] || CURSORS.arrow;
    fn();
  }

  /* The item riding the cursor during a drag, drawn last so it is over every
     panel it might be dropped onto. */
  function dragGhost() {
    if (!drag.item) return;
    const R = DS.R;
    const icon = DS.SPR.itemIcon(drag.item);
    const px = Math.round(x()) - 6, py = Math.round(y()) - 6;
    const color = DS.Weapons.rarityColor(drag.item.rarity);

    R.rectS(px - 1, py - 1, 14, 14, 'rgba(13,11,18,0.7)');
    R.frameS(px - 1, py - 1, 14, 14, color);
    if (icon) R.sprS(icon, px, py);
  }

  /* A hover highlight that every screen shares, so "this is the thing under
     your cursor" always looks the same. */
  function highlight(rx, ry, rw, rh, color, frames) {
    const R = DS.R;
    const pulse = 0.10 + Math.sin((frames || 0) * 0.15) * 0.04;
    R.rectS(rx, ry, rw, rh, 'rgba(255,255,255,' + pulse.toFixed(3) + ')');
    R.frameS(rx, ry, rw, rh, color || '#ffffff');
  }

  DS.Ptr = {
    drag: drag,
    active: active,
    x: x,
    y: y,
    inRect: inRect,
    down: down,
    justPressed: justPressed,
    justReleased: justReleased,
    pressedIn: pressedIn,
    releasedIn: releasedIn,
    clicked: clicked,
    beginFrame: beginFrame,
    startDrag: startDrag,
    clearDrag: clearDrag,
    dragging: dragging,
    cursor: cursor,
    drawCursor: drawCursor,
    unit: unit,
    height: height,
    CURSOR_PX: CURSOR_PX,
    dragGhost: dragGhost,
    highlight: highlight,
    hideSystemCursor: hideSystemCursor
  };
})(window.DS);
