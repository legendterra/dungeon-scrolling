/* HTML world panels (v6): the shared panel kit, and the merchant, the shrine
   and the enchant table built on it.

   The kit (DS.HKit) is what every full-screen HTML panel in the game is made
   of -- the bag (bag.js), the menus and the pause screen (menus.js) use it too:

     screen(name)   a full-frame host in the panel layer. Asking for it during
                    a frame's draw is what keeps it on screen; a screen nobody
                    asked for in a frame is hidden by the sweeper below. That
                    is how the HTML follows the game's own scene and modal
                    state without a second state machine to keep in sync.
     masthead/foot  the header strip and the key-hint footer every panel wears
     itemCard       the item detail card (name in rarity colour, stats, affixes,
                    element + passive, set bonus, ▲/▼ against what is worn)
     nav            spatial keyboard/gamepad navigation over rendered nodes

   Keyboard and gamepad still go through DS.Input inside the fixed-step update,
   exactly like the WebGL screens did; the mouse talks to the DOM directly.
   Focus is one index per screen (g.modal.cursor), drawn as .is-focus, and the
   pointer moves the same index on hover -- so the two can never disagree.

   DS.HUI_MENUS (default true; ?huimenus=0 turns it off) picks this path; with
   it false every screen falls back to the old WebGL drawing untouched. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  if (DS.HUI_MENUS === undefined) {
    DS.HUI_MENUS = !(typeof location !== 'undefined' && /[?&]huimenus=0\b/.test(location.search));
  }

  function on() { return DS.HUI_MENUS !== false && !!DS.HUI && typeof document !== 'undefined'; }
  function h(tag, cls, props, kids) { return DS.HUI.el(tag, cls, props, kids); }

  // --- screens + sweeper ----------------------------------------------------

  const screens = {};

  /* The host for one named screen, shown for this frame. `fresh` is true on
     the frame it (re)appears, so a screen can reset transient state. */
  function screen(name, layerName) {
    let s = screens[name];
    if (!s) {
      const root = h('div', 'hk-screen ui-interactive', { dataset: { screen: name } });
      root.hidden = true;
      // The game owns the keyboard: a mouse press must never park DOM focus
      // on a button, where Enter would fire it a second time.
      root.addEventListener('mousedown', function (e) { if (e.button === 0 && !e.target.closest('input')) e.preventDefault(); });
      DS.HUI.layer(layerName || 'panel').appendChild(root);
      s = screens[name] = { root: root, touched: false, fresh: false, sig: '' };
    }
    s.touched = true;
    s.fresh = s.root.hidden;
    if (s.root.hidden) {
      s.root.hidden = false;
      s.sig = '';
      s.root.classList.remove('hk-enter');
      void s.root.offsetWidth;          // restart the entrance animation
      s.root.classList.add('hk-enter');
      syncCursorClass();
    }
    return s;
  }

  function anyOpen() {
    for (const k in screens) if (!screens[k].root.hidden) return true;
    return false;
  }

  /* While any HTML screen is up, the system cursor is the pointer (see the
     html.hk-open rule in panels.css) and the WebGL arrow stands down. */
  function syncCursorClass() {
    document.documentElement.classList.toggle('hk-open', anyOpen());
  }

  function sweep() {
    requestAnimationFrame(sweep);
    if (DS.__paused) return;
    let changed = false;
    for (const k in screens) {
      const s = screens[k];
      if (!s.touched && !s.root.hidden) {
        s.root.hidden = true;
        if (s.onHide) s.onHide();
        changed = true;
      }
      s.touched = false;
    }
    if (changed) syncCursorClass();
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(sweep);

  /* Rebuild a screen's body only when what it shows has changed. */
  function rebuild(s, sig, build) {
    if (s.sig === sig) return false;
    s.sig = sig;
    while (s.root.firstChild) s.root.removeChild(s.root.firstChild);
    build(s.root);
    return true;
  }

  // --- identity + icons -----------------------------------------------------

  const ids = new WeakMap();
  let nextId = 1;
  function uid(obj) {
    if (!obj || typeof obj !== 'object') return '0';
    let id = ids.get(obj);
    if (!id) { id = nextId++; ids.set(obj, id); }
    return String(id);
  }

  /* Item signature: identity plus everything the enchanter can change. */
  function itemSig(item) {
    if (!item) return '-';
    return uid(item) + '.' + item.rarity + '.' + (item.affixes ? item.affixes.length : 0) + '.' +
      (item.rerolls || 0) + '.' + (item.infusion || '') + '.' + (item.stats ? item.stats.damage || item.stats.shield : '');
  }

  const urls = new WeakMap();
  function iconURL(cv) {
    if (!cv || !cv.toDataURL) return '';
    let u = urls.get(cv);
    if (!u) { u = cv.toDataURL(); urls.set(cv, u); }
    return u;
  }

  /* A pixel-art sprite as an <img>, kept crisp at any scale. */
  function icon(cv, cls) {
    const img = h('img', 'hk-px' + (cls ? ' ' + cls : ''), { alt: '', draggable: 'false' });
    const u = iconURL(cv);
    if (u) img.src = u; else img.hidden = true;
    return img;
  }

  function itemIcon(item, cls) { return icon(item ? DS.SPR.itemIcon(item) : null, cls); }

  // --- small furniture ------------------------------------------------------

  function keycap(label) { return h('span', 'ui-key', { text: label }); }

  function hints(list) {
    const row = h('div', 'hk-hints');
    for (let i = 0; i < list.length; i++) {
      const pair = h('span', 'hk-hint');
      const keys = list[i][0].split(' ');
      for (let k = 0; k < keys.length; k++) pair.appendChild(keycap(keys[k]));
      pair.appendChild(h('span', 'hk-hint-label', { text: list[i][1] }));
      row.appendChild(pair);
    }
    return row;
  }

  function purse(inv) {
    const S = DS.SPR;
    return h('div', 'hk-purse', null, [
      h('span', 'hk-coin-chip', null, [icon(S.coin, 'hk-chip-icon'), h('span', 'ui-num', { text: String(inv.coins) })]),
      h('span', 'hk-shard-chip', null, [icon(S.shard, 'hk-chip-icon'), h('span', 'ui-num', { text: String(inv.shards) })])
    ]);
  }

  /* The header strip: eyebrow over a large title, an optional line of flavour,
     and whatever sits on the right (usually the purse). */
  function masthead(opts) {
    const left = h('div', 'hk-mast-titles', null, [
      h('div', 'hk-eyebrow', { text: opts.eyebrow || '' }),
      h('div', 'hk-title', { text: opts.title })
    ]);
    const kids = [h('div', 'hk-mast-slash'), left];
    if (opts.sub) kids.push(h('div', 'hk-mast-sub', { text: opts.sub }));
    kids.push(h('div', 'hk-mast-fill'));
    if (opts.right) kids.push(opts.right);
    const mast = h('header', 'hk-mast', null, kids);
    if (opts.accent) mast.style.setProperty('--hk-accent', opts.accent);
    return mast;
  }

  function foot(hintList, left) {
    return h('footer', 'hk-foot', null, [
      left || h('div', 'hk-status'),
      h('div', 'hk-mast-fill'),
      hints(hintList)
    ]);
  }

  /* The toast the game raised this frame (NOT ENOUGH COINS, BAG FULL...) as a
     status pill in the panel footer: the HUD, where toasts normally live, is
     not drawn while a panel owns the screen. */
  function status(root, g) {
    const pill = root.querySelector('.hk-status');
    if (!pill) return;
    const live = g && g.toastTimer > 0 && g.toastText;
    const text = live ? g.toastText : '';
    if (pill.textContent !== text) pill.textContent = text;
    pill.classList.toggle('is-live', !!live);
    if (live) pill.style.setProperty('--hk-status', g.toastColor || '#ffffff');
  }

  function rarityClass(r) { return 'rarity-' + Math.max(0, Math.min(4, r | 0)); }

  function elColor(key) { return 'var(--el-' + key + ', #ffffff)'; }

  function pips(rarity) {
    const row = h('span', 'hk-pips');
    for (let i = 0; i < 5; i++) row.appendChild(h('i', i <= rarity ? 'is-lit' : ''));
    return row;
  }

  // --- item detail card -----------------------------------------------------

  function delta(value, better) {
    if (!value) return null;
    const up = value > 0;
    const good = better === 'lower' ? !up : up;
    const txt = (up ? '▲ ' : '▼ ') + Math.abs(Math.round(value * 10) / 10);
    return h('span', 'hk-delta ' + (good ? 'is-up' : 'is-down'), { text: txt });
  }

  function statRow(label, val, d) {
    return h('div', 'hk-stat', null, [
      h('span', 'hk-stat-label', { text: label }),
      h('span', 'hk-stat-val ui-num', { text: val }),
      d || h('span', 'hk-delta')
    ]);
  }

  /* What the given item would replace: the held weapon, or the piece worn in
     the same armour slot. Null when it IS that item or nothing is worn. */
  function compareTarget(inv, item) {
    if (!inv || !item) return null;
    if (DS.Armor.isArmor(item)) {
      const worn = inv.armor[item.slot];
      return worn && worn !== item ? worn : null;
    }
    const held = DS.Inv.weapon(inv);
    return held && held !== item ? held : null;
  }

  /* opts: { inv, player, compact, foot: [[key,label]...] } */
  function itemCard(item, opts) {
    opts = opts || {};
    const W = DS.Weapons, A = DS.Armor;
    const armor = A.isArmor(item);
    const other = opts.noCompare ? null : compareTarget(opts.inv, item);

    const typeText = W.rarityLabel(item.rarity) + ' · ' +
      (armor ? A.MATERIALS[item.material].label + ' ' + A.SLOT_LABEL[item.slot]
             : W.WEAPONS[item.type].label);

    const head = h('div', 'hk-card-head', null, [
      h('div', 'hk-card-heads', null, [
        h('div', 'hk-card-type', { text: typeText.toUpperCase() }),
        h('div', 'hk-card-name', { text: item.name }),
        pips(item.rarity)
      ]),
      h('div', 'hk-card-art', null, [itemIcon(item, 'hk-card-icon')])
    ]);

    const body = h('div', 'hk-card-body');
    if (armor) {
      const s = item.stats;
      body.appendChild(h('div', 'hk-mainstat', null, [
        h('span', 'hk-mainstat-label', { text: 'SHIELD' }),
        h('span', 'hk-mainstat-val ui-num', { text: String(s.shield) }),
        delta(other ? s.shield - other.stats.shield : 0)
      ]));
      body.appendChild(statRow('WEIGHT', String(s.weight),
        delta(other ? s.weight - other.stats.weight : 0, 'lower')));
    } else {
      const s = item.stats;
      body.appendChild(h('div', 'hk-mainstat', null, [
        h('span', 'hk-mainstat-label', { text: 'DAMAGE' }),
        h('span', 'hk-mainstat-val ui-num', { text: String(s.damage) }),
        delta(other ? s.damage - other.stats.damage : 0)
      ]));
      const spd = 60 / s.cooldown;
      body.appendChild(statRow('ATTACKS / SEC', spd.toFixed(1),
        delta(other ? Math.round((spd - 60 / other.stats.cooldown) * 10) / 10 : 0)));
      body.appendChild(statRow('CRIT RATE', Math.round(s.crit * 100) + '%',
        delta(other ? Math.round((s.crit - other.stats.crit) * 100) : 0)));
      body.appendChild(elementBlock(item));
      if (!opts.compact && DS.Skills && DS.Skills.names) {
        const n = DS.Skills.names(item);
        body.appendChild(h('div', 'hk-skills', null, [
          h('span', 'hk-skill', null, [keycap('E'), h('span', '', { text: n.skill })]),
          h('span', 'hk-skill', null, [keycap('X'), h('span', '', { text: n.ult })])
        ]));
      }
    }

    if (item.affixes && item.affixes.length) {
      const list = h('ul', 'hk-affixes');
      for (let i = 0; i < item.affixes.length; i++) {
        const a = item.affixes[i];
        const li = h('li', 'hk-affix', { text: a.desc });
        li.style.setProperty('--affix', a.color || '#ffffff');
        list.appendChild(li);
      }
      body.appendChild(h('div', 'hk-section-label', { text: 'AFFIXES ' + item.affixes.length + '/' + DS.Inv.slotsFor(item) }));
      body.appendChild(list);
    } else if (!opts.compact) {
      body.appendChild(h('div', 'hk-section-label', { text: 'AFFIXES 0/' + DS.Inv.slotsFor(item) }));
      body.appendChild(h('div', 'hk-empty-line', { text: 'No powers bound yet' }));
    }

    if (armor) {
      const set = A.MATERIALS[item.material].set;
      const live = opts.player && opts.player.stats.setBonus;
      const active = !!(live && set && live.key === set.key);
      if (set) {
        body.appendChild(h('div', 'hk-set' + (active ? ' is-active' : ''), null, [
          h('span', 'hk-set-tag', { text: active ? 'SET ACTIVE' : 'SET BONUS' }),
          h('span', 'hk-set-desc', { text: set.desc })
        ]));
      }
    }

    const card = h('div', 'hk-card ' + rarityClass(item.rarity), null, [head, body]);
    if (other) {
      card.appendChild(h('div', 'hk-card-vs', null, [
        h('span', 'hk-vs-label', { text: armor ? 'VS WORN' : 'VS HELD' }),
        h('span', 'hk-vs-name ' + rarityClass(other.rarity), { text: other.name })
      ]));
    }
    if (opts.foot) card.appendChild(h('div', 'hk-card-foot', null, [hints(opts.foot)]));
    return card;
  }

  function elementBlock(item) {
    const W = DS.Weapons;
    const el = W.activeElement(item);
    if (!el) {
      return h('div', 'hk-element is-none', null, [
        h('span', 'hk-el-dot'),
        h('span', 'hk-el-name', { text: 'NO ELEMENT' }),
        h('span', 'hk-el-note', { text: 'Infuse with R / T once you hold an essence' })
      ]);
    }
    const E = W.ELEMENTS[el];
    const share = Math.round((item.stats.elementShare || 0) * 100);
    const power = Math.round(((item.stats.elemPower || 1) - 1) * 100);
    const passive = DS.Elements && DS.Elements.PASSIVE && DS.Elements.PASSIVE[el];
    const top = h('div', 'hk-el-top', null, [
      h('span', 'hk-el-dot'),
      h('span', 'hk-el-name', { text: E.label.toUpperCase() }),
      h('span', 'hk-el-share ui-num', { text: share + '%' }),
      item.infusion ? h('span', 'hk-el-tag', { text: 'INFUSED' }) : null,
      power > 0 ? h('span', 'hk-el-react', { text: '+' + power + '% REACTION' }) : null
    ]);
    const block = h('div', 'hk-element', null, [
      top,
      passive ? h('div', 'hk-el-passive', null, [
        h('span', 'hk-el-pname', { text: passive.name }),
        h('span', 'hk-el-pdesc', { text: passive.desc.charAt(0) + passive.desc.slice(1).toLowerCase() })
      ]) : null
    ]);
    block.style.setProperty('--el', elColor(el));
    return block;
  }

  // --- navigation -----------------------------------------------------------

  /* Which way the stick/arrows were pushed this step, if any. */
  function navDir() {
    const In = DS.Input;
    if (In.justPressed('left')) return 'left';
    if (In.justPressed('right')) return 'right';
    if (In.justPressed('up')) return 'up';
    if (In.justPressed('down')) return 'down';
    return null;
  }

  /* Nearest node in a direction, by the rendered layout -- so a screen's
     keyboard map is whatever it looks like, not a table that can drift from
     it. Off-axis distance costs double, which keeps a move in its lane. */
  function spatial(nodes, from, dir) {
    const a = nodes[from];
    if (!a) return 0;
    const ra = a.getBoundingClientRect();
    const ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (i === from || !nodes[i] || nodes[i].hidden) continue;
      const r = nodes[i].getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      let main, cross;
      if (dir === 'left') { main = -dx; cross = dy; }
      else if (dir === 'right') { main = dx; cross = dy; }
      else if (dir === 'up') { main = -dy; cross = dx; }
      else { main = dy; cross = dx; }
      if (main <= 2) continue;
      const score = main + Math.abs(cross) * 2;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best < 0 ? from : best;
  }

  function setFocus(nodes, index) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i]) nodes[i].classList.toggle('is-focus', i === index);
    }
  }

  function move(state, key, index) {
    if (state[key] === index) return false;
    state[key] = index;
    DS.Audio.play('menuMove');
    return true;
  }

  // --- the merchant ---------------------------------------------------------

  const SHOP = { nodes: [] };

  function shopSig(g) {
    const stock = g.shopStock || [];
    let sig = g.inv.coins + '|' + g.inv.shards + '|' + itemSig(DS.Inv.weapon(g.inv)) + '|' +
      Math.round(g.player.hp) + '|';
    for (let i = 0; i < stock.length; i++) sig += (stock[i].sold ? 's' : 'o');
    return sig;
  }

  function updateShop(g) {
    const In = DS.Input;
    const state = g.modal;
    const stock = g.shopStock;
    if (In.justPressed('back') || In.justPressed('bag')) {
      In.consume('back'); In.consume('bag');
      DS.UI.closeModal(g);
      return;
    }
    const dir = navDir();
    if (dir && SHOP.nodes.length) move(state, 'cursor', spatial(SHOP.nodes, state.cursor, dir));
    state.cursor = Math.max(0, Math.min(stock.length - 1, state.cursor));
    if (In.justPressed('confirm')) {
      In.consume('confirm');
      DS.UI.act.buy(g, stock[state.cursor]);
    }
  }

  function shopCard(g, entry, i) {
    const state = g.modal;
    const item = entry.kind === 'item' ? entry.item : null;
    const afford = !entry.sold && g.inv.coins >= entry.coins;
    const cls = 'hp-good' + (item ? ' is-item ' + rarityClass(item.rarity) : '') +
      (entry.sold ? ' is-sold' : afford ? '' : ' is-poor');
    const card = h('button', cls, { type: 'button', tabindex: '-1' }, [
      h('div', 'hp-good-art', null, [icon(DS.SPR.shopIcon(entry), 'hp-good-icon')]),
      h('div', 'hp-good-text', null, [
        h('div', 'hp-good-name', { text: item ? item.name : entry.label }),
        h('div', 'hp-good-desc', { text: item ? DS.Weapons.rarityLabel(item.rarity) + ' ' +
          DS.Weapons.WEAPONS[item.type].label + ' · DMG ' + item.stats.damage : entry.desc })
      ]),
      price(entry.coins, entry.sold ? 'sold' : afford ? 'ok' : 'poor')
    ]);
    card.addEventListener('pointerenter', function () { move(state, 'cursor', i); });
    card.addEventListener('click', function () {
      state.cursor = i;
      DS.UI.act.buy(g, entry);
    });
    return card;
  }

  function price(coins, mode, shards) {
    const S = DS.SPR;
    if (mode === 'sold') return h('div', 'hk-price is-sold', { text: 'SOLD' });
    const kids = [];
    if (coins) kids.push(h('span', 'hk-price-part', null, [icon(S.coin, 'hk-chip-icon'), h('span', 'ui-num', { text: String(coins) })]));
    if (shards) kids.push(h('span', 'hk-price-part is-shard', null, [icon(S.shard, 'hk-chip-icon'), h('span', 'ui-num', { text: String(shards) })]));
    if (!kids.length) kids.push(h('span', 'hk-price-part', { text: 'FREE' }));
    return h('div', 'hk-price' + (mode === 'poor' ? ' is-poor' : ''), null, kids);
  }

  function shopDetail(g, entry) {
    if (!entry) return h('div', 'hp-detail');
    const afford = !entry.sold && g.inv.coins >= entry.coins;
    const btnText = entry.sold ? 'SOLD OUT' : afford ? 'BUY' : 'NOT ENOUGH COINS';
    const buyBtn = h('button', 'ui-btn hp-buy' + (afford ? ' is-primary' : ''), { type: 'button', tabindex: '-1' }, [
      h('span', '', { text: btnText }),
      entry.sold ? null : price(entry.coins, afford ? 'ok' : 'poor')
    ]);
    if (!afford) buyBtn.disabled = true;
    buyBtn.addEventListener('click', function () { DS.UI.act.buy(g, entry); });

    if (entry.kind === 'item') {
      return h('div', 'hp-detail', null, [
        itemCard(entry.item, { inv: g.inv, player: g.player }),
        buyBtn
      ]);
    }
    return h('div', 'hp-detail', null, [
      h('div', 'hk-card hp-ware' + (entry.sold ? ' is-sold' : ''), null, [
        h('div', 'hk-card-head', null, [
          h('div', 'hk-card-heads', null, [
            h('div', 'hk-card-type', { text: 'SUPPLIES' }),
            h('div', 'hk-card-name', { text: entry.label })
          ]),
          h('div', 'hk-card-art', null, [icon(DS.SPR.shopIcon(entry), 'hk-card-icon')])
        ]),
        h('div', 'hk-card-body', null, [
          h('div', 'hp-ware-desc', { text: entry.desc }),
          h('div', 'hp-ware-note', { text: wareNote(g, entry) })
        ])
      ]),
      buyBtn
    ]);
  }

  /* One honest line on what the purchase changes right now. */
  function wareNote(g, entry) {
    const p = g.player, inv = g.inv;
    if (entry.kind === 'heal') return 'Hearts ' + Math.ceil(p.hp) + ' / ' + p.stats.maxHp;
    if (entry.kind === 'arrows') return 'Quiver ' + inv.arrows + ' / 60';
    if (entry.kind === 'shards') return 'Shards feed the enchant table. You hold ' + inv.shards + '.';
    if (entry.kind === 'maxhp') return 'Lasts until the run ends.';
    if (entry.kind === 'dash') return 'Lasts until the run ends.';
    if (entry.kind === 'stamina') return 'Stamina ' + p.stats.maxStamina + ' now.';
    return '';
  }

  function drawShop(g) {
    const s = screen('shop');
    const stock = g.shopStock || [];
    rebuild(s, shopSig(g), function (root) {
      SHOP.nodes = [];
      const grid = h('div', 'hp-goods');
      for (let i = 0; i < stock.length; i++) {
        const card = shopCard(g, stock[i], i);
        SHOP.nodes.push(card);
        grid.appendChild(card);
      }
      root.appendChild(h('div', 'hk-scrim'));
      root.appendChild(masthead({
        eyebrow: 'SAFE ROOM', title: 'Merchant', accent: 'var(--gold)',
        sub: 'He keeps nothing you cannot carry out.', right: purse(g.inv)
      }));
      root.appendChild(h('main', 'hk-body hp-shop', null, [
        h('section', 'hp-goods-wrap', null, [
          h('div', 'hk-section-label', { text: 'WARES · ' + stock.filter(function (e) { return !e.sold; }).length + ' LEFT' }),
          grid
        ]),
        SHOP.detail = h('div', 'hp-detail-host')
      ]));
      root.appendChild(foot([['ENTER', 'Buy'], ['ESC', 'Leave']]));
      SHOP.detailSig = '';
    });
    /* The detail follows the cursor on its own, so hovering along the wares
       never rebuilds (and re-animates) the grid under the pointer. */
    const dsig = s.sig + '|' + g.modal.cursor;
    if (SHOP.detailSig !== dsig && SHOP.detail) {
      SHOP.detailSig = dsig;
      while (SHOP.detail.firstChild) SHOP.detail.removeChild(SHOP.detail.firstChild);
      SHOP.detail.appendChild(shopDetail(g, stock[g.modal.cursor]));
    }
    setFocus(SHOP.nodes, g.modal.cursor);
    status(s.root, g);
  }

  // --- the shrine -----------------------------------------------------------

  const SHRINE = { nodes: [] };
  const ROMAN = ['I', 'II', 'III', 'IV'];

  function updateShrine(g) {
    const In = DS.Input;
    const state = g.modal;
    const offers = g.shrine.offers;
    if (In.justPressed('back')) { In.consume('back'); DS.UI.closeModal(g); return; }
    if (In.justPressed('reroll')) { In.consume('reroll'); DS.UI.act.rerollShrine(g); return; }
    const dir = navDir();
    if (dir && SHRINE.nodes.length) move(state, 'cursor', spatial(SHRINE.nodes, state.cursor, dir));
    state.cursor = Math.max(0, Math.min(offers.length - 1, state.cursor));
    if (In.justPressed('confirm')) {
      In.consume('confirm');
      take(g, offers[state.cursor]);
    }
  }

  function take(g, card) {
    DS.UI.act.takeShrineCard(g, card);
    DS.UI.closeModal(g);
  }

  function boonCard(g, card, i) {
    const state = g.modal;
    const gift = card.kind === 'gift';
    const essence = card.boon && card.boon.essence;
    const kind = gift ? 'OFFERING' : essence ? 'ESSENCE' : 'BOON';
    const sigil = h('div', 'hp-sigil', null, [
      h('i', 'hp-sigil-ring'), h('i', 'hp-sigil-core'),
      gift ? itemIcon(card.item, 'hp-sigil-icon') : h('span', 'hp-sigil-glyph', { text: card.name.charAt(0) })
    ]);
    const kids = [
      h('div', 'hp-boon-top', null, [
        h('span', 'hp-boon-kind', { text: kind }),
        h('span', 'hp-boon-num', { text: ROMAN[i] || String(i + 1) })
      ]),
      sigil,
      h('div', 'hp-boon-name', { text: card.name }),
      h('div', 'hp-boon-rule'),
      h('div', 'hp-boon-desc', { text: gift ? card.item.name : card.desc })
    ];
    if (gift) {
      const it = card.item;
      kids.push(h('div', 'hp-boon-extra ' + rarityClass(it.rarity), {
        text: DS.Weapons.rarityLabel(it.rarity).toUpperCase() + ' · ' +
          (DS.Armor.isArmor(it) ? 'SHIELD ' + it.stats.shield : 'DMG ' + it.stats.damage)
      }));
      kids.push(h('div', 'hp-boon-note', { text: 'Left at the shrine for you to pick up' }));
    } else if (essence) {
      kids.push(h('div', 'hp-boon-note', { text: 'Press R / T to cycle infusions in a fight' }));
    }
    kids.push(h('div', 'hp-boon-take', null, [keycap('ENTER'), h('span', '', { text: 'TAKE' })]));
    const el = h('button', 'hp-boon' + (gift ? ' is-gift' : ''), { type: 'button', tabindex: '-1' }, kids);
    el.style.setProperty('--boon', essence ? elColor(essence) : card.color || '#ffffff');
    el.style.setProperty('--i', String(i));
    el.addEventListener('pointerenter', function () { move(state, 'cursor', i); });
    el.addEventListener('click', function () { take(g, card); });
    return el;
  }

  function drawShrine(g) {
    const s = screen('shrine');
    const shrine = g.shrine;
    const offers = shrine.offers || [];
    const cost = DS.UI.act.rerollCost(shrine);
    const sig = offers.map(function (c) { return c.name; }).join(',') + '|' + g.inv.coins + '|' + cost;
    rebuild(s, sig, function (root) {
      SHRINE.nodes = [];
      const row = h('div', 'hp-boons');
      for (let i = 0; i < offers.length; i++) {
        const c = boonCard(g, offers[i], i);
        SHRINE.nodes.push(c);
        row.appendChild(c);
      }
      const afford = g.inv.coins >= cost;
      const reroll = h('button', 'ui-btn hp-reroll', { type: 'button', tabindex: '-1' }, [
        keycap('R'), h('span', '', { text: 'REROLL' }), price(cost, afford ? 'ok' : 'poor')
      ]);
      if (!afford) reroll.disabled = true;
      reroll.addEventListener('click', function () { DS.UI.act.rerollShrine(g); });
      root.appendChild(h('div', 'hk-scrim is-shrine'));
      root.appendChild(masthead({
        eyebrow: 'SHRINE', title: 'The shrine offers', accent: 'var(--accent)',
        sub: 'Take one. The others fade with the light.', right: purse(g.inv)
      }));
      root.appendChild(h('main', 'hk-body hp-shrine', null, [row]));
      root.appendChild(foot([['ENTER', 'Take'], ['R', 'Reroll'], ['ESC', 'Walk away']],
        h('div', 'hk-foot-left', null, [reroll, h('div', 'hk-status')])));
    });
    setFocus(SHRINE.nodes, g.modal.cursor);
    status(s.root, g);
  }

  // --- the enchant table ----------------------------------------------------

  const ENCH = { items: [], rites: [] };
  const RITE_TONE = { reroll: 'var(--gold)', affix: 'var(--r-epic)', upgrade: 'var(--r-legendary)', salvage: 'var(--accent)' };

  function updateEnchant(g) {
    const In = DS.Input;
    const state = g.modal;
    const list = DS.UI.ownedList(g.inv);
    if (In.justPressed('back') || In.justPressed('bag')) {
      In.consume('back'); In.consume('bag');
      DS.UI.closeModal(g);
      return;
    }
    const n = DS.UI.act.RITES.length;
    if (In.justPressed('left') && list.length) move(state, 'cursor', (state.cursor + list.length - 1) % list.length);
    if (In.justPressed('right') && list.length) move(state, 'cursor', (state.cursor + 1) % list.length);
    if (In.justPressed('up')) move(state, 'action', (state.action + n - 1) % n);
    if (In.justPressed('down')) move(state, 'action', (state.action + 1) % n);
    state.cursor = Math.max(0, Math.min(Math.max(0, list.length - 1), state.cursor));
    const entry = list[state.cursor];
    if (!entry) return;
    if (In.justPressed('confirm')) {
      In.consume('confirm');
      DS.UI.act.applyEnchant(g, entry, state);
    }
  }

  function drawEnchant(g) {
    const s = screen('enchant');
    const state = g.modal;
    const list = DS.UI.ownedList(g.inv);
    let sig = g.inv.coins + '|' + g.inv.shards + '|' + g.inv.active + '|' + state.cursor + '|';
    for (let i = 0; i < list.length; i++) sig += itemSig(list[i].item) + ',';
    rebuild(s, sig, function (root) {
      ENCH.items = [];
      ENCH.rites = [];
      root.appendChild(h('div', 'hk-scrim is-enchant'));
      root.appendChild(masthead({
        eyebrow: 'SAFE ROOM', title: 'Enchant table', accent: 'var(--r-epic)',
        sub: 'Pay in coin and shard. The steel answers.', right: purse(g.inv)
      }));
      const strip = h('div', 'hp-strip');
      for (let i = 0; i < list.length; i++) strip.appendChild(stripTile(g, list[i], i));
      const entry = list[state.cursor];
      const body = h('main', 'hk-body hp-enchant', null, [
        h('div', 'hp-strip-wrap', null, [h('div', 'hk-section-label', { text: 'CHOOSE THE STEEL' }), strip])
      ]);
      if (!entry) {
        body.appendChild(h('div', 'hp-nothing', { text: 'Nothing to enchant yet.' }));
      } else {
        const rites = h('div', 'hp-rites');
        const R = DS.UI.act.RITES;
        for (let i = 0; i < R.length; i++) rites.appendChild(riteRow(g, entry, R[i], i));
        body.appendChild(h('div', 'hp-anvil', null, [
          h('div', 'hp-anvil-card', null, [itemCard(entry.item, { inv: g.inv, player: g.player, compact: true, noCompare: true })]),
          h('div', 'hp-rites-wrap', null, [h('div', 'hk-section-label', { text: 'RITES' }), rites])
        ]));
      }
      root.appendChild(body);
      root.appendChild(foot([['← →', 'Item'], ['↑ ↓', 'Rite'], ['ENTER', 'Perform'], ['ESC', 'Leave']]));
    });
    setFocus(ENCH.items, state.cursor);
    for (let i = 0; i < ENCH.rites.length; i++) ENCH.rites[i].classList.toggle('is-focus', i === state.action);
    status(s.root, g);
  }

  function stripTile(g, entry, i) {
    const state = g.modal;
    const held = entry.source === 'slot';
    const tile = h('button', 'hk-tile ' + rarityClass(entry.item.rarity) + (held ? ' is-worn' : ''),
      { type: 'button', tabindex: '-1' }, [
        itemIcon(entry.item, 'hk-tile-icon'),
        held ? h('span', 'hk-tile-tag' + (entry.index === g.inv.active ? ' is-active' : ''),
          { text: entry.index === g.inv.active ? 'HELD' : 'OFF' }) : null
      ]);
    tile.addEventListener('click', function () {
      if (move(state, 'cursor', i)) DS.Audio.play('menuPick');
    });
    ENCH.items.push(tile);
    return tile;
  }

  function riteRow(g, entry, rite, i) {
    const state = g.modal;
    const item = entry.item;
    const salvage = rite.key === 'salvage';
    const cost = DS.UI.act.actionCost(g.inv, item, i);
    const afford = salvage || DS.Inv.canAfford(g.inv, cost);
    const right = salvage
      ? h('div', 'hk-price is-gain', null, [h('span', 'hk-price-part is-shard', null, [
          h('span', 'ui-num', { text: '+' + DS.Inv.salvageValue(item) }), icon(DS.SPR.shard, 'hk-chip-icon')])])
      : price(cost.coins, afford ? 'ok' : 'poor', cost.shards);
    const row = h('button', 'hp-rite' + (afford ? '' : ' is-poor') + (salvage ? ' is-danger' : ''),
      { type: 'button', tabindex: '-1' }, [
        h('div', 'hp-rite-art', null, [icon(DS.SPR.uiIcon[rite.icon], 'hp-rite-icon')]),
        h('div', 'hp-rite-text', null, [
          h('div', 'hp-rite-name', { text: rite.name }),
          h('div', 'hp-rite-desc', { text: rite.desc.charAt(0) + rite.desc.slice(1).toLowerCase() })
        ]),
        right
      ]);
    row.style.setProperty('--rite', RITE_TONE[rite.key] || 'var(--accent)');
    row.addEventListener('pointerenter', function () { move(state, 'action', i); });
    row.addEventListener('click', function () {
      state.action = i;
      DS.UI.act.applyEnchant(g, entry, state);
    });
    ENCH.rites.push(row);
    return row;
  }

  // --- dispatch -------------------------------------------------------------

  /* Called from DS.UI.updateModal / drawModal. Returns false for a modal kind
     this module does not own, so the caller can keep its own path. */
  function update(g) {
    const k = g.modal && g.modal.kind;
    if (k === 'shop') updateShop(g);
    else if (k === 'shrine') updateShrine(g);
    else if (k === 'enchant') updateEnchant(g);
    else if (k === 'bag' && DS.HBag) DS.HBag.update(g);
    else return false;
    return true;
  }

  function draw(g) {
    const k = g.modal && g.modal.kind;
    if (k === 'shop') drawShop(g);
    else if (k === 'shrine') drawShrine(g);
    else if (k === 'enchant') drawEnchant(g);
    else if (k === 'bag' && DS.HBag) DS.HBag.draw(g);
    else return false;
    return true;
  }

  DS.HKit = {
    on: on,
    h: h,
    screen: screen,
    rebuild: rebuild,
    anyOpen: anyOpen,
    uid: uid,
    itemSig: itemSig,
    icon: icon,
    itemIcon: itemIcon,
    keycap: keycap,
    hints: hints,
    purse: purse,
    masthead: masthead,
    foot: foot,
    status: status,
    price: price,
    pips: pips,
    rarityClass: rarityClass,
    elColor: elColor,
    itemCard: itemCard,
    compareTarget: compareTarget,
    navDir: navDir,
    spatial: spatial,
    setFocus: setFocus,
    move: move
  };

  DS.HPanels = { update: update, draw: draw };
})(window.DS);
