#!/usr/bin/env node
/* The graphics pass, measured and photographed: four floors, every quality
 * preset, the frame time each one costs, and every console error on the way.
 *
 *   node tools/qa/shoot-gfx.js [base-url] [--out DIR] [--tag NAME]
 *                              [--quality low,med,high] [--depths 1,7,20,30]
 *                              [--size WxH] [--hud]
 *
 * What it does, in the game's own terms: boots the page, starts seed 4242
 * through DS.Scenes.play, and for each depth writes g.depth and reloads the
 * floor through DS.Game.loadLevel(g, DS.Game.kindForDepth(d)) -- the same entry
 * point a descent uses -- then lets the live loop run so the camera, the horizon
 * and the lights settle before anything is shot.
 *
 * Frames are CROPPED TO THE PLAY FRAME (DS.UI3.view), so the gutter of a window
 * that is not 16:9 never lands in a picture. The HUD is off unless --hud: the
 * pictures are about the world pass.
 *
 * Frame time is read two ways, because they answer different questions:
 *   raf   the interval between animation frames (what the player feels);
 *   r3d   DS.R3D.render plus a 1px readback, i.e. CPU + GPU for the world
 *         pass and its post chain (what this pass costs).
 * Headless Chrome renders with SwiftShader (tools/docs/cdp.js launches it with
 * --disable-gpu), so absolute numbers here are pessimistic; the RATIOS between
 * presets are what to read. The report names the adapter it ran on.
 *
 * Console errors are captured from the first line the page runs (the hook is
 * installed on the new document, then the page is reloaded), so a boot-time
 * shader failure cannot slip past the report.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));

function value(args, flag) {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(flag + ' needs a value');
  return v;
}

/* Error capture, installed before any game script runs. */
const HOOK = `(() => {
  window.__gfxErrors = [];
  const push = (kind, msg) => { try { window.__gfxErrors.push(kind + ': ' + String(msg).slice(0, 400)); } catch (e) {} };
  const oe = console.error.bind(console);
  console.error = function () { push('console.error', Array.prototype.join.call(arguments, ' ')); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => push('error', e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => push('rejection', e.reason && (e.reason.stack || e.reason)));
})();`;

const VIEW = '(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, w: v.w, h: v.h,' +
  ' dpr: window.devicePixelRatio || 1 }; })()';

const HUD_OFF = '(() => { if (!window.__gfxHud) window.__gfxHud = DS.UI3.render;' +
  ' DS.UI3.render = function () {}; if (DS.R3D.rig) DS.R3D.rig.show = 0; return true; })()';
const HUD_ON = '(() => { if (window.__gfxHud) DS.UI3.render = window.__gfxHud; return true; })()';

/* Keep the run alive while it is photographed: a floor full of monsters will
   otherwise end it between two shots. */
const KEEP_ALIVE = `(() => { const g = DS.currentGame; if (!g || !g.player) return false;
  const p = g.player; p.dead = false; p.hp = Math.max(p.hp || 0, p.maxHp || 50);
  g.deathTimer = 0; return true; })()`;

/* Where the hero is on screen (logical 320x180), through the renderer's own
   projection when this build has one. */
const HERO_AT = `(() => { const p = DS.currentGame.player; if (!p) return null;
  const x = p.x + p.w / 2, y = p.y + p.h / 2;
  if (DS.R3D.worldToScreen) return DS.R3D.worldToScreen(x, y, {});
  return { x: DS.R.toScreenX(x), y: DS.R.toScreenY(y) }; })()`;

const GOTO = (depth) => `(() => { const g = DS.currentGame; g.depth = ${depth};
  DS.Game.loadLevel(g, DS.Game.kindForDepth(${depth}));
  for (let i = 0; i < 30; i++) DS.Game.update(g);
  return { depth: g.depth, kind: g.levelKind, biome: g.biome && g.biome.name,
           theme: DS.R3D.activeThemeName }; })()`;

/* A frame-time sample over `ms`: animation-frame intervals, plus the CPU cost
   of the world pass itself (DS.R3D.render wrapped for the duration). */
const SAMPLE = (ms) => `new Promise((resolve) => {
  const R3D = DS.R3D, orig = R3D.render; const cost = [];
  /* A one-pixel readback after the world pass forces the GPU to finish it, so
     r3d is CPU + GPU for the world and its post chain, not just the submit. */
  const gl = R3D.gl.getContext(); const px = new Uint8Array(4);
  R3D.render = function (g) { const t0 = performance.now(); orig(g);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); cost.push(performance.now() - t0); };
  const gaps = []; let last = 0; const end = performance.now() + ${ms};
  function tick(t) {
    if (last) gaps.push(t - last); last = t;
    if (t < end) requestAnimationFrame(tick);
    else {
      R3D.render = orig;
      const stat = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y);
        const avg = a.reduce((x, y) => x + y, 0) / a.length;
        return { avg: +avg.toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), n: a.length }; };
      resolve({ raf: stat(gaps), r3d: stat(cost),
                quality: DS.PostFX ? DS.PostFX.quality : 'n/a' });
    }
  }
  requestAnimationFrame(tick);
})`;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

async function shootView(session, file, view) {
  const res = await session.cmd('Page.captureScreenshot', {
    format: 'png', fromSurface: true,
    clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 }
  }, 60000);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return pngSize(file);
}

async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(200);
  }
  throw new Error('timed out waiting for: ' + expr);
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8126/';
  const out = path.resolve(ROOT, value(args, '--out') || path.join('tools', 'qa', 'out', 'gfx'));
  const tag = value(args, '--tag') || 'after';
  const qualities = (value(args, '--quality') || 'low,med,high').split(',');
  const depths = (value(args, '--depths') || '1,7,20,30').split(',').map(Number);
  const sizeArg = value(args, '--size') || '1280x720';
  const m = /^(\d+)x(\d+)$/.exec(sizeArg);
  const size = { width: Number(m[1]), height: Number(m[2]) };
  const withHud = args.includes('--hud');

  const { session, close } = await cdp.launch({ width: size.width, height: size.height, url: 'about:blank' });
  const report = { url: base, tag: tag, size: sizeArg, shots: [], frames: [], errors: [] };
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2600);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready', 30000);
    report.renderer = await session.eval(`(() => { const gl = DS.R3D.gl.getContext();
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return { webgl2: DS.R3D.gl.capabilities.isWebGL2,
               gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown' }; })()`);
    await session.eval(`localStorage.setItem('ds_name', 'GFX');`);
    await session.eval('DS.Scenes.play(4242, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.map && DS.currentGame.player && DS.currentScene', 30000);
    await cdp.sleep(1000);

    for (const q of qualities) {
      const has = await session.eval('!!(window.DS && DS.PostFX)');
      if (has) await session.eval(`DS.PostFX.setQuality('${q}', { lock: true, quiet: true })`);
      else if (q !== qualities[0]) continue;       // an old build has one look only
      const qName = has ? q : 'base';
      for (const d of depths) {
        const load = await session.eval(GOTO(d));
        await session.eval(KEEP_ALIVE);
        await session.eval(withHud ? HUD_ON : HUD_OFF);
        await cdp.sleep(1800);
        await session.eval(KEEP_ALIVE);
        const view = await session.eval(VIEW);
        const file = path.join(out, tag + '-' + qName + '-d' + d + '.png');
        const px = await shootView(session, file, view);
        report.shots.push({ quality: qName, depth: d, theme: load.theme, kind: load.kind,
                            file: path.relative(ROOT, file), w: px.w, h: px.h });
        /* A 2x close-up around the hero: shadows, occlusion and rim live at a
           scale the full frame cannot show. */
        const hero = await session.eval(HERO_AT);
        if (hero) {
          const cw = view.w * 0.36, ch = view.h * 0.36;
          const cx = Math.max(view.x, Math.min(view.x + view.w - cw, view.x + hero.x * view.w / 320 - cw / 2));
          const cy = Math.max(view.y, Math.min(view.y + view.h - ch, view.y + hero.y * view.h / 180 - ch * 0.6));
          const zfile = path.join(out, tag + '-' + qName + '-d' + d + '-zoom.png');
          const res = await session.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true,
            clip: { x: cx, y: cy, width: cw, height: ch, scale: 2 } }, 60000);
          fs.writeFileSync(zfile, Buffer.from(res.data, 'base64'));
        }
        console.log('shot ' + qName + ' d' + d + ' (' + load.theme + '/' + load.kind + ') -> ' +
                    path.relative(ROOT, file));
      }
      /* Frame time on the last floor shot, with the run still live. */
      await session.eval(KEEP_ALIVE);
      const f = await session.eval(SAMPLE(3000));
      report.frames.push({ quality: qName, raf: f.raf, r3d: f.r3d, active: f.quality });
      console.log('frame ' + qName + ' raf ' + JSON.stringify(f.raf) + ' r3d ' + JSON.stringify(f.r3d));
    }
    report.errors = await session.eval('window.__gfxErrors || []');
  } finally {
    await close();
  }

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, tag + '-report.json'), JSON.stringify(report, null, 2));
  console.log('renderer ' + JSON.stringify(report.renderer));
  console.log(report.errors.length ? 'ERRORS (' + report.errors.length + '):\n  ' +
    report.errors.slice(0, 20).join('\n  ') : 'no console errors');
  process.exitCode = report.errors.length ? 1 : 0;
}

main().catch((err) => { console.error('shoot-gfx: ' + err.message); process.exit(2); });
