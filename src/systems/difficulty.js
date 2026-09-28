/* The difficulty curve, in one place.

   Difficulty used to be scattered across the code as separate magic numbers:
   spawn weights in enemies.js, one hazard chance in hazards.js, a damage ramp in
   weapons.js, room counts in generator.js. Nothing could be tuned, and nothing
   agreed - depth 1 could roll three elites and a pit of doom while depth 8
   rolled four slimes.

   Everything now asks this module, so the whole game moves together when a
   number here moves. Three rules shape the curve:

     - Depth 1 and 2 are the TEACHING floors. They are pinned: few enemies, no
       hazards, no elites, short floors, a guaranteed useful first drop. A new
       player dies to their own mistakes there, not to a spawn table.
     - Growth is front-loaded then flattens. threat() is a power curve, but every
       quantity that feeds the player's screen (enemy count, hazards) is capped,
       and the growth that never stops is the one the player can out-play:
       enemy RANK, enemy health, and the bosses.
     - There is no last floor. The run is three acts and then an endless
       descent (see DS.Acts in rng.js), so every number here is a FORMULA that
       keeps moving past depth 10 rather than a table clamped at it. The only
       things that stop at depth 10 are the terrain knobs: the carver and the
       level solver are tuned for one move set, and a climb taller than the
       hero can make is a broken floor, not a hard one.

   Pure functions, no state, seeded-callable: the same depth always yields the
   same numbers, so a seed replays identically and a headless QA pass can assert
   the curve is monotonic.
 */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;

  const FINAL_DEPTH = (DS.C && DS.C.FINAL_DEPTH) || 30;
  const ACT_LENGTH = (DS.C && DS.C.ACT_LENGTH) || 10;

  /* Terrain stops growing here: see the header. */
  const TERRAIN_CAP = 10;

  function depthOf(depth) {
    return Math.max(1, Math.floor(depth) || 1);
  }

  /* How hard the floor is, before anything is capped: a power curve, because
     nearly-flat ramps are what make late floors feel like early ones. */
  function threat(depth) {
    return Math.pow(depthOf(depth), 1.32);
  }

  /* --- the biome ladder -----------------------------------------------------

     Which shape of floor a depth is, decided by DEPTH, not by a dice roll.
     A run should read as a journey with a geography. Act I starts on the coast
     and walks into a cave, the cave opens into a bog, the bog climbs a
     mountain, the mountain drains into flooded halls and the last door is the
     throne. Act II goes DOWN - into the wet dark, the fens and the drowned
     halls under the first act. Act III comes up through fire: ash roads,
     burning peaks and the forge. Rolling the flavor randomly (the old
     behaviour) meant a lava floor at depth 2 and a beach at depth 9, which is
     how a dungeon stops feeling like a place.

     Boss depths (5 and 10 of each act) are 'boss' flavor: the boss room, lit
     in the theme of the boss that lives there. */
  const LADDER = [
    // ACT I - the descent
    { depth: 1,  key: 'shore',    label: 'The Shore',          flavor: 'plain',    theme: 'shore' },
    { depth: 2,  key: 'cave',     label: 'The Cave Mouth',     flavor: 'carved',   theme: 'cave' },
    { depth: 3,  key: 'cave',     label: 'The Deep Cave',      flavor: 'carved',   theme: 'cave' },
    { depth: 4,  key: 'puzzle',   label: 'The Torch Hall',     flavor: 'plain',    theme: 'prison', puzzle: true },
    { depth: 5,  key: 'vault',    label: 'The Warden\'s Gate', flavor: 'boss',     theme: 'vault' },
    { depth: 6,  key: 'swamp',    label: 'The Rot Swamp',      flavor: 'flooded',  theme: 'swamp' },
    { depth: 7,  key: 'mountain', label: 'The Climb',          flavor: 'mountain', theme: 'mountain' },
    { depth: 8,  key: 'flooded',  label: 'The Sunk Halls',     flavor: 'flooded',  theme: 'flooded' },
    { depth: 9,  key: 'volcanic', label: 'The Ash Reaches',    flavor: 'carved',   theme: 'volcanic' },
    { depth: 10, key: 'boss',     label: 'The Throne',         flavor: 'boss',     theme: 'throne' },

    // ACT II - the drowned deep
    { depth: 11, key: 'caves',    label: 'The Wet Dark',       flavor: 'carved',   theme: 'caves' },
    { depth: 12, key: 'swamp',    label: 'The Mire',           flavor: 'flooded',  theme: 'swamp' },
    { depth: 13, key: 'flooded',  label: 'The Drowned Stair',  flavor: 'flooded',  theme: 'flooded' },
    { depth: 14, key: 'cave',     label: 'The Glowworm Caves', flavor: 'carved',   theme: 'caves' },
    { depth: 15, key: 'vault',    label: 'The Arbiter\'s Court', flavor: 'boss',   theme: 'vault' },
    { depth: 16, key: 'swamp',    label: 'The Sinking Fen',    flavor: 'plain',    theme: 'swamp' },
    { depth: 17, key: 'nest',     label: 'The Brood Nest',     flavor: 'carved',   theme: 'nest' },
    { depth: 18, key: 'flooded',  label: 'The Black Lake',     flavor: 'flooded',  theme: 'flooded' },
    { depth: 19, key: 'caves',    label: 'The Frost Caves',    flavor: 'carved',   theme: 'caves' },
    { depth: 20, key: 'flooded',  label: 'The Wyrm\'s Hollow', flavor: 'boss',     theme: 'flooded' },

    // ACT III - the burning crown
    { depth: 21, key: 'volcanic', label: 'The Cinder Road',    flavor: 'carved',   theme: 'volcanic' },
    { depth: 22, key: 'mountain', label: 'The Burning Peak',   flavor: 'mountain', theme: 'mountain' },
    { depth: 23, key: 'volcanic', label: 'The Ash Vents',      flavor: 'carved',   theme: 'volcanic' },
    { depth: 24, key: 'prison',   label: 'The Ember Gaol',     flavor: 'plain',    theme: 'prison' },
    { depth: 25, key: 'nest',     label: 'The Lich\'s Chapel', flavor: 'boss',     theme: 'nest' },
    { depth: 26, key: 'mountain', label: 'The Cracked Summit', flavor: 'mountain', theme: 'mountain' },
    { depth: 27, key: 'volcanic', label: 'The Magma Galleries', flavor: 'carved',  theme: 'volcanic' },
    { depth: 28, key: 'throne',   label: 'The Gilded Halls',   flavor: 'plain',    theme: 'throne' },
    { depth: 29, key: 'volcanic', label: 'The Last Furnace',   flavor: 'carved',   theme: 'volcanic' },
    { depth: 30, key: 'volcanic', label: 'The Forge',          flavor: 'boss',     theme: 'volcanic' }
  ];

  const BY_DEPTH = {};
  LADDER.forEach(function (b) { BY_DEPTH[b.depth] = b; });
  const LADDER_END = LADDER[LADDER.length - 1].depth;

  /* Endless floors walk the three acts' geography again - shore, drowned
     deep, burning crown, shore - with the boss rungs landing on the endless
     boss depths because both repeat every five floors. The Torch Hall's
     puzzle and its one free bow belong to the first visit only. */
  const endlessCache = {};

  function biomeForDepth(depth) {
    const d = depthOf(depth);
    if (d <= LADDER_END) return BY_DEPTH[d] || BY_DEPTH[1];
    if (endlessCache[d]) return endlessCache[d];

    const src = BY_DEPTH[((d - LADDER_END - 1) % LADDER_END) + 1];
    const rung = {
      depth: d, key: src.key, label: src.label, flavor: src.flavor,
      theme: src.theme, endless: true
    };
    endlessCache[d] = rung;
    return rung;
  }

  /* Depths 1 and 2 are the tutorial: every generator asks this before it rolls
     anything cruel. Only the first time - the endless shore is not a lesson. */
  function isTutorial(depth) {
    return depth <= 2;
  }

  /* --- the bosses ------------------------------------------------------------

     Two per act, in a fixed order, and then the same six again in endless -
     each lap tougher than the last. The key is what the boss room spawns:
     'king' is the Slime King (entities/boss.js), everything else is a
     DS.Bosses kind. */
  const BOSS_ROTATION = ['warden', 'king', 'arbiter', 'wyrm', 'lich', 'magma'];

  function bossForDepth(depth) {
    const Acts = DS.Acts;
    const d = depthOf(depth);
    if (!Acts || !Acts.isBossDepth(d)) return null;

    let ordinal;
    if (Acts.isEndless(d)) {
      ordinal = BOSS_ROTATION.length + Acts.depthInAct(d) / DS.C.ENDLESS_BOSS_EVERY - 1;
    } else {
      ordinal = (Acts.actOf(d) - 1) * 2 + (Acts.depthInAct(d) === ACT_LENGTH ? 1 : 0);
    }
    return {
      key: BOSS_ROTATION[ordinal % BOSS_ROTATION.length],
      cycle: Math.floor(ordinal / BOSS_ROTATION.length),
      ordinal: ordinal,
      act: Acts.actOf(d),
      final: !Acts.isEndless(d) && Acts.depthInAct(d) === ACT_LENGTH
    };
  }

  /* Boss health. Linear, like the weapon damage ramp (weapons.js depthScale),
     so a boss at depth 30 takes about as many swings of a depth-30 weapon as
     the Slime King took of a depth-10 one. Every lap of the endless rotation
     adds a tenth on top: the rematch should be the harder fight. */
  function bossHpMult(depth) {
    const d = depthOf(depth);
    const lapLength = BOSS_ROTATION.length * ((DS.C && DS.C.ENDLESS_BOSS_EVERY) || 5);
    const lap = d > FINAL_DEPTH ? Math.floor((d - FINAL_DEPTH - 1) / lapLength) + 1 : 0;
    return (1 + (d - 1) * 0.26) * (1 + 0.1 * lap);
  }

  /* --- the numbers ---------------------------------------------------------- */

  /* Enemy ranks are the ramping threat: counts cap out, rank does not. Past
     depth 10 the shares keep drifting toward the ranked end, slowly and with
     a ceiling, so a normal monster is still the most common single rank at
     depth 60. */
  function rankWeights(depth) {
    if (isTutorial(depth)) {
      return [
        { weight: 100, value: 'normal' },
        { weight: 0, value: 'elite' },
        { weight: 0, value: 'miniboss' }
      ];
    }
    const t = depthOf(depth);
    const past = Math.max(0, t - 10);
    return [
      { weight: Math.max(34, 100 - t * 7), value: 'normal' },
      { weight: t <= 10 ? Math.max(10, (t - 2) * 6.5) : 52 + Math.min(30, past * 2), value: 'elite' },
      { weight: t < 6 ? 0 : t <= 10 ? (t - 5) * 3.4 : 17 + Math.min(15, past), value: 'miniboss' },
      { weight: t < 8 ? 0 : t <= 10 ? (t - 7) * 1.4 : 4.2 + Math.min(4, past * 0.3), value: 'colossal' }
    ];
  }

  /* Past depth 10 a formula keeps going, but anything paid in HEARTS keeps
     going slowly: the player has six of them, and enemy health is where the
     endless descent gets its teeth. */
  function damageMult(t) {
    const base = function (x) { return 1 + 0.11 * Math.pow(x - 1, 0.9); };
    if (t <= 10) return base(t);
    return base(10) + Math.min(0.75, 0.025 * (t - 10));
  }

  function speedMult(t) {
    if (t <= 10) return 1 + 0.035 * (t - 1);
    return 1 + 0.035 * 9 + Math.min(0.2, 0.01 * (t - 10));
  }

  function enemyCount(t, tut) {
    if (tut) return 2 + Math.round(t);
    const base = M.clamp(Math.round(2 + 1.35 * Math.pow(Math.min(t, 10), 1.2)), 4, 15);
    // One more body every four floors past the first act, up to five more.
    return base + (t > 10 ? Math.min(5, Math.floor((t - 10) / 4)) : 0);
  }

  /* Everything a level builder or spawner wants to know about a depth. */
  function forDepth(depth) {
    const t = depthOf(depth);
    const tt = Math.min(t, TERRAIN_CAP);
    const tut = isTutorial(t);
    const biome = biomeForDepth(t);

    return {
      depth: t,
      biome: biome,
      tutorial: tut,

      /* Population. Capped through the first act, then a slow trickle: the
         last floors get their teeth from ranks, hazards and health, not from
         body count. */
      enemyCount: enemyCount(t, tut),

      /* Enemy scaling. hpMult is mild on purpose - a longer fight is not a
         harder fight, and the ranks below already multiply it. It is the one
         curve that never flattens, because the player's weapons never do. */
      hpMult: 1 + 0.17 * Math.pow(t - 1, 1.05),
      damageMult: damageMult(t),
      speedMult: speedMult(t),

      /* Hazards. Zero while teaching; then per-room chance, plus how long a run
         of spikes is allowed to be (never longer than two jumps). */
      hazardChance: tut ? 0 : M.clamp(0.09 + 0.075 * Math.pow(t - 1, 1.15), 0, 0.85),
      hazardCount: tut ? 0 : Math.round(1 + (tt - 2) * 0.45),
      spikeRunMax: tut ? 1 : 1 + Math.floor(tt / 3),

      /* Terrain. Longer floors and taller climbs the deeper you go - up to the
         first act's end, and no further (see TERRAIN_CAP). */
      roomCount: M.clamp(6 + Math.round(tt * 1.1), 6, 12),
      climbSteps: 3 + Math.round(tt * 0.9),
      climbSpan: 6 + Math.round(tt * 1.6),
      pitChance: tut ? 0.15 : M.clamp(0.3 + tt * 0.06, 0, 0.8),

      /* Puzzles. Plate count is the whole difficulty knob of a puzzle room. */
      plates: tut ? 1 : M.clamp(2 + Math.floor((tt - 2) / 2.5), 2, 3),
      crates: tut ? 1 : M.clamp(2 + Math.floor((tt - 2) / 3), 2, 3),

      /* Light. OBROR is a scarce resource that gets scarcer: the deep floors are
         lit by their own ambience (crystals, lava, fireflies) rather than by a
         torch every few tiles. Tiles between scattered torches. */
      torchSpacing: Math.round(26 + tt * 1.6),

      /* Loot. Chests get rarer but better, which keeps chest-opening exciting
         instead of routine. */
      chestKeep: M.clamp(0.72 - t * 0.012, 0.5, 0.72),
      rarityBias: (t - 1) * 0.42,

      /* Juice. Flash and shake budget grows a little with the stakes. */
      shakeScale: 1 + (tt - 1) * 0.05
    };
  }

  DS.Difficulty = {
    forDepth: forDepth,
    biomeForDepth: biomeForDepth,
    bossForDepth: bossForDepth,
    bossHpMult: bossHpMult,
    isTutorial: isTutorial,
    rankWeights: rankWeights,
    threat: threat,
    LADDER: LADDER,
    BOSS_ROTATION: BOSS_ROTATION,
    get FINAL_DEPTH() { return FINAL_DEPTH; }
  };
})(window.DS);
