#!/usr/bin/env node
/* The Options screen, driven the way a player drives it: mouse, keyboard, and a
 * reload to see that it stuck.
 *
 *   node tools/qa/check-options.js [base-url] [--out DIR]
 *
 * Title screen -> OPTIONS; every tab photographed; a slider moved by the mouse
 * and by the keyboard; a toggle; a key rebound (and the sheet, the setting and a
 * reload all agree); the same screen from the pause menu in a run. Exit code 1
 * when a check fails or the page logs an error. */

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

/* A key the way a keyboard sends it: down, a frame, up. */
async function key(session, code, holdMs) {
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(holdMs || 90);
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(60);
}

const shown = (s, name) => s.eval(`!!document.querySelector('[data-screen=${name}]:not([hidden])')`);

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/options');
  fs.mkdirSync(out, { recursive: true });

  let { session, close } = await boot(base);
  try {
    const view = await session.eval(VIEW);
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden]) .hm-item")', 15000);
    const items = await session.eval('Array.from(document.querySelectorAll("[data-screen=menu] .hm-item-label")).map((n) => n.textContent)');
    check('the title has an OPTIONS entry', items.includes('OPTIONS'), items.join(' | '));

    await session.eval('Array.from(document.querySelectorAll("[data-screen=menu] .hm-item")).find((n) => /OPTIONS/.test(n.textContent)).click()');
    await waitFor(session, 'document.querySelector("[data-screen=options]:not([hidden]) .ho-row")', 8000);
    check('OPTIONS opens', await shown(session, 'options'));

    const tabs = await session.eval('Array.from(document.querySelectorAll(".ho-tab")).map((n) => n.textContent)');
    check('six tabs', tabs.length === 6, tabs.join(' | '));
    for (let i = 0; i < tabs.length; i++) {
      await session.eval(`document.querySelectorAll('.ho-tab')[${i}].click()`);
      await cdp.sleep(350);
      await shoot(session, path.join(out, `tab-${i + 1}-${tabs[i].toLowerCase()}.png`), view);
    }

    // Graphics: a slider by the mouse...
    await session.eval("document.querySelectorAll('.ho-tab')[0].click()");
    await cdp.sleep(300);
    await session.eval(`(() => { const r = Array.from(document.querySelectorAll('.ho-row')).find((n) => /Bloom/.test(n.textContent)).querySelector('input');
      r.value = '0.4'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await cdp.sleep(200);
    check('a slider moved by the mouse changes the setting', (await session.eval('DS.Settings.get("gfx","bloom")')) === 0.4);
    // ...and by the keyboard: into the rows, down to Vignette (fourth row), left twice.
    await key(session, 'Enter');
    await key(session, 'ArrowDown'); await key(session, 'ArrowDown'); await key(session, 'ArrowDown');
    await cdp.sleep(120);
    const before = await session.eval('DS.Settings.get("gfx","vignette")');
    await key(session, 'ArrowLeft'); await key(session, 'ArrowLeft');
    const after = await session.eval('DS.Settings.get("gfx","vignette")');
    check('a slider moved by the keyboard changes the setting', after < before, before + ' -> ' + after);
    check('and it is written to disk', (await session.eval('localStorage.getItem("ds_settings")')).includes('"vignette"'));

    // Audio: a toggle.
    await key(session, 'Escape');       // back to the tabs
    await session.eval("document.querySelectorAll('.ho-tab')[1].click()");
    await cdp.sleep(300);
    await session.eval("Array.from(document.querySelectorAll('.ho-row')).find((n) => /Mute when/.test(n.textContent)).click()");
    await cdp.sleep(150);
    check('a toggle flips its setting', (await session.eval('DS.Settings.get("audio","muteUnfocused")')) === true);

    // Controls: rebind Dash to V by the keyboard.
    await session.eval("document.querySelectorAll('.ho-tab')[2].click()");
    await cdp.sleep(300);
    await session.eval(`Array.from(document.querySelectorAll('.ho-row')).find((n) => /^Dash/.test(n.querySelector('.ho-label').textContent)).querySelector('.ho-key').click()`);
    await cdp.sleep(200);
    check('a key row waits for a key', await session.eval('DS.Input.isCapturing()'));
    await shoot(session, path.join(out, 'rebind-waiting.png'), view);
    await key(session, 'KeyV');
    await cdp.sleep(200);
    check('the key is rebound', (await session.eval('DS.Input.keysOf("dash")[0]')) === 'KeyV');
    check('the screen shows it', (await session.eval(`Array.from(document.querySelectorAll('.ho-row')).find((n) => /^Dash/.test(n.querySelector('.ho-label').textContent)).querySelector('.ho-key').textContent`)) === 'V');
    check('and the setting holds it', (await session.eval('DS.Settings.get("controls","map")')).includes('KeyV'));

    // Accessibility reaches the renderer.
    await session.eval("document.querySelectorAll('.ho-tab')[4].click()");
    await cdp.sleep(300);
    await session.eval("Array.from(document.querySelectorAll('.ho-row')).find((n) => /Reduce motion/.test(n.textContent)).click()");
    await cdp.sleep(150);
    check('reduce motion reaches the camera', (await session.eval('DS.R.comfort.motion')) === false);

    // Leaving returns to the title.
    await key(session, 'Escape');
    await cdp.sleep(200);
    await key(session, 'Escape');
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden])")', 6000);
    check('ESC leaves OPTIONS for the title', !(await shown(session, 'options')));

    // A reload: everything is still set.
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene', 30000);
    check('the rebound key survives a reload', (await session.eval('DS.Input.keysOf("dash")[0]')) === 'KeyV');
    check('the slider survives a reload', (await session.eval('DS.Settings.get("gfx","bloom")')) === 0.4);
    check('reduce motion survives a reload', (await session.eval('DS.R.comfort.motion')) === false);

    // From the pause menu of a run.
    await session.eval('DS.Scenes.play(4242, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.player && DS.currentScene', 30000);
    await cdp.sleep(600);
    await key(session, 'Escape');
    await waitFor(session, 'document.querySelector("[data-screen=pause]:not([hidden])")', 8000);
    const pauseItems = await session.eval('Array.from(document.querySelectorAll("[data-screen=pause] .hm-pitem-label")).map((n) => n.textContent)');
    check('the pause menu has OPTIONS', pauseItems.includes('OPTIONS'), pauseItems.join(' | '));
    await session.eval('Array.from(document.querySelectorAll("[data-screen=pause] .hm-pitem")).find((n) => /OPTIONS/.test(n.textContent)).click()');
    await waitFor(session, 'document.querySelector("[data-screen=options]:not([hidden]) .ho-row")', 8000);
    await shoot(session, path.join(out, 'pause-options.png'), view);
    const noRead = await session.eval('Array.from(document.querySelectorAll(".ho-row")).some((n) => /Read the notice/.test(n.textContent))');
    check('the notice reader is not offered mid-run', !noRead);
    await key(session, 'Escape');       // focus starts on the tabs, so one press leaves the screen
    await waitFor(session, 'document.querySelector("[data-screen=pause]:not([hidden])")', 6000);
    check('ESC returns to the pause menu', await shown(session, 'pause'));

    const errors = await session.eval('window.__gfxErrors || []');
    check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    await close();
  }
  console.log(failures.length ? '\n' + failures.length + ' FAILED' : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => { console.error('check-options: ' + e.message); process.exit(2); });
