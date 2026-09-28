/* Elemental infusion: run-scoped essences, cycling a weapon's element with
   R / T, the cost of doing it, and the per-element weapon passives that make
   each element do something of its own on hit. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, loadItems } = require('./_load');

const DS = loadItems();

// The item layer plus the element system, with a tiny recording Ent stand-in.
function loadWithElements() {
  const E = load([
    'src/core/rng.js',
    'src/systems/boons.js',
    'src/items/weapons.js',
    'src/items/affixes.js',
    'src/items/generator.js',
    'src/items/armor.js',
    'src/items/inventory.js',
    'src/systems/elements.js'
  ], 'window.DS.Audio = autoStub(); window.DS.Art = autoStub(); window.DS.SPR = autoStub();' +
     'window.DS.FX = autoStub(); window.DS.R3D = autoStub(); window.DS.R = autoStub();');
  E.Ent = {
    centerX: (e) => e.x + e.w / 2,
    centerY: (e) => e.y + e.h / 2,
    damageEnemy: (g, e, amount, opts) => {
      if (e.dead) return 0;
      e.hp -= amount;
      g.hits.push({ e: e, amount: amount, opts: opts || {} });
      return amount;
    },
    killEnemy: (g, e) => { e.dead = true; }
  };
  return E;
}

const EL = loadWithElements();

function weapon(element, rarity) {
  return DS.Loot.makeItem(DS.makeRng(11), 1, {
    type: 'sword', rarity: rarity || 0, element: element, noElement: !element
  });
}

function freshPlayer() {
  return { inv: DS.Inv.create('sword'), mana: 100 };
}

const quietGame = () => ({ toasts: [], toast(t) { this.toasts.push(t); } });

// --- unlocking --------------------------------------------------------------

test('a run starts with no essences and a plain starter', () => {
  const inv = DS.Inv.create('sword');
  assert.deepEqual([...DS.Inv.essences(inv)], []);
  assert.equal(inv.equipped[0].element, null);
  assert.equal(inv.equipped[0].starter, true);
});

test('picking up an elemental weapon unlocks its element once', () => {
  const inv = DS.Inv.create('sword');
  const r = DS.Inv.addItem(inv, weapon('fire'));
  assert.equal(r.essence, 'fire');
  assert.deepEqual([...DS.Inv.essences(inv)], ['fire']);
  const again = DS.Inv.addItem(inv, weapon('fire'));
  assert.equal(again.essence, null);
  assert.deepEqual([...DS.Inv.essences(inv)], ['fire']);
});

test('armour never unlocks an essence', () => {
  const inv = DS.Inv.create('sword');
  const helm = DS.Armor.makeArmor(DS.makeRng(3), 2, { slot: 'head', rarity: 1, material: 'leather' });
  DS.Inv.addItem(inv, helm);
  assert.equal(DS.Inv.essences(inv).length, 0);
});

test('a shrine essence card counts as unlocked', () => {
  const inv = DS.Inv.create('sword');
  let card = null;
  for (let seed = 1; seed < 200 && !card; seed++) {
    const cards = DS.Boons.offer(DS.makeRng(seed), inv.boons, inv);
    card = cards.find((c) => c.essence) || null;
  }
  assert.ok(card, 'some seed offers an essence');
  assert.ok(card.key.startsWith(DS.Inv.ESSENCE_BOON));
  inv.boons.push(card.key);            // what takeShrineCard does
  assert.ok(DS.Inv.hasEssence(inv, card.essence));
  assert.equal(DS.Boons.BY_KEY[card.key], card);
});

test('a shrine without an inventory offers plain boons only', () => {
  for (let seed = 1; seed < 60; seed++) {
    const cards = DS.Boons.offer(DS.makeRng(seed), []);
    assert.ok(cards.every((c) => !c.essence));
  }
});

test('boss kills grant a random locked essence until all are known', () => {
  const inv = DS.Inv.create('sword');
  const rng = DS.makeRng(5);
  const seen = new Set();
  for (let i = 0; i < DS.Weapons.ELEMENT_KEYS.length; i++) {
    const el = DS.Inv.grantRandomEssence(inv, rng);
    assert.ok(el && !seen.has(el));
    seen.add(el);
  }
  assert.equal(DS.Inv.grantRandomEssence(inv, rng), null);
  assert.equal(DS.Inv.essences(inv).length, 8);
});

// --- cycling ----------------------------------------------------------------

test('cycling walks known essences in element order and wraps', () => {
  const inv = DS.Inv.create('sword');
  ['wind', 'fire', 'water'].forEach((el) => DS.Inv.unlockEssence(inv, el));
  const item = inv.equipped[0];
  const order = [];
  for (let i = 0; i < 4; i++) {
    const next = DS.Inv.nextInfusion(inv, item, 1);
    DS.Inv.setInfusion(item, next);
    order.push(item.element);
  }
  assert.deepEqual(order, ['fire', 'water', 'wind', 'fire']);
  // And backwards from fire wraps to the last known.
  assert.equal(DS.Inv.nextInfusion(inv, item, -1), 'wind');
});

test('a plain weapon entering the ring backwards lands on the last essence', () => {
  const inv = DS.Inv.create('sword');
  ['ice', 'leaf'].forEach((el) => DS.Inv.unlockEssence(inv, el));
  assert.equal(DS.Inv.nextInfusion(inv, inv.equipped[0], -1), 'leaf');
});

test('a weapon keeps its own element on the ring and infusing it back clears', () => {
  const inv = DS.Inv.create('sword');
  DS.Inv.unlockEssence(inv, 'fire');
  const ice = weapon('ice', 2);
  const name = ice.name;
  assert.deepEqual([...DS.Inv.infusionRing(inv, ice)], ['fire', 'ice']);
  DS.Inv.setInfusion(ice, 'fire');
  assert.equal(ice.infusion, 'fire');
  assert.equal(ice.element, 'fire');
  assert.equal(ice.baseElement, 'ice');
  assert.equal(ice.name, name, 'the name follows the native element');
  DS.Inv.setInfusion(ice, 'ice');
  assert.equal(ice.infusion, null);
  assert.equal(ice.element, 'ice');
});

// --- the press: cooldown and mana --------------------------------------------

test('infusing costs mana and starts a 45-frame cooldown', () => {
  const p = freshPlayer();
  DS.Inv.unlockEssence(p.inv, 'fire');
  DS.Inv.unlockEssence(p.inv, 'ice');
  const g = quietGame();

  const first = DS.Inv.tryInfuse(g, p, 1);
  assert.equal(first.ok, true);
  assert.equal(first.element, 'fire');
  assert.equal(p.mana, 100 - DS.Inv.INFUSE_MANA);
  assert.equal(p.infuseCooldown, 45);
  assert.equal(DS.Inv.INFUSE_COOLDOWN, 45);

  const blocked = DS.Inv.tryInfuse(g, p, 1);
  assert.equal(blocked.reason, 'COOLDOWN');
  assert.equal(p.inv.equipped[0].element, 'fire');

  for (let i = 0; i < 45; i++) DS.Inv.updateInfusion(g, p);   // ticks the cooldown
  assert.equal(p.infuseCooldown, 0);
  assert.equal(DS.Inv.tryInfuse(g, p, 1).element, 'ice');
});

test('infusing without enough mana or essences is refused and free', () => {
  const g = quietGame();
  const none = freshPlayer();
  assert.equal(DS.Inv.tryInfuse(g, none, 1).reason, 'NO ESSENCES');
  assert.equal(none.mana, 100);

  const poor = freshPlayer();
  DS.Inv.unlockEssence(poor.inv, 'fire');
  poor.mana = DS.Inv.INFUSE_MANA - 1;
  assert.equal(DS.Inv.tryInfuse(g, poor, 1).reason, 'NO MANA');
  assert.equal(poor.mana, DS.Inv.INFUSE_MANA - 1);
  assert.equal(poor.inv.equipped[0].element, null);
});

test('the infuse / infuseBack actions drive the cycle', () => {
  const p = freshPlayer();
  ['fire', 'water', 'wind'].forEach((el) => DS.Inv.unlockEssence(p.inv, el));
  let pressed = 'infuseBack';
  DS.Input = { justPressed: (a) => a === pressed, consume: () => {} };
  try {
    assert.equal(DS.Inv.updateInfusion(quietGame(), p).element, 'wind');
    p.infuseCooldown = 0;
    pressed = 'infuse';
    assert.equal(DS.Inv.updateInfusion(quietGame(), p).element, 'fire');
  } finally {
    delete DS.Input;
  }
});

// --- element share -------------------------------------------------------------

test('activeElement prefers the infusion, then the element, then null', () => {
  const W = DS.Weapons;
  assert.equal(W.activeElement({ infusion: 'ice', element: 'fire' }), 'ice');
  assert.equal(W.activeElement({ infusion: null, element: 'fire' }), 'fire');
  assert.equal(W.activeElement({}), null);
  assert.equal(W.activeElement(null), null);
  assert.equal(EL.Elements.activeElement({ infusion: 'wind', element: 'earth' }), 'wind');
});

test('the starter gets a useful base share once infused; others use rarity', () => {
  const inv = DS.Inv.create('sword');
  const starter = inv.equipped[0];
  assert.equal(starter.stats.elementShare, 0);
  DS.Inv.setInfusion(starter, 'fire');
  assert.equal(starter.stats.elementShare, DS.Weapons.STARTER_SHARE);
  assert.ok(DS.Weapons.STARTER_SHARE > DS.Weapons.ELEMENT_SHARE[0]);

  const plain = weapon(null, 0);
  DS.Inv.setInfusion(plain, 'fire');
  assert.equal(plain.stats.elementShare, DS.Weapons.ELEMENT_SHARE[0]);

  const rare = weapon('ice', 2);
  DS.Inv.setInfusion(rare, 'poison');
  assert.equal(rare.stats.elementShare, DS.Weapons.ELEMENT_SHARE[2]);
});

// --- passives ------------------------------------------------------------------

function mob(x, extra) {
  return Object.assign({ x: x, y: 0, w: 10, h: 10, vx: 0, vy: 0, hp: 100, dead: false }, extra);
}

function arena(enemies) {
  return {
    enemies: enemies, fields: [], bolts: [], hits: [], frames: 0,
    player: { x: 0, y: 0, w: 8, h: 14, hp: 3, dead: false, stats: { maxHp: 6 } }
  };
}

const Elements = EL.Elements;

test('every element has a distinct passive and a skill variant', () => {
  const names = new Set();
  for (const k of EL.Weapons.ELEMENT_KEYS) {
    assert.ok(Elements.ELEMENT_PASSIVE[k], k + ' passive');
    assert.ok(Elements.ELEMENT_SKILL_VARIANT[k], k + ' skill variant');
    names.add(Elements.ELEMENT_PASSIVE[k].name);
  }
  assert.equal(names.size, 8);
});

test('fire: splashes damage and a burn onto a neighbour, not a distant foe', () => {
  const t = mob(50), near = mob(60), far = mob(200);
  const g = arena([t, near, far]);
  Elements.apply(g, t, 'fire', 10);
  assert.ok(t.status.burn > 0);
  assert.ok(g.hits.some((h) => h.e === near && h.opts.isChain));
  assert.ok(near.status.burn > 0);
  assert.ok(!far.status || !(far.status.burn > 0));
});

test('ice: shatters a foe that was already frozen, not one it just froze', () => {
  const frozen = mob(50, { status: { burn: 0, chill: 50, frozen: 50 } });
  const g = arena([frozen]);
  Elements.apply(g, frozen, 'ice', 10);
  assert.equal(frozen.status.frozen, 0);
  assert.ok(g.hits.some((h) => h.e === frozen && h.amount === 14));

  const fresh = mob(50);
  const g2 = arena([fresh]);
  for (let i = 0; i < 3; i++) Elements.apply(g2, fresh, 'ice', 10);   // third stack freezes
  assert.ok(fresh.status.frozen > 0);
  assert.equal(g2.hits.length, 0);
});

test('lightning: every third hit calls down a bolt', () => {
  const t = mob(50);
  const g = arena([t]);
  Elements.apply(g, t, 'lightning', 10);
  Elements.apply(g, t, 'lightning', 10);
  assert.equal(g.hits.length, 0);
  Elements.apply(g, t, 'lightning', 10);
  assert.equal(g.hits.length, 1);
  assert.ok(g.bolts.some((b) => b.x1 === b.x2));
  assert.ok(t.status.shock > 0);
});

test('poison: stacks damage and spreads when the host dies', () => {
  const t = mob(50), near = mob(70);
  const g = arena([t, near]);
  Elements.apply(g, t, 'poison', 10);
  Elements.apply(g, t, 'poison', 10);
  assert.equal(t.status.poisonStacks, 2);
  assert.equal(t.status.poisonDamage, 2);
  assert.equal(typeof t.onDeath, 'function');
  t.onDeath(g, t);
  assert.ok(near.status && near.status.poison > 0);
});

test('water: soaks and shoves the target away from the player', () => {
  const t = mob(50);
  const g = arena([t]);
  Elements.apply(g, t, 'water', 10);
  assert.ok(t.status.wet > 0);
  assert.ok(t.vx > 0);
});

test('earth: staggers (disabled) and cannot stun-lock', () => {
  const t = mob(50);
  const g = arena([t]);
  Elements.apply(g, t, 'earth', 10);
  assert.equal(t.status.stagger, 24);
  assert.ok(t.status.brittle > 0);
  assert.equal(Elements.disabled(t), true);
  t.status.stagger = 0;
  Elements.apply(g, t, 'earth', 10);
  assert.equal(t.status.stagger, 0, 'the lock stops an immediate re-stagger');
});

test('leaf: roots and heals the player over a few hits', () => {
  const t = mob(50);
  const g = arena([t]);
  for (let i = 0; i < 6; i++) Elements.apply(g, t, 'leaf', 10);
  assert.equal(g.player.hp, 4);
  assert.ok(t.status.root > 0);
});

test('wind: pulls a neighbour in and launches the target', () => {
  const t = mob(50), near = mob(90);
  const g = arena([t, near]);
  Elements.apply(g, t, 'wind', 10);
  assert.ok(near.vx < 0, 'pulled toward the target');
  assert.ok(t.vy <= -3.2, 'launched');
});

test('passives also fire on a hit that sets off a reaction', () => {
  const t = mob(50);
  const g = arena([t]);
  const fired = [];
  g.onElementPassive = (k) => fired.push(k);
  Elements.apply(g, t, 'water', 10);
  Elements.apply(g, t, 'earth', 10);   // reacts with the wet aura
  assert.deepEqual(fired, ['water', 'earth']);
});
