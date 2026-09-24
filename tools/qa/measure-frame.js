#!/usr/bin/env node
/* What the play frame actually covers, at every window size that matters.
 *
 *   node tools/qa/measure-frame.js [base-url]
 *
 * The frame is the game's 16:9 play area inside the window (ui3/screen.js
 * fitScale, the one place its scale is decided). A window that is not 16:9
 * always leaves a gutter on one axis -- that is geometry, not a bug. What this
 * checks is the other axis, the one the scale was limited by: it must be filled
 * completely. Before this tool existed the rule was "whole multiples of C.RS
 * only", so a 1366x660 window got a 640x360 game -- 24% of the window, with the
 * rest of the binding axis thrown away to rounding.
 *
 * The "old" columns recompute that previous rule from the same live numbers, so
 * the comparison is measured rather than remembered.
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';

/* Windows display scaling, an exact 16:9 screen, and two common laptop sizes. */
const SIZES = [
  [1280, 630], [1366, 660], [1536, 756], [1600, 800],
  [1904, 985], [1920, 1080], [2560, 1440], [3440, 1440], [1024, 768]
];

const PROBE = `(() => {
  const v = DS.UI3.view;
  return { vw: window.innerWidth, vh: window.innerHeight,
           scale: v.scale, x: v.x, y: v.y, w: v.w, h: v.h };
})()`;

/* Area the frame covers, as a percentage of the window. */
function area(fw, fh, vw, vh) { return Math.round(100 * fw * fh / (vw * vh)); }

async function main() {
  const { session, close } = await cdp.launch({ width: 1600, height: 900, url: URL });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2600);                      // boot + first frames
    if (!(await session.eval('!!(DS.UI3 && DS.UI3.ready)'))) {
      throw new Error('the screen layer never came up on ' + URL);
    }

    console.log('window       frame        scale  int  gutter   filled-axis  area now   area before');
    let fail = 0;
    for (const [w, h] of SIZES) {
      await session.cmd('Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await cdp.sleep(350);
      const g = await session.eval(PROBE);
      const fx = g.w / g.vw, fy = g.h / g.vh;
      /* scale = min(...), so the smaller ratio is the axis that must be 100%. */
      const filled = Math.max(fx, fy) * 100;
      /* The rule this replaced: the largest whole multiple of 2 that fits. */
      const fill = Math.min(g.vw / 320, g.vh / 180);
      const oldWhole = Math.floor(fill / 2) * 2;
      const oldScale = oldWhole >= 2 ? oldWhole : fill;
      const oldW = Math.round(320 * oldScale), oldH = Math.round(180 * oldScale);
      const ok = filled >= 99;
      if (!ok) fail++;
      console.log(
        (w + 'x' + h).padEnd(13) +
        (g.w + 'x' + g.h).padEnd(13) +
        g.scale.toFixed(3).padEnd(7) +
        (Number.isInteger(g.scale) ? 'yes' : 'no ').padEnd(5) +
        (Math.round(g.x) + '/' + Math.round(g.y)).padEnd(9) +
        (filled.toFixed(1) + '%').padEnd(13) +
        (area(g.w, g.h, g.vw, g.vh) + '%').padEnd(11) +
        Math.round(100 * oldW * oldH / (w * h)) + '%');
    }
    await session.cmd('Emulation.clearDeviceMetricsOverride', {});

    console.log('');
    console.log(fail === 0
      ? 'PASS: every window fills the axis its scale was limited by'
      : 'FAIL: ' + fail + ' window(s) leave part of the binding axis to rounding');
    process.exitCode = fail === 0 ? 0 : 1;
  } finally {
    await close();
  }
}

main().catch((err) => { console.error('measure-frame: ' + err.message); process.exit(2); });
