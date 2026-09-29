/* Act I: the descent to the earth. Ten places, each its own picture.

   Every depth used to be one of thirteen themes, picked by hashing the depth, so
   "The Rusted Prison" was a sandy hall under an orange furnace and two different
   caves both said THE CAVE MOUTH. Each place below is one DS.Maps entry (see
   src/world/maps.js for what the fields feed): its palette and masonry, its light
   rig, its horizon, its wildlife.

   Closed places do not get a sky. They get a WALL behind the level -- a grid of
   blocks filling the whole frame, top to bottom -- with the far world cut out of
   it as windows, slits and arches, so the light is something that arrives through
   an opening rather than something that hangs in the air. */
(function (DS) {
  'use strict';
  if (!DS.Maps) return;
  const define = DS.Maps.define;

  /* 1 - THE SHORE. Dusk on a stony beach: the low sun on the sea behind
     everything, sea stacks black against it, a wreck on the sand, headlands
     fading out, and a lighthouse on the farthest one. */
  define({
    depth: 1, key: 'm01_shore', label: 'The Shore', flavor: 'plain',
    palette: {
      pal: { D: '#7a6a52', d: '#5a4e3c', g: '#c8b48e', G: '#e8dcc0' }, doorStyle: 'arch',
      sky: ['#1c2b3a', '#0b141c'], light: '#ffe6a8', darkness: 0.50, lightRadius: 84, dust: '#c8b48e'
    },
    tiles: {
      wall: { tex: 'tile_sand', color: '#a8946e' },
      top: { tex: 'tile_pavelarge', color: '#c4b08a' },
      plat: { tex: 'tile_planksold', color: '#8a6a48' }
    },
    theme: { fog: 0x101c26, ambient: 0x64788a, hemiSky: 0x88a6c0, hemiGround: 0x2a3238, dir: 0xfff0cc, dirI: 0.62 },
    grade: { sat: 1.1 },
    affinity: { slime: 1.6, bat: 1.2 },
    roster: { crab: 36, slime: 26, gull: 14, bat: 10 },
    backdrop: {
      like: 'shore',
      recipe: {
        layers: [
          { kind: 'rubble',    sp: 2.6, d: 4.5, col: 0x2c2b28, s0: 0.25, s1: 0.9 },
          { kind: 'rubble',    sp: 3.2, d: 7.5, col: 0x2d3238, tex: 'wetrock', s0: 0.6, s1: 1.5 },
          { kind: 'islets', foam: true, sp: 6.5, d: 12, col: 0x262d36, tex: 'wetrock', h0: 1.4, h1: 2.8 },
          { kind: 'islets', foam: true, sp: 8.0, d: 19, col: 0x242c38, tex: 'wetrock', h0: 2.2, h1: 3.4, cap: 0x8fa070 },
          { kind: 'wreck',     solo: true, d: 30, col: 0x20283a, scale: 0.4 },
          { kind: 'lighthouse', sp: 60, d: 46, col: 0x28324a, h0: 9, h1: 12 },
          { kind: 'mountains', sp: 11, d: 46, col: 0x28324a, h0: 2.2, h1: 2.9 },
          { kind: 'mountains', sp: 9,  d: 68, col: 0x2e3a54, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 2 - THE CAVE MOUTH. You are standing inside the arch: a wall of cave rock
     behind you with great arches cut through it, and the sea, the stacks and the
     low sun beyond -- the only light there is. */
  define({
    depth: 2, key: 'm02_cavemouth', label: 'The Cave Mouth', flavor: 'carved', closed: true,
    palette: {
      pal: { D: '#3f5a58', d: '#2b403e', g: '#6a9490', G: '#a8ccc6' }, doorStyle: 'cave',
      sky: ['#0a1a1c', '#050c0e'], light: '#7fe8d8', darkness: 0.72, lightRadius: 70, dust: '#4a7d78'
    },
    tiles: {
      wall: { tex: 'tile_rock', color: '#5f827e' },
      top: { tex: 'tile_slate', color: '#88aca6' },
      plat: { tex: 'tile_planksold', color: '#6a5a44' }
    },
    theme: { fog: 0x0a1c1e, ambient: 0x3c6a68, hemiSky: 0x4c8c8e, hemiGround: 0x142220, dir: 0xffd9a0, dirI: 0.46 },
    grade: { gamma: 1.05 },
    affinity: { bat: 1.5, spider: 1.6, zombie: 1.2, spitter: 1.3 },
    roster: { sporeshroom: 28, bat: 22, zombie: 22, spitter: 14, slime: 8 },
    backdrop: {
      curve: { gain: 0.5, warm: 0.36 },
      hero: { kind: 'sun', col: 0xffc880, core: 0xfff0d0, edge: 0xe08a30, az: 0.5, elev: 7.0, r: 5.6,
              halos: [1.5, 2.6], rays: 12, fan: 12, glow: 0.42, gain: 1.0 },
      recipe: {
        tex: 'wetrock', skyGlow: 0.9, haze: 0.78, ground: 0x0c1a1c,
        mist: { sp: 3.4, size: 0.22, alpha: 0.14, col: 0x9ad8d0 },
        motes: { col: 0xffe0b0, size: 0.22, alpha: 0.35, rise: 0.15 },
        water: { d0: 16, col: 0x0a2632 },
        layers: [
          { kind: 'rubble',  sp: 2.4, d: 4.5, col: 0x1b423c, s0: 0.25, s1: 0.9 },
          { kind: 'wall',    d: 7.5, col: 0x1a3a36, cell: 6, jitter: 0.6,
            openings: { every: 76, first: 38, w: 46, h: 30, y0: 0, shape: 'arch' } },
          { kind: 'islets', foam: true, sp: 6.5, d: 12, col: 0x223438, h0: 1.4, h1: 2.8 },
          { kind: 'mesa',    sp: 12, d: 19, col: 0x1e3038, h0: 2.8, h1: 3.4 },
          { kind: 'lighthouse', sp: 70, d: 30, col: 0x1e2c3a, h0: 9, h1: 11 },
          { kind: 'mountains', sp: 11, d: 46, col: 0x28384a, h0: 2.2, h1: 2.9 },
          { kind: 'mountains', sp: 9,  d: 68, col: 0x2e4256, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 3 - THE DEEP CAVE. No sky at all: a roof of rock, fungus as tall as trees
     glowing blue, crystal veins, a black river, and rope bridges hung between
     the pillars. */
  define({
    depth: 3, key: 'm03_deepcave', label: 'The Deep Cave', flavor: 'carved', closed: true,
    palette: {
      pal: { D: '#36485a', d: '#222e3c', g: '#6684a6', G: '#a4c2e4' }, doorStyle: 'cave',
      sky: ['#08121c', '#03080e'], light: '#7ad0ff', darkness: 0.76, lightRadius: 68, dust: '#4a7aa0'
    },
    tiles: {
      wall: { tex: 'tile_rockdark', color: '#4c6480' },
      top: { tex: 'tile_slate', color: '#6a88a8' },
      plat: { tex: 'tile_planksold', color: '#5a4a3a' }
    },
    theme: { fog: 0x06121c, ambient: 0x2c4a68, hemiSky: 0x3c688c, hemiGround: 0x0e1a24, dir: 0x7ad0ff, dirI: 0.34 },
    grade: { sat: 1.08, gamma: 1.05 },
    affinity: { spider: 1.6, bat: 1.3, skeleton: 1.2 },
    roster: { crystalbeetle: 30, spider: 26, bat: 16, skeleton: 18 },
    backdrop: {
      curve: { gain: 0.3, warm: 0.3 },
      hero: { kind: 'sigil', col: 0x5ec8ff, core: 0xe0f6ff, edge: 0x1f5a8a, az: 0.48, elev: 6.2, r: 3.2,
              halos: [1.7, 3.0], ring: true, fan: 10, glow: 0.34, gain: 0.86 },
      recipe: {
        tex: 'wetrock', ceiling: { y: 10.5, col: 0x050c14 },
        skyGlow: 0.5, haze: 0.62, ground: 0x060e16,
        mist: { sp: 3.6, size: 0.2, alpha: 0.16, col: 0x4c88b0 },
        motes: { col: 0x8ad8ff, size: 0.26, alpha: 0.45, rise: 0.25 },
        water: { d0: 12, col: 0x061a2a },
        layers: [
          { kind: 'rubble',      sp: 2.2, d: 4.5, col: 0x1a2c40, s0: 0.25, s1: 0.9 },
          { kind: 'mushrooms',   sp: 5.5, d: 7.5, col: 0x16283c, cap: 0x4aa8d8, glowCol: 0x6ad0ff, h0: 2.2, h1: 4.6 },
          { kind: 'stalactites', sp: 2.2, d: 7.5, col: 0x152436, h0: 1.4, h1: 3.0 },
          { kind: 'ropebridge',  sp: 34,  d: 12,  col: 0x1a2230, y0: 4.5, y1: 6.5 },
          { kind: 'stalactites', sp: 2.4, d: 12,  col: 0x12202f, h0: 1.6, h1: 3.2 },
          { kind: 'crystals',    sp: 4.0, d: 19,  col: 0x3a8fd0, glow: true, alpha: 0.65, s0: 0.5, s1: 1.3 },
          { kind: 'mushrooms',   solo: true, d: 30, col: 0x102030, cap: 0x3a90c8, glowCol: 0x6ad0ff, scale: 0.42 },
          { kind: 'spires',      sp: 5.0, d: 46,  col: 0x0e1a28, h0: 2.2, h1: 3.6 },
          { kind: 'crystals',    sp: 6.0, d: 68,  col: 0x2f78b0, glow: true, alpha: 0.5, s0: 0.7, s1: 1.4 }
        ]
      }
    }
  });

  /* 4 - THE RUSTED PRISON. A closed hall of cell tiers and catwalks, chains and
     cages hanging in it. There is no sky: the sun is somewhere behind the
     outer wall, and it reaches the hall through the barred windows, when the
     camera is where a window is. A guard tower stands out there, in the glare. */
  define({
    depth: 4, key: 'm04_prison', label: 'The Rusted Prison', flavor: 'plain', puzzle: true, closed: true,
    palette: {
      pal: { D: '#6b5641', d: '#4a3a2b', g: '#b8834f', G: '#e0b57e' }, doorStyle: 'gate',
      sky: ['#3a2a1c', '#17100a'], light: '#e8a05a', darkness: 0.68, lightRadius: 72, dust: '#8a5b3b'
    },
    tiles: {
      wall: { tex: 'tile_brickred', color: '#7a5a42' },
      top: { tex: 'tile_slate', color: '#8a7058' },
      plat: { tex: 'tile_metal', color: '#7a6a5a' }
    },
    theme: { fog: 0x1a1006, ambient: 0x6e5638, hemiSky: 0x846845, hemiGround: 0x241810, dir: 0xfbbf24, dirI: 0.50 },
    grade: { contrast: 1.06 },
    affinity: { skeleton: 1.5, shielder: 1.6, cultist: 1.4, harpy: 0.4 },
    roster: { jailer: 24, prisoner: 22, skeleton: 20, shielder: 16, sewerrat: 18 },
    backdrop: {
      curve: { gain: 0.5, warm: 0.4 },
      hero: { kind: 'sun', col: 0xffa84a, core: 0xfff0d0, edge: 0xd06a10, az: 0.5, elev: 7.0, r: 6.0,
              halos: [1.5, 2.6], rays: 14, fan: 14, glow: 0.46, gain: 1.0 },
      recipe: {
        tex: 'brick', skyGlow: 0.95, haze: 0.7, ground: 0x120a04,
        motes: { col: 0xf97316, size: 0.28, alpha: 0.45, rise: 0.7 },
        layers: [
          { kind: 'hangcage',  sp: 12, d: 3.6, col: 0x241a12, top: 14, l0: 3, l1: 8 },
          { kind: 'catwalk',   sp: 26, d: 4.5, col: 0x2a1e14, y0: 3.4, y1: 4.6, l0: 12, l1: 24 },
          { kind: 'celltier',  sp: 13, d: 7.5, col: 0x30221a, tiers: 3, w0: 8, w1: 11 },
          { kind: 'wall',      d: 12, col: 0x3a2a1c, cell: 5, jitter: 0.5,
            openings: { every: 44, first: 20, w: 12, h: 12, y0: 4.5, shape: 'window', bars: true } },
          { kind: 'columns',   sp: 4.0, d: 19, col: 0x22160c, h0: 2.6, h1: 3.6 },
          { kind: 'watchtower', solo: true, d: 30, col: 0x1c1208, scale: 0.42 },
          { kind: 'columns',   sp: 3.8, d: 46, col: 0x180e05, h0: 2.2, h1: 3.0 },
          { kind: 'bricks',    sp: 3.2, d: 68, col: 0x140b04, rows: 3 }
        ]
      }
    }
  });

  /* 5 - THE WARDEN'S GATE. A hall cut into the mountain, lit from arrow slits
     high up: guardians in stone along the walls, a great portcullis behind. */
  define({
    depth: 5, key: 'm05_wardengate', label: 'The Warden\'s Gate', flavor: 'boss', closed: true,
    palette: {
      pal: { D: '#5c6068', d: '#3a3d44', g: '#8e939c', G: '#c4c9d2' }, doorStyle: 'gate',
      sky: ['#20242c', '#0e1014'], light: '#ffb060', darkness: 0.66, lightRadius: 76, dust: '#8e939c'
    },
    tiles: {
      wall: { tex: 'tile_rock', color: '#80868f' },
      top: { tex: 'tile_pavelarge', color: '#9aa0aa' },
      plat: { tex: 'tile_metal', color: '#7a7268' }
    },
    theme: { fog: 0x1c202a, ambient: 0x8a90a2, hemiSky: 0xa4acc0, hemiGround: 0x363a48, dir: 0xffc080, dirI: 0.72 },
    affinity: {},
    roster: { skeleton: 20, shielder: 26, zombie: 10 },
    backdrop: {
      curve: { gain: 0.44, warm: 0.34 },
      hero: { kind: 'sun', col: 0xffb868, core: 0xfff0d0, edge: 0xc86a18, az: 0.5, elev: 9.0, r: 5.4,
              halos: [1.5, 2.6], rays: 12, fan: 12, glow: 0.4, gain: 1.0 },
      recipe: {
        tex: 'granite', fill: 0.3, skyGlow: 0.85, haze: 0.66, ground: 0x0e1014,
        motes: { col: 0xffb060, size: 0.24, alpha: 0.4, rise: 0.4 },
        layers: [
          { kind: 'statue',    sp: 19, d: 4.5, col: 0x646c7c, h0: 9, h1: 11 },
          { kind: 'wall',      d: 8, col: 0x6a7284, courses: true, cell: 5, piers: 26, string: 5, jitter: 0.5,
            openings: { every: 26, first: 13, w: 3.2, h: 16, y0: 9, shape: 'window' } },
          { kind: 'biggate',   solo: true, d: 12, col: 0x363c46, scale: 1 },
          { kind: 'columns',   sp: 4.0, d: 19, col: 0x20242a, h0: 3, h1: 4 },
          { kind: 'ruins',     sp: 8, d: 30, col: 0x1c2026, h0: 2.6, h1: 3.4 },
          { kind: 'mountains', sp: 9, d: 46, col: 0x22262e, h0: 2.4, h1: 3.0 },
          { kind: 'mountains', sp: 8, d: 68, col: 0x2a2e38, h0: 2.3, h1: 2.9 }
        ]
      }
    }
  });

  /* 6 - THE ROT SWAMP. Black trees in black water under a moon behind the fen
     haze, mist on the surface, huts on stilts, one dead tree the size of a
     tower. */
  define({
    depth: 6, key: 'm06_rotswamp', label: 'The Rot Swamp', flavor: 'flooded',
    palette: {
      pal: { D: '#4a5638', d: '#333d26', g: '#7a8f4e', G: '#b8c97a' }, doorStyle: 'cave',
      sky: ['#0f1a0c', '#070d06'], light: '#b8e06a', darkness: 0.70, lightRadius: 68, dust: '#6a7d46'
    },
    tiles: {
      wall: { tex: 'tile_mossbrick', color: '#6a7a4a' },
      top: { tex: 'tile_mud', color: '#7a8a52' },
      plat: { tex: 'tile_planksold', color: '#6a5a3a' }
    },
    theme: { fog: 0x0d1a0c, ambient: 0x4e6a3a, hemiSky: 0x6d8a4c, hemiGround: 0x141a10, dir: 0xb8e06a, dirI: 0.42 },
    affinity: { slime: 1.5, spitter: 1.8, zombie: 1.3, bomber: 0.6, magmacrab: 0.2 },
    roster: { bogman: 30, zombie: 20, spitter: 18, bomber: 12, frogshaman: 16 },
    backdrop: {
      like: 'swamp',
      recipe: {
        layers: [
          { kind: 'reeds',     sp: 1.6, d: 4.5, col: 0x0e1c08 },
          { kind: 'trees',     sp: 3.4, d: 7.5, col: 0x172a0c, bare: true, h0: 2.8, h1: 4.0 },
          { kind: 'stilthouse', sp: 26, d: 12, col: 0x142208 },
          { kind: 'broadleaf', sp: 5.0, d: 12, col: 0x162a10, accent: 0x1a1a0c, h0: 2.6, h1: 3.6 },
          { kind: 'islets', foam: true, sp: 9.0, d: 19, col: 0x14260e, cap: 0x2a4a18, h0: 2.2, h1: 3.2 },
          { kind: 'deadtree',  solo: true, d: 30, col: 0x0c1606, scale: 0.3 },
          { kind: 'pines',     sp: 2.6, d: 46, col: 0x1a2c14, accent: 0x1a2010, h0: 2.0, h1: 2.7 },
          { kind: 'mountains', sp: 10, d: 68, col: 0x22301c, h0: 2.1, h1: 2.6 }
        ]
      }
    }
  });

  /* 7 - THE CLIMB. An alpine peak under a cold moon: pines below, snow ranges,
     and, as you rise, a SEA OF CLOUD opening under you. */
  define({
    depth: 7, key: 'm07_climb', label: 'The Climb', flavor: 'mountain',
    palette: {
      pal: { D: '#5a6070', d: '#3e4450', g: '#8a95a8', G: '#ccd6e4' }, doorStyle: 'arch',
      sky: ['#131a26', '#080b12'], light: '#dceaff', darkness: 0.60, lightRadius: 76, dust: '#8a95a8'
    },
    tiles: {
      wall: { tex: 'tile_rock', color: '#7a8496' },
      top: { tex: 'tile_slate', color: '#a4aec0' },
      plat: { tex: 'tile_planksold', color: '#7a6a52' }
    },
    theme: { fog: 0x141a26, ambient: 0x6a7288, hemiSky: 0x9fb0d0, hemiGround: 0x2a2e38, dir: 0xdceaff, dirI: 0.66 },
    grade: { sat: 1.06, contrast: 1.03 },
    affinity: { bat: 1.4, harpy: 2.2, golem: 1.4, spider: 0.6 },
    roster: { mountaingoat: 30, golem: 14, skeleton: 16, bat: 14, eagle: 16 },
    backdrop: {
      like: 'mountain',
      recipe: {
        layers: [
          { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x4a5566, s0: 0.3, s1: 1.0 },
          { kind: 'pines',     sp: 3.4, d: 7.5, col: 0x1c2a2a, accent: 0x2a2420, snow: true, cap: 0xd8e4f0, h0: 2.6, h1: 3.8 },
          { kind: 'pines',     sp: 2.8, d: 12, col: 0x1e2c30, accent: 0x262420, snow: true, cap: 0xd8e4f0, h0: 2.4, h1: 3.4 },
          { kind: 'mountains', sp: 9,   d: 19, col: 0x2a3444, snow: true, cap: 0xdfe8f4, h0: 3.1, h1: 3.6 },
          { kind: 'peak',      solo: true, d: 30, col: 0x283242, scale: 0.26 },
          { kind: 'cloudsea',  sp: 5,   d: 30, col: 0x8a98b4, cap: 0xf0f6ff, y0: 12.5, y1: 14 },
          { kind: 'mountains', sp: 9,   d: 46, col: 0x2e3a50, snow: true, cap: 0xdfe8f4, h0: 2.5, h1: 3.0 },
          { kind: 'cloudsea',  sp: 6,   d: 46, col: 0x9aa6c0, cap: 0xf4f8ff, y0: 9.5, y1: 10.8 },
          { kind: 'mountains', sp: 8,   d: 68, col: 0x34425c, snow: true, cap: 0xe4ecf8, h0: 2.3, h1: 2.9 },
          { kind: 'cloudsea',  sp: 6,   d: 68, col: 0xa8b4cc, cap: 0xffffff, y0: 7, y1: 8 }
        ]
      }
    }
  });

  /* 8 - THE SUNK HALLS. A palace under water: a cracked dome far overhead
     letting a shaft of green light down, drowned colonnades, chandeliers on
     their chains, and the water everywhere. */
  define({
    depth: 8, key: 'm08_sunkhalls', label: 'The Sunk Halls', flavor: 'flooded', closed: true,
    palette: {
      pal: { D: '#3a5566', d: '#263a48', g: '#6a8fa8', G: '#a8cde0' }, doorStyle: 'arch',
      sky: ['#081824', '#030c14'], light: '#8fd8ff', darkness: 0.72, lightRadius: 70, dust: '#5a86a0'
    },
    tiles: {
      wall: { tex: 'tile_marble', color: '#5a7a8c' },
      top: { tex: 'tile_pavelarge', color: '#7a9aac' },
      plat: { tex: 'tile_planksold', color: '#4a5a5a' }
    },
    theme: { fog: 0x08161f, ambient: 0x3a6a86, hemiSky: 0x4c8cb0, hemiGround: 0x102028, dir: 0x8fd8ff, dirI: 0.44 },
    grade: { sat: 1.04, gamma: 1.04 },
    affinity: { zombie: 1.2, wraith: 1.5, icewisp: 1.6, bomber: 0.5, magmacrab: 0.2 },
    roster: { drownedknight: 30, wraith: 22, shielder: 18, zombie: 10 },
    backdrop: {
      like: 'flooded',
      curve: { gain: 0.32, warm: 0.3 },
      hero: { kind: 'shaft', col: 0x9fe4ff, core: 0xf0fcff, edge: 0x2f7ea0, az: 0.5, elev: 6.2, r: 3.2,
              halos: [1.7, 3.0], shafts: 3, fan: 10, glow: 0.3, gain: 0.82 },
      recipe: {
        ceiling: { y: 12, col: 0x061218 }, stars: null,
        skyGlow: 0.55, haze: 0.66,
        water: { d0: 7.5, col: 0x06141e },
        layers: [
          { kind: 'ice',        sp: 5.5, d: 4.5, col: 0x2f5c72, h0: 0.8, h1: 1.6 },
          { kind: 'chandelier', sp: 14,  d: 4.5, col: 0x1a3c4d, hang: true },
          { kind: 'columns',    sp: 4.0, d: 7.5, col: 0x1a3c4d, h0: 2.4, h1: 3.8 },
          { kind: 'arches',     sp: 5.0, d: 12,  col: 0x173646, h0: 2.6, h1: 3.6 },
          { kind: 'chandelier', sp: 18,  d: 12,  col: 0x133142, hang: true },
          { kind: 'ruins',      sp: 6.0, d: 19,  col: 0x133142, h0: 2.4, h1: 3.4 },
          { kind: 'drownedtemple', solo: true, d: 30, col: 0x0e2230, scale: 0.5 },
          { kind: 'columns',    sp: 4.0, d: 46,  col: 0x0e2230, h0: 2.2, h1: 3.0 },
          { kind: 'arches',     sp: 5.4, d: 68,  col: 0x0c1c28, h0: 2.0, h1: 2.6 }
        ]
      }
    }
  });

  /* 9 - THE ASH REACHES. A volcanic plain under a swollen red sun, obsidian
     towers standing in the ash, a river of lava, a volcano in eruption on the
     horizon. */
  define({
    depth: 9, key: 'm09_ashreaches', label: 'The Ash Reaches', flavor: 'carved',
    palette: {
      pal: { D: '#5a3228', d: '#3a2018', g: '#8f5040', G: '#d08a6a' }, doorStyle: 'gate',
      sky: ['#1c0a06', '#0d0403'], light: '#ff8a4a', darkness: 0.66, lightRadius: 74, dust: '#a05038'
    },
    tiles: {
      wall: { tex: 'tile_volcanic', color: '#8a5240' },
      top: { tex: 'tile_rockdark', color: '#a06a50' },
      plat: { tex: 'tile_planksold', color: '#6a4a38' }
    },
    theme: { fog: 0x1a0a06, ambient: 0x7a3a28, hemiSky: 0x9a4a2c, hemiGround: 0x241008, dir: 0xff7a3c, dirI: 0.58 },
    grade: { sat: 1.2, contrast: 1.1 },
    affinity: { bomber: 1.6, golem: 1.4, magmacrab: 2.4, icewisp: 0.2, cultist: 1.3 },
    roster: { ashhound: 34, bomber: 22, golem: 14, necromancer: 12 },
    backdrop: {
      like: 'volcanic',
      recipe: {
        layers: [
          { kind: 'rubble',  sp: 2.4, d: 4.5, col: 0x4d1e0c, s0: 0.3, s1: 1.0 },
          { kind: 'spires',  sp: 4.6, d: 7.5, col: 0x241008, h0: 3.4, h1: 5.4 },
          { kind: 'islets',  sp: 7,   d: 12,  col: 0x3a180c, h0: 1.8, h1: 3.0 },
          { kind: 'volcano', sp: 12,  d: 19,  col: 0x3a160c, h0: 3.0, h1: 3.5, glowCol: 0xff6a20 },
          { kind: 'caldera', solo: true, d: 30, col: 0x220c05, scale: 0.3 },
          { kind: 'volcano', sp: 11,  d: 46,  col: 0x2c0e06, h0: 2.5, h1: 3.0, glowCol: 0xff5a18 },
          { kind: 'volcano', sp: 10,  d: 68,  col: 0x3a1a10, h0: 2.3, h1: 2.9, glowCol: 0xff4a10 }
        ]
      }
    }
  });

  /* 10 - THE SLIME THRONE. The king's hall: gold gone green, the pillars
     running with slime, slime falling from the vault in glowing sheets. */
  define({
    depth: 10, key: 'm10_slimethrone', label: 'The Slime Throne', flavor: 'boss', closed: true,
    palette: {
      pal: { D: '#6a6a3c', d: '#484a28', g: '#a4b060', G: '#e0ec98' }, doorStyle: 'gate',
      sky: ['#26300f', '#0e1406'], light: '#b8e64c', darkness: 0.62, lightRadius: 78, dust: '#8a9a40'
    },
    tiles: {
      wall: { tex: 'tile_mossbrick', color: '#8a9a56' },
      top: { tex: 'tile_marble', color: '#a8b874' },
      plat: { tex: 'tile_planksold', color: '#6a6a3a' }
    },
    theme: { fog: 0x141c06, ambient: 0x6e7a3a, hemiSky: 0x8a9a4a, hemiGround: 0x20260f, dir: 0xd8f070, dirI: 0.52 },
    affinity: { slime: 2.0 },
    roster: { slime: 30, shielder: 12, zombie: 12 },
    backdrop: {
      like: 'throne',
      hero: { col: 0xb8e64c, core: 0xf4ffd0, edge: 0x6a8a1c },
      recipe: {
        motes: { col: 0xc8f060, size: 0.3, alpha: 0.5, rise: -0.2 },
        layers: [
          { kind: 'rubble',     sp: 2.4, d: 4.5, col: 0x3a4414, s0: 0.3, s1: 1.0 },
          { kind: 'columns',    sp: 3.8, d: 7.5, col: 0x3c4a12, h0: 3.0, h1: 4.2 },
          { kind: 'waterfall',  sp: 15,  d: 12,  col: 0x2c3a10, h0: 3.0, h1: 4.0, flow: true, glowCol: 0x9adf3c },
          { kind: 'arches',     sp: 4.8, d: 19,  col: 0x2c3a0e, h0: 2.6, h1: 3.6 },
          { kind: 'thronehall', solo: true, d: 30, col: 0x232e08, scale: 0.36 },
          { kind: 'arches',     sp: 5.2, d: 46,  col: 0x1c2606, h0: 2.2, h1: 2.9 },
          { kind: 'columns',    sp: 3.8, d: 68,  col: 0x161e04, h0: 2.0, h1: 2.6 }
        ]
      }
    }
  });
})(window.DS);
