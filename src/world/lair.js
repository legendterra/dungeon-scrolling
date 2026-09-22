/* The Black Room: the one chamber on a floor where the torches are dead and the
   only light comes from BEHIND you — a rift torn in the far wall.

   This is the one place in the game where the lighting is the mechanic instead
   of the decoration. Everything else is lit from the front, so a monster is a
   lit shape you read directly; here every monster is a silhouette with a rim of
   light around it, and the tells you rely on (glowing eyes, a lit bomb fuse, a
   staff's orb) are the only things you can see clearly.

   A room, not a whole floor: the corridor before it teaches you what normal
   brightness is, and walking out of it should feel like surfacing. It is
   therefore placed in ONE room of a floor, never the first (you need somewhere
   to arrive from) and never on the tutorial floors or in a safe/trial/boss
   room, where the mood would fight what the room is for. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const T = 16;

  /* How often a floor carries one, by depth. Rare at first — the early floors
     still have to teach the ordinary game — then roughly one floor in three. */
  function chanceFor(depth) {
    if (DS.Difficulty && DS.Difficulty.isTutorial(depth)) return 0;
    if (depth < 3) return 0;
    if (depth < 6) return 0.30;
    return 0.42;
  }

  function allowed(g, kind) {
    if (!g || !g.map) return false;
    if (kind === 'safe' || kind === 'trial' || kind === 'boss') return false;
    /* A floor that is already pitch dark (the DARKNESS modifier) gains nothing
       from a room that is dark on purpose. */
    if (DS.Modifiers && DS.Modifiers.has && DS.Modifiers.has(g, 'darkness')) return false;
    return true;
  }

  /* The zone, or null. Deterministic per floor: it rides the level's own rng
     seed so a seed replays with the black room in the same place. */
  function maybe(g, kind) {
    if (!allowed(g, kind)) return null;
    if (!DS.Difficulty) return null;
    const depth = g.depth || 1;
    if (!DS.rand.chance(chanceFor(depth))) return null;

    const map = g.map;
    const roomW = 16;                       // ROOM_W: the generator's room width
    const rooms = Math.max(1, Math.floor(map.w / roomW));
    if (rooms < 3) return null;

    /* The middle room, never the first or the last: you walk in, and you walk
       out through the far door. */
    const roomIndex = 1 + Math.floor(DS.rand.float(rooms - 2));
    const x0 = roomIndex * roomW;
    const x1 = Math.min(map.w - 1, x0 + roomW - 1);

    /* The floor row of the zone: the highest solid surface across the room, so
       the rift is placed against the wall the room actually has. */
    let floorRow = -1;
    for (let tx = x0 + 1; tx < x1 && floorRow < 0; tx++) {
      const y = map.groundBelow ? map.groundBelow(tx) : null;
      if (y != null && y < map.pixelH) floorRow = Math.floor(y / T);
    }
    if (floorRow < 2) return null;

    return {
      x0: x0, x1: x1,
      y0: Math.max(0, floorRow - 9), y1: floorRow,
      floorRow: floorRow,
      /* Where the rift burns, in world px: the middle of the room's far wall. */
      riftX: ((x0 + x1) * 0.5) * T,
      riftY: (floorRow - 3) * T
    };
  }

  /* Which room the player is standing in, and how deep inside it are they?
     0 outside, 1 fully inside.

     The ramp used to be 12 world pixels -- three quarters of a tile -- so the
     mood swung from normal to black in about a tenth of a second and read as
     the game glitching rather than as a room you walked into. The margin is a
     room's approach now (8 tiles), and the threshold has hysteresis: you are
     "inside" once you are a third of the way in and stop being inside only
     after backing most of the way out, so standing on the boundary cannot make
     the room flicker. */
  const RAMP = 8 * T;        // 128 world px of approach
  const ENTER = 0.34;
  const EXIT = 0.16;

  function rawDepth(g, lair) {
    if (!lair || !g.player) return 0;
    const px = DS.Ent.centerX(g.player);
    const py = DS.Ent.centerY(g.player);
    if (px < lair.x0 * T || px > (lair.x1 + 1) * T) return 0;
    if (py < lair.y0 * T || py > (lair.y1 + 2) * T) return 0;
    const dx = Math.min(px - lair.x0 * T, (lair.x1 + 1) * T - px);
    const dy = Math.min(py - lair.y0 * T, (lair.y1 + 2) * T - py);
    return M.clamp(Math.min(dx, dy) / RAMP, 0, 1);
  }

  function depthIn(g, lair) {
    const raw = rawDepth(g, lair);
    const was = !!g.lairInside;
    let inside = was;
    if (!was && raw >= ENTER) inside = true;
    else if (was && raw <= EXIT) inside = false;
    g.lairInside = inside;
    if (!inside) return raw * (EXIT / Math.max(ENTER, 0.0001));
    return M.clamp(raw, 0, 1);
  }

  function inside(g, lair) {
    return depthIn(g, lair) > 0.5;
  }

  DS.Lair = {
    maybe: maybe,
    depthIn: depthIn,
    inside: inside,
    chanceFor: chanceFor
  };
})(window.DS);
