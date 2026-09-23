#!/usr/bin/env node
/* Capture the game's screens for the documentation, without a human.
 *
 *   node tools/docs/shoot_game.js [base-url] [--only name,name]
 *
 * The game is played the way the player plays it: real key presses go through
 * the browser's input pipeline, and only the things a player cannot do instantly
 * (jump to depth 9, open a specific modal) are reached through the debug handles
 * the game already exposes (`DS.currentGame`, `DS.Game.loadLevel`, `DS.Scenes`).
 *
 * Screens land in docs/img/<name>.png and are referenced by docs/*.md, so a
 * missing file shows up in the document as "SCREENSHOT PENDING" rather than as a
 * silently broken page.
 */

'use strict';

const path = require('path');
const cdp = require('./cdp');

const ROOT = path.dirname(path.dirname(__dirname));
const IMG = path.join(ROOT, 'docs', 'img');

const ENTER = ['Enter', 'Enter', 13];
const UP = ['ArrowUp', 'ArrowUp', 38];
const DOWN = ['ArrowDown', 'ArrowDown', 40];
const RIGHT = ['ArrowRight', 'ArrowRight', 39];
const ESC = ['Escape', 'Escape', 27];
const TAB = ['Tab', 'Tab', 9];
const KEYP = ['p', 'KeyP', 80];
const KEYJ = ['j', 'KeyJ', 74];
const KEYX = ['x', 'KeyX', 88];

/* Poll a page expression until it is truthy. The cutscene is 396 frames long,
   so the run simply does not exist yet when the capture script starts poking at
   it -- waiting on the state itself beats guessing a delay. */
async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(250);
  }
  throw new Error('timed out waiting for: ' + expr);
}

/* Jump the live run to a floor. kindForDepth() is what the game itself uses;
   depth 10 is the boss throne and 5 is the safe room. */
const gotoDepth = (depth, kind) =>
  `(() => {
     const g = DS.currentGame;
     g.depth = ${depth};
     DS.Game.loadLevel(g, '${kind}');
     return { depth: g.depth, kind: g.levelKind, biome: g.biome.name, enemies: g.enemies.length };
   })()`;

const steps = [
  { name: 'menu', caption: 'Main menu: four entries, the camp, and the record line at the top',
    settle: 1400 },
  { name: 'menu-help', caption: 'How to play', keys: [DOWN, ENTER], settle: 700 },
  /* The menu keeps its cursor where it was, so leaving HELP (index 1) needs one
     more DOWN to reach RECORDS, and leaving RECORDS (index 2) needs two UPs to
     get back to START RUN. */
  { name: 'menu-records', caption: 'Records, read from localStorage',
    keys: [ESC, DOWN, ENTER], settle: 700 },
  { name: 'loadout', caption: 'Weapon select: six archetypes, all common, no affixes',
    keys: [ESC, UP, UP, ENTER], settle: 700 },
  { name: 'intro', caption: 'The opening cutscene, four phases in 396 frames',
    keys: [ENTER], settle: 1100, thenStartRun: true },
  { name: 'hud-floor1', caption: 'Depth 1, The Shore: the HUD in its four clusters',
    waitFor: '!!(DS.currentGame && DS.currentGame.map && DS.currentGame.player)',
    settle: 1200 },
  { name: 'floor-puzzle', caption: 'Depth 4, The Torch Hall: the puzzle floor',
    eval: gotoDepth(4, 'normal'), settle: 1200 },
  { name: 'floor-swamp', caption: 'Depth 6, The Rot Swamp', eval: gotoDepth(6, 'normal'), settle: 1200 },
  { name: 'floor-mountain', caption: 'Depth 7, The Climb: vertical terrain and a mid-run boss',
    eval: gotoDepth(7, 'mountain'), settle: 1200 },
  { name: 'floor-flooded', caption: 'Depth 8, The Sunk Halls: deep water and piranha',
    eval: gotoDepth(8, 'flooded'), settle: 1200 },
  { name: 'floor-volcanic', caption: 'Depth 9, The Ash Reaches', eval: gotoDepth(9, 'normal'), settle: 1200 },
  { name: 'floor-throne', caption: 'Depth 10, The Throne: Slime King', eval: gotoDepth(10, 'boss'), settle: 1400 },
  { name: 'combat', caption: 'A swing, a skill and the ultimate on a live floor',
    eval: gotoDepth(3, 'normal'), keys: [KEYJ, KEYJ, KEYX], settle: 900 },
  { name: 'bag', caption: 'The bag: two weapon slots, three armor slots and the 2D doll window',
    keys: [TAB], settle: 900 },
  { name: 'profile-character', caption: 'Profile, tab 1: character and worn armor',
    keys: [TAB, KEYP], settle: 900 },
  { name: 'profile-stats', caption: 'Profile, tab 2: stats', keys: [RIGHT], settle: 700 },
  { name: 'profile-run', caption: 'Profile, tab 3: the current run', keys: [RIGHT], settle: 700 },
  { name: 'gameover', caption: 'Death: the run summary, written to localStorage once',
    keys: [ESC],
    eval: `(() => { const g = DS.currentGame; g.player.hp = 0; g.player.dead = true;
             g.deathTimer = 200; return 'dying'; })()`,
    settle: 2600 },
  { name: 'cleared', caption: 'Cleared: the final screen after the King falls',
    eval: `(() => { const g = DS.currentGame; g.won = true; g.finished = true;
             DS.Scenes.gameOver(g, true); return 'cleared'; })()`, settle: 1400 }
];

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8123/index.html';
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;
  const list = only ? steps.filter((s) => only.indexOf(s.name) >= 0) : steps;

  let chrome;
  try {
    chrome = await cdp.launch({ url: base, width: 1600, height: 900 });
  } catch (err) {
    console.error('shoot: ' + err.message);
    return 2;
  }

  const { session } = chrome;
  const report = [];
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2600);                       // boot + first frames

    const boot = await session.eval('({ ready: !!(DS.R3D && DS.R3D.isEnabled), scene: DS.currentScene ? "yes" : "no" })');
    console.log('boot: ' + JSON.stringify(boot));

    for (const step of list) {
      if (step.waitFor) await waitFor(session, step.waitFor, 20000);
      if (step.eval) {
        const out = await session.eval(step.eval);
        cdp.log(step.name + ' eval -> ' + JSON.stringify(out));
      }
      for (const k of (step.keys || [])) {
        await session.key(k[0], k[1], k[2]);
        await cdp.sleep(160);
      }
      await cdp.sleep(step.settle || 800);
      const file = path.join(IMG, step.name + '.png');
      const bytes = await session.shoot(file);
      report.push({ name: step.name, kb: Math.round(bytes / 1024), caption: step.caption });
      console.log('shot ' + step.name + '.png (' + Math.round(bytes / 1024) + ' KB)');

      // The intro plays before the first floor exists at all. Start the run
      // through the game's own entry point rather than guessing the cutscene's
      // skip key, so the rest of the capture cannot depend on its timing.
      if (step.thenStartRun) {
        await session.eval('(DS.Scenes.play(20260923, { weapon: \'sword\' }), "started")');
        await waitFor(session, 'DS.currentGame && DS.currentGame.player', 20000);
      }
    }

    const errors = await session.eval('(window.__dsErrors || []).length');
    console.log('page errors captured: ' + errors);
  } catch (err) {
    console.error('shoot-failed: ' + err.message);
    await chrome.close();
    return 3;
  }

  await chrome.close();
  console.log('\ncaptions for the document:');
  for (const r of report) console.log('  ' + r.name + ': ' + r.caption);
  return 0;
}

main().then((code) => process.exit(code));
