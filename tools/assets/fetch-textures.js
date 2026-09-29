#!/usr/bin/env node
/* Download the albedo of every texture in tools/assets/textures.json.
 *
 *   node tools/assets/fetch-textures.js [--force] [--list]
 *
 * The source is Poly Haven (CC0, https://polyhaven.com/license): each asset's
 * file list comes from its public API (https://api.polyhaven.com/files/<asset>)
 * and the 1k DIFFUSE jpg is saved to tools/assets/cache/<asset>_diff_1k.jpg.
 * Nothing else is fetched: no normals, no roughness, no zips.
 *
 *   --list    print what would be downloaded (asset, url, bytes) and exit
 *   --force   fetch again even when the file is already in the cache
 *
 * Every download is checked against the md5 and byte size the API reports, and
 * the run leaves tools/assets/cache/sources.json (asset, url, bytes, md5) which
 * bake-textures.js and the credits in ASSETS.md are written from.
 * Plain node, no dependencies; https only.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.dirname(path.dirname(__dirname));
const CACHE = path.join(__dirname, 'cache');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, 'textures.json'), 'utf8'));
const UA = 'dungeon-scrolling-texture-fetch (github.com/legendterra/dungeon-scrolling)';

const FORCE = process.argv.includes('--force');
const LIST = process.argv.includes('--list');

function get(url, asBuffer, hops) {
  return new Promise((resolve, reject) => {
    if ((hops || 0) > 5) return reject(new Error('too many redirects: ' + url));
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), asBuffer, (hops || 0) + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(asBuffer ? buf : buf.toString('utf8'));
      });
    }).on('error', reject);
  });
}

async function describe(asset) {
  const j = JSON.parse(await get('https://api.polyhaven.com/files/' + asset, false));
  const d = j.Diffuse && j.Diffuse['1k'] && j.Diffuse['1k'].jpg;
  if (!d) throw new Error(asset + ': no 1k diffuse jpg in the file list');
  return { asset: asset, url: d.url, bytes: d.size, md5: d.md5 };
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const sourcesFile = path.join(CACHE, 'sources.json');
  const sources = fs.existsSync(sourcesFile) ? JSON.parse(fs.readFileSync(sourcesFile, 'utf8')) : {};
  const assets = Array.from(new Set(MANIFEST.textures.map((t) => t.asset)));
  let total = 0, fetched = 0, cached = 0, failed = 0;

  for (const asset of assets) {
    const file = path.join(CACHE, asset + '_diff_1k.jpg');
    const have = fs.existsSync(file) && sources[asset];
    if (have && !FORCE && !LIST) { cached++; total += sources[asset].bytes; continue; }
    try {
      const info = await describe(asset);
      total += info.bytes;
      if (LIST) { console.log(asset.padEnd(28) + String(info.bytes).padStart(9) + ' B  ' + info.url); continue; }
      const buf = await get(info.url, true);
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      if (buf.length !== info.bytes || md5 !== info.md5) {
        throw new Error('checksum mismatch (got ' + buf.length + ' B, md5 ' + md5 + ')');
      }
      fs.writeFileSync(file, buf);
      sources[asset] = info;
      fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));
      fetched++;
      console.log('ok   ' + asset.padEnd(28) + String(info.bytes).padStart(9) + ' B');
    } catch (e) {
      failed++;
      console.log('FAIL ' + asset + '  ' + e.message);
    }
  }
  console.log('\n' + assets.length + ' assets, ' + (total / 1048576).toFixed(1) + ' MB' +
              (LIST ? '' : ' (' + fetched + ' fetched, ' + cached + ' already cached, ' + failed + ' failed)'));
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(2); });
