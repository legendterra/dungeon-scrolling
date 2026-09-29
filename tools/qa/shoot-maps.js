#!/usr/bin/env node
/* One contact sheet per depth: the camera parked at the nine extremes of what
 * it can ever see on that floor -- bottom / middle / top of its range times
 * left / middle / right -- so a backdrop that only holds together when the
 * hero stands at spawn shows up here.
 *
 *   node tools/qa/shoot-maps.js [base-url] [--out DIR] [--tag before]
 *                               [--depths 1,2,3 | all] [--quality high]
 *                               [--frames 30] [--size 1280x720]
 *
 * The live loop is PAUSED and the sim is stepped by hand (the shoot-phase6
 * pattern, so a machine that renders one frame a second still gets exact
 * frames). The camera is placed directly: DS.R.setCam to a sentinel far past
 * the edge, then DS.R.clampCam, which lands it on the true extreme of that
 * floor's camera range (and centres it on an axis where the floor is smaller
 * than the view).
 *
 * Writes, per depth, nine PNGs (dNN-<row>-<col>.png), one 3x3 sheet
 * (sheet-dNN.png) and a report.json with the level, the theme and the camera
 * the tool actually reached. Exits non-zero on any console error.
 *
 * Run it BEFORE a change to get the baseline, again after with a different
 * --tag, and compare the sheets side by side.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));

const ROWS = [['top', 0], ['mid', 0.5], ['bot', 1]];   // 0 = camera at its highest point
const COLS = [['left', 0], ['mid', 0.5], ['right', 1]];

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

const HOOK = `(() => {
  window.__gfxErrors = [];
  const push = (kind, msg) => { try { window.__gfxErrors.push(kind + ': ' + String(msg).slice(0, 400)); } catch (e) {} };
  const oe = console.error.bind(console);
  console.error = function () { push('console.error', Array.prototype.join.call(arguments, ' ')); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => push('error', e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
})();`;

/* In-page driver: step, park the camera, draw without simulating. */
const DRIVER = `(() => {
  const P = window.__maps = {};
  P.g = () => DS.currentGame;
  P.calm = () => { const g = P.g(), p = g.player;
    p.dead = false; p.hp = Math.max(p.hp || 0, p.maxHp || 50); g.deathTimer = 0;
    g.enemies.length = 0; if (g.projectiles) g.projectiles.length = 0; };
  P.step = (n) => { const g = P.g();
    for (let i = 0; i < n; i++) {
      P.calm(); DS.Input.poll(); if (DS.Ptr) DS.Ptr.beginFrame();
      DS.Game.update(g); DS.Input.endFrame();
      DS.Game.draw(g);
    }
    DS.R.present(performance.now() / 1000); };
  P.draw = (n) => { const g = P.g();
    for (let i = 0; i < n; i++) DS.Game.draw(g);
    DS.R.present(performance.now() / 1000); if (DS.HUI && DS.HUI.sync) DS.HUI.sync(); };
  P.go = (d) => { const g = P.g(); g.depth = d; DS.Game.loadLevel(g, DS.Game.kindForDepth(d)); P.calm();
    return { depth: d, theme: DS.R3D.activeThemeName, kind: g.levelKind,
             tiles: [g.map.w, g.map.h], px: [g.map.pixelW, g.map.pixelH] }; };
  /* fx, fy in {0, .5, 1}: 0 is the extreme low end of that axis (left / top). */
  P.park = (fx, fy) => { const g = P.g(), R = DS.R, m = g.map;
    R.setCam(fx === 0 ? -1e6 : fx === 1 ? 1e6 : m.pixelW / 2,
             fy === 0 ? -1e6 : fy === 1 ? 1e6 : m.pixelH / 2);
    R.clampCam(0, m.pixelW, 0, m.pixelH);
    /* The hero goes to the aim point with it: the level is lit by his lamp and
       the torches, so a camera parked at the far end of a cave would otherwise
       photograph pure black. He may hover or sit in rock; the sim is paused. */
    const p = g.player;
    p.x = R.cam.x - p.w / 2; p.y = R.cam.y - p.h / 2; p.vx = 0; p.vy = 0;
    return { x: +R.cam.x.toFixed(1), y: +R.cam.y.toFixed(1) }; };
  P.hideHud = () => { DS.UI3.render = function () {};
    if (DS.R3D.rig) DS.R3D.rig.show = 0;
    const h = document.getElementById('ui-root'); if (h) h.style.visibility = 'hidden'; };
  DS.__paused = true;
  return true;
})()`;

const VIEW = '(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, width: v.w, height: v.h }; })()';

async function shoot(session, file, clip) {
  await cdp.sleep(120);
  const res = await session.cmd('Page.captureScreenshot', {
    format: 'png', fromSurface: true, clip: Object.assign({ scale: 1 }, clip) }, 60000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
}

async function waitFor(session, expr, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await session.eval('!!(' + expr + ')')) return;
    await cdp.sleep(200);
  }
  throw new Error('timed out: ' + expr);
}

const pad2 = (n) => String(n).padStart(2, '0');

/* Stitch a depth's nine shots into one sheet: an HTML page of <img> tags,
   photographed by the same browser. file:// images load fine in a file:// page. */
async function sheet(session, dir, depth, label, size) {
  const cw = 640, ch = Math.round(640 * size.h / size.w), bar = 22;
  let html = `<body style="margin:0;background:#111;font:13px monospace;color:#ddd">` +
    `<div style="height:${bar}px;line-height:${bar}px;padding-left:8px">${label}</div>` +
    `<div style="display:grid;grid-template-columns:repeat(3,${cw}px);gap:2px">`;
  for (const [rn] of ROWS) for (const [cn] of COLS) {
    const f = path.join(dir, `d${pad2(depth)}-${rn}-${cn}.png`);
    html += `<img width="${cw}" height="${ch}" src="file:///${f.replace(/\\/g, '/')}">`;
  }
  html += '</div></body>';
  const page = path.join(dir, `sheet-d${pad2(depth)}.html`);
  fs.writeFileSync(page, html);
  // Room for the whole sheet, so the capture has no scrollbars.
  await session.cmd('Emulation.setDeviceMetricsOverride', {
    width: cw * 3 + 4, height: ch * 3 + 4 + bar, deviceScaleFactor: 1, mobile: false });
  await session.goto('file:///' + page.replace(/\\/g, '/'), 700);
  await shoot(session, path.join(dir, `sheet-d${pad2(depth)}.png`),
    { x: 0, y: 0, width: cw * 3 + 4, height: ch * 3 + 4 + bar });
  fs.unlinkSync(page);
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/';
  const tag = value(args, '--tag') || 'shots';
  const out = path.resolve(ROOT, value(args, '--out') || path.join('tools/qa/out/maps', tag));
  const quality = value(args, '--quality') || 'high';
  const frames = parseInt(value(args, '--frames') || '30', 10);
  const [W, H] = (value(args, '--size') || '1280x720').split('x').map(Number);
  const depthArg = value(args, '--depths') || 'all';
  const depths = depthArg === 'all'
    ? Array.from({ length: 30 }, (_, i) => i + 1)
    : depthArg.split(',').map(Number);
  const report = { tag: tag, quality: quality, depths: {}, errors: [] };
  let failed = false;

  const { session, close } = await cdp.launch({ width: W, height: H, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2600);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready', 30000);
    await session.eval(`localStorage.setItem('ds_name', 'MAPS');`);
    await session.eval('DS.Scenes.play(4242, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.player && DS.currentScene', 30000);
    await cdp.sleep(800);
    await session.eval(`DS.PostFX && DS.PostFX.setQuality('${quality}', { lock: true, quiet: true })`);
    await session.eval(DRIVER);
    await session.eval('__maps.hideHud()');
    const view = await session.eval(VIEW);

    for (const d of depths) {
      const lv = await session.eval(`__maps.go(${d})`);
      await session.eval(`__maps.step(${frames})`);
      const cams = {};
      for (const [rn, fy] of ROWS) for (const [cn, fx] of COLS) {
        cams[rn + '-' + cn] = await session.eval(`__maps.park(${fx}, ${fy})`);
        await session.eval('__maps.draw(2)');
        await shoot(session, path.join(out, `d${pad2(d)}-${rn}-${cn}.png`), view);
      }
      report.depths['d' + d] = Object.assign({ cams: cams }, lv);
      console.log(`d${pad2(d)} ${lv.theme.padEnd(10)} ${lv.kind.padEnd(9)} ${lv.tiles.join('x')}`);
    }
    report.errors = await session.eval('window.__gfxErrors || []');
    if (report.errors.length) {
      failed = true;
      console.log('console errors:\n  ' + report.errors.join('\n  '));
    }

    // The sheets navigate the page away, so they come after every game shot.
    for (const d of depths) {
      const lv = report.depths['d' + d];
      await sheet(session, out, d, `depth ${d} - ${lv.theme} - ${lv.kind} - ${lv.tiles.join('x')} tiles - ${tag}`,
        { w: view.width, h: view.height });
    }
  } finally {
    await close();
  }

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${out}`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
