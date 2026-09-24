#!/usr/bin/env node
/* Nothing hangs from nothing.
 *
 *   node tools/qa/check-hangs.js [base-url]
 *
 * Ropes and ladders are the two things in the dungeon that are supposed to
 * hang, and both were reported as floating: a rope's strand started at the
 * boundary of its topmost rope tile, which on a wooden platform is 1.02 units
 * below the plank's underside, and a climb built from platform slabs had no
 * ladder at all -- just planks in the air.
 *
 * Every hanging prop now carries three claims on its own group:
 *
 *   userData.hangTop      where the top of the rigging is, in world units
 *   userData.hangOn       'above' | 'side' | 'below' -- where it is tied to
 *   userData.anchorTile   [tx, ty] of the solid tile the piton bites into
 *
 * This walks those claims and checks each one against something the renderer
 * does not control: the geometry's own bounding box, and the tile GRID. A prop
 * that hangs from nothing is reported with its depth and tile.
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';
const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/* The mountain floors are where the rope shafts live (systems/mountain.js). */
const KINDS = { 7: 'mountain' };

let failures = 0;

function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

const REPORT = `(() => {
  const g = DS.currentGame, map = g.map;
  const out = { props: 0, ropes: 0, ladders: 0, none: [], mismatch: [],
                notSolid: [], anchors: { above: 0, side: 0, below: 0 } };
  const box = new THREE.Box3();
  DS.R3D.scene.traverse(function (o) {
    const ud = o.userData;
    if (!ud || ud.hangOn === undefined) return;
    out.props++;
    if (o.userData.hangTop === undefined) return;
    if (ud.hangKind === 'ladder') out.ladders++; else out.ropes++;

    if (ud.hangOn === 'none' || !ud.anchorTile) {
      out.none.push({ x: +o.position.x.toFixed(2), top: +ud.hangTop.toFixed(2) });
      return;
    }
    out.anchors[ud.hangOn] = (out.anchors[ud.hangOn] || 0) + 1;

    /* 1. the geometry reaches the height it claims */
    box.setFromObject(o);
    if (Math.abs(box.max.y - ud.hangTop) > 0.05) {
      out.mismatch.push({ claim: +ud.hangTop.toFixed(3), geom: +box.max.y.toFixed(3) });
    }

    /* 2. the tile the piton bites into is solid in the grid */
    const tx = ud.anchorTile[0], ty = ud.anchorTile[1];
    if (!(map.isSolid(tx, ty) || map.isPlatform(tx, ty))) {
      out.notSolid.push({ tx: tx, ty: ty, kind: map.get(tx, ty) });
    }
  });
  return out;
})()`;

async function main() {
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: URL });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2800);
    await session.eval(`localStorage.setItem('ds_name', 'HANGQA');`);
    await session.eval('DS.Scenes.play(null, { weapon: "sword" })');
    for (let i = 0; i < 100; i++) {
      if (await session.eval('!!(DS.currentGame && DS.currentGame.p)')) break;
      await cdp.sleep(200);
    }

    let total = 0;
    for (const d of DEPTHS) {
      const kind = KINDS[d] || 'normal';
      await session.eval(`(() => { const g = DS.currentGame; g.depth = ${d};
        DS.Game.loadLevel(g, '${kind}'); return true; })()`);
      await cdp.sleep(1200);
      const r = await session.eval(REPORT);
      total += r.props;
      const label = 'depth ' + d + ' (' + kind + ')';
      check(label + ': every rope and ladder is tied to something',
            r.none.length === 0,
            r.ropes + ' ropes, ' + r.ladders + ' ladders, anchors ' +
            JSON.stringify(r.anchors) +
            (r.none.length ? ', DENIED ' + JSON.stringify(r.none[0]) : ''));
      check(label + ': the rigging reaches the height it claims',
            r.mismatch.length === 0, r.mismatch.length ? JSON.stringify(r.mismatch[0]) : '');
      check(label + ': the piton is in solid grid',
            r.notSolid.length === 0, r.notSolid.length ? JSON.stringify(r.notSolid[0]) : '');
    }
    check('the game actually has rope and ladder to check', total > 0,
          total + ' hanging props across 10 depths');
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0 ? 'PASS: every rope and ladder is anchored to solid geometry'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('check-hangs: ' + err.message); process.exit(2); });
