/* Simple dungeon puzzles.

   Each puzzle is a small walled vault holding a chest, sealed by a gate that
   is too tall to jump. Opening it is either:
     plate — shove the crate onto the pressure plate and leave it there
     lever — pull the lever, then get in before the gate drops again

   Vaults only ever guard treasure, never the way forward, so a puzzle the
   player cannot solve costs them loot and never the run. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const M = DS.M;
  const TILE = DS.TILE;

  const GATE_TILES = 3;              // tall enough that jumping over is out
  const LEVER_OPEN_FRAMES = 60 * 7;  // how long a pulled lever holds the gate
  const PUSH_SPEED = 0.55;

  // --- construction ---------------------------------------------------------

  function buildVault(map, tx, floorRow) {
    const top = floorRow - GATE_TILES;

    // Ceiling over the vault and its doorway.
    for (let x = tx - 1; x <= tx + 3; x++) map.set(x, top - 1, TILE.WALL);
    // Back wall.
    for (let y = top; y < floorRow; y++) map.set(tx + 3, y, TILE.WALL);
    // Clear the interior in case a template put something there.
    for (let y = top; y < floorRow; y++) {
      for (let x = tx; x <= tx + 2; x++) map.set(x, y, TILE.EMPTY);
    }
  }

  function makeGate(map, tx, floorRow) {
    const top = floorRow - GATE_TILES;
    const gate = {
      kind: 'gate',
      x: tx * T, y: top * T,
      closedY: top * T,
      w: T, h: GATE_TILES * T,
      solid: true,
      open: false,
      openTimer: 0,
      lift: 0
    };
    map.solids.push(gate);
    return gate;
  }

  function makeCrate(map, x, y) {
    const crate = {
      kind: 'crate',
      x: x, y: y, w: 14, h: 14,
      vx: 0, vy: 0,
      solid: true,
      pushable: true,
      onGround: false
    };
    map.solids.push(crate);
    return crate;
  }

  /* Crates for rooms that build their own puzzles. Everything a crate needs to
     work - physics, pushing, respawning - already lives here, so the trial
     chamber borrows it rather than growing a second crate. */
  function spawnCrate(g, x, y) {
    const crate = makeCrate(g.map, x, y);
    g.crates.push(crate);
    return crate;
  }

  /* A crate shoved into a corner is the one way a plate puzzle can dead-end.
     Standing next to one and heaving it puts it back where it started, which
     costs the player time and nothing else. */
  function nearestCrate(g, px, py, range) {
    if (!g.crates) return null;
    for (let i = 0; i < g.crates.length; i++) {
      const c = g.crates[i];
      if (c.homeX === undefined) continue;
      if (M.dist(px, py, c.x + c.w / 2, c.y + c.h / 2) > range) continue;
      if (Math.abs(c.x - c.homeX) < 2 && Math.abs(c.y - c.homeY) < 8) continue;
      return c;
    }
    return null;
  }

  function resetCrate(g, crate) {
    crate.x = crate.homeX;
    crate.y = crate.homeY;
    crate.vx = 0;
    crate.vy = 0;
    DS.Audio.play('locked');
    DS.FX.burst(crate.x + crate.w / 2, crate.y + crate.h / 2, 10,
                ['#8a6340', '#b98d5c'], { speed: 1.4, life: 18 });
    g.toast('THE CRATE IS HEAVED BACK', '#b98d5c');
  }

  function makePlate(x, floorY) {
    return {
      kind: 'plate',
      x: x, y: floorY - 4,
      w: 16, h: 4,
      pressed: false
    };
  }

  function makeLever(x, floorY) {
    return {
      kind: 'lever',
      x: x, y: floorY - 16,
      w: 8, h: 16,
      on: false
    };
  }

  /* One puzzle per level at most. Placed in a middle room with enough clear
     floor, and skipped entirely if the room is too busy. */
  function generate(g, level) {
    g.puzzles = [];
    g.crates = [];
    if (level.kind !== 'normal') return;
    if (!g.rng.chance(0.7)) return;

    const map = g.map;
    const rooms = level.roomCount;
    if (rooms < 4) return;

    // Try every middle room in a random order and take the first that has a
    // long enough clear stretch of floor. Picking one room blindly rejected
    // most levels outright.
    const candidates = [];
    for (let i = 1; i <= rooms - 2; i++) candidates.push(i);

    /* Carved floors change height every few tiles, so the run has to be found
       at whatever height that stretch happens to sit at rather than at one
       floor row for the whole map. */
    let baseTx = -1, vaultTx = -1, floorRow = -1;
    const order = g.rng.shuffle(candidates);
    for (let i = 0; i < order.length; i++) {
      const tx = order[i] * DS.LevelGen.ROOM_W;
      const row = DS.LevelGen.floorRowAt(map, tx + 3);
      if (row < 0) continue;
      if (floorRunClear(map, tx + 3, tx + 17, row)) {
        baseTx = tx;
        vaultTx = tx + 14;
        floorRow = row;
        break;
      }
    }
    if (baseTx < 0) return;
    const floorY = floorRow * T;

    buildVault(map, vaultTx, floorRow);
    const gate = makeGate(map, vaultTx, floorRow);

    /* Clear any chest the room template already dropped in this stretch — two
       chests sharing a tile was what made the vault and the lever overlap. */
    const clearFrom = baseTx * T, clearTo = (vaultTx + 4) * T;
    g.chests = g.chests.filter(function (c) {
      return c.x + c.w < clearFrom || c.x > clearTo;
    });

    DS.Ent.makeChest(g, (vaultTx + 1) * T + 1, floorY - T, DS.Loot.rollChestTier(g.rng));

    const useLever = g.rng.chance(0.45);
    const puzzle = { gate: gate, kind: useLever ? 'lever' : 'plate' };

    if (useLever) {
      // Slide the lever along the approach until it is clear of every chest.
      let leverX = (baseTx + 8) * T;
      for (let tries = 0; tries < 6; tries++) {
        const clash = g.chests.some(function (c) {
          return M.rectsOverlap(leverX - 6, floorY - 20, 20, 20, c.x, c.y, c.w, c.h);
        });
        if (!clash) break;
        leverX -= T * 2;
      }
      puzzle.lever = makeLever(leverX, floorY);
    } else {
      puzzle.plate = makePlate((baseTx + 10) * T, floorY);
      const crate = makeCrate(map, (baseTx + 4) * T, floorY - 14);
      g.crates.push(crate);
      puzzle.crate = crate;
    }

    g.puzzles.push(puzzle);

    // A spare crate near the vault doubles as a step for reaching high ledges.
    if (g.rng.chance(0.6)) {
      g.crates.push(makeCrate(map, (baseTx + 6) * T, floorY - 14));
    }
  }

  function floorRunClear(map, fromTx, toTx, floorRow) {
    for (let tx = fromTx; tx <= toTx; tx++) {
      if (!map.isSolid(tx, floorRow)) return false;         // needs solid ground
      if (map.isBlocked(tx, floorRow - 1)) return false;    // needs headroom
      if (map.isSpike(tx, floorRow - 1)) return false;
    }
    return true;
  }

  // --- update ---------------------------------------------------------------

  function update(g) {
    if (!g.crates) return;

    for (let i = 0; i < g.crates.length; i++) updateCrate(g, g.crates[i]);
    for (let i = 0; i < g.puzzles.length; i++) {
      const puzzle = g.puzzles[i];
      if (puzzle.barrier) updateBarrier(g, puzzle);
      else updatePuzzle(g, puzzle);
    }
  }

  function updateCrate(g, crate) {
    if (respawnCrate(g, crate)) return;
    crate.vx = 0;
    DS.Phys.step(crate, g.map);

    // Crates come to rest rather than sliding.
    if (crate.onGround) crate.vx = 0;

    const p = g.player;
    if (!p || p.dead) return;

    // The player pushes only when physics says they walked into this crate.
    if (p.blockedBy !== crate) return;
    const dir = DS.Input.axisX();
    if (dir === 0) return;

    const facingCrate = (dir > 0 && crate.x > p.x) || (dir < 0 && crate.x < p.x);
    if (!facingCrate) return;
    if (!DS.Phys.grounded(g.map, crate)) return;

    const before = crate.x;
    DS.Phys.moveX(crate, g.map, dir * PUSH_SPEED);
    if (Math.abs(crate.x - before) > 0.01) {
      p.x += (crate.x - before);
      if (g.frames % 14 === 0) {
        DS.Audio.play('land');
        DS.FX.dust(crate.x + crate.w / 2, crate.y + crate.h, 2);
      }
    }
  }

  function updatePuzzle(g, puzzle) {
    const gate = puzzle.gate;
    let shouldOpen = false;

    if (puzzle.kind === 'plate') {
      puzzle.plate.pressed = plateHeld(g, puzzle.plate);
      shouldOpen = puzzle.plate.pressed;
    } else {
      if (gate.openTimer > 0) gate.openTimer--;
      shouldOpen = gate.openTimer > 0;
      if (gate.openTimer === 0 && puzzle.lever.on) puzzle.lever.on = false;
    }

    if (shouldOpen !== gate.open) {
      gate.open = shouldOpen;
      DS.Audio.play(shouldOpen ? 'chestOpen' : 'locked');
      DS.R.shake(2);
      if (shouldOpen) g.toast('THE GATE GRINDS OPEN', '#a8e4ff');
    }

    // The gate slides up into the ceiling; it only stops blocking once clear.
    gate.lift = M.approach(gate.lift, gate.open ? gate.h - 2 : 0, 0.9);
    gate.y = gate.closedY - gate.lift;
    gate.solid = gate.lift < gate.h - 6;
  }

  function plateHeld(g, plate) {
    const p = g.player;
    if (p && !p.dead && M.rectsOverlap(plate.x, plate.y - 2, plate.w, plate.h + 2,
                                       p.x, p.y, p.w, p.h)) return true;
    for (let i = 0; i < g.crates.length; i++) {
      const c = g.crates[i];
      if (M.rectsOverlap(plate.x, plate.y - 2, plate.w, plate.h + 2, c.x, c.y, c.w, c.h)) {
        return true;
      }
    }
    return false;
  }

  // Returns a lever within reach of a point, for the interaction prompt.
  function nearestLever(g, px, py, range) {
    if (!g.puzzles) return null;
    for (let i = 0; i < g.puzzles.length; i++) {
      const puzzle = g.puzzles[i];
      if (!puzzle.lever) continue;
      const lx = puzzle.lever.x + puzzle.lever.w / 2;
      const ly = puzzle.lever.y + puzzle.lever.h / 2;
      if (M.dist(px, py, lx, ly) < range) return puzzle;
    }
    return null;
  }

  function pullLever(g, puzzle) {
    puzzle.lever.on = true;
    puzzle.gate.openTimer = LEVER_OPEN_FRAMES;
    DS.Audio.play('menuPick');
    DS.FX.ring(puzzle.lever.x + 4, puzzle.lever.y + 4, 8, '#f2c14e', 1.4);
  }

  // --- draw -----------------------------------------------------------------

  function draw(g) {
    if (!g.crates) return;
    const R = DS.R;

    for (let i = 0; i < g.crates.length; i++) {
      const c = g.crates[i];
      R.rect(c.x, c.y, c.w, c.h, '#2e2018');
      R.rect(c.x + 1, c.y + 1, c.w - 2, c.h - 2, '#8a6340');
      R.rect(c.x + 2, c.y + 2, c.w - 4, c.h - 4, '#b98d5c');
      R.rect(c.x + 2, c.y + 6, c.w - 4, 2, '#5c3f2a');
      R.rect(c.x + 6, c.y + 2, 2, c.h - 4, '#5c3f2a');
    }

    for (let i = 0; i < g.puzzles.length; i++) {
      const puzzle = g.puzzles[i];
      drawGate(R, puzzle.gate);
      if (puzzle.plate) drawPlate(R, puzzle.plate);
      if (puzzle.lever) drawLever(R, puzzle.lever, puzzle.gate);
      if (puzzle.barrier) drawBarrier(g, puzzle);
    }
  }

  function drawGate(R, gate) {
    R.rect(gate.x, gate.y, gate.w, gate.h, '#1c1a2b');
    for (let bar = 2; bar < gate.w; bar += 5) {
      R.rect(gate.x + bar, gate.y + 2, 2, gate.h - 4, '#6f6a90');
    }
    for (let ring = 4; ring < gate.h; ring += 12) {
      R.rect(gate.x + 1, gate.y + ring, gate.w - 2, 2, '#9b96b8');
    }
    // Spiked bottom edge, so the closed state reads as dangerous.
    R.rect(gate.x + 1, gate.y + gate.h - 2, gate.w - 2, 2, '#d8d5e8');
  }

  function drawPlate(R, plate) {
    const drop = plate.pressed ? 2 : 0;
    R.rect(plate.x, plate.y + drop, plate.w, plate.h - drop, '#3a3654');
    R.rect(plate.x + 1, plate.y + drop, plate.w - 2, 1,
           plate.pressed ? '#5cbf62' : '#9b96b8');
  }

  function drawLever(R, lever, gate) {
    R.rect(lever.x + 2, lever.y + 10, 4, 6, '#3a3654');
    const tilt = lever.on ? 3 : -3;
    R.rect(lever.x + 3 + tilt, lever.y + 2, 2, 9, '#8a6340');
    R.rect(lever.x + 2 + tilt, lever.y, 4, 3, lever.on ? '#5cbf62' : '#c0303c');

    if (gate.openTimer > 0 && gate.openTimer < 120 &&
        Math.floor(gate.openTimer / 6) % 2 === 0) {
      R.rect(lever.x, lever.y - 4, 8, 2, '#c0303c');
    }
  }

  // --- barriers that block the way forward ----------------------------------

  /* Unlike a vault, these sit across the corridor. Each keeps its own answer
     inside the same room, and each answer is guaranteed to survive:

       keygate   the warden holding the key never spawns over, or falls into, a pit
       plates    a crate that drops into a pit reappears where it started
       braziers  lighting them takes any hit at all, not a particular element

     On top of that there is a last-resort timer: stand at a sealed gate long
     enough with the puzzle unsolved and it grinds open anyway. A run should
     never end because a puzzle broke. */
  const BARRIER_H = 4;
  const FAILSAFE = 60 * 45;

  /* Gates are drawn as a solid column of bars, so anything the level generator
     already put in that column — a wooden ledge, a stone platform, a torch —
     ends up growing through the middle of the cage. Carve the shaft clear
     before the gate is placed, and keep one tile of air either side so the
     bars never touch a neighbouring ledge either. */
  function clearShaft(map, tx, floorRow) {
    for (let ty = floorRow - BARRIER_H - 1; ty < floorRow; ty++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = map.get(tx + dx, ty);
        if (t === DS.TILE.PLATFORM || (dx === 0 && t !== DS.TILE.EMPTY)) {
          map.set(tx + dx, ty, DS.TILE.EMPTY);
        }
      }
    }
    // Decor sitting in the shaft goes too — a torch inside a cage reads as a bug.
    map.decor = map.decor.filter(function (d) {
      const dtx = Math.floor(d.x / T);
      const dty = Math.floor(d.y / T);
      return dtx < tx - 1 || dtx > tx + 1 ||
             dty < floorRow - BARRIER_H - 1 || dty >= floorRow;
    });
  }

  function makeBarrier(map, tx, floorRow) {
    const top = floorRow - BARRIER_H;
    clearShaft(map, tx, floorRow);
    const gate = {
      kind: 'gate', barrier: true,
      x: tx * T, y: top * T, closedY: top * T,
      w: T, h: BARRIER_H * T,
      solid: true, open: false, openTimer: 0, lift: 0
    };
    map.solids.push(gate);
    return gate;
  }

  /* force: the biome ladder can REQUIRE a puzzle on a floor (the Torch Hall),
     instead of leaving the only guaranteed obstacle in the game to a 45% roll. */
  function generateBarrier(g, level, force) {
    if (level.kind !== 'normal') return;
    if (!force && !g.rng.chance(0.45)) return;

    const map = g.map;
    const rooms = level.roomCount;
    if (rooms < 4) return;

    const order = g.rng.shuffle([1, 2, 3].slice(0, Math.max(1, rooms - 3)));

    for (let i = 0; i < order.length; i++) {
      const baseTx = order[i] * DS.LevelGen.ROOM_W;
      const gateTx = baseTx + 15;
      const floorRow = DS.LevelGen.floorRowAt(map, baseTx + 2);
      if (floorRow < 0) continue;
      if (!floorRunClear(map, baseTx + 2, gateTx + 2, floorRow)) continue;

      const gate = makeBarrier(map, gateTx, floorRow);
      /* Always a keygate. A barred cage that opens from a pressure plate or a
         brazier down the corridor reads as broken — the player looks at bars
         and expects to find whoever is holding the key. */
      const kind = 'keygate';

    const puzzle = { gate: gate, kind: kind, barrier: true, failsafe: FAILSAFE };
    const floorY = floorRow * T;
    if (force) puzzle.hall = true;

      if (kind === 'keygate') {
        // Two tiles in front of the bars, never further, so it is always the
        // first thing between the player and the cage.
        const warden = DS.Enemies.create(g, (gateTx - 3) * T, floorY - T,
          g.rng.weighted(DS.Enemies.spawnTable(g.depth)), 'miniboss');
        warden.gateWarden = puzzle;
        warden.flying = false;
        warden.homeX = warden.x;
        puzzle.warden = warden;

      } else if (kind === 'plates') {
        puzzle.plates = [
          makePlate((baseTx + 7) * T, floorY),
          makePlate((baseTx + 11) * T, floorY)
        ];
        const crate = makeCrate(map, (baseTx + 4) * T, floorY - 14);
        crate.homeX = crate.x;
        crate.homeY = crate.y;
        g.crates.push(crate);

      } else {
        puzzle.braziers = [4, 8, 12].map(function (offset) {
          return { x: (baseTx + offset) * T, y: floorY - 18, lit: false };
        });
      }

      g.puzzles.push(puzzle);
      return;
    }
  }

  /* Crates are the only solution that can physically leave the level, so they
     come back rather than stranding the player behind a sealed gate. */
  function respawnCrate(g, crate) {
    if (crate.homeX === undefined) return false;
    const lost = g.map.deathOverlap(crate.x, crate.y, crate.w, crate.h) ||
                 crate.y > g.map.pixelH;
    if (!lost) return false;

    crate.x = crate.homeX;
    crate.y = crate.homeY;
    crate.vx = 0;
    crate.vy = 0;
    DS.FX.burst(crate.x + crate.w / 2, crate.y + crate.h / 2, 10,
                ['#8a6340', '#b98d5c'], { speed: 1.4, life: 20 });
    DS.Audio.play('locked');
    g.toast('THE CRATE RETURNS', '#b98d5c');
    return true;
  }

  function updateBarrier(g, puzzle) {
    const gate = puzzle.gate;
    let solved = false;

    /* A gate the room itself controls. While it is locked nothing opens it but
       the death of whatever is in the room with you. */
    if (puzzle.locked) {
      const down = !!g.bossDown;
      if (down && !gate.open) {
        gate.open = true;
        DS.Audio.play('chestOpen');
        DS.R.shake(4);
      }
      gate.lift = M.approach(gate.lift, gate.open ? gate.h - 2 : 0, 1.1);
      gate.y = gate.closedY - gate.lift;
      gate.solid = gate.lift < gate.h - 6;
      return;
    }

    if (puzzle.kind === 'keygate') {
      solved = !!puzzle.wardenDown;
    } else if (puzzle.kind === 'plateset') {
      /* Every plate at once. The torch over each one is the readout - the
         player should never have to count, only look up. */
      solved = true;
      for (let i = 0; i < puzzle.plates.length; i++) {
        const held = plateHeld(g, puzzle.plates[i]);
        puzzle.plates[i].pressed = held;
        puzzle.braziers[i].lit = held;
        if (!held) solved = false;
      }
      if (solved && !puzzle.sang) {
        puzzle.sang = true;
        DS.Audio.play('victory');
        DS.R.flash('#f2c14e', 8);
      }
      if (!solved) puzzle.sang = false;
    } else if (puzzle.kind === 'plates') {
      solved = true;
      for (let i = 0; i < puzzle.plates.length; i++) {
        puzzle.plates[i].pressed = plateHeld(g, puzzle.plates[i]);
        if (!puzzle.plates[i].pressed) solved = false;
      }
    } else {
      lightBraziers(g, puzzle);
      solved = true;
      for (let i = 0; i < puzzle.braziers.length; i++) {
        if (!puzzle.braziers[i].lit) solved = false;
      }
    }

    /* Last-resort valve, and only while the player is actually stuck at the
       gate. A trial gate has no valve: its whole job is to be the wall the
       puzzle opens, and the crate heave already makes a dead end impossible. */
    if (!solved && !puzzle.trial && g.player && !g.player.dead) {
      const near = Math.abs(DS.Ent.centerX(g.player) - (gate.x + gate.w / 2)) < 40;
      if (near && puzzle.failsafe > 0) {
        puzzle.failsafe--;
        if (puzzle.failsafe === 0) {
          solved = true;
          puzzle.forced = true;
          g.toast('THE GATE RELENTS', '#6f6a90');
        }
      }
    }

    if (solved && !gate.open) {
      gate.open = true;
      DS.Audio.play('chestOpen');
      DS.R.shake(3);
      DS.R.flash('#a8e4ff', 6);
      if (!puzzle.forced) g.toast('THE WAY OPENS', '#a8e4ff');
    }
    // Anything held down by weight can be un-solved by walking away.
    if (!solved && (puzzle.kind === 'plates' || puzzle.kind === 'plateset')) {
      gate.open = false;
    }

    gate.lift = M.approach(gate.lift, gate.open ? gate.h - 2 : 0, 1.1);
    gate.y = gate.closedY - gate.lift;
    gate.solid = gate.lift < gate.h - 6;
  }

  /* Braziers light from any hit at all — a swing, a skill, or a stray arrow.
     Requiring a fire weapon would make the puzzle depend on your loot. */
  function lightBraziers(g, puzzle) {
    const p = g.player;
    const box = (p && p.attackActive > 0 && p.pending) ? DS.Player.meleeRect(p) : null;

    for (let i = 0; i < puzzle.braziers.length; i++) {
      const b = puzzle.braziers[i];
      if (b.lit) continue;

      let hit = false;
      if (box && M.rectsOverlap(box.x, box.y, box.w, box.h, b.x, b.y, 10, 18)) hit = true;

      for (let j = 0; !hit && j < g.projectiles.length; j++) {
        const pr = g.projectiles[j];
        if (!pr.friendly) continue;
        if (M.rectsOverlap(pr.x, pr.y, pr.w, pr.h, b.x, b.y, 10, 18)) hit = true;
      }

      if (!hit) continue;
      b.lit = true;
      DS.Audio.play('fire');
      DS.FX.burst(b.x + 5, b.y + 2, 12, ['#e8743b', '#f2c14e', '#fff0a8'],
                  { speed: 1.6, life: 20, grav: -0.03 });
    }
  }

  function drawBarrier(g, puzzle) {
    const R = DS.R;

    if (puzzle.plates) {
      for (let i = 0; i < puzzle.plates.length; i++) drawPlate(R, puzzle.plates[i]);
    }

    // A crate that has wandered shows where it belongs, so heaving it back is
    // an informed choice rather than a guess.
    if (puzzle.kind === 'plateset') {
      for (let i = 0; i < g.crates.length; i++) {
        const c = g.crates[i];
        if (c.homeX === undefined || Math.abs(c.x - c.homeX) < 2) continue;
        R.rect(c.homeX, c.homeY + c.h - 1, c.w, 1, 'rgba(138,99,64,0.35)');
      }
    }

    if (puzzle.braziers) {
      for (let i = 0; i < puzzle.braziers.length; i++) {
        const b = puzzle.braziers[i];
        R.rect(b.x + 2, b.y + 8, 6, 10, '#3a3654');
        R.rect(b.x + 1, b.y + 5, 8, 4, '#6f6a90');
        if (b.lit) {
          const flick = Math.sin(g.frames * 0.3 + i) > 0 ? 0 : 1;
          R.rect(b.x + 3, b.y - 1 + flick, 4, 6, '#f2c14e');
          R.rect(b.x + 4, b.y - 2 + flick, 2, 4, '#fff0a8');
          DS.Map.glow(R, b.x + 5, b.y + 2, 26, 'rgba(242,193,78,0.20)');
        } else {
          R.rect(b.x + 3, b.y + 2, 4, 4, '#2a2740');
        }
      }
    }

    if (puzzle.kind === 'keygate' && puzzle.warden && !puzzle.wardenDown) {
      const w = puzzle.warden;
      if (!w.dead) {
        const bob = Math.sin(g.frames * 0.09) * 2;
        R.spr(DS.SPR.key, DS.Ent.centerX(w) - 4, w.y - 15 + bob);
      }
    }
  }

  DS.Puzzle = {
    generate: generate,
    generateBarrier: generateBarrier,
    update: update,
    draw: draw,
    nearestLever: nearestLever,
    pullLever: pullLever,
    spawnCrate: spawnCrate,
    nearestCrate: nearestCrate,
    resetCrate: resetCrate
  };
})(window.DS);
