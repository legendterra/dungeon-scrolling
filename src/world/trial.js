/* THE GODS HATE YOU - the trial chamber.

   Sometimes a staircase does not lead to the next floor. It leads here, and
   the door locks behind you.

   The chamber is three rooms in a row and each one has to be paid for:

     1  a gauntlet - broken floor, chasms, spike beds, and only platforms to
        cross them with
     2  a hall of pressure plates, one crate for each, and a torch over every
        plate. Every plate has to be held down at the same time, which is why
        the crate count matches the plate count exactly, and why the layout is
        rolled fresh each time. All of them lit, and the portcullis lifts.
     3  the arena. The bars drop behind you, the Arbiter wakes, and nothing in
        the room opens - not the vault, not the exit - until it is dead.

   Nothing here is optional and nothing here is skippable. That is the point:
   the trial is the answer to a run that had become one long corridor. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;
  const M = DS.M;

  const MAP_H = 22;
  const FLOOR = 18;          // the walking surface row
  const CEIL = 6;            // roof of the chamber
  const ENTRY_W = 13;
  const GAUNTLET_END = 45;
  const HALL_END = 79;
  const GATE_W = 3;
  const MAP_W = 112;
  const TORCH_H = 24;

  function fillColumn(map, tx, fromRow) {
    for (let ty = fromRow; ty < map.h; ty++) map.set(tx, ty, TILE.WALL);
  }

  function roof(map, tx, row) {
    for (let ty = 0; ty <= row; ty++) map.set(tx, ty, TILE.WALL);
  }

  function platformRun(map, tx, row, width) {
    for (let i = 0; i < width; i++) map.set(tx + i, row, TILE.PLATFORM);
  }

  // --- the gauntlet ---------------------------------------------------------

  /* Islands with gaps between them. Anything wider than a jump gets a stepping
     stone in the middle of it, so the crossing is always a timing problem and
     never an impossible one. */
  function buildGauntlet(map, rng, out) {
    let tx = ENTRY_W;

    while (tx < GAUNTLET_END) {
      const width = rng.int(3, 6);
      const row = FLOOR - (rng.chance(0.35) ? rng.int(1, 3) : 0);

      for (let i = 0; i < width && tx + i < GAUNTLET_END; i++) {
        fillColumn(map, tx + i, row);
      }

      // A spike bed on the landing you are aiming for.
      if (width >= 4 && rng.chance(0.4)) {
        map.set(tx + rng.int(1, width - 2), row - 1, TILE.SPIKE);
      }
      // Something worth the detour, up on a ledge over the drop.
      if (rng.chance(0.3)) {
        platformRun(map, tx + 1, row - 4, 2);
      }

      tx += width;

      const gap = rng.int(3, 6);
      if (tx + gap >= GAUNTLET_END) break;
      // Wide gaps get a deck to break the jump in two.
      if (gap > 3) platformRun(map, tx + Math.floor(gap / 2) - 1, row - 3, 2);
      tx += gap;
    }

    // The lip that leads into the hall, so the last jump has somewhere to land.
    for (let i = tx; i <= GAUNTLET_END; i++) fillColumn(map, i, FLOOR);

    // A pair of guards on the way through.
    out.enemies.push({ x: (ENTRY_W + 4) * T, y: (FLOOR - 1) * T });
    out.enemies.push({ x: (GAUNTLET_END - 3) * T, y: (FLOOR - 1) * T });
  }

  // --- the plate hall -------------------------------------------------------

  /* Plates and crates in matching numbers, spread across the hall at rolled
     positions with a guaranteed gap between them - two plates on top of each
     other would let one crate answer both. */
  function layout(rng, count, from, to, spacing) {
    const spots = [];
    const span = to - from;
    const slot = Math.floor(span / count);
    for (let i = 0; i < count; i++) {
      const lo = from + i * slot + 1;
      const hi = Math.min(to - 1, lo + slot - spacing);
      spots.push(rng.int(lo, Math.max(lo, hi)));
    }
    return spots;
  }

  function buildHall(map, rng, depth, out) {
    for (let tx = GAUNTLET_END + 1; tx <= HALL_END + GATE_W; tx++) {
      fillColumn(map, tx, FLOOR);
    }

    // Five is the ceiling; shallow floors get a gentler version of the same.
    const count = M.clamp(3 + Math.floor(depth / 2), 3, 5);
    const plateAt = layout(rng, count, GAUNTLET_END + 4, HALL_END - 4, 3);
    const crateAt = layout(rng, count, GAUNTLET_END + 3, HALL_END - 3, 3);

    out.trial = { count: count, plates: [], crates: [], torches: [] };

    for (let i = 0; i < count; i++) {
      out.trial.plates.push({ tx: plateAt[i] });
      out.trial.torches.push({ tx: plateAt[i] });
      // Crates never start on a plate, or the puzzle solves itself.
      let cx = crateAt[i];
      for (let guard = 0; guard < 8; guard++) {
        let clash = false;
        for (let j = 0; j < count; j++) {
          if (Math.abs(cx - plateAt[j]) < 2) clash = true;
        }
        if (!clash) break;
        cx += 2;
      }
      out.trial.crates.push({ tx: M.clamp(cx, GAUNTLET_END + 3, HALL_END - 2) });
    }

    // A shelf to make the hall read as a room rather than a corridor.
    platformRun(map, GAUNTLET_END + 6, FLOOR - 5, 4);
    platformRun(map, HALL_END - 10, FLOOR - 5, 4);
  }

  // --- the arena ------------------------------------------------------------

  function buildArena(map, rng, out) {
    const from = HALL_END + GATE_W + 1;
    for (let tx = from; tx < map.w; tx++) fillColumn(map, tx, FLOOR);

    const bossX = from + 14;
    out.boss = { key: 'arbiter', x: bossX * T, y: (FLOOR - 1) * T };
    out.arena = { x0: from * T, x1: (map.w - 3) * T };

    // The prize, welded shut until the Arbiter is down.
    out.chests.push({ x: (map.w - 14) * T, y: (FLOOR - 1) * T, sealed: true, tier: 'vault' });
    out.chests.push({ x: (map.w - 10) * T, y: (FLOOR - 1) * T, sealed: true });

    const doorTx = map.w - 5;
    map.set(doorTx, FLOOR - 3, TILE.DOOR);
    map.set(doorTx, FLOOR - 2, TILE.DOOR);
    out.door = { x: doorTx * T, y: (FLOOR - 3) * T };

    // Two ledges to fight from, because a flat box is not an arena.
    platformRun(map, from + 5, FLOOR - 5, 3);
    platformRun(map, map.w - 22, FLOOR - 5, 3);
    return from;
  }

  // --- build ----------------------------------------------------------------

  function build(rng, depth, out) {
    const map = DS.Map.create(MAP_W, MAP_H);

    for (let tx = 0; tx < MAP_W; tx++) roof(map, tx, CEIL - 1);
    for (let tx = 0; tx <= ENTRY_W; tx++) fillColumn(map, tx, FLOOR);

    buildGauntlet(map, rng, out);
    buildHall(map, rng, depth, out);
    const arenaFrom = buildArena(map, rng, out);

    out.player = { x: 3 * T, y: (FLOOR - 1) * T };

    /* The portcullis. Three tiles of bars rather than one, because this is the
       gate the whole room is built around and it should look like it. */
    const gateTx = HALL_END + 1;
    for (let ty = CEIL; ty < FLOOR - 5; ty++) {
      for (let i = 0; i < GATE_W; i++) map.set(gateTx + i, ty, TILE.WALL);
    }
    const gate = {
      kind: 'gate', barrier: true, big: true,
      x: gateTx * T, y: (FLOOR - 5) * T, closedY: (FLOOR - 5) * T,
      w: GATE_W * T, h: 5 * T,
      solid: true, open: false, openTimer: 0, lift: 0
    };
    map.solids.push(gate);
    out.trial.gate = gate;
    out.trial.arenaX = arenaFrom * T;

    // Braziers down the length of the chamber.
    for (let tx = 6; tx < MAP_W - 4; tx += 14) {
      const floor = map.groundBelow(tx);
      if (floor >= map.pixelH) continue;
      map.decor.push({
        kind: 'torch', x: tx * T + 4, y: floor - TORCH_H + 1, seed: (tx * 7) % 24
      });
    }

    /* The gauntlet leans toward spiked trenches rather than bottomless drops.
       The room is locked, so a miss should cost blood and the climb back out -
       ending the whole run on a mistimed hop, in a room the player cannot
       leave, is a different and much worse kind of hard. */
    map.sealPits(rng, { chasmOdds: 0.45 });

    return {
      map: map, spawns: out, roomCount: Math.floor(MAP_W / 20),
      kind: 'trial', carved: true, flavor: 'trial',
      bossKey: 'arbiter', trial: out.trial, noProps: true
    };
  }

  // --- runtime --------------------------------------------------------------

  /* Wire the built room into a running game: real crates, real plates, and the
     watcher that arms the arena. */
  function install(g, level) {
    const spec = level.trial;
    if (!spec) return;

    const floorY = FLOOR * T;
    const plates = [];
    const braziers = [];

    for (let i = 0; i < spec.count; i++) {
      plates.push({
        kind: 'plate', x: spec.plates[i].tx * T, y: floorY - 4,
        w: 16, h: 4, pressed: false
      });
      braziers.push({ x: spec.torches[i].tx * T + 18, y: floorY - 18, lit: false });

      const crate = DS.Puzzle.spawnCrate(g, spec.crates[i].tx * T, floorY - 14);
      crate.homeX = crate.x;
      crate.homeY = crate.y;
      crate.trial = true;
    }

    const puzzle = {
      kind: 'plateset', barrier: true, trial: true,
      gate: spec.gate, plates: plates, braziers: braziers,
      failsafe: 0
    };
    g.puzzles.push(puzzle);

    g.trial = {
      spec: spec, puzzle: puzzle, gate: spec.gate,
      arenaX: spec.arenaX, bossKey: level.bossKey,
      boss: level.spawns.boss, armed: false, solved: false
    };
    g.arena = level.spawns.arena;
    g.lockedDoor = true;

    g.showBanner('THE GODS HATE YOU', 'THE DOOR BEHIND YOU IS GONE', '#c0303c');
    DS.Audio.play('bossRoar');
  }

  /* The arena arms itself the moment the player is inside it: the bars come
     back down and the Arbiter wakes. Walking in is the commitment. */
  function update(g) {
    const t = g.trial;
    if (!t || !g.player) return;

    if (!t.solved && t.gate.open) {
      t.solved = true;
      g.toast('THE BARS RISE', '#a8e4ff');
    }

    if (t.armed || g.player.dead) return;
    if (DS.Ent.centerX(g.player) < t.arenaX + 8) return;

    t.armed = true;
    t.gate.open = false;
    t.gate.lift = 0;
    t.gate.solid = true;
    t.puzzle.locked = true;

    DS.Bosses.create(g, t.boss.x, t.boss.y, t.bossKey);
    DS.Audio.setMusic('boss');
    DS.R.shake(8);
    g.showBanner('JUDGEMENT', 'THE CHAMBER IS SEALED', '#f2c14e');
  }

  /* The taunt, painted on the wall of the entry hall.

     Every text routine in the renderer draws in screen space, so a caption
     that belongs to a place in the world has to be converted by hand - drawn
     raw it stays welded to the middle of the screen and follows the player
     down the corridor. */
  function draw(g) {
    if (!g.trial) return;
    const R = DS.R;
    // Clear of the HUD panels in the top-left corner of the screen.
    const x = 5 * T - R.camOffsetX();
    const y = (FLOOR - 5) * T - R.camOffsetY();
    if (x < -140 || x > DS.C.W + 20) return;

    R.text('THE GODS', x, y, 'rgba(192,48,60,0.8)', 2);
    R.text('HATE YOU', x, y + 20, 'rgba(192,48,60,0.8)', 2);
    R.textSmall('NO WAY BACK - ONLY THROUGH', x, y + 40, 'rgba(155,150,184,0.7)');
  }

  DS.Trial = {
    build: build,
    install: install,
    update: update,
    draw: draw,
    FLOOR: FLOOR
  };
})(window.DS);
