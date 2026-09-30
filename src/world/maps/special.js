/* The rooms that are not a depth: the safe room and the trial.

   The rest in front of a boss is a merchant's camp in a niche of the cave in the first
   two acts - a fire, a lantern, the stone shut in around it - and in the act of the gods
   it is the Temple of Hestia, goddess of the hearth: a round of marble around one fire
   that never goes out. The trial keeps the eclipse over the obelisks in acts I and II
   (the built-in 'trial' theme, the Arbiter's arena) and is the Arena of Heroes in act III:
   a coliseum in the noon sun, statues of the ones who won, sand under the feet, and a
   bull (world/arena.js says which boss the trial holds).

   Same pieces as a map (src/world/maps.js), keyed by kind and act. */
(function (DS) {
  'use strict';
  if (!DS.Maps || !DS.Maps.defineSpecial) return;
  const defineSpecial = DS.Maps.defineSpecial;

  /* The merchant's camp, acts I and II: a niche of the cave with a fire in it. Closed, and the
     fire is the only sun. Dry and amber in the first act, damp and greener in the second. */
  defineSpecial({
    key: 's1_camp', kind: 'safe', act: 1, label: 'Merchant\'s Camp', flavor: 'plain', closed: true,
    palette: {
      pal: { D: '#6a5a48', d: '#3a3024', g: '#a8906a', G: '#e0c898' }, doorStyle: 'cave',
      sky: ['#1a120a', '#080604'], light: '#ffb060', darkness: 0.58, lightRadius: 92, dust: '#c8a878'
    },
    tiles: {
      wall: { tex: 'tile_rock', color: '#8a7458' },
      top: { tex: 'tile_slate', color: '#b09878' },
      plat: { tex: 'tile_planksold', color: '#8a6a44' }
    },
    theme: { fog: 0x140e08, ambient: 0x6a5238, hemiSky: 0x8a6c48, hemiGround: 0x1c140c, dir: 0xffb060, dirI: 0.56 },
    grade: { sat: 1.1 },
    ambience: 'camp',
    backdrop: {
      curve: { gain: 0.44, warm: 0.5 },
      hero: { kind: 'furnace', col: 0xffa040, core: 0xfff0c0, edge: 0xc05a10, az: 0.5, elev: 3.6, r: 2.4,
              halos: [1.6, 2.8], rays: 8, fan: 8, glow: 0.4, gain: 0.9 },
      recipe: {
        tex: 'wetrock', ceiling: { y: 10.5, col: 0x0c0806 },
        skyGlow: 0.5, haze: 0.62, ground: 0x0e0a06,
        motes: { col: 0xffc878, size: 0.24, alpha: 0.5, rise: 0.3 },
        layers: [
          { kind: 'rubble',      sp: 2.2, d: 4.5, col: 0x3a2c1c, s0: 0.25, s1: 0.9 },
          { kind: 'stalactites', sp: 2.2, d: 7.5, col: 0x2c2014, h0: 1.4, h1: 3.0 },
          { kind: 'rubble',      sp: 3.0, d: 12,  col: 0x2a1e12, s0: 0.5, s1: 1.3 },
          { kind: 'stalactites', sp: 2.4, d: 12,  col: 0x241a10, h0: 1.6, h1: 3.2 },
          { kind: 'spires',      sp: 5.0, d: 19,  col: 0x1c140c, h0: 2.2, h1: 3.6 },
          { kind: 'spires',      sp: 6.0, d: 46,  col: 0x120c08, h0: 2.0, h1: 3.2 }
        ]
      }
    }
  });

  defineSpecial({
    key: 's2_camp', kind: 'safe', act: 2, label: 'Merchant\'s Camp', flavor: 'plain', closed: true,
    palette: {
      pal: { D: '#3e5a5c', d: '#243638', g: '#78a09c', G: '#b4dcd4' }, doorStyle: 'cave',
      sky: ['#0a1414', '#040808'], light: '#ffc070', darkness: 0.6, lightRadius: 90, dust: '#7aa8a0'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#4a6a68' },
      top: { tex: 'tile_slate', color: '#8aa8a0' },
      plat: { tex: 'tile_planksold', color: '#5a4a3a' }
    },
    theme: { fog: 0x081012, ambient: 0x40584c, hemiSky: 0x5c8078, hemiGround: 0x101c1a, dir: 0xffb868, dirI: 0.5 },
    grade: { sat: 1.06, gamma: 1.04 },
    ambience: 'camp',
    backdrop: {
      curve: { gain: 0.4, warm: 0.44 },
      hero: { kind: 'furnace', col: 0xffa040, core: 0xfff0c0, edge: 0xc05a10, az: 0.5, elev: 3.6, r: 2.4,
              halos: [1.6, 2.8], rays: 8, fan: 8, glow: 0.38, gain: 0.86 },
      recipe: {
        tex: 'wetrock', ceiling: { y: 10.5, col: 0x040a0a },
        skyGlow: 0.5, haze: 0.62, ground: 0x081010,
        mist: { sp: 3.6, size: 0.2, alpha: 0.12, col: 0x5c8c88 },
        motes: { col: 0xffc878, size: 0.24, alpha: 0.45, rise: 0.3 },
        layers: [
          { kind: 'rubble',      sp: 2.2, d: 4.5, col: 0x1a2c2a, s0: 0.25, s1: 0.9 },
          { kind: 'mushrooms',   sp: 6.5, d: 7.5, col: 0x16282a, cap: 0x4aa898, glowCol: 0x6ad8b8, h0: 1.6, h1: 3.2 },
          { kind: 'stalactites', sp: 2.2, d: 7.5, col: 0x142422, h0: 1.4, h1: 3.0 },
          { kind: 'stalactites', sp: 2.4, d: 12,  col: 0x10201e, h0: 1.6, h1: 3.2 },
          { kind: 'spires',      sp: 5.0, d: 19,  col: 0x0c1a18, h0: 2.2, h1: 3.6 },
          { kind: 'spires',      sp: 6.0, d: 46,  col: 0x081412, h0: 2.0, h1: 3.2 }
        ]
      }
    }
  });

  /* The Temple of Hestia. Closed: a ceiling, no sky, and the hearth for a sun. */
  defineSpecial({
    key: 's3_hestia', kind: 'safe', act: 3, label: 'Temple of Hestia', flavor: 'plain', closed: true,
    palette: {
      pal: { D: '#a89a80', d: '#6a5c44', g: '#e0d0a8', G: '#fff2d0' }, doorStyle: 'arch',
      sky: ['#2a1c10', '#100a06'], light: '#ffc878', darkness: 0.5, lightRadius: 96, dust: '#e0d0a8'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#e8d8b4' },
      top: { tex: 'tile_pavelarge', color: '#f2e4c0' },
      plat: { tex: 'tile_planksold', color: '#8a6a44' }
    },
    theme: { fog: 0x1c1208, ambient: 0x8a6a44, hemiSky: 0xb89860, hemiGround: 0x2a1c0e, dir: 0xffc878, dirI: 0.62 },
    grade: { sat: 1.12, contrast: 1.03 },
    ambience: 'hearth',
    backdrop: {
      curve: { gain: 0.5, warm: 0.5 },
      hero: { kind: 'furnace', col: 0xffa040, core: 0xfff0c0, edge: 0xc05a10, az: 0.5, elev: 6.0, r: 3.0,
              halos: [1.6, 2.8], rays: 10, fan: 10, glow: 0.42, gain: 0.95 },
      recipe: {
        tex: 'gild', ceiling: { y: 16, col: 0x1c1208 },
        skyGlow: 0.5, haze: 0.66, ground: 0x241a0c,
        motes: { col: 0xffc878, size: 0.26, alpha: 0.5, rise: 0.3 },
        layers: [
          { kind: 'columns',   sp: 3.8, d: 4.5, col: 0x8a7444, h0: 2.6, h1: 3.4 },
          { kind: 'colonnade', sp: 22,  d: 7.5, col: 0x7a6634, style: 'ionic', cols: 4, h0: 8, h1: 11 },
          { kind: 'arches',    sp: 5.0, d: 12,  col: 0x6a5828, h0: 2.8, h1: 3.6 },
          { kind: 'colonnade', sp: 26,  d: 19,  col: 0x5a4a20, style: 'ionic', cols: 4, h0: 8, h1: 11 },
          { kind: 'statue',    solo: true, d: 30, col: 0x4a3c18, h0: 8, h1: 9 },
          { kind: 'columns',   sp: 3.8, d: 46,  col: 0x3a2e12, h0: 2.2, h1: 3.0 },
          { kind: 'columns',   sp: 3.8, d: 68,  col: 0x2a200c, h0: 2.0, h1: 2.6 }
        ]
      }
    }
  });

  /* The Arena of Heroes. Outdoors, and bright: this is the one trial with the sun in it. */
  defineSpecial({
    key: 't3_heroes', kind: 'trial', act: 3, label: 'Arena of Heroes', flavor: 'plain',
    palette: {
      pal: { D: '#c8b080', d: '#8a7648', g: '#e8d8a8', G: '#fff4d0' }, doorStyle: 'gate',
      sky: ['#5a4a2a', '#201808'], light: '#fff0b0', darkness: 0.42, lightRadius: 92, dust: '#e8d8a8'
    },
    tiles: {
      wall: { tex: 'tile_limestone', color: '#e0cfa0' },
      top: { tex: 'tile_sand', color: '#f0dfae' },
      plat: { tex: 'tile_planksold', color: '#9a7a52' }
    },
    theme: { fog: 0x2a2010, ambient: 0x94804c, hemiSky: 0xc4b070, hemiGround: 0x34280e, dir: 0xfff0b0, dirI: 0.74 },
    grade: { sat: 1.12, contrast: 1.06 },
    ambience: 'aegean',
    backdrop: {
      curve: { gain: 0.66, warm: 0.42 },
      hero: { kind: 'sun', col: 0xfff0b0, core: 0xffffff, edge: 0xe8a838, az: 0.5, elev: 11.0, r: 6.6,
              halos: [1.5, 2.6], rays: 16, fan: 16, glow: 0.46, gain: 1.0 },
      recipe: {
        tex: 'sand', fill: 0.2, skyGlow: 0.95, haze: 0.8, ground: 0x3a2e14,
        motes: { col: 0xfff0b0, size: 0.22, alpha: 0.3, rise: 0.1 },
        layers: [
          { kind: 'statue',    sp: 7.5, d: 4.5, col: 0xb8a884, h0: 5, h1: 6.5 },
          { kind: 'wall', d: 7.5, col: 0xd8c898, courses: true, cell: 4, height: 8, piers: 20, jitter: 0.4,
            openings: { every: 14, first: 6, w: 4, h: 5, y0: 1, shape: 'window' } },
          { kind: 'wall', d: 12, col: 0xc8b888, courses: true, cell: 5, height: 13, piers: 26, jitter: 0.4,
            openings: { every: 18, first: 10, w: 5, h: 7, y0: 1, shape: 'window' } },
          { kind: 'colonnade', sp: 30, d: 19, col: 0xb8a878, style: 'ionic', cols: 4, h0: 6, h1: 8 },
          { kind: 'temple',    solo: true, d: 30, col: 0xa89868, scale: 0.4 },
          { kind: 'mountains', sp: 9, d: 46, col: 0x9a8a6a, h0: 2.3, h1: 2.9 },
          { kind: 'mountains', sp: 8, d: 68, col: 0x8a7a5c, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });
})(window.DS);
