/* The HD texture library: photo-scan textures, shrunk to 256 px, with mipmaps.

   The backdrop's textures used to be twelve procedural families at 32x32 with
   NearestFilter, some of them the same layout in another colour (sand = bone,
   wetrock = granite, moss = bark), and laid on only the first few rungs. This
   is the other half of "a horizon that looks like somewhere": real rock, real
   brick, real rust, smoothed and mip-mapped so a far range does not sparkle.

   Where the pixels come from: tools/assets/textures.json lists CC0 photo-scans
   (Poly Haven); tools/assets/fetch-textures.js downloads them and
   tools/assets/bake-textures.js shrinks them into src/art/textures/common.gen.js
   as DATA URIs -- the game has to run from file://, where Chrome refuses a local
   image as a WebGL texture, so the bytes travel inside an ordinary script.

   The API is deliberately small:

     DS.TexLib.ready            true once every image has decoded
     DS.TexLib.has(id)          is there an HD texture by this id
     DS.TexLib.get(id)          the shared base texture, or null
     DS.TexLib.forFamily(fam)   the HD texture standing in for a procedural
                                family ('sand', 'brick', ...), or null
     DS.TexLib.clone(id, rx, ry) a private, configured copy to put in a
                                material: repeat set, mipmaps on, anisotropy up

   Everything degrades: no data file, a failed decode, a browser with no
   Image.decode -- the caller gets null and keeps the procedural texture it
   always had. `DS.TexLib.hd = false` (or ?hdtex=0) turns the whole thing off,
   and `DS.TexLib.tiles = false` turns off only the level's own tiles (the
   renderer reads it), so the look can be argued about with one switch.

   A private copy per material because three.js textures carry their own repeat,
   and because the renderer disposes every map under the theme group when a
   level tears down: a copy is freed with the floor, the base survives it. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const base = {};          // id -> THREE.Texture (shared source, never put in a material)
  let total = 0, decoded = 0, failed = 0, started = false;

  const query = typeof location !== 'undefined' ? location.search : '';
  const off = /[?&]hdtex=0\b/.test(query);

  /* The most a clone asks the GPU to filter at a grazing angle. The ground and
     the walls recede, and 4 is where a photo stops smearing without a cost the
     frame budget would notice. */
  const ANISO = 4;

  function decodeAll() {
    if (started || typeof THREE === 'undefined' || !DS.TexData) return;
    started = true;
    const ids = Object.keys(DS.TexData);
    total = ids.length;
    ids.forEach(function (id) {
      const img = new Image();
      const done = function () {
        const t = new THREE.Texture(img);
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = ANISO;
        base[id] = t;
        decoded++;
      };
      img.onload = done;
      img.onerror = function () { failed++; };
      img.src = DS.TexData[id];
    });
  }

  function has(id) { return !!base[id]; }
  function get(id) { return base[id] || null; }

  function forFamily(family) {
    const id = DS.TexFamilyMap && DS.TexFamilyMap[family];
    return id ? get(id) : null;
  }

  function clone(id, rx, ry) {
    const t = base[id];
    if (!t) return null;
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(rx || 1, ry == null ? rx || 1 : ry);
    return c;
  }

  const lib = {
    hd: !off,
    tiles: !off,
    has: has,
    get: get,
    forFamily: forFamily,
    clone: clone,
    ids: function () { return Object.keys(base); },
    get ready() { return started && total > 0 && decoded + failed === total; },
    get stats() { return { total: total, decoded: decoded, failed: failed }; },
    /* Idempotent: called at load, and again by anything that needs them sooner. */
    start: decodeAll
  };
  DS.TexLib = lib;

  decodeAll();
})(window.DS);
