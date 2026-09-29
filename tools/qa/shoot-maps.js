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
 * The camera is placed directly: DS.R.setCam to a sentinel far past the edge,
 * then DS.R.clampCam, which lands it on the true extreme of that floor's camera
 * range (and centres it on an axis where the floor is smaller than the view).
 * The hero is moved to the aim with it, because the level is lit by his lamp.
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
const { boot, shoot } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));

const ROWS = [['top', 0], ['mid', 0.5], ['bot', 1]];   // 0 = camera at its highest point
const COLS = [['left', 0], ['mid', 0.5], ['right', 1]];

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
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
  const size = (value(args, '--size') || '1280x720').split('x').map(Number);
  const depthArg = value(args, '--depths') || 'all';
  const depths = depthArg === 'all'
    ? Array.from({ length: 30 }, (_, i) => i + 1)
    : depthArg.split(',').map(Number);
  const report = { tag: tag, quality: quality, depths: {}, errors: [] };
  let failed = false;

  const { session, close, view } = await boot(base, { size: size, quality: quality });
  try {
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
