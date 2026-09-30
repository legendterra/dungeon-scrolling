/* Act III: the crown of the gods. The Greek third of the run, from the palace
   of Minos at the bottom of the mountain to Zeus's throne above the storm:
   a labyrinth in the Aegean sun, the stair up Olympus, a garden of people who
   looked at the wrong face, Tartarus with its titans, the Styx, a summit in a
   thunderstorm, the forge of Hephaestus, the twelve thrones, the temple of the
   sun, and the last hall.

   Same rules as act1.js and act2.js. */
(function (DS) {
  'use strict';
  if (!DS.Maps) return;
  const define = DS.Maps.define;

  /* 21 - THE LABYRINTH OF MINOS. Walls of plaster and limestone to the edge of
     the world in the Aegean sun, red Minoan columns, and a great stone bull's
     head watching. */
  define({
    depth: 21, key: 'm21_labyrinth', label: 'The Labyrinth of Minos', flavor: 'plain', floorBoss: 'minotaur',
    palette: {
      pal: { D: '#a08c6a', d: '#6e5e44', g: '#d4c098', G: '#f0e2c0' }, doorStyle: 'arch',
      sky: ['#3a3020', '#181208'], light: '#ffe8b0', darkness: 0.50, lightRadius: 84, dust: '#d4c098'
    },
    tiles: {
      wall: { tex: 'tile_plaster', color: '#d0b088' },
      top: { tex: 'tile_limestone', color: '#e8d4a8' },
      plat: { tex: 'tile_planksold', color: '#9a7a52' }
    },
    theme: { fog: 0x2a2216, ambient: 0x8a7a5a, hemiSky: 0xb8a880, hemiGround: 0x3a3020, dir: 0xffe4b0, dirI: 0.66 },
    grade: { sat: 1.12 },
    affinity: { shielder: 1.6, skeleton: 1.4, cultist: 1.2 },
    ambience: 'aegean',
    roster: { hoplite: 34, shielder: 22, skeleton: 24, cultist: 12, bat: 8 },
    backdrop: {
      curve: { gain: 0.66, warm: 0.4 },
      hero: { kind: 'sun', col: 0xffe8b0, core: 0xfffff0, edge: 0xe0a040, az: 0.5, elev: 11.0, r: 6.2,
              halos: [1.5, 2.6], rays: 14, fan: 14, glow: 0.42, gain: 1.0 },
      recipe: {
        tex: 'sand', fill: 0.2, skyGlow: 0.95, haze: 0.8, ground: 0x2a2216,
        motes: { col: 0xffe8b0, size: 0.22, alpha: 0.3, rise: 0.1 },
        layers: [
          { kind: 'colonnade', sp: 20, d: 4.5, col: 0xb06a3c, style: 'minoan', h0: 6, h1: 7, cols: 4 },
          { kind: 'wall',  d: 7.5, col: 0xc8ac78, courses: true, cell: 4, height: 11, piers: 24, jitter: 0.5,
            openings: { every: 26, first: 8, w: 6, h: 7, y0: 0, shape: 'window' } },
          { kind: 'wall',  d: 12, col: 0xb89e6c, courses: true, cell: 5, height: 15, piers: 30, jitter: 0.5,
            openings: { every: 34, first: 20, w: 7, h: 9, y0: 0, shape: 'window' } },
          { kind: 'wall',  d: 19, col: 0xa89060, courses: true, cell: 6, height: 18, piers: 40, jitter: 0.5,
            openings: { every: 44, first: 10, w: 9, h: 11, y0: 0, shape: 'window' } },
          { kind: 'bullhead', solo: true, d: 30, col: 0x8a7550, scale: 1.4 },
          { kind: 'wall',  d: 46, col: 0x988458, courses: true, cell: 8, height: 17, piers: 64, jitter: 0.5,
            openings: { every: 60, first: 30, w: 12, h: 12, y0: 0, shape: 'window' } },
          { kind: 'mountains', sp: 9, d: 68, col: 0x8a7c66, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 22 - THE SLOPES OF OLYMPUS. A marble stair up a mountain in cloud: temples
     in ruin on the ledges, a sea of cloud below, and far above it, small and
     gold, the city of the gods. */
  define({
    depth: 22, key: 'm22_olympus', label: 'The Slopes of Olympus', flavor: 'mountain',
    palette: {
      pal: { D: '#8a94a8', d: '#5a6478', g: '#c0c8d8', G: '#eef2fa' }, doorStyle: 'arch',
      sky: ['#2a3450', '#0e1220'], light: '#ffe6a0', darkness: 0.52, lightRadius: 82, dust: '#c0c8d8'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#b0b8cc' },
      top: { tex: 'tile_pavelarge', color: '#ccd2e2' },
      plat: { tex: 'tile_planksold', color: '#9a8a6a' }
    },
    theme: { fog: 0x1a2236, ambient: 0x7a86a0, hemiSky: 0xa4b0cc, hemiGround: 0x2c3244, dir: 0xffe6b0, dirI: 0.66 },
    grade: { sat: 1.08, contrast: 1.04 },
    affinity: { harpy: 2.4, golem: 1.2, bat: 0.6 },
    ambience: 'olympus',
    roster: { centaur: 28, satyr: 22, harpy: 26, golem: 14, bat: 6 },
    backdrop: {
      curve: { gain: 0.62, warm: 0.34 },
      hero: { kind: 'sun', col: 0xffe090, core: 0xfffce8, edge: 0xe0a030, az: 0.46, elev: 9.0, r: 6.6,
              halos: [1.5, 2.6], rays: 16, fan: 14, glow: 0.42, gain: 1.0 },
      recipe: {
        tex: 'granite', skyGlow: 0.9, haze: 0.86, ground: 0x2a3046,
        stars: null,
        motes: { col: 0xfff0c0, size: 0.22, alpha: 0.3, rise: 0.15 },
        layers: [
          { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x7a8298, s0: 0.3, s1: 1.0 },
          { kind: 'colonnade', sp: 24, d: 7.5, col: 0x8a94ac, cols: 4, h0: 4, h1: 5.6 },
          { kind: 'temple',    sp: 46, d: 12,  col: 0x7a849c },
          { kind: 'mountains', sp: 9,  d: 19,  col: 0x6a7490, snow: true, cap: 0xf0f4ff, h0: 3.1, h1: 3.6 },
          { kind: 'cloudsea',  sp: 5,  d: 30,  col: 0xc4ccdc, cap: 0xffffff, y0: 12, y1: 13.6 },
          { kind: 'temple',    solo: true, d: 30, col: 0x707a94, scale: 0.4 },
          { kind: 'cloudsea',  sp: 6,  d: 46,  col: 0xd0d6e4, cap: 0xffffff, y0: 9.6, y1: 10.8 },
          { kind: 'castle',    sp: 26, d: 68,  col: 0xb8a060, h0: 2.8, h1: 3.4, glowCol: 0xffd870 },
          { kind: 'cloudsea',  sp: 6,  d: 68,  col: 0xdce2ee, cap: 0xffffff, y0: 7, y1: 8 }
        ]
      }
    }
  });

  /* 23 - THE GORGON'S GARDEN. An olive grove at dusk with a company of warriors
     standing in it, grey and cracked, every one of them caught in the middle of
     turning away. */
  define({
    depth: 23, key: 'm23_gorgon', label: 'The Gorgon\'s Garden', flavor: 'plain', floorBoss: 'medusa',
    palette: {
      pal: { D: '#7a8468', d: '#4e5840', g: '#a8b490', G: '#d4e0b8' }, doorStyle: 'arch',
      sky: ['#1a2610', '#0a0f06'], light: '#d8f08a', darkness: 0.62, lightRadius: 76, dust: '#a8b490'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#98a888' },
      top: { tex: 'tile_pavelarge', color: '#aab89a' },
      plat: { tex: 'tile_planksold', color: '#7a7048' }
    },
    theme: { fog: 0x121a0a, ambient: 0x5a6a44, hemiSky: 0x7a9058, hemiGround: 0x1c2410, dir: 0xd8f08a, dirI: 0.5 },
    grade: { sat: 1.06 },
    affinity: { shielder: 1.6, wraith: 1.3, skeleton: 1.3 },
    ambience: 'garden',
    roster: { gorgonite: 30, hoplite: 22, stonesnake: 22, wraith: 14, skeleton: 12 },
    backdrop: {
      curve: { gain: 0.46, warm: 0.3 },
      hero: { kind: 'sun', col: 0xd8f08a, core: 0xf8ffe0, edge: 0x7a9a30, az: 0.5, elev: 8.0, r: 6.0,
              halos: [1.5, 2.6], rays: 10, fan: 12, glow: 0.38, gain: 0.95 },
      recipe: {
        tex: 'moss', skyGlow: 0.85, haze: 0.76, ground: 0x141c0c,
        mist: { sp: 3.4, size: 0.24, alpha: 0.12, col: 0xc8e090 },
        motes: { col: 0xd8f08a, size: 0.22, alpha: 0.35, rise: 0.15 },
        water: { d0: 12, col: 0x0e2412 },
        layers: [
          { kind: 'olive',     sp: 5.0, d: 4.5, col: 0x1c2c14, h0: 2.4, h1: 3.6 },
          { kind: 'statue',    sp: 9.0, d: 7.5, col: 0x4a5040, h0: 6.5, h1: 8 },
          { kind: 'colonnade', sp: 26,  d: 12,  col: 0x58604a, cols: 3, h0: 4, h1: 5.2 },
          { kind: 'olive',     sp: 4.4, d: 19,  col: 0x1a2812, h0: 2.6, h1: 3.8 },
          { kind: 'temple',    solo: true, d: 30, col: 0x40483a, scale: 0.4 },
          { kind: 'olive',     sp: 4.0, d: 46,  col: 0x18240f, h0: 2.2, h1: 3.2 },
          { kind: 'mountains', sp: 9,   d: 68,  col: 0x3a4a30, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 24 - TARTARUS. A vault so high it has no top, chains as thick as towers
     going up into the dark, titans on their knees in the far light, and a red
     glow coming up from the pit. No sky at all. */
  define({
    depth: 24, key: 'm24_tartarus', label: 'Tartarus', flavor: 'plain', closed: true,
    palette: {
      pal: { D: '#4a3a34', d: '#261c1a', g: '#8a6a4a', G: '#c8a070' }, doorStyle: 'gate',
      sky: ['#2a0c08', '#100403'], light: '#ff6a30', darkness: 0.74, lightRadius: 68, dust: '#8a4a30'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#5e4c44' },
      top: { tex: 'tile_metal', color: '#8a6a4a' },
      plat: { tex: 'tile_metal', color: '#7a5a3a' }
    },
    theme: { fog: 0x2a0e0a, ambient: 0x8a4636, hemiSky: 0xa84a38, hemiGround: 0x3a1a14, dir: 0xff6a3a, dirI: 0.72 },
    grade: { sat: 1.14, contrast: 1.1 },
    affinity: { cultist: 1.6, magmacrab: 1.6, wraith: 1.2 },
    ambience: 'tartarus',
    roster: { fury: 28, titanslave: 24, cultist: 20, magmacrab: 18, wraith: 10 },
    backdrop: {
      curve: { gain: 0.55, warm: 0.4 },
      hero: { kind: 'dome', col: 0xff4a20, core: 0xffc090, edge: 0x901008, az: 0.5, elev: 6.0, r: 4.4,
              halos: [1.5, 2.6], rays: 10, fan: 12, glow: 0.5, gain: 1.0 },
      recipe: {
        tex: 'basalt', fill: 0.55, ceiling: { y: 17, col: 0x0a0402 },
        skyGlow: 0.5, haze: 0.66, ground: 0x0c0403,
        ember: { sp: 2.6, size: 0.11, alpha: 0.5, col: 0xff8a3c },
        motes: { col: 0xff6a20, size: 0.2, alpha: 0.4, rise: 0.5 },
        water: { d0: 8, col: 0x4a0c04, lava: true },
        layers: [
          { kind: 'rubble',   sp: 2.4, d: 4.5, col: 0x54301f, s0: 0.3, s1: 1.0 },
          { kind: 'bigchain', sp: 26, d: 7.5, col: 0x5c382a, hang: true, l0: 16, l1: 40 },
          { kind: 'spires',   sp: 4.4, d: 12, col: 0x4e281a, h0: 2.8, h1: 4.6 },
          { kind: 'bigchain', sp: 30, d: 19, col: 0x4a2a1e, hang: true, l0: 20, l1: 44 },
          { kind: 'titan',    solo: true, d: 30, col: 0x3c2016, scale: 0.55 },
          { kind: 'biggate',  sp: 90, d: 46, col: 0x4a2a1c },
          { kind: 'spires',   sp: 5.0, d: 68, col: 0x3a1c12, h0: 2.4, h1: 3.6 }
        ]
      }
    }
  });

  /* 25 - THE HALLS OF HADES. The black river with a boat on it, fields of
     asphodel burning cold, and, on the far shore, the gate. */
  define({
    depth: 25, key: 'm25_hades', label: 'The Halls of Hades', flavor: 'boss', closed: true,
    palette: {
      pal: { D: '#3a3448', d: '#1c1826', g: '#6a5e88', G: '#a498c8' }, doorStyle: 'gate',
      sky: ['#0c0a1c', '#04030a'], light: '#7ad0ff', darkness: 0.74, lightRadius: 70, dust: '#6a5e88'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#4a4258' },
      top: { tex: 'tile_slate', color: '#6a6084' },
      plat: { tex: 'tile_metal', color: '#5a4e6a' }
    },
    theme: { fog: 0x0a0818, ambient: 0x3e3858, hemiSky: 0x544c78, hemiGround: 0x100c1c, dir: 0x8ad0ff, dirI: 0.4 },
    grade: { sat: 1.06, gamma: 1.05 },
    affinity: {},
    ambience: 'styx',
    roster: { shade: 40, cerberuspup: 30, wraith: 30 },
    backdrop: {
      curve: { gain: 0.3, warm: 0.3 },
      hero: { kind: 'sigil', col: 0x5ac8ff, core: 0xe0fbff, edge: 0x1a5a8a, az: 0.5, elev: 9.0, r: 5.0,
              halos: [1.6, 2.8], ring: true, fan: 12, glow: 0.4, gain: 0.9 },
      recipe: {
        tex: 'basalt', skyGlow: 0.5, haze: 0.66, ground: 0x0a0814,
        stars: { sp: 1.2, size: 0.12, alpha: 0.55 },
        mist: { sp: 3.2, size: 0.24, alpha: 0.14, col: 0x6a8ac8 },
        motes: { col: 0x8ad8ff, size: 0.22, alpha: 0.5, rise: 0.3 },
        water: { d0: 7.5, col: 0x060a16 },
        layers: [
          { kind: 'asphodel', sp: 3.0, d: 4.5, col: 0x2a2840, cap: 0xb8c0e8, glowCol: 0x6ad0ff },
          { kind: 'boat',     sp: 30,  d: 7.5, col: 0x14101e, glowCol: 0x6ad0ff },
          { kind: 'colonnade', sp: 28, d: 12, col: 0x1e1a2c, cols: 4, h0: 5, h1: 7 },
          { kind: 'asphodel', sp: 4.0, d: 19, col: 0x221e34, cap: 0xa0a8d8, glowCol: 0x5ac8ff },
          { kind: 'biggate',  solo: true, d: 30, col: 0x16121e, scale: 0.9 },
          { kind: 'mountains', sp: 9, d: 46, col: 0x181428, h0: 2.4, h1: 3.0 },
          { kind: 'mountains', sp: 8, d: 68, col: 0x1e1a30, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 26 - THE STORM SUMMIT. The peak of Olympus in a thunderstorm: bridges of
     marble between the tops, black cloud with the lightning walking down it,
     and the sun coming through the gaps. */
  define({
    depth: 26, key: 'm26_storm', label: 'The Storm Summit', flavor: 'mountain',
    palette: {
      pal: { D: '#6a7288', d: '#3e4458', g: '#9aa4bc', G: '#d0d8ee' }, doorStyle: 'arch',
      sky: ['#161c2c', '#080a14'], light: '#ffe8a8', darkness: 0.62, lightRadius: 78, dust: '#9aa4bc'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#8a92a8' },
      top: { tex: 'tile_pavelarge', color: '#aab2c8' },
      plat: { tex: 'tile_planksold', color: '#8a7a5a' }
    },
    theme: { fog: 0x101624, ambient: 0x5a647c, hemiSky: 0x7a86a4, hemiGround: 0x1c2232, dir: 0xffe8b0, dirI: 0.56 },
    grade: { sat: 1.08, contrast: 1.08 },
    affinity: { harpy: 2.4, golem: 1.2 },
    ambience: 'storm',
    roster: { stormspirit: 30, harpy: 26, centaur: 26, golem: 18 },
    backdrop: {
      curve: { gain: 0.42, warm: 0.3 },
      hero: { kind: 'sun', col: 0xffe8a8, core: 0xfffce8, edge: 0xe0a830, az: 0.46, elev: 9.0, r: 6.0,
              halos: [1.5, 2.6], rays: 14, fan: 14, glow: 0.42, gain: 1.0 },
      recipe: {
        tex: 'granite', skyGlow: 0.85, haze: 0.8, ground: 0x1a2032,
        motes: { col: 0xd8e4ff, size: 0.2, alpha: 0.4, rise: -0.5 },
        layers: [
          { kind: 'rubble',     sp: 2.4, d: 4.5, col: 0x5a6278, s0: 0.3, s1: 1.0 },
          { kind: 'colonnade',  sp: 26,  d: 7.5, col: 0x707a92, cols: 4, h0: 4, h1: 5.4 },
          { kind: 'stormcloud', sp: 12,  d: 12,  col: 0x475275, y0: 6, y1: 9, bolt: 0.3 },
          { kind: 'mountains',  sp: 9,   d: 19,  col: 0x505a72, snow: true, cap: 0xd8e0f0, h0: 3.1, h1: 3.6 },
          { kind: 'temple',     solo: true, d: 30, col: 0x484f66, scale: 0.4 },
          { kind: 'stormcloud', sp: 13,  d: 30,  col: 0x3e4868, y0: 9, y1: 13, bolt: 0.4 },
          { kind: 'stormcloud', sp: 14,  d: 46,  col: 0x353e5c, y0: 8, y1: 11, bolt: 0.5 },
          { kind: 'mountains',  sp: 8,   d: 68,  col: 0x384060, snow: true, cap: 0xd8e0f0, h0: 2.3, h1: 2.9 },
          { kind: 'stormcloud', sp: 15,  d: 68,  col: 0x2e3654, y0: 6, y1: 8, bolt: 0.5 }
        ]
      }
    }
  });

  /* 27 - THE FORGE OF HEPHAESTUS. Inside a volcano: anvils the size of houses,
     a bronze man half made and still on its scaffold, chains and pulleys, and a
     canal of lava going by underfoot. */
  define({
    depth: 27, key: 'm27_forge', label: 'The Forge of Hephaestus', flavor: 'plain', floorBoss: 'talos', closed: true,
    palette: {
      pal: { D: '#5a3a2a', d: '#301c14', g: '#a06a44', G: '#e0a070' }, doorStyle: 'gate',
      sky: ['#240a04', '#0e0402'], light: '#ff9040', darkness: 0.68, lightRadius: 72, dust: '#a05a30'
    },
    tiles: {
      wall: { tex: 'tile_volcanic', color: '#8a5a40' },
      top: { tex: 'tile_metal', color: '#b08050' },
      plat: { tex: 'tile_metal', color: '#8a6a44' }
    },
    theme: { fog: 0x1c0804, ambient: 0x7a3c24, hemiSky: 0x9a4a28, hemiGround: 0x241008, dir: 0xff8a3c, dirI: 0.54 },
    grade: { sat: 1.18, contrast: 1.1 },
    affinity: { magmacrab: 2.2, golem: 1.6, bomber: 1.4 },
    ambience: 'forge',
    roster: { automaton: 34, magmacrab: 26, golem: 22, bomber: 18 },
    backdrop: {
      curve: { gain: 0.34, warm: 0.42 },
      hero: { kind: 'dome', col: 0xff5a1c, core: 0xffd0a0, edge: 0xa02008, az: 0.5, elev: 6.0, r: 4.6,
              halos: [1.5, 2.6], rays: 12, fan: 12, glow: 0.5, gain: 1.0 },
      recipe: {
        tex: 'basalt', ceiling: { y: 14, col: 0x0c0402 },
        skyGlow: 0.55, haze: 0.7, ground: 0x0e0503,
        ember: { sp: 2.4, size: 0.11, alpha: 0.5, col: 0xff8a3c },
        motes: { col: 0xff8a3c, size: 0.2, alpha: 0.45, rise: 0.55 },
        water: { d0: 9, col: 0x4a1004, lava: true },
        layers: [
          { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x2a1208, s0: 0.3, s1: 1.0 },
          { kind: 'anvil',     sp: 22, d: 7.5, col: 0x2a140c },
          { kind: 'bigchain',  sp: 20, d: 7.5, col: 0x30180e, hang: true, l0: 8, l1: 20 },
          { kind: 'automaton', sp: 36, d: 12, col: 0x3a1c0e },
          { kind: 'furnace',   sp: 40, d: 19, col: 0x2a1208 },
          { kind: 'anvil',     solo: true, d: 30, col: 0x22100a, scale: 2.4 },
          { kind: 'spires',    sp: 5.0, d: 46, col: 0x1a0c06, h0: 2.4, h1: 3.6 },
          { kind: 'bigchain',  sp: 30, d: 46, col: 0x1e0e08, hang: true, l0: 12, l1: 30 }
        ]
      }
    }
  });

  /* 28 - THE GOLDEN HALLS. A hall of twelve thrones, each one taller than a
     tower, standing in a floor of cloud under a dome of gold. */
  define({
    depth: 28, key: 'm28_golden', label: 'The Golden Halls', flavor: 'plain', closed: true,
    palette: {
      pal: { D: '#c8b070', d: '#8a7440', g: '#f0dc9a', G: '#fff4c8' }, doorStyle: 'arch',
      sky: ['#3a3016', '#181206'], light: '#ffe890', darkness: 0.52, lightRadius: 86, dust: '#f0dc9a'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#eadcaa' },
      top: { tex: 'tile_pavelarge', color: '#f4e8bc' },
      plat: { tex: 'tile_metal', color: '#c8a860' }
    },
    theme: { fog: 0x241c08, ambient: 0x8a7844, hemiSky: 0xb8a468, hemiGround: 0x2c240e, dir: 0xffe890, dirI: 0.62 },
    grade: { sat: 1.1 },
    affinity: { shielder: 1.6, cultist: 1.3 },
    ambience: 'golden',
    roster: { cyclops: 34, hoplite: 28, shielder: 16, cultist: 14, satyr: 8 },
    backdrop: {
      curve: { gain: 0.5, warm: 0.42 },
      hero: { kind: 'crown', col: 0xffe070, core: 0xfffbe0, edge: 0xd09a20, az: 0.5, elev: 8.0, r: 3.2,
              halos: [1.5, 2.6], rays: 18, ring: true, fan: 14, glow: 0.42, gain: 1.0 },
      recipe: {
        tex: 'gild', ceiling: { y: 18, col: 0x2a2008 },
        skyGlow: 0.66, haze: 0.72, ground: 0x2a2008,
        motes: { col: 0xffe890, size: 0.3, alpha: 0.5, rise: 0.2 },
        layers: [
          { kind: 'cloudsea', sp: 5, d: 12, col: 0xd8c890, cap: 0xfff4d0, y0: -0.4, y1: 0.4 },
          { kind: 'thrones',  sp: 15, d: 7.5, col: 0x8a7440, h0: 9, h1: 12 },
          { kind: 'colonnade', sp: 22, d: 12, col: 0x7a6634, style: 'ionic', cols: 4, h0: 8, h1: 11 },
          { kind: 'thrones',  sp: 17, d: 19, col: 0x76622e, h0: 10, h1: 13 },
          { kind: 'arches',   sp: 5.0, d: 30, col: 0x5a4a20, h0: 2.8, h1: 3.6 },
          { kind: 'thrones',  sp: 19, d: 46, col: 0x54441a, h0: 10, h1: 13 },
          { kind: 'columns',  sp: 3.8, d: 68, col: 0x3e3212, h0: 2.0, h1: 2.6 }
        ]
      }
    }
  });

  /* 29 - THE TEMPLE OF APOLLO. Columns too bright to look at, a temple under
     a sun three times the size of any other, and the chariot that carries it
     standing at the top of the stair. */
  define({
    depth: 29, key: 'm29_apollo', label: 'The Temple of Apollo', flavor: 'carved',
    palette: {
      pal: { D: '#d0c090', d: '#8e7c4c', g: '#f4e4a8', G: '#fffbe0' }, doorStyle: 'arch',
      sky: ['#4a3a1a', '#1c1408'], light: '#fff0a0', darkness: 0.46, lightRadius: 90, dust: '#f4e4a8'
    },
    tiles: {
      wall: { tex: 'tile_limestone', color: '#f0e2b4' },
      top: { tex: 'tile_marble', color: '#fbf0c8' },
      plat: { tex: 'tile_metal', color: '#d0b068' }
    },
    theme: { fog: 0x2c220c, ambient: 0x94804c, hemiSky: 0xc4b070, hemiGround: 0x34280e, dir: 0xfff0a8, dirI: 0.72 },
    grade: { sat: 1.1, contrast: 1.04 },
    affinity: { cultist: 1.8, shielder: 1.2, harpy: 1.4 },
    ambience: 'golden',
    roster: { sunpriest: 28, griffin: 20, cultist: 22, centaur: 16, hoplite: 14 },
    backdrop: {
      curve: { gain: 0.72, warm: 0.44 },
      hero: { kind: 'sun', col: 0xfff0a0, core: 0xffffff, edge: 0xf0b830, az: 0.5, elev: 10.0, r: 9.0,
              halos: [1.5, 2.6], rays: 20, fan: 18, glow: 0.5, gain: 1.05 },
      recipe: {
        tex: 'gild', skyGlow: 1.0, haze: 0.86, ground: 0x342a10,
        motes: { col: 0xfff0a0, size: 0.28, alpha: 0.45, rise: 0.3 },
        layers: [
          { kind: 'colonnade', sp: 24, d: 4.5, col: 0x8a7638, style: 'doric', cols: 4, h0: 5, h1: 6.5 },
          { kind: 'temple',    sp: 50, d: 7.5, col: 0x7a6830 },
          { kind: 'colonnade', sp: 26, d: 12,  col: 0x6a5a28, style: 'ionic', cols: 5, h0: 5, h1: 7 },
          { kind: 'chariot',   solo: true, d: 19, col: 0x5a4c22, scale: 1.3 },
          { kind: 'temple',    sp: 46, d: 30,  col: 0x54461e },
          { kind: 'mountains', sp: 9,  d: 46,  col: 0x6a5a30, h0: 2.4, h1: 3.0 },
          { kind: 'mountains', sp: 8,  d: 68,  col: 0x7a6a3c, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 30 - THE THRONE OF ZEUS. The top of the world above the storm: the king of
     the gods, seated, twice the height of anything else in the run, thunder
     rolling round his knees and a sun that is only a ring. */
  define({
    depth: 30, key: 'm30_zeus', label: 'The Throne of Zeus', flavor: 'boss',
    palette: {
      pal: { D: '#8a90a8', d: '#525872', g: '#c4cadc', G: '#f2f4fc' }, doorStyle: 'gate',
      sky: ['#161a30', '#080a18'], light: '#ffe890', darkness: 0.56, lightRadius: 82, dust: '#c4cadc'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#b4bad0' },
      top: { tex: 'tile_pavelarge', color: '#d0d6ea' },
      plat: { tex: 'tile_metal', color: '#c0a860' }
    },
    theme: { fog: 0x262c48, ambient: 0x8a92b4, hemiSky: 0xaab4d4, hemiGround: 0x3a4062, dir: 0xffe8a0, dirI: 0.78 },
    grade: { sat: 1.1, contrast: 1.1 },
    affinity: {},
    ambience: 'zeus',
    roster: { stormspirit: 40, griffin: 30, sunpriest: 30 },
    backdrop: {
      curve: { gain: 0.78, warm: 0.3 },
      hero: { kind: 'eclipse', col: 0xffe090, core: 0x14162c, edge: 0xffc860, az: 0.5, elev: 12.0, r: 6.0,
              halos: [1.5, 2.6], ring: true, fan: 16, glow: 0.42, gain: 1.0 },
      recipe: {
        tex: 'marble', skyGlow: 0.8, haze: 0.8, ground: 0x1a1e34, fill: 0.7,
        stars: { sp: 1.6, size: 0.13, alpha: 0.5 },
        motes: { col: 0xd8e4ff, size: 0.22, alpha: 0.4, rise: -0.4 },
        layers: [
          { kind: 'colonnade',  sp: 28, d: 4.5, col: 0xa0a4ba, cols: 3, h0: 5, h1: 6.5 },
          { kind: 'statue',     solo: true, d: 12, col: 0xc8ccde, h0: 22, h1: 26 },
          { kind: 'stormcloud', sp: 12, d: 19,  col: 0xa4a8ba, y0: 3, y1: 6, bolt: 0.5 },
          { kind: 'stormcloud', sp: 13, d: 30,  col: 0x9a9eb2, y0: 5, y1: 9, bolt: 0.5 },
          { kind: 'thrones',    sp: 40, d: 30,  col: 0xa0a4b8, h0: 12, h1: 16 },
          { kind: 'stormcloud', sp: 14, d: 46,  col: 0x9096ac, y0: 4, y1: 8, bolt: 0.6 },
          { kind: 'stormcloud', sp: 15, d: 68,  col: 0x868ca6, y0: 3, y1: 6, bolt: 0.6 }
        ]
      }
    }
  });
})(window.DS);
