#!/usr/bin/env node
/* A contact sheet of the bosses: each one in the room it fights in, at rest and in two
 * of its moves, plus a wide picture of the room itself (ledges, pillars, vault).
 *
 *   node tools/qa/shoot-bosses.js [base-url] [--tag T] [--keys minotaur,zeus]
 *
 * The sim stays paused: the boss's `state` and `stateTimer` are forced and only the
 * draw runs, which is exactly what the 3D pose code reads. Pictures go to
 * tools/qa/out/bosses/<tag>/ (one sheet per boss, plus arena-<key>.png); exits
 * non-zero on any console error. */

'use strict';

const fs = require('fs');
const path = require('path');
const { boot, shoot } = require('./lib/map-page');

const ROOT = path.dirname(path.dirname(__dirname));

function value(args, flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}

/* Depth to fight at, and three poses: [state, frames left, extra fields]. */
const BOSSES = {
  minotaur: { depth: 21, poses: [['IDLE', 30, {}], ['RUSH', 150, {}], ['AXESPIN', 50, {}], ['STUN', 40, {}]] },
  medusa:   { depth: 23, poses: [['IDLE', 30, {}], ['GAZE', 70, {}], ['SNAKES', 40, {}], ['PIT', 40, {}]] },
  talos:    { depth: 27, poses: [['IDLE', 30, {}], ['ANVIL', 50, {}], ['METEOR', 30, {}], ['ERUPT', 40, {}]] },
  hades:    { depth: 25, poses: [['IDLE', 30, {}], ['SOULFIRE', 60, {}], ['BIDENT', 60, {}], ['BIDENT', 40, {}]] },
  zeus:     { depth: 30, poses: [['IDLE', 30, {}], ['BOLTS', 60, {}], ['STORM', 60, {}], ['THUNDERCLAP', 60, { onGround: false }]] },
  warden:   { depth: 5, poses: [['IDLE', 30, {}], ['SLAM', 40, {}], ['QUAKE', 40, {}], ['CHARGE', 40, {}]] },
  arbiter:  { depth: 15, poses: [['IDLE', 30, {}], ['SMITE', 60, {}], ['VOLLEY', 30, {}], ['SUMMON', 30, {}]] },
  wyrm:     { depth: 20, poses: [['IDLE', 30, {}], ['BREATH', 60, {}], ['DIVE', 50, {}], ['ICICLES', 60, {}]] },
  lich:     { depth: 35, poses: [['IDLE', 30, {}], ['ORBS', 40, {}], ['RAISE', 40, {}], ['BLINK', 20, {}]] },
  magma:    { depth: 40, poses: [['IDLE', 30, {}], ['ERUPT', 40, {}], ['METEOR', 40, {}], ['LAVAWAVE', 50, {}]] }
};

const SETUP = `(key, depth) => {
  const g = __maps.g(), T = DS.C.TILE;
  __maps.go(depth);
  g.enemies.length = 0; if (g.projectiles) g.projectiles.length = 0;
  const p = g.player; p.dead = false; p.hp = p.maxHp || 50;
  let x, y;
  if (g.bossTrigger) { x = g.bossTrigger.x; y = g.bossTrigger.y; g.arena = g.arena; }
  else { x = g.map.pixelW / 2; y = (DS.LevelGen.ROOM_H - 2) * T; }
  const boss = DS.Bosses.create(g, x, y, key, { actBoss: !g.bossTrigger });
  boss.state = 'IDLE'; boss.stateTimer = 30;
  p.x = boss.x - 70; p.y = boss.y + boss.h - p.h; p.vx = 0; p.vy = 0; p.facing = 1;
  return { name: boss.name, w: boss.w, h: boss.h, hp: boss.maxHp, arena: g.arena || null, room: [g.map.w, g.map.h] };
}`;

const POSE = `(state, timer, extra) => {
  const g = __maps.g(), b = g.boss, p = g.player;
  b.state = state; b.stateTimer = timer; b.facing = -1; p.facing = 1;
  b.frame = 30; b.invuln = 0; b.hurtFlash = 0; b.onGround = true; b.vx = 0;
  Object.assign(b, extra || {});
  const R = DS.R, m = g.map;
  R.setCam(b.x + b.w / 2 - 34, b.y + b.h / 2);
  R.clampCam(0, m.pixelW, 0, m.pixelH);
  __maps.draw(6);
  const c = DS.R3D.worldToScreen(b.x + b.w / 2, b.y + b.h / 2, {});
  const v = DS.UI3.view;
  return { x: v.x + c.x * v.w / DS.C.W, y: v.y + c.y * v.h / DS.C.H };
}`;

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8124/';
  const tag = value(args, '--tag') || 'shots';
  const out = path.resolve(ROOT, 'tools/qa/out/bosses', tag);
  const keys = (value(args, '--keys') || 'minotaur,medusa,talos,hades,zeus').split(',').filter((k) => BOSSES[k]);
  const failures = [];

  const { session, close, view } = await boot(base, { size: [1280, 720], quality: 'high' });
  try {
    const cw = 340, ch = 300;
    const sheets = [];
    for (const key of keys) {
      const spec = BOSSES[key];
      const info = await session.eval(`(${SETUP})('${key}', ${spec.depth})`);
      console.log(key + ' d' + spec.depth + ': ' + info.name + ' ' + info.w + 'x' + info.h + ' hp ' + info.hp +
                  ' room ' + info.room.join('x') + (info.arena ? ' arena ' + info.arena.x0 + '-' + info.arena.x1 : ''));
      const files = [];
      for (let i = 0; i < spec.poses.length; i++) {
        const [state, timer, extra] = spec.poses[i];
        const at = await session.eval(`(${POSE})('${state}', ${timer}, ${JSON.stringify(extra)})`);
        const file = path.join(out, `${key}-${i}-${state}.png`);
        const x = Math.max(0, Math.min(view.x + view.width - cw, Math.round(at.x - cw / 2)));
        const y = Math.max(0, Math.min(view.y + view.height - ch, Math.round(at.y - ch * 0.55)));
        await shoot(session, file, { x: x, y: y, width: cw, height: ch });
        files.push({ file, state });
        if (i === 0) await shoot(session, path.join(out, `arena-${key}.png`), view);
      }
      sheets.push({ key, files });
    }
    const errors = await session.eval('window.__gfxErrors || []').catch(() => []);
    if (errors.length) { failures.push(...errors); console.log('console errors:\n  ' + errors.join('\n  ')); }
    for (const sheet of sheets) {
      let html = `<body style="margin:0;background:#111;font:13px monospace;color:#ddd"><div style="display:flex;gap:2px">`;
      for (const f of sheet.files) html += `<div><div style="padding:2px 6px">${sheet.key} ${f.state}</div><img width="${cw}" height="${ch}" src="file:///${f.file.replace(/\\/g, '/')}"></div>`;
      html += '</div></body>';
      const page = path.join(out, `sheet-${sheet.key}.html`);
      fs.writeFileSync(page, html);
      const W = (cw + 2) * sheet.files.length, H = ch + 24;
      await session.cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
      await session.goto('file:///' + page.replace(/\\/g, '/'), 600);
      await shoot(session, path.join(out, `sheet-${sheet.key}.png`), { x: 0, y: 0, width: W, height: H });
      fs.unlinkSync(page);
    }
    console.log('wrote ' + out);
  } finally {
    await close();
  }
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
