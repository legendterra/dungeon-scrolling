/* The frame-rate cap and what listens to it: a capped game holds its rate on any
   refresh (a 60 cap on a 75 Hz panel is four frames in five, not 37 fps), a cap is
   never mistaken for a slow machine by the auto-downgrade, and the sweeper that
   hides the HTML screens only counts frames that drew. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const STUBS =
  'window.__store = {}; window.localStorage = { getItem: function (k) { return k in window.__store ? window.__store[k] : null; },' +
  ' setItem: function (k, v) { window.__store[k] = String(v); }, removeItem: function (k) { delete window.__store[k]; } };' +
  'window.DS.HUI = { el: function () { return {}; } };' +
  'window.__t = 0; window.performance = { now: function () { return window.__t; } };' +
  /* postfx.js builds shader uniforms with THREE at load; any constructor will do here. */
  'window.THREE = new Proxy({}, { get: function (t, k) { if (!(k in t)) t[k] = function () { return { set: function () { return this; }, copy: function () { return this; } }; }; return t[k]; } });';

function fresh(cap) {
  const DS = load(['src/core/rng.js', 'src/core/settings.js', 'src/core/prefs.js', 'src/core/postfx.js'], STUBS);
  DS.Settings.set('gfx', 'fpsCap', cap || 'max');
  return DS;
}

/* Ten seconds of animation ticks at `hz`, each a hair early or late, and how many
   of them the cap lets through. */
function drawn(DS, hz, seconds) {
  const period = 1000 / hz;
  let n = 0, t = 5000;
  const jitter = [0.3, -0.4, 0.2, -0.1, 0.4, -0.3, 0.1, 0];
  for (let i = 0; i < hz * seconds; i++) {
    t += period;
    if (DS.Prefs.wantDraw(t + jitter[i % jitter.length])) n++;
  }
  return n / seconds;
}

test('with no cap every tick draws', () => {
  const DS = fresh('max');
  for (const hz of [60, 75, 144]) assert.equal(drawn(DS, hz, 2), hz);
  assert.equal(DS.Prefs.frameGap(), 0);
});

test('a cap holds its rate on any refresh rate, within a frame a second', () => {
  for (const cap of ['30', '60']) {
    const want = Number(cap);
    for (const hz of [60, 75, 90, 120, 144, 165, 240]) {
      if (hz < want) continue;
      const DS = fresh(cap);
      const got = drawn(DS, hz, 10);
      assert.ok(Math.abs(got - want) <= 1.2, 'cap ' + cap + ' at ' + hz + ' Hz gave ' + got);
    }
  }
});

test('a panel slower than the cap simply draws every tick', () => {
  const DS = fresh('60');
  assert.equal(drawn(DS, 50, 4), 50);
});

test('the gap follows the setting', () => {
  const DS = fresh('30');
  assert.ok(Math.abs(DS.Prefs.frameGap() - 1000 / 30) < 1e-9);
  DS.Settings.set('gfx', 'fpsCap', '60');
  assert.ok(Math.abs(DS.Prefs.frameGap() - 1000 / 60) < 1e-9);
});

test('after a stall the cap resumes at its rate: one frame, not a burst to catch up', () => {
  const DS = fresh('30');
  let t = 1000;
  for (let i = 0; i < 30; i++) { t += 16.67; DS.Prefs.wantDraw(t); }
  t += 5000;                                     // a hidden tab
  let burst = 0;
  for (let i = 0; i < 6; i++) { t += 16.67; if (DS.Prefs.wantDraw(t)) burst++; }
  assert.ok(burst >= 1 && burst <= 4, 'six ticks after the stall drew ' + burst);
});

// --- the auto-downgrade ------------------------------------------------------------------------

/* Feed track() one frame every `ms` for `seconds`, after the warm-up. */
function feed(DS, ms, seconds) {
  const win = DS.__win;
  let t = 20000;
  win.__t = t;
  DS.PostFX.setQuality('high', { quiet: true, persist: false });
  win.__t = t + 3000;                                    // past the warm-up
  DS.PostFX.track();                                     // the first call only sets the clock
  for (let i = 0; i < (seconds * 1000) / ms; i++) { win.__t += ms; DS.PostFX.track(); }
  return DS.PostFX.requested;
}

function withWindow() {
  const DS = load(['src/core/rng.js', 'src/core/settings.js', 'src/core/prefs.js', 'src/core/postfx.js'], STUBS + ';window.DS.__win = window;');
  return DS;
}

test('a 30 cap is not a slow machine; the same frames with no cap are', () => {
  let DS = withWindow();
  DS.Settings.set('gfx', 'fpsCap', '30');
  assert.equal(feed(DS, 33.4, 12), 'high', 'thirty frames a second under a 30 cap stays high');

  DS = withWindow();
  DS.Settings.set('gfx', 'fpsCap', 'max');
  assert.notEqual(feed(DS, 33.4, 12), 'high', 'thirty frames a second with no cap is a slow machine');
});

test('a machine slower than its cap is still lowered', () => {
  const DS = withWindow();
  DS.Settings.set('gfx', 'fpsCap', '30');
  assert.notEqual(feed(DS, 60, 12), 'high', 'sixteen frames a second under a 30 cap is slow');
});

test('a 60 cap on a fast panel stays high', () => {
  const DS = withWindow();
  DS.Settings.set('gfx', 'fpsCap', '60');
  assert.equal(feed(DS, 16.7, 12), 'high');
});

// --- the corruption of the endless laps ----------------------------------------------------------

test('corruption starts at nothing, holds what it is given, and cannot leave 0..1', () => {
  const DS = fresh('max');
  assert.equal(DS.PostFX.corruption, 0);
  DS.PostFX.setCorruption(0.6);
  assert.equal(DS.PostFX.corruption, 0.6);
  DS.PostFX.setCorruption(5);
  assert.equal(DS.PostFX.corruption, 1);
  DS.PostFX.setCorruption(-2);
  assert.equal(DS.PostFX.corruption, 0);
  DS.PostFX.setCorruption('nope');
  assert.equal(DS.PostFX.corruption, 0, 'not a number is not corruption');
  DS.PostFX.setCorruption(undefined);
  assert.equal(DS.PostFX.corruption, 0);
});
