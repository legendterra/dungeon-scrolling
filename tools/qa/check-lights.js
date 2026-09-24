#!/usr/bin/env node
/* Elemental effects must not be able to darken the frame.
 *
 *   node tools/qa/check-lights.js [base-url] [depth]
 *
 * This exists because of a real report: "casting an elemental skill makes the
 * screen go dark". The cause was one NaN. The element rig's glow was phased off
 * a part that had no phase, so `Math.sin(NaN)` produced NaN, that NaN was
 * written to a point light's intensity, and a NaN light poisons the shading of
 * every lit material -- which is a black screen, not a dim one. It only showed
 * up on the three elements that glow (fire, lightning, poison).
 *
 * So the check is in two halves, and both are needed:
 *
 *   1. EXACT -- after every element lands, every point light's intensity is a
 *      finite number. This is the bug itself; it is deterministic and cannot be
 *      flaky.
 *   2. VISIBLE -- the composited frame does not get darker when the field lands.
 *      Measured from the actual pixels, because "the light count is the same" is
 *      exactly the kind of true statement that hid this bug the first time.
 */

'use strict';

const cdp = require('../docs/cdp');

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://127.0.0.1:8123/';
const DEPTH = Number(process.argv[3] || 4);
/* The elements that carry a light, plus a couple that do not, because a
   regression here is as likely to be a new element as an old one. */
const ELEMENTS = ['fire', 'lightning', 'poison', 'ice', 'water', 'earth', 'leaf', 'wind'];

let failures = 0;

function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures++;
}

const FRAME = (b64) => `new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      sum += l; n++;
      if (l < 10) dark++;
    }
    resolve({ mean: +(sum / n).toFixed(2), dark: +(dark / n * 100).toFixed(1) });
  };
  img.onerror = () => resolve(null);
  img.src = 'data:image/png;base64,' + ${JSON.stringify(b64)};
})`;

const BAD_LIGHTS = `(() => {
  const bad = [];
  DS.R3D.scene.traverse(function (o) {
    if (!o.isLight) return;
    if (!Number.isFinite(o.intensity) || (!Number.isFinite(o.position.x))) {
      bad.push({ type: o.type, i: String(o.intensity), x: o.position.x });
    }
  });
  return bad;
})()`;

async function frame(session) {
  const s = await session.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true }, 30000);
  return session.eval(FRAME(s.data));
}

async function main() {
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: URL });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await cdp.sleep(2800);
    await session.eval(`localStorage.setItem('ds_name', 'LIGHTQA');`);
    await session.eval('DS.Scenes.play(null, { weapon: "sword" })');
    for (let i = 0; i < 100; i++) {
      if (await session.eval('!!(DS.currentGame && DS.currentGame.p)')) break;
      await cdp.sleep(200);
    }
    await session.eval(`(() => { const g = DS.currentGame; g.depth = ${DEPTH};
      DS.Game.loadLevel(g, 'normal'); return true; })()`);
    await cdp.sleep(1600);

    const base = await frame(session);
    check('the floor renders', base && base.mean > 5, JSON.stringify(base));
    check('no light is already broken', (await session.eval(BAD_LIGHTS)).length === 0);

    for (const el of ELEMENTS) {
      await session.eval(`(() => { const g = DS.currentGame, p = g.player;
        DS.Elements.spawnField(g, p.x + 40, p.y + 4, '${el}', 2); return true; })()`);
      await cdp.sleep(600);
      const bad = await session.eval(BAD_LIGHTS);
      check(el + ': every light has a finite intensity', bad.length === 0,
            bad.length ? JSON.stringify(bad[0]) : '');
      await session.eval('(() => { DS.currentGame.fields.length = 0; return true; })()');
      await cdp.sleep(400);
    }

    /* The visible half. The field is put right next to the player, held for a
       moment, and the frame is compared with the same frame a second later.
       Drift (a banner fading, the camera settling) moves the numbers by a few
       points; the bug moved them by thirty. */
    const before = await frame(session);
    await session.eval(`(() => { const g = DS.currentGame, p = g.player;
      DS.Elements.spawnField(g, p.x + 24, p.y + 4, 'fire', 3); return true; })()`);
    await cdp.sleep(900);
    const during = await frame(session);
    console.log('  info  frame without the field  ' + JSON.stringify(before));
    console.log('  info  frame with the field     ' + JSON.stringify(during));
    if (before && during) {
      const lost = during.dark - before.dark;
      check('a burning patch does not darken the frame', lost < 8,
            'dark share moved ' + (lost >= 0 ? '+' : '') + lost.toFixed(1) + ' points');
      check('and the frame keeps its brightness', during.mean > before.mean - 12,
            'mean luminance ' + before.mean + ' -> ' + during.mean);
    }
  } finally {
    await close();
  }

  console.log('');
  console.log(failures === 0 ? 'PASS: elemental light cannot black the screen'
                             : 'FAIL: ' + failures + ' check(s) failed');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => { console.error('check-lights: ' + err.message); process.exit(2); });
