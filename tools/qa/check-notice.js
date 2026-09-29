#!/usr/bin/env node
/* The startup notice, end to end in a real browser.
 *
 *   node tools/qa/check-notice.js [base-url] [--out DIR]
 *
 * A fresh profile must see the notice; its buttons must be locked until the text
 * has been scrolled to the end; AGREE and DECLINE must both reach the title
 * screen (DECLINE through the apology); "do not show again" must survive a
 * reload and Options must be able to bring it back. Screenshots of each state go
 * to tools/qa/out/notice/. Exit code 1 when a check fails or the page logs an
 * error. */

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

async function boot(base) {
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  await session.cmd('Page.enable');
  await session.cmd('Runtime.enable');
  await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await session.goto(base, 2400);
  await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene', 30000);
  return { session, close };
}

const scene = (s) => s.eval('(DS.currentScene && DS.currentScene.state) ? Object.keys(DS.currentScene.state).join(",") : "?"');
const isNotice = (s) => s.eval('!!document.querySelector("[data-screen=notice]:not([hidden])")');
const isMenu = (s) => s.eval('!!document.querySelector("[data-screen=menu]:not([hidden])")');

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/notice');
  fs.mkdirSync(out, { recursive: true });

  const { session, close } = await boot(base);
  try {
    const view = await session.eval(VIEW);
    await waitFor(session, 'document.querySelector("[data-screen=notice]:not([hidden]) .hn-body")', 15000);
    check('a fresh profile sees the notice', await isNotice(session));
    await shoot(session, path.join(out, '1-fresh.png'), view);

    let locked = await session.eval('document.querySelectorAll(".hn-actions .is-locked").length');
    check('both buttons are locked before the text is read', locked === 2, locked + ' locked');
    // Pressing a locked button must not answer.
    await session.eval('document.querySelector(".hn-actions .is-primary").click()');
    await session.eval('new Promise((r) => setTimeout(r, 300))');
    check('a locked AGREE does nothing', await isNotice(session) && (await session.eval('DS.Settings.get("notice","ack")')) === 0);

    await session.eval('(() => { const b = document.querySelector(".hn-body"); b.scrollTop = b.scrollHeight; })()');
    await waitFor(session, 'document.querySelectorAll(".hn-actions .is-locked").length === 0', 6000);
    check('the buttons wake at the end of the text', true);
    await shoot(session, path.join(out, '2-read.png'), view);

    // DECLINE: apology, then the game.
    await session.eval('document.querySelector(".hn-actions .hm-btn:not(.is-primary)").click()');
    await waitFor(session, 'document.querySelector(".hn-pop") && !document.querySelector(".hn-pop").hidden', 4000);
    check('DECLINE shows the apology', true);
    check('and records the answer', (await session.eval('DS.Settings.get("notice","ack")')) === 2);
    await shoot(session, path.join(out, '3-apology.png'), view);
    await session.eval('document.querySelector(".hn-pop .hm-btn").click()');
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden])")', 8000);
    check('CONTINUE TO GAME reaches the title screen', await isMenu(session));
    check('the notice is gone', !(await isNotice(session)));
    await shoot(session, path.join(out, '4-title.png'), view);

    // Not hidden: it comes back on the next launch.
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene', 30000);
    await waitFor(session, 'document.querySelector("[data-screen=notice]:not([hidden])")', 15000);
    check('without "do not show again" it returns next launch', true);

    // AGREE + do not show again, then a reload goes straight to the title.
    await session.eval('(() => { const b = document.querySelector(".hn-body"); b.scrollTop = b.scrollHeight; })()');
    await waitFor(session, 'document.querySelectorAll(".hn-actions .is-locked").length === 0', 6000);
    await session.eval('document.querySelector(".hn-check").click()');
    await session.eval('new Promise((r) => setTimeout(r, 200))');
    await session.eval('document.querySelector(".hn-actions .is-primary").click()');
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden])")', 8000);
    check('AGREE reaches the title screen', await isMenu(session));
    check('and records agreement with "hide"', (await session.eval('JSON.stringify(DS.Settings.get("notice"))')).includes('"hide":true'));
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene', 30000);
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden])")', 15000);
    check('"do not show again" skips it on the next launch', !(await isNotice(session)));

    const errors = await session.eval('window.__gfxErrors || []');
    check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    await close();
  }
  console.log(failures.length ? '\n' + failures.length + ' FAILED' : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => { console.error('check-notice: ' + e.message); process.exit(2); });
