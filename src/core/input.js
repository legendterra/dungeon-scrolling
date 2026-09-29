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
    /* Elemental infusion. R/View share the shrine's reroll binding on purpose:
       the shrine is a modal, so the two are never read in the same frame.
       Backwards is T, not Shift+R - Shift is dash and would fire first. */
    infuse:     ['KeyR', 'PAD8'],
    infuseBack: ['KeyT'],
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

  /* --- rebinding ---------------------------------------------------------------

     What a player can change is the keyboard and mouse half of an action: up to
     three codes each. The gamepad half (PAD*) stays as authored. MAP is rebuilt
     from the two whenever one changes, so everything that asks isDown('jump')
     keeps working without knowing any of this. */
  const REBINDABLE = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'minidash', 'interact',
                      'skill', 'ult', 'swap', 'bag', 'infuse', 'infuseBack', 'pause'];
  const SLOTS = 3;
  const PAD_PART = {};
  const DEFAULT_KB = {};
  const KB = {};
  const isPad = function (c) { return c.indexOf('PAD') === 0; };
  REBINDABLE.forEach(function (a) {
    DEFAULT_KB[a] = MAP[a].filter(function (c) { return !isPad(c); });
    PAD_PART[a] = MAP[a].filter(isPad);
    KB[a] = DEFAULT_KB[a].slice();
  });
  // R is both the reroll at a shrine and the infusion key; they follow each other.
  const ALIAS = { reroll: 'infuse' };

  function rebuild(action) {
    MAP[action] = KB[action].concat(PAD_PART[action]);
    for (const a in ALIAS) if (ALIAS[a] === action) MAP[a] = MAP[action].slice();
  }

  let capture = null;
  function finishCapture(code) {
    const fn = capture;
    capture = null;
    if (fn) fn(code);
  }

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
    // A screen waiting for "press the key you want" takes this one and nothing else does.
    if (capture) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) finishCapture(e.code);
      return;
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
    if (capture) { e.preventDefault(); finishCapture(code); return; }
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

    /* --- rebinding (see the block above MAP) --- */
    REBINDABLE: REBINDABLE,
    SLOTS: SLOTS,
    /* The keyboard / mouse codes of an action, always SLOTS long ('' = empty). */
    keysOf: function (action) {
      const out = (KB[action] || []).slice(0, SLOTS);
      while (out.length < SLOTS) out.push('');
      return out;
    },
    defaultKeysOf: function (action) {
      const out = (DEFAULT_KB[action] || []).slice(0, SLOTS);
      while (out.length < SLOTS) out.push('');
      return out;
    },
    /* Put `code` in slot i of `action`. A code is unique among the rebindable
       actions: whoever held it loses it, and is named in the return so the
       screen can say so. Returns { ok, stolenFrom }. */
    bind: function (action, slot, code) {
      if (!KB[action] || slot < 0 || slot >= SLOTS) return { ok: false };
      let stolen = null;
      if (code) {
        for (let i = 0; i < REBINDABLE.length; i++) {
          const other = REBINDABLE[i];
          if (other === action) continue;
          // jump / up / down share the arrow and W keys by design: a menu and a rope want them too.
          if ((action === 'jump' && other === 'up') || (action === 'up' && other === 'jump')) continue;
          const at = KB[other].indexOf(code);
          if (at >= 0) { KB[other].splice(at, 1); rebuild(other); stolen = other; }
        }
        const mine = KB[action].indexOf(code);
        if (mine >= 0 && mine !== slot) KB[action].splice(mine, 1);
      }
      const list = KB[action].slice();
      while (list.length < slot) list.push('');
      if (code) list[slot] = code; else list.splice(slot, 1);
      KB[action] = list.filter(Boolean);
      rebuild(action);
      return { ok: true, stolenFrom: stolen };
    },
    resetBindings: function () {
      REBINDABLE.forEach(function (a) { KB[a] = DEFAULT_KB[a].slice(); rebuild(a); });
    },
    /* The whole keyboard half as a plain object, and back: what Settings stores. */
    exportBindings: function () {
      const out = {};
      REBINDABLE.forEach(function (a) { out[a] = KB[a].slice(0, SLOTS); });
      return out;
    },
    importBindings: function (obj) {
      if (!obj || typeof obj !== 'object') return;
      REBINDABLE.forEach(function (a) {
        const list = obj[a];
        if (!Array.isArray(list)) return;
        const clean = list.filter(function (c) { return typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c) && !isPad(c); }).slice(0, SLOTS);
        if (clean.length) { KB[a] = clean; rebuild(a); }
      });
    },
    /* The controls sheets are written from what is bound NOW: [{ group, rows: [[labels], text]}]. */
    controlGroups: function () {
      const two = function (a) {
        const seen = [];
        Input.labelsOf(a).forEach(function (l) { if (seen.indexOf(l) < 0) seen.push(l); });
        return seen.length ? seen.slice(0, 2) : ['\u2014'];
      };
      const one = function (a) { return two(a).slice(0, 1); };
      return [
        { group: 'MOVE', rows: [
          [one('left').concat(one('right')), 'Run'],
          [two('jump'), 'Jump \u00b7 again in the air'],
          [two('dash'), 'Dash'],
          [two('minidash'), 'Mini dash \u00b7 two charges']
        ] },
        { group: 'FIGHT', rows: [
          [two('attack'), 'Attack \u00b7 chain the combo'],
          [['HOLD'].concat(one('attack')), 'Charge a heavy blow'],
          [two('skill'), 'Weapon skill \u00b7 mana'],
          [two('ult'), 'Ultimate \u00b7 mana'],
          [two('swap'), 'Swap hands']
        ] },
        { group: 'ELEMENTS', rows: [
          [two('infuse'), 'Infuse \u00b7 next known essence'],
          [two('infuseBack'), 'Infuse \u00b7 previous essence'],
          [['MOUSE'], 'Aim \u00b7 arrows and bolts fly at it']
        ] },
        { group: 'WORLD', rows: [
          [two('interact'), 'Interact \u00b7 open \u00b7 pick up'],
          [two('bag'), 'Bag and equipment'],
          [two('pause'), 'Pause']
        ] }
      ];
    },
    /* A code as a player reads it: KeyA -> A, ShiftLeft -> SHIFT, MOUSE0 -> LMB. */
    label: function (code) {
      if (!code) return '';
      if (/^Key[A-Z]$/.test(code)) return code.slice(3);
      if (/^Digit[0-9]$/.test(code)) return code.slice(5);
      if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6).toUpperCase();
      const names = {
        Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL',
        AltLeft: 'ALT', AltRight: 'ALT', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
        Escape: 'ESC', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BKSP', Delete: 'DEL', Insert: 'INS', Home: 'HOME',
        End: 'END', PageUp: 'PGUP', PageDown: 'PGDN', CapsLock: 'CAPS', Backquote: '`', Minus: '-', Equal: '=',
        BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
        Backslash: '\\', MOUSE0: 'LMB', MOUSE1: 'MMB', MOUSE2: 'RMB', MOUSE3: 'M4', MOUSE4: 'M5'
      };
      return names[code] || code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
    },
    /* The labels of an action's keyboard / mouse codes, empty slots dropped. */
    labelsOf: function (action) {
      return Input.keysOf(action).filter(Boolean).map(Input.label);
    },
    /* The next key, mouse button or nothing at all: press Escape to cancel. */
    captureNext: function (fn) { capture = fn || null; },
    isCapturing: function () { return !!capture; },
    onBindingsChanged: null,

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
