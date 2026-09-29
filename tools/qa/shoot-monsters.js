#!/usr/bin/env node
/* A contact sheet of the new bestiary: every monster (or the ones named) placed
 * next to the hero on the floor it lives on, photographed at rest, at the peak
 * of its wind-up and in the strike, so a model that does not read, a pose that
 * does not move or a tell that is missing shows up before a player finds it.
 *
 *   node tools/qa/shoot-monsters.js [base-url] [--tag T] [--kinds crab,goat]
 *                                   [--per-sheet 4] [--quality high]
 *
 * The sim stays paused: the states are forced on the entity (attackState,
 * shieldUp, hidden, curled, cloud ...) and only the draw runs, which is exactly
 * what the 3D pose code reads. Sheets go to tools/qa/out/monsters/<tag>/, one
 * per few kinds (sheet-01.png ...); exits non-zero on any console error. */

'use strict';

const fs = require('fs');
const path = require('path');
const { boot, shoot } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));
const STATES = ['idle', 'wind', 'strike'];

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

/* What each kind needs set for its three states, on top of attackState. */
const FORCE = {
  crab:          { idle: { shieldUp: true }, wind: { shieldUp: false }, strike: { shieldUp: false } },
  drownedknight: { idle: { shieldUp: true }, wind: { shieldUp: false }, strike: { shieldUp: false } },
  crystalbeetle: { strike: { curled: true } },
  jailer:        { wind: { mode: 'chain' }, strike: { mode: 'chain' } },
  sporeshroom:   { strike: { cloud: { x: 0, y: 0, r: 32, t: 100 } } },
  bogman:        { idle: { buried: true, hidden: true }, wind: { buried: true, hidden: true }, strike: { buried: false, hidden: false } },
  shade:         { idle: { hidden: false }, wind: { hidden: true }, strike: { hidden: false } },
  automaton:     { idle: { heat: 10 }, wind: { heat: 70 }, strike: { heat: 100, venting: 40 } },
  hoplite:       { idle: { shieldUp: true }, wind: { shieldUp: false }, strike: { shieldUp: false } },
  glowworm:      { strike: { dropped: 30 } },
  eel:           { strike: { dropped: 40 } }
};

/* Everything on the page that draws a monster is the game's own: this only
   builds the scene and forces the fields. */
const SHOOT = `(kind, depth, state, force) => {
  const g = __maps.g(), p = g.player, E = DS.Enemies, T = E.TYPES[kind];
  if (g.depth !== depth) { __maps.go(depth); __maps.step(24); }
  __maps.calm();
  const flying = !!T.flying && !T.hangs;
  const e = E.create(g, p.x + 44, p.y - (flying ? 24 : 4), kind, 'normal');
  g.enemies.length = 0; g.enemies.push(e);
  e.facing = -1; p.facing = 1; e.frame = 30;
  e.hidden = false; e.invuln = 0;
  if (state === 'wind') { e.attackState = 'wind'; e.attackTimer = Math.round(T.wind * 0.45); }
  if (state === 'strike') { e.attackState = 'strike'; e.attackTimer = Math.round(T.strike * 0.5); }
  if (state === 'idle') { e.attackState = 'none'; e.attackTimer = 0; }
  Object.assign(e, force || {});
  if (e.cloud) { e.cloud.x = e.x + e.w / 2; e.cloud.y = e.y + e.h * 0.6; }
  if (e.hangs || T.hangs) { e.hanging = true; }
  __maps.draw(4);
  const c = DS.R3D.worldToScreen(e.x + e.w / 2, e.y + e.h / 2, {});
  const v = DS.UI3.view;
  return { x: v.x + c.x * v.w / DS.C.W, y: v.y + c.y * v.h / DS.C.H, k: c.k, w: e.w, h: e.h,
           hp: e.maxHp, minDepth: T.minDepth };
}`;

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/';
  const tag = value(args, '--tag') || 'shots';
  const perSheet = parseInt(value(args, '--per-sheet') || '4', 10);
  const quality = value(args, '--quality') || 'high';
  const out = path.resolve(ROOT, 'tools/qa/out/monsters', tag);
  const failures = [];

  const { session, close, view } = await boot(base, { size: [1280, 720], quality: quality });
  try {
    const all = await session.eval(
      `Object.keys(DS.Enemies.TYPES).filter((k) => DS.Enemies.TYPES[k].behavior && DS.Voxel.has(k) && ` +
      `!DS.Enemies.TYPES[k].noSpawn && DS.Enemies.TYPES[k].minDepth)`);
    const named = value(args, '--kinds');
    const wanted = named ? named.split(',') : await session.eval(
      `(${JSON.stringify(all)}).filter((k) => !${JSON.stringify(['icewisp', 'harpy', 'cultist', 'magmacrab', 'spider', 'spitter', 'bomber', 'shielder', 'wraith', 'necromancer', 'golem'])}.includes(k))`);
    const kinds = wanted.filter((k) => all.includes(k));
    console.log('kinds: ' + kinds.join(' '));

    const cw = 300, ch = 240, bar = 22;
    const shots = [];
    for (const kind of kinds) {
      const depth = Math.max(1, await session.eval(`DS.Enemies.TYPES['${kind}'].minDepth`));
      const row = [];
      for (const state of STATES) {
        const force = (FORCE[kind] || {})[state] || null;
        const at = await session.eval(`(${SHOOT})('${kind}', ${depth}, '${state}', ${JSON.stringify(force)})`);
        const file = path.join(out, `${kind}-${state}.png`);
        // `at` is already in page pixels (the view's own offset is in it).
        const x = Math.max(0, Math.min(view.x + view.width - cw, Math.round(at.x - cw / 2)));
        const y = Math.max(0, Math.min(view.y + view.height - ch, Math.round(at.y - ch * 0.62)));
        await shoot(session, file, { x: x, y: y, width: cw, height: ch });
        row.push(file);
      }
      shots.push({ kind, depth, row });
    }
    const errors = await session.eval('window.__gfxErrors || []');
    if (errors.length) { failures.push(...errors); console.log('console errors:\n  ' + errors.join('\n  ')); }

    // Sheets: an HTML page of <img> tags, photographed by the same browser.
    let n = 0;
    for (let i = 0; i < shots.length; i += perSheet) {
      const chunk = shots.slice(i, i + perSheet);
      let html = `<body style="margin:0;background:#111;font:13px monospace;color:#ddd">` +
        `<div style="display:grid;grid-template-columns:110px repeat(3,${cw}px);gap:2px">`;
      for (const s of chunk) {
        html += `<div style="height:${ch}px;line-height:${ch}px;padding-left:6px">${s.kind}<br>d${s.depth}</div>`;
        for (const f of s.row) html += `<img width="${cw}" height="${ch}" src="file:///${f.replace(/\\/g, '/')}">`;
      }
      html += '</div></body>';
      const page = path.join(out, `sheet-${String(++n).padStart(2, '0')}.html`);
      fs.writeFileSync(page, html);
      await session.cmd('Emulation.setDeviceMetricsOverride', {
        width: 110 + cw * 3 + 8, height: (ch + 2) * chunk.length, deviceScaleFactor: 1, mobile: false });
      await session.goto('file:///' + page.replace(/\\/g, '/'), 700);
      await shoot(session, page.replace(/\.html$/, '.png'),
        { x: 0, y: 0, width: 110 + cw * 3 + 8, height: (ch + 2) * chunk.length });
      fs.unlinkSync(page);
    }
    console.log(`wrote ${n} sheet(s) to ${out}`);
  } finally {
    await close();
  }
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
