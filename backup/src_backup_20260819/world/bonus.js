/* Bonus rounds — two small, optional pockets of income.

   Coin Vault  a walled alcove above the level, reached by a platform climb.
               No enemies, no items, just coins for the detour.
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

  const GOLD_SLIME = [
    '....kkkk....',
    '..kkYYYYkk..',
    '.kyYYYYYYyk.',
    'kyYYkYYkYYyk',
    'kyYYYYYYYYyk',
    'kyyyyyyyyyyk',
    'kyooooooooyk',
    '.kooooooook.',
    '..kkkkkkkk..'
  ];

  const GOLD_SLIME_SQUASH = [
    '............',
    '............',
    '..kkkkkkkk..',
    'kkYYkYYkYYkk',
    'kyYYYYYYYYyk',
    'kyyyyyyyyyyk',
    'kyooooooooyk',
    'koooooooooook'.slice(0, 12),
    'kkkkkkkkkkkk'
  ];

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
    S.goldslime = [A.makeSprite(GOLD_SLIME), A.makeSprite(GOLD_SLIME_SQUASH)];
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
    if (g.map.floorBelow(tx, 0) >= g.map.pixelH) return;

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

  /* Carves a small sealed room near the ceiling and a staircase of platforms
     leading up to it, then fills it with coins. Only built where the columns
     above the floor are genuinely empty, so it never eats level geometry. */
  function buildVault(g, level) {
    if (!g.rng.chance(VAULT_CHANCE)) return;

    const map = g.map;
    const rooms = level.roomCount;
    if (rooms < 4) return;

    const order = g.rng.shuffle([1, 2, 3, 4].slice(0, Math.max(1, rooms - 2)));

    for (let i = 0; i < order.length; i++) {
      const baseTx = order[i] * DS.LevelGen.ROOM_W + 6;
      if (!clearAbove(map, baseTx, 7)) continue;

      const floorRow = Math.floor(map.floorBelow(baseTx, 0) / T);
      if (floorRow >= map.h) continue;

      // Vault shell: three tiles of floor with walls at either end.
      const vaultRow = 2;
      map.fill(baseTx, vaultRow + 1, 5, 1, DS.TILE.WALL);
      map.set(baseTx - 1, vaultRow, DS.TILE.WALL);
      map.set(baseTx + 5, vaultRow, DS.TILE.WALL);
      map.fill(baseTx - 1, vaultRow - 1, 7, 1, DS.TILE.WALL);

      // The climb: alternating platforms from the floor up to the lip.
      let row = floorRow - 3;
      let side = 0;
      while (row > vaultRow + 1) {
        const px = baseTx + (side % 2 === 0 ? -2 : 3);
        map.fill(px, row, 2, 1, DS.TILE.PLATFORM);
        row -= 3;
        side++;
      }

      g.vault = { x: baseTx * T, y: vaultRow * T, w: 5 * T };
      for (let c = 0; c < g.rng.int(14, 22); c++) {
        Ent.addPickup(g, (baseTx + g.rng.float(0.5, 4.5)) * T,
                      vaultRow * T + 8, 'coin', null, 1);
      }
      if (g.rng.chance(0.5)) {
        Ent.addPickup(g, (baseTx + 2.5) * T, vaultRow * T + 8, 'shard', null, 1);
      }
      return;
    }
  }

  /* Only the vault shell itself has to be empty — the climb can weave past
     whatever platforms the room template already has. Checking the whole
     column down to the floor rejected almost every room. */
  function clearAbove(map, tx, width) {
    for (let x = tx - 2; x < tx + width; x++) {
      for (let ty = 1; ty <= 4; ty++) {
        if (map.isBlocked(x, ty)) return false;
      }
    }
    return true;
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

  DS.Bonus = { generate: generate, draw: draw };
})(window.DS);
