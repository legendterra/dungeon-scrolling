#!/usr/bin/env node
/* The backdrop as a world-space diorama, checked against the geometry -- not
 * against a picture, and not against a walk that may or may not survive.
 *
 *   node tools/qa/audit-world.js [base-url] [--depths 1-30 | 2,7,22] [--grid 13x7]
 *
 * The run is paused and the camera PARKED at the nine extremes of what it can
 * ever see on each floor (the same nine shoot-maps.js photographs), so the same
 * questions are asked at the top and the bottom of a climb as at spawn:
 *
 *   FRAME     the JS world frame (src/core/worldframe.js) agrees with the real
 *             camera: the eye and the frame's corner rays, at every parked
 *             position, lie inside what worldframe said they could.
 *   COVERAGE  a grid of rays through the frame from every parked position must
 *             hit a solid backdrop mesh (sky, ground, foundation, roof): no
 *             hole, at the top of the climb or at the bottom.
 *   FRONT     no backdrop mesh, instance or point stands in front of the
 *             backdrop's FRONT_Z, so nothing can cross the play plane and show
 *             up as a slab over the hero.
 *   ANCHORS   a layer that declares itself anchored to the roof has every root
 *             INSIDE the roof (no floating teeth); a ground layer stands on
 *             the ground; the roof clears the highest the eye ever gets.
 *   STILL     every part of the backdrop that does not ride the camera has the
 *             identical world transform at all nine positions: nothing locks,
 *             drifts or is lowered to meet the hero.
 *   COST      build time and draw calls, inside their budgets.
 *
 * Exits non-zero on any failure or console error.
 */

'use strict';

const { boot } = require('./lib/map-page');

const BASE = process.argv.slice(2).find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/';

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i < 0 || !process.argv[i + 1] ? dflt : process.argv[i + 1];
}

function depthList(spec) {
  if (spec === 'all') spec = '1-30';
  const out = [];
  spec.split(',').forEach((part) => {
    const m = /^(\d+)-(\d+)$/.exec(part.trim());
    if (m) for (let d = +m[1]; d <= +m[2]; d++) out.push(d);
    else if (part.trim()) out.push(+part.trim());
  });
  return out.filter(Number.isFinite);
}

const DEPTHS = depthList(arg('--depths', 'all'));
const [GX, GY] = arg('--grid', '13x7').split('x').map(Number);
const BUILD_MS_MAX = +arg('--build-ms', '250');
const PARKS = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];

/* --- the in-page half ----------------------------------------------------- */
const AUDIT = `(() => {
  const A = window.__audit = {};
  const V = THREE.Vector3;
  const tg = () => DS.R3D.themeGroup;
  const rep = () => DS.R3D.backdrop;

  A.report = () => { const r = rep(); return {
    theme: r.theme, variant: r.variant, roofRel: r.roofRel, skyDrop: r.skyDrop, draws: r.draws,
    budget: r.budget, buildMs: r.buildMs, frame: r.frame, frontZ: r.frontZ, anchorY: r.anchorY,
    range: r.range, eye: r.eye, layers: r.layers.length }; };

  /* Where the real camera is, and where its four corner rays land on the plane
     z = -D (the frame the audit compares with worldframe's arithmetic). */
  A.camera = (Ds) => {
    const cam = DS.R3D.camera; cam.updateMatrixWorld();
    const out = { eye: cam.position.toArray(), planes: {} };
    for (const D of Ds) {
      const pts = [];
      for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const near = new V(nx, ny, -1).unproject(cam), far = new V(nx, ny, 1).unproject(cam);
        const dir = far.sub(near);
        const t = (-D - near.z) / dir.z;
        pts.push([near.x + dir.x * t, near.y + dir.y * t]);
      }
      out.planes[D] = pts;
    }
    return out;
  };

  /* Non-instanced meshes only: the sky, the ground slabs, the foundation, the
     roof. Every frame ray has to land on one of them. */
  A.cover = (nx, ny) => {
    const cam = DS.R3D.camera, rc = new THREE.Raycaster();
    const solids = [];
    tg().traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible) solids.push(o); });
    let miss = 0, first = null;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      rc.setFromCamera({ x: -1 + 2 * (i + 0.5) / nx, y: -1 + 2 * (j + 0.5) / ny }, cam);
      if (!rc.intersectObjects(solids, false).length) { miss++; if (!first) first = [i, j]; }
    }
    return { miss: miss, total: nx * ny, first: first, solids: solids.length };
  };

  /* Every world-space corner of every instance / mesh / point under a node. */
  const corners = (bb) => { const c = []; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y])
    for (const z of [bb.min.z, bb.max.z]) c.push([x, y, z]); return c; };
  const eachPoint = (root, fn) => {
    root.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), v = new V();
    root.traverse((o) => {
      if (!o.visible) return;
      if (o.isInstancedMesh) {
        o.geometry.computeBoundingBox();
        const cs = corners(o.geometry.boundingBox);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
          for (const c of cs) { v.set(c[0], c[1], c[2]).applyMatrix4(m); fn(v, o, i); }
        }
      } else if (o.isMesh) {
        o.geometry.computeBoundingBox();
        for (const c of corners(o.geometry.boundingBox)) { v.set(c[0], c[1], c[2]).applyMatrix4(o.matrixWorld); fn(v, o, -1); }
      } else if (o.isPoints) {
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld); fn(v, o, i); }
      }
    });
  };

  A.front = () => {
    let maxZ = -Infinity, who = null;
    eachPoint(tg(), (v, o) => { if (v.z > maxZ) { maxZ = v.z; who = o.geometry ? o.geometry.type + (o.isInstancedMesh ? '[' + o.count + ']' : '') : o.type; } });
    return { maxZ: +maxZ.toFixed(3), who: who };
  };

  /* Layers that declared an anchor: measure the geometry against it. Per
     instance, the highest point (a tooth's root) and the lowest (a rock's foot). */
  A.anchors = () => {
    const out = [];
    tg().traverse((o) => {
      if (!o.userData || !o.userData.anchor || !o.visible) return;
      let lo = Infinity, hi = -Infinity, minTop = Infinity, n = 0;
      // per-instance tops: track max y of each instance, then take the smallest
      const perTop = new Map();
      eachPoint(o, (v, mesh, i) => {
        if (v.y < lo) lo = v.y;
        if (v.y > hi) hi = v.y;
        const key = mesh.id + ':' + i;
        if (!perTop.has(key) || perTop.get(key) < v.y) perTop.set(key, v.y);
      });
      perTop.forEach((y) => { n++; if (y < minTop) minTop = y; });
      out.push({ anchor: o.userData.anchor, kind: o.userData.kind || (o.geometry && o.geometry.type) || o.type,
                 lo: +lo.toFixed(3), hi: +hi.toFixed(3), minTop: +minTop.toFixed(3), n: n });
    });
    return out;
  };

  /* A number that changes if any non-following node's world matrix does. */
  A.signature = () => {
    const root = tg(); root.updateMatrixWorld(true);
    let sum = 0, n = 0;
    const walk = (o) => {
      if (o.userData && o.userData.follows) return;
      for (let i = 0; i < 16; i++) sum += o.matrixWorld.elements[i] * (1 + (n % 7) * 0.013);
      n++;
      for (const c of o.children) walk(c);
    };
    walk(root);
    return { sum: +sum.toFixed(6), n: n, y: root.position.y, rotY: +root.rotation.y.toFixed(6) };
  };
  return true;
})()`;

let failures = 0, checks = 0;
function check(label, ok, detail) {
  checks++;
  if (!ok) failures++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
}

function inside(pt, r, eps) {
  return pt[0] >= r.x0 - eps && pt[0] <= r.x1 + eps && pt[1] >= r.y0 - eps && pt[1] <= r.y1 + eps;
}

async function main() {
  const { session, close } = await boot(BASE, {});
  try {
    await session.eval(AUDIT);
    const WF_PLANES = [4.5, 12, 30, 68, 180];
    for (const d of DEPTHS) {
      const lv = await session.eval(`__maps.go(${d})`);
      await session.eval('__maps.step(20)');
      const rep = await session.eval('__audit.report()');
      console.log(`\ndepth ${d}  ${lv.theme}/${rep.variant}  ${lv.kind}  ${lv.tiles.join('x')}`);

      const sigs = [], misses = [], eyeYs = [], planeBad = [];
      let firstGap = null;
      for (const [fx, fy] of PARKS) {
        await session.eval(`__maps.park(${fx}, ${fy})`);
        await session.eval('__maps.draw(2)');
        const cam = await session.eval(`__audit.camera(${JSON.stringify(WF_PLANES)})`);
        eyeYs.push(cam.eye[1]);
        for (const D of WF_PLANES) {
          const cov = await session.eval(
            `DS.WorldFrame.coverageAt(${D}, DS.R3D.worldFrame.range, DS.R3D.worldFrame.rig)`);
          cam.planes[D].forEach((pt) => { if (!inside(pt, cov, 0.05)) planeBad.push(`D${D}@${fx},${fy}`); });
        }
        const c = await session.eval(`__audit.cover(${GX}, ${GY})`);
        misses.push(c.miss);
        if (c.first && !firstGap) firstGap = `park ${fx},${fy} ray ${c.first.join(',')}`;
        sigs.push(await session.eval('__audit.signature()'));
      }

      const eye = rep.eye;
      check('the world frame agrees with the real camera (corner rays inside coverage)',
            planeBad.length === 0, planeBad.length ? planeBad.slice(0, 4).join(' ') : `${WF_PLANES.length} planes x 9 positions`);
      if (eye) {
        const lo = Math.min.apply(null, eyeYs), hi = Math.max.apply(null, eyeYs);
        check('the real eye stays inside the frame\'s eye range',
              lo >= eye.y0 - 0.5 && hi <= eye.y1 + 0.5,
              `real ${lo.toFixed(1)}..${hi.toFixed(1)} vs frame ${eye.y0.toFixed(1)}..${eye.y1.toFixed(1)}`);
      }
      const totalMiss = misses.reduce((a, b) => a + b, 0);
      check('no hole in the backdrop from any parked camera', totalMiss === 0,
            `${totalMiss}/${GX * GY * PARKS.length} rays missed` + (firstGap ? ', first at ' + firstGap : ''));

      const front = await session.eval('__audit.front()');
      check('nothing in front of the play plane', front.maxZ <= rep.frontZ + 0.001,
            `nearest backdrop point z ${front.maxZ} (${front.who}), limit ${rep.frontZ}`);

      const s0 = sigs[0];
      const still = sigs.every((s) => s.sum === s0.sum && s.n === s0.n && s.y === 0 && s.rotY === s0.rotY);
      check('the backdrop stands still while the camera crosses the floor', still,
            still ? `${s0.n} nodes, themeGroup y ${s0.y}` : sigs.map((s) => s.sum).join(' / '));

      const anchors = await session.eval('__audit.anchors()');
      const roofY = rep.anchorY + rep.roofRel;
      const roofs = anchors.filter((a) => a.anchor === 'roof');
      const floating = roofs.filter((a) => a.minTop < roofY - 0.06);
      // A layer that HANGS from the roof (chandeliers, cage beams) only has to touch it.
      const hung = anchors.filter((a) => a.anchor === 'roofhang');
      const loose = hung.filter((a) => a.hi < roofY - 0.06 || a.hi > roofY + 0.9);
      check('every roof-hung layer reaches the roof', loose.length === 0,
            hung.length ? `${hung.length} layers` + (loose.length ? ', loose: ' + loose.map((a) => `${a.kind} top ${a.hi}`).join('; ') : '') : 'none');
      check('every hanging thing is rooted in the roof', floating.length === 0,
            roofs.length ? `${roofs.length} layers, roof underside ${roofY.toFixed(2)}` +
              (floating.length ? ', floating: ' + floating.map((a) => `${a.kind} root ${a.minTop}`).join('; ') : '')
              : 'open sky: none to check');
      const grounds = anchors.filter((a) => a.anchor === 'ground');
      const hovering = grounds.filter((a) => a.lo > rep.anchorY + 0.9);
      check('every ground band stands on the ground', hovering.length === 0,
            `${grounds.length} bands` + (hovering.length ? ', hovering: ' + hovering.map((a) => `${a.kind} foot ${a.lo}`).join('; ') : ''));
      if (rep.roofRel > 0 && eye) {
        check('the roof clears the highest the eye reaches', roofY >= eye.y1 + 2.9,
              `roof ${roofY.toFixed(2)} vs eye top ${eye.y1.toFixed(2)}`);
      }

      check('the build is cheap', rep.buildMs <= BUILD_MS_MAX, `${rep.buildMs} ms (limit ${BUILD_MS_MAX})`);
      check('the horizon draws inside its budget', rep.draws <= rep.budget, `${rep.draws} draw calls (budget ${rep.budget})`);
    }
    const errors = await session.eval('window.__gfxErrors || []');
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await close();
  }
  console.log('\n' + (failures === 0
    ? `PASS: ${checks} checks over ${DEPTHS.length} floors`
    : `FAIL: ${failures} of ${checks} checks failed`));
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error('audit-world: ' + e.message); process.exit(2); });
