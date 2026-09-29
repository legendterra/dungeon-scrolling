/* Procedural body animation, as plain arithmetic.

   The rigs (hero and enemies) already swing limbs from velocity. What they
   lacked is the layer that makes a body feel like it has mass: a crouch before
   the jump, a stretch as it leaves the floor, a squash when it lands, a lean
   into a dash, a flinch when it is hit, a topple when it dies. That layer is a
   handful of springs and timers stepped once per GAME frame, and it lives here
   so the rules are pinned by tests/anim.test.js -- no THREE, no DOM, no DS
   dependencies, nothing allocated per call.

   Usage: keep one state per body (create()), fill the shared `input` scratch
   object from the entity, call step(state, input); read the result from
   state.out. The renderer multiplies out.sy / out.sxz into the root scale
   (origin at the feet, so a squash never sinks the body) and adds the pitches
   to the torso. All angles are radians, positive = forward (toward facing). */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const CFG = Object.freeze({
    SPRING_K: 0.2,          // pull back to rest, per frame
    SPRING_DAMP: 0.74,      // velocity kept per frame
    CROUCH: -0.17,          // take-off dip (fraction of height)
    LAUNCH: 0.055,          // stretch kick that follows the dip
    LAND_MAX: -0.3,         // deepest landing squash
    LAND_VY: 7,             // fall speed that gives the deepest squash
    LAND_MIN_VY: 1.2,       // gentler than this is a step, not a landing
    APEX_VY: 0.9,           // |vy| under this in the air counts as the apex
    DASH_LEAN: 0.55,        // forward pitch while dashing
    LEAN_RATE: 0.28,        // ease toward the lean target
    FLINCH_FRAMES: 16,      // how long a hit recoil lasts
    FLINCH_PITCH: -0.42,    // torso thrown back
    DEATH_FRAMES: 42,       // topple duration
    WIND_LEAN: -0.32        // anticipation: coil back before a strike
  });

  function create() {
    return {
      grounded: true, prevVy: 0, prevHurt: 0,
      s: 0, sv: 0,            // squash spring: s in [-0.3, 0.1], 0 = rest
      lean: 0,                // smoothed forward pitch
      apex: 0,                // 0..1, eased apex tuck
      flinchT: 0,             // frames left of the hit recoil
      deathT: 0,              // frames since death
      landT: 99,              // frames since the last landing (knee bend); 99 = long ago
      out: {
        sy: 1, sxz: 1,        // scale of the body (volume preserved)
        pitch: 0,             // torso forward pitch, lean + flinch + coil
        tuck: 0,              // 0..1 legs drawn up at the jump apex
        knees: 0,             // 0..1 knee bend after a landing
        flinch: 0,            // 0..1 hit recoil strength
        death: 0,             // 0..1 topple progress
        justLanded: false,    // true for the one frame a landing happens
        landPower: 0          // 0..1 how hard it was
      }
    };
  }

  /* The scratch input the caller fills:
       grounded  standing on something (or holding a rope / swimming)
       vy        vertical speed, +down
       dashing   mid-dash
       hurt      the entity's hurt flash is up
       dead      the entity is dead
       wind      0..1 attack wind-up progress (0 when not winding) */
  const input = { grounded: true, vy: 0, dashing: false, hurt: false, dead: false, wind: 0 };

  function step(st, inp) {
    const o = st.out;
    o.justLanded = false;
    o.landPower = 0;

    // --- take-off and landing ---------------------------------------------------
    if (st.grounded && !inp.grounded && inp.vy < 0) {
      // Dip, then the spring throws the body up: crouch -> stretch.
      st.s = CFG.CROUCH; st.sv = CFG.LAUNCH;
    } else if (!st.grounded && inp.grounded && st.prevVy > CFG.LAND_MIN_VY) {
      const k = Math.min(1, st.prevVy / CFG.LAND_VY);
      st.s = CFG.LAND_MAX * k;
      st.sv = 0;
      st.landT = 0;
      o.justLanded = true;
      o.landPower = k;
    }
    st.grounded = !!inp.grounded;
    if (!st.grounded) st.prevVy = inp.vy;

    // Airborne stretch grows with speed, so a long fall reads as a fall.
    let target = 0;
    if (!st.grounded) target = Math.min(0.09, Math.abs(inp.vy) * 0.012);
    st.sv += (target - st.s) * CFG.SPRING_K;
    st.sv *= CFG.SPRING_DAMP;
    st.s += st.sv;
    if (st.s < -0.34) st.s = -0.34;
    if (st.s > 0.14) st.s = 0.14;

    // --- apex tuck and landing knees ---------------------------------------------
    const atApex = !st.grounded && Math.abs(inp.vy) < CFG.APEX_VY ? 1 : 0;
    st.apex += (atApex - st.apex) * 0.25;
    st.landT++;
    const knees = Math.max(0, 1 - st.landT / 9);

    // --- lean: dash drives forward, wind-up coils back ---------------------------
    let leanTarget = 0;
    if (inp.dashing) leanTarget = CFG.DASH_LEAN;
    else if (inp.wind > 0) leanTarget = CFG.WIND_LEAN * inp.wind;
    st.lean += (leanTarget - st.lean) * CFG.LEAN_RATE;

    // --- flinch: rising edge of the hurt flag ------------------------------------
    if (inp.hurt && !st.prevHurt) st.flinchT = CFG.FLINCH_FRAMES;
    st.prevHurt = inp.hurt ? 1 : 0;
    if (st.flinchT > 0) st.flinchT--;
    const fl = st.flinchT / CFG.FLINCH_FRAMES;
    // Fast out, slow back: the recoil is sharp then settles.
    const flinch = fl * fl * (3 - 2 * fl);

    // --- death ---------------------------------------------------------------------
    if (inp.dead) { if (st.deathT < CFG.DEATH_FRAMES) st.deathT++; } else st.deathT = 0;
    const dt = st.deathT / CFG.DEATH_FRAMES;

    // --- out -------------------------------------------------------------------------
    o.sy = 1 + st.s;
    o.sxz = 1 / Math.sqrt(o.sy);
    o.pitch = st.lean + flinch * CFG.FLINCH_PITCH;
    o.tuck = st.apex;
    o.knees = knees;
    o.flinch = flinch;
    o.death = dt * dt * (3 - 2 * dt);
    return o;
  }

  function reset(st) {
    st.grounded = true; st.prevVy = 0; st.prevHurt = 0;
    st.s = 0; st.sv = 0; st.lean = 0; st.apex = 0;
    st.flinchT = 0; st.deathT = 0; st.landT = 99;
    return st;
  }

  DS.Anim = { CFG: CFG, create: create, step: step, reset: reset, input: input };
})(window.DS = window.DS || {});
