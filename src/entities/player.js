/* The player: movement, jump feel, dash, and every weapon's attack.

   Attacking has two shapes, chosen by the weapon's holdMode:
     melee  — a tap swings immediately; keep holding and you wind up a heavy
              blow that lands when you release
     ranged — nothing leaves the weapon until you release, and a longer draw
              hits harder and flies faster

   Melee hitboxes stay active for a window of frames rather than testing a
   single instant, so a swing that visually connects actually connects. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;
  const Ent = DS.Ent;
  const W = DS.Weapons;

  const COYOTE = 6;      // frames of grace after walking off a ledge
  const JUMP_BUFFER = 6; // frames a jump press stays queued before landing
  const DASH_FRAMES = 12;
  const DASH_SPEED = 4.2;
  const DASH_IFRAMES = 10;
  const DASH_COOLDOWN = 34;
  const AIR_JUMPS = 1;

  /* The mini dash on right click is a separate, cheaper mobility tool: two
     charges that both come back together after a two second recharge, so it is
     a burst of repositioning rather than a constant drip. */
  const MINI_CHARGES = 2;
  const MINI_RECHARGE = 120;   // 2 seconds at 60fps
  const MINI_FRAMES = 7;
  const MINI_SPEED = 3.1;
  const MINI_IFRAMES = 5;
  const MINI_STAMINA = 8;

  /* Shield is denominated finer than hearts so armour can absorb a fraction of
     a hit; six shield points equal one heart. */
  const SHIELD_PER_HEART = 6;
  const SHIELD_DELAY = 360;      // 6 seconds of calm before it comes back
  const SHIELD_RATE = 1 / 20;    // one point every 20 frames

  // How far the hitbox reaches back into the player's own body, so an enemy
  // pressed right up against you is never inside a blind spot.
  const BODY_OVERLAP = 5;

  function create(x, y, inv) {
    const p = Ent.make(x, y - 14, 8, 14);
    p.inv = inv;
    p.stats = DS.Inv.derive(inv);
    p.hp = p.stats.maxHp;
    p.shield = p.stats.shield;
    p.shieldTimer = 0;
    p.doll = DS.Paperdoll.buildSet(inv.armor);
    p.stamina = p.stats.maxStamina;
    p.mana = p.stats.maxMana;

    p.coyote = 0;
    p.jumpBuffer = 0;
    p.iframes = 0;
    p.attackCooldown = 0;
    p.attackActive = 0;
    p.swingTimer = 0;
    p.swingMax = 1;
    p.attackDir = 1;
    p.attackHeavy = false;
    p.comboStep = 0;
    p.comboWindow = 0;
    p.holdFrames = 0;
    p.charging = false;
    p.hitList = [];
    p.pending = null;
    p.dashFrames = 0;
    p.dashCooldown = 0;
    p.dashesLeft = p.stats.dashCharges;
    p.miniLeft = MINI_CHARGES;
    p.miniTimer = 0;
    p.miniActive = false;
    p.skillCooldown = 0;
    p.ultCooldown = 0;
    p.routine = null;
    p.airJumpsLeft = AIR_JUMPS;
    p.animTimer = 0;
    p.healPool = 0;
    p.coinPop = 0;
    p.inWater = false;
    p.onRope = false;
    p.maxBreath = 60 * 14;
    p.breath = p.maxBreath;

    p.refreshStats = function () {
      const before = p.stats.maxHp;
      p.stats = DS.Inv.derive(inv);
      // Gaining max hearts from a suffix grants the new hearts filled.
      if (p.stats.maxHp > before) p.hp += (p.stats.maxHp - before);
      p.hp = M.clamp(p.hp, 0, p.stats.maxHp);
      p.stamina = Math.min(p.stamina, p.stats.maxStamina);
      p.mana = Math.min(p.mana, p.stats.maxMana);
      p.dashesLeft = Math.min(p.dashesLeft, p.stats.dashCharges);
      p.shield = Math.min(p.shield || 0, p.stats.shield);
      // The character art is rebuilt only when equipment actually changes.
      p.doll = DS.Paperdoll.buildSet(inv.armor);
    };

    p.hurt = function (g, amount, dir) { return hurt(g, p, amount, dir); };

    return p;
  }

  function hurt(g, p, amount, dir) {
    if (p.dead || p.iframes > 0 || p.dashFrames > 0) return false;

    // BRITTLE floors make every wound cut one deeper.
    amount += DS.Modifiers.get(g, 'extraDamage') || 0;

    /* Shield soaks first. A hit stopped entirely by armour still staggers you
       but does not break the momentum streak — that is what armour buys. */
    p.shieldTimer = SHIELD_DELAY + (p.stats.shieldDelay || 0);
    if (p.shield > 0) {
      const soaked = Math.min(p.shield, amount * SHIELD_PER_HEART);
      p.shield -= soaked;
      amount -= soaked / SHIELD_PER_HEART;
      DS.FX.burst(Ent.centerX(p), Ent.centerY(p), 6, ['#a8e4ff', '#ffffff'],
                  { speed: 1.8, life: 12, grav: 0 });
      DS.Audio.play('block');
      if (amount <= 0.01) {
        p.iframes = Math.max(p.iframes, 18);
        p.vx = dir * 1.4;
        return true;
      }
    }
    amount = Math.max(1, Math.round(amount));

    p.hp -= amount;
    p.iframes = p.stats.iframes;
    p.vx = dir * 2.6;
    p.vy = -2.2;
    cancelAttack(p);
    DS.Boons.onHurt(g);
    DS.R.flash('#c0303c', 5);

    DS.Audio.play('hurt');
    DS.R.shake(4);
    DS.FX.blood(Ent.centerX(p), Ent.centerY(p), -dir);
    DS.FX.number(Ent.centerX(p), p.y - 4, '-' + amount, '#c0303c');

    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      DS.Audio.play('die');
      DS.R.shake(8);
    }
    return true;
  }

  /* Every source of bonus damage lands here: boon stats, the momentum meter,
     and the low-health Berserker spike. */
  function damageMult(g, p) {
    let mult = 1 + (p.stats.damageBonus || 0) + DS.Boons.bonus(g);
    const berserk = DS.Boons.flag(p.inv, 'berserk');
    if (berserk && p.hp <= 2) mult += berserk;
    return mult;
  }

  function critChance(p, base) {
    return M.clamp(base + (p.stats.critBonus || 0), 0, 0.9);
  }

  function cancelAttack(p) {
    p.charging = false;
    p.holdFrames = 0;
    p.attackActive = 0;
    p.pending = null;
  }

  // Contact damage from an enemy body, including the Thorns reflection.
  function touch(g, p, enemy, amount) {
    const dir = M.sign(Ent.centerX(p) - Ent.centerX(enemy)) || 1;
    if (!hurt(g, p, amount, dir)) return;
    if (p.stats.thorns > 0) {
      Ent.damageEnemy(g, enemy, amount * p.stats.thorns * 3, {
        dir: -dir, knockback: 1.4
      });
    }
  }

  // --- update ---------------------------------------------------------------

  function update(g, p) {
    p.frame++;

    if (p.dead) {
      DS.Phys.step(p, g.map);
      p.vx *= 0.9;
      return;
    }

    if (p.iframes > 0) p.iframes--;
    if (p.attackCooldown > 0) p.attackCooldown--;
    if (p.swingTimer > 0) p.swingTimer--;
    if (p.comboWindow > 0) p.comboWindow--; else p.comboStep = 0;
    if (p.dashCooldown > 0) p.dashCooldown--;
    if (p.coinPop > 0) p.coinPop--;

    // Shield regeneration, once the fight has left you alone for a while.
    if (p.shieldTimer > 0) p.shieldTimer--;
    else if (p.shield < p.stats.shield) {
      p.shield = Math.min(p.stats.shield,
        p.shield + SHIELD_RATE * (p.stats.shieldRegen || 1));
    }

    // Both mini-dash charges return together when the recharge finishes.
    if (p.miniLeft < (p.miniMax || MINI_CHARGES)) {
      p.miniTimer--;
      if (p.miniTimer <= 0) {
        p.miniLeft = p.miniMax || MINI_CHARGES;
        DS.Audio.play('menuMove');
        DS.FX.ring(Ent.centerX(p), p.y + p.h, 6, '#5cbf62', 0.9);
      }
    }

    if (p.skillCooldown > 0) p.skillCooldown--;
    if (p.ultCooldown > 0) p.ultCooldown--;

    regen(p);

    /* A running skill owns the player for its duration: it moves them, damages
       for them, and blocks normal input until it finishes. */
    if (p.routine) {
      DS.Skills.updateRoutine(g, p);
      if (!p.routine || !p.routine.grounded) {
        p.vy = Math.min(p.vy + DS.C.GRAVITY, DS.C.MAX_FALL);
        DS.Phys.moveY(p, g.map, p.vy);
      }
      checkHazards(g, p);
      return;
    }

    updateRope(g, p);
    if (p.onRope) { checkHazards(g, p); return; }   // the rope owns movement

    if (p.attackActive > 0) {
      p.attackActive--;
      resolveMelee(g, p);
    }

    if (p.dashFrames > 0) {
      updateDash(g, p);
      return;
    }

    checkWater(g, p);
    move(g, p);
    refreshAim(p);
    handleJump(g, p);
    handleDash(g, p);
    handleSkills(g, p);
    handleAttack(g, p);

    DS.Phys.step(p, g.map, p.inWater ? 0.35 : 1);
    if (p.inWater) {
      p.vy = Math.min(p.vy, 1.4);
      p.vx *= 0.94;
    }
    if (g.hazards) DS.Hazards.carry(g, p);

    if (p.onRope) {
      p.coyote = COYOTE;    // stepping off the top of a rope keeps jump alive
      p.airJumpsLeft = AIR_JUMPS;
      return;
    }

    if (p.onGround) {
      p.coyote = COYOTE;
      p.dashesLeft = p.stats.dashCharges;
      p.airJumpsLeft = AIR_JUMPS + (p.stats.airJumpBonus || 0);
    } else if (p.coyote > 0) p.coyote--;

    p.miniMax = MINI_CHARGES + DS.Boons.flag(p.inv, 'miniCharges');

    checkHazards(g, p);
  }

  /* --- rope climbing -------------------------------------------------------

     Mountain shafts hang ropes from the tunnel roof down to the vault, and
     until now they were scenery: the tile existed, the art drew it, and
     nothing anywhere asked about it. Grabbing is automatic on overlap (a
     deliberate grab key would fight jump for W), climbing is W/S, and jump
     + a direction dismounts so you can hop off a rope mid-shaft. */
  const ROPE_CLIMB = 1.35;

  function updateRope(g, p) {
    if (!g.map || !g.map.ropeAt) return;
    const In = DS.Input;   // hoisted: the grab path below consumes 'jump'

    const cx = p.x + p.w * 0.5;
    const grabbing = g.map.ropeAt(cx, p.y + p.h * 0.5) ||
                     g.map.ropeAt(cx, p.y + p.h - 2);

    if (!p.onRope) {
      // Only catch the rope when falling or standing still-ish, so running
      // under one doesn't yank the player out of their stride.
      if (grabbing && p.vy >= -0.1 && !p.dashFrames) {
        p.onRope = true;
        p.vx = 0;
        p.vy = 0;
        // Snap to the rope's centre line.
        p.x = Math.floor(cx / 16) * 16 + 8 - p.w * 0.5;
        // W maps to both 'up' and 'jump'; swallow the press so the same
        // keydown that grabbed the rope doesn't immediately let go of it.
        In.consume('jump');
        DS.Audio.play('grab');
        DS.FX.dust(cx, p.y + p.h, 2);
      }
      return;
    }

    if (!grabbing) { p.onRope = false; return; }   // climbed off the bottom/top

    const up = In.isDown('up');
    const down = In.isDown('down');
    if (up) p.vy = -ROPE_CLIMB;
    else if (down) p.vy = ROPE_CLIMB;
    else p.vy = 0;

    // Space dismounts with a push off in the held direction. W is deliberately
    // excluded — it maps to jump AND up, so it climbs rather than lets go.
    if (In.justPressed('jump') && !In.isDown('up')) {
      p.onRope = false;
      p.vy = -p.stats.jumpVel * 0.8;
      p.vx = (In.axisX() || p.facing) * 2.2;
      In.consume('jump');
      DS.Audio.play('jump');
      return;
    }

    // Climbing counts as grounded for the stamina regen and the landing FX.
    p.onGround = false;
    p.dropThrough = false;
    if (p.onRope && (up || down)) {
      DS.Phys.moveY(p, g.map, p.vy);
      if (p.frame % 12 === 0 && up) DS.FX.dust(cx, p.y + p.h, 1);
    }
  }

  function checkWater(g, p) {
    if (!g.map) return;
    const inWater = g.map.waterOverlap(p.x, p.y, p.w, p.h);
    p.inWater = inWater;

    if (inWater) {
      // Submerged check: is head in water?
      const headSubmerged = g.map.waterAt(p.x + p.w * 0.5, p.y + 3);
      if (headSubmerged) {
        p.breath = Math.max(0, p.breath - 1);
        if (p.breath <= 0) {
          if (p.frame % 45 === 0) {
            hurt(g, p, 1, 0);
            DS.Audio.play('hurt');
            DS.FX.burst(Ent.centerX(p), p.y, 4, ['#4fb3e0', '#a8e4ff'], { speed: 1.2, life: 16 });
          }
        }
      } else {
        // Head above water: recover breath quickly
        p.breath = Math.min(p.maxBreath, p.breath + 4);
      }
    } else {
      // Completely out of water: immediately recover breath to full
      p.breath = p.maxBreath;
    }
  }

  function regen(p) {
    const busy = p.attackActive > 0 || p.charging;
    p.stamina = Math.min(p.stats.maxStamina,
      p.stamina + p.stats.staminaRegen * (busy ? 0.3 : 1));
    p.mana = Math.min(p.stats.maxMana,
      p.mana + p.stats.manaRegen * (busy ? 0.4 : 1));
  }

  function move(g, p) {
    const In = DS.Input;
    const dir = In.axisX();

    // Winding up a heavy blow roots you to a slow shuffle.
    const speed = p.stats.moveSpeed * (p.charging ? 0.45 : 1) * (p.inWater ? 0.72 : 1);
    const accel = p.onGround ? 0.55 : 0.32;
    const friction = p.onGround ? 0.62 : 0.14;

    if (dir !== 0) {
      p.vx = M.approach(p.vx, dir * speed, accel);
      if (p.attackActive <= 0) p.facing = dir;
      if (p.onGround && p.frame % 9 === 0) {
        DS.FX.dust(Ent.centerX(p), p.y + p.h - 1, 1);
      }
    } else {
      p.vx = M.approach(p.vx, 0, friction);
    }

    p.dropThrough = In.isDown('down');
  }

  function handleJump(g, p) {
    const In = DS.Input;

    // Swimming vertical impulse when in water
    if (p.inWater) {
      if (In.isDown('jump')) {
        p.vy = M.approach(p.vy, -2.0, 0.45);
        p.onGround = false;
        if (p.frame % 10 === 0) {
          DS.FX.burst(Ent.centerX(p), p.y + p.h, 2, ['#a8e4ff', '#ffffff'], { speed: 0.8, life: 10 });
        }
      }
      return;
    }

    if (In.justPressed('jump')) p.jumpBuffer = JUMP_BUFFER;
    if (p.jumpBuffer > 0) p.jumpBuffer--;

    const grounded = p.onGround || p.coyote > 0;

    if (p.jumpBuffer > 0 && grounded) {
      p.vy = -p.stats.jumpVel;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
      DS.Audio.play('jump');
      DS.FX.dust(Ent.centerX(p), p.y + p.h, 4);
    } else if (p.jumpBuffer > 0 && p.airJumpsLeft > 0) {
      // Air jump — the dungeon has ledges and flyers that a single jump cannot
      // answer, so everyone gets one mid-air reset for free.
      p.airJumpsLeft--;
      p.vy = -p.stats.jumpVel * 0.92;
      p.jumpBuffer = 0;
      DS.Audio.play('jump');
      DS.FX.ring(Ent.centerX(p), p.y + p.h, 10, '#a8e4ff', 1.3);
    }

    // Variable height: releasing early cuts the rise short.
    if (!In.isDown('jump') && p.vy < -1.6) p.vy = -1.6;
  }

  function handleDash(g, p) {
    const In = DS.Input;

    if (In.justPressed('minidash')) {
      In.consume('minidash');
      startMiniDash(g, p);
      return;
    }

    if (!In.justPressed('dash')) return;
    if (p.dashCooldown > 0 || p.dashesLeft <= 0) return;
    if (p.stamina < 20) { DS.Audio.play('error'); return; }

    p.miniActive = false;
    p.dashFrames = DASH_FRAMES;
    p.dashesLeft--;
    p.dashCooldown = DASH_COOLDOWN;
    p.stamina -= 20;
    p.iframes = Math.max(p.iframes, DASH_IFRAMES);
    cancelAttack(p);

    DS.Audio.play('dash');
    DS.FX.ring(Ent.centerX(p), Ent.centerY(p), 8, '#a8e4ff', 1.6);
  }

  function startMiniDash(g, p) {
    if (p.dashFrames > 0) return;
    if (p.miniLeft <= 0) { DS.Audio.play('error'); return; }
    if (p.stamina < MINI_STAMINA) { DS.Audio.play('error'); return; }

    // Spending the first charge starts the shared recharge for both.
    if (p.miniLeft === (p.miniMax || MINI_CHARGES)) p.miniTimer = MINI_RECHARGE;
    p.miniLeft--;

    p.miniActive = true;
    p.dashFrames = MINI_FRAMES;
    p.stamina -= MINI_STAMINA;
    p.iframes = Math.max(p.iframes, MINI_IFRAMES);
    cancelAttack(p);

    DS.Audio.play('dash');
    DS.FX.ring(Ent.centerX(p), p.y + p.h, 6, '#5cbf62', 1.2);
  }

  function updateDash(g, p) {
    p.dashFrames--;
    p.vx = p.facing * (p.miniActive ? MINI_SPEED : DASH_SPEED);
    p.vy = 0;
    DS.Phys.moveX(p, g.map, p.vx);
    DS.FX.trail(Ent.centerX(p), Ent.centerY(p), p.miniActive ? '#a3e86b' : '#a8e4ff');
    if (p.dashFrames <= 0) {
      p.vx *= 0.4;
      p.miniActive = false;
    }
    checkHazards(g, p);
  }

  function handleSkills(g, p) {
    const In = DS.Input;
    if (In.justPressed('ult')) {
      In.consume('ult');
      cancelAttack(p);
      DS.Skills.use(g, p, 'ult');
      return;
    }
    if (In.justPressed('skill')) {
      In.consume('skill');
      cancelAttack(p);
      DS.Skills.use(g, p, 'skill');
    }
  }

  function checkHazards(g, p) {
    if (g.map.spikeOverlap(p.x, p.y, p.w, p.h)) {
      hurt(g, p, 1, p.facing * -1);
    }

    // The bottom of a pit is a bed of spikes. Landing there ends the run.
    if (g.map.deathOverlap(p.x, p.y, p.w, p.h) || p.y > g.map.pixelH + 40) {
      p.hp = 0;
      p.dead = true;
      DS.Audio.play('die');
      DS.R.shake(6);
      DS.R.flash('#c0303c', 10);
      DS.FX.blood(Ent.centerX(p), Ent.centerY(p), 0);
    }
  }

  /* --- aiming ---------------------------------------------------------------

     Bow and staff are pointed with the MOUSE. The pointer is already tracked in
     logical screen pixels and R.toWorldX/toWorldY is the exact inverse of the
     camera transform, so the aim point is simply the world tile under the
     cursor.

     Aiming changes the DIRECTION of a shot, never its physics: the muzzle speed
     still comes from the weapon data, arrows still fall under shotCfg.gravity,
     and the firing cone is clamped so a shot can never come out straight down
     or backwards through the player. Charge still buys speed, so range is
     still earned. */
  const AIM_MAX_PITCH = 1.0;      // ~57 degrees above or below the horizon

  function isRanged(base) {
    return !!(base && (base.ranged || base.holdMode === 'release'));
  }

  /* Unit vector from the muzzle toward the cursor, or null when there is no
     mouse to aim with (keyboard-only play keeps the old facing-based shot). */
  function aimVector(p) {
    const In = DS.Input, R = DS.R;
    if (!In || !In.hasMouse || !In.hasMouse() || !R || !R.toWorldX) return null;
    const m = In.mouse;
    const dxw = R.toWorldX(m.x) - Ent.centerX(p);
    const dyw = R.toWorldY(m.y) - (Ent.centerY(p) - 2);
    const len = Math.sqrt(dxw * dxw + dyw * dyw);
    if (len < 1.5) return null;                 // cursor sits on the muzzle

    let dx = dxw / len, dy = dyw / len;
    const sinMax = Math.sin(AIM_MAX_PITCH);
    if (dy > sinMax || dy < -sinMax) {
      dy = M.sign(dy) * sinMax;
      dx = (M.sign(dx) || p.facing || 1) * Math.cos(AIM_MAX_PITCH);
      const l2 = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= l2; dy /= l2;
    }
    if (Math.abs(dx) < 0.05) dx = (p.facing || 1) * 0.05;
    return { x: dx, y: dy };
  }

  /* Written once per frame so the HUD reticle and the 3D arm pitch both read
     the same aim the shot will use. */
  function refreshAim(p) {
    const item = DS.Inv.weapon(p.inv);
    const base = item ? W.WEAPONS[item.type] : null;
    if (!isRanged(base)) { p.aim = null; return; }

    const v = aimVector(p);
    if (!v) { p.aim = null; return; }
    p.aim = v;
    // The body turns the way you are shooting, so the shot leaves the bow the
    // way the model is holding it.
    if (p.attackActive <= 0) p.facing = M.sign(v.x) || p.facing;
  }

  // --- attacking ------------------------------------------------------------

  function handleAttack(g, p) {
    const In = DS.Input;
    const item = DS.Inv.weapon(p.inv);
    if (!item) return;
    const base = W.WEAPONS[item.type];

    if (base.holdMode === 'release') {
      handleReleaseWeapon(g, p, item, base, In);
      return;
    }

    // Melee: the tap lands now.
    if (In.justPressed('attack') && p.attackCooldown <= 0) {
      startSwing(g, p, item, base, false, 0);
      p.holdFrames = 0;
      return;
    }

    // Holding past the cooldown winds up the heavy version.
    if (In.isDown('attack') && p.attackCooldown <= 0 && p.attackActive <= 0) {
      p.holdFrames = Math.min(base.chargeMax, p.holdFrames + 1);
      if (p.holdFrames >= W.CHARGE_MIN) {
        p.charging = true;
        chargeFx(p, base);
      }
    }

    if (In.justReleased('attack')) {
      if (p.charging && p.attackCooldown <= 0) {
        startSwing(g, p, item, base, true, p.holdFrames / base.chargeMax);
      }
      p.charging = false;
      p.holdFrames = 0;
    }
  }

  function handleReleaseWeapon(g, p, item, base, In) {
    if (In.isDown('attack') && p.attackCooldown <= 0) {
      p.charging = true;
      p.holdFrames = Math.min(base.chargeMax, p.holdFrames + 1);
      chargeFx(p, base);
      return;
    }

    if (p.charging) {
      p.charging = false;
      const ratio = p.holdFrames / base.chargeMax;
      p.holdFrames = 0;
      shoot(g, p, item, base, ratio);
    }
  }

  /* Charge FX. Every weapon winds up differently, and the wind-up is drawn
     BEHIND the player: the harder you hold, the more the attack drags the air
     after it. A sword gathers dust, a greataxe trails thick smoke, a bow pulls
     the string with light, a staff orbits runes. The 3D half (smoke puffs, the
     aura on the model) is driven from the same numbers through DS.FX, so the
     2D and 3D layers never disagree about how charged a swing is. */
  const CHARGE_STYLE = {
    sword:     { smoke: '#c8c3d8', hot: '#fff0a8', rate: 9,  back: 12, kind: 'dust' },
    dagger:    { smoke: '#d8d5e8', hot: '#ffffff', rate: 6,  back: 9,  kind: 'after' },
    greataxe:  { smoke: '#6f6a90', hot: '#ffb060', rate: 5,  back: 16, kind: 'smoke' },
    spear:     { smoke: '#a8e4ff', hot: '#ffffff', rate: 7,  back: 14, kind: 'line' },
    bow:       { smoke: '#e8e4ff', hot: '#fff0a8', rate: 7,  back: 10, kind: 'draw' },
    staff:     { smoke: '#c86ee0', hot: '#a8e4ff', rate: 6,  back: 10, kind: 'rune' }
  };

  function chargeFx(p, base) {
    const ratio = p.holdFrames / base.chargeMax;
    const style = CHARGE_STYLE[base.key] || CHARGE_STYLE.sword;
    const cx = Ent.centerX(p), cy = Ent.centerY(p) - 2;
    // Backwards is opposite the facing: the smoke is the wake of the wind-up.
    const back = -p.facing;

    // Rate scales with charge, so the last frames of a heavy charge are loud.
    const every = Math.max(2, Math.round(style.rate * (1.35 - ratio * 0.75)));
    if (p.holdFrames % every === 0) {
      const col = ratio >= 0.85 ? style.hot : style.smoke;
      DS.FX.smoke(cx + back * style.back, cy + DS.rand.float(-3, 3),
                  back * DS.rand.float(0.25, 0.75), -DS.rand.float(0.04, 0.22),
                  { color: col, life: 16 + Math.round(ratio * 16),
                    size: 2 + ratio * 2 + (style.kind === 'smoke' ? 1 : 0) });
      DS.FX.trail(cx + p.facing * 9, cy, col);
    }

    // A pull line from the weapon to the shoulder for the drawn weapons.
    if (style.kind === 'draw' && p.holdFrames % 4 === 0) {
      DS.FX.trail(cx - p.facing * 6, cy - 1, '#fff0a8');
    }

    // Top-out: one loud ping plus a ring that says the next release is heavy.
    if (p.holdFrames === base.chargeMax) {
      DS.Audio.play('menuPick');
      DS.FX.ring(cx, cy, 8, '#fff0a8', 1.4);
      DS.FX.burst(cx, cy, 10, [style.hot, '#ffffff'], { speed: 1.6, life: 18 });
    }
  }

  function spend(p, item, base, heavy) {
    const stats = item.stats;
    const mult = heavy ? 1.7 : 1;

    if (base.mana) {
      const cost = stats.mana * mult;
      if (p.mana < cost) return false;
      p.mana -= cost;
    }
    if (stats.stamina > 0) {
      const cost = stats.stamina * mult;
      if (p.stamina < cost) return false;
      p.stamina -= cost;
    }
    return true;
  }

  function startSwing(g, p, item, base, heavy, ratio) {
    if (!spend(p, item, base, heavy)) { DS.Audio.play('error'); return; }

    const stats = item.stats;
    let chargeMult = heavy ? (1 + ratio * (base.chargeBonus - 1)) : 1;
    if (heavy) chargeMult *= 1 + DS.Boons.flag(p.inv, 'heavyBonus');
    chargeMult *= damageMult(g, p);
    const crit = DS.rand.chance(critChance(p, stats.crit + (heavy ? 0.1 : 0)));

    p.attackDir = p.facing;
    p.attackHeavy = heavy;
    p.attackActive = heavy ? 13 : 9;
    p.swingMax = Math.max(10, Math.round(stats.cooldown * (heavy ? 0.8 : 0.6)));
    p.swingTimer = p.swingMax;
    p.attackCooldown = Math.round(stats.cooldown * (heavy ? 1.35 : 1));
    p.hitList = [];

    if (!heavy) {
      p.comboStep = (p.comboStep + 1) % Math.max(1, base.combo);
      p.comboWindow = stats.cooldown + 18;
    } else {
      p.comboStep = 0;
    }

    p.pending = {
      damage: stats.damage * chargeMult * (crit ? stats.critDamage : 1),
      crit: crit,
      knockback: stats.knockback * (heavy ? 1.8 : 1),
      procs: item.procs,
      element: item.element,
      elementShare: stats.elementShare,
      elemPower: stats.elemPower,
      reach: base.hit.w * stats.reach * (heavy ? base.heavyReach : 1),
      height: base.hit.h * (heavy ? 1.25 : 1),
      oy: base.hit.oy,
      heavy: heavy
    };

    DS.Audio.play('swing');
    if (heavy) {
      DS.R.shake(2);
      DS.FX.ring(Ent.centerX(p) + p.facing * 8, Ent.centerY(p), 8, '#fff0a8', 1.8);
    }
  }

  function meleeRect(p) {
    const info = p.pending;
    const reach = info.reach;
    const x = p.attackDir > 0
      ? p.x + p.w - BODY_OVERLAP
      : p.x + BODY_OVERLAP - reach;
    const y = p.y + info.oy + (p.h - info.height) / 2;
    return { x: x, y: y, w: reach, h: info.height };
  }

  function resolveMelee(g, p) {
    if (!p.pending) return;
    const box = meleeRect(p);
    let hitAny = false;

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead || p.hitList.indexOf(e) >= 0) continue;
      if (!M.rectsOverlap(box.x, box.y, box.w, box.h, e.x, e.y, e.w, e.h)) continue;

      p.hitList.push(e);
      Ent.damageEnemy(g, e, p.pending.damage, {
        crit: p.pending.crit,
        knockback: p.pending.knockback,
        dir: p.attackDir,
        procs: p.pending.procs,
        element: p.pending.element,
        elementShare: p.pending.elementShare,
        elemPower: p.pending.elemPower,
        heavy: p.pending.heavy,
        source: 'melee'
      });
      hitAny = true;
    }

    // Hitstop: a landed blow briefly freezes the game to give it weight.
    if (hitAny) {
      g.hitstop = Math.max(g.hitstop, p.pending.heavy ? 7 : 3);
      DS.R.shake(p.pending.heavy ? 4 : 1.5);
      // The 3D swing arc replaces the 2D canvas trail in voxel mode.
      if (DS.R3D && DS.R3D.voxels && DS.R3D.spawnSwingArc) {
        DS.R3D.spawnSwingArc(Ent.centerX(p) + p.attackDir * 14,
                             p.y + p.h * 0.5, p.attackDir, p.pending.heavy);
      }
    }
  }

  function shoot(g, p, item, base, ratio) {
    if (base.key === 'bow' && p.inv.arrows <= 0) {
      DS.Audio.play('error');
      g.toast('OUT OF ARROWS', '#c0303c');
      return;
    }
    if (!spend(p, item, base, false)) { DS.Audio.play('error'); return; }
    if (base.key === 'bow') p.inv.arrows--;

    const stats = item.stats;
    const shotCfg = base.shot;
    const chargeMult = (1 + ratio * (base.chargeBonus - 1)) * damageMult(g, p);
    const crit = DS.rand.chance(critChance(p, stats.crit));

    // Aim at the cursor when there is one; the keyboard fallback shoots along
    // the facing, exactly as before.
    const aim = aimVector(p);
    const dirX = aim ? aim.x : (p.facing || 1);
    const dirY = aim ? aim.y : 0;

    p.attackDir = M.sign(dirX) || p.facing;
    p.attackHeavy = ratio > 0.85;
    p.swingMax = 12;
    p.swingTimer = 12;
    p.attackCooldown = stats.cooldown;

    const speed = shotCfg.speed * (0.6 + ratio * 0.4);

    const proj = {
      x: Ent.centerX(p) + dirX * 8,
      y: Ent.centerY(p) - 2 + dirY * 8,
      vx: dirX * speed,
      vy: dirY * speed,
      damage: stats.damage * chargeMult * (crit ? stats.critDamage : 1),
      friendly: true,
      kind: shotCfg.kind,
      element: item.element,
      procs: item.procs,
      elementShare: stats.elementShare,
      elemPower: stats.elemPower,
      crit: crit,
      gravity: shotCfg.gravity,
      life: shotCfg.life,
      knockback: stats.knockback,
      pierce: (ratio > 0.95 ? 1 : 0) + DS.Boons.flag(p.inv, 'pierce'),
      w: shotCfg.kind === 'arrow' ? 8 : 6,
      h: shotCfg.kind === 'arrow' ? 3 : 6,
      /* The shot is fired from where the cursor points, so a hovering reticle
         is not needed on the projectile — but the arrow keeps its gravity and
         the staff bolt keeps its own, so both still arc. */
      aimed: !!aim
    };

    if (item.element) {
      proj.trailColor = W.ELEMENTS[item.element].color;
      DS.Audio.play(W.ELEMENTS[item.element].sfx);
    } else {
      DS.Audio.play(base.key === 'bow' ? 'shoot' : 'cast');
    }

    Ent.spawnProjectile(g, proj);
  }

  // --- drawing --------------------------------------------------------------

  function draw(g, p) {
    const R = DS.R, S = DS.SPR;
    const flip = p.facing < 0;
    const doll = p.doll || DS.Paperdoll.bare();
    const set = flip ? doll.flip : doll;
    const lift = doll.lift || 0;

    let sprite;
    if (!p.onGround) sprite = p.vy < 0 ? set.jump : set.fall;
    else if (Math.abs(p.vx) > 0.25) {
      p.animTimer += Math.abs(p.vx) * 0.28;
      sprite = set.run[Math.floor(p.animTimer) % set.run.length];
    } else {
      p.animTimer = 0;
      sprite = set.idle[Math.floor(p.frame / 34) % 2];
    }

    // Flicker while invulnerable, but never while dashing (the trail reads it).
    if (p.iframes > 0 && p.dashFrames <= 0 && Math.floor(p.frame / 3) % 2 === 0) return;

    drawWeapon(g, p, true);   // behind the body on the wind-up
    R.spr(sprite, p.x - 1, p.y - lift);
    drawWeapon(g, p, false);  // in front once the swing comes through
    drawChargeMeter(g, p);
  }

  /* Every archetype gets its own motion and its own trail. The weapon sprite is
     drawn in the hand and animated; the effect is generated from the same pose,
     so the trail always matches where the weapon actually is.

       arc     wide crescent sweep            (sword)
       chop    slow overhead fall             (greataxe)
       stab    short fast in-and-out flick    (dagger)
       thrust  long straight lunge            (spear)
       draw    pull the string, loose it      (bow)
       cast    raise and release              (staff)                       */
  const ANIM = {
    sword:    { style: 'arc',    rest: 0.45, wind: -1.45, end: 1.55, radius: 13 },
    greataxe: { style: 'chop',   rest: 0.55, wind: -2.05, end: 1.70, radius: 17 },
    dagger:   { style: 'stab',   rest: 0.75, wind: 0.35,  end: 0.95, thrust: 8 },
    spear:    { style: 'thrust', rest: 0.10, wind: -0.10, end: 0.10, thrust: 16 },
    bow:      { style: 'draw',   rest: -0.15 },
    staff:    { style: 'cast',   rest: -0.40 }
  };

  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeIn(t) { return t * t; }

  // Where the weapon sits this frame: rotation plus an offset along the facing.
  function weaponPose(p, base) {
    const anim = ANIM[base.key] || ANIM.sword;
    const swinging = p.swingTimer > 0;
    const t = swinging ? 1 - (p.swingTimer / p.swingMax) : 0;
    const ratio = p.charging ? M.clamp(p.holdFrames / base.chargeMax, 0, 1) : 0;
    const tremble = p.charging ? Math.sin(p.frame * 0.9) * 0.06 * ratio : 0;

    const pose = { angle: anim.rest, push: 0, t: t, ratio: ratio, anim: anim, swinging: swinging };

    if (anim.style === 'arc' || anim.style === 'chop') {
      if (p.charging) {
        pose.angle = anim.wind - 0.25 * ratio + tremble;
      } else if (swinging) {
        const ease = anim.style === 'chop' ? easeIn(t) : easeOut(t);
        pose.angle = M.lerp(anim.wind, anim.end, ease);
      }
    } else if (anim.style === 'stab' || anim.style === 'thrust') {
      if (p.charging) {
        pose.angle = anim.wind + tremble;
        pose.push = -4 - ratio * 3;
      } else if (swinging) {
        // Out fast, back slow — a lunge rather than a sine wobble.
        const out = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        pose.angle = M.lerp(anim.wind, anim.end, Math.min(1, t * 2));
        pose.push = out * anim.thrust;
      }
    } else if (anim.style === 'draw') {
      pose.angle = anim.rest;
      pose.push = p.charging ? -ratio * 5 : (swinging ? Math.sin(t * Math.PI) * 3 : 0);
    } else if (anim.style === 'cast') {
      pose.angle = anim.rest - ratio * 0.6 + tremble;
      pose.push = swinging ? Math.sin(t * Math.PI) * 5 : 0;
    }

    return pose;
  }

  function drawWeapon(g, p, behind) {
    const R = DS.R, S = DS.SPR;
    const item = DS.Inv.weapon(p.inv);
    if (!item) return;

    const base = W.WEAPONS[item.type];
    const pose = weaponPose(p, base);
    const flip = p.facing < 0;

    // Only the big rotating weapons pass behind the body on the wind-up.
    const isBehind = (pose.anim.style === 'arc' || pose.anim.style === 'chop')
      && pose.angle < -0.45;
    if (behind !== isBehind) return;

    const dir = p.swingTimer > 0 ? p.attackDir : p.facing;
    const handX = p.x + (dir > 0 ? p.w - 1 : 1) + dir * pose.push;
    const handY = p.y + 7 + (p.onGround ? 0 : -1);

    if (!behind) drawSwingEffect(g, p, item, base, pose, handX, handY, dir, flip);
    R.sprRot(S.iconFor(item.type, item.rarity), handX, handY, pose.angle, flip, 3, 10);
    if (base.key === 'staff') drawStaffTip(R, item, pose, handX, handY, dir);
  }

  function drawSwingEffect(g, p, item, base, pose, handX, handY, dir, flip) {
    const R = DS.R;
    const anim = pose.anim;
    const heavy = p.attackHeavy;

    if (!pose.swinging) {
      if (anim.style === 'draw' && p.charging) drawBowString(R, pose, handX, handY, dir);
      return;
    }

    const fade = Math.sin(Math.min(1, pose.t) * Math.PI);
    if (fade < 0.06) return;

    if (anim.style === 'arc' || anim.style === 'chop') {
      const radius = (anim.radius + (heavy ? 5 : 0)) * (item.stats.reach || 1);
      const color = heavy ? 'rgba(255,240,168,' : 'rgba(232,230,240,';
      // Trail runs from where the swing started to where the blade is now.
      R.arc(handX, handY, radius, anim.wind, pose.angle,
            color + fade.toFixed(2) + ')', heavy ? 4 : 2, flip);
      R.arc(handX, handY, radius - 4, M.lerp(anim.wind, pose.angle, 0.45), pose.angle,
            'rgba(255,255,255,' + (fade * 0.5).toFixed(2) + ')', 1, flip);

      if (anim.style === 'chop' && pose.t > 0.55 && p.frame % 3 === 0) {
        DS.FX.dust(handX + dir * 10, handY + 8, 2);
      }
    } else if (anim.style === 'stab' || anim.style === 'thrust') {
      const reach = (p.pending ? p.pending.reach : 18) * (item.stats.reach || 1);
      const tipX = handX + dir * reach * pose.ratio;
      const elemColor = item.element ? W.ELEMENTS[item.element].color : '#ffffff';
      DS.Map.glow(R, tipX, handY, 10 * fade, withAlpha(elemColor, fade * 0.4));
      // Stylized crescent thrust flash
      R.arc(tipX - dir * 3, handY, 5, -0.8, 0.8, withAlpha(elemColor, fade), 2, flip);
      if (p.frame % 2 === 0 && pose.ratio > 0.4) {
        DS.FX.spark(tipX, handY, 1, elemColor);
      }
    } else if (anim.style === 'draw') {
      drawBowString(R, pose, handX, handY, dir);
    } else if (anim.style === 'cast') {
      const color = item.element ? W.ELEMENTS[item.element].color : '#38bdf8';
      const tipX = handX + dir * 6, tipY = handY - 11;
      DS.Map.glow(R, tipX, tipY, 12 + pose.t * 10, withAlpha(color, fade * 0.5));
      R.arc(tipX, tipY, 4 + pose.t * 9, -2.0, 2.0, withAlpha(color, fade), 2, flip);
      if (p.frame % 3 === 0) {
        DS.FX.spark(tipX + (Math.random() - 0.5) * 6, tipY + (Math.random() - 0.5) * 6, 1, color);
      }
    }
  }

  function drawBowString(R, pose, handX, handY, dir) {
    const pull = pose.ratio * 5;
    const nockX = handX - dir * pull;
    R.line(handX + dir * 2, handY - 7, nockX, handY - 1, '#d8d5e8', 1);
    R.line(nockX, handY - 1, handX + dir * 2, handY + 5, '#d8d5e8', 1);
    if (pose.ratio > 0) {
      R.line(nockX, handY - 1, handX + dir * 9, handY - 1, '#b98d5c', 1);
    }
  }

  function drawStaffTip(R, item, pose, handX, handY, dir) {
    const color = item.element ? W.ELEMENTS[item.element].color : '#38bdf8';
    const tipX = handX + dir * 4, tipY = handY - 12;
    DS.Map.glow(R, tipX, tipY, 8 + pose.ratio * 14, withAlpha(color, 0.35 + pose.ratio * 0.4));
    R.arc(tipX, tipY, 2 + pose.ratio * 3, 0, Math.PI * 2, color, 2);
  }

  function withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, alpha)).toFixed(2) + ')';
  }

  function drawChargeMeter(g, p) {
    if (!p.charging) return;
    const item = DS.Inv.weapon(p.inv);
    if (!item) return;

    const R = DS.R;
    const base = W.WEAPONS[item.type];
    const ratio = M.clamp(p.holdFrames / base.chargeMax, 0, 1);
    const full = ratio >= 1;

    DS.Map.glow(R, Ent.centerX(p) + p.facing * 6, Ent.centerY(p), 8 + ratio * 12,
      full ? 'rgba(255,240,168,0.32)' : 'rgba(168,228,255,0.20)');

    R.rect(p.x - 3, p.y - 7, 14, 3, '#0d0b12');
    R.rect(p.x - 2, p.y - 6, 12 * ratio, 1, full ? '#fff0a8' : '#a8e4ff');
  }

  DS.Player = {
    create: create,
    update: update,
    draw: draw,
    hurt: hurt,
    touch: touch,
    meleeRect: meleeRect,
    aimVector: aimVector,
    isRanged: isRanged,
    damageMult: damageMult,
    MINI_CHARGES: MINI_CHARGES,
    MINI_RECHARGE: MINI_RECHARGE
  };
})(window.DS);
