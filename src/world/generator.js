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
  const ROOMS = [
    [ // open hall with two ledges
      '....................',
      '....................',
      '....................',
      '....................',
      '.....===............',
      '....................',
      '..........===.......',
      '....................',
      '....................',
      '.....E........E.....',
      '####################',
      '####################'
    ],
    [ // pit with a platform bridge
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '........====........',
      '....................',
      '....................',
      '..E..............E..',
      '########....########',
      '########....########'
    ],
    [ // spike floor
      '....................',
      '....................',
      '....................',
      '....................',
      '.......======.......',
      '....................',
      '....................',
      '....................',
      '....................',
      '...E.....^^.....E...',
      '####################',
      '####################'
    ],
    [ // treasure alcove
      '....................',
      '....................',
      '....................',
      '...====.......====..',
      '....................',
      '....................',
      '.......======.......',
      '....................',
      '....................',
      '..E.......C......E..',
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
    [ // stepped climb
      '....................',
      '....................',
      '....................',
      '....................',
      '................E...',
      '..............######',
      '....................',
      '........######......',
      '....................',
      '..E.....C...........',
      '####################',
      '####################'
    ],
    [ // twin pits
      '....................',
      '....................',
      '....................',
      '....................',
      '....===....===......',
      '....................',
      '....................',
      '....................',
      '....................',
      '.E................E.',
      '####...####...######',
      '####...####...######'
    ],
    [ // gauntlet
      '....................',
      '....................',
      '....................',
      '....................',
      '.........====.......',
      '....................',
      '...====.............',
      '....................',
      '....................',
      '..E...E......^^..E..',
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
    '.....====......................====.....',
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
      const floor = map.floorBelow(tx, 0);
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
      const floor = map.floorBelow(tx, 0);
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
      const solid = tx < map.w && map.isSolid(tx, floorRow);

      if (!solid && gapStart < 0) {
        gapStart = tx;
      } else if (solid && gapStart >= 0) {
        const width = tx - gapStart;
        // A pit that already has a platform chain over it is a designed
        // crossing, not an accident — leave it exactly as authored.
        if (width > MAX_GAP && !gapHasPath(map, gapStart, tx, floorRow)) {
          // Bridge the middle of the gap two tiles above the floor line.
          const mid = gapStart + Math.floor(width / 2) - 1;
          map.fill(mid, floorRow - 3, 3, 1, TILE.PLATFORM);
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

  /* A spike bed wider than two tiles cannot be cleared in a single jump, which
     turns it from a hazard into a toll. Trim any longer run and put a platform
     above what remains so there is always a clean way across. */
  const MAX_SPIKE_RUN = 2;

  function capSpikeRuns(map) {
    const floorRow = ROOM_H - 3;
    let runStart = -1;

    for (let tx = 0; tx <= map.w; tx++) {
      const spike = tx < map.w && map.isSpike(tx, floorRow);

      if (spike && runStart < 0) runStart = tx;
      else if (!spike && runStart >= 0) {
        const width = tx - runStart;
        if (width > MAX_SPIKE_RUN) {
          for (let x = runStart + MAX_SPIKE_RUN; x < tx; x++) {
            map.set(x, floorRow, TILE.EMPTY);
          }
        }
        map.fill(runStart, floorRow - 3, Math.min(width, MAX_SPIKE_RUN) + 1, 1, TILE.PLATFORM);
        runStart = -1;
      }
    }
  }

  // Torches every few rooms keep long corridors from going flat and dark.
  function scatterTorches(map, rng, out) {
    const doorX = (out && out.door) ? Math.floor(out.door.x / T) : -99;
    const chestsX = (out && out.chests) ? out.chests.map(function (c) { return Math.floor(c.x / T); }) : [];
    for (let tx = 6; tx < map.w - 4; tx += rng.int(8, 13)) {
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
    const rooms = DS.M.clamp(7 + Math.floor(depth * 1.2), 7, 14);
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
    scatterTorches(map, rng, out);

    out.chests = out.chests.filter(function () { return rng.chance(0.85); });
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
  /* Which shape of floor this depth is. The corridor and the carved climb are
     the two originals; the flooded cave and the mountain are whole different
     rooms with their own rules, and they only start turning up once the run is
     past its opening floor. Rolling them here - rather than at the call site -
     keeps every caller asking for the same thing: a floor. */
  function pickFlavor(rng, depth) {
    if (depth < 2) return 'plain';
    const roll = rng.float();
    if (DS.Mountain && roll < 0.18) return 'mountain';
    if (DS.Water && roll < 0.38) return 'flooded';
    return 'plain';
  }

  function build(rng, depth, kind) {
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
    const carvedChance = DS.M.clamp(0.45 + depth * 0.07, 0.45, 0.85);
    if (DS.Parkour && rng.chance(carvedChance)) return buildCarved(rng, depth, out);

    // Longer levels the deeper you go, but never long enough to drag.
    const middle = DS.M.clamp(6 + Math.floor(depth * 1.1), 6, 12);
    const picks = [];
    for (let i = 0; i < middle; i++) picks.push(rng.pick(PADDED_ROOMS));

    // One pit of doom per level, more likely the deeper you are. Never the
    // first middle room, so the floor always opens on solid ground.
    const pitChance = DS.M.clamp(0.35 + depth * 0.08, 0.35, 0.85);
    if (middle >= 2 && rng.chance(pitChance)) {
      picks[rng.int(1, middle - 1)] = rng.pick(PADDED_PITS);
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
    capSpikeRuns(map);
    /* Give every bottomless column its bottom before anything else reads the
       map. Each pit rolls its own kind - a chasm that ends the run, or a bed
       of spikes you can climb back out of - so a hole in the floor has to be
       looked at rather than assumed. */
    map.sealPits(rng);
    scatterTorches(map, rng, out);

    // Chests are a chance per marker, not a guarantee, so two runs through the
    // same template still feel different.
    out.chests = out.chests.filter(function () { return rng.chance(0.72); });

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
     anything that used to assume ROOM_H - 2 asks for this instead. */
  function floorRowAt(map, tx) {
    const y = map.floorBelow(tx, 0);
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
