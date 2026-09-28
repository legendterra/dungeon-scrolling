/* Bonus rounds — two small, optional pockets of income.

   Coin Vault  a walled niche on top of a stone tower, climbed by the ledges
               set into its face. No enemies, no items, just coins for the
               climb.
   Gold Slime  a rare runner that bolts the moment it sees you and vanishes
               after ten seconds. Catch it and it pays.

   Both are deliberately modest: together they add roughly half a luxury
   purchase per run, which is enough to feel like a find without making the
   merchant's prices meaningless. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const M = DS.M;
  const Ent = DS.Ent;
  const A = DS.Art;

  const VAULT_CHANCE = 0.30;
  const SLIME_CHANCE = 0.08;
  const SLIME_LIFE = 60 * 10;

  // --- gold slime -----------------------------------------------------------

  /* The gold slime is the ordinary slime in a gold palette, so it stays in
     step with the chibi art instead of drifting into its own shape. */
  const GOLD_PAL = {
    L: '#fff0a8', l: '#f2c14e', e: '#8a7440', W: '#ffffff'
  };

  /* It never fights. It looks at you, picks the other direction, and goes. */
  function fleeBehavior(g, e, dx, dy, dist, sees, slow, phase) {
    e.timer = (e.timer || SLIME_LIFE) - 1;

    if (e.timer <= 0) {
      DS.FX.burst(Ent.centerX(e), Ent.centerY(e), 14,
                  ['#f2c14e', '#fff0a8'], { speed: 2, life: 20 });
      DS.Audio.play('coin');
      e.dead = true;
      g.enemies = g.enemies.filter(function (o) { return !o.dead; });
      return;
    }

    // A gold trail so you can see where it went.
    if (g.frames % 4 === 0) {
      DS.FX.trail(Ent.centerX(e), Ent.centerY(e) + 2, '#f2c14e');
    }

    if (!e.onGround) return;

    e.hopTimer = (e.hopTimer || 0) - 1;
    e.vx *= 0.86;
    if (e.hopTimer > 0) return;

    let dir = sees ? -(M.sign(dx) || 1) : e.facing;
    // Cornered: hop over the player rather than into the wall.
    if (DS.Phys.wallAhead(g.map, e, dir) || !DS.Phys.floorAhead(g.map, e, dir)) {
      dir = -dir;
    }

    e.facing = dir;
    e.vx = dir * 2.6 * slow;
    e.vy = -3.6;
    e.hopTimer = 16;
  }

  function registerGoldSlime() {
    const cfg = {
      w: 12, h: 9, hp: 12, touch: 0, speed: 1.6, sight: 200, armor: 0,
      gore: ['#f2c14e', '#fff0a8', '#e8743b'], sprite: 'goldslime',
      wind: 20, strike: 4, recover: 20, range: 0, damage: 0,
      behavior: fleeBehavior, noSpawn: true
    };
    DS.Enemies.TYPES.goldslime = cfg;

    const S = DS.SPR;
    const raw = S.raw;
    S.goldslime = [A.makeSprite(raw.SLIME_0, GOLD_PAL, raw.ENEMY_D),
                   A.makeSprite(raw.SLIME_1, GOLD_PAL, raw.ENEMY_D)];
    S.elite.goldslime = S.goldslime;
    S.mini.goldslime = S.goldslime.map(function (spr) { return A.scaled(spr, 2); });
    S.flip.goldslime = S.goldslime.map(A.flipped);
    S.flip.elite.goldslime = S.flip.goldslime;
    S.flip.mini.goldslime = S.mini.goldslime.map(A.flipped);
  }

  function spawnGoldSlime(g, spawns) {
    if (!g.rng.chance(SLIME_CHANCE)) return;
    if (!spawns.enemies.length) return;

    const spot = g.rng.pick(spawns.enemies);
    const tx = Math.floor(spot.x / T);
    if (g.map.groundBelow(tx) >= g.map.pixelH) return;

    const e = DS.Enemies.create(g, spot.x, spot.y, 'goldslime', 'normal');
    e.golden = true;
    e.timer = SLIME_LIFE;
    e.hopTimer = 0;
    // Its whole value is in the purse, so its loot is written directly.
    e.onDeath = function (gg, self) {
      const coins = gg.rng.int(25, 40);
      DS.Ent.spawnLoot(gg, Ent.centerX(self), Ent.centerY(self), {
        coins: coins, shards: 1, hearts: 0, key: false, item: null
      });
      gg.toast('THE PURSE BURSTS', '#f2c14e');
      DS.R.flash('#f2c14e', 8);
    };

    g.toast('SOMETHING GOLDEN STIRS', '#f2c14e');
    DS.Audio.play('coin');
  }

  // --- coin vault -----------------------------------------------------------

  /* A stone tower standing on the floor, with a walled treasure niche on its
     top and a stack of ledges set into its face to climb it by.

     It used to be a sealed box at the top of the map, walled on both sides and
     roofed, reached by a zig-zag of platforms in open air that stopped a row
     short of its floor - a room nobody could enter, up a climb that floated.
     Everything here stands on something: the tower on the floor, the ledges in
     its face, the parapet on its top. The way on goes over it, down the far
     side. Split like the puzzle vault: the generator plans and carves the
     tower (planVault), the scene only lays the coins (buildVault). */
  const TOWER_W = 4;         // columns of rock
  const TOWER_H = 6;         // rows above the floor it stands on: three ledges

  function planVault(level, rng) {
    if (level.kind !== 'normal' || level.noProps) return null;
    if (!rng.chance(VAULT_CHANCE)) return null;

    const map = level.map;
    const rooms = level.roomCount;
    if (rooms < 4) return null;

    const order = rng.shuffle([1, 2, 3, 4].slice(0, Math.max(1, rooms - 2)));
    // Never in the room a puzzle already furnishes: its crates, plates and
    // warden stand on that floor.
    const taken = [level.barrier, level.puzzleVault].filter(Boolean).map(function (p) {
      return p.baseTx;
    });
    const offsets = [6, 3, 10, 12];
    for (let i = 0; i < order.length * offsets.length; i++) {
      const roomTx = order[i % order.length] * DS.LevelGen.ROOM_W;
      if (taken.indexOf(roomTx) >= 0) continue;
      const x0 = roomTx + offsets[Math.floor(i / order.length)];
      const floorRow = DS.LevelGen.floorRowAt(map, x0);
      if (floorRow < 0) continue;
      const top = floorRow - TOWER_H;
      if (!siteClear(map, level.spawns, x0, floorRow, top)) continue;

      for (let x = x0; x < x0 + TOWER_W; x++) {
        for (let y = top; y < floorRow; y++) map.set(x, y, DS.TILE.WALL);
      }
      // The parapet: a merlon at each end of the top, the coins between them.
      map.set(x0, top - 1, DS.TILE.WALL);
      map.set(x0 + TOWER_W - 1, top - 1, DS.TILE.WALL);
      // Ledges set into the face, every two rows, the last level with the top.
      for (let y = floorRow - 2; y >= top; y -= 2) {
        map.setDesigned(x0 - 2, y, DS.TILE.PLATFORM);
        map.setDesigned(x0 - 1, y, DS.TILE.PLATFORM);
      }
      return { x0: x0, top: top, floorRow: floorRow };
    }
    return null;
  }

  /* Flat floor under the whole footprint, open air over it, and no spawn marker
     that the rock would bury. */
  function siteClear(map, spawns, x0, floorRow, top) {
    if (top - 2 <= 3) return false;
    for (let x = x0 - 3; x <= x0 + TOWER_W; x++) {
      if (!map.isSolid(x, floorRow)) return false;
      for (let y = top - 2; y < floorRow; y++) {
        if (map.get(x, y) !== DS.TILE.EMPTY) return false;
      }
    }
    const lists = [spawns.enemies || [], spawns.chests || []];
    for (let l = 0; l < lists.length; l++) {
      for (let i = 0; i < lists[l].length; i++) {
        const tx = Math.floor(lists[l][i].x / T);
        if (tx >= x0 - 2 && tx < x0 + TOWER_W) return false;
      }
    }
    return true;
  }

  function buildVault(g, level) {
    const plan = level.bonusVault;
    if (!plan) return;
    const x0 = plan.x0, row = plan.top - 1;

    g.vault = { x: x0 * T, y: row * T, w: TOWER_W * T };
    for (let c = 0; c < g.rng.int(14, 22); c++) {
      Ent.addPickup(g, (x0 + g.rng.float(1.2, TOWER_W - 1.2)) * T,
                    row * T + 8, 'coin', null, 1);
    }
    if (g.rng.chance(0.5)) {
      Ent.addPickup(g, (x0 + TOWER_W / 2) * T, row * T + 8, 'shard', null, 1);
    }
  }

  function draw(g) {
    if (!g.vault) return;
    // A faint glow so the climb is visible from the floor below.
    DS.Map.glow(DS.R, g.vault.x + g.vault.w / 2, g.vault.y + 8, 40,
                'rgba(242,193,78,0.10)');
  }

  function generate(g, level) {
    g.vault = null;
    if (level.kind !== 'normal') return;
    buildVault(g, level);
    spawnGoldSlime(g, level.spawns);
  }

  registerGoldSlime();

  DS.Bonus = { planVault: planVault, generate: generate, draw: draw };
})(window.DS);
