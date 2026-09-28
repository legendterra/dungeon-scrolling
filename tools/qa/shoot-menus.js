#!/usr/bin/env node
/* The HTML menus and world panels, photographed and exercised.
 *
 *   node tools/qa/shoot-menus.js [base-url] [--out DIR] [--sizes 1280x720,1920x1080]
 *                                [--legacy] [--only menu,bag,...]
 *
 * For every size it boots the page, walks the main menu with the keyboard
 * (DOWN/ENTER through How to play and Records), opens the loadout, starts seed
 * 4242, fills the bag with a spread of rarities, and shoots the bag, the shop,
 * the shrine, the enchant table, the pause screen and both game-over cards.
 * On the first size it also drives input: keyboard navigation in the bag and
 * a real mouse drag (CDP Input.dispatchMouseEvent) from a bag tile onto the
 * off-hand slot, and it checks that the item actually moved.
 *
 * --legacy runs the old WebGL screens (DS.HUI_MENUS = false) for a baseline.
 * Frames are cropped to the play frame (DS.UI3.view). Console errors are
 * captured from the first script the page runs; any error fails the run.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

const HOOK = (legacy) => `(() => {
  window.DS = window.DS || {}; window.DS.HUI_MENUS = ${legacy ? 'false' : 'true'};
  window.__qaErrors = [];
  const push = (kind, msg) => { try { window.__qaErrors.push(kind + ': ' + String(msg).slice(0, 400)); } catch (e) {} };
  const oe = console.error.bind(console);
  console.error = function () { push('console.error', Array.prototype.join.call(arguments, ' ')); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => push('error', e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => push('rejection', e.reason && (e.reason.stack || e.reason)));
})();`;

const VIEW = '(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, w: v.w, h: v.h }; })()';

const KEEP_ALIVE = `(() => { const g = DS.currentGame; if (!g || !g.player) return false;
  const p = g.player; p.dead = false; p.hp = Math.max(p.hp || 0, 3); g.deathTimer = 0; return true; })()`;

/* A bag worth looking at: every rarity, both kinds, an infused weapon, a full
   armour set so the set bonus shows, two essences for the R/T hint. */
const STOCK = `(() => { const g = DS.currentGame; const rng = DS.makeRng(77); const L = DS.Loot, A = DS.Armor;
  g.inv.coins = 340; g.inv.shards = 14; g.inv.keys = 1; g.inv.essences = ['fire', 'ice', 'lightning'];
  g.inv.equipped[1] = L.makeItem(rng, 6, { type: 'bow', rarity: 2, element: 'ice' });
  g.inv.armor.head = A.makeArmor(rng, 6, { slot: 'head', material: 'crystal', rarity: 2 });
  g.inv.armor.chest = A.makeArmor(rng, 6, { slot: 'chest', material: 'crystal', rarity: 3 });
  g.inv.armor.legs = A.makeArmor(rng, 6, { slot: 'legs', material: 'crystal', rarity: 1 });
  g.inv.bag.length = 0;
  g.inv.bag.push(L.makeItem(rng, 8, { type: 'greataxe', rarity: 4, element: 'fire' }));
  g.inv.bag.push(L.makeItem(rng, 6, { type: 'dagger', rarity: 3, element: 'lightning' }));
  g.inv.bag.push(A.makeArmor(rng, 6, { slot: 'head', material: 'obsidian', rarity: 3 }));
  g.inv.bag.push(L.makeItem(rng, 4, { type: 'spear', rarity: 1, element: 'poison' }));
  g.inv.bag.push(A.makeArmor(rng, 3, { slot: 'legs', material: 'leather', rarity: 0 }));
  g.inv.bag.push(L.makeItem(rng, 5, { type: 'staff', rarity: 2, element: 'water' }));
  g.inv.bag.push(A.makeArmor(rng, 5, { slot: 'chest', material: 'gold', rarity: 4 }));
  DS.Inv.setInfusion(g.inv.equipped[0], 'fire');
  g.inv.boons = ['bloodthirst', 'sharpshooter'];
  g.kills = 57; g.depth = 7; g.streakBest = 14; g.frames = 60 * 60 * 9 + 60 * 23;
  g.player.refreshStats(); return g.inv.bag.length; })()`;

const CLOSE = `(() => { const g = DS.currentGame; g.modal = null; g.paused = false; return true; })()`;

async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(150);
  }
  throw new Error('timed out waiting for: ' + expr);
}

async function shoot(session, file) {
  const view = await session.eval(VIEW);
  const res = await session.cmd('Page.captureScreenshot', {
    format: 'png', fromSurface: true,
    clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 }
  }, 60000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  console.log('shot ' + path.relative(ROOT, file));
}

const KEYS = {
  down: ['ArrowDown', 'ArrowDown', 40], up: ['ArrowUp', 'ArrowUp', 38],
  left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
  enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27], tab: ['Tab', 'Tab', 9]
};
async function press(session, name, times) {
  for (let i = 0; i < (times || 1); i++) {
    const k = KEYS[name];
    await session.key(k[0], k[1], k[2]);
    await cdp.sleep(90);
  }
}

async function mouse(session, type, x, y, buttons) {
  await session.cmd('Input.dispatchMouseEvent', {
    type: type, x: x, y: y, button: 'left', buttons: buttons, clickCount: 1
  });
}

/* Centre of the first element matching a selector, in viewport pixels. */
const CENTER = (sel) => `(() => { const n = document.querySelector(${JSON.stringify(sel)});
  if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;

async function drag(session, fromSel, toSel) {
  const a = await session.eval(CENTER(fromSel));
  const b = await session.eval(CENTER(toSel));
  if (!a || !b) throw new Error('drag: missing ' + (!a ? fromSel : toSel));
  await mouse(session, 'mouseMoved', a.x, a.y, 0);
  await mouse(session, 'mousePressed', a.x, a.y, 1);
  for (let i = 1; i <= 8; i++) {
    await mouse(session, 'mouseMoved', a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8, 1);
    await cdp.sleep(30);
  }
  await mouse(session, 'mouseReleased', b.x, b.y, 0);
  await cdp.sleep(200);
}

async function runSize(base, out, size, legacy, only, interact) {
  const want = (k) => !only || only.indexOf(k) >= 0;
  const tag = size.width + 'x' + size.height + (legacy ? '-legacy' : '');
  const { session, close } = await cdp.launch({ width: size.width, height: size.height, url: 'about:blank' });
  const checks = [];
  let errors = [];
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Emulation.setDeviceMetricsOverride', {
      width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK(legacy) });
    await session.goto(base, 1500);
    await session.eval(`localStorage.setItem('ds_name', JSON.stringify('AYAKA')); true`);
    await session.goto(base, 1500);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene', 30000);
    await cdp.sleep(1800);

    const shot = (name) => shoot(session, path.join(out, tag + '-' + name + '.png'));

    if (want('menu')) {
      await shot('01-menu');
      await press(session, 'down');           // HOW TO PLAY
      await cdp.sleep(250);
      await shot('01b-menu-focus');
      await press(session, 'enter');
      await cdp.sleep(500);
      await shot('02-howto');
      await press(session, 'esc');
      await press(session, 'down');           // RECORDS
      await press(session, 'enter');
      await cdp.sleep(500);
      await shot('03-records');
      await press(session, 'esc');
      await cdp.sleep(200);
    }
    if (want('loadout')) {
      await session.eval('DS.Scenes.loadout(); true');
      await cdp.sleep(700);
      await press(session, 'right', 2);       // greataxe/spear
      await cdp.sleep(300);
      await shot('04-loadout');
    }

    await session.eval(`DS.Scenes.play(4242, { weapon: 'sword' }); true`);
    await waitFor(session, 'DS.currentGame && DS.currentGame.player && DS.currentScene && DS.currentScene.g', 30000);
    await cdp.sleep(1200);
    await session.eval(KEEP_ALIVE);
    await session.eval(STOCK);

    if (want('bag')) {
      await session.eval('DS.UI.openBag(DS.currentGame); true');
      await cdp.sleep(500);
      await press(session, 'right', 1);
      await cdp.sleep(300);
      await shot('05-bag');
      if (interact && !legacy) {
        // Keyboard: walk into the bag grid and onto the second bag item.
        await press(session, 'right', 2);
        await cdp.sleep(250);
        const focus = await session.eval(`(() => { const n = document.querySelector('.hb-cell.is-focus, .hb-slot.is-focus');
          return n ? n.dataset.ref : null; })()`);
        checks.push({ name: 'keyboard focus moves into the bag', ok: !!focus, detail: focus });
        await shot('05b-bag-keyboard');
        // Mouse: drag bag item 1 (the dagger) onto the off hand, then check.
        const before = await session.eval(`DS.currentGame.inv.equipped[1] && DS.currentGame.inv.equipped[1].type`);
        await drag(session, '[data-ref="bag:1"]', '[data-ref="weapon:1"]');
        const after = await session.eval(`DS.currentGame.inv.equipped[1] && DS.currentGame.inv.equipped[1].type`);
        checks.push({ name: 'drag bag -> off hand swaps', ok: before !== after && after === 'dagger',
                      detail: before + ' -> ' + after });
        await shot('05c-bag-after-drag');
        // Hover a bag tile to show the compare card for armour.
        const c = await session.eval(CENTER('[data-ref="bag:2"]'));
        if (c) await mouse(session, 'mouseMoved', c.x, c.y, 0);
        await cdp.sleep(300);
        await shot('05d-bag-hover-armor');
      }
      await session.eval(CLOSE);
    }
    if (want('shop')) {
      await session.eval('DS.UI.openShop(DS.currentGame); true');
      await cdp.sleep(500);
      await press(session, 'down', 1);
      await cdp.sleep(300);
      await shot('06-shop');
      if (interact && !legacy) {
        const coins0 = await session.eval('DS.currentGame.inv.coins');
        await press(session, 'enter');
        await cdp.sleep(300);
        const coins1 = await session.eval('DS.currentGame.inv.coins');
        checks.push({ name: 'shop: ENTER buys the focused entry', ok: coins1 < coins0, detail: coins0 + ' -> ' + coins1 });
      }
      await session.eval(CLOSE);
    }
    if (want('shrine')) {
      await session.eval(`(() => { const g = DS.currentGame; const p = g.player;
        g.shrine = { x: p.x, y: p.y, used: false }; DS.UI.openShrine(g); return true; })()`);
      await cdp.sleep(500);
      await press(session, 'right', 1);
      await cdp.sleep(300);
      await shot('07-shrine');
      await session.eval(CLOSE);
    }
    if (want('enchant')) {
      await session.eval('DS.UI.openEnchant(DS.currentGame); true');
      await cdp.sleep(500);
      await press(session, 'down', 2);
      await cdp.sleep(300);
      await shot('08-enchant');
      await session.eval(CLOSE);
    }
    if (want('pause')) {
      await session.eval(KEEP_ALIVE);
      await press(session, 'esc');
      await cdp.sleep(500);
      await press(session, 'down', 3);
      await cdp.sleep(300);
      await shot('09-pause');
      if (interact && !legacy) {
        const q0 = await session.eval('DS.PostFX ? DS.PostFX.requested : null');
        const way = q0 === 'high' ? 'left' : 'right';
        await press(session, way);
        await cdp.sleep(250);
        const q1 = await session.eval('DS.PostFX ? DS.PostFX.requested : null');
        checks.push({ name: 'pause: ' + way.toUpperCase() + ' on graphics changes quality', ok: q0 !== q1, detail: q0 + ' -> ' + q1 });
        await shot('09b-pause-quality');
      }
      await session.eval(CLOSE);
    }
    if (want('over')) {
      await session.eval('DS.Scenes.gameOver(DS.currentGame, false); true');
      await cdp.sleep(1400);
      await shot('10-gameover-died');
      await session.eval(`(() => { const g = DS.currentGame; g.actsCleared = 3; g.depth = 30; DS.Scenes.gameOver(g, true); return true; })()`);
      await cdp.sleep(1400);
      await shot('11-gameover-cleared');
    }
    errors = await session.eval('window.__qaErrors || []');
  } finally {
    await close();
  }
  return { tag, checks, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8131/';
  const out = path.resolve(ROOT, value(args, '--out') || path.join('tools', 'qa', 'out', 'menus'));
  const sizes = (value(args, '--sizes') || '1280x720,1920x1080,2560x1440').split(',').map((s) => {
    const m = /^(\d+)x(\d+)$/.exec(s); return { width: Number(m[1]), height: Number(m[2]) };
  });
  const only = value(args, '--only') ? value(args, '--only').split(',') : null;
  const legacy = args.includes('--legacy');

  let failed = 0;
  for (let i = 0; i < sizes.length; i++) {
    const r = await runSize(base, out, sizes[i], legacy, only, i === 0);
    for (const c of r.checks) {
      console.log((c.ok ? 'PASS ' : 'FAIL ') + r.tag + ' ' + c.name + (c.detail ? ' (' + c.detail + ')' : ''));
      if (!c.ok) failed++;
    }
    if (r.errors.length) {
      failed += r.errors.length;
      console.log('ERRORS ' + r.tag + ':\n  ' + r.errors.slice(0, 20).join('\n  '));
    } else {
      console.log('no console errors at ' + r.tag);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => { console.error('shoot-menus: ' + err.message); process.exit(2); });
