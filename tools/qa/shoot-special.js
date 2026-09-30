#!/usr/bin/env node
/* The rooms that are not a depth, photographed: the Temple of Hestia and the Arena of Heroes
 * (src/world/maps/special.js), their Act I counterparts for comparison, and the same floor in
 * endless at lap 0, 1, 2 and 3 to see the corruption come in.
 *
 *   node tools/qa/shoot-special.js [base-url] [--tag T]
 *
 * The sim stays paused; the camera is parked where the hero starts, or at the far end of the
 * floor for the trial's arena. Pictures go to tools/qa/out/special/<tag>/; the exit code is 1
 * on any console error. */

'use strict';

const fs = require('fs');
const path = require('path');
const { boot, shoot } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

/* [name, depth, kind, park fx, park fy] */
const SHOTS = [
  ['safe-camp-act1', 5,  'safe',   null],
  ['safe-camp-act2', 15, 'safe',   null],
  ['safe-hestia',    25, 'safe',   null],
  ['trial-act2',     14, 'trial',  [1, 1]],
  ['trial-heroes',   24, 'trial',  [1, 1]],
  ['trial-heroes-start', 24, 'trial', null],
  ['lap0-d15',       15, 'normal', null],
  ['lap1-d45',       45, 'normal', null],
  ['lap2-d75',       75, 'normal', null],
  ['lap3-d105',      105, 'normal', null]
];

const GO = `(depth, kind, park) => {
  const g = __maps.g();
  g.depth = depth;
  DS.Game.loadLevel(g, kind);
  __maps.calm();
  if (park) __maps.park(park[0], park[1]);
  __maps.draw(6);
  return { depth: depth, kind: g.levelKind, place: g.place && g.place.key, biome: g.biome && g.biome.key,
           theme: DS.R3D.activeThemeName, corruption: g.corruption, ambience: DS.Audio.ambience(),
           boss: g.trial && g.trial.bossKey || null };
}`;

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/';
  const tag = value(args, '--tag') || 'shots';
  const out = path.resolve(ROOT, 'tools/qa/out/special', tag);
  const failures = [];

  const { session, close, view } = await boot(base, { size: [1280, 720], quality: 'high' });
  try {
    const files = [];
    for (const [name, depth, kind, park] of SHOTS) {
      const info = await session.eval(`(${GO})(${depth}, '${kind}', ${JSON.stringify(park)})`);
      console.log(name + ': ' + JSON.stringify(info));
      const file = path.join(out, name + '.png');
      await shoot(session, file, view);
      files.push({ name, file });
    }
    const errors = await session.eval('window.__gfxErrors || []');
    if (errors.length) { failures.push(...errors); console.log('console errors:\n  ' + errors.join('\n  ')); }

    const cw = 420, ch = 236;
    for (let i = 0; i < files.length; i += 3) {
      const chunk = files.slice(i, i + 3);
      let html = `<body style="margin:0;background:#111;font:13px monospace;color:#ddd"><div style="display:flex;gap:2px">`;
      for (const f of chunk) html += `<div><div style="padding:2px 6px">${f.name}</div><img width="${cw}" height="${ch}" src="file:///${f.file.replace(/\\/g, '/')}"></div>`;
      html += '</div></body>';
      const page = path.join(out, `sheet-${String(i / 3 + 1)}.html`);
      fs.writeFileSync(page, html);
      const W = (cw + 2) * chunk.length, H = ch + 24;
      await session.cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
      await session.goto('file:///' + page.replace(/\\/g, '/'), 600);
      await shoot(session, path.join(out, `sheet-${String(i / 3 + 1)}.png`), { x: 0, y: 0, width: W, height: H });
      fs.unlinkSync(page);
    }
    console.log('wrote ' + out);
  } finally {
    await close();
  }
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
