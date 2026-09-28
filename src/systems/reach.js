/* Can the hero actually get there?

   One owner for one question: standing here, which cells can I reach? Every
   answer below is derived from the same constants the character runs on
   (items/inventory.js BASE for speed and jump velocity, DS.C for gravity,
   entities/player.js for the air jump, the 8x14 body box and the 0.14 air
   friction), so a level that passes this pass is a level the hero can finish.

   Why this exists: the terrain generators each grew their own safety net, and
   the carved-floor one judged the level with a hand-written move model --
   "three tiles across, three rows up, at the same time" -- which is more
   athletic than the character. It also ran BEFORE world/generator.js's support
   pass, so the pillars and shelves that pass builds could wall a corridor off
   afterwards with nobody left to notice. A pillar holding a ledge five rows up
   is honest terrain; a pillar holding a ledge five rows up with no way onto it
   is a dead run.

   Two rules, applied once, after all terrain is final:
     - every cliff on the route the hero cannot already get up gets a climb
       bolted to its face - a rope tied at the lip, or a whole ladder of rungs
       touching the rock - never scaffolding in open air;
     - the exit column must be in reach of the spawn; where it is not, a step is
       placed at the frontier, then a passage is cut, and if neither fits, the
       floor the hero is standing on is simply extended.

   The last of those three is what makes this a guarantee rather than a
   heuristic: it can always be done, so the repair loop always makes progress
   and never walks away from a level it could not finish.

   Pure tile queries: this touches no entity, no texture and no Three.js. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;
  const M = DS.M;

  /* --- the hero's move set -------------------------------------------------- */

  const BOX_W = 8;         // Ent.make(x, y - 14, 8, 14)
  const BOX_H = 14;
  const SPEED = 1.45;      // BASE.moveSpeed, unarmoured
  const JUMP = 5.3;        // BASE.jumpVel
  const AIR = 0.92;        // the air jump's velocity multiplier
  const MAX_AIR = 1;       // AIR_JUMPS
  const G = DS.C.GRAVITY;
  const MAX_FALL = DS.C.MAX_FALL;
  const FRAMES = 96;       // a hop still airborne after this never lands

  const MAX_HOP = 5;       // columns a hop is even considered over
  const MAX_DOWN = 3;      // rows a hop is even considered over
  const MAX_DROP = 26;     // rows a walk-off drop is followed
  const MAX_RISE = 2;      // rows one jump clears unaided
  const SWIM = 3;          // cells a body in water moves in one beat

  const CEIL_ROW = 3;      // nothing in this game is walked above this row

  /* The air jump can be spent on any frame, and the three timings below cover
     what it buys: saved for the apex it is the tallest hop the hero owns, spent
     late it is the widest, and not spent at all it is the cheapest. */
  const AIR_TIMINGS = [-1, 15, 30];

  /* The feet of a body standing on the surface tile at `row` rest on that tile's
     top edge, so the empty cell it occupies is row - 1 and its box hangs from
     feetY(row) - BOX_H. Both directions of that convention live here so the
     generator, the hop model below and the QA solver cannot drift apart. */
  function feetY(row) { return (row + 1) * T; }

  /* --- tile queries --------------------------------------------------------- */

  function boxHitsWall(map, x, y) {
    const x0 = Math.floor(x / T), x1 = Math.floor((x + BOX_W - 0.01) / T);
    const y0 = Math.floor(y / T), y1 = Math.floor((y + BOX_H - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (map.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  /* Is the cell the hero's body would occupy empty, with nothing in the way? */
  function clearCell(map, tx, ty) {
    if (map.isBlocked(tx, ty) || map.isSpike(tx, ty)) return false;
    return !boxHitsWall(map, tx * T, feetY(ty) - BOX_H);
  }

  /* Can the hero stand here: an empty body cell with a floor under its feet. */
  function standable(map, tx, ty) {
    if (tx < 1 || tx >= map.w - 1 || ty < 1 || ty >= map.h - 1) return false;
    if (!clearCell(map, tx, ty)) return false;
    return map.isSolid(tx, ty + 1) || map.isPlatform(tx, ty + 1);
  }

  /* --- hops ------------------------------------------------------------------

     A hop is a vertical profile plus a horizontal decision. The profile is the
     jump, optionally cut short and re-armed by the air jump on some frame; the
     decision is that the player steers toward the column they are aiming for and
     lets go of the stick when they are over it, which the 0.14 air friction
     makes honest (a body at full tilt stops inside half a tile of letting go).

     So a hop is possible when the feet, after rising however high the profile
     takes them, come back down to the target row while the body is over the
     target column, without ever touching rock -- nothing more athletic than
     that, and nothing less. */

  const profiles = {};

  function trajectory(dx, dy, airAt) {
    const key = dx + ':' + dy + ':' + airAt;
    if (profiles[key] !== undefined) return profiles[key];

    const xGoal = dx * T, yGoal = dy * T;
    let x = 0, y = 0, vy = -JUMP, airLeft = MAX_AIR;
    const pts = [[0, 0, -JUMP]];

    for (let f = 0; f < FRAMES; f++) {
      if (airLeft > 0 && f === airAt) { vy = -JUMP * AIR; airLeft--; }
      vy = Math.min(vy + G, MAX_FALL);
      y += vy;
      const want = xGoal - x;
      if (want > 1) x += Math.min(SPEED, want);
      else if (want < -1) x -= Math.min(SPEED, -want);
      pts.push([x, y, vy]);
      if (vy > 0 && y >= yGoal) {
        // Only a landing that is really over the aimed-for column counts, and
        // only if the steer finished in time to be there.
        profiles[key] = Math.abs(x - xGoal) < 1.5 ? pts : null;
        return profiles[key];
      }
      if (y > yGoal + 3 * T) break;              // fell well past the target
    }
    profiles[key] = null;
    return null;
  }

  /* The [dx, dy] shapes worth simulating at all, in vacuum. Nothing in a map
     can make an impossible hop possible, so this is the candidate list. */
  const HOPS = (function () {
    const out = [];
    for (let dx = -MAX_HOP; dx <= MAX_HOP; dx++) {
      for (let dy = -MAX_HOP; dy <= MAX_DOWN; dy++) {
        if (!dx && !dy) continue;
        for (let t = 0; t < AIR_TIMINGS.length; t++) {
          if (trajectory(dx, dy, AIR_TIMINGS[t])) { out.push([dx, dy]); break; }
        }
      }
    }
    return out;
  })();

  /* A platform the descent would land on instead of the intended floor. */
  function intercepts(map, px, fromFeet, toFeet, ownRow) {
    const x0 = Math.floor(px / T), x1 = Math.floor((px + BOX_W - 0.01) / T);
    const r0 = Math.floor(fromFeet / T) + 1;
    const r1 = Math.floor(toFeet / T);
    for (let r = r0; r <= r1; r++) {
      if (r === ownRow) continue;
      for (let tx = x0; tx <= x1; tx++) {
        if (map.isPlatform(tx, r)) return true;
      }
    }
    return false;
  }

  function hopOk(map, fromTx, fromRow, dx, dy) {
    const toTx = fromTx + dx, toRow = fromRow + dy;
    if (toTx < 1 || toTx >= map.w - 1 || toRow < 1 || toRow >= map.h - 1) return false;

    const sx = fromTx * T + (T - BOX_W) / 2;
    const sy = feetY(fromRow) - BOX_H;
    const floorRow = toRow + 1;                 // the tile the hop lands on

    for (let t = 0; t < AIR_TIMINGS.length; t++) {
      const pts = trajectory(dx, dy, AIR_TIMINGS[t]);
      if (!pts) continue;

      let prevFeet = feetY(fromRow);
      let clean = true;
      for (let i = 1; i < pts.length; i++) {
        const px = sx + pts[i][0], py = sy + pts[i][1], vy = pts[i][2];
        const feet = py + BOX_H;
        const landed = vy > 0 && feet >= feetY(toRow);
        if (!landed && boxHitsWall(map, px, py)) { clean = false; break; }
        if (vy > 0 && intercepts(map, px, prevFeet, feet, floorRow)) { clean = false; break; }
        prevFeet = feet;
      }
      if (clean) return true;
    }
    return false;
  }

  /* Ropes, as the move model sees them.

     The hero grabs a rope on contact and rides it up or down at ROPE_CLIMB
     (entities/player.js), which mountain shafts have been built around since the
     day the tile was added -- and this model did not know it, so a shaft whose
     only route was a rope read as a wall and the repair pass paved it with
     platforms. A rope is a two-way edge between the cells at its foot and the
     cells at its head: anything you can stand on within a body's reach of the
     bottom end connects to anything you can stand on within reach of the top.

     Rebuilt once per flood rather than cached per map: the repair passes edit
     tiles, and a rope's ends depend on which cells are standable today. */
  let ropeGraph = null;

  function buildRopes(map) {
    const graph = new Map();
    const link = function (a, b) {
      let list = graph.get(a);
      if (!list) { list = []; graph.set(a, list); }
      if (list.indexOf(b) < 0) list.push(b);
    };
    for (let tx = 1; tx < map.w - 1; tx++) {
      let ty = 1;
      while (ty < map.h - 1) {
        if (!map.isRope(tx, ty)) { ty++; continue; }
        const top = ty;
        while (ty < map.h - 1 && map.isRope(tx, ty)) ty++;
        const bottom = ty - 1;

        const feet = [], heads = [];
        for (let d = -1; d <= 1; d++) {
          const x = tx + d;
          if (x < 1 || x >= map.w - 1) continue;
          for (let row = bottom - 2; row <= bottom + 2; row++) {
            if (standable(map, x, row)) feet.push(x + ',' + row);
          }
          for (let row = top - 2; row <= top + 2; row++) {
            if (standable(map, x, row)) heads.push(x + ',' + row);
          }
        }
        for (let i = 0; i < feet.length; i++) {
          for (let j = 0; j < heads.length; j++) {
            link(feet[i], heads[j]);
            link(heads[j], feet[i]);
          }
        }
      }
    }
    return graph;
  }

  /* Every cell a step, a hop or a walk-off drop can leave this one for. */
  function movesFrom(map, tx, ty) {
    const out = [];

    if (ropeGraph) {
      const list = ropeGraph.get(tx + ',' + ty);
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const c = list[i].split(',');
          out.push([Number(c[0]), Number(c[1])]);
        }
      }
    }

    for (let i = 0; i < HOPS.length; i++) {
      const dx = HOPS[i][0], dy = HOPS[i][1];
      const nx = tx + dx, ny = ty + dy;
      if (!standable(map, nx, ny)) continue;
      // A single row down or level is a step, not a jump.
      if (Math.abs(dx) <= 1 && dy >= 0) { out.push([nx, ny]); continue; }
      if (hopOk(map, tx, ty, dx, dy)) out.push([nx, ny]);
    }

    // Walking off an edge and dropping to whatever the column offers below.
    for (let dx = -MAX_HOP; dx <= MAX_HOP; dx++) {
      const nx = tx + dx;
      if (nx < 1 || nx >= map.w - 1) continue;
      for (let y = ty + 1; y < map.h - 1 && y - ty <= MAX_DROP; y++) {
        if (standable(map, nx, y)) { out.push([nx, y]); break; }
        if (map.isSolid(nx, y)) break;
      }
    }

    /* Swimming. A body in water is not standing on anything: it turns, rises
       and sinks at will, which is what makes a flooded hall a route instead of
       a wall. Without this the only honest reading of the level was "the hero
       cannot get past the pillar", and the repair pass dutifully cut one. */
    if (map.isWater(tx, ty)) {
      for (let dx = -SWIM; dx <= SWIM; dx++) {
        for (let dy = -SWIM; dy <= SWIM; dy++) {
          if (!dx && !dy) continue;
          const nx = tx + dx, ny = ty + dy;
          if (nx < 1 || nx >= map.w - 1 || ny < 1 || ny >= map.h - 1) continue;
          if (!map.isWater(nx, ny) || !clearCell(map, nx, ny)) continue;
          out.push([nx, ny]);
        }
      }
    }
    return out;
  }

  function surfaceCell(map, spawn) {
    const tx = M.clamp(Math.floor(spawn.x / T), 1, map.w - 2);
    let ty = M.clamp(Math.floor(spawn.y / T), 1, map.h - 2);
    while (ty < map.h - 1 && !standable(map, tx, ty)) ty++;
    if (standable(map, tx, ty)) return [tx, ty];
    // A spawn dropped into water is a body in water, which is a fine place to
    // start from: the flood just has to know it can swim.
    if (map.isWater(tx, ty) && clearCell(map, tx, ty)) return [tx, ty];
    return null;
  }

  /* Flood the floor from a spawn cell. Returns null when there is nowhere to
     stand, which callers treat as "not my problem" rather than "unreachable". */
  function reachable(map, spawn) {
    ropeGraph = buildRopes(map);
    const start = surfaceCell(map, spawn);
    if (!start) return null;

    const seen = new Set([start[0] + ',' + start[1]]);
    const queue = [start];
    /* Every edge the flood walks, as flat [fromTx, fromTy, toTx, toTy] groups.
       The flood has to expand each cell anyway, so recording what it found is
       free -- and the reverse question ("can I get back out of here?") needs
       exactly this edge set, inverted. */
    const edges = [];
    let best = start;

    while (queue.length) {
      const cell = queue.pop();
      const moves = movesFrom(map, cell[0], cell[1]);
      for (let i = 0; i < moves.length; i++) {
        edges.push(cell[0], cell[1], moves[i][0], moves[i][1]);
        const k = moves[i][0] + ',' + moves[i][1];
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(moves[i]);
      }
      /* The frontier is the furthest cell to the right, and among those the
         lowest - the one a player would actually be standing on. */
      if (cell[0] > best[0] || (cell[0] === best[0] && cell[1] > best[1])) best = cell;
    }
    return { seen: seen, maxX: best[0], front: best, start: start, edges: edges };
  }

  /* Where the player can still finish from.

     The move set is not symmetric: a drop is one way, and a climb is limited to
     what the hop model proves. So "the spawn can reach the door" and "the door
     is reachable from where I am standing" are different questions, and a level
     that only answers the first one ships pockets -- a spot you fall into, or
     walk into down a two row step, and never gets out of. No death, no door,
     just a run that quietly ends.

     Inverting the flood's own edges answers it exactly: seed the backwards walk
     with every cell at or past the door column, follow the edges in reverse,
     and what it does not reach is a pocket. */
  function escapes(map, reach, doorTx) {
    const back = new Map();
    const e = reach.edges || [];
    for (let i = 0; i < e.length; i += 4) {
      const key = e[i + 2] + ',' + e[i + 3];
      let list = back.get(key);
      if (!list) { list = []; back.set(key, list); }
      list.push(e[i], e[i + 1]);
    }

    const out = new Set();
    const queue = [];
    reach.seen.forEach(function (k) {
      if (Number(k.slice(0, k.indexOf(','))) < doorTx) return;
      out.add(k);
      const c = k.split(',');
      queue.push(Number(c[0]), Number(c[1]));
    });
    while (queue.length) {
      const ty = queue.pop(), tx = queue.pop();
      const list = back.get(tx + ',' + ty);
      if (!list) continue;
      for (let i = 0; i < list.length; i += 2) {
        const k = list[i] + ',' + list[i + 1];
        if (out.has(k)) continue;
        out.add(k);
        queue.push(list[i], list[i + 1]);
      }
    }
    return out;
  }

  function doorColumn(spawns) {
    if (!spawns) return null;
    if (spawns.doorTx != null) return spawns.doorTx;
    if (spawns.door) return Math.floor(spawns.door.x / T);
    return null;
  }

  /* The surface tile row of a column - the ROCK the player walks on - or -1 for
     a column with no floor at all. solidBelow skips a roof first, which is what
     makes this right in a cave (from row 0 the first solid is the ceiling), and
     it looks past one-way platforms: a ledge floating over the floor is not the
     top of a cliff, and reading it as one is how a ladder got built up to a
     plank in mid-air. */
  function surfaceRow(map, tx) {
    if (tx < 0 || tx >= map.w) return -1;
    const y = map.solidBelow ? map.solidBelow(tx) : map.groundBelow(tx);
    if (y >= map.pixelH) return -1;
    const row = Math.floor(y / T);
    return map.isSolid(tx, row) ? row : -1;
  }

  /* --- the climb rule -------------------------------------------------------

     A climb is FURNITURE BOLTED TO A CLIFF, never scaffolding in the air. Both
     kinds are built against a face of rock and only ever whole:

       rope    one column hung beside the face, tied level with the lip and
               reaching down to the floor at the foot;
       ladder  two-tile rungs every two rows, each touching the face, from level
               with the lip down to a hop above the foot.

     Atomic, because a ladder with a rung missing is the worst shape the game
     can ship: it reads as a way up and is not one. So every cell is checked
     first and nothing is written unless all of them fit. */

  const CLIMB_STEP = 2;    // rows between rungs
  const RUNG_W = 2;        // tiles of landing room each rung offers

  /* A face this tall is climbed by a rope, not by a ladder of platforms: the
     rope is one column of art hung against the cliff, where six rungs read as
     scaffolding. The move model knows ropes (buildRopes above). */
  const ROPE_RISE = 4;     // rows of rise that earn a rope instead of rungs

  /* A rope already hanging against this face - the mountain hangs its own -
     or a designed route already built in front of it (a parkour staircase, the
     ledges up the coin tower). Either way the climb exists, and a second one
     beside it is how a cliff ended up with a rope AND a ladder. */
  function climbServed(map, faceX, side, topRow, footRow) {
    for (let d = 1; d <= 3; d++) {
      const x = faceX + side * d;
      if (x < 0 || x >= map.w) break;
      for (let row = topRow - 1; row <= footRow - 1; row++) {
        if (map.isRope(x, row)) return true;
        if (map.isPlatform(x, row) && map.isDesigned && map.isDesigned(x, row)) return true;
      }
    }
    return false;
  }

  function writer(map, put) { return put || defaultPut(map); }

  /* Plan (and, if every cell fits, build) a climb up the face of rock at
     column `faceX`, whose lip is the surface row `topRow` and whose foot is the
     floor at `footRow`. `side` is where the climber stands: -1 for a cliff that
     rises to the right (climbed from its left), +1 for one that rises to the
     left. Returns what was built: { kind, cells } or null. */
  function buildClimb(map, faceX, side, topRow, footRow, put) {
    const rise = footRow - topRow;
    if (rise <= MAX_RISE || topRow <= CEIL_ROW) return null;
    if (!map.isSolid(faceX, topRow)) return null;
    const set = writer(map, put);

    if (rise >= ROPE_RISE) {
      const rx = faceX + side;
      let fits = rx >= 1 && rx < map.w - 1;
      for (let row = topRow; row <= footRow - 1 && fits; row++) {
        if (map.get(rx, row) !== TILE.EMPTY) fits = false;
      }
      // The foot has to be ground a body stands on, or the rope hangs into air.
      if (fits && !(map.isSolid(rx, footRow) || map.isPlatform(rx, footRow))) fits = false;
      if (fits) {
        const cells = [];
        for (let row = topRow; row <= footRow - 1; row++) { set(rx, row, TILE.ROPE); cells.push(rx, row); }
        return { kind: 'rope', cells: cells };
      }
    }

    /* The ladder, top down: the highest rung is level with the lip, so walking
       off it is a step, and each rung below is CLIMB_STEP under the last. */
    const plan = [];
    for (let row = topRow; row <= footRow - 2; row += CLIMB_STEP) {
      const at = rungFor(map, faceX, side, row);
      if (!at) return null;                   // one missing rung: no ladder
      plan.push(at);
    }
    if (!plan.length) return null;
    const cells = [];
    for (let i = 0; i < plan.length; i++) {
      for (let k = 0; k < plan[i].w; k++) {
        set(plan[i].x + k, plan[i].row, TILE.PLATFORM);
        cells.push(plan[i].x + k, plan[i].row);
      }
    }
    return { kind: 'ladder', cells: cells };
  }

  /* One rung against the face: two tiles if they fit, one if the level left no
     room for more, never anywhere that does not touch the rock. */
  function rungFor(map, faceX, side, row) {
    if (row <= CEIL_ROW || !map.isSolid(faceX, row)) return null;
    for (let w = RUNG_W; w >= 1; w--) {
      const x = side < 0 ? faceX - w : faceX + 1;
      let fits = x >= 1 && x + w - 1 < map.w - 1;
      for (let k = 0; k < w && fits; k++) {
        if (map.get(x + k, row) !== TILE.EMPTY) fits = false;
        else if (!clearCell(map, x + k, row - 1)) fits = false;
      }
      if (fits) return { x: x, row: row, w: w };
    }
    return null;
  }

  /* Climbs up the cliffs the hero actually meets and cannot get up, on the
     approach side. `seen` is the flood from the spawn: a cliff whose foot the
     hero never stands at is not on the route, and a cliff whose top they
     already reach some other way - a staircase, a step, the plinth in front of
     a vault - needs nothing bolted to it. Building a climb on every tall face
     regardless is what hung ropes in doorways and ladders beside stairs.

     A cliff rising to the LEFT is only ever a problem if dropping off it
     strands the hero, and that is the pocket repair's question, which builds
     the same climb when the answer is yes. `placed` collects each ladder as a
     unit so pruning can take a whole ladder or none of it. */
  let ropeCount = 0;      // ropes hung this level
  let rungCount = 0;      // rungs placed this level

  function ensureClimbs(map, placed, seen) {
    let built = 0;
    for (let tx = 3; tx < map.w - 1; tx++) {
      const here = surfaceRow(map, tx);
      const prev = surfaceRow(map, tx - 1);
      if (here < 0 || prev < 0) continue;
      if (prev - here <= MAX_RISE) continue;
      if (seen && (!seen.has((tx - 1) + ',' + (prev - 1)) || seen.has(tx + ',' + (here - 1)))) continue;
      // A cliff whose foot is under water is climbed by swimming, not by rungs.
      if (map.isWater(tx - 1, prev - 1)) continue;
      if (climbServed(map, tx, -1, here, prev)) continue;

      const made = buildClimb(map, tx, -1, here, prev);
      if (!made) continue;
      built++;
      if (made.kind === 'rope') { ropeCount++; continue; }
      rungCount += made.cells.length / 2;
      if (placed) placed.push(made.cells);
    }
    return built;
  }

  /* --- the exit rule -------------------------------------------------------- */

  /* Open a walking passage instead of giving up: clear the rock the hero would
     walk through, for a few columns toward the door, leaving the floor under it
     alone. What is left reads as a tunnel, which is what a dungeon answers a
     sealed corridor with. */
  function cut(map, fx, fy, put) {
    if (!put) put = defaultPut(map);
    let opened = false;
    for (let d = 1; d <= 6; d++) {
      const x = fx + d;
      if (x < 1 || x >= map.w - 1) break;
      let barrier = false;
      for (let y = fy - 2; y <= fy + 1; y++) if (map.isSolid(x, y)) barrier = true;
      if (!barrier) { if (opened) break; else continue; }
      for (let y = fy - 4; y <= fy; y++) {
        if (map.isSolid(x, y)) put(x, y, TILE.EMPTY);
        if (map.isSpike(x, y)) put(x, y, TILE.EMPTY);
      }
      opened = true;
    }
    return opened;
  }

  /* Last resort, and the reason this pass is a guarantee: extend the floor the
     hero is already standing on, two tiles at a time, toward the door. The
     surface is the same rock they are on, one row down from their feet, so the
     extension is a floor rather than a prop and stepping onto it is a step. */
  function bridge(map, fx, fy, put) {
    if (!put) put = defaultPut(map);
    for (let d = 1; d <= 3; d++) {
      const x = fx + d;
      if (x < 1 || x >= map.w - 2) return false;
      if (map.isSolid(x, fy)) put(x, fy, TILE.EMPTY);
      if (map.isSpike(x, fy)) put(x, fy, TILE.EMPTY);
      if (!map.isSolid(x, fy + 1)) put(x, fy + 1, TILE.PLATFORM);
    }
    return true;
  }

  /* A step the hero can actually take: a two tile ledge placed ahead, level or
     a row or two up, accepted only once the hop model agrees it can be reached.
     A ledge the hero cannot get onto is put back rather than left in the level. */
  const CANDIDATES = [
    [2, -2], [3, -2], [2, -1], [3, -1], [2, 0], [3, 0],
    [1, -1], [1, -2], [2, 1], [3, 1], [4, -2], [4, 0]
  ];

  /* Is a two-tile step at (x, row) held by anything: rock at either end, or
     rock or a platform under it? */
  function stepHeld(map, x, row) {
    if (map.isSolid(x - 1, row) || map.isSolid(x + RUNG_W, row)) return true;
    for (let k = 0; k < RUNG_W; k++) {
      if (map.isSolid(x + k, row + 1) || map.isPlatform(x + k, row + 1)) return true;
    }
    return false;
  }

  /* Make a step honest. Held already: leave it. A short drop to rock under it:
     the step becomes the top of a block of stone standing on that rock. Neither:
     the step is refused, because a plank in mid-air is the shape this game must
     never ship - and a repair is the last place it should come from. */
  const BLOCK_DROP = 2;    // rows of air a step may be filled down through

  function groundStep(map, x, row, put) {
    if (stepHeld(map, x, row)) return true;
    for (let k = 0; k < RUNG_W; k++) {
      let gy = row + 1;
      while (gy <= row + BLOCK_DROP && map.get(x + k, gy) === TILE.EMPTY) gy++;
      if (gy > row + BLOCK_DROP || !map.isSolid(x + k, gy)) return false;
    }
    for (let k = 0; k < RUNG_W; k++) {
      put(x + k, row, TILE.WALL);
      for (let y = row + 1; map.get(x + k, y) === TILE.EMPTY; y++) put(x + k, y, TILE.WALL);
    }
    return true;
  }

  /* `dir` mirrors the candidates, because the exit rule only ever steps toward
     the door while a pocket has to be climbed out of on the side it was entered
     from. One implementation, two directions. Each candidate is written through
     a local journal so a refused one leaves nothing behind. */
  function step(map, fx, fy, put, dir) {
    if (!put) put = defaultPut(map);
    for (let i = 0; i < CANDIDATES.length; i++) {
      const dx = CANDIDATES[i][0] * (dir || 1), dy = CANDIDATES[i][1];
      const x = fx + dx, y = fy + dy;
      if (x < 1 || x + 1 >= map.w - 1 || y <= CEIL_ROW || y >= map.h - 1) continue;
      if (!clearCell(map, x, y) || !clearCell(map, x + 1, y)) continue;
      if (map.isSpike(x, y) || map.isSpike(x + 1, y)) continue;
      if (map.get(x, y + 1) !== TILE.EMPTY || map.get(x + 1, y + 1) !== TILE.EMPTY) continue;

      const undo = [];
      const local = function (tx, ty, value) { undo.push(tx, ty, map.get(tx, ty)); put(tx, ty, value); };
      for (let k = 0; k < RUNG_W; k++) local(x + k, y + 1, TILE.PLATFORM);
      if (groundStep(map, x, y + 1, local) && hopOk(map, fx, fy, dx, dy)) return true;
      for (let j = undo.length - 3; j >= 0; j -= 3) put(undo[j], undo[j + 1], undo[j + 2]);
    }
    return false;
  }

  /* --- repairs that can be taken back --------------------------------------- */

  function defaultPut(map) {
    return function (tx, ty, value) { map.set(tx, ty, value); };
  }

  /* Apply a repair, and keep it only if the level is no worse afterwards.

     Rock is load bearing. `cut` clears five rows at a time, so any walkway
     inside that band is deleted -- a repair meant to open a passage can sever
     the floor the hero is walking on. So every repair writes through a journal,
     and is rolled back unless the hero can still reach at least as far, and
     stand in at least as many places, as before it. */
  function applyRepair(map, spawns, reach, make, accept) {
    const log = [];
    const put = function (tx, ty, value) {
      log.push(tx, ty, map.get(tx, ty));
      map.set(tx, ty, value);
    };
    const floatersBefore = floaters(map);
    if (!make(put)) {
      for (let i = log.length - 3; i >= 0; i -= 3) map.set(log[i], log[i + 1], log[i + 2]);
      return { ok: false, reach: reach };
    }
    /* A repair that leaves something hanging is no repair: a tunnel cut through
       the stone bracket a ledge was hung on turns the ledge into a plank in
       mid-air. Refused before the flood is even asked. */
    if (floaters(map) > floatersBefore) {
      for (let i = log.length - 3; i >= 0; i -= 3) map.set(log[i], log[i + 1], log[i + 2]);
      return { ok: false, reach: reach };
    }

    const next = reachable(map, spawns.player);
    const good = accept ? accept(next, reach) :
      (next && next.maxX >= reach.maxX && next.seen.size >= reach.seen.size);
    if (good) return { ok: true, reach: next };
    for (let i = log.length - 3; i >= 0; i -= 3) map.set(log[i], log[i + 1], log[i + 2]);
    return { ok: false, reach: reach };
  }

  const BASE_REPAIRS = 6;    // repairs allowed before a level is called stuck

  /* Last resort for a pocket nothing can climb out of: raise its floor. A
     platform laid on the floor the hero is standing on, which is held by that
     floor, so even the last resort is not left in the air. */
  function plug(map, tx, ty, put) {
    if (!(map.isSolid(tx, ty + 1) || map.isPlatform(tx, ty + 1))) return false;
    put(tx, ty, TILE.PLATFORM);
    return true;
  }

  /* Climbs nothing can stand on, removed - whole. A ladder is kept if the
     flood touched ANY of its rungs and dropped if it touched none: taking the
     unreached rungs off one by one is exactly how a ladder lost its bottom half
     and became a promise of a climb that is not there. */
  function pruneRungs(map, placed, seen) {
    let gone = 0;
    for (let i = 0; i < placed.length; i++) {
      const cells = placed[i];
      if (!cells) continue;
      let used = false;
      for (let c = 0; c < cells.length && !used; c += 2) {
        if (seen.has(cells[c] + ',' + (cells[c + 1] - 1))) used = true;
      }
      if (used) continue;
      for (let c = 0; c < cells.length; c += 2) {
        if (map.get(cells[c], cells[c + 1]) === TILE.PLATFORM) { map.set(cells[c], cells[c + 1], TILE.EMPTY); gone++; }
      }
      placed[i] = null;
    }
    return gone;
  }

  const POCKET_BUDGET = 6;   // repairs before a level is called as stuck as it is

  /* The way out of a pocket that a designer would have built: the nearest cliff
     beside it gets a rope or a ladder, bolted to its face. Only a cliff that
     actually rises out of the pocket's own floor counts. */
  const CLIMB_SEARCH = 8;    // columns either side a pocket looks for its wall

  function climbOut(map, px, py, put) {
    const floor = py + 1;
    if (surfaceRow(map, px) !== floor) return false;
    const dirs = [-1, 1];
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      for (let d = 1; d <= CLIMB_SEARCH; d++) {
        const x = px + dir * d;
        const top = surfaceRow(map, x);
        if (top === floor) continue;
        if (top < 0 || floor - top <= MAX_RISE) break;
        if (map.isWater(x - dir, floor - 1)) break;
        if (buildClimb(map, x, -dir, top, floor, put)) return true;
        break;
      }
    }
    return false;
  }

  /* Pockets: cells the hero can get INTO and not back OUT of.

     Repaired with a climb up the wall that traps it first - rope or ladder,
     bolted to the rock like every other climb - then with the same verified
     step the exit rule uses, then with a tunnel, and last by raising the floor.
     A pocket nothing fixes is counted, so the number is reported instead of
     assumed. */
  function repairPockets(map, spawns, doorTx, first) {
    const hopeless = new Set();
    let reach = first || reachable(map, spawns.player);
    let fixed = 0, stuck = 0;

    for (let round = 0; round < POCKET_BUDGET && reach; round++) {
      const back = escapes(map, reach, doorTx);
      let pocket = null;
      reach.seen.forEach(function (k) {
        if (pocket || back.has(k) || hopeless.has(k)) return;
        const c = k.split(',');
        const tx = Number(c[0]), ty = Number(c[1]);
        /* Water is a way out on its own (the move model swims) and a killing
           floor is an ending the player chose; neither is a pocket. */
        if (map.isWater(tx, ty) || map.isDeath(tx, ty)) return;
        pocket = [tx, ty];
      });
      if (!pocket) return { fixed: fixed, stuck: stuck, left: 0 };

      const key = pocket[0] + ',' + pocket[1];
      /* A plug raises one cell, so the flood loses that cell and gains the one a
         body now stands in above it. Anything worse than that trade is the plug
         sealing a corridor, and is refused. */
      const noneLeft = function (next) {
        return next && next.maxX >= reach.maxX &&
               !next.seen.has(key) && next.seen.size >= reach.seen.size - 2;
      };
      // A climb is only worth keeping if it really lets this cell out.
      const freed = function (next) {
        return next && next.maxX >= reach.maxX && escapes(map, next, doorTx).has(key);
      };
      const ways = [
        { make: function (put) { return climbOut(map, pocket[0], pocket[1], put); }, accept: freed },
        { make: function (put) { return step(map, pocket[0], pocket[1], put); } },
        { make: function (put) { return step(map, pocket[0], pocket[1], put, -1); } },
        { make: function (put) { return cut(map, pocket[0], pocket[1], put); } },
        { make: function (put) { return plug(map, pocket[0], pocket[1], put); }, accept: noneLeft }
      ];
      let made = { ok: false, reach: reach };
      for (let w = 0; w < ways.length && !made.ok; w++) {
        made = applyRepair(map, spawns, reach, ways[w].make, ways[w].accept);
      }
      if (made.ok) {
        fixed++;
        reach = made.reach;
      } else {
        hopeless.add(key);
        stuck++;
      }
    }

    let left = 0;
    const back = escapes(map, reach, doorTx);
    reach.seen.forEach(function (k) {
      if (back.has(k)) return;
      const c = k.split(',');
      if (map.isWater(Number(c[0]), Number(c[1])) || map.isDeath(Number(c[0]), Number(c[1]))) return;
      left++;
    });
    return { fixed: fixed, stuck: stuck, left: left };
  }

  /* The guarantee. Called once, after every terrain pass has finished.

     Four questions, asked in rounds until all of them answer yes:
       1. is there a way up every cliff the level built (ropes and ladders);
       2. can the hero walk to the door, and if not, is the rock repaired until
          they can -- step, then cut, then bridge;
       3. are the climbs that repair added used, or scenery (prune, whole);
       4. can the hero get back out of everywhere they can get into (pockets).

     Rounds, rather than one pass in a fixed order, because repairs are not
     monotone. Each repair is journaled and rolled back unless the flood says the
     level is no worse, and each round ends by flooding again. */
  function ensureExit(map, spawns) {
    if (!map || !spawns || !spawns.player) return { ok: false, reason: 'no spawn' };
    const doorTx = doorColumn(spawns);
    if (doorTx == null) return { ok: false, reason: 'no door' };

    const placed = [];
    ropeCount = 0;
    rungCount = 0;
    const before = furniture(map);
    const maxRepairs = Math.max(BASE_REPAIRS, Math.min(32, Math.floor(map.w / 3)));
    const trace = [];
    let repairs = 0;
    let reach = reachable(map, spawns.player);
    if (!reach) return { ok: false, reason: 'no floor at spawn', rungs: 0 };
    /* Climbs where the route needs them, flooding again after each batch:
       the top of one climb is the foot of the next. */
    for (let pass = 0; pass < 4; pass++) {
      if (!ensureClimbs(map, placed, reach.seen)) break;
      reach = reachable(map, spawns.player);
    }
    const climbRungs = rungCount;

    let deadRungs = 0, pocketCount = 0, stuck = 0, left = 0;
    let ok = false;

    for (let round = 0; round < 3 && !ok; round++) {
      let gaveUp = null;
      while (repairs <= maxRepairs && reach.maxX < doorTx) {
        const fx = reach.front[0], fy = reach.front[1];
        const kinds = ['climb', 'step', 'cut', 'bridge'];
        let used = null;
        for (let k = 0; k < kinds.length && !used; k++) {
          const kind = kinds[k];
          /* A climb is kept only if it moves the frontier: a rope that is
             merely no worse is clutter on a wall nobody needed to climb. */
          const accept = kind !== 'climb' ? null : function (next, before) {
            return next && next.maxX > before.maxX && next.seen.size >= before.seen.size;
          };
          const made = applyRepair(map, spawns, reach, function (put) {
            if (kind === 'climb') return climbAhead(map, fx, fy, put);
            if (kind === 'step') return step(map, fx, fy, put);
            if (kind === 'cut') return cut(map, fx, fy, put);
            return bridge(map, fx, fy, put);
          }, accept);
          if (made.ok) { used = kind; reach = made.reach; }
        }
        if (!used) { gaveUp = 'no way forward'; break; }
        trace.push(fx + ',' + fy + ' -> ' + used);
        repairs++;
      }
      if (gaveUp || reach.maxX < doorTx) break;

      deadRungs += pruneRungs(map, placed, reach.seen);
      reach = reachable(map, spawns.player);
      const pockets = repairPockets(map, spawns, doorTx, reach);
      pocketCount += pockets.fixed;
      stuck += pockets.stuck;
      left = pockets.left;
      reach = reachable(map, spawns.player);
      ok = reach.maxX >= doorTx && left === 0;
    }

    /* What this pass added to the level, counted off the map rather than
       tallied by each builder, so a repair a later round rolled back is not
       counted and one the pocket rule built is. */
    const after = furniture(map);
    return {
      ok: ok, rungs: Math.max(0, after.planks - before.planks),
      ropes: Math.max(0, after.ropes - before.ropes),
      climbRungs: climbRungs, ledgeRungs: 0,
      deadRungs: deadRungs, repairs: repairs,
      pockets: pocketCount, stuck: stuck, trapped: left,
      maxX: reach.maxX, trace: trace
    };
  }

  /* Platform runs nobody designed that nothing holds up: no rock at either
     end, no rock or platform under any of it. */
  function floaters(map) {
    let n = 0;
    for (let ty = 0; ty < map.h; ty++) {
      let tx = 0;
      while (tx < map.w) {
        if (!map.isPlatform(tx, ty)) { tx++; continue; }
        const x0 = tx;
        while (tx + 1 < map.w && map.isPlatform(tx + 1, ty)) tx++;
        const x1 = tx;
        tx++;
        let held = map.isSolid(x0 - 1, ty) || map.isSolid(x1 + 1, ty);
        for (let x = x0; x <= x1 && !held; x++) {
          if (map.isDesigned && map.isDesigned(x, ty)) held = true;
          else if (map.isSolid(x, ty + 1) || map.isPlatform(x, ty + 1)) held = true;
        }
        if (!held) n++;
      }
    }
    return n;
  }

  /* Rope segments, and platform tiles nobody designed, on the whole map. */
  function furniture(map) {
    let ropes = 0, planks = 0;
    for (let tx = 0; tx < map.w; tx++) {
      for (let ty = 0; ty < map.h; ty++) {
        if (map.isRope(tx, ty) && !map.isRope(tx, ty - 1)) ropes++;
        if (map.isPlatform(tx, ty) && !(map.isDesigned && map.isDesigned(tx, ty))) planks++;
      }
    }
    return { ropes: ropes, planks: planks };
  }

  /* The frontier is stopped by a wall too tall to jump: bolt a climb to it,
     exactly as the cliff rule would have, before reaching for anything generic. */
  function climbAhead(map, fx, fy, put) {
    const floor = fy + 1;
    for (let d = 1; d <= 3; d++) {
      const x = fx + d;
      const top = surfaceRow(map, x);
      if (top === floor) continue;
      if (top < 0 || floor - top <= MAX_RISE) return false;
      if (surfaceRow(map, x - 1) !== floor) return false;
      return !!buildClimb(map, x, -1, top, floor, put);
    }
    return false;
  }

  /* --- the anchoring audit --------------------------------------------------

     The last word on the terrain. Every repair above is built anchored, so this
     should find nothing; it exists so that "nothing floats" is checked on the
     finished map rather than promised by each builder. What it finds it fixes
     in the least disturbing way - a rope that stops short of its lip or its
     floor is lengthened, a plank a row or two over rock becomes a block on it -
     and every fix is taken back if the door stops being reachable. */
  const ANCHOR_REACH = 3;    // cells a rope may be lengthened by

  function ropeTied(map, tx, top) {
    for (let dx = -1; dx <= 1; dx++) {
      if (map.isSolid(tx + dx, top - 1)) return true;
      if (dx && map.isSolid(tx + dx, top)) return true;
    }
    return false;
  }

  function ropeFooted(map, tx, bottom) {
    const below = map.get(tx, bottom + 1);
    return below === TILE.WALL || below === TILE.PLATFORM || below === TILE.WATER;
  }

  function anchorRopes(map, put) {
    let fixed = 0, loose = 0;
    for (let tx = 1; tx < map.w - 1; tx++) {
      let ty = 0;
      while (ty < map.h) {
        if (!map.isRope(tx, ty)) { ty++; continue; }
        const top = ty;
        while (ty < map.h && map.isRope(tx, ty)) ty++;
        const bottom = ty - 1;

        let t = top, ok = true;
        for (let n = 0; !ropeTied(map, tx, t) && n < ANCHOR_REACH; n++) {
          if (t - 1 <= CEIL_ROW || map.get(tx, t - 1) !== TILE.EMPTY) break;
          t--; put(tx, t, TILE.ROPE); fixed++;
        }
        if (!ropeTied(map, tx, t)) ok = false;
        let b = bottom;
        for (let n = 0; !ropeFooted(map, tx, b) && n < ANCHOR_REACH; n++) {
          if (b + 1 >= map.h - 1 || map.get(tx, b + 1) !== TILE.EMPTY) break;
          b++; put(tx, b, TILE.ROPE); fixed++;
        }
        if (!ropeFooted(map, tx, b)) ok = false;
        if (!ok) loose++;
        ty = b + 1;
      }
    }
    return { fixed: fixed, loose: loose };
  }

  function anchorPlanks(map, put) {
    let fixed = 0, loose = 0;
    for (let ty = CEIL_ROW; ty < map.h - 1; ty++) {
      let tx = 0;
      while (tx < map.w) {
        if (!map.isPlatform(tx, ty)) { tx++; continue; }
        const x0 = tx;
        while (tx + 1 < map.w && map.isPlatform(tx + 1, ty)) tx++;
        const x1 = tx;
        tx++;
        let designed = false, held = map.isSolid(x0 - 1, ty) || map.isSolid(x1 + 1, ty);
        for (let x = x0; x <= x1; x++) {
          if (map.isDesigned && map.isDesigned(x, ty)) designed = true;
          if (map.isSolid(x, ty + 1) || map.isPlatform(x, ty + 1)) held = true;
        }
        if (designed || held) continue;
        // Rock a short drop below every tile: stand the plank on it as a block.
        let ground = true;
        for (let x = x0; x <= x1 && ground; x++) {
          let gy = ty + 1;
          while (gy <= ty + BLOCK_DROP && map.get(x, gy) === TILE.EMPTY) gy++;
          if (gy > ty + BLOCK_DROP || !map.isSolid(x, gy)) ground = false;
        }
        if (!ground) { loose++; continue; }
        for (let x = x0; x <= x1; x++) {
          put(x, ty, TILE.WALL);
          for (let y = ty + 1; map.get(x, y) === TILE.EMPTY; y++) put(x, y, TILE.WALL);
        }
        fixed++;
      }
    }
    return { fixed: fixed, loose: loose };
  }

  function anchor(map, spawns) {
    const log = [];
    const put = function (tx, ty, value) { log.push(tx, ty, map.get(tx, ty)); map.set(tx, ty, value); };
    const ropes = anchorRopes(map, put);
    const planks = anchorPlanks(map, put);
    const report = {
      ropesFixed: ropes.fixed, ropesLoose: ropes.loose,
      planksFixed: planks.fixed, planksLoose: planks.loose, rolledBack: false
    };
    if (!log.length || !spawns || !spawns.player) return report;
    const doorTx = doorColumn(spawns);
    const reach = reachable(map, spawns.player);
    if (doorTx != null && (!reach || reach.maxX < doorTx)) {
      for (let i = log.length - 3; i >= 0; i -= 3) map.set(log[i], log[i + 1], log[i + 2]);
      report.rolledBack = true;
    }
    return report;
  }

  DS.Reach = {
    reachable: reachable,
    escapes: escapes,
    ensureExit: ensureExit,
    ensureClimbs: ensureClimbs,
    buildClimb: buildClimb,
    anchor: anchor,
    standable: standable,
    surfaceRow: surfaceRow,
    doorColumn: doorColumn,
    feetY: feetY,
    MAX_RISE: MAX_RISE,
    BOX_W: BOX_W,
    BOX_H: BOX_H
  };
})(window.DS);
