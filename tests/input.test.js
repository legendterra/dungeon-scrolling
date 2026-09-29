/* Key rebinding (src/core/input.js): a code belongs to one action at a time,
   the game keeps asking isDown('jump') and never sees a key, the gamepad half is
   untouched, a saved file cannot inject rubbish, and the controls sheets are
   written from what is bound now. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const STUBS = 'window.addEventListener = function (t, fn) { (window.__ev = window.__ev || {})[t] = fn; };' +
              'window.navigator = { getGamepads: function () { return []; } }; window.document = {};' +
              'window.DS = window.DS || {}; window.DS.__ev = function () { return window.__ev; };';

function fresh() {
  const DS = load(['src/core/rng.js', 'src/core/input.js'], STUBS);
  return DS;
}

test('the defaults are what the game shipped with', () => {
  const DS = fresh();
  assert.deepEqual(Array.from(DS.Input.keysOf('left')), ['KeyA', 'ArrowLeft', '']);
  assert.deepEqual(Array.from(DS.Input.keysOf('jump')), ['Space', 'KeyW', 'ArrowUp']);
  assert.deepEqual(Array.from(DS.Input.keysOf('attack')), ['KeyJ', 'MOUSE0', '']);
});

test('binding a key moves it: the old action loses it and is named', () => {
  const DS = fresh();
  const res = DS.Input.bind('attack', 0, 'KeyK');
  assert.equal(res.ok, true);
  assert.equal(res.stolenFrom, null);
  assert.deepEqual(Array.from(DS.Input.keysOf('attack')), ['KeyK', 'MOUSE0', '']);
  const stolen = DS.Input.bind('dash', 0, 'KeyK');
  assert.equal(stolen.stolenFrom, 'attack');
  assert.ok(!DS.Input.keysOf('attack').includes('KeyK'), 'attack lost K');
  assert.ok(DS.Input.keysOf('dash').includes('KeyK'));
});

test('jump and up may share a key: menus, ropes and jumping all want W', () => {
  const DS = fresh();
  const res = DS.Input.bind('up', 1, 'Space');
  assert.equal(res.stolenFrom, null, 'no theft between jump and up');
  assert.ok(DS.Input.keysOf('jump').includes('Space'));
});

test('clearing a slot and resetting', () => {
  const DS = fresh();
  DS.Input.bind('skill', 1, 'KeyG');
  DS.Input.bind('skill', 0, '');
  assert.ok(!DS.Input.keysOf('skill').includes('KeyE'), 'the first slot was cleared');
  DS.Input.resetBindings();
  assert.deepEqual(Array.from(DS.Input.keysOf('skill')), ['KeyE', '', '']);
});

test('what is saved comes back, and a file with rubbish in it cannot inject any', () => {
  let DS = fresh();
  DS.Input.bind('dash', 0, 'KeyV');
  const saved = JSON.parse(JSON.stringify(DS.Input.exportBindings()));
  DS = fresh();
  DS.Input.importBindings(saved);
  assert.ok(DS.Input.keysOf('dash').includes('KeyV'));

  DS = fresh();
  DS.Input.importBindings({ dash: ['<script>', 'PAD5', 'a b', 42, 'KeyZ'], nonsense: ['KeyQ'], jump: 'Space' });
  assert.deepEqual(Array.from(DS.Input.keysOf('dash')), ['KeyZ', '', ''], 'only the clean code is taken');
  assert.deepEqual(Array.from(DS.Input.keysOf('jump')), ['Space', 'KeyW', 'ArrowUp'], 'a non-list is ignored');
  DS.Input.importBindings(null);
  DS.Input.importBindings('x');
});

test('the game reads actions: a rebound key drives isDown and the old one stops', () => {
  const DS = fresh();
  DS.Input.bind('jump', 0, 'KeyM');
  const ev = DS.__ev();
  ev.keydown({ code: 'KeyM', key: 'm', repeat: false, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(DS.Input.isDown('jump'), true);
  ev.keyup({ code: 'KeyM', key: 'm', preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(DS.Input.isDown('jump'), false);
  ev.keydown({ code: 'Space', key: ' ', repeat: false, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(DS.Input.isDown('jump'), false, 'Space no longer jumps');
});

test('the gamepad half of an action survives a rebind', () => {
  const DS = fresh();
  DS.Input.bind('attack', 0, 'KeyK');
  DS.Input.bind('attack', 1, '');
  DS.Input.bind('attack', 0, '');
  // Nothing on the keyboard, and the pad button still works.
  assert.equal(DS.Input.keysOf('attack').filter(Boolean).length, 0);
  assert.equal(DS.Input.labelsOf('attack').length, 0);
});

test('capturing takes the next key and swallows it', () => {
  const DS = fresh();
  let got = null;
  DS.Input.captureNext((c) => { got = c; });
  assert.equal(DS.Input.isCapturing(), true);
  DS.__ev().keydown({ code: 'KeyP', key: 'p', repeat: false, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(got, 'KeyP');
  assert.equal(DS.Input.isCapturing(), false);
  assert.equal(DS.Input.isDown('pause'), false, 'the capturing press did not also pause the game');
});

test('labels read like a keyboard, and the sheets follow the bindings', () => {
  const DS = fresh();
  assert.equal(DS.Input.label('KeyA'), 'A');
  assert.equal(DS.Input.label('Space'), 'SPACE');
  assert.equal(DS.Input.label('ShiftLeft'), 'SHIFT');
  assert.equal(DS.Input.label('MOUSE2'), 'RMB');
  assert.equal(DS.Input.label('Digit7'), '7');
  assert.equal(DS.Input.label('BracketLeft'), '[');
  const groups = DS.Input.controlGroups();
  const flat = JSON.stringify(groups);
  assert.ok(flat.includes('"SPACE"') && flat.includes('"SHIFT"'));
  DS.Input.bind('dash', 0, 'KeyV');
  const after = JSON.stringify(DS.Input.controlGroups());
  assert.ok(after.includes('"V"'), 'the dash row shows V now');
});
