const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* The combo table on its own, plus the real player swing code on a stubbed
   world: which step a press performs, when the chain drops, what each step
   hits for, and that a full chain keeps the old one-swing damage rate. */

const STUBS = `
  window.DS.Audio = { play: function () {} };
  window.DS.R = { shake: function () {}, flash: function () {}, punch: function () {} };
  window.DS.FX = autoStub();
  window.DS.Boons = { flag: function () { return 0; }, bonus: function () { return 0; }, onHurt: function () {} };
  window.DS.Paperdoll = { buildSet: function () { return {}; }, bare: function () { return {}; } };
  window.DS.Ent = {
    make: function (x, y, w, h) { return { x: x, y: y, w: w, h: h, vx: 0, vy: 0, facing: 1, frame: 0 }; },
    centerX: function (e) { return e.x + e.w / 2; },
    centerY: function (e) { return e.y + e.h / 2; }
  };
`;

const DS = load([
  'src/core/rng.js',
  'src/items/weapons.js',
  'src/systems/combos.js',
  'src/entities/player.js'
], STUBS);

const C = DS.Combos;
const W = DS.Weapons;

function makeItem(type) {
  const base = W.WEAPONS[type];
  return {
    type: type, rarity: 0, element: null, procs: null,
    stats: { damage: 10, cooldown: base.cooldown, crit: 0, critDamage: 2, knockback: base.knockback,
             stamina: 0, mana: 0, reach: 1, elementShare: 0, elemPower: 1 }
  };
}

function makePlayer(item) {
  const inv = { armor: {}, weapon: item };
  DS.Inv = {
    derive: function () {
      return { maxHp: 5, shield: 0, maxStamina: 100, maxMana: 100, dashCharges: 1, damageBonus: 0, critBonus: 0 };
    },
    weapon: function () { return item; }
  };
  return DS.Player.create(0, 0, inv);
}

const G = { hitstop: 0, enemies: [], frames: 0 };

test('every melee weapon has a combo, bow and staff do not', () => {
  assert.equal(C.length('sword'), 3);
  assert.equal(C.length('dagger'), 3);
  assert.equal(C.length('greataxe'), 2);
  assert.equal(C.length('spear'), 2);
  assert.equal(C.forWeapon('bow'), null);
  assert.equal(C.forWeapon('staff'), null);
  for (const key of ['sword', 'dagger', 'greataxe', 'spear']) {
    const c = C.forWeapon(key);
    assert.ok(c.heavy && c.heavy.fx, key + ' has a heavy finisher with its own visual');
    const fx = new Set(c.steps.map((s) => s.fx).concat([c.heavy.fx]));
    assert.equal(fx.size, c.steps.length + 1, key + ' steps each have a distinct visual');
  }
});

test('finishers hit harder than openers; early steps are softer than the old flat swing', () => {
  for (const key of ['sword', 'dagger', 'greataxe', 'spear']) {
    const steps = C.forWeapon(key).steps;
    const last = steps[steps.length - 1];
    assert.ok(last.dmg > steps[0].dmg, key + ' finisher > opener');
    assert.ok(steps[0].dmg < 1, key + ' opener < 1');
    assert.ok(last.dmg > 1, key + ' finisher > 1');
  }
});

test('a full chain keeps damage per frame within a few percent of the old swing', () => {
  for (const key of ['sword', 'dagger', 'greataxe', 'spear']) {
    const steps = C.forWeapon(key).steps;
    const cooldown = W.WEAPONS[key].cooldown;
    let dmg = 0, frames = 0;
    for (const s of steps) {
      dmg += s.dmg;
      frames += C.timing(s, cooldown, false).cd;
    }
    const ratio = (dmg / frames) / (1 / cooldown);
    assert.ok(ratio > 0.94 && ratio < 1.1, key + ' dps ratio ' + ratio.toFixed(3));
  }
});

test('pick: the chain advances inside the window and restarts outside it', () => {
  const p = { comboStep: 0, comboWindow: 0 };
  let pick = C.pick('sword', p.comboStep, p.comboWindow);
  assert.equal(pick.index, 0);
  C.advance(p, 'sword', pick.index, 21);
  assert.equal(p.comboStep, 1);
  assert.equal(p.comboWindow, 21 + C.WINDOW);

  pick = C.pick('sword', p.comboStep, p.comboWindow);
  assert.equal(pick.index, 1);
  C.advance(p, 'sword', pick.index, 22);
  pick = C.pick('sword', p.comboStep, p.comboWindow);
  assert.equal(pick.index, 2);
  assert.equal(pick.last, true);
  C.advance(p, 'sword', pick.index, 35);
  // The finisher closes the chain.
  assert.equal(p.comboStep, 0);
  assert.equal(p.comboWindow, 0);

  // Waiting out the window drops back to the opener.
  C.advance(p, 'sword', 0, 21);
  for (let i = 0; i < 21 + C.WINDOW; i++) C.tick(p);
  assert.equal(p.comboWindow, 0);
  C.tick(p);
  assert.equal(p.comboStep, 0);
  assert.equal(C.pick('sword', p.comboStep, p.comboWindow).index, 0);
});

test('the window between inputs is about 20-24 frames after recovery', () => {
  assert.ok(C.WINDOW >= 20 && C.WINDOW <= 24);
  assert.ok(C.BUFFER > 0 && C.BUFFER <= 10);
});

test('timing: windup + active fit inside the swing, heavy keeps the old recovery', () => {
  for (const key of ['sword', 'dagger', 'greataxe', 'spear']) {
    const c = C.forWeapon(key);
    const cd = W.WEAPONS[key].cooldown;
    for (const s of c.steps) {
      const t = C.timing(s, cd, false);
      assert.ok(t.windup + t.active < t.swing, key + ' ' + s.key + ' hitbox inside the animation');
      assert.ok(t.cd >= 6);
    }
    const h = C.timing(c.heavy, cd, true);
    assert.equal(h.cd, Math.round(cd * 1.35));
    assert.ok(h.active >= 12, key + ' heavy keeps a long hit window');
  }
});

test('player: sword presses walk the chain and each step hits for its multiplier', () => {
  const item = makeItem('sword');
  const p = makePlayer(item);
  const base = W.WEAPONS.sword;
  const expected = C.forWeapon('sword').steps;
  for (let i = 0; i < 3; i++) {
    DS.Player.startSwing(G, p, item, base, false, 0);
    assert.equal(p.attackKey, expected[i].key);
    assert.equal(p.attackFx, expected[i].fx);
    assert.ok(Math.abs(p.pending.damage - 10 * expected[i].dmg) < 1e-9, 'step ' + i + ' damage');
    assert.equal(p.attackDelay, expected[i].windup);
    assert.equal(p.attackCooldown, C.timing(expected[i], base.cooldown, false).cd);
    // Recover, then press again right away (inside the window).
    const cd = p.attackCooldown;
    for (let f = 0; f < cd; f++) C.tick(p);
  }
  assert.equal(p.comboStep, 0, 'finisher resets the chain');
  assert.equal(p.pending.both, true, 'the spin finisher reaches round both sides');
});

test('player: a late press restarts the combo; a heavy blow is its own finisher', () => {
  const item = makeItem('dagger');
  const p = makePlayer(item);
  const base = W.WEAPONS.dagger;
  DS.Player.startSwing(G, p, item, base, false, 0);
  assert.equal(p.attackKey, 'crossA');
  for (let f = 0; f < p.attackCooldown + C.WINDOW + 2; f++) C.tick(p);
  DS.Player.startSwing(G, p, item, base, false, 0);
  assert.equal(p.attackKey, 'crossA', 'window expired -> opener again');

  DS.Player.startSwing(G, p, item, base, true, 1);
  assert.equal(p.attackKey, 'heavyDagger');
  assert.equal(p.attackHeavy, true);
  assert.equal(p.comboStep, 0);
  assert.ok(p.pending.damage > 10 * 2, 'charged heavy keeps the charge bonus');
});

test('player: the dagger dash-stab lunges forward on its strike', () => {
  const item = makeItem('dagger');
  const p = makePlayer(item);
  const base = W.WEAPONS.dagger;
  for (let i = 0; i < 3; i++) {
    DS.Player.startSwing(G, p, item, base, false, 0);
    if (i < 2) { const cd = p.attackCooldown; for (let f = 0; f < cd; f++) C.tick(p); }
  }
  assert.equal(p.attackKey, 'dashStab');
  const def = C.forWeapon('dagger').steps[2];
  assert.equal(p.lungeFrames, 0, 'no lunge during the anticipation');
  assert.equal(p.attackStepDef.lunge, def.lunge);
  assert.ok(p.pending.reach > W.WEAPONS.dagger.hit.w, 'the stab reaches further');
});
