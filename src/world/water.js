/* The flooded cave: a depth that is half platforming and half swimming.

   The shape is a valley. Both ends are dry shore at a walkable height, and
   everything between them drops into a lake bed. What makes the water more
   than scenery is the roof: two or three times along the lake the cave ceiling
   dips below the waterline, so the only way past is to fill your lungs at an
   air pocket and dive under the rock. The breath meter lives in player.js;
   this file is what makes it matter.

   Treasure follows the same rule as everywhere else in the dungeon - the
   further from the safe path, the better it pays - so the good chests sit on
   the lake bed under the longest overhang. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;
  const M = DS.M;

  const ROOM_H = 22;
  const CEIL = 2;            // solid rock above this row, always
  const SHORE = 12;          // the dry ledge at either end
  const WATER_ROW = 13;      // the surface
  const BED = 20;            // deepest the lake bed goes
  const SHORE_W = 9;         // columns of dry land at each end

  // --- terrain --------------------------------------------------------------

  function fillColumn(map, tx, floorRow) {
    for (let ty = floorRow; ty < map.h; ty++) map.set(tx, ty, TILE.WALL);
  }

  function ceilingColumn(map, tx, ceilRow) {
    for (let ty = 0; ty <= ceilRow; ty++) map.set(tx, ty, TILE.WALL);
  }

  /* The lake bed profile: shore, a slope down, a long floor with lumps in it,
     then a slope back up to the far shore. Islands are lumps tall enough to
     break the surface, and they are where the air pockets are. */
  function bedProfile(rng, width) {
    const rows = new Array(width);
    for (let tx = 0; tx < width; tx++) {
      if (tx < SHORE_W || tx >= width - SHORE_W) { rows[tx] = SHORE; continue; }

      const into = Math.min(tx - SHORE_W, width - SHORE_W - 1 - tx);
      // Four columns of slope at each lip, then the open bed.
      const slope = Math.min(1, into / 4);
      rows[tx] = Math.round(SHORE + (BED - SHORE) * slope);
    }

    // Lumps: gentle rises off the bed, some of which become islands.
    const lumps = rng.int(2, 4);
    for (let i = 0; i < lumps; i++) {
      const at = rng.int(SHORE_W + 6, width - SHORE_W - 7);
      const halfW = rng.int(2, 4);
      const island = rng.chance(0.5);
      const peak = island ? WATER_ROW - 2 : rng.int(WATER_ROW + 2, BED - 2);
      for (let d = -halfW; d <= halfW; d++) {
        const tx = at + d;
        if (tx < SHORE_W || tx >= width - SHORE_W) continue;
        const taper = peak + Math.abs(d);
        rows[tx] = Math.min(rows[tx], taper);
      }
    }
    return rows;
  }

  /* The roof. Mostly high, but it comes down to meet the water in two or three
     places - those are the dives, and they are the only reason the lake is
     dangerous rather than merely wet. */
  function roofProfile(rng, width, bed) {
    const rows = new Array(width);
    for (let tx = 0; tx < width; tx++) rows[tx] = CEIL;

    const dives = [];
    const count = rng.int(2, 3);
    let cursor = SHORE_W + 6;

    for (let i = 0; i < count && cursor < width - SHORE_W - 12; i++) {
      const span = rng.int(6, 10);
      const from = cursor;
      const to = Math.min(width - SHORE_W - 4, from + span);

      /* An overhang is only ever hung over deep water. Dropping one over a
         shallow lump or an island would put the roof below the lake bed and
         wall the cave off completely, which is exactly how a flooded level
         used to end up unfinishable. */
      let deep = true;
      for (let tx = from; tx <= to; tx++) {
        if (bed[tx] < WATER_ROW + 6) { deep = false; break; }
      }
      if (!deep) { cursor = to + 4; i--; continue; }

      for (let tx = from; tx <= to; tx++) {
        // Low enough that swimming under it means being fully submerged, and
        // never within three rows of the bed, so the tunnel stays swimmable.
        const drop = Math.min(WATER_ROW + 3, bed[tx] - 3);
        // Tapered mouth, so an overhang reads as rock rather than a wall.
        const edge = Math.min(tx - from, to - tx);
        rows[tx] = Math.max(CEIL, Math.min(drop, CEIL + 2 + edge * 2));
      }
      dives.push({ from: from, to: to });
      cursor = to + rng.int(8, 12);
    }
    return { rows: rows, dives: dives };
  }

  function flood(map, bed, width) {
    for (let tx = 0; tx < width; tx++) {
      for (let ty = WATER_ROW; ty < bed[tx]; ty++) {
        if (map.get(tx, ty) === TILE.EMPTY) map.set(tx, ty, TILE.WATER);
      }
    }
  }

  /* A dry route over the top for anyone who would rather not swim. It is never
     complete - it runs out over each dive, which is the point. */
  function stepStones(map, rng, bed, roof, width) {
    for (let tx = SHORE_W + 2; tx < width - SHORE_W - 2; tx += rng.int(3, 5)) {
      const row = WATER_ROW - 2;
      if (roof[tx] >= row - 1) continue;        // no headroom here
      if (bed[tx] <= row + 1) continue;         // that is an island, not water
      const w = rng.int(2, 3);
      for (let i = 0; i < w && tx + i < width - SHORE_W; i++) {
        if (map.get(tx + i, row) === TILE.EMPTY || map.isWater(tx + i, row)) {
          map.set(tx + i, row, TILE.PLATFORM);
        }
      }
    }
  }

  function build(rng, depth, out) {
    const rooms = M.clamp(4 + Math.floor(depth / 3), 4, 6);
    const width = 20 * rooms;
    const map = DS.Map.create(width, ROOM_H);

    const bed = bedProfile(rng, width);
    const roof = roofProfile(rng, width, bed);

    for (let tx = 0; tx < width; tx++) {
      fillColumn(map, tx, bed[tx]);
      ceilingColumn(map, tx, roof.rows[tx]);
    }

    flood(map, bed, width);
    stepStones(map, rng, bed, roof.rows, width);

    // Entrance and exit sit on the dry shore at either end.
    out.player = { x: 3 * T, y: (SHORE - 1) * T };
    const doorTx = width - 5;
    const doorTop = SHORE - 3;
    map.set(doorTx, doorTop, TILE.DOOR);
    map.set(doorTx, doorTop + 1, TILE.DOOR);
    out.door = { x: doorTx * T, y: doorTop * T };

    populate(map, rng, depth, bed, roof, width, out);

    return {
      map: map, spawns: out, roomCount: rooms, kind: 'normal',
      carved: true, flavor: 'flooded', waterRow: WATER_ROW,
      dives: roof.dives
    };
  }

  /* Markers. Land monsters stand on the shores and the islands; the lake gets
     its own swimmers, spawned by the level loader because they need to know
     they are in water. */
  function populate(map, rng, depth, bed, roof, width, out) {
    const dryTops = [];
    for (let tx = 3; tx < width - 3; tx++) {
      const row = bed[tx];
      if (row > WATER_ROW - 1) continue;                // under water
      if (map.isBlocked(tx, row - 1)) continue;         // no headroom
      dryTops.push({ tx: tx, row: row });
    }

    for (let i = 0; i < dryTops.length; i += rng.int(5, 9)) {
      const spot = dryTops[i];
      if (spot.tx < 6) continue;
      out.enemies.push({ x: spot.tx * T, y: (spot.row - 1) * T });
    }

    // One chest on a shore or island, and the real prize on the lake bed.
    if (dryTops.length) {
      const spot = dryTops[Math.floor(dryTops.length * 0.55)];
      out.chests.push({ x: spot.tx * T, y: (spot.row - 1) * T });
    }

    const sunken = [];
    for (let tx = SHORE_W + 3; tx < width - SHORE_W - 3; tx++) {
      if (bed[tx] < WATER_ROW + 3) continue;
      if (map.isBlocked(tx, bed[tx] - 1)) continue;
      sunken.push(tx);
    }
    if (sunken.length) {
      const pick = sunken[Math.floor(sunken.length * rng.float(0.35, 0.75))];
      out.chests.push({ x: pick * T, y: (bed[pick] - 1) * T });
      out.sunkenChest = { x: pick * T, y: (bed[pick] - 1) * T };
    }

    out.swimSpots = [];
    for (let i = 0; i < sunken.length; i += 7) {
      out.swimSpots.push({ x: sunken[i] * T, y: (WATER_ROW + 2) * T });
    }
  }

  // --- the swimmers ---------------------------------------------------------

  const FISH_D = 2;
  /* 24x16 at 2x detail, so the fish fills its 12x8 collision box instead of
     rattling around inside it. Authored facing right; the renderer keeps the
     flipped copy. */
  const FISH = [
    '........................',
    '................ssss....',
    '..s..........sssSSSSss..',
    '.ss.......sssSSSSSSSSSs.',
    'sss....sssSSSSSSSSSSSSSs',
    'ssss.ssSSSSSSSSSWWSSSSSs',
    'sssssSSSSSSSSSSSWkSSSSSs',
    'ssssSSSSSSSSSSSSSSSSSSSs',
    'ssssSSSSSSSSSSSSSSSSSSSs',
    'sssssSSSSSSSSSSSSSSSSSSs',
    'ssss.ssSSSSSSSSSSSSSSSSs',
    'sss....sssSSSSSSSSSSSSSs',
    '.ss.......sssSSSSSSSSSs.',
    '..s..........sssSSSSss..',
    '................ssss....',
    '........................'
  ];

  const FISH_BITE = [
    '........................',
    '................ssss....',
    '..s..........sssSSSSss..',
    '.ss.......sssSSSSSSSSSs.',
    'sss....sssSSSSSSSSSSSSSs',
    'ssss.ssSSSSSSSSSWWSSSWWs',
    'sssssSSSSSSSSSSSWkSSWkkW',
    'ssssSSSSSSSSSSSSSSSWkkWk',
    'ssssSSSSSSSSSSSSSSSWkkWk',
    'sssssSSSSSSSSSSSSSSSWkkW',
    'ssss.ssSSSSSSSSSSSSSSSWW',
    'sss....sssSSSSSSSSSSSSSs',
    '.ss.......sssSSSSSSSSSs.',
    '..s..........sssSSSSss..',
    '................ssss....',
    '........................'
  ];

  const FISH_HURT = [
    '........................',
    '................ssss....',
    '..s..........sssSSSSss..',
    '.ss.......sssSSSSSSSSSs.',
    'sss....sssSSSSSSSSSSSSSs',
    'ssss.ssSSSSSSSSSkkSSSSSs',
    'sssssSSSSSSSSSSSkkSSSSSs',
    'ssssSSSSSSSSSSSSSSSSSSSs',
    'ssssSSSSSSSSSSSSSRRRRSSs',
    'sssssSSSSSSSSSSSSSSSSSSs',
    'ssss.ssSSSSSSSSSSSSSSSSs',
    'sss....sssSSSSSSSSSSSSSs',
    '.ss.......sssSSSSSSSSSs.',
    '..s..........sssSSSSss..',
    '................ssss....',
    '........................'
  ];

  /* A piranha is only a threat in its own element. It patrols its stretch of
     water, rushes anything that swims into it, and cannot follow you onto dry
     land - beaching itself is the one way it dies for free. */
  function piranha(g, e, dx, dy, dist, sees, slow, phase) {
    const map = g.map;
    const wet = map.waterAt(DS.Ent.centerX(e), DS.Ent.centerY(e));

    if (!wet) {
      // Out of the water: it flops, takes the fall, and cannot hurt anyone.
      e.touchDamage = 0;
      e.vy = Math.min(e.vy + DS.C.GRAVITY, DS.C.MAX_FALL);
      e.vx *= 0.9;
      DS.Phys.moveX(e, map, e.vx);
      DS.Phys.moveY(e, map, e.vy);
      if (e.frame % 24 === 0) DS.Ent.damageEnemy(g, e, 2, { dir: 0, knockback: 0 });
      return;
    }

    e.touchDamage = phase === 'strike' ? e.attackDamage : 0;
    e.animTimer += 0.2;

    if (phase === 'wind') {
      e.vx *= 0.8; e.vy *= 0.8;
      e.diveX = dx; e.diveY = dy;
      swim(g, e, slow);
      return;
    }

    if (phase === 'strike') {
      if (!e.rushing) {
        e.rushing = true;
        const len = Math.max(1, Math.sqrt(e.diveX * e.diveX + e.diveY * e.diveY));
        e.vx = (e.diveX / len) * 3.1;
        e.vy = (e.diveY / len) * 3.1;
        DS.Audio.play('dash');
      }
      swim(g, e, slow);
      return;
    }

    if (phase === 'recover') {
      e.rushing = false;
      e.vx *= 0.9; e.vy *= 0.9;
      swim(g, e, slow);
      return;
    }

    // Only hunts a player who is actually in the water with it.
    const swimming = g.player && g.player.inWater;
    if (sees && swimming && dist < e.cfg.range && e.attackCooldown <= 0) {
      DS.Enemies.beginAttack(e);
      return;
    }

    const target = sees && swimming ? M.sign(dx) : e.facing;
    e.vx = M.approach(e.vx, target * e.speed * slow, 0.06);
    e.vy = M.approach(e.vy, Math.sin(e.animTimer * 0.4) * 0.5, 0.05);
    swim(g, e, slow);
  }

  /* Movement that respects the shape of the water. A fish that would leave the
     water on this step turns back instead, which keeps them in the lake
     without any of them needing to know where the lake is. */
  function swim(g, e, slow) {
    const map = g.map;
    const nx = e.x + e.vx * slow;
    const ny = e.y + e.vy * slow;
    const cx = nx + e.w / 2, cy = ny + e.h / 2;

    if (map.waterAt(cx, e.y + e.h / 2) && !DS.Phys.solidOverlap(map, nx, e.y, e.w, e.h)) {
      e.x = nx;
    } else {
      e.vx *= -0.7;
    }

    if (map.waterAt(e.x + e.w / 2, cy) && !DS.Phys.solidOverlap(map, e.x, ny, e.w, e.h)) {
      e.y = ny;
    } else {
      e.vy *= -0.7;
    }

    e.facing = M.sign(e.vx) || e.facing;
    if (g.frames % 18 === 0) DS.FX.trail(e.x + e.w / 2, e.y, '#a8e4ff');
  }

  function register() {
    const A = DS.Art;
    const S = DS.SPR;
    const frames = [FISH, FISH_BITE, FISH_HURT];

    DS.Enemies.TYPES.piranha = {
      w: 12, h: 8, hp: 10, touch: 0, speed: 1.0, sight: 150, armor: 0,
      flying: true, gore: ['#4fb3e0', '#a8e4ff', '#c0303c'], sprite: 'piranha',
      wind: 22, strike: 24, recover: 34, range: 90, damage: 1,
      behavior: piranha, noSpawn: true, aquatic: true
    };

    const base = frames.map(function (rows) { return A.makeSprite(rows, null, FISH_D); });
    const elite = frames.map(function (rows) {
      return A.makeSprite(rows, { S: '#f2c14e', s: '#e8743b' }, FISH_D);
    });

    S.piranha = base;
    S.elite.piranha = elite;
    S.mini.piranha = base.map(function (spr) { return A.scaled(spr, 2); });
    S.flip.piranha = base.map(A.flipped);
    S.flip.elite.piranha = elite.map(A.flipped);
    S.flip.mini.piranha = S.mini.piranha.map(A.flipped);
  }

  /* Stock the lake. Called by the level loader once the map exists, because a
     swimmer has to be placed in water rather than on a marker. */
  function stock(g, level) {
    if (!level.spawns.swimSpots) return;
    const spots = level.spawns.swimSpots;
    const count = M.clamp(2 + Math.floor(g.depth / 2), 2, spots.length || 1);

    for (let i = 0; i < count && i < spots.length; i++) {
      const spot = spots[i];
      if (!g.map.waterAt(spot.x + 6, spot.y + 4)) continue;
      const fish = DS.Enemies.create(g, spot.x, spot.y, 'piranha',
                                     g.rng.chance(0.2) ? 'elite' : 'normal');
      fish.aquatic = true;
    }
  }

  // --- drawing --------------------------------------------------------------

  /* Water is drawn twice: the body of it goes down with the tiles, behind
     everything, and this pass lays the lit surface and the caustics over the
     top of whatever is swimming in it. Doing it in one pass either hid the
     swimmers or made the water look like glass. */
  function drawOverlay(g) {
    const map = g.map;
    if (!map.hasWater) return;

    const R = DS.R;
    const ox = R.camOffsetX(), oy = R.camOffsetY();
    const x0 = Math.max(0, Math.floor(ox / T));
    const x1 = Math.min(map.w - 1, Math.floor((ox + DS.C.W) / T));
    const y0 = Math.max(0, Math.floor(oy / T));
    const y1 = Math.min(map.h - 1, Math.floor((oy + DS.C.H) / T));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!map.isWater(tx, ty)) continue;
        const px = tx * T, py = ty * T;

        R.rect(px, py, T, T, 'rgba(47,111,168,0.20)');

        // The surface: a moving crest wherever water meets air.
        if (!map.isWater(tx, ty - 1) && !map.isBlocked(tx, ty - 1)) {
          const wave = Math.sin(g.frames * 0.06 + tx * 0.7);
          const lift = Math.round(wave);
          R.rect(px, py + lift, T, 1, 'rgba(168,228,255,0.75)');
          R.rect(px, py + lift + 1, T, 1, 'rgba(79,179,224,0.35)');
        } else if ((tx * 3 + ty * 5 + Math.floor(g.frames / 12)) % 23 === 0) {
          // Caustic flecks, sparse enough to read as light rather than noise.
          R.rect(px + ((tx * 7) % T), py + ((ty * 5) % T), 1, 1,
                 'rgba(168,228,255,0.35)');
        }
      }
    }
  }

  /* Bubbles rising off the lake bed. Cheap, and it is what stops a still body
     of water reading as a painted rectangle. */
  function update(g) {
    const map = g.map;
    if (!map.hasWater || g.frames % 9 !== 0) return;
    const spots = map.waterColumns;
    if (!spots || !spots.length) return;

    const tx = spots[Math.floor(DS.rand.float(spots.length))];
    const px = tx * T + DS.rand.float(2, 14);
    for (let ty = map.h - 1; ty > 0; ty--) {
      if (!map.isWater(tx, ty)) continue;
      DS.FX.trail(px, ty * T + DS.rand.float(0, 12), '#a8e4ff');
      break;
    }
  }

  // Record which columns hold water, so the drawing passes can skip the rest.
  function index(map) {
    const cols = [];
    let any = false;
    for (let tx = 0; tx < map.w; tx++) {
      for (let ty = 0; ty < map.h; ty++) {
        if (!map.isWater(tx, ty)) continue;
        cols.push(tx); any = true; break;
      }
    }
    map.waterColumns = cols;
    map.hasWater = any;
  }

  register();

  DS.Water = {
    build: build,
    stock: stock,
    index: index,
    update: update,
    drawOverlay: drawOverlay,
    WATER_ROW: WATER_ROW
  };
})(window.DS);
