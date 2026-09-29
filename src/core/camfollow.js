/* The camera's follow, as plain arithmetic.

   The follow used to be two lerps straight onto the hero's centre: x at 0.09,
   y at 0.07. That is fine sideways and wrong vertically, because a platformer's
   hero spends half his life in the air. Every jump dragged the whole frame up
   by forty pixels and back down again -- the level, the backdrop and the HUD
   anchors all bobbing -- which is the "background blinks when I jump" report.

   The fix is the classic platformer rule, GROUNDED-Y FOLLOW:

     - The camera tracks an ANCHOR, not the hero. The anchor is the hero's
       height the last time he stood on something (or held a rope, or swam).
     - In the air the anchor does not move while the hero stays inside a BAND
       around it: a single jump (41 px apex at the base jump speed) fits with
       room to spare and the frame holds perfectly still. A double jump peaks
       at ~70-76 px, just past the band, so the frame moves by at most ~15 px
       for the top of it (tests/camera.test.js pins both).
     - Leaving the band pushes the anchor with him -- a double jump up a shaft,
       a drop off a ledge -- so he is never lost; a fast fall also leans the aim
       down so the landing is on screen before he reaches it.
     - Landing somewhere new moves the anchor there at once and the camera
       re-centres on it smoothly (an exponential ease, no snap).

   Horizontal follow is unchanged: a smooth look-ahead in the facing direction.

   Everything here is pure: no THREE, no DOM, no DS dependencies, so the rules
   are pinned by tests/camera.test.js. It allocates nothing per call -- the
   caller owns a `cam` ({x, y}, level pixels, +y down), a `state` from create()
   and may reuse the module's own `input` scratch object. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const CFG = Object.freeze({
    LOOK_AHEAD: 22,     // px ahead of the hero in the facing direction
    X_RATE: 0.09,       // horizontal ease per frame
    AIM_ABOVE: 8,       // the aim sits this far above the anchor
    BAND_UP: 72,        // how far above the anchor the hero may rise untracked (a double jump peaks ~76)
    BAND_DOWN: 10,      // how far below it he may drop untracked
    Y_RATE: 0.07,       // vertical re-centre ease per frame
    Y_RATE_FALL: 0.15,  // ... while chasing a real fall
    FALL_VY: 3.0,       // px/frame of downward speed that counts as a fall
    FALL_LOOK: 6,       // extra look-down per px/frame above FALL_VY
    FALL_LOOK_MAX: 24,  // cap on that look-down
    MAX_DEV: 56         // the hero's centre is never further than this from the aim (the frame's half-height is ~57)
  });

  function create() {
    return { anchorY: 0, ready: false, key: null, chasing: false };
  }

  /* Seat the follow on a hero standing at (px, py): the anchor is where he is
     and nothing eases in from the previous floor. */
  function reset(state, px, py, key) {
    state.anchorY = py;
    state.ready = true;
    state.key = key === undefined ? null : key;
    state.chasing = false;
    return state;
  }

  /* Where the anchor goes this frame. Returns true while it is being dragged
     DOWN by a fall (the caller eases faster and leans the aim down then). */
  function stepAnchor(state, inp) {
    if (inp.grounded || inp.tracking) {
      state.anchorY = inp.py;
      return false;
    }
    const up = state.anchorY - CFG.BAND_UP;
    const down = state.anchorY + CFG.BAND_DOWN;
    if (inp.py < up) {
      state.anchorY = inp.py + CFG.BAND_UP;
      return false;
    }
    if (inp.py > down) {
      state.anchorY = inp.py - CFG.BAND_DOWN;
      return true;
    }
    return false;
  }

  /* One frame of follow. `cam` is moved in place; `inp` carries the hero:
       px, py     centre, level pixels
       facing     -1 / +1
       vy         vertical speed, px/frame, +down
       grounded   standing on something this frame
       tracking   on a rope / ladder / in water: follow him continuously */
  function step(cam, state, inp) {
    if (!state.ready) reset(state, inp.px, inp.py);

    const targetX = inp.px + (inp.facing < 0 ? -1 : 1) * CFG.LOOK_AHEAD;
    cam.x += (targetX - cam.x) * CFG.X_RATE;

    const falling = stepAnchor(state, inp);
    const fast = falling && inp.vy > CFG.FALL_VY;
    state.chasing = fast;
    const lean = fast ? Math.min((inp.vy - CFG.FALL_VY) * CFG.FALL_LOOK, CFG.FALL_LOOK_MAX) : 0;
    const targetY = state.anchorY - CFG.AIM_ABOVE + lean;
    cam.y += (targetY - cam.y) * (fast ? CFG.Y_RATE_FALL : CFG.Y_RATE);

    /* The one hard rule: however the eases are tuned, the hero stays framed. */
    if (inp.py < cam.y - CFG.MAX_DEV) cam.y = inp.py + CFG.MAX_DEV;
    else if (inp.py > cam.y + CFG.MAX_DEV) cam.y = inp.py - CFG.MAX_DEV;
    return cam;
  }

  DS.CamFollow = {
    CFG: CFG,
    create: create,
    reset: reset,
    step: step,
    /* A scratch input for callers that run every frame (no allocation). */
    input: { px: 0, py: 0, facing: 1, vy: 0, grounded: true, tracking: false }
  };
})(window.DS);
