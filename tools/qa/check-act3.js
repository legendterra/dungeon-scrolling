#!/usr/bin/env node
/* Act III as a run would meet it, through the game's own scene loop with the real HUD:
 * every floor from the labyrinth to the throne of Zeus, and the rooms that are not a
 * depth (the Temple of Hestia, the Arena of Heroes), each loaded the way the stairs load
 * it and stepped for a few seconds with the hero standing still.
 *
 *   node tools/qa/check-act3.js [base-url]
 *
 * For each floor it asks: did it load and run without a console error; what does the HUD say
 * the place is called; is the ambience the one the map names; is the boss the one the plan
 * says; is the corruption right for the lap. Exit code 1 on a failed check or a console
 * error. */

'use strict';

const cdp = require('../docs/cdp');
const { HOOK, waitFor } = require('./lib/map-page');

const failures = [];
function check(label, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures.push(label);
}

const DRIVER = `(() => {
  const U = window.__a3 = {};
  U.g = () => DS.currentGame;
  U.step = (n) => { const g = U.g();
    for (let i = 0; i < n; i++) {
      const p = g.player; p.dead = false; p.hp = Math.max(p.hp || 0, 50); g.deathTimer = 0;
      DS.Input.poll(); if (DS.Ptr) DS.Ptr.beginFrame();
      DS.currentScene.update(); DS.Input.endFrame();
      if (i % 3 === 0) { DS.currentScene.draw(); DS.R.present(i / 60); if (DS.HUI && DS.HUI.sync) DS.HUI.sync(); }
    } };
  U.go = (depth, kind) => { const g = U.g(); g.depth = depth; DS.Game.loadLevel(g, kind); U.step(180);
    const t = document.querySelector('.hud-loc .title'), a = document.querySelector('.hud-loc .act'), d = document.querySelector('.hud-loc .depth');
    return { depth: depth, kind: g.levelKind, place: g.place && g.place.key, biome: g.biome && g.biome.key,
             theme: DS.R3D.activeThemeName, ambience: DS.Audio.ambience(), corruption: g.corruption,
             title: t && t.textContent, act: a && a.textContent, where: d && d.textContent,
             boss: (g.boss && g.boss.bossKey) || (g.bossTrigger && g.bossTrigger.key) || (g.trial && g.trial.bossKey) || null,
             enemies: g.enemies.length, map: [g.map.w, g.map.h] }; };
  DS.__paused = true;
  return true; })()`;

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.Scenes', 30000);
    await session.eval("localStorage.setItem('ds_name', 'ACT3QA')");
    await session.eval('DS.Scenes.play(3030, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.player', 30000);
    await cdp.sleep(600);
    await session.eval(DRIVER);

    const cases = [
      [21, 'normal', { boss: 'minotaur', place: null, ambience: 'aegean', title: /Labyrinth/i }],
      [22, 'normal', { boss: null, place: null, ambience: 'olympus', title: /Olympus/i }],
      [23, 'normal', { boss: 'medusa', place: null, ambience: 'garden', title: /Gorgon/i }],
      [24, 'normal', { boss: null, place: null, ambience: 'tartarus', title: /Tartarus/i }],
      [24, 'trial',  { boss: 'minotaur', place: 't3_heroes', ambience: 'aegean', title: /Arena of Heroes/i }],
      [25, 'safe',   { boss: null, place: 's3_hestia', ambience: 'hearth', title: /Temple of Hestia/i }],
      [25, 'boss',   { boss: 'hades', place: null, ambience: 'styx', title: /Hades/i }],
      [26, 'normal', { boss: null, place: null, ambience: 'storm', title: /Storm/i }],
      [27, 'normal', { boss: 'talos', place: null, ambience: 'forge', title: /Forge/i }],
      [28, 'normal', { boss: null, place: null, ambience: 'golden', title: /Golden/i }],
      [29, 'normal', { boss: null, place: null, ambience: 'golden', title: /Apollo/i }],
      [30, 'safe',   { boss: null, place: 's3_hestia', ambience: 'hearth', title: /Temple of Hestia/i }],
      [30, 'boss',   { boss: 'zeus', place: null, ambience: 'zeus', title: /Zeus/i }],
      // The first two acts keep the room of the depth in front of them.
      [5,  'safe',   { boss: null, place: null, ambience: null, title: /Safe Room/i }],
      [14, 'trial',  { boss: 'arbiter', place: null, ambience: null, title: /Trial/i }],
      // Endless: the map again, the corruption up, the rooms of the act it echoes.
      [51, 'normal', { boss: 'minotaur', place: null, ambience: 'aegean', title: /Labyrinth/i, corruption: 0.3 }],
      [55, 'safe',   { boss: null, place: 's3_hestia', ambience: 'hearth', title: /Temple of Hestia/i, corruption: 0.3 }],
      [81, 'normal', { boss: 'minotaur', place: null, ambience: 'aegean', title: /Labyrinth/i, corruption: 0.6 }],
      [35, 'boss',   { boss: 'lich', place: null, ambience: 'hall', title: null, corruption: 0.3 }],
      [40, 'boss',   { boss: 'magma', place: null, ambience: 'wet', title: null, corruption: 0.3 }]
    ];

    for (const [depth, kind, want] of cases) {
      const tag = 'depth ' + depth + ' ' + kind;
      const r = await session.eval(`__a3.go(${depth}, '${kind}')`);
      console.log('     ' + JSON.stringify(r));
      if (want.boss !== undefined) check(tag + ': boss ' + want.boss, r.boss === want.boss, String(r.boss));
      check(tag + ': room ' + (want.place || 'of the depth'), (r.place || null) === want.place, String(r.place));
      check(tag + ': ambience ' + want.ambience, (r.ambience || null) === want.ambience, String(r.ambience));
      if (want.title) check(tag + ': HUD says ' + want.title, want.title.test(r.title || ''), String(r.title));
      check(tag + ': corruption ' + (want.corruption || 0), Math.abs((r.corruption || 0) - (want.corruption || 0)) < 1e-9, String(r.corruption));
    }

    const errs = await session.eval('window.__gfxErrors || []');
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await close();
  }
  if (failures.length) { console.log('\n' + failures.length + ' check(s) failed'); process.exit(1); }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
