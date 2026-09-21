/* Tile collision. Entities are axis-aligned boxes {x, y, w, h, vx, vy}.
   Movement is resolved one axis at a time, which is what makes wall-sliding and
   landing behave predictably.

   Besides the tile grid, a map may carry `solids`: a list of dynamic boxes
   (pushable crates, closed gates) that block movement the same way walls do. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const M = DS.M;

  // Largest step we resolve in one go. Anything faster is subdivided so a fast
  // projectile can never tunnel through a one-tile wall.
  const MAX_STEP = T - 2;

  function tileRange(lo, hi) {
    return { from: Math.floor(lo / T), to: Math.floor((hi - 0.0001) / T) };
  }

  function solidOverlap(map, x, y, w, h) {
    const cols = tileRange(x, x + w);
    const rows = tileRange(y, y + h);
    for (let ty = rows.from; ty <= rows.to; ty++) {
      for (let tx = cols.from; tx <= cols.to; tx++) {
        if (map.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  // First dynamic solid overlapping the box, ignoring the mover itself.
  function dynamicBlock(map, x, y, w, h, ignore) {
    const list = map.solids;
    if (!list || !list.length) return null;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.solid || s === ignore) continue;
      if (M.rectsOverlap(x, y, w, h, s.x, s.y, s.w, s.h)) return s;
    }
    return null;
  }

  /* One-way platforms only stop an entity that is falling and whose feet were
     at or above the platform surface before the move. */
  function platformLanding(map, e, prevBottom, nextBottom) {
    const cols = tileRange(e.x, e.x + e.w);
    const rowFrom = Math.floor(prevBottom / T);
    const rowTo = Math.floor((nextBottom - 0.0001) / T);

    for (let ty = rowFrom; ty <= rowTo; ty++) {
      const surface = ty * T;
      if (prevBottom > surface + 0.5) continue;
      if (nextBottom < surface) continue;
      for (let tx = cols.from; tx <= cols.to; tx++) {
        if (map.isPlatform(tx, ty)) return surface;
      }
    }
    return null;
  }

  function moveX(e, map, amount) {
    let remaining = amount;
    let hit = false;

    while (Math.abs(remaining) > 0.0001) {
      const step = M.clamp(remaining, -MAX_STEP, MAX_STEP);
      remaining -= step;
      const nextX = e.x + step;

      if (solidOverlap(map, nextX, e.y, e.w, e.h)) {
        // Snap flush against the wall face we ran into.
        if (step > 0) e.x = Math.floor((nextX + e.w) / T) * T - e.w - 0.001;
        else e.x = Math.floor(nextX / T) * T + T + 0.001;
        hit = true;
        e.blockedBy = null;
        break;
      }

      const box = dynamicBlock(map, nextX, e.y, e.w, e.h, e);
      if (box) {
        e.x = step > 0 ? box.x - e.w - 0.001 : box.x + box.w + 0.001;
        e.blockedBy = box;
        hit = true;
        break;
      }

      e.x = nextX;
    }

    if (hit) e.vx = 0;
    else e.blockedBy = null;
    return hit;
  }

  function moveY(e, map, amount) {
    let remaining = amount;
    let hit = false;
    e.onGround = false;

    while (Math.abs(remaining) > 0.0001) {
      const step = M.clamp(remaining, -MAX_STEP, MAX_STEP);
      remaining -= step;
      const nextY = e.y + step;

      if (solidOverlap(map, e.x, nextY, e.w, e.h)) {
        if (step > 0) {
          e.y = Math.floor((nextY + e.h) / T) * T - e.h - 0.001;
          e.onGround = true;
        } else {
          e.y = Math.floor(nextY / T) * T + T + 0.001;
        }
        hit = true;
        break;
      }

      const box = dynamicBlock(map, e.x, nextY, e.w, e.h, e);
      if (box) {
        if (step > 0) { e.y = box.y - e.h - 0.001; e.onGround = true; e.standingOn = box; }
        else e.y = box.y + box.h + 0.001;
        hit = true;
        break;
      }

      if (step > 0 && !e.dropThrough) {
        const surface = platformLanding(map, e, e.y + e.h, nextY + e.h);
        if (surface !== null) {
          e.y = surface - e.h - 0.001;
          e.onGround = true;
          hit = true;
          break;
        }
      }

      e.y = nextY;
    }

    if (hit) e.vy = 0;
    return hit;
  }

  /* Standard falling body: gravity, terminal velocity, then both axes.
     Entities that fly (bats, projectiles) skip this and move themselves. */
  function step(e, map, gravityScale) {
    const g = DS.C.GRAVITY * (gravityScale == null ? 1 : gravityScale);
    e.vy = Math.min(e.vy + g, DS.C.MAX_FALL);
    e.standingOn = null;
    moveX(e, map, e.vx);
    moveY(e, map, e.vy);
  }

  // True when the entity has solid ground (or a platform) directly underfoot.
  function grounded(map, e) {
    if (solidOverlap(map, e.x, e.y + 1, e.w, e.h)) return true;
    if (dynamicBlock(map, e.x, e.y + 1, e.w, e.h, e)) return true;
    return platformLanding(map, e, e.y + e.h, e.y + e.h + 1) !== null;
  }

  /* Used by enemy AI to stop walking off ledges: is there floor just ahead? */
  function floorAhead(map, e, dir) {
    const probeX = dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const tx = Math.floor(probeX / T);
    const ty = Math.floor((e.y + e.h + 2) / T);
    return map.isSolid(tx, ty) || map.isPlatform(tx, ty);
  }

  function wallAhead(map, e, dir) {
    const probeX = dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const tx = Math.floor(probeX / T);
    const top = Math.floor((e.y + 2) / T);
    const bottom = Math.floor((e.y + e.h - 2) / T);
    for (let ty = top; ty <= bottom; ty++) {
      if (map.isSolid(tx, ty)) return true;
    }
    return false;
  }

  DS.Phys = {
    moveX: moveX,
    moveY: moveY,
    step: step,
    grounded: grounded,
    floorAhead: floorAhead,
    wallAhead: wallAhead,
    solidOverlap: solidOverlap,
    dynamicBlock: dynamicBlock
  };
})(window.DS);
