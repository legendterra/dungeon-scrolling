/* Main menu, how-to-play, records, and the game-over screen.
   The game-over screen is where permadeath is made explicit: the run summary is
   the only thing that survives, and it survives as a record, not as power. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const UI = DS.UI;
  const INK = '#d8d5e8';
  const MUTED = '#9b96b8';
  const GOLD = '#f2c14e';

  // --- shared backdrop ------------------------------------------------------

  function backdrop(state) {
    const R = DS.R;
    R.begin();
    R.uiMode();   // menus are pure screen space; no camera punch here
    R.background(1);

    // A silhouette floor so the menu shares the dungeon's silhouette language.
    R.rectS(0, C.H - 24, C.W, 24, '#12101c');
    R.rectS(0, C.H - 24, C.W, 2, '#2a2740');

    // A slime idles along the bottom for a bit of life.
    const t = state.frame * 0.02;
    const sx = C.W / 2 + Math.sin(t) * 90;
    const hop = Math.abs(Math.sin(t * 3)) * 6;
    const flip = Math.cos(t) < 0;
    const spr = (flip ? DS.SPR.flip.slime : DS.SPR.slime)[hop > 1 ? 0 : 1];
    R.sprS(spr, sx, C.H - 33 - hop);

    for (let i = 0; i < 2; i++) {
      const tx = i === 0 ? 24 : C.W - 32;
      const bob = Math.sin((state.frame + i * 30) * 0.18) > 0 ? 0 : 1;
      R.sprS(DS.SPR.tile.torch, tx, C.H - 56 + bob);
      glowS(R, tx + 4, C.H - 53, 26, 'rgba(242,193,78,0.10)');
    }
  }

  function glowS(R, x, y, radius, color) {
    const cx = R.ctx;
    const grd = cx.createRadialGradient(x, y, 0, x, y, radius);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = grd;
    cx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function title(state) {
    const R = DS.R;
    const bob = Math.sin(state.frame * 0.04) * 1.5;
    R.textCenter('DUNGEON', C.W / 2, 20 + bob, GOLD, 3);
    R.textCenter('SCROLLING', C.W / 2, 44 + bob, '#c86ee0', 2);
  }

  // --- main menu ------------------------------------------------------------

  const ITEMS = ['START RUN', 'HOW TO PLAY', 'RECORDS', 'MUTE'];

  function createMenu() {
    const state = { frame: 0, cursor: 0, page: 'menu', stats: DS.Storage.load() };

    return {
      update: function () {
        const In = DS.Input;
        state.frame++;
        DS.Audio.setMusic('calm');

        if (state.page !== 'menu') {
          if (In.justPressed('back') || In.justPressed('confirm')) {
            In.consume('back'); In.consume('confirm');
            state.page = 'menu';
            DS.Audio.play('menuMove');
          }
          return;
        }

        if (In.justPressed('up')) {
          state.cursor = (state.cursor + ITEMS.length - 1) % ITEMS.length;
          DS.Audio.play('menuMove');
        }
        if (In.justPressed('down')) {
          state.cursor = (state.cursor + 1) % ITEMS.length;
          DS.Audio.play('menuMove');
        }

        if (!In.justPressed('confirm')) return;
        In.consume('confirm');
        DS.Audio.play('menuPick');

        if (state.cursor === 0) DS.Scenes.play();
        else if (state.cursor === 1) state.page = 'help';
        else if (state.cursor === 2) { state.stats = DS.Storage.load(); state.page = 'records'; }
        else DS.Audio.toggleMute();
      },

      draw: function () {
        backdrop(state);
        title(state);

        if (state.page === 'help') { drawHelp(); return; }
        if (state.page === 'records') { drawRecords(state.stats); return; }

        for (let i = 0; i < ITEMS.length; i++) {
          const selected = i === state.cursor;
          let label = ITEMS[i];
          if (i === 3) label = DS.Audio.isMuted() ? 'UNMUTE' : 'MUTE';
          DS.R.textCenter((selected ? '> ' : '') + label, C.W / 2, 78 + i * 12,
                          selected ? '#ffffff' : MUTED);
        }

        DS.R.textCenter('ONE LIFE PER RUN', C.W / 2, C.H - 14, '#c0303c');
      }
    };
  }

  function drawHelp() {
    const R = DS.R;
    R.panelS(14, 62, C.W - 28, 100);
    const lines = [
      'A/D MOVE   SPACE JUMP (AGAIN IN AIR)',
      'J ATTACK - HOLD IT TO CHARGE A HEAVY',
      'E SKILL    X ULTIMATE    BOTH COST MANA',
      'SHIFT DASH    RIGHT-CLICK MINI DASH X2',
      'F INTERACT   Q SWAP   TAB BAG   ESC PAUSE',
      '',
      'SKILLS COME FROM THE WEAPON YOU HOLD,',
      'AND HIT HARDER THE RARER IT IS.',
      'A KEYBEARER GUARDS EVERY LOCKED CHEST.',
      'SAFE ROOMS HAVE A MERCHANT AND A TABLE.',
      'CRACKED LEDGES OVER A PIT WILL GIVE WAY.',
      '',
      'DIE AND THE RUN IS OVER. START AGAIN.'
    ];
    for (let i = 0; i < lines.length; i++) {
      R.text(lines[i], 18, 66 + i * 8, i >= 12 ? '#c0303c' : INK);
    }
    R.hintsCenter([['ESC', 'BACK']], C.W / 2, C.H - 14, MUTED, GOLD);
  }

  function drawRecords(stats) {
    const R = DS.R;
    R.panelS(40, 62, C.W - 80, 90);

    const best = stats.bestItemRarity >= 0
      ? stats.bestItemName
      : 'NOTHING YET';
    const color = stats.bestItemRarity >= 0
      ? DS.Weapons.rarityColor(stats.bestItemRarity)
      : MUTED;

    R.text('RUNS', 48, 70, MUTED);
    R.textRight(String(stats.runs), C.W - 48, 70, INK);
    R.text('BEST DEPTH', 48, 82, MUTED);
    R.textRight(String(stats.bestDepth), C.W - 48, 82, INK);
    R.text('TOTAL KILLS', 48, 94, MUTED);
    R.textRight(String(stats.totalKills), C.W - 48, 94, INK);

    R.text('FINEST WEAPON', 48, 110, MUTED);
    R.textCenter(best, C.W / 2, 122, color);

    if (stats.fastestClearFrames) {
      R.textCenter('FASTEST CLEAR ' + formatTime(stats.fastestClearFrames),
                   C.W / 2, 136, GOLD);
    }

    R.hintsCenter([['ESC', 'BACK']], C.W / 2, C.H - 14, MUTED, GOLD);
  }

  function formatTime(frames) {
    const total = Math.floor(frames / 60);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  // --- game over ------------------------------------------------------------

  function createGameOver(g, won) {
    const best = DS.Inv.bestItem(g.inv);

    // Records are written once, on arrival at this screen.
    const stats = DS.Storage.recordRun({
      depth: g.depth,
      kills: g.kills,
      cleared: won,
      frames: g.frames,
      bestItem: best ? { name: best.name, rarity: best.rarity } : null
    });

    const state = { frame: 0, won: won, stats: stats, best: best, g: g };
    DS.Audio.setMusic(won ? 'calm' : null);
    if (!won) DS.Audio.stopMusic();

    return {
      update: function () {
        state.frame++;
        const In = DS.Input;
        if (state.frame < 30) return;
        if (In.justPressed('confirm')) { In.consume('confirm'); DS.Scenes.play(); }
        else if (In.justPressed('back')) { In.consume('back'); DS.Scenes.menu(); }
      },

      draw: function () {
        const R = DS.R;
        backdrop(state);

        R.textCenter(won ? 'THE DUNGEON IS CLEARED' : 'YOUR RUN ENDS HERE',
                     C.W / 2, 18, won ? GOLD : '#c0303c', 2);

        // The record badge sits under the headline instead of colliding with
        // the weapon name at the bottom of the panel.
        if (g.depth >= state.stats.bestDepth && g.depth > 0) {
          const label = 'NEW RECORD';
          const w = R.textWidth(label) + 10;
          const pulse = Math.sin(state.frame * 0.12) > 0;
          R.rectS((C.W - w) / 2, 34, w, 11, 'rgba(242,193,78,0.14)');
          R.frameS((C.W - w) / 2, 34, w, 11, pulse ? GOLD : '#8a7440');
          R.textCenter(label, C.W / 2, 36, GOLD);
        }

        R.panelS(36, 50, C.W - 72, 92);
        R.text('DEPTH REACHED', 44, 58, MUTED);
        R.textRight(String(g.depth), C.W - 44, 58, INK);
        R.text('ENEMIES SLAIN', 44, 70, MUTED);
        R.textRight(String(g.kills), C.W - 44, 70, INK);
        R.text('COINS', 44, 82, MUTED);
        R.textRight(String(g.inv.coins), C.W - 44, 82, GOLD);
        R.text('TIME', 44, 94, MUTED);
        R.textRight(formatTime(g.frames), C.W - 44, 94, INK);

        if (state.best) {
          R.text('BEST WEAPON', 44, 110, MUTED);
          R.textCenter(state.best.name, C.W / 2, 122,
                       DS.Weapons.rarityColor(state.best.rarity));
        }

        if (state.frame > 30) {
          const blink = Math.floor(state.frame / 30) % 2 === 0;
          R.hintsCenter([['ENTER', 'RUN AGAIN'], ['ESC', 'MENU']],
                        C.W / 2, C.H - 16, blink ? INK : MUTED, blink ? GOLD : '#6f6a90');
        }

        R.textCenter('NOTHING CARRIES OVER', C.W / 2, C.H - 26, MUTED);
      }
    };
  }

  DS.Menu = {
    createMenu: createMenu,
    createGameOver: createGameOver,
    formatTime: formatTime
  };
})(window.DS);
