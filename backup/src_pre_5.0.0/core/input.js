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
    bag:      ['Tab'],
    reroll:   ['KeyR', 'PAD8'],
    pause:    ['Escape', 'PAD9'],
    /* Enter confirms, everywhere. Space used to as well, which meant the key
       that jumps also picked menu entries - fine for a prototype, wrong for a
       game, and confusing the moment a screen shows a hint. */
    confirm:  ['Enter', 'NumpadEnter', 'PAD0'],
    // The left mouse button as a plain UI click, separate from attacking.
    click:    ['MOUSE0'],
    back:     ['Escape', 'Backspace', 'PAD1'],
    debug:    ['F1']
  };

  // Keys the browser would otherwise act on (scrolling, focus cycling, quick find).
  const SWALLOW = new Set([
    'Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Backspace', 'F1', 'Slash', 'Quote'
  ]);

  const down = new Set();      // currently held
  const pressed = new Set();   // went down during this frame
  const released = new Set();  // went up during this frame

  let anyPressedFlag = false;
  let padIndex = -1;
  const padPrev = new Set();

  // --- keyboard -------------------------------------------------------------

  window.addEventListener('keydown', function (e) {
    if (SWALLOW.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
    anyPressedFlag = true;
    if (DS.Audio) DS.Audio.unlock();
  });

  window.addEventListener('keyup', function (e) {
    down.delete(e.code);
    released.add(e.code);
  });

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

  /* Pointer position in canvas pixels. The canvas is a fixed 320x180 buffer
     stretched by an integer CSS scale, so the client rect is all we need to
     map a browser coordinate back into game space. hasMouse stays false until
     the pointer actually moves, so a pad or keyboard player never gets an
     aim reticle they did not ask for. */
  const mouse = { x: C.W / 2, y: C.H / 2, seen: false };

  function trackPointer(e) {
    const cv = DS.R && DS.R.canvas;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    mouse.x = M.clamp((e.clientX - rect.left) / rect.width * C.W, 0, C.W);
    mouse.y = M.clamp((e.clientY - rect.top) / rect.height * C.H, 0, C.H);
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
