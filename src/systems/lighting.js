/* Dynamic lighting. The dungeon is painted with a darkness layer each frame,
   then holes are punched in it wherever something glows. Torches finally
   matter, and every projectile, skill and explosion lights the room. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;

  let layer = null, lx = null;
  const lights = [];

  function ensure() {
    if (layer) return;
    layer = DS.Art.makeCanvas(C.W * C.RS, C.H * C.RS, C.RS);
    lx = layer.getContext('2d');
  }

  function begin() { lights.length = 0; }

  /* World-space light. `soft` lights fade at the rim; `color` adds a warm
     additive wash on top of the cut-out. */
  function add(x, y, radius, strength, color) {
    lights.push({ x: x, y: y, r: radius, s: strength == null ? 1 : strength, c: color || null });
  }

  function collect(g) {
    const biome = g.biome;
    const p = g.player;

    if (p && !p.dead) {
      // The player's own light pulses gently and flares while a skill runs.
      const pulse = 1 + Math.sin(g.frames * 0.05) * 0.04;
      const boost = p.routine ? 1.35 : p.charging ? 1.15 : 1;
      // Two passes: a wide soft falloff plus a tight bright core, so the hero
      // stays clearly readable even at the new darkness levels.
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
      // Boss projectiles use element names ('dark') that are not player elements.
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
      // A winding-up enemy lights itself, which doubles as an extra tell.
      if (e.attackState === 'wind') add(DS.Ent.centerX(e), DS.Ent.centerY(e), 26, 0.9, '#c0303c');
    }

    if (g.shrine && !g.shrine.used) {
      add(g.shrine.x + 8, g.shrine.y + 8, 46, 1, '#a8e4ff');
    }
  }

  function render(g) {
    /* In 3D mode the transparent 2D canvas sits ABOVE the WebGL canvas, so
       this same darkness veil also dims the Three.js scene; the torch cut-outs
       land on the same decor spots the 3D torch lights glow at, so the two
       layers fuse. 3D already carries some mood of its own, so the veil is
       softened slightly rather than doubled at full strength. */
    const is3D = !!(DS.R3D && DS.R3D.isEnabled);
    ensure();
    const R = DS.R;
    const darkness = DS.Modifiers.darknessFor(g) * (is3D ? 0.45 : 1);
    if (darkness <= 0.01) return;

    // Must clear first: without this the list accumulates across frames and the
    // additive pass stacks the same torch hundreds of times into pure white.
    begin();
    collect(g);

    lx.setTransform(C.RS, 0, 0, C.RS, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, C.W, C.H);
    lx.fillStyle = 'rgba(6,5,10,' + darkness + ')';
    lx.fillRect(0, 0, C.W, C.H);

    // Cut the lit areas out of the darkness.
    lx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const sx = R.toScreenX(l.x), sy = R.toScreenY(l.y);
      const r = l.r * R.zoom();
      if (sx + r < 0 || sx - r > C.W || sy + r < 0 || sy - r > C.H) continue;

      const grd = lx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grd.addColorStop(0, 'rgba(0,0,0,' + l.s + ')');
      grd.addColorStop(0.55, 'rgba(0,0,0,' + (l.s * 0.55) + ')');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = grd;
      lx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }

    R.ctx.setTransform(1, 0, 0, 1, 0, 0);
    R.ctx.drawImage(layer, 0, 0);
    R.ctx.setTransform(C.RS, 0, 0, C.RS, 0, 0);

    /* A faint coloured wash so light sources read as warm rather than as holes.
       Kept very low and tight: 'lighter' accumulates, and a dozen overlapping
       torches at a higher alpha blow the whole screen out to white. */
    const cx = R.ctx;
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (!l.c) continue;
      const sx = R.toScreenX(l.x), sy = R.toScreenY(l.y);
      const r = l.r * R.zoom() * 0.42;
      if (sx + r < 0 || sx - r > C.W || sy + r < 0 || sy - r > C.H) continue;
      const grd = cx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grd.addColorStop(0, tint(l.c, 0.085 * l.s));
      grd.addColorStop(0.6, tint(l.c, 0.028 * l.s));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = grd;
      cx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    cx.restore();
  }

  function tint(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
  }

  DS.Light = { begin: begin, add: add, render: render };
})(window.DS);
