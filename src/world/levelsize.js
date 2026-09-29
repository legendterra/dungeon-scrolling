/* How big each kind of floor is.

   The floors used to be a corridor of nine to fourteen twenty-tile rooms and a
   carved climb of the same. A floor that takes ninety seconds to cross is a
   floor that never gets to be a place, and the world behind it (v7: the
   backdrop is a diorama the size of a landscape, the level a single rock in it)
   only reads as huge if the rock is worth walking round. So the sizes live
   here, in one table, and every builder asks:

     corridorMiddle(base)   how many middle rooms a corridor gets, from the
                            difficulty curve's own count;
     carvedRooms(base)      the same for a carved climb (in room widths);
     floodedRooms(depth)    a lake is two to three times as wide as it was;
     carvedRows / floodedRows / mountain / trial   the fixed shapes.

   Pure arithmetic on numbers handed in, so tests/levelsize.test.js can pin the
   ranges the plan set (corridor 320-480, carved 300-440, flooded ~220, the
   mountain 128 x 60) and a builder cannot drift from them by editing its own
   constant. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  const ROOM_W = 20;

  const CORRIDOR_MUL = 1.8;
  const CARVED_MUL = 1.7;

  function corridorMiddle(base) {
    return Math.round(base * CORRIDOR_MUL);
  }

  function carvedRooms(base) {
    return clamp(Math.round((base + 1) * CARVED_MUL), 12, 24);
  }

  function floodedRooms(depth) {
    return clamp(8 + Math.floor(depth / 3), 8, 11);
  }

  DS.LevelSize = {
    ROOM_W: ROOM_W,
    CORRIDOR_MUL: CORRIDOR_MUL,
    CARVED_MUL: CARVED_MUL,
    corridorMiddle: corridorMiddle,
    carvedRooms: carvedRooms,
    floodedRooms: floodedRooms,
    /* Rows. The corridor stays at 22: its rooms are authored 12 tall and the
       rest is high dark air. The rows that grow are the ones a level really
       uses -- the carved climb's range, the lake's depth. */
    CORRIDOR_ROWS: 22,
    CARVED_ROWS: 32,
    FLOODED_ROWS: 30,
    /* The Climb: a taller mountain with more plateaus on the way up. */
    MOUNTAIN: { w: 128, h: 60 },
    /* The trial chamber: a longer gauntlet and hall, the same arena. */
    TRIAL: { w: 144, h: 22 }
  };
})(window.DS);
