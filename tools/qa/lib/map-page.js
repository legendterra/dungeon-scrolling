#!/usr/bin/env node
/* The page-side half shared by the map tools (shoot-maps.js, audit-world.js):
 * boot the game headless, pause the loop, and step or park it by hand.
 *
 *   const { boot, DRIVER, VIEW, shoot, waitFor } = require('./lib/map-page');
 *
 * The loop is PAUSED (DS.__paused) and the sim is stepped frame by frame --
 * DS.Game.update then DS.Game.draw, exactly what the loop does -- so a machine
 * that renders one frame a second (the cloud box) still gets exact frames.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../../docs/cdp');

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

async function waitFor(session, expr, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await session.eval('!!(' + expr + ')')) return;
    await cdp.sleep(200);
  }
  throw new Error('timed out: ' + expr);
}

async function shoot(session, file, clip) {
  await cdp.sleep(120);
  const res = await session.cmd('Page.captureScreenshot', {
    format: 'png', fromSurface: true, clip: Object.assign({ scale: 1 }, clip) }, 60000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
}

/* Launch, load the game, start a run, pause it and hand back the session. */
async function boot(base, opts) {
  opts = opts || {};
  const size = opts.size || [1280, 720];
  const { session, close } = await cdp.launch({ width: size[0], height: size[1], url: 'about:blank' });
  await session.cmd('Page.enable');
  await session.cmd('Runtime.enable');
  await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  // A tool may need its own probe in place before the page's scripts run (draw-call counters).
  if (opts.preScript) await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: opts.preScript });
  await session.goto(base, 2600);
  await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready', 30000);
  await session.eval(`localStorage.setItem('ds_name', 'MAPS');`);
  await session.eval('DS.Scenes.play(4242, {})');
  await waitFor(session, 'DS.currentGame && DS.currentGame.player && DS.currentScene', 30000);
  await cdp.sleep(800);
  // The HD textures decode asynchronously; a floor built before they have would
  // fall back to the procedural tiles and make two runs of a tool differ.
  await waitFor(session, '!DS.TexLib || !DS.TexLib.hd || DS.TexLib.ready', 20000);
  await session.eval(`DS.PostFX && DS.PostFX.setQuality('${opts.quality || 'high'}', { lock: true, quiet: true })`);
  await session.eval(DRIVER);
  await session.eval('__maps.hideHud()');
  return { session, close, view: await session.eval(VIEW) };
}

module.exports = { HOOK, DRIVER, VIEW, boot, shoot, waitFor };
