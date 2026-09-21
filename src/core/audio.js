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
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.8;
      sfxBus.connect(master);

      musicBus = ctx.createGain();
      musicBus.gain.value = 0.26;
      musicBus.connect(master);

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
    const vol = o.vol == null ? 0.2 : o.vol;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
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
    const vol = o.vol == null ? 0.2 : o.vol;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = o.type || 'lowpass';
    filter.frequency.setValueAtTime(o.freq || 1200, t0);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqTo), t0 + dur);
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
                             }); }
  };

  function play(name) {
    if (!unlocked || !ctx || muted) return;
    const fn = SFX[name];
    if (fn) fn();
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

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  DS.Audio = {
    unlock: unlock,
    play: play,
    setMusic: setMusic,
    stopMusic: stopMusic,
    update: update,
    toggleMute: toggleMute,
    isMuted: function () { return muted; },
    isReady: function () { return !!ctx; }
  };
})(window.DS);
