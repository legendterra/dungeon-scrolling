/* Procedural parkour terrain.

   The template rooms are all one floor height, so every level built from them
   is the same corridor with different furniture. This builds the other kind of
   floor: a height profile that climbs to the ceiling, plunges to the bedrock,
   and pays for every metre of it with platforms, ledges and pits.

   Two rules keep it honest, and everything below exists to serve them:
     - a rise is never taller than the player can climb, because every rise
       taller than one tile gets a staircase of platforms under it;
     - a column with no floor is a death pit, so gaps are only ever cut on
       purpose, and always with a crossing over them.                        */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;
  const M = DS.M;

  const CEIL_ROW = 3;          // nothing is ever built above this
  const TOP_ROW = 5;           // the highest a floor can climb
  const BASE_ROW = 20;         // the lowest a floor can sit (bedrock is below)

  /* Shape of the whole level, as a 0..1 height curve sampled left to right.
     This is what makes one level "a long climb" and the next "a descent into
     the dark" rather than both being noise. */
  const SHAPES = {
    rolling: function (t) { return 0.35 + Math.sin(t * Math.PI * 2) * 0.3; },
    ascent:  function (t) { return t; },
    descent: function (t) { return 1 - t; },
    peak:    function (t) { return 1 - Math.abs(t - 0.5) * 2; },
    valley:  function (t) { return Math.abs(t - 0.5) * 2; },
    tower:   function (t) { return t < 0.62 ? t / 0.62 : 1; },
    plunge:  function (t) { return t < 0.34 ? 1 : 1 - (t - 0.34) / 0.66; }
  };

  const SHAPE_KEYS = Object.keys(SHAPES);

  /* How far this floor's climb reaches, as a fraction of the full height.
     Set once per carve from the difficulty curve, so a depth 2 cave is a gentle
     undulation and a depth 9 ash reach is a real ascent - the shape says WHICH
     hill, the curve says HOW TALL. */
  let spanScale = 1;

  function rowFor(shape, t) {
    const h = M.clamp(SHAPES[shape](t), 0, 1);
    const span = (BASE_ROW - TOP_ROW) * M.clamp(spanScale, 0.5, 1.35);
    return Math.round(BASE_ROW - h * span);
  }

  /* Fill a column with bedrock from its floor row down. The tile renderer
     draws the exposed top face as ground on its own. */
  function column(map, tx, floorRow) {
    for (let ty = floorRow; ty < map.h; ty++) map.set(tx, ty, TILE.WALL);
  }

  function platformRun(map, tx, row, width) {
    if (row <= CEIL_ROW) return;
    for (let i = 0; i < width; i++) map.set(tx + i, row, TILE.PLATFORM);
  }

  /* A climb the player can actually make: platforms every two rows, staggered
     horizontally so each one is a real hop rather than a ladder. The ground
     underneath stays solid, so a missed jump costs height, not the run. */
  function staircase(map, fromX, width, fromRow, toRow) {
    const rise = fromRow - toRow;
    const steps = Math.ceil(rise / 2);
    /* The steps march toward the cliff, with the last one landing against its
       face. Spacing them from the left instead left the top step marooned
       several columns short of the ledge it was supposed to reach. */
    for (let s = 1; s <= steps; s++) {
      const row = Math.max(toRow + 1, fromRow - s * 2);
      const x = Math.max(fromX, fromX + width - 2 - (steps - s) * STEP_RUN);
      platformRun(map, x, row, 2);
    }
  }

  // Horizontal spacing between two steps of a staircase, in tiles.
  const STEP_RUN = 3;

  // Ledges on the way down, so a long drop reads as a descent, not a hole.
  function ledges(map, rng, fromX, width, fromRow, toRow) {
    const drop = toRow - fromRow;
    if (drop < 5) return;
    const count = Math.min(3, Math.floor(drop / 4));
    for (let i = 1; i <= count; i++) {
      const row = fromRow + Math.round((drop * i) / (count + 1));
      const x = fromX + rng.int(0, Math.max(0, width - 3));
      platformRun(map, x, row, rng.int(2, 3));
    }
  }

  /* A bottomless gap with a crossing over it. Hops are capped at three tiles,
     which is what the jump plus the air jump clears. */
  function pit(map, rng, fromX, width, row) {
    const deck = Math.max(CEIL_ROW + 2, row - rng.int(2, 3));
    /* Stepping stones at a fixed stride. The old version spaced them randomly
       from the left and could run out of room before placing a single one,
       which turned a narrow gap into an unjumpable hole. */
    for (let x = fromX; x <= fromX + width - 2; x += HOP) {
      platformRun(map, x, deck, 2);
    }
  }

  // Horizontal stride between stepping stones: jump plus air jump clears three.
  const HOP = 3;

  /* Floating parkour above the walking surface: short chains you can take
     instead of the floor, usually toward a chest or over a spike bed. */
  function decorate(map, rng, fromX, width, row, depth) {
    if (width < 5) return;
    if (!rng.chance(0.42 + depth * 0.03)) return;

    const chainRow = Math.max(CEIL_ROW + 1, row - rng.int(4, 7));
    let x = fromX + rng.int(0, 2);
    const links = rng.int(2, 4);
    for (let i = 0; i < links && x < fromX + width - 2; i++) {
      platformRun(map, x, chainRow - (i % 2), rng.int(2, 3));
      x += rng.int(3, 5);
    }
  }

  /* Build the whole floor profile and everything hanging off it.
     Returns the segment list so callers can place things on flat ground. */
  function carve(map, rng, depth, out) {
    const shape = rng.pick(SHAPE_KEYS);
    /* climbSpan runs 8 at depth 1 to 22 at depth 10; 7.6 is its depth-1 value,
       so this is "how much taller than a first floor" expressed as a ratio. */
    if (DS.Difficulty) {
      spanScale = DS.Difficulty.forDepth(depth).climbSpan / 7.6;
    }
    const cols = map.w;
    const segments = [];

    let tx = 0;
    let row = BASE_ROW;

    // The first stretch is always flat, low and safe: it is where you land.
    const openW = 10;
    for (let i = 0; i < openW; i++) column(map, tx + i, row);
    segments.push({ x: tx, w: openW, row: row, safe: true });
    tx += openW;

    while (tx < cols - 12) {
      const t = tx / cols;
      const target = M.clamp(rowFor(shape, t) + rng.int(-2, 2), TOP_ROW, BASE_ROW);
      const rise = row - target;

      // Transition: a staircase up, a cliff down, or a gap across.
      /* An up-transition needs room for its whole staircase, or the steps get
         squeezed together and the climb turns into a wall. */
      const stairW = Math.ceil(Math.max(0, rise) / 2) * STEP_RUN + 2;
      const tw = Math.min(cols - 12 - tx, rise > 0 ? Math.max(4, stairW) : rng.int(3, 6));
      if (tw > 0) {
        const gap = rise === 0 && rng.chance(0.22 + depth * 0.03) && tw >= 5;
        if (gap) {
          pit(map, rng, tx, tw, row);
        } else {
          for (let i = 0; i < tw; i++) column(map, tx + i, row);
          if (rise > 1) staircase(map, tx, tw, row, target);
          if (rise < 0) ledges(map, rng, tx, tw, row, target);
        }
        tx += tw;
      }

      row = target;

      // Landing: a flat stretch at the new height, long enough to fight on.
      const w = Math.min(cols - 12 - tx, rng.int(5, 10));
      if (w <= 0) break;
      for (let i = 0; i < w; i++) column(map, tx + i, row);
      segments.push({ x: tx, w: w, row: row, safe: false });
      decorate(map, rng, tx, w, row, depth);

      // A short spike bed is the cheapest reason to use the platforms above.
      if (w >= 7 && rng.chance(0.26)) {
        const sx = tx + rng.int(2, w - 4);
        map.set(sx, row - 1, TILE.SPIKE);
        if (rng.chance(0.5)) map.set(sx + 1, row - 1, TILE.SPIKE);
      }

      tx += w;
    }

    // The exit shelf: flat, at the bottom, so the door is never mid-climb.
    const tailRow = BASE_ROW;
    if (row - tailRow < 0) ledges(map, rng, tx, 4, row, tailRow);
    for (let i = tx; i < cols; i++) column(map, i, tailRow);
    segments.push({ x: tx, w: cols - tx, row: tailRow, safe: true });

    ensureClimbs(map);
    ensureCrossings(map);
    populate(map, rng, depth, segments, out);
    ensureReachable(map, out);
    return segments;
  }

  /* Safety net, and the only thing here that is allowed to be dumb about it.
     Whatever the shape generator, the decorations or a later system did to the
     terrain, this walks the finished floor and guarantees that every step up
     taller than the player can clear has a ladder of platforms beside it. A
     level that cannot be finished is worse than a level that is not pretty. */
  const CLIMB_STEP = 2;        // rows between rungs
  const MAX_FREE_RISE = 2;     // a step this tall needs no help

  function floorRowOf(map, tx) {
    for (let ty = 0; ty < map.h; ty++) {
      if (map.isSolid(tx, ty)) return ty;
    }
    return -1;
  }

  function ensureClimbs(map) {
    for (let tx = 2; tx < map.w; tx++) {
      const here = floorRowOf(map, tx);
      const prev = floorRowOf(map, tx - 1);
      if (here < 0 || prev < 0) continue;

      const rise = prev - here;
      if (rise <= MAX_FREE_RISE) continue;

      // Rungs climb the low side of the cliff, stepping one column further
      // left each time so no two of them sit directly on top of each other.
      for (let s = 1; s * CLIMB_STEP < rise; s++) {
        const row = prev - s * CLIMB_STEP;
        if (row <= CEIL_ROW) break;
        const x = tx - 1 - s;
        if (x < 0) break;
        if (map.get(x, row) === TILE.EMPTY) map.set(x, row, TILE.PLATFORM);
        if (map.get(x + 1, row) === TILE.EMPTY) map.set(x + 1, row, TILE.PLATFORM);
      }
    }
  }

  /* The pit half of the safety net: every bottomless run gets stepping stones,
     whatever put it there. Platforms are only added where the gap has none
     within reach, so authored crossings are left exactly as they were. */
  function ensureCrossings(map) {
    let start = -1;
    for (let tx = 0; tx <= map.w; tx++) {
      const open = tx < map.w && floorRowOf(map, tx) < 0;
      if (open && start < 0) start = tx;
      if (open || start < 0) continue;

      const left = floorRowOf(map, start - 1);
      const right = floorRowOf(map, tx);
      const lip = Math.min(left < 0 ? BASE_ROW : left, right < 0 ? BASE_ROW : right);
      const deck = Math.max(CEIL_ROW + 2, lip - 3);

      /* Checked one stride at a time rather than once for the whole gap. A gap
         with a stone at each end and nothing in the middle still counts as
         crossed if you only ask whether the gap has any platform at all — and
         that is exactly the hole a run used to end in. */
      for (let x = start; x < tx - 1; x += HOP) {
        if (spanHasPlatform(map, x, Math.min(x + HOP - 1, tx - 1), deck)) continue;
        platformRun(map, x, deck, 2);
      }
      start = -1;
    }
  }

  // Any platform in these columns that a jump from the deck line could reach.
  function spanHasPlatform(map, from, to, deck) {
    for (let tx = from; tx <= to; tx++) {
      for (let ty = deck - 2; ty <= deck + 2; ty++) {
        if (map.isPlatform(tx, ty)) return true;
      }
    }
    return false;
  }

  /* Markers. Enemies stand on flat ground, chests go on the highest ledges
     the level offers — climbing should be worth something. */
  function populate(map, rng, depth, segments, out) {
    const first = segments[0];
    const last = segments[segments.length - 1];

    out.player = { x: (first.x + 2) * T, y: (first.row - 1) * T };
    out.door = null;
    out.doorTx = last.x + Math.floor(last.w / 2);
    out.doorRow = last.row;

    const middle = segments.slice(1, segments.length - 1);
    for (let i = 0; i < middle.length; i++) {
      const seg = middle[i];
      const count = seg.w >= 8 ? rng.int(1, 2) : rng.int(0, 1);
      for (let e = 0; e < count; e++) {
        const ex = seg.x + rng.int(1, Math.max(1, seg.w - 2));
        out.enemies.push({ x: ex * T, y: (seg.row - 1) * T });
      }
    }

    // Two chests at most, and the higher the ledge the better its odds.
    const ranked = middle.slice().sort(function (a, b) { return a.row - b.row; });
    for (let i = 0; i < ranked.length && out.chests.length < 2; i++) {
      const seg = ranked[i];
      if (!rng.chance(i === 0 ? 0.8 : 0.3)) continue;
      out.chests.push({
        x: (seg.x + Math.floor(seg.w / 2)) * T,
        y: (seg.row - 1) * T
      });
    }
  }

  /* The last word on whether a level is playable.

     The two passes above are local rules, and local rules can still combine
     into a wall — a cliff whose ladder is blocked by the pit in front of it,
     say. So the finished map is walked with a deliberately pessimistic model
     of the player (a three-tile hop, no dash, no air jump, when the real hero
     has all three), and wherever that walk stops short of the exit, a platform
     is added at the frontier and the walk is run again. What ships is a level
     the weakest possible player can finish. */
  const JUMP_UP = 3;           // rows a hop is assumed to clear
  const JUMP_OUT = 3;          // columns a hop is assumed to clear
  const MAX_REPAIRS = 60;

  function standable(map, tx, ty) {
    if (tx < 0 || tx >= map.w || ty < 1 || ty >= map.h) return false;
    if (map.isBlocked(tx, ty) || map.isSpike(tx, ty)) return false;
    return map.isSolid(tx, ty + 1) || map.isPlatform(tx, ty + 1);
  }

  function reachable(map, sx, sy) {
    const seen = {};
    const queue = [[sx, sy]];
    seen[sx + ',' + sy] = true;

    while (queue.length) {
      const cell = queue.pop();
      const x = cell[0], y = cell[1];
      const moves = [];

      for (let dx = -JUMP_OUT; dx <= JUMP_OUT; dx++) {
        for (let dy = -JUMP_UP; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          if (Math.abs(dx) > 1 && dy > 0) continue;   // no diving sideways
          moves.push([x + dx, y + dy]);
        }
      }
      // Falling: step off in any direction and drop to the first surface.
      for (let dx = -JUMP_OUT; dx <= JUMP_OUT; dx++) {
        for (let fy = y + 1; fy < map.h; fy++) {
          if (standable(map, x + dx, fy)) { moves.push([x + dx, fy]); break; }
          if (map.isBlocked(x + dx, fy)) break;
        }
      }

      for (let i = 0; i < moves.length; i++) {
        const mx = moves[i][0], my = moves[i][1];
        if (!standable(map, mx, my)) continue;
        const key = mx + ',' + my;
        if (seen[key]) continue;
        seen[key] = true;
        queue.push([mx, my]);
      }
    }
    return seen;
  }

  function ensureReachable(map, out) {
    if (!out.player || out.doorTx == null) return;

    let sx = Math.floor(out.player.x / T);
    let sy = Math.floor(out.player.y / T);
    while (sy < map.h - 1 && !standable(map, sx, sy)) sy++;
    if (!standable(map, sx, sy)) return;

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const seen = reachable(map, sx, sy);

      let bestX = -1, bestY = 0;
      for (const key in seen) {
        const parts = key.split(',');
        const x = +parts[0];
        if (x > bestX) { bestX = x; bestY = +parts[1]; }
      }
      if (bestX >= out.doorTx) return;    // the exit is in reach: done

      // Add one rung at the frontier and ask again.
      if (!bridge(map, bestX, bestY)) return;
    }
  }

  /* One platform placed just beyond the frontier: first try a step up and
     forward, then level, then a landing lower down. Returns false when there
     is nowhere legal to put it, which stops the repair loop rather than
     letting it spin. */
  function bridge(map, fx, fy) {
    const tries = [
      [fx + 2, fy - 2], [fx + 3, fy - 2], [fx + 2, fy],
      [fx + 3, fy - 4], [fx + 2, fy + 2], [fx + 3, fy + 3]
    ];
    for (let i = 0; i < tries.length; i++) {
      const x = tries[i][0], y = tries[i][1];
      if (x >= map.w - 1 || y <= CEIL_ROW || y >= map.h - 1) continue;
      if (map.get(x, y) !== TILE.EMPTY || map.get(x + 1, y) !== TILE.EMPTY) continue;
      if (map.isBlocked(x, y - 1)) continue;      // needs headroom to stand
      platformRun(map, x, y, 2);
      return true;
    }
    return false;
  }

  DS.Parkour = {
    carve: carve,
    BASE_ROW: BASE_ROW,
    TOP_ROW: TOP_ROW,
    CEIL_ROW: CEIL_ROW
  };
})(window.DS);
