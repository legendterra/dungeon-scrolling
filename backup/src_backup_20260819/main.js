/* Boot, scene switching, and the fixed-timestep game loop. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const STEP = 1000 / 60;
  const MAX_CATCHUP = 5; // never simulate more than this many steps in one frame

  let current = null;
  let pending = null;
  let accumulator = 0;
  let lastTime = 0;

  // Scene swaps are deferred to the start of the next frame so a scene can
  // request one from inside its own update without tearing.
  function setScene(scene) { pending = scene; }

  DS.Scenes = {
    menu: function () { setScene(DS.Menu.createMenu()); },

    play: function (seed) {
      const runSeed = seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed;
      const g = DS.Game.createRun(runSeed);
      DS.Game.loadLevel(g, 'normal');
      setScene({
        g: g,
        update: function () { DS.Game.update(g); },
        draw: function () { DS.Game.draw(g); }
      });
    },

    gameOver: function (g, won) { setScene(DS.Menu.createGameOver(g, won)); }
  };

  function frame(now) {
    requestAnimationFrame(frame);

    if (pending) { current = pending; pending = null; accumulator = 0; DS.currentScene = current; }
    if (!current) return;

    if (!lastTime) lastTime = now;
    let delta = now - lastTime;
    lastTime = now;

    // A backgrounded tab produces a huge delta; clamp instead of fast-forwarding.
    if (delta > 250) delta = STEP;
    accumulator += delta;

    let steps = 0;
    while (accumulator >= STEP && steps < MAX_CATCHUP) {
      DS.Input.poll();
      current.update();
      DS.Input.endFrame();
      accumulator -= STEP;
      steps++;
      if (pending) break; // stop simulating a scene that just handed over
    }
    if (steps === MAX_CATCHUP) accumulator = 0;

    DS.Audio.update();
    current.draw();
  }

  function boot() {
    DS.R.init();
    DS.Scenes.menu();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.DS);
