/* The look catalog and the profile (src/items/look.js): every slot can be filled
   for free, every price follows the ladder, limited pieces are never for sale,
   the wallet only spends what it holds, and what is saved comes back clean. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

function stubs(store, broken) {
  return 'window.__store = ' + JSON.stringify(store || {}) + ';' +
    'window.localStorage = { getItem: function (k) { if (window.__broken) throw new Error("blocked"); return k in window.__store ? window.__store[k] : null; },' +
    '  setItem: function (k, v) { if (window.__broken) throw new Error("blocked"); window.__store[k] = String(v); },' +
    '  removeItem: function (k) { delete window.__store[k]; } };' +
    'window.__broken = ' + (broken ? 'true' : 'false') + '; window.DS.__store = window.__store;';
}
const fresh = (store, broken) => load(['src/core/rng.js', 'src/items/look.js'], stubs(store, broken));

test('every slot can be filled for free: a starter in each, and the default look is complete', () => {
  const L = fresh().Look;
  for (const slot of L.ITEM_SLOTS) assert.ok(L.starters(slot).length >= 1, slot + ' has a starter');
  for (const w of L.WEAPON_TYPES) {
    assert.ok(L.itemsIn('weapon', w).some((i) => i.starter), w + ' has a starter skin');
  }
  const look = L.DEFAULT_LOOK;
  for (const slot of L.ITEM_SLOTS) assert.ok(L.itemOf(slot, look[slot]) && L.itemOf(slot, look[slot]).starter, 'default ' + slot);
  for (const key of ['skin', 'eyeColor', 'hairColor']) assert.ok(L.traitIds(key).includes(look[key]), key);
  for (const key of ['build', 'height', 'eyes', 'brows', 'mouth']) assert.ok(L.TRAITS[key].includes(look[key]), key);
});

test('the catalog is sound: unique keys, known rarities, a price for what is sold, a reason for what is won', () => {
  const L = fresh().Look;
  const seen = new Set();
  for (const it of L.CATALOG) {
    assert.ok(!seen.has(it.key), 'duplicate ' + it.key);
    seen.add(it.key);
    assert.ok(L.RARITIES.includes(it.rarity), it.key + ' rarity');
    assert.ok(it.name && it.family, it.key + ' name and family');
    if (it.starter) assert.equal(it.price, 0, it.key + ' is free');
    else if (it.rarity === 'limited') {
      assert.equal(it.price, null, it.key + ' is not for sale');
      assert.ok(it.earn && it.earn.n >= 1 && it.earn.text, it.key + ' says how it is won');
    } else assert.ok(it.price >= 5, it.key + ' has a price');
  }
  assert.ok(L.CATALOG.length >= 120, 'a wardrobe: ' + L.CATALOG.length);
});

test('prices follow the ladder: 30 / 90 / 240 / 600 / 1500 keys for a top, scaled by slot, in fives', () => {
  const L = fresh().Look;
  assert.deepEqual(['common', 'rare', 'epic', 'legendary', 'mythic'].map((r) => L.priceOf(r, 'top')), [30, 90, 240, 600, 1500]);
  assert.equal(L.priceOf('common', 'hair'), 20, '18 rounds up to a five');
  assert.equal(L.priceOf('common', 'hat'), 25);
  assert.equal(L.priceOf('rare', 'weapon'), 135);
  assert.equal(L.priceOf('limited', 'top'), null);
  for (const it of L.CATALOG) if (it.price) assert.equal(it.price % 5, 0, it.key);
  // Dearer as it gets rarer, in every slot that has a run of rarities.
  for (const slot of L.ITEM_SLOTS) {
    const priced = L.itemsIn(slot).filter((i) => i.price > 0 && i.rarity !== 'limited');
    for (let a = 0; a < priced.length; a++) for (let b = 0; b < priced.length; b++) {
      if (L.RARITIES.indexOf(priced[a].rarity) < L.RARITIES.indexOf(priced[b].rarity)) {
        assert.ok(priced[a].price <= priced[b].price, priced[a].key + ' vs ' + priced[b].key);
      }
    }
  }
});

test('the economy is what the plan says: a ten-floor run of ten keys buys a common piece in three', () => {
  const L = fresh().Look;
  const keysPerRun = 10;
  assert.equal(L.BASE_PRICE.common / keysPerRun, 3);
  assert.equal(L.BASE_PRICE.mythic / keysPerRun, 150);
  assert.ok(L.BASE_PRICE.rare >= L.BASE_PRICE.common * 3 - 1, 'each rung is about three times the one below');
});

test('a look is cleaned against what is owned', () => {
  const L = fresh().Look;
  const dirty = { skin: 'nope', hair: 'flame', hat: 'crown', top: 'aegis', build: 'giant', weapon: { sword: 'sword.solar', bow: 'sword.frost' } };
  const out = L.clean(dirty, {});
  assert.equal(out.skin, L.DEFAULT_LOOK.skin, 'an unknown trait falls back');
  assert.equal(out.build, 'regular');
  assert.equal(out.hair, 'short', 'an unowned hair style falls back to a starter');
  assert.equal(out.hat, 'none');
  assert.equal(out.top, 'tunic');
  assert.deepEqual(out.weapon, {}, 'no unowned weapon skin, and none on the wrong weapon');
  const owned = L.clean(dirty, { 'hair:flame': 1, 'weapon:sword.solar': 1 });
  assert.equal(owned.hair, 'flame');
  assert.equal(owned.weapon.sword, 'sword.solar');
  assert.equal(L.clean(null, {}).skin, 'fair');
});

test('buying spends keys, needs enough of them, and never sells a limited piece', () => {
  const L = fresh().Look;
  const jerkin = L.itemOf('top', 'jerkin');
  assert.equal(L.buy(jerkin).ok, false, 'an empty wallet buys nothing');
  assert.equal(L.buy(jerkin).reason, 'keys');
  L.bank(100);
  assert.equal(L.profile.wallet.keys, 100);
  const bought = L.buy(jerkin);
  assert.equal(bought.ok, true);
  assert.equal(L.profile.wallet.keys, 70);
  assert.equal(L.profile.wallet.spent, 30);
  assert.equal(L.owns(jerkin), true);
  assert.equal(L.buy(jerkin).reason, 'owned', 'not twice');
  L.bank(100000);
  assert.equal(L.buy(L.itemOf('hat', 'warden_helm')).reason, 'limited', 'no key buys a limited piece');
  assert.equal(L.buy(null).ok, false);
});

test('equipping needs ownership; traits and dyes always work; a weapon skin only fits its weapon', () => {
  const L = fresh().Look;
  assert.equal(L.equip('top', 'plate'), false, 'not owned');
  assert.equal(L.profile.look.top, 'tunic');
  L.bank(500);
  L.buy(L.itemOf('top', 'plate'));
  assert.equal(L.equip('top', 'plate'), true);
  assert.equal(L.profile.look.top, 'plate');
  assert.equal(L.equip('skin', 'ebony'), true);
  assert.equal(L.equip('skin', 'purple'), false);
  assert.equal(L.equip('topDye', 'crimson'), true);
  assert.equal(L.equip('topDye', 'ultraviolet'), false);
  L.buy(L.itemOf('weapon', 'sword.frost'));
  assert.equal(L.equip('weapon', 'sword.frost', 'bow'), false, 'a sword skin is not a bow skin');
  assert.equal(L.equip('weapon', 'sword.frost', 'sword'), true);
  assert.equal(L.profile.look.weapon.sword, 'sword.frost');
  assert.equal(L.equip('nonsense', 'x'), false);
});

test('the profile is written down and read back, and bad data is refused', () => {
  let L = fresh().Look;
  L.bank(50);
  L.buy(L.itemOf('hair', 'sidepart'));
  L.equip('hair', 'sidepart');
  L.equip('skin', 'umber');
  L.markCreated();
  const saved = JSON.parse(JSON.stringify(L.profile));
  const store = { [L.KEY]: JSON.stringify(saved) };
  L = fresh(store).Look;
  assert.equal(L.profile.wallet.keys, 30);
  assert.equal(L.profile.look.hair, 'sidepart');
  assert.equal(L.profile.look.skin, 'umber');
  assert.equal(L.created, true);
  assert.equal(L.owns(L.itemOf('hair', 'sidepart')), true);

  // Hand-edited: an unowned item on the body, an unknown item owned, a negative wallet.
  const evil = { v: 1, created: true, look: { top: 'aegis', hat: 'crown' }, owned: { 'top:notreal': 1, 'top:jerkin': 1 },
                 wallet: { keys: -5, earned: 'x', spent: 1e9 }, counters: { 'boss.warden': 3, '<x>': 9 } };
  L = fresh({ [L.KEY]: JSON.stringify(evil) }).Look;
  assert.equal(L.profile.look.top, 'tunic', 'aegis is not owned');
  assert.equal(L.profile.look.hat, 'none');
  assert.equal(L.owns(L.itemOf('top', 'jerkin')), true, 'a real owned item is kept');
  assert.equal(L.profile.wallet.keys, 0);
  assert.equal(L.profile.counters['boss.warden'], 3);
  assert.equal(L.profile.counters['<x>'], undefined);
  assert.equal(fresh({ [L.KEY]: '{not json' }).Look.created, false);
  assert.equal(fresh({ [L.KEY]: JSON.stringify({ v: 99 }) }).Look.created, false, 'another version starts clean');
});

test('storage that refuses does not break it: the session still works', () => {
  const L = fresh({}, true).Look;
  assert.doesNotThrow(() => { L.bank(40); L.buy(L.itemOf('hat', 'hood')); L.equip('hat', 'hood'); });
  assert.equal(L.profile.look.hat, 'hood');
});

test('a run ends: keys banked, counters kept, and ten wins over a boss earn its set', () => {
  const L = fresh().Look;
  let out = L.finishRun({ keys: 7, depth: 12, bosses: ['warden'], actsCleared: 0 });
  assert.equal(out.banked, 7);
  assert.equal(L.profile.wallet.keys, 7);
  assert.equal(L.profile.counters.runs, 1);
  assert.equal(L.profile.counters.depth, 12);
  assert.equal(out.won.length, 0);
  for (let i = 0; i < 8; i++) L.finishRun({ keys: 0, depth: 5, bosses: ['warden'] });
  assert.equal(L.owns(L.itemOf('hat', 'warden_helm')), false, 'nine wins is not ten');
  out = L.finishRun({ keys: 0, depth: 5, bosses: ['warden'] });
  assert.equal(out.won.length, 3, 'the hat, the armour and the mantle');
  assert.ok(out.won.every((i) => i.set === 'limited.warden'));
  assert.equal(L.owns(L.itemOf('top', 'warden_plate')), true);
  assert.equal(L.equip('top', 'warden_plate'), true, 'and it can be worn');
  assert.equal(L.checkEarned().length, 0, 'granted once');
  // Depth and act rewards.
  out = L.finishRun({ keys: 0, depth: 40, bosses: [], actsCleared: 1 });
  assert.deepEqual(Array.from(out.won.map((i) => i.id).sort()), ['portalwalker', 'wanderer']);
});

test('keys left over are banked whole; a negative or fractional count cannot cheat', () => {
  const L = fresh().Look;
  assert.equal(L.bank(-3), 0);
  assert.equal(L.bank(2.9), 2);
  assert.equal(L.bank('x'), 0);
  assert.equal(L.profile.wallet.keys, 2);
});

test('a random look only wears what is owned', () => {
  const L = fresh().Look;
  let n = 0;
  const rng = () => { n = (n * 9301 + 49297) % 233280; return n / 233280; };
  for (let i = 0; i < 50; i++) {
    const look = L.randomLook(rng);
    for (const slot of L.ITEM_SLOTS) assert.ok(L.owns(L.itemOf(slot, look[slot])), slot + ':' + look[slot]);
    assert.deepEqual(L.clean(look, L.profile.owned), look, 'and it is already clean');
  }
});

test('a set of pieces costs a fifth less bought together', () => {
  const L = fresh().Look;
  // No purchasable sets yet: the price of an unknown or all-owned set is nothing.
  assert.equal(L.setPrice('nothing'), 0);
  assert.equal(L.SET_DISCOUNT, 0.8);
});
