/* The screen kit: one grid and one set of components behind every menu, HUD
   panel and profile tab.

   Why it exists. Each screen used to place its own rectangles: the game-over
   panel at one y, the records table at another, the profile tabs at a third.
   That is how "FASTEST CLEAR" ended up printed through the camp fire, how the
   last line of the help text ended up under the "ESC BACK" keycaps, and how the
   currency plate ended up drawn over the profile's RUN tab. None of those were
   typos -- there was simply no shared rule saying where things go, so nobody
   could tell when two things landed in the same place.

   This is that rule, in one file:

     * one grid -- a 4px margin, the title band, a content box, and a 30px HUD
       band at the bottom, all derived from the logical frame rather than typed
       in per call site;
     * one component per repeated idea -- plate, tabs, button, stat row, list
       row, bar, glyph, hint -- so a screen describes what it needs and never
       where it goes;
     * an audit. Components register the rectangles they occupy, and `audit()`
       answers the only question that matters when eight screens share a frame:
       does anything overlap anything it does not belong inside? It runs in the
       tests, so a screen that outgrows its box fails instead of shipping.

   Everything is in logical 320x180 units, like the rest of the UI. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;

  const COLORS = {
    ink: '#d8d5e8',
    muted: '#9b96b8',
    dim: '#514c72',
    gold: '#f2c14e',
    cyan: '#a8e4ff',
    green: '#5cbf62',
    red: '#c0303c',
    line: '#3a3654',
    lineHot: '#f2c14e',
    panel: 'rgba(13,11,18,0.94)',
    sunken: 'rgba(8,7,14,0.82)',
    raised: 'rgba(28,26,43,0.94)'
  };

  /* The grid. Every number a screen needs comes from here; a call site that
     types a literal y has opted out of the layout, and the audit will not see
     it -- which is the point of moving the numbers here one screen at a time. */
  const L = {
    margin: 4,
    gutter: 4,
    pad: 3,
    titleY: 4,
    titleH: 16,
    contentTop: 24,
    tabH: 13,
    rowH: 12,
    btnH: 13,
    bandH: 30,
    hintH: 12
  };
  L.innerW = C.W - L.margin * 2;
  L.contentBottom = C.H - L.bandH - L.gutter - L.hintH;   // 138
  L.bandY = C.H - L.bandH - L.margin;                     // 146
  L.hintY = C.H - L.hintH;                                // 168
  L.safe = { x: 0, y: 0, w: C.W, h: C.H };

  // --- audit ----------------------------------------------------------------

  /* Two rectangles, and whether one holds the other. Containment is normal
     (a label inside a plate); a partial overlap is the failure this exists to
     catch. */
  function intersects(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w &&
           a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function contains(a, b) {
    return b.x >= a.x && b.y >= a.y &&
           b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  }

  function overlaps(a, b) {
    return intersects(a, b) && !contains(a, b) && !contains(b, a);
  }

  let items = [];
  let screenName = '';

  function auditBegin(name) { items = []; screenName = name || ''; }

  /* Register what a component just occupied. `flags.soft` marks something that
     legitimately spans the frame (a backdrop band, a scrim): it is still bounds
     checked, but excluded from the overlap test. */
  function note(rect, name, flags) {
    items.push({
      name: name || '?', rect: rect, soft: !!(flags && flags.soft)
    });
    return rect;
  }

  function audit() {
    const bad = [];
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const r = a.rect;
      if (r.x < -0.5 || r.y < -0.5 ||
          r.x + r.w > C.W + 0.5 || r.y + r.h > C.H + 0.5) {
        bad.push({ kind: 'frame', screen: screenName, a: a.name,
                   detail: [r.x, r.y, r.w, r.h] });
      }
      if (a.soft) continue;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (b.soft) continue;
        if (overlaps(r, b.rect)) {
          bad.push({ kind: 'overlap', screen: screenName,
                     a: a.name, b: b.name,
                     detail: [r.x, r.y, r.w, r.h, b.rect.x, b.rect.y, b.rect.w, b.rect.h] });
        }
      }
    }
    return bad;
  }

  // --- primitives -----------------------------------------------------------

  const Ui = function () { return DS.SPR && DS.SPR.ui; };

  /* An icon from the kit's own set (src/art/icons.js), drawn 1:1 in logical
     units. Missing art logs once and draws nothing rather than throwing: a
     screen with one absent glyph should still be readable. */
  const missing = {};

  function glyph(name, x, y, color) {
    const set = Ui();
    const img = set && set[name];
    if (!img) {
      if (!missing[name]) { missing[name] = true; console.warn('Kit: no icon "' + name + '"'); }
      return null;
    }
    if (color) {
      DS.R.sprAlphaS(img, x, y, 1);
      return img;
    }
    DS.R.sprS(img, x, y);
    return img;
  }

  function glyphW(name) {
    const set = Ui();
    const img = set && set[name];
    return img ? img.uw : 0;
  }

  function divider(x, y, w, color) {
    DS.R.rectS(x, y, w, 1, color || COLORS.line);
  }

  /* A panel. `hole` cuts a window out of it -- the profile's doll stands in one,
     and the panel is drawn as up to four pieces around it so the 3D doll behind
     the UI shows through instead of being painted over. */
  function plate(x, y, w, h, opts) {
    const R = DS.R;
    opts = opts || {};
    const fill = opts.fill || COLORS.panel;
    const line = opts.line || COLORS.line;
    const hole = opts.hole;

    if (!hole) {
      R.rectS(x, y, w, h, fill);
    } else {
      const top = hole.y - y;
      const bottom = (y + h) - (hole.y + hole.h);
      const left = hole.x - x;
      const right = (x + w) - (hole.x + hole.w);
      if (top > 0) R.rectS(x, y, w, top, fill);
      if (bottom > 0) R.rectS(x, hole.y + hole.h, w, bottom, fill);
      const bandH = h - Math.max(0, top) - Math.max(0, bottom);
      if (bandH > 0) {
        if (left > 0) R.rectS(x, hole.y, left, bandH, fill);
        if (right > 0) R.rectS(hole.x + hole.w, hole.y, right, bandH, fill);
      }
    }
    R.frameS(x, y, w, h, line);
    if (hole) {
      // A rim around the window, so it reads as an opening rather than a gap.
      R.frameS(hole.x - 1, hole.y - 1, hole.w + 2, hole.h + 2, opts.rim || COLORS.dim);
    }
    if (!(opts.soft)) note({ x: x, y: y, w: w, h: h }, opts.name || 'plate');
    return { x: x, y: y, w: w, h: h };
  }

  /* The backdrop every full screen starts with: the world (or the menu's camp)
     goes quiet, and the content sits on its own plate so no text is ever read
     against moving art. Returns the content box to lay out inside. */
  function screen(opts) {
    opts = opts || {};
    DS.R.dimBehind(opts.dim == null ? 0.78 : opts.dim);
    const x = L.margin, y = L.contentTop;
    const w = L.innerW, h = L.contentBottom - L.contentTop;
    if (opts.plate !== false) {
      plate(x, y, w, h, { name: 'screen plate', fill: opts.fill, line: opts.line });
    }
    return { x: x + L.pad, y: y + L.pad, w: w - L.pad * 2, h: h - L.pad * 2 };
  }

  function title(str, opts) {
    const R = DS.R;
    opts = opts || {};
    const y = opts.y == null ? L.titleY : opts.y;
    const color = opts.color || COLORS.gold;
    R.textCenter(str, C.W / 2, y, color);
    if (opts.rule !== false) {
      const w = Math.min(L.innerW - 24, R.textWidth(str) + 56);
      divider(Math.round((C.W - w) / 2), y + 9, Math.round(w), opts.ruleColor || COLORS.line);
    }
    let sub = 0;
    if (opts.sub) {
      R.textSmallCenter(opts.sub, C.W / 2, y + 12, opts.subColor || COLORS.muted);
      sub = 8;
    }
    note({ x: 0, y: y - 1, w: C.W, h: 12 + sub }, 'title');
    return y + 12 + sub;
  }

  function hint(pairs, opts) {
    opts = opts || {};
    const y = opts.y == null ? L.hintY + 2 : opts.y;
    DS.R.hintsCenter(pairs, C.W / 2, y, opts.color || COLORS.muted,
                     opts.accent || COLORS.gold);
    note({ x: 0, y: y - 1, w: C.W, h: 9 }, 'hints', { soft: true });
  }

  /* Tabs are drawn and hit-tested by the same call, so a chip can never move
     without its click target moving with it -- the drift that let the profile's
     RUN tab sit under the currency plate. */
  function tabs(list, active, opts) {
    const R = DS.R;
    opts = opts || {};
    const y = opts.y == null ? L.contentTop : opts.y;
    const gap = 2;
    const w = Math.floor((L.innerW - (list.length - 1) * gap) / list.length);
    const out = [];
    const hover = opts.hover == null ? -1 : opts.hover;

    for (let i = 0; i < list.length; i++) {
      const r = { x: L.margin + i * (w + gap), y: y, w: w, h: L.tabH };
      out.push(r);
      const on = i === active;
      const hot = i === hover;
      R.rectS(r.x, r.y, r.w, r.h,
              on ? 'rgba(79,179,224,0.20)' : hot ? 'rgba(79,179,224,0.10)' : 'rgba(28,26,43,0.70)');
      R.frameS(r.x, r.y, r.w, r.h, on ? COLORS.cyan : hot ? COLORS.dim : '#2a2740');
      // A lit sill under the open tab, the one convention every screen shares.
      if (on) R.rectS(r.x, r.y + r.h - 1, r.w, 1, COLORS.cyan);

      const item = list[i];
      const gw = item.glyph ? glyphW(item.glyph) : 0;
      const labelW = R.textSmallWidth(item.label);
      const total = gw + (gw ? 2 : 0) + labelW;
      let gx = Math.round(r.x + (r.w - total) / 2);
      if (gw) { glyph(item.glyph, gx, r.y + 3); gx += gw + 2; }
      R.textSmall(item.label, gx, r.y + 4, on ? '#ffffff' : hot ? COLORS.ink : COLORS.muted);
    }
    if (opts.name !== false) note({ x: L.margin, y: y, w: L.innerW, h: L.tabH }, 'tabs');
    return out;
  }

  function button(r, label, opts) {
    const R = DS.R;
    opts = opts || {};
    const on = !!opts.selected;
    const hot = !!opts.hover;
    const accent = opts.accent || (opts.danger ? COLORS.red : COLORS.gold);
    const fill = opts.danger
      ? (on ? 'rgba(192,48,60,0.22)' : 'rgba(28,26,43,0.70)')
      : (on ? 'rgba(242,193,78,0.20)' : hot ? 'rgba(242,193,78,0.10)' : 'rgba(28,26,43,0.70)');
    R.rectS(r.x, r.y, r.w, r.h, fill);
    R.frameS(r.x, r.y, r.w, r.h, on || hot ? accent : COLORS.line);

    const gw = opts.glyph ? glyphW(opts.glyph) : 0;
    const labelW = R.textSmallWidth(label);
    const total = gw + (gw ? 3 : 0) + labelW;
    let gx = Math.round(r.x + (r.w - total) / 2);
    if (gw) { glyph(opts.glyph, gx, r.y + 3, opts.glyphColor); gx += gw + 3; }
    R.textSmall(label, gx, r.y + 4, on || hot ? '#ffffff' : COLORS.muted);
    if (opts.name !== false) note(r, opts.name || ('button ' + label));
    return r;
  }

  function statRow(r, label, value, opts) {
    const R = DS.R;
    opts = opts || {};
    if (opts.band) R.rectS(r.x, r.y - 1, r.w, r.h, 'rgba(28,26,43,0.35)');
    if (opts.glyph) glyph(opts.glyph, r.x, r.y + 1, opts.glyphColor);
    const lx = r.x + (opts.glyph ? glyphW(opts.glyph) + 4 : 0);
    R.textSmall(label, lx, r.y + 3, opts.labelColor || COLORS.muted);
    R.textSmallRight(String(value), r.x + r.w, r.y + 2,
                     opts.color || COLORS.ink);
    if (opts.note) R.textSmall(opts.note, lx, r.y + 9, COLORS.dim);
    note(r, 'row ' + label);
    return r;
  }

  function listRow(r, opts) {
    const R = DS.R;
    const on = !!opts.selected;
    const hot = !!opts.hover;
    R.rectS(r.x, r.y, r.w, r.h,
            on ? 'rgba(242,193,78,0.14)' : hot ? 'rgba(255,255,255,0.06)' : 'rgba(7,11,12,0.45)');
    R.rectS(r.x, r.y, 2, r.h, on ? COLORS.gold : hot ? COLORS.dim : 'rgba(0,0,0,0)');
    let x = r.x + 6;
    if (opts.glyph) { glyph(opts.glyph, x, r.y + Math.round((r.h - glyphW(opts.glyph)) / 2), opts.glyphColor); x += glyphW(opts.glyph) + 4; }
    R.textSmall(opts.label, x, r.y + Math.round((r.h - 7) / 2), opts.color || (on ? '#ffffff' : COLORS.muted));
    if (opts.value != null) {
      R.textSmallRight(String(opts.value), r.x + r.w - 4, r.y + Math.round((r.h - 7) / 2),
                       opts.valueColor || COLORS.ink);
    }
    if (opts.hint) {
      R.textSmallRight(opts.hint, r.x + r.w - 4, r.y + Math.round((r.h - 7) / 2), COLORS.dim);
    }
    note(r, opts.name || ('row ' + opts.label));
    return r;
  }

  function bar(r, pct, fg, bg) {
    const R = DS.R;
    pct = DS.M.clamp(pct, 0, 1);
    R.rectS(r.x, r.y, r.w, r.h, bg || '#241f36');
    const inner = Math.round((r.w - 2) * pct);
    if (inner > 0) {
      R.rectS(r.x + 1, r.y + 1, inner, r.h - 2, fg);
      R.rectS(r.x + 1, r.y + 1, inner, 1, 'rgba(255,255,255,0.32)');
    }
    R.frameS(r.x, r.y, r.w, r.h, '#0d0b12');
    return r;
  }

  function empty(r, text) {
    const R = DS.R;
    R.textSmallCenter(text, r.x + r.w / 2, r.y + Math.round(r.h / 2) - 3, COLORS.dim);
    return r;
  }

  /* A labelled icon plate: the one way this game draws a filled slot (bag
     cells, weapon slots, armour, shop stock). */
  function iconPlate(r, img, color, opts) {
    const R = DS.R;
    opts = opts || {};
    R.rectS(r.x, r.y, r.w, r.h, opts.fill || COLORS.sunken);
    if (img) {
      const iw = img.uw == null ? img.width : img.uw;
      const ih = img.uh == null ? img.height : img.uh;
      R.sprS(img, Math.round(r.x + (r.w - iw) / 2), Math.round(r.y + (r.h - ih) / 2));
    }
    R.frameS(r.x, r.y, r.w, r.h, color || COLORS.line);
    if (opts.selected) R.rectS(r.x, r.y + r.h - 1, r.w, 1, color || COLORS.gold);
    if (opts.name !== false) note(r, opts.name || 'icon plate');
    return r;
  }

  DS.Kit = {
    L: L,
    C: COLORS,
    auditBegin: auditBegin,
    audit: audit,
    note: note,
    screen: screen,
    plate: plate,
    title: title,
    tabs: tabs,
    button: button,
    statRow: statRow,
    listRow: listRow,
    bar: bar,
    glyph: glyph,
    glyphW: glyphW,
    divider: divider,
    hint: hint,
    empty: empty,
    iconPlate: iconPlate,
    // the raw predicates, for the tests
    _overlaps: overlaps,
    _contains: contains
  };
})(window.DS);
