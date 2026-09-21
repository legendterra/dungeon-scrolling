/* The run itself: level loading, the world update order, interaction prompts,
   pause, death and victory. Death here is final — there is no continue, and
   nothing survives into the next run except the record board. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const M = DS.M;
  const Ent = DS.Ent;
  const UI = DS.UI;

  const INTERACT_RANGE = 20;

  function createRun(seed, opts) {
    const rng = DS.makeRng(seed >>> 0);
    // The loadout screen picks the starting archetype; without one (a replay
    // from a seed, say) the sword is still the default.
    const inv = DS.Inv.create(opts && opts.weapon);

    const g = {
      seed: seed >>> 0,
      rng: rng,
      inv: inv,
      depth: 1,
      levelKind: 'normal',
      pendingSafe: false,

      map: null,
      player: null,
      enemies: [],
      projectiles: [],
      pickups: [],
      chests: [],
      hazards: [],
      puzzles: [],
      crates: [],
      fields: [],
      bolts: [],
      boss: null,

      biome: DS.Biomes.forDepth(1),
      modifier: null,
      // Rooms that hold you until something in them is dead.
      trial: null,
      arena: null,
      bossTrigger: null,
      lockedDoor: false,
      bossDown: false,
      lastTrial: -9,
      horror: 0,
      shrine: null,
      streak: 0,
      streakBest: 0,
      streakTimer: 0,
      harvestCount: 0,
      banner: null,
      bannerTimer: 0,

      frames: 0,
      kills: 0,
      hitstop: 0,
      fadeIn: 30,
      deathTimer: 0,
      won: false,

      paused: false,
      pauseCursor: 0,
      modal: null,
      prompt: null,
      debug: false,

      // The control sheet shows itself once at the start of a run.
      controlsTimer: 60 * 9,

      toastText: '', toastColor: '#ffffff', toastTimer: 0
    };

    g.showBanner = function (title, subtitle, color) {
      g.banner = { title: title, subtitle: subtitle || '', color: color || '#d8d5e8' };
      g.bannerTimer = 130;
    };

    g.toast = function (text, color) {
      g.toastText = text;
      g.toastColor = color || '#ffffff';
      g.toastTimer = 90;
    };

    g.spawnAmbush = function (x, y, count) {
      for (let i = 0; i < count; i++) {
        const kind = g.rng.weighted(DS.Enemies.spawnTable(g.depth));
        DS.Enemies.create(g, x + g.rng.float(-26, 26), y - 8, kind, false);
      }
      g.toast('AMBUSH!', '#c0303c');
      DS.Audio.play('bossRoar');
    };

    /* A floor boss - the mountain warden, the trial arbiter - is the lock on
       its own room. Killing it is what breaks the seals on the vault chests
       and lets the exit door work again. */
    g.onFloorBossDown = function (boss) {
      g.bossDown = true;
      g.lockedDoor = false;

      let broke = 0;
      for (let i = 0; i < g.chests.length; i++) {
        const c = g.chests[i];
        if (!c.sealed) continue;
        c.sealed = false;
        broke++;
        DS.FX.ring(Ent.centerX(c), Ent.centerY(c), 14, '#f2c14e', 1.8);
      }

      DS.Audio.setMusic('dungeon');
      g.toast(broke ? 'THE SEALS BREAK' : 'THE WAY OPENS', '#f2c14e');
      g.showBanner('THE WARDEN FALLS', broke ? 'THE VAULT IS YOURS' : 'THE DOOR OBEYS',
                   '#f2c14e');

      // The fight pays on its own, on top of whatever is in the vault.
      const bx = boss ? Ent.centerX(boss) : Ent.centerX(g.player);
      const by = boss ? Ent.centerY(boss) : Ent.centerY(g.player);
      Ent.spawnLoot(g, bx, by, {
        coins: g.rng.int(45, 80), shards: g.rng.int(2, 4),
        hearts: 1, key: true, item: null
      });
    };

    g.onBossDefeated = function () {
      g.won = true;
      g.toast('THE KING FALLS', '#f2c14e');
      DS.Audio.setMusic('calm');
    };

    return g;
  }

  // --- level loading --------------------------------------------------------

  function loadLevel(g, kind) {
    g.levelKind = kind;
    g.biome = DS.Biomes.forDepth(g.depth);
    g.horror = DS.Modifiers.horrorFor(g.depth);
    g.modifier = null;
    g.shrine = null;
    g.enemies.length = 0;
    g.projectiles.length = 0;
    g.pickups.length = 0;
    g.chests.length = 0;
    g.hazards.length = 0;
    g.puzzles.length = 0;
    g.crates.length = 0;
    g.boss = null;
    g.trial = null;
    g.arena = null;
    g.bossTrigger = null;
    g.lockedDoor = false;
    g.bossDown = false;
    g.modal = null;
    g.fadeIn = 26;
    DS.FX.clear();

    const level = DS.LevelGen.build(g.rng, g.depth, kind);
    g.map = level.map;
    // Keep the floor's shape around: the 3D theme resolver and the banner
    // both need to know a mountain from a flooded cave after loadLevel.
    g.flavor = level.flavor || null;

    /* The floor's rule is decided before anything spawns, so enemy stats and
       loot can all read it. Safe rooms are never cursed. */
    /* The trial writes its own rules, and stacking a floor curse on top of a
       room that is already a gauntlet is how a fair fight becomes a coin
       flip. */
    if (kind !== 'safe' && kind !== 'trial') {
      g.modifier = DS.Modifiers.roll(g.rng, g.depth, level);
      if (g.modifier && g.modifier.noTorches) {
        g.map.decor = g.map.decor.filter(function (d) { return d.kind !== 'torch'; });
      }
    }
    const spawns = level.spawns;
    g.doorPos = spawns.door;
    g.tablePos = spawns.table;
    g.merchantPos = spawns.merchant;
    // Stock is rolled fresh for each safe room visit.
    g.shopStock = null;

    const start = spawns.player || { x: 32, y: (DS.LevelGen.ROOM_H - 2) * C.TILE };
    if (!g.player) {
      g.player = DS.Player.create(start.x, start.y, g.inv);
    } else {
      g.player.x = start.x;
      g.player.y = start.y - g.player.h;
      g.player.vx = g.player.vy = 0;
      g.player.dashFrames = 0;
      g.player.iframes = 40;
      g.player.inWater = false;
      g.player.breath = g.player.maxBreath || (60 * 14);
    }
    g.player.refreshStats();

    if (kind === 'boss') {
      DS.Boss.create(g, g.map.pixelW / 2, (DS.LevelGen.ROOM_H - 2) * C.TILE);
      DS.Audio.setMusic('boss');
    } else if (kind === 'safe') {
      // Every safe room carries a shrine, so a run always gets boon choices.
      /* Safe rooms place the shrine relative to the table, so it has to clear
         the table and the merchant rather than landing on top of one. */
      let shrineX = spawns.table ? spawns.table.x + 48 : 120;
      if (spawns.merchant && Math.abs(shrineX - spawns.merchant.x) < 34) {
        shrineX = spawns.merchant.x + (shrineX < spawns.merchant.x ? -40 : 40);
      }
      shrineX = M.clamp(shrineX, 32, g.map.pixelW - 48);
      g.shrine = {
        x: shrineX,
        y: g.map.groundY(shrineX + 8, 16),
        used: false, offers: null
      };
      // Safe rooms restore a heart and top the player up on arrows.
      g.player.hp = Math.min(g.player.stats.maxHp, g.player.hp + 1);
      g.inv.arrows = Math.min(40, g.inv.arrows + 14 + DS.Boons.flag(g.inv, 'quiver'));
      DS.Audio.setMusic('calm');
      g.toast('A MOMENT OF QUIET', '#a8e4ff');
      // Props sit flat on the floor rather than at their marker's tile row.
      if (spawns.table) {
        const tx = spawns.table.x - 8;
        g.map.decor.push({ kind: 'table', x: tx, y: g.map.groundY(tx + 8, 12) });
      }
      if (spawns.merchant) {
        const mx = spawns.merchant.x;
        g.map.decor.push({ kind: 'merchant', x: mx, y: g.map.groundY(mx + 5, 14) });
      }
    } else {
      /* Hazards go last on purpose. They are the only props that test what is
         already in the room before placing themselves, and running them first
         meant gates, shrines and bonus rooms were invisible to that test — a
         saw could end up spinning inside a cage. */
      populate(g, spawns);
      /* Purpose-built rooms - the mountain, the trial - already contain every
         prop they need, and the generic placers would only fight them for
         floor space. */
      if (!level.noProps) {
        DS.Puzzle.generate(g, level);
        DS.Puzzle.generateBarrier(g, level);
        ensureKeyholder(g, spawns);
        placeShrine(g, level);
        DS.Bonus.generate(g, level);
      }
      DS.Hazards.generate(g, level);

      // Water has to be indexed before anything draws or swims in it.
      DS.Water.index(g.map);
      if (level.flavor === 'flooded') DS.Water.stock(g, level);

      if (kind === 'trial') DS.Trial.install(g, level);
      else if (spawns.boss) armFloorBoss(g, level);

      g.inv.arrows = Math.min(40, g.inv.arrows + 8 + DS.Boons.flag(g.inv, 'quiver'));
      DS.Audio.setMusic('dungeon');
      announce(g, level);
    }

    if (kind === 'boss') g.showBanner('THRONE ROOM', g.biome.name, '#c86ee0');
    if (kind === 'safe') g.showBanner('SAFE ROOM', 'TRADE - ENCHANT - BREATHE', '#a8e4ff');

    DS.R.setCam(Ent.centerX(g.player), Ent.centerY(g.player));
    if (DS.R3D && DS.R3D.loadLevel) DS.R3D.loadLevel(g.map, g.biome, g);
  }

  /* What the floor calls itself. A flooded cave and a mountain are different
     enough from a corridor that arriving in one without being told would read
     as the generator having gone wrong. */
  const FLAVOR_TEXT = {
    flooded: { name: 'THE DROWNED CAVE', hint: 'HOLD JUMP TO SWIM - WATCH YOUR BREATH' },
    mountain: { name: 'THE MOUNTAIN', hint: 'W/S ON A ROPE TO CLIMB - SPACE TO LET GO' },
    carved: null,
    corridor: null
  };

  function announce(g, level) {
    if (level.kind === 'trial') return;    // the trial announces itself

    const flavor = FLAVOR_TEXT[level.flavor];
    if (flavor) {
      g.showBanner('DEPTH ' + g.depth + '  -  ' + flavor.name, flavor.hint, '#a8e4ff');
      return;
    }
    if (g.modifier) {
      g.showBanner('DEPTH ' + g.depth + '  -  ' + g.modifier.name,
                   g.modifier.desc, g.modifier.color);
      return;
    }
    g.showBanner('DEPTH ' + g.depth, g.biome.name, '#d8d5e8');
  }

  /* A room boss waits until the player is actually in the room with it, so the
     climb down to it is not fought to boss music with a health bar on screen.
     The gate that seals its vault is registered as a puzzle nobody can solve -
     only the boss dying opens it. */
  function armFloorBoss(g, level) {
    const spec = level.spawns.boss;
    g.arena = level.spawns.arena || null;
    g.lockedDoor = true;
    g.bossTrigger = { x: spec.x, y: spec.y, key: spec.key || level.bossKey };

    if (level.bossGate) {
      g.puzzles.push({
        kind: 'bosslock', barrier: true, locked: true, gate: level.bossGate
      });
    }
  }

  const BOSS_WAKE = 190;

  function checkBossTrigger(g) {
    const t = g.bossTrigger;
    if (!t || !g.player || g.player.dead) return;
    if (M.dist(Ent.centerX(g.player), Ent.centerY(g.player), t.x, t.y) > BOSS_WAKE) return;

    g.bossTrigger = null;
    DS.Bosses.create(g, t.x, t.y, t.key);
    DS.Audio.setMusic('boss');
    DS.R.shake(6);
    g.showBanner('THE VAULT WAKES', 'NOTHING OPENS UNTIL IT FALLS', '#e8a05a');
  }

  function populate(g, spawns) {
    const table = DS.Enemies.spawnTable(g.depth);
    const eliteChance = 0.08 + g.depth * 0.025;
    let elites = 0;
    /* Decided once for the whole floor, not rolled per spawn point — rolling
       per point with a dozen points on the map meant a colossus nearly every
       time, which stopped it feeling like an event. */
    let colossus = !(g.depth >= 3 && g.rng.chance(0.35));

    const extra = DS.Modifiers.mult(g, 'spawnMult');
    for (let i = 0; i < spawns.enemies.length; i++) {
      const spot = spawns.enemies[i];
      // Never stand a monster over a hole. It would spend its first second
      // falling, and the pit guard would only have to drag it back out.
      if (g.map.groundBelow(Math.floor(spot.x / C.TILE)) >= g.map.pixelH) continue;
      const copies = 1 + (g.rng.chance(extra - 1) ? 1 : 0);
      for (let c = 0; c < copies; c++) {
        const kind = g.rng.weighted(table);
        /* One colossus per floor at most, from depth 3, and never a flier —
           a 3x bat filling the ceiling is unreadable rather than exciting. */
        if (!colossus && kind !== 'bat') {
          DS.Enemies.create(g, spot.x + c * 10, spot.y, kind, 'colossal');
          colossus = true;
          continue;
        }
        const elite = g.rng.chance(eliteChance);
        if (elite) elites++;
        DS.Enemies.create(g, spot.x + c * 10, spot.y, kind, elite);
      }
    }

    if (elites === 0 && g.enemies.length) {
      const victim = g.rng.pick(g.enemies);
      const spot = { x: victim.x, y: victim.y };
      victim.dead = true;
      DS.Enemies.create(g, spot.x, spot.y - 4, victim.kind, 'elite');
      g.enemies = g.enemies.filter(function (e) { return !e.dead; });
    }

    for (let i = 0; i < spawns.chests.length; i++) {
      const spot = spawns.chests[i];
      const chest = Ent.makeChest(g, spot.x, spot.y,
                                  spot.tier || DS.Loot.rollChestTier(g.rng));
      // Vault chests are welded shut until the room's boss is dead.
      if (spot.sealed) chest.sealed = true;
    }
  }

  // Nearest column to `x` that has real floor, scanning outward both ways.
  function solidSpotNear(g, x) {
    const startTx = Math.floor(x / C.TILE);
    for (let step = 0; step < g.map.w; step++) {
      for (let side = -1; side <= 1; side += 2) {
        const tx = startTx + step * side;
        if (tx < 1 || tx >= g.map.w - 1) continue;
        const floor = g.map.groundBelow(tx);
        if (floor < g.map.pixelH) return { x: tx * C.TILE, y: floor - C.TILE };
      }
    }
    return null;
  }

  /* Shrines sit on solid ground in a middle room and offer three boons for
     one pick. Safe rooms always have one; normal floors get one sometimes. */
  function placeShrine(g, level) {
    if (!g.rng.chance(0.45)) return;

    const order = g.rng.shuffle([1, 2, 3, 4].slice(0, Math.max(1, level.roomCount - 2)));

    for (let i = 0; i < order.length; i++) {
      const tx = order[i] * DS.LevelGen.ROOM_W + g.rng.int(6, 12);
      // Carved floors are hilly, so the shrine sits on whatever height this
      // column happens to be rather than on one assumed floor row.
      const floorRow = DS.LevelGen.floorRowAt(g.map, tx);
      if (floorRow < 0) continue;
      if (g.map.isBlocked(tx, floorRow - 1) || g.map.isBlocked(tx, floorRow - 2)) continue;
      /* The shrine is 16 wide but draws a rune circle and a light shaft well
         past that, and it is the one prop you must be able to walk up to. It
         claims the whole footprint so nothing else is placed inside it. */
      /* One pixel short of three full tiles on both axes: the box test walks
         inclusive tile bounds, so an exact 3-tile box would also test the solid
         floor row underneath and reject every spot on the map. */
      if (DS.Hazards.occupied(g, (tx - 1) * C.TILE, (floorRow - 3) * C.TILE,
                              C.TILE * 3 - 1, C.TILE * 3 - 1)) continue;

      g.shrine = {
        x: tx * C.TILE, y: (floorRow - 1) * C.TILE,
        used: false, offers: null
      };
      return;
    }
  }

  /* Any locked chest on the floor gets a guardian: a double-size mini-boss that
     carries the only guaranteed key, marked by the key floating over its head.
     Run after every chest source (level chests and puzzle vaults) has spawned. */
  function ensureKeyholder(g, spawns) {
    let locked = false;
    for (let i = 0; i < g.chests.length; i++) {
      if (g.chests[i].cfg.locked) { locked = true; break; }
    }
    if (!locked) return;

    for (let i = 0; i < g.enemies.length; i++) {
      if (g.enemies[i].keyholder) return;
    }

    // Put the guardian as far from the entrance as the level allows, so the key
    // is something you walk toward rather than trip over.
    /* The guardian must stand on real ground. A keybearer spawned over a pit
       would fall in and take the floor's only guaranteed key with it. */
    const start = spawns.player ? spawns.player.x : 0;
    let spot = null, bestDist = -1;
    for (let i = 0; i < spawns.enemies.length; i++) {
      const candidate = spawns.enemies[i];
      const tx = Math.floor(candidate.x / C.TILE);
      if (g.map.groundBelow(tx) >= g.map.pixelH) continue;
      const d = Math.abs(candidate.x - start);
      if (d > bestDist) { bestDist = d; spot = candidate; }
    }

    if (!spot) spot = solidSpotNear(g, g.map.pixelW * 0.6);
    if (!spot) return;

    const kind = g.rng.weighted(DS.Enemies.spawnTable(g.depth));
    const guardian = DS.Enemies.create(g, spot.x, spot.y, kind, 'miniboss');
    guardian.keyholder = true;
    guardian.flying = false;

    g.toast('A KEYBEARER GUARDS THIS FLOOR', '#f2c14e');
  }

  /* Floor order is read straight off a table rather than tracked with flags.
     The old version set a "pending safe room" flag *and* loaded the safe room
     in the same step, so leaving that room tripped the flag and loaded a second
     one — two safe rooms back to back. A table cannot drift like that.

       1 2 3 4 [SAFE] 5 6 7 8 9 [SAFE] 10=BOSS                                */
  function kindForDepth(depth) {
    return depth >= C.FINAL_DEPTH ? 'boss' : 'normal';
  }

  /* How often a staircase turns out to be the trial instead of the next floor.
     Often enough to be a real threat on any given run, rare enough that it is
     still an event when it happens. */
  const TRIAL_CHANCE = 0.22;
  const TRIAL_COOLDOWN = 3;    // depths of quiet after one

  function advance(g) {
    /* A safe room and the trial are both stops in front of a depth, not depths
       of their own - the floor they were heading to is still waiting. */
    if (g.levelKind === 'safe' || g.levelKind === 'trial') {
      loadLevel(g, kindForDepth(g.depth));
      return;
    }

    g.depth++;

    if (g.depth > C.FINAL_DEPTH) { g.finished = true; return; }

    if (C.SAFE_BEFORE.indexOf(g.depth) >= 0) {
      loadLevel(g, 'safe');
      return;
    }

    /* One trial cannot follow another. Back to back they stop being an
       ambush and start being the game, and a run of three of them is longer
       than the dungeon they interrupt. */
    if (g.depth >= 3 && g.depth < C.FINAL_DEPTH &&
        g.depth - g.lastTrial >= TRIAL_COOLDOWN && g.rng.chance(TRIAL_CHANCE)) {
      g.lastTrial = g.depth;
      loadLevel(g, 'trial');
      return;
    }

    loadLevel(g, kindForDepth(g.depth));
  }

  // --- interaction ----------------------------------------------------------

  function nearestInteraction(g) {
    const p = g.player;
    const px = Ent.centerX(p), py = Ent.centerY(p);
    let best = null, bestDist = INTERACT_RANGE;

    for (let i = 0; i < g.chests.length; i++) {
      const c = g.chests[i];
      if (c.opened) continue;
      const d = M.dist(px, py, Ent.centerX(c), Ent.centerY(c));
      if (d < bestDist) { bestDist = d; best = { kind: 'chest', target: c }; }
    }

    for (let i = 0; i < g.pickups.length; i++) {
      const it = g.pickups[i];
      if (it.kind !== 'item') continue;
      const d = M.dist(px, py, Ent.centerX(it), Ent.centerY(it));
      if (d < bestDist) { bestDist = d; best = { kind: 'item', target: it, index: i }; }
    }

    const puzzle = DS.Puzzle.nearestLever(g, px, py, 22);
    if (puzzle) return { kind: 'lever', target: puzzle };

    const crate = DS.Puzzle.nearestCrate(g, px, py, 26);
    if (crate) return { kind: 'crate', target: crate };

    if (g.shrine && !g.shrine.used) {
      const d = M.dist(px, py, g.shrine.x + 8, g.shrine.y + 10);
      if (d < 26) return { kind: 'shrine' };
    }

    if (g.merchantPos) {
      const d = M.dist(px, py, g.merchantPos.x + 4, g.merchantPos.y + 8);
      if (d < 24) return { kind: 'shop' };
    }

    if (g.tablePos) {
      const d = M.dist(px, py, g.tablePos.x, g.tablePos.y + 8);
      if (d < 26) return { kind: 'table' };
    }

    if (g.doorPos && doorOpen(g)) {
      const d = M.dist(px, py, g.doorPos.x + 8, g.doorPos.y + 8);
      if (d < 22) return { kind: 'door' };
    }

    return best;
  }

  function doorOpen(g) {
    if (g.levelKind === 'boss') return g.won;
    // A vault door, or the way out of the trial: dead boss or no exit.
    if (g.lockedDoor && !g.bossDown) return false;
    return true;
  }

  /* Returns { key, text } — the HUD renders the key as a keycap and the text
     beside it. This used to return a single string with the key glued to the
     front, which meant `prompt.key` and `prompt.text` were both undefined and
     the hint renderer threw on every interactable the player walked up to. */
  function describe(g, action) {
    if (!action) return null;
    if (action.kind === 'chest') {
      const cfg = action.target.cfg;
      if (action.target.sealed) return { key: '!', text: 'SEALED - KILL THE WARDEN' };
      return { key: 'F', text: cfg.label.toUpperCase() + (cfg.locked ? ' (KEY)' : '') };
    }
    if (action.kind === 'crate') return { key: 'F', text: 'HEAVE THE CRATE BACK' };
    if (action.kind === 'item') {
      const swap = DS.Inv.bagFull(g.inv) && g.inv.equipped[1];
      return { key: 'F', text: (swap ? 'SWAP FOR ' : 'TAKE ') + action.target.item.name };
    }
    if (action.kind === 'shrine') return { key: 'F', text: 'PRAY AT THE SHRINE' };
    if (action.kind === 'lever') return { key: 'F', text: 'PULL LEVER' };
    if (action.kind === 'shop') return { key: 'F', text: 'TRADE' };
    if (action.kind === 'table') return { key: 'F', text: 'ENCHANT' };
    if (action.kind === 'door') return { key: 'F', text: 'DESCEND' };
    return null;
  }


  /* Picking a weapon up should never dead-end. If there is room it goes to the
     free slot or the bag; if everything is full it replaces what you are
     holding and the old weapon drops at your feet, so nothing is ever lost
     without the player seeing where it went. */
  function takeItem(g, action) {
    const item = action.target.item;
    const color = DS.Weapons.rarityColor(item.rarity);
    const result = DS.Inv.addItem(g.inv, item);

    g.pickups.splice(action.index, 1);

    if (result.ok) {
      g.player.refreshStats();
      DS.Audio.play('pickup');
      g.toast(result.where === 'slot'
        ? 'TOOK ' + item.name + '  -  Q TO SWAP'
        : 'TOOK ' + item.name + '  -  TAB FOR BAG', color);
      return;
    }

    /* Bag is full, so this is a straight swap. Armour swaps with the piece worn
       in its own slot — the old code dropped it into the active WEAPON slot,
       which left a chestplate where the sword should be. Everything that then
       read that slot as a weapon (the HUD card, the skill names, the damage
       number) hit an undefined field and killed the frame mid-draw, which is
       what looked like the game freezing on an armour swap. */
    if (DS.Armor.isArmor(item)) {
      const worn = g.inv.armor[item.slot];
      g.inv.armor[item.slot] = item;
      if (worn) Ent.addPickup(g, Ent.centerX(g.player), g.player.y, 'item', worn, 1);
      g.player.refreshStats();
      DS.Audio.play('pickup');
      g.toast('EQUIPPED ' + item.name, color);
      return;
    }

    const old = g.inv.equipped[g.inv.active];
    g.inv.equipped[g.inv.active] = item;
    if (old) Ent.addPickup(g, Ent.centerX(g.player), g.player.y, 'item', old, 1);

    g.player.refreshStats();
    DS.Audio.play('pickup');
    g.toast('SWAPPED TO ' + item.name, color);
  }

  function interact(g, action) {
    if (!action) return;

    if (action.kind === 'chest') {
      Ent.openChest(g, action.target);
    } else if (action.kind === 'item') {
      takeItem(g, action);
    } else if (action.kind === 'lever') {
      DS.Puzzle.pullLever(g, action.target);
    } else if (action.kind === 'crate') {
      DS.Puzzle.resetCrate(g, action.target);
    } else if (action.kind === 'shrine') {
      UI.openShrine(g);
    } else if (action.kind === 'shop') {
      UI.openShop(g);
    } else if (action.kind === 'table') {
      UI.openEnchant(g);
    } else if (action.kind === 'door') {
      DS.Audio.play('stairs');
      if (g.levelKind === 'boss' && g.won) { g.finished = true; return; }
      advance(g);
    }
  }

  // --- update ---------------------------------------------------------------

  function update(g) {
    const In = DS.Input;
    g.frames++;
    if (g.toastTimer > 0) g.toastTimer--;
    if (g.bannerTimer > 0) g.bannerTimer--;
    if (g.fadeIn > 0) g.fadeIn--;
    DS.Boons.update(g);
    DS.Modifiers.ambience(g);

    if (In.justPressed('debug')) { g.debug = !g.debug; In.consume('debug'); }

    if (g.paused) { DS.Profile.update(g); return; }

    if (g.modal) {
      UI.updateModal(g);
      return;
    }

    if (In.justPressed('pause')) {
      In.consume('pause');
      DS.Profile.open(g);
      return;
    }

    if (In.justPressed('bag')) { In.consume('bag'); UI.openBag(g); return; }

    if (In.justPressed('swap')) {
      In.consume('swap');
      if (DS.Inv.swapActive(g.inv)) {
        g.player.refreshStats();
        DS.Audio.play('menuPick');
        g.toast(DS.Inv.weapon(g.inv).name,
                DS.Weapons.rarityColor(DS.Inv.weapon(g.inv).rarity));
      } else {
        DS.Audio.play('error');
      }
    }

    // Hitstop freezes the world but keeps the frame counter moving.
    if (g.hitstop > 0) { g.hitstop--; return; }

    // Hazards move first so anything riding one is carried by this frame's delta.
    DS.Hazards.update(g);
    DS.Puzzle.update(g);
    DS.Player.update(g, g.player);
    DS.Water.update(g);
    DS.Trial.update(g);
    checkBossTrigger(g);

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.isBoss) DS.Boss.update(g, e);
      else DS.Enemies.update(g, e);
    }
    g.enemies = g.enemies.filter(function (e) { return !e.dead; });

    Ent.updateProjectiles(g);
    Ent.updatePickups(g);
    DS.Elements.updateFields(g);
    DS.FX.update();

    const action = nearestInteraction(g);
    g.prompt = describe(g, action);
    if (In.justPressed('interact')) { In.consume('interact'); interact(g, action); }

    updateCamera(g);

    if (g.player.dead) {
      g.deathTimer++;
      if (g.deathTimer > 90) DS.Scenes.gameOver(g, false);
    }
    if (g.finished) DS.Scenes.gameOver(g, true);
  }

  function updateCamera(g) {
    const p = g.player;
    const R = DS.R;
    // Look ahead of the player so you can see what you are running into.
    const targetX = Ent.centerX(p) + p.facing * 22;
    const targetY = Ent.centerY(p) - 8;

    R.cam.x = M.lerp(R.cam.x, targetX, 0.09);
    R.cam.y = M.lerp(R.cam.y, targetY, 0.07);
    R.clampCam(0, g.map.pixelW, 0, g.map.pixelH);
  }

  // --- pause ----------------------------------------------------------------

  const PAUSE_ITEMS = ['RESUME', 'INVENTORY', 'MUTE', 'ABANDON RUN'];

  function updatePause(g) {
    const In = DS.Input;

    if (In.justPressed('pause') || In.justPressed('back')) {
      In.consume('pause'); In.consume('back');
      g.paused = false;
      DS.Audio.play('menuMove');
      return;
    }
    if (In.justPressed('up')) {
      g.pauseCursor = (g.pauseCursor + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length;
      DS.Audio.play('menuMove');
    }
    if (In.justPressed('down')) {
      g.pauseCursor = (g.pauseCursor + 1) % PAUSE_ITEMS.length;
      DS.Audio.play('menuMove');
    }
    if (!In.justPressed('confirm')) return;
    In.consume('confirm');
    DS.Audio.play('menuPick');

    if (g.pauseCursor === 0) g.paused = false;
    else if (g.pauseCursor === 1) { g.paused = false; UI.openBag(g); }
    else if (g.pauseCursor === 2) DS.Audio.toggleMute();
    else DS.Scenes.gameOver(g, false);
  }

  function drawPause(g) {
    const R = DS.R;
    R.fade(0.78);
    R.textCenter('PAUSED', C.W / 2, 34, '#ffffff', 2);

    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      const selected = i === g.pauseCursor;
      let label = PAUSE_ITEMS[i];
      if (i === 2) label = DS.Audio.isMuted() ? 'UNMUTE' : 'MUTE';
      R.textCenter((selected ? '> ' : '') + label, C.W / 2, 70 + i * 12,
                   selected ? '#ffffff' : UI.COLORS.MUTED);
    }

    R.textCenter('DEATH ENDS THE RUN - NOTHING CARRIES OVER',
                 C.W / 2, C.H - 16, UI.COLORS.MUTED);
  }

  // --- draw -----------------------------------------------------------------

  function draw(g) {
    const R = DS.R;
    R.begin();
    if (DS.R3D && DS.R3D.render) DS.R3D.render(g);
    R.background(g.biome);

    const is3D = DS.R3D && DS.R3D.isEnabled;
    // With voxel models live, characters/hardware have 3D stand-ins and the
    // 2D canvas draws only FX, telegraphs and HUD-adjacent world bits.
    const vox = DS.R3D && DS.R3D.voxels;
    DS.Map.draw(g.map, g.frames, g.biome);
    if (!vox) drawShrine(g);
    if (!is3D) {
      DS.Hazards.draw(g);
      Ent.drawChests(g);
    }
    // Gates/vaults/pickups have 3D stand-ins only when voxels run; the sprite
    // pass covers them otherwise. Bonus.draw is just a floor glow, which has
    // no 3D equivalent, so it runs in both modes.
    if (!vox) DS.Puzzle.draw(g);
    DS.Bonus.draw(g);
    if (!vox) Ent.drawPickups(g);

    if (!vox) {
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        if (e.isBoss) DS.Boss.draw(g, e);
        else DS.Enemies.draw(g, e);
      }
    }

    DS.Elements.drawFields(g);
    if (!vox) Ent.drawProjectiles(g);
    if (g.player && !vox) DS.Player.draw(g, g.player);
    // The lit surface of the water goes over whatever is swimming in it —
    // in 3D mode too, since the water body itself is drawn by Map.draw.
    DS.Water.drawOverlay(g);
    DS.Trial.draw(g);
    DS.FX.draw();

    if (g.debug) drawDebug(g);

    // Darkness is composited in screen space, over the finished world.
    DS.Light.render(g);
    R.uiMode();
    DS.Modifiers.drawAtmosphere(g);
    R.drawFlash();

    UI.hud(g);
    UI.drawBanner(g);
    UI.drawModal(g);
    UI.reticle(g);
    if (g.paused) DS.Profile.draw(g);

    if (g.fadeIn > 0) R.fade(g.fadeIn / 26);
    if (g.player && g.player.dead) {
      R.fade(Math.min(0.8, g.deathTimer / 90));
      R.textCenter('YOU DIED', C.W / 2, C.H / 2 - 8, '#c0303c', 2);
    }
  }

  /* The shrine used to be an obelisk with a prompt over it, which made the one
     genuinely important prop on the floor read like scenery. It now announces
     itself: a rune circle burnt into the floor, a light shaft, runes orbiting
     the stone and motes drawn upward into it. Spending it puts all of that
     out — the difference between a live shrine and a dead one is visible from
     across the room, with no text involved. */
  function drawShrine(g) {
    if (!g.shrine) return;
    const R = DS.R;
    const s = g.shrine;
    const t = g.frames * 0.05;
    const bob = Math.sin(t) * 1.5;
    const lit = !s.used;
    const cx = s.x + 8;
    const baseY = s.y + 16;

    if (lit) {
      // Ground circle: a flat ellipse of rune marks that breathes with the bob.
      const pulse = 0.5 + Math.sin(t * 0.9) * 0.5;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 0.25;
        const rx = 17 + pulse * 2;
        R.rect(Math.round(cx + Math.cos(a) * rx), Math.round(baseY - 1 + Math.sin(a) * 4),
               1, 1, i % 2 ? '#4fb3e0' : '#a8e4ff');
      }

      // Light shaft. Drawn as stacked bars so it stays inside the pixel grid.
      for (let i = 0; i < 22; i++) {
        const a = (1 - i / 22) * 0.20 * (0.7 + pulse * 0.3);
        R.rect(cx - 1, s.y - 4 - i, 3, 1, 'rgba(168,228,255,' + a.toFixed(3) + ')');
      }
    }

    // A carved obelisk. The sprite dims once the shrine has been spent.
    if (lit) R.spr(DS.SPR.shrine, s.x - 2, s.y - 4);
    else R.sprAlpha(DS.SPR.shrine, s.x - 2, s.y - 4, 0.45);

    if (!lit) {
      // Spent: a dull crack of ash where the rune used to hang.
      R.rect(cx - 1, s.y - 5, 3, 1, '#3a3654');
      return;
    }

    // The rune itself, and two smaller ones orbiting it.
    R.rect(cx - 1, s.y - 6 + bob, 2, 2, '#ffffff');
    R.rect(cx - 2, s.y - 5 + bob, 4, 1, '#a8e4ff');
    for (let i = 0; i < 2; i++) {
      const a = t * 1.4 + i * Math.PI;
      R.rect(Math.round(cx + Math.cos(a) * 9), Math.round(s.y + 2 + Math.sin(a) * 3),
             1, 1, i ? '#c86ee0' : '#a8e4ff');
    }

    // Motes rise into the stone instead of falling off it.
    if (g.frames % 5 === 0) {
      DS.FX.trail(cx + DS.rand.float(-7, 7), baseY - DS.rand.float(0, 4), '#a8e4ff');
    }
  }

  function drawDebug(g) {
    const R = DS.R;
    const p = g.player;
    R.rect(p.x, p.y, p.w, p.h, 'rgba(92,191,98,0.35)');
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      R.rect(e.x, e.y, e.w, e.h, 'rgba(192,48,60,0.35)');
    }
    R.text('SEED ' + g.seed, 4, C.H - 26, UI.COLORS.MUTED);
    R.text('ENT ' + g.enemies.length + ' PRJ ' + g.projectiles.length, 4, C.H - 18, UI.COLORS.MUTED);
    R.text('X ' + Math.round(p.x) + ' Y ' + Math.round(p.y), 4, C.H - 10, UI.COLORS.MUTED);
  }

  DS.Game = {
    createRun: createRun,
    loadLevel: loadLevel,
    advance: advance,
    update: update,
    draw: draw
  };
})(window.DS);
