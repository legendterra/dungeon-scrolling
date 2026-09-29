/* All sound is synthesised at runtime with the Web Audio API — there are no
   .wav/.mp3 files anywhere in the project. Browsers refuse to start audio
   before a user gesture, so nothing is created until unlock() is called from
   the first key or click. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  let ctx = null;
  let master = null, sfxBus = null, musicBus = null;
  let noiseBuffer = null;
  let unlocked = false;
  let muted = false;
  /* v7 options: the three sliders, and whether losing focus silences the game. */
  const vols = { master: 1, music: 1, sfx: 1 };
  let muteUnfocused = false, blurred = false;
  /* Per-play variation, set once by play() so every layer of one sound shares it:
     `pitch` detunes, `volMul` attenuates (distance, quiet variants). */
  let pitch = 1;
  let volMul = 1;

  function makeNoiseBuffer() {
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // no Web Audio: the game simply runs silent

    try {
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.connect(master);

      musicBus = ctx.createGain();
      musicBus.connect(master);
      applyVolumes();

      noiseBuffer = makeNoiseBuffer();
    } catch (err) {
      console.warn('[DS] audio unavailable:', err.message);
      ctx = null;
    }
  }

  // --- primitives -----------------------------------------------------------

  /* o: { freq, to, dur, type, vol, delay, attack, dest } */
  function tone(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const vol = (o.vol == null ? 0.2 : o.vol) * volMul;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq * pitch, t0);
    if (o.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to * pitch), t0 + dur);
    }

    // Exponential ramps cannot touch zero, hence the 0.0001 floor.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(o.dest || sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* o: { dur, vol, freq, freqTo, q, type, delay } — filtered noise for impacts. */
  function noise(o) {
    if (!ctx || !noiseBuffer) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const vol = (o.vol == null ? 0.2 : o.vol) * volMul;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = o.type || 'lowpass';
    filter.frequency.setValueAtTime((o.freq || 1200) * pitch, t0);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqTo * pitch), t0 + dur);
    filter.Q.value = o.q || 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --- sfx ------------------------------------------------------------------

  const SFX = {
    menuMove:  function () { tone({ freq: 440, dur: 0.05, type: 'square', vol: 0.12 }); },
    menuPick:  function () { tone({ freq: 520, to: 880, dur: 0.13, type: 'square', vol: 0.16 }); },
    error:     function () { tone({ freq: 160, to: 90, dur: 0.16, type: 'sawtooth', vol: 0.16 }); },

    jump:      function () { tone({ freq: 300, to: 620, dur: 0.11, type: 'square', vol: 0.13 }); },
    land:      function () { noise({ dur: 0.07, vol: 0.11, freq: 700 }); },
    dash:      function () { noise({ dur: 0.16, vol: 0.16, freq: 2600, freqTo: 400, type: 'bandpass', q: 2 }); },

    swing:     function () { noise({ dur: 0.1, vol: 0.13, freq: 2200, freqTo: 700, type: 'bandpass', q: 1.4 }); },
    hit:       function () { noise({ dur: 0.09, vol: 0.2, freq: 1000, freqTo: 220 });
                             tone({ freq: 190, to: 90, dur: 0.09, type: 'square', vol: 0.12 }); },
    crit:      function () { noise({ dur: 0.12, vol: 0.24, freq: 1800, freqTo: 260 });
                             tone({ freq: 720, to: 1400, dur: 0.1, type: 'square', vol: 0.16 }); },
    block:     function () { tone({ freq: 900, to: 500, dur: 0.07, type: 'triangle', vol: 0.13 }); },

    hurt:      function () { tone({ freq: 340, to: 120, dur: 0.22, type: 'sawtooth', vol: 0.2 }); },
    die:       function () { tone({ freq: 300, to: 60, dur: 0.9, type: 'sawtooth', vol: 0.22 }); },
    enemyDie:  function () { noise({ dur: 0.24, vol: 0.18, freq: 1400, freqTo: 140 });
                             tone({ freq: 240, to: 70, dur: 0.24, type: 'square', vol: 0.12 }); },

    shoot:     function () { tone({ freq: 800, to: 300, dur: 0.09, type: 'triangle', vol: 0.13 }); },
    arrowHit:  function () { noise({ dur: 0.06, vol: 0.14, freq: 2600, type: 'highpass' }); },
    cast:      function () { tone({ freq: 420, to: 900, dur: 0.16, type: 'sine', vol: 0.15 }); },
    fire:      function () { noise({ dur: 0.28, vol: 0.16, freq: 900, freqTo: 200 }); },
    ice:       function () { tone({ freq: 1300, to: 700, dur: 0.2, type: 'sine', vol: 0.14 }); },
    lightning: function () { noise({ dur: 0.14, vol: 0.2, freq: 4200, type: 'highpass' });
                             tone({ freq: 1600, to: 400, dur: 0.14, type: 'sawtooth', vol: 0.1 }); },

    coin:      function () { tone({ freq: 980, dur: 0.06, type: 'square', vol: 0.12 });
                             tone({ freq: 1470, dur: 0.09, type: 'square', vol: 0.1, delay: 0.05 }); },
    shard:     function () { tone({ freq: 1200, dur: 0.06, type: 'triangle', vol: 0.12 });
                             tone({ freq: 1800, dur: 0.1, type: 'triangle', vol: 0.1, delay: 0.05 }); },
    heal:      function () { tone({ freq: 520, dur: 0.09, type: 'sine', vol: 0.15 });
                             tone({ freq: 780, dur: 0.13, type: 'sine', vol: 0.13, delay: 0.08 }); },
    pickup:    function () { tone({ freq: 640, to: 960, dur: 0.11, type: 'triangle', vol: 0.14 }); },

    chestOpen: function () { noise({ dur: 0.18, vol: 0.16, freq: 900 });
                             tone({ freq: 300, to: 700, dur: 0.26, type: 'triangle', vol: 0.14, delay: 0.05 }); },
    locked:    function () { tone({ freq: 200, dur: 0.06, type: 'square', vol: 0.14 });
                             tone({ freq: 150, dur: 0.08, type: 'square', vol: 0.12, delay: 0.07 }); },

    enchant:   function () { [0, 0.09, 0.18].forEach(function (d, i) {
                               tone({ freq: 660 + i * 220, dur: 0.16, type: 'sine', vol: 0.14, delay: d });
                             }); },
    salvage:   function () { noise({ dur: 0.2, vol: 0.16, freq: 3000, freqTo: 500, type: 'bandpass', q: 2 }); },
    upgrade:   function () { [0, 0.08, 0.16, 0.26].forEach(function (d, i) {
                               tone({ freq: 520 * Math.pow(1.26, i), dur: 0.2, type: 'square', vol: 0.13, delay: d });
                             }); },

    stairs:    function () { [0, 0.1, 0.2].forEach(function (d, i) {
                               tone({ freq: 500 - i * 110, dur: 0.18, type: 'triangle', vol: 0.15, delay: d });
                             }); },
    bossRoar:  function () { tone({ freq: 150, to: 55, dur: 1.1, type: 'sawtooth', vol: 0.26 });
                             noise({ dur: 1.0, vol: 0.16, freq: 500, freqTo: 90 }); },
    slam:      function () { noise({ dur: 0.34, vol: 0.26, freq: 500, freqTo: 60 });
                             tone({ freq: 120, to: 40, dur: 0.34, type: 'square', vol: 0.18 }); },
    victory:   function () { [523, 659, 784, 1047].forEach(function (f, i) {
                               tone({ freq: f, dur: 0.3, type: 'square', vol: 0.16, delay: i * 0.13 });
                             }); },

    grab:      function () { noise({ dur: 0.05, vol: 0.1, freq: 1800, type: 'bandpass', q: 2 });
                             tone({ freq: 260, to: 200, dur: 0.05, type: 'triangle', vol: 0.08 }); },
    boom:      function () { noise({ dur: 0.45, vol: 0.26, freq: 1000, freqTo: 50 });
                             tone({ freq: 100, to: 34, dur: 0.4, type: 'sine', vol: 0.26 }); },

    /* --- weapons: one swing and one impact voice per weapon family ------------ */
    swingSword:  function () { noise({ dur: 0.12, vol: 0.14, freq: 2600, freqTo: 800, type: 'bandpass', q: 1.6 });
                               tone({ freq: 1900, to: 900, dur: 0.09, type: 'triangle', vol: 0.04 }); },
    swingSpin:   function () { noise({ dur: 0.32, vol: 0.15, freq: 1200, freqTo: 3000, type: 'bandpass', q: 1.2 });
                               noise({ dur: 0.22, vol: 0.12, freq: 3000, freqTo: 700, type: 'bandpass', q: 1.2, delay: 0.16 }); },
    swingHeavy:  function () { noise({ dur: 0.26, vol: 0.18, freq: 1000, freqTo: 140 });
                               tone({ freq: 120, to: 55, dur: 0.22, type: 'sawtooth', vol: 0.1 }); },
    swingDagger: function () { noise({ dur: 0.06, vol: 0.12, freq: 4200, freqTo: 1800, type: 'bandpass', q: 2 }); },
    swingAxe:    function () { noise({ dur: 0.2, vol: 0.18, freq: 1300, freqTo: 220 });
                               tone({ freq: 150, to: 70, dur: 0.18, type: 'sawtooth', vol: 0.09 }); },
    swingSpear:  function () { noise({ dur: 0.09, vol: 0.13, freq: 3200, type: 'highpass' });
                               tone({ freq: 480, to: 1250, dur: 0.06, type: 'sine', vol: 0.06 }); },
    swingStaff:  function () { tone({ freq: 300, to: 520, dur: 0.13, type: 'sine', vol: 0.09 });
                               noise({ dur: 0.08, vol: 0.06, freq: 1800, type: 'bandpass', q: 1 }); },
    bowLoose:    function () { tone({ freq: 210, to: 110, dur: 0.06, type: 'triangle', vol: 0.14 });
                               noise({ dur: 0.07, vol: 0.09, freq: 3400, type: 'highpass' }); },
    hitBlade:    function () { noise({ dur: 0.09, vol: 0.2, freq: 2800, freqTo: 600 });
                               tone({ freq: 1500, dur: 0.07, type: 'triangle', vol: 0.06 });
                               tone({ freq: 900, to: 400, dur: 0.06, type: 'square', vol: 0.08 }); },
    hitBlunt:    function () { noise({ dur: 0.12, vol: 0.24, freq: 700, freqTo: 90 });
                               tone({ freq: 95, to: 42, dur: 0.14, type: 'sine', vol: 0.2 }); },
    hitPierce:   function () { noise({ dur: 0.06, vol: 0.16, freq: 3200, type: 'highpass' });
                               tone({ freq: 320, to: 140, dur: 0.07, type: 'square', vol: 0.09 }); },

    /* --- the eight elements -------------------------------------------------- */
    elFire:      function () { noise({ dur: 0.34, vol: 0.17, freq: 1500, freqTo: 260 });
                               [0, 0.06, 0.13, 0.2].forEach(function (d, i) {
                                 noise({ dur: 0.025, vol: 0.09, freq: 3000 + i * 500, type: 'highpass', delay: d });
                               }); },
    elIce:       function () { tone({ freq: 2300, to: 1500, dur: 0.22, type: 'sine', vol: 0.09 });
                               tone({ freq: 3100, to: 2100, dur: 0.16, type: 'triangle', vol: 0.06, delay: 0.04 });
                               noise({ dur: 0.1, vol: 0.08, freq: 5200, type: 'highpass' }); },
    elLightning: function () { noise({ dur: 0.16, vol: 0.2, freq: 4600, type: 'highpass' });
                               tone({ freq: 1800, to: 300, dur: 0.16, type: 'sawtooth', vol: 0.1 });
                               tone({ freq: 90, dur: 0.12, type: 'square', vol: 0.08, delay: 0.03 }); },
    elPoison:    function () { [0, 0.07, 0.15].forEach(function (d, i) {
                               tone({ freq: 240 + i * 90, to: 520 + i * 120, dur: 0.09, type: 'sine', vol: 0.12, delay: d });
                             });
                             noise({ dur: 0.22, vol: 0.06, freq: 700, type: 'bandpass', q: 2 }); },
    elWater:     function () { noise({ dur: 0.26, vol: 0.14, freq: 900, freqTo: 350, type: 'bandpass', q: 1.2 });
                               tone({ freq: 700, to: 280, dur: 0.14, type: 'sine', vol: 0.1 }); },
    elEarth:     function () { noise({ dur: 0.34, vol: 0.22, freq: 380, freqTo: 55 });
                               tone({ freq: 72, to: 34, dur: 0.34, type: 'sine', vol: 0.22 }); },
    elLeaf:      function () { noise({ dur: 0.22, vol: 0.1, freq: 3400, freqTo: 1800, type: 'bandpass', q: 1.6 });
                               noise({ dur: 0.16, vol: 0.08, freq: 2600, freqTo: 4000, type: 'bandpass', q: 1.6, delay: 0.1 }); },
    elWind:      function () { noise({ dur: 0.42, vol: 0.14, freq: 500, freqTo: 2200, type: 'bandpass', q: 1.4 });
                               noise({ dur: 0.3, vol: 0.1, freq: 2200, freqTo: 400, type: 'bandpass', q: 1.4, delay: 0.24 }); },
    infuse:      function () { [0, 0.06, 0.12].forEach(function (d, i) {
                               tone({ freq: 440 * Math.pow(1.5, i), dur: 0.2, type: 'sine', vol: 0.1, delay: d });
                             });
                             noise({ dur: 0.18, vol: 0.06, freq: 2400, freqTo: 5000, type: 'bandpass', q: 2 }); },

    /* --- reactions: one voice per signature style (see FX3D.REACTION_STYLE) ---- */
    reactChain:  function () { [0, 0.05, 0.11, 0.18].forEach(function (d, i) {
                               noise({ dur: 0.07, vol: 0.18 - i * 0.03, freq: 4800 - i * 600, type: 'highpass', delay: d });
                               tone({ freq: 1700 - i * 250, to: 260, dur: 0.09, type: 'sawtooth', vol: 0.08, delay: d });
                             }); },
    reactShatter:function () { noise({ dur: 0.1, vol: 0.2, freq: 5200, type: 'highpass' });
                               [0, 0.03, 0.07, 0.1, 0.15].forEach(function (d, i) {
                                 tone({ freq: 2600 + i * 430, to: 1700 + i * 300, dur: 0.06, type: 'triangle', vol: 0.09, delay: d });
                               }); },
    reactExplosion: function () { noise({ dur: 0.55, vol: 0.28, freq: 1200, freqTo: 45 });
                               tone({ freq: 95, to: 30, dur: 0.5, type: 'sine', vol: 0.3 });
                               tone({ freq: 200, to: 50, dur: 0.2, type: 'square', vol: 0.1 }); },
    reactVortex: function () { noise({ dur: 0.6, vol: 0.16, freq: 300, freqTo: 3200, type: 'bandpass', q: 2.2 });
                               tone({ freq: 180, to: 760, dur: 0.55, type: 'sine', vol: 0.09 }); },
    reactSteam:  function () { noise({ dur: 0.55, vol: 0.14, freq: 5200, freqTo: 2000, type: 'highpass' });
                               tone({ freq: 300, to: 180, dur: 0.3, type: 'sine', vol: 0.05 }); },
    reactBloom:  function () { [0, 0.07, 0.14, 0.22].forEach(function (d, i) {
                               tone({ freq: 392 * Math.pow(1.26, i), dur: 0.24, type: 'sine', vol: 0.11, delay: d });
                             }); },

    /* --- bosses: a roar per boss, and the tells the new enemies give ------------ */
    roarWarden:  function () { tone({ freq: 90, to: 38, dur: 1.3, type: 'sawtooth', vol: 0.26 });
                               noise({ dur: 1.2, vol: 0.2, freq: 260, freqTo: 50 });
                               tone({ freq: 50, dur: 1.0, type: 'sine', vol: 0.2, delay: 0.1 }); },
    roarKing:    function () { tone({ freq: 180, to: 70, dur: 1.0, type: 'sawtooth', vol: 0.24 });
                               tone({ freq: 184, to: 66, dur: 1.0, type: 'square', vol: 0.1 });
                               noise({ dur: 0.9, vol: 0.14, freq: 700, freqTo: 120 }); },
    roarArbiter: function () { [0, 0.12, 0.24].forEach(function (d, i) {
                               tone({ freq: 196 * Math.pow(1.5, i), dur: 0.9, type: 'sawtooth', vol: 0.11, delay: d });
                             });
                             noise({ dur: 0.7, vol: 0.08, freq: 1500, freqTo: 400, delay: 0.1 }); },
    roarWyrm:    function () { tone({ freq: 340, to: 110, dur: 1.2, type: 'sawtooth', vol: 0.22 });
                               tone({ freq: 700, to: 200, dur: 0.9, type: 'square', vol: 0.06 });
                               noise({ dur: 1.1, vol: 0.18, freq: 2200, freqTo: 300, type: 'bandpass', q: 0.8 }); },
    roarLich:    function () { tone({ freq: 130, to: 65, dur: 1.4, type: 'triangle', vol: 0.22 });
                               tone({ freq: 133, to: 61, dur: 1.4, type: 'sine', vol: 0.16 });
                               noise({ dur: 1.2, vol: 0.09, freq: 900, freqTo: 200, type: 'bandpass', q: 3 }); },
    roarMagma:   function () { tone({ freq: 70, to: 32, dur: 1.5, type: 'sawtooth', vol: 0.28 });
                               noise({ dur: 1.4, vol: 0.24, freq: 900, freqTo: 70 });
                               [0.2, 0.5, 0.8].forEach(function (d) {
                                 noise({ dur: 0.1, vol: 0.12, freq: 2500, type: 'highpass', delay: d });
                               }); },
    telegraph:   function () { tone({ freq: 660, dur: 0.05, type: 'square', vol: 0.08 });
                               tone({ freq: 880, dur: 0.07, type: 'square', vol: 0.08, delay: 0.07 }); },
    screech:     function () { tone({ freq: 1300, to: 2400, dur: 0.22, type: 'sawtooth', vol: 0.1 });
                               tone({ freq: 1340, to: 2300, dur: 0.22, type: 'square', vol: 0.05 }); },
    growl:       function () { tone({ freq: 110, to: 70, dur: 0.3, type: 'sawtooth', vol: 0.14 });
                               noise({ dur: 0.26, vol: 0.07, freq: 500, freqTo: 200 }); },
    squish:      function () { tone({ freq: 240, to: 90, dur: 0.11, type: 'sine', vol: 0.14 });
                               noise({ dur: 0.07, vol: 0.06, freq: 900, type: 'bandpass', q: 1.5 }); },
    rattle:      function () { [0, 0.04, 0.09, 0.13].forEach(function (d) {
                               noise({ dur: 0.03, vol: 0.09, freq: 3500 + Math.random() * 1500, type: 'bandpass', q: 3, delay: d });
                             }); },
    landHard:    function () { noise({ dur: 0.14, vol: 0.2, freq: 600, freqTo: 80 });
                               tone({ freq: 100, to: 50, dur: 0.12, type: 'sine', vol: 0.14 }); },

    /* --- v7: the tells of the bestiary of the three acts ------------------------ */
    clack:       function () { [0, 0.07].forEach(function (d) {
                               noise({ dur: 0.03, vol: 0.13, freq: 2800, type: 'bandpass', q: 4, delay: d });
                               tone({ freq: 1500, to: 900, dur: 0.03, type: 'square', vol: 0.05, delay: d });
                             }); },
    hiss:        function () { noise({ dur: 0.42, vol: 0.1, freq: 5200, freqTo: 3000, type: 'highpass' }); },
    chain:       function () { [0, 0.05, 0.1, 0.16, 0.22].forEach(function (d, i) {
                               noise({ dur: 0.035, vol: 0.09, freq: 3000 + i * 250, type: 'bandpass', q: 5, delay: d });
                               tone({ freq: 1200 - i * 60, dur: 0.03, type: 'triangle', vol: 0.04, delay: d });
                             }); },
    gaze:        function () { tone({ freq: 140, to: 420, dur: 0.5, type: 'sine', vol: 0.14 });
                               tone({ freq: 143, to: 424, dur: 0.5, type: 'triangle', vol: 0.09 });
                               noise({ dur: 0.4, vol: 0.05, freq: 900, freqTo: 3400, type: 'bandpass', q: 3 }); },
    bleat:       function () { tone({ freq: 380, to: 300, dur: 0.24, type: 'sawtooth', vol: 0.1 });
                               tone({ freq: 60, dur: 0.24, type: 'square', vol: 0.05 }); },
    neigh:       function () { tone({ freq: 500, to: 1100, dur: 0.16, type: 'sawtooth', vol: 0.1 });
                               tone({ freq: 1100, to: 380, dur: 0.3, type: 'sawtooth', vol: 0.1, delay: 0.16 }); },
    howl:        function () { tone({ freq: 360, to: 620, dur: 0.22, type: 'sine', vol: 0.13 });
                               tone({ freq: 620, to: 260, dur: 0.4, type: 'sine', vol: 0.13, delay: 0.22 }); },
    bubble:      function () { [0, 0.09, 0.19].forEach(function (d, i) {
                               tone({ freq: 260 + i * 70, to: 520 + i * 90, dur: 0.07, type: 'sine', vol: 0.1, delay: d });
                             }); },
    spore:       function () { noise({ dur: 0.34, vol: 0.09, freq: 700, freqTo: 1800, type: 'bandpass', q: 1.2 });
                               tone({ freq: 180, to: 120, dur: 0.3, type: 'sine', vol: 0.06 }); },
    steam:       function () { noise({ dur: 0.7, vol: 0.13, freq: 5600, freqTo: 1800, type: 'highpass' }); },
    thunder:     function () { noise({ dur: 0.9, vol: 0.28, freq: 900, freqTo: 40 });
                               noise({ dur: 0.12, vol: 0.22, freq: 5200, type: 'highpass' });
                               tone({ freq: 70, to: 30, dur: 0.8, type: 'sine', vol: 0.26, delay: 0.05 }); },
    boulder:     function () { tone({ freq: 220, to: 70, dur: 0.22, type: 'sawtooth', vol: 0.12 });
                               noise({ dur: 0.2, vol: 0.12, freq: 700, freqTo: 150 }); },
    roarMinotaur:function () { tone({ freq: 110, to: 45, dur: 1.2, type: 'sawtooth', vol: 0.26 });
                               tone({ freq: 220, to: 90, dur: 0.9, type: 'square', vol: 0.08 });
                               noise({ dur: 1.0, vol: 0.18, freq: 800, freqTo: 100 }); },
    roarMedusa:  function () { tone({ freq: 900, to: 300, dur: 1.0, type: 'sawtooth', vol: 0.12 });
                               noise({ dur: 1.0, vol: 0.14, freq: 4800, freqTo: 2400, type: 'highpass' });
                               tone({ freq: 140, to: 420, dur: 1.0, type: 'sine', vol: 0.14 }); },
    roarTalos:   function () { tone({ freq: 95, to: 42, dur: 1.4, type: 'square', vol: 0.2 });
                               [0.1, 0.4, 0.7, 1.0].forEach(function (d) {
                                 noise({ dur: 0.08, vol: 0.16, freq: 2400, type: 'bandpass', q: 4, delay: d });
                               });
                               noise({ dur: 1.2, vol: 0.14, freq: 700, freqTo: 90 }); },
    roarHades:   function () { tone({ freq: 70, to: 30, dur: 1.6, type: 'sawtooth', vol: 0.24 });
                               tone({ freq: 74, to: 28, dur: 1.6, type: 'sine', vol: 0.2 });
                               noise({ dur: 1.4, vol: 0.1, freq: 500, freqTo: 80, type: 'bandpass', q: 2 }); },
    roarZeus:    function () { tone({ freq: 120, to: 60, dur: 1.3, type: 'sawtooth', vol: 0.24 });
                               noise({ dur: 0.9, vol: 0.24, freq: 900, freqTo: 40 });
                               noise({ dur: 0.1, vol: 0.2, freq: 5400, type: 'highpass', delay: 0.05 }); },

    /* --- ambience --------------------------------------------------------------- */
    torch:       function () { [0, 0.05, 0.11].forEach(function (d) {
                               noise({ dur: 0.02 + Math.random() * 0.03, vol: 0.05 + Math.random() * 0.04,
                                       freq: 1800 + Math.random() * 3000, type: 'bandpass', q: 2, delay: d });
                             });
                             noise({ dur: 0.3, vol: 0.02, freq: 500, freqTo: 350 }); },

    /* --- interface (the HTML menus and HUD) -------------------------------------- */
    uiHover:     function () { tone({ freq: 1250, dur: 0.025, type: 'sine', vol: 0.045 }); },
    uiConfirm:   function () { tone({ freq: 600, dur: 0.07, type: 'triangle', vol: 0.12 });
                               tone({ freq: 900, dur: 0.11, type: 'triangle', vol: 0.12, delay: 0.06 }); },
    uiOpen:      function () { tone({ freq: 380, to: 760, dur: 0.14, type: 'sine', vol: 0.1 });
                               noise({ dur: 0.1, vol: 0.05, freq: 1500, freqTo: 4000, type: 'bandpass', q: 1.5 }); },
    uiClose:     function () { tone({ freq: 760, to: 360, dur: 0.12, type: 'sine', vol: 0.09 }); },
    uiTab:       function () { tone({ freq: 540, dur: 0.035, type: 'square', vol: 0.06 }); },
    uiEquip:     function () { noise({ dur: 0.07, vol: 0.14, freq: 2200, freqTo: 900, type: 'bandpass', q: 2 });
                               tone({ freq: 340, to: 500, dur: 0.09, type: 'triangle', vol: 0.11 }); },
    uiDeny:      function () { tone({ freq: 200, to: 140, dur: 0.12, type: 'square', vol: 0.11 }); }
  };

  /* The menus were written against menuMove / menuPick / error; they now speak
     with the interface voices without every call site being touched. */
  SFX.menuMove = SFX.uiTab;
  SFX.menuPick = SFX.uiConfirm;
  SFX.error = SFX.uiDeny;

  /* Sounds that would smear into noise if every hit in a crowd fired one: the
     minimum gap between two plays of the same name, in milliseconds. */
  const MIN_GAP = {
    hit: 40, crit: 40, arrowHit: 40, hitBlade: 40, hitBlunt: 40, hitPierce: 40,
    coin: 30, shard: 30, uiHover: 35, uiTab: 35, torch: 250, telegraph: 120,
    rattle: 120, squish: 90, growl: 200, land: 60, landHard: 60, enemyDie: 60,
    clack: 100, hiss: 200, chain: 200, bubble: 150, howl: 300, bleat: 200, neigh: 250, spore: 200,
    steam: 250, boulder: 150
  };
  /* Names that are detuned a little on every play so a repeated sound does not
     sound like a sample loop. Tonal cues (UI, jingles) stay exact. */
  const DETUNE = {
    hit: 0.07, crit: 0.05, arrowHit: 0.08, hitBlade: 0.07, hitBlunt: 0.07, hitPierce: 0.07,
    swing: 0.06, swingSword: 0.06, swingSpin: 0.04, swingHeavy: 0.05, swingDagger: 0.08,
    swingAxe: 0.05, swingSpear: 0.06, swingStaff: 0.05, bowLoose: 0.06, shoot: 0.06,
    enemyDie: 0.08, hurt: 0.04, jump: 0.05, land: 0.08, landHard: 0.05, dash: 0.05,
    squish: 0.12, rattle: 0.1, growl: 0.1, torch: 0.1, screech: 0.08,
    clack: 0.08, bubble: 0.1, howl: 0.06, bleat: 0.08, neigh: 0.05
  };
  const lastPlayed = {};

  /* play(name, opts): opts.vol scales the volume (0..1, e.g. by distance),
     opts.pitch multiplies the pitch on top of the random detune. */
  function play(name, opts) {
    if (!unlocked || !ctx || muted) return;
    const fn = SFX[name];
    if (!fn) return;
    const gap = MIN_GAP[name];
    if (gap) {
      const now = Date.now();
      if (now - (lastPlayed[name] || 0) < gap) return;
      lastPlayed[name] = now;
    }
    const d = DETUNE[name] || 0;
    pitch = (1 + (Math.random() * 2 - 1) * d) * (opts && opts.pitch || 1);
    volMul = opts && opts.vol != null ? opts.vol : 1;
    try { fn(); } finally { pitch = 1; volMul = 1; }
  }

  /* --- named helpers the game calls instead of picking a raw sound ---------- */

  const WEAPON_SWING = {
    sword: 'swingSword', dagger: 'swingDagger', greataxe: 'swingAxe', axe: 'swingAxe',
    spear: 'swingSpear', staff: 'swingStaff', bow: 'bowLoose', hammer: 'swingHeavy'
  };
  const WEAPON_HIT = {
    sword: 'hitBlade', dagger: 'hitBlade', greataxe: 'hitBlade', axe: 'hitBlade',
    spear: 'hitPierce', hammer: 'hitBlunt', staff: 'hitBlunt', bow: 'hitPierce'
  };

  /* A melee swing: the weapon's own voice, or the spin / heavy whoosh for its
     finishers. Unknown weapons fall back to the plain swing. */
  function swing(weaponKey, stepKey, heavy) {
    if (heavy) return play('swingHeavy');
    if (stepKey === 'spin') return play('swingSpin');
    play(WEAPON_SWING[weaponKey] || 'swing');
  }

  /* An impact: the weapon's hit voice, with the crit ring layered on top. */
  function impact(weaponKey, crit, heavy) {
    play(heavy ? 'hitBlunt' : (WEAPON_HIT[weaponKey] || 'hit'));
    if (crit) play('crit');
  }

  /* An elemental reaction, voiced by its signature style (FX3D.REACTION_STYLE). */
  function reaction(pairKey) {
    const map = DS.FX3D && DS.FX3D.REACTION_STYLE;
    const style = (map && map[pairKey]) || 'vortex';
    play('react' + style.charAt(0).toUpperCase() + style.slice(1));
  }

  const ROARS = { warden: 'roarWarden', king: 'roarKing', arbiter: 'roarArbiter',
                  wyrm: 'roarWyrm', lich: 'roarLich', magma: 'roarMagma' };
  function roar(bossKey) { play(ROARS[bossKey] || 'bossRoar'); }

  /* Torches crackle when the hero is near one. `dist` is the distance in level
     pixels to the nearest torch; the renderer calls this once a frame. Quiet
     past 140 px, and a random gap so it never sounds like a loop. */
  let torchAt = 0;
  function torchNear(dist) {
    if (!ctx || dist > 140) return;
    const now = Date.now();
    if (now < torchAt) return;
    torchAt = now + 500 + Math.random() * 1400;
    play('torch', { vol: Math.max(0.15, 1 - dist / 140) });
  }

  // --- procedural music -----------------------------------------------------

  // Melody steps are semitone offsets from the root, natural-minor flavoured.
  const MOODS = {
    calm:    { root: 110.0, steps: [0, 3, 7, 10, 12, 10, 7, 3], bpm: 84,  wave: 'triangle' },
    dungeon: { root: 98.0,  steps: [0, 5, 3, 7, 0, 10, 7, 3],   bpm: 96,  wave: 'square' },
    boss:    { root: 87.3,  steps: [0, 1, 0, 6, 0, 1, 6, 7],    bpm: 132, wave: 'sawtooth' }
  };

  const music = { on: false, mood: null, cfg: null, step: 0, nextTime: 0 };

  function semis(root, n) { return root * Math.pow(2, n / 12); }

  function scheduleStep(index, when) {
    const cfg = music.cfg;
    const bar = index % 8;
    const delay = when - ctx.currentTime;

    // Bass pulse on the strong beats.
    if (bar % 2 === 0) {
      tone({ freq: cfg.root, dur: 0.26, type: 'triangle', vol: 0.5, delay: delay, dest: musicBus });
    }

    // Melodic line, one octave up.
    tone({
      freq: semis(cfg.root * 2, cfg.steps[bar]), dur: 0.22, type: cfg.wave,
      vol: 0.22, delay: delay, dest: musicBus
    });

    // A fifth two octaves up on two bars adds movement without a chord engine.
    if (bar === 4 || bar === 7) {
      tone({
        freq: semis(cfg.root * 4, cfg.steps[bar] + 7), dur: 0.18, type: 'sine',
        vol: 0.12, delay: delay, dest: musicBus
      });
    }
  }

  function setMusic(mood) {
    if (!ctx) return;
    if (music.on && music.mood === mood) return;
    music.mood = mood;
    music.cfg = MOODS[mood] || MOODS.dungeon;
    music.on = !!mood;
    music.step = 0;
    music.nextTime = ctx.currentTime + 0.08;
  }

  function stopMusic() { music.on = false; music.mood = null; }

  /* Called once per frame. Schedules slightly ahead of the audio clock so the
     sequencer never depends on frame timing staying perfectly even. */
  function update() {
    if (!ctx || !music.on) return;
    const stepDur = 60 / music.cfg.bpm / 2; // eighth notes
    const horizon = ctx.currentTime + 0.25;
    let guard = 0;
    while (music.nextTime < horizon && guard++ < 32) {
      scheduleStep(music.step, music.nextTime);
      music.step = (music.step + 1) % 8;
      music.nextTime += stepDur;
    }
  }

  function silent() { return muted || (muteUnfocused && blurred); }

  function applyVolumes() {
    if (!master) return;
    master.gain.value = silent() ? 0 : 0.5 * vols.master;
    sfxBus.gain.value = 0.8 * vols.sfx;
    musicBus.gain.value = 0.26 * vols.music;
  }

  function setVolumes(v) {
    ['master', 'music', 'sfx'].forEach(function (k) {
      if (v && typeof v[k] === 'number' && isFinite(v[k])) vols[k] = Math.min(1, Math.max(0, v[k]));
    });
    if (v && typeof v.muteUnfocused === 'boolean') muteUnfocused = v.muteUnfocused;
    applyVolumes();
  }

  // (guarded: the unit tests load this file with no window events and no document)
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('blur', function () { blurred = true; applyVolumes(); });
    window.addEventListener('focus', function () { blurred = false; applyVolumes(); });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () { blurred = document.hidden; applyVolumes(); });
  }

  function toggleMute() {
    muted = !muted;
    applyVolumes();
    return muted;
  }

  DS.Audio = {
    unlock: unlock,
    play: play,
    swing: swing,
    impact: impact,
    reaction: reaction,
    roar: roar,
    torchNear: torchNear,
    sfxNames: function () { return Object.keys(SFX); },
    setMusic: setMusic,
    stopMusic: stopMusic,
    update: update,
    toggleMute: toggleMute,
    setVolumes: setVolumes,
    isMuted: function () { return muted; },
    isReady: function () { return !!ctx; }
  };
})(window.DS);
