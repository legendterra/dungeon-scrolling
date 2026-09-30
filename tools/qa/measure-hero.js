#!/usr/bin/env node
/* What the hero costs the GPU: WebGL draw calls per frame with him hidden, in
 * the plain starting look, and in a fully dressed one, plus the milliseconds a
 * frame takes here (software GL, so the ratio matters, not the number).
 *
 *   node tools/qa/measure-hero.js [base-url] [--depth 3]
 *
 * Every mesh of the voxel hero is a draw call in the colour pass and again in
 * the shadow pass, so a wardrobe of boxes has a price the mesh count only hints
 * at. Exit code 1 when the dressed hero adds more than the budget below. */

'use strict';

const { boot } = require('./lib/map-page');

const BUDGET_CALLS = 60;          // extra draw calls a fully dressed hero may add over the plain one

const COUNTER = `(() => {
  window.__calls = 0;
  ['WebGLRenderingContext', 'WebGL2RenderingContext'].forEach((name) => {
    const proto = window[name] && window[name].prototype;
    if (!proto) return;
    ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'].forEach((fn) => {
      const orig = proto[fn];
      if (!orig) return;
      proto[fn] = function () { window.__calls++; return orig.apply(this, arguments); };
    });
  });
})();`;

const DRESSED = {
  hat: 'knighthelm', top: 'bronze', pants: 'platelegs', boots: 'winged', gloves: 'gauntlets', cape: 'royal',
  extra: 'pauldrons', hair: 'long', facial: 'fullbeard', mark: 'warpaint'
};

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/').replace(/\/?$/, '/') + '?notice=0';
  const depthAt = args.indexOf('--depth');
  const depth = depthAt >= 0 ? parseInt(args[depthAt + 1], 10) : 3;

  // The counter has to be in place before the page's scripts run, so it goes in through boot().
  const { session, close } = await boot(base, { quality: 'high', preScript: COUNTER });
  try {
    await session.eval(`__maps.go(${depth}); __maps.step(30);`);
    const measure = (label) => session.eval(`(() => {
      const runs = 90, frames = [];
      __maps.step(20);
      const calls0 = window.__calls, t0 = performance.now();
      __maps.step(runs);
      const dt = (performance.now() - t0) / runs;
      const calls = (window.__calls - calls0) / runs;
      let boxes = 0; const root = DS.R3D.heroRoot(); if (root) root.traverse((o) => { if (o.isMesh) boxes++; });
      return { label: ${JSON.stringify(label)}, ms: +dt.toFixed(1), calls: +calls.toFixed(1), boxes: boxes };
    })()`);

    await session.eval('(() => { DS.R3D.heroRoot().visible = false; })()');
    const hidden = await measure('hero hidden');
    await session.eval('(() => { DS.R3D.heroRoot().visible = true; })()');
    const plain = await measure('plain look');
    await session.eval(`(() => { const p = DS.Look.profile; DS.Look.CATALOG.forEach((i) => { p.owned[i.key] = 1; });
      const d = ${JSON.stringify(DRESSED)}; Object.keys(d).forEach((k) => DS.Look.equip(k, d[k])); })()`);
    await session.eval('__maps.step(6)');
    const dressed = await measure('fully dressed');

    console.table([hidden, plain, dressed]);
    const extra = dressed.calls - plain.calls;
    console.log('plain hero: +' + (plain.calls - hidden.calls).toFixed(1) + ' calls; dressed: +' + (dressed.calls - hidden.calls).toFixed(1) +
                ' (' + extra.toFixed(1) + ' over plain)');
    if (extra > BUDGET_CALLS) { console.log('FAIL over budget of ' + BUDGET_CALLS); process.exitCode = 1; }
  } finally {
    await close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
