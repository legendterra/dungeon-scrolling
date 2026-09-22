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

    /* No local safety net any more. The climb rule and the exit guarantee both
       live in systems/reach.js and run from world/generator.js AFTER the support
       pass, which is the only order that works: this carver's own rungs used to
       be built first, and the pillar that the support pass raised afterwards
       could seal the corridor with nobody left to re-check the level. */
    /* The climb rule and exit guarantee have moved into systems/reach.js, which
       generator.js runs after the support pass, so a corridor sealed by a later
       pillar is still caught. This carver only places terrain and markers,
       leaving the level's traversability as a single claim made by one owner. */
    populate(map, rng, depth, segments, out);
    return segments;
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

  DS.Parkour = {
    carve: carve,
    BASE_ROW: BASE_ROW,
    TOP_ROW: TOP_ROW,
    CEIL_ROW: CEIL_ROW
  };
})(window.DS);
