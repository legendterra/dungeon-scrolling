/* What the options MEAN: the sections of DS.Settings that describe how the game
   looks, sounds and is controlled, and the code that hands each value to the
   module that carries it out. Options (ui-html/options.js) only edits
   DS.Settings; this is the one place that turns an edit into an effect, at boot
   and on every change, so a value loaded from disk and a value dragged on a
   slider go the same way.

   Nothing here changes the rules of the game, only its presentation. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  DS.VERSION = 'v7.0.0';

  const S = DS.Settings;
  const num = function (min, max, step) { return { type: 'number', min: min, max: max, step: step }; };
  const bool = { type: 'bool' };

  S.define('gfx', {
    renderScale: 1, bloom: 1, vignette: 1, brightness: 1, particles: 1, uiScale: 1,
    fpsCap: 'max', showFps: false
  }, {
    renderScale: num(0.5, 1, 0.05), bloom: num(0, 1.5, 0.05), vignette: num(0, 1.5, 0.05),
    brightness: num(0.7, 1.3, 0.05), particles: num(0.25, 1, 0.05), uiScale: num(0.85, 1.25, 0.05),
    fpsCap: { type: 'choice', of: ['30', '60', 'max'] }, showFps: bool
  });

  S.define('audio', { master: 1, music: 1, sfx: 1, muteUnfocused: false }, {
    master: num(0, 1, 0.05), music: num(0, 1, 0.05), sfx: num(0, 1, 0.05), muteUnfocused: bool
  });

  S.define('game', { damageNumbers: true, hints: true, shake: 1 }, {
    damageNumbers: bool, hints: bool, shake: num(0, 1, 0.05)
  });

  S.define('access', { reduceMotion: false, flashes: true }, { reduceMotion: bool, flashes: bool });

  /* The keyboard half of every action, as JSON (see DS.Input.exportBindings). */
  S.define('controls', { map: '' }, { map: { type: 'string', max: 4000 } });

  let internal = false;       // a change the Options screen made itself needs no re-import

  function apply(section, key) {
    const g = S.get(section);
    if (section === 'gfx') {
      if (DS.R3D && DS.R3D.setRenderScale && (!key || key === 'renderScale')) DS.R3D.setRenderScale(g.renderScale);
      if (DS.PostFX && DS.PostFX.tune && (!key || key === 'bloom' || key === 'vignette' || key === 'brightness')) {
        DS.PostFX.tune({ bloom: g.bloom, vignette: g.vignette, brightness: g.brightness });
      }
      if (DS.FX3D && DS.FX3D.setDensity && (!key || key === 'particles')) DS.FX3D.setDensity(g.particles);
      if (DS.HUI && DS.HUI.setUiScale && (!key || key === 'uiScale')) DS.HUI.setUiScale(g.uiScale);
    } else if (section === 'audio') {
      if (DS.Audio && DS.Audio.setVolumes) DS.Audio.setVolumes(g);
    } else if (section === 'game' || section === 'access') {
      const c = DS.R && DS.R.comfort;
      if (c) {
        const a = S.get('access'), gm = S.get('game');
        c.shake = gm.shake;
        c.motion = !a.reduceMotion;
        c.flash = a.flashes;
      }
    } else if (section === 'controls' && !internal) {
      if (DS.Input && g.map) {
        try { DS.Input.importBindings(JSON.parse(g.map)); } catch (e) { /* a broken file: the defaults stand */ }
      }
    }
  }

  S.onChange(function (section, key) { apply(section, key); });

  /* Called once from boot, after every module is up. */
  function applyAll() {
    ['gfx', 'audio', 'game', 'access', 'controls'].forEach(function (s) { apply(s); });
  }

  /* The bindings the Options screen edits live in DS.Input; this writes them down. */
  function saveControls() {
    internal = true;
    try { S.set('controls', 'map', JSON.stringify(DS.Input.exportBindings())); } finally { internal = false; }
  }

  function resetControls() {
    DS.Input.resetBindings();
    saveControls();
  }

  /* --- the FPS counter and the frame-rate cap ------------------------------- */

  let fpsNode = null, frames = 0, since = 0;

  /* Called every animation frame by the loop: counts frames and, when the cap
     asks for it, says whether this frame should be drawn. */
  let lastDraw = 0;
  function wantDraw(now) {
    const cap = S.get('gfx', 'fpsCap');
    if (cap === 'max') return true;
    const gap = 1000 / (cap === '30' ? 30 : 60);
    if (now - lastDraw < gap - 2) return false;
    lastDraw = now;
    return true;
  }

  function fpsTick(now) {
    if (!S.get('gfx', 'showFps')) {
      if (fpsNode) fpsNode.hidden = true;
      return;
    }
    if (!fpsNode && DS.HUI && DS.HUI.layer) {
      fpsNode = DS.HUI.el('div', 'hk-fps');
      DS.HUI.layer('overlay').appendChild(fpsNode);
    }
    if (!fpsNode) return;
    fpsNode.hidden = false;
    frames++;
    if (!since) since = now;
    if (now - since >= 500) {
      fpsNode.textContent = Math.round(frames * 1000 / (now - since)) + ' FPS';
      frames = 0;
      since = now;
    }
  }

  DS.Prefs = { applyAll: applyAll, apply: apply, saveControls: saveControls, resetControls: resetControls,
               wantDraw: wantDraw, fpsTick: fpsTick };
})(window.DS);
