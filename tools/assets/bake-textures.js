#!/usr/bin/env node
/* Shrink the cached photo-scans into the game's texture data.
 *
 *   node tools/assets/bake-textures.js [--size 256] [--quality 0.84] [--sheet]
 *
 * Reads tools/assets/textures.json and the JPGs tools/assets/fetch-textures.js
 * left in tools/assets/cache/, and for each one:
 *
 *   1. crops it to a square and halves it down to `size` px (canvas, smoothed,
 *      in halvings so a 1024 photo does not alias into sparkle);
 *   2. normalises its brightness and, when the manifest gives a `tint`, mixes it
 *      toward that colour by `desat` -- so an HD rock can stand in for the old
 *      procedural family it replaces at the SAME average value, and a recipe's
 *      own palette still multiplies it the way it always did;
 *   3. writes a JPEG data URI.
 *
 * The result is src/art/textures/common.gen.js, a plain script that fills
 * DS.TexData / DS.TexMeta / DS.TexFamilyMap. Data URIs, not image files,
 * because the game has to run from file:// and Chrome refuses a local image as
 * a WebGL texture there. No dependencies: the resize is Chrome's own, driven
 * through tools/docs/cdp.js (headless Chromium).
 *
 * --sheet also writes tools/assets/cache/baked-sheet.png, every texture in one
 * picture, for looking at.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));
const CACHE = path.join(__dirname, 'cache');
const OUT = path.join(ROOT, 'src', 'art', 'textures', 'common.gen.js');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, 'textures.json'), 'utf8'));

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i < 0 || !process.argv[i + 1] ? dflt : process.argv[i + 1];
}
const SIZE = parseInt(arg('--size', MANIFEST.bake.size), 10);
const QUALITY = parseFloat(arg('--quality', MANIFEST.bake.quality));
const SHEET = process.argv.includes('--sheet');

/* In the page: one photo in, one baked JPEG out. */
const PAGE = `(() => {
  window.__bake = (b64, size, quality, tint, desat, gray, meanTarget) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('image did not decode'));
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      let cv = document.createElement('canvas');
      cv.width = cv.height = s;
      let ctx = cv.getContext('2d');
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, s, s);
      // Halve while it is more than twice the target, then land on it.
      while (cv.width > size * 2) {
        const n = document.createElement('canvas');
        n.width = n.height = cv.width >> 1;
        const c = n.getContext('2d');
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.drawImage(cv, 0, 0, n.width, n.height);
        cv = n;
      }
      const fin = document.createElement('canvas');
      fin.width = fin.height = size;
      ctx = fin.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cv, 0, 0, size, size);
      const id = ctx.getImageData(0, 0, size, size), d = id.data;
      const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
      let mean = 0;
      for (let i = 0; i < d.length; i += 4) mean += lum(d[i], d[i + 1], d[i + 2]);
      mean /= (d.length / 4);
      if (gray) {
        // Pure luminance, its mean brought to meanTarget: a multiplier for a
        // material colour, not a picture with a colour of its own.
        const k = meanTarget / Math.max(1, mean);
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.max(0, Math.min(255, lum(d[i], d[i + 1], d[i + 2]) * k));
          d[i] = d[i + 1] = d[i + 2] = v;
        }
      } else if (tint) {
        const t = [parseInt(tint.slice(1, 3), 16), parseInt(tint.slice(3, 5), 16), parseInt(tint.slice(5, 7), 16)];
        const tl = lum(t[0], t[1], t[2]);
        const k = tl / Math.max(1, mean);              // brings the mean to the tint's own value
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] * k, g = d[i + 1] * k, b = d[i + 2] * k;
          const l = lum(r, g, b) / Math.max(1, tl);    // the pattern: 1 = the average
          const gr = t[0] * l, gg = t[1] * l, gb = t[2] * l;
          d[i]     = Math.max(0, Math.min(255, r + (gr - r) * desat));
          d[i + 1] = Math.max(0, Math.min(255, g + (gg - g) * desat));
          d[i + 2] = Math.max(0, Math.min(255, b + (gb - b) * desat));
        }
      }
      ctx.putImageData(id, 0, 0);
      resolve({ uri: fin.toDataURL('image/jpeg', quality), mean: +mean.toFixed(1) });
    };
    img.src = 'data:image/jpeg;base64,' + b64;
  });
  window.__sheet = (uris, cell) => new Promise((resolve) => {
    const cols = 8, rows = Math.ceil(uris.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * cell; cv.height = rows * cell;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height);
    let left = uris.length;
    uris.forEach((u, i) => {
      const im = new Image();
      im.onload = () => { ctx.drawImage(im, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
        if (--left === 0) resolve(cv.toDataURL('image/png')); };
      im.src = u;
    });
  });
  return true;
})()`;

async function main() {
  const missing = MANIFEST.textures.filter((t) =>
    !fs.existsSync(path.join(CACHE, t.asset + '_diff_1k.jpg')));
  if (missing.length) {
    console.error('not in the cache (run tools/assets/fetch-textures.js first): ' +
                  missing.map((t) => t.asset).join(', '));
    process.exit(1);
  }
  const sources = JSON.parse(fs.readFileSync(path.join(CACHE, 'sources.json'), 'utf8'));

  const { session, close } = await cdp.launch({ width: 640, height: 480, url: 'about:blank' });
  const data = {}, meta = {}, uris = [];
  let bytes = 0;
  try {
    await session.cmd('Runtime.enable');
    await session.eval(PAGE);
    for (const t of MANIFEST.textures) {
      const b64 = fs.readFileSync(path.join(CACHE, t.asset + '_diff_1k.jpg')).toString('base64');
      const r = await session.eval(
        `__bake(${JSON.stringify(b64)}, ${SIZE}, ${QUALITY}, ${JSON.stringify(t.tint || null)}, ${t.desat != null ? t.desat : 0}, ${!!t.gray}, ${t.mean || 200})`);
      data[t.id] = r.uri;
      meta[t.id] = { asset: t.asset, size: SIZE, tint: t.tint || null, gray: !!t.gray, span: t.span || null };
      uris.push(r.uri);
      bytes += r.uri.length;
      console.log(t.id.padEnd(16) + t.asset.padEnd(28) + (r.uri.length / 1024).toFixed(1).padStart(7) + ' KB  mean ' + r.mean);
    }
    if (SHEET) {
      const png = await session.eval(`__sheet(${JSON.stringify(uris)}, 128)`);
      fs.writeFileSync(path.join(CACHE, 'baked-sheet.png'), Buffer.from(png.split(',')[1], 'base64'));
      console.log('wrote ' + path.join(CACHE, 'baked-sheet.png'));
    }
  } finally {
    await close();
  }

  const credit = MANIFEST.textures.map((t) =>
    ' *   ' + t.id.padEnd(16) + 'Poly Haven "' + t.asset + '"  ' + (sources[t.asset] ? sources[t.asset].url : '')).join('\n');
  const out =
`/* GENERATED by tools/assets/bake-textures.js -- do not edit by hand.
 *
 * ${MANIFEST.textures.length} photo-scan textures at ${SIZE}px (JPEG q${QUALITY}), as data URIs so the game runs from file://.
 * License: ${MANIFEST.license}. Every source is a Poly Haven CC0 asset (https://polyhaven.com/license):
 *
${credit}
 */
window.DS = window.DS || {};
DS.TexData = Object.assign(DS.TexData || {}, ${JSON.stringify(data)});
DS.TexMeta = Object.assign(DS.TexMeta || {}, ${JSON.stringify(meta)});
DS.TexFamilyMap = Object.assign(DS.TexFamilyMap || {}, ${JSON.stringify(MANIFEST.familyMap)});
`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log('\nwrote ' + path.relative(ROOT, OUT) + '  ' + (out.length / 1048576).toFixed(2) + ' MB, ' +
              MANIFEST.textures.length + ' textures at ' + SIZE + 'px');
}

main().catch((e) => { console.error(e); process.exit(2); });
