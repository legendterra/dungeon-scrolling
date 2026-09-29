#!/usr/bin/env node
/* The backdrop contact sheet: ten floors, three camera positions, one page.
 *
 *   node tools/qa/shoot-backdrop.js [base-url] [--out DIR] [--size WxH]
 *                                   [--only d3,d7] [--before URL]
 *                                   [--depths 1-30] [--presets 0,1]
 *
 * audit-backdrop.js decides whether the horizon is there with numbers. This tool
 * exists because numbers are not a picture: it shoots the ten floors a run
 * actually visits, three camera positions each, and lays the thirty frames out
 * on one sheet so a person can look at them side by side and see whether the
 * bands recede, whether the light is in the sky, and whether the horizon is
 * standing on the ground the player is on.
 *
 *   column 1   ACTION 0/11   the shipped shot (the rig's default): close, 11
 *                            degrees down, the light straight ahead
 *   column 2   SIDE 0/7      the older straight side-on shot, one F6 away
 *   column 3   STEEP 60/35   the steepest preset: the one that shows the ground
 *                            plane and therefore the depth of the bands
 *
 * --presets picks columns by rig index (4 = action, 0 = side, 1 = three-q,
 * 2 = steep, 3 = film); --depths walks other acts (1-30, or 11,14,22).
 *
 * --before URL adds a live-build column: the same ten floors on a deployed
 * build, walked the same way but with that build's own API. It is how "the old
 * backdrop versus this one" is answered with two pictures instead of a memory,
 * and it is optional because it depends on a server being up.
 *
 * Each frame is CROPPED TO THE PLAY FRAME (DS.UI3.view) so a 16:9 window with a
 * gutter does not put a black band in every cell, and the HUD is switched off
 * for the capture -- the sheet is about the horizon, and the HUD is 40 sprites
 * drawn over it (DS.UI3.render is patched out in the page, not in the game).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');
const BACKDROP_PAGE = require('./lib/backdrop-page');

const ROOT = path.dirname(path.dirname(__dirname));
const DEFAULT_OUT = path.join('tools', 'qa', 'out', 'backdrop');

/* Act I by default; --depths 1-30 (or a list, 11,14,22) walks the other acts,
   whose floors reuse the same thirteen themes with a depth-seeded variant. */
let DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/* The three positions on the rig. Keys match CAM_PRESETS in the renderer, so a
   renamed preset breaks the filenames loudly instead of silently. */
const ALL_PRESETS = [
  { i: 4, key: 'cine', label: 'ACTION 0/11' },
  { i: 0, key: 'left', label: 'SIDE 0/7' },
  { i: 1, key: 'foot', label: 'THREE-Q 40/24' },
  { i: 2, key: 'wide', label: 'STEEP 60/35' },
  { i: 3, key: 'film', label: 'FILM 20/16' }
];
const DEFAULT_PRESETS = [4, 0, 2];
let PRESETS = ALL_PRESETS.filter((p) => DEFAULT_PRESETS.indexOf(p.i) >= 0);

/* Where the frame is, in the page's own CSS pixels. The capture is clipped to
   it, and the PNG's header is checked against it afterwards: a clip that the
   browser silently ignored is how a contact sheet ends up with the whole window
   (gutter, cursor and all) in one cell out of thirty. */
const VIEW = '(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, w: v.w, h: v.h,' +
  ' dpr: window.devicePixelRatio || 1, win: [window.innerWidth, window.innerHeight] }; })()';

/* The HUD off, and the F6 readout with it. DS.UI3.render is the one call the
   renderer makes to draw every sprite overlay; replacing it leaves the world
   render, the post pass and the frame budget exactly as the game has them. */
const HUD_OFF = '(() => { if (!window.__bqaHud) window.__bqaHud = DS.UI3.render;' +
  ' DS.UI3.render = function () {}; if (DS.R3D.rig) DS.R3D.rig.show = 0;' +
  /* ...and the quality ladder held where it is: a headless GPU is slow enough
     that the auto-downgrade drops to 'low' part-way down the sheet, and then
     half the frames are shot without the post chain they are meant to show. */
  ' if (DS.PostFX) DS.PostFX.locked = true; return true; })()';

/* A fresh floor at this depth, through the game's own entry point. */
const GOTO = (depth) => `(() => { const g = DS.currentGame; g.depth = ${depth};` +
  ` DS.Game.loadLevel(g, 'normal'); return { depth: g.depth, kind: g.levelKind,` +
  ` biome: g.biome.name }; })()`;

/* What the shot is: theme, the celestial body, the horizon shift, the colours of
   the near and far bands. Read off the live report, so the caption cannot
   describe a build that is not in the picture. */
const FACTS = `(() => {
  const r = DS.R3D.backdrop;
  if (!r) return null;
  const L = r.layers.slice().sort(function (a, b) { return a.d - b.d; });
  const h = r.hero, tg = DS.R3D.themeGroup;
  return { theme: r.theme, variant: r.variant, draws: r.draws, wu: r.wu, gain: r.gain, anchorY: +r.anchorY.toFixed(2),
           shift: tg ? +tg.position.y.toFixed(2) : 0,
           rungs: L.length, near: L[0].col, nearLum: lumOf(L[0].col),
           far: L[L.length - 1].col, farLum: lumOf(L[L.length - 1].col),
           sky: r.skyValue, body: h ? h.kind : null, bodyCol: h ? h.col : null,
           solo: L.filter(function (x) { return x.solo; }).length,
           texed: L.filter(function (x) { return !!x.tex; }).length,
           window: r.window, instances: L.reduce(function (a, x) { return a + x.n; }, 0) };
  function lumOf(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return Math.round(((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114);
  }
})()`;

function value(args, flag) {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(flag + ' needs a value');
  return v;
}

/* "1-10", "11,14,22" or a mix of both. */
function parseList(text) {
  const out = [];
  String(text).split(',').forEach((part) => {
    const m = /^(\d+)-(\d+)$/.exec(part.trim());
    if (m) { for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i); }
    else if (part.trim() !== '') out.push(Number(part.trim()));
  });
  if (!out.length || out.some((n) => !Number.isFinite(n))) throw new Error('bad list: ' + text);
  return out;
}

function parseSize(text) {
  const m = /^(\d+)x(\d+)$/.exec(text || '');
  if (!m) throw new Error('--size wants WxH, for example 1280x720');
  return { width: Number(m[1]), height: Number(m[2]) };
}

/* PNG dimensions straight out of the header (IHDR is always the first chunk). */
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG: ' + file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* Capture the play frame, clipped, and hold the file to the clip. */
async function shootView(session, file, view) {
  const res = await session.cmd('Page.captureScreenshot', {
    format: 'png', fromSurface: true,
    clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 }
  }, 30000);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  const px = pngSize(file);
  const wantW = Math.round(view.w * view.dpr), wantH = Math.round(view.h * view.dpr);
  if (px.w !== wantW || px.h !== wantH) {
    throw new Error('crop mismatch on ' + path.basename(file) + ': got ' + px.w + 'x' + px.h +
                    ', the play frame is ' + wantW + 'x' + wantH);
  }
  return px;
}

/* Wait for the live run to exist, then for a level to be standing on it. */
async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(200);
  }
  throw new Error('timed out waiting for: ' + expr);
}

const STARTED = 'DS.currentGame && DS.currentGame.map && DS.currentGame.player && DS.currentScene';

/* --- the main pass: this build, three positions a floor ---------------------- */
async function capture(session, out, only, size) {
  await session.cmd('Page.enable');
  await session.cmd('Runtime.enable');
  await cdp.sleep(2600);                       // boot + the title card

  await session.eval(`localStorage.setItem('ds_name', 'QA');`);
  await session.eval(`DS.Scenes.play(null, { weapon: 'sword' })`);
  await waitFor(session, STARTED, 25000);
  await cdp.sleep(1200);
  await session.eval(HUD_OFF);
  await session.eval(BACKDROP_PAGE.PRELUDE);

  const rows = [];
  for (const depth of DEPTHS) {
    if (only && only.indexOf('d' + depth) < 0) continue;
    const load = await session.eval(GOTO(depth));
    await cdp.sleep(1500);
    /* The prelude is installed once per page, but a level change rebuilds the
       horizon group, so it is re-called rather than re-installed: the helpers
       look the group up live (see bodyReal/horizon in lib/backdrop-page.js). */
    if (!(await session.eval('!!(window.__BQA)'))) await session.eval(BACKDROP_PAGE.PRELUDE);
    await session.eval(HUD_OFF);

    /* Stand where the body hangs and the level is not in the way, then let the
       horizon finish easing onto this patch of ground before anything is shot:
       the first frames of a level place it, and a shot taken mid-slide would be
       a picture of the easing, not of the placement. */
    const walk = await session.eval('window.__BQA.vantage(8)');
    await cdp.sleep(2400);
    const hz = await session.eval('window.__BQA.horizon()');
    const facts = await session.eval(FACTS);
    const alive = await session.eval('window.__BQA.alive()');
    if (!alive.live || alive.dead) throw new Error('the run ended on depth ' + depth +
      ' while shooting it: ' + JSON.stringify(alive));
    cdp.log('depth ' + depth + ' ' + load.biome + '/' + load.kind +
            ' walk ' + JSON.stringify(walk) + ' horizon ' + JSON.stringify(hz));

    const cells = [];
    for (const p of PRESETS) {
      await session.eval(`(DS.R3D.setPreset(${p.i}), DS.R3D.rig.show = 0, true)`);
      await cdp.sleep(420);                    // the rig eases onto the preset
      /* The frame the RENDERER drew, for the numbers in the caption: the
         screenshot below is the compositor's copy of the same instant, and the
         two are not always the same image (see backdrop-page.js). */
      await session.eval('window.__BQA.arm()');
      await cdp.sleep(260);
      const scan = await session.eval('window.__BQA.scan()');
      const view = await session.eval(VIEW);
      const file = path.join(out, 'd' + depth + '-' + p.key + '.png');
      const px = await shootView(session, file, view);
      cdp.log('  ' + p.key + ' -> ' + path.basename(file) + ' ' + px.w + 'x' + px.h +
              ' mean ' + (scan ? scan.mean : '?'));
      cells.push({ preset: p, file: path.basename(file), scan: scan, w: px.w, h: px.h });
    }
    /* Back to the shipped shot: the sheet is looked at, but the game is also
       left in the state a player would find it in. */
    await session.eval('(DS.R3D.setPreset(DS.R3D.defaultPreset), DS.R3D.rig.show = 0, true)');
    rows.push({ depth: depth, load: load, facts: facts, hz: hz, walk: walk, cells: cells });
  }
  return rows;
}

/* --- the "before" pass: a deployed build, walked the same way --------------- */

/* The old build has no DS.R3D.backdrop to measure, so the walk is done here in
   the level's own units: map.groundBelow() is PIXELS, not a row (reading it as a
   row drops the player sixteen times too deep, ends the run, and shoots the
   game-over screen ten times). It is the same arithmetic the prelude's walkAt
   uses, reduced to what this pass needs. */
const BEFORE_WALK = `(() => {
  const g = DS.currentGame, p = g.player, map = g.map, T = 16;
  const want = Math.max(5, Math.min(map.w - 6, Math.round(map.w * 0.30)));
  let tx = want, row = -1;
  for (let d = 0; d < 24 && row < 0; d++) {
    const cands = d === 0 ? [want] : [want - d, want + d];
    for (let i = 0; i < cands.length; i++) {
      const t = cands[i];
      if (t < 4 || t > map.w - 5) continue;
      const gy = map.groundBelow(t);
      if (gy >= map.pixelH - 3 * T) continue;
      const ty = Math.round(gy / T);
      if (map.isBlocked(t, ty - 1) || map.isBlocked(t, ty - 2) || map.isBlocked(t, ty - 3)) continue;
      tx = t; row = ty; break;
    }
  }
  if (row < 0) row = Math.round(map.groundBelow(want) / T);
  p.x = tx * T + (T - p.w) * 0.5;
  p.y = (row - 2) * T;
  p.vy = 0; p.dead = false; p.hp = Math.max(p.hp, 40);
  DS.R.cam.x = DS.Ent.centerX(p) + p.facing * 22;
  DS.R.cam.y = DS.Ent.centerY(p) - 8;
  DS.R.clampCam(0, map.pixelW, 0, map.pixelH);
  return { tx: tx, row: row };
})()`;

async function captureBefore(url, out, only) {
  const chrome = await cdp.launch({ url: url, width: 1280, height: 720 });
  const { session } = chrome;
  const dir = path.join(out, 'before');
  fs.mkdirSync(dir, { recursive: true });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(3000);
    await session.eval(`localStorage.setItem('ds_name', 'QA');`);
    await session.eval(`DS.Scenes.play(null, { weapon: 'sword' })`);
    await waitFor(session, STARTED, 30000);
    await cdp.sleep(1200);
    await session.eval(HUD_OFF);

    const made = {};
    for (const depth of DEPTHS) {
      if (only && only.indexOf('d' + depth) < 0) continue;
      await session.eval(GOTO(depth));
      await cdp.sleep(1600);
      await session.eval(HUD_OFF);
      await session.eval(BEFORE_WALK);
      await cdp.sleep(700);
      const view = await session.eval(VIEW);
      const file = path.join(dir, 'd' + depth + '.png');
      const px = await shootView(session, file, view);
      cdp.log('before depth ' + depth + ' -> ' + px.w + 'x' + px.h);
      made[depth] = path.join('before', 'd' + depth + '.png');
    }
    return made;
  } finally {
    await chrome.close();
  }
}

/* --- the page ---------------------------------------------------------------- */

/* The version on the sheet is the one the PAGE is carrying, not a field in a
   manifest: this project has no build step, so the cache-buster in index.html is
   the only thing that says which revision of the code these frames came from. A
   sheet captioned with the wrong version is worse than one with no caption. */
function shippedVersion() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/\?v=([0-9][0-9.]*)/);
    if (m) return 'v' + m[1];
  } catch (err) { /* fall through */ }
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'meta.json'), 'utf8')).version;
  } catch (err) { return 'release'; }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function swatch(hex) {
  return '<i class="sw" style="background:' + esc(hex) + '"></i>';
}

function sheet(rows, before, meta) {
  const cols = PRESETS.map((p) => p.label);
  const head = cols.map((c) => '<th>' + esc(c) + '</th>').join('') +
    (before ? '<th class="bf">BEFORE &middot; live build</th>' : '');

  const body = rows.map((r) => {
    const f = r.facts || {};
    const hz = r.hz || {};
    const cells = r.cells.map((c) => {
      const s = c.scan || {};
      return '<td><a href="' + esc(c.file) + '"><img src="' + esc(c.file) + '" alt="depth ' +
        r.depth + ' ' + esc(c.preset.label) + '"></a>' +
        '<div class="cap">mean <b>' + esc(s.mean) + '</b> &middot; dark ' + esc(s.dark) + '%' +
        (c.preset.i === PRESETS[0].i && s.body != null ? ' &middot; body <b>' + esc(s.body) + '</b>' : '') +
        '</div></td>';
    }).join('');
    const bf = before && before[r.depth]
      ? '<td class="bf"><a href="' + esc(before[r.depth]) + '"><img src="' + esc(before[r.depth]) +
        '" alt="depth ' + r.depth + ' before"></a><div class="cap">the deployed build, walked the same way</div></td>'
      : (before ? '<td class="bf missing">not captured</td>' : '');
    return '<tr>' +
      '<th class="row">' +
        '<b>depth ' + r.depth + '</b><br>' + esc(f.theme || r.load.biome) +
        (f.variant && f.variant !== 'base' ? ' &middot; ' + esc(f.variant) : '') +
        '<div class="sub">' + esc(r.load.kind) + ' &middot; wu ' + esc(f.wu) +
          ' &middot; gain ' + esc(f.gain) + '</div>' +
        '<div class="sub">' + (f.body ? swatch(f.bodyCol) + ' ' + esc(f.body) : 'no body') +
          ' &middot; sky ' + swatch('#' + (f.sky != null ? f.sky : 0).toString(16).padStart(6, '0')) +
        '</div>' +
        '<div class="sub">bands ' + esc(f.rungs) + ' &middot; ' + esc(f.instances) + ' objects' +
          ' &middot; tex ' + esc(f.texed) + '</div>' +
        '<div class="sub">near ' + swatch(f.near) + esc(f.nearLum) +
          ' &rarr; far ' + swatch(f.far) + esc(f.farLum) + '</div>' +
        '<div class="sub">horizon built ' + esc(f.anchorY) + ', shot at ' + esc(f.shift) +
          ' &rarr; ground ' + esc(hz.top) + ' (player ' + esc(hz.local) + ')</div>' +
        '<div class="sub">' + esc(f.draws) + ' draw calls</div>' +
      '</th>' + cells + bf +
    '</tr>';
  }).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Dungeon Scrolling &mdash; backdrop contact sheet</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px 28px 60px; background: #0b0c10; color: #d7dae0;
         font: 13px/1.5 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: .04em; }
  .meta { color: #8b93a3; margin-bottom: 18px; }
  .meta code { color: #cfd6e4; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #23262e; padding: 6px; vertical-align: top; }
  thead th { background: #14161c; color: #aab2c2; font-weight: 600; font-size: 12px;
             text-transform: uppercase; letter-spacing: .06em; }
  th.row { background: #101218; width: 240px; text-align: left; font-weight: 400; }
  th.row b { color: #f2f4f8; font-size: 14px; }
  th.row .sub { color: #8b93a3; font-size: 11px; }
  .cap { color: #9aa3b4; font-size: 11px; padding-top: 4px; }
  .cap b { color: #e7ebf2; }
  img { width: 100%; display: block; image-rendering: auto; border-radius: 3px; }
  .sw { display: inline-block; width: 9px; height: 9px; border: 1px solid #333; margin-right: 3px; }
  td.bf, th.bf { background: #15110f; }
  td.missing, .missing { color: #6c7382; font-style: italic; }
  .note { max-width: 980px; color: #98a1b2; margin: 18px 0 22px; }
  .note b { color: #d7dae0; }
</style></head>
<body>
<h1>Backdrop contact sheet &mdash; ${esc(meta.version)}</h1>
<div class="meta">${esc(meta.note)} &middot; <code>${esc(meta.url)}</code> &middot; window
${esc(meta.size)} &middot; captured ${esc(meta.when)}</div>
<div class="note">
  <p><b>How to read it.</b> Each cell is the play frame (<code>DS.UI3.view</code>), cropped
  and shot with the HUD off. <b>mean</b> and <b>dark</b> are read off the renderer's own
  framebuffer for that instant; on the side-on column <b>body</b> is the luminance at the
  centre of the celestial body, so a body that is a sticker reads the same as the sky and a
  body that is a light reads far above it. The row header carries the horizon's numbers:
  the line the theme was <b>built</b> around, the line it was <b>shifted</b> to for this shot,
  and the ground under the player, which the two are supposed to agree on.</p>
  <p><b>What to look for.</b> Bands should get dimmer, hazier and finer with distance, and
  the far ones should be behind the near ones at every camera position &mdash; the third
  column is the one that shows the depth, because it tilts the ground plane up. On every
  floor there should be a glowing body in the sky, and on the roofed themes the levels in
  front of it are cut away so the light is seen through the room rather than through rock.</p>
</div>
<table>
  <thead><tr><th class="row">floor</th>${head}</tr></thead>
  <tbody>${body}</tbody>
</table>
</body></html>
`;
}

/* --- main -------------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const known = ['--out', '--size', '--only', '--before', '--depths', '--presets'];
  for (const a of args) {
    if (a.startsWith('--') && known.indexOf(a) < 0) {
      console.error('shoot-backdrop: unknown flag ' + a + ' (known: ' + known.join(', ') + ')');
      return 2;
    }
  }
  const base = args.find((a) => a.startsWith('http') && a !== value(args, '--before')) ||
    'http://127.0.0.1:8123/index.html';
  let out = DEFAULT_OUT, size = { width: 1280, height: 720 }, only = null, beforeUrl = null;
  try {
    const o = value(args, '--out');
    if (o) out = path.resolve(ROOT, o);
    if (args.indexOf('--size') >= 0) size = parseSize(value(args, '--size'));
    const onlyArg = value(args, '--only');
    only = onlyArg ? onlyArg.split(',').map((s) => (s.charAt(0) === 'd' ? s : 'd' + s)) : null;
    beforeUrl = value(args, '--before');
    const dArg = value(args, '--depths');
    if (dArg) DEPTHS = parseList(dArg);
    const pArg = value(args, '--presets');
    if (pArg) {
      const want = parseList(pArg);
      PRESETS = want.map((i) => ALL_PRESETS.find((p) => p.i === i)).filter(Boolean);
      if (!PRESETS.length) throw new Error('--presets: no known rig index in ' + pArg);
    }
  } catch (err) {
    console.error('shoot-backdrop: ' + err.message);
    return 2;
  }

  fs.mkdirSync(out, { recursive: true });
  const chrome = await cdp.launch({ url: base, width: size.width, height: size.height });
  let rows;
  try {
    rows = await capture(chrome.session, out, only, size);
  } catch (err) {
    console.error('shoot-backdrop: ' + err.message);
    await chrome.close();
    return 3;
  }
  await chrome.close();

  let before = null;
  if (beforeUrl) {
    try {
      before = await captureBefore(beforeUrl, out, only);
      console.log('before: ' + Object.keys(before).length + ' frames from ' + beforeUrl);
    } catch (err) {
      console.error('before pass skipped: ' + err.message);
    }
  }

  const file = path.join(out, 'sheet.html');
  fs.writeFileSync(file, sheet(rows, before, {
    version: shippedVersion(),
    note: rows.length + ' floors x ' + PRESETS.length + ' camera positions',
    url: base, size: size.width + 'x' + size.height,
    when: new Date().toISOString().slice(0, 16).replace('T', ' ')
  }));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log('');
  console.log('sheet: ' + path.relative(ROOT, file) + ' (' + kb + ' KB, ' +
              rows.reduce((a, r) => a + r.cells.length, 0) + ' frames)');
  console.log('open it through the dev server, so the images resolve: ' +
              new URL('tools/qa/out/backdrop/sheet.html', base).href);
  return 0;
}

main().then((code) => process.exit(code));
