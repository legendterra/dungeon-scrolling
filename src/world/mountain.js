/* The mountain: a depth built vertically instead of horizontally.

   Two halves, and the rope is the hinge between them.

     Outside   a stack of plateaus climbing to the summit. Each one is five
               rows above the last, which is well past a double jump, so the
               rope hanging off its lip is the route rather than a shortcut.
     Inside    a shaft under the summit. The same rope, ridden down this time,
               drops through the mountain into the vault at the bottom - and
               the vault is where the warden lives.

   The vault seals itself behind a portcullis and every chest inside it is
   welded shut until the warden is dead. The exit door is in there too, so the
   boss is the price of the floor rather than an optional detour. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;

  /* v7: 128 x 60, up from 96 x 34 (src/world/levelsize.js). The climb is nearly
     three times as tall, so it has nine or so plateaus instead of three or four;
     the shaft and the vault under the summit are the same size as they were. */
  const MAP_W = DS.LevelSize.MOUNTAIN.w;
  const MAP_H = DS.LevelSize.MOUNTAIN.h;
  const GROUND = MAP_H - 4;  // where the climb starts
  const FLOOR = MAP_H - 3;   // the vault floor row (solid)
  const INTERIOR_W = 51;     // columns of shaft and vault, east of the climb
  const CLIMB_W = MAP_W - INTERIOR_W;   // columns of open sky before the rock begins
  const SHAFT_L = CLIMB_W + 3;
  const SHAFT_R = CLIMB_W + 11;
  const ROPE_X = CLIMB_W + 7;           // the descent, and the edge you step off
  const TORCH_H = 24;

  function fillColumn(map, tx, fromRow) {
    for (let ty = fromRow; ty < map.h; ty++) map.set(tx, ty, TILE.WALL);
  }

  function carve(map, x0, y0, x1, y1) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) map.set(tx, ty, TILE.EMPTY);
    }
  }

  function fillRect(map, x0, y0, x1, y1) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) map.set(tx, ty, TILE.WALL);
    }
  }

  function rope(map, tx, fromRow, toRow) {
    for (let ty = fromRow; ty <= toRow; ty++) {
      if (map.isBlocked(tx, ty)) break;
      map.set(tx, ty, TILE.ROPE);
    }
  }

  // --- the climb ------------------------------------------------------------

  const SUMMIT = 13;          // the highest a plateau may stand

  /* The plateaus, left to right. Every rise between two of them is a real
     cliff, four to six rows - the rope's reason to exist. The climb used to
     clamp its row at the summit and carry on, so the last few plateaus stood
     one to three rows apart, or level, each with a rope hung over a step you
     could walk up. The climb now stops rising when the next plateau would
     pass the summit, and the summit plateau runs on to the rock. */
  function plateaus(rng) {
    const steps = [];
    let row = GROUND;
    let x = 0;
    while (x < CLIMB_W) {
      const w = rng.int(7, 10);
      const next = row - rng.int(4, 6);
      if (x + w >= CLIMB_W || next < SUMMIT) {
        steps.push({ from: x, to: CLIMB_W, row: row });
        break;
      }
      steps.push({ from: x, to: x + w, row: row });
      x += w;
      row = next;
    }
    return steps;
  }

  function buildClimb(map, rng, steps, out) {
    const boulders = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      for (let tx = step.from; tx <= step.to; tx++) fillColumn(map, tx, step.row);

      if (i === 0) continue;
      const below = steps[i - 1];

      /* The rope hangs against the cliff face from the LIP - tied off level
         with the top of the rock it serves - to the plateau below, so it is
         grabbed from the ground you are already standing on and ridden up to
         where the top of the cliff is a step to the side. It used to start
         three rows above the lip, a rope tied to nothing, in the open air. */
      const tx = step.from - 1;
      rope(map, tx, step.row, below.row - 1);

      /* A boulder at the foot of the cliff, for anyone who would rather jump
         than climb: a block of rock standing on the plateau, half the cliff's
         height, clear of the rope's column. It used to be a two-tile ledge in
         mid-air, which the support pass then strapped to the cliff with a
         finger of rock - straight through the rope. */
      if (rng.chance(0.55)) {
        const rise = below.row - step.row;
        const tall = Math.ceil(rise / 2);
        const at = step.from - rng.int(4, 5);
        // Clear of the spawn (two columns in from the plateau's edge) as well.
        if (at > below.from + 3) {
          for (let x = at; x <= at + 1; x++) {
            for (let y = below.row - tall; y < below.row; y++) map.set(x, y, TILE.WALL);
          }
          boulders.push(at, at + 1);
        }
      }
    }

    const first = steps[0];
    out.player = { x: (first.from + 2) * T, y: (first.row - 1) * T };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const span = step.to - step.from;
      if (span < 5) continue;
      const count = i === 0 ? 1 : rng.int(1, 2);
      for (let e = 0; e < count; e++) {
        let ex = step.from + rng.int(3, Math.max(3, span - 2));
        // Never inside a boulder: stand the monster in front of it instead.
        while (boulders.indexOf(ex) >= 0) ex -= 2;
        out.enemies.push({ x: ex * T, y: (step.row - 1) * T });
      }
    }

    const top = steps[steps.length - 1];
    out.chests.push({
      x: (top.from + 3) * T,
      y: (top.row - 1) * T
    });
    return top;
  }

  // --- the shaft and the vault ---------------------------------------------

  function buildInterior(map, rng, top, out) {
    // Everything east of the climb is solid rock until it is carved.
    for (let tx = CLIMB_W + 1; tx < map.w; tx++) fillColumn(map, tx, 0);

    /* The mouth. Its floor is the summit plateau continued, so walking off the
       peak and into the mountain is one unbroken surface. */
    const mouthRow = top.row - 1;         // head height inside the tunnel
    const floorRow = top.row;             // the surface you walk on
    carve(map, CLIMB_W, mouthRow - 2, ROPE_X, mouthRow);

    const vaultTop = FLOOR - 8;
    const vaultLeft = CLIMB_W + 2;
    const vaultRight = map.w - 4;
    const gateTx = vaultRight - 12;

    // The shaft, dropping from the tunnel to the vault.
    carve(map, SHAFT_L, mouthRow - 2, SHAFT_R, vaultTop);
    // The vault chamber at the bottom of it.
    carve(map, vaultLeft, vaultTop, vaultRight, FLOOR - 1);
    // Put the tunnel floor back, so the drop starts at the rope and not before.
    fillRect(map, CLIMB_W + 1, floorRow, ROPE_X - 1, floorRow + 1);

    // The long rope down. Anchored in the tunnel roof, ending over the floor.
    rope(map, ROPE_X, mouthRow - 2, FLOOR - 2);

    /* Ledges alternating off each wall of the shaft: the descent is a fight,
       not six seconds of holding one key. */
    let side = 0;
    for (let row = mouthRow + 4; row < vaultTop - 2; row += rng.int(4, 6)) {
      const from = side % 2 === 0 ? SHAFT_L : SHAFT_R - 2;
      for (let i = 0; i < 3; i++) map.setDesigned(from + i, row, TILE.PLATFORM);
      if (rng.chance(0.7)) out.enemies.push({ x: (from + 1) * T, y: (row - 1) * T });
      side++;
    }

    /* Landing spikes. Riding the rope down puts you on clean stone; letting go
       of it and falling the whole shaft costs you. */
    for (let tx = SHAFT_L; tx <= SHAFT_R; tx++) {
      if (tx >= ROPE_X - 1 && tx <= ROPE_X + 1) continue;
      map.set(tx, FLOOR - 1, TILE.SPIKE);
    }

    /* The portcullis: five tiles of bars, and solid rock above them, so the
       only way to the prize is through the gate the warden holds shut. */
    fillRect(map, gateTx, vaultTop, gateTx, FLOOR - 6);
    const gate = {
      kind: 'gate', barrier: true,
      x: gateTx * T, y: (FLOOR - 5) * T, closedY: (FLOOR - 5) * T,
      w: T, h: 5 * T,
      solid: true, open: false, openTimer: 0, lift: 0
    };
    map.solids.push(gate);
    out.bossGate = gate;

    // Treasure behind the bars, welded shut until the fight is won.
    out.chests.push({ x: (gateTx + 4) * T, y: (FLOOR - 1) * T, sealed: true, tier: 'vault' });
    out.chests.push({ x: (gateTx + 8) * T, y: (FLOOR - 1) * T, sealed: true });

    // The way onward is inside the vault too, so the boss is not optional.
    const doorTx = vaultRight - 2;
    map.set(doorTx, FLOOR - 3, TILE.DOOR);
    map.set(doorTx, FLOOR - 2, TILE.DOOR);
    out.door = { x: doorTx * T, y: (FLOOR - 3) * T };

    out.torches = [
      { tx: vaultLeft + 2, row: FLOOR },
      { tx: gateTx - 3, row: FLOOR },
      { tx: gateTx + 6, row: FLOOR },
      { tx: CLIMB_W + 2, row: floorRow }
    ];

    out.boss = {
      key: 'warden',
      x: Math.floor((vaultLeft + gateTx) / 2) * T,
      y: (FLOOR - 1) * T
    };
    out.arena = { x0: vaultLeft * T, x1: gateTx * T };
  }

  function build(rng, depth, out) {
    const map = DS.Map.create(MAP_W, MAP_H);

    const steps = plateaus(rng);
    const top = buildClimb(map, rng, steps, out);
    buildInterior(map, rng, top, out);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      map.decor.push({
        kind: 'torch', x: (step.from + 2) * T + 4,
        y: step.row * T - TORCH_H + 1, seed: (i * 13) % 24
      });
    }
    for (let i = 0; i < out.torches.length; i++) {
      const t = out.torches[i];
      map.decor.push({
        kind: 'torch', x: t.tx * T + 4, y: t.row * T - TORCH_H + 1, seed: i * 7
      });
    }

    map.sealPits(rng, { chasmOdds: 0.75 });

    return {
      map: map, spawns: out, roomCount: Math.floor(MAP_W / 20),
      kind: 'normal', carved: true, flavor: 'mountain',
      bossKey: 'warden', bossGate: out.bossGate, noProps: true
    };
  }

  DS.Mountain = { build: build, FLOOR: FLOOR };
})(window.DS);
