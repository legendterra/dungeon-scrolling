/* Shared entity plumbing: damage resolution, status effects, projectiles,
   pickups and chests. Everything here takes the game state `g` so no module
   needs a back-reference to the scene. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const M = DS.M;

  function makeEntity(x, y, w, h) {
    return {
      x: x, y: y, w: w, h: h,
      vx: 0, vy: 0,
      facing: 1,
      onGround: false,
      dead: false,
      hp: 1, maxHp: 1,
      hurtFlash: 0,
      frame: 0,
      status: { burn: 0, burnTick: 0, burnDamage: 0, chill: 0 }
    };
  }

  function centerX(e) { return e.x + e.w / 2; }
  function centerY(e) { return e.y + e.h / 2; }

  /* Is any part of a box inside the camera window? Monsters use this to decide
     whether they are allowed to act: an enemy that opens fire from off-screen
     is an unfair hit, because the player was never shown the thing that hit
     them. `margin` widens the window for anything that should wake up a little
     before it slides into view. */
  function onScreen(e, margin) {
    const m = margin || 0;
    const ox = DS.R.camOffsetX(), oy = DS.R.camOffsetY();
    return e.x + e.w > ox - m && e.x < ox + DS.C.W + m &&
           e.y + e.h > oy - m && e.y < oy + DS.C.H + m;
  }

  // --- damage ---------------------------------------------------------------

  /* opts: { crit, knockback, dir, element, procs, source, silent } */
  function damageEnemy(g, enemy, amount, opts) {
    if (enemy.dead || enemy.invuln > 0) return 0;
    opts = opts || {};

    /* A raised shield turns away light hits from the front. Heavy blows,
       skills, and anything landing from behind go straight through. */
    if (enemy.shieldUp && enemy.cfg && enemy.cfg.blocksFront && !opts.heavy && !opts.skill) {
      const fromFront = (opts.dir || 1) === -enemy.facing;
      if (fromFront) {
        enemy.hurtFlash = 3;
        enemy.painFace = 26;
        DS.Audio.play('block');
        DS.FX.burst(centerX(enemy) + enemy.facing * 6, centerY(enemy), 5,
                    ['#a8e4ff', '#ffffff'], { speed: 1.6, life: 10, grav: 0 });
        DS.FX.number(centerX(enemy), enemy.y - 2, 'BLOCK', '#a8e4ff');
        return 0;
      }
    }

    let dealt = Math.max(1, Math.round(amount * DS.Elements.damageScale(enemy)));
    const armor = DS.Elements.armorOf(enemy);
    if (armor && !(opts.procs && opts.procs.pierce)) {
      dealt = Math.max(1, dealt - armor);
    }

    enemy.hp -= dealt;
    enemy.hurtFlash = 6;
    enemy.painFace = 26;

    const dir = opts.dir || 1;
    if (opts.knockback) {
      enemy.vx += dir * opts.knockback * (enemy.heavy ? 0.35 : 1);
      if (enemy.onGround && !enemy.heavy) enemy.vy = -1.2;
    }

    const color = opts.crit ? '#fff0a8' : '#ffffff';
    DS.FX.number(centerX(enemy), enemy.y - 2, dealt, color, opts.crit ? 2 : 1);
    DS.FX.hit(centerX(enemy) + dir * 4, centerY(enemy), dir);
    DS.Audio.play(opts.crit ? 'crit' : 'hit');
    if (opts.crit) DS.R.shake(2.5);

    /* An elemental hit lands its status here, which is also where reactions
       fire. The power handed over is the hit's own damage scaled two ways: by
       the share of that damage which arrived as element (rarity-driven, see
       ELEMENT_SHARE) and by the wielder's Elemental Power, which only moves
       reactions. That is what turns "+damage" into a build decision. */
    const element = opts.element || (opts.procs && opts.procs.element);
    if (element && !opts.isChain) {
      const prow = (opts.elementShare != null ? opts.elementShare : 1)
                 * (opts.elemPower || 1);
      DS.Elements.apply(g, enemy, element, Math.max(1, dealt * prow));
    }
    // Remember what element is flowing through this kill — the loot roll
    // reads it so an elemental death drops elemental gifts.
    if (element) g.killElement = element;

    applyProcs(g, enemy, dealt, opts);

    if (enemy.hp <= 0) killEnemy(g, enemy);
    return dealt;
  }

  function applyProcs(g, enemy, dealt, opts) {
    const procs = opts.procs;
    if (!procs) return;

    if (procs.burn) {
      enemy.status.burn = procs.burn.frames;
      enemy.status.burnTick = procs.burn.tick;
      enemy.status.burnDamage = procs.burn.damage;
    }
    if (procs.chill) {
      enemy.status.chill = procs.chill.frames;
      enemy.status.chillSlow = procs.chill.slow;
    }
    if (procs.lifesteal && g.player) {
      const heal = dealt * procs.lifesteal;
      g.player.healPool = (g.player.healPool || 0) + heal;
      // Lifesteal accumulates and only pays out in whole hearts.
      while (g.player.healPool >= 6 && g.player.hp < g.player.stats.maxHp) {
        g.player.healPool -= 6;
        g.player.hp++;
        DS.FX.number(centerX(g.player), g.player.y - 4, '+1', '#c0303c');
        DS.Audio.play('heal');
      }
    }
    if (procs.chain && !opts.isChain) {
      chainTo(g, enemy, dealt * procs.chain.ratio, procs.chain, opts);
    }
  }

  function chainTo(g, from, amount, cfg, opts) {
    const hits = [];
    for (let i = 0; i < g.enemies.length && hits.length < cfg.targets; i++) {
      const other = g.enemies[i];
      if (other === from || other.dead) continue;
      if (M.dist(centerX(from), centerY(from), centerX(other), centerY(other)) > cfg.range) continue;
      hits.push(other);
    }
    for (let i = 0; i < hits.length; i++) {
      DS.FX.ring(centerX(hits[i]), centerY(hits[i]), 6, '#f2c14e', 1.2);
      damageEnemy(g, hits[i], amount, {
        dir: opts.dir, knockback: 0.6, isChain: true, crit: false
      });
    }
    DS.Audio.play('lightning');
  }

  function killEnemy(g, enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    g.kills++;
    DS.Boons.onKill(g);

    DS.FX.blood(centerX(enemy), centerY(enemy), enemy.facing, enemy.gore);
    DS.Audio.play('enemyDie');

    // Feedback scales with what died, so a mini-boss kill never feels like a slime.
    if (enemy.isBoss) {
      DS.R.punch(0.09); DS.R.flash('#ffffff', 12); g.hitstop = Math.max(g.hitstop, 24);
    } else if (enemy.tier === 'miniboss') {
      DS.R.punch(0.05); DS.R.flash('#c0303c', 8); g.hitstop = Math.max(g.hitstop, 14);
      DS.FX.ring(centerX(enemy), centerY(enemy), 16, '#c0303c', 2.4);
    } else if (enemy.tier === 'elite') {
      DS.R.punch(0.03); g.hitstop = Math.max(g.hitstop, 8);
      DS.FX.ring(centerX(enemy), centerY(enemy), 10, '#e8743b', 1.8);
    } else {
      g.hitstop = Math.max(g.hitstop, 2);
    }

    // A warden carries the way forward with it.
    if (enemy.gateWarden) {
      enemy.gateWarden.wardenDown = true;
      g.toast('THE WARDEN FALLS', '#f2c14e');
    }

    if (enemy.onDeath) enemy.onDeath(g, enemy);

    // Status still ticking on the corpse counts as an elemental kill for the
    // loot roll — burning to death from a torch pass still drops fire gifts.
    const st = enemy.status || {};
    const statusEl = st.burn > 0 ? 'fire' : st.chill > 0 ? 'ice'
      : st.shock > 0 ? 'shock' : st.poison > 0 ? 'poison'
      : st.root > 0 ? 'leaf' : null;
    const loot = DS.Loot.enemyLoot(g.rng, g.depth, enemy.tier || 'normal', g, statusEl);
    spawnLoot(g, centerX(enemy), centerY(enemy), loot);
  }

  function spawnLoot(g, x, y, loot) {
    for (let i = 0; i < loot.coins; i++) {
      if (i > 9) { break; } // cap the visual clutter; value folded below
      addPickup(g, x, y, 'coin', null, 1);
    }
    if (loot.coins > 10) addPickup(g, x, y, 'coin', null, loot.coins - 10);
    for (let i = 0; i < loot.shards; i++) addPickup(g, x, y, 'shard', null, 1);
    for (let i = 0; i < loot.hearts; i++) addPickup(g, x, y, 'heart', null, 1);
    if (loot.key) addPickup(g, x, y, 'key', null, 1);
    if (loot.item) addPickup(g, x, y, 'item', loot.item, 1);
    if (loot.item2) addPickup(g, x + (rng2() < 0.5 ? -10 : 10), y, 'item', loot.item2, 1);
    // Elemental deaths leave a patch of their element burning on the floor —
    // loot and theatre from the same signal.
    if (g.killElement && DS.Elements.FIELD_DEFS[g.killElement] && DS.R3D.voxels) {
      DS.Elements.spawnField(g, x, y + 6, g.killElement, 1);
    }
    g.killElement = null;
  }
  function rng2() { return Math.random(); }

  // --- status ticking -------------------------------------------------------

  // Status ticking lives in the element system now.
  function tickStatus(g, e) {
    DS.Elements.tick(g, e);
  }

  function tickStatusLegacy(g, e) {
    const s = e.status;

    if (s.burn > 0) {
      s.burn--;
      if (s.burn % s.burnTick === 0) {
        e.hp -= s.burnDamage;
        e.hurtFlash = 3;
        e.painFace = 26;
        DS.FX.number(centerX(e), e.y - 2, s.burnDamage, '#e8743b');
        if (e.hp <= 0) killEnemy(g, e);
      }
      if (DS.rand.chance(0.35)) {
        DS.FX.trail(centerX(e) + DS.rand.float(-4, 4), e.y + DS.rand.float(0, e.h), '#e8743b');
      }
    }

    if (s.chill > 0) {
      s.chill--;
      if (DS.rand.chance(0.2)) {
        DS.FX.trail(centerX(e) + DS.rand.float(-4, 4), e.y + DS.rand.float(0, e.h), '#a8e4ff');
      }
    }
  }

  function speedScale(e) {
    return DS.Elements.speedScale(e);
  }

  // --- projectiles ----------------------------------------------------------

  /* o: { x, y, vx, vy, damage, friendly, kind, element, procs, crit,
          gravity, life, pierce, sprite } */
  function spawnProjectile(g, o) {
    const p = makeEntity(o.x, o.y, o.w || 6, o.h || 6);
    p.vx = o.vx; p.vy = o.vy || 0;
    p.damage = o.damage;
    p.friendly = !!o.friendly;
    p.kind = o.kind || 'orb';
    p.element = o.element || null;
    p.procs = o.procs || null;
    p.crit = !!o.crit;
    p.gravity = o.gravity || 0;
    p.life = o.life || 120;
    p.pierce = o.pierce || 0;
    p.knockback = o.knockback == null ? 1.2 : o.knockback;
    p.facing = o.vx < 0 ? -1 : 1;
    p.trailColor = o.trailColor || null;
    g.projectiles.push(p);
    return p;
  }

  function updateProjectiles(g) {
    const map = g.map;

    for (let i = g.projectiles.length - 1; i >= 0; i--) {
      const p = g.projectiles[i];
      p.life--;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.frame++;

      if (p.trailColor && p.frame % 2 === 0) {
        DS.FX.trail(centerX(p), centerY(p), p.trailColor);
      }

      const tx = Math.floor(centerX(p) / T);
      const ty = Math.floor(centerY(p) / T);

      if (p.life <= 0 || map.isSolid(tx, ty) || p.x < -32 || p.x > map.pixelW + 32 || p.y < -32 || p.y > map.pixelH + 32) {
        impact(g, p);
        g.projectiles.splice(i, 1);
        continue;
      }

      if (p.friendly) {
        let consumed = false;
        for (let j = 0; j < g.enemies.length; j++) {
          const e = g.enemies[j];
          if (e.dead || !M.overlap(p, e)) continue;
          damageEnemy(g, e, p.damage, {
            crit: p.crit, knockback: p.knockback,
            dir: M.sign(p.vx) || 1, procs: p.procs, element: p.element,
            elementShare: p.elementShare, elemPower: p.elemPower
          });
          if (p.pierce > 0) { p.pierce--; }
          else { consumed = true; }
          break;
        }
        if (consumed) {
          impact(g, p);
          g.projectiles.splice(i, 1);
        }
      } else if (g.player && !g.player.dead && M.overlap(p, g.player)) {
        g.player.hurt(g, p.damage, M.sign(p.vx) || 1);
        impact(g, p);
        g.projectiles.splice(i, 1);
      }
    }
  }

  function impact(g, p) {
    const colors = p.element === 'ice' ? ['#a8e4ff', '#4fb3e0']
                 : p.element === 'lightning' ? ['#fff0a8', '#f2c14e']
                 : p.kind === 'arrow' ? ['#9b96b8', '#5c3f2a']
                 : ['#e8743b', '#f2c14e'];
    DS.FX.burst(centerX(p), centerY(p), 6, colors, { speed: 1.4, life: 10, grav: 0.05 });
    DS.Audio.play(p.kind === 'arrow' ? 'arrowHit' : 'hit');
  }

  function drawProjectiles(g) {
    const R = DS.R, S = DS.SPR;
    for (let i = 0; i < g.projectiles.length; i++) {
      const p = g.projectiles[i];
      if (p.kind === 'arrow') {
        const flip = p.vx < 0;
        const spr = flip ? S.flip.arrow : S.arrow;
        /* An aimed shot travels at an angle, so the arrow is rotated to its own
           velocity. The mirrored sprite is rotated by the mirrored angle, or a
           leftward arrow would point back down its own flight path. */
        const angle = Math.atan2(p.vy, flip ? -p.vx : p.vx);
        if (Math.abs(angle) < 0.08) R.spr(spr, p.x - 1, p.y - 1);
        else R.sprRot(spr, p.x + 3, p.y + 1, angle, flip);
      } else {
        const elem = p.element || (p.friendly ? 'fire' : 'dark');
        const spr = S.orb[elem] || S.orb.fire;
        if (elem === 'water') {
          DS.Map.glow(R, p.x + 3, p.y + 3, 12, 'rgba(56,189,248,0.35)');
          if (p.frame % 3 === 0) {
            DS.FX.spark(p.x + 3, p.y + 3, 1, '#7dd3fc');
          }
        } else if (elem === 'holy' || elem === 'lightning') {
          DS.Map.glow(R, p.x + 3, p.y + 3, 12, 'rgba(255,240,168,0.30)');
        } else if (elem === 'fire') {
          DS.Map.glow(R, p.x + 3, p.y + 3, 12, 'rgba(232,116,59,0.32)');
        }
        R.spr(spr, p.x - 1, p.y - 1);
      }
    }
  }

  // --- pickups --------------------------------------------------------------

  function addPickup(g, x, y, kind, item, value) {
    /* Keys and weapons are run-critical, so they never drop into a pit — if the
       column has no floor the drop is nudged to the nearest ground. */
    if ((kind === 'key' || kind === 'item') && g.map) {
      const T2 = DS.C.TILE;
      /* groundBelow, not floorBelow(tx, 0): in a cave the first solid from the
         sky is the ROOF, so the "is there a floor here" test passed for every
         column and drops were left to fall into the dark. */
      if (g.map.groundBelow(Math.floor(x / T2)) >= g.map.pixelH) {
        for (let step = 1; step < 24; step++) {
          for (let side = -1; side <= 1; side += 2) {
            const tx = Math.floor(x / T2) + step * side;
            const floor = g.map.groundBelow(tx);
            if (floor < g.map.pixelH) { x = tx * T2 + 8; y = floor - 12; step = 99; break; }
          }
        }
      }
    }

    const sizes = { coin: 6, heart: 8, shard: 7, key: 8, item: 12 };
    const size = sizes[kind] || 8;
    const p = makeEntity(x - size / 2, y - size / 2, size, size);
    p.kind = kind;
    p.item = item || null;
    p.value = value || 1;
    p.vx = DS.rand.float(-1.1, 1.1);
    p.vy = DS.rand.float(-2.4, -1.2);
    p.life = 60 * 60;      // pickups expire after a minute so levels stay clean
    p.magnetDelay = 22;    // brief delay before it flies to the player
    g.pickups.push(p);
    return p;
  }

  function updatePickups(g) {
    const player = g.player;

    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const p = g.pickups[i];
      p.life--;
      p.frame++;

      if (p.magnetDelay > 0) {
        p.magnetDelay--;
        DS.Phys.step(p, g.map, 0.8);
        p.vx *= 0.94;
      } else if (player && !player.dead) {
        const d = M.dist(centerX(p), centerY(p), centerX(player), centerY(player));
        // Items are picked up deliberately with E; currency flies to you.
        if (p.kind !== 'item' && d < 42) {
          const ax = (centerX(player) - centerX(p)) / Math.max(1, d);
          const ay = (centerY(player) - centerY(p)) / Math.max(1, d);
          p.vx = M.approach(p.vx, ax * 3.4, 0.4);
          p.vy = M.approach(p.vy, ay * 3.4, 0.4);
          p.x += p.vx; p.y += p.vy;
        } else {
          DS.Phys.step(p, g.map, 0.8);
          p.vx *= 0.9;
        }
      }

      if (p.life <= 0) { g.pickups.splice(i, 1); continue; }

      if (player && !player.dead && M.overlap(p, player) && p.kind !== 'item') {
        collect(g, p);
        g.pickups.splice(i, 1);
      }
    }
  }

  function collect(g, p) {
    const inv = g.inv;
    if (p.kind === 'coin') {
      const got = DS.Inv.addCoins(inv, p.value, g.player.stats);
      g.player.coinPop = 20;
      DS.FX.number(centerX(p), p.y, '+' + got, '#f2c14e');
      DS.Audio.play('coin');
    } else if (p.kind === 'shard') {
      inv.shards += p.value;
      DS.FX.number(centerX(p), p.y, '+' + p.value, '#a8e4ff');
      DS.Audio.play('shard');
    } else if (p.kind === 'key') {
      inv.keys += p.value;
      DS.FX.number(centerX(p), p.y, 'KEY', '#f2c14e');
      DS.Audio.play('pickup');
    } else if (p.kind === 'heart') {
      if (g.player.hp < g.player.stats.maxHp) {
        g.player.hp = Math.min(g.player.stats.maxHp, g.player.hp + p.value);
        DS.FX.number(centerX(p), p.y, '+' + p.value, '#c0303c');
      } else {
        DS.Inv.addCoins(inv, 3, g.player.stats);
      }
      DS.Audio.play('heal');
    }
  }

  /* The two rarities worth extra weight: the ones you would cross a room for.

     item.rarity is an INDEX into Weapons.RARITY, not a name — keying a set of
     names straight off it matched nothing, which is why no drop ever carried a
     floor ring or a tag. */
  const RARE_KEYS = { epic: true, legendary: true };

  function rarityKey(item) {
    const cfg = (item && DS.Weapons.RARITY) ? DS.Weapons.RARITY[item.rarity] : null;
    return cfg ? cfg.key : null;
  }

  function isRareDrop(p) {
    return p.kind === 'item' && !!p.item && !!RARE_KEYS[rarityKey(p.item)];
  }

  function drawPickups(g) {
    const R = DS.R, S = DS.SPR;
    for (let i = 0; i < g.pickups.length; i++) {
      const p = g.pickups[i];
      const bob = Math.sin(p.frame * 0.12) * 1.5;

      // Blink out over the last second of life.
      if (p.life < 60 && Math.floor(p.life / 5) % 2 === 0) continue;

      // Without the voxel layer these sprites ARE the drop, so the floor glow
      // under each one is what makes a coin findable in a dark room.
      if (p.kind === 'coin') {
        DS.Map.glow(R, centerX(p), p.y + p.h + bob, 12, 'rgba(212,160,70,0.30)');
        R.spr(S.coin, p.x, p.y + bob);
      } else if (p.kind === 'heart') {
        DS.Map.glow(R, centerX(p), p.y + p.h + bob, 12, 'rgba(192,48,60,0.26)');
        R.spr(S.heart, p.x, p.y + bob);
      } else if (p.kind === 'shard') {
        DS.Map.glow(R, centerX(p), p.y + p.h + bob, 12, 'rgba(79,179,224,0.28)');
        R.spr(S.shard, p.x, p.y + bob);
      } else if (p.kind === 'key') {
        DS.Map.glow(R, centerX(p), centerY(p) + bob, 20, 'rgba(242,193,78,0.30)');
        R.spr(S.key, p.x, p.y + bob);
      } else if (p.kind === 'item') {
        const color = DS.Weapons.rarityColor(p.item.rarity);
        const rare = isRareDrop(p);
        DS.Map.glow(R, centerX(p), centerY(p) + bob, rare ? 26 : 18, hexToGlow(color));
        R.spr(S.itemIcon(p.item), p.x, p.y + bob);
        // A ring on the floor for the rarities worth a detour.
        if (rare) {
          R.arc(centerX(p), p.y + p.h + 1, 9 + Math.sin(p.frame * 0.08),
                Math.PI * 1.1, Math.PI * 1.9, color, 1);
          R.arc(centerX(p), p.y + p.h + 1, 9 - Math.sin(p.frame * 0.08),
                0.1, 0.9, color, 1);
        }
      }
    }
  }

  /* The tag over a drop worth crossing the room for.

     Glow tells you something dropped; only a name tells you WHICH thing, and
     on a busy floor the difference between an epic and a common is the only
     reason to change course. Epic and legendary only — a label on every coin
     is noise. Drawn in both render modes: the 2D canvas sits over the 3D one,
     so the tag floats over the model either way. */
  function drawDropLabels(g) {
    const R = DS.R;
    if (!g.pickups || !DS.Weapons.RARITY) return;
    for (let i = 0; i < g.pickups.length; i++) {
      const p = g.pickups[i];
      if (!isRareDrop(p)) continue;
      const cfg = DS.Weapons.RARITY[p.item.rarity];
      // Matches the drop's own expire blink rather than floating over a ghost.
      if (p.life < 60 && Math.floor(p.life / 5) % 2 === 0) continue;

      const label = (cfg.label || cfg.key).toUpperCase();
      const w = R.textSmallWidth(label);
      const bob = Math.sin(p.frame * 0.06) * 1.5;
      // textSmall is a SCREEN-space call — the world position has to go through
      // the camera first, or the tag lands wherever the camera happens to be.
      const x = Math.round(R.toScreenX(p.x + p.w * 0.5) - w / 2);
      const y = Math.round(R.toScreenY(p.y) - 13 + bob);
      R.textSmall(label, x, y, cfg.color || '#ffffff');
    }
  }

  /* The player's own name, floating over the head it belongs to. It lives here,
     beside the drop tags, and is called in BOTH render modes: when voxel models
     are live the 2D sprite pass is skipped entirely, so a label drawn from the
     player's own draw() would simply never appear. */
  function drawNameTag(g) {
    if (!DS.Board || !g.player || !DS.Board.hasName()) return;
    const R = DS.R, p = g.player;
    const name = DS.Board.name;
    const w = R.textSmallWidth(name);
    R.textSmall(name, Math.round(R.toScreenX(p.x + p.w * 0.5) - w / 2),
                Math.round(R.toScreenY(p.y) - 10), '#f2c14e');
  }

  function hexToGlow(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',0.22)';
  }

  // --- chests ---------------------------------------------------------------

  function makeChest(g, x, y, tier) {
    const c = makeEntity(x, y + 5, 14, 11);
    c.tier = tier;
    c.opened = false;
    c.cfg = DS.Loot.CHEST_TIERS[tier];
    g.chests.push(c);
    return c;
  }

  function openChest(g, chest) {
    if (chest.opened) return { ok: false };

    /* Vault chests are welded shut for as long as the room's warden is alive.
       No key opens them and no lockpick boon skips them - the fight is the
       key. */
    if (chest.sealed) {
      DS.Audio.play('locked');
      DS.R.shake(1);
      DS.FX.ring(centerX(chest), centerY(chest), 10, '#c0303c', 1.2);
      g.toast('SEALED - KILL THE WARDEN', '#c0303c');
      return { ok: false, reason: 'sealed' };
    }

    if (chest.cfg.locked && g.inv.keys <= 0) {
      DS.Audio.play('locked');
      g.toast('NEED A KEY', '#c0303c');
      return { ok: false, reason: 'locked' };
    }
    if (chest.cfg.locked) g.inv.keys--;

    chest.opened = true;
    const loot = DS.Loot.chestLoot(g.rng, g.depth, chest.tier, g);

    DS.Audio.play('chestOpen');
    DS.R.shake(2);
    DS.FX.burst(centerX(chest), chest.y, 18, ['#f2c14e', '#fff0a8', '#ffffff'],
                { speed: 2.2, life: 24, grav: 0.08 });

    spawnLoot(g, centerX(chest), chest.y - 4, {
      coins: loot.coins, shards: loot.shards, hearts: 0, key: false, item: null
    });
    for (let i = 0; i < loot.items.length; i++) {
      addPickup(g, centerX(chest), chest.y - 6, 'item', loot.items[i], 1);
    }

    if (chest.cfg.ambush) g.spawnAmbush(centerX(chest), chest.y, chest.cfg.ambush);
    return { ok: true };
  }

  function drawChests(g) {
    const R = DS.R, S = DS.SPR;
    for (let i = 0; i < g.chests.length; i++) {
      const c = g.chests[i];
      const art = S.chest[c.tier];
      R.spr(c.opened ? art.open : art.closed, c.x, c.y);
      if (!c.opened && c.tier === 'cursed') {
        DS.Map.glow(R, centerX(c), centerY(c), 20, 'rgba(200,110,224,0.16)');
      }

      /* A sealed chest has to look sealed from across the room, or the player
         walks the length of the vault to be told no. Iron bands and a lock,
         pulsing so it reads as held shut by something rather than rusted. */
      if (c.sealed) {
        const pulse = 0.55 + Math.sin(g.frames * 0.08) * 0.2;
        R.rect(c.x - 1, c.y + 2, c.w + 2, 2, '#6f6a90');
        R.rect(c.x - 1, c.y + 7, c.w + 2, 2, '#6f6a90');
        R.rect(centerX(c) - 2, c.y + 1, 4, 9, '#3a3654');
        R.rect(centerX(c) - 1, c.y + 4, 2, 3,
               'rgba(192,48,60,' + pulse.toFixed(2) + ')');
        DS.Map.glow(R, centerX(c), centerY(c), 16, 'rgba(192,48,60,0.14)');
      }
    }
  }

  DS.Ent = {
    make: makeEntity,
    centerX: centerX,
    centerY: centerY,
    onScreen: onScreen,
    damageEnemy: damageEnemy,
    killEnemy: killEnemy,
    tickStatus: tickStatus,
    speedScale: speedScale,
    spawnProjectile: spawnProjectile,
    updateProjectiles: updateProjectiles,
    drawProjectiles: drawProjectiles,
    addPickup: addPickup,
    updatePickups: updatePickups,
    drawPickups: drawPickups,
    makeChest: makeChest,
    drawDropLabels: drawDropLabels,
    drawNameTag: drawNameTag,
    openChest: openChest,
    drawChests: drawChests,
    spawnLoot: spawnLoot
  };
})(window.DS);
