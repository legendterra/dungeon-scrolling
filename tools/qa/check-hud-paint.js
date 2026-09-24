#!/usr/bin/env node
/* The HUD is where the table says it is, at any window size.
 *
 *   node tools/qa/check-hud-paint.js [base-url]
 *
 * audit-hud.js measures the DRAW CALLS -- what the HUD asks for. This measures
 * the FRAME -- what actually ended up on screen, at three window shapes,
 * including two that are not 16:9 (the ones that used to letterbox the play
 * frame down to 29% of the window).
 *
 * For each size it captures the composited page, decodes it, maps every
 * permanent HUD cluster from logical 320x180 coordinates through DS.UI3.view
 * into page pixels, and reports how much ink is in it. A cluster that renders
 * nothing is a cluster that has drifted off the frame, and this is the check
 * that notices; it also writes the capture to .freebuff/shots/ so a human can
 * look at the same frame the numbers came from.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';
const OUT = path.join(__dirname, '..', '..', '.freebuff', 'shots');

/* [width, height, label] -- 16:9, 4:3 and 1080p. */
const SIZES = [
  [1280, 720, '1280x720'],
  [1024, 768, '1024x768'],
  [1920, 1080, '1920x1080']
];

/* The clusters that are on screen whenever a run is live. Transient bands
   (boss, breath, toast, controls, prompt, camera) are deliberately left out:
   they are not painted in the sampled frame. */
const ZONES = ['plate', 'vitals', 'hands', 'skills', 'banner'];
const MIN_INK = 0.02;          // 2% of a box's pixels must differ from its own base

let failures = 0;

function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

/* Decode the capture in the page and measure each zone. Mapping goes through
   DS.UI3.view, the same numbers the renderer uses to place the frame in the
   window, so a letterboxed frame is measured where it really is. */
const MEASURE = (b64, zones) => `new Promise((resolve) => {
  const view = DS.UI3.view;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const px = function (x, y) {
      const i = (Math.round(y) * W + Math.round(x)) * 4;
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    };
    const boxes = DS.UI.hudBoxes(DS.currentGame);
    const out = {};
    for (const name of ${JSON.stringify(zones)}) {
      const b = boxes[name];
      const x0 = Math.max(0, view.x + b.x * view.scale);
      const y0 = Math.max(0, view.y + b.y * view.scale);
      const x1 = Math.min(W, view.x + (b.x + b.w) * view.scale);
      const y1 = Math.min(H, view.y + (b.y + b.h) * view.scale);
      const hist = {};
      let n = 0, sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const l = Math.round(px(x, y) / 16);
          hist[l] = (hist[l] || 0) + 1;
          sum += px(x, y); n++;
        }
      }
      let base = 0, best = 0;
      for (const k in hist) if (hist[k] > best) { best = hist[k]; base = Number(k) * 16; }
      let ink = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) if (Math.abs(px(x, y) - base) > 24) ink++;
      }
      out[name] = {
        px: Math.round(x1 - x0) + 'x' + Math.round(y1 - y0),
        mean: n ? +(sum / n).toFixed(1) : 0,
        ink: n ? +(ink / n).toFixed(3) : 0
      };
    }
    resolve({ scale: +view.scale.toFixed(3), frame: view.w + 'x' + view.h,
              win: W + 'x' + H, zones: out });
  };
  img.onerror = () => resolve(null);
  img.src = 'data:image/png;base64,' + ${JSON.stringify(b64)};
})`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
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
    // A key and hands full, so the plate is at its tallest and the hands at
    // their widest: the size the layout has to survive is the busy one.
    await session.eval(`(() => { DS.currentGame.inv.keys = 2; return true; })()`);

    for (const [w, h, label] of SIZES) {
      await session.cmd('Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await cdp.sleep(900);
      const shot = await session.cmd('Page.captureScreenshot',
        { format: 'png', fromSurface: true }, 30000);
      const file = path.join(OUT, 'hud-' + label + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));

      const m = await session.eval(MEASURE(shot.data, ZONES));
      console.log('');
      console.log('--- ' + label + '  window ' + (m ? m.win : '?') +
                  '  frame ' + (m ? m.frame : '?') + '  scale ' + (m ? m.scale : '?') + ' ---');
      if (!m) { check(label + ': the capture decoded', false); continue; }
      check(label + ': the frame does not letterbox the window to nothing',
            m.scale >= 0.5, 'scale ' + m.scale + ', frame ' + m.frame);

      let empty = [];
      const parts = [];
      for (const z of ZONES) {
        const s = m.zones[z];
        parts.push(z + ' ' + s.px + ' mean ' + s.mean + ' ink ' + s.ink);
        if (s.ink < MIN_INK) empty.push(z + ' (ink ' + s.ink + ')');
      }
      console.log('  info  ' + parts.join('   |   '));
      check(label + ': every permanent cluster is painted', empty.length === 0,
            empty.join(', '));
      console.log('  info  written ' + path.relative(path.join(__dirname, '..', '..'), file));
    }
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0 ? 'PASS: the HUD paints where the box table places it'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('check-hud-paint: ' + err.message); process.exit(2); });
