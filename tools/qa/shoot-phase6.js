#!/usr/bin/env node
/* Phase 6 in pictures and numbers: the camera and the horizon hold still
 * through a jump, the key light comes from the backdrop's body, and every
 * torch lights its own patch of stone with a shader flame.
 *
 *   node tools/qa/shoot-phase6.js [base-url] [--out DIR] [--quality high]
 *
 * The live loop is PAUSED (DS.__paused) and the run is driven frame by frame
 * -- DS.Game.update then DS.Game.draw, exactly what the loop does -- so a jump
 * is photographed at the same frames on every run and the per-frame numbers
 * (camera aim, eye height, horizon shift, lens zoom) are exact.
 *
 *   a) jump-d1 / jump-d7: eight frames across one jump, plus a probe log;
 *   b) sun-dN: the key's aimed direction next to the frame at depths 1/6/12/23;
 *   c) torch-*: close-ups of a torch in the pool and the same torch on its
 *      baked light alone (the pool switched off through DS.R3D.noFlamePool).
 *
 * Writes PNGs and phase6-report.json; exits non-zero on any console error or
 * if the camera or the horizon moved vertically during a plain jump.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));

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

/* In-page driver: step the run by hand, probe the rig, find torches. */
const DRIVER = `(() => {
  const P = window.__p6 = {};
  P.g = () => DS.currentGame;
  P.calm = () => { const g = P.g(); const p = g.player;
    p.dead = false; p.hp = Math.max(p.hp || 0, p.maxHp || 50); g.deathTimer = 0;
    g.enemies.length = 0; if (g.projectiles) g.projectiles.length = 0; };
  P.frame = (n, draw) => { const g = P.g();
    for (let i = 0; i < n; i++) {
      P.calm(); DS.Input.poll(); if (DS.Ptr) DS.Ptr.beginFrame();
      DS.Game.update(g); DS.Input.endFrame();
      if (draw !== false) DS.Game.draw(g);
    }
    if (draw === false) DS.Game.draw(g);
    DS.R.present(performance.now() / 1000); if (DS.HUI && DS.HUI.sync) DS.HUI.sync(); };
  P.probe = () => { const g = P.g(), L = DS.R3D.lightRig;
    return { camX: +DS.R.cam.x.toFixed(3), camY: +DS.R.cam.y.toFixed(3),
             eyeY: +DS.R3D.camera.position.y.toFixed(4), zoom: +DS.R3D.rig.zoom.toFixed(4),
             horizon: +L.horizonShift.toFixed(4), py: +g.player.y.toFixed(2), ground: !!g.player.onGround }; };
  P.go = (d) => { const g = P.g(); g.depth = d; DS.Game.loadLevel(g, DS.Game.kindForDepth(d)); P.calm();
    return { depth: d, theme: DS.R3D.activeThemeName, kind: g.levelKind }; };
  /* A real key press through the input layer, held for a full jump. */
  P.key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ' }));
  P.jump = () => P.key('keydown');
  P.release = () => P.key('keyup');
  /* Put the hero on the ground next to a torch (level px). */
  P.toTorch = (i, side) => { const g = P.g(), p = g.player, t = DS.R3D.lightRig.torches[i];
    const tx = t.x / 0.1 + (side || -26), fy = -t.y / 0.1;
    p.x = tx - p.w / 2; p.y = fy - p.h; p.vx = 0; p.vy = 0; p.facing = 1;
    DS.R.setCam(tx + 22, fy - p.h / 2 - 8); };
  /* The hero onto the HIGHEST ground column of the floor (a climb's summit). */
  P.toSummit = () => { const g = P.g(), map = g.map, p = g.player; let best = -1, by = 1e9;
    for (let t = 2; t < map.w - 2; t++) { const gy = map.groundBelow(t); if (gy < by) { by = gy; best = t; } }
    p.x = best * 16 + 8 - p.w / 2; p.y = by - p.h; p.vx = 0; p.vy = 0;
    return { tile: best, groundPx: by }; };
  P.hideHud = () => { if (!window.__hud) window.__hud = DS.UI3.render; DS.UI3.render = function () {};
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

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8132/';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/phase6');
  const quality = value(args, '--quality') || 'high';
  const only = (value(args, '--only') || 'jump,sun,torch').split(',');
  const report = { jumps: {}, sun: [], torches: [], errors: [] };
  let failed = false;

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2600);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready', 30000);
    await session.eval(`localStorage.setItem('ds_name', 'P6');`);
    await session.eval('DS.Scenes.play(4242, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.player && DS.currentScene', 30000);
    await cdp.sleep(800);
    await session.eval(`DS.PostFX && DS.PostFX.setQuality('${quality}', { lock: true, quiet: true })`);
    await session.eval(DRIVER);
    await session.eval('__p6.hideHud()');
    const view = await session.eval(VIEW);

    /* a) the jump */
    if (only.includes('jump')) for (const d of [1, 7]) {
      const lv = await session.eval(`__p6.go(${d})`);
      await session.eval('__p6.frame(150)');
      const probes = [];
      await session.eval('__p6.jump()');
      for (let f = 0; f < 40; f++) {
        if (f === 24) await session.eval('__p6.release()');
        await session.eval('__p6.frame(1)');
        probes.push(await session.eval('__p6.probe()'));
        if (f % 5 === 0) await shoot(session, path.join(out, `jump-d${d}-f${String(f).padStart(2, '0')}.png`), view);
      }
      const ys = probes.map((p) => p.camY), hs = probes.map((p) => p.horizon), zs = probes.map((p) => p.zoom);
      const span = (a) => +(Math.max.apply(null, a) - Math.min.apply(null, a)).toFixed(4);
      const apex = Math.max.apply(null, probes.map((p) => probes[0].py - p.py));
      const r = { level: lv, apexPx: +apex.toFixed(1), camYSpan: span(ys), horizonSpan: span(hs), zoomSpan: span(zs) };
      report.jumps['d' + d] = Object.assign(r, { probes: probes });
      console.log(`jump d${d} (${lv.theme}): apex ${r.apexPx}px  camY span ${r.camYSpan}px  horizon span ${r.horizonSpan}  zoom span ${r.zoomSpan}`);
      if (r.camYSpan > 0.5 || r.horizonSpan > 0.01 || r.zoomSpan > 0.02) failed = true;
    }

    /* a2) tall floors: the locked horizon, then its slow drift at the summit */
    if (only.includes('climb')) for (const d of [7, 22, 26]) {
      const lv = await session.eval(`__p6.go(${d})`);
      await session.eval('__p6.frame(90)');
      const h0 = await session.eval('__p6.probe()');
      await shoot(session, path.join(out, `climb-d${d}-start.png`), view);
      const top = await session.eval('__p6.toSummit()');
      await session.eval('__p6.frame(40)');
      const h1 = await session.eval('__p6.probe()');
      await shoot(session, path.join(out, `climb-d${d}-summit-arrive.png`), view);
      await session.eval('__p6.frame(420)');
      await session.eval('__p6.frame(1)');
      const h2 = await session.eval('__p6.probe()');
      await shoot(session, path.join(out, `climb-d${d}-summit-8s.png`), view);
      console.log(`climb d${d} (${lv.theme}): summit ${JSON.stringify(top)} horizon ${h0.horizon} -> ${h1.horizon} -> ${h2.horizon}`);
      report.climb = report.climb || [];
      report.climb.push({ level: lv, summit: top, start: h0, arrive: h1, later: h2 });
    }

    /* b) the key vs the body */
    if (only.includes('sun')) for (const d of [1, 6, 12, 23]) {
      const lv = await session.eval(`__p6.go(${d})`);
      await session.eval('__p6.frame(90)');
      const info = await session.eval(`(() => { const L = DS.R3D.lightRig; const h = DS.Backdrop.heroInfo();
        const c = DS.R3D.camera.position;
        return { keyDir: [L.keyDir.x, L.keyDir.y, L.keyDir.z].map((v) => +v.toFixed(3)), aimed: L.keyAimed,
                 behind: +L.keyBehind.toFixed(2), keyColor: L.keyColor,
                 body: h ? [h.worldPos.x - c.x, h.worldPos.y - c.y, h.worldPos.z].map((v) => +v.toFixed(1)) : null,
                 bodyColor: h ? h.color.getHexString() : null }; })()`);
      report.sun.push(Object.assign({ level: lv }, info));
      console.log(`sun d${d} (${lv.theme}): key ${JSON.stringify(info.keyDir)} body(rel cam) ${JSON.stringify(info.body)} col ${info.keyColor}/${info.bodyColor}`);
      await shoot(session, path.join(out, `sun-d${d}.png`), view);
    }

    /* c) torches: close-up in the pool, then on baked light only */
    if (only.includes('torch')) for (const d of [1, 3, 5, 8, 14, 24]) {
      const lv = await session.eval(`__p6.go(${d})`);
      await session.eval('__p6.frame(20)');
      const n = await session.eval('DS.R3D.lightRig.torches.length');
      if (!n) { console.log(`torch d${d}: no torches`); continue; }
      const idx = Math.floor(n / 2);
      const slotOf = `DS.R3D.lightRig.emitters.filter((e) => e.kind === 0)[${idx}].slot`;
      await session.eval(`__p6.toTorch(${idx})`);
      await session.eval('__p6.frame(60)');
      /* Crops are centred on the flame, through the renderer's projection. */
      const fp = await session.eval(`(() => { const t = DS.R3D.lightRig.torches[${idx}];
        return DS.R3D.worldToScreen(t.x / 0.1, -(t.y + t.lift) / 0.1, {}); })()`);
      const cw = view.width * 0.5, ch = view.height * 0.6;
      const clip = { x: Math.max(view.x, Math.min(view.x + view.width - cw, view.x + fp.x * view.width / 320 - cw / 2)),
                     y: Math.max(view.y, Math.min(view.y + view.height - ch, view.y + fp.y * view.height / 180 - ch * 0.4)),
                     width: cw, height: ch };
      await shoot(session, path.join(out, `torch-d${d}-pool.png`), clip);
      await shoot(session, path.join(out, `torch-d${d}-full.png`), view);
      const mw = view.width * 0.12, mh = view.height * 0.24;
      const mx = view.x + fp.x * view.width / 320 - mw / 2, my = view.y + fp.y * view.height / 180 - mh * 0.55;
      for (let k = 0; k < 3; k++) {
        await session.eval('__p6.frame(7)');
        await shoot(session, path.join(out, `torch-d${d}-flame${k}.png`), { x: mx, y: my, width: mw, height: mh, scale: 3 });
      }
      await session.eval('DS.R3D.noFlamePool = true');
      await session.eval('__p6.frame(40)');
      await shoot(session, path.join(out, `torch-d${d}-baked.png`), clip);
      await session.eval('DS.R3D.noFlamePool = false');
      const bakedSlot = await session.eval(slotOf);
      report.torches.push({ level: lv, torches: n, shot: idx, slotWhenBaked: bakedSlot });
      console.log(`torch d${d} (${lv.theme}): ${n} torches, shot #${idx}`);
    }

    report.errors = await session.eval('window.__gfxErrors || []');
  } finally {
    await close();
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'phase6-report.json'), JSON.stringify(report, null, 2));
  console.log(report.errors.length ? 'ERRORS:\n  ' + report.errors.slice(0, 20).join('\n  ') : 'no console errors');
  process.exitCode = report.errors.length || failed ? 1 : 0;
}

main().catch((err) => { console.error('shoot-phase6: ' + err.message); process.exit(2); });
