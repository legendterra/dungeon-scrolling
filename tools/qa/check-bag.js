#!/usr/bin/env node
/* The inventory's detail card must stay where it is.
 *
 *   node tools/qa/check-bag.js [base-url] [--out DIR]
 *
 * The card on the right of the bag used to slide in afresh for every item the pointer
 * crossed and to change height with every affix list, which made moving across the bag
 * dizzying. Here the pointer is moved over weapons of every rarity, over an empty cell
 * and off the grid, and the card must keep the same position and size throughout, carry
 * no entrance animation, and show what is under the pointer. Exit code 1 on a failed check
 * or a console error. */

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

const DRIVER = `(() => {
  const U = window.__bag = {};
  U.g = () => DS.currentGame;
  U.frame = (n) => { const g = U.g(), p = g.player;
    for (let i = 0; i < n; i++) { p.dead = false; p.hp = Math.max(p.hp || 0, 50); g.deathTimer = 0; g.enemies.length = 0;
      DS.Input.poll(); if (DS.Ptr) DS.Ptr.beginFrame(); DS.Game.update(g); DS.Input.endFrame(); DS.Game.draw(g); }
    DS.R.present(performance.now() / 1000); if (DS.HUI && DS.HUI.sync) DS.HUI.sync(); };
  DS.__paused = true; return true; })()`;

const RECT = `(() => {
  const card = document.querySelector('[data-screen=bag] .hb-detail > *');
  if (!card) return null;
  const r = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
           anim: cs.animationName, cls: card.className.split(' ')[0], text: (card.querySelector('.hk-card-name') || card).textContent.slice(0, 40) };
})()`;

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/bag');
  fs.mkdirSync(out, { recursive: true });

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.Scenes', 30000);
    const view = await session.eval(VIEW);
    await session.eval("localStorage.setItem('ds_name', 'BAGQA')");
    await session.eval('DS.Scenes.play(4242, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.player', 30000);
    await cdp.sleep(600);
    await session.eval(DRIVER);
    // Weapons of every rarity, so the affix lists run from none to several.
    const filled = await session.eval(`(() => { const g = __bag.g(); let n = 0;
      [['sword', 0], ['bow', 1], ['greataxe', 2], ['spear', 3], ['staff', 4], ['dagger', 4]].forEach((d) => {
        const it = DS.Loot.makeItem(g.rng, 12, { type: d[0], rarity: d[1] }); if (DS.Inv.addItem(g.inv, it).ok) n++; });
      return n; })()`);
    check('the bag holds items of every rarity to hover', filled >= 5, filled + ' items');
    await session.eval('DS.UI.openBag(__bag.g()); __bag.frame(30);');
    await waitFor(session, 'document.querySelector("[data-screen=bag]:not([hidden]) .hb-grid")', 8000);
    await cdp.sleep(900);                      // the screen's own entrance is over; only the card's behaviour is measured

    const cells = await session.eval('document.querySelectorAll("[data-screen=bag] .hb-grid > *").length');
    check('the bag grid is drawn', cells >= 8, cells + ' cells');
    const hover = async (i) => {
      await session.eval(`(() => { const c = document.querySelectorAll('[data-screen=bag] .hb-grid > *')[${i}]; c.dispatchEvent(new Event('pointerenter')); })()`);
      await session.eval('__bag.frame(3)');
      await cdp.sleep(60);
      return session.eval(RECT);
    };

    const seen = [];
    for (let i = 0; i < 6; i++) seen.push(await hover(i));
    const empty = await hover(10);
    const rest = await session.eval(`(() => { const g = __bag.g(); g.modal.hover = -1; __bag.frame(3); return true; })()`);
    const off = await session.eval(RECT);
    const all = seen.concat([empty, off]).filter(Boolean);
    check('the card is there for every hover', seen.every(Boolean) && !!empty && !!off, seen.map((s) => s && s.text).join(' | '));
    const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    check('it keeps one position and one size over items, an empty cell and nothing at all',
      all.every((r) => same(r, all[0])), JSON.stringify(all.map((r) => [r.x, r.y, r.w, r.h]).filter((r, i, l) => i === 0 || JSON.stringify(r) !== JSON.stringify(l[i - 1]))));
    check('it has no entrance animation to replay', all.every((r) => r.anim === 'none'), [...new Set(all.map((r) => r.anim))].join(','));
    check('and what it shows changes with the item', new Set(seen.map((s) => s.text)).size >= 5, [...new Set(seen.map((s) => s.text))].length + ' different names');
    const tall = await session.eval(`(() => { const b = document.querySelector('[data-screen=bag] .hk-body').getBoundingClientRect(); const c = document.querySelector('[data-screen=bag] .hb-detail').getBoundingClientRect(); return Math.abs(b.height - c.height) < 3; })()`);
    check('the card fills its column top to bottom', tall);

    await hover(4);
    await shoot(session, path.join(out, 'bag-legendary.png'), view);
    await hover(0);
    await shoot(session, path.join(out, 'bag-common.png'), view);
    await hover(10);
    await shoot(session, path.join(out, 'bag-empty.png'), view);

    const errs = await session.eval('window.__gfxErrors || []');
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await close();
  }
  if (failures.length) { console.log('\n' + failures.length + ' check(s) failed'); process.exit(1); }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
