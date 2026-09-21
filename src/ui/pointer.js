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

  function cursor(accent) {
    if (!active()) return;
    hideSystemCursor();
    const R = DS.R;
    const px = Math.round(x()), py = Math.round(y());
    const edge = accent || '#0d0b12';

    for (let row = 0; row < ARROW.length; row++) {
      const line = ARROW[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch === '.') continue;
        R.rectS(px + col, py + row, 1, 1, ch === 'W' ? '#ffffff' : edge);
      }
    }
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
    dragGhost: dragGhost,
    highlight: highlight,
    hideSystemCursor: hideSystemCursor
  };
})(window.DS);
