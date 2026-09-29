/* Player settings: one small store for everything a player can change about how
   the game looks, sounds and is controlled, and for the choices they have made
   about the startup notice.

   Modules register the section they own with define(section, defaults, schema);
   the schema says what each value may be (number range, choice list, boolean),
   so a stale or hand-edited file can never put a bad value into the game. A
   change is applied at once by whoever listens (onChange), and written to
   localStorage; when storage is unavailable (private window, blocked site data)
   the game keeps working with the values it has for the session.

   Nothing in here affects the rules of the game, only its presentation. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const KEY = 'ds_settings';
  const VERSION = 1;

  const sections = {};      // name -> { defaults, schema }
  const values = {};        // name -> { key: value }
  const listeners = [];
  let loaded = false;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* A value is coerced to what the schema allows, or falls back to `fallback`.
       { type: 'number', min, max, step }   clamped, and rounded to the step
       { type: 'bool' }
       { type: 'choice', of: [...] }
       { type: 'string', max }              */
  function coerce(spec, v, fallback) {
    if (!spec) return v === undefined ? fallback : v;
    if (spec.type === 'bool') return typeof v === 'boolean' ? v : fallback;
    if (spec.type === 'number') {
      if (typeof v !== 'number' || !isFinite(v)) return fallback;
      let n = Math.min(spec.max, Math.max(spec.min, v));
      if (spec.step) n = Math.round(n / spec.step) * spec.step;
      return Math.round(n * 1e6) / 1e6;
    }
    if (spec.type === 'choice') return spec.of.indexOf(v) >= 0 ? v : fallback;
    if (spec.type === 'string') return typeof v === 'string' ? v.slice(0, spec.max || 64) : fallback;
    return fallback;
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && parsed.v === VERSION && parsed.s ? parsed.s : {};
    } catch (err) {
      return {};
    }
  }

  function write() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, s: values }));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* Register a section. Whatever was saved for it is merged over the defaults
     (and coerced), so adding a setting in a later version needs no migration. */
  function define(section, defaults, schema) {
    if (!loaded) { Object.assign(values, read()); loaded = true; }
    sections[section] = { defaults: clone(defaults), schema: schema || {} };
    const saved = values[section] && typeof values[section] === 'object' ? values[section] : {};
    const out = {};
    for (const k in defaults) {
      out[k] = coerce(sections[section].schema[k], saved[k], defaults[k]);
    }
    values[section] = out;
    return out;
  }

  function get(section, key) {
    const s = values[section];
    if (!s) return undefined;
    return key === undefined ? s : s[key];
  }

  function fire(section, key, value, old) {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](section, key, value, old); } catch (err) { /* a listener must not break a change */ }
    }
  }

  function set(section, key, value) {
    const sec = sections[section];
    if (!sec || !(key in sec.defaults)) return false;
    const next = coerce(sec.schema[key], value, values[section][key]);
    const old = values[section][key];
    if (next === old) return false;
    values[section][key] = next;
    write();
    fire(section, key, next, old);
    return true;
  }

  function reset(section) {
    const names = section ? [section] : Object.keys(sections);
    for (let i = 0; i < names.length; i++) {
      const sec = sections[names[i]];
      if (!sec) continue;
      for (const k in sec.defaults) set(names[i], k, sec.defaults[k]);
    }
  }

  function onChange(fn) { listeners.push(fn); }

  function schemaOf(section, key) {
    const sec = sections[section];
    return sec ? sec.schema[key] : undefined;
  }

  DS.Settings = {
    define: define, get: get, set: set, reset: reset, onChange: onChange, schemaOf: schemaOf,
    coerce: coerce, KEY: KEY, VERSION: VERSION,
    sections: function () { return Object.keys(sections); }
  };

  /* The startup notice's own section: what the player chose, and whether they
     asked not to see it again. `ver` is the version of the text they answered;
     a materially changed notice raises NOTICE_VERSION and is shown once more. */
  define('notice', { ack: 0, hide: false, ver: 0 }, {
    ack: { type: 'number', min: 0, max: 2, step: 1 },     // 0 unanswered, 1 agreed, 2 declined
    hide: { type: 'bool' },
    ver: { type: 'number', min: 0, max: 999, step: 1 }
  });
})(window.DS);
