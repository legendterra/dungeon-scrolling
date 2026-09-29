/* In-world UI (v6): everything glued to a point in the level, in HTML.

     prompt     one chip over whatever F would use: [F] VERB · Name, the name
                in its rarity colour. Data comes from describe() in
                src/scenes/game.js (g.prompt), which now also says where the
                thing is (anchor) and what to call it (verb / name / rarity).
     drops      the name of every item on the floor near you (and every epic or
                better anywhere on screen), with a ▲ / ▼ against what you hold
                once you are close enough to care.
     enemies    a thin HP bar over anything hurt, elite or carrying a status;
                a name only for elites and up; element status glyphs.
     numbers    the DS.FX floating numbers, restyled: damage pops and arcs,
                crits are bigger, gold and tilted, heals green, reactions are
                stamped tags. Same pool, same lifetimes, same world positions
                (src/systems/particles.js owns the simulation; this only draws).
     hero       the player's name and, under water, a breath bar.

   Every node is pooled and positioned with transform: translate3d, projected
   through the live 3D camera (DS.R3D.worldToScreen) and DS.HUI.fromLogical.
   Nothing reads layout; every write is skipped when the value is unchanged. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const HUI = DS.HUI;
  const el = HUI.el;

  const NUMBERS = 64;
  const ENEMY_BARS = 20;
  const DROPS = 10;
  const DROP_RANGE = 120;       // level px: names show inside this
  const COMPARE_RANGE = 64;     // and the ▲ / ▼ inside this
  const RARITY_KEYS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  let root = null;
  let visible = false;
  let W = null;                 // DS.HUD.w write helpers

  const pt = { x: 0, y: 0, k: 1 };
  const px = { x: 0, y: 0 };

  /* Level pixels -> CSS pixels inside the frame. Returns false when the point
     is well off screen, so callers can hide instead of placing. */
  function project(wx, wy) {
    const R3D = DS.R3D;
    if (R3D && R3D.isEnabled && R3D.worldToScreen) R3D.worldToScreen(wx, wy, pt);
    else { pt.x = DS.R.toScreenX(wx, wy); pt.y = DS.R.toScreenY(wy, wx); pt.k = 1; }
    HUI.fromLogical(pt.x, pt.y, px);
    const f = HUI.frame;
    return px.x > -80 && px.y > -80 && px.x < f.w + 80 && px.y < f.h + 80;
  }

  function place(n, x, y, extra) {
    const v = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)' + (extra || '');
    if (n._tr !== v) { n._tr = v; n.style.transform = v; }
  }
  /* SVG nodes have no `hidden` property; display is the switch there. */
  function svgShow(n, on) {
    on = !!on;
    if (n._show !== on) { n._show = on; n.style.display = on ? '' : 'none'; }
  }
  function opacity(n, a) {
    a = Math.round(a * 50) / 50;
    if (n._op !== a) { n._op = a; n.style.opacity = String(a); }
  }

  // --- build -----------------------------------------------------------------

  const P = {};

  function build() {
    if (root) return;
    W = DS.HUD.w;
    root = el('div', 'wld');
    root.hidden = true;

    P.hero = anchor('wh');
    P.heroName = el('div', 'name');
    P.breath = el('div', 'breath', null, [el('i')]);
    P.hero.body.appendChild(P.heroName);
    P.hero.body.appendChild(P.breath);

    P.enemies = [];
    for (let i = 0; i < ENEMY_BARS; i++) P.enemies.push(enemyBar());

    P.drops = [];
    for (let i = 0; i < DROPS; i++) P.drops.push(dropLabel());

    P.prompt = anchor('wp');
    P.promptKey = el('span', 'ui-key');
    P.promptVerb = el('span', 'verb');
    P.promptName = el('span', 'nm');
    P.promptCmp = el('span', 'cmp');
    [P.promptKey, P.promptVerb, el('span', 'dot'), P.promptName, P.promptCmp].forEach(function (n) {
      P.prompt.body.appendChild(n);
    });

    P.numbers = [];
    for (let i = 0; i < NUMBERS; i++) {
      const n = el('div', 'wn');
      const t = el('span', 't');
      n.appendChild(t);
      n.hidden = true;
      n._show = false;
      root.appendChild(n);
      P.numbers.push({ node: n, text: t, serial: -1, rot: 0, kind: '' });
    }

    HUI.layer('world').appendChild(root);
  }

  function anchor(cls) {
    const node = el('div', 'w-at ' + cls);
    const body = el('div', 'w-body');
    node.appendChild(body);
    node.hidden = true;
    node._show = false;
    root.appendChild(node);
    return { node: node, body: body };
  }

  function enemyBar() {
    const a = anchor('wb');
    const name = el('div', 'name');
    const lag = el('i', 'lag');
    const fill = el('i', 'fill');
    const bar = el('div', 'bar', null, [lag, fill]);
    const st = el('div', 'st');
    const icons = [];
    for (let i = 0; i < 4; i++) {
      const g = DS.HUD.glyph('fire');
      st.appendChild(g);
      icons.push(g);
    }
    a.body.appendChild(name);
    a.body.appendChild(bar);
    a.body.appendChild(st);
    return { node: a.node, body: a.body, name: name, lag: lag, fill: fill, icons: icons, ent: null, lagV: 1, hold: 0 };
  }

  function dropLabel() {
    const a = anchor('wd');
    const name = el('span', 'nm');
    const cmp = el('span', 'cmp');
    a.body.appendChild(el('i', 'gem'));
    a.body.appendChild(name);
    a.body.appendChild(cmp);
    return { node: a.node, body: a.body, name: name, cmp: cmp };
  }

  // --- pieces ----------------------------------------------------------------

  function rarityClass(n, r) {
    for (let i = 0; i < 5; i++) W.flag(n, 'rarity-' + i, r === i);
  }

  /* ▲ / ▼ against what the item would replace: damage for a weapon (against
     the hand you hold), shield for armour (against that slot). */
  function compare(g, item) {
    if (!item || !item.stats) return null;
    if (DS.Armor && DS.Armor.isArmor(item)) {
      const worn = g.inv.armor[item.slot];
      return (item.stats.shield || 0) - (worn ? worn.stats.shield || 0 : 0);
    }
    const held = DS.Inv.weapon(g.inv);
    if (!held || !held.stats) return item.stats.damage || 0;
    return (item.stats.damage || 0) - (held.stats.damage || 0);
  }

  function setCompare(n, delta) {
    if (delta == null) { W.text(n, ''); return; }
    W.text(n, delta > 0 ? '▲' + delta : delta < 0 ? '▼' + (-delta) : '=');
    W.flag(n, 'up', delta > 0);
    W.flag(n, 'down', delta < 0);
  }

  function updatePrompt(g) {
    const pr = g.prompt;
    const a = P.prompt;
    const on = !!(pr && pr.anchor) && project(pr.anchor.x, pr.anchor.y);
    if (on) {
      W.text(P.promptKey, pr.key || 'F');
      W.text(P.promptVerb, pr.verb || pr.text || '');
      W.text(P.promptName, pr.name || '');
      W.flag(a.body, 'has-name', !!pr.name);
      W.flag(a.body, 'is-warn', pr.key === '!');
      rarityClass(a.body, pr.rarity == null ? -1 : pr.rarity);
      setCompare(P.promptCmp, pr.item ? compare(g, pr.item) : null);
      place(a.node, px.x, px.y);
      W.show(a.node, true);
    }
    W.flag(a.body, 'is-on', on);
    // Kept on screen while it fades out, then hidden for real.
    if (!on) {
      if (!a.node._fade) a.node._fade = 14;
      if (--a.node._fade <= 0) W.show(a.node, false);
    } else a.node._fade = 0;
  }

  function updateDrops(g) {
    const p = g.player;
    const hx = p.x + p.w / 2, hy = p.y + p.h / 2;
    const skip = g.prompt && g.prompt.target;
    let used = 0;
    for (let i = 0; i < g.pickups.length && used < DROPS; i++) {
      const it = g.pickups[i];
      if (it.kind !== 'item' || !it.item || it === skip) continue;
      const cx = it.x + it.w / 2;
      const dx = cx - hx, dy = it.y - hy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const r = it.item.rarity || 0;
      if (d > DROP_RANGE && r < 3) continue;
      // Matches the drop's own expiry blink rather than floating over a ghost.
      if (it.life < 60 && Math.floor(it.life / 5) % 2 === 0) continue;
      if (!project(cx, it.y - 3)) continue;
      const lab = P.drops[used++];
      W.text(lab.name, it.item.name);
      rarityClass(lab.body, r);
      setCompare(lab.cmp, d < COMPARE_RANGE ? compare(g, it.item) : null);
      opacity(lab.node, d > DROP_RANGE ? 0.8 : 1);
      place(lab.node, px.x, px.y);
      W.show(lab.node, true);
    }
    for (let i = used; i < DROPS; i++) W.show(P.drops[i].node, false);
  }

  const STATUS = [
    ['burn', 'fire'], ['frozen', 'ice'], ['chill', 'ice'], ['shock', 'lightning'],
    ['wet', 'water'], ['poison', 'poison'], ['brittle', 'earth'], ['root', 'leaf'], ['blind', 'wind']
  ];
  const statusBuf = [];

  function statuses(e) {
    statusBuf.length = 0;
    const s = e.status;
    if (!s) return statusBuf;
    for (let i = 0; i < STATUS.length && statusBuf.length < 4; i++) {
      if (!(s[STATUS[i][0]] > 0)) continue;
      const g = STATUS[i][1];
      if (statusBuf.indexOf(g) < 0) statusBuf.push(g);
    }
    return statusBuf;
  }

  function enemyName(e) {
    const kind = String(e.kind || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    const nice = kind.charAt(0).toUpperCase() + kind.slice(1);
    if (e.tier === 'elite') return 'Elite ' + nice;
    if (e.tier === 'miniboss') return 'Champion ' + nice;
    if (e.tier === 'colossal') return 'Colossal ' + nice;
    return nice;
  }

  function updateEnemies(g) {
    let used = 0;
    for (let i = 0; i < g.enemies.length && used < ENEMY_BARS; i++) {
      const e = g.enemies[i];
      if (e.dead || e.isBoss || !e.maxHp) continue;
      const tiered = e.tier && e.tier !== 'normal';
      const st = statuses(e);
      if (e.hp >= e.maxHp && !tiered && !st.length) continue;
      const head = e.y - (e.bodyOffY || 0) + 1;
      if (!project(e.x + e.w / 2, head)) continue;

      const b = P.enemies[used++];
      if (b.ent !== e) {
        b.ent = e; b.lagV = e.hp / e.maxHp; b.hold = 0;
        W.text(b.name, tiered ? enemyName(e) : '');
        W.flag(b.body, 'is-elite', e.tier === 'elite');
        W.flag(b.body, 'is-major', e.tier === 'miniboss' || e.tier === 'colossal');
      }
      const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
      if (pct >= b.lagV) { b.lagV = pct; b.hold = 0; }
      else if (b.hold < 20) b.hold++;
      else b.lagV = Math.max(pct, b.lagV - 0.02);
      W.scaleX(b.fill, pct);
      W.scaleX(b.lag, b.lagV);
      for (let k = 0; k < 4; k++) {
        const on = k < st.length;
        svgShow(b.icons[k], on);
        if (on) {
          DS.HUD.setGlyph(b.icons[k], st[k]);
          W.prop(b.icons[k], 'color', DS.HUD.elColor(st[k]));
        }
      }
      W.flag(b.body, 'is-full', e.hp >= e.maxHp);
      place(b.node, px.x, px.y);
      W.show(b.node, true);
    }
    for (let i = used; i < ENEMY_BARS; i++) { W.show(P.enemies[i].node, false); P.enemies[i].ent = null; }
  }

  function updateHero(g) {
    const p = g.player;
    const named = !!(DS.Board && DS.Board.hasName && DS.Board.hasName());
    const maxBreath = 60 * 14;
    const breathing = p.inWater || p.breath < maxBreath;
    if ((!named && !breathing) || p.dead || !project(p.x + p.w / 2, p.y - 6)) {
      W.show(P.hero.node, false);
      return;
    }
    const hx = px.x, hy = px.y;
    /* The prompt chip only pushes the name aside when it is actually on top of
       it. A chest three screens away used to hide the name for as long as the
       prompt was up. */
    if (!breathing && g.prompt && g.prompt.anchor && project(g.prompt.anchor.x, g.prompt.anchor.y)) {
      const s = HUI.frame.s || 1;
      if (Math.abs(px.x - hx) < 130 * s && Math.abs(px.y - hy) < 70 * s) {
        W.show(P.hero.node, false);
        return;
      }
    }
    px.x = hx; px.y = hy;
    W.text(P.heroName, named ? DS.Board.name : '');
    W.show(P.breath, breathing);
    if (breathing) {
      const pct = Math.max(0, Math.min(1, p.breath / maxBreath));
      W.scaleX(P.breath.firstChild, pct);
      W.flag(P.breath, 'is-low', pct < 0.3);
    }
    place(P.hero.node, px.x, px.y);
    W.show(P.hero.node, true);
  }

  // --- floating numbers ------------------------------------------------------

  function isReaction(t) {
    if (DS.FX3D && DS.FX3D.isReactionName && DS.FX3D.isReactionName(t)) return true;
    return /^[A-Z][A-Z ]{3,}$/.test(t) && t !== 'BLOCK' && t !== 'KEY';
  }

  /* What kind of number this is, decided once when it spawns. The FX layer
     only knows text, colour and scale, which is enough to tell them apart. */
  function classify(n) {
    const t = n.text;
    const col = String(n.color || '').toLowerCase();
    if (/^\d+$/.test(t)) {
      if (n.scale >= 2) return 'crit';
      if (col === '#e8743b' || col === '#5cbf62') return 'dot';
      return 'dmg';
    }
    if (t.charAt(0) === '-') return 'hurt';
    if (t.charAt(0) === '+') {
      return (col === '#c0303c' || col === '#5cbf62' || col === '#a3e86b') ? 'heal' : 'gain';
    }
    if (isReaction(t)) return 'react';
    return 'label';
  }

  function updateNumbers() {
    const list = DS.FX && DS.FX.numbers;
    if (!list) return;
    for (let i = 0; i < NUMBERS; i++) {
      const slot = P.numbers[i];
      const n = list[i];
      if (!n || n.life <= 0) { if (slot.node._show) W.show(slot.node, false); continue; }
      if (slot.serial !== n.serial) {
        slot.serial = n.serial;
        slot.kind = classify(n);
        slot.node.className = 'wn k-' + slot.kind + (n.hint ? ' has-el' : '');
        slot.node._show = false;
        slot.node.hidden = true;
        slot.text.textContent = n.text;
        const c = n.hint ? DS.HUD.elColor(n.hint) : (slot.kind === 'dmg' || slot.kind === 'crit' ? '' : n.color);
        slot.node.style.setProperty('--c', c || '#ffffff');
        slot.rot = slot.kind === 'crit' ? (Math.random() * 14 - 7) : 0;
      }
      /* Hits land on the body, not over the name tag: damage numbers are drawn
         a little lower than the FX layer spawns them (its point is the top of
         the hitbox, where the enemy's bar and name now sit). */
      const drop = slot.kind === 'crit' ? 28 : ((slot.kind === 'dmg' || slot.kind === 'dot') ? 16 : 0);
      if (!project(n.x, n.y + drop)) { W.show(slot.node, false); continue; }
      const max = n.max || 45;
      const t = 1 - n.life / max;
      let s = 1;
      if (slot.kind === 'crit') s = t < 0.12 ? 1.6 - t / 0.12 * 0.6 : 1;
      else if (slot.kind === 'react') s = t < 0.1 ? 0.55 + t / 0.1 * 0.45 : 1 + (t - 0.1) * 0.06;
      else s = t < 0.1 ? 1.45 - t / 0.1 * 0.45 : 1;
      const a = n.life < 14 ? n.life / 14 : 1;
      place(slot.node, px.x, px.y,
        (slot.rot ? ' rotate(' + slot.rot.toFixed(1) + 'deg)' : '') + ' scale(' + s.toFixed(3) + ')');
      opacity(slot.node, a);
      W.show(slot.node, true);
    }
  }

  // --- entry -------------------------------------------------------------------

  function setVisible(on) {
    if (visible === on) return;
    visible = on;
    if (root) root.hidden = !on;
  }

  function update(g) {
    build();
    const p = g.player;
    const on = !!p && !g.modal && !g.paused && !(p.dead && g.deathTimer > 20);
    setVisible(on);
    if (!on) return;
    updateHero(g);
    updateEnemies(g);
    updateDrops(g);
    updatePrompt(g);
    updateNumbers();
  }

  DS.World = {
    update: update,
    hide: function () { setVisible(false); }
  };
})(window.DS);
