/* The character screen's logic (src/ui-html/creator.js), with no DOM: what is in
   each page, how the cursor walks it, what pressing ENTER does (wear, arm, buy,
   refuse) and what the run summary banks. The HTML itself is checked live by
   tools/qa/check-character.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');
const THREE_MOCK = require('./_three-mock');

const FILES = ['src/core/rng.js', 'src/core/voxel.js', 'src/items/look.js', 'src/items/look3d.js', 'src/items/look3d-wear.js',
               'src/items/look2d.js', 'src/ui-html/creator.js'];
const STUBS = THREE_MOCK +
  ';window.__store = {}; window.localStorage = { getItem: function (k) { return k in window.__store ? window.__store[k] : null; },' +
  ' setItem: function (k, v) { window.__store[k] = String(v); }, removeItem: function (k) { delete window.__store[k]; } };' +
  'window.DS.__sounds = []; window.DS.Audio = { play: function (n) { window.DS.__sounds.push(n); } };' +
  'window.DS.__down = {}; window.DS.__pressed = {};' +
  'window.DS.Input = { justPressed: function (a) { return !!window.DS.__pressed[a]; }, isDown: function (a) { return !!window.DS.__down[a]; },' +
  ' consume: function (a) { delete window.DS.__pressed[a]; } };';

function fresh() {
  const DS = load(FILES, STUBS);
  const press = (...actions) => {
    DS.__pressed = {}; DS.__down = {};
    for (const a of actions) { DS.__pressed[a] = 1; DS.__down[a] = 1; }
  };
  const tick = (scene, ...actions) => { press(...actions); scene.update(); press(); scene.update(); };
  return { DS, press, tick };
}

const ctrl = (scene, pred) => { for (const line of scene.controls()) for (const c of line) if (pred(c)) return c; return null; };
const item = (scene, id) => ctrl(scene, (c) => c.kind === 'item' && c.item.id === id);

test('every slot of the catalog has a page, and every page has controls to walk', () => {
  const { DS } = fresh();
  const slots = new Set();
  for (const tab of DS.Creator.TABS) {
    const secs = DS.Creator.sectionsOf(tab, 'sword');
    assert.ok(DS.Creator.linesOf(secs).length > 0, tab.id + ' has controls');
    for (const s of tab.secs) if (s.slot) slots.add(s.slot);
  }
  for (const slot of DS.Look.ITEM_SLOTS.concat(['weapon'])) assert.ok(slots.has(slot), slot + ' has a page');
  // Every trait is on a page too.
  const keys = new Set();
  for (const tab of DS.Creator.TABS) for (const s of tab.secs) if (s.key) keys.add(s.key);
  for (const k of DS.Look.TRAIT_KEYS) assert.ok(keys.has(k), k + ' has a page');
});

test('a page lists free things first, then by rarity, limited last', () => {
  const { DS } = fresh();
  const tab = DS.Creator.TABS.find((t) => t.id === 'top');
  const list = DS.Creator.sectionsOf(tab, null)[0].ctrls.map((c) => c.item);
  const order = DS.Look.RARITIES;
  assert.ok(list[0].starter, 'starters lead');
  let last = -1;
  for (const it of list.filter((i) => !i.starter)) { const r = order.indexOf(it.rarity); assert.ok(r >= last, it.key); last = r; }
  assert.equal(list[list.length - 1].rarity, 'limited');
});

test('opening starts the cursor on what is worn', () => {
  const { DS } = fresh();
  const scene = DS.Creator.create({});
  const c = scene.controls()[scene.state.y][scene.state.x];
  assert.equal(c.kind, 'swatch');
  assert.equal(c.value, DS.Look.look.skin);
  scene.gotoTab(4);                                     // TOP
  const top = scene.controls()[scene.state.y][scene.state.x];
  assert.equal(top.item.id, DS.Look.look.top);
});

test('the cursor walks the grid: down a line, across, back to the tabs', () => {
  const { DS, tick } = fresh();
  const scene = DS.Creator.create({});
  scene.gotoTab(4);
  scene.state.y = 0; scene.state.x = 0;
  tick(scene, 'right');
  assert.equal(scene.state.x, 1);
  tick(scene, 'down');
  assert.equal(scene.state.y, 1);
  tick(scene, 'up'); tick(scene, 'up');
  assert.equal(scene.state.y, 0, 'stops at the top');
  scene.state.x = 0;
  tick(scene, 'left');
  assert.equal(scene.state.col, 0, 'left at the edge goes to the tabs');
  tick(scene, 'down');
  assert.equal(scene.state.tab, 5, 'down on the tabs changes the page');
  tick(scene, 'right');
  assert.equal(scene.state.col, 1);
  tick(scene, 'skill');                                  // E
  assert.equal(scene.state.tab, 6);
  tick(scene, 'swap'); tick(scene, 'swap');              // Q, Q
  assert.equal(scene.state.tab, 4);
});

test('a free trait is worn on ENTER; a dye needs a dyeable piece', () => {
  const { DS, tick } = fresh();
  const scene = DS.Creator.create({});
  scene.activate(ctrl(scene, (c) => c.kind === 'swatch' && c.value === 'ebony'));
  assert.equal(DS.Look.look.skin, 'ebony');
  scene.activate(ctrl(scene, (c) => c.kind === 'chip' && c.value === 'broad'));
  assert.equal(DS.Look.look.build, 'broad');
  // Boots are dyed by default, so the dye works; a fixed-palette piece refuses it.
  scene.gotoTab(6);
  const dye = ctrl(scene, (c) => c.kind === 'swatch' && c.value === 'red');
  scene.activate(dye);
  assert.equal(DS.Look.look.bootsDye, 'red');
  DS.Look.bank(500); DS.Look.buy(DS.Look.itemOf('boots', 'ironboots')); DS.Look.equip('boots', 'ironboots');
  scene.gotoTab(6);
  const dye2 = ctrl(scene, (c) => c.kind === 'swatch' && c.value === 'blue');
  scene.activate(dye2);
  assert.equal(DS.Look.look.bootsDye, 'red', 'iron boots keep their own colour');
  assert.equal(DS.__sounds[DS.__sounds.length - 1], 'error');
});

test('a piece you do not own is armed by the first ENTER and bought by the second', () => {
  const { DS } = fresh();
  DS.Look.bank(200);
  const scene = DS.Creator.create({});
  scene.gotoTab(4);
  const hoodie = item(scene, 'hoodie');
  scene.activate(hoodie);
  assert.equal(DS.Look.owns(hoodie.item), false, 'one press only arms it');
  assert.equal(DS.Look.profile.wallet.keys, 200);
  assert.match(scene.state.note, /again to buy Hoodie for 30 keys/);
  scene.activate(hoodie);
  assert.equal(DS.Look.owns(hoodie.item), true);
  assert.equal(DS.Look.look.top, 'hoodie', 'bought means worn');
  assert.equal(DS.Look.profile.wallet.keys, 170);
  assert.equal(DS.__sounds.includes('coin'), true);
  // Owned: ENTER wears it, no more spending.
  DS.Look.equip('top', 'tunic');
  scene.activate(hoodie);
  assert.equal(DS.Look.look.top, 'hoodie');
  assert.equal(DS.Look.profile.wallet.keys, 170);
});

test('too few keys is refused with the amount short; a limited piece is refused always', () => {
  const { DS } = fresh();
  DS.Look.bank(10);
  const scene = DS.Creator.create({});
  scene.gotoTab(4);
  const chain = item(scene, 'chain');
  scene.activate(chain); scene.activate(chain);
  assert.equal(DS.Look.owns(chain.item), false);
  assert.match(scene.state.note, /80 more needed/);
  DS.Look.bank(99999);
  const warden = item(scene, 'warden_plate');
  scene.activate(warden); scene.activate(warden);
  assert.equal(DS.Look.owns(warden.item), false);
  assert.match(scene.state.note, /LIMITED · Defeat Stone Warden ten times/);
});

test('the side panel says what it is: price, progress toward a limited piece, what is worn', () => {
  const { DS } = fresh();
  DS.Look.bank(100);
  const scene = DS.Creator.create({});
  scene.gotoTab(4);
  let d = scene.describe(item(scene, 'chain'));
  assert.equal(d.rarity, 'rare');
  assert.match(d.lines.join(' '), /Price 90 keys\. You have 100\./);
  assert.deepEqual([d.act.label, d.act.enabled], ['BUY · 90', true]);
  DS.Look.profile.wallet.keys = 5;
  d = scene.describe(item(scene, 'chain'));
  assert.equal(d.act.enabled, false, 'cannot afford');
  d = scene.describe(item(scene, 'tunic'));
  assert.deepEqual([d.act.label, d.act.enabled], ['WORN', false]);
  assert.match(d.lines.join(' '), /free starter/);
  DS.Look.count('boss.warden', 4);
  d = scene.describe(item(scene, 'warden_plate'));
  assert.equal(d.act.label, 'LOCKED');
  assert.match(d.lines.join(' '), /Progress 4 \/ 10/);
});

test('the weapon page lists the skins of the chosen weapon, and the type chips switch it', () => {
  const { DS } = fresh();
  const scene = DS.Creator.create({});
  scene.gotoTab(10);
  const has = (w) => scene.controls().flat().some((c) => c.kind === 'item' && c.item.w === w);
  assert.ok(has('sword'));
  assert.ok(!has('bow'));
  scene.activate(ctrl(scene, (c) => c.kind === 'wtype' && c.value === 'bow'));
  assert.ok(has('bow') && !has('sword'));
  DS.Look.bank(500);
  const skin = item(scene, 'bow.frost');
  scene.activate(skin); scene.activate(skin);
  assert.equal(DS.Look.look.weapon.bow, 'bow.frost');
  assert.equal(DS.Look.look.weapon.sword, undefined, 'only the bow changed');
});

test('R draws a look from what is owned; ESC leaves, and the first time it also marks the character made', () => {
  const { DS, tick } = fresh();
  let closed = 0;
  const scene = DS.Creator.create({ first: true, onClose: () => closed++ });
  assert.equal(DS.Look.created, false);
  tick(scene, 'reroll');
  for (const slot of DS.Look.ITEM_SLOTS) assert.ok(DS.Look.owns(DS.Look.itemOf(slot, DS.Look.look[slot])), slot);
  tick(scene, 'back');
  assert.equal(closed, 1);
  assert.equal(DS.Look.created, true);
  assert.equal(scene.done, true);
  tick(scene, 'back');
  assert.equal(closed, 1, 'closes once');
});

test('a run that ends banks its keys and counts its bosses toward the limited sets', () => {
  const { DS } = fresh();
  const out = DS.Look.finishRun({ keys: 9, depth: 12, bosses: ['king', 'warden'], actsCleared: 1 });
  assert.equal(out.banked, 9);
  assert.equal(DS.Look.profile.counters['boss.king'], 1);
  assert.equal(DS.Look.profile.counters['boss.warden'], 1);
  assert.ok(out.won.some((i) => i.id === 'portalwalker'), 'clearing act I earns the cloak');
});
