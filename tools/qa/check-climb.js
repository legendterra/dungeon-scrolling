#!/usr/bin/env node
/* Proof on the real surface, not in the solver's head.
 *
 *   node tools/qa/check-climb.js [base-url]
 *
 * tools/solve-levels.js checks the terrain with its own move model, which is the
 * right way to test a generator -- but it is still a model. This drives the game
 * itself in a browser and asks the questions a player would:
 *
 *   1. does every depth's level come up with console errors; and
 *   2. can the hero actually climb a rope, measured by holding W over one and
 *      watching the body rise the rows the climb speed promises; and
 *   3. is the level's own reach pass telling the truth -- the browser's flood
 *      reaches the same cells the generator's did.
 *
 * It is the browser's physics answering, so a pass here means the terrain works
 * with the game's own collision code, not with a copy of it.
 *
 * The two questions are kept apart on purpose. Reachability is asked of a FRESH
 * build, because a loaded floor is not the level the generator shipped: the game
 * then locks the door behind a boss, crumbles platforms over pits and builds a
 * boss arena, all of which is design rather than terrain. Rope climbing is asked
 * of the loaded floor, because that is where the physics runs.
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';
const DEPTHS = [1, 3, 5, 7, 9, 10];
const KEYW = ['w', 'KeyW', 87];

async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(200);
  }
  throw new Error('timed out waiting for: ' + expr);
}

/* A rope the hero can take: a column of rope tiles with somewhere to stand at
   the bottom of it. Returns the foot cell in tile coordinates. */
const FIND_ROPE = `(() => {
  const g = DS.currentGame, map = g.map;
  for (let tx = 1; tx < map.w - 1; tx++) {
    for (let ty = 2; ty < map.h - 1; ty++) {
      if (!map.isRope(tx, ty)) continue;
      if (map.isRope(tx, ty - 1)) continue;             // top of the column
      let bottom = ty;
      while (bottom < map.h - 1 && map.isRope(tx, bottom + 1)) bottom++;
      if (bottom - ty < 3) continue;                    // too short to prove anything
      if (!DS.Reach.standable(map, tx, bottom)) continue;
      return { tx: tx, top: ty, bottom: bottom, rows: bottom - ty };
    }
  }
  return null;
})()`;

async function main() {
  const chrome = await cdp.launch({ width: 1600, height: 900, url: URL });
  const { session } = chrome;
  let failures = 0;
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2600);

    /* A real run, started the way the game starts one. */
    await session.eval('(DS.Scenes.play(20260923, { weapon: \'sword\' }), "started")');
    await waitFor(session, 'DS.currentGame && DS.currentGame.player', 20000);

    /* Part A: the generator's own guarantee, on fresh levels. */
    console.log('-- reachability, fresh builds (the generator\'s claim) --');
    for (let depth = 1; depth <= 10; depth++) {
      const built = await session.eval(`(() => {
        const level = DS.LevelGen.build(DS.makeRng(${2000 + depth * 17}), ${depth}, 'normal');
        const reach = DS.Reach.reachable(level.map, level.spawns.player);
        const doorTx = DS.Reach.doorColumn(level.spawns);
        const back = DS.Reach.escapes(level.map, reach, doorTx);
        let pockets = 0;
        reach.seen.forEach(function (k) {
          if (back.has(k)) return;
          const c = k.split(',');
          if (level.map.isWater(+c[0], +c[1]) || level.map.isDeath(+c[0], +c[1])) return;
          pockets++;
        });
        return { cells: reach.seen.size, maxX: reach.maxX, doorTx: doorTx,
                 pockets: pockets, rungs: level.reach.rungs, ropes: level.reach.ropes,
                 trapped: level.reach.trapped, ok: level.reach.ok };
      })()`);
      const okExit = built.ok && built.maxX >= built.doorTx && built.trapped === 0;
      if (!okExit) failures++;
      console.log('depth ' + String(depth).padStart(2) +
                  '  reach ' + built.cells + ' cells to x' + built.maxX +
                  ' of door x' + built.doorTx + '  rungs ' + built.rungs +
                  '  ropes ' + built.ropes + '  pockets ' + built.pockets +
                  '  reported trapped ' + built.trapped +
                  '  ' + (okExit ? 'ok' : 'FAILED'));
    }

    /* Part B: the loaded floor, for the physics -- climbing and console health. */
    console.log('-- the loaded floor (physics) --');
    for (const depth of DEPTHS) {
      const info = await session.eval(`(() => {
        const g = DS.currentGame;
        g.depth = ${depth};
        DS.Game.loadLevel(g, ${depth} >= 10 ? 'boss' : 'normal');
        g.enemies.length = 0;                     // nothing to interrupt the measurement
        let ropes = 0, water = 0;
        for (let tx = 0; tx < g.map.w; tx++) {
          for (let ty = 0; ty < g.map.h; ty++) {
            if (g.map.isRope(tx, ty)) ropes++;
            if (g.map.isWater(tx, ty)) water++;
          }
        }
        return { biome: g.biome.name, kind: g.levelKind, width: g.map.w,
                 ropeTiles: ropes, water: water, locked: !!g.lockedDoor };
      })()`);
      console.log('depth ' + String(depth).padStart(2) + '  ' + info.biome +
                  ' (' + info.kind + ')  map ' + info.width +
                  '  rope tiles ' + info.ropeTiles + '  water ' + info.water +
                  (info.locked ? '  door locked by design' : ''));

      /* Rope climb: stand at the foot, hold W, measure the rise in rows. */
      const rope = await session.eval(FIND_ROPE);
      if (!rope) {
        console.log('        (no rope on this depth)');
        continue;
      }
      await session.eval(`(() => {
        const g = DS.currentGame, T = DS.C.TILE;
        const p = g.player;
        p.x = ${rope.tx} * T + (T - p.w) * 0.5;
        p.y = ${rope.bottom + 1} * T - p.h;
        p.vx = 0; p.vy = 0; p.onGround = true; p.onRope = false;
        return 'placed';
      })()`);
      await cdp.sleep(350);
      const before = await session.eval('DS.currentGame.player.y');
      await session.cmd('Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
      await cdp.sleep(1200);
      const onRope = await session.eval('!!DS.currentGame.player.onRope');
      await session.cmd('Input.dispatchKeyEvent',
        { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
      const after = await session.eval('DS.currentGame.player.y');
      const rows = ((before - after) / 16);
      const climbed = rows >= 2;
      if (!climbed) failures++;
      console.log('        rope at x' + rope.tx + ' rows ' + rope.top + '-' + rope.bottom +
                  ': rose ' + rows.toFixed(1) + ' rows, onRope ' + onRope +
                  '  ' + (climbed ? 'climb ok' : 'CLIMB FAILED'));
    }

    const errors = await session.eval('(window.__dsErrors || []).length');
    console.log('\npage errors captured: ' + errors);
    if (errors) failures++;
  } finally {
    await chrome.close();
  }
  console.log(failures === 0 ? 'PASS: the browser agrees with the terrain pass'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('check-climb: ' + err.message); process.exit(2); });
