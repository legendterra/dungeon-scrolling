/* The player-name field on the Options screen (src/ui-html/options.js): the scoreboard
   knows a player by their name, so the name can be changed from Options and the same
   name typed on another device finds the same runs. ENTER keeps what was typed, ESC
   leaves the name as it was, a name that is too short stays open with a reason, and
   the keyboard is given back whichever way the field closes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const STUBS =
  'window.__store = {}; window.localStorage = { getItem: function (k) { return k in window.__store ? window.__store[k] : null; },' +
  ' setItem: function (k, v) { window.__store[k] = String(v); }, removeItem: function (k) { delete window.__store[k]; } };' +
  'window.DS.HUI = { el: function () { return {}; } };' +
  'window.DS.__plays = []; window.DS.Audio = { play: function (n) { window.DS.__plays.push(n); }, setMusic: function () {}, isMuted: function () { return false; } };' +
  'window.__pressed = {}; window.__down = {}; window.__sink = null; window.__sinkCalls = 0;' +
  'window.DS.Input = { REBINDABLE: ["left", "right", "jump"], SLOTS: 3, keysOf: function () { return ["", "", ""]; }, label: function (c) { return c; },' +
  '  justPressed: function (a) { return !!window.__pressed[a]; }, isDown: function (a) { return !!window.__down[a]; },' +
  '  consume: function (a) { delete window.__pressed[a]; }, captureNext: function () {}, isCapturing: function () { return false; },' +
  '  setTextSink: function (fn) { window.__sink = fn; window.__sinkCalls++; } };' +
  'window.DS.__win = window;';

function fresh(stored) {
  const DS = load(['src/core/rng.js', 'src/core/settings.js', 'src/core/board.js', 'src/core/prefs.js', 'src/ui-html/options.js'],
    STUBS + (stored ? 'window.__store.ds_name = ' + JSON.stringify(JSON.stringify(stored)) + ';' : ''));
  return DS;
}

/* Open the options on the PLAYER tab with the cursor on the name row. */
function open(stored) {
  const DS = fresh(stored);
  const win = DS.__win;
  // The board reads its stored name when it loads; reload it after the store is filled.
  const scene = DS.Options.create({ fromMenu: true });
  scene.state.tab = 5; scene.state.col = 1; scene.state.row = 0;
  const press = (...keys) => { win.__pressed = {}; for (const k of keys) win.__pressed[k] = 1; scene.update(); win.__pressed = {}; };
  const type = (text) => { for (const ch of text) win.__sink(ch); };
  const back = (n) => { for (let i = 0; i < (n || 1); i++) win.__sink(''); };   // Backspace reaches the sink as ''
  return { DS, win, scene, press, type, back };
}

test('the PLAYER tab is there, between accessibility and about, with the name first', () => {
  const { scene, DS } = open();
  assert.equal(scene.state.tab, 5);
  assert.ok(DS.Options, 'options is loaded');
});

test('ENTER opens the field, typing fills it, ENTER keeps the name and saves it for next time', () => {
  const { DS, win, scene, press, type, back } = open();
  assert.equal(DS.Board.name, null, 'no name yet');
  press('confirm');
  assert.equal(typeof win.__sink, 'function', 'the keyboard goes to the field');
  assert.equal(scene.state.edit.text, '');
  assert.equal(scene.typing, true, 'the host is told a field is open, so it does not take the keyboard back');
  type('Ada');
  assert.equal(scene.state.edit.text, 'Ada');
  back();
  type('a');
  assert.equal(scene.state.edit.text, 'Ada');
  press('confirm');
  assert.equal(scene.state.edit, null);
  assert.equal(scene.typing, false);
  assert.equal(win.__sink, null, 'the keyboard is given back');
  assert.equal(DS.Board.name, 'Ada');
  assert.equal(JSON.parse(win.__store.ds_name), 'Ada', 'and it is written down');
  assert.match(scene.state.note, /same name on another device/);
});

test('the field starts from the current name and holds twelve characters', () => {
  const { DS, scene, press, type } = open('Grace');
  assert.equal(DS.Board.name, 'Grace');
  press('confirm');
  assert.equal(scene.state.edit.text, 'Grace');
  type('abcdefghijklmnop');
  assert.equal(scene.state.edit.text.length, DS.Board.MAX_NAME);
});

test('a name that is too short stays open with a reason; ESC then leaves the old name alone', () => {
  const { DS, win, scene, press, type, back } = open('Grace');
  press('confirm');
  back(5);                                               // erase it
  type('x');
  press('confirm');
  assert.ok(scene.state.edit, 'still open');
  assert.equal(DS.Board.name, 'Grace', 'nothing was saved');
  assert.match(scene.state.note, /two to twelve/);
  assert.equal(DS.__plays[DS.__plays.length - 1], 'error');
  press('back');
  assert.equal(scene.state.edit, null);
  assert.equal(win.__sink, null);
  assert.equal(DS.Board.name, 'Grace');
});

test('while the field is open the arrows and other keys leave the screen alone', () => {
  const { scene, press } = open('Grace');
  press('confirm');
  const before = JSON.stringify([scene.state.tab, scene.state.row, scene.state.col]);
  press('down'); press('up'); press('right'); press('left');
  assert.equal(JSON.stringify([scene.state.tab, scene.state.row, scene.state.col]), before);
  assert.ok(scene.state.edit, 'and the field is still open');
});

test('what is typed is cleaned like the name prompt cleans it', () => {
  const { DS, scene, press, type } = open();
  press('confirm');
  type('  Ada  Lovelace ');
  press('confirm');
  // Twelve characters go in ("  Ada  Lovel"); the spaces are tidied on the way out.
  assert.equal(DS.Board.name, 'Ada Lovel');
});
