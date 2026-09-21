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

  function createRun(seed) {
    const rng = DS.makeRng(seed >>> 0);
    const inv = DS.Inv.create();

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
    g.modal = null;
    g.fadeIn = 26;
    DS.FX.clear();

    const level = DS.LevelGen.build(g.rng, g.depth, kind);
    g.map = level.map;

    /* The floor's rule is decided before anything spawns, so enemy stats and
       loot can all read it. Safe rooms are never cursed. */
    if (kind !== 'safe') {
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
    }
    g.player.refreshStats();

    if (kind === 'boss') {
      DS.Boss.create(g, g.map.pixelW / 2, (DS.LevelGen.ROOM_H - 2) * C.TILE);
      DS.Audio.setMusic('boss');
    } else if (kind === 'safe') {
      // Every safe room carries a shrine, so a run always gets boon choices.
      const shrineX = spawns.table ? spawns.table.x + 44 : 120;
      g.shrine = {
        x: shrineX,
        y: g.map.groundY(shrineX + 8, 16),
        used: false, offers: null
      };
      // Safe rooms restore a heart and top the player up on arrows.
      g.player.hp = Math.min(g.player.stats.maxHp, g.player.hp + 1);
      g.inv.arrows = Math.min(40, g.inv.arrows + 14);
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
      populate(g, spawns);
      DS.Hazards.generate(g, level);
      DS.Puzzle.generate(g, level);
      DS.Puzzle.generateBarrier(g, level);
      ensureKeyholder(g, spawns);
      placeShrine(g, level);
      DS.Bonus.generate(g, level);
      g.inv.arrows = Math.min(40, g.inv.arrows + 8);
      DS.Audio.setMusic('dungeon');
      if (g.modifier) {
        g.showBanner('DEPTH ' + g.depth + '  -  ' + g.modifier.name,
                     g.modifier.desc, g.modifier.color);
      } else {
        g.showBanner('DEPTH ' + g.depth, g.biome.name, '#d8d5e8');
      }
    }

    if (kind === 'boss') g.showBanner('THRONE ROOM', g.biome.name, '#c86ee0');
    if (kind === 'safe') g.showBanner('SAFE ROOM', 'TRADE - ENCHANT - BREATHE', '#a8e4ff');

    DS.R.setCam(Ent.centerX(g.player), Ent.centerY(g.player));
  }

  function populate(g, spawns) {
    const table = DS.Enemies.spawnTable(g.depth);
    const eliteChance = 0.08 + g.depth * 0.025;
    let elites = 0;

    const extra = DS.Modifiers.mult(g, 'spawnMult');
    for (let i = 0; i < spawns.enemies.length; i++) {
      const spot = spawns.enemies[i];
      const copies = 1 + (g.rng.chance(extra - 1) ? 1 : 0);
      for (let c = 0; c < copies; c++) {
        const kind = g.rng.weighted(table);
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
      Ent.makeChest(g, spot.x, spot.y, DS.Loot.rollChestTier(g.rng));
    }
  }

  // Nearest column to `x` that has real floor, scanning outward both ways.
  function solidSpotNear(g, x) {
    const startTx = Math.floor(x / C.TILE);
    for (let step = 0; step < g.map.w; step++) {
      for (let side = -1; side <= 1; side += 2) {
        const tx = startTx + step * side;
        if (tx < 1 || tx >= g.map.w - 1) continue;
        const floor = g.map.floorBelow(tx, 0);
        if (floor < g.map.pixelH) return { x: tx * C.TILE, y: floor - C.TILE };
      }
    }
    return null;
  }

  /* Shrines sit on solid ground in a middle room and offer three boons for
     one pick. Safe rooms always have one; normal floors get one sometimes. */
  function placeShrine(g, level) {
    if (!g.rng.chance(0.45)) return;

    const floorRow = DS.LevelGen.ROOM_H - 2;
    const order = g.rng.shuffle([1, 2, 3, 4].slice(0, Math.max(1, level.roomCount - 2)));

    for (let i = 0; i < order.length; i++) {
      const tx = order[i] * DS.LevelGen.ROOM_W + g.rng.int(6, 12);
      if (!g.map.isSolid(tx, floorRow)) continue;
      if (g.map.isBlocked(tx, floorRow - 1) || g.map.isBlocked(tx, floorRow - 2)) continue;

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
      if (g.map.floorBelow(tx, 0) >= g.map.pixelH) continue;
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

  function advance(g) {
    // A safe room is a stop in front of a depth, not a depth of its own.
    if (g.levelKind === 'safe') {
      loadLevel(g, kindForDepth(g.depth));
      return;
    }

    g.depth++;

    if (g.depth > C.FINAL_DEPTH) { g.finished = true; return; }

    if (C.SAFE_BEFORE.indexOf(g.depth) >= 0) {
      loadLevel(g, 'safe');
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
    return true;
  }

  function describe(g, action) {
    if (!action) return null;
    if (action.kind === 'chest') {
      const cfg = action.target.cfg;
      return 'F' + cfg.label + (cfg.locked ? ' (KEY)' : '');
    }
    if (action.kind === 'item') {
      return DS.Inv.bagFull(g.inv) && g.inv.equipped[1]
        ? 'F  SWAP FOR ' + action.target.item.name
        : 'F  TAKE ' + action.target.item.name;
    }
    if (action.kind === 'shrine') return 'F  PRAY AT THE SHRINE';
    if (action.kind === 'lever') return 'F  PULL LEVER';
    if (action.kind === 'shop') return 'F  TRADE';
    if (action.kind === 'table') return 'F  ENCHANT';
    if (action.kind === 'door') return 'F  DESCEND';
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
    R.background(g.biome);

    DS.Map.draw(g.map, g.frames, g.biome);
    drawShrine(g);
    DS.Puzzle.draw(g);
    DS.Bonus.draw(g);
    DS.Hazards.draw(g);
    Ent.drawChests(g);
    Ent.drawPickups(g);

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.isBoss) DS.Boss.draw(g, e);
      else DS.Enemies.draw(g, e);
    }

    DS.Elements.drawFields(g);
    Ent.drawProjectiles(g);
    if (g.player) DS.Player.draw(g, g.player);
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
    if (g.paused) DS.Profile.draw(g);

    if (g.fadeIn > 0) R.fade(g.fadeIn / 26);
    if (g.player && g.player.dead) {
      R.fade(Math.min(0.8, g.deathTimer / 90));
      R.textCenter('YOU DIED', C.W / 2, C.H / 2 - 8, '#c0303c', 2);
    }
  }

  function drawShrine(g) {
    if (!g.shrine) return;
    const R = DS.R;
    const s = g.shrine;
    const bob = Math.sin(g.frames * 0.05) * 1.5;
    const lit = !s.used;

    // A small obelisk with a hovering rune.
    R.rect(s.x + 2, s.y + 8, 12, 8, '#2a2740');
    R.rect(s.x + 3, s.y + 9, 10, 6, '#514c72');
    R.rect(s.x + 5, s.y + 2, 6, 8, lit ? '#4fb3e0' : '#3a3654');
    R.rect(s.x + 6, s.y + 3, 4, 6, lit ? '#a8e4ff' : '#514c72');

    if (lit) {
      R.rect(s.x + 7, s.y - 4 + bob, 2, 2, '#ffffff');
      if (g.frames % 6 === 0) {
        DS.FX.trail(s.x + 8 + DS.rand.float(-4, 4), s.y + 6, '#a8e4ff');
      }
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
