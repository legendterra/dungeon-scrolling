/* The paper doll: the hero rendered wearing whatever is equipped.

   Rather than compositing overlay sprites frame by frame — which would have to
   track how every run and jump frame shifts — each slot repaints the palette
   keys that already belong to it in the hero art:

     head   the hair pixels          'N'
     chest  the tunic and belt       'C', 'b'
     legs   the trousers and boots   'c', 'n'

   That works across every existing animation frame for free, and heavy
   materials add a crest or a pauldron on top for silhouette.

   A full set is baked once whenever equipment changes and cached by key, so the
   render loop never pays for it. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const A = DS.Art;
  const Armor = DS.Armor;

  const cache = new Map();

  // Extra shapes stamped over the head for the bulkier materials.
  const CRESTS = {
    medium: ['..LLLL....', '.LmmmmL...'],
    heavy:  ['.L......L.', 'LLmmmmmmLL', '.LmmmmmmL.']
  };

  function paletteFor(armor) {
    const pal = {};

    if (armor.head) {
      const m = Armor.MATERIALS[armor.head.material];
      pal.N = m.mid;          // hair becomes the helm
    }
    if (armor.chest) {
      const m = Armor.MATERIALS[armor.chest.material];
      pal.C = m.mid;          // tunic
      pal.b = m.light;        // belt
    }
    if (armor.legs) {
      const m = Armor.MATERIALS[armor.legs.material];
      pal.c = m.dark;         // trousers
      pal.n = m.mid;          // boots
    }
    return pal;
  }

  function keyFor(armor) {
    return DS.Armor.SLOTS.map(function (slot) {
      const piece = armor[slot];
      return piece ? piece.material + ':' + piece.style : '-';
    }).join('|');
  }

  /* Stamp a crest onto an already-built frame. 'L' and 'm' resolve to the
     material's light and mid colours. */
  function addCrest(canvas, style, material) {
    const rows = CRESTS[style];
    if (!rows) return canvas;

    const m = Armor.MATERIALS[material];
    const out = A.makeCanvas(canvas.width, canvas.height + rows.length);
    const cx = out.getContext('2d');
    cx.drawImage(canvas, 0, rows.length);

    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length && x < out.width; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        cx.fillStyle = ch === 'L' ? m.light : m.mid;
        cx.fillRect(x, y, 1, 1);
      }
    }
    return out;
  }

  function buildSet(armor) {
    const key = keyFor(armor);
    const hit = cache.get(key);
    if (hit) return hit;

    const pal = paletteFor(armor);
    const raw = DS.SPR.heroRows;

    function frame(rows) {
      let spr = A.makeSprite(rows, pal);
      if (armor.head && armor.head.style !== 'light') {
        spr = addCrest(spr, armor.head.style, armor.head.material);
      }
      return spr;
    }

    const set = {
      idle: raw.idle.map(frame),
      run: raw.run.map(frame),
      jump: frame(raw.jump),
      fall: frame(raw.fall)
    };

    // The crest grows the canvas upward; the draw code needs to know by how much.
    set.lift = set.idle[0].height - raw.idle[0].length;

    set.flip = {
      idle: set.idle.map(A.flipped),
      run: set.run.map(A.flipped),
      jump: A.flipped(set.jump),
      fall: A.flipped(set.fall),
      lift: set.lift
    };

    // Bounded so a long run with lots of mixing cannot grow without limit.
    if (cache.size > 48) cache.clear();
    cache.set(key, set);
    return set;
  }

  // The set used when nothing is equipped: the plain starting clothes.
  function bare() {
    return buildSet({ head: null, chest: null, legs: null });
  }

  DS.Paperdoll = { buildSet: buildSet, bare: bare, keyFor: keyFor };
})(window.DS);
