/* The startup notice's input (src/ui-html/notice.js): "do not show again" is
   ticked by Space or the pad's Y and by nothing that also scrolls or confirms,
   and it starts from what is already stored, so reading the notice again and
   agreeing cannot quietly switch a stored choice off. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const STUBS =
  'window.__store = {}; window.localStorage = { getItem: function (k) { return k in window.__store ? window.__store[k] : null; },' +
  ' setItem: function (k, v) { window.__store[k] = String(v); }, removeItem: function (k) { delete window.__store[k]; } };' +
  'window.DS.HUI = { el: function () { return {}; } };' +
  'window.DS.Audio = { play: function () {}, setMusic: function () {} };' +
  'window.__pressed = {}; window.__down = {};' +
  'window.DS.Input = { justPressed: function (a) { return !!window.__pressed[a]; }, isDown: function (a) { return !!window.__down[a]; },' +
  ' consume: function (a) { delete window.__pressed[a]; }, pressedCode: function (c) { return !!window.__pressed["code:" + c]; } };' +
  'window.DS.__win = window;';

function fresh() {
  const DS = load(['src/core/rng.js', 'src/core/settings.js', 'src/ui-html/notice.js'], STUBS);
  const win = DS.__win;
  const tap = (scene, ...keys) => { win.__pressed = {}; for (const k of keys) win.__pressed[k] = 1; scene.update(); win.__pressed = {}; };
  return { DS, tap };
}

test('Up, W and the pad\'s A are jump keys; none of them ticks the box', () => {
  const { DS, tap } = fresh();
  const scene = DS.Notice.createScene(() => {});
  assert.equal(scene.state.hide, false);
  tap(scene, 'jump');                                   // what Up / W / A raise
  assert.equal(scene.state.hide, false, 'a jump-key tap leaves it alone');
  tap(scene, 'jump', 'up');
  assert.equal(scene.state.hide, false);
});

test('Space and the pad\'s Y tick and untick it', () => {
  const { DS, tap } = fresh();
  const scene = DS.Notice.createScene(() => {});
  tap(scene, 'code:Space');
  assert.equal(scene.state.hide, true);
  tap(scene, 'code:Space');
  assert.equal(scene.state.hide, false);
  tap(scene, 'code:PAD3');
  assert.equal(scene.state.hide, true);
});

test('it starts from the stored choice, and agreeing keeps it', () => {
  const { DS, tap } = fresh();
  DS.Notice.record(1, true);                            // the player asked not to see it again
  const scene = DS.Notice.createScene(() => {});
  assert.equal(scene.state.hide, true, 'the box starts ticked');
  scene.state.read = true;
  tap(scene, 'confirm');                                // I AGREE (focus starts there)
  assert.equal(DS.Settings.get('notice', 'hide'), true, 'agreeing did not turn it off');
  assert.equal(DS.Settings.get('notice', 'ack'), 1);
});

test('agreeing with the box unticked leaves the notice to come back', () => {
  const { DS, tap } = fresh();
  const scene = DS.Notice.createScene(() => {});
  scene.state.read = true;
  tap(scene, 'confirm');
  assert.equal(DS.Settings.get('notice', 'hide'), false);
  assert.equal(DS.Notice.needed(), true, 'it will be shown again next launch');
});
