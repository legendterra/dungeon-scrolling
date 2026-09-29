/* The map registry: one entry per place, everything about it in one object.

   A floor's identity used to be scattered over six tables that had to be edited
   together and could disagree: the depth ladder (difficulty.js), the tile
   palettes (art/biomes.js), the 3D light rig (renderer3d THEMES), the horizon's
   recipe, curve and light body (backdrop3d), the spawn affinity (enemies.js) and
   the colour grade (postfx). Adding a map meant six edits in six files, and a
   depth got its name from the palette rather than from the place.

   Now a place is ONE definition (src/world/maps/act1.js, act2.js, act3.js) and
   DS.Maps.define() hands each piece to the module that owns it:

     depth, key, label, flavor, puzzle?, closed?   the ladder rung (this file)
     palette   { D, d, g, G, doorStyle, sky, light, darkness, lightRadius, dust }
                                                   -> DS.Biomes.register
     theme     { fog, ambient, hemiSky, hemiGround, dir, dirI }
                                                   -> DS.R3D.registerTheme
     grade     { sat, contrast, gamma }            -> DS.PostFX.registerGrade
     backdrop  { curve, hero, recipe }             -> DS.Backdrop.registerTheme
     affinity  { kind: weight }                    -> DS.Enemies.registerAffinity
     roster    { kind: weight }                    -> DS.Enemies.registerRoster (who lives here)
     tiles     { wall, top, plat }                 -> the level's HD tile look

   A module that is not loaded (the level checker runs in node, with no renderer)
   simply skips its share, so the ladder itself is testable on its own.

   `label` is what the banner and HUD show; the biome's name is derived from it,
   so two depths that share stone never share a name again. Depths with no
   definition fall back to the old ladder in difficulty.js. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const FLAVORS = ['plain', 'carved', 'boss', 'flooded', 'mountain'];

  const byDepth = {};
  const byKey = {};
  const order = [];

  function fail(def, why) {
    throw new Error('DS.Maps.define(' + (def && def.key) + '): ' + why);
  }

  function validate(def) {
    if (!def || typeof def !== 'object') fail(def, 'not an object');
    if (!def.key || typeof def.key !== 'string') fail(def, 'no key');
    if (!Number.isInteger(def.depth) || def.depth < 1) fail(def, 'depth must be a positive integer');
    if (!def.label) fail(def, 'no label');
    if (FLAVORS.indexOf(def.flavor) < 0) fail(def, 'flavor must be one of ' + FLAVORS.join('/'));
    if (byDepth[def.depth]) fail(def, 'depth ' + def.depth + ' is already ' + byDepth[def.depth].key);
    if (byKey[def.key]) fail(def, 'key already defined at depth ' + byKey[def.key].depth);
  }

  /* The ladder rung difficulty.js hands to every generator, the spawn table, the
     palette lookup and the renderer. `theme` is the key: one theme per map. */
  function rungOf(def) {
    return {
      depth: def.depth, key: def.key, label: def.label, flavor: def.flavor,
      theme: def.key, puzzle: !!def.puzzle, closed: !!def.closed, map: def
    };
  }

  function define(def) {
    validate(def);
    def.rung = rungOf(def);
    byDepth[def.depth] = def;
    byKey[def.key] = def;
    order.push(def);

    if (def.palette && DS.Biomes && DS.Biomes.register) {
      DS.Biomes.register(Object.assign({ key: def.key, name: def.label.toUpperCase(), tiles: def.tiles || null }, def.palette));
    }
    if (def.theme && DS.R3D && DS.R3D.registerTheme) DS.R3D.registerTheme(def.key, def.theme);
    if (def.grade && DS.PostFX && DS.PostFX.registerGrade) DS.PostFX.registerGrade(def.key, def.grade);
    if (def.backdrop && DS.Backdrop && DS.Backdrop.registerTheme) DS.Backdrop.registerTheme(def.key, def.backdrop);
    if (def.affinity && DS.Enemies && DS.Enemies.registerAffinity) DS.Enemies.registerAffinity(def.key, def.affinity);
    if (def.roster && DS.Enemies && DS.Enemies.registerRoster) DS.Enemies.registerRoster(def.key, def.roster);
    return def;
  }

  DS.Maps = {
    FLAVORS: FLAVORS,
    define: define,
    get: function (depth) { return byDepth[depth] || null; },
    byKey: function (key) { return byKey[key] || null; },
    /* The rung for a depth on the first pass through the ladder, or null. */
    rung: function (depth) { const m = byDepth[depth]; return m ? m.rung : null; },
    list: function () { return order.slice(); },
    count: function () { return order.length }
  };
})(window.DS);
