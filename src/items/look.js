/* Who you look like: the catalog of everything a character can wear, what it
   costs, and the profile that remembers what you own and what you have on.

   A `look` is a small JSON object of ids. Two renderers read the SAME look --
   the voxel hero in the world (look3d.js) and the pixel doll in the pause and
   bag screens (look2d.js) -- so the person in the corner of the inventory is the
   person on the field. Nothing here touches the rules of the game: a look is
   cosmetic, and a worn skin beats the armour in the bag for how the hero LOOKS
   (the armour still counts for what it does).

   Two kinds of choice:
     traits   free and unlimited: skin tone, build, height, the face (eyes, brows,
              mouth), eye and hair colour, and the dye on clothes
     items    the catalog below: hair styles, beards, marks, hats, tops, legs,
              boots, gloves, capes, extras and weapon skins. Every slot has a
              starter set that costs nothing, so a character can be made
              complete without spending a key.

   Rarity is common, rare, epic, legendary, mythic or limited. The first five are
   bought with KEYS carried out of runs (the wallet); LIMITED is never sold: it
   is earned (ten wins over a boss, clearing an act, reaching a depth). */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const KEY = 'ds_profile';
  const VERSION = 1;

  // --- rarity and the price of it ----------------------------------------------------

  const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic', 'limited'];
  const RARITY_COLOR = { common: '#c9cfdf', rare: '#4fb3ff', epic: '#c86ee0', legendary: '#ffb347', mythic: '#ff5a86', limited: '#5ff0c8' };

  /* Keys. A ten-floor stretch of the dungeon yields about ten keys once the
     locked chests have taken theirs (see docs/PLAN-v7b.md for the sums), so a
     common piece is about three such runs and a mythic one about a hundred and
     fifty. Deliberately dear. */
  const BASE_PRICE = { common: 30, rare: 90, epic: 240, legendary: 600, mythic: 1500 };
  const SLOT_WEIGHT = { hair: 0.6, facial: 0.6, mark: 0.6, hat: 0.8, top: 1, pants: 1, boots: 0.7, gloves: 0.7,
                        cape: 1, extra: 0.8, weapon: 1.5 };
  const SET_DISCOUNT = 0.8;               // a whole set bought at once

  function priceOf(rarity, slot) {
    if (!BASE_PRICE[rarity]) return null;          // limited: not for sale
    return Math.max(5, Math.round(BASE_PRICE[rarity] * (SLOT_WEIGHT[slot] || 1) / 5) * 5);
  }

  // --- traits (free) --------------------------------------------------------------------

  const TRAITS = {
    skin: [['pale', '#f6e0d0'], ['fair', '#ffd9b0'], ['light', '#f0c08e'], ['tan', '#d9a06e'], ['olive', '#c0905a'],
           ['bronze', '#a8703f'], ['brown', '#8a5a34'], ['umber', '#6b4226'], ['dark', '#4e2f1c'], ['ebony', '#3a2114']],
    eyeColor: [['brown', '#4a2f1c'], ['hazel', '#7a5a2a'], ['green', '#3f8a52'], ['blue', '#3f7fd0'], ['grey', '#7a8594'],
               ['violet', '#8a5ad0'], ['amber', '#d09a2a'], ['red', '#c0303c'], ['teal', '#2a9a9a'], ['black', '#1a1626']],
    hairColor: [['black', '#1c1a24'], ['darkbrown', '#33241a'], ['brown', '#4a3728'], ['chestnut', '#7a4a2a'], ['auburn', '#8a3a24'],
                ['ginger', '#c8642a'], ['blonde', '#d8b45a'], ['platinum', '#eee4c8'], ['grey', '#8a8c96'], ['white', '#f2f2f8'],
                ['blue', '#3f6fd0'], ['teal', '#2aa8a0'], ['pink', '#e070a8'], ['violet', '#8a5ad0']],
    dye: [['white', '#f0f0f6'], ['grey', '#9a9caa'], ['charcoal', '#4a4c58'], ['black', '#22202c'], ['brown', '#6a4a30'],
          ['tan', '#c8a878'], ['red', '#c0303c'], ['crimson', '#8a1f30'], ['orange', '#e8743b'], ['yellow', '#e8c84a'],
          ['green', '#5cbf62'], ['forest', '#2f7d4f'], ['teal', '#2a9a9a'], ['blue', '#3e6fc0'], ['navy', '#24365a'], ['purple', '#7a4ab0']],
    build: ['slim', 'regular', 'broad'],
    height: ['short', 'mid', 'tall'],
    eyes: ['round', 'narrow', 'sleepy', 'wide', 'sharp', 'happy'],
    brows: ['plain', 'thick', 'thin', 'angled', 'none'],
    mouth: ['smile', 'neutral', 'grin', 'smirk', 'frown']
  };

  const traitIds = function (name) { return TRAITS[name].map(function (t) { return Array.isArray(t) ? t[0] : t; }); };
  function traitColor(name, id) {
    const row = TRAITS[name].find(function (t) { return t[0] === id; });
    return row ? row[1] : TRAITS[name][0][1];
  }

  // --- the catalog -----------------------------------------------------------------------

  const CATALOG = [];
  const BY_ID = {};

  /* add(slot, id, name, rarity, ...opts): each opts { family, pal, dyed, starter, set, earn, w }
       family  which shape builder draws it (look3d.js / look2d.js)
       pal     a fixed palette for a premium piece; `dyed` pieces take the player's dye
       starter costs nothing and is owned from the start
       set     the theme a piece belongs to (buying the set is cheaper)
       earn    { counter, n, text }: how a LIMITED piece is won
       w       for weapon skins, the weapon type */
  function add(slot, id, name, rarity) {
    const item = Object.assign({ slot: slot, id: id, name: name, rarity: rarity, family: id, starter: false,
                                 dyed: false, pal: null, set: null, earn: null, w: null },
                               ...Array.prototype.slice.call(arguments, 4));
    item.key = slot + ':' + id;
    item.price = item.starter ? 0 : priceOf(rarity, slot);
    if (BY_ID[item.key]) throw new Error('duplicate catalog item ' + item.key);
    CATALOG.push(item);
    BY_ID[item.key] = item;
    return item;
  }
  const S = { starter: true };

  // hair
  add('hair', 'bald', 'Bald', 'common', S); add('hair', 'buzz', 'Buzz Cut', 'common', S);
  add('hair', 'short', 'Short Crop', 'common', S); add('hair', 'long', 'Long', 'common', S);
  add('hair', 'sidepart', 'Side Part', 'common'); add('hair', 'ponytail', 'Ponytail', 'common');
  add('hair', 'bun', 'Top Bun', 'common'); add('hair', 'curly', 'Curls', 'common'); add('hair', 'braid', 'Braid', 'common');
  add('hair', 'mohawk', 'Mohawk', 'rare'); add('hair', 'undercut', 'Undercut', 'rare'); add('hair', 'afro', 'Afro', 'rare');
  add('hair', 'twintails', 'Twin Tails', 'rare'); add('hair', 'wolf', 'Wolf Cut', 'rare');
  add('hair', 'topknot', 'Topknot', 'epic'); add('hair', 'crownbraids', 'Crown Braids', 'epic');
  add('hair', 'flame', 'Flame Hair', 'legendary', { pal: ['#ff6a2a', '#ffb347'], glow: true });
  add('hair', 'spirit', 'Spirit Mane', 'mythic', { pal: ['#7ff0ff', '#d8fbff'], glow: true });

  // beards and marks
  add('facial', 'none', 'Clean Shaven', 'common', S); add('facial', 'stubble', 'Stubble', 'common', S);
  add('facial', 'mustache', 'Mustache', 'common'); add('facial', 'goatee', 'Goatee', 'common');
  add('facial', 'fullbeard', 'Full Beard', 'rare'); add('facial', 'longbeard', 'Long Beard', 'epic');
  add('mark', 'none', 'No Marks', 'common', S); add('mark', 'freckles', 'Freckles', 'common');
  add('mark', 'scar', 'Scar', 'common'); add('mark', 'warpaint', 'War Paint', 'rare', { pal: ['#c0303c'] });
  add('mark', 'tattoo', 'Tattoo', 'rare', { pal: ['#3e6fc0'] }); add('mark', 'glowrune', 'Glow Rune', 'epic', { pal: ['#4ee2ec'], glow: true });

  // hats
  add('hat', 'none', 'Bare Head', 'common', S); add('hat', 'cap', 'Cap', 'common', S, { dyed: true });
  add('hat', 'hood', 'Hood', 'common', { dyed: true }); add('hat', 'bandana', 'Bandana', 'common', { dyed: true });
  add('hat', 'leathercap', 'Leather Cap', 'common', { pal: ['#7a5230', '#4e3320'] });
  add('hat', 'straw', 'Straw Hat', 'common', { pal: ['#e0c070', '#b89a48'] });
  add('hat', 'ironhelm', 'Iron Helm', 'rare', { pal: ['#a8b0c0', '#5c6474'] });
  add('hat', 'horned', 'Horned Helm', 'rare', { family: 'ironhelm', horns: true, pal: ['#8a929e', '#4a5060'] });
  add('hat', 'wizard', 'Wizard Hat', 'rare', { dyed: true });
  add('hat', 'knighthelm', 'Knight Helm', 'epic', { family: 'ironhelm', plume: true, pal: ['#d8dce8', '#8a90a4'] });
  add('hat', 'laurel', 'Laurel Wreath', 'epic', { pal: ['#5cbf62', '#e8c84a'] });
  add('hat', 'crown', 'Gold Crown', 'legendary', { pal: ['#f2c14e', '#b8860b'] });
  add('hat', 'halo', 'Halo', 'mythic', { pal: ['#fff0a8'], glow: true });

  // tops
  add('top', 'tunic', 'Tunic', 'common', S, { dyed: true }); add('top', 'shirt', 'Shirt', 'common', S, { dyed: true });
  add('top', 'vest', 'Vest', 'common', S, { dyed: true }); add('top', 'hoodie', 'Hoodie', 'common', { dyed: true });
  add('top', 'robe', 'Robe', 'common', { dyed: true }); add('top', 'jerkin', 'Leather Jerkin', 'common', { pal: ['#7a5230', '#4e3320'] });
  add('top', 'chain', 'Chainmail', 'rare', { family: 'armor', pal: ['#a8b0c0', '#6a7284'] });
  add('top', 'plate', 'Plate Cuirass', 'rare', { family: 'armor', pauldrons: true, pal: ['#c8ccd8', '#7a8094'] });
  add('top', 'toga', 'Olympian Toga', 'epic', { pal: ['#f4efe0', '#e8c84a'] });
  add('top', 'bronze', 'Bronze Cuirass', 'legendary', { family: 'armor', pauldrons: true, pal: ['#c98a3a', '#8a5a1e'] });
  add('top', 'aegis', 'Aegis of Dawn', 'mythic', { family: 'armor', pauldrons: true, glow: true, pal: ['#fff0a8', '#e8a83a'] });

  // legs
  add('pants', 'trousers', 'Trousers', 'common', S, { dyed: true }); add('pants', 'shorts', 'Shorts', 'common', S, { dyed: true });
  add('pants', 'kilt', 'Kilt', 'common', { dyed: true }); add('pants', 'skirt', 'Long Skirt', 'common', { dyed: true });
  add('pants', 'leather', 'Leather Pants', 'common', { family: 'trousers', pal: ['#7a5230', '#4e3320'] });
  add('pants', 'greaves', 'Greaves', 'rare', { pal: ['#a8b0c0', '#5c6474'] });
  add('pants', 'platelegs', 'Plate Legs', 'epic', { family: 'greaves', pal: ['#d8dce8', '#8a90a4'] });

  // boots
  add('boots', 'boots', 'Boots', 'common', S, { dyed: true }); add('boots', 'sandals', 'Sandals', 'common', S, { pal: ['#c8a878', '#7a5230'] });
  add('boots', 'shoes', 'Shoes', 'common', { dyed: true }); add('boots', 'ironboots', 'Iron Boots', 'rare', { pal: ['#a8b0c0', '#5c6474'] });
  add('boots', 'winged', 'Winged Sandals', 'epic', { pal: ['#f4efe0', '#e8c84a'] });

  // gloves
  add('gloves', 'none', 'Bare Hands', 'common', S); add('gloves', 'fingerless', 'Fingerless', 'common', { dyed: true });
  add('gloves', 'gloves', 'Gloves', 'common', { dyed: true }); add('gloves', 'gauntlets', 'Gauntlets', 'rare', { pal: ['#a8b0c0', '#5c6474'] });

  // capes
  add('cape', 'none', 'No Cape', 'common', S); add('cape', 'short', 'Short Cape', 'common', { dyed: true });
  add('cape', 'long', 'Long Cape', 'common', { dyed: true }); add('cape', 'tattered', 'Tattered Cloak', 'rare', { pal: ['#4a4658', '#2c2a38'] });
  add('cape', 'royal', 'Royal Mantle', 'epic', { pal: ['#8a1f30', '#f2c14e'] });
  add('cape', 'wings', 'Feathered Wings', 'legendary', { pal: ['#f4f2f8', '#c8ccd8'] });
  add('cape', 'flamecape', 'Flame Cloak', 'mythic', { pal: ['#ff6a2a', '#ffd27a'], glow: true });

  // extras
  add('extra', 'none', 'Nothing Extra', 'common', S); add('extra', 'scarf', 'Scarf', 'common', { dyed: true });
  add('extra', 'eyepatch', 'Eye Patch', 'common'); add('extra', 'glasses', 'Glasses', 'common');
  add('extra', 'mask', 'Half Mask', 'rare', { pal: ['#e8e4dc', '#22202c'] });
  add('extra', 'necklace', 'Amulet', 'rare', { pal: ['#f2c14e', '#4ee2ec'] });
  add('extra', 'pauldrons', 'Spiked Pauldrons', 'epic', { pal: ['#5c6474', '#a8b0c0'] });
  add('extra', 'aura', 'Ring of Light', 'mythic', { pal: ['#9ff4ff'], glow: true });

  // weapon skins: one ladder per weapon
  const WEAPON_TYPES = ['sword', 'dagger', 'greataxe', 'spear', 'bow', 'staff'];
  const WEAPON_SKINS = [
    ['base', 'Plain Steel', 'common', null],
    ['ember', 'Ember', 'common', { metal: '#c8642a', dark: '#6a2a10', trim: '#f2c14e', glow: '#ff9a3c' }],
    ['frost', 'Frostbite', 'rare', { metal: '#a8e4ff', dark: '#3f6fa8', trim: '#e8f4ff', glow: '#7fe8ff' }],
    ['gilded', 'Gilded', 'epic', { metal: '#f2c14e', dark: '#b8860b', trim: '#fff0a8', glow: '#ffe066' }],
    ['void', 'Void', 'legendary', { metal: '#4a2a7a', dark: '#1c1030', trim: '#c86ee0', glow: '#c86ee0' }],
    ['solar', 'Solar', 'mythic', { metal: '#fff0a8', dark: '#e8a83a', trim: '#ffffff', glow: '#ffd27a' }]
  ];
  WEAPON_TYPES.forEach(function (w) {
    WEAPON_SKINS.forEach(function (s, i) {
      add('weapon', w + '.' + s[0], s[1] + ' ' + w.replace('greataxe', 'great axe'), s[2],
          { starter: i === 0, w: w, family: w, pal: s[3], glow: !!(s[3] && i >= 2) });
    });
  });

  /* Limited sets: won, never bought. Each is a hat, a top and a cape in the same
     fixed palette, for ten wins over one boss. */
  const BOSS_SETS = [
    ['warden', 'Warden\'s Oath', 'Stone Warden', ['#8d86a0', '#55506a', '#f2c14e']],
    ['king', 'Slime Regalia', 'Slime King', ['#7fd45e', '#4a9b3a', '#f2c14e']],
    ['arbiter', 'Arbiter\'s Verdict', 'the Arbiter', ['#c8bce0', '#5b3a8c', '#f2c14e']],
    ['wyrm', 'Wyrm-Frost Mantle', 'the Frost Wyrm', ['#a8e4ff', '#2f6fa8', '#e8f4ff']],
    ['hades', 'Hades\' Shroud', 'Hades', ['#5a4a88', '#1c1826', '#7ff0ff']],
    ['zeus', 'Zeus\' Thunderhide', 'Zeus', ['#e8ecff', '#6a728c', '#ffe066']],
    ['minotaur', 'Minotaur\'s Hide', 'the Minotaur', ['#8a5a34', '#4a2f1c', '#c8b48a']],
    ['medusa', 'Gorgon\'s Scales', 'Medusa', ['#5cbf62', '#2f7d4f', '#e8e4a0']],
    ['talos', 'Talos Plating', 'Talos', ['#c98a3a', '#8a5a1e', '#ffb060']]
  ];
  BOSS_SETS.forEach(function (b) {
    const earn = { counter: 'boss.' + b[0], n: 10, text: 'Defeat ' + b[2] + ' ten times' };
    const opts = function (extra) { return Object.assign({ set: 'limited.' + b[0], earn: earn, pal: b[3], family: null }, extra); };
    add('hat', b[0] + '_helm', b[1] + ' Helm', 'limited', opts({ family: 'ironhelm', plume: true }));
    add('top', b[0] + '_plate', b[1] + ' Armour', 'limited', opts({ family: 'armor', pauldrons: true }));
    add('cape', b[0] + '_mantle', b[1] + ' Mantle', 'limited', opts({ family: 'royal' }));
  });
  add('cape', 'portalwalker', 'Portal Walker\'s Cloak', 'limited',
      { family: 'long', pal: ['#3a2aa8', '#4ee2ec'], glow: true, earn: { counter: 'act.1', n: 1, text: 'Clear Act I' } });
  add('extra', 'wanderer', 'Endless Wanderer\'s Lantern', 'limited',
      { family: 'aura', pal: ['#ffd27a'], glow: true, earn: { counter: 'depth', n: 40, text: 'Reach depth 40' } });

  // --- the look ----------------------------------------------------------------------------

  const DEFAULT_LOOK = {
    skin: 'fair', build: 'regular', height: 'mid', eyes: 'round', eyeColor: 'brown', brows: 'plain', mouth: 'smile',
    facial: 'none', mark: 'none', hair: 'short', hairColor: 'brown', hat: 'none', top: 'tunic', topDye: 'blue',
    pants: 'trousers', pantsDye: 'brown', boots: 'boots', bootsDye: 'charcoal', cape: 'none', capeDye: 'crimson',
    gloves: 'none', glovesDye: 'brown', extra: 'none', hatDye: 'red', extraDye: 'red',
    weapon: {}
  };

  const ITEM_SLOTS = ['hair', 'facial', 'mark', 'hat', 'top', 'pants', 'boots', 'gloves', 'cape', 'extra'];
  const DYE_OF = { hat: 'hatDye', top: 'topDye', pants: 'pantsDye', boots: 'bootsDye', gloves: 'glovesDye', cape: 'capeDye', extra: 'extraDye' };

  const TRAIT_KEYS = ['skin', 'eyeColor', 'hairColor', 'build', 'height', 'eyes', 'brows', 'mouth'];
  const DYE_KEYS = Object.keys(DYE_OF).map(function (k) { return DYE_OF[k]; });

  function itemOf(slot, id) { return BY_ID[slot + ':' + id] || null; }
  function starters(slot) { return CATALOG.filter(function (i) { return i.slot === slot && i.starter; }); }

  /* A look cleaned against what is owned: every trait a real id, every item one
     the profile owns (or a starter), or else the default for its slot. Hand-edited
     or stale data can therefore never show something unbought. */
  function clean(look, owned) {
    const out = JSON.parse(JSON.stringify(DEFAULT_LOOK));
    look = look && typeof look === 'object' ? look : {};
    ['skin', 'eyeColor', 'hairColor'].forEach(function (k) { if (traitIds(k).indexOf(look[k]) >= 0) out[k] = look[k]; });
    ['build', 'height', 'eyes', 'brows', 'mouth'].forEach(function (k) { if (TRAITS[k].indexOf(look[k]) >= 0) out[k] = look[k]; });
    const dyes = traitIds('dye');
    Object.keys(DYE_OF).forEach(function (s) { const d = DYE_OF[s]; if (dyes.indexOf(look[d]) >= 0) out[d] = look[d]; });
    const has = function (it) { return it && (it.starter || (owned && owned[it.key])); };
    ITEM_SLOTS.forEach(function (slot) {
      const it = itemOf(slot, look[slot]);
      if (has(it)) out[slot] = it.id;
      else if (!itemOf(slot, out[slot]) || !has(itemOf(slot, out[slot]))) out[slot] = starters(slot)[0].id;
    });
    if (look.weapon && typeof look.weapon === 'object') {
      WEAPON_TYPES.forEach(function (w) {
        const it = itemOf('weapon', look.weapon[w]);
        if (it && it.w === w && has(it)) out.weapon[w] = it.id;
      });
    }
    return out;
  }

  // --- the profile: look, ownership, wallet, counters ----------------------------------------------

  let profile = null;
  const listeners = [];

  function fresh() {
    return { v: VERSION, created: false, look: JSON.parse(JSON.stringify(DEFAULT_LOOK)), owned: {},
             wallet: { keys: 0, earned: 0, spent: 0 }, counters: { runs: 0, depth: 0 }, seen: {} };
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return fresh();
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object' || p.v !== VERSION) return fresh();
      const out = fresh();
      out.created = !!p.created;
      if (p.owned && typeof p.owned === 'object') Object.keys(p.owned).forEach(function (k) { if (BY_ID[k]) out.owned[k] = 1; });
      const w = p.wallet || {};
      const n = function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : 0; };
      out.wallet = { keys: n(w.keys), earned: n(w.earned), spent: n(w.spent) };
      if (p.counters && typeof p.counters === 'object') {
        Object.keys(p.counters).forEach(function (k) { if (/^[a-z0-9.]{1,32}$/.test(k)) out.counters[k] = n(p.counters[k]); });
      }
      if (p.seen && typeof p.seen === 'object') Object.keys(p.seen).forEach(function (k) { if (BY_ID[k]) out.seen[k] = 1; });
      out.look = clean(p.look, out.owned);
      return out;
    } catch (err) {
      return fresh();
    }
  }

  function get() { if (!profile) profile = read(); return profile; }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(get())); return true; } catch (err) { return false; }
  }
  function changed(what) {
    for (let i = 0; i < listeners.length; i++) { try { listeners[i](what, get()); } catch (err) { /* a listener must not break a change */ } }
  }

  const owns = function (item) { return !!(item && (item.starter || get().owned[item.key])); };

  /* Put a trait or an owned item on. Returns false for anything not yours. */
  function equip(slot, value, weaponType) {
    const p = get();
    if (slot === 'weapon') {
      const it = itemOf('weapon', value);
      if (!it || it.w !== weaponType || !owns(it)) return false;
      p.look.weapon[weaponType] = it.id;
    } else if (ITEM_SLOTS.indexOf(slot) >= 0) {
      const it = itemOf(slot, value);
      if (!it || !owns(it)) return false;
      p.look[slot] = it.id;
    } else if (TRAIT_KEYS.indexOf(slot) >= 0) {
      if (traitIds(slot).indexOf(value) < 0) return false;
      p.look[slot] = value;
    } else if (DYE_KEYS.indexOf(slot) >= 0) {
      if (traitIds('dye').indexOf(value) < 0) return false;
      p.look[slot] = value;
    } else return false;
    save();
    changed('look');
    return true;
  }

  /* Buy with keys. { ok, reason }. Limited pieces refuse, whatever the wallet holds. */
  function buy(item) {
    const p = get();
    if (!item || owns(item)) return { ok: false, reason: 'owned' };
    if (item.rarity === 'limited') return { ok: false, reason: 'limited' };
    if (p.wallet.keys < item.price) return { ok: false, reason: 'keys', need: item.price - p.wallet.keys };
    p.wallet.keys -= item.price;
    p.wallet.spent += item.price;
    p.owned[item.key] = 1;
    save();
    changed('buy');
    return { ok: true };
  }

  function setPrice(setId) {
    const pieces = CATALOG.filter(function (i) { return i.set === setId && !owns(i); });
    return pieces.length ? Math.max(5, Math.round(pieces.reduce(function (s, i) { return s + (i.price || 0); }, 0) * SET_DISCOUNT / 5) * 5) : 0;
  }

  /* Keys carried out of a run: what was left in the pack when it ended. */
  function bank(keys) {
    const n = Math.max(0, Math.floor(keys) || 0);
    if (!n) return 0;
    const p = get();
    p.wallet.keys += n;
    p.wallet.earned += n;
    save();
    changed('bank');
    return n;
  }

  function count(name, by) {
    const p = get();
    p.counters[name] = (p.counters[name] || 0) + (by == null ? 1 : by);
  }
  function countMax(name, value) {
    const p = get();
    if (value > (p.counters[name] || 0)) p.counters[name] = value;
  }

  /* Limited pieces whose condition is now met: they are granted, and returned
     so the run summary can announce them. */
  function checkEarned() {
    const p = get();
    const won = [];
    CATALOG.forEach(function (i) {
      if (i.rarity !== 'limited' || p.owned[i.key]) return;
      if ((p.counters[i.earn.counter] || 0) >= i.earn.n) { p.owned[i.key] = 1; won.push(i); }
    });
    if (won.length) { save(); changed('earned'); }
    return won;
  }

  /* One finished run, in one call: keys banked, depth and boss counters, limited
     pieces won. `run` = { keys, depth, bosses: ['warden', ...], actsCleared }. */
  function finishRun(run) {
    const before = get().wallet.keys;
    bank(run.keys);
    count('runs');
    countMax('depth', run.depth || 0);
    (run.bosses || []).forEach(function (b) { count('boss.' + b); });
    for (let a = 1; a <= (run.actsCleared || 0); a++) countMax('act.' + a, 1);
    save();
    return { banked: get().wallet.keys - before, won: checkEarned() };
  }

  function markSeen(key) { const p = get(); if (!p.seen[key]) { p.seen[key] = 1; save(); } }

  DS.Look = {
    RARITIES: RARITIES, RARITY_COLOR: RARITY_COLOR, BASE_PRICE: BASE_PRICE, SLOT_WEIGHT: SLOT_WEIGHT, SET_DISCOUNT: SET_DISCOUNT,
    TRAITS: TRAITS, TRAIT_KEYS: TRAIT_KEYS, DYE_KEYS: DYE_KEYS, CATALOG: CATALOG, WEAPON_TYPES: WEAPON_TYPES, ITEM_SLOTS: ITEM_SLOTS, DYE_OF: DYE_OF,
    DEFAULT_LOOK: DEFAULT_LOOK, KEY: KEY,
    priceOf: priceOf, traitIds: traitIds, traitColor: traitColor, itemOf: itemOf, starters: starters, clean: clean,
    itemsIn: function (slot, weaponType) {
      return CATALOG.filter(function (i) { return i.slot === slot && (!weaponType || i.w === weaponType); });
    },
    get profile() { return get(); },
    reload: function () { profile = null; return get(); },
    save: save, owns: owns, equip: equip, buy: buy, setPrice: setPrice, bank: bank, count: count, countMax: countMax,
    checkEarned: checkEarned, finishRun: finishRun, markSeen: markSeen,
    onChange: function (fn) { listeners.push(fn); },
    /* The player has made a character (or skipped making one). */
    markCreated: function () { get().created = true; save(); changed('created'); },
    get created() { return get().created; },
    /* The look the game draws: the profile's own. */
    get look() { return get().look; },
    randomLook: function (rng) {
      const pick = function (list) { return list[Math.floor((rng ? rng() : Math.random()) * list.length)]; };
      const out = JSON.parse(JSON.stringify(get().look));
      out.skin = pick(traitIds('skin')); out.eyeColor = pick(traitIds('eyeColor')); out.hairColor = pick(traitIds('hairColor'));
      ['build', 'height', 'eyes', 'brows', 'mouth'].forEach(function (k) { out[k] = pick(TRAITS[k]); });
      ITEM_SLOTS.forEach(function (slot) {
        const owned = CATALOG.filter(function (i) { return i.slot === slot && owns(i); });
        if (owned.length) out[slot] = pick(owned).id;
      });
      Object.keys(DYE_OF).forEach(function (s) { out[DYE_OF[s]] = pick(traitIds('dye')); });
      return out;
    }
  };
})(window.DS);
