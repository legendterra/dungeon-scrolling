#!/usr/bin/env node
/* Regression checks for the nine problems the v7.0.0 code review found, driven in
 * a real browser the way each was first seen.
 *
 *   node tools/qa/check-review.js [base-url]
 *
 * 1  a frame-rate cap made every HTML screen hide and rebuild on each drawn frame
 * 2  right from the tab column adjusted the first row (Quality flipped to LOW)
 * 3  a cap was read as a slow machine (covered by tests/frame.test.js)
 * 5  the notice's "do not show again" was ticked by Up / W / pad A (tests/notice.test.js)
 * 6  a left click while capturing a key bound the mouse button
 * 9  the title's last entry fell under the footer at 125% interface size
 * Exit code 1 when a check fails or the page logs an error. */

'use strict';

const cdp = require('../docs/cdp');
const { HOOK, waitFor } = require('./lib/map-page');

const failures = [];
function check(label, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures.push(label);
}

async function key(session, code, holdMs) {
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(holdMs || 120);
  await session.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', key: '${code}', bubbles: true }))`);
  await cdp.sleep(80);
}
const shown = (s, name) => s.eval(`!!document.querySelector('[data-screen=${name}]:not([hidden])')`);

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene && DS.Options', 30000);
    await session.eval('localStorage.clear(); DS.Look && DS.Look.reload();');
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden]) .hm-item")', 15000);

    // 1. Under a 30 cap the title screen is drawn every other tick; it must not blink.
    await session.eval('DS.Settings.set("gfx", "fpsCap", "30")');
    await cdp.sleep(600);
    await session.eval(`(() => { const n = document.querySelector('[data-screen=menu]'); window.__toggles = 0;
      new MutationObserver((m) => { m.forEach((r) => { if (r.attributeName === 'hidden') window.__toggles++; }); }).observe(n, { attributes: true }); })()`);
    await cdp.sleep(2500);
    const toggles = await session.eval('window.__toggles');
    check('under a 30 cap a screen is not hidden and shown again', toggles === 0, toggles + ' toggles in 2.5 s');
    const fps = await session.eval(`new Promise((res) => { let n = 0; const t0 = performance.now(); const orig = DS.Ptr.drawCursor;
      DS.Ptr.drawCursor = function () { n++; return orig.apply(this, arguments); };
      setTimeout(() => { DS.Ptr.drawCursor = orig; res(n / ((performance.now() - t0) / 1000)); }, 2000); })`);
    check('and the cap holds its rate', fps > 20 && fps < 36, fps.toFixed(1) + ' fps drawn');
    // A real click on OPTIONS lands while capped.
    await session.eval('Array.from(document.querySelectorAll("[data-screen=menu] .hm-item")).find((n) => /OPTIONS/.test(n.textContent)).click()');
    await waitFor(session, 'document.querySelector("[data-screen=options]:not([hidden]) .ho-tab")', 8000);
    check('a click on OPTIONS registers under the cap', await shown(session, 'options'));
    await session.eval('DS.Settings.set("gfx", "fpsCap", "max")');
    await cdp.sleep(300);

    // 2. Right from the tab column enters the list without touching its first row.
    const q0 = await session.eval('DS.PostFX ? DS.PostFX.requested + "|" + DS.PostFX.locked : ""');
    await key(session, 'ArrowRight', 160);
    await cdp.sleep(200);
    const q1 = await session.eval('DS.PostFX ? DS.PostFX.requested + "|" + DS.PostFX.locked : ""');
    check('right from the tabs enters the list and changes nothing', q0 === q1, q0 + ' -> ' + q1);
    check('and the graphics setting was not saved', !(await session.eval('localStorage.getItem("ds.gfx")')));

    // 6. A left click while a key row waits cancels; it does not bind the mouse button.
    await session.eval('Array.from(document.querySelectorAll("[data-screen=options] .ho-tab")).find((n) => /CONTROLS/.test(n.textContent)).click()');
    await cdp.sleep(400);
    const before = await session.eval('JSON.stringify([DS.Input.keysOf("attack"), DS.Input.keysOf("jump")])');
    await session.eval('Array.from(document.querySelectorAll("[data-screen=options] .ho-row")).find((n) => /^Jump/.test(n.textContent)).querySelector(".ho-key").click()');
    await cdp.sleep(300);
    check('a key row waits for a key', await session.eval('DS.Input.isCapturing()'));
    await session.eval("window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))");
    await cdp.sleep(200);
    const after = await session.eval('JSON.stringify([DS.Input.keysOf("attack"), DS.Input.keysOf("jump")])');
    check('a left click cancels the wait', !(await session.eval('DS.Input.isCapturing()')));
    check('and binds nothing: attack keeps its mouse button', before === after, after);

    // 9. The title fits at the largest interface size.
    await key(session, 'Escape'); await key(session, 'Escape');
    await waitFor(session, 'document.querySelector("[data-screen=menu]:not([hidden]) .hm-item")', 8000);
    await session.eval('DS.Settings.set("gfx", "uiScale", 1.25)');
    await cdp.sleep(800);
    const fit = await session.eval(`(() => { const items = Array.from(document.querySelectorAll('[data-screen=menu] .hm-item'));
      const last = items[items.length - 1].getBoundingClientRect(), foot = document.querySelector('[data-screen=menu] .hm-title-foot').getBoundingClientRect();
      return { n: items.length, lastBottom: Math.round(last.bottom), footTop: Math.round(foot.top) }; })()`);
    check('at 125% every title entry sits above the footer', fit.lastBottom <= fit.footTop, JSON.stringify(fit));
    await session.eval('DS.Settings.set("gfx", "uiScale", 1)');

    const errs = await session.eval('window.__gfxErrors || []');
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await close();
  }
  if (failures.length) { console.log('\n' + failures.length + ' check(s) failed'); process.exit(1); }
  console.log('\nall checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
