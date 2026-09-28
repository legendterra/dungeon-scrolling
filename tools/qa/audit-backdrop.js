#!/usr/bin/env node
/* Is the horizon actually there, on every floor, from every place on it?
 *
 *   node tools/qa/audit-backdrop.js [base-url] [--depths 1-10 | 11,14,22]
 *
 * The user's report, four times over: "the background never finishes, it does
 * not match the theme, and there is no light in it". Each of those is a
 * measurable statement, so this tool measures them instead of looking at a
 * screenshot and deciding:
 *
 *   STRUCTURE   all 13 recipes -- and every VARIANT of them, since the acts and
 *               the depth pick between those -- use the full seven-rung ladder,
 *               carry exactly one landmark, a texture family and a celestial
 *               body.
 *
 *   LIGHTS      the scene's light count is the same on every floor, every
 *               intensity is finite. The body in the sky is unlit geometry plus
 *               ONE re-aimed directional light, and this is the check that keeps
 *               it that way -- adding a lamp is what blacked the screen in
 *               v5.2.1, and nothing about a prettier sunset is worth that bug.
 *
 *   COVERAGE    from three places on the floor, a 4x3 grid of rays through the
 *               camera must ALL hit backdrop geometry. A gap in the far bands is
 *               exactly the "left/right/up/down" hole the user asked about, and
 *               a raycast finds it where a screenshot of one camera position
 *               would not.
 *
 *   THE BODY    the body projects inside the play frame over most of the walk,
 *               at a size you can see, and the pixels AROUND it are brighter
 *               than the same patch of sky on the other side of the frame. That
 *               last one is the difference between a light and a sticker.
 *               The body RIDES THE CAMERA (v6: the light is always ahead), so
 *               it is held against the camera's aim -- aim + its azimuth offset,
 *               in the horizon's own frame -- and against the OBJECT that
 *               carries it in the scene, because a report that drifts from the
 *               picture does not fail -- it measures empty sky and passes. And
 *               heroInfo(), the renderer's handle on it, must say the same.
 *
 *   BUDGET      the whole horizon draws in at most DS.Backdrop.drawBudget calls.
 *
 *   THE LADDER  seven rungs, near darker than far, texture on every rung out to
 *               19 units with texel density held constant, and the scene free of
 *               non-finite geometry -- plus what all of it costs in frame time.
 */

'use strict';

const cdp = require('../docs/cdp');
const BACKDROP_PAGE = require('./lib/backdrop-page');

const BASE = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';

/* Act I by default. --depths walks the other acts too ("11-30", "13,22,27"):
   they reuse the thirteen themes, but through their act and depth variants. */
function depthList(argv) {
  const i = argv.indexOf('--depths');
  if (i < 0 || !argv[i + 1]) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out = [];
  argv[i + 1].split(',').forEach(function (part) {
    const m = /^(\d+)-(\d+)$/.exec(part.trim());
    if (m) { for (let d = Number(m[1]); d <= Number(m[2]); d++) out.push(d); }
    else if (part.trim()) out.push(Number(part.trim()));
  });
  return out.filter(Number.isFinite);
}
const DEPTHS = depthList(process.argv);
/* Three places on the floor: hard left, the middle, and well short of the exit.
   0.92 was too far right -- it lands the player next to the floor's own door,
   and on a floor where they arrive inside it the run simply ENDS. A harness
   that ends the run quietly measures the game-over screen on every depth after
   it and reports the same frame mean eleven times (which is exactly what the
   first version of this tool did). */
const FRACS = [0.08, 0.46, 0.78];

let failures = 0, checks = 0;

function check(label, ok, detail) {
  checks++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

function info(label, detail) {
  console.log('  info  ' + label + (detail ? '   ' + detail : ''));
}

/* Put a fresh run back on this floor, and SAY SO.

   Every measurement in this tool is a measurement OF A RUNNING GAME: the frame
   loop is what moves the horizon, aims the camera and draws the light, and when
   the run ends the scene switches to the death screen, the loop stops, and the
   last frame simply stays on screen. A check taken then is a measurement of a
   game-over screen, and it fails for a reason that has nothing to do with the
   backdrop -- measured, repeatedly: the body pass read the body 1.4 frames wide
   of the frame edge because the CAMERA had stopped following a player the walk
   had teleported, and the horizon read as frozen nineteen units from the floor.
   The monsters are not part of what is being measured, so an ended run is
   restarted and the numbers are taken again -- never quietly: the restart is
   printed, with the state that caused it. */
async function ensureAlive(session, depth, why, force) {
  const a = await session.eval('window.__BQA.alive()');
  if (!force && a.live && !a.dead) return a;
  info('depth ' + depth + ': ' + why + ' (' + JSON.stringify(a) +
       '); restarting the floor and measuring it again');
  await session.eval(`window.__BQA.restart(${depth})`);
  await cdp.sleep(2200);
  await session.eval(`(() => { const g = DS.currentGame; g.depth = ${depth};
    DS.Game.loadLevel(g, 'normal'); return true; })()`);
  await cdp.sleep(1500);
  await session.eval(PRELUDE);
  return session.eval('window.__BQA.alive()');
}

/* Wait for the horizon to STOP moving, then answer where it landed.

   The renderer eases the line onto the player's ground at 0.22 every 8 frames,
   so a floor whose start is seventeen units off the built line needs about ten
   of those to come inside a unit -- and on the heaviest floors that is more than
   two seconds (depth 8 measured 40 fps with the horizon in the frame). A fixed
   sleep therefore fails on frame rate rather than on placement, which is not a
   property worth testing. So the wait is on CONVERGENCE: the error has to stop
   changing between samples. A line still sliding after the deadline is a real
   failure and is reported as one.

   ...SO THE WAIT IS FOR ARRIVAL, and the verdict is on the NUMBERS rather than
   on this loop's opinion of them. Two things a single pair of samples cannot
   tell apart from convergence, both of which cost a run to learn:

     - an ENDED run. If the frame loop stops, the last translation simply stays
       there -- nineteen units from a floor the player was teleported onto -- and
       it reads as perfectly steady. So a sample only counts while the frame
       counter is ADVANCING; `frozen` counts the samples where it did not, and
       the caller treats that as an ended run (restart it) rather than a horizon
       bug. The player also has to have stopped FALLING: the line lags a moving
       target by a fixed distance, which is steady too.

     - the EASING GAPS. Placement after a teleport is not instant and does not
       tick evenly: measured with a timeline probe, the line moves in bursts and
       sits still for 600-900 ms in between, so two samples 400 ms apart can
       both land in a gap and read as converged while the line is still 24 units
       out. Three samples IN A ROW inside the tolerance over at least 1.2 s is
       what this loop waits for -- but if the deadline passes first, the caller
       still decides on the error it was handed, because a line that is standing
       on the player's ground is not less correct for having taken its time.

   `best` is the smallest error seen, which is what the caller falls back to:
   the target is a MEDIAN of tile rows, so a player standing on a tile boundary
   can make it flicker by one row (1.6 units) for reasons that have nothing to
   do with the horizon. */
async function settledHorizon(session, ms) {
  const t0 = Date.now();
  const deadline = t0 + (ms || 12000);
  let hz = null, prevFrames = null, frozen = 0;
  let quiet = 0, quietSince = 0, best = null;
  while (Date.now() < deadline) {
    hz = await session.eval('window.__BQA.horizon()');
    const now = Date.now();
    if (hz && hz.err != null) {
      if (best === null || Math.abs(hz.err) < Math.abs(best)) best = hz.err;
      if (prevFrames !== null && hz.frames === prevFrames) {
        frozen++;
        if (frozen >= 2) {
          return { hz: hz, settled: false, ms: now - t0, frozen: frozen, best: best };
        }
      } else {
        frozen = 0;
      }
      prevFrames = hz.frames;
      if (Math.abs(hz.err) <= 0.75 && Math.abs(hz.vy) < 2) {
        if (!quietSince) quietSince = now;
        quiet++;
        if (quiet >= 3 && now - quietSince >= 1200) {
          return { hz: hz, settled: true, ms: now - t0, frozen: 0, best: best };
        }
      } else {
        quiet = 0;
        quietSince = 0;
      }
    }
    await cdp.sleep(250);
  }
  return { hz: hz, settled: false, ms: Date.now() - t0, frozen: frozen, best: best };
}

/* The in-page half -- the walk, the census, the raycast, the body projection --
   is shared with shoot-backdrop.js, which frames its contact sheet around the
   exact same helpers. See tools/qa/lib/backdrop-page.js. */
const PRELUDE = BACKDROP_PAGE.PRELUDE;

/* Measure a screenshot: the frame, and the body's patch against the same patch
   of sky on the other side of the frame. `v` is DS.UI3.view (CSS pixels). */
const PIXELS = (b64, view, bx, by, br) => `new Promise((resolve) => {
  const img = new Image();
  const V = ${JSON.stringify(view)};
  const bx = ${bx}, by = ${by}, br = ${br};
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const lum = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    let sum = 0, n = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) { const l = lum(i); sum += l; n++; if (l < 10) dark++; }
    const box = (px, py, rr) => {
      let s = 0, k = 0;
      const x0 = Math.max(0, Math.round(px - rr)), x1 = Math.min(c.width, Math.round(px + rr));
      const y0 = Math.max(0, Math.round(py - rr)), y1 = Math.min(c.height, Math.round(py + rr));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += lum((y * c.width + x) * 4); k++; }
      return k ? s / k : 0;
    };
    const px = V.x + (bx * 0.5 + 0.5) * V.w;
    const py = V.y + (1 - (by * 0.5 + 0.5)) * V.h;
    /* INSIDE the disc, and read as the BRIGHTEST of nine boxes across it.

       Two corrections over the first version, both of them measured mistakes:
       at 0.55 * the disc's radius the box reached past the body into whatever
       stands beside it -- a black ceiling band, for the six roofed themes, so
       the torch hall's furnace "measured" 11.9 while the roof on the far side
       measured 20.5. A single tight box at the exact centre is just as wrong in
       the other direction: the centre of a body hung in a ROOM can have a rock
       standing in front of it, which is a look, not a defect. Nine boxes spread
       over the disc, taking the brightest, answers the question that is
       actually being asked -- is there a light at the body's position. */
    const rr = Math.max(3, br * 0.16 * V.h);
    const step = Math.max(rr, br * 0.7 * V.h);
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const v = box(px + dx * step, py + dy * step, rr);
        if (v > best) best = v;
      }
    }
    const pxC = V.x + (-bx * 0.5 + 0.5) * V.w;
    resolve({
      mean: + (sum / n).toFixed(2), dark: + (dark / n * 100).toFixed(1),
      body: +best.toFixed(2), bodyCentre: +box(px, py, rr).toFixed(2),
      ctrl: +box(pxC, py, rr).toFixed(2),
      bodyPx: [Math.round(px), Math.round(py), Math.round(rr)],
      frame: [V.x, V.y, V.w, V.h]
    });
  };
  img.onerror = () => resolve(null);
  img.src = 'data:image/png;base64,' + ${JSON.stringify(b64)};
})`;

async function main() {
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: BASE });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2800);

    if (!(await session.eval('!!(DS.Backdrop && DS.R3D && DS.R3D.backdrop !== undefined)'))) {
      throw new Error('no DS.Backdrop on ' + BASE + ' -- is this the v5.2.2 build?');
    }

    console.log('');
    console.log('1. structure: every theme, the whole ladder, a body, a landmark, a texture');
    console.log('');

    const struct = await session.eval(`(() => {
      const B = DS.Backdrop, names = B.themeNames(), rungs = B.rungs.slice();
      return names.map(function (n) {
        const r = B.recipe(n), h = B.hero(n), c = B.curve(n), fit = B.heroFit(n);
        const ds = r.layers.map(function (l) { return l.d; }).sort(function (a, b) { return a - b; });
        const uniq = ds.filter(function (v, i) { return i === 0 || v !== ds[i - 1]; });
        return {
          name: n, layers: r.layers.length, rungs: uniq, want: rungs,
          badKind: r.layers.filter(function (l) { return !B.kinds[l.kind]; }).map(function (l) { return l.kind; }),
          solo: r.layers.filter(function (l) { return !!l.solo; }).length,
          tex: r.tex, badTex: !r.tex || !B.families[r.tex],
          hero: !!h, az: h && h.az, col: h && h.col,
          /* The body the builder will ACTUALLY hang: a room's radius is trimmed
             to the room (fitRoomHero). The check runs against that, not against
             the authored wish -- a wish is not what gets built. */
          r: fit.r, elev: fit.elev, wishR: h && h.r,
          gain: c && c.gain, ceil: r.ceiling ? r.ceiling.y : 0
        };
      });
    })()`);

    check('a recipe for every theme', struct.length === 13, struct.length + ' themes');

    /* Every variant is a horizon a floor can show, so every variant is held to
       the same ladder as the theme it belongs to. */
    const vars = await session.eval(`(() => {
      const B = DS.Backdrop, rungs = B.rungs.slice(), out = [];
      B.themeNames().forEach(function (n) {
        B.variants(n).forEach(function (v) {
          if (v.name === 'base') return;
          const ds = v.rec.layers.map(function (l) { return l.d; }).sort(function (a, b) { return a - b; });
          const uniq = ds.filter(function (x, i) { return i === 0 || x !== ds[i - 1]; });
          out.push({ name: n + '/' + v.name, full: uniq.join('/') === rungs.join('/'),
                     rungs: uniq.join('/'),
                     badKind: v.rec.layers.filter(function (l) { return !B.kinds[l.kind]; })
                       .map(function (l) { return l.kind; }),
                     solo: v.rec.layers.filter(function (l) { return !!l.solo; }).length,
                     badTex: !v.rec.tex || !B.families[v.rec.tex],
                     r: v.hero.r, az: v.hero.az });
        });
      });
      return out;
    })()`);
    for (const V of vars) {
      check(V.name + ': variant uses all rungs, real kinds, one landmark, a texture',
            V.full && V.badKind.length === 0 && V.solo === 1 && !V.badTex,
            'rungs ' + V.rungs + (V.badKind.length ? ' bad ' + V.badKind.join(',') : '') +
            ' solo ' + V.solo);
      check(V.name + ': variant body sized and centred', V.r >= 3 && V.az > 0.15 && V.az < 0.85,
            'r ' + V.r + ' az ' + V.az);
    }
    for (const T of struct) {
      const full = T.rungs.length === T.want.length && T.rungs.every((v, i) => v === T.want[i]);
      check(T.name + ': all ' + T.want.length + ' rungs used', full,
            'rungs ' + T.rungs.join('/'));
      check(T.name + ': every band kind exists', T.badKind.length === 0, T.badKind.join(','));
      check(T.name + ': exactly one landmark', T.solo === 1, T.solo + ' solo layers');
      check(T.name + ': a texture family', !T.badTex, String(T.tex));
      /* A room's light is a smaller disc hung above the eye line (v6); the
         open skies keep their big low bodies. */
      check(T.name + ': a celestial body', T.hero && Number.isFinite(T.r) && T.r >= (T.ceil ? 3 : 4),
            T.kindStr || (T.hero ? ('r=' + T.r + ' elev=' + T.elev + ' az=' + T.az) : 'none'));
      if (T.hero && T.r !== T.wishR) info(T.name + ' body trimmed to the room', 'wish r' + T.wishR + ' -> r' + T.r + ' elev' + T.elev);
      /* A disc centred at or below the floor line is a lamp inside the ground
         slab, and its halo is a smear under the terrain. */
      check(T.name + ': the body hangs above the floor',
            !T.hero || T.elev - T.r >= 0,
            'bottom ' + (T.elev - T.r).toFixed(2) + ' above the floor line');
      check(T.name + ': sky gain in range', T.gain >= 0.15 && T.gain <= 0.75, 'gain ' + T.gain);
      check(T.name + ': body hangs away from the frame edge', T.az > 0.15 && T.az < 0.85, 'az ' + T.az);
      if (T.ceil) {
        check(T.name + ': the body fits under the roof',
              T.elev + T.r <= T.ceil + 0.01,
              'top ' + (T.elev + T.r).toFixed(1) + ' <= ' + T.ceil);
      }
    }

    /* --- the ten floors a run actually visits --- */
    console.log('');
    console.log('2. live: ten floors, three places on each');
    console.log('');

    await session.eval(`localStorage.setItem('ds_name', 'BQA');`);
    await session.eval('DS.Scenes.play(null, { weapon: "sword" })');
    for (let i = 0; i < 100; i++) {
      if (await session.eval('!!(DS.currentGame && DS.currentGame.p)')) break;
      await cdp.sleep(200);
    }

    let lightCount = null;
    const curve = [];
    /* Every horizon shift seen this run, so the level-wide check at the end can
       tell "the line follows the terrain" from "the line was built right by
       luck and never moves". */
    const shifts = [];

    for (const depth of DEPTHS) {
      console.log('');
      await session.eval(`(() => { const g = DS.currentGame; g.depth = ${depth};
        DS.Game.loadLevel(g, 'normal'); return true; })()`);
      await cdp.sleep(1500);
      if (await session.eval('!(window.__BQA)')) await session.eval(PRELUDE);

      const expect = await session.eval(
        `(DS.Difficulty && DS.Difficulty.biomeForDepth(${depth}).theme) || '?'`);
      console.log('  depth ' + depth + '   expect ' + expect);

      const vals = await session.eval('window.__BQA.vals()');
      check('depth ' + depth + ': the builder reported a floor', !!vals);
      if (!vals) continue;
      check('depth ' + depth + ': the theme is the one the ladder asked for',
            vals.theme === expect, vals.theme);

      /* --- lights --- */
      const cen = await session.eval('window.__BQA.census()');
      if (lightCount === null) lightCount = cen.lights;
      check('depth ' + depth + ': no light is broken', cen.bad === 0, JSON.stringify(cen.by));
      check('depth ' + depth + ': the light budget did not move',
            cen.lights === lightCount, cen.lights + ' lights (boot ' + lightCount + ')');

      /* --- nothing non-finite --- */
      const bad = await session.eval('window.__BQA.finite()');
      check('depth ' + depth + ': every value in the horizon is finite',
            bad.length === 0, bad.join(','));

      /* --- the budget, and the renderer's handle on the light --- */
      const budget = await session.eval(`(() => {
        const r = DS.R3D.backdrop, B = DS.Backdrop3D;
        const a = B && B.heroInfo ? B.heroInfo() : null;
        const b = B && B.heroInfo ? B.heroInfo() : null;
        const real = window.__BQA.bodyReal();
        return { draws: r.draws, budget: DS.Backdrop.drawBudget, variant: r.variant,
                 same: !!a && a === b && a.worldPos === b.worldPos,
                 finite: !!a && [a.worldPos.x, a.worldPos.y, a.worldPos.z, a.intensity]
                   .every(Number.isFinite),
                 d: a && real ? +Math.hypot(a.worldPos.x - real.x, a.worldPos.y - real.y,
                                            a.worldPos.z - real.z).toFixed(3) : null };
      })()`);
      check('depth ' + depth + ': the horizon draws inside its budget',
            budget.draws > 0 && budget.draws <= budget.budget,
            budget.draws + ' draw calls (budget ' + budget.budget + ', variant ' + budget.variant + ')');
      check('depth ' + depth + ': heroInfo() is the body, finite, and allocation-free',
            budget.same && budget.finite && budget.d != null && budget.d <= 0.05,
            'same object ' + budget.same + ', finite ' + budget.finite + ', off the mesh by ' + budget.d);

      /* --- the ladder --- */
      const rungSet = Array.from(new Set(vals.rungs.map((r) => r.d)));
      check('depth ' + depth + ': the whole seven-rung ladder is used',
            rungSet.length === 7, rungSet.join('/'));
      check('depth ' + depth + ': one landmark, placed', vals.solo === 1, vals.solo + '');
      /* Aerial perspective, stated as what it is: a band further away has lost
         more of its OWN value to the sky than a band close by. It is not
         "far rungs are brighter" -- a near rock lit by the player's lamp can
         legitimately be the brightest thing in the frame. What has to hold is
         that distance = convergence toward the horizon. Clouds are excluded:
         they are above the horizon, not part of the value ladder. */
      const solid = vals.rungs.filter((r) => r.kind !== 'clouds');
      const n0 = solid[0], n1 = solid[solid.length - 1];
      const sky = vals.skyLum;
      const spread = Math.abs(n1.lum - n0.lum);
      check('depth ' + depth + ': distance pulls a band toward the sky',
            Math.abs(n1.lum - sky) <= Math.abs(n0.lum - sky),
            'sky ' + sky + ': near rung ' + n0.lum + ' (' + Math.abs(n0.lum - sky) +
            ' off), far rung ' + n1.lum + ' (' + Math.abs(n1.lum - sky) + ' off)');
      check('depth ' + depth + ': and the ladder still separates them',
            spread >= 8, 'near ' + n0.lum + ' vs far ' + n1.lum + ' = ' + spread + ' apart');
      const wantTex = vals.rungs.filter((r) => r.d <= 19 && !r.glow).length;
      check('depth ' + depth + ': texture on every near rung',
            vals.texed >= wantTex, vals.texed + ' textured rungs');
      let repOk = true, repWhy = '';
      for (const r of vals.rungs) {
        if (!r.tex) continue;
        const want = Math.round(r.mean * r.k / 2.4);
        if (Math.abs(r.texRep - Math.max(1, Math.min(16, want))) > 1) {
          repOk = false; repWhy = r.kind + ' rep ' + r.texRep + ' want ' + want;
        }
      }
      check('depth ' + depth + ': texel density held constant up the ladder',
            repOk, repWhy);

      /* --- the body, three places on the floor ---
         The far ends of a 200-tile floor are NOT where a body hanging over the
         middle is expected to be on screen, so the walk samples are the two
         ends plus the body's own azimuth: the middle one is the one that has to
         hold, and the ends are reported. */
      await ensureAlive(session, depth, 'the run was already over when the body was measured');
      const az = vals.hero.az;
      let onScreen = 0, rads = [], atAz = null, bodyWalk = null;
      for (const f of [0.08, az, FRACS[2]]) {
        /* The middle sample is "under the body", which is a COLUMN, not a
           fraction of the floor: the body is authored at an azimuth of a span
           that is 90% of the floor centred on its middle, so the two are up to
           six units apart. underBody() takes the column off the live object. */
        const walk = f === az ? await session.eval('window.__BQA.underBody()')
                              : await session.eval(`window.__BQA.frac(${f})`);
        if (f === az) bodyWalk = walk;
        await cdp.sleep(420);
        const b = await session.eval('window.__BQA.body()');
        if (!b) { check('depth ' + depth + ': a body to project', false, 'none at ' + f); break; }
        if (b.onScreen) onScreen++;
        rads.push(b.rad);
        if (f === az) atAz = b;
      }
      check('depth ' + depth + ': the body is in frame from under it',
            !!(atAz && atAz.onScreen),
            atAz ? ('ndc ' + atAz.x + ',' + atAz.y + '   visible at ' + onScreen + '/3 of the walk')
                 : 'not projected');
      check('depth ' + depth + ': it is big enough to read',
            !!(atAz && atAz.rad >= 0.05),
            'screen radius ' + (atAz ? atAz.rad : 0) + ' of the frame half-height');

      /* --- the report against the object, and both against the floor ---
         Two checks, because they fail for different reasons and the pair of
         them is what would have caught the bug that hid the light of every
         roofed theme for a whole round of testing.

         The first is the INVARIANT: a body is authored at an azimuth, a
         fraction of the floor's width, and it has to be found there -- on the
         floor's mid-line, in the horizon group's own frame (so a turned camera
         cannot excuse it). A body parented one rig short sits half a floor to
         the left of this line and can never be excused.

         The second is the AGREEMENT: the numbers this tool projects have to be
         the numbers of the mesh that is actually in the scene. A report is only
         as good         as the object it describes, and for the whole of this rework the
         report described the placement arithmetic rather than the placement, so
         every pixel measurement below was taken of empty sky and PASSED. It is
         skipped, loudly, when the camera is turned: the report's world numbers
         are only world while the group is unturned.

         THE COMPARISON IS IN THE GROUP'S OWN SPACE, NOT THE WORLD'S. The
         renderer now slides the whole horizon group up and down every frame so
         that it follows the ground the player is walking on, so a world-space
         comparison measures the horizon drift, not a placement bug, and drifts
         on exactly the floors with the roughest terrain. Inverting the group's
         own transform (worldToLocal) removes that drift -- and the build-time
         rotation -- leaving the placement itself, which is the thing under
         test. */
      const grip = await session.eval(`(() => {
        const r = DS.R3D.backdrop;
        if (DS.Backdrop3D && DS.Backdrop3D.heroInfo) DS.Backdrop3D.heroInfo();   // follow this camera
        const real = window.__BQA.bodyReal();
        if (!r || !r.hero || !real) return null;
        const h = r.hero, cam = DS.R3D.camera, tg = DS.R3D.themeGroup;
        /* The camera's aim: where its view crosses the actor plane, in the
           horizon's own frame -- the line the body rides. */
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        const aim = cam.position.clone().addScaledVector(dir, -cam.position.z / dir.z);
        tg.worldToLocal(aim);
        const span = h.room ? DS.Backdrop.heroSpan.room : DS.Backdrop.heroSpan.sky;
        return { dx: +(real.gx - h.worldX).toFixed(2), dz: +(real.gz - h.z).toFixed(2),
                 dy: h.worldY == null ? null : +(real.gy - h.worldY).toFixed(2),
                 gx: real.gx, gz: real.gz,
                 wantGx: +(aim.x + (h.az - 0.5) * span).toFixed(2),
                 room: !!h.room, az: h.az, wu: r.wu,
                 yaw: +DS.R3D.rig.yaw.toFixed(4) };
      })()`);
      if (!grip) {
        check('depth ' + depth + ': the body can be found in the scene', false,
              'no mesh of the reported radius');
      } else {
        check('depth ' + depth + ': the body rides ahead of the camera, at its azimuth',
              Math.abs(grip.gx - grip.wantGx) <= 0.25,
              'group x ' + grip.gx + ' want ' + grip.wantGx +
              ' (the aim + azimuth ' + grip.az + ')' +
              (grip.room ? ' in a room' : ' in the sky'));
        if (Math.abs(grip.yaw) < 1e-6) {
          check('depth ' + depth + ': the report describes the object that is on screen',
                Math.abs(grip.dx) <= 0.05 && Math.abs(grip.dz) <= 0.05 &&
                (grip.dy == null || Math.abs(grip.dy) <= 0.05),
                'report vs object (group space): dx ' + grip.dx + ' dy ' + grip.dy +
                ' dz ' + grip.dz +
                (grip.dy == null ? ' (a sky body: no fixed height)' : ' (a room body)'));
        } else {
          info('depth ' + depth + ' report/object agreement skipped  the camera is turned ' +
               grip.yaw + ' rad, and the report\'s world numbers are build-time');
        }
      }

      /* If the run ended while the body was being measured, put a fresh one on
         the same floor: a harness that measures a game-over screen and calls it
         "the backdrop" is worse than one that fails loudly. */
      let alive0 = await ensureAlive(session, depth, 'the run ended during the body pass');
      check('depth ' + depth + ': the run survived the walk',
            alive0.live && !alive0.dead, JSON.stringify(alive0));

      /* --- does the horizon stand on the ground the player is actually on? ---

         The horizon is built around a MEDIAN ground row taken over the WHOLE
         level, and this game's levels are not flat: measured across depths 1..10
         the ground wanders 6 to 20 tiles around that line. The renderer now
         translates the group every frame to follow a window around the player,
         so the check is not "the shift is zero" -- that is what broke it -- but
         "the line is on the player's own ground". Two places on the floor, well
         apart, because a shift that only works where the level happens to be
         level is not a fix. The 2.4 s wait is the renderer's own easing (0.22
         every 8 frames), not slack: at a run this fast it converges to about a
         quarter of a world unit, and the tolerance below is four times that. */
      for (const f of [0.08, 0.78]) {
        let got = null;
        /* Two attempts, because the first can honestly lose the run: eighteen
           seconds of standing still on depth 7 is eighteen seconds of being shot
           at, and a stopped frame loop is not a placement failure. The second
           attempt re-loads the floor and walks it again -- and the harness SAYS
           so, so an ended run is never quietly averaged away. */
        for (let attempt = 1; attempt <= 2; attempt++) {
          await session.eval(`window.__BQA.frac(${f})`);
          got = await settledHorizon(session);
          if (got.hz && !got.frozen) break;
          /* Forced: the frame loop is stopped, so the floor is reloaded even if
             the run still reports itself alive (a paused game reads that way). */
          await ensureAlive(session, depth,
            'the frame loop stopped while the horizon settled at ' + f, true);
        }
        const hz = got.hz;
        if (!hz) {
          check('depth ' + depth + ': the horizon can be measured at ' + f, false, 'no group');
          break;
        }
        shifts.push({ depth: depth, at: f, shift: hz.shift, err: hz.err });
        /* The verdict is on the numbers: the line has to have STOOD on the
           player's ground inside the window it was watched for. A line still on
           its way out of a teleport at the deadline is a failure, and so is one
           that never got closer than a world unit, but a flickering median is
           not -- see settledHorizon. */
        const onGround = hz.err != null && Math.abs(hz.err) <= 0.75;
        const reached = got.best != null && Math.abs(got.best) <= 0.75;
        check('depth ' + depth + ': the horizon stands on the ground under the player at ' + f,
              !got.frozen && onGround && reached,
              'ground line ' + hz.top + ' vs the player\'s ground ' + hz.local +
              ' (built around ' + hz.anchorY + ', shifted ' + hz.shift + ', best ' + got.best +
              ', ' + (got.settled ? 'settled' : 'watched') + ' for ' +
              (got.ms / 1000).toFixed(1) + 's' + (got.frozen ? ', FRAME LOOP STOPPED' : '') + ')');
      }

      /* --- coverage, three places on the floor ---

         Live again first: the horizon pass above stands still for seconds at a
         time on floors that shoot back, and a coverage raycast against a stopped
         scene is a raycast against a camera that is no longer being aimed. */
      await ensureAlive(session, depth, 'the run ended while the horizon settled');
      let miss = 0, rays = 0, firstGap = null;
      for (const f of FRACS) {
        await session.eval(`window.__BQA.frac(${f})`);
        await cdp.sleep(320);
        const c = await session.eval('window.__BQA.cover()');
        miss += c.miss; rays += c.total;
        if (c.first && !firstGap) firstGap = 'at ' + f + ' ndc ' + c.first.join(',');
      }
      check('depth ' + depth + ': no hole in the horizon anywhere',
            miss === 0, miss + '/' + rays + ' rays missed' + (firstGap ? ' ' + firstGap : ''));

      /* --- the pixels: the body must be a light, not a sticker ---
         Shot from UNDER the body (frac = its own azimuth), not from the middle
         of the floor: at the floor's middle the body hangs off to one side, and
         on a floor where the walking surface is higher or lower than the anchor
         the projection and the picture stop agreeing about where "under it" is. */
      /* The pixel pass wants a FAIR vantage point: in front of the body and with
         the level's own rock out of the line of sight. If no column near the
         body has a clear view the check still runs -- and still fails -- so this
         cannot be used to excuse a horizon that is not there. */
      await ensureAlive(session, depth, 'the run ended during the coverage pass');
      bodyWalk = await session.eval('window.__BQA.vantage(8)');
      await cdp.sleep(500);
      const alive = await session.eval('window.__BQA.alive()');
      check('depth ' + depth + ': the run is still on screen',
            alive.live && !alive.dead, JSON.stringify(alive));
      /* Projected HERE, not remembered from the walk: a stale projection measures
         the wrong patch of a frame that has moved under it, which is how a
         5.5-vs-5.5 reading of pure darkness happened at depth 2. */
      const body = await session.eval('window.__BQA.body()');
      const view = await session.eval('DS.UI3.view');
      const shot = await session.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true }, 30000);
      const px = await session.eval(PIXELS(shot.data, view, body.x, body.y, body.rad));
      if (!px) {
        check('depth ' + depth + ': the frame measured', false, 'no image');
      } else {
        check('depth ' + depth + ': the frame is not a dark room',
              px.mean >= 16 && px.dark <= 74, 'mean ' + px.mean + ', dark ' + px.dark + '%');
        /* The body must be a BRIGHT OBJECT IN THE FRAME, and the reference for
           that is the frame's own average -- not the patch mirrored across it.
           The mirror was the first version's reference and it is degenerate:
           this tool now shoots from directly under the body, so the mirrored
           patch IS the body's patch and the ratio comes back at 1.000. It also
           fails for the right reason on a theme whose glow wall lights the whole
           width of the sky, which is not a defect, it is the point. */
        const bodyOk = px.body >= px.mean * 1.25;
        check('depth ' + depth + ': the body is a bright object in the frame', bodyOk,
              'body ' + px.body + ' (' + px.bodyCentre + ' at its centre) vs frame mean ' +
              px.mean + ', opposite side ' + px.ctrl +
              '   at ' + px.bodyPx.join(',') + ' of ' + px.frame.join(','));
        /* A dark reading is either "the body is not there" or "the body is not
           where the harness looked", and the numbers above cannot tell them
           apart. So on failure the harness draws the frame the RENDERER
           produced -- readPixels, not a screenshot -- with the body's projected
           cell marked. A picture settles in one line what a ratio of two
           luminance means can argue about for a while. */
        if (!bodyOk) {
          await session.eval('window.__BQA.arm()');
          await cdp.sleep(160);
          const map = await session.eval('window.__BQA.map(46, 20)');
          const scan = await session.eval('window.__BQA.scan()');
          const said = await session.eval('window.__BQA.body()');
          const real = await session.eval('window.__BQA.bodyReal()');
          const cam = await session.eval(
            '({ cam: DS.R3D.camera.position.toArray().map(function (v) { return +v.toFixed(1); }),' +
            '   anchorY: +DS.R3D.backdrop.anchorY.toFixed(1), yaw: DS.R3D.rig.yaw })');
          console.log('    the walk      ' + JSON.stringify(bodyWalk) +
                      (bodyWalk && bodyWalk.blocked ? '  the LEVEL itself is in the way' : ''));
          console.log('    the report    ' + JSON.stringify(said));
          console.log('    the object    ' + JSON.stringify(real));
          console.log('    the camera    ' + JSON.stringify(cam));
          console.log('    the screenshot said  body ' + px.body + ' (centre ' + px.bodyCentre +
                      ')  mean ' + px.mean + '  at ' + px.bodyPx.join(','));
          console.log('    the framebuffer says ' + JSON.stringify(scan));
          console.log('    the frame     ' + map.size + ', the body projected to cell ' +
                      (map.body ? map.body.join(',') : 'nowhere in frame'));
          console.log(map.text.replace(/^/gm, '      '));
          if (map.body) {
            console.log('      ' + ' '.repeat(map.body[0]) + '^ body cell, row ' + map.body[1]);
          }
        }
        curve.push({ depth: depth, theme: vals.theme, mean: px.mean, dark: px.dark,
                     body: px.body, ctrl: px.ctrl, hero: body.col });
      }

      /* --- what it costs --- */
      const perf = await session.eval('window.__BQA.perf()');
      info('depth ' + depth + ' perf  ' + perf.on + ' fps with the horizon, ' +
           perf.off + ' without (' + perf.ratio + 'x)');
      check('depth ' + depth + ': the horizon does not own the frame budget',
            perf.ratio >= 0.4, 'ratio ' + perf.ratio);

      const hero = vals.hero;
      info('depth ' + depth + '  ' + vals.theme + '   gain ' + vals.gain +
           '   ' + hero.kind + ' ' + hero.col + ' r' + hero.r + ' elev' + hero.elev +
           (hero.clamped ? ' (clamped under the roof)' : '') +
           '   ' + vals.instances + ' band objects in ' + vals.layers + ' rungs');
    }

    /* A horizon that never leaves the line it was built on is the bug this
       rework removed, and on a level whose terrain happens to BE the median it
       would pass every check above by luck. So the run has to show the line
       moving, somewhere, by more than the tolerance. */
    const moved = shifts.filter((s) => Math.abs(s.shift) > 1);
    info('the horizon against the built line  ' +
         shifts.map((s) => 'd' + s.depth + '@' + s.at + ' ' + s.shift).join('  '));
    check('the horizon moves to meet the terrain it is standing on', moved.length > 0,
          moved.length + ' of ' + shifts.length + ' samples more than a unit off the built line');

    console.log('');
    console.log('3. the run\'s light curve, measured off the pixels');
    console.log('');
    console.log('   depth  theme       frame mean   dark %   body   opposite');
    for (const c of curve) {
      console.log('   ' + String(c.depth).padEnd(7) + c.theme.padEnd(12) +
                  String(c.mean).padStart(8) + String(c.dark).padStart(11) +
                  String(c.body).padStart(9) + String(c.ctrl).padStart(11));
    }
    const means = curve.map((c) => c.mean);
    check('the run uses more than one light level',
          Math.max.apply(null, means) - Math.min.apply(null, means) > 6,
          'the curve runs ' + Math.min.apply(null, means) + ' to ' + Math.max.apply(null, means));
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0
    ? 'PASS: ' + checks + ' checks -- every floor has a lit horizon, rung for rung'
    : 'FAIL: ' + failures + ' of ' + checks + ' checks failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('audit-backdrop: ' + err.message); process.exit(2); });
