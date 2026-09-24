/* Who the player is, and how their runs rank against everyone else's.
 *
 * The ladder lives in Cloudflare D1 (worker/index.js) and is read over the same
 * origin as the game, so there is no key to ship and nothing to configure. The
 * game, however, must run from file://, from the local dev server, and from a
 * deploy whose database is momentarily down -- so every call here degrades to
 * records kept in localStorage instead of failing. `Board.online` says which of
 * the two the rows came from, and the death screen labels it honestly rather
 * than showing an empty table.
 *
 * Requests are fire-and-forget: nothing in the game ever waits on the network.
 * A run is answered for long after its author has left the death screen. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const NAME_KEY = 'ds_name';
  const LADDER_KEY = 'ds_ladder';     // last ladder the server sent
  const LOCAL_KEY = 'ds_runs';        // runs that could not be sent
  const MAX_NAME = 12;
  const KEEP_LOCAL = 20;
  const FETCH_MS = 4000;

  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* The one place a name is validated, on both sides of the wire: printable
     ASCII, 2..12 characters, trimmed. The Worker enforces the same rules, so a
     name that survives here cannot be rejected there. */
  function clean(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length < 2) return null;
    return s.slice(0, MAX_NAME);
  }

  /* Best first, and stable for equal runs: depth, then kills, then the older
     run wins, which is how the server orders its rows too. */
  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (b.depth !== a.depth) return b.depth - a.depth;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return (a.at || '').localeCompare(b.at || '');
    });
  }

  function withRanks(rows) {
    const sorted = sortRows(rows);
    for (let i = 0; i < sorted.length; i++) sorted[i].rank = i + 1;
    return sorted;
  }

  let name = clean(read(NAME_KEY, ''));
  if (name) write(NAME_KEY, name);

  /* rows() returns the best list we currently hold: the server's ladder if a
     fetch has ever succeeded, otherwise the local runs. */
  let server = read(LADDER_KEY, null);
  let local = read(LOCAL_KEY, []);
  let online = false;
  let shown = null;                    // in-flight fetch, so screens share one
  let fetchedAt = 0;

  function localRows() {
    return withRanks(local).filter(function (r) { return r.depth > 0; });
  }

  function rows() {
    if (server && server.length) return withRanks(server);
    return localRows();
  }

  function remember(run) {
    local.push(run);
    local = withRanks(local).slice(0, KEEP_LOCAL);
    write(LOCAL_KEY, local);
  }

  /* Records a finished run: server first, and on any failure the run is kept
     locally so the death screen still has something true to show. */
  function submit(run) {
    const entry = {
      name: name || 'PLAYER',
      depth: Math.max(0, run.depth | 0),
      kills: Math.max(0, run.kills | 0),
      coins: Math.max(0, run.coins | 0),
      frames: Math.max(0, run.frames | 0),
      cleared: !!run.cleared,
      at: new Date().toISOString()
    };
    if (entry.depth < 1) return Promise.resolve(shown);

    const body = JSON.stringify(entry);
    return post('/api/score', body).then(function (res) {
      if (!res || !res.rows) {
        remember(entry);
        return shown;
      }
      online = true;
      server = res.rows;
      fetchedAt = Date.now();
      write(LADDER_KEY, server);
      if (res.rank) shown = { rows: withRanks(server), rank: res.rank };
      return { rows: withRanks(server), rank: res.rank || 0 };
    }, function () {
      remember(entry);
      return { rows: localRows(), rank: 0, offline: true };
    });
  }

  function post(path, body) {
    return request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body });
  }

  function request(path, init) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const opts = Object.assign({}, init, { cache: 'no-store' });
    if (ctrl) {
      opts.signal = ctrl.signal;
      setTimeout(function () { ctrl.abort(); }, FETCH_MS);
    }
    return fetch(path, opts).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    });
  }

  /* Refresh the ladder, at most once every 20 s and never twice at a time, so
     opening the death screen repeatedly costs one request. */
  function refresh(force) {
    if (shown && !force) return Promise.resolve(shown);
    if (Date.now() - fetchedAt < 20000 && server) {
      return Promise.resolve({ rows: withRanks(server), rank: shown ? shown.rank : 0 });
    }
    return request('/api/top').then(function (res) {
      if (!res || !res.rows) throw new Error('bad ladder');
      online = true;
      server = res.rows;
      fetchedAt = Date.now();
      write(LADDER_KEY, server);
      shown = { rows: withRanks(server), rank: shown ? shown.rank : 0 };
      return shown;
    }, function () {
      online = false;
      shown = { rows: localRows(), rank: 0, offline: true };
      return shown;
    });
  }

  DS.Board = {
    MAX_NAME: MAX_NAME,
    clean: clean,
    get name() { return name; },
    hasName: function () { return !!name; },
    setName: function (raw) {
      const value = clean(raw);
      if (!value) return null;
      name = value;
      write(NAME_KEY, name);
      return name;
    },
    get online() { return online; },
    get last() { return server ? withRanks(server) : null; },
    rows: rows,
    localRows: localRows,
    submit: submit,
    refresh: refresh,
    /* Where `depth`/`kills` would sit in a list, 1-based, using the server's
       tie-break (the older run wins). Used before the server has answered. */
    rankFor: function (depth, kills) {
      const list = rows();
      let rank = 1;
      for (let i = 0; i < list.length; i++) {
        if (list[i].depth > depth || (list[i].depth === depth && list[i].kills > kills)) rank++;
      }
      return rank;
    }
  };
})(window.DS);
