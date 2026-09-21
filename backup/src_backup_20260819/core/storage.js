/* Persistent records. Deliberately cosmetic only.
   The game is a pure roguelike: death restarts from depth 1 with nothing kept.
   Nothing in here is ever read back into gameplay — no meta-progression,
   no unlocks, no stat carryover. It only feeds the menu and game-over screens. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const KEY = 'ds_stats';

  const DEFAULTS = {
    bestDepth: 0,
    totalKills: 0,
    runs: 0,
    bestItemName: null,
    bestItemRarity: -1,
    fastestClearFrames: 0
  };

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return Object.assign({}, DEFAULTS);
      return Object.assign({}, DEFAULTS, parsed);
    } catch (err) {
      // Private browsing, disabled storage, or corrupt JSON — records are
      // optional, so degrade to defaults rather than breaking the game.
      console.warn('[DS] could not read records:', err.message);
      return Object.assign({}, DEFAULTS);
    }
  }

  function save(stats) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(stats));
      return true;
    } catch (err) {
      console.warn('[DS] could not write records:', err.message);
      return false;
    }
  }

  /* run: { depth, kills, cleared, frames, bestItem: {name, rarity} | null } */
  function recordRun(run) {
    const stats = load();

    stats.runs += 1;
    stats.totalKills += run.kills || 0;
    if ((run.depth || 0) > stats.bestDepth) stats.bestDepth = run.depth;

    if (run.bestItem && run.bestItem.rarity > stats.bestItemRarity) {
      stats.bestItemRarity = run.bestItem.rarity;
      stats.bestItemName = run.bestItem.name;
    }

    if (run.cleared && run.frames > 0) {
      if (!stats.fastestClearFrames || run.frames < stats.fastestClearFrames) {
        stats.fastestClearFrames = run.frames;
      }
    }

    save(stats);
    return stats;
  }

  function reset() {
    try {
      window.localStorage.removeItem(KEY);
    } catch (err) {
      console.warn('[DS] could not clear records:', err.message);
    }
    return Object.assign({}, DEFAULTS);
  }

  DS.Storage = { load, save, recordRun, reset, DEFAULTS };
})(window.DS);
