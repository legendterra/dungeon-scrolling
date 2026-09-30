/* Arenas: what a boss fights in.

   Every boss room used to be one flat box, whoever was in it. Now each boss has a
   room to suit the way it fights, and three more of them hold a vault:

     boss rooms   a flat hall with ledges put in to suit the boss. Every ledge is
                  DESIGNED (tilemap.js): it hangs in the air on purpose, and the
                  tidy-up passes after the build leave it where it was put. They
                  stand three tiles above the floor and the tall ones climb by
                  threes, which the hero's jump and air jump clear.
     the vault    the far end of a floor whose map names a floor boss (`floorBoss`
                  in its definition): a chamber twenty columns of arena, a portcullis
                  under a solid lintel, and behind the bars two sealed chests and the
                  door onward. Killing the boss is what opens the bars
                  (game.js onFloorBossDown). Medusa's has stone pillars two tiles
                  tall: her gaze stops at a wall, and a pillar is the wall. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;

  const VAULT_W = 40;                // the chamber is two rooms wide
  const VAULT_ROOMS = 2;
  const GATE_AT = 28;                // the portcullis, in columns from the chamber's start
  const BOSS_AT = 13;                // where the boss stands, likewise
  const BARS = 5;                    // the portcullis is five tiles tall

  /* A designed ledge: columns x0..x1, `h` tiles above the floor's surface. */
  function ledge(map, floorRow, x0, x1, h) {
    for (let x = x0; x <= x1; x++) map.setDesigned(x, floorRow - h, TILE.PLATFORM);
  }

  /* [x0, x1, height] in columns of the 40-wide boss room. */
  const ROOMS = {
    warden:  [[8, 12, 3], [27, 31, 3]],
    king:    [[17, 22, 3]],
    arbiter: [[6, 10, 4], [29, 33, 4]],
    wyrm:    [[10, 12, 3], [18, 21, 3], [27, 29, 3]],
    hades:   [[5, 9, 3], [17, 22, 3], [30, 34, 3]],
    zeus:    [[4, 7, 3], [11, 14, 6], [18, 22, 9], [25, 28, 6], [32, 35, 3]],
    lich:    [[8, 11, 3], [18, 21, 3], [28, 31, 3]],
    magma:   [[10, 13, 3], [26, 29, 3]]
  };

  /* Dress a boss room for the boss that will stand in it. */
  function decorate(map, key, floorRow) {
    const list = ROOMS[key];
    if (!list) return 0;
    for (let i = 0; i < list.length; i++) ledge(map, floorRow, list[i][0], list[i][1], list[i][2]);
    return list.length;
  }

  // --- the vault --------------------------------------------------------------

  /* What each floor boss's chamber has in it, in columns from its start:
     ledges [x0, x1, height], and solid blocks [x0, x1, height] standing on the floor. */
  const VAULTS = {
    minotaur: { ledges: [[3, 7, 3], [20, 24, 3]], blocks: [] },
    medusa:   { ledges: [], blocks: [[8, 9, 2], [15, 16, 2], [22, 23, 2]] },
    talos:    { ledges: [[5, 9, 3], [17, 21, 3]], blocks: [] }
  };

  /* The chamber's template: torches and the door only. The bars, the lintel over them
     and the chests are put in by furnishVault, once the room is on the map. */
  function vaultRows() {
    const blank = new Array(VAULT_W + 1).join('.');
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push(blank);
    const put = function (r, x, ch) { rows[r] = rows[r].slice(0, x) + ch + rows[r].slice(x + 1); };
    put(7, 3, 'T');
    put(7, 24, 'T');
    put(7, 33, 'T');
    put(9, 38, 'D');
    const solid = new Array(VAULT_W + 1).join('#');
    rows[10] = solid;
    rows[11] = solid;
    return rows;
  }

  /* Put the fight and its prize into a chamber decoded at column x0. `floorRow` is the
     first solid row of the floor. */
  function furnishVault(map, out, key, x0, floorRow) {
    const F = floorRow;
    const gx = x0 + GATE_AT;

    // The lintel: rock from the top of the map down to the bars, so nobody jumps them.
    for (let ty = 0; ty < F - BARS; ty++) map.set(gx, ty, TILE.WALL);
    const gate = {
      kind: 'gate', barrier: true,
      x: gx * T, y: (F - BARS) * T, closedY: (F - BARS) * T,
      w: T, h: BARS * T,
      solid: true, open: false, openTimer: 0, lift: 0
    };
    map.solids.push(gate);
    out.bossGate = gate;

    // The prize, welded shut until the boss is down.
    out.chests.push({ x: (gx + 3) * T, y: (F - 1) * T, sealed: true, tier: 'vault' });
    out.chests.push({ x: (gx + 7) * T, y: (F - 1) * T, sealed: true });

    const plan = VAULTS[key];
    if (plan) {
      for (let i = 0; i < plan.ledges.length; i++) {
        const l = plan.ledges[i];
        ledge(map, F, x0 + l[0], x0 + l[1], l[2]);
      }
      for (let i = 0; i < plan.blocks.length; i++) {
        const b = plan.blocks[i];
        for (let x = x0 + b[0]; x <= x0 + b[1]; x++) {
          for (let h = 1; h <= b[2]; h++) map.setDesigned(x, F - h, TILE.WALL);
        }
      }
    }

    out.boss = { key: key, x: (x0 + BOSS_AT) * T, y: F * T };
    out.arena = { x0: (x0 + 1) * T, x1: gx * T };
    return gate;
  }

  /* Who the trial holds. The Arbiter judges in the first two acts; in the Arena of Heroes it is a
     bull. An endless depth answers as the depth it echoes. */
  function trialBoss(depth) {
    const act = DS.Maps && DS.Maps.actOfDepth ? DS.Maps.actOfDepth(depth) : 1;
    return act === 3 ? 'minotaur' : 'arbiter';
  }

  DS.Arena = {
    trialBoss: trialBoss,
    decorate: decorate,
    vaultRows: vaultRows,
    furnishVault: furnishVault,
    ROOMS: ROOMS,
    VAULTS: VAULTS,
    VAULT_ROOMS: VAULT_ROOMS,
    VAULT_W: VAULT_W,
    GATE_AT: GATE_AT
  };
})(window.DS);
