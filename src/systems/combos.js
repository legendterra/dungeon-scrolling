/* Melee combos. Every melee archetype is a short chain of distinct steps rather
   than one swing repeated, and every step owns its timing, its hitbox, its
   damage and its look:

     sword     horizontal slash -> rising diagonal -> overhead spin finisher
     dagger    crossing slash -> reverse cross -> dash-stab
     greataxe  wide cleave -> ground slam
     spear     thrust -> sweeping arc

   Timing is in frames at 60fps, but the step table stores MULTIPLIERS of the
   weapon's own cooldown, so attack-speed affixes still speed the whole chain up.

     cd       frames (x cooldown) before the next input is accepted
     windup   anticipation frames before the hitbox goes live
     active   frames the hitbox stays live after the windup
     dmg      damage multiplier for this step
     reach    hitbox reach (x the weapon's hit.w)
     height   hitbox height (x the weapon's hit.h)
     knock    knockback multiplier
     lunge    forward speed (px/frame) for lungeFrames frames from the strike
     both     the hitbox covers both sides of the body (spins, slams)
     hitstop  frames of freeze when the step lands
     shake    camera shake when the step lands
     fx       the visual preset DS.FX3D plays for the step

   The chain rule: a press within WINDOW frames after a step's recovery ends
   continues the combo; waiting longer drops back to the first step. A press
   made up to BUFFER frames before recovery ends is remembered, so mashing the
   button still lands every step on its earliest frame.

   Balance: the early steps hit a little softer than the old flat swing and the
   finisher harder; summed over a full chain the damage per frame stays within
   a few percent of what the one-swing weapon did (see tests/combo.test.js). */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const WINDOW = 22;   // frames after recovery during which the chain holds
  const BUFFER = 8;    // frames an early press is remembered

  const COMBOS = {
    sword: {
      steps: [
        { key: 'slashH',  dmg: 0.82, cd: 0.80, windup: 3, active: 7, reach: 1.00, height: 1.10,
          knock: 0.8, lunge: 0.9, lungeFrames: 4, hitstop: 3, shake: 1.5, fx: 'sword1' },
        { key: 'slashUp', dmg: 0.90, cd: 0.85, windup: 3, active: 7, reach: 1.05, height: 1.45,
          knock: 0.9, lunge: 1.1, lungeFrames: 4, hitstop: 3, shake: 1.8, fx: 'sword2' },
        { key: 'spin',    dmg: 1.40, cd: 1.35, windup: 5, active: 10, reach: 1.20, height: 1.50,
          knock: 1.6, lunge: 1.4, lungeFrames: 5, both: true, hitstop: 6, shake: 4, fx: 'sword3' }
      ],
      heavy: { key: 'heavySword', dmg: 1, windup: 2, active: 13, knock: 1.8, hitstop: 7, shake: 4,
               lunge: 2.2, lungeFrames: 6, both: false, fx: 'swordHeavy' }
    },
    dagger: {
      steps: [
        { key: 'crossA', dmg: 0.80, cd: 0.85, windup: 1, active: 6, reach: 1.00, height: 1.10,
          knock: 0.7, lunge: 0.8, lungeFrames: 3, hitstop: 2, shake: 1, fx: 'dagger1' },
        { key: 'crossB', dmg: 0.80, cd: 0.85, windup: 1, active: 6, reach: 1.00, height: 1.10,
          knock: 0.7, lunge: 0.8, lungeFrames: 3, hitstop: 2, shake: 1, fx: 'dagger2' },
        { key: 'dashStab', dmg: 1.45, cd: 1.40, windup: 3, active: 8, reach: 1.45, height: 0.90,
          knock: 1.5, lunge: 3.4, lungeFrames: 6, hitstop: 5, shake: 2.5, fx: 'dagger3' }
      ],
      heavy: { key: 'heavyDagger', dmg: 1, windup: 2, active: 12, knock: 1.8, hitstop: 7, shake: 3.5,
               lunge: 4.2, lungeFrames: 8, fx: 'daggerHeavy' }
    },
    greataxe: {
      steps: [
        { key: 'cleave', dmg: 0.90, cd: 0.85, windup: 6, active: 9, reach: 1.10, height: 1.25,
          knock: 1.0, lunge: 0.8, lungeFrames: 5, hitstop: 5, shake: 3, fx: 'axe1' },
        { key: 'slam',   dmg: 1.20, cd: 1.20, windup: 9, active: 8, reach: 1.15, height: 1.40,
          knock: 1.4, lunge: 0.6, lungeFrames: 4, both: true, hitstop: 8, shake: 6, fx: 'axe2' }
      ],
      heavy: { key: 'heavyAxe', dmg: 1, windup: 4, active: 13, knock: 1.8, hitstop: 9, shake: 7,
               lunge: 1.2, lungeFrames: 5, both: true, fx: 'axeHeavy' }
    },
    spear: {
      steps: [
        { key: 'thrust', dmg: 0.88, cd: 0.80, windup: 3, active: 7, reach: 1.10, height: 0.90,
          knock: 0.9, lunge: 1.6, lungeFrames: 4, hitstop: 3, shake: 1.5, fx: 'spear1' },
        { key: 'sweep',  dmg: 1.12, cd: 1.15, windup: 4, active: 9, reach: 0.85, height: 1.90,
          knock: 1.3, lunge: 0.7, lungeFrames: 4, hitstop: 4, shake: 2.5, fx: 'spear2' }
      ],
      heavy: { key: 'heavySpear', dmg: 1, windup: 2, active: 13, knock: 1.8, hitstop: 7, shake: 4,
               lunge: 3.0, lungeFrames: 7, fx: 'spearHeavy' }
    }
  };

  function forWeapon(key) { return COMBOS[key] || null; }

  function length(key) {
    const c = COMBOS[key];
    return c ? c.steps.length : 1;
  }

  /* The step a press made now would perform: the chain's next step while the
     window is open, the opener otherwise. */
  function pick(key, comboStep, comboWindow) {
    const c = COMBOS[key];
    if (!c) return null;
    const i = comboWindow > 0 ? comboStep % c.steps.length : 0;
    return { index: i, def: c.steps[i], last: i === c.steps.length - 1 };
  }

  /* Frame numbers for one step, from the weapon's live cooldown. The swing
     animation always outlasts the hitbox so the follow-through is seen. */
  function timing(def, cooldown, heavy) {
    const cd = heavy ? Math.round(cooldown * 1.35) : Math.max(6, Math.round(cooldown * def.cd));
    const windup = def.windup || 0;
    const active = def.active || 9;
    const swing = Math.max(windup + active + 4, heavy ? Math.round(cooldown * 0.8) : Math.round(cd * 0.92));
    return { cd: cd, windup: windup, active: active, swing: swing };
  }

  /* After step `index` lands: point the chain at the next step and open the
     window for it. The finisher closes the chain. */
  function advance(p, key, index, cd) {
    const n = length(key);
    const next = index + 1;
    if (next >= n) {
      p.comboStep = 0;
      p.comboWindow = 0;
    } else {
      p.comboStep = next;
      p.comboWindow = cd + WINDOW;
    }
  }

  // Once per frame: the chain drops when its window runs out.
  function tick(p) {
    if (p.comboWindow > 0) p.comboWindow--;
    else p.comboStep = 0;
  }

  function reset(p) {
    p.comboStep = 0;
    p.comboWindow = 0;
  }

  DS.Combos = {
    COMBOS: COMBOS,
    WINDOW: WINDOW,
    BUFFER: BUFFER,
    forWeapon: forWeapon,
    length: length,
    pick: pick,
    timing: timing,
    advance: advance,
    tick: tick,
    reset: reset
  };
})(window.DS);
