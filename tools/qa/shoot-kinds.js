#!/usr/bin/env node
/* Look at a band kind on its own.
 *
 *   node tools/qa/shoot-kinds.js [base-url] [--kinds wall,celltier] [--out DIR]
 *
 * A kind written in src/core/backdrop/kinds-*.js is judged here, before any map
 * uses it: the page registers a throw-away theme whose recipe is that kind
 * alone (a near, a middle and a far copy where it is per-slot), pins it as the
 * theme (DS.__forceTheme), loads a floor and photographs it from the ground and
 * from a little higher. What comes out is <out>/<kind>.png, one row per kind.
 *
 * The arguments below are what each kind is asked for; a new kind is a new row.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { boot, shoot } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));

const GREY = 0x6a707c;
const KINDS = {
  wall:       [{ kind: 'wall', d: 7.5, col: GREY, cell: 5, openings: { every: 40, first: 20, w: 14, h: 9, y0: 4, shape: 'window', bars: true } }],
  wallarch:   [{ kind: 'wall', d: 7.5, col: GREY, cell: 5, openings: { every: 56, first: 28, w: 24, h: 16, y0: 0, shape: 'arch' } }],
  celltier:   [{ kind: 'celltier', sp: 10, d: 7.5, col: GREY }],
  catwalk:    [{ kind: 'catwalk', sp: 18, d: 7.5, col: GREY }],
  hangcage:   [{ kind: 'hangcage', sp: 8, d: 4.5, col: GREY, top: 12 }],
  watchtower: [{ kind: 'watchtower', solo: true, d: 19, col: GREY, scale: 1 }],
  statue:     [{ kind: 'statue', sp: 14, d: 7.5, col: GREY }],
  biggate:    [{ kind: 'biggate', solo: true, d: 12, col: GREY, scale: 1 }],
  chandelier: [{ kind: 'chandelier', sp: 9, d: 7.5, col: GREY, top: 12 }],
  lighthouse: [{ kind: 'lighthouse', sp: 30, d: 30, col: GREY }],
  stilthouse: [{ kind: 'stilthouse', sp: 8, d: 7.5, col: GREY }],
  mushrooms:  [{ kind: 'mushrooms', sp: 5, d: 7.5, col: GREY }],
  ropebridge: [{ kind: 'ropebridge', sp: 22, d: 7.5, col: GREY }],
  cloudsea:   [{ kind: 'cloudsea', sp: 6, d: 19, col: 0xcfd6e0, cap: 0xffffff, y0: 3, y1: 6 }]
};

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i < 0 || !process.argv[i + 1] ? dflt : process.argv[i + 1];
}

async function main() {
  const base = process.argv.slice(2).find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/';
  const out = path.resolve(ROOT, arg('--out', 'tools/qa/out/kinds'));
  const names = arg('--kinds', Object.keys(KINDS).join(',')).split(',');
  const { session, close, view } = await boot(base, {});
  try {
    for (const name of names) {
      const layers = KINDS[name];
      if (!layers) { console.log('unknown kind ' + name); continue; }
      const theme = '__k_' + name;
      await session.eval(`(() => {
        DS.R3D.registerTheme('${theme}', { fog: 0x202830, ambient: 0x6a7288, hemiSky: 0x9fb0d0, hemiGround: 0x2a2e38, dir: 0xfff0cc, dirI: 0.6 });
        DS.Backdrop.registerTheme('${theme}', { curve: DS.Backdrop.curve('shore'), hero: DS.Backdrop.hero('shore'),
          recipe: { tex: 'granite', skyGlow: 0.75, haze: 0.4, ground: 0x2a2f38, layers: ${JSON.stringify(layers)} } });
        DS.__forceTheme = '${theme}';
        return true; })()`);
      await session.eval('__maps.go(1)');
      await session.eval('__maps.step(20)');
      await session.eval('__maps.park(0.5, 1)');
      await session.eval('__maps.draw(2)');
      await shoot(session, path.join(out, name + '-low.png'), view);
      await session.eval('__maps.park(0.5, 0.5)');
      await session.eval('__maps.draw(2)');
      await shoot(session, path.join(out, name + '-mid.png'), view);
      console.log('shot ' + name);
    }
    const errors = await session.eval('window.__gfxErrors || []');
    if (errors.length) { console.log('console errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }

    // One sheet of everything shot: `low` (from the ground) beside `mid`.
    const cell = 480, ch = Math.round(cell * view.height / view.width), cols = 4;
    const shown = names.filter((n) => KINDS[n]);
    const rows = Math.ceil(shown.length / 2);
    let html = '<body style="margin:0;background:#111;font:12px monospace;color:#ddd">' +
      '<div style="display:grid;grid-template-columns:repeat(' + cols + ',' + cell + 'px);gap:2px">';
    for (const n of shown) {
      for (const v of ['low', 'mid']) {
        const f = path.join(out, n + '-' + v + '.png').replace(/\\/g, '/');
        html += '<div style="position:relative"><img width="' + cell + '" height="' + ch + '" src="file:///' + f + '">' +
                '<span style="position:absolute;left:4px;top:2px;background:#000a;padding:0 4px">' + n + ' ' + v + '</span></div>';
      }
    }
    html += '</div></body>';
    const page = path.join(out, 'sheet.html');
    fs.writeFileSync(page, html);
    const W = cols * cell + (cols - 1) * 2, Hh = rows * (ch + 2);
    await session.cmd('Emulation.setDeviceMetricsOverride', { width: W, height: Hh, deviceScaleFactor: 1, mobile: false });
    await session.goto('file:///' + page.replace(/\\/g, '/'), 700);
    await shoot(session, path.join(out, 'sheet.png'), { x: 0, y: 0, width: W, height: Hh });
    fs.unlinkSync(page);
    console.log('sheet ' + path.join(out, 'sheet.png'));
  } finally {
    await close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
