#!/usr/bin/env node
/* The online ladder, end to end, against the deployed site.
 *
 *   node tools/qa/check-api.js [https://dungeonscrolling.moneyspender.net]
 *
 * tools/qa/check-board.js proves the offline half (no server, local rows). This
 * proves the half that only exists once deployed: a run played in the browser
 * is written to Cloudflare D1 by the Worker, and the next GET reads it back.
 *
 * It plays a deliberately boring run -- accept a name, start, die on depth 1 --
 * so it exercises the same submit path a real death uses. The name it uses is
 * prefixed and the caller is expected to delete those rows afterwards:
 *
 *   npx wrangler d1 execute dungeon-scrolling --remote \
 *     --command "DELETE FROM scores WHERE name = 'QALADDER'"
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'https://dungeonscrolling.moneyspender.net/';
const NAME = 'QALADDER';

let failures = 0;

function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

function letter(ch) { return [ch, 'Key' + ch, ch.charCodeAt(0)]; }

async function press(session, spec) { await session.key(...spec); await cdp.sleep(140); }

async function main() {
  const { session, close } = await cdp.launch({ width: 1440, height: 810, url: URL });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(3000);

    await session.eval(`(() => {
      window.__errs = [];
      window.addEventListener('error', (e) => __errs.push(String(e.message)));
      window.__texts = new Set();
      const orig = DS.UI3.text;
      DS.UI3.text = function (s) { window.__texts.add(String(s)); return orig.apply(this, arguments); };
      localStorage.clear();
      DS.Scenes.menu();
      return true;
    })()`);
    await cdp.sleep(500);
    check('deployed page boots the board', await session.eval('!!DS.Board'));

    // Name prompt -> loadout -> a real (if short) run.
    await press(session, ['Enter', 'Enter', 13]);
    for (const ch of NAME) await press(session, letter(ch));
    await press(session, ['Enter', 'Enter', 13]);
    check('the name is accepted on the deployed page',
          await session.eval('DS.Board.name') === NAME);

    await session.eval('DS.Scenes.play(null, { weapon: "sword" })');
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await session.eval('!!(DS.currentGame && DS.currentGame.p)')) break;
      await cdp.sleep(200);
    }
    await cdp.sleep(800);

    // Dying is what submits. The run is at depth 1, which is all the Worker
    // needs: one row, one depth, one name.
    await session.eval('window.__texts.clear(); DS.Scenes.gameOver(DS.currentGame, false)');
    await cdp.sleep(2500);

    const online = await session.eval('DS.Board.online === true');
    check('the deployed ladder answered', online);
    check('the death screen says it is online',
          await session.eval('window.__texts.has("ONLINE")'));
    check('and lists the run just played',
          await session.eval('window.__texts.has(' + JSON.stringify(NAME) + ')'));
    const rows = await session.eval('DS.Board.rows().length');
    check('the ladder came back with rows on it', rows >= 1, 'rows: ' + rows);

    await session.shoot('assets/preview/board-online.png');

    const errs = await session.eval('window.__errs');
    check('no page errors', !errs || errs.length === 0, JSON.stringify(errs || []));
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0 ? 'PASS: a browser run reached the online ladder'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('check-api: ' + err.message); process.exit(2); });
