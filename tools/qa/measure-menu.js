#!/usr/bin/env node
/* What the menu frame actually contains.
 *
 *   node tools/qa/measure-menu.js [base-url]
 *
 * The menu's clearing can be drawn two ways: the 3D diorama (scenes/camp3d.js)
 * or the painted forest it falls back to. A screenshot cannot tell you whether
 * the diorama built -- a black rectangle and a very dark clearing look alike at
 * a glance -- so this measures the composited frame twice, once with the
 * diorama forced off, and reports both.
 *
 * The numbers are read out of the browser rather than decoded here: the PNG the
 * page is captured into is handed straight back to the page as an <img>, drawn
 * onto a 2D canvas, and its pixels counted. No image libraries, no guessing.
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';

let failures = 0;

function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

/* Mean luminance, the share of near-black pixels, and the share of warm bright
   pixels (the fire): enough to tell "lit clearing" from "black rectangle". */
const STATS = (b64) => `new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0, dark = 0, warm = 0, sky = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const l = r * 0.299 + gg * 0.587 + b * 0.114;
      sum += l; n++;
      if (l < 10) dark++;
      if (r > gg + 25 && r > 90) warm++;
      if (b > r + 6 && l > 20 && l < 90) sky++;
    }
    resolve({ w: c.width, h: c.height, mean: +(sum / n).toFixed(2),
              dark: +(dark / n * 100).toFixed(2),
              warm: +(warm / n * 100).toFixed(3),
              cool: +(sky / n * 100).toFixed(3) });
  };
  img.onerror = () => resolve(null);
  img.src = 'data:image/png;base64,' + ${JSON.stringify(b64)};
})`;

async function frame(session) {
  const shot = await session.cmd('Page.captureScreenshot',
    { format: 'png', fromSurface: true }, 30000);
  return session.eval(STATS(shot.data));
}

async function main() {
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: URL });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2800);
    await session.eval(`localStorage.setItem('ds_name', 'PROBE');`);
    await session.eval('DS.Scenes.menu()');
    await cdp.sleep(1400);

    const ready = await session.eval('!!(DS.Camp3D && DS.Camp3D.ready)');
    check('the diorama built', ready);
    check('the screen layer is live', await session.eval('!!(DS.UI3 && DS.UI3.ready)'));

    const threeD = await frame(session);
    console.log('  info  screen coordinate frame   ' + JSON.stringify(threeD));
    check('the 3D menu is not a black frame', threeD && threeD.mean > 6,
          threeD ? 'mean luminance ' + threeD.mean : 'no frame');
    check('and it is not blown out either', threeD && threeD.mean < 120,
          threeD ? 'mean luminance ' + threeD.mean : 'no frame');
    check('the fire is in the frame', threeD && threeD.warm > 0.02,
          threeD ? threeD.warm + '% warm pixels' : 'no frame');

    /* The control: the same screen with the diorama taken away must fall back
       to the painted forest, and the two frames must measurably differ --
       otherwise "the diorama is on" is a claim about a flag, not about pixels. */
    await session.eval('window.__camp = DS.Camp3D; delete DS.Camp3D; DS.Scenes.menu()');
    await cdp.sleep(1200);
    const flat = await frame(session);
    console.log('  info  painted fallback frame     ' + JSON.stringify(flat));
    check('the fallback draws too', flat && flat.mean > 6,
          flat ? 'mean luminance ' + flat.mean : 'no frame');

    if (threeD && flat) {
      const delta = Math.abs(threeD.mean - flat.mean);
      check('the two frames are measurably different', delta > 0.8,
            'mean luminance differs by ' + delta.toFixed(2));
      // The fire is a real light in the diorama, so it warms more of the
      // frame than the painted glow, which is a couple of blitted gradients.
      check('the fire lights more of the diorama than of the painting',
            threeD.warm > flat.warm,
            'warm ' + threeD.warm + '% vs ' + flat.warm + '%');
    }

    await session.eval('(() => { DS.Camp3D = window.__camp; return true; })()');
    await session.shoot('assets/preview/menu-measured.png');
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0 ? 'PASS: the menu frame is lit, and the diorama is what lights it'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('measure-menu: ' + err.message); process.exit(2); });
