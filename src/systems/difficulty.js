/* The difficulty curve, in one place.

   Difficulty used to be scattered across the code as separate magic numbers:
   spawn weights in enemies.js, one hazard chance in hazards.js, a damage ramp in
   weapons.js, room counts in generator.js. Nothing could be tuned, and nothing
   agreed - depth 1 could roll three elites and a pit of doom while depth 8
   rolled four slimes.

   Everything now asks this module, so the whole game moves together when a
   number here moves. Two rules shape the curve:

     - Depth 1 and 2 are the TEACHING floors. They are pinned: few enemies, no
       hazards, no elites, short floors, a guaranteed useful first drop. A new
       player dies to their own mistakes there, not to a spawn table.
     - Growth is front-loaded then flattens. threat() is a power curve, but every
       quantity that feeds the player's screen (enemy count, hazards) is capped,
       and the growth that never stops is the one the player can out-play:
       enemy RANK, terrain span, and puzzle size.

   Pure functions, no state, seeded-callable: the same depth always yields the
   same numbers, so a seed replays identically and a headless QA pass can assert
   the curve is monotonic.
 */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;

  const FINAL_DEPTH = (DS.C && DS.C.FINAL_DEPTH) || 10;

  /* How hard the floor is, before anything is capped: a power curve, because
     nearly-flat ramps are what make late floors feel like early ones. */
  function threat(depth) {
    const t = M.clamp(depth, 1, FINAL_DEPTH);
    return Math.pow(t, 1.32);
  }

  /* --- the biome ladder -----------------------------------------------------

     Which shape of floor a depth is, decided by DEPTH, not by a dice roll.
     A run should read as a journey with a geography: you start on the coast and
     walk into a cave, the cave opens into a bog, the bog climbs a mountain, the
     mountain drains into flooded halls, and the last door is volcanic. Rolling
     the flavor randomly (the old behaviour) meant a lava floor at depth 2 and a
     beach at depth 9, which is how a dungeon stops feeling like a place. */
  const LADDER = [
    { depth: 1,  key: 'shore',    label: 'The Shore',        flavor: 'plain',    theme: 'shore' },
    { depth: 2,  key: 'cave',     label: 'The Cave Mouth',   flavor: 'carved',   theme: 'cave' },
    { depth: 3,  key: 'cave',     label: 'The Deep Cave',    flavor: 'carved',   theme: 'cave' },
    { depth: 4,  key: 'puzzle',   label: 'The Torch Hall',   flavor: 'plain',    theme: 'prison', puzzle: true },
    { depth: 5,  key: 'safe',     label: 'The Waystation',   flavor: 'safe',     theme: 'vault' },
    { depth: 6,  key: 'swamp',    label: 'The Rot Swamp',    flavor: 'flooded',  theme: 'swamp' },
    { depth: 7,  key: 'mountain', label: 'The Climb',        flavor: 'mountain', theme: 'mountain' },
    { depth: 8,  key: 'flooded',  label: 'The Sunk Halls',   flavor: 'flooded',  theme: 'flooded' },
    { depth: 9,  key: 'volcanic', label: 'The Ash Reaches',  flavor: 'carved',   theme: 'volcanic' },
    { depth: 10, key: 'boss',     label: 'The Throne',       flavor: 'boss',     theme: 'throne' }
  ];

  const BY_DEPTH = {};
  LADDER.forEach(function (b) { BY_DEPTH[b.depth] = b; });

  function biomeForDepth(depth) {
    return BY_DEPTH[M.clamp(depth, 1, FINAL_DEPTH)] || BY_DEPTH[1];
  }

  /* Depths 1 and 2 are the tutorial: every generator asks this before it rolls
     anything cruel. */
  function isTutorial(depth) {
    return depth <= 2;
  }

  /* --- the numbers ---------------------------------------------------------- */

  /* Enemy ranks are the ramping threat: counts cap out, rank does not. A depth
     10 floor is not a wall of bodies, it is the same crowd with better bones. */
  function rankWeights(depth) {
    if (isTutorial(depth)) {
      return [
        { weight: 100, value: 'normal' },
        { weight: 0, value: 'elite' },
        { weight: 0, value: 'miniboss' }
      ];
    }
    const t = depth;
    return [
      { weight: Math.max(34, 100 - t * 7), value: 'normal' },
      { weight: Math.max(10, (t - 2) * 6.5), value: 'elite' },
      { weight: t >= 6 ? (t - 5) * 3.4 : 0, value: 'miniboss' },
      { weight: t >= 8 ? (t - 7) * 1.4 : 0, value: 'colossal' }
    ];
  }

  /* Everything a level builder or spawner wants to know about a depth. */
  function forDepth(depth) {
    const t = M.clamp(depth, 1, FINAL_DEPTH);
    const tut = isTutorial(t);
    const th = threat(t);
    const biome = biomeForDepth(t);

    return {
      depth: t,
      biome: biome,
      tutorial: tut,

      /* Population. Capped, and deliberately flat from 7 on: the last floors
         get their teeth from ranks, hazards and terrain, not from body count. */
      enemyCount: tut ? 2 + Math.round(t)
                      : M.clamp(Math.round(2 + 1.35 * Math.pow(t, 1.2)), 4, 15),

      /* Enemy scaling. hpMult is mild on purpose - a longer fight is not a
         harder fight, and the ranks below already multiply it. */
      hpMult: 1 + 0.17 * Math.pow(t - 1, 1.05),
      damageMult: 1 + 0.11 * Math.pow(t - 1, 0.9),
      speedMult: 1 + 0.035 * (t - 1),

      /* Hazards. Zero while teaching; then per-room chance, plus how long a run
         of spikes is allowed to be (never longer than two jumps). */
      hazardChance: tut ? 0 : M.clamp(0.09 + 0.075 * Math.pow(t - 1, 1.15), 0, 0.85),
      hazardCount: tut ? 0 : Math.round(1 + (t - 2) * 0.45),
      spikeRunMax: tut ? 1 : 1 + Math.floor(t / 3),

      /* Terrain. Longer floors and taller climbs the deeper you go; the carver
         reads span and steps to decide how much up-and-down a floor has. */
      roomCount: M.clamp(6 + Math.round(t * 1.1), 6, 12),
      climbSteps: 3 + Math.round(t * 0.9),
      climbSpan: 6 + Math.round(t * 1.6),
      pitChance: tut ? 0.15 : M.clamp(0.3 + t * 0.06, 0, 0.8),

      /* Puzzles. Plate count is the whole difficulty knob of a puzzle room. */
      plates: tut ? 1 : M.clamp(2 + Math.floor((t - 2) / 2.5), 2, 3),
      crates: tut ? 1 : M.clamp(2 + Math.floor((t - 2) / 3), 2, 3),

      /* Light. OBROR is a scarce resource that gets scarcer: the deep floors are
         lit by their own ambience (crystals, lava, fireflies) rather than by a
         torch every few tiles. Tiles between scattered torches. */
      torchSpacing: Math.round(26 + t * 1.6),

      /* Loot. Chests get rarer but better, which keeps chest-opening exciting
         instead of routine. */
      chestKeep: M.clamp(0.72 - t * 0.012, 0.5, 0.72),
      rarityBias: (t - 1) * 0.42,

      /* Juice. Flash and shake budget grows a little with the stakes. */
      shakeScale: 1 + (t - 1) * 0.05
    };
  }

  DS.Difficulty = {
    forDepth: forDepth,
    biomeForDepth: biomeForDepth,
    isTutorial: isTutorial,
    rankWeights: rankWeights,
    threat: threat,
    LADDER: LADDER,
    get FINAL_DEPTH() { return FINAL_DEPTH; }
  };
})(window.DS);
