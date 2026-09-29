/* The world frame: what the camera can EVER see on a floor, as plain arithmetic.

   The backdrop used to be built for one camera position and then chased after
   the hero (a locked horizon that drifted, a stage that dropped when the eye got
   close to the ground). Anything that has to catch up is late, and a horizon
   that is late shows its own edge: a dark band across the frame, a ceiling
   under the eye, stalactites with a gap over them.

   The fix is to stop asking "where is the camera now" and ask the question that
   has one answer per floor: across every position the camera can take on this
   map, and every lens the rig can wear, which rectangle of each backdrop plane
   is ever inside the frame? A recipe then FILLS that rectangle -- ground under
   it, sky over it -- and the backdrop can stand perfectly still in world space,
   the way the real distance does. The rig moves through it; nothing follows.

   Everything here is pure: no THREE, no DOM, no DS dependencies. It mirrors
   two things in other files and must agree with them:

     - DS.R3D.visibleExtent (renderer3d.js) and DS.R.clampCam (renderer.js): how
       far the aim may travel on a map;
     - updateRig (renderer3d.js): where the eye sits for a given aim.

   tests/worldframe.test.js pins both, and pins that a sampled camera never
   sees past the rectangle coverageAt() returned.

   Units: world units (1 tile = 1.6 u, x right, y UP, the actor plane at z = 0
   and the backdrop planes at z = -D). Level pixels are only ever an argument. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const ACTOR_Z = 0.3;        // where bodies stand; visibleExtent measures to it
  const P2U = 0.1;            // level pixels -> world units
  const ZOOM_IN = 0.88;       // the lens breathing in on a fight (renderer3d ZOOM_IN)
  const ZOOM_OUT = 1.0;
  const SHAKE_PAD = 2.0;      // units: a hit shakes the eye by up to this much
  const SLACK = 1.06;         // 6% more than the arithmetic says, for lens punch and rounding

  /* The action rig's numbers, for a caller that has no live rig to read (the
     tests, the QA). The renderer passes its own. */
  const ACTION_RIG = Object.freeze({ fov: 35, pitch: 0.19, dist: 18, yaw: 0, lift: 0.45, aspect: 16 / 9 });

  function rigOf(r) {
    r = r || ACTION_RIG;
    return {
      fov: r.fov != null ? r.fov : ACTION_RIG.fov,
      pitch: r.pitch != null ? r.pitch : ACTION_RIG.pitch,
      dist: r.dist != null ? r.dist : ACTION_RIG.dist,
      yaw: r.yaw || 0,
      lift: r.lift || 0,
      aspect: r.aspect || ACTION_RIG.aspect
    };
  }

  /* What the lens sees ON THE ACTOR PLANE around its aim, in level pixels:
     half the width, how far up, how far down (a tilted lens does not see the
     same distance both ways) and the lift of the aim. The same formulas as
     DS.R3D.visibleExtent, for a chosen zoom. */
  function extentPx(rig, zoom) {
    rig = rigOf(rig);
    const f = rig.fov * Math.PI / 180, p = rig.pitch;
    const dist = rig.dist * (zoom == null ? 1 : zoom);
    const D = dist * Math.cos(p) - ACTOR_Z;
    return {
      up: (dist * Math.sin(p) - D * Math.tan(p - f / 2)) / P2U,
      down: (D * Math.tan(p + f / 2) - dist * Math.sin(p)) / P2U,
      half: dist * Math.tan(f / 2) * rig.aspect * Math.cos(rig.yaw) / P2U,
      lift: rig.lift / P2U
    };
  }

  /* Where the AIM may travel on a map of pixelW x pixelH level pixels, in world
     units. DS.R.clampCam's rule, evaluated at the zoom that lets it go furthest
     (the lens in close sees least, so it may sit nearest an edge). */
  function cameraRange(pixelW, pixelH, rig) {
    const e = extentPx(rig, ZOOM_IN);
    const cx = pixelW < e.half * 2 ? [pixelW / 2, pixelW / 2] : [e.half, pixelW - e.half];
    const cy = pixelH < e.up + e.down
      ? [pixelH / 2 + e.lift, pixelH / 2 + e.lift]
      : [e.up + e.lift, pixelH - e.down + e.lift];
    // Level y grows DOWN; world y grows UP, and the rig's lift raises the aim.
    const lift = rigOf(rig).lift;
    return {
      x0: cx[0] * P2U, x1: cx[1] * P2U,
      y0: -cy[1] * P2U + lift, y1: -cy[0] * P2U + lift
    };
  }

  /* The four corners of the frame, on the plane z = -D, for an aim at
     (ax, ay) and a zoom. Follows updateRig: the eye sits `dist` from the aim,
     turned by yaw and raised by pitch, and looks at it. Returns null when the
     frame's rays do not reach the plane (a steeply turned rig). */
  function frameCorners(rig, ax, ay, zoom, D) {
    rig = rigOf(rig);
    const dist = rig.dist * zoom;
    const cp = Math.cos(rig.pitch);
    const ex = ax + Math.sin(rig.yaw) * dist * cp;
    const ey = ay + Math.sin(rig.pitch) * dist;
    const ez = Math.cos(rig.yaw) * dist * cp;
    // forward, right, up
    let fx = ax - ex, fy = ay - ey, fz = -ez;
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, ry = 0, rz = fx;            // forward x world-up (0,1,0)
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const tv = Math.tan(rig.fov * Math.PI / 360), th = tv * rig.aspect;
    const out = [];
    for (let i = 0; i < 4; i++) {
      const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1;
      const dx = fx + sx * th * rx + sy * tv * ux;
      const dy = fy + sy * tv * uy;
      const dz = fz + sx * th * rz + sy * tv * uz;
      if (dz > -1e-6) return null;
      const t = (-D - ez) / dz;
      out.push({ x: ex + dx * t, y: ey + dy * t });
    }
    return out;
  }

  /* The rectangle of the plane z = -D that is ever inside the frame, over the
     whole camera range and both ends of the zoom, padded for shake. */
  function coverageAt(D, range, rig, opts) {
    const pad = opts && opts.pad != null ? opts.pad : SHAKE_PAD;
    const zooms = [ZOOM_IN, ZOOM_OUT];
    const xs = [range.x0, range.x1], ys = [range.y0, range.y1];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let zi = 0; zi < zooms.length; zi++) {
      for (let xi = 0; xi < 2; xi++) {
        for (let yi = 0; yi < 2; yi++) {
          const c = frameCorners(rig, xs[xi], ys[yi], zooms[zi], D);
          if (!c) continue;
          for (let k = 0; k < 4; k++) {
            if (c[k].x < x0) x0 = c[k].x;
            if (c[k].x > x1) x1 = c[k].x;
            if (c[k].y < y0) y0 = c[k].y;
            if (c[k].y > y1) y1 = c[k].y;
          }
        }
      }
    }
    if (!(x1 > x0)) return null;
    const mx = (x1 - x0) * (SLACK - 1) * 0.5 + pad, my = (y1 - y0) * (SLACK - 1) * 0.5 + pad;
    return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
  }

  /* How far above and below the EYE, and to each side of it, the frame reaches
     on the plane z = -D. Independent of the map: this is the size a sky that is
     pinned to the eye has to be. */
  function eyeSpan(D, rig) {
    const r = { x0: 0, x1: 0, y0: 0, y1: 0 };
    const c = coverageAt(D, r, rig, { pad: 0 });
    if (!c) return null;
    const eye = rigOf(rig);
    const eyeY = Math.sin(eye.pitch) * eye.dist;      // the eye's height over the aim (zoom 1)
    return { up: c.y1 - eyeY, down: eyeY - c.y0, half: Math.max(-c.x0, c.x1) };
  }

  /* The eye's height range over a camera range (zoom 1 puts it highest). */
  function eyeRange(range, rig) {
    const r = rigOf(rig);
    const h = Math.sin(r.pitch) * r.dist;
    return { y0: range.y0 + h * ZOOM_IN, y1: range.y1 + h };
  }

  /* Everything a build needs about one floor, in one object. */
  function forMap(pixelW, pixelH, rig, rungs) {
    const range = cameraRange(pixelW, pixelH, rig);
    const eye = eyeRange(range, rig);
    const at = {};
    for (let i = 0; i < rungs.length; i++) at[rungs[i]] = coverageAt(rungs[i], range, rig);
    return { range: range, eye: eye, at: at, rig: rigOf(rig) };
  }

  DS.WorldFrame = {
    ACTION_RIG: ACTION_RIG,
    ZOOM_IN: ZOOM_IN,
    ZOOM_OUT: ZOOM_OUT,
    extentPx: extentPx,
    cameraRange: cameraRange,
    frameCorners: frameCorners,
    coverageAt: coverageAt,
    eyeSpan: eyeSpan,
    eyeRange: eyeRange,
    forMap: forMap
  };
})(window.DS);
