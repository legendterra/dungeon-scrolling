#!/usr/bin/env node
/* The paged leaderboard, end to end in a real browser, with the Worker faked so
 * the page logic is checked without a database.
 *
 *   node tools/qa/check-leaderboard.js [base-url] [--out DIR]
 *
 * 27 runs behind a fake /api/board: page one shows ranks 1-10 and the player's
 * own standing pinned below (rank 14); the arrows and the buttons page through;
 * FIND ME jumps to the page that holds the player; the last page is short and
 * NEXT locks; and with the network gone the screen says so and shows the local
 * runs instead. Exit code 1 when a check fails or the page logs an error. */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');
const { HOOK, waitFor, shoot, VIEW } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));
const failures = [];
function check(label, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures.push(label);
}
function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

/* The fake Worker: 27 runs, depth 30 down to 4, and the player's name at rank 14. */
const FAKE = `(() => {
  const runs = [];
  for (let i = 0; i < 27; i++) runs.push({ name: i === 13 ? 'ADA' : 'RUNNER' + (i + 1), depth: 30 - i, kills: 400 - i * 7, coins: 10, frames: 3600 * (30 - i), cleared: i < 2, at: '2026-09-29' });
  window.__net = true;
  const real = window.fetch;
  window.fetch = function (url) {
    if (!/\\/api\\/board/.test(String(url))) return real.apply(this, arguments);
    if (!window.__net) return Promise.reject(new Error('offline'));
    const q = new URL(String(url), location.href).searchParams;
    const size = Math.max(5, Math.min(25, +q.get('size') || 10));
    const pages = Math.ceil(runs.length / size);
    const page = Math.max(0, Math.min(pages - 1, +q.get('page') || 0));
    const rows = runs.slice(page * size, page * size + size).map((r, i) => Object.assign({ rank: page * size + i + 1 }, r));
    const mine = q.get('name') && runs.findIndex((r) => r.name.toLowerCase() === q.get('name').toLowerCase());
    const me = mine >= 0 && mine !== false ? Object.assign({ rank: mine + 1 }, runs[mine]) : null;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, page, pages, size, total: runs.length, rows, me }) });
  };
})()`;

async function key(session, code) {
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(90);
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(120);
}

const rows = (s) => s.eval('Array.from(document.querySelectorAll("[data-screen=board] .hl-list .hl-row")).map((n) => n.querySelector(".hl-rank").textContent + " " + n.querySelector(".hl-name").textContent)');
const pageText = (s) => s.eval('(document.querySelector("[data-screen=board] .hl-page") || {}).textContent');
const you = (s) => s.eval('(document.querySelector("[data-screen=board] .hl-you .hl-row") || {}).textContent');

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/leaderboard');
  fs.mkdirSync(out, { recursive: true });

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene', 30000);
    const view = await session.eval(VIEW);
    await session.eval(FAKE);
    await session.eval('DS.Board.setName("Ada")');
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden]) .hm-item")', 15000);
    const items = await session.eval('Array.from(document.querySelectorAll("[data-screen=menu] .hm-item-label")).map((n) => n.textContent)');
    check('the title has a SCOREBOARD entry', items.includes('SCOREBOARD'), items.join(' | '));

    const openBoard = async () => {
      await session.eval('Array.from(document.querySelectorAll("[data-screen=menu] .hm-item")).find((n) => /SCOREBOARD/.test(n.textContent)).click()');
      await waitFor(session, 'document.querySelector("[data-screen=board]:not([hidden]) .hl-page")', 8000);
      await cdp.sleep(500);
    };
    await openBoard();
    let list = await rows(session);
    check('page one holds ten rows, ranked 1 to 10', list.length === 10 && list[0].startsWith('#1 ') && list[9].startsWith('#10 '), list.length + ' rows');
    check('and says PAGE 1 / 3', /PAGE 1 \/ 3/.test(await pageText(session)), await pageText(session));
    check('the player stands pinned below, at rank 14', /YOU.*#14.*ADA/i.test(await you(session)), await you(session));
    await shoot(session, path.join(out, '1-page1.png'), view);

    await key(session, 'ArrowRight');
    list = await rows(session);
    check('the right arrow pages forward', /PAGE 2 \/ 3/.test(await pageText(session)) && list[0].startsWith('#11 '), list[0]);
    check('the player is highlighted on the page that holds them', await session.eval('!!document.querySelector("[data-screen=board] .hl-list .hl-row.is-mine")'));
    await shoot(session, path.join(out, '2-page2.png'), view);

    await key(session, 'ArrowRight');
    list = await rows(session);
    check('the last page is short', list.length === 7 && list[0].startsWith('#21 '), list.length + ' rows');
    check('and NEXT locks', await session.eval('document.querySelectorAll("[data-screen=board] .hl-pager .hm-btn")[1].classList.contains("is-locked")'));
    await key(session, 'ArrowRight');
    check('the right arrow at the end stays put', /PAGE 3 \/ 3/.test(await pageText(session)));

    await key(session, 'ArrowLeft'); await key(session, 'ArrowLeft'); await key(session, 'ArrowLeft');
    check('the left arrow returns to page one and stops', /PAGE 1 \/ 3/.test(await pageText(session)));
    await session.eval('Array.from(document.querySelectorAll("[data-screen=board] .hl-pager .hm-btn")).find((n) => /FIND ME/.test(n.textContent)).click()');
    await cdp.sleep(500);
    check('FIND ME jumps to the page that holds the player', /PAGE 2 \/ 3/.test(await pageText(session)));
    await session.eval('Array.from(document.querySelectorAll("[data-screen=board] .hl-pager .hm-btn")).find((n) => /PREV/.test(n.textContent)).click()');
    await cdp.sleep(500);
    check('PREV by mouse works', /PAGE 1 \/ 3/.test(await pageText(session)));

    await key(session, 'Escape');
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden])")', 6000);
    check('ESC returns to the title', true);

    // The network goes away.
    await session.eval('window.__net = false');
    await openBoard();
    const sub = await session.eval('(document.querySelector("[data-screen=board] .hk-mast-sub, [data-screen=board] .hk-sub") || document.querySelector("[data-screen=board]")).textContent');
    check('offline says so', /Offline/i.test(sub), sub.slice(0, 80));
    const empty = await session.eval('(document.querySelector("[data-screen=board] .hl-empty") || {}).textContent');
    check('and shows the local runs (none yet)', /No runs recorded/.test(empty || ''), empty);
    await shoot(session, path.join(out, '3-offline.png'), view);

    const errors = await session.eval('window.__gfxErrors || []');
    check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    await close();
  }
  console.log(failures.length ? '\n' + failures.length + ' FAILED' : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => { console.error('check-leaderboard: ' + e.message); process.exit(2); });
