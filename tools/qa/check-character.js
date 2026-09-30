#!/usr/bin/env node
/* The character screen and the look it makes, end to end in a real browser.
 *
 *   node tools/qa/check-character.js [base-url] [--out DIR] [--tour]
 *
 * A fresh browser: START RUN opens the make-a-character page before the name
 * prompt; the stage is live; the tabs page; a piece bought with keys is owned and
 * worn and the wallet drops; a limited piece refuses; BEGIN carries on to the
 * name. Then a run starts and the hero in the world is the one that was made.
 * With --tour every tab and a spread of rarities are photographed.
 * Exit code 1 when a check fails or the page logs an error. */

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

async function key(session, code) {
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(90);
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(140);
}

const screenUp = (s, name) => s.eval(`!!document.querySelector('[data-screen=${name}]:not([hidden])')`);
const text = (s, sel) => s.eval(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
const keys = (s) => s.eval('DS.Look.profile.wallet.keys');

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/character');
  const tour = args.includes('--tour');
  fs.mkdirSync(out, { recursive: true });

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene && DS.Look && DS.Creator', 30000);
    const view = await session.eval(VIEW);
    await session.eval('localStorage.removeItem("ds_profile"); localStorage.removeItem("ds_name"); DS.Look.reload();');
    check('a fresh browser has made no character', (await session.eval('DS.Look.created')) === false);
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden]) .hm-item")', 15000);
    const items = await session.eval('Array.from(document.querySelectorAll("[data-screen=menu] .hm-item-label")).map((n) => n.textContent)');
    check('the title has a CHARACTER entry', items.includes('CHARACTER'), items.join(' | '));

    // First run: START RUN opens the creator, not the name prompt.
    await session.eval('Array.from(document.querySelectorAll("[data-screen=menu] .hm-item")).find((n) => /START RUN/.test(n.textContent)).click()');
    await waitFor(session, 'document.querySelector("[data-screen=creator]:not([hidden]) .hc-tab")', 8000);
    await cdp.sleep(900);
    check('START RUN opens the character screen first', await screenUp(session, 'creator'));
    check('and it says it is the first time', /create your walker/i.test(await text(session, '[data-screen=creator] .hk-title')), await text(session, '[data-screen=creator] .hk-title'));
    check('the 3D stage is live', await session.eval('DS.LookStage && DS.LookStage.ready && !!DS.LookStage.model'));
    check('and the pixel fallback is hidden', await session.eval('getComputedStyle(document.querySelector("[data-screen=creator] .hc-fallback")).display === "none"'));
    await shoot(session, path.join(out, '01-first-body.png'), view);

    // Free things apply at once.
    await session.eval('DS.Look.equip("skin", "brown"); DS.Look.equip("build", "broad");');
    await cdp.sleep(400);
    check('a free trait is worn', (await session.eval('DS.Look.look.skin + "/" + DS.Look.look.build')) === 'brown/broad');

    // Tabs page with Q and E.
    await key(session, 'KeyE');
    check('E pages to FACE', /FACE/.test(await session.eval('document.querySelector("[data-screen=creator] .hc-tab.is-on").textContent')));
    await shoot(session, path.join(out, '02-face.png'), view);
    await key(session, 'KeyQ');

    // The wardrobe: a bought piece.
    await session.eval('DS.Creator && 0');
    await session.eval('DS.Look.bank(700)');
    await cdp.sleep(200);
    for (let i = 0; i < 4; i++) await key(session, 'KeyE');    // BODY -> FACE -> HAIR -> HEADWEAR -> TOP
    check('four pages on is TOP', /TOP/.test(await session.eval('document.querySelector("[data-screen=creator] .hc-tab.is-on").textContent')));
    const before = await keys(session);
    // Click the Chainmail card twice (arm, then buy).
    const clickCard = (name) => session.eval(`(() => { const n = Array.from(document.querySelectorAll("[data-screen=creator] .hc-card")).find((c) => c.textContent.indexOf(${JSON.stringify(name)}) === 0); if (!n) return false; n.click(); return true; })()`);
    check('the Chainmail card is there', await clickCard('Chainmail'));
    await cdp.sleep(200);
    check('one click only arms the purchase', (await keys(session)) === before && !(await session.eval('DS.Look.owns(DS.Look.itemOf("top", "chain"))')), await text(session, '[data-screen=creator] .hc-note'));
    await clickCard('Chainmail');
    await cdp.sleep(300);
    check('the second click buys it', await session.eval('DS.Look.owns(DS.Look.itemOf("top", "chain"))'));
    check('and wears it', (await session.eval('DS.Look.look.top')) === 'chain');
    check('and the wallet dropped by its price (90)', (await keys(session)) === before - 90, before + ' -> ' + (await keys(session)));
    await shoot(session, path.join(out, '03-top-chain.png'), view);

    // A limited piece refuses whatever is in the wallet.
    await session.eval('DS.Look.bank(100000)');
    for (let i = 0; i < 0; i++) await key(session, 'KeyE');
    await session.eval('DS.currentScene && 0');
    const limited = await session.eval('(() => { const r = DS.Look.buy(DS.Look.itemOf("top", "warden_plate")); return r.reason; })()');
    check('a limited piece cannot be bought', limited === 'limited', limited);
    await session.eval('DS.Look.profile.wallet.keys = 40; DS.Look.save();');

    // Random wears only what is owned.
    await key(session, 'KeyR');
    const okRandom = await session.eval('DS.Look.ITEM_SLOTS.every((s) => DS.Look.owns(DS.Look.itemOf(s, DS.Look.look[s])))');
    check('R draws a look from what is owned', okRandom);

    if (tour) {
      const tabs = await session.eval('DS.Creator.TABS.map((t) => t.id)');
      for (let i = 0; i < tabs.length; i++) {
        await session.eval(`(() => { const n = document.querySelectorAll("[data-screen=creator] .hc-tab")[${i}]; n.click(); })()`);
        await cdp.sleep(1100);
        await shoot(session, path.join(out, 'tab-' + String(i).padStart(2, '0') + '-' + tabs[i] + '.png'), view);
      }
    }

    // BEGIN carries on: the name prompt.
    await session.eval('Array.from(document.querySelectorAll("[data-screen=creator] .hk-foot .hm-btn")).find((n) => /BEGIN/.test(n.textContent)).click()');
    await cdp.sleep(600);
    check('BEGIN records that a character was made', await session.eval('DS.Look.created'));
    check('and goes on to the name prompt', await screenUp(session, 'name'));

    // Into a run: the world's hero is the made one.
    await session.eval('DS.Board.setName("Tester")');
    await session.eval('DS.Scenes.play(4242, { weapon: "sword" })');
    await waitFor(session, 'DS.currentGame && DS.currentGame.player && DS.R3D && DS.R3D.heroRoot && DS.R3D.heroRoot()', 30000);
    await cdp.sleep(900);
    const built = await session.eval('(() => { let n = 0; DS.R3D.heroRoot().traverse((o) => { if (o.isMesh) n++; }); return n; })()');
    const baked = await session.eval('(() => { let n = 0; DS.R3D.heroRoot().traverse((o) => { if (o.isMesh && o.userData.chunkColors) n++; }); return n; })()');
    check('the hero in the world is built from the look, baked into a few meshes', built >= 5 && built <= 40 && baked >= 5, built + ' meshes, ' + baked + ' baked');
    await shoot(session, path.join(out, '10-in-run.png'), view);

    // The bag's doll is the same person, in pixels.
    await key(session, 'KeyB');
    await waitFor(session, 'document.querySelector("[data-screen=bag]:not([hidden]) .hb-doll")', 8000);
    await cdp.sleep(500);
    const dollPx = await session.eval('(() => { const cv = document.querySelector("[data-screen=bag] .hb-doll"); const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return { w: cv.width, h: cv.height, n: n }; })()');
    check('the bag doll is painted from the look', dollPx.n > 2000 && dollPx.h >= 96, JSON.stringify(dollPx));
    await shoot(session, path.join(out, '11-bag.png'), view);
    await key(session, 'KeyB');
    await cdp.sleep(300);

    // A run ends: the keys in the pack are banked and the summary says so.
    await session.eval('(() => { const g = DS.currentGame; g.inv.keys = 12; g.runBosses = ["warden", "king"]; g.depth = 7; })()');
    const walletBefore = await keys(session);
    await session.eval('DS.Scenes.gameOver(DS.currentGame, false)');
    await waitFor(session, 'document.querySelector("[data-screen=over]:not([hidden]) .hm-bank-n")', 8000);
    await cdp.sleep(1400);
    check('the run summary shows the keys carried out', /\+12/.test(await text(session, '[data-screen=over] .hm-bank-n')), await text(session, '[data-screen=over] .hm-bank-l'));
    check('and the wallet grew by them', (await keys(session)) === walletBefore + 12, walletBefore + ' -> ' + (await keys(session)));
    check('and the bosses were counted', (await session.eval('DS.Look.profile.counters["boss.warden"] + "/" + DS.Look.profile.counters["boss.king"]')) === '1/1');
    await shoot(session, path.join(out, '12-summary.png'), view);
    const btns = await session.eval('Array.from(document.querySelectorAll("[data-screen=over] .hm-over-btns .hm-btn")).map((n) => n.textContent)');
    check('the summary offers CHARACTER', btns.includes('CHARACTER'), btns.join(' | '));
    await session.eval('Array.from(document.querySelectorAll("[data-screen=over] .hm-over-btns .hm-btn")).find((n) => /CHARACTER/.test(n.textContent)).click()');
    await waitFor(session, 'document.querySelector("[data-screen=creator]:not([hidden]) .hc-tab")', 8000);
    check('CHARACTER opens the wardrobe straight from the summary', await screenUp(session, 'creator'));
    check('and this time it is not the first-time page', !/create your walker/i.test(await text(session, '[data-screen=creator] .hk-title')));
    await key(session, 'Escape');
    await cdp.sleep(500);
    check('ESC returns to the title', await screenUp(session, 'menu'));

    const errs = await session.eval('window.__gfxErrors || []');
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await close();
  }
  if (failures.length) { console.log('\n' + failures.length + ' check(s) failed'); process.exit(1); }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
