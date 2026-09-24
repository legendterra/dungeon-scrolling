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

  // --- the camp -------------------------------------------------------------

  /* The menu is a place, not a wallpaper: the hero sitting at his fire with the
     forest at his back, and the forest looking back at him.

     Everything here is drawn rather than authored, because a forest is a
     hundred near-identical shapes and painting them by hand would cost a
     hundred lines to say what a sine wave says in one. The only authored art
     is the hero, the logs and the flame - the three things a player actually
     looks at. */

  const GROUND_Y = 142;
  const CANOPY = 46;

  /* Eyes in the treeline. Each pair keeps its own slow cycle, so they open and
     close independently and the wood never blinks in unison - which is the
     difference between "something is out there" and "a string of fairy lights".

     Seeded once at load: the same eyes are in the same places every time the
     menu is shown, which is what makes them feel like residents. */
  const EYES = (function () {
    const rng = DS.makeRng(0xE4E5C0DE);
    const out = [];
    for (let i = 0; i < 30; i++) {
      const x = rng.int(4, C.W - 8);
      const y = rng.int(CANOPY + 4, GROUND_Y - 8);
      // Nothing peers out from behind the hero or through the fire.
      if (x > 186 && x < 286 && y > 86) continue;
      out.push({
        x: x, y: y,
        gap: rng.chance(0.45) ? 4 : 3,
        size: rng.chance(0.25) ? 2 : 1,
        speed: rng.float(0.006, 0.02),
        phase: rng.float(0, Math.PI * 2),
        // How much of the cycle it spends open. Low numbers stare, high ones
        // barely show - the spread is what keeps the treeline restless
        // without ever lighting up all at once.
        open: rng.float(0.12, 0.62)
      });
    }
    return out;
  })();

  // A jagged treeline, sampled from two sines so it never repeats visibly.
  function treeline(y0, amp, color, phase) {
    const R = DS.R;
    for (let x = 0; x < C.W; x++) {
      const h = y0 +
        Math.sin(x * 0.13 + phase) * amp +
        Math.sin(x * 0.041 + phase * 2.3) * (amp * 1.6);
      R.rectS(x, Math.round(h), 1, GROUND_Y - Math.round(h) + 4, color);
    }
  }

  // Trunks, at fixed positions, three shades deep.
  const TRUNKS = (function () {
    const rng = DS.makeRng(0x7EEE5);
    const out = [];
    for (let i = 0; i < 26; i++) {
      out.push({
        x: rng.int(2, C.W - 6),
        w: rng.int(2, 4),
        top: rng.int(CANOPY - 6, CANOPY + 22),
        layer: rng.int(0, 2)
      });
    }
    return out;
  })();

  const TRUNK_COLORS = ['#0a1512', '#0e1c17', '#13251e'];

  function forest(state) {
    const R = DS.R;

    // Night sky, banded rather than gradient-filled so it stays in palette.
    R.rectS(0, 0, C.W, C.H, '#070b0c');
    R.rectS(0, 0, C.W, 26, '#0a1018');
    R.rectS(0, 26, C.W, 14, '#0b1417');

    // A few cold stars over the canopy.
    for (let i = 0; i < 26; i++) {
      const x = (i * 37 + 11) % C.W;
      const y = 3 + ((i * 13) % 22);
      const twinkle = Math.sin(state.frame * 0.03 + i) > 0.3;
      if (!twinkle) continue;
      R.rectS(x, y, 1, 1, i % 4 === 0 ? 'rgba(168,228,255,0.5)' : 'rgba(216,213,232,0.28)');
    }

    treeline(CANOPY + 12, 5, '#0a1512', 0.0);
    treeline(CANOPY + 4, 7, '#0d1b16', 2.1);

    for (let i = 0; i < TRUNKS.length; i++) {
      const t = TRUNKS[i];
      R.rectS(t.x, t.top, t.w, GROUND_Y - t.top, TRUNK_COLORS[t.layer]);
      // A single lit edge on the near trunks, catching the firelight.
      if (t.layer === 2) R.rectS(t.x + t.w - 1, t.top, 1, GROUND_Y - t.top, '#1b3329');
    }

    eyes(state);

    // Ground: leaf litter, then the flat clearing the fire sits in.
    R.rectS(0, GROUND_Y, C.W, C.H - GROUND_Y, '#0d1410');
    R.rectS(0, GROUND_Y, C.W, 2, '#16241c');
    for (let i = 0; i < 40; i++) {
      const x = (i * 29 + 7) % C.W;
      R.rectS(x, GROUND_Y + 4 + ((i * 7) % 24), 2, 1, i % 3 ? '#132018' : '#1b2b20');
    }
  }

  function eyes(state) {
    const R = DS.R;
    for (let i = 0; i < EYES.length; i++) {
      const e = EYES[i];
      const wave = Math.sin(state.frame * e.speed + e.phase);
      if (wave < e.open) continue;

      // Fade in and out at the edges of the open window rather than popping.
      const edge = Math.min(1, (wave - e.open) / 0.12);
      const a = (0.35 + edge * 0.55).toFixed(2);
      const dim = (0.10 + edge * 0.16).toFixed(2);

      R.rectS(e.x, e.y, e.size, e.size, 'rgba(192,48,60,' + a + ')');
      R.rectS(e.x + e.gap, e.y, e.size, e.size, 'rgba(192,48,60,' + a + ')');
      // A breath of red around them, so a pair reads as a face in the dark.
      R.rectS(e.x - 1, e.y - 1, e.gap + e.size + 2, e.size + 2,
              'rgba(110,27,40,' + dim + ')');
    }
  }

  /* Doubled once at load. The camp is the thing the menu is about, and at 1x
     the hero was a thumbnail in the corner of his own poster. */
  const BIG = (function () {
    const S = DS.SPR.camp;
    return {
      hero: DS.Art.scaled(S.hero, 2),
      logs: DS.Art.scaled(S.logs, 2),
      flames: S.flames.map(function (f) { return DS.Art.scaled(f, 2); })
    };
  })();

  const HERO_X = 168, HERO_Y = 94;    // 40x48 once doubled; feet on the ground
  const FIRE_X = 232, FIRE_Y = 100;

  function camp(state) {
    const R = DS.R;
    const flicker = 1 + Math.sin(state.frame * 0.23) * 0.06 +
                    Math.sin(state.frame * 0.09) * 0.05;
    const cx = FIRE_X + 14, cy = FIRE_Y + 26;

    // Firelight on the clearing, under everything it lights.
    glowS(R, cx, cy, 108 * flicker, 'rgba(232,116,59,0.15)');
    glowS(R, cx, cy, 54 * flicker, 'rgba(242,193,78,0.22)');

    // Shadows first: his, thrown away from the fire, and the fire pit's.
    R.rectS(HERO_X - 14, GROUND_Y - 4, 44, 3, 'rgba(0,0,0,0.4)');
    R.rectS(FIRE_X - 2, GROUND_Y - 3, 36, 3, 'rgba(0,0,0,0.35)');

    // The hero, warmed down the fire side.
    R.sprS(BIG.hero, HERO_X, HERO_Y);
    R.sprAlphaS(DS.Art.silhouette(BIG.hero, '#e8743b'), HERO_X, HERO_Y,
                0.10 + (flicker - 1) * 0.6);

    R.sprS(BIG.logs, FIRE_X, GROUND_Y - 14);
    const flame = BIG.flames[Math.floor(state.frame / 6) % BIG.flames.length];
    R.sprS(flame, FIRE_X + 6, GROUND_Y - 34);

    // Embers, rising and dying on their own clocks.
    for (let i = 0; i < 9; i++) {
      const t = (state.frame * 0.6 + i * 27) % 140;
      const life = 1 - t / 140;
      if (life <= 0) continue;
      const ex = cx + Math.sin((t + i * 20) * 0.06) * 9;
      const ey = GROUND_Y - 22 - t * 0.5;
      R.rectS(Math.round(ex), Math.round(ey), 1, 1,
              'rgba(242,193,78,' + (life * 0.75).toFixed(2) + ')');
    }
  }

  function backdrop(state) {
    const R = DS.R;
    R.begin();
    R.uiMode();   // menus are pure screen space; no camera punch here
    forest(state);
    camp(state);
  }

  function glowS(R, x, y, radius, color) {
    R.glow(x, y, radius, color, 1, true);
  }

  /* The title sits over the trees on the left, clear of the fire, with a dark
     wash behind it so gold type never has to fight a lit canopy. */
  function title(state) {
    const R = DS.R;
    const bob = Math.sin(state.frame * 0.04) * 1.5;
    R.rectS(0, 4, C.W, 40, 'rgba(7,11,12,0.55)');
    R.textCenter('DUNGEON', C.W / 2, 8 + bob, GOLD, 3);
    R.textCenter('SCROLLING', C.W / 2, 30 + bob, '#c86ee0', 2);
  }

  // --- main menu ------------------------------------------------------------

  const ITEMS = ['START RUN', 'HOW TO PLAY', 'RECORDS', 'MUTE'];

  // The item column sits to the left of the camp, so neither covers the other.
  const MENU_X = 16, MENU_Y = 74, MENU_W = 130, MENU_H = 16;

  function menuRect(i) {
    return { x: MENU_X, y: MENU_Y + i * MENU_H, w: MENU_W, h: MENU_H - 2 };
  }

  function createMenu(page, skipIntro) {
    const state = {
      frame: 0, cursor: 0, pick: 0,
      /* A run starts with a name. The ladder has no anonymous rows, and the
         name is what follows the hero through the dungeon. Asking here means
         every route into a run -- START RUN, the death screen's RUN AGAIN, a
         direct call to loadout -- lands on the prompt exactly once. */
      page: (page === 'loadout' && !DS.Board.hasName()) ? 'name' : (page || 'menu'),
      skipIntro: !!skipIntro,
      typed: DS.Board.name || '',
      note: '',
      stats: DS.Storage.load()
    };

    return {
      update: function () {
        const In = DS.Input;
        state.frame++;
        DS.Audio.setMusic('calm');

        // Only the name prompt takes typed text; every other page hands the
        // letter keys straight back to the game.
        if (state.page !== 'name') In.setTextSink(null);
        if (state.page === 'name') { updateName(state); return; }

        if (state.page === 'loadout') { updateLoadout(state); return; }

        const Ptr = DS.Ptr;

        if (state.page !== 'menu') {
          if (In.justPressed('back') || In.justPressed('confirm') ||
              (Ptr.justReleased() && !Ptr.drag.moved)) {
            In.consume('back'); In.consume('confirm');
            state.page = 'menu';
            DS.Audio.play('menuMove');
          }
          return;
        }

        // Hovering an entry selects it; clicking it takes it.
        state.hover = -1;
        for (let i = 0; i < ITEMS.length; i++) {
          const r = menuRect(i);
          if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
          state.hover = i;
          if (state.cursor !== i) { state.cursor = i; DS.Audio.play('menuMove'); }
          if (Ptr.clicked(r.x, r.y, r.w, r.h)) { choose(state); return; }
          break;
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
        choose(state);
      },

      draw: function () {
        backdrop(state);
        title(state);

        if (state.page === 'name') { drawName(state); return; }
        if (state.page === 'loadout') { drawLoadout(state); return; }
        if (state.page === 'help') { drawHelp(); return; }
        if (state.page === 'records') { drawRecords(state.stats); return; }

        const R = DS.R;
        for (let i = 0; i < ITEMS.length; i++) {
          const r = menuRect(i);
          const selected = i === state.cursor;
          let label = ITEMS[i];
          if (i === 3) label = DS.Audio.isMuted() ? 'UNMUTE' : 'MUTE';

          R.rectS(r.x, r.y, r.w, r.h,
                  selected ? 'rgba(242,193,78,0.14)' : 'rgba(7,11,12,0.5)');
          R.rectS(r.x, r.y, 2, r.h, selected ? GOLD : '#1b2b20');
          R.text(label, r.x + 10, r.y + 4, selected ? '#ffffff' : MUTED);
          if (selected) {
            // A lit ember on the chosen line, matching the fire it sits beside.
            R.rectS(r.x + r.w - 8, r.y + 6, 2, 2, GOLD);
          }
        }

        R.textSmall('ONE LIFE PER RUN', MENU_X + 2, MENU_Y + ITEMS.length * MENU_H + 6,
                    '#c0303c');
        DS.Ptr.cursor();
      }
    };
  }

  function choose(state) {
    DS.Audio.play('menuPick');
    if (state.cursor === 0) state.page = DS.Board.hasName() ? 'loadout' : 'name';
    else if (state.cursor === 1) state.page = 'help';
    else if (state.cursor === 2) { state.stats = DS.Storage.load(); state.page = 'records'; }
    else DS.Audio.toggleMute();
  }

  // --- name prompt ----------------------------------------------------------

  /* Asked once, before the first weapon choice, and then never again: the name
     is written down the moment it is accepted, so RUN AGAIN reuses it and only
     a fresh browser is ever asked. The same string is what the ladder shows and
     what floats over the hero's head. */
  function updateName(state) {
    const In = DS.Input;

    In.setTextSink(function (ch) {
      if (ch === '') state.typed = state.typed.slice(0, -1);
      else if (state.typed.length < DS.Board.MAX_NAME) state.typed += ch;
      state.note = '';
    });

    if (In.justPressed('back')) {
      In.consume('back');
      In.setTextSink(null);
      state.page = 'menu';
      DS.Audio.play('menuMove');
      return;
    }

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');

    if (!DS.Board.setName(state.typed)) {
      state.note = 'TWO TO TWELVE CHARACTERS';
      DS.Audio.play('menuMove');
      return;
    }

    In.setTextSink(null);
    DS.Audio.play('menuPick');
    state.page = 'loadout';
  }

  function drawName(state) {
    const R = DS.R;
    const w = 180, x = (C.W - w) / 2;

    R.panelS(x, 62, w, 50);
    R.textCenter('WHO ARE YOU?', C.W / 2, 70, GOLD);
    R.textSmallCenter('THIS NAME RIDES WITH YOU INTO THE DUNGEON', C.W / 2, 82, MUTED);

    R.rectS(x + 20, 92, w - 40, 14, 'rgba(7,11,12,0.85)');
    R.frameS(x + 20, 92, w - 40, 14, state.note ? '#c0303c' : '#3a3654');
    // A blinking caret, so the field reads as something waiting to be typed
    // into rather than as another label.
    const caret = (state.frame % 40 < 24) ? '_' : '';
    R.textCenter(state.typed.toUpperCase() + caret, C.W / 2, 96, '#ffffff');

    if (state.note) R.textSmallCenter(state.note, C.W / 2, 108, '#c0303c');

    R.hintsCenter([['ENTER', 'THAT IS ME'], ['ESC/P', 'BACK']],
                  C.W / 2, C.H - 14, MUTED, GOLD);
    DS.Ptr.cursor();
  }

  // --- loadout --------------------------------------------------------------

  /* Every run opens on a weapon choice. The offer is deliberately the plainest
     version of each archetype — common rarity, no affixes, no element — so the
     pick decides how the run *plays*, never how strong it starts. Power is
     still something the dungeon has to hand you. */
  const LOADOUT = ['sword', 'dagger', 'spear', 'greataxe', 'bow', 'staff'];
  const COLS = 3;

  function loadoutRect(i) {
    const cw = 92, ch = 26, gapX = 4, gapY = 4;
    const originX = (C.W - (COLS * cw + (COLS - 1) * gapX)) / 2;
    return {
      x: originX + (i % COLS) * (cw + gapX),
      y: 74 + Math.floor(i / COLS) * (ch + gapY),
      w: cw, h: ch
    };
  }

  function updateLoadout(state) {
    const In = DS.Input;
    const Ptr = DS.Ptr;

    for (let i = 0; i < LOADOUT.length; i++) {
      const r = loadoutRect(i);
      if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
      if (state.pick !== i) { state.pick = i; DS.Audio.play('menuMove'); }
      if (Ptr.clicked(r.x, r.y, r.w, r.h)) { startRun(state); return; }
      break;
    }

    if (In.justPressed('back')) {
      In.consume('back');
      state.page = 'menu';
      DS.Audio.play('menuMove');
      return;
    }

    const before = state.pick;
    if (In.justPressed('left')) state.pick--;
    if (In.justPressed('right')) state.pick++;
    if (In.justPressed('up')) state.pick -= COLS;
    if (In.justPressed('down')) state.pick += COLS;
    state.pick = (state.pick + LOADOUT.length) % LOADOUT.length;
    if (state.pick !== before) DS.Audio.play('menuMove');

    if (!In.justPressed('confirm')) return;
    In.consume('confirm');
    startRun(state);
  }

  function startRun(state) {
    DS.Audio.play('menuPick');
    const opts = { weapon: LOADOUT[state.pick] };
    if (state.skipIntro) DS.Scenes.play(null, opts);
    else DS.Scenes.intro(opts);
  }

  function drawLoadout(state) {
    const R = DS.R;
    const W = DS.Weapons;

    // A scrim, so six cards of small type are not read against a lit campfire.
    R.rectS(0, 56, C.W, 104, 'rgba(7,11,12,0.62)');
    R.textCenter('CHOOSE YOUR STEEL', C.W / 2, 62, GOLD);

    const cw = 92, ch = 26, gapX = 4, gapY = 4;
    const originX = (C.W - (COLS * cw + (COLS - 1) * gapX)) / 2;

    for (let i = 0; i < LOADOUT.length; i++) {
      const base = W.WEAPONS[LOADOUT[i]];
      const selected = i === state.pick;
      const rect = loadoutRect(i);
      const x = rect.x, y = rect.y;

      R.panelS(x, y, cw, ch, selected ? 'rgba(28,26,43,0.96)' : 'rgba(13,11,18,0.9)',
               selected ? GOLD : '#2a2740');
      R.sprS(DS.SPR.icon[base.icon], x + 3, y + 5);
      R.text(base.label.toUpperCase(), x + 21, y + 5, selected ? '#ffffff' : INK);
      R.textSmall('DMG ' + base.damage + '  CD ' + base.cooldown, x + 21, y + 15, MUTED);
      // The ranged tag is right-aligned instead of appended: the longest stat
      // line plus the word together overrun the card.
      if (base.ranged) R.textSmall('RNG', x + cw - 15, y + 15, '#a8e4ff');
    }

    const chosen = W.WEAPONS[LOADOUT[state.pick]];
    R.textCenter(chosen.blurb.toUpperCase(), C.W / 2, C.H - 26, '#a8e4ff');
    R.hintsCenter([['ENTER', 'DESCEND'], ['ESC/P', 'BACK'], ['F2', 'FULLSCREEN']],
                  C.W / 2, C.H - 14, MUTED, GOLD);
    DS.Ptr.cursor();
  }

  function drawHelp() {
    const R = DS.R;
    R.panelS(14, 56, C.W - 28, 104);
    const lines = [
      'A/D MOVE   SPACE JUMP (AGAIN IN AIR)',
      'J ATTACK - HOLD IT TO CHARGE A HEAVY',
      'E SKILL    X ULTIMATE    BOTH COST MANA',
      'SHIFT DASH    RIGHT-CLICK MINI DASH X2',
      'F INTERACT   Q SWAP   TAB BAG   ESC PAUSE',
      'AIM WITH THE MOUSE - ARROWS FLY AT IT.',
      '',
      'SKILLS COME FROM THE WEAPON YOU HOLD,',
      'AND HIT HARDER THE RARER IT IS.',
      'A KEYBEARER GUARDS EVERY LOCKED CHEST.',
      'SHRINES GIVE BOONS - R REROLLS FOR GOLD.',
      'CRACKED LEDGES OVER A PIT WILL GIVE WAY.',
      '',
      'DIE AND THE RUN IS OVER. START AGAIN.'
    ];
    for (let i = 0; i < lines.length; i++) {
      R.text(lines[i], 18, 60 + i * 8, i >= lines.length - 1 ? '#c0303c' : INK);
    }
    R.hintsCenter([['ESC/P', 'BACK'], ['CLICK', 'ANYWHERE']], C.W / 2, C.H - 14, MUTED, GOLD);
    DS.Ptr.cursor();
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

    R.hintsCenter([['ESC/P', 'BACK'], ['CLICK', 'ANYWHERE']], C.W / 2, C.H - 14, MUTED, GOLD);
    DS.Ptr.cursor();
  }

  function formatTime(frames) {
    const total = Math.floor(frames / 60);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  // --- game over ------------------------------------------------------------

  function createGameOver(g, won) {
    const best = DS.Inv.bestWeapon(g.inv);

    // Records are written once, on arrival at this screen.
    const stats = DS.Storage.recordRun({
      depth: g.depth,
      kills: g.kills,
      cleared: won,
      frames: g.frames,
      bestItem: best ? { name: best.name, rarity: best.rarity } : null
    });

    const state = {
      frame: 0, won: won, stats: stats, best: best, g: g,
      rows: DS.Board.rows(), rank: 0
    };

    /* The run goes up on the ladder the moment this screen opens, and the
       ladder itself is refreshed lazily behind it. Neither is ever awaited:
       opening the death screen must not depend on the network, and the list
       simply starts as whatever was last known. */
    DS.Board.submit({
      depth: g.depth,
      kills: g.kills,
      coins: g.inv.coins,
      frames: g.frames,
      cleared: won
    }).then(function (res) {
      if (res && res.rows) { state.rows = res.rows; state.rank = res.rank || 0; }
    });
    DS.Board.refresh().then(function (res) {
      if (res && res.rows) state.rows = res.rows;
    });

    DS.Audio.setMusic(won ? 'calm' : null);
    if (!won) DS.Audio.stopMusic();

    return {
      update: function () {
        state.frame++;
        const In = DS.Input;
        // The answer to submit() may have landed since the last frame.
        if (state.frame % 30 === 0) state.rows = DS.Board.rows();
        if (state.frame < 30) return;
        // Running again re-opens the weapon choice: the loadout is the first
        // decision of a run, and skipping it would silently hand back a sword.
        const Ptr = DS.Ptr;
        state.hover = -1;
        for (let i = 0; i < 2; i++) {
          const r = overRect(i);
          if (!Ptr.inRect(r.x, r.y, r.w, r.h)) continue;
          state.hover = i;
          if (Ptr.clicked(r.x, r.y, r.w, r.h)) {
            DS.Audio.play('menuPick');
            if (i === 0) DS.Scenes.loadout(); else DS.Scenes.menu();
            return;
          }
          break;
        }

        if (In.justPressed('confirm')) { In.consume('confirm'); DS.Scenes.loadout(); }
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

        /* Two columns: the run on the left, the ladder on the right. They used
           to be one column with the numbers right-aligned against the panel
           edge, which left nowhere for a ladder to go; splitting the panel is
           what makes the ranking part of the screen instead of a second
           screen nobody opens. */
        R.panelS(20, 46, C.W - 40, 96);
        R.text('DEPTH REACHED', 26, 54, MUTED);
        R.textRight(String(g.depth), 150, 54, INK);
        R.text('ENEMIES SLAIN', 26, 66, MUTED);
        R.textRight(String(g.kills), 150, 66, INK);
        R.text('COINS', 26, 78, MUTED);
        R.textRight(String(g.inv.coins), 150, 78, GOLD);
        R.text('TIME', 26, 90, MUTED);
        R.textRight(formatTime(g.frames), 150, 90, INK);

        if (state.best) {
          R.text('BEST WEAPON', 26, 102, MUTED);
          R.text(state.best.name, 26, 112,
                 DS.Weapons.rarityColor(state.best.rarity));
        }

        R.rectS(160, 52, 1, 82, '#2a2740');
        R.text('LADDER', 168, 54, GOLD);
        R.textSmallRight(DS.Board.online ? 'ONLINE' : 'THIS DEVICE', C.W - 26, 55, MUTED);

        const ladder = state.rows || [];
        for (let i = 0; i < ladder.length && i < 8; i++) {
          const row = ladder[i];
          const y = 66 + i * 9;
          const mine = DS.Board.name && row.name === DS.Board.name;
          R.textRight(String(row.rank), 182, y, mine ? '#ffffff' : MUTED);
          R.text(row.name, 186, y, mine ? GOLD : INK);
          R.textRight(String(row.depth), C.W - 26, y, row.cleared ? GOLD : MUTED);
        }
        if (!ladder.length) {
          R.textSmall('NO RUNS RECORDED YET', 186, 66, MUTED);
        }

        if (state.frame > 30) {
          const labels = ['RUN AGAIN', 'MAIN MENU'];
          for (let i = 0; i < labels.length; i++) {
            const r = overRect(i);
            const on = state.hover === i;
            R.rectS(r.x, r.y, r.w, r.h, on ? 'rgba(242,193,78,0.16)' : 'rgba(13,11,18,0.85)');
            R.frameS(r.x, r.y, r.w, r.h, on ? GOLD : '#3a3654');
            R.textSmall(labels[i], r.x + r.w / 2 - R.textSmallWidth(labels[i]) / 2,
                        r.y + 4, on ? '#ffffff' : MUTED);
          }
          R.hintsCenter([['ENTER', 'RUN AGAIN'], ['ESC/P', 'MENU']],
                        C.W / 2, C.H - 10, MUTED, GOLD);
        }

        // Who this run belonged to, and where it landed.
        const who = (DS.Board.name || 'PLAYER') +
                    (state.rank ? '   RANK #' + state.rank : '');
        R.textSmallCenter(who, C.W / 2, C.H - 32, GOLD);
        DS.Ptr.cursor();
      }
    };
  }

  // The two buttons on the death screen.
  function overRect(i) {
    return { x: C.W / 2 - 84 + i * 88, w: 80, y: C.H - 24, h: 11 };
  }

  DS.Menu = {
    createMenu: createMenu,
    createGameOver: createGameOver,
    formatTime: formatTime
  };
})(window.DS);
