#!/usr/bin/env node
/* The HTML UI in pictures: depth 1, a boss floor, the safe-room shop and the
 * bag, at 720p / 1080p / 1440p, HUD visible.
 *
 *   node tools/qa/shoot-ui.js [base-url] [--out DIR] [--sizes 720,1080,1440] [--quality low]
 *
 * The loop is paused and driven by hand (DS.Game.update + draw + HUI.sync), so
 * shots are repeatable. Exits non-zero on any console error.
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
  const U = window.__ui = {};
  U.g = () => DS.currentGame;
  U.calm = () => { const g = U.g(), p = g.player; p.dead = false; p.hp = Math.max(p.hp || 0, p.maxHp || 50); g.deathTimer = 0; };
  U.frame = (n, calm) => { const g = U.g();
    for (let i = 0; i < n; i++) { if (calm) U.calm(); DS.Input.poll(); if (DS.Ptr) DS.Ptr.beginFrame();
      DS.Game.update(g); DS.Input.endFrame(); DS.Game.draw(g); }
    DS.R.present(performance.now() / 1000); if (DS.HUI && DS.HUI.sync) DS.HUI.sync(); };
  U.go = (depth, kind) => { const g = U.g(); g.depth = depth; DS.Game.loadLevel(g, kind); U.calm(); return { depth, kind: g.levelKind }; };
  DS.__paused = true; return true; })()`;

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8133/';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/ui');
  const sizes = (value(args, '--sizes') || '720,1080,1440').split(',').map(Number);
  const quality = value(args, '--quality') || 'low';
  let failed = false;
  fs.mkdirSync(out, { recursive: true });

  for (const h of sizes) {
    const w = Math.round(h * 16 / 9);
    const { session, close } = await cdp.launch({ width: w, height: h, url: 'about:blank' });
    try {
      await session.cmd('Page.enable'); await session.cmd('Runtime.enable');
      await session.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
      await session.goto(base, 2600);
      await session.eval(`localStorage.setItem('ds_name', 'UIQA')`);
      for (let i = 0; i < 150; i++) { if (await session.eval('!!(window.DS && DS.UI3 && DS.UI3.ready)')) break; await cdp.sleep(200); }
      await session.eval('DS.Scenes.play(4242, {})');
      for (let i = 0; i < 150; i++) { if (await session.eval('!!(DS.currentGame && DS.currentGame.player)')) break; await cdp.sleep(200); }
      await cdp.sleep(600);
      await session.eval(`DS.PostFX && DS.PostFX.setQuality('${quality}', { lock: true, quiet: true })`);
      await session.eval(DRIVER);
      const shot = async (name) => {
        await session.eval('__ui.frame(2, true)');
        await cdp.sleep(150);
        const res = await session.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true }, 60000);
        fs.writeFileSync(path.join(out, `${name}-${h}.png`), Buffer.from(res.data, 'base64'));
      };
      await session.eval('__ui.frame(120, true)');
      await shot('depth1');
      for (const [name, depth, kind] of [['boss5', 5, 'boss'], ['safe5', 5, 'safe'], ['flat-d3', 3, 'normal'], ['mount7', 7, 'normal']]) {
        console.log(h + 'p ' + name, JSON.stringify(await session.eval(`__ui.go(${depth}, '${kind}')`)));
        await session.eval('__ui.frame(90, true)');
        await shot(name);
      }
      // the merchant panel and the bag, on the safe floor
      await session.eval(`__ui.go(5, 'safe'); __ui.frame(30, true)`);
      const shop = await session.eval(`(() => { const g = __ui.g(); if (!g.merchantPos) return false; DS.UI.openShop(g); return true; })()`);
      if (shop) { await session.eval('__ui.frame(20, true)'); await shot('shop'); await session.eval('DS.UI.closeModal(__ui.g())'); }
      await session.eval('DS.UI.openBag(__ui.g())'); await session.eval('__ui.frame(20, true)'); await shot('bag');
      const errs = await session.eval('window.__errs');
      console.log(h + 'p errors:', JSON.stringify(errs));
      if (errs.length) failed = true;
    } finally { await close(); }
  }
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { process.stderr.write('shoot-ui: ' + e.message + '\n'); process.exit(2); });
