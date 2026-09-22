/* Where the light is. Nothing here darkens anything.

   This module used to DRAW the darkness: a black rectangle over the finished
   frame with light-shaped holes punched out of it (a 20-ray visibility polygon
   per light, clipped, then a radial gradient erased from the veil). On the 2D
   canvas that was the whole look of the dungeon -- and it is also how the dark
   room became a black screen, because the veil ramped to 0.94 as you crossed its
   threshold and the 2D canvas sat *on top* of the WebGL scene, so it dimmed the
   3D scenery along with everything else.

   Now the lights are real: this module says WHERE the light is, and renderer3d
   turns that list into pooled Three.js point lights with decay and distance.

   There is deliberately no frame-wide darkness left in the game. The last two
   survivors were the "pitch dark room" (a floor zone that killed every torch on
   the way in) and the DARKNESS floor modifier (the same trick for a whole
   floor); both read as the screen suddenly going black mid-run, which is a bug
   to a player and not a mood, so both are gone and this module no longer has a
   render() at all. A room is as dark as its own torches make it, and that is
   the only rule. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;

  const lights = [];

  function begin() { lights.length = 0; }

  /* World-space light. `soft` lights fade at the rim; `color` tints the 3D
     point light this entry turns into. */
  function add(x, y, radius, strength, color) {
    lights.push({ x: x, y: y, r: radius, s: strength == null ? 1 : strength, c: color || null });
  }

  /* Every emitter on the floor, in world pixels. The 3D rig and the props both
     read this one list, so a torch can never light the scene and not itself. */
  function collect(g) {
    const biome = g.biome;
    const p = g.player;

    if (p && !p.dead) {
      const pulse = 1 + Math.sin(g.frames * 0.05) * 0.04;
      const boost = p.routine ? 1.35 : p.charging ? 1.15 : 1;
      add(DS.Ent.centerX(p), DS.Ent.centerY(p),
          biome.lightRadius * pulse * boost, 1, biome.light);
      add(DS.Ent.centerX(p), DS.Ent.centerY(p),
          biome.lightRadius * 0.42 * boost, 1, biome.light);
    }

    for (let i = 0; i < g.map.decor.length; i++) {
      const d = g.map.decor[i];
      if (d.kind === 'torch') {
        const flicker = 1 + Math.sin((g.frames + d.x) * 0.21) * 0.06 +
                        Math.sin((g.frames + d.x) * 0.07) * 0.04;
        add(d.x + 4, d.y + 4, 62 * flicker, 1, biome.light);
        add(d.x + 4, d.y + 3, 22 * flicker, 1, biome.light);
      } else if (d.kind === 'table') {
        add(d.x + 8, d.y + 4, 40, 0.9, '#c86ee0');
      } else if (d.kind === 'merchant') {
        add(d.x + 5, d.y + 6, 36, 0.9, '#f2c14e');
      }
    }

    for (let i = 0; i < g.projectiles.length; i++) {
      const pr = g.projectiles[i];
      const element = pr.element && DS.Weapons.ELEMENTS[pr.element];
      const color = element ? element.color : pr.friendly ? '#f2c14e' : '#c86ee0';
      add(DS.Ent.centerX(pr), DS.Ent.centerY(pr), 22, 0.8, color);
    }

    for (let i = 0; i < g.pickups.length; i++) {
      const pk = g.pickups[i];
      if (pk.kind === 'item') {
        add(DS.Ent.centerX(pk), DS.Ent.centerY(pk), 26, 0.85,
            DS.Weapons.rarityColor(pk.item.rarity));
      } else if (pk.kind !== 'coin') {
        add(DS.Ent.centerX(pk), DS.Ent.centerY(pk), 14, 0.6, '#a8e4ff');
      }
    }

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.isBoss) add(DS.Ent.centerX(e), DS.Ent.centerY(e), 54, 0.8, '#c86ee0');
      else if (e.tier === 'miniboss') add(DS.Ent.centerX(e), DS.Ent.centerY(e), 40, 0.7, '#c0303c');
      else if (e.tier === 'elite') add(DS.Ent.centerX(e), DS.Ent.centerY(e), 30, 0.6, '#e8743b');
      if (e.attackState === 'wind') add(DS.Ent.centerX(e), DS.Ent.centerY(e), 26, 0.9, '#c0303c');
    }

    if (g.shrine && !g.shrine.used) {
      add(g.shrine.x + 8, g.shrine.y + 8, 46, 1, '#a8e4ff');
    }

    return lights;
  }

  /* The 3D renderer borrows this list to place its own point lights. */
  function sources() { return lights; }

  DS.Light = { begin: begin, add: add, collect: collect, sources: sources };
})(window.DS);
