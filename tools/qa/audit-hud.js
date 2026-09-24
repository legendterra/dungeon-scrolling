#!/usr/bin/env node
/* The HUD is measured, not admired.
 *
 *   node tools/qa/audit-hud.js [base-url]
 *
 * The HUD had drifted into something that looked wrong everywhere at once: a
 * currency plate 78 units wide whose key row hung off its own bottom edge, skill
 * keycaps half cut off by the frame, a boss bar drawn on top of the health bar,
 * and a control sheet painted as a full-bleed band across three other clusters.
 * Every one of those was a hand-written coordinate, so no amount of staring at a
 * screenshot was going to stop the next one.
 *
 * src/ui/ui.js now has ONE table, hudBoxes(), and every cluster draws strictly
 * inside the box it is handed. This walks that table and then measures what the
 * HUD actually paints, through two hooks:
 *
 *   DS.UI3.quad -- every rect, panel, frame and sprite
 *   DS.UI3.text -- every glyph run, measured from the face metrics
 *
 * and asserts, for a bare HUD and for a deliberately overloaded one:
 *
 *   1. every box is inside the 320x180 frame with a real gutter
 *   2. no two boxes share a pixel
 *   3. every pixel the HUD paints lands inside a box  <- the real regression net
 *   4. the three bottom clusters share one baseline and one height
 *   5. the vitals are centred in the gap the corner clusters leave
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';

const W = 320, H = 180;
const MIN_GUTTER = 3;      // the frame's edge to the nearest HUD pixel
const SLACK = 1;           // a 1-unit overshoot is rounding, 3 is a bug

let failures = 0;

function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

/* Installed in the page once. `quad` is the only path rectS/panelS/sprS take and
   `text` is the only path any glyph takes, so between them these two record
   every pixel the HUD claims -- including the ones a table-based check would
   miss, which is exactly the class of bug this file exists for. */
const RECORDER = `(() => {
  if (window.__HUDREC) return true;
  const ui = DS.UI3;
  const origQuad = ui.quad;
  const origText = ui.text;
  let recs = null;

  ui.quad = function (tex, x, y, w, h) {
    if (recs) recs.push({ k: 'quad', x: x, y: y, w: w, h: h });
    return origQuad.apply(this, arguments);
  };
  ui.text = function (str, x, y, color, s, name) {
    if (recs) {
      s = s || 1;
      const t = String(str == null ? '' : str);
      let w, h;
      if (name === 'TITLE') { w = (t.length * 12 - 2) * s; h = 14 * s; }
      else if (name === 'MICRO') { w = t.length * 4 - 1; h = 5; }
      else { w = (t.length * 6 - 1) * s; h = 7 * s; }
      recs.push({ k: 'text', x: x, y: y, w: w, h: h });
    }
    return origText.apply(this, arguments);
  };

  window.__HUDREC = {
    start: function () { recs = []; },
    stop: function () { const r = recs || []; recs = null; return r; },
    restore: function () { ui.quad = origQuad; ui.text = origText; recs = null; }
  };
  return true;
})()`;

/* Builds the two states in the running game and hands back everything the audit
   needs: the layout table for each and every rect the HUD painted. */
const PROBE = `(() => {
  const g = DS.currentGame;
  const p = g.player;
  const saved = {
    keys: g.inv.keys, coins: g.inv.coins, shards: g.inv.shards, arrows: g.inv.arrows,
    boons: g.inv.boons, boss: g.boss, streak: g.streak, streakTimer: g.streakTimer,
    inWater: p.inWater, breath: p.breath, toastText: g.toastText,
    toastTimer: g.toastTimer, toastColor: g.toastColor, prompt: g.prompt,
    controlsTimer: g.controlsTimer, depth: g.depth, levelKind: g.levelKind,
    rigShow: DS.R3D.rig.show
  };

  /* Only the drawing is sampled, never the world render: hud() is pure layout
     plus a batch of quads, and the recorder sits underneath both of the paths
     those quads take. */
  const sample = function (label) {
    const boxes = DS.UI.hudBoxes(g);
    DS.UI.hud(g);
    return { label: label, boxes: boxes, drawn: window.__HUDREC.stop() };
  };

  // --- bare: nothing transient on screen at all -----------------------------
  g.inv.keys = 0; g.inv.boons = []; g.boss = null;
  g.streak = 0; g.streakTimer = 0;
  p.inWater = false; p.breath = 60 * 14;
  g.toastText = ''; g.toastTimer = 0;
  g.prompt = null; g.controlsTimer = 0;
  DS.R3D.rig.show = 0;
  window.__HUDREC.start();
  const bare = sample('bare');

  // --- busy: every optional cluster on at once ------------------------------
  g.inv.keys = 3;
  g.inv.coins = 9999;
  g.inv.shards = 12;
  g.inv.arrows = 0;
  g.inv.boons = Object.keys(DS.Boons.BY_KEY).slice(0, 7);
  g.boss = { name: 'THE STONE WARDEN', hp: 41, maxHp: 120,
             barColor: '#c86ee0', phase: 2, dead: false };
  g.streak = 9; g.streakTimer = DS.Boons.DECAY_FRAMES;
  p.inWater = true; p.breath = 90;
  g.toastText = 'A BOON SETTLES INTO YOU';
  g.toastTimer = 40; g.toastColor = '#f2c14e';
  g.prompt = { key: 'F', text: 'SEALED - KILL THE WARDEN' };
  g.controlsTimer = 90;
  DS.R3D.rig.show = 120;
  window.__HUDREC.start();
  const busy = sample('busy');

  // --- put the run back ------------------------------------------------------
  g.inv.keys = saved.keys; g.inv.coins = saved.coins; g.inv.shards = saved.shards;
  g.inv.arrows = saved.arrows; g.inv.boons = saved.boons;
  g.boss = saved.boss; g.streak = saved.streak; g.streakTimer = saved.streakTimer;
  p.inWater = saved.inWater; p.breath = saved.breath;
  g.toastText = saved.toastText; g.toastTimer = saved.toastTimer;
  g.toastColor = saved.toastColor; g.prompt = saved.prompt;
  g.controlsTimer = saved.controlsTimer; DS.R3D.rig.show = saved.rigShow;

  return [bare, busy];
})()`;

function insideBox(rect, box, slack) {
  return rect.x >= box.x - slack && rect.y >= box.y - slack &&
         rect.x + rect.w <= box.x + box.w + slack &&
         rect.y + rect.h <= box.y + box.h + slack;
}

function pct(n, d) { return (100 * n / d).toFixed(1) + '%'; }

function auditState(state) {
  const label = state.label;
  const boxes = state.boxes;
  const names = Object.keys(boxes);

  console.log('');
  console.log('--- ' + label + ' HUD (' + names.length + ' boxes, ' +
              state.drawn.length + ' painted rects) ---');

  // 1. every box inside the frame with a real gutter
  let bad = null;
  for (const n of names) {
    const b = boxes[n];
    if (b.w <= 0 || b.h <= 0) continue;
    const ok = b.x >= MIN_GUTTER && b.y >= MIN_GUTTER &&
               b.x + b.w <= W - MIN_GUTTER && b.y + b.h <= H - MIN_GUTTER;
    if (!ok) { bad = n + ' ' + JSON.stringify(b); break; }
  }
  check('every box is inside the frame with a ' + MIN_GUTTER + '-unit gutter', !bad, bad || '');

  // 2. no two boxes share a pixel
  let clash = null;
  let area = 0;
  for (let i = 0; i < names.length; i++) {
    const a = boxes[names[i]];
    if (a.w <= 0 || a.h <= 0) continue;
    area += a.w * a.h;
    for (let j = i + 1; j < names.length; j++) {
      const b = boxes[names[j]];
      if (b.w <= 0 || b.h <= 0) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0 && !clash) clash = names[i] + ' overlaps ' + names[j] +
        ' by ' + ox + 'x' + oy;
    }
  }
  check('no two boxes overlap', !clash, clash || '');

  // 3. every painted rect lands inside some box
  const strays = [];
  for (const r of state.drawn) {
    if (!(r.w > 0 && r.h > 0)) continue;
    if (r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H) {
      let hit = false;
      for (const n of names) {
        if (insideBox(r, boxes[n], SLACK)) { hit = true; break; }
      }
      if (!hit) strays.push(r);
    } else {
      strays.push(r);
    }
  }
  const worst = strays.slice(0, 4)
    .map((r) => r.k + ' ' + [r.x, r.y, r.w, r.h].join(',')).join('  |  ');
  check('every painted rect is inside a declared box', strays.length === 0,
        strays.length ? strays.length + ' stray: ' + worst : '');

  // 4. the bottom row is one row
  const band = [boxes.hands, boxes.vitals, boxes.skills];
  const sameTop = band.every((b) => b.y === band[0].y);
  const sameH = band.every((b) => b.h === band[0].h);
  check('hands, vitals and skills share one baseline and one height',
        sameTop && sameH, sameTop && sameH ? '' :
        band.map((b) => b.y + '+' + b.h).join(' / '));

  // 5. the vitals are centred in the gap the corners leave
  const left = boxes.vitals.x - (boxes.hands.x + boxes.hands.w);
  const right = boxes.skills.x - (boxes.vitals.x + boxes.vitals.w);
  check('the vitals sit centred between the two corner clusters',
        Math.abs(left - right) <= 2, 'gap ' + left + ' left, ' + right + ' right');

  console.log('  info  HUD claims ' + pct(area, W * H) + ' of the frame (' +
              area + ' of ' + (W * H) + ' units^2)');
  if (state.drawn.length) {
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (const r of state.drawn) {
      if (!(r.w > 0 && r.h > 0)) continue;
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    }
    console.log('  info  painted extent  x ' + minX + '..' + maxX +
                '  y ' + minY + '..' + maxY);
  }
}

async function main() {
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: URL });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2800);
    await session.eval(`localStorage.setItem('ds_name', 'HUDQA')`);
    await session.eval('DS.Scenes.play(null, { weapon: "sword" })');
    for (let i = 0; i < 100; i++) {
      if (await session.eval('!!(DS.currentGame && DS.currentGame.player)')) break;
      await cdp.sleep(200);
    }
    await cdp.sleep(1200);

    check('a run is live', await session.eval('!!(DS.currentGame && DS.currentGame.player)'));
    check('hudBoxes() is exported for measurement',
          await session.eval('typeof DS.UI.hudBoxes === "function"'));
    await session.eval(RECORDER);

    const states = await session.eval(PROBE);
    check('both HUD states were measured', !!states && states.length === 2);
    if (states) {
      for (const s of states) auditState(s);
    }
    await session.eval('window.__HUDREC && window.__HUDREC.restore()');
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0 ? 'PASS: the HUD draws only inside the boxes it declares'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('audit-hud: ' + err.message); process.exit(2); });
