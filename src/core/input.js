/* Keyboard + mouse + gamepad, normalised into named actions.
   Everything else in the game asks "is 'jump' down?" and never sees a key code. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const M = DS.M;

  const MAP = {
    left:     ['KeyA', 'ArrowLeft', 'PAD14', 'PADLX-'],
    right:    ['KeyD', 'ArrowRight', 'PAD15', 'PADLX+'],
    up:       ['KeyW', 'ArrowUp', 'PAD12'],
    down:     ['KeyS', 'ArrowDown', 'PAD13'],
    jump:     ['Space', 'KeyW', 'ArrowUp', 'PAD0'],
    attack:   ['KeyJ', 'MOUSE0', 'PAD2'],
    dash:     ['ShiftLeft', 'ShiftRight', 'PAD5', 'PAD7'],
    minidash: ['MOUSE2', 'KeyC', 'PAD10'],
    // E is the weapon skill, so interacting moved to F.
    interact: ['KeyF', 'PAD1'],
    skill:    ['KeyE', 'PAD3'],
    ult:      ['KeyX', 'PAD11'],
    swap:     ['KeyQ', 'PAD4', 'PAD6'],
    /* Tab and Escape are the two keys a host page wants for itself (focus
       order, close-this-panel). B and P are the same actions on keys nobody
       else claims, so the bag and the menu stay reachable even when the
       surrounding shell eats the first binding. */
    bag:      ['Tab', 'KeyB'],
    reroll:   ['KeyR', 'PAD8'],
    pause:    ['Escape', 'KeyP', 'PAD9'],
    /* Enter confirms, everywhere. Space used to as well, which meant the key
       that jumps also picked menu entries - fine for a prototype, wrong for a
       game, and confusing the moment a screen shows a hint. */
    confirm:  ['Enter', 'NumpadEnter', 'PAD0'],
    // The left mouse button as a plain UI click, separate from attacking.
    click:    ['MOUSE0'],
    back:     ['Escape', 'KeyP', 'Backspace', 'PAD1'],
    debug:    ['F1']
  };

  // Keys the browser would otherwise act on (scrolling, focus cycling, quick find).
  const SWALLOW = new Set([
    'Space', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Backspace', 'F1', 'Slash', 'Quote'
  ]);

  const down = new Set();      // currently held
  const pressed = new Set();   // went down during this frame
  const released = new Set();  // went up during this frame

  let anyPressedFlag = false;
  let padIndex = -1;
  let textSink = null;
  const padPrev = new Set();

  // --- keyboard -------------------------------------------------------------

  /* Keys are read on the way *down* the tree (capture), not on the way back up.
     A game embedded in a host -- the editor preview panel, an iframe, a desktop
     shell -- puts its own bubble listeners on window, and Tab / Escape are
     exactly the keys it wants: Tab walks its focus order, Escape closes its
     panel. Whoever runs first wins, and bubble order put the game second, so
     both keys did nothing. Capture makes the game first, and stopping the event
     there means the host never sees a press the game has already used.

     A press with Ctrl / Cmd / Alt is left alone, so browser shortcuts
     (Ctrl+Tab, Cmd+R, Alt+F4) still belong to the browser. */
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SWALLOW.has(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    /* A screen that wants typed text (the name prompt) installs a sink. While
       one is installed the letter keys are delivered to it and consumed, so
       typing a name cannot also jump, dash or open the bag. Enter and Escape
       are deliberately NOT taken here: they stay the ordinary confirm and back
       actions every screen already reads, and Backspace becomes "erase one
       character" only while a sink is installed. */
    if (textSink && (e.code === 'Backspace' ||
                     (e.key && e.key.length === 1 && !e.repeat))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      textSink(e.code === 'Backspace' ? '' : e.key);
      return;
    }
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
    anyPressedFlag = true;
    if (DS.Audio) DS.Audio.unlock();
  }

  function onKeyUp(e) {
    // Escape closes host panels on keyup in some shells, so this side is guarded
    // as well; otherwise the game's menu and the shell's panel fight per press.
    if (SWALLOW.has(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    down.delete(e.code);
    released.add(e.code);
  }

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  // Held keys would otherwise stick when the window loses focus mid-press.
  window.addEventListener('blur', function () {
    down.forEach(function (code) { released.add(code); });
    down.clear();
  });

  // --- mouse ----------------------------------------------------------------

  window.addEventListener('mousedown', function (e) {
    const code = 'MOUSE' + e.button;
    down.add(code);
    pressed.add(code);
    anyPressedFlag = true;
    if (DS.Audio) DS.Audio.unlock();
  });

  window.addEventListener('mouseup', function (e) {
    const code = 'MOUSE' + e.button;
    down.delete(code);
    released.add(code);
  });

  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* Pointer position in logical game pixels. The mapping lives in the renderer
     (DS.R.pointerToGame) because the play frame is now letterboxed inside a
     window-sized canvas -- a plain client->canvas ratio drifts as soon as the
     window is not 16:9. hasMouse stays false until the pointer actually moves,
     so a pad or keyboard player never gets an aim reticle they did not ask
     for. */
  const mouse = { x: C.W / 2, y: C.H / 2, seen: false };

  function trackPointer(e) {
    const p = DS.R && DS.R.pointerToGame && DS.R.pointerToGame(e.clientX, e.clientY);
    if (!p) return;
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.seen = true;
  }

  window.addEventListener('mousemove', trackPointer);
  window.addEventListener('mousedown', trackPointer);

  // --- gamepad --------------------------------------------------------------

  window.addEventListener('gamepadconnected', function (e) { padIndex = e.gamepad.index; });
  window.addEventListener('gamepaddisconnected', function () { padIndex = -1; });

  function pollPad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = padIndex >= 0 ? pads[padIndex] : null;
    if (!pad) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) { pad = pads[i]; padIndex = i; break; }
      }
    }
    if (!pad) return;

    const now = new Set();

    for (let b = 0; b < pad.buttons.length; b++) {
      if (pad.buttons[b].pressed) now.add('PAD' + b);
    }

    const DEADZONE = 0.4;
    const lx = pad.axes[0] || 0;
    if (lx < -DEADZONE) now.add('PADLX-');
    if (lx > DEADZONE) now.add('PADLX+');

    // Diff against last frame so pad buttons produce edge events like keys do.
    now.forEach(function (code) {
      if (!padPrev.has(code)) { pressed.add(code); anyPressedFlag = true; }
      down.add(code);
    });
    padPrev.forEach(function (code) {
      if (!now.has(code)) { released.add(code); down.delete(code); }
    });

    padPrev.clear();
    now.forEach(function (code) { padPrev.add(code); });
  }

  // --- query ----------------------------------------------------------------

  function matches(action, set) {
    const codes = MAP[action];
    if (!codes) return false;
    for (let i = 0; i < codes.length; i++) {
      if (set.has(codes[i])) return true;
    }
    return false;
  }

  const Input = {
    poll: pollPad,

    // Pointer, in canvas pixels. Callers must not mutate the returned object.
    mouse: mouse,

    hasMouse: function () { return mouse.seen; },

    isDown: function (action) { return matches(action, down); },

    justPressed: function (action) { return matches(action, pressed); },

    justReleased: function (action) { return matches(action, released); },

    anyPressed: function () { return anyPressedFlag; },

    /* Install (or clear, with null) the text sink described in onKeyDown. The
       owning screen is responsible for clearing it when it closes: a sink left
       installed would eat every letter the game needs. */
    setTextSink: function (fn) { textSink = fn || null; },

    /* Swallow a press so a single key event cannot be handled twice in one
       frame (e.g. ESC closing the bag and also opening the pause menu). */
    consume: function (action) {
      const codes = MAP[action] || [];
      for (let i = 0; i < codes.length; i++) pressed.delete(codes[i]);
    },

    // Horizontal intent as -1 / 0 / 1.
    axisX: function () {
      return (Input.isDown('right') ? 1 : 0) - (Input.isDown('left') ? 1 : 0);
    },

    // Called at the very end of a frame, after all systems have read input.
    endFrame: function () {
      pressed.clear();
      released.clear();
      anyPressedFlag = false;
    }
  };

  DS.Input = Input;
})(window.DS);
