#!/usr/bin/env node
/* Each element's ground field and reaction burst, planted at the hero's feet
 * on a plain floor, so a wash-out or a missing effect shows up in a picture.
 *
 *   node tools/qa/shoot-elements.js [base-url] [--out DIR] [--quality high] [--only ice,fire]
 *
 * Also reports the mean brightness of the floor strip under the field before
 * and after, so "the ice turns the floor white" is a number.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));
const value = (a, f) => { const i = a.indexOf(f); return i < 0 ? null : a[i + 1]; };

const DRIVER = `(() => {
  const E = window.__el = {};
  E.g = () => DS.currentGame;
  E.calm = () => { const g = E.g(), p = g.player; p.dead = false; p.hp = Math.max(p.hp || 0, p.maxHp || 50); g.deathTimer = 0; g.enemies.length = 0; };
  /* draw=false steps the simulation only: the software renderer of a headless
     box takes about a second per frame at high quality. */
  E.frame = (n, draw) => { const g = E.g();
    for (let i = 0; i < n; i++) { E.calm(); DS.Input.poll(); if (DS.Ptr) DS.Ptr.beginFrame(); DS.Game.update(g); DS.Input.endFrame();
      if (draw !== false || i === n - 1) DS.Game.draw(g); }
    DS.R.present(performance.now() / 1000); };
  E.field = (el) => { const g = E.g(), p = g.player;
    DS.Elements.spawnField(g, p.x + p.w / 2 + 30, p.y + p.h, el, 1.4); };
  E.hide = () => { DS.UI3.render = function () {}; const h = document.getElementById('ui-root'); if (h) h.style.visibility = 'hidden'; };
  DS.__paused = true; return true; })()`;

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8133/';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/elements');
  const quality = value(args, '--quality') || 'med';
  const only = (value(args, '--only') || 'fire,ice,lightning,poison,water,earth,leaf,wind').split(',');
  fs.mkdirSync(out, { recursive: true });
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  let failed = false;
  try {
    await session.cmd('Page.enable'); await session.cmd('Runtime.enable');
    await session.goto(base, 2600);
    await session.eval(`localStorage.setItem('ds_name', 'EL')`);
    for (let i = 0; i < 150; i++) { if (await session.eval('!!(window.DS && DS.UI3 && DS.UI3.ready)')) break; await cdp.sleep(200); }
    await session.eval('DS.Scenes.play(4242, {})');
    for (let i = 0; i < 150; i++) { if (await session.eval('!!(DS.currentGame && DS.currentGame.player)')) break; await cdp.sleep(200); }
    await cdp.sleep(600);
    await session.eval(`DS.PostFX && DS.PostFX.setQuality('${quality}', { lock: true, quiet: true })`);
    await session.eval(DRIVER);
    await session.eval('__el.hide()');
    const view = await session.eval('(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, width: v.w, height: v.h }; })()');
    await session.eval('__el.frame(60, false)', 120000);
    for (const el of only) {
      await session.eval(`__el.field('${el}')`);
      await session.eval('__el.frame(20, false)', 120000);
      await session.eval('__el.frame(1)', 120000);
      await cdp.sleep(120);
      const res = await session.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: Object.assign({ scale: 1 }, view) }, 60000);
      fs.writeFileSync(path.join(out, `field-${el}.png`), Buffer.from(res.data, 'base64'));
      await session.eval('__el.frame(300, false)', 120000);       // let it die before the next one
      console.log('shot', el);
    }
  } finally { await close(); }
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { process.stderr.write('shoot-elements: ' + e.message + '\n'); process.exit(2); });
