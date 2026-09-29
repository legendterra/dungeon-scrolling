#!/usr/bin/env node
/* The opening cutscene (scenes/intro3d.js), photographed at its beats while it
 * plays in real time, and checked to end where it should: in the run.
 *
 *   node tools/qa/shoot-intro.js [base-url] [--out DIR] [--skip]
 *
 * Frames shot: the wide look, the walk, the shoulder, the door waking, the low
 * angle, the step, the white. With --skip a key is pressed a few frames in and
 * the run must start at once. Exit code 1 on a failed check or a page error. */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');
const { HOOK, waitFor, shoot, VIEW } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));
const BEATS = [30, 120, 300, 430, 520, 600, 650, 690, 730];
const failures = [];
function check(label, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures.push(label);
}
function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/intro');
  const skipTest = args.includes('--skip');
  fs.mkdirSync(out, { recursive: true });

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene && DS.Intro3D', 30000);
    const view = await session.eval(VIEW);
    check('the 3D intro is loaded', await session.eval('typeof DS.Intro3D.createIntro === "function"'));

    await session.eval('DS.Scenes.intro({})');
    await waitFor(session, 'DS.currentScene && DS.currentScene.state && DS.currentScene.state.frame > 0 && DS.currentScene.state.frame < 400', 20000);
    check('the intro scene is the one that runs', (await session.eval('DS.Intro3D.TOTAL')) > 600);

    if (skipTest) {
      await session.eval("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }))");
      await waitFor(session, 'DS.currentGame && DS.currentGame.player', 15000);
      check('any key skips straight into the run', true);
      const errs = await session.eval('window.__gfxErrors || []');
      check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } else {
      for (const beat of BEATS) {
        const alive = await session.eval(`new Promise((res) => { const t0 = Date.now(); (function poll() {
          const s = DS.currentScene && DS.currentScene.state;
          if (!s || s.frame === undefined || s.done) return res(false);
          if (s.frame >= ${beat}) return res(s.frame);
          if (Date.now() - t0 > 30000) return res(-1);
          setTimeout(poll, 25); })(); })`);
        if (!alive || alive < 0) { check('beat ' + beat + ' reached', false, String(alive)); break; }
        await shoot(session, path.join(out, `beat-${String(beat).padStart(3, '0')}.png`), view);
        console.log('     shot at frame ' + alive);
      }
      await waitFor(session, 'DS.currentGame && DS.currentGame.player', 30000);
      check('the intro ends in the run', true);
      const errs = await session.eval('window.__gfxErrors || []');
      check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

      // A contact sheet of the beats.
      const cw = 640, ch = Math.round(640 * view.height / view.width);
      let html = `<body style="margin:0;background:#111"><div style="display:grid;grid-template-columns:repeat(3,${cw}px);gap:2px">`;
      for (const beat of BEATS) {
        const f = path.join(out, `beat-${String(beat).padStart(3, '0')}.png`);
        if (fs.existsSync(f)) html += `<img width="${cw}" height="${ch}" src="file:///${f.replace(/\\/g, '/')}">`;
      }
      html += '</div></body>';
      const page = path.join(out, 'sheet.html');
      fs.writeFileSync(page, html);
      await session.cmd('Emulation.setDeviceMetricsOverride', { width: cw * 3 + 4, height: (ch + 2) * 3, deviceScaleFactor: 1, mobile: false });
      await session.goto('file:///' + page.replace(/\\/g, '/'), 700);
      await shoot(session, path.join(out, 'sheet.png'), { x: 0, y: 0, width: cw * 3 + 4, height: (ch + 2) * 3 });
      fs.unlinkSync(page);
    }
  } finally {
    await close();
  }
  console.log(failures.length ? '\n' + failures.length + ' FAILED' : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => { console.error('shoot-intro: ' + e.message); process.exit(2); });
