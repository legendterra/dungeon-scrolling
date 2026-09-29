/* The one server-side piece of Dungeon Scrolling: a leaderboard.
 *
 * The game itself is still a static site -- index.html, libs/ and src/ are
 * served by the assets binding exactly as before. This Worker only owns two
 * routes, and `run_worker_first` in wrangler.jsonc makes sure /api/* always
 * reaches here even if an asset ever has a matching path:
 *
 *   GET  /api/top    -> the ten best runs, best-first
 *   GET  /api/board  -> one page of the ladder, and where a given name stands
 *   POST /api/score  -> record a finished run, answer with its rank
 *
 * Everything that arrives is untrusted: the client is a game anybody can edit.
 * So each field is coerced into the range the column can hold, the name is
 * stripped to printable ASCII, and a run that claims more depth than the
 * dungeon has is dropped rather than stored. That is not a defence against a
 * determined cheater -- nothing client-side can be -- it just means a typo or a
 * stale build cannot poison the table. */

const MAX_NAME = 12;
const TOP_N = 10;
const PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 25;
/* The dungeon no longer has a bottom: three acts of ten, then an endless
 * descent. The cap is a sanity bound on a number a client can type, not the
 * depth of the dungeon - a four-digit depth is a stale build or a forged post. */
const MAX_DEPTH = 999;
const MAX_KILLS = 9999;
const MAX_FRAMES = 12 * 60 * 60 * 60;      // 12 h of 60 fps frames

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // The ladder is read on a menu screen; a minute of caching is invisible
      // to the player and takes the read load off the database entirely.
      'cache-control': 'public, max-age=60'
    }
  });
}

function fail(message, status) {
  return json({ ok: false, error: message }, status || 400);
}

function readName(raw) {
  if (typeof raw !== 'string') return null;
  // Keep the printable range only: no control characters, no zero-width
  // tricks, nothing that would break the fixed-width row on the death screen.
  const clean = raw.replace(/[^\x20-\x7E]/g, '').trim().slice(0, MAX_NAME);
  return clean.length >= 2 ? clean : null;
}

/* Depth is the ranking key, so it is validated rather than coerced: a
 * fraction, a string or an out-of-range number is refused outright instead of
 * being clamped onto the top of the ladder. */
function readDepth(v) {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < 1 || v > MAX_DEPTH) return null;
  return v;
}

function readInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function shape(row, rank) {
  return {
    rank: rank,
    name: row.name,
    depth: row.depth,
    kills: row.kills,
    coins: row.coins,
    frames: row.frames,
    cleared: !!row.cleared,
    at: row.created_at
  };
}

/* The ladder's order, in one place: deeper first, then more kills, then the
 * older run wins, and the row id breaks any tie left so a rank never wobbles. */
const LADDER = 'ORDER BY depth DESC, kills DESC, created_at ASC, id ASC';

async function top(env, limit) {
  return page(env, 0, limit);
}

async function page(env, index, size) {
  const res = await env.DB.prepare(
    'SELECT name, depth, kills, coins, frames, cleared, created_at ' +
    'FROM scores ' + LADDER + ' LIMIT ? OFFSET ?'
  ).bind(size, index * size).all();
  return (res.results || []).map((row, i) => shape(row, index * size + i + 1));
}

/* Where a name stands: its best run, and how many runs are better than it.
 * Names are not identities -- anyone may type any name -- so this is "the best
 * run under this name", which is what a player means by "where am I". */
async function standing(env, name) {
  const best = await env.DB.prepare(
    'SELECT id, name, depth, kills, coins, frames, cleared, created_at ' +
    'FROM scores WHERE name = ?1 COLLATE NOCASE ' + LADDER + ' LIMIT 1'
  ).bind(name).first();
  if (!best) return null;
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM scores ' +
    'WHERE depth > ?1 OR (depth = ?1 AND kills > ?2) ' +
    '   OR (depth = ?1 AND kills = ?2 AND created_at < ?3) ' +
    '   OR (depth = ?1 AND kills = ?2 AND created_at = ?3 AND id < ?4)'
  ).bind(best.depth, best.kills, best.created_at, best.id).first();
  return shape(best, (ahead && ahead.n ? ahead.n : 0) + 1);
}

/* GET /api/board?page=0&size=10&name=ADA */
async function board(url, env) {
  const size = readInt(url.searchParams.get('size') || PAGE_SIZE, 5, MAX_PAGE_SIZE);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first();
  const total = count && count.n ? count.n : 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const index = Math.min(pages - 1, readInt(url.searchParams.get('page') || 0, 0, 100000));
  const name = readName(url.searchParams.get('name'));
  return {
    ok: true, page: index, pages: pages, size: size, total: total,
    rows: await page(env, index, size),
    me: name ? await standing(env, name) : null
  };
}

/* Rows kept in the table: fifty pages of ten. The cap is what keeps a free-plan
 * database from growing forever. Trimmed after each insert, cheaply and only
 * when it is worth it. */
const KEEP_ROWS = 500;

async function trim(env) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first();
  if (!count || count.n <= KEEP_ROWS) return;
  await env.DB.prepare(
    'DELETE FROM scores WHERE id NOT IN (' +
    'SELECT id FROM scores ' + LADDER + ' LIMIT ?)'
  ).bind(KEEP_ROWS).run();
}

async function postScore(req, env) {
  let body;
  try {
    body = await req.json();
  } catch (err) {
    return fail('body must be JSON');
  }
  if (!body || typeof body !== 'object') return fail('body must be an object');

  const name = readName(body.name);
  if (!name) return fail('name must be 2-12 printable characters');

  const depth = readDepth(body.depth);
  if (depth === null) return fail('depth must be a whole number from 1 to ' + MAX_DEPTH);

  const row = {
    name: name,
    depth: depth,
    kills: readInt(body.kills, 0, MAX_KILLS),
    coins: readInt(body.coins, 0, MAX_KILLS),
    frames: readInt(body.frames, 0, MAX_FRAMES),
    cleared: body.cleared ? 1 : 0
  };

  await env.DB.prepare(
    'INSERT INTO scores (name, depth, kills, coins, frames, cleared) ' +
    'VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(row.name, row.depth, row.kills, row.coins, row.frames, row.cleared).run();

  /* Rank first, then the trim: the answer belongs to the run that was just
   * written, and the trim only ever drops runs worse than the five hundredth.
   * last_insert_rowid() is the row just written, so `id <` counts the runs
   * that were already there and a tie on depth and kills stays stable. */
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM scores ' +
    'WHERE depth > ?1 OR (depth = ?1 AND kills > ?2) ' +
    '   OR (depth = ?1 AND kills = ?2 AND id < last_insert_rowid())'
  ).bind(row.depth, row.kills).first();

  await trim(env);

  return json({
    ok: true,
    rank: (ahead && ahead.n ? ahead.n : 0) + 1,
    rows: await top(env, TOP_N)
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    try {
      if (url.pathname === '/api/top') {
        return json({ ok: true, rows: await top(env, TOP_N) });
      }
      if (url.pathname === '/api/board') {
        return json(await board(url, env));
      }
      if (url.pathname === '/api/score') {
        if (req.method !== 'POST') return fail('use POST', 405);
        return await postScore(req, env);
      }
    } catch (err) {
      // A database hiccup must not take the game down with it: the static
      // assets are still served below, and the client falls back to its own
      // records when /api/* answers with anything but rows.
      return fail('ladder unavailable: ' + err.message, 503);
    }

    return env.ASSETS.fetch(req);
  }
};
