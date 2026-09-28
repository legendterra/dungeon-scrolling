#!/usr/bin/env node
/* The HTML HUD and in-world UI, photographed in the situations that matter:
 *
 *   node tools/qa/shoot-ui.js [base-url] [--out DIR] [--sizes 1280x720,1920x1080]
 *                             [--tag NAME] [--only start,loot,combat,boss,notify]
 *
 * For each window size it boots the page, starts seed 4242 and stages:
 *   start   depth 1 as the run opens (location, vitals, first-run hint)
 *   loot    a chest and an epic drop beside the hero (prompt chip, drop tags)
 *   combat  a pack of monsters hit with crits, elements and a reaction
 *   boss    the depth-5 boss room with the boss bar part-way down
 *   notify  a toast stack and a queued banner
 * Frames are cropped to the play frame (DS.UI3.view). A perf sample of the
 * HUD's own per-frame cost (DS.HUD.stats) and every console error are written
 * to <out>/<tag>-report.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cdp = require('../docs/cdp');

const ROOT = path.dirname(path.dirname(__dirname));

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

const HOOK = `(() => {
  try { localStorage.setItem('ds_name', JSON.stringify('AKARI')); } catch (e) {}
  window.__uiErrors = [];
  const push = (kind, msg) => { try { window.__uiErrors.push(kind + ': ' + String(msg).slice(0, 400)); } catch (e) {} };
  const oe = console.error.bind(console);
  console.error = function () { push('console.error', Array.prototype.join.call(arguments, ' ')); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => push('error', e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => push('rejection', e.reason && (e.reason.stack || e.reason)));
})();`;

const VIEW = '(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, w: v.w, h: v.h }; })()';

const KEEP_ALIVE = `(() => { const g = DS.currentGame; if (!g || !g.player) return false;
  const p = g.player; p.dead = false; p.hp = Math.max(p.hp || 0, 1);
  p.iframes = 9999; g.deathTimer = 0; return true; })()`;

const GOTO = (depth, kind) => `(() => { const g = DS.currentGame; g.depth = ${depth};
  DS.Game.loadLevel(g, ${kind ? JSON.stringify(kind) : 'DS.Game.kindForDepth(' + depth + ')'});
  g.player.iframes = 9999;
  return { depth: g.depth, kind: g.levelKind, boss: !!g.boss }; })()`;

/* Everything staged is placed relative to the hero, on the floor under him. */
const STAGE = {
  start: `(() => { const g = DS.currentGame; g.player.iframes = 9999; return true; })()`,

  loot: `(() => { const g = DS.currentGame, p = g.player, E = DS.Ent;
    for (let i = 0; i < g.enemies.length; i++) g.enemies[i].dead = true;
    const drop = DS.Loot.makeDrop(g.rng, g.depth, { minRarity: 3, bias: 3 });
    E.addPickup(g, E.centerX(p) + 10, p.y + 2, 'item', drop, 1);
    const drop2 = DS.Loot.makeDrop(g.rng, g.depth, { minRarity: 2, bias: 2 });
    E.addPickup(g, E.centerX(p) + 46, p.y + 2, 'item', drop2, 1);
    const pk = g.pickups; for (let i = 0; i < pk.length; i++) { pk[i].vx = 0; pk[i].vy = 0; }
    return { a: drop.name, b: drop2.name }; })()`,

  combat: `(() => { const g = DS.currentGame, p = g.player, E = DS.Ent;
    for (let i = 0; i < g.enemies.length; i++) g.enemies[i].dead = true;
    const x = E.centerX(p);
    const a = DS.Enemies.create(g, x + 34, p.y - 4, 'skeleton', false);
    const b = DS.Enemies.create(g, x + 62, p.y - 4, 'zombie', true);
    const c = DS.Enemies.create(g, x - 44, p.y - 4, 'slime', false);
    [a, b, c].forEach((e) => { e.frozenForShot = true; });
    E.damageEnemy(g, a, 14, { dir: 1, element: 'fire' });
    E.damageEnemy(g, b, 37, { dir: 1, crit: true });
    E.damageEnemy(g, c, 9, { dir: -1, element: 'ice' });
    DS.Elements.apply(g, b, 'water', 10);
    DS.Elements.apply(g, b, 'lightning', 10);
    DS.Elements.apply(g, a, 'fire', 8);
    DS.Elements.apply(g, c, 'ice', 8);
    g.streak = 7; g.streakTimer = 200;
    return g.enemies.length; })()`,

  boss: `(() => { const g = DS.currentGame; const b = g.boss; if (!b) return null;
    b.hp = Math.round(b.maxHp * 0.62); return { name: b.name, hp: b.hp, max: b.maxHp }; })()`,

  notify: `(() => { const g = DS.currentGame;
    g.toast('TOOK IRON CHESTPLATE', '#c86ee0');
    g.toast('+34 COINS', '#f2c14e');
    g.toast('AMBUSH!', '#c0303c');
    g.showBanner('ACT I CLEARED', 'THE STAIRS GO DEEPER', '#f2c14e');
    g.showBanner('ESSENCE OF FIRE', 'R / T TO INFUSE ANY WEAPON', '#e8743b');
    return true; })()`
};

/* Frames to let pass after staging (sim time), then the shot. */
const WAIT = { start: 1400, loot: 900, combat: 260, boss: 2600, notify: 700 };

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

async function shoot(session, file, view) {
  const res = await session.cmd('Page.captureScreenshot', {
    format: 'png', fromSurface: true,
    clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 }
  }, 60000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return pngSize(file);
}

async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(200);
  }
  throw new Error('timed out waiting for: ' + expr);
}

async function runSize(base, size, out, tag, only, report) {
  const { session, close } = await cdp.launch({ width: size.width, height: size.height, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2600);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready', 30000);
    await session.eval(`try { localStorage.removeItem('ds_hints:AKARI'); } catch (e) {}`);
    await session.eval('DS.Scenes.play(4242, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.map && DS.currentGame.player && DS.currentScene', 30000);
    await cdp.sleep(600);

    const tagSize = size.width + 'x' + size.height;
    for (const name of only) {
      if (name === 'boss') await session.eval(GOTO(5));
      else if (name === 'start') await session.eval(GOTO(1));
      const staged = await session.eval(STAGE[name]);
      await cdp.sleep(WAIT[name]);
      await session.eval(KEEP_ALIVE);
      const view = await session.eval(VIEW);
      const file = path.join(out, tag + '-' + tagSize + '-' + name + '.png');
      const px = await shoot(session, file, view);
      report.shots.push({ size: tagSize, name: name, staged: staged, file: path.relative(ROOT, file), w: px.w, h: px.h });
      console.log('shot ' + tagSize + ' ' + name + ' -> ' + path.relative(ROOT, file));
    }
    const stats = await session.eval('DS.HUD && DS.HUD.stats ? DS.HUD.stats() : null');
    report.perf.push({ size: tagSize, stats: stats });
    const errs = await session.eval('window.__uiErrors || []');
    for (const e of errs) report.errors.push(tagSize + ' ' + e);
  } finally {
    await close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8130/';
  const out = path.resolve(ROOT, value(args, '--out') || path.join('tools', 'qa', 'out', 'ui'));
  const tag = value(args, '--tag') || 'ui';
  const sizes = (value(args, '--sizes') || '1280x720,1920x1080,2560x1440').split(',').map((s) => {
    const m = /^(\d+)x(\d+)$/.exec(s);
    return { width: Number(m[1]), height: Number(m[2]) };
  });
  const only = (value(args, '--only') || 'start,loot,combat,notify,boss').split(',');
  const report = { url: base, shots: [], perf: [], errors: [] };
  for (const size of sizes) await runSize(base, size, out, tag, only, report);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, tag + '-report.json'), JSON.stringify(report, null, 2));
  console.log('perf ' + JSON.stringify(report.perf));
  console.log(report.errors.length ? 'ERRORS (' + report.errors.length + '):\n  ' +
    report.errors.slice(0, 20).join('\n  ') : 'no console errors');
  process.exitCode = report.errors.length ? 1 : 0;
}

main().catch((err) => { console.error('shoot-ui: ' + err.message); process.exit(2); });
