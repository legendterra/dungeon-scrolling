#!/usr/bin/env node
/* The in-page half of the backdrop QA, shared by every tool that needs it.
 *
 *   const { PRELUDE } = require('./lib/backdrop-page');
 *
 * Installed once per page and then called. Every helper here runs inside the
 * game's own page, against the real objects the renderer built: it walks the
 * player, reports where the celestial body lands, raycasts the horizon for
 * holes, censuses the lights and times the frame.
 *
 * It lives in one file on purpose. audit-backdrop.js and shoot-backdrop.js
 * measure the same walk, and the walk has its own trap: map.groundBelow()
 * answers in PIXELS, and reading it as a row drops the player sixteen times
 * too deep, ends the run, and leaves every later measurement pointed at the
 * game-over screen. A second copy of that arithmetic is a second chance to
 * forget it.
 */

'use strict';

/* --- the in-page half ------------------------------------------------------
   Keep it small: it is shipped into the page as a string. */
const PRELUDE = `(() => {
  const V3 = THREE.Vector3;
  /* The body group, found by WALKING the live tree: the core disc is the one
     unbaked, un-instanced plane whose width is twice the theme's radius. Used to
     hold the report to the picture -- see bodyReal(). */
  const findBody = () => {
    const tg = DS.R3D.themeGroup, rep = DS.R3D.backdrop;
    if (!tg || !rep || !rep.hero) return null;
    let out = null;
    tg.traverse(function (o) {
      if (out || !o.isMesh || o.isInstancedMesh) return;
      if (!o.material || !o.material.map) return;
      if (o.geometry.type !== 'PlaneGeometry') return;
      if (Math.abs(o.geometry.parameters.width - rep.hero.r * 2) > 0.001) return;
      if (o.scale.x !== 1) return;            // a halo, not the disc
      out = o.parent;
    });
    return out;
  };
  const lum = (hex) => {
    const n = parseInt(String(hex).slice(1), 16);
    return +((((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114).toFixed(1));
  };
  /* The tile column the body hangs over, off the LIVE object (see underBody for
     why this is not the same as its azimuth). */
  const bodyColumn = () => {
    const live = liveWorld();
    const rep = DS.R3D.backdrop;
    const units = live ? live.wp.x : (rep && rep.hero ? rep.hero.worldX : 0);
    /* units -> tiles without p2u: the report carries the floor's width in BOTH
       units and tiles, so the scale is already in it. */
    const wu = (rep && rep.wu) || 1;
    return units * DS.currentGame.map.w / wu;
  };
  /* Is the level's own geometry between the player and the body? Two groups get
     asked -- the dungeon the level builder made and the props standing on it --
     rather than the whole scene, because a raycast against everything walks the
     horizon, the actors and the particle systems, and a disposed mesh in any of
     them throws instead of answering. */
  const levelInTheWay = () => {
    const g = DS.currentGame, p = g.player, rep = DS.R3D.backdrop;
    const live = liveWorld();
    if (!live || !p) return false;
    const p2u = ((rep && rep.wu) || 1) / (g.map.w * 16);
    const from = new V3(DS.Ent.centerX(p) * p2u, -DS.Ent.centerY(p) * p2u, 0);
    const dir = live.wp.clone().sub(from);
    const len = dir.length();
    if (len < 2) return false;
    const rc = new THREE.Raycaster(from, dir.normalize(), 0.5, len - 0.8);
    /* The dungeon group is the level's rock and walls, and it is the only thing
       worth asking: a portal sprite or a chest hinge can make three's raycaster
       throw on a disposed mesh, and a throw here would take the whole run down.
       An unanswerable question is answered "not in the way", which is the
       conservative direction for a check that also has to be able to FAIL. */
    try {
      const d = DS.R3D.dungeon;
      return !!(d && rc.intersectObject(d, true).length);
    } catch (e) { return false; }
  };

  /* Where the body REALLY is, in world space and in the horizon group's own
     space. Everything about the body's position is measured off this, never off
     the report: see bodyReal(). */
  const liveWorld = () => {
    const found = findBody();
    if (!found) return null;
    DS.R3D.scene.updateMatrixWorld(true);
    const wp = new V3();
    found.getWorldPosition(wp);
    const lp = DS.R3D.themeGroup.worldToLocal(wp.clone());
    return { wp: wp, lp: lp };
  };
  /* Stand the player on a tile column, at the floor, camera and all.

     THE UNITS MATTER. map.groundBelow() answers in PIXELS (it is ty * T, not a
     row). Reading it as a row puts the player sixteen times too deep, they fall
     out of the world, the run ends, the game-over screen settles, and every
     screenshot after that is the same still image -- which is exactly what the
     first version of this harness reported: the same frame mean on eleven
     floors. So: pixels, and a column with clear headroom, and the run is asked
     whether it is still alive before anything is measured. */
  const walkAt = (want0, span) => {
    const g = DS.currentGame, p = g.player, map = g.map, T = 16;
    const want = Math.max(5, Math.min(map.w - 6, Math.round(want0)));
    const reach = span != null ? span : 30;
    let tx = want, row = -1;
    for (let d = 0; d < reach && row < 0; d++) {
      const cands = d === 0 ? [want] : [want - d, want + d];
      for (let i = 0; i < cands.length; i++) {
        const t = cands[i];
        if (t < 4 || t > map.w - 5) continue;
        const gy = map.groundBelow(t);
        if (gy >= map.pixelH - 3 * T) continue;              // a pit, not a floor
        const ty = Math.round(gy / T);
        if (map.isBlocked(t, ty - 1) || map.isBlocked(t, ty - 2) ||
            map.isBlocked(t, ty - 3)) continue;              // no headroom
        tx = t; row = ty; break;
      }
    }
    if (row < 0) row = Math.round(map.groundBelow(want) / T);
    p.x = tx * T + (T - p.w) * 0.5;
    p.y = (row - 2) * T;
    p.vy = 0;
    /* A teleport is not allowed to end the run: the QA needs the floor alive
       for the next three minutes of checks. */
    p.dead = false;
    p.hp = Math.max(p.hp, 40);
    DS.R.cam.x = DS.Ent.centerX(p) + p.facing * 22;
    DS.R.cam.y = DS.Ent.centerY(p) - 8;
    DS.R.clampCam(0, map.pixelW, 0, map.pixelH);
    return { tx: tx, row: row, want: want, w: map.w };
  };
  window.__BQA = {
    /* Walk the player (and the camera with it) to a fraction of the floor. */
    frac: (f) => walkAt(DS.currentGame.map.w * f),
    /* Walk to the column the body actually HANGS OVER.

       Not the same thing as walking to its azimuth, and the difference is not
       cosmetic: az is a fraction of the AUTHORED span, which build() spreads
       over 90% of the floor centred on its middle, so the body's column is
       0.05 + 0.9*az of the floor while "walk to az" lands the player elsewhere
       -- up to six units away. On some floors that was far enough to push the
       body to the very edge of the frame, or past it, while the pixel check
       happily measured the dark wall the body had slid behind.

       The column is taken off the LIVE object, so the walk and the projection
       can never be derived from two different places. */
    underBody: () => walkAt(bodyColumn(), 8),
    /* And the same walk, but stopping at the first column where the LEVEL ITSELF
       is not standing between the player and the body.

       This one matters, and it is not a loophole. The game's own rock is a wall
       in front of the horizon whenever the player is in a trench: no backdrop
       can be seen through it, and a harness that insists on measuring there is
       measuring the level, not the horizon. So the walk looks near the body's
       column for a place where the line to the light is clear of the level, and
       the body-pass checks the framedness separately -- if NO column near the
       body is clear, the check still runs and still fails. */
    vantage: (spread) => {
      const near = bodyColumn();
      const span = spread != null ? spread : 8;
      let best = null;
      for (let k = 0; k <= span; k++) {
        const cands = k === 0 ? [near] : [near - k, near + k];
        for (let i = 0; i < cands.length; i++) {
          const walk = walkAt(cands[i], span);
          const blocked = levelInTheWay();
          if (!best) best = { tx: walk.tx, row: walk.row, w: walk.w, blocked: blocked };
          if (!blocked) { best.blocked = false; best.tx = walk.tx; best.row = walk.row; return best; }
        }
      }
      return best;
    },
    /* Is the run still the thing on screen? */
    alive: () => {
      const g = DS.currentGame, p = g ? g.player : null;
      return { dead: !!(p && p.dead), hp: p ? p.hp : 0,
               live: !!(g && DS.currentScene && DS.currentScene.g === g),
               frames: g ? g.frames : 0,
               finished: g ? !!g.finished : null,
               paused: g ? !!g.paused : null,
               depth: g ? g.depth : -1,
               scene: DS.currentScene
                 ? (DS.currentScene.g ? 'run' : Object.keys(DS.currentScene).join(','))
                 : 'none' };
    },
    /* A fresh run at this depth, for when the harness (or the game) ends one. */
    restart: (depth) => {
      DS.Scenes.play(null, { weapon: 'sword' });
      return { depth: depth, started: true };
    },
    /* Every light in the scene, and whether any of them is broken. */
    census: () => {
      let lights = 0, bad = 0;
      const by = {};
      DS.R3D.scene.traverse(function (o) {
        if (!o.isLight) return;
        lights++;
        by[o.type] = (by[o.type] || 0) + 1;
        if (!Number.isFinite(o.intensity) || !Number.isFinite(o.position.x)) bad++;
      });
      return { lights: lights, bad: bad, by: by };
    },
    /* No world-space value in the horizon may be non-finite. A single NaN in an
       instance matrix is a band three.js silently draws as NOTHING AT ALL,
       which is the "the background is missing" report in its most literal
       form -- and it is how one NaN light blacked the whole screen in v5.2.1. */
    finite: () => {
      const bad = [];
      DS.R3D.themeGroup.traverse(function (o) {
        const f = (v, what) => { if (!Number.isFinite(v) && bad.length < 8) bad.push(what); };
        f(o.position.x, 'posX'); f(o.position.y, 'posY'); f(o.position.z, 'posZ');
        f(o.scale.x, 'sclX'); f(o.scale.y, 'sclY'); f(o.scale.z, 'sclZ');
        f(o.rotation.x, 'rotX'); f(o.rotation.y, 'rotY'); f(o.rotation.z, 'rotZ');
        if (o.isInstancedMesh) {
          const a = o.instanceMatrix.array;
          for (let i = 0; i < a.length; i += 13) f(a[i], 'instMatrix');
          if (o.instanceColor) {
            const c = o.instanceColor.array;
            for (let i = 0; i < c.length; i += 11) f(c[i], 'instColor');
          }
        }
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i];
          if (m.color) { f(m.color.r, 'matR'); f(m.color.g, 'matG'); f(m.color.b, 'matB'); }
          f(m.opacity, 'matA');
          if (m.map && m.map.repeat) { f(m.map.repeat.x, 'repX'); f(m.map.repeat.y, 'repY'); }
        }
      });
      return bad;
    },
    /* Where the theme's celestial body lands on screen, and how big it is. */
    body: () => {
      const rep = DS.R3D.backdrop;
      if (!rep || !rep.hero) return null;
      const cam = DS.R3D.camera;
      DS.R3D.scene.updateMatrixWorld(true);
      const h = rep.hero;
      /* The anchor is the LIVE object, not the report. Both agree when the
         horizon group is unturned -- which the audit proves, separately, with
         the report-vs-object check -- but they STOP agreeing the moment the
         renderer turns the group by the camera's yaw, and a screenshot harness
         that crops around a stale projection crops empty sky on every turned
         camera. The report still supplies the description (kind, radius,
         colour, whether the roof trimmed it); the position comes off the mesh.
         A body in a room has an absolute height; one in the sky rides the eye
         line, and the live object knows that too, so there is no branch here. */
      const live = liveWorld();
      const x = live ? live.wp.x : h.worldX;
      const z = live ? live.wp.z : h.z;
      const y = live ? live.wp.y
                     : (h.worldY != null ? h.worldY : cam.position.y + h.elev);
      const a = new V3(x, y, z).project(cam);
      const b = new V3(x, y + h.r, z).project(cam);
      return {
        x: +a.x.toFixed(3), y: +a.y.toFixed(3),
        onScreen: Math.abs(a.x) <= 1 && Math.abs(a.y) <= 1,
        rad: +Math.hypot(b.x - a.x, b.y - a.y).toFixed(4),
        kind: h.kind, elev: h.elev, r: h.r, col: h.col, clamped: !!h.clamped,
        worldX: +h.worldX.toFixed(1), z: h.z, live: !!live
      };
    },
    /* Where the body REALLY is, off the live object, for the check that the
       report and the picture agree. This is the bug that hid the light of every
       roofed theme through a whole round of testing: the report said the body
       was on the floor's mid-line, the body was half a floor to the left of it,
       and every pixel measurement in this tool was therefore taken of empty sky
       and passed. A report is only as good as the object it describes. */
    bodyReal: () => {
      const l = liveWorld();
      if (!l) return null;
      return { x: +l.wp.x.toFixed(2), y: +l.wp.y.toFixed(2), z: +l.wp.z.toFixed(2),
               gx: +l.lp.x.toFixed(2), gy: +l.lp.y.toFixed(2), gz: +l.lp.z.toFixed(2) };
    },
    /* Where the horizon group is standing, against the ground the player is on.

       The horizon is no longer built on one fixed line: the renderer translates
       the whole group every frame so that its ground line lands on the median
       ground row of a window around the player (localHorizonY in the renderer).
       So "shift is zero" is the WRONG invariant to hold -- it was, and it is
       exactly what put a rise above the theme's own roof and a dip under the
       backdrop. The invariant is shift + anchorY == the player's own ground.

       anchorY is the level-wide median the theme was BUILT around (the report
       carries it); local is the same median over the window around the player,
       computed here with the renderer's own arithmetic, so the two can be held
       against each other rather than against a guess. */
    horizon: () => {
      const g = DS.currentGame, p = g && g.player, map = g && g.map;
      const tg = DS.R3D.themeGroup, rep = DS.R3D.backdrop;
      if (!tg || !rep || !p || !map) return null;
      const p2u = rep.wu / (map.w * 16);
      const t0 = Math.round(DS.Ent.centerX(p) / 16);
      const rows = [];
      for (let t = t0 - 16; t <= t0 + 16; t += 2) {
        if (t < 2 || t > map.w - 3) continue;
        const gy = map.groundBelow(t);
        if (gy < map.pixelH) rows.push(gy);
      }
      rows.sort(function (a, b) { return a - b; });
      const local = rows.length ? -rows[rows.length >> 1] * p2u : null;
      const shift = +tg.position.y.toFixed(3);
      const top = +(shift + rep.anchorY).toFixed(3);
      /* frames and vy ride along so the caller can tell a horizon that has come
         to rest from one that has been LEFT behind: if the run ends (or the game
         is paused) the frame loop stops, the last translation freezes, and the
         line then reads as perfectly steady while it is nowhere near the ground
         the player is on. A falling player is the other half of the same trap --
         the line lags a moving target by a fixed distance, which also reads as
         steady. Neither is a placement bug, and neither is measurable as one. */
      return { shift: shift, anchorY: +rep.anchorY.toFixed(3),
               local: local == null ? null : +local.toFixed(3), top: top,
               err: local == null ? null : +(top - local).toFixed(3),
               frames: g.frames, vy: +(p.vy || 0).toFixed(2), onGround: !!p.onGround };
    },
    /* Does every sampled ray land on backdrop geometry? */
    cover: () => {
      DS.R3D.scene.updateMatrixWorld(true);
      const rc = new THREE.Raycaster();
      rc.params.Points.threshold = 0;
      rc.params.Line.threshold = 0;
      const tg = DS.R3D.themeGroup;
      const xs = [-0.9, -0.3, 0.3, 0.9], ys = [0.9, 0.45, 0.0];
      let miss = 0, total = 0, first = null;
      for (let i = 0; i < xs.length; i++) {
        for (let j = 0; j < ys.length; j++) {
          rc.setFromCamera({ x: xs[i], y: ys[j] }, DS.R3D.camera);
          const hits = rc.intersectObject(tg, true);
          total++;
          let solid = false;
          for (let k = 0; k < hits.length; k++) {
            if (hits[k].object.isMesh || hits[k].object.isInstancedMesh) { solid = true; break; }
          }
          if (!solid) { miss++; if (!first) first = [xs[i], ys[j]]; }
        }
      }
      return { miss: miss, total: total, first: first };
    },
    /* What the builder says it made. */
    vals: () => {
      const rep = DS.R3D.backdrop;
      if (!rep) return null;
      const L = rep.layers.slice().sort(function (a, b) { return a.d - b.d; });
      const near = L[0], far = L[L.length - 1];
      return {
        theme: rep.theme, gain: rep.gain, layers: L.length,
        skyLum: lum('#' + ((rep.skyValue != null ? rep.skyValue : 0x101010)
          & 0xffffff).toString(16).padStart(6, '0')),
        instances: L.reduce(function (a, x) { return a + x.n; }, 0),
        hero: rep.hero,
        rungs: L.map(function (x) {
          return { d: x.d, kind: x.kind, n: x.n, lum: lum(x.col), tex: x.tex,
                   texRep: x.texRep, k: x.k, mean: x.mean, solo: !!x.solo, glow: !!x.glow };
        }),
        nearLum: lum(near.col), farLum: lum(far.col),
        solo: L.filter(function (x) { return x.solo; }).length,
        texed: L.filter(function (x) { return !!x.tex; }).length
      };
    },
    /* What the backdrop costs: seconds per frame with it and without it. */
    perf: () => new Promise(function (resolve) {
      const tg = DS.R3D.themeGroup;
      const spin = (ms) => new Promise(function (r) {
        const t0 = performance.now();
        let n = 0;
        const step = () => {
          n++;
          if (performance.now() - t0 < ms) requestAnimationFrame(step);
          else r(+(n / ((performance.now() - t0) / 1000)).toFixed(1));
        };
        requestAnimationFrame(step);
      });
      spin(700).then(function (on) {
        tg.visible = false;
        spin(700).then(function (off) {
          tg.visible = true;
          resolve({ on: on, off: off, ratio: +(off ? on / off : 1).toFixed(3) });
        });
      });
    })
  };
  /* --- one frame of the game's OWN framebuffer, on demand -------------------
     The CDP screenshot and the framebuffer are not quite the same image: the
     capture re-composites what the compositor had, the framebuffer is what the
     renderer drew. When a pixel check fails, arm() + map() are what tell "the
     body is dark" apart from "the body is not where the projection said": they
     draw the frame the renderer actually produced, with the body's projected
     cell marked, instead of a number that argues with itself. */
  (function hookRender() {
    if (window.__bqaHooked || !DS.R3D || !DS.R3D.render) return;
    window.__bqaHooked = true;
    const orig = DS.R3D.render;
    DS.R3D.render = function (g) {
      const out = orig(g);
      if (!window.__bqaArm) return out;
      window.__bqaArm = false;
      try {
        const r = DS.R3D.gl, gl = r.getContext();
        const v = DS.UI3.view, dpr = window.devicePixelRatio || 1;
        const W = Math.round(v.w * dpr), H = Math.round(v.h * dpr);
        const X = Math.round(v.x * dpr);
        const Y = Math.round((window.innerHeight - v.y - v.h) * dpr);
        const buf = new Uint8Array(W * H * 4);
        gl.readPixels(X, Y, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        window.__bqaBuf = { buf: buf, w: W, h: H };
      } catch (e) { window.__bqaBuf = null; window.__bqaErr = String(e); }
      return out;
    };
  })();

  window.__BQA.arm = () => { window.__bqaArm = true; return true; };

  /* cols x rows of ASCII over the play frame, or over a REGION of it when a
     centre and a half-size are given -- which is what turns "the disc's centre
     is dark" into "here is the shape that is there instead". cx/cy are in
     play-rect pixels, top-down. */
  window.__BQA.map = (cols, rows, cx, cy, hw, hh) => {
    const s = window.__bqaBuf;
    if (!s) return { text: 'no frame (' + (window.__bqaErr || 'nothing armed') + ')', body: null };
    const rx0 = cx == null ? 0 : Math.max(0, Math.round(cx - hw));
    const rx1 = cx == null ? s.w : Math.min(s.w, Math.round(cx + hw));
    const ry0 = cy == null ? 0 : Math.max(0, Math.round(cy - hh));
    const ry1 = cy == null ? s.h : Math.min(s.h, Math.round(cy + hh));
    const rw = Math.max(1, rx1 - rx0), rh = Math.max(1, ry1 - ry0);
    const b = window.__BQA.body();
    let bodyCol = null, bodyRow = null;
    if (b && Math.abs(b.x) <= 1 && Math.abs(b.y) <= 1) {
      const bx = (b.x * 0.5 + 0.5) * s.w, by = (1 - (b.y * 0.5 + 0.5)) * s.h;
      bodyCol = Math.max(0, Math.min(cols - 1, Math.floor((bx - rx0) / rw * cols)));
      bodyRow = Math.max(0, Math.min(rows - 1, Math.floor((by - ry0) / rh * rows)));
      if (bx < rx0 || bx > rx1 || by < ry0 || by > ry1) { bodyCol = null; bodyRow = null; }
    }
    const lines = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const x0 = rx0 + Math.floor(c * rw / cols), x1 = rx0 + Math.floor((c + 1) * rw / cols);
        const y1 = ry0 + Math.floor((r + 1) * rh / rows), y0 = ry0 + Math.floor(r * rh / rows);
        let best = 0;
        for (let y = y0; y < y1 && y < s.h; y++) {
          const base = (s.h - 1 - y) * s.w;
          for (let x = x0; x < x1 && x < s.w; x++) {
            const i = (base + x) * 4;
            const l = s.buf[i] * 0.299 + s.buf[i + 1] * 0.587 + s.buf[i + 2] * 0.114;
            if (l > best) best = l;
          }
        }
        /* The glyph is the LUMINANCE, always -- the marker is a caret line the
           caller prints under the map. An earlier version replaced the body's
           cell with an 'O' and its neighbours with 'o', which hid exactly the
           reading the map was drawn to show. */
        line += best > 200 ? '#' : best > 140 ? '*' : best > 90 ? '+'
              : best > 55 ? ':' : best > 30 ? '.' : best > 14 ? ',' : ' ';
      }
      lines.push(line);
    }
    /* A newline built from its code, not from an escape: this source is a
       template literal, and \n inside one is an escape for THIS file rather
       than for the page, so the map came out as forty-six broken lines. */
    const NL = String.fromCharCode(10);
    return { text: lines.join(NL), body: bodyCol == null ? null : [bodyCol, bodyRow],
             size: s.w + 'x' + s.h,
             region: cx == null ? 'the frame' : 'x ' + rx0 + '-' + rx1 + ', y ' + ry0 + '-' + ry1,
             cell: cx == null ? null : +(rw / cols).toFixed(1) };
  };

  /* The frame in numbers, off the same armed framebuffer the map is drawn from:
     the mean the eye would see, how much of it is black, and the brightest pixel
     inside the body's own disc -- with the disc's radial half as "its centre",
     so "the glow is there but it is the halo" and "the glow is not there" are
     different readings. The pixel checks in audit-backdrop.js come from a
     screenshot; when one of them fails, this is the framebuffer's answer to the
     same question, and the two disagreeing IS the finding. */
  window.__BQA.scan = () => {
    const s = window.__bqaBuf;
    if (!s) return null;
    const b = window.__BQA.body();
    let mean = 0, n = 0, dark = 0;
    for (let i = 0; i < s.buf.length; i += 4) {
      const l = s.buf[i] * 0.299 + s.buf[i + 1] * 0.587 + s.buf[i + 2] * 0.114;
      mean += l; n++;
      if (l < 16) dark++;
    }
    let body = 0, centre = 0;
    if (b && Math.abs(b.x) <= 1.4 && Math.abs(b.y) <= 1.4) {
      const cx = (b.x * 0.5 + 0.5) * s.w;
      const cy = (1 - (b.y * 0.5 + 0.5)) * s.h;
      const rad = Math.max(4, b.rad * 0.5 * s.h);
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          const dx = x - cx, dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > rad * rad) continue;
          const i = ((s.h - 1 - y) * s.w + x) * 4;
          const l = s.buf[i] * 0.299 + s.buf[i + 1] * 0.587 + s.buf[i + 2] * 0.114;
          if (l > body) body = l;
          if (d2 <= rad * rad * 0.25 && l > centre) centre = l;
        }
      }
    }
    return { mean: Math.round(mean / n), dark: +(100 * dark / n).toFixed(1),
             body: Math.round(body), bodyCentre: Math.round(centre), rad: b ? b.rad : null,
             ndc: b ? [+b.x.toFixed(3), +b.y.toFixed(3)] : null,
             box: b ? [Math.round((b.x * 0.5 + 0.5) * s.w),
                       Math.round((1 - (b.y * 0.5 + 0.5)) * s.h),
                       Math.round(Math.max(4, b.rad * 0.5 * s.h))] : null,
             size: s.w + 'x' + s.h };
  };
  return Object.keys(window.__BQA).length;
})()`;

module.exports = { PRELUDE: PRELUDE };
