/* The same person, in pixels: the doll in the bag and the pause screen, the
   portrait in the HUD and the little figure beside the creator. It reads the SAME
   look the voxel hero is built from (look3d.js), so what he wears in the world is
   what he wears in the corner of the inventory.

   grid(look) paints into a plain array of colours (no canvas needed, so it can be
   tested), then a one-pixel dark outline is traced around whatever was drawn;
   render(look) turns that into a canvas the interface scales by a whole number. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const K = DS.Look3D.kit;
  const shade = K.shade, mix = K.mix, hexInt = K.hexInt;

  const W = 32, H = 48, OUT = 0x1c1a24, NONE = -1;
  const GOLD = 0xf2c14e, LEATHER = 0x4e3320, CREAM = 0xf4efe0, RED = 0xc0303c, WHITE = 0xf4f2f8;

  const TORSO_W = { slim: 10, regular: 12, broad: 14 };
  const ARM_W = { slim: 2, regular: 3, broad: 3 };
  const LEG_W = { slim: 3, regular: 4, broad: 4 };
  const LEG_H = { short: 8, mid: 9, tall: 10 };

  function paint(look, opts) {
    opts = opts || {};
    const px = new Int32Array(W * H).fill(NONE);
    const dy = opts.bob || 0;                       // the upper body breathes: one row down
    const rect = function (x, y, w, h, c) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const xx = x + i, yy = y + j;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H) px[yy * W + xx] = c;
      }
    };
    const dot = function (x, y, c) { rect(x, y, 1, 1, c); };
    const has = function (slot) { const it = DS.Look.itemOf(slot, look[slot]); return it && it.id !== 'none' ? it : null; };
    const palFor = function (slot, item) { return K.palOf(item, look, slot); };

    const skin = hexInt(DS.Look.traitColor('skin', look.skin));
    const eyeC = hexInt(DS.Look.traitColor('eyeColor', look.eyeColor));
    const hairC = hexInt(DS.Look.traitColor('hairColor', look.hairColor));
    const tw = TORSO_W[look.build] || 12, aw = ARM_W[look.build] || 3, lw = LEG_W[look.build] || 4;
    const legH = LEG_H[look.height] || 9;
    const legTop = 46 - legH, tTop = legTop - 11 + dy, hTop = tTop - 11;
    const tx = 16 - tw / 2;                          // torso's left edge
    const lxL = 15 - lw, lxR = 17;                   // the legs, with a two-pixel gap
    const armY = tTop + 1;
    const hx = 9;                                    // the head: x 9..22

    // --- a cape hangs behind everything ----------------------------------------------
    const cape = has('cape');
    if (cape) {
      const p = palFor('cape', cape);
      const family = cape.family || cape.id;
      if (family === 'wings') {
        [-1, 1].forEach(function (s) {
          const x0 = s < 0 ? tx - aw - 4 : tx + tw + aw;
          for (let i = 0; i < 4; i++) { const w = 4 - (i >> 1); rect(x0 + (s < 0 ? 4 - w : 0), tTop - 2 + i * 2, w, 2, i % 2 ? p.b : p.a); }
        });
      } else {
        /* Wider than the arms, so it shows at the sides and hangs below the hem. */
        const long = family === 'long' || family === 'royal' || family === 'flamecape';
        const bottom = long ? legTop + 6 : tTop + 12;
        const cx0 = tx - aw - 1, cw = tw + 2 * aw + 2;
        rect(cx0, tTop + 1, cw, bottom - tTop, p.a);
        rect(cx0, bottom, cw, 1, p.b);
        if (family === 'tattered' || family === 'flamecape') for (let i = 0; i < cw; i += 2) rect(cx0 + i, bottom, 1, 2, p.b);
        if (family === 'royal') { rect(cx0, tTop + 1, 1, bottom - tTop, item2(cape, p)); rect(cx0 + cw - 1, tTop + 1, 1, bottom - tTop, item2(cape, p)); }
      }
    }
    function item2(it, p) { return it.pal && it.pal.length > 2 ? p.c : p.b; }

    // --- legs, trousers, boots ------------------------------------------------------------
    rect(lxL, legTop, lw, legH, skin);
    rect(lxR, legTop, lw, legH, skin);
    const pants = has('pants');
    if (pants) {
      const p = palFor('pants', pants);
      const f = pants.family || pants.id;
      const both = function (y, h, c, wide) { rect(lxL - (wide || 0), y, lw + (wide || 0), h, c); rect(lxR, y, lw + (wide || 0), h, c); };
      if (f === 'trousers') { both(legTop, legH - 3, p.a); if (pants.pal) rect(lxL, legTop + 3, 1, 3, p.b); }
      else if (f === 'shorts') both(legTop, 4, p.a);
      else if (f === 'kilt') { rect(tx - 1, tTop + 8, tw + 2, legTop + 3 - tTop - 8 + 1, p.a); rect(tx - 1, tTop + 10, tw + 2, 1, p.b); rect(tx + 2, tTop + 8, 1, 5, p.c); rect(tx + tw - 3, tTop + 8, 1, 5, p.c); }
      else if (f === 'skirt') { rect(tx - 1, tTop + 8, tw + 2, legTop + 6 - tTop - 8 + 1, p.a); rect(tx - 1, legTop + 6, tw + 2, 1, p.b); }
      else if (f === 'greaves') {
        both(legTop, legH - 3, shade(p.b, 0.85));
        both(legTop + 3, 2, p.a); both(legTop + legH - 6, 3, p.a);
        if (pants.id === 'platelegs') both(legTop, 3, p.a);
      }
    }
    const boots = has('boots');
    if (boots) {
      const p = palFor('boots', boots);
      const f = boots.family || boots.id;
      if (f === 'sandals') { rect(lxL, legTop + legH - 1, lw + 1, 1, p.a); rect(lxR - 1, legTop + legH - 1, lw + 1, 1, p.a); rect(lxL, legTop + legH - 3, lw, 1, p.b); rect(lxR, legTop + legH - 3, lw, 1, p.b); }
      else {
        const h = f === 'shoes' ? 2 : 4;
        rect(lxL - 1, legTop + legH - h, lw + 1, h, p.a); rect(lxR, legTop + legH - h, lw + 1, h, p.a);
        if (h > 2) { rect(lxL, legTop + legH - h, lw, 1, p.c); rect(lxR, legTop + legH - h, lw, 1, p.c); }
        if (f === 'winged') { rect(lxL - 3, legTop + legH - 4, 2, 2, p.a); rect(lxR + lw + 1, legTop + legH - 4, 2, 2, p.a); }
      }
    }

    // --- torso, arms, what is worn on them ------------------------------------------------
    rect(tx, tTop + 1, tw, 10, skin);
    rect(tx - aw, armY, aw, 10, skin);
    rect(tx + tw, armY, aw, 10, skin);
    const arms = function (y, h, c, wide) { rect(tx - aw - (wide || 0), y, aw + (wide || 0), h, c); rect(tx + tw, y, aw + (wide || 0), h, c); };
    const top = has('top');
    if (top) {
      const p = palFor('top', top);
      const f = top.family || top.id;
      const fill = function (c) { rect(tx, tTop + 1, tw, 10, c); };
      const beltRow = function (c, buckle) { rect(tx, tTop + 8, tw, 1, c); if (buckle != null) rect(15, tTop + 8, 2, 1, buckle); };
      if (f === 'tunic') { fill(p.a); rect(tx, tTop + 10, tw, 1, p.b); beltRow(LEATHER, GOLD); arms(armY, 4, p.a); rect(14, tTop + 1, 4, 1, p.c); }
      else if (f === 'shirt') { fill(p.a); beltRow(p.b); arms(armY, 8, p.a); arms(armY + 7, 1, p.b); rect(14, tTop + 1, 4, 1, mix(p.a, 0xffffff, 0.55)); dot(15, tTop + 4, p.b); dot(15, tTop + 6, p.b); }
      else if (f === 'vest') { fill(mix(p.a, 0xffffff, 0.7)); rect(tx, tTop + 1, 4, 9, p.a); rect(tx + tw - 4, tTop + 1, 4, 9, p.a); beltRow(p.b, GOLD); }
      else if (f === 'hoodie') { fill(p.a); rect(13, tTop, 6, 2, p.b); rect(tx + 3, tTop + 7, tw - 6, 3, p.b); arms(armY, 9, p.a); arms(armY + 8, 1, p.b); dot(14, tTop + 3, p.c); dot(17, tTop + 3, p.c); }
      else if (f === 'robe') { fill(p.a); rect(tx - 1, tTop + 11, tw + 2, 5, p.a); rect(tx - 1, tTop + 15, tw + 2, 1, p.c); rect(tx, tTop + 6, tw, 2, p.b); arms(armY, 9, p.a, 1); arms(armY + 8, 1, p.c, 1); }
      else if (f === 'jerkin') { fill(p.a); for (let i = 0; i < 6; i++) { dot(tx + 1 + i, tTop + 1 + i, p.b); dot(tx + tw - 2 - i, tTop + 1 + i, p.b); } beltRow(p.b, GOLD); }
      else if (f === 'toga') {
        fill(p.a);
        for (let i = 0; i < 9; i++) rect(tx + i + 1, tTop + 1 + i, 2, 1, p.b);
        rect(tx + tw, armY, aw, 5, p.a); rect(tx + tw, armY + 4, aw, 1, p.b);
        dot(tx + 1, tTop + 2, p.b);
      } else {                                      // armour: chain, plate, bronze, aegis and the boss sets
        fill(top.id === 'chain' ? p.a : p.b);
        if (top.id === 'chain') {
          for (let y = 0; y < 10; y += 2) for (let x = 0; x < tw; x += 2) dot(tx + x + (y % 4 ? 1 : 0), tTop + 1 + y, p.b);
          arms(armY, 5, p.a);
        } else {
          rect(tx, tTop + 1, tw, 6, p.a); rect(tx, tTop + 7, tw, 1, p.b); rect(tx + 1, tTop + 8, tw - 2, 2, p.a);
          rect(15, tTop + 3, 2, 2, p.c);
        }
        rect(tx, tTop + 8, tw, 1, p.b);
        rect(14, tTop + 1, 4, 1, p.a);
        if (top.pauldrons) { rect(tx - aw - 1, armY - 1, aw + 2, 3, p.a); rect(tx + tw - 1, armY - 1, aw + 2, 3, p.a); rect(tx - aw - 1, armY + 2, aw + 2, 1, p.c); rect(tx + tw - 1, armY + 2, aw + 2, 1, p.c); }
      }
    }
    const gloves = has('gloves');
    if (gloves) {
      const p = palFor('gloves', gloves);
      if (gloves.id === 'fingerless') { arms(armY + 6, 2, p.a); }
      else if (gloves.id === 'gloves') { arms(armY + 7, 3, p.a); arms(armY + 6, 1, p.b); }
      else { arms(armY + 5, 5, p.a); arms(armY + 5, 1, p.b); arms(armY + 9, 1, p.b); }
    }

    // --- head ---------------------------------------------------------------------------------------
    const hair = has('hair');
    const hairP = function () {
      if (!hair) return null;
      const c = hair.pal ? hexInt(hair.pal[0]) : hairC;
      return { a: c, b: hair.pal ? hexInt(hair.pal[1] || hair.pal[0]) : shade(c, 0.9), dk: shade(c, 0.78) };
    };
    const hp = hairP();
    const hid = has('hat');
    const hatP = hid ? palFor('hat', hid) : null;
    const hf = hid ? (hid.family || hid.id) : '';
    const covers = ['cap', 'hood', 'leathercap', 'straw', 'ironhelm', 'wizard'].indexOf(hf) >= 0;
    const hrs = hair && hair.id;
    const backLong = ['long', 'spirit', 'afro', 'wolf', 'curly'].indexOf(hrs) >= 0;

    if (hp && backLong) {                           // hair behind the head and over the shoulders
      const big = hrs === 'afro';
      rect(hx - (big ? 3 : 1), hTop + (big ? -2 : 2), 14 + (big ? 6 : 2), big ? 12 : (hrs === 'long' || hrs === 'spirit' ? 17 : 10), hp.a);
      if (hrs === 'long' || hrs === 'spirit') rect(hx - 1, hTop + 18, 16, 1, hp.dk);
    }
    if (hp && hrs === 'twintails') {
      [-1, 1].forEach(function (s) { const x = s < 0 ? 5 : 24; rect(x, hTop + 4, 3, 8, hp.a); rect(x, hTop + 4, 3, 1, 0xe0446a); rect(x + 1, hTop + 11, 1, 2, hp.dk); });
    }
    if (hp && hrs === 'braid') for (let i = 0; i < 10; i++) rect(7, hTop + 8 + i, 2, 1, i % 2 ? hp.dk : hp.a);
    if (hp && hrs === 'ponytail') { rect(23, hTop + 3, 3, 4, hp.a); rect(24, hTop + 7, 2, 5, hp.dk); }

    rect(hx, hTop + 1, 14, 11, skin);
    rect(hx + 1, hTop, 12, 1, skin);
    rect(hx + 1, hTop + 12, 12, 1, skin);
    rect(hx - 1, hTop + 5, 1, 3, shade(skin, 0.94));
    rect(hx + 14, hTop + 5, 1, 3, shade(skin, 0.94));

    // --- the face ---------------------------------------------------------------------------------------
    const ey = hTop + 6;
    const eye = function (x) {
      if (look.eyes === 'happy') { dot(x, ey + 1, 0x1a1626); dot(x + 1, ey, 0x1a1626); dot(x + 2, ey + 1, 0x1a1626); return; }
      const tall = look.eyes === 'wide' ? 3 : (look.eyes === 'narrow' || look.eyes === 'sharp' ? 1 : 2);
      rect(x, ey + (tall === 1 ? 1 : 0), 2, tall, eyeC);
      dot(x + (x < 15 ? 0 : 1), ey + (tall === 1 ? 1 : 0), WHITE);
      if (look.eyes === 'sleepy') rect(x, ey - 1, 2, 1, shade(skin, 0.8));
      if (look.eyes === 'sharp') dot(x < 15 ? x - 1 : x + 2, ey, shade(skin, 0.6));
    };
    eye(12); eye(18);
    if (look.brows !== 'none') {
      const bc = shade(hairC, 0.8);
      const by = ey - 2;
      if (look.brows === 'thick') { rect(11, by, 4, 2, bc); rect(17, by, 4, 2, bc); }
      else if (look.brows === 'thin') { rect(11, by, 3, 1, bc); rect(18, by, 3, 1, bc); }
      else if (look.brows === 'angled') { rect(11, by, 2, 1, bc); rect(13, by + 1, 2, 1, bc); rect(17, by + 1, 2, 1, bc); rect(19, by, 2, 1, bc); }
      else { rect(11, by, 4, 1, bc); rect(17, by, 4, 1, bc); }
    }
    dot(15, ey + 3, shade(skin, 0.9)); dot(16, ey + 3, shade(skin, 0.9));
    const my = ey + 5, LIP = 0x8a4a42;
    if (look.mouth === 'neutral') rect(14, my, 4, 1, LIP);
    else if (look.mouth === 'grin') { rect(13, my - 1, 6, 2, 0x1a1626); rect(14, my - 1, 4, 1, WHITE); }
    else if (look.mouth === 'smirk') { rect(14, my, 3, 1, LIP); dot(17, my - 1, LIP); }
    else if (look.mouth === 'frown') { rect(14, my - 1, 4, 1, LIP); dot(13, my, LIP); dot(18, my, LIP); }
    else { rect(14, my, 4, 1, LIP); dot(13, my - 1, LIP); dot(18, my - 1, LIP); }

    const mark = has('mark');
    if (mark) {
      const c = mark.pal ? hexInt(mark.pal[0]) : 0;
      if (mark.id === 'freckles') { [[11, ey + 3], [12, ey + 4], [19, ey + 3], [20, ey + 4], [10, ey + 4]].forEach(function (q) { dot(q[0], q[1], shade(skin, 0.7)); }); }
      else if (mark.id === 'scar') { dot(19, ey - 2, 0xb85a5a); dot(19, ey - 1, 0xb85a5a); dot(20, ey, 0xb85a5a); dot(20, ey + 1, 0xb85a5a); }
      else if (mark.id === 'warpaint') { rect(10, ey + 2, 3, 1, c); rect(10, ey + 4, 3, 1, c); rect(19, ey + 2, 3, 1, c); rect(19, ey + 4, 3, 1, c); }
      else if (mark.id === 'tattoo') { rect(10, ey - 1, 1, 4, c); rect(11, ey - 1, 2, 1, c); }
      else { dot(15, hTop + 3, c); dot(16, hTop + 3, c); dot(15, hTop + 4, c); dot(16, hTop + 4, c); }
    }

    const facial = has('facial');
    if (facial) {
      const c = shade(hairC, 0.85);
      if (facial.id === 'stubble') { for (let i = 0; i < 8; i++) dot(11 + i * 1.2 | 0, my + 1 + (i % 2), mix(skin, c, 0.5)); }
      else if (facial.id === 'mustache') { rect(13, my - 1, 6, 1, c); dot(12, my, c); dot(19, my, c); }
      else if (facial.id === 'goatee') { rect(13, my - 1, 6, 1, c); rect(14, my + 1, 4, 2, c); }
      else {
        rect(10, my - 1, 12, 1, c); rect(hx, my - 1, 1, 3, c); rect(hx + 13, my - 1, 1, 3, c);
        rect(10, my + 1, 12, 2, c); rect(14, my, 4, 1, LIP);
        if (facial.id === 'longbeard') { rect(11, hTop + 13, 10, 4, c); rect(13, hTop + 17, 6, 3, shade(c, 0.85)); }
      }
    }

    // --- hair over the top ------------------------------------------------------------------------------------
    if (hp) {
      const top1 = function (h) { rect(hx, hTop - 1, 14, h, hp.a); rect(hx + 1, hTop - 2, 12, 1, hp.a); };
      const sides = function (h) { rect(hx - 1, hTop + 1, 1, h, hp.a); rect(hx + 14, hTop + 1, 1, h, hp.a); };
      const fringe = function () { rect(hx, hTop + 3, 3, 1, hp.a); rect(hx + 11, hTop + 3, 3, 1, hp.a); rect(hx + 3, hTop + 3, 3, 1, hp.dk); rect(hx + 8, hTop + 3, 3, 1, hp.dk); };
      if (!covers) {
        if (hrs === 'buzz') { rect(hx, hTop, 14, 2, hp.dk); sides(3); }
        else if (hrs === 'mohawk') { rect(hx, hTop, 14, 1, hp.dk); rect(14, hTop - 5, 4, 6, hp.a); }
        else if (hrs === 'topknot') { rect(hx, hTop, 14, 1, hp.dk); rect(14, hTop - 4, 4, 4, hp.a); dot(15, hTop, RED); dot(16, hTop, RED); }
        else if (hrs === 'undercut') { rect(hx - 1, hTop + 1, 1, 3, hp.dk); rect(hx + 14, hTop + 1, 1, 3, hp.dk); top1(4); rect(hx + 8, hTop + 3, 5, 2, hp.dk); }
        else if (hrs === 'afro') { top1(4); rect(hx - 1, hTop + 2, 16, 5, hp.a); rect(hx - 2, hTop - 3, 18, 2, hp.dk); fringe(); }
        else if (hrs === 'flame') { top1(3); sides(3); fringe(); [[10, 3], [13, 5], [16, 6], [19, 5], [21, 3]].forEach(function (q, i) { rect(q[0], hTop - 1 - q[1], 2, q[1], i % 2 ? hp.a : hp.b); }); }
        else if (hrs === 'bun') { top1(3); sides(3); fringe(); rect(14, hTop - 5, 4, 3, hp.a); rect(14, hTop - 3, 4, 1, hp.dk); }
        else if (hrs === 'curly') { top1(4); rect(hx - 1, hTop, 16, 5, hp.a); for (let i = 0; i < 8; i++) dot(hx - 1 + i * 2, hTop - 2 - (i % 2), hp.dk); fringe(); }
        else if (hrs === 'crownbraids') { top1(3); sides(3); fringe(); for (let i = 0; i < 12; i++) dot(hx + 1 + i, hTop - 2, i % 2 ? hp.dk : hp.a); }
        else if (hrs === 'sidepart') { top1(3); sides(4); rect(hx + 5, hTop + 3, 9, 2, hp.a); rect(hx, hTop + 3, 4, 1, hp.dk); }
        else if (hrs === 'wolf') { top1(4); sides(5); fringe(); dot(hx + 2, hTop + 4, hp.dk); dot(hx + 6, hTop + 4, hp.dk); dot(hx + 10, hTop + 4, hp.dk); rect(hx - 2, hTop + 5, 1, 3, hp.dk); rect(hx + 15, hTop + 5, 1, 3, hp.dk); }
        else { top1(3); sides(hrs === 'long' || hrs === 'spirit' ? 8 : 3); fringe(); }
      }
    }

    // --- hats -----------------------------------------------------------------------------------------------------
    if (hid) {
      const p = hatP;
      if (hf === 'cap') { rect(hx, hTop - 1, 14, 4, p.a); rect(hx + 1, hTop - 2, 12, 1, p.a); rect(hx - 1, hTop + 3, 16, 1, p.b); dot(15, hTop - 3, p.c); }
      else if (hf === 'hood') { rect(hx - 1, hTop - 2, 16, 4, p.a); rect(hx - 1, hTop + 2, 3, 11, p.a); rect(hx + 12, hTop + 2, 3, 11, p.a); rect(hx + 2, hTop + 2, 10, 1, p.b); rect(hx - 2, hTop + 12, 18, 2, p.b); }
      else if (hf === 'bandana') { rect(hx, hTop + 2, 14, 2, p.a); rect(hx + 14, hTop + 2, 2, 2, p.b); rect(hx + 15, hTop + 4, 1, 3, p.b); }
      else if (hf === 'leathercap') { rect(hx, hTop - 1, 14, 4, p.a); rect(hx + 1, hTop - 2, 12, 1, p.a); rect(hx - 1, hTop + 2, 2, 6, p.a); rect(hx + 13, hTop + 2, 2, 6, p.a); rect(hx, hTop + 3, 14, 1, p.b); }
      else if (hf === 'straw') { rect(11, hTop - 3, 10, 4, p.a); rect(4, hTop + 1, 24, 2, p.a); rect(11, hTop, 10, 1, p.b); rect(6, hTop + 2, 20, 1, p.b); }
      else if (hf === 'ironhelm') {
        rect(hx, hTop - 1, 14, 5, p.a); rect(hx + 1, hTop - 2, 12, 1, p.a); rect(hx, hTop + 3, 14, 1, p.b);
        rect(15, hTop + 4, 2, 5, p.b); rect(hx, hTop + 4, 1, 6, p.a); rect(hx + 13, hTop + 4, 1, 6, p.a);
        if (hid.horns) { rect(hx - 2, hTop - 3, 2, 3, mix(p.a, 0xffffff, 0.6)); rect(hx + 14, hTop - 3, 2, 3, mix(p.a, 0xffffff, 0.6)); dot(hx - 3, hTop - 5, mix(p.a, 0xffffff, 0.8)); dot(hx + 16, hTop - 5, mix(p.a, 0xffffff, 0.8)); }
        if (hid.plume) rect(14, hTop - 5, 4, 3, hid.pal && hid.pal.length > 2 ? p.c : RED);
      }
      else if (hf === 'wizard') {
        rect(4, hTop + 2, 24, 2, p.a); rect(10, hTop + 1, 12, 1, p.b);
        [[10, 12], [11, 10], [12, 8], [13, 6], [14, 4]].forEach(function (q, i) { rect(q[0], hTop - i, q[1], 1, i > 2 ? p.a : p.a); });
        rect(16, hTop - 5, 3, 1, p.b); dot(19, hTop - 6, p.b);
      }
      else if (hf === 'laurel') { for (let i = 0; i < 14; i++) dot(hx + i, hTop + 2 - (i % 2), i % 3 ? p.a : p.b); }
      else if (hf === 'crown') { rect(hx + 1, hTop, 12, 2, p.a); for (let i = 0; i < 6; i++) rect(hx + 1 + i * 2, hTop - 2, 2, 2, p.a); dot(15, hTop, RED); dot(16, hTop, RED); }
      else if (hf === 'halo') { rect(hx + 1, hTop - 5, 12, 1, p.a); rect(hx + 1, hTop - 3, 12, 1, p.a); dot(hx, hTop - 4, p.a); dot(hx + 13, hTop - 4, p.a); }
    }

    // --- extras -----------------------------------------------------------------------------------------------------------
    const extra = has('extra');
    if (extra) {
      const p = palFor('extra', extra);
      const f = extra.family || extra.id;
      if (f === 'scarf') { rect(tx, tTop, tw, 2, p.a); rect(tx + 1, tTop + 2, 2, 5, p.b); }
      else if (f === 'eyepatch') { rect(11, ey - 1, 4, 3, 0x1a1626); for (let i = 0; i < 6; i++) dot(hx + 9 + (i >> 1), hTop + 6 - i, 0x1a1626); }
      else if (f === 'glasses') { rect(11, ey - 1, 4, 1, 0x2c2a38); rect(11, ey + 2, 4, 1, 0x2c2a38); rect(11, ey - 1, 1, 4, 0x2c2a38); rect(14, ey - 1, 1, 4, 0x2c2a38); rect(17, ey - 1, 4, 1, 0x2c2a38); rect(17, ey + 2, 4, 1, 0x2c2a38); rect(17, ey - 1, 1, 4, 0x2c2a38); rect(20, ey - 1, 1, 4, 0x2c2a38); dot(15, ey, 0x2c2a38); dot(16, ey, 0x2c2a38); }
      else if (f === 'mask') { rect(11, ey - 1, 10, 3, p.a); dot(12, ey, p.b); dot(13, ey, p.b); dot(18, ey, p.b); dot(19, ey, p.b); }
      else if (f === 'necklace') { for (let i = 0; i < 3; i++) { dot(13 + i, tTop + 1 + i, p.a); dot(18 - i, tTop + 1 + i, p.a); } rect(15, tTop + 4, 2, 2, p.b); }
      else if (f === 'pauldrons') { rect(tx - aw - 1, armY - 1, aw + 2, 2, p.a); rect(tx + tw - 1, armY - 1, aw + 2, 2, p.a); dot(tx - aw - 1, armY - 3, p.b); dot(tx - aw + 1, armY - 3, p.b); dot(tx + tw + aw - 1, armY - 3, p.b); dot(tx + tw + aw - 3, armY - 3, p.b); }
      else if (f === 'aura') { for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; dot(Math.round(15.5 + Math.sin(a) * 13), Math.round(tTop + 5 + Math.cos(a) * 13 * 0.9), p.a); } }
    }

    // --- the outline ---------------------------------------------------------------------------------------------------------
    const out = px.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (px[y * W + x] !== NONE) continue;
      const near = (x > 0 && px[y * W + x - 1] !== NONE) || (x < W - 1 && px[y * W + x + 1] !== NONE) ||
                   (y > 0 && px[(y - 1) * W + x] !== NONE) || (y < H - 1 && px[(y + 1) * W + x] !== NONE);
      if (near) out[y * W + x] = OUT;
    }
    return { w: W, h: H, px: out };
  }

  const css = function (c) { return '#' + ('000000' + c.toString(16)).slice(-6); };

  /* A canvas of the doll, one canvas pixel per doll pixel. */
  function render(look, opts) {
    const g = paint(look || DS.Look.look, opts);
    const cv = document.createElement('canvas');
    cv.width = g.w; cv.height = g.h;
    const cx = cv.getContext('2d');
    for (let y = 0; y < g.h; y++) {
      let x = 0;
      while (x < g.w) {
        const c = g.px[y * g.w + x];
        let n = 1;
        while (x + n < g.w && g.px[y * g.w + x + n] === c) n++;
        if (c !== NONE) { cx.fillStyle = css(c); cx.fillRect(x, y, n, 1); }
        x += n;
      }
    }
    return cv;
  }

  const cache = new Map();

  /* The two idle frames the bag breathes between, cached by look. */
  function frames(look) {
    look = look || DS.Look.look;
    const key = DS.Look3D.keyOf(look);
    let hit = cache.get(key);
    if (!hit) {
      hit = [render(look), render(look, { bob: 1 })];
      if (cache.size > 24) cache.clear();
      cache.set(key, hit);
    }
    return hit;
  }

  /* Head and shoulders, for the HUD portrait: a square of the doll around the
     face, whatever height he is and whatever is on his head. */
  function headRect(look) {
    const legH = LEG_H[(look || DS.Look.look).height] || 9;
    const hTop = 46 - legH - 22;
    return [4, Math.max(0, hTop - 8), 24, 24];
  }

  DS.Look2D = { W: W, H: H, paint: paint, render: render, frames: frames, headRect: headRect };
})(window.DS);
