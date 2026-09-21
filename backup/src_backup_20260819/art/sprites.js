/* Every pixel in the game, authored as character rows and baked once at load.
   Palette keys are defined in art/base.js; '.' is transparent.
   Variants that differ only in colour (chest tiers, elemental projectiles,
   the boss) reuse a shape with a palette override instead of new art. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const A = DS.Art;

  // ---- player (10 x 14) ----------------------------------------------------

  const HERO_IDLE_0 = [
    '...kkkk...',
    '..kNNNNk..',
    '.kNNNNNNk.',
    '.kuUUUUuk.',
    '.kukUUkuk.',
    '..kuUUuk..',
    '...kuuk...',
    '..kCCCCk..',
    '.kCCCCCCk.',
    '.kCbbbbCk.',
    '..kcccck..',
    '..kcc.cck.',
    '..knn.nnk.',
    '..kkk.kkk.'
  ];

  // Same pose one pixel lower — a simple breathing bob.
  const HERO_IDLE_1 = [
    '..........',
    '...kkkk...',
    '..kNNNNk..',
    '.kNNNNNNk.',
    '.kuUUUUuk.',
    '.kukUUkuk.',
    '..kuUUuk..',
    '..kCCCCk..',
    '.kCCCCCCk.',
    '.kCbbbbCk.',
    '..kcccck..',
    '..kcc.cck.',
    '..knn.nnk.',
    '..kkk.kkk.'
  ];

  const HERO_TORSO = HERO_IDLE_0.slice(0, 11);

  function heroWith(legs) { return HERO_TORSO.concat(legs); }

  const HERO_RUN_0 = heroWith(['.kcc..cck.', '.knn...nk.', '.kk.....k.']);
  const HERO_RUN_1 = heroWith(['..kcccck..', '..knnnnk..', '..kk..kk..']);
  const HERO_RUN_2 = heroWith(['.kcc..cck.', '.kn...nnk.', '.k.....kk.']);
  const HERO_JUMP  = heroWith(['.kcc..cck.', '.kn....nk.', '.kk....kk.']);
  const HERO_FALL  = heroWith(['..kcccck..', '.knn..nnk.', '.kk....kk.']);

  // ---- enemies -------------------------------------------------------------

  const SLIME_0 = [
    '....kkkk....',
    '..kkLLLLkk..',
    '.klLLLLLLlk.',
    'klLLkLLkLLlk',
    'klLLLLLLLLlk',
    'kllllllllllk',
    'kleeeeeeeelk',
    '.keeeeeeeek.',
    '..kkkkkkkk..'
  ];

  // Squashed landing frame.
  const SLIME_1 = [
    '............',
    '............',
    '..kkkkkkkk..',
    'kkLLkLLkLLkk',
    'klLLLLLLLLlk',
    'kllllllllllk',
    'kleeeeeeeelk',
    'keeeeeeeeeek',
    'kkkkkkkkkkkk'
  ];

  const ZOMBIE_0 = [
    '...kkkk...',
    '..knnnnk..',
    '.kllllllk.',
    '.klkllklk.',
    '..kllllk..',
    '...kllk...',
    '..keeeek..',
    '.keeeeeek.',
    'keeeeeeeek',
    '.keeeeeek.',
    '..kddddk..',
    '..kdd.ddk.',
    '..knn.nnk.',
    '..kkk.kkk.'
  ];

  const ZOMBIE_1 = ZOMBIE_0.slice(0, 11).concat([
    '.kdd..ddk.', '.knn...nk.', '.kk.....k.'
  ]);

  const BAT_0 = [
    'k........k',
    'kk......kk',
    'kdk....kdk',
    'kddkkkkddk',
    '.kdKKKKdk.',
    '..kKWWKk..',
    '...kKKk...',
    '....kk....'
  ];

  const BAT_1 = [
    '..........',
    '..........',
    'kk......kk',
    'kdkkkkkkdk',
    '.kdKKKKdk.',
    '..kKWWKk..',
    '..kdKKdk..',
    '...kkkk...'
  ];

  const SKELETON_0 = [
    '...kkkk...',
    '..kwWWwk..',
    '.kwWWWWwk.',
    '.kwkWWkwk.',
    '..kwWWwk..',
    '...kkkk...',
    '..kwwwwk..',
    '.kwkwwkwk.',
    '.kwwwwwwk.',
    '..kwwwwk..',
    '..kwwwwk..',
    '..kww.wwk.',
    '..kww.wwk.',
    '..kkk.kkk.'
  ];

  // Drawing the bow: arms forward, stance widened.
  const SKELETON_1 = SKELETON_0.slice(0, 11).concat([
    '.kww...wwk', '.kww...wwk', '.kk.....kk'
  ]);

  const CROWN = [
    'y...y...y.',
    'yy.yyy.yy.',
    'yyyyyyyyy.',
    'kyyYYYyyk.',
    'kyyyyyyyk.',
    '.kkkkkkk..'
  ];

  // ---- world tiles (16 x 16) -----------------------------------------------

  const SOLID = 'kkkkkkkkkkkkkkkk';

  const WALL = [
    SOLID,
    'kDDDDDDkDDDDDDDk',
    'kDDDDDDkDDDDDDDk',
    'kdddddDkddddddDk',
    SOLID,
    'DDDkDDDDDDDkDDDD',
    'DDDkDDDDDDDkDDDD',
    'dddkDdddddDkdddd',
    SOLID,
    'kDDDDDDkDDDDDDDk',
    'kDDDDDDkDDDDDDDk',
    'kdddddDkddddddDk',
    SOLID,
    'DDDkDDDDDDDkDDDD',
    'DDDkDDDDDDDkDDDD',
    'dddkDdddddDkdddd'
  ];

  // Wall with a lit top edge — used for the surface of any floor.
  const FLOOR = [
    'gggggggggggggggg',
    'GgGgGgGgGgGgGgGg',
    SOLID,
    'kDDDDDDkDDDDDDDk',
    'kdddddDkddddddDk',
    SOLID,
    'DDDkDDDDDDDkDDDD',
    'dddkDdddddDkdddd',
    SOLID,
    'kDDDDDDkDDDDDDDk',
    'kdddddDkddddddDk',
    SOLID,
    'DDDkDDDDDDDkDDDD',
    'dddkDdddddDkdddd',
    SOLID,
    'kDDDDDDkDDDDDDDk'
  ];

  const PLATFORM = [
    'bbbbbbbbbbbbbbbb',
    'BbBbBbBbBbBbBbBb',
    'nnnnnnnnnnnnnnnn',
    'knknknknknknknkn',
    '................'
  ];

  const SPIKE = [
    '..w....w....w...',
    '..w....w....w...',
    '.GwG..GwG..GwG..',
    '.GwG..GwG..GwG..',
    '.GwG..GwG..GwG..',
    'GGwGGGGGwGGGGGwG',
    'GGGGGGGGGGGGGGGG',
    SOLID
  ];

  /* Exits are two tiles tall and stand on the floor, so they read as doorways
     rather than as a picture hung in mid-air. Three silhouettes are generated
     rather than hand-drawn, because the only thing that differs between them is
     the shape of the opening. */
  const DOOR_W = 16, DOOR_H = 32;

  function doorOpening(style, x, y) {
    const dx = Math.abs(x - 7.5);
    if (y < 2 || y > DOOR_H - 2) return false;

    if (style === 'cave') {
      // Organic, uneven mouth that bulges as it goes down.
      const rise = Math.max(0, 7 - y);
      const w = 6.0 - rise * rise * 0.11 + Math.sin(y * 1.9) * 0.8;
      return y >= 3 && dx < w;
    }
    if (style === 'gate') {
      return y >= 4 && dx < 6;
    }
    // arch: a clean semicircular head over straight jambs
    const rise = Math.max(0, 9 - y);
    const w = 5.6 - rise * rise * 0.075;
    return y >= 2 && dx < w;
  }

  function nearOpening(style, x, y) {
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        if (doorOpening(style, x + ox, y + oy)) return true;
      }
    }
    return false;
  }

  function buildDoor(style) {
    const rows = [];
    for (let y = 0; y < DOOR_H; y++) {
      let row = '';
      for (let x = 0; x < DOOR_W; x++) {
        if (doorOpening(style, x, y)) {
          if (style === 'gate' && (x - 2) % 4 === 0) row += 'g';       // bars
          else if (style === 'gate' && y % 9 === 0) row += 'g';        // bands
          else if ((x * 7 + y * 13) % 37 === 0) row += 's';            // glint
          else row += 'K';
        } else if (nearOpening(style, x, y)) {
          row += (x + y) % 5 === 0 ? 'G' : (style === 'cave' ? 'd' : 'g');
        } else if (y >= DOOR_H - 2 && nearOpening(style, x, y - 2)) {
          row += 'k';
        } else {
          row += '.';
        }
      }
      rows.push(row);
    }
    return rows;
  }

  const DOOR_STYLES = ['arch', 'cave', 'gate'];

  /* Wall torch: an iron pole on a bracket with a fire bowl. The body is dead
     still — only the flame animates, across three frames. The old version
     nudged the whole sprite by a pixel every few frames, which read as the
     torch itself shaking. */
  const TORCH_BODY = [
    '..ooo...',
    '..kkk...',
    '.kGGGk..',
    '.kGGGk..',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '..kGk...',
    '.kGGGk..',
    'kGGGGGk.',
    'kkGGGkk.',
    'kk...kk.',
    '........'
  ];

  const TORCH_FLAMES = [
    ['..YY....', '.YWWY...', '.yYWYy..', '.yYYYy..', '..yyy...'],
    ['.YY.....', '.YWY....', 'yYWYy...', '.yYYYy..', '..yyy...'],
    ['...YY...', '..YWWY..', '..yYWYy.', '.yYYYy..', '..yyy...']
  ];

  // The killing floor at the bottom of a pit.
  const DEATH_SPIKE = [
    '..R....R....R...',
    '..R....R....R...',
    '.RRR..RRR..RRR..',
    '.RRR..RRR..RRR..',
    '.RrR..RrR..RrR..',
    'RRrRRRRrRRRRrRR.',
    'RrrrRRrrrRRrrrR.',
    'rrrrrrrrrrrrrrr.',
    'rrrrrrrrrrrrrrrr',
    'krrrrrrrrrrrrrrk',
    'kkrrrrrrrrrrrrkk',
    'kkkkkkkkkkkkkkkk',
    'kkkkkkkkkkkkkkkk',
    'kkkkkkkkkkkkkkkk'
  ];

  const ENCHANT_TABLE = [
    '................',
    '..PPPPPPPPPPPP..',
    '.PmSSSSSSSSSSmP.',
    '.PmSWWSSSSWWSmP.',
    '.PmSSSSSSSSSSmP.',
    '..PPPPPPPPPPPP..',
    '...pp......pp...',
    '...pp......pp...',
    '...pp......pp...',
    '...pp......pp...',
    '..pppp....pppp..',
    '..kkkk....kkkk..'
  ];

  // ---- chests (14 x 11) ----------------------------------------------------

  const CHEST_CLOSED = [
    '..kkkkkkkkkk..',
    '.kbBBBBBBBBbk.',
    'kbBBBBBBBBBBbk',
    'kbBBBBBBBBBBbk',
    'kkkkkkkkkkkkkk',
    'kbBBBByyBBBBbk',
    'kbBBBByYyBBBbk',
    'kbBBBByyBBBBbk',
    'kbBBBBBBBBBBbk',
    'kbbbbbbbbbbbbk',
    'kkkkkkkkkkkkkk'
  ];

  const CHEST_OPEN = [
    'kbBBBBBBBBbk..',
    '.kbbbbbbbbk...',
    '..............',
    'kkkkkkkkkkkkkk',
    'kbYYYYYYYYYYbk',
    'kbyYYYYYYYYybk',
    'kbyyYYYYYYyybk',
    'kbBBBBBBBBBBbk',
    'kbBBBBBBBBBBbk',
    'kbbbbbbbbbbbbk',
    'kkkkkkkkkkkkkk'
  ];

  const CHEST_TIERS = {
    wood:   null,                                   // palette as authored
    iron:   { b: '#6f6a90', B: '#9b96b8', y: '#4fb3e0', Y: '#a8e4ff' },
    cursed: { b: '#3c2154', B: '#7f45b8', y: '#c86ee0', Y: '#a8e4ff' }
  };

  // ---- weapon icons (12 x 12) ----------------------------------------------

  /* Weapon models. Every archetype is now a distinct silhouette rather than a
     recoloured stick: a fullered blade, a crossguarded dagger, a bearded axe, a
     leaf-bladed spear, a recurve bow, and a gem-headed stave.

     Palette keys that the rarity re-tint replaces:
       W  blade highlight   w  blade body    G  metal fittings
       y  guard / pommel    b  grip wrap     n  grip shadow            */
  const ICON_SWORD = [
    '..........Ww',
    '.........WWw',
    '........WwWw',
    '.......WwWw.',
    '......WwWw..',
    '.....WwWw...',
    '....WwWw....',
    '...WwWw.....',
    '..GyyyG.....',
    '...bnb......',
    '...bnb......',
    '...GyG......'
  ];

  const ICON_DAGGER = [
    '............',
    '.........Ww.',
    '........WWw.',
    '........WwW.',
    '.......WwW..',
    '......WwW...',
    '.....GyyyG..',
    '......bnb...',
    '......bnb...',
    '......GyG...',
    '............',
    '............'
  ];

  const ICON_AXE = [
    '..WWww......',
    '.WWWWWw.....',
    'WWWWWWWw....',
    'WWWWWWWG....',
    'WWWWWWbG....',
    '.WWWWwbb....',
    '..wwwwbb....',
    '......bn....',
    '......bn....',
    '......bn....',
    '......bn....',
    '......GG....'
  ];

  const ICON_BOW = [
    '...GWG......',
    '..Gb..b.....',
    '.Gb....b....',
    '.b......b...',
    '.b......ww..',
    '.b.wwwwwWWWW',
    '.b......ww..',
    '.b......b...',
    '.Gb....b....',
    '..Gb..b.....',
    '...GWG......',
    '............'
  ];

  const ICON_STAFF = [
    '....mm......',
    '...mSSm.....',
    '..mSWWSm....',
    '..mSWWSm....',
    '...mSSm.....',
    '....GG......',
    '....bn......',
    '....bn......',
    '....bn......',
    '....bn......',
    '....bn......',
    '....GG......'
  ];

  const ICON_SPEAR = [
    '......W.....',
    '.....WWw....',
    '....WWWWw...',
    '....wWWWw...',
    '.....wWw....',
    '.....GGG....',
    '.....bn.....',
    '.....bn.....',
    '.....bn.....',
    '.....bn.....',
    '.....bn.....',
    '.....GG.....'
  ];

  /* Rarity is visible on the weapon itself, not only on the frame around it:
     the metal changes, and legendaries get a hot core. */
  const RARITY_SKINS = [
    { W: '#e8e6f0', w: '#9b96b8', G: '#6f6a90', y: '#9b96b8', b: '#5c3f2a', n: '#2e2018' },
    { W: '#d8ffd0', w: '#5cbf62', G: '#2f7d4f', y: '#a3e86b', b: '#5c3f2a', n: '#2e2018' },
    { W: '#a8e4ff', w: '#4fb3e0', G: '#2f6fa8', y: '#a8e4ff', b: '#16324f', n: '#0d1e2e' },
    { W: '#f0d0ff', w: '#c86ee0', G: '#7f45b8', y: '#c86ee0', b: '#3c2154', n: '#1e0f2a' },
    { W: '#fff0a8', w: '#f2c14e', G: '#e8743b', y: '#fff0a8', b: '#6e1b28', n: '#2e0a10' }
  ];

  // ---- pickups & projectiles ----------------------------------------------

  const COIN = [
    '.yyyy.',
    'yYYYYy',
    'yYyyYy',
    'yYyyYy',
    'yYYYYy',
    '.yyyy.'
  ];

  const HEART = [
    '.RR.RR..',
    'RRRRRRR.',
    'RRRRRRR.',
    '.RRRRR..',
    '..RRR...',
    '...R....',
    '........'
  ];

  const SHARD = [
    '...S...',
    '..SSS..',
    '.SsSsS.',
    'SsSSSsS',
    '.SsSsS.',
    '..SsS..',
    '...S...',
    '.......'
  ];

  const KEY = [
    '.yyy....',
    'y...y...',
    'y...y...',
    '.yyy....',
    '..y.....',
    '..yyy...',
    '..y.....',
    '..yy....'
  ];

  const ARROW = [
    '......w..',
    'nnnnnnnWw',
    '......w..'
  ];

  const ORB = [
    '..yyy...',
    '.yYYYy..',
    'oyYWYyo.',
    'oyYYYyo.',
    '.oyyyo..',
    '..ooo...',
    '........',
    '........'
  ];

  const ORB_TINTS = {
    fire:      null,
    ice:       { o: '#2f6fa8', y: '#4fb3e0', Y: '#a8e4ff', W: '#ffffff' },
    lightning: { o: '#7f45b8', y: '#f2c14e', Y: '#fff0a8', W: '#ffffff' },
    poison:    { o: '#1b4436', y: '#2f7d4f', Y: '#a3e86b', W: '#d8ffd0' },
    water:     { o: '#16324f', y: '#2f6fa8', Y: '#4fb3e0', W: '#a8e4ff' },
    earth:     { o: '#2e2018', y: '#5c3f2a', Y: '#b98d5c', W: '#f0d0aa' },
    leaf:      { o: '#1b4436', y: '#5cbf62', Y: '#a3e86b', W: '#f0ffd0' },
    dark:      { o: '#3c2154', y: '#7f45b8', Y: '#c86ee0', W: '#f0c79c' }
  };

  const SLASH = [
    '.......w....',
    '......ww....',
    '.....www....',
    '.....wWw....',
    '....wWWw....',
    '....wWW.....',
    '....wWW.....',
    '....wWW.....',
    '....wWW.....',
    '....wWWw....',
    '.....wWw....',
    '.....www....',
    '......ww....',
    '.......w....',
    '............',
    '............'
  ];

  // ---- bake ----------------------------------------------------------------

  const S = {};

  S.hero = {
    idle: [A.makeSprite(HERO_IDLE_0), A.makeSprite(HERO_IDLE_1)],
    run:  [A.makeSprite(HERO_RUN_0), A.makeSprite(HERO_RUN_1),
           A.makeSprite(HERO_RUN_2), A.makeSprite(HERO_RUN_1)],
    jump: A.makeSprite(HERO_JUMP),
    fall: A.makeSprite(HERO_FALL)
  };

  // The shopkeeper is the hero silhouette in robed colours.
  const MERCHANT_PAL = { C: '#7f45b8', c: '#3c2154', N: '#f2c14e', b: '#c86ee0' };
  S.merchant = [
    A.makeSprite(HERO_IDLE_0, MERCHANT_PAL),
    A.makeSprite(HERO_IDLE_1, MERCHANT_PAL)
  ];

  S.slime    = [A.makeSprite(SLIME_0), A.makeSprite(SLIME_1)];
  S.zombie   = [A.makeSprite(ZOMBIE_0), A.makeSprite(ZOMBIE_1)];
  S.bat      = [A.makeSprite(BAT_0), A.makeSprite(BAT_1)];
  S.skeleton = [A.makeSprite(SKELETON_0), A.makeSprite(SKELETON_1)];

  // Elites are the same body tinted hot orange.
  const ELITE_PAL = { l: '#e8743b', L: '#f2c14e', e: '#8a3b2a', d: '#8a3b2a' };
  S.elite = {
    slime:    [A.makeSprite(SLIME_0, ELITE_PAL), A.makeSprite(SLIME_1, ELITE_PAL)],
    zombie:   [A.makeSprite(ZOMBIE_0, ELITE_PAL), A.makeSprite(ZOMBIE_1, ELITE_PAL)],
    bat:      [A.makeSprite(BAT_0, ELITE_PAL), A.makeSprite(BAT_1, ELITE_PAL)],
    skeleton: [A.makeSprite(SKELETON_0, ELITE_PAL), A.makeSprite(SKELETON_1, ELITE_PAL)]
  };

  /* Key-carrying mini-bosses are double-size versions of an ordinary enemy in
     a bloodier palette, so they read as "same creature, much worse" at a
     glance without needing their own art. */
  const MINI_PAL = {
    l: '#c0303c', L: '#e8743b', e: '#6e1b28', d: '#6e1b28',
    w: '#e8743b', W: '#fff0a8', K: '#6e1b28', C: '#c0303c', c: '#6e1b28'
  };
  S.mini = {
    slime:    [A.scaled(A.makeSprite(SLIME_0, MINI_PAL), 2), A.scaled(A.makeSprite(SLIME_1, MINI_PAL), 2)],
    zombie:   [A.scaled(A.makeSprite(ZOMBIE_0, MINI_PAL), 2), A.scaled(A.makeSprite(ZOMBIE_1, MINI_PAL), 2)],
    bat:      [A.scaled(A.makeSprite(BAT_0, MINI_PAL), 2), A.scaled(A.makeSprite(BAT_1, MINI_PAL), 2)],
    skeleton: [A.scaled(A.makeSprite(SKELETON_0, MINI_PAL), 2), A.scaled(A.makeSprite(SKELETON_1, MINI_PAL), 2)]
  };

  /* The Slime King is literally a king-sized slime: the same shape scaled 2x
     in royal purple, with a crown drawn on top by the boss renderer. */
  const KING_PAL = { l: '#7f45b8', L: '#c86ee0', e: '#3c2154' };
  S.boss = [
    A.scaled(A.makeSprite(SLIME_0, KING_PAL), 2),
    A.scaled(A.makeSprite(SLIME_1, KING_PAL), 2)
  ];
  S.crown = A.makeSprite(CROWN);

  S.tile = {
    wall: A.makeSprite(WALL),
    floor: A.makeSprite(FLOOR),
    platform: A.makeSprite(PLATFORM),
    spike: A.makeSprite(SPIKE),
    door: A.makeSprite(buildDoor('arch')),
    doorStyles: DOOR_STYLES.reduce(function (out, style) {
      out[style] = A.makeSprite(buildDoor(style));
      return out;
    }, {}),
    torch: A.makeSprite(TORCH_FLAMES[0].concat(TORCH_BODY)),
    torchFrames: TORCH_FLAMES.map(function (flame) {
      return A.makeSprite(flame.concat(TORCH_BODY));
    }),
    deathspike: A.makeSprite(DEATH_SPIKE),
    table: A.makeSprite(ENCHANT_TABLE)
  };

  S.chest = {};
  for (const tier in CHEST_TIERS) {
    if (!Object.prototype.hasOwnProperty.call(CHEST_TIERS, tier)) continue;
    S.chest[tier] = {
      closed: A.makeSprite(CHEST_CLOSED, CHEST_TIERS[tier]),
      open: A.makeSprite(CHEST_OPEN, CHEST_TIERS[tier])
    };
  }

  const ICON_ROWS = {
    sword: ICON_SWORD, dagger: ICON_DAGGER, greataxe: ICON_AXE,
    bow: ICON_BOW, staff: ICON_STAFF, spear: ICON_SPEAR
  };

  // Baked per rarity so the weapon in your hand looks as good as it rolls.
  S.iconByRarity = {};
  for (const key in ICON_ROWS) {
    if (!Object.prototype.hasOwnProperty.call(ICON_ROWS, key)) continue;
    S.iconByRarity[key] = RARITY_SKINS.map(function (skin) {
      return A.makeSprite(ICON_ROWS[key], skin);
    });
  }

  S.icon = {};
  for (const key in ICON_ROWS) {
    if (!Object.prototype.hasOwnProperty.call(ICON_ROWS, key)) continue;
    S.icon[key] = S.iconByRarity[key][0];
  }

  S.iconFor = function (type, rarity) {
    const set = S.iconByRarity[type];
    if (!set) return null;
    return set[DS.M.clamp(rarity || 0, 0, set.length - 1)];
  };

  S.coin  = A.makeSprite(COIN);
  S.heart = A.makeSprite(HEART);
  S.shard = A.makeSprite(SHARD);
  S.key   = A.makeSprite(KEY);
  S.arrow = A.makeSprite(ARROW);
  S.slash = A.makeSprite(SLASH);

  S.orb = {};
  for (const tint in ORB_TINTS) {
    if (!Object.prototype.hasOwnProperty.call(ORB_TINTS, tint)) continue;
    S.orb[tint] = A.makeSprite(ORB, ORB_TINTS[tint]);
  }

  // Pre-baked mirrors so the render loop never has to transform a canvas.
  function mirror(node) {
    if (!node) return node;
    if (node instanceof HTMLCanvasElement) return A.flipped(node);
    if (Array.isArray(node)) return node.map(mirror);
    const out = {};
    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) out[key] = mirror(node[key]);
    }
    return out;
  }

  S.flip = {
    hero: mirror(S.hero),
    merchant: mirror(S.merchant),
    slime: mirror(S.slime),
    zombie: mirror(S.zombie),
    bat: mirror(S.bat),
    skeleton: mirror(S.skeleton),
    elite: mirror(S.elite),
    mini: mirror(S.mini),
    boss: mirror(S.boss),
    arrow: mirror(S.arrow),
    slash: mirror(S.slash)
  };

  // Hero rows, so the paper doll can re-bake the character in armour.
  S.heroRows = {
    idle: [HERO_IDLE_0, HERO_IDLE_1],
    run: [HERO_RUN_0, HERO_RUN_1, HERO_RUN_2, HERO_RUN_1],
    jump: HERO_JUMP,
    fall: HERO_FALL
  };

  // Raw rows kept around so the biome baker can re-render tiles per palette.
  S.raw = {
    WALL: WALL, FLOOR: FLOOR, PLATFORM: PLATFORM,
    SPIKE: SPIKE,
    DOOR_STYLES: DOOR_STYLES,
    buildDoor: buildDoor,
    TORCH_BODY: TORCH_BODY, TORCH_FLAMES: TORCH_FLAMES,
    DEATH_SPIKE: DEATH_SPIKE
  };

  DS.SPR = S;
})(window.DS);
