/* Loads the game's classic-script modules into a Node vm sandbox, the same way
   tools/solve-levels.js does, so a test can exercise the real code without a
   browser. Every module hangs itself off window.DS; the sandbox IS window. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* A callable, writable, infinitely deep placeholder for the art and audio
   namespaces that gameplay modules touch at load time but never need to draw. */
const AUTO_STUB =
  'function autoStub() {' +
  '  return new Proxy(function () { return autoStub(); }, {' +
  '    get: function (t, k) {' +
  '      if (k === "uw" || k === "uh") return 16;' +
  '      if (k === "frames") return [1, 2, 3];' +
  '      if (!(k in t)) Object.defineProperty(t, k, { value: autoStub(), writable: true, configurable: true });' +
  '      return t[k];' +
  '    },' +
  '    set: function (t, k, v) { t[k] = v; return true; }' +
  '  });' +
  '}';

function load(files, stubs) {
  const sandbox = {
    console: console, Math: Math, JSON: JSON, Date: Date,
    Uint8Array: Uint8Array, Int8Array: Int8Array, Float32Array: Float32Array,
    Uint16Array: Uint16Array, Int16Array: Int16Array, Uint32Array: Uint32Array,
    Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean,
    Set: Set, Map: Map, WeakMap: WeakMap, Symbol: Symbol, Error: Error, Proxy: Proxy,
    isNaN: isNaN, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(AUTO_STUB + ';window.DS = window.DS || {};' + (stubs || ''), sandbox, { filename: 'stubs' });
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window.DS;
}

/* The item layer: weapons, affixes, loot, armour and the bag. */
function loadItems() {
  return load([
    'src/core/rng.js',
    'src/systems/boons.js',
    'src/items/weapons.js',
    'src/items/affixes.js',
    'src/items/generator.js',
    'src/items/armor.js',
    'src/items/inventory.js'
  ], 'window.DS.Audio = autoStub(); window.DS.Art = autoStub(); window.DS.SPR = autoStub();');
}

module.exports = { load, loadItems, ROOT };
