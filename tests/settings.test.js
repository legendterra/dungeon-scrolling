/* The settings store (src/core/settings.js) and the startup notice's rules
   (src/ui-html/notice.js): values are coerced to their schema, survive a reload,
   survive a missing or broken localStorage, and the notice comes back when its
   text changes or it was never answered. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* A localStorage that can be swapped for a broken one. */
function stubs(store, broken) {
  return 'window.__store = ' + JSON.stringify(store || {}) + ';' +
    'window.localStorage = { getItem: function (k) { if (window.__broken) throw new Error("blocked"); return k in window.__store ? window.__store[k] : null; },' +
    '  setItem: function (k, v) { if (window.__broken) throw new Error("blocked"); window.__store[k] = String(v); },' +
    '  removeItem: function (k) { delete window.__store[k]; } };' +
    'window.__broken = ' + (broken ? 'true' : 'false') + ';' +
    'window.DS.HUI = { el: function () { return {}; } }; window.DS.__store = window.__store;';
}

function fresh(store, broken) {
  return load(['src/core/rng.js', 'src/core/settings.js'], stubs(store, broken));
}

test('a section registers with defaults and reads back', () => {
  const DS = fresh();
  DS.Settings.define('gfx', { quality: 'high', bloom: 0.6, fps: true },
    { quality: { type: 'choice', of: ['low', 'medium', 'high'] }, bloom: { type: 'number', min: 0, max: 1, step: 0.05 }, fps: { type: 'bool' } });
  assert.equal(DS.Settings.get('gfx', 'quality'), 'high');
  assert.equal(DS.Settings.get('gfx', 'bloom'), 0.6);
  assert.equal(JSON.stringify(DS.Settings.get('gfx')), JSON.stringify({ quality: 'high', bloom: 0.6, fps: true }));
});

test('a value is clamped, rounded to its step and refused when it is the wrong kind', () => {
  const DS = fresh();
  DS.Settings.define('gfx', { quality: 'high', bloom: 0.6, fps: true },
    { quality: { type: 'choice', of: ['low', 'medium', 'high'] }, bloom: { type: 'number', min: 0, max: 1, step: 0.05 }, fps: { type: 'bool' } });
  DS.Settings.set('gfx', 'bloom', 7);
  assert.equal(DS.Settings.get('gfx', 'bloom'), 1);
  DS.Settings.set('gfx', 'bloom', 0.523);
  assert.equal(DS.Settings.get('gfx', 'bloom'), 0.5);
  DS.Settings.set('gfx', 'quality', 'ultra');           // not a choice: unchanged
  assert.equal(DS.Settings.get('gfx', 'quality'), 'high');
  DS.Settings.set('gfx', 'fps', 'yes');                 // not a bool: unchanged
  assert.equal(DS.Settings.get('gfx', 'fps'), true);
  DS.Settings.set('gfx', 'bloom', NaN);
  assert.equal(DS.Settings.get('gfx', 'bloom'), 0.5);
  assert.equal(DS.Settings.set('gfx', 'nope', 1), false, 'an unknown key is ignored');
});

test('listeners hear a change once, with the old value, and a no-op is silent', () => {
  const DS = fresh();
  DS.Settings.define('audio', { master: 0.8 }, { master: { type: 'number', min: 0, max: 1, step: 0.1 } });
  const heard = [];
  DS.Settings.onChange((s, k, v, old) => heard.push([s, k, v, old]));
  DS.Settings.set('audio', 'master', 0.5);
  DS.Settings.set('audio', 'master', 0.5);
  assert.equal(JSON.stringify(heard), JSON.stringify([['audio', 'master', 0.5, 0.8]]));
});

test('values survive a reload, and a stale or hand-edited file cannot inject a bad value', () => {
  let DS = fresh();
  DS.Settings.define('gfx', { bloom: 0.6, quality: 'high' },
    { bloom: { type: 'number', min: 0, max: 1, step: 0.05 }, quality: { type: 'choice', of: ['low', 'high'] } });
  DS.Settings.set('gfx', 'bloom', 0.25);
  const saved = JSON.parse(JSON.stringify(DS.__store));
  DS = fresh(saved);
  DS.Settings.define('gfx', { bloom: 0.6, quality: 'high' },
    { bloom: { type: 'number', min: 0, max: 1, step: 0.05 }, quality: { type: 'choice', of: ['low', 'high'] } });
  assert.equal(DS.Settings.get('gfx', 'bloom'), 0.25);

  const evil = { ds_settings: JSON.stringify({ v: 1, s: { gfx: { bloom: 999, quality: '<script>', extra: 1 } } }) };
  DS = fresh(evil);
  DS.Settings.define('gfx', { bloom: 0.6, quality: 'high' },
    { bloom: { type: 'number', min: 0, max: 1, step: 0.05 }, quality: { type: 'choice', of: ['low', 'high'] } });
  assert.equal(DS.Settings.get('gfx', 'bloom'), 1, 'clamped');
  assert.equal(DS.Settings.get('gfx', 'quality'), 'high', 'refused');
  assert.equal(DS.Settings.get('gfx', 'extra'), undefined);

  DS = fresh({ ds_settings: '{not json' });
  DS.Settings.define('gfx', { bloom: 0.6 }, { bloom: { type: 'number', min: 0, max: 1 } });
  assert.equal(DS.Settings.get('gfx', 'bloom'), 0.6, 'corrupt JSON falls back to defaults');
});

test('blocked storage does not break the game: values live for the session', () => {
  const DS = fresh({}, true);
  DS.Settings.define('gfx', { bloom: 0.6 }, { bloom: { type: 'number', min: 0, max: 1, step: 0.05 } });
  assert.doesNotThrow(() => DS.Settings.set('gfx', 'bloom', 0.3));
  assert.equal(DS.Settings.get('gfx', 'bloom'), 0.3);
});

test('reset puts a section (or everything) back', () => {
  const DS = fresh();
  DS.Settings.define('gfx', { bloom: 0.6 }, { bloom: { type: 'number', min: 0, max: 1, step: 0.05 } });
  DS.Settings.set('gfx', 'bloom', 0.1);
  DS.Settings.reset('gfx');
  assert.equal(DS.Settings.get('gfx', 'bloom'), 0.6);
});

/* --- the notice --------------------------------------------------------------- */

function withNotice(store) {
  return load(['src/core/rng.js', 'src/core/settings.js', 'src/ui-html/notice.js'], stubs(store));
}

test('the notice is shown until it has been answered and hidden, and again when its text changes', () => {
  let DS = withNotice();
  assert.equal(DS.Notice.needed(), true, 'a first launch shows it');
  DS.Notice.record(1, false);
  assert.equal(DS.Notice.needed(), true, 'answered but not hidden: shown next launch too');
  DS.Notice.record(1, true);
  assert.equal(DS.Notice.needed(), false, 'agreed and hidden');
  DS.Notice.record(2, true);
  assert.equal(DS.Notice.needed(), false, 'declined and hidden: still no reason to nag');
  const saved = JSON.parse(JSON.stringify(DS.__store));
  DS = withNotice(saved);
  assert.equal(DS.Notice.needed(), false, 'it is remembered across a reload');
  // A newer text: everyone sees it once more.
  DS.Settings.set('notice', 'ver', 0);
  assert.equal(DS.Notice.needed(), true);
});

test('the notice text is complete, in English, and says what the player was promised', () => {
  const DS = withNotice();
  const text = DS.Notice.SECTIONS.map((s) => s.title + ' ' + s.text).join(' ') + DS.Notice.APOLOGY_TEXT;
  for (const must of [/artificial-intelligence/i, /research/i, /free/i, /no real-money/i, /not affiliated/i,
                      /stored/i, /leaderboard/i, /as is/i, /I AGREE/, /DECLINE/, /sorry/i, /Poly Haven/, /Options/]) {
    assert.ok(must.test(text), 'mentions ' + must);
  }
  assert.ok(DS.Notice.SECTIONS.length >= 6);
  assert.ok(text.length > 2200, 'long enough to be worth scrolling: ' + text.length);
});
