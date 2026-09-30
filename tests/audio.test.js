const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./_load');

/* The procedural audio layer (src/core/audio.js) against a recording fake
   AudioContext: every sound the game asks for exists and runs, the helpers
   route to real sounds, and crowds are throttled. */

const FAKE = `
  window.DS.__nodes = [];
  function param() { return { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; }
  function node(kind) { const n = { kind: kind, connect() {}, start() { window.DS.__nodes.push(kind); }, stop() {},
    gain: param(), frequency: param(), Q: param() }; return n; }
  window.AudioContext = function () {
    this.sampleRate = 8000; this.currentTime = 0; this.destination = {};
    this.createGain = () => node('gain'); this.createOscillator = () => node('osc');
    this.createBufferSource = () => node('noise'); this.createBiquadFilter = () => node('filter');
    this.createBuffer = (c, len) => ({ getChannelData: () => new Float32Array(len) });
  };`;

function boot() {
  const DS = load(['src/core/audio.js'], FAKE);
  DS.Audio.unlock();
  return DS;
}

const SRC = path.join(__dirname, '..', 'src');
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

test('every sound the game plays by name is defined', () => {
  const DS = boot();
  const names = new Set(DS.Audio.sfxNames());
  const missing = [];
  for (const file of walk(SRC, [])) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/Audio\.play\('([A-Za-z]+)'/g)) if (!names.has(m[1])) missing.push(path.basename(file) + ':' + m[1]);
    for (const m of text.matchAll(/sfx: '([A-Za-z]+)'/g)) if (!names.has(m[1])) missing.push(path.basename(file) + ':sfx:' + m[1]);
  }
  assert.deepEqual(missing, []);
});

test('every sfx runs against the audio graph and makes sound', () => {
  const DS = boot();
  for (const name of DS.Audio.sfxNames()) {
    const before = DS.__nodes.length;
    assert.doesNotThrow(() => DS.Audio.play(name), name);
    assert.ok(DS.__nodes.length > before, name + ' started no oscillator or noise source');
  }
});

test('each element, boss and reaction style has a voice', () => {
  const DS = boot();
  const names = new Set(DS.Audio.sfxNames());
  for (const el of ['Fire', 'Ice', 'Lightning', 'Poison', 'Water', 'Earth', 'Leaf', 'Wind']) assert.ok(names.has('el' + el), el);
  for (const b of ['Warden', 'King', 'Arbiter', 'Wyrm', 'Lich', 'Magma', 'Minotaur', 'Medusa', 'Talos', 'Hades', 'Zeus']) assert.ok(names.has('roar' + b), b);
  for (const s of ['Chain', 'Shatter', 'Explosion', 'Vortex', 'Steam', 'Bloom']) assert.ok(names.has('react' + s), s);
});

test('helpers route to weapon, reaction and boss voices', () => {
  const DS = boot();
  // The helpers call the module-internal play; observe through the node count.
  const before = () => DS.__nodes.length;
  for (const w of ['sword', 'dagger', 'greataxe', 'spear', 'bow', 'staff', 'nonesuch']) {
    const n = before(); DS.Audio.swing(w, 'x', false); assert.ok(before() > n, 'swing ' + w);
  }
  let n = before(); DS.Audio.swing('sword', 'spin', false); assert.ok(before() > n, 'spin');
  n = before(); DS.Audio.swing('sword', 'x', true); assert.ok(before() > n, 'heavy');
  for (const w of ['sword', 'spear', 'staff', 'nonesuch']) {
    n = before(); DS.Audio.impact(w, true, false); assert.ok(before() > n, 'impact ' + w);
  }
  DS.FX3D = { REACTION_STYLE: { 'fire|ice': 'shatter' } };
  n = before(); DS.Audio.reaction('fire|ice'); assert.ok(before() > n, 'reaction');
  n = before(); DS.Audio.reaction('unknown|pair'); assert.ok(before() > n, 'reaction fallback');
  for (const b of ['warden', 'king', 'arbiter', 'wyrm', 'lich', 'magma', 'minotaur', 'medusa', 'talos', 'hades', 'zeus', 'unknown']) {
    n = before(); DS.Audio.roar(b); assert.ok(before() > n, 'roar ' + b);
  }
});

test('a burst of the same hit sound is throttled, distinct sounds are not', () => {
  const DS = boot();
  DS.Audio.play('hit');
  const one = DS.__nodes.length;
  for (let i = 0; i < 20; i++) DS.Audio.play('hit');
  assert.equal(DS.__nodes.length, one, 'same-frame repeats are dropped');
  DS.Audio.play('slam');
  assert.ok(DS.__nodes.length > one, 'a different sound still plays');
});

test('a muted game stays silent', () => {
  const DS = boot();
  DS.Audio.toggleMute();
  const n = DS.__nodes.length;
  DS.Audio.play('slam');
  DS.Audio.swing('sword', 'x', false);
  assert.equal(DS.__nodes.length, n);
});

test('torch crackle is silent when far and rate-limited when near', () => {
  const DS = boot();
  const n0 = DS.__nodes.length;
  DS.Audio.torchNear(500);
  assert.equal(DS.__nodes.length, n0);
  DS.Audio.torchNear(20);
  const n1 = DS.__nodes.length;
  assert.ok(n1 > n0);
  DS.Audio.torchNear(20);
  assert.equal(DS.__nodes.length, n1, 'the next crackle waits');
});

test('every kind of ambience is made of sounds that exist', () => {
  const DS = boot();
  const names = new Set(DS.Audio.sfxNames());
  const kinds = DS.Audio.ambienceKinds();
  assert.ok(kinds.length >= 15, kinds.length + ' kinds');
  for (const k of kinds) {
    const cues = DS.Audio.ambienceCues(k);
    assert.ok(cues.length >= 1, k + ' has a sound');
    for (const c of cues) assert.ok(names.has(c), k + ' names ' + c);
  }
});

test("a place's ambience plays at random gaps, and stops when it is taken away", () => {
  const DS = boot();
  const real = Date.now;
  let now = 1000000;
  Date.now = () => now;
  try {
    DS.Audio.setAmbience('cave');
    assert.equal(DS.Audio.ambience(), 'cave');
    const n0 = DS.__nodes.length;
    DS.Audio.update();
    assert.equal(DS.__nodes.length, n0, 'nothing on the first frame: the first sound waits its gap');
    now += 30000;
    DS.Audio.update();
    assert.ok(DS.__nodes.length > n0, 'a drip after the gap');
    const n1 = DS.__nodes.length;
    DS.Audio.update();
    assert.equal(DS.__nodes.length, n1, 'and the next one waits its own gap');
    DS.Audio.setAmbience(null);
    assert.equal(DS.Audio.ambience(), null);
    now += 60000;
    DS.Audio.update();
    assert.equal(DS.__nodes.length, n1, 'silence once the place is left');
    DS.Audio.setAmbience('no such place');
    assert.equal(DS.Audio.ambience(), null, 'an unknown kind is no ambience');
  } finally {
    Date.now = real;
  }
});
