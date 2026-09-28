const test = require('node:test');
const assert = require('node:assert/strict');
const { loadItems } = require('./_load');

const DS = loadItems();

function armor(slot, rarity, material) {
  return DS.Armor.makeArmor(DS.makeRng(7 + rarity), 3, { slot: slot, rarity: rarity, material: material || 'leather' });
}

function freshInv() { return DS.Inv.create('sword'); }

test('armour fills an empty slot', () => {
  const inv = freshInv();
  const helm = armor('head', 0);
  const r = DS.Inv.addItem(inv, helm);
  assert.equal(r.ok, true);
  assert.equal(r.where, 'armor');
  assert.equal(inv.armor.head, helm);
});

test('higher-rarity armour replaces the worn piece and bags the old one', () => {
  const inv = freshInv();
  const old = armor('chest', 1);
  DS.Inv.addItem(inv, old);
  const better = armor('chest', 3);
  const r = DS.Inv.addItem(inv, better);
  assert.equal(r.ok, true);
  assert.equal(r.where, 'upgrade');
  assert.equal(r.replaced, old);
  assert.equal(r.overflow, null);
  assert.equal(inv.armor.chest, better);
  assert.ok(inv.bag.includes(old));
});

test('same or lower rarity armour goes to the bag', () => {
  const inv = freshInv();
  const worn = armor('legs', 2);
  DS.Inv.addItem(inv, worn);
  const same = armor('legs', 2);
  const worse = armor('legs', 1);
  assert.equal(DS.Inv.addItem(inv, same).where, 'bag');
  assert.equal(DS.Inv.addItem(inv, worse).where, 'bag');
  assert.equal(inv.armor.legs, worn);
});

test('upgrade with a full bag still equips and hands back the old piece to drop', () => {
  const inv = freshInv();
  const old = armor('head', 0);
  DS.Inv.addItem(inv, old);
  while (!DS.Inv.bagFull(inv)) inv.bag.push(armor('legs', 0));
  const better = armor('head', 4);
  const r = DS.Inv.addItem(inv, better);
  assert.equal(r.ok, true);
  assert.equal(r.where, 'upgrade');
  assert.equal(r.overflow, old);
  assert.equal(inv.armor.head, better);
  assert.ok(!inv.bag.includes(old));
});
