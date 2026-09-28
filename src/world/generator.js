/* Procedural level building. Rooms are hand-authored 20x12 templates that get
   shuffled and chained horizontally, then validated so every pit is actually
   crossable with the player's jump arc. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;

  const ROOM_W = 20;
  /* The authored rooms are 12 rows tall and always will be — they are a corridor
     by design. The map is taller than that so the procedural parkour levels have
     somewhere to climb to; authored rooms are padded up to it with empty air,
     which reads as a high dark ceiling. */
  const TEMPLATE_H = 12;
  const ROOM_H = 22;

  /* Legend
       #  solid   =  platform   ^  spike   .  empty
       E  enemy   C  chest      T  torch
       P  player  D  door       M  merchant   N  enchant table          */
  /* The rooms are built the way a mason would build them: every surface you
     can stand on is either rock that reaches the floor, or a plank that rests
     on rock. They used to be full of `===` ledges at head height, over solid
     floor, that nothing held up and nothing led to - and the passes that run
     afterwards "fixed" each one with a stone pillar that walled the corridor
     off, then hung a rope beside the pillar to get over it. A room that is
     honest as authored needs none of that. */
  const ROOMS = [
    [ // open hall with a stone dais
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '.......######.......',
      '..E....######....E..',
      '####################',
      '####################'
    ],
    [ // pit with a broken plank bridge: each plank rests on a bank
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '..E..............E..',
      '########=..=########',
      '########....########'
    ],
    [ // spike floor, and a block to climb once you are past it
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '..............##....',
      '...E.....^^...##.E..',
      '####################',
      '####################'
    ],
    [ // treasure mound: the chest sits on top of a stepped rise
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '..........C.........',
      '.........####.......',
      '.......######.......',
      '..E....######....E..',
      '####################',
      '####################'
    ],
    [ // raised ledge on the right
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '..............E.....',
      '..........##########',
      '..E.......##########',
      '####################',
      '####################'
    ],
    [ // stepped climb: two steps of rock, each one jump high
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '...............E....',
      '.............#######',
      '.........C...#######',
      '.......#############',
      '..E....#############',
      '####################',
      '####################'
    ],
    [ // twin pits
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '.E................E.',
      '####...####...######',
      '####...####...######'
    ],
    [ // quiet hall: a long flat floor, which is what a puzzle vault needs
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '...E............E...',
      '####################',
      '####################'
    ],
    [ // ambush hall
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '..E......E......E...',
      '####################',
      '####################'
    ],
    [ // gauntlet
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '.........##.........',
      '..E...E..##..^^..E..',
      '####################',
      '####################'
    ]
  ];

  /* Pits of doom. The floor simply stops and the only way across is the
     platform chain — falling in is an instant loss of the run, so hops are
     spaced to be clearable with the jump plus the air jump, never more. */
  const PIT_ROOMS = [
    [
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '........==..........',
      '....................',
      '....................',
      '.E..==.......==...E.',
      '###..............###',
      '###..............###'
    ],
    [
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '......==....==......',
      '....................',
      '....................',
      '.E.==..==..==..==.E.',
      '##...............###',
      '##...............###'
    ],
    [
      '....................',
      '....................',
      '....................',
      '....................',
      '.......====.........',
      '....................',
      '...==..........==...',
      '....................',
      '....................',
      '.E.....==..==.....E.',
      '##...............###',
      '##...............###'
    ]
  ];

  const START_ROOM = [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..T..............T..',
    '....................',
    '....................',
    '....................',
    '...P................',
    '####################',
    '####################'
  ];

  const EXIT_ROOM = [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..T..............T..',
    '....................',
    '....................',
    '.............D......',
    '..E.................',
    '####################',
    '####################'
  ];

  const SAFE_ROOM = [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..T..............T..',
    '....................',
    '....................',
    '....M....N...D......',
    '...P................',
    '####################',
    '####################'
  ];

  const BOSS_ROOM = [
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '..T..................................T..',
    '........................................',
    '..P..................................D..',
    '########################################',
    '########################################'
  ];

  /* Every authored template is written at TEMPLATE_H rows with its floor on the
     bottom row. Padding is added above so the floor still lands on the bottom of
     the taller map. */
  function padTemplate(rows) {
    const width = rows[0].length;
    const blank = new Array(width + 1).join('.');
    const out = [];
    for (let i = rows.length; i < ROOM_H; i++) out.push(blank);
    return out.concat(rows);
  }

  function padAll(list) { return list.map(padTemplate); }

  /* Torches are standing braziers, not wall fittings: the rooms have no wall
     behind them, so anything mounted at head height read as floating. Marker
     columns are collected during decode and planted on the floor afterwards,
     once the floor for that column actually exists. */
  const PADDED_ROOMS = padAll(ROOMS);
  const QUIET_HALL = 7;       // index of the flat hall in ROOMS
  const PADDED_PITS = padAll(PIT_ROOMS);
  const PADDED_START = padTemplate(START_ROOM);
  const PADDED_EXIT = padTemplate(EXIT_ROOM);
  const PADDED_SAFE = padTemplate(SAFE_ROOM);
  const PADDED_BOSS = padTemplate(BOSS_ROOM);

  const TORCH_H = 24;
  let torchMarks = [];
  let doorMarks = [];

  /* A doorway is two tiles tall and its bottom sits on the floor of its own
     column. Placing it at the marker's row left it hanging in mid-air. */
  function plantDoors(map, out) {
    for (let i = 0; i < doorMarks.length; i++) {
      const tx = doorMarks[i];
      /* groundBelow, NOT floorBelow(tx, 0). A cave is rock from row 0 down to
         its ceiling, so asking from the sky finds the ROOF and every door and
         torch was planted against it - hung in mid-air, in a cave, at the
         height of the ceiling. groundBelow skips the roof and answers with the
         first surface you could actually stand on. */
      const floor = map.groundBelow(tx);
      if (floor >= map.pixelH) continue;
      const topRow = Math.floor(floor / T) - 2;
      map.set(tx, topRow, TILE.DOOR);
      map.set(tx, topRow + 1, TILE.DOOR);
      out.door = { x: tx * T, y: topRow * T };
    }
    doorMarks = [];
  }

  function plantTorches(map, out) {
    const doorX = (out && out.door) ? Math.floor(out.door.x / T) : -99;
    const chestsX = (out && out.chests) ? out.chests.map(function (c) { return Math.floor(c.x / T); }) : [];
    for (let i = 0; i < torchMarks.length; i++) {
      const tx = torchMarks[i];
      if (Math.abs(tx - doorX) < 4) continue;
      if (chestsX.some(function (cx) { return Math.abs(tx - cx) < 3; })) continue;
      const floor = map.groundBelow(tx);
      if (floor >= map.pixelH) continue;
      map.decor.push({
        kind: 'torch', x: tx * T + 4, y: floor - TORCH_H + 1,
        seed: (tx * 37) % 24
      });
    }
    torchMarks = [];
  }

  function decodeInto(map, template, offsetX, out) {
    for (let ty = 0; ty < template.length; ty++) {
      const row = template[ty];
      for (let tx = 0; tx < row.length; tx++) {
        const ch = row[tx];
        const gx = offsetX + tx;
        const px = gx * T, py = ty * T;

        switch (ch) {
          case '#': map.set(gx, ty, TILE.WALL); break;
          case '=': map.set(gx, ty, TILE.PLATFORM); break;
          case '^': map.set(gx, ty, TILE.SPIKE); break;
          // Placed after decoding, once this column's floor height is known.
          case 'D': doorMarks.push(gx); break;
          case 'P': out.player = { x: px, y: py }; break;
          case 'E': out.enemies.push({ x: px, y: py }); break;
          case 'C': out.chests.push({ x: px, y: py }); break;
          case 'M': out.merchant = { x: px, y: py }; break;
          case 'N': if (!out.table) out.table = { x: px, y: py }; break;
          // Torches hang at chest height, three tiles below the marker row, so
          // they light the floor you actually walk on.
          case 'T': torchMarks.push(gx); break;
          default: break;
        }
      }
    }
  }

  /* The player clears roughly 2.8 tiles horizontally at the top of a jump.
     Any pit wider than that gets a platform dropped into it rather than being
     regenerated, which keeps generation single-pass and always solvable. */
  const MAX_GAP = 3;

  function ensureTraversable(map) {
    const floorRow = ROOM_H - 2;   // authored levels only: one flat floor
    let gapStart = -1;

    for (let tx = 0; tx <= map.w; tx++) {
      // A plank laid level with the floor (the broken bridge) is floor too.
      const solid = tx < map.w && (map.isSolid(tx, floorRow) || map.isPlatform(tx, floorRow));

      if (!solid && gapStart < 0) {
        gapStart = tx;
      } else if (solid && gapStart >= 0) {
        const width = tx - gapStart;
        // A pit that already has a platform chain over it is a designed
        // crossing, not an accident — leave it exactly as authored.
        if (width > MAX_GAP && !gapHasPath(map, gapStart, tx, floorRow)) {
          // Bridge the middle of the gap two tiles above the floor line. It is
          // a crossing on purpose, and says so, so the tidy-up leaves it be.
          const mid = gapStart + Math.floor(width / 2) - 1;
          for (let x = mid; x < mid + 3; x++) map.setDesigned(x, floorRow - 3, TILE.PLATFORM);
        }
        gapStart = -1;
      }
    }
  }

  function gapHasPath(map, from, to, floorRow) {
    for (let ty = floorRow - 5; ty < floorRow; ty++) {
      for (let tx = from; tx < to; tx++) {
        if (map.isPlatform(tx, ty) || map.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  /* A spike bed wider than the curve allows is trimmed back to it. What is left
     is a jump - and only when that jump is wider than the hero can make does it
     get a way over: a footbridge, a plank resting on a stone post either side
     of the bed. It used to lay a plank four rows up over EVERY bed, however
     short, held up by nothing, which is how the corridors filled with ledges
     that led nowhere. */
  const MAX_SPIKE_RUN = 2;
  const SPIKE_JUMP = 3;      // widest bed a plain jump clears

  function capSpikeRuns(map, maxRun) {
    const limit = maxRun || MAX_SPIKE_RUN;
    const floorRow = ROOM_H - 3;
    let runStart = -1;

    for (let tx = 0; tx <= map.w; tx++) {
      const spike = tx < map.w && map.isSpike(tx, floorRow);

      if (spike && runStart < 0) runStart = tx;
      else if (!spike && runStart >= 0) {
        const width = tx - runStart;
        if (width > limit) {
          for (let x = runStart + limit; x < tx; x++) {
            map.set(x, floorRow, TILE.EMPTY);
          }
        }
        const kept = Math.min(width, limit);
        if (kept > SPIKE_JUMP) footbridge(map, runStart, kept, floorRow);
        runStart = -1;
      }
    }
  }

  function footbridge(map, from, width, row) {
    const left = from - 1, right = from + width;
    if (map.get(left, row) !== TILE.EMPTY || map.get(right, row) !== TILE.EMPTY) return;
    if (!map.isSolid(left, row + 1) || !map.isSolid(right, row + 1)) return;
    map.set(left, row, TILE.WALL);
    map.set(right, row, TILE.WALL);
    for (let x = left; x <= right; x++) {
      if (map.get(x, row - 1) === TILE.EMPTY) map.setDesigned(x, row - 1, TILE.PLATFORM);
    }
  }

  /* Torches every few rooms keep long corridors from going flat and dark.

     They used to be planted every 8-13 tiles, which lit a floor into a runway
     and made the light feel like wallpaper. Light is now a scarce resource at
     a spacing the difficulty curve owns (26 tiles at depth 1, 42 by depth 10),
     and the deep floors lean on their own ambience - crystal, lava, fireflies -
     instead of on a torch every screen. */
  function scatterTorches(map, rng, out, depth) {
    const doorX = (out && out.door) ? Math.floor(out.door.x / T) : -99;
    const chestsX = (out && out.chests) ? out.chests.map(function (c) { return Math.floor(c.x / T); }) : [];
    const base = DS.Difficulty
      ? DS.Difficulty.forDepth(depth || 1).torchSpacing
      : 10;
    const spacing = Math.max(10, base);
    for (let tx = 6; tx < map.w - 4; tx += rng.int(spacing - 3, spacing + 4)) {
      if (Math.abs(tx - doorX) < 4) continue;
      if (chestsX.some(function (cx) { return Math.abs(tx - cx) < 3; })) continue;
      const floor = map.groundBelow(tx);
      // Never plant a brazier over a pit — it would light empty air.
      if (floor >= map.pixelH) continue;
      if (map.isBlocked(tx, Math.floor(floor / T) - 1)) continue;
      map.decor.push({
        kind: 'torch', x: tx * T + 4, y: floor - TORCH_H + 1, seed: (tx * 37) % 24
      });
    }
  }

  /* A carved floor: one continuous stretch of terrain rather than a chain of
     rooms. roomCount is still reported in ROOM_W units, because the shrine,
     puzzle and hazard placers all think in rooms and there is no reason to
     teach them a second coordinate system. */
  function buildCarved(rng, depth, out) {
    const diff = DS.Difficulty ? DS.Difficulty.forDepth(depth) : null;
    const rooms = diff ? DS.M.clamp(diff.roomCount + 1, 7, 14)
                       : DS.M.clamp(7 + Math.floor(depth * 1.2), 7, 14);
    const map = DS.Map.create(ROOM_W * rooms, ROOM_H);

    DS.Parkour.carve(map, rng, depth, out);

    // The exit door sits on the flat tail shelf the carver reserved for it.
    if (out.doorTx != null) {
      const topRow = out.doorRow - 2;
      map.set(out.doorTx, topRow, TILE.DOOR);
      map.set(out.doorTx, topRow + 1, TILE.DOOR);
      out.door = { x: out.doorTx * T, y: topRow * T };
    }

    map.sealPits(rng);
    scatterTorches(map, rng, out, depth);

    out.chests = out.chests.filter(function () { return rng.chance(0.85); });
    /* Carved floors must still be completable: the exit has to exist and the
       route to it has to survive the support pass. */
    const doorPx = out.door ? out.door.x : -999;
    const cleanChests = [];
    for (let i = 0; i < out.chests.length; i++) {
      const c = out.chests[i];
      if (Math.abs(c.x - doorPx) < 48) continue;
      let overlap = false;
      for (let j = 0; j < cleanChests.length; j++) {
        if (Math.abs(c.x - cleanChests[j].x) < 32) { overlap = true; break; }
      }
      if (!overlap) cleanChests.push(c);
    }
    out.chests = cleanChests;

    return { map: map, spawns: out, roomCount: rooms, kind: 'normal',
             carved: true, flavor: 'carved' };
  }

  /* kind: 'normal' | 'safe' | 'boss'
     Returns { map, spawns, roomCount } */
  /* Which shape of floor this depth is.

     This used to be a dice roll - 18% mountain, 20% flooded, otherwise a
     corridor - which is how a run could open on a lava hall at depth 2 and
     close on a beach. The shape of a floor is now decided by the BIOME LADDER
     in difficulty.js: coast into cave, cave into bog, bog up a mountain, then
     down into flooded halls and out through the ash. Same journey every run,
     different route through it, which is what makes a dungeon read as a place.
     A missing module degrades to the old corridor rather than crashing. */
  function pickFlavor(rng, depth) {
    if (!DS.Difficulty) return 'plain';
    const flavor = DS.Difficulty.biomeForDepth(depth).flavor;
    if (flavor === 'mountain' && DS.Mountain) return 'mountain';
    if (flavor === 'flooded' && DS.Water) return 'flooded';
    if (flavor === 'carved' && DS.Parkour) return 'carved';
    return 'plain';
  }

  /* --- "nothing floats" as a generation rule --------------------------------

     A platform tile hanging in open air is the one shape this game must never
     ship: a dungeon is terrain, not a Mario level. So the finished map is swept
     and any platform nothing anchors is made honest - with one exception, which
     is the whole point of the designed layer (tilemap.js): a crossing a builder
     laid on purpose, a stepping stone over a chasm or a parkour stair, is left
     exactly where it was put. This pass used to delete every stepping stone out
     of every pit, and then the reach pass paved the hole with generic repairs.

     A platform is anchored if rock touches it left or right (a ledge in a
     wall), or rock or another platform is directly below it. Anything else, in
     order of how little it disturbs the level:
       1. reach sideways to a wall - the ledge becomes a balcony;
       2. hang it from the ceiling on a stone bracket beside it - a column that
          comes down from the roof to meet the ledge's end, leaving the ledge's
          own headroom clear;
       3. lower it onto the ground as a stone block two rows high - a step you
          can hop, instead of a plank you cannot reach;
       4. take it out.
     There is no fifth option. The old last resort was a one-tile stone pillar
     under the ledge, which is a wall across whatever corridor runs beneath it,
     and the reach pass then hung a rope beside it to get over it. */
  const SUPPORT_REACH = 6;    // columns of open air a shelf may bridge
  const BLOCK_H = 2;          // how tall a lowered ledge stands: one jump

  /* A cell a support may be built through. Rock may be stacked, water may not:
     a column dropped through a lake used to punch a one-tile stone tooth out of
     the surface and leave a dry slot beside it. */
  function buildableCell(map, tx, ty) {
    if (map.get(tx, ty) !== TILE.EMPTY) return false;
    if (map.isWater(tx, ty + 1)) return false;   // never roof over the waterline
    return true;
  }

  /* Cells a spawn marker stands in. Lowering a ledge onto the floor must not
     bury an enemy, a chest or the door inside the block. */
  function markerCells(spawns) {
    const cells = new Set();
    if (!spawns) return cells;
    const add = function (p) {
      if (!p) return;
      cells.add(Math.floor(p.x / T) + ',' + Math.floor(p.y / T));
    };
    add(spawns.player); add(spawns.door); add(spawns.merchant); add(spawns.table);
    (spawns.enemies || []).forEach(add);
    (spawns.chests || []).forEach(add);
    return cells;
  }

  function runDesigned(map, run, ty) {
    for (let x = run.x0; x <= run.x1; x++) if (map.isDesigned(x, ty)) return true;
    return false;
  }

  function runAnchored(map, run, ty) {
    if (map.isSolid(run.x0 - 1, ty) || map.isSolid(run.x1 + 1, ty)) return true;
    for (let x = run.x0; x <= run.x1; x++) {
      if (map.isSolid(x, ty + 1) || map.isPlatform(x, ty + 1)) return true;
    }
    return false;
  }

  /* Reach sideways to the nearest wall on the ledge's own row and fill the gap
     with rock, if every cell of the gap is open air. */
  function strap(map, run, ty) {
    const reach = Math.min(run.x0, map.w - 1 - run.x1, SUPPORT_REACH);
    for (let d = 1; d <= reach; d++) {
      const spans = [
        { wall: run.x0 - d, from: run.x0 - d + 1, to: run.x0 - 1 },
        { wall: run.x1 + d, from: run.x1 + 1, to: run.x1 + d - 1 }
      ];
      for (let s = 0; s < spans.length; s++) {
        const span = spans[s];
        if (!map.isSolid(span.wall, ty)) continue;
        for (let x = span.from; x <= span.to; x++) {
          if (!buildableCell(map, x, ty)) return false;
        }
        for (let x = span.from; x <= span.to; x++) map.set(x, ty, TILE.WALL);
        return true;
      }
    }
    return false;
  }

  /* A stone bracket: a column beside one end of the ledge, from the rock above
     down to the ledge's own row, so the ledge is held at its side and keeps its
     headroom. Only ever built down from real rock, never up from nothing. */
  function bracket(map, run, ty) {
    const sides = [run.x0 - 1, run.x1 + 1];
    for (let s = 0; s < sides.length; s++) {
      const x = sides[s];
      if (x < 1 || x >= map.w - 1) continue;
      let ay = -1;
      for (let y = ty - 1; y >= 0; y--) {
        if (map.isSolid(x, y)) { ay = y; break; }
        if (!buildableCell(map, x, y)) break;
      }
      if (ay < 0 || !buildableCell(map, x, ty)) continue;
      for (let y = ay + 1; y <= ty; y++) map.set(x, y, TILE.WALL);
      return true;
    }
    return false;
  }

  /* Lower the ledge to the ground under it as a block BLOCK_H rows tall. Every
     column needs its own rock within reach, and every cell of the block must be
     empty air with no spawn marker in it. */
  function lower(map, run, ty, markers) {
    const plan = [];
    for (let x = run.x0; x <= run.x1; x++) {
      let gy = ty + 1;
      while (gy < map.h && gy - ty <= SUPPORT_REACH + BLOCK_H && map.get(x, gy) === TILE.EMPTY) gy++;
      if (gy >= map.h || !map.isSolid(x, gy)) return false;
      const top = Math.max(ty, gy - BLOCK_H);
      for (let y = top; y < gy; y++) {
        if (y !== ty && !buildableCell(map, x, y)) return false;
        if (markers.has(x + ',' + y)) return false;
      }
      plan.push(x, top, gy);
    }
    for (let x = run.x0; x <= run.x1; x++) map.set(x, ty, TILE.EMPTY);
    for (let i = 0; i < plan.length; i += 3) {
      for (let y = plan[i + 1]; y < plan[i + 2]; y++) map.set(plan[i], y, TILE.WALL);
    }
    return true;
  }

  function supportPlatforms(map, spawns) {
    let shelves = 0, hung = 0, blocks = 0, dropped = 0;
    const markers = markerCells(spawns);

    for (let ty = 0; ty < map.h; ty++) {
      let tx = 0;
      while (tx < map.w) {
        if (!map.isPlatform(tx, ty)) { tx++; continue; }

        // Measure the run: a ledge is one object, so it gets one answer.
        let x1 = tx;
        while (x1 + 1 < map.w && map.isPlatform(x1 + 1, ty)) x1++;
        const run = { x0: tx, x1: x1 };
        tx = x1 + 1;

        if (runDesigned(map, run, ty) || runAnchored(map, run, ty)) continue;
        if (strap(map, run, ty)) { shelves++; continue; }
        if (bracket(map, run, ty)) { hung++; continue; }
        if (lower(map, run, ty, markers)) { blocks++; continue; }
        for (let x = run.x0; x <= run.x1; x++) map.set(x, ty, TILE.EMPTY);
        dropped++;
      }
    }
    return { shelves: shelves, hung: hung, blocks: blocks, removed: dropped };
  }

  /* A crossing is a platform with nothing to stand on under it: a pit, a lake,
     a bed of spikes. Whoever laid it meant it as the way over, whatever flavor
     of floor built it, so it is flagged designed before anything tidies the
     map - including the ones in flavors that know nothing about the flag. A
     crossing is a whole run, so one tile of it over the hole flags the run. */
  function markCrossings(map) {
    for (let ty = 0; ty < map.h; ty++) {
      let tx = 0;
      while (tx < map.w) {
        if (!map.isPlatform(tx, ty)) { tx++; continue; }
        let x1 = tx;
        while (x1 + 1 < map.w && map.isPlatform(x1 + 1, ty)) x1++;
        let crossing = false;
        for (let x = tx; x <= x1 && !crossing; x++) {
          let y = ty + 1;
          while (y < map.h && map.get(x, y) === TILE.EMPTY) y++;
          const under = map.get(x, y);
          if (y >= map.h || under === TILE.WATER || under === TILE.SPIKE ||
              under === TILE.DEATHSPIKE) crossing = true;
        }
        if (crossing) for (let x = tx; x <= x1; x++) map.markDesigned(x, ty);
        tx = x1 + 1;
      }
    }
  }

  /* A door is two tiles tall and its BOTTOM row must be the floor of its own
     column. Each flavor planted it at a row it had reserved while building, but
     the terrain passes that run afterwards - pit sealing, water stocking, the
     vault roof - can move the ground out from under that reservation, which
     left the exit (and the 3D doorway built from it) hanging a tile in the air.
     So the finished terrain wins: the door is re-seated on the real floor. */
  function reseatDoor(map, out) {
    if (!out.door) return;
    const tx = Math.floor(out.door.x / T);
    // Same trap as above: from row 0 a cave answers with its ceiling. Ask for
    // the surface the player would stand on.
    const floor = map.groundBelow(tx);
    if (floor == null || floor >= map.pixelH) return;
    const floorRow = Math.floor(floor / T);
    const topRow = floorRow - 2;
    if (topRow < 0) return;

    // Clear whatever rows the door used to occupy before re-planting it.
    for (let ty = 0; ty < map.h; ty++) {
      if (map.get(tx, ty) === TILE.DOOR) map.set(tx, ty, TILE.EMPTY);
    }
    map.set(tx, topRow, TILE.DOOR);
    map.set(tx, topRow + 1, TILE.DOOR);
    out.door.y = topRow * T;
  }

  /* Nothing falls out of the world.

     A room's pit is a column with no floor, and sealPits gives every one of them
     a bottom — but only the ones it can SEE. A crossing platform laid over the
     hole hides it, because the question sealPits asks is whether the column has
     any rock at all in it and a one-way platform is not rock; and then the
     support pass takes that crossing away again, because a platform with nothing
     under it is exactly what it exists to remove. What is left is a hole with no
     bottom in it: fall in and the run is stranded under the level with no way
     back and nothing to kill you. So the last word on the terrain, after every
     other pass has had its say, is the killing floor for any column that still
     has nothing to stand on.

     Water and rope columns are left alone: a body in water swims and a body on a
     rope climbs, so neither is a trap, and sealing the bottom of a pool would
     kill a swimmer who did nothing wrong. */
  function closeTraps(map) {
    let sealed = 0;
    for (let tx = 1; tx < map.w - 1; tx++) {
      let stand = false, wayOut = false;
      for (let ty = 0; ty < map.h; ty++) {
        const t = map.get(tx, ty);
        // A plank over a hole is not a floor under it: falling past a
        // stepping stone lands you nowhere, so its column is sealed too.
        if (t === TILE.WALL) stand = true;
        if (t === TILE.WATER || t === TILE.ROPE || t === TILE.DEATHSPIKE) wayOut = true;
      }
      if (stand || wayOut) continue;
      map.set(tx, map.h - 1, TILE.DEATHSPIKE);
      sealed++;
    }
    return sealed;
  }

  /* The features that carve the terrain of a finished floor - the puzzle
     vault, the barrier wall across the corridor, the coin tower. They used to
     be carved by the scene AFTER the level was built and proven, so a vault
     roof or a barrier shaft could cut a route the reach pass had already signed
     off, and nothing ever checked again. They are planned here now, before the
     support and reach passes, and the scene only furnishes them (gates, warden,
     crates, coins) from the plan left on the level. */
  function furnish(level, rng, depth) {
    if (level.kind !== 'normal' || level.noProps) return;
    const rung = DS.Difficulty ? DS.Difficulty.biomeForDepth(depth) : null;
    const hall = !!(rung && rung.puzzle);
    // The barrier first: on the Torch Hall it is the one feature that must fit.
    if (DS.Puzzle && DS.Puzzle.planBarrier) level.barrier = DS.Puzzle.planBarrier(level, rng, hall);
    if (DS.Puzzle && DS.Puzzle.planVault) level.puzzleVault = DS.Puzzle.planVault(level, rng);
    if (DS.Bonus && DS.Bonus.planVault) level.bonusVault = DS.Bonus.planVault(level, rng);
  }

  /* Every flavor builds a level its own way; this is the one place that runs
     afterwards, on all of them, so a rule like "the door stands on the floor"
     cannot be true of three flavors and quietly false of the fourth. The order
     is the whole design:
       1. flag the crossings every flavor laid, so nothing below deletes them;
       2. carve the floor's features (vault, barrier, coin tower) - every pass
          that edits terrain runs BEFORE the passes that prove it;
       3. support every ledge that has nothing holding it up;
       4. prove the exit is in reach and repair the terrain where it is not
          (systems/reach.js), every repair built anchored;
       5. audit the finished map for anything left floating or dangling, and fix
          it where that cannot cost the route (reach.js anchor);
       6. close any column left bottomless, stand the door on the real floor,
          and pick the pit stones that crumble - picked, not removed: the tile
          stays in the map the passes above proved, and the scene swaps it for
          the crumbling prop, which always reforms. */
  function build(rng, depth, kind) {
    const level = assemble(rng, depth, kind);
    if (level && level.map && level.spawns) {
      markCrossings(level.map);
      furnish(level, rng, depth);
      level.support = supportPlatforms(level.map, level.spawns);
      // The report is kept on the level so a QA pass can assert the generator's
      // own claim instead of re-deriving it.
      level.reach = DS.Reach ? DS.Reach.ensureExit(level.map, level.spawns) : null;
      level.anchor = DS.Reach ? DS.Reach.anchor(level.map, level.spawns) : null;
      level.traps = closeTraps(level.map);
      reseatDoor(level.map, level.spawns);
      level.crumbles = (DS.Hazards && DS.Hazards.planCrumbles)
        ? DS.Hazards.planCrumbles(level, rng) : [];
    }
    return level;
  }

  function assemble(rng, depth, kind) {
    const out = { player: null, enemies: [], chests: [], door: null, merchant: null, table: null };

    // The trial chamber is its own room and is never mixed with anything else.
    if (kind === 'trial') return DS.Trial.build(rng, depth, out);

    if (kind === 'boss') {
      const map = DS.Map.create(PADDED_BOSS[0].length, ROOM_H);
      decodeInto(map, PADDED_BOSS, 0, out);
      map.sealPits();
      plantDoors(map, out);
      plantTorches(map, out);
      return { map: map, spawns: out, roomCount: 1, kind: kind };
    }

    if (kind === 'safe') {
      const map = DS.Map.create(ROOM_W, ROOM_H);
      decodeInto(map, PADDED_SAFE, 0, out);
      map.sealPits();
      plantDoors(map, out);
      plantTorches(map, out);
      return { map: map, spawns: out, roomCount: 1, kind: kind };
    }

    const flavor = pickFlavor(rng, depth);
    if (flavor === 'mountain') return DS.Mountain.build(rng, depth, out);
    if (flavor === 'flooded') return DS.Water.build(rng, depth, out);

    /* Two kinds of ordinary floor. The authored corridor is the game's
       baseline; the carved one is a climb or a descent with parkour between
       the ledges. Carved floors get commoner as you descend, so the dungeon
       visibly stops being a corridor the deeper it goes. */
    /* The LADDER decides the shape of a floor; this only adds a little variety
       inside a rung. It used to roll a flat ~50% carve on every plain floor,
       which meant the shore (depth 1) was a parkour climb half the time and the
       teaching floors were the least predictable in the game. A 'carved' rung
       is a climb almost always; anything else keeps parkour as an occasional
       change of pace, and the tutorial floors stay exactly what the ladder says. */
    const rung = DS.Difficulty ? DS.Difficulty.biomeForDepth(depth) : null;
    /* A puzzle floor (the Torch Hall) is always the corridor: its barrier needs
       a long flat hall to stand in, and a carved floor rarely has one. */
    const carvedChance = flavor === 'carved' ? 0.85
                        : ((DS.Difficulty && DS.Difficulty.isTutorial(depth)) || (rung && rung.puzzle)
                           ? 0 : 0.25);
    if (DS.Parkour && rng.chance(carvedChance)) return buildCarved(rng, depth, out);
    if (flavor === 'carved' && DS.Parkour) return buildCarved(rng, depth, out);

    // Longer levels the deeper you go, but never long enough to drag.
    const diff = DS.Difficulty ? DS.Difficulty.forDepth(depth) : null;
    const middle = diff ? diff.roomCount
                        : DS.M.clamp(6 + Math.floor(depth * 1.1), 6, 12);
    const picks = [];
    for (let i = 0; i < middle; i++) picks.push(rng.pick(PADDED_ROOMS));

    // One pit of doom per level, more likely the deeper you are. Never the
    // first middle room, so the floor always opens on solid ground - and never
    // at all on the teaching floors, where a chasm is just a lost run.
    const pitChance = diff ? diff.pitChance
                           : DS.M.clamp(0.35 + depth * 0.08, 0.35, 0.85);
    if (middle >= 2 && rng.chance(pitChance)) {
      picks[rng.int(1, middle - 1)] = rng.pick(PADDED_PITS);
    }

    /* The floor the ladder promises a puzzle on gets a flat hall to hold it in
       one of the first three rooms, which is where the barrier looks. */
    if (rung && rung.puzzle) {
      picks[rng.int(0, Math.min(2, middle - 1))] = PADDED_ROOMS[QUIET_HALL];
    }

    const totalRooms = middle + 2; // start + middle + exit
    const map = DS.Map.create(ROOM_W * totalRooms, ROOM_H);

    decodeInto(map, PADDED_START, 0, out);
    for (let i = 0; i < picks.length; i++) {
      decodeInto(map, picks[i], ROOM_W * (i + 1), out);
    }
    decodeInto(map, PADDED_EXIT, ROOM_W * (totalRooms - 1), out);

    plantDoors(map, out);
    plantTorches(map, out);
    ensureTraversable(map);
    capSpikeRuns(map, diff ? diff.spikeRunMax : MAX_SPIKE_RUN);
    /* Give every bottomless column its bottom before anything else reads the
       map. Each pit rolls its own kind - a chasm that ends the run, or a bed
       of spikes you can climb back out of - so a hole in the floor has to be
       looked at rather than assumed. */
    map.sealPits(rng);
    scatterTorches(map, rng, out, depth);

    // Chests are a chance per marker, not a guarantee, so two runs through the
    // same template still feel different. They get rarer - and better - with
    // depth, so opening one stays an event.
    const keepChest = diff ? diff.chestKeep : 0.72;
    out.chests = out.chests.filter(function () { return rng.chance(keepChest); });

    // A bonus chest sometimes appears on a random enemy marker.
    if (rng.chance(0.4) && out.enemies.length) {
      const spot = rng.pick(out.enemies);
      out.chests.push({ x: spot.x, y: spot.y });
    }

    const doorPx = out.door ? out.door.x : -999;
    const cleanChests = [];
    for (let i = 0; i < out.chests.length; i++) {
      const c = out.chests[i];
      if (Math.abs(c.x - doorPx) < 48) continue;
      let overlap = false;
      for (let j = 0; j < cleanChests.length; j++) {
        if (Math.abs(c.x - cleanChests[j].x) < 32) { overlap = true; break; }
      }
      if (!overlap) cleanChests.push(c);
    }
    out.chests = cleanChests;

    return { map: map, spawns: out, roomCount: totalRooms, kind: kind,
             flavor: 'corridor' };
  }

  /* The tile row of the walking surface in a column, or -1 for a bottomless
     one. Carved levels have a different floor height every few tiles, so
     anything that used to assume ROOM_H - 2 asks for this instead.

     Uses groundBelow for the same reason as the door: in a cave the sky is
     rock, and "the first solid from row 0" is the ceiling. Everything that
     places a prop at a column's walking height goes through here. */
  function floorRowAt(map, tx) {
    const y = map.groundBelow(tx);
    if (y >= map.pixelH) return -1;
    const row = Math.floor(y / T);
    return map.isSolid(tx, row) ? row : -1;
  }

  DS.LevelGen = {
    build: build,
    floorRowAt: floorRowAt,
    ROOM_W: ROOM_W,
    ROOM_H: ROOM_H,
    MAX_GAP: MAX_GAP,
    ROOMS: ROOMS,
    PIT_ROOMS: PIT_ROOMS
  };
})(window.DS);
