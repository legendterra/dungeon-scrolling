/* The run HUD (v6), in HTML over the play frame.

   What it replaces: the vitals panel, the hand and skill tiles, the currency
   plate, the depth label, the boss bar, the momentum meter and the big control
   sheet that src/ui/ui.js used to draw in WebGL at 320x180 with the bitmap
   font. Those draws are still there behind DS.HUI_ENABLED: set it to false and
   the old HUD comes back untouched, which is the whole rollback.

   Layout, by corner (styles/hud.css holds the sizes):
     bottom-left   hex portrait, skewed HP bar with a lag bar and a shield
                   overlay, thin MP / SP bars, dash pips, and the boon row
     bottom-right  both hands (active one raised, rarity-edged, with the live
                   element's badge and the known-essence dots), the E skill
                   disc and the larger X ultimate disc with radial cooldowns
     top-left      act / depth eyebrow, the biome's name, the floor modifier
     top-right     minimap (a small canvas, redrawn every few frames) + purse
     top-centre    the boss bar, only while a boss is up
     right         the momentum streak, only while one is going
     bottom-centre one contextual hint at a time, each shown once per profile

   Cost discipline: every node is built once. update() runs each drawn frame
   and only WRITES to the DOM, and only when a value actually changed (each
   node remembers what it last showed). Bars move with transform: scaleX so a
   changing number never triggers layout. Nothing here reads layout back.

   The HUD and the world labels are driven by DS.HUD.frame(g), called from the
   run's draw (src/scenes/game.js). A tiny watchdog hides everything whenever
   the current scene is not a run (menus, cutscenes, the death screen). */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  if (DS.HUI_ENABLED === undefined) DS.HUI_ENABLED = true;

  const HUI = DS.HUI;
  const el = HUI.el;

  // --- write-only helpers ----------------------------------------------------
  /* Each one caches the last value on the node itself and touches the DOM only
     on change, so a HUD at rest costs a few comparisons per frame. */

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function text(n, v) {
    v = String(v);
    if (n._t !== v) { n._t = v; n.textContent = v; }
  }
  function scaleX(n, v) {
    v = Math.round(clamp01(v) * 1000) / 1000;
    if (n._sx !== v) { n._sx = v; n.style.transform = 'scaleX(' + v + ')'; }
  }
  function flag(n, cls, on) {
    on = !!on;
    const k = '_f' + cls;
    if (n[k] !== on) { n[k] = on; n.classList.toggle(cls, on); }
  }
  function prop(n, name, v) {
    const k = '_p' + name;
    if (n[k] !== v) { n[k] = v; n.style.setProperty(name, v); }
  }
  function show(n, on) {
    on = !!on;
    if (n._show !== on) { n._show = on; n.hidden = !on; }
  }
  /* Restart a one-shot CSS animation without reading layout: alternate between
     two class names that run the same keyframes. */
  function pulse(n, cls) {
    const a = cls + '-a', b = cls + '-b';
    const next = n._pulse === a ? b : a;
    n._pulse = next;
    n.classList.remove(a, b);
    n.classList.add(next);
  }

  // --- icons -----------------------------------------------------------------

  /* One small vector glyph per element, drawn in currentColor so the same
     icon serves the weapon badge, the enemy status row and the toasts. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const GLYPHS = {
    fire: { d: 'M8 1c.6 2.6 4.6 4.4 4.6 8.4A4.6 4.6 0 0 1 3.4 9.4c0-1.9 1-3.2 2.2-4 .1 1.7.9 2.8 2 3.1C7 6.4 7.3 3.4 8 1z' },
    ice: { d: 'M8 1.5v13M2.4 4.75l11.2 6.5M13.6 4.75L2.4 11.25M6.3 2.6L8 4.2l1.7-1.6M6.3 13.4L8 11.8l1.7 1.6', stroke: 1.7 },
    lightning: { d: 'M9.6 1L3.4 9.2h4L6.3 15l6.3-8.4H8.5z' },
    poison: { d: 'M2 10.5a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0zM8.6 5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0zM10 12.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0z' },
    water: { d: 'M8 1.2C6.2 4.8 3.2 7.4 3.2 10.4a4.8 4.8 0 0 0 9.6 0C12.8 7.4 9.8 4.8 8 1.2z' },
    earth: { d: 'M5 2h6l4 6-3.2 6H4.2L1 8zM5.2 6.2l2.4 2-1 3.6M10.6 5.4L8.8 8.6', stroke: 0 },
    leaf: { d: 'M14.2 1.8C6.4 1.8 1.8 5.6 1.8 12.2l1.3 2c.9-3.8 3.7-6.6 7.4-7.7-2.7 1.9-4.4 4-5.2 6.8 6.1.1 8.9-4.6 8.9-11.5z' },
    wind: { d: 'M1.5 6h8.2a2.4 2.4 0 1 0-2.4-2.4M1.5 10h10.3a2.4 2.4 0 1 1-2.4 2.4M1.5 8h5', stroke: 1.6 }
  };

  function setGlyph(svg, key) {
    if (svg._g === key) return;
    svg._g = key;
    const g = GLYPHS[key] || GLYPHS.fire;
    const path = svg.firstChild;
    path.setAttribute('d', g.d);
    if (g.stroke) {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(g.stroke));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    } else {
      path.setAttribute('fill', 'currentColor');
      path.removeAttribute('stroke');
    }
  }

  function glyph(key, cls) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    svg.appendChild(document.createElementNS(SVGNS, 'path'));
    if (key) setGlyph(svg, key);
    return svg;
  }

  /* Element colour as a CSS value: the design-system token when there is one,
     the game's own table otherwise. */
  function elColor(key) {
    return key ? 'var(--el-' + key + ', ' + ((DS.Weapons && DS.Weapons.ELEMENTS[key] &&
      DS.Weapons.ELEMENTS[key].color) || '#fff') + ')' : '';
  }

  /* Pixel art from the sprite tables, blitted once into a small canvas. The
     canvas is re-painted only when the sprite (or crop) changes. */
  function paint(cv, spr, crop) {
    const key = spr ? (crop ? crop.join(',') : '') : '';
    if (cv._spr === spr && cv._crop === key) return;
    cv._spr = spr; cv._crop = key;
    if (!spr) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const sx = crop ? crop[0] : 0, sy = crop ? crop[1] : 0;
    const sw = crop ? crop[2] : spr.width, sh = crop ? crop[3] : spr.height;
    if (cv.width !== sw) cv.width = sw;
    if (cv.height !== sh) cv.height = sh;
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, sw, sh);
    cx.drawImage(spr, sx, sy, sw, sh, 0, 0, sw, sh);
  }

  function key(label) { return el('span', 'ui-key', { text: label }); }

  // --- build -----------------------------------------------------------------

  let root = null;
  const N = {};           // named nodes
  let visible = false;

  function build() {
    if (root) return;
    root = el('div', 'hud');
    root.hidden = true;

    // top-left: location
    N.loc = el('div', 'hud-loc');
    N.locAct = el('span', 'act');
    N.locDepth = el('span', 'depth');
    N.locTitle = el('div', 'title');
    N.locMod = el('div', 'mod');
    N.loc.appendChild(el('div', 'eyebrow', null, [N.locAct, N.locDepth]));
    N.loc.appendChild(N.locTitle);
    N.loc.appendChild(el('div', 'rule'));
    N.loc.appendChild(N.locMod);

    // top-right: minimap + purse
    N.map = el('div', 'hud-map hud-glass');
    N.mapCv = el('canvas');
    N.map.appendChild(N.mapCv);
    N.purse = el('div', 'hud-purse');
    N.coins = coin('--gold');
    N.shards = coin('--accent');
    N.keys = coin('--gold');
    N.purse.appendChild(N.coins.node);
    N.purse.appendChild(N.shards.node);
    N.purse.appendChild(N.keys.node);
    N.nav = el('div', 'hud-nav', null, [N.map, N.purse]);

    // top-centre: boss
    N.boss = el('div', 'hud-boss');
    N.bossName = el('div', 'name');
    N.bossPips = el('div', 'pips', null, [el('i'), el('i')]);
    N.bossBar = bar('hud-bar');
    N.bossAct = el('span', 'ui-label');
    N.bossRage = el('span', 'rage', { text: 'ENRAGED' });
    N.boss.appendChild(el('div', 'head', null, [N.bossName, N.bossPips]));
    N.boss.appendChild(el('div', '', { style: { position: 'relative' } }, [N.bossBar.node, el('div', 'frame')]));
    N.boss.appendChild(el('div', 'sub', null, [N.bossAct, N.bossRage]));

    // right: momentum
    N.streak = el('div', 'hud-streak');
    N.streakN = el('span', 'n');
    N.streakTier = el('div', 'tier');
    N.streakDecay = el('i');
    N.streak.appendChild(el('div', 'row', null, [el('span', 'x', { text: 'x' }), N.streakN]));
    N.streak.appendChild(N.streakTier);
    N.streak.appendChild(el('div', 'decay', null, [N.streakDecay]));

    // bottom-left: vitals
    N.vitals = el('div', 'hud-vitals');
    N.portraitCv = el('canvas');
    N.portrait = el('div', 'hud-portrait', null, [el('div', 'in', null, [N.portraitCv])]);
    N.status = el('div', 'hud-status');
    N.name = el('span', 'hud-name');
    N.hpCur = el('b');
    N.hpMax = el('span');
    N.hpShield = el('em');
    N.hp = bar('hud-bar hud-hp', true);
    N.mp = pool('mp');
    N.sp = pool('sp');
    N.dash = el('div', 'hud-dash');
    N.sp.node.appendChild(N.dash);
    N.vitals.appendChild(N.portrait);
    N.vitals.appendChild(el('div', 'hud-vbody', null, [
      N.status,
      el('div', 'hud-vhead', null, [N.name, el('span', 'hud-hpnum', null, [N.hpCur, N.hpMax, N.hpShield])]),
      N.hp.node,
      el('div', 'hud-sub', null, [N.mp.node, N.sp.node])
    ]));

    // bottom-right: arms
    N.arms = el('div', 'hud-arms');
    N.hands = el('div', 'hud-hands');
    N.hand = [hand(), hand()];
    N.swapKey = key('Q');
    N.swapKey.classList.add('swapkey');
    N.elem = el('div', 'hud-elem', null, [glyph('fire')]);
    N.ess = el('div', 'hud-ess');
    N.hands.appendChild(N.hand[0].node);
    N.hands.appendChild(N.hand[1].node);
    N.hands.appendChild(N.swapKey);
    N.hands.appendChild(N.ess);
    N.skill = skill('E', false);
    N.ult = skill('X', true);
    N.arms.appendChild(N.hands);
    N.arms.appendChild(N.skill.node);
    N.arms.appendChild(N.ult.node);

    // bottom-centre: hint
    N.hint = el('div', 'hud-hint');

    [N.loc, N.nav, N.boss, N.streak, N.vitals, N.arms, N.hint].forEach(function (n) { root.appendChild(n); });
    HUI.layer('hud').appendChild(root);

    // Sprite icons for the purse are static; paint them once.
    const S = DS.SPR;
    if (S) {
      paint(N.coins.cv, S.coin);
      paint(N.shards.cv, S.shard);
      paint(N.keys.cv, S.key);
    }
  }

  function bar(cls, shield) {
    const node = el('div', cls);
    const lag = el('i', 'lag');
    const fill = el('i', 'fill');
    node.appendChild(lag);
    node.appendChild(fill);
    let sh = null;
    if (shield) { sh = el('i', 'shield'); node.appendChild(sh); }
    node.appendChild(el('i', 'ticks'));
    return { node: node, lag: lag, fill: fill, shield: sh, lagV: 1, hold: 0 };
  }

  function pool(kind) {
    const b = bar('hud-bar');
    const num = el('span', 'num');
    const node = el('div', 'hud-pool ' + kind, null, [b.node, num]);
    return { node: node, bar: b, num: num };
  }

  function coin(color) {
    const cv = el('canvas');
    const num = el('span', 'ui-num');
    const node = el('div', 'hud-coin', { style: { '--c': 'var(' + color + ')' } }, [cv, num]);
    node.style.setProperty('--c', 'var(' + color + ')');
    return { node: node, cv: cv, num: num, last: -1 };
  }

  function hand() {
    const cv = el('canvas');
    const ammo = el('span', 'ammo');
    const node = el('div', 'hud-hand', null, [cv, ammo]);
    return { node: node, cv: cv, ammo: ammo };
  }

  function skill(label, ult) {
    const cv = el('canvas');
    const cd = el('div', 'cd');
    const left = el('div', 'left');
    const disc = el('div', 'disc', null, [cv, cd, left]);
    const cost = el('span', 'cost');
    const node = el('div', 'hud-skill' + (ult ? ' ult' : ''), null, [disc, key(label), cost]);
    return { node: node, cv: cv, cd: cd, left: left, cost: cost, wasCooling: false };
  }

  // --- per-frame update ------------------------------------------------------

  function updateLag(b, pct) {
    /* The lag bar holds where health WAS for a beat, then drains to where it
       is; a heal snaps it up at once so it never shows a phantom loss. */
    if (pct >= b.lagV) { b.lagV = pct; b.hold = 0; }
    else if (b.hold < 24) b.hold++;
    else b.lagV = Math.max(pct, b.lagV - 0.012);
    scaleX(b.fill, pct);
    scaleX(b.lag, b.lagV);
  }

  function updateVitals(g, p) {
    const maxHp = Math.max(1, p.stats.maxHp);
    const pct = clamp01(p.hp / maxHp);
    updateLag(N.hp, pct);
    text(N.hpCur, Math.max(0, Math.ceil(p.hp)));
    text(N.hpMax, '/ ' + maxHp);
    const shieldMax = p.stats.shield || 0;
    const sh = shieldMax > 0 ? Math.max(0, Math.round(p.shield || 0)) : 0;
    text(N.hpShield, sh > 0 ? '+' + sh : '');
    scaleX(N.hp.shield, shieldMax > 0 ? clamp01((p.shield || 0) / shieldMax) : 0);
    flag(N.vitals, 'is-low', pct <= 0.25 && p.hp > 0);

    const mana = Math.floor(p.mana), stam = Math.floor(p.stamina);
    scaleX(N.mp.bar.fill, p.mana / Math.max(1, p.stats.maxMana));
    scaleX(N.sp.bar.fill, p.stamina / Math.max(1, p.stats.maxStamina));
    text(N.mp.num, mana);
    text(N.sp.num, stam);

    // Dash charges as pips beside the stamina they share a key with.
    const max = (DS.Player && DS.Player.MINI_CHARGES) || 0;
    if (N.dash._n !== max) {
      N.dash._n = max;
      N.dash.textContent = '';
      for (let i = 0; i < max; i++) N.dash.appendChild(el('i'));
    }
    for (let i = 0; i < max; i++) flag(N.dash.children[i], 'on', i < p.miniLeft);

    const name = (DS.Board && DS.Board.hasName && DS.Board.hasName()) ? DS.Board.name : 'WANDERER';
    text(N.name, name);

    updatePortrait(g);
    updateBoons(g);
  }

  function updatePortrait(g) {
    const P = DS.Paperdoll;
    if (!P || !g.inv) return;
    const k = P.keyFor ? P.keyFor(g.inv.armor) : 'bare';
    if (N.portraitCv._key === k) return;
    N.portraitCv._key = k;
    const set = P.buildSet(g.inv.armor);
    const spr = set && set.idle && set.idle[0];
    if (!spr) return;
    /* Head and shoulders: the top of the idle frame, squared. The crest a
       helmet adds grows the canvas upward (set.lift), so the crop starts
       there and the face stays centred whatever is worn. */
    const lift = set.lift || 0;
    const side = Math.min(spr.width, Math.round((spr.height - lift) * 0.5) + lift);
    const x = Math.max(0, Math.round((spr.width - side) / 2));
    paint(N.portraitCv, spr, [x, 0, side, side]);
  }

  function updateBoons(g) {
    const list = (g.inv && g.inv.boons) || [];
    const sig = list.length + ':' + (list[list.length - 1] || '');
    if (N.status._sig === sig) return;
    N.status._sig = sig;
    N.status.textContent = '';
    const MAX = 10;
    const B = DS.Boons && DS.Boons.BY_KEY;
    let shown = 0;
    for (let i = 0; i < list.length && shown < MAX; i++) {
      const boon = B && B[list[i]];
      if (!boon) continue;
      const chip = el('span', 'hud-boon', { text: boon.name.charAt(0), title: boon.name });
      chip.style.setProperty('--c', boon.color);
      N.status.appendChild(chip);
      shown++;
    }
    if (list.length > shown) N.status.appendChild(el('span', 'hud-boon more', { text: '+' + (list.length - shown) }));
  }

  function updateArms(g, p) {
    const W = DS.Weapons, Inv = DS.Inv, S = DS.SPR;
    const inv = g.inv;
    const held = Inv.weapon(inv);

    for (let i = 0; i < 2; i++) {
      const h = N.hand[i];
      const it = inv.equipped[i];
      const active = i === inv.active;
      flag(h.node, 'is-active', active);
      flag(h.node, 'is-empty', !it);
      for (let r = 0; r < 5; r++) flag(h.node, 'rarity-' + r, !!it && it.rarity === r);
      if (S && it) paint(h.cv, S.itemIcon(it));
      const bow = it && W.WEAPONS[it.type] && W.WEAPONS[it.type].key === 'bow';
      text(h.ammo, bow && active ? String(inv.arrows) : '');
      flag(h.ammo, 'is-out', bow && inv.arrows <= 0);
    }
    /* The badge and the essence dots belong to the hand you are holding, so
       they move with it: appended into the active tile on a swap (rare). */
    const activeNode = N.hand[inv.active].node;
    if (N.elem.parentNode !== activeNode) activeNode.appendChild(N.elem);
    show(N.swapKey, !!inv.equipped[1 - inv.active]);

    const live = held ? W.activeElement(held) : null;
    show(N.elem, !!live);
    if (live) {
      setGlyph(N.elem.firstChild, live);
      prop(N.elem, '--elc', elColor(live));
      flag(N.elem, 'is-infused', !!held.infusion);
    }
    updateEssences(inv, live);

    if (held) {
      updateSkill(g, p, held, N.skill, 'skill');
      updateSkill(g, p, held, N.ult, 'ult');
    }
    show(N.skill.node, !!held);
    show(N.ult.node, !!held);
  }

  function updateEssences(inv, live) {
    const known = DS.Inv.essences ? DS.Inv.essences(inv) : [];
    const keys = DS.Weapons.ELEMENT_KEYS;
    show(N.ess, known.length > 0);
    if (!known.length) return;
    if (N.ess._n !== keys.length) {
      N.ess._n = keys.length;
      N.ess.textContent = '';
      for (let k = 0; k < keys.length; k++) {
        const dot = el('i');
        dot.style.setProperty('--elc', elColor(keys[k]));
        N.ess.appendChild(dot);
      }
    }
    for (let k = 0; k < keys.length; k++) {
      flag(N.ess.children[k], 'on', known.indexOf(keys[k]) >= 0);
      flag(N.ess.children[k], 'cur', keys[k] === live);
    }
  }

  function updateSkill(g, p, item, s, which) {
    const Sk = DS.Skills;
    const cd = which === 'skill' ? p.skillCooldown : p.ultCooldown;
    const max = which === 'skill' ? Sk.SKILL_COOLDOWN : Sk.ULT_COOLDOWN;
    const base = which === 'skill' ? Sk.SKILL_COST : Sk.ULT_COST;
    const cost = Math.round(base * (1 - (p.stats.skillDiscount || 0)));
    const cooling = cd > 0;
    const poor = !cooling && p.mana < cost;
    const ready = !cooling && !poor;

    if (DS.SPR) paint(s.cv, DS.SPR.skillIcon(item.type, which));
    prop(s.node, '--rarity', 'var(--r-' + (['common', 'uncommon', 'rare', 'epic', 'legendary'][item.rarity] || 'common') + ')');
    flag(s.node, 'is-cooling', cooling);
    flag(s.node, 'is-poor', poor);
    flag(s.node, 'is-ready', ready);
    prop(s.cd, '--cd', cooling ? (Math.round(clamp01(cd / max) * 200) / 200).toString() : '0');
    text(s.left, cooling ? String(Math.ceil(cd / 60)) : '');
    text(s.cost, poor ? String(cost) : '');
    show(s.cost, poor);
    if (s.wasCooling && !cooling && !poor) pulse(s.node, 'is-flash');
    s.wasCooling = cooling;
  }

  function updateLocation(g) {
    const A = DS.Acts;
    const endless = A && A.isEndless(g.depth);
    let act = A ? (endless ? 'ENDLESS' : 'ACT ' + A.roman(A.actOf(g.depth))) : 'DEPTH';
    let depth = A ? (endless ? String(g.depth) : A.depthInAct(g.depth) + ' / ' + DS.C.ACT_LENGTH) : String(g.depth);
    let title = (g.biome && g.biome.name) || '';
    if (g.levelKind === 'safe') title = 'Safe Room';
    else if (g.levelKind === 'trial') title = 'The Trial';
    else if (g.levelKind === 'boss') { depth = depth + '  ·  BOSS'; }
    text(N.locAct, act);
    text(N.locDepth, depth);
    text(N.locTitle, title);
    const mod = g.modifier;
    show(N.locMod, !!mod);
    if (mod) {
      text(N.locMod, mod.name);
      prop(N.locMod, '--c', mod.color || '#fff');
    }
  }

  function updatePurse(g) {
    setCoin(N.coins, g.inv.coins, true);
    setCoin(N.shards, g.inv.shards, true);
    setCoin(N.keys, g.inv.keys, g.inv.keys > 0);
  }
  function setCoin(c, v, on) {
    show(c.node, on);
    if (c.last !== v) {
      if (c.last >= 0 && v > c.last) pulse(c.node, 'is-bump');
      c.last = v;
      text(c.num, v);
    }
  }

  const BOSS_WAKE_PX = 260;

  function updateBoss(g) {
    const b = g.boss;
    /* The bar belongs to a fight, not to a boss that merely exists: a Warden
       standing at the far end of its arena has not noticed you yet. It appears
       once the boss is hurt, is doing something, or you come within earshot,
       and then stays for the rest of the fight. */
    if (b && !b.hudEngaged && !b.dead) {
      const p = g.player;
      const near = p && Math.abs(DS.Ent.centerX(p) - DS.Ent.centerX(b)) < BOSS_WAKE_PX;
      if (b.hp < b.maxHp || near || (b.state && b.state !== 'INTRO' && b.state !== 'IDLE')) b.hudEngaged = true;
    }
    const on = !!(b && !b.dead && b.maxHp && b.hudEngaged);
    show(N.boss, on);
    if (!on) { N.bossBar.lagV = 1; return; }
    text(N.bossName, b.name || 'THE KING');
    prop(N.boss, '--bc', b.barColor || '#c86ee0');
    updateLag(N.bossBar, clamp01(b.hp / b.maxHp));
    const phase = b.phase || 1;
    flag(N.bossPips.children[0], 'on', true);
    flag(N.bossPips.children[1], 'on', phase >= 2);
    text(N.bossAct, DS.Acts ? DS.Acts.label(g.depth) : '');
    const rage = phase >= 2;
    flag(N.boss, 'is-rage', rage);
    show(N.bossRage, rage);
  }

  function updateStreak(g) {
    const on = g.streak >= 2 && DS.Boons && DS.Boons.tier;
    show(N.streak, on);
    if (!on) { N.streak._n = 0; return; }
    const tier = DS.Boons.tier(g.streak);
    if (N.streak._n !== g.streak) {
      if (g.streak > (N.streak._n || 0)) pulse(N.streak, 'is-bump');
      N.streak._n = g.streak;
      text(N.streakN, g.streak);
    }
    const bonus = Math.round(DS.Boons.bonus(g) * 100);
    text(N.streakTier, (tier.label || 'MOMENTUM') + (bonus > 0 ? '  +' + bonus + '%' : ''));
    prop(N.streak, '--tc', tier.color || 'var(--gold)');
    scaleX(N.streakDecay, g.streakTimer / DS.Boons.DECAY_FRAMES);
  }

  // --- minimap ---------------------------------------------------------------

  /* The level baked once, one pixel per tile, and a window of it drawn around
     the hero every MAP_EVERY frames. Terrain edges are brighter than solid
     rock so the shape of the floor reads at a glance; markers are dots. */
  const MAP_EVERY = 8;
  const MAP_VIEW = { w: 66, h: 25 };      // the most tiles shown (a side-scroller's strip)
  const MAP_MIN_ROWS = 12;                // ... and the fewest rows, however flat the floor
  const MAP_PAD = 3;                      // rows of margin around the floor's own extent
  const MAP_TILE = {
    1: 'rgba(90, 110, 160, 0.42)', 2: 'rgba(200, 225, 255, 0.75)', 3: '#ff4d6d', 5: '#ff4d6d',
    4: '#6fd3ff', 6: 'rgba(63, 169, 255, 0.5)', 7: 'rgba(242, 198, 109, 0.8)'
  };
  let bake = null, bakeMap = null, mapTick = 0;

  function bakeLevel(map) {
    const cv = document.createElement('canvas');
    cv.width = map.w; cv.height = map.h;
    const cx = cv.getContext('2d');
    const data = map.data;
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = data[y * map.w + x];
        if (!t) continue;
        let col = MAP_TILE[t];
        if (t === 1) {
          // A wall touching open space is the floor's outline: draw it bright.
          const open = (y > 0 && data[(y - 1) * map.w + x] !== 1) ||
                       (y < map.h - 1 && data[(y + 1) * map.w + x] !== 1) ||
                       (x > 0 && data[y * map.w + x - 1] !== 1) ||
                       (x < map.w - 1 && data[y * map.w + x + 1] !== 1);
          if (open) col = 'rgba(190, 212, 255, 0.85)';
        }
        if (!col) continue;
        cx.fillStyle = col;
        cx.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  function updateMap(g) {
    const map = g.map;
    if (!map || !map.data) return;
    if (bakeMap !== map) { bake = bakeLevel(map); bakeMap = map; mapTick = 0; }
    const f = HUI.frame;
    const W = Math.max(1, Math.round(182 * f.s)), H = Math.max(1, Math.round(68 * f.s));
    const cv = N.mapCv;
    let resized = false;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; resized = true; }
    if (!resized && (mapTick++ % MAP_EVERY) !== 0) return;

    const T = DS.C.TILE, p = g.player;
    const ptx = (p.x + p.w / 2) / T, pty = (p.y + p.h / 2) / T;
    /* Fit the window to the floor, not to a fixed box. A flat floor has
       walls on two or three rows and nothing else, so the fixed 66x25 view
       drew a thin line in an empty frame. The view now shrinks to the rows
       that hold anything near the hero (plus the hero's own row and a margin),
       and the scale comes up to match, so the shape fills the panel. */
    let vw = Math.min(MAP_VIEW.w, map.w), vh = Math.min(MAP_VIEW.h, map.h);
    let ox = Math.max(0, Math.min(map.w - vw, ptx - vw / 2));
    /* The floor's extent is where the SURFACE runs -- the first solid tile in
       each column -- plus a little rock under the lowest of them, not the solid
       fill all the way to the bottom of the map. */
    let top = Math.floor(pty), bot = Math.floor(pty);
    const x0 = Math.floor(ox), x1 = Math.min(map.w, Math.ceil(ox + vw));
    for (let x = x0; x < x1; x++) {
      for (let y = 0; y < map.h; y++) {
        if (map.data[y * map.w + x]) { if (y < top) top = y; if (y + 3 > bot) bot = y + 3; break; }
      }
    }
    const rows = Math.max(MAP_MIN_ROWS, Math.min(vh, bot - top + 1 + 2 * MAP_PAD));
    vh = rows;
    // The window is as tall as the panel allows at this row count, then as wide.
    const kFit = H / vh;
    vw = Math.min(map.w, Math.min(MAP_VIEW.w, W / kFit));
    ox = Math.max(0, Math.min(map.w - vw, ptx - vw / 2));
    const mid = (top + bot) / 2;
    /* Not clamped to the map: a floor that runs along the bottom edge should
       still sit in the middle of the panel, with empty space under it. */
    const oy = Math.max(pty - vh + 2, Math.min(pty - 1, mid - vh / 2));   // ...but the hero's row always stays inside
    const k = Math.min(W / vw, H / vh);
    const offX = (W - vw * k) / 2, offY = (H - vh * k) / 2;

    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, W, H);
    cx.imageSmoothingEnabled = false;
    cx.drawImage(bake, offX - ox * k, offY - oy * k, map.w * k, map.h * k);

    function dot(wx, wy, r, color, square) {
      const sx = offX + (wx / T - ox) * k, sy = offY + (wy / T - oy) * k;
      if (sx < -r || sy < -r || sx > W + r || sy > H + r) return;
      cx.fillStyle = color;
      if (square) cx.fillRect(sx - r, sy - r, r * 2, r * 2);
      else { cx.beginPath(); cx.arc(sx, sy, r, 0, Math.PI * 2); cx.fill(); }
    }
    const u = Math.max(1, f.s);
    for (let i = 0; i < g.chests.length; i++) {
      const c = g.chests[i];
      if (!c.opened) dot(c.x + c.w / 2, c.y + c.h / 2, 2.2 * u, '#f2c66d', true);
    }
    if (g.doorPos) dot(g.doorPos.x + 8, g.doorPos.y + 8, 2.6 * u, '#6fd3ff', true);
    if (g.shrine && !g.shrine.used) dot(g.shrine.x + 8, g.shrine.y + 8, 2.4 * u, '#c86ee0');
    if (g.merchantPos) dot(g.merchantPos.x + 4, g.merchantPos.y + 8, 2.4 * u, '#f2c66d');
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;
      dot(e.x + e.w / 2, e.y + e.h / 2, (e.isBoss ? 3.4 : e.tier && e.tier !== 'normal' ? 2.4 : 1.7) * u,
          e.isBoss ? '#ff4d6d' : '#ff6b81');
    }
    // The hero: a lit dot with a halo, drawn last so nothing covers it.
    const hx = p.x + p.w / 2, hy = p.y + p.h / 2;
    dot(hx, hy, 4.6 * u, 'rgba(111, 211, 255, 0.28)');
    dot(hx, hy, 2.4 * u, '#ffffff');
  }

  // --- one-time contextual hints --------------------------------------------

  /* Each hint is a line of [keys] + words, shown once per profile and never
     again. They replace the big control sheet that used to cover the screen at
     the start of every run: a hint appears only when the thing it explains is
     in front of you. */
  const HINT_FRAMES = 60 * 5;
  const HINT_GAP = 60 * 2;
  const HINTS = [
    { id: 'move', parts: [[['A', 'D'], 'Move'], [['SPACE'], 'Jump ×2']],
      when: function (g) { return g.frames > 50; } },
    { id: 'attack', parts: [[['J'], 'Attack'], [null, 'chain hits into combos']],
      when: function (g, c) { return c.enemyNear; } },
    { id: 'dash', parts: [[['SHIFT'], 'Dash'], [['RMB'], 'Quick-step through attacks']],
      when: function (g, c) { return c.seen.attack && c.enemyNear; } },
    { id: 'skill', parts: [[['E'], 'Skill'], [['X'], 'Ultimate']],
      when: function (g, c) { return c.seen.dash && c.enemyNear && g.player.skillCooldown <= 0; } },
    { id: 'climb', parts: [[['W', 'S'], 'Climb'], [['SPACE'], 'Let go']],
      when: function (g, c) { return c.ropeNear; } },
    { id: 'swim', parts: [[['SPACE'], 'Hold to swim'], [null, 'watch your breath']],
      when: function (g) { return g.player.inWater; } },
    { id: 'infuse', parts: [[['R'], 'Infuse element'], [['T'], 'Back']],
      when: function (g) { return DS.Inv.essences && DS.Inv.essences(g.inv).length > 0; } },
    { id: 'swap', parts: [[['Q'], 'Swap weapon']],
      when: function (g) { return !!(g.inv.equipped[0] && g.inv.equipped[1]); } },
    { id: 'bag', parts: [[['TAB'], 'Bag'], [null, 'equip, salvage, compare']],
      when: function (g) { return g.inv.bag && g.inv.bag.length > 0; } },
    { id: 'menu', parts: [[['ESC'], 'Menu'], [null, 'controls are in there']],
      when: function (g) { return g.frames > 60 * 40; } }
  ];

  let seen = null;
  const hint = { cur: null, t: 0, gap: 0, tick: 0 };

  function hintKey() {
    const who = (DS.Board && DS.Board.hasName && DS.Board.hasName()) ? DS.Board.name : 'default';
    return 'ds_hints:' + who;
  }
  function loadSeen() {
    if (seen) return seen;
    seen = {};
    try {
      const raw = window.localStorage.getItem(hintKey());
      if (raw) seen = JSON.parse(raw) || {};
    } catch (e) { seen = {}; }
    return seen;
  }
  function saveSeen() {
    try { window.localStorage.setItem(hintKey(), JSON.stringify(seen)); } catch (e) { /* private mode: hints just repeat */ }
  }

  function renderHint(h) {
    N.hint.textContent = '';
    N.hint.appendChild(el('span', 'tip', { text: 'TIP' }));
    for (let i = 0; i < h.parts.length; i++) {
      if (i > 0) N.hint.appendChild(el('span', 'sep'));
      const part = el('span', 'part');
      const keys = h.parts[i][0];
      if (keys) for (let k = 0; k < keys.length; k++) part.appendChild(key(keys[k]));
      part.appendChild(el('span', '', { text: h.parts[i][1] }));
      N.hint.appendChild(part);
    }
  }

  function hintContext(g) {
    const p = g.player;
    const px = p.x + p.w / 2, py = p.y + p.h / 2;
    let enemyNear = false;
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;
      const dx = e.x + e.w / 2 - px, dy = e.y + e.h / 2 - py;
      if (dx * dx + dy * dy < 110 * 110) { enemyNear = true; break; }
    }
    let ropeNear = false;
    const map = g.map, T = DS.C.TILE;
    if (map && map.get) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      for (let y = ty - 2; y <= ty + 2 && !ropeNear; y++) {
        for (let x = tx - 2; x <= tx + 2; x++) if (map.get(x, y) === 7) { ropeNear = true; break; }
      }
    }
    return { enemyNear: enemyNear, ropeNear: ropeNear, seen: seen };
  }

  function updateHints(g) {
    if (DS.Settings && DS.Settings.get('game', 'hints') === false) {
      if (hint.cur) { hint.cur = null; flag(N.hint, 'is-on', false); }
      return;
    }
    loadSeen();
    if (hint.cur) {
      if (--hint.t <= 0) { hint.cur = null; hint.gap = HINT_GAP; flag(N.hint, 'is-on', false); }
      return;
    }
    if (hint.gap > 0) { hint.gap--; return; }
    if ((hint.tick++ % 10) !== 0 || g.modal || g.paused) return;
    const ctx = hintContext(g);
    for (let i = 0; i < HINTS.length; i++) {
      const h = HINTS[i];
      if (seen[h.id] || !h.when(g, ctx)) continue;
      seen[h.id] = 1;
      saveSeen();
      hint.cur = h;
      hint.t = HINT_FRAMES;
      renderHint(h);
      flag(N.hint, 'is-on', true);
      return;
    }
  }

  // --- the full controls sheet ------------------------------------------------

  const CONTROLS = [
    [['A', 'D'], 'Move'], [['SPACE'], 'Jump / double jump'],
    [['J'], 'Attack (LMB)'], [['SHIFT'], 'Dash'],
    [['E'], 'Weapon skill'], [['X'], 'Ultimate'],
    [['RMB'], 'Quick-step'], [['F'], 'Interact'],
    [['Q'], 'Swap weapon'], [['R', 'T'], 'Infuse element'],
    [['W', 'S'], 'Climb rope'], [['TAB'], 'Bag'],
    [['ESC'], 'Menu'], [['F6'], 'Camera preset']
  ];
  let sheet = null, sheetTimer = 0;

  /* The rows as the player has the keys set now (DS.Input.controlGroups), flat. */
  function liveControls() {
    if (!DS.Input || !DS.Input.controlGroups) return CONTROLS;
    const out = [];
    DS.Input.controlGroups().forEach(function (grp) { grp.rows.forEach(function (r) { out.push(r); }); });
    return out;
  }

  function showControls() {
    build();
    if (!sheet) {
      sheet = el('div', 'hud-controls ui-panel ui-interactive');
      sheet.appendChild(el('div', 'ui-title', { text: 'Controls' }));
      sheet.grid = el('div', 'grid');
      sheet.appendChild(sheet.grid);
      sheet.appendChild(el('div', 'foot', { text: 'Click to close' }));
      sheet.addEventListener('click', hideControls);
      HUI.layer('overlay').appendChild(sheet);
    }
    const rows = liveControls();
    while (sheet.grid.firstChild) sheet.grid.removeChild(sheet.grid.firstChild);
    for (let i = 0; i < rows.length; i++) {
      const keys = el('span', 'keys');
      for (let k = 0; k < rows[i][0].length; k++) keys.appendChild(key(rows[i][0][k]));
      sheet.grid.appendChild(keys);
      sheet.grid.appendChild(el('span', 'lbl', { text: rows[i][1] }));
    }
    sheet.hidden = false;
    sheetTimer = performance.now() + 15000;
    return sheet;
  }
  function hideControls() { if (sheet) sheet.hidden = true; }

  // --- frame entry -------------------------------------------------------------

  const perf = { n: 0, total: 0, max: 0 };

  function setVisible(on) {
    if (visible === on) return;
    visible = on;
    if (root) root.hidden = !on;
  }

  function update(g) {
    const p = g.player;
    if (!p || !g.inv) { setVisible(false); return; }
    const on = !g.modal && !g.paused && !(p.dead && g.deathTimer > 20);
    setVisible(on);
    if (!on) return;
    updateVitals(g, p);
    updateArms(g, p);
    updateLocation(g);
    updatePurse(g);
    updateBoss(g);
    updateStreak(g);
    updateMap(g);
    updateHints(g);
  }

  /* Called once per drawn frame by the run (src/scenes/game.js draw). */
  function frame(g) {
    if (!DS.HUI_ENABLED) { hideAll(); return; }
    const t0 = performance.now();
    build();
    update(g);
    if (DS.World) DS.World.update(g);
    if (DS.Notify) DS.Notify.update(g);
    if (sheet && !sheet.hidden && performance.now() > sheetTimer) hideControls();
    const dt = performance.now() - t0;
    perf.n++; perf.total += dt; if (dt > perf.max) perf.max = dt;
  }

  function hideAll() {
    setVisible(false);
    if (DS.World) DS.World.hide();
    if (DS.Notify) DS.Notify.hide();
  }

  /* The watchdog: a run draws the HUD each frame; nothing else does. When the
     scene is not a run, the layers are hidden rather than left frozen. */
  function watchdog() {
    requestAnimationFrame(watchdog);
    const sc = DS.currentScene;
    if (!sc || !sc.g) { hideAll(); hideControls(); }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(watchdog);

  DS.HUD = {
    frame: frame,
    hideAll: hideAll,
    showControls: showControls,
    hideControls: hideControls,
    /* Forget which one-time hints this profile has seen. */
    resetHints: function () { seen = {}; saveSeen(); },
    glyph: glyph,
    setGlyph: setGlyph,
    elColor: elColor,
    paint: paint,
    stats: function () {
      return { frames: perf.n, avgMs: perf.n ? +(perf.total / perf.n).toFixed(3) : 0, maxMs: +perf.max.toFixed(3) };
    },
    // Write-only helpers, shared with world.js and notify.js.
    w: { text: text, scaleX: scaleX, flag: flag, prop: prop, show: show, pulse: pulse }
  };
})(window.DS);
