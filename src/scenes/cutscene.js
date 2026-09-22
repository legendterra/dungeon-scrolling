/* The opening cutscene: a torch, a corridor, and a floor that does not hold.

   It answers the one question the dungeon never explains — how you got down
   there — and it is deliberately short and skippable, because it plays before
   a run and a run is what the player came for. Death does not replay it: a
   restart goes straight back to the loadout.

   Everything here is drawn in screen space with the same tiles and hero art
   the game uses, so no new assets exist purely for the intro. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const M = DS.M;
  const T = 16;

  // Phase lengths in frames at 60fps. WALK is the only one long enough to read
  // a caption in; everything after it is momentum.
  const WALK = 170;
  const EDGE = 62;
  const FALL = 118;
  const LAND = 46;
  const TOTAL = WALK + EDGE + FALL + LAND;

  const FLOOR_Y = 132;       // top of the floor row the hero stands on
  const CEIL_Y = 20;
  const HERO_X = 108;        // the hero never moves; the corridor does
  const SCROLL = 1.15;

  // World x where the floor stops existing. Tuned so the walk ends at the lip.
  const GAP_X = HERO_X + WALK * SCROLL + 10;

  const INK = '#d8d5e8';
  const MUTED = '#6f6a90';

  function createIntro(onDone) {
    const biome = DS.Biomes.forDepth(1);
    const doll = DS.Paperdoll.bare();
    const state = {
      frame: 0,
      scroll: 0,
      fallDist: 0,
      fallSpeed: 0,
      shards: [],
      done: false
    };

    /* The camera is parked on the screen origin for the whole scene, so world
       space and screen space are the same thing here — the particle system and
       the shake both keep working without a map behind them. */
    DS.FX.clear();
    DS.R.setCam(C.W / 2, C.H / 2);

    function finish() {
      if (state.done) return;
      state.done = true;
      DS.Audio.stopMusic();
      onDone();
    }

    return {
      // Exposed so the scene can be inspected while it plays.
      state: state,

      update: function () {
        const In = DS.Input;
        state.frame++;
        DS.R.setCam(C.W / 2, C.H / 2);
        DS.FX.update();

        // Any key or click leaves. The prompt says so from the first second.
        if (state.frame > 12 && In.anyPressed()) {
          In.consume('confirm');
          In.consume('back');
          finish();
          return;
        }

        if (state.frame === 1) DS.Audio.setMusic('calm');

        const t = state.frame;
        if (t <= WALK) {
          state.scroll += SCROLL;
          // Footsteps, quiet and slow — this is a corridor, not a chase.
          if (t % 22 === 0) DS.Audio.play('land');
        } else if (t <= WALK + EDGE) {
          const into = t - WALK;
          // The stone starts complaining a beat before it goes.
          if (into === 6) DS.Audio.play('locked');
          if (into > 20 && into % 7 === 0) {
            DS.R.shake(1.5);
            DS.FX.dust(HERO_X + 4 + DS.rand.float(-6, 6), FLOOR_Y + 2, 2);
          }
          if (into === EDGE - 1) {
            DS.Audio.play('slam');
            DS.R.shake(6);
            // The floor leaves as a handful of tumbling slabs.
            state.shards = [0, 1, 2].map(function (i) {
              return {
                x: HERO_X - 8 + i * T, y: FLOOR_Y,
                vx: DS.rand.float(-0.6, 0.6), vy: DS.rand.float(0.4, 1.2),
                spin: DS.rand.float(-0.08, 0.08), angle: 0
              };
            });
          }
        } else if (t <= WALK + EDGE + FALL) {
          state.fallSpeed = Math.min(9.5, state.fallSpeed + 0.34);
          state.fallDist += state.fallSpeed;
          for (let i = 0; i < state.shards.length; i++) {
            const s = state.shards[i];
            s.vy += 0.3;
            s.x += s.vx;
            s.y += s.vy - state.fallSpeed;   // relative to the falling camera
            s.angle += s.spin;
          }
          if (t === WALK + EDGE + 2) DS.Audio.play('hurt');
        } else {
          const into = t - (WALK + EDGE + FALL);
          if (into === 1) {
            DS.Audio.play('slam');
            DS.R.shake(8);
            DS.R.flash('#ffffff', 8);
            DS.FX.dust(HERO_X + 4, FLOOR_Y + 6, 16);
          }
        }

        if (t >= TOTAL) finish();
      },

      draw: function () {
        const R = DS.R;
        R.begin();
        R.uiMode();

        const t = state.frame;
        const falling = t > WALK + EDGE && t <= WALK + EDGE + FALL;
        const landed = t > WALK + EDGE + FALL;

        drawShaft(R, biome, state, falling || landed);
        drawCorridor(R, biome, state, t);
        drawHero(R, doll, state, t);
        DS.FX.draw();
        drawTorchGlow(R, state, t);
        drawVignette(R);
        drawCaption(R, t);
        R.drawFlash();

        // Open on black and close on black, so the cut into depth 1 is clean.
        if (t < 26) R.fade(1 - t / 26);
        if (t > TOTAL - 26) R.fade((t - (TOTAL - 26)) / 26);

        if (t > 40 && t < TOTAL - 30) {
          const blink = Math.floor(t / 34) % 2 === 0;
          const hint = 'ANY KEY  -  SKIP';
          R.textSmall(hint, C.W - R.textSmallWidth(hint) - 6, C.H - 10,
                      blink ? MUTED : '#3a3654');
        }
      }
    };
  }

  /* The corridor: a wall behind, a floor underfoot, torches on the wall. The
     floor simply stops at GAP_X, which is the whole plot. */
  function drawCorridor(R, biome, state, t) {
    const tile = biome.tile;
    const scroll = state.scroll;
    /* Negative on purpose. The camera falls with the hero, so the corridor he
       just left has to rush UP the screen — offsetting it downward instead is
       what made him look like he was being lifted out of the pit. */
    const drop = t > WALK + EDGE ? -state.fallDist : 0;
    const startTile = Math.floor(scroll / T) - 1;

    for (let i = 0; i < C.W / T + 3; i++) {
      const worldX = (startTile + i) * T;
      const x = worldX - scroll;

      // Back wall, dimmed so the lit foreground reads in front of it.
      for (let y = CEIL_Y; y < FLOOR_Y; y += T) {
        R.sprAlphaS(tile.wall, x, y + drop, 0.34);
      }
      R.sprS(tile.wall, x, CEIL_Y - T + drop);

      // Floor, up to the edge of the pit.
      if (worldX < GAP_X) {
        R.sprS(tile.floor, x, FLOOR_Y + drop);
        R.sprAlphaS(tile.wall, x, FLOOR_Y + T + drop, 0.5);
      }

      // A torch every eight tiles is the only other light in the corridor.
      if ((startTile + i) % 8 === 0) {
        const frame = Math.floor(t / 7) % tile.torchFrames.length;
        R.sprS(tile.torchFrames[frame], x + 2, CEIL_Y + 18 + drop);
        glow(R, x + 6, CEIL_Y + 24 + drop, 30, 'rgba(242,193,78,0.10)');
      }
    }

    // The slabs that gave way, tumbling alongside the fall.
    for (let i = 0; i < state.shards.length; i++) {
      const s = state.shards[i];
      R.sprRot(biome.tile.floor, Math.round(s.x), Math.round(s.y), s.angle, false, 8, 8);
    }
  }

  /* While falling, the walls rush past as vertical streaks and the mouth of
     the pit shrinks to a coin of light overhead. */
  function drawShaft(R, biome, state, active) {
    if (!active) return;
    const dist = state.fallDist;

    R.rectS(0, 0, C.W, C.H, '#0b0910');
    for (let i = 0; i < 26; i++) {
      const seed = i * 37;
      const x = (seed * 7) % C.W;
      const speed = 6 + (seed % 5) * 3;
      // Streaks travel up past a falling camera, same reason as the corridor.
      const y = C.H + 30 - ((dist * speed + seed * 13) % (C.H + 60));
      const h = 10 + (seed % 4) * 8;
      const a = 0.05 + (seed % 3) * 0.03;
      R.rectS(x, y, 1, h, 'rgba(155,150,184,' + a.toFixed(2) + ')');
    }

    // The daylight-less equivalent of the surface: the hole you fell through.
    const mouthY = 26 - dist * 0.22;
    const r = Math.max(2, 26 - dist * 0.05);
    if (mouthY > -20) {
      glow(R, C.W / 2, mouthY, r * 2.2, 'rgba(242,193,78,0.16)');
      R.rectS(C.W / 2 - r, mouthY, r * 2, 2, 'rgba(242,193,78,0.30)');
    }
  }

  function drawHero(R, doll, state, t) {
    const S = DS.SPR;
    let sprite;
    let y = FLOOR_Y - 14;
    let angle = 0;

    if (t <= WALK) {
      sprite = doll.run[Math.floor(t * 0.22) % doll.run.length];
    } else if (t <= WALK + EDGE) {
      // Stopped at the lip, one step from the rest of the game.
      sprite = doll.idle[Math.floor(t / 22) % 2];
      const into = t - WALK;
      if (into > 34) y += Math.min(3, (into - 34) * 0.12);
    } else if (t <= WALK + EDGE + FALL) {
      sprite = doll.fall;
      y = FLOOR_Y - 30;
      angle = Math.sin(state.fallDist * 0.02) * 0.35;
    } else {
      sprite = doll.fall;
      y = FLOOR_Y - 6;
    }

    if (angle) {
      R.sprRot(sprite, HERO_X - 2, y, angle, false, 6, 8);
    } else {
      R.sprS(sprite, HERO_X - 2, y);
    }

    // The torch he is carrying — the only reason anything is visible at all.
    const frames = DS.SPR.tile.torchFrames;
    const flame = frames[Math.floor(t / 5) % frames.length];
    const tx = t <= WALK + EDGE ? HERO_X + 8 : HERO_X + 12 + Math.sin(t * 0.4) * 5;
    const ty = t <= WALK + EDGE ? y - 4 : y - 10 + Math.cos(t * 0.3) * 4;
    R.sprS(flame, tx, ty);
    state.torch = { x: tx + 4, y: ty + 6 };
  }

  function drawTorchGlow(R, state, t) {
    if (!state.torch) return;
    // The light gutters as he falls, which is what sells the fall.
    const shrink = t > WALK + EDGE ? M.clamp(1 - state.fallDist / 700, 0.45, 1) : 1;
    const flicker = 1 + Math.sin(t * 0.5) * 0.05;
    glow(R, state.torch.x, state.torch.y, 62 * shrink * flicker,
         'rgba(242,193,78,0.22)');
    glow(R, state.torch.x, state.torch.y, 26 * shrink, 'rgba(255,240,168,0.20)');
  }

  /* Darkness is the point of the scene, so it is composited last over the top
     of everything except the text. */
  /* The intro's darkness, as the post overlay instead of a painted gradient:
     the frame sinks toward the corners and the hero's torch is the middle. */
  function drawVignette(R) {
    if (!DS.UI3) return;
    DS.UI3.post.vignette = 0.9;
    DS.UI3.post.darken = 0.22;
  }

  const CAPTIONS = [
    { at: 24,  until: 96,  text: 'NO MAP RUNS THIS DEEP.' },
    { at: 104, until: WALK + 30, text: 'ONE TORCH. ONE WAY BACK.' },
    { at: WALK + EDGE + 20, until: TOTAL, text: 'THERE WAS NO WAY BACK.' }
  ];

  function drawCaption(R, t) {
    for (let i = 0; i < CAPTIONS.length; i++) {
      const cap = CAPTIONS[i];
      if (t < cap.at || t > cap.until) continue;
      // Fade in over the first half-second and out over the last.
      const inA = M.clamp((t - cap.at) / 22, 0, 1);
      const outA = M.clamp((cap.until - t) / 22, 0, 1);
      const a = Math.min(inA, outA);
      if (a <= 0.02) continue;
      R.textCenterAlpha(cap.text, C.W / 2, C.H - 30, INK, 1, a);
    }
  }

  /* Screen-space bloom: the tint carries the alpha, exactly like the old
     rgba() stop list did. */
  function glow(R, x, y, radius, color) {
    R.glow(x, y, radius, color, 1, true);
  }

  DS.Cutscene = { createIntro: createIntro };
})(window.DS);
