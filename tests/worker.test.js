/* The ladder Worker (worker/index.js) against a fake D1: the paged board, where
   a name stands, and the clamps on what a client may ask for. The fake answers
   only the statements the Worker writes, by their text -- it is a stand-in for
   the database, not a SQL engine. */
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeDb(rows) {
  const better = (a, b) =>
    a.depth !== b.depth ? b.depth - a.depth
    : a.kills !== b.kills ? b.kills - a.kills
    : a.created_at !== b.created_at ? (a.created_at < b.created_at ? -1 : 1)
    : a.id - b.id;
  const sorted = () => rows.slice().sort(better);
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async all() {
          if (/FROM scores ORDER BY/.test(sql) && /LIMIT \? OFFSET \?/.test(sql)) {
            const [size, offset] = args;
            return { results: sorted().slice(offset, offset + size) };
          }
          throw new Error('unexpected all(): ' + sql);
        },
        async first() {
          if (/SELECT COUNT\(\*\) AS n FROM scores$/.test(sql)) return { n: rows.length };
          if (/WHERE name = \?1 COLLATE NOCASE/.test(sql)) {
            const mine = rows.filter((r) => r.name.toLowerCase() === String(args[0]).toLowerCase()).sort(better);
            return mine[0] || null;
          }
          if (/SELECT COUNT\(\*\) AS n FROM scores WHERE depth > \?1/.test(sql)) {
            const [depth, kills, at, id] = args;
            const n = rows.filter((r) => r.depth > depth || (r.depth === depth && r.kills > kills) ||
              (r.depth === depth && r.kills === kills && r.created_at < at) ||
              (r.depth === depth && r.kills === kills && r.created_at === at && r.id < id)).length;
            return { n: n };
          }
          throw new Error('unexpected first(): ' + sql);
        }
      };
      return stmt;
    }
  };
}

function run(n, name, depth, kills, at) {
  return { id: n, name: name, depth: depth, kills: kills, coins: 0, frames: 600, cleared: 0,
           created_at: at || ('2026-09-2' + (n % 9) + ' 10:00:0' + (n % 10)) };
}

async function get(worker, env, qs) {
  const res = await worker.default.fetch(new Request('https://x.test/api/board' + (qs || '')), env);
  return res.json();
}

async function load() { return import('../worker/index.js'); }

test('an empty ladder is one empty page and nobody stands anywhere', async () => {
  const w = await load();
  const out = await get(w, { DB: fakeDb([]) });
  assert.equal(out.ok, true);
  assert.equal(out.pages, 1);
  assert.equal(out.total, 0);
  assert.equal(out.rows.length, 0);
  assert.equal(out.me, null);
});

test('pages hold ten, ranks continue across them, and the last page is short', async () => {
  const w = await load();
  const rows = [];
  for (let i = 1; i <= 25; i++) rows.push(run(i, 'P' + i, i, 5));   // depth 25 is best
  const env = { DB: fakeDb(rows) };
  const first = await get(w, env, '?page=0');
  assert.equal(first.pages, 3);
  assert.equal(first.rows.length, 10);
  assert.equal(first.rows[0].rank, 1);
  assert.equal(first.rows[0].depth, 25);
  const third = await get(w, env, '?page=2');
  assert.equal(third.rows.length, 5);
  assert.equal(third.rows[0].rank, 21);
  assert.equal(third.rows[4].depth, 1);
  const beyond = await get(w, env, '?page=99');
  assert.equal(beyond.page, 2, 'a page past the end lands on the last one');
  const neg = await get(w, env, '?page=-3');
  assert.equal(neg.page, 0);
});

test('a name finds its best run and its rank, on any page', async () => {
  const w = await load();
  const rows = [];
  for (let i = 1; i <= 25; i++) rows.push(run(i, 'P' + i, i, 5));
  rows.push(run(100, 'Ada', 14, 30));          // 12th best: depths 25..15 are 11 runs ahead
  rows.push(run(101, 'Ada', 3, 99));           // a worse run under the same name
  const env = { DB: fakeDb(rows) };
  const out = await get(w, env, '?page=0&name=Ada');
  assert.equal(out.me.name, 'Ada');
  assert.equal(out.me.depth, 14);
  assert.equal(out.me.rank, 12, 'eleven runs are deeper');
  const lower = await get(w, env, '?page=1&name=ada');
  assert.equal(lower.me.rank, 12, 'names match without regard to case');
  assert.equal(lower.rows[0].rank, 11, 'the second page starts at 11');
});

test('equal runs: the older one ranks first, and the rank is stable', async () => {
  const w = await load();
  const rows = [run(1, 'Old', 10, 40, '2026-09-01 10:00:00'), run(2, 'New', 10, 40, '2026-09-02 10:00:00'),
                run(3, 'Same', 10, 40, '2026-09-02 10:00:00')];
  const env = { DB: fakeDb(rows) };
  assert.equal((await get(w, env, '?name=Old')).me.rank, 1);
  assert.equal((await get(w, env, '?name=New')).me.rank, 2);
  assert.equal((await get(w, env, '?name=Same')).me.rank, 3, 'the row id breaks the last tie');
});

test('a name with no runs, or too short to be a name, stands nowhere', async () => {
  const w = await load();
  const env = { DB: fakeDb([run(1, 'Ada', 5, 5)]) };
  assert.equal((await get(w, env, '?name=Nobody')).me, null);
  assert.equal((await get(w, env, '?name=x')).me, null);
  assert.equal((await get(w, env, '?name=%00%01')).me, null);
});

test('what a client may ask for is clamped', async () => {
  const w = await load();
  const rows = [];
  for (let i = 1; i <= 60; i++) rows.push(run(i, 'P' + i, i, 1));
  const env = { DB: fakeDb(rows) };
  assert.equal((await get(w, env, '?size=1')).size, 5);
  assert.equal((await get(w, env, '?size=1000')).size, 25);
  assert.equal((await get(w, env, '?size=abc')).size, 5, 'not a number: the floor, never a crash');
  assert.equal((await get(w, env, '?page=abc')).page, 0);
  assert.equal((await get(w, env, '?size=10')).rows.length, 10);
});

test('a database failure answers 503 instead of taking the game down', async () => {
  const w = await load();
  const env = { DB: { prepare() { throw new Error('d1 is down'); } } };
  const res = await w.default.fetch(new Request('https://x.test/api/board'), env);
  assert.equal(res.status, 503);
});
