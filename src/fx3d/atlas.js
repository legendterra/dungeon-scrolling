/* The FX3D sprite atlas: every soft shape a billboard can wear, painted once
   into one 512x512 canvas (4x4 cells of 128px), so every billboard in the game
   can share ONE texture and therefore one draw call per blend mode.

   All shapes are painted WHITE with their shading in alpha and luminance, so
   the per-particle colour tints them - one flame cell serves fire, a firestorm
   and a magma crack alike. Cells keep an 8px margin so mip levels do not bleed
   a neighbour into the edge of a small particle.

   Cell map (row-major, top-left first) -- the numbers are DS.FX3DAtlas.CELL:
     0 glow     soft radial falloff (motes, flashes, halos)
     1 streak   vertical spindle, hot core (sparks, arcs, speed lines)
     2 star     four-point flare with a hot centre (impacts, crits)
     3 smoke    lumpy soft puff (dust, mist, steam)
     4 ring     thin soft ring (pops, bubbles of light)
     5 flame    teardrop tongue, point up (fire)
     6 shard    hard-edged crystal diamond (ice, glass)
     7 leaf     leaf with a midrib (leaf)
     8 bubble   hollow sphere with a highlight (poison, water)
     9 droplet  falling drop (water, poison drip)
    10 petal    rounded petal (bloom)
    11 gust     curved crescent streak (wind)
    12 snow     six-armed sparkle (frost)
    13 ember    small hot dot with a tight halo
    14 slashfx  a soft crescent (sweep ghosts, afterimages)
    15 cross    thin plus-shaped glint                                       */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const CELL = {
    glow: 0, streak: 1, star: 2, smoke: 3, ring: 4, flame: 5, shard: 6, leaf: 7,
    bubble: 8, droplet: 9, petal: 10, gust: 11, snow: 12, ember: 13, slashfx: 14, cross: 15
  };

  const SIZE = 512;
  const CS = 128;           // cell size
  const R = 56;             // usable radius inside the margin

  let texture = null;

  function radial(ctx, r, stops) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  const PAINT = [
    // 0 glow
    function (ctx) {
      ctx.fillStyle = radial(ctx, R, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.75)'],
                                      [0.45, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
    },
    // 1 streak: a spindle along y, white-hot down the middle
    function (ctx) {
      for (let i = 0; i < 3; i++) {
        const w = [18, 9, 3.5][i], a = [0.25, 0.55, 1][i];
        ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
        ctx.beginPath();
        ctx.moveTo(0, -R);
        ctx.quadraticCurveTo(w, 0, 0, R);
        ctx.quadraticCurveTo(-w, 0, 0, -R);
        ctx.fill();
      }
    },
    // 2 star
    function (ctx) {
      ctx.fillStyle = radial(ctx, R * 0.5, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
      for (let k = 0; k < 2; k++) {
        ctx.save();
        ctx.rotate(k * Math.PI / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.moveTo(0, -R); ctx.quadraticCurveTo(5, 0, 0, R); ctx.quadraticCurveTo(-5, 0, 0, -R);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.55); ctx.quadraticCurveTo(3, 0, 0, R * 0.55); ctx.quadraticCurveTo(-3, 0, 0, -R * 0.55);
      ctx.moveTo(-R * 0.55, 0); ctx.quadraticCurveTo(0, 3, R * 0.55, 0); ctx.quadraticCurveTo(0, -3, -R * 0.55, 0);
      ctx.fill();
      ctx.restore();
    },
    // 3 smoke: overlapping soft lobes
    function (ctx) {
      const lobes = [[0, 0, 0.62], [-0.3, -0.12, 0.45], [0.28, -0.2, 0.42], [0.1, 0.25, 0.44], [-0.22, 0.22, 0.38]];
      for (let i = 0; i < lobes.length; i++) {
        const l = lobes[i];
        ctx.save();
        ctx.translate(l[0] * R, l[1] * R);
        ctx.fillStyle = radial(ctx, l[2] * R, [[0, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.28)'],
                                               [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
      }
    },
    // 4 ring
    function (ctx) {
      ctx.fillStyle = radial(ctx, R, [[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'],
                                      [0.8, 'rgba(255,255,255,1)'], [0.9, 'rgba(255,255,255,0.4)'],
                                      [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
    },
    // 5 flame: a teardrop, round at the bottom, licking to a point at the top
    function (ctx) {
      for (let i = 0; i < 3; i++) {
        const s = [1, 0.72, 0.42][i], a = [0.35, 0.7, 1][i];
        ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
        ctx.beginPath();
        ctx.moveTo(0, -R * s);
        ctx.bezierCurveTo(R * 0.25 * s, -R * 0.35 * s, R * 0.62 * s, R * 0.15 * s, R * 0.42 * s, R * 0.55 * s);
        ctx.quadraticCurveTo(0, R * 0.95 * s, -R * 0.42 * s, R * 0.55 * s);
        ctx.bezierCurveTo(-R * 0.62 * s, R * 0.15 * s, -R * 0.25 * s, -R * 0.35 * s, 0, -R * s);
        ctx.fill();
      }
    },
    // 6 shard: a long crystal with a bright facet
    function (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(0, -R); ctx.lineTo(R * 0.3, -R * 0.1); ctx.lineTo(0, R); ctx.lineTo(-R * 0.3, -R * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.moveTo(0, -R); ctx.lineTo(R * 0.3, -R * 0.1); ctx.lineTo(0, R * 0.2);
      ctx.closePath(); ctx.fill();
    },
    // 7 leaf
    function (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.moveTo(0, -R);
      ctx.bezierCurveTo(R * 0.7, -R * 0.5, R * 0.6, R * 0.5, 0, R * 0.85);
      ctx.bezierCurveTo(-R * 0.6, R * 0.5, -R * 0.7, -R * 0.5, 0, -R);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,150,150,1)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, -R * 0.8); ctx.lineTo(0, R); ctx.stroke();
      ctx.lineWidth = 2.5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * R * 0.22); ctx.lineTo(R * 0.32, i * R * 0.22 - R * 0.18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * R * 0.22); ctx.lineTo(-R * 0.32, i * R * 0.22 - R * 0.18); ctx.stroke();
      }
    },
    // 8 bubble
    function (ctx) {
      ctx.fillStyle = radial(ctx, R * 0.8, [[0, 'rgba(255,255,255,0.15)'], [0.75, 'rgba(255,255,255,0.35)'],
                                            [0.92, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.ellipse(-R * 0.3, -R * 0.32, R * 0.16, R * 0.1, -0.7, 0, Math.PI * 2); ctx.fill();
    },
    // 9 droplet
    function (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, -R);
      ctx.bezierCurveTo(R * 0.2, -R * 0.3, R * 0.55, R * 0.1, R * 0.5, R * 0.45);
      ctx.arc(0, R * 0.45, R * 0.5, 0, Math.PI);
      ctx.bezierCurveTo(-R * 0.55, R * 0.1, -R * 0.2, -R * 0.3, 0, -R);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath(); ctx.ellipse(-R * 0.18, R * 0.35, R * 0.1, R * 0.18, 0.3, 0, Math.PI * 2); ctx.fill();
    },
    // 10 petal
    function (ctx) {
      ctx.fillStyle = radial(ctx, R, [[0, 'rgba(255,255,255,1)'], [0.8, 'rgba(255,255,255,0.9)'],
                                      [1, 'rgba(255,255,255,0.6)']]);
      ctx.beginPath();
      ctx.moveTo(0, R * 0.9);
      ctx.bezierCurveTo(R * 0.8, R * 0.2, R * 0.5, -R * 0.9, 0, -R * 0.6);
      ctx.bezierCurveTo(-R * 0.5, -R * 0.9, -R * 0.8, R * 0.2, 0, R * 0.9);
      ctx.fill();
    },
    // 11 gust: a curved streak, thick in the middle
    function (ctx) {
      ctx.lineCap = 'round';
      const passes = [[14, 0.25], [7, 0.6], [2.5, 1]];
      for (let i = 0; i < passes.length; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,' + passes[i][1] + ')';
        ctx.lineWidth = passes[i][0];
        ctx.beginPath();
        ctx.arc(-R * 0.9, 0, R * 1.35, -0.72, 0.72);
        ctx.stroke();
      }
    },
    // 12 snow: six-armed sparkle
    function (ctx) {
      ctx.fillStyle = radial(ctx, R * 0.35, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineCap = 'round';
      for (let k = 0; k < 6; k++) {
        ctx.save();
        ctx.rotate(k * Math.PI / 3);
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * 0.9); ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -R * 0.5); ctx.lineTo(R * 0.2, -R * 0.7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -R * 0.5); ctx.lineTo(-R * 0.2, -R * 0.7); ctx.stroke();
        ctx.restore();
      }
    },
    // 13 ember
    function (ctx) {
      ctx.fillStyle = radial(ctx, R, [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,1)'],
                                      [0.34, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
    },
    // 14 slashfx: a soft crescent
    function (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.arc(0, R * 0.4, R, Math.PI * 1.1, Math.PI * 1.9);
      ctx.arc(0, R * 0.75, R * 0.95, Math.PI * 1.85, Math.PI * 1.15, true);
      ctx.fill();
    },
    // 15 cross glint
    function (ctx) {
      ctx.fillStyle = radial(ctx, R * 0.3, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(-2.5, -R, 5, R * 2);
      ctx.fillRect(-R, -2.5, R * 2, 5);
    }
  ];

  function build() {
    if (texture) return texture;
    const cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 16; i++) {
      ctx.save();
      ctx.translate((i % 4) * CS + CS / 2, Math.floor(i / 4) * CS + CS / 2);
      PAINT[i](ctx);
      ctx.restore();
    }
    texture = new THREE.CanvasTexture(cv);
    /* No mipmaps: a spark is a quad many times longer than it is wide, and a
       mip chosen by its narrow side blurs the spindle into a flat grey slab.
       The shapes are soft gradients already, so plain linear filtering holds. */
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.premultiplyAlpha = false;
    return texture;
  }

  DS.FX3DAtlas = { CELL: CELL, build: build };
})(window.DS);
