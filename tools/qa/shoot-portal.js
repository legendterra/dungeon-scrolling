#!/usr/bin/env node
/* The exit portal, photographed in each state: open with the hero far away,
 * open with the hero at the threshold, and sealed. Three frames of each, a beat
 * apart, so the turning of the vortex shows as difference between them.
 *
 *   node tools/qa/shoot-portal.js [base-url] [--tag T] [--depth 1] [--size 1280x720]
 *
 * Writes tools/qa/out/portal/<tag>/ (one PNG per shot and sheet.png) and exits
 * non-zero on any console error. */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');
const { boot, shoot } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const tag = value(args, '--tag') || 'shots';
  const depth = parseInt(value(args, '--depth') || '1', 10);
  const size = (value(args, '--size') || '1280x720').split('x').map(Number);
  const out = path.resolve(ROOT, 'tools/qa/out/portal', tag);

  const { session, close, view } = await boot(base, { size: size, quality: 'high' });
  const files = [];
  try {
    await session.eval(`__maps.go(${depth}); __maps.step(20); __maps.calm();`);
    const info = await session.eval(`(() => { const g = __maps.g(); return g.doorPos ? { x: g.doorPos.x, y: g.doorPos.y } : null; })()`);
    if (!info) throw new Error('no door on depth ' + depth);

    const put = (dx, sealed, settle) => session.eval(`(() => {
      const g = __maps.g(), p = g.player, d = g.doorPos;
      g.lockedDoor = ${sealed ? 'true' : 'false'}; g.bossDown = false;
      p.x = d.x + (${dx}) - p.w / 2; p.y = d.y - p.h + 14; p.vx = 0; p.vy = 0;
      DS.R.setCam(d.x, d.y - 10);
      __maps.draw(${settle});
    })()`);

    const shot = async (name, dx, sealed, settle) => {
      await put(dx, sealed, settle);
      for (let i = 0; i < 3; i++) {
        const file = path.join(out, `${name}-${i + 1}.png`);
        await session.eval('__maps.draw(2)');
        await shoot(session, file, view);
        files.push({ name: name, file: file });
        await cdp.sleep(180);
      }
    };
    await shot('open-far', -90, false, 90);
    await shot('open-near', 0, false, 90);
    await shot('sealed', -60, true, 90);

    // A close-up of each state, 3x, so the shader itself can be judged.
    const close3 = async (name, dx, sealed, settle) => {
      await put(dx, sealed, settle);
      const at = await session.eval(`(() => { const d = __maps.g().doorPos, v = DS.UI3.view;
        const c = DS.R3D.worldToScreen(d.x + 8, d.y + 16, {});   // the doorway's centre: 16 px over its floor line
        return { x: v.x + c.x * v.w / DS.C.W, y: v.y + c.y * v.h / DS.C.H }; })()`);
      const clip = { x: Math.max(0, Math.round(at.x - 110)), y: Math.max(0, Math.round(at.y - 130)), width: 220, height: 260, scale: 3 };
      await shoot(session, path.join(out, `close-${name}.png`), clip);
    };
    await close3('open', -80, false, 90);
    await close3('near', 0, false, 90);
    await close3('sealed', -80, true, 90);

    const errors = await session.eval('window.__gfxErrors || []');
    if (errors.length) { console.log('console errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }

    // A sheet: three columns (the three beats), three rows (the three states).
    const cw = 640, ch = Math.round(640 * view.height / view.width);
    let html = `<body style="margin:0;background:#111"><div style="display:grid;grid-template-columns:repeat(3,${cw}px);gap:2px">`;
    for (const f of files) html += `<img width="${cw}" height="${ch}" src="file:///${f.file.replace(/\\/g, '/')}">`;
    html += '</div></body>';
    const page = path.join(out, 'sheet.html');
    fs.writeFileSync(page, html);
    await session.cmd('Emulation.setDeviceMetricsOverride', { width: cw * 3 + 4, height: (ch + 2) * 3, deviceScaleFactor: 1, mobile: false });
    await session.goto('file:///' + page.replace(/\\/g, '/'), 700);
    await shoot(session, path.join(out, 'sheet.png'), { x: 0, y: 0, width: cw * 3 + 4, height: (ch + 2) * 3 });
    fs.unlinkSync(page);
    console.log('wrote ' + out);
  } finally {
    await close();
  }
}

main().catch((e) => { console.error('shoot-portal: ' + e.message); process.exit(1); });
