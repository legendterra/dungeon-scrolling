/* Fixed-capacity slot pool, shared by every FX3D system.

   A system asks for a slot, writes its particle into its own typed arrays at
   that slot, and hands the slot back when the particle dies. Nothing here (or
   in the systems built on it) allocates after construction: the live set is a
   dense Int32Array walked backwards, a release swap-removes, and a full pool
   either refuses the spawn or recycles its oldest-ish live slot - it never
   grows. That is the whole promise of the module, and tests/fx-pool.test.js
   holds it to it.

   Pure logic, no THREE: the same file runs in the node test sandbox. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  function create(capacity) {
    const cap = Math.max(1, capacity | 0);
    const active = new Int32Array(cap);   // dense list of live slot ids
    const where = new Int32Array(cap);    // slot id -> index in active, -1 when free
    const free = new Int32Array(cap);     // stack of free slot ids
    let freeTop = 0;
    let count = 0;
    let steal = 0;

    for (let i = 0; i < cap; i++) {
      free[freeTop++] = cap - 1 - i;      // slot 0 comes out first
      where[i] = -1;
    }

    const pool = {
      capacity: cap,
      active: active,
      get count() { return count; },

      /* A free slot id, or -1 when every slot is live. */
      alloc: function () {
        if (freeTop === 0) return -1;
        const id = free[--freeTop];
        where[id] = count;
        active[count++] = id;
        return id;
      },

      /* A slot no matter what: a free one when there is one, otherwise a live
         one taken round-robin. The caller simply overwrites its data - the
         particle it replaces vanishes a few frames early, which nobody sees. */
      allocOrSteal: function () {
        const id = pool.alloc();
        if (id >= 0) return id;
        steal = (steal + 1) % count;
        return active[steal];
      },

      release: function (id) {
        const at = where[id];
        if (at < 0) return false;
        const last = active[--count];
        active[at] = last;
        where[last] = at;
        where[id] = -1;
        free[freeTop++] = id;
        return true;
      },

      isLive: function (id) { return id >= 0 && id < cap && where[id] >= 0; },

      clear: function () {
        while (count > 0) pool.release(active[count - 1]);
      }
    };
    return pool;
  }

  DS.FX3DPool = { create: create };
})(window.DS);
