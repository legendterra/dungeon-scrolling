/* One biome per depth. Each is the same tile geometry re-baked through a
   different palette, plus its own background gradient, torch colour and
   darkness level — so descending actually looks like descending. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const A = DS.Art;
  const raw = DS.SPR.raw;

  /* Tile palettes are kept deliberately bright — the darkness layer is what
     creates the mood, and stacking a dark palette under it turned the whole
     screen to mud. Each biome only shifts hue and keeps a similar value. */
  const BIOMES = [
    {
      key: 'halls', doorStyle: 'arch', name: 'STONE HALLS',
      pal: {},
      sky: ['#211b38', '#12101c'],
      light: '#f2c14e', darkness: 0.58, lightRadius: 76,
      dust: '#514c72'
    },
    {
      key: 'caves', doorStyle: 'cave', name: 'DAMP CAVES',
      pal: { D: '#4a7068', d: '#33524c', g: '#79b39d', G: '#aee0cd' },
      sky: ['#183430', '#0b1a17'],
      light: '#7de0be', darkness: 0.66, lightRadius: 72,
      dust: '#4a7d6b'
    },
    {
      key: 'prison', doorStyle: 'gate', name: 'RUSTED PRISON',
      pal: { D: '#6b5641', d: '#4a3a2b', g: '#b8834f', G: '#e0b57e' },
      sky: ['#3a2a1c', '#17100a'],
      light: '#e8a05a', darkness: 0.68, lightRadius: 72,
      dust: '#8a5b3b'
    },
    {
      key: 'vault', doorStyle: 'arch', name: 'CRYSTAL VAULT',
      pal: { D: '#584d85', d: '#3c3563', g: '#9b8ae0', G: '#cfc4ff' },
      sky: ['#2b2160', '#130e2e'],
      light: '#a89bff', darkness: 0.66, lightRadius: 74,
      dust: '#a89bff'
    },
    {
      key: 'nest', doorStyle: 'cave', name: 'THE NEST',
      pal: { D: '#6e4148', d: '#4d2c31', g: '#b8636f', G: '#e0949c' },
      sky: ['#3d191d', '#1b090b'],
      light: '#e8737f', darkness: 0.70, lightRadius: 70,
      dust: '#8a4550'
    },
    {
      key: 'throne', doorStyle: 'gate', name: 'THRONE OF SLIME',
      pal: { D: '#6b5c3c', d: '#4a3f28', g: '#b89a55', G: '#f0d78e' },
      sky: ['#3a2d14', '#171106'],
      light: '#f2c14e', darkness: 0.62, lightRadius: 78,
      dust: '#8a7440'
    },

    /* --- the biome ladder ---------------------------------------------------

       Six more palettes, one per rung of the journey in difficulty.js. Before
       these existed forDepth() indexed BIOMES by depth-1 and clamped at six, so
       THE CLIMB, THE SUNK HALLS and THE ASH REACHES were all lit blue, grey and
       ember on top of slime-throne GOLD stone - the floor and the light
       disagreed about which place you were in.

       The key IS the ladder key, so the terrain, the tiles and the 3D theme are
       now picked by one table instead of two. */
    {
      key: 'shore', doorStyle: 'arch', name: 'THE SHORE',
      pal: { D: '#7a6a52', d: '#5a4e3c', g: '#c8b48e', G: '#e8dcc0' },
      sky: ['#1c2b3a', '#0b141c'],
      light: '#ffe6a8', darkness: 0.50, lightRadius: 84,
      dust: '#c8b48e'
    },
    {
      key: 'cave', doorStyle: 'cave', name: 'THE CAVE MOUTH',
      pal: { D: '#3f5a58', d: '#2b403e', g: '#6a9490', G: '#a8ccc6' },
      sky: ['#0a1a1c', '#050c0e'],
      light: '#7fe8d8', darkness: 0.72, lightRadius: 70,
      dust: '#4a7d78'
    },
    {
      key: 'swamp', doorStyle: 'cave', name: 'THE ROT SWAMP',
      pal: { D: '#4a5638', d: '#333d26', g: '#7a8f4e', G: '#b8c97a' },
      sky: ['#0f1a0c', '#070d06'],
      light: '#b8e06a', darkness: 0.70, lightRadius: 68,
      dust: '#6a7d46'
    },
    {
      key: 'mountain', doorStyle: 'arch', name: 'THE CLIMB',
      pal: { D: '#5a6070', d: '#3e4450', g: '#8a95a8', G: '#ccd6e4' },
      sky: ['#131a26', '#080b12'],
      light: '#dceaff', darkness: 0.60, lightRadius: 76,
      dust: '#8a95a8'
    },
    {
      key: 'flooded', doorStyle: 'arch', name: 'THE SUNK HALLS',
      pal: { D: '#3a5566', d: '#263a48', g: '#6a8fa8', G: '#a8cde0' },
      sky: ['#081824', '#030c14'],
      light: '#8fd8ff', darkness: 0.72, lightRadius: 70,
      dust: '#5a86a0'
    },
    {
      key: 'volcanic', doorStyle: 'gate', name: 'THE ASH REACHES',
      pal: { D: '#5a3228', d: '#3a2018', g: '#8f5040', G: '#d08a6a' },
      sky: ['#1c0a06', '#0d0403'],
      light: '#ff8a4a', darkness: 0.66, lightRadius: 74,
      dust: '#a05038'
    }
  ];

  const BY_KEY = {};
  BIOMES.forEach(function (b) { BY_KEY[b.key] = b; });

  /* Ladder rungs that reuse an older palette: the puzzle hall was carved from
     the prison's masonry, the waystation is vault-cut like the rest of the
     safe rooms, and the throne room is the throne room. */
  const RUNG_PALETTE = { puzzle: 'prison', safe: 'vault', boss: 'throne' };

  // Bake each biome's tile set once at load, at the same detail sprites.js used.
  const D = DS.SPR.tileDetail || 1;

  BIOMES.forEach(function (biome) {
    const pal = biome.pal;
    biome.tile = {
      wall: A.makeSprite(raw.WALL, pal, D),
      floor: A.makeSprite(raw.FLOOR, pal, D),
      platform: A.makeSprite(raw.PLATFORM, pal, D),
      spike: A.makeSprite(raw.SPIKE, pal, D),
      // Each biome gets a doorway silhouette that suits it.
      door: A.makeSprite(raw.buildDoor(biome.doorStyle || 'arch'), pal, D),
      torch: DS.SPR.tile.torch,
      torchFrames: DS.SPR.tile.torchFrames,
      deathspike: DS.SPR.tile.deathspike,
      table: DS.SPR.tile.table
    };
  });

  /* One depth -> one palette, asked of the biome ladder so the tiles and the 3D
     theme can never disagree again. Falls back to the old depth-1 index if the
     ladder is missing (a trimmed build), which is what used to be the only path. */
  function forDepth(depth) {
    if (DS.Difficulty && DS.Difficulty.biomeForDepth) {
      const rung = DS.Difficulty.biomeForDepth(depth);
      const key = (rung && BY_KEY[rung.key]) ? rung.key : RUNG_PALETTE[rung && rung.key];
      if (key && BY_KEY[key]) return BY_KEY[key];
    }
    return BIOMES[DS.M.clamp(depth - 1, 0, BIOMES.length - 1)];
  }

  DS.Biomes = { LIST: BIOMES, forDepth: forDepth };
})(window.DS);
