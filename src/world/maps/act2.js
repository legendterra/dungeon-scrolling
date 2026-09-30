/* Act II: the drowned deep. Ten places under the earth of the first act: black
   caves that drip, mangroves and fens, a stair going down into a sunk city, a
   ceiling of glow-worms, a court of judges, a nest, a black lake, a frozen
   cavern and the hollow where a wyrm died.

   Same rules as act1.js: a place is one entry; a closed place has a roof (its
   hangings are rooted in it) or a wall (its far world arrives through openings). */
(function (DS) {
  'use strict';
  if (!DS.Maps) return;
  const define = DS.Maps.define;

  /* 11 - THE WET DARK. Black rock streaming with water, rain falling through
     cracks in the roof, and almost no light but your own lamp. */
  define({
    depth: 11, key: 'm11_wetdark', label: 'The Wet Dark', flavor: 'carved', closed: true,
    palette: {
      pal: { D: '#34444a', d: '#1c262a', g: '#5a7078', G: '#8aa0a8' }, doorStyle: 'cave',
      sky: ['#06121a', '#02070a'], light: '#8ab8d0', darkness: 0.80, lightRadius: 64, dust: '#4a6870'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#48606a' },
      top: { tex: 'tile_slate', color: '#66808a' },
      plat: { tex: 'tile_planksold', color: '#4a4034' }
    },
    theme: { fog: 0x040a0c, ambient: 0x2a4048, hemiSky: 0x38545c, hemiGround: 0x0c1418, dir: 0x8ab0c0, dirI: 0.30 },
    grade: { gamma: 1.06 },
    affinity: { spider: 1.6, wraith: 1.4, zombie: 1.2, spitter: 1.2 },
    ambience: 'wet',
    roster: { eel: 32, spider: 22, wraith: 18, bat: 12, zombie: 8 },
    backdrop: {
      curve: { gain: 0.24, warm: 0.2 },
      hero: { kind: 'shaft', col: 0x6aa0b8, core: 0xe0f4ff, edge: 0x2a4a5a, az: 0.5, elev: 6.2, r: 3.0,
              halos: [1.7, 3.0], shafts: 2, fan: 8, glow: 0.2, gain: 0.6 },
      recipe: {
        tex: 'wetrock', ceiling: { y: 10.5, col: 0x03080a },
        skyGlow: 0.4, haze: 0.6, ground: 0x04090b,
        mist: { sp: 3.4, size: 0.2, alpha: 0.12, col: 0x5a8898 },
        motes: { col: 0xa0c8d8, size: 0.18, alpha: 0.5, rise: -1.4, drift: 0.05 },
        water: { d0: 10, col: 0x04141c },
        layers: [
          { kind: 'rubble',      sp: 2.2, d: 4.5, col: 0x1a2e36, s0: 0.25, s1: 0.9 },
          { kind: 'stalactites', sp: 2.0, d: 7.5, col: 0x142228, h0: 1.6, h1: 3.4 },
          { kind: 'spires',      sp: 3.6, d: 12,  col: 0x101c22, h0: 2.2, h1: 3.8 },
          { kind: 'waterfall',   sp: 14,  d: 19,  col: 0x0c181e, h0: 3.0, h1: 4.0, flow: true, glowCol: 0x8ab8d0 },
          { kind: 'stalactites', sp: 2.4, d: 19,  col: 0x0e1a20, h0: 1.6, h1: 3.2 },
          { kind: 'colossus',    solo: true, d: 30, col: 0x0a1418, scale: 0.42 },
          { kind: 'spires',      sp: 4.4, d: 46,  col: 0x0a1418, h0: 2.2, h1: 3.4 },
          { kind: 'stalactites', sp: 2.6, d: 68,  col: 0x081014, h0: 1.4, h1: 3.0 }
        ]
      }
    }
  });

  /* 12 - THE MIRE. Mangroves standing on their roots in green water at dusk,
     mist, fireflies, and lily pads you could lie down on. */
  define({
    depth: 12, key: 'm12_mire', label: 'The Mire', flavor: 'flooded',
    palette: {
      pal: { D: '#3e5040', d: '#28352a', g: '#6a8860', G: '#a0c088' }, doorStyle: 'cave',
      sky: ['#0c1a10', '#050c07'], light: '#b8e890', darkness: 0.70, lightRadius: 68, dust: '#6a8a58'
    },
    tiles: {
      wall: { tex: 'tile_mossbrick', color: '#5a7050' },
      top: { tex: 'tile_mud', color: '#6a8058' },
      plat: { tex: 'tile_planksold', color: '#5a5038' }
    },
    theme: { fog: 0x0a1a10, ambient: 0x3e5e44, hemiSky: 0x5a8a5a, hemiGround: 0x101a10, dir: 0xc8e890, dirI: 0.40 },
    affinity: { spitter: 1.6, bomber: 1.4, zombie: 1.2, slime: 1.2 },
    ambience: 'swamp',
    roster: { mosquito: 28, spitter: 22, frogshaman: 20, bomber: 14, zombie: 12 },
    backdrop: {
      like: 'swamp', variant: 'mire',
      hero: { col: 0xc8f0a0, core: 0xf8ffe8, edge: 0x5a8a3c },
      recipe: {
        layers: [
          { kind: 'lilies',    sp: 5.5, d: 4.5, col: 0x142a10 },
          { kind: 'mangrove',  sp: 7.5, d: 7.5, col: 0x2a4a1e, h0: 2.2, h1: 3.6 },
          { kind: 'mangrove',  sp: 6.0, d: 12,  col: 0x264418, h0: 2.6, h1: 4.0 },
          { kind: 'reeds',     sp: 1.8, d: 12,  col: 0x10200a },
          { kind: 'islets', foam: true, sp: 7.0, d: 19, col: 0x14220f, h0: 2.2, h1: 3.2, cap: 0x3a5a24 },
          { kind: 'mangrove',  solo: true, d: 30, col: 0x0e1c08, h0: 5.5, h1: 6.5, scale: 1.6 },
          { kind: 'pines',     sp: 2.6, d: 46, col: 0x182a16, accent: 0x141a0e, h0: 2.2, h1: 2.8 },
          { kind: 'mountains', sp: 10,  d: 68, col: 0x1e2c20, h0: 2.2, h1: 2.7 }
        ]
      }
    }
  });

  /* 13 - THE DROWNED STAIR. A stair spiralling down a well into a city under
     the water: the light comes down the well's mouth, far above. */
  define({
    depth: 13, key: 'm13_drownedstair', label: 'The Drowned Stair', flavor: 'flooded', closed: true,
    palette: {
      pal: { D: '#3a5460', d: '#243642', g: '#6890a0', G: '#a4ccd8' }, doorStyle: 'arch',
      sky: ['#071620', '#030b12'], light: '#a0e4ff', darkness: 0.72, lightRadius: 68, dust: '#5a8ea0'
    },
    tiles: {
      wall: { tex: 'tile_limestone', color: '#5f7a86' },
      top: { tex: 'tile_pavelarge', color: '#7e9ca8' },
      plat: { tex: 'tile_planksold', color: '#4a5a58' }
    },
    theme: { fog: 0x061420, ambient: 0x386884, hemiSky: 0x4a8aac, hemiGround: 0x0e1e28, dir: 0xa0e4ff, dirI: 0.42 },
    grade: { sat: 1.04, gamma: 1.04 },
    affinity: { wraith: 1.4, icewisp: 1.6, zombie: 1.2, harpy: 1.4 },
    ambience: 'wet',
    roster: { drownedknight: 28, harpy: 22, icewisp: 20, wraith: 18, shielder: 8 },
    backdrop: {
      like: 'flooded', variant: 'stair',
      curve: { gain: 0.32, warm: 0.3 },
      hero: { kind: 'shaft', col: 0xb8f0ff, core: 0xf6fdff, edge: 0x2f7ea0, az: 0.5, elev: 6.2, r: 3.2,
              halos: [1.7, 3.0], shafts: 4, fan: 12, glow: 0.34, gain: 0.9 },
      recipe: {
        ceiling: { y: 13, col: 0x05121a }, stars: null, skyGlow: 0.55, haze: 0.66,
        layers: [
          { kind: 'ice',        sp: 5.5, d: 4.5, col: 0x2f5c72, h0: 0.8, h1: 1.6 },
          { kind: 'arches',     sp: 5.0, d: 7.5, col: 0x173646, h0: 2.6, h1: 3.6 },
          { kind: 'spiralstair', solo: true, d: 12, col: 0x12303f, h: 24, r: 5.2, steps: 46 },
          { kind: 'waterfall',  sp: 16,  d: 19,  col: 0x12303f, h0: 3.0, h1: 4.0, flow: true, glowCol: 0xaee8ff },
          { kind: 'ruins',      sp: 7,   d: 19,  col: 0x10283a, h0: 2.8, h1: 3.4 },
          { kind: 'drownedtemple', solo: true, d: 30, col: 0x0e2230, scale: 0.5 },
          { kind: 'arches',     sp: 6.0, d: 46,  col: 0x0c1e2a, h0: 2.2, h1: 3.0 },
          { kind: 'columns',    sp: 4.0, d: 68,  col: 0x0a1a24, h0: 2.0, h1: 2.6 }
        ]
      }
    }
  });

  /* 14 - THE GLOWWORM CAVES. The roof is hung with threads of light like a
     starry sky, and a lake as still as glass under it says everything twice. */
  define({
    depth: 14, key: 'm14_glowworm', label: 'The Glowworm Caves', flavor: 'carved', closed: true,
    palette: {
      pal: { D: '#2e4a56', d: '#1a2e38', g: '#4e8098', G: '#88c0d8' }, doorStyle: 'cave',
      sky: ['#04101a', '#02070d'], light: '#70c0f0', darkness: 0.76, lightRadius: 66, dust: '#4a80a0'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#3e6478' },
      top: { tex: 'tile_slate', color: '#5c8498' },
      plat: { tex: 'tile_planksold', color: '#4a4a44' }
    },
    theme: { fog: 0x04101a, ambient: 0x244860, hemiSky: 0x2c5a78, hemiGround: 0x08141c, dir: 0x60b0e0, dirI: 0.30 },
    grade: { sat: 1.1, gamma: 1.05 },
    affinity: { spider: 1.5, icewisp: 1.5, bat: 1.3 },
    ambience: 'cave',
    roster: { glowworm: 30, spider: 26, icewisp: 20, bat: 14 },
    backdrop: {
      curve: { gain: 0.26, warm: 0.26 },
      hero: { kind: 'sigil', col: 0x60b8f0, core: 0xe0f4ff, edge: 0x1a5a8a, az: 0.5, elev: 6.2, r: 3.2,
              halos: [1.7, 3.0], ring: true, fan: 10, glow: 0.3, gain: 0.8 },
      recipe: {
        tex: 'wetrock', ceiling: { y: 11, col: 0x040a12 },
        skyGlow: 0.45, haze: 0.62, ground: 0x050d16,
        mist: { sp: 3.6, size: 0.2, alpha: 0.14, col: 0x4a86b0 },
        motes: { col: 0x8ad0ff, size: 0.2, alpha: 0.4, rise: 0.15 },
        water: { d0: 9, col: 0x0a2a44 },
        layers: [
          { kind: 'rubble',      sp: 2.2, d: 4.5, col: 0x182c3c, s0: 0.25, s1: 0.9 },
          { kind: 'glowthreads', sp: 3.2, d: 4.5, col: 0x14243a, glowCol: 0x60c0ff, hang: true, l0: 1.5, l1: 6.5 },
          { kind: 'stalactites', sp: 2.4, d: 7.5, col: 0x142236, h0: 1.4, h1: 3.0 },
          { kind: 'glowthreads', sp: 3.0, d: 7.5, col: 0x12203a, glowCol: 0x70c8ff, hang: true, l0: 2, l1: 8 },
          { kind: 'spires',      sp: 4.0, d: 12,  col: 0x101c2c, h0: 2.2, h1: 3.6 },
          { kind: 'glowthreads', sp: 3.4, d: 19,  col: 0x0e1a2c, glowCol: 0x60b8f0, hang: true, l0: 2, l1: 9 },
          { kind: 'crystals',    sp: 5.0, d: 30,  col: 0x3a80c0, glow: true, alpha: 0.55, s0: 0.5, s1: 1.2 },
          { kind: 'glowthreads', sp: 3.6, d: 46,  col: 0x0c1826, glowCol: 0x58b0ea, hang: true, l0: 2, l1: 10 },
          { kind: 'spires',      sp: 5.0, d: 68,  col: 0x0a1420, h0: 2.0, h1: 3.2 }
        ]
      }
    }
  });

  /* 15 - THE ARBITER'S COURT. A hall of white stone under tall windows, a bench
     of stone judges along the walls, and the scales that will weigh you. */
  define({
    depth: 15, key: 'm15_arbiter', label: 'The Arbiter\'s Court', flavor: 'boss', closed: true,
    palette: {
      pal: { D: '#6a6478', d: '#484258', g: '#a8a0c0', G: '#e0daf0' }, doorStyle: 'arch',
      sky: ['#1e1830', '#0c0a18'], light: '#ffe0a0', darkness: 0.62, lightRadius: 78, dust: '#a8a0c0'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#8a86a0' },
      top: { tex: 'tile_pavelarge', color: '#a8a4c0' },
      plat: { tex: 'tile_metal', color: '#8a7a5a' }
    },
    theme: { fog: 0x14101e, ambient: 0x6a6480, hemiSky: 0x8a86a6, hemiGround: 0x22202c, dir: 0xffe6b0, dirI: 0.58 },
    affinity: {},
    ambience: 'hall',
    backdrop: {
      curve: { gain: 0.5, warm: 0.36 },
      hero: { kind: 'sun', col: 0xffd890, core: 0xfffbe8, edge: 0xd09030, az: 0.5, elev: 9.0, r: 5.6,
              halos: [1.5, 2.6], rays: 12, fan: 14, glow: 0.44, gain: 1.0 },
      recipe: {
        tex: 'marble', skyGlow: 0.95, haze: 0.66, ground: 0x14121c,
        motes: { col: 0xffe0a0, size: 0.26, alpha: 0.45, rise: 0.2 },
        layers: [
          { kind: 'statue',  sp: 16, d: 4.5, col: 0x54506a, h0: 8, h1: 9.5 },
          { kind: 'wall',    d: 8, col: 0x4a4660, cell: 6, jitter: 0.4,
            openings: { every: 22, first: 11, w: 8, h: 20, y0: 2, shape: 'arch' } },
          { kind: 'scales',  solo: true, d: 12, col: 0x3c3852 },
          { kind: 'columns', sp: 4.0, d: 19, col: 0x2c2840, h0: 3, h1: 4 },
          { kind: 'arches',  sp: 5.0, d: 30, col: 0x282438, h0: 2.6, h1: 3.4 },
          { kind: 'ruins',   sp: 8, d: 46, col: 0x201c30, h0: 2.4, h1: 3.0 },
          { kind: 'mountains', sp: 9, d: 68, col: 0x2a2640, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 16 - THE SINKING FEN. A village on stilts leaning into the water, a bell
     tower with a list, lanterns in the windows and a low moon. */
  define({
    depth: 16, key: 'm16_sinkingfen', label: 'The Sinking Fen', flavor: 'plain',
    palette: {
      pal: { D: '#5a5a3a', d: '#3a3a26', g: '#8a8a58', G: '#c0c088' }, doorStyle: 'cave',
      sky: ['#161c0c', '#080b05'], light: '#ffc878', darkness: 0.70, lightRadius: 70, dust: '#7a7a48'
    },
    tiles: {
      wall: { tex: 'tile_planksold', color: '#7a7448' },
      top: { tex: 'tile_mud', color: '#8a8656' },
      plat: { tex: 'tile_planksold', color: '#6a5a3a' }
    },
    theme: { fog: 0x111a0a, ambient: 0x585a36, hemiSky: 0x7a8248, hemiGround: 0x181a0c, dir: 0xffc878, dirI: 0.44 },
    affinity: { zombie: 1.5, wraith: 1.4, necromancer: 1.2, spitter: 1.2 },
    ambience: 'swamp',
    roster: { drowner: 30, wraith: 22, zombie: 20, necromancer: 14, spitter: 8 },
    backdrop: {
      like: 'swamp', variant: 'fen',
      recipe: {
        layers: [
          { kind: 'reeds',      sp: 1.6, d: 4.5, col: 0x121a08 },
          { kind: 'stilthouse', sp: 18,  d: 7.5, col: 0x18220c },
          { kind: 'broadleaf',  sp: 4.0, d: 7.5, col: 0x1c2a10, accent: 0x1c180c, h0: 2.6, h1: 3.6 },
          { kind: 'stilthouse', sp: 14,  d: 12,  col: 0x14200a },
          { kind: 'trees',      sp: 3.4, d: 12,  col: 0x182410, bare: true, h0: 2.6, h1: 3.6 },
          { kind: 'broadleaf',  sp: 3.2, d: 19,  col: 0x182610, accent: 0x181a0c, h0: 2.8, h1: 3.4 },
          { kind: 'belltower',  solo: true, d: 30, col: 0x121806, scale: 0.9 },
          { kind: 'castle',     sp: 40,  d: 46,  col: 0x1c2414, h0: 2.3, h1: 2.9, glowCol: 0xffc070 },
          { kind: 'mountains',  sp: 10,  d: 68,  col: 0x2a2e1c, h0: 2.1, h1: 2.6 }
        ]
      }
    }
  });

  /* 17 - THE BROOD NEST. Webs hung between the pillars, egg sacs glowing green
     from inside, and the picked bones of the queen who made all of it. */
  define({
    depth: 17, key: 'm17_broodnest', label: 'The Brood Nest', flavor: 'carved', closed: true,
    palette: {
      pal: { D: '#4a3c3a', d: '#2c2426', g: '#7a6a58', G: '#b0a088' }, doorStyle: 'cave',
      sky: ['#14180a', '#080a04'], light: '#a8e050', darkness: 0.74, lightRadius: 66, dust: '#8a8a48'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#66584c' },
      top: { tex: 'tile_slate', color: '#86786a' },
      plat: { tex: 'tile_planksold', color: '#5a4a3a' }
    },
    theme: { fog: 0x0c1206, ambient: 0x3a4a2a, hemiSky: 0x506a38, hemiGround: 0x10140a, dir: 0xa8e050, dirI: 0.34 },
    grade: { sat: 1.1 },
    affinity: { spider: 2.2, bat: 1.2, harpy: 1.2 },
    ambience: 'cave',
    roster: { eggsac: 34, spider: 30, bat: 10 },
    backdrop: {
      curve: { gain: 0.28, warm: 0.3 },
      hero: { kind: 'sigil', col: 0x9ae040, core: 0xf0ffd0, edge: 0x4a7a10, az: 0.5, elev: 6.2, r: 3.2,
              halos: [1.7, 3.0], ring: true, fan: 10, glow: 0.3, gain: 0.82 },
      recipe: {
        tex: 'bone', ceiling: { y: 10.5, col: 0x080a04 },
        skyGlow: 0.42, haze: 0.62, ground: 0x0a0c06,
        mist: { sp: 3.4, size: 0.2, alpha: 0.12, col: 0x7a9a3a },
        motes: { col: 0xb8f060, size: 0.22, alpha: 0.4, rise: 0.2 },
        layers: [
          { kind: 'eggs',      sp: 4.5, d: 4.5, col: 0x3a3a1c, cap: 0xc8d878, glowCol: 0x9ae040 },
          { kind: 'webs',      sp: 6.0, d: 4.5, col: 0x2a2a1a, cap: 0xc8c8b0, hang: true, w0: 4, w1: 8 },
          { kind: 'stalactites', sp: 2.4, d: 7.5, col: 0x202410, h0: 1.4, h1: 3.0 },
          { kind: 'webs',      sp: 5.0, d: 7.5, col: 0x24281a, cap: 0xc8c8b0, hang: true, w0: 5, w1: 10 },
          { kind: 'eggs',      sp: 5.5, d: 12, col: 0x323418, cap: 0xb8c868, glowCol: 0x9ae040 },
          { kind: 'spires',    sp: 4.0, d: 19, col: 0x181c0c, h0: 2.2, h1: 3.6 },
          { kind: 'skeleton',  solo: true, d: 30, col: 0x1a1c0e, ribs: 8, scale: 0.5 },
          { kind: 'webs',      sp: 6.0, d: 46, col: 0x181c10, cap: 0xb8b8a0, hang: true, w0: 6, w1: 12 },
          { kind: 'crystals',  sp: 6.0, d: 68, col: 0x6aa028, glow: true, alpha: 0.5, s0: 0.7, s1: 1.4 }
        ]
      }
    }
  });

  /* 18 - THE BLACK LAKE. A lake too wide to see across, a ruined temple on an
     island, and pale lamps that hang over the water where no one holds them. */
  define({
    depth: 18, key: 'm18_blacklake', label: 'The Black Lake', flavor: 'flooded',
    palette: {
      pal: { D: '#28404e', d: '#16242e', g: '#4a7088', G: '#80a8c0' }, doorStyle: 'arch',
      sky: ['#050e16', '#02060b'], light: '#a0d8f0', darkness: 0.78, lightRadius: 68, dust: '#4a6e84'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#3e5868' },
      top: { tex: 'tile_slate', color: '#5c7888' },
      plat: { tex: 'tile_planksold', color: '#3e4a4a' }
    },
    theme: { fog: 0x050e16, ambient: 0x2a4c62, hemiSky: 0x3a6a88, hemiGround: 0x0a141c, dir: 0x9ad0ee, dirI: 0.34 },
    grade: { sat: 1.04, gamma: 1.05 },
    affinity: { wraith: 1.6, piranha: 1.2, cultist: 1.2 },
    ambience: 'wet',
    roster: { lakespirit: 26, wraith: 26, cultist: 20, icewisp: 10, drownedknight: 10 },
    backdrop: {
      like: 'flooded', variant: 'black lake',
      recipe: {
        layers: [
          { kind: 'rubble',     sp: 2.6, d: 4.5, col: 0x1c3444, s0: 0.25, s1: 0.9 },
          { kind: 'ghostlamps', sp: 6.0, d: 7.5, col: 0x9ad0ee, y0: 2.5, y1: 7 },
          { kind: 'islets', foam: true, sp: 6.5, d: 12, col: 0x12222e, h0: 1.8, h1: 3.2 },
          { kind: 'ghostlamps', sp: 8.0, d: 12, col: 0x9ad0ee, y0: 3, y1: 8 },
          { kind: 'ruins',      sp: 9,   d: 19,  col: 0x10202c, h0: 2.8, h1: 3.4 },
          { kind: 'monolith',   solo: true, d: 30, col: 0x0e1c28, scale: 0.45 },
          { kind: 'islets', foam: true, sp: 9, d: 46, col: 0x142432, h0: 2.2, h1: 2.9 },
          { kind: 'mountains',  sp: 9,   d: 68,  col: 0x182c3e, h0: 2.2, h1: 2.8 }
        ]
      }
    }
  });

  /* 19 - THE FROST CAVES. A cavern of blue ice: frozen waterfalls, icicles as
     long as pillars, something old sleeping in the wall, and a moon's aurora
     coming down through the roof. */
  define({
    depth: 19, key: 'm19_frostcaves', label: 'The Frost Caves', flavor: 'carved', closed: true,
    palette: {
      pal: { D: '#5a7a92', d: '#3a566c', g: '#9ac0dc', G: '#d8f0ff' }, doorStyle: 'cave',
      sky: ['#0a1a28', '#040a12'], light: '#c8f0ff', darkness: 0.66, lightRadius: 74, dust: '#a8d0e8'
    },
    tiles: {
      wall: { tex: 'tile_rock', color: '#8ab0cc' },
      top: { tex: 'tile_marble', color: '#b8d8ec' },
      plat: { tex: 'tile_planksold', color: '#7a8a96' }
    },
    theme: { fog: 0x0a1824, ambient: 0x6a90b0, hemiSky: 0x88b8d8, hemiGround: 0x1a2c3c, dir: 0xc8f0ff, dirI: 0.50 },
    grade: { sat: 1.06, gamma: 1.03 },
    affinity: { icewisp: 2.0, golem: 1.4, wraith: 1.2 },
    ambience: 'ice',
    roster: { trollice: 32, icewolf: 28, icewisp: 24, golem: 14 },
    backdrop: {
      curve: { gain: 0.4, warm: 0.2 },
      hero: { kind: 'moon', col: 0xb0e8ff, core: 0xffffff, edge: 0x5a90c0, az: 0.48, elev: 8.0, r: 5.0,
              halos: [1.5, 2.5], aurora: true, fan: 10, glow: 0.34, gain: 1.0 },
      recipe: {
        tex: 'ceramic', ceiling: { y: 11, col: 0x0a1c2c },
        skyGlow: 0.6, haze: 0.7, ground: 0x0c1c2a,
        mist: { sp: 3.2, size: 0.22, alpha: 0.14, col: 0xa8d8f0 },
        motes: { col: 0xd8f4ff, size: 0.2, alpha: 0.4, rise: -0.3 },
        water: { d0: 12, col: 0x123a58 },
        layers: [
          { kind: 'ice',         sp: 4.5, d: 4.5, col: 0x5a8cae, h0: 0.8, h1: 1.8 },
          { kind: 'icefall',     sp: 12,  d: 7.5, col: 0x7ab0d0, cap: 0xeaf8ff, h0: 6, h1: 10 },
          { kind: 'stalactites', sp: 2.2, d: 7.5, col: 0x5a90b4, h0: 1.8, h1: 3.8 },
          { kind: 'ice',         sp: 5.5, d: 12,  col: 0x4a7ca0, h0: 1.4, h1: 2.6 },
          { kind: 'icefall',     sp: 16,  d: 19,  col: 0x5a90b4, cap: 0xdcf0ff, h0: 7, h1: 12 },
          { kind: 'bones',       solo: true, d: 30, col: 0x3a6a90, scale: 0.4 },
          { kind: 'stalactites', sp: 2.6, d: 46,  col: 0x3a6a90, h0: 1.6, h1: 3.4 },
          { kind: 'mountains',   sp: 9,   d: 68,  col: 0x3a6488, snow: true, cap: 0xdcf0ff, h0: 2.2, h1: 2.8 }
        ]
      }
    }
  });

  /* 20 - THE WYRM'S HOLLOW. A glacier hall built round the skeleton of a wyrm
     older than the ice, the aurora burning green through the thin roof. */
  define({
    depth: 20, key: 'm20_wyrmhollow', label: 'The Wyrm\'s Hollow', flavor: 'boss', closed: true,
    palette: {
      pal: { D: '#4a6a86', d: '#2c4660', g: '#88b0d0', G: '#cce8ff' }, doorStyle: 'arch',
      sky: ['#06182a', '#020a14'], light: '#9af0ff', darkness: 0.66, lightRadius: 78, dust: '#88b8d8'
    },
    tiles: {
      wall: { tex: 'tile_rock', color: '#7aa2c2' },
      top: { tex: 'tile_marble', color: '#a4c8e4' },
      plat: { tex: 'tile_metal', color: '#7a8a9a' }
    },
    theme: { fog: 0x08182a, ambient: 0x5a86aa, hemiSky: 0x78b0d8, hemiGround: 0x142434, dir: 0xa8f0ff, dirI: 0.52 },
    affinity: {},
    ambience: 'ice',
    backdrop: {
      curve: { gain: 0.44, warm: 0.2 },
      hero: { kind: 'moon', col: 0x9af0d0, core: 0xf0fffa, edge: 0x2a8a7a, az: 0.5, elev: 10.0, r: 5.4,
              halos: [1.5, 2.5], aurora: true, fan: 12, glow: 0.4, gain: 1.0 },
      recipe: {
        tex: 'ceramic', skyGlow: 0.8, haze: 0.7, ground: 0x0a1a2a,
        stars: { sp: 1.4, size: 0.13, alpha: 0.6 },
        motes: { col: 0xcaf4ff, size: 0.22, alpha: 0.4, rise: -0.25 },
        layers: [
          { kind: 'icefall',  sp: 20, d: 4.5, col: 0x4a80a8, cap: 0xdcf0ff, h0: 6, h1: 9 },
          { kind: 'skeleton', solo: true, d: 8, col: 0x2c4a66, ribs: 9 },
          { kind: 'wall',     d: 14, col: 0x2c4a68, cell: 6, jitter: 0.5,
            openings: { every: 30, first: 15, w: 14, h: 14, y0: 12, shape: 'arch' } },
          { kind: 'icefall',  sp: 16, d: 19, col: 0x3a6a92, cap: 0xdcf0ff, h0: 8, h1: 12 },
          { kind: 'mountains', sp: 9, d: 30, col: 0x2a4e70, snow: true, cap: 0xdcf0ff, h0: 3.0, h1: 3.6 },
          { kind: 'mountains', sp: 9, d: 46, col: 0x2e5478, snow: true, cap: 0xe4f4ff, h0: 2.5, h1: 3.0 },
          { kind: 'mountains', sp: 8, d: 68, col: 0x34608a, snow: true, cap: 0xecf8ff, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });
})(window.DS);
