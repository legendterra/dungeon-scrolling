#!/usr/bin/env node
/* Phase 8 in pictures and numbers: the body-weight layer (DS.Anim) in the real
 * renderer. The loop is paused and driven frame by frame, like shoot-phase6.
 *
 *   node tools/qa/shoot-phase8.js [base-url] [--out DIR] [--quality low]
 *
 *   a) jump: take-off crouch, stretch, apex tuck, landing squash (root scale
 *      probed every frame; PNGs across the jump);
 *   b) hit: the hero flinches when his hp drops;
 *   c) kill: an enemy shatters into chunks when it dies (chunk count probed).
 *
 * Exits non-zero on a console error or if the squash/stretch never happens.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));
const value = (a, f) => { const i = a.indexOf(f); return i < 0 ? null : a[i + 1]; };

const HOOK = `(() => { window.__errs = [];
  const oe = console.error.bind(console);
  console.error = function () { window.__errs.push(Array.prototype.join.call(arguments, ' ').slice(0, 300)); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => window.__errs.push(e.message + ' @' + e.lineno)); })();`;

const DRIVER = `(() => {
  const P = window.__p8 = {};
  P.g = () => DS.currentGame;
  P.calm = () => { const g = P.g(), p = g.player; p.dead = false; p.hp = Math.max(p.hp || 0, p.maxHp || 50);
    g.deathTimer = 0; g.enemies.length = 0; if (g.projectiles) g.projectiles.length = 0; };
  P.frame = (n, calm) => { const g = P.g();
    for (let i = 0; i < n; i++) { if (calm !== false) P.calm(); DS.Input.poll(); if (DS.Ptr) DS.Ptr.beginFrame();
      DS.Game.update(g); DS.Input.endFrame(); DS.Game.draw(g); }
    DS.R.present(performance.now() / 1000); };
  P.key = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'Space', key: ' ' }));
  P.scale = () => { const s = DS.R3D.heroRoot().scale; return { x: +Math.abs(s.x).toFixed(3), y: +s.y.toFixed(3) }; };
  P.hideHud = () => { DS.UI3.render = function () {}; const h = document.getElementById('ui-root'); if (h) h.style.visibility = 'hidden'; };
  DS.__paused = true; return true; })()`;

async function shoot(session, file, clip) {
  await cdp.sleep(100);
  const res = await session.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true,
    clip: Object.assign({ scale: 1 }, clip) }, 60000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8133/';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/phase8');
  const quality = value(args, '--quality') || 'low';
  let failed = false;
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable'); await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2600);
    await session.eval(`localStorage.setItem('ds_name', 'P8');`);
    for (let i = 0; i < 150; i++) { if (await session.eval('!!(window.DS && DS.UI3 && DS.UI3.ready)')) break; await cdp.sleep(200); }
    await session.eval('DS.Scenes.play(4242, {})');
    for (let i = 0; i < 150; i++) { if (await session.eval('!!(DS.currentGame && DS.currentGame.player)')) break; await cdp.sleep(200); }
    await cdp.sleep(800);
    await session.eval(`DS.PostFX && DS.PostFX.setQuality('${quality}', { lock: true, quiet: true })`);
    await session.eval(`(() => { const g = DS.currentGame; g.depth = 1; DS.Game.loadLevel(g, DS.Game.kindForDepth(1)); })()`);
    await session.eval(DRIVER);
    await session.eval('__p8.hideHud()');
    const view = await session.eval('(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, width: v.w, height: v.h }; })()');
    const report = { jump: [], hit: null, kill: null };

    // a) jump
    await session.eval('__p8.frame(150)');
    await session.eval('__p8.key("keydown")');
    for (let f = 0; f < 60; f++) {
      if (f === 24) await session.eval('__p8.key("keyup")');
      await session.eval('__p8.frame(1)');
      const s = await session.eval('__p8.scale()');
      const on = await session.eval('DS.currentGame.player.onGround');
      report.jump.push({ f, sy: s.y, sxz: s.x, ground: on });
      if ([1, 4, 12, 26, 38, 42, 46].includes(f)) await shoot(session, path.join(out, `jump-f${String(f).padStart(2, '0')}.png`), view);
    }
    const sys = report.jump.map((r) => r.sy);
    const minSy = Math.min.apply(null, sys), maxSy = Math.max.apply(null, sys);
    console.log(`jump: sy min ${minSy} max ${maxSy}`);
    if (minSy > 0.95 || maxSy < 1.02) failed = true;

    // b) hit flinch: drop hp, step one frame, capture the recoil
    await session.eval('__p8.frame(30)');
    await session.eval('(() => { const p = DS.currentGame.player; p.hp = p.hp - 5; })()');
    await session.eval('__p8.frame(1, false)');
    await shoot(session, path.join(out, 'hit-f1.png'), view);
    await session.eval('__p8.frame(3, false)');
    await shoot(session, path.join(out, 'hit-f4.png'), view);

    // c) kill: an enemy beside the hero dies; the FX rock pool must fill
    report.kill = await session.eval(`(() => {
      const g = DS.currentGame, p = g.player;
      const e = DS.Enemies.create(g, p.x + 40, p.y - 6, 'zombie', false);
      DS.Game.draw(g);
      const before = DS.FX3D.rock.count;
      e.dead = true; DS.Game.draw(g);
      return { before: before, after: DS.FX3D.rock.count };
    })()`);
    console.log('kill chunks:', JSON.stringify(report.kill));
    if (report.kill.after <= report.kill.before) failed = true;
    await session.eval('DS.Game.draw(DS.currentGame)');
    await shoot(session, path.join(out, 'kill.png'), view);
    console.log('errors:', JSON.stringify(await session.eval('window.__errs')));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'phase8-report.json'), JSON.stringify(report, null, 2));
    if ((await session.eval('window.__errs.length')) > 0) failed = true;
  } finally { await close(); }
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { process.stderr.write('shoot-phase8: ' + e.message + '\n'); process.exit(2); });
