#!/usr/bin/env node
/* The act II / III bestiary, run for real: every new monster and boss put in a
 * room with the hero and simulated, frame by frame, through the game's own
 * scene update -- no rendering, no timers, just the fixed step main.js runs.
 *
 *   node tools/qa/check-bestiary.js [base-url] [--seconds 20] [--json FILE]
 *
 * For each case it records, per monster:
 *   attacks     how many wind-ups it started (and, for a harpy, how many were
 *               feather volleys and how many were dives)
 *   stuck       the longest it spent inside one attack (wind+strike+recover)
 *               against what its own timings allow; a machine that never
 *               returns to 'none' is the bug the review was worried about
 *   nan         any frame with a non-finite position or velocity
 *   hurt        whether the hero's sword ever took hp off it
 *   died/drop   it is then worn down with real hits (Ent.damageEnemy) until it
 *               dies, and what DS.Loot rolled for it and what landed on the
 *               floor is recorded
 * Harpies run twice at every depth 12..20 -- hero idle, hero swinging -- since
 * the edge case under review sits between the flyer brain's dive and the
 * volley's own phase handling. Bosses: the Frost Wyrm (20), Lich (25) and
 * Magma Colossus (30) in their own arenas; each must use its moves, take
 * damage, enrage, die, and hand the floor its reward.
 *
 * Exit code 1 when any check fails. Every console error on the page fails too.
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
  window.__bErrors = [];
  const push = (m) => { try { window.__bErrors.push(String(m).slice(0, 400)); } catch (e) {} };
  const oe = console.error.bind(console);
  console.error = function () { push(Array.prototype.join.call(arguments, ' ')); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => push(e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => push('rejection ' + (e.reason && (e.reason.stack || e.reason))));
})();`;

/* The in-page driver. Installed once; every case is one call into it. */
const DRIVER = `(() => {
  const Ent = DS.Ent;
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code: code, key: code, bubbles: true }));
  /* A hit is hp OR shield lost: armour soaks whole hits (player.js hurt). */
  const vit = (p) => p.hp + (p.shield || 0);
  const finite = (e) => [e.x, e.y, e.vx, e.vy].every(Number.isFinite);

  /* Loot rolls and projectiles, attributed per case. */
  const tally = { loot: [], shots: 0 };
  if (!DS.Loot.__bst) {
    const roll = DS.Loot.enemyLoot;
    DS.Loot.enemyLoot = function () { const r = roll.apply(this, arguments); tally.loot.push(r); return r; };
    const spawn = Ent.spawnProjectile;
    Ent.spawnProjectile = function (g, o) { if (o && o.friendly === false) tally.shots++; return spawn.apply(this, arguments); };
    DS.Loot.__bst = true;
  }

  function stepOnce(attack, f) {
    if (attack) {
      if (f % 12 === 0) key('keydown', 'KeyJ');
      if (f % 12 === 4) key('keyup', 'KeyJ');
    }
    DS.Input.poll();
    DS.Ptr.beginFrame();
    DS.currentScene.update();
    DS.Input.endFrame();
    /* Draw every third step. Whether a monster may notice the hero is
       Ent.onScreen, and under the 3D camera that reads the frustum, which is
       only placed when a frame is RENDERED -- a pure update loop leaves the
       previous floor's camera in place and every monster asleep. */
    if (f % 3 === 0) {
      DS.currentScene.draw();
      DS.R.present(f / 60);
      if (DS.HUI && DS.HUI.sync) DS.HUI.sync();
    }
    const p = DS.currentGame.player;
    /* Kept alive, but only topped up once it is low, so hits still register
       as hp (or shield) lost. The max lives on p.stats (player.js). */
    if (p) { const mx = (p.stats && p.stats.maxHp) || 6; p.dead = false; if (p.hp < mx * 0.5) p.hp = mx; DS.currentGame.deathTimer = 0; }
  }

  function clearRoom(g) {
    for (let i = 0; i < g.enemies.length; i++) g.enemies[i].dead = true;
    g.enemies.length = 0;
    if (g.projectiles) g.projectiles.length = 0;
  }

  function load(depth, kind) {
    const g = DS.currentGame;
    g.depth = depth;
    DS.Game.loadLevel(g, kind);
    const p = g.player;
    p.dead = false; p.hp = (p.stats && p.stats.maxHp) || p.hp;
    return g;
  }

  /* One monster's record, updated every frame. */
  function watch(e) {
    return { e: e, kind: e.kind, attacks: 0, volleys: 0, dives: 0, inAttack: 0, longest: 0,
             nan: 0, hpStart: e.hp, hurtByHero: false, states: {}, lastState: null,
             limit: Math.round((e.cfg.wind || 0) * (e.windScale || 1)) + (e.cfg.strike || 0) +
                    Math.round((e.cfg.recover || 0) * (e.windScale || 1)) + 12,
             moved: 0, lastX: e.x, lastY: e.y, awake: 0, chase: 0, dMin: Infinity, dyAt: 0 };
  }

  /* "live" is false on a hitstop frame: the scene froze, so the attack timer
     did not move and the frame does not count toward "stuck". */
  function observe(w, live) {
    const e = w.e;
    if (e.dead) return;
    const p = DS.currentGame.player;
    const ddx = Ent.centerX(p) - Ent.centerX(e), ddy = Ent.centerY(p) - Ent.centerY(e);
    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dd < w.dMin) { w.dMin = dd; w.dyAt = ddy; }
    if (e.awake) w.awake++;
    if (e.state === 'CHASE') w.chase++;
    if (!finite(e)) w.nan++;
    if (e.attackState && e.attackState !== 'none') {
      if (w.lastState === 'none' || w.lastState === null) {
        w.attacks++;
        if (e.volley) w.volleys++;
      }
      if (live) w.inAttack++;
      w.longest = Math.max(w.longest, w.inAttack);
    } else w.inAttack = 0;
    if (e.diving && !w.wasDiving) w.dives++;
    w.wasDiving = !!e.diving;
    if (e.state) w.states[e.state] = (w.states[e.state] || 0) + 1;
    w.lastState = e.attackState || 'none';
    w.moved += Math.abs(e.x - w.lastX) + Math.abs(e.y - w.lastY);
    w.lastX = e.x; w.lastY = e.y;
  }

  /* Wear a monster down with real hits until it dies; returns frames taken. */
  function finish(g, e, attack, f0) {
    let f = f0;
    for (let i = 0; i < 1800 && !e.dead; i++, f++) {
      if (i % 20 === 0) Ent.damageEnemy(g, e, Math.max(2, Math.ceil(e.maxHp * 0.08)), { dir: 1 });
      stepOnce(attack, f);
    }
    return f - f0;
  }

  function summary(w) {
    const e = w.e;
    return { kind: w.kind, attacks: w.attacks, volleys: w.volleys, dives: w.dives,
             longest: w.longest, limit: w.limit, nan: w.nan, hurtByHero: w.hurtByHero,
             hp: e.hp, maxHp: e.maxHp, dead: !!e.dead, moved: Math.round(w.moved),
             states: Object.keys(w.states), x: Math.round(e.x), y: Math.round(e.y),
             awake: w.awake, chase: w.chase, dMin: Math.round(w.dMin), dyAt: Math.round(w.dyAt) };
  }

  window.__BST = {
    /* A pack of one kind beside the hero on a normal floor at this depth. */
    pack: function (depth, kind, n, seconds, attack) {
      const g = load(depth, 'normal');
      clearRoom(g);
      tally.loot.length = 0; tally.shots = 0;
      const p = g.player, cx = Ent.centerX(p);
      const flying = !!(DS.Enemies.TYPES[kind] && DS.Enemies.TYPES[kind].flying);
      const offs = [70, -86, 118, -130, 150].slice(0, n);
      const ws = offs.map((o) => watch(DS.Enemies.create(g, cx + o, p.y - (flying ? 34 : 6), kind, false)));
      const hpAt = ws.map((w) => w.e.hp);
      let heroHits = 0;
      const hp0 = p.hp;
      const frames = Math.round(seconds * 60);
      let f = 0;
      for (; f < frames; f++) {
        const before = vit(p), live = !(g.hitstop > 0);
        stepOnce(attack, f);
        if (vit(p) < before) heroHits++;
        for (let i = 0; i < ws.length; i++) {
          observe(ws[i], live);
          if (ws[i].e.hp < hpAt[i]) ws[i].hurtByHero = true;
          hpAt[i] = ws[i].e.hp;
        }
      }
      const pickups0 = g.pickups.length;
      const sim = ws.map(summary);
      let killFrames = 0;
      for (let i = 0; i < ws.length; i++) killFrames += finish(g, ws[i].e, attack, f + killFrames);
      for (let k = 0; k < 30; k++) stepOnce(false, f + killFrames + k);
      return { depth: depth, kind: kind, attack: attack, heroHits: heroHits, shots: tally.shots,
               sim: sim, died: ws.map((w) => !!w.e.dead),
               loot: tally.loot.map((l) => l ? Object.keys(l).filter((k) => l[k]).join('+') || 'none' : 'null'),
               pickups: g.pickups.length - pickups0 };
    },

    /* A boss floor: hero put beside the boss, the fight run, then the boss
       worn down with real hits through its enrage to its death. */
    boss: function (depth, seconds) {
      const g = load(depth, 'boss');
      tally.loot.length = 0; tally.shots = 0;
      const b = g.boss;
      if (!b) return { depth: depth, error: 'no boss on this floor' };
      let reward = null;
      const down = g.onFloorBossDown, win = g.onBossDefeated;
      g.onFloorBossDown = function () { reward = 'floor'; return down && down.apply(this, arguments); };
      g.onBossDefeated = function () { reward = 'act'; return win && win.apply(this, arguments); };
      const p = g.player;
      p.x = b.x + (b.x > p.x ? -70 : 70) ; p.y = b.y + b.h - p.h; p.vx = 0; p.vy = 0;
      const w = watch(b);
      let hp = b.hp, heroHits = 0;
      const frames = Math.round(seconds * 60);
      let f = 0;
      for (; f < frames; f++) {
        const before = vit(p), live = !(g.hitstop > 0);
        stepOnce(true, f);
        if (vit(p) < before) heroHits++;
        observe(w, live);
        if (b.hp < hp) w.hurtByHero = true;
        hp = b.hp;
        if (f % 240 === 120) Ent.damageEnemy(g, b, Math.ceil(b.maxHp * 0.12), { dir: 1 });
      }
      const sim = summary(w);
      const pickups0 = g.pickups.length, chests0 = (g.chests || []).length;
      const killFrames = finish(g, b, true, f);
      for (let k = 0; k < 90; k++) stepOnce(false, f + killFrames + k);
      return { depth: depth, name: b.name, heroHits: heroHits, shots: tally.shots, sim: sim,
               phase: b.phase, died: !!b.dead, reward: reward, killFrames: killFrames,
               pickups: g.pickups.length - pickups0, chests: (g.chests || []).length - chests0,
               stairs: !!(g.map && g.map.exit) };
    }
  };
  return true;
})()`;

async function waitFor(session, expr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.eval('!!(' + expr + ')')) return true;
    await cdp.sleep(200);
  }
  throw new Error('timed out waiting for: ' + expr);
}

const failures = [];
function check(label, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '   ' + detail : ''));
  if (!ok) failures.push(label);
}

/* Why a monster did (or did not) fight: frames on screen, frames hunting,
   closest approach and the height difference there. */
function detail(s) {
  console.log('       ' + s.kind + ' awake ' + s.awake + 'f, chasing ' + s.chase + 'f, closest ' + s.dMin +
              'px (dy ' + s.dyAt + '), attacks ' + s.attacks + ', at ' + s.x + ',' + s.y);
}

function judgeMonster(tag, s) {
  check(tag + ' never leaves the attack machine stuck', s.longest <= s.limit,
        'longest attack ' + s.longest + 'f, allowed ' + s.limit + 'f');
  check(tag + ' position and velocity stay finite', s.nan === 0, s.nan + ' bad frames');
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8133/';
  const seconds = Number(value(args, '--seconds') || 20);
  const jsonOut = value(args, '--json');
  const report = { url: base, seconds: seconds, harpy: [], pack: [], boss: [], errors: [] };

  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 1500);
    await waitFor(session, 'window.DS && DS.UI3 && DS.UI3.ready && DS.Scenes && DS.Inv && DS.Enemies && DS.Game', 40000);
    await session.eval(`localStorage.setItem('ds_name', JSON.stringify('QA'))`);
    await session.eval('DS.Scenes.play(777, { weapon: "sword" })');
    await waitFor(session, 'DS.currentGame && DS.currentGame.map && DS.currentGame.player && DS.currentScene', 30000);
    await cdp.sleep(800);
    /* Stop the rAF loop simulating on its own (main.js honours this), so the
       only frames that run are the ones this tool steps. */
    await session.eval('DS.__paused = true; if (DS.PostFX) DS.PostFX.setQuality("low")');
    await session.eval(DRIVER);

    /* --- harpies, depth 12..20, hero idle and hero swinging --- */
    for (let d = 12; d <= 20; d++) {
      for (const attack of [false, true]) {
        const r = await session.eval(`__BST.pack(${d}, 'harpy', 3, ${seconds}, ${attack})`);
        report.harpy.push(r);
        const tag = 'harpy d' + d + (attack ? ' swinging' : ' idle');
        const volleys = r.sim.reduce((a, s) => a + s.volleys, 0);
        const dives = r.sim.reduce((a, s) => a + s.dives, 0);
        const attacks = r.sim.reduce((a, s) => a + s.attacks, 0);
        console.log('     ' + tag + ': attacks ' + attacks + ' (volleys ' + volleys + ', dives ' + dives +
                    '), hero hit ' + r.heroHits + 'x, shots ' + r.shots);
        if (!attacks) r.sim.forEach(detail);
        r.sim.forEach((s, i) => judgeMonster(tag + ' #' + i, s));
        check(tag + ': the pack attacks', attacks > 0, attacks + ' wind-ups');
        check(tag + ': all died when worn down', r.died.every(Boolean), JSON.stringify(r.died));
      }
    }
    const allH = report.harpy;
    const vTot = allH.reduce((a, r) => a + r.sim.reduce((b, s) => b + s.volleys, 0), 0);
    const dTot = allH.reduce((a, r) => a + r.sim.reduce((b, s) => b + s.dives, 0), 0);
    check('harpies fire feather volleys', vTot > 0, vTot + ' volleys over ' + allH.length + ' runs');
    check('harpies dive', dTot > 0, dTot + ' dives');
    check('the hero hurts a harpy when swinging',
          allH.some((r) => r.attack && r.sim.some((s) => s.hurtByHero)));

    /* --- the other three --- */
    const packs = [['icewisp', 14], ['cultist', 17], ['magmacrab', 22]];
    for (const [kind, d] of packs) {
      const r = await session.eval(`__BST.pack(${d}, '${kind}', 2, ${seconds}, true)`);
      report.pack.push(r);
      const tag = kind + ' d' + d;
      const attacks = r.sim.reduce((a, s) => a + s.attacks, 0);
      console.log('     ' + tag + ': attacks ' + attacks + ', hero hit ' + r.heroHits + 'x, shots ' + r.shots +
                  ', loot ' + JSON.stringify(r.loot) + ', pickups +' + r.pickups);
      r.sim.forEach(detail);
      r.sim.forEach((s, i) => judgeMonster(tag + ' #' + i, s));
      check(tag + ': attacks', attacks > 0, attacks + ' wind-ups');
      check(tag + ': lands a hit on the hero', r.heroHits > 0, r.heroHits + ' hits');
      check(tag + ': takes damage', r.sim.some((s) => s.hurtByHero) || r.died.every(Boolean));
      check(tag + ': dies', r.died.every(Boolean), JSON.stringify(r.died));
      check(tag + ': rolls loot on death', r.loot.length === r.died.length, r.loot.length + ' rolls');
    }

    /* --- the three new bosses --- */
    for (const d of [20, 25, 30]) {
      const r = await session.eval(`__BST.boss(${d}, ${Math.max(seconds, 25)})`);
      report.boss.push(r);
      if (r.error) { check('boss d' + d, false, r.error); continue; }
      const tag = 'boss d' + d + ' ' + r.name;
      console.log('     ' + tag + ': states ' + r.sim.states.join(',') + ', hero hit ' + r.heroHits +
                  'x, shots ' + r.shots + ', reward ' + r.reward + ', pickups +' + r.pickups +
                  ', chests +' + r.chests);
      check(tag + ': position finite', r.sim.nan === 0, r.sim.nan + ' bad frames');
      const moves = r.sim.states.filter((s) => ['INTRO', 'IDLE', 'ENRAGE'].indexOf(s) < 0);
      check(tag + ': uses its moves', moves.length >= 2, moves.join(','));
      check(tag + ': lands a hit on the hero', r.heroHits > 0, r.heroHits + ' hits');
      check(tag + ': takes damage', r.sim.hurtByHero);
      check(tag + ': enrages', r.phase === 2);
      check(tag + ': dies', r.died);
      check(tag + ': hands the floor its reward', !!r.reward, String(r.reward));
    }

    report.errors = await session.eval('window.__bErrors || []');
    check('no console errors', report.errors.length === 0, report.errors.slice(0, 5).join(' | '));
  } finally {
    await close();
  }
  if (jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, jsonOut), JSON.stringify(report, null, 2));
  }
  console.log(failures.length ? '\n' + failures.length + ' FAILED' : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((err) => { console.error('check-bestiary: ' + err.message); process.exit(2); });
