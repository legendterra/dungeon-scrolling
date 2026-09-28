#!/usr/bin/env node
/* The attack and element FX, photographed mid-motion.
 *
 *   node tools/qa/shoot-fx.js [base-url] [--out DIR] [--only NAME[,NAME]]
 *                             [--quality high] [--frames]
 *
 * Boots seed 4242, stops the live update loop (the page keeps DRAWING, but the
 * game only advances when this script steps it), swaps DS.Input for a scripted
 * pad, and plants a dummy monster beside the hero. Then every scenario - each
 * weapon's full combo and its heavy finisher, bow and staff shots, every
 * element's aura and hit, a handful of reactions, a few skills - is played
 * frame by frame, and the frames that matter are cropped around the fight and
 * written to tools/qa/out/fx/.
 *
 * --frames also measures the world pass (DS.R3D.render + a 1px readback) in a
 * scripted brawl with the pooled FX live and with it switched off, which is
 * the number the frame budget is held to. Every console error is reported and
 * fails the run.
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
  window.__gfxErrors = [];
  const push = (kind, msg) => { try { window.__gfxErrors.push(kind + ': ' + String(msg).slice(0, 400)); } catch (e) {} };
  const oe = console.error.bind(console);
  console.error = function () { push('console.error', Array.prototype.join.call(arguments, ' ')); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => push('error', e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => push('rejection', e.reason && (e.reason.stack || e.reason)));
})();`;

/* The in-page driver. */
const DRIVER = `(() => {
  if (window.__fx) return true;
  const held = new Set(), pressed = new Set(), released = new Set();
  const In = DS.Input;
  In.isDown = (a) => held.has(a);
  In.justPressed = (a) => pressed.has(a);
  In.justReleased = (a) => released.has(a);
  In.axisX = () => 0;
  In.consume = (a) => { pressed.delete(a); };
  In.hasMouse = () => false;
  In.anyPressed = () => false;
  In.poll = () => {};
  In.endFrame = () => {};
  const upd = DS.currentScene.update;
  DS.currentScene.update = function () {};
  if (DS.UI3) DS.UI3.render = function () {};
  const g = () => DS.currentGame;
  let dummy = null;
  function keep() {
    const G = g(), p = G.player;
    p.iframes = Math.max(p.iframes, 30); p.dead = false; p.hp = Math.max(p.hp, 3);
    p.mana = p.stats.maxMana; p.stamina = p.stats.maxStamina; G.deathTimer = 0;
    for (const e of G.enemies) {
      if (e !== dummy) continue;
      e.x = e.fxX; e.vx = 0; e.hp = 99999; e.dead = false;
      if (e.status) { e.status.frozen = 0; e.status.root = 0; }
    }
  }
  window.__fx = {
    /* One game frame, then one drawn frame - exactly the rhythm of real play,
       so trails get a sample per frame and the body's smoothing runs. */
    async step(n) {
      for (let i = 0; i < (n || 1); i++) {
        keep(); upd(); pressed.clear(); released.clear();
        await new Promise((r) => requestAnimationFrame(r));
      }
      return g().frames;
    },
    press(a) { pressed.add(a); held.add(a); },
    hold(a) { held.add(a); },
    release(a) { held.delete(a); released.add(a); },
    equip(type, element) {
      const G = g(), inv = G.inv;
      const it = DS.Loot.makeItem(DS.rand, 6, { type: type, rarity: 3, element: element || undefined, noElement: !element });
      it.procs = null;
      inv.equipped[inv.active] = it;
      G.player.refreshStats();
      return it.type + ':' + it.element;
    },
    stage() {
      const G = g(), p = G.player;
      G.enemies.length = 0; G.projectiles.length = 0;
      if (G.fields) G.fields.length = 0;
      p.facing = 1; p.vx = 0; p.attackCooldown = 0; p.comboStep = 0; p.comboWindow = 0;
      const e = DS.Enemies.create(G, p.x + 30, p.y + p.h - 16, 'zombie');
      e.fxX = e.x; dummy = e;
      G.enemies.push(e);
      if (DS.R3D.rig) DS.R3D.rig.show = 0;
      return { px: p.x, ex: e.x, ey: e.y };
    },
    setAura(el) { if (dummy) { dummy.aura = { element: el, frames: 200 }; dummy.status = dummy.status || {}; } },
    // Step until the current swing strikes (anticipation over).
    async toStrike() { let n = 0; while (g().player.attackDelay > 0 && n < 30) { await this.step(1); n++; } return n; },
    async toReady() { let n = 0; while (g().player.attackCooldown > 0 && n < 90) { await this.step(1); n++; } return n; },
    info() {
      const p = g().player;
      return { key: p.attackKey, step: p.comboStep, win: p.comboWindow, cd: p.attackCooldown,
               delay: p.attackDelay, fx: DS.FX3D.stats() };
    },
    focus() {
      const G = g(), p = G.player;
      const x = p.x + p.w / 2 + 14, y = p.y + p.h / 2 - 4;
      return DS.R3D.worldToScreen(x, y, {});
    },
    skill(which) { return DS.Skills.use(g(), g().player, which); }
  };
  return true;
})()`;

const VIEW = '(() => { const v = DS.UI3.view; return { x: v.x, y: v.y, w: v.w, h: v.h }; })()';
const FRAME = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))';

async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(200);
  }
  throw new Error('timed out waiting for: ' + expr);
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8128/';
  const out = path.resolve(ROOT, value(args, '--out') || path.join('tools', 'qa', 'out', 'fx'));
  const only = value(args, '--only') ? value(args, '--only').split(',') : null;
  const quality = value(args, '--quality') || 'high';
  const withFrames = args.includes('--frames');
  fs.mkdirSync(out, { recursive: true });

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  const report = { shots: [], frames: null, errors: [] };
  let view = null;

  async function shoot(name) {
    await session.eval(FRAME);
    const f = await session.eval('__fx.focus()');
    const cw = view.w * 0.38, ch = view.h * 0.38;
    const cx = Math.max(view.x, Math.min(view.x + view.w - cw, view.x + f.x * view.w / 320 - cw / 2));
    const cy = Math.max(view.y, Math.min(view.y + view.h - ch, view.y + f.y * view.h / 180 - ch * 0.55));
    const res = await session.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true,
      clip: { x: cx, y: cy, width: cw, height: ch, scale: 1.4 } }, 60000);
    const file = path.join(out, name + '.png');
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    report.shots.push(path.relative(ROOT, file));
    console.log('shot ' + name);
  }
  const step = (n) => session.eval('__fx.step(' + (n || 1) + ')');
  const ev = (s) => session.eval(s);
  const want = (name) => !only || only.some((o) => name.indexOf(o) === 0);

  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 2600);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready', 30000);
    await ev(`localStorage.setItem('ds_name', 'FX');`);
    await ev('DS.Scenes.play(4242, {})');
    await waitFor(session, 'DS.currentGame && DS.currentGame.map && DS.currentGame.player && DS.currentScene', 30000);
    await cdp.sleep(1200);
    if (await ev('!!DS.PostFX')) await ev(`DS.PostFX.setQuality('${quality}', { lock: true, quiet: true })`);
    await ev(DRIVER);
    view = await ev(VIEW);

    // --- melee combos ---------------------------------------------------------
    for (const w of ['sword', 'dagger', 'greataxe', 'spear']) {
      if (!want(w)) continue;
      await ev(`__fx.equip('${w}', null)`);
      await ev('__fx.stage()');
      await step(30);
      const steps = await ev(`DS.Combos.length('${w}')`);
      for (let s = 0; s < steps; s++) {
        await ev(`__fx.press('attack')`);
        await step(1);
        await ev(`__fx.release('attack')`);
        await ev('__fx.toStrike()');
        await step(1); await shoot(`${w}-step${s + 1}-a`);
        await step(2); await shoot(`${w}-step${s + 1}-b`);
        await step(3); await shoot(`${w}-step${s + 1}-c`);
        await ev('__fx.toReady()');
      }
      // Heavy: hold to full charge, release.
      await step(25);
      await ev(`__fx.press('attack')`);
      await step(1);
      // The press itself lands a tap; the wind-up starts once it recovers.
      const cmax = await ev(`DS.Weapons.WEAPONS['${w}'].chargeMax + DS.currentGame.player.attackCooldown`);
      await step(cmax + 2);
      await shoot(`${w}-heavy-charge`);
      await ev(`__fx.release('attack')`);
      await step(1);
      await ev('__fx.toStrike()');
      await step(1); await shoot(`${w}-heavy-a`);
      await step(3); await shoot(`${w}-heavy-b`);
      await step(4); await shoot(`${w}-heavy-c`);
      await ev('__fx.toReady()');
      await step(20);
    }

    // --- ranged ---------------------------------------------------------------
    for (const w of ['bow', 'staff']) {
      if (!want(w)) continue;
      await ev(`__fx.equip('${w}', ${w === 'staff' ? "'ice'" : 'null'})`);
      await ev('__fx.stage()');
      await step(20);
      for (const hold of [6, 40]) {
        await ev(`__fx.press('attack')`);
        await step(hold);
        if (hold > 30) await shoot(`${w}-draw`);
        await ev(`__fx.release('attack')`);
        await step(2); await shoot(`${w}-${hold > 30 ? 'charged' : 'tap'}-a`);
        await step(4); await shoot(`${w}-${hold > 30 ? 'charged' : 'tap'}-b`);
        await step(6); await shoot(`${w}-${hold > 30 ? 'charged' : 'tap'}-c`);
        await ev('__fx.toReady()');
        await step(10);
      }
    }

    // --- elements: aura, then a hit -------------------------------------------
    for (const el of ['fire', 'ice', 'lightning', 'poison', 'water', 'earth', 'leaf', 'wind']) {
      if (!want('el-' + el)) continue;
      await ev(`__fx.equip('sword', '${el}')`);
      await ev('__fx.stage()');
      await step(40);
      await shoot(`el-${el}-aura`);
      await ev(`__fx.press('attack')`);
      await step(1);
      await ev(`__fx.release('attack')`);
      await ev('__fx.toStrike()');
      await step(3); await shoot(`el-${el}-hit-a`);
      await step(4); await shoot(`el-${el}-hit-b`);
      await ev('__fx.toReady()');
      await step(40);
    }

    // --- reactions --------------------------------------------------------------
    const REACT = [['water', 'lightning'], ['ice', 'fire'], ['lightning', 'fire'], ['fire', 'wind'],
                   ['water', 'leaf'], ['water', 'fire'], ['water', 'ice'], ['poison', 'earth']];
    for (const [aura, hit] of REACT) {
      const name = 'react-' + aura + '-' + hit;
      if (!want(name) && !want('react')) continue;
      await ev(`__fx.equip('sword', '${hit}')`);
      await ev('__fx.stage()');
      await step(20);
      await ev(`__fx.setAura('${aura}')`);
      await ev(`__fx.press('attack')`);
      await step(1);
      await ev(`__fx.release('attack')`);
      await ev('__fx.toStrike()');
      await step(3); await shoot(`${name}-a`);
      await step(6); await shoot(`${name}-b`);
      await ev('__fx.toReady()');
      await step(40);
    }

    // --- skills -----------------------------------------------------------------
    for (const [w, which] of [['sword', 'skill'], ['greataxe', 'skill'], ['sword', 'ult'], ['staff', 'skill']]) {
      const name = 'skill-' + w + '-' + which;
      if (!want(name) && !want('skill')) continue;
      await ev(`__fx.equip('${w}', ${w === 'staff' ? "'fire'" : 'null'})`);
      await ev('__fx.stage()');
      await step(20);
      await ev(`DS.currentGame.player.skillCooldown = 0; DS.currentGame.player.ultCooldown = 0; __fx.skill('${which}')`);
      await step(4); await shoot(`${name}-a`);
      await step(10); await shoot(`${name}-b`);
      await step(30);
    }

    report.stats = await ev('DS.FX3D.stats()');

    // --- frame time ---------------------------------------------------------------
    if (withFrames) {
      const BRAWL = (on) => `(async () => {
        const G = DS.currentGame, p = G.player;
        __fx.equip('sword', 'fire'); __fx.stage();
        for (let i = 0; i < 5; i++) { const e = DS.Enemies.create(G, p.x + 40 + i * 14, p.y + p.h - 16, 'zombie'); e.hp = 99999; G.enemies.push(e); }
        const live = DS.FX3D.live;
        if (!${on}) { DS.FX3D.live = () => false; }
        const R3D = DS.R3D, orig = R3D.render; const cost = [];
        const gl = R3D.gl.getContext(); const px = new Uint8Array(4);
        R3D.render = function (g) { const t0 = performance.now(); orig(g); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); cost.push(performance.now() - t0); };
        for (let f = 0; f < 240; f++) {
          if (f % 14 === 0) __fx.press('attack'); else __fx.release('attack');
          if (f % 50 === 10) { p.skillCooldown = 0; __fx.skill('skill'); }
          for (const e of G.enemies) { e.hp = 99999; if (e.status) e.status.burn = 0; }
          await __fx.step(1);
        }
        R3D.render = orig; DS.FX3D.live = live;
        const s = cost.slice(20).sort((a, b) => a - b);
        const avg = s.reduce((a, b) => a + b, 0) / s.length;
        return { on: ${on}, avg: +avg.toFixed(2), p50: +s[Math.floor(s.length * 0.5)].toFixed(2),
                 p95: +s[Math.floor(s.length * 0.95)].toFixed(2), n: s.length, stats: DS.FX3D.stats() };
      })()`;
      const off1 = await ev(BRAWL(false));
      const on1 = await ev(BRAWL(true));
      const off2 = await ev(BRAWL(false));
      const on2 = await ev(BRAWL(true));
      report.frames = { off: [off1, off2], on: [on1, on2] };
      console.log('frames ' + JSON.stringify(report.frames));
    }

    report.errors = await ev('window.__gfxErrors || []');
  } finally {
    await close();
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('stats ' + JSON.stringify(report.stats));
  console.log(report.errors.length ? 'ERRORS (' + report.errors.length + '):\n  ' +
    report.errors.slice(0, 20).join('\n  ') : 'no console errors');
  process.exitCode = report.errors.length ? 1 : 0;
}

main().catch((err) => { console.error('shoot-fx: ' + err.message); process.exit(2); });
