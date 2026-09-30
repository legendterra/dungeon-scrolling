#!/usr/bin/env node
/* The hero, dressed: a gallery of looks photographed on the character stage,
 * with the interface hidden, and laid out on contact sheets.
 *
 *   node tools/qa/shoot-look.js [base-url] [--out DIR] [--only NAME]
 *
 * Sheets: outfits (whole-figure sets), heads (hair, hats, faces), traits (build,
 * height, skin, eyes), weapons (every weapon in a skin). The whole catalogue is
 * treated as owned so nothing has to be bought first. Exit code 1 on a console
 * error or a look that fails to build. */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');
const { HOOK, waitFor, shoot, VIEW } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));
const D = (over) => over;

const SETS = {
  outfits: [
    ['default', D({})],
    ['wizard', D({ hat: 'wizard', hatDye: 'purple', top: 'robe', topDye: 'navy', boots: 'shoes', cape: 'long', capeDye: 'purple', extra: 'scarf', extraDye: 'yellow', facial: 'longbeard', hairColor: 'white' })],
    ['knight', D({ hat: 'knighthelm', top: 'plate', pants: 'platelegs', boots: 'ironboots', gloves: 'gauntlets', cape: 'royal', hair: 'bald' })],
    ['legend', D({ hat: 'crown', top: 'aegis', pants: 'greaves', boots: 'winged', cape: 'flamecape', extra: 'aura', hair: 'flame' })],
    ['viking', D({ hat: 'horned', top: 'chain', pants: 'leather', boots: 'boots', bootsDye: 'brown', gloves: 'gloves', cape: 'tattered', facial: 'fullbeard', hair: 'braid', hairColor: 'ginger', build: 'broad' })],
    ['rogue', D({ hat: 'hood', hatDye: 'charcoal', top: 'jerkin', pants: 'leather', gloves: 'fingerless', cape: 'tattered', extra: 'mask', hair: 'short' })],
    ['farmer', D({ hat: 'straw', top: 'vest', topDye: 'green', pants: 'shorts', pantsDye: 'tan', boots: 'sandals', facial: 'stubble', mark: 'freckles', hair: 'sidepart', hairColor: 'ginger' })],
    ['warden', D({ hat: 'warden_helm', top: 'warden_plate', cape: 'warden_mantle', pants: 'greaves', boots: 'ironboots', gloves: 'gauntlets' })],
    ['olympian', D({ hat: 'laurel', top: 'toga', pants: 'skirt', pantsDye: 'white', boots: 'winged', cape: 'wings', hair: 'curly', hairColor: 'blonde' })],
    ['hoodie', D({ top: 'hoodie', topDye: 'red', pants: 'trousers', pantsDye: 'charcoal', boots: 'shoes', bootsDye: 'white', extra: 'glasses', hair: 'undercut', hairColor: 'black' })],
    ['pirate', D({ hat: 'bandana', hatDye: 'red', top: 'shirt', topDye: 'white', pants: 'kilt', pantsDye: 'navy', boots: 'boots', extra: 'eyepatch', facial: 'goatee', mark: 'scar', hair: 'wolf' })],
    ['spirit', D({ hat: 'halo', top: 'shirt', topDye: 'white', pants: 'trousers', pantsDye: 'white', cape: 'portalwalker', extra: 'wanderer', hair: 'spirit', mark: 'glowrune' })]
  ],
  heads: [
    ['bald', D({ hair: 'bald' })], ['buzz', D({ hair: 'buzz' })], ['long', D({ hair: 'long', hairColor: 'chestnut' })],
    ['ponytail', D({ hair: 'ponytail', hairColor: 'blonde' })], ['bun', D({ hair: 'bun', hairColor: 'black' })], ['curly', D({ hair: 'curly', hairColor: 'auburn' })],
    ['mohawk', D({ hair: 'mohawk', hairColor: 'pink' })], ['afro', D({ hair: 'afro', hairColor: 'black', skin: 'brown' })], ['twintails', D({ hair: 'twintails', hairColor: 'teal' })],
    ['wolf', D({ hair: 'wolf', hairColor: 'grey' })], ['topknot', D({ hair: 'topknot', hairColor: 'black' })], ['crownbraids', D({ hair: 'crownbraids', hairColor: 'platinum' })],
    ['cap', D({ hat: 'cap', hatDye: 'green' })], ['hood', D({ hat: 'hood', hatDye: 'crimson' })], ['bandana', D({ hat: 'bandana', hatDye: 'blue' })],
    ['leathercap', D({ hat: 'leathercap' })], ['straw', D({ hat: 'straw' })], ['ironhelm', D({ hat: 'ironhelm' })]
  ],
  traits: [
    ['slim-short', D({ build: 'slim', height: 'short' })], ['regular', D({})], ['broad-tall', D({ build: 'broad', height: 'tall' })],
    ['pale', D({ skin: 'pale', eyes: 'sleepy', mouth: 'neutral' })], ['ebony', D({ skin: 'ebony', eyes: 'happy', mouth: 'grin', brows: 'thick' })], ['bronze', D({ skin: 'bronze', eyes: 'sharp', brows: 'angled', mouth: 'smirk' })],
    ['wide', D({ eyes: 'wide', eyeColor: 'green', brows: 'thin', mouth: 'frown' })], ['narrow', D({ eyes: 'narrow', eyeColor: 'blue', brows: 'none' })], ['warpaint', D({ mark: 'warpaint', facial: 'mustache' })],
    ['tattoo', D({ mark: 'tattoo', facial: 'goatee' })], ['stubble', D({ facial: 'stubble', hair: 'undercut' })], ['glasses', D({ extra: 'glasses', hair: 'sidepart' })]
  ],
  weapons: ['sword', 'dagger', 'greataxe', 'spear', 'bow', 'staff'].flatMap((w) =>
    ['base', 'ember', 'frost', 'gilded', 'void', 'solar'].filter((s, i) => i % 3 === 0 || w === 'sword').map((s) => [w + '-' + s, D({ weapon: { [w]: w + '.' + s } }), w]))
};

const failures = [];
function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const out = path.resolve(ROOT, value(args, '--out') || 'tools/qa/out/look');
  const only = value(args, '--only');
  fs.mkdirSync(out, { recursive: true });

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2400);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene && DS.LookStage && DS.Look3D', 30000);
    const view = await session.eval(VIEW);
    // Everything owned; the loop paused so the frames are ours.
    await session.eval(`(() => { DS.__paused = true; const p = DS.Look.profile; DS.Look.CATALOG.forEach((i) => { p.owned[i.key] = 1; });
      const ui = document.getElementById('ui-root'); if (ui) ui.style.visibility = 'hidden'; document.documentElement.classList.remove('hk-open'); })()`);

    const frame = (look, weapon, viewName) => session.eval(`(() => {
      DS.LookStage.setOffset(0);
      const look = Object.assign(JSON.parse(JSON.stringify(DS.Look.DEFAULT_LOOK)), ${JSON.stringify(look)});
      look.weapon = Object.assign({}, ${JSON.stringify(look.weapon || {})});
      const clean = DS.Look.clean(look, DS.Look.profile.owned);
      DS.LookStage.setLook(clean, { weapon: ${JSON.stringify(weapon || null)} });
      DS.LookStage.view(${JSON.stringify(viewName || 'full')});
      for (let i = 0; i < 30; i++) { DS.R.begin(); DS.R.uiMode(); DS.LookStage.attach(1 / 30); DS.R.present(performance.now() / 1000); }
      const m = DS.LookStage.model; let n = 0; m.root.traverse((o) => { if (o.isMesh) n++; });
      return n; })()`);

    for (const name of Object.keys(SETS)) {
      if (only && only !== name) continue;
      const files = [];
      for (const entry of SETS[name]) {
        const [label, look, weapon] = entry;
        const view3 = name === 'heads' ? 'head' : (weapon ? 'weapon' : 'full');
        const n = await frame(look, weapon, view3);
        if (!(n >= 5)) { failures.push(label); console.log('FAIL ' + label + ' built ' + n); }   // a merged hero is a handful of meshes
        const file = path.join(out, name + '-' + label + '.png');
        // The middle column of the frame, where the stage frames the hero.
        await shoot(session, file, { x: view.x + view.width * 0.33, y: view.y, width: view.width * 0.34, height: view.height });
        files.push({ label: label, file: file });
      }
      const cols = 6, cw = 220, ch = Math.round(220 * view.height / (view.width * 0.34));
      let html = `<body style="margin:0;background:#0a0d16;font:11px sans-serif;color:#9ab"><div style="display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:2px">`;
      for (const f of files) html += `<div style="position:relative"><img width="${cw}" height="${ch}" src="file:///${f.file.replace(/\\/g, '/')}"><span style="position:absolute;left:6px;top:4px">${f.label}</span></div>`;
      html += '</div></body>';
      const page = path.join(out, 'sheet-' + name + '.html');
      fs.writeFileSync(page, html);
      const rows = Math.ceil(files.length / cols);
      await session.cmd('Emulation.setDeviceMetricsOverride', { width: cols * cw + 2 * cols, height: rows * (ch + 2), deviceScaleFactor: 1, mobile: false });
      await session.goto('file:///' + page.replace(/\\/g, '/'), 900);
      await shoot(session, path.join(out, 'sheet-' + name + '.png'), { x: 0, y: 0, width: cols * cw + 2 * cols, height: rows * (ch + 2) });
      fs.unlinkSync(page);
      await session.cmd('Emulation.clearDeviceMetricsOverride');
      await session.goto(base, 2400);
      await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.currentScene && DS.LookStage && DS.Look3D', 30000);
      await session.eval(`(() => { DS.__paused = true; const p = DS.Look.profile; DS.Look.CATALOG.forEach((i) => { p.owned[i.key] = 1; });
        const ui = document.getElementById('ui-root'); if (ui) ui.style.visibility = 'hidden'; })()`);
      console.log('wrote sheet-' + name + '.png (' + files.length + ' looks)');
    }
    const errs = await session.eval('window.__gfxErrors || []');
    if (errs.length) { console.log('console errors:\n  ' + errs.join('\n  ')); failures.push('console errors'); }
  } finally {
    await close();
  }
  if (failures.length) { console.log('\n' + failures.length + ' failure(s)'); process.exit(1); }
}

main().catch((e) => { console.error('shoot-look: ' + e.message); process.exit(1); });
