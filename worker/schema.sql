-- The leaderboard. One row per finished run; nothing else is stored.
--
--   npx wrangler d1 execute dungeon-scrolling --remote --file worker/schema.sql

CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  depth      INTEGER NOT NULL,
  kills      INTEGER NOT NULL DEFAULT 0,
  coins      INTEGER NOT NULL DEFAULT 0,
  frames     INTEGER NOT NULL DEFAULT 0,
  cleared    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- The only query the ladder runs, in the order it runs it.
CREATE INDEX IF NOT EXISTS scores_ladder ON scores (depth DESC, kills DESC);
