#!/usr/bin/env node
/* The name prompt and the ladder, driven through the real page.
 *
 *   node tools/qa/check-board.js [base-url]
 *
 * Three questions a player would ask, each answered by the game's own code
 * running in a browser rather than by reading it:
 *
 *   1. does START RUN ask for a name, does typing reach the field, and does a
 *      too-short name get refused instead of silently accepted;
 *   2. is the accepted name then drawn over the hero's head, and does it
 *      survive into a second run (it lives in localStorage, not in a scene);
 *   3. when the ladder cannot be reached -- which is exactly the case on this
 *      local dev server, whose Python host answers no /api routes -- does the
 *      death screen still show the run, and does it say where the rows came
 *      from.
 *
 * The online path is checked against the deployed Worker by tools/qa/check-api.js,
 * because a local server has nothing to talk to.
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';

const KEY = {
  enter: ['Enter', 'Enter', 13],
  back: ['Escape', 'Escape', 27],
  space: [' ', 'Space', 32],
  bs: ['Backspace', 'Backspace', 8]
};

function letter(ch) {
  return [ch, 'Key' + ch, ch.charCodeAt(0)];
}

function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

let failures = 0;

async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(150);
  }
  return false;
}

async function typeWord(session, word) {
  for (const ch of word) {
    await session.key(...letter(ch));
    await cdp.sleep(60);
  }
}

async function press(session, name) {
  await session.key(...KEY[name]);
  await cdp.sleep(120);
}

async function main() {
  const { session, close } = await cdp.launch({ width: 1600, height: 900, url: URL });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2600);

    // A page-level error trap, so the answers below are not read off a screen
    // that is quietly throwing behind them.
    await session.eval(`(() => {
      window.__errs = [];
      window.addEventListener('error', (e) => __errs.push(String(e.message)));
      window.addEventListener('unhandledrejection',
                              (e) => __errs.push('reject: ' + String(e.reason)));
      // Every string the screen layer draws this run, so a claim like "the name
      // is over the hero's head" can be observed instead of trusted.
      window.__texts = new Set();
      const orig = DS.UI3.text;
      DS.UI3.text = function (str) { window.__texts.add(String(str)); return orig.apply(this, arguments); };
      return true;
    })()`);

    check('screen layer came up', await session.eval('!!(DS.UI3 && DS.UI3.ready)'));
    check('board module loaded', await session.eval('!!DS.Board'));

    // A fresh browser must not already have a name, or nothing below is a test.
    await session.eval('localStorage.removeItem("ds_name"), DS.Scenes.menu()');
    await cdp.sleep(400);
    check('starts with no name', await session.eval('DS.Board.hasName() === false'));

    // 1. START RUN -> the prompt ------------------------------------------------
    await press(session, 'enter');
    await cdp.sleep(300);

    // Which page the menu is on is private to createMenu, so it is observed the
    // way a player observes it: type, press Enter, and see what happens next.
    await typeWord(session, 'A');
    await press(session, 'enter');
    await cdp.sleep(200);
    check('a one-character name is refused',
          await session.eval('DS.Board.hasName() === false'),
          'no name stored yet');

    await typeWord(session, 'DVENTURER');
    await press(session, 'enter');
    await cdp.sleep(300);
    check('the accepted name is stored',
          await session.eval('DS.Board.name') === 'ADVENTURER',
          await session.eval('JSON.stringify(DS.Board.name)'));
    check('and it is written down for the next run',
          await session.eval('localStorage.getItem("ds_name")') === '"ADVENTURER"');

    // 2. Once the prompt closes, letters belong to the game again -------------
    // Asked from inside the page, in the same tick as the game's own keydown
    // handler, so the answer cannot be lost to a frame boundary.
    const sawLeft = session.eval(`new Promise((resolve) => {
      window.addEventListener('keydown', function once(e) {
        if (e.code !== 'KeyA') return;
        window.removeEventListener('keydown', once, true);
        resolve(DS.Input.justPressed('left'));
      }, true);
    })`);
    await cdp.sleep(150);
    await session.key(...letter('A'));
    check('letters reach the game again after the prompt', await sawLeft,
          'A is the left action');

    // 3. The name over the hero's head -----------------------------------------
    await session.eval('DS.Scenes.play(null, { weapon: "sword" })');
    await waitFor(session, 'DS.currentGame && DS.currentGame.p', 20000);
    await cdp.sleep(900);
    const seen = await session.eval('window.__texts.has("ADVENTURER")');
    check('the name is drawn over the hero', seen,
          seen ? '' : 'drew: ' + JSON.stringify(await session.eval(
            'Array.from(window.__texts).slice(-14)'))+
            ' board=' + JSON.stringify(await session.eval('DS.Board.name')));

    // 4. The ladder with no server ---------------------------------------------
    const res = await session.eval(`DS.Board.submit(
      { depth: 4, kills: 9, coins: 20, frames: 900, cleared: false })
      .then((r) => ({ rows: r.rows.length, rank: r.rank,
                      offline: !!r.offline, name: r.rows[0] && r.rows[0].name,
                      depth: r.rows[0] && r.rows[0].depth }))`);
    check('a run that cannot be sent is still recorded', res && res.rows >= 1,
          JSON.stringify(res));
    check('the offline ladder is the player\'s own run',
          res && res.name === 'ADVENTURER' && res.depth === 4);
    check('and it is labelled as local, not online',
          await session.eval('DS.Board.online === false'));

    // 5. The death screen shows it ---------------------------------------------
    await session.eval('window.__texts.clear(); DS.Scenes.gameOver(DS.currentGame, false)');
    await cdp.sleep(1200);
    check('the death screen draws a ladder', await session.eval('window.__texts.has("LADDER")'));
    check('with the run on it',
          await session.eval('window.__texts.has("ADVENTURER")'),
          'the player\'s own row');
    check('and says where the rows came from',
          await session.eval('window.__texts.has("THIS DEVICE")'));

    const errs = await session.eval('window.__errs');
    check('no page errors', !errs || errs.length === 0, JSON.stringify(errs || []));

    await session.shoot('assets/preview/board.png');
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0 ? 'PASS: name, label and offline ladder all behave'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('check-board: ' + err.message); process.exit(2); });
