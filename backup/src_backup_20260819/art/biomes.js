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
      light: '#f2c14e', darkness: 0.22, lightRadius: 62,
      dust: '#514c72'
    },
    {
      key: 'caves', doorStyle: 'cave', name: 'DAMP CAVES',
      pal: { D: '#4a7068', d: '#33524c', g: '#79b39d', G: '#aee0cd' },
      sky: ['#183430', '#0b1a17'],
      light: '#7de0be', darkness: 0.30, lightRadius: 58,
      dust: '#4a7d6b'
    },
    {
      key: 'prison', doorStyle: 'gate', name: 'RUSTED PRISON',
      pal: { D: '#6b5641', d: '#4a3a2b', g: '#b8834f', G: '#e0b57e' },
      sky: ['#3a2a1c', '#17100a'],
      light: '#e8a05a', darkness: 0.32, lightRadius: 58,
      dust: '#8a5b3b'
    },
    {
      key: 'vault', doorStyle: 'arch', name: 'CRYSTAL VAULT',
      pal: { D: '#584d85', d: '#3c3563', g: '#9b8ae0', G: '#cfc4ff' },
      sky: ['#2b2160', '#130e2e'],
      light: '#a89bff', darkness: 0.30, lightRadius: 60,
      dust: '#a89bff'
    },
    {
      key: 'nest', doorStyle: 'cave', name: 'THE NEST',
      pal: { D: '#6e4148', d: '#4d2c31', g: '#b8636f', G: '#e0949c' },
      sky: ['#3d191d', '#1b090b'],
      light: '#e8737f', darkness: 0.34, lightRadius: 56,
      dust: '#8a4550'
    },
    {
      key: 'throne', doorStyle: 'gate', name: 'THRONE OF SLIME',
      pal: { D: '#6b5c3c', d: '#4a3f28', g: '#b89a55', G: '#f0d78e' },
      sky: ['#3a2d14', '#171106'],
      light: '#f2c14e', darkness: 0.26, lightRadius: 64,
      dust: '#8a7440'
    }
  ];

  // Bake each biome's tile set once at load.
  BIOMES.forEach(function (biome) {
    const pal = biome.pal;
    biome.tile = {
      wall: A.makeSprite(raw.WALL, pal),
      floor: A.makeSprite(raw.FLOOR, pal),
      platform: A.makeSprite(raw.PLATFORM, pal),
      spike: A.makeSprite(raw.SPIKE, pal),
      // Each biome gets a doorway silhouette that suits it.
      door: A.makeSprite(raw.buildDoor(biome.doorStyle || 'arch'), pal),
      torch: DS.SPR.tile.torch,
      torchFrames: DS.SPR.tile.torchFrames,
      deathspike: DS.SPR.tile.deathspike,
      table: DS.SPR.tile.table
    };
  });

  function forDepth(depth) {
    return BIOMES[DS.M.clamp(depth - 1, 0, BIOMES.length - 1)];
  }

  DS.Biomes = { LIST: BIOMES, forDepth: forDepth };
})(window.DS);
