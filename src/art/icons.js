/* The interface icon set, authored 1:1.

   The icons the HUD, the bag and the menus share used to be pickup art: baked
   at PICKUP_D detail, so a 12px coin drew at 6 logical pixels inside a 16px
   slot -- half the box, and the reason the currency plate read as specks in a
   large empty panel. Everything here is authored at one art pixel per logical
   pixel and sized to the slot it lands in, which is what makes a 10px coin read
   as a coin at 320x180.

   Patterns index the game's own 30-colour PAL (src/art/base.js), so an icon is
   drawn with the same palette as the world it sits over. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const A = DS.Art;

  /* Money and keys. These three also replace the pickup sprites of the same
     name, so the coin the HUD counts is the coin the bag shows is the coin the
     floor drops -- one drawing, three screens. */
  const COIN = [
    '..yyyy..',
    '.yYYYYy.',
    'yYooooYy',
    'yYoWWoYy',
    'yYoWWoYy',
    'yYooooYy',
    '.yYYYYy.',
    '..yyyy..'
  ];

  const SHARD = [
    '...cc...',
    '..cSSc..',
    '.cSWWSc.',
    'cSSWWSSc',
    '.cSWWSc.',
    '..cSSc..',
    '...cc...'
  ];

  const KEY = [
    '..yy.......',
    '.yYkYy.....',
    '.yYkYyyyyyy',
    '.yYkYy..y.y',
    '.yYkYy..y.y',
    '..yyy......'
  ];

  const LOCK = [
    '..yyy..',
    '.y...y.',
    'yyyyyyy',
    'yYYkYYy',
    'yYkkkYy',
    'yYYkYYy',
    'yyyyyyy'
  ];

  /* Sound. The speaker is the one icon that has to read as a STATE, so the
     muted version is the same body with a cut through the waves. */
  const SPEAKER_ON = [
    '...WW.....',
    '..WWW..y..',
    '.WWWW.y.y.',
    'WWWWW.y..y',
    'WWWWW.y..y',
    '.WWWW.y.y.',
    '..WWW..y..',
    '...WW.....'
  ];

  const SPEAKER_OFF = [
    '...WW.....',
    '..WWW.....',
    '.WWWW.R.R.',
    'WWWWW..R..',
    'WWWWW..R..',
    '.WWWW.R.R.',
    '..WWW.....',
    '...WW.....'
  ];

  const CLOCK = [
    '..GGGG..',
    '.GwwwwG.',
    'GwwwkwwG',
    'GwwwkwwG',
    'GwwwkkwG',
    'GwwwwwwG',
    '.GwwwwG.',
    '..GGGG..'
  ];

  const SKULL = [
    '..wwww..',
    '.wwwwww.',
    'wkkwwkkw',
    'wkkwwkkw',
    'wwwwwwww',
    '.wkwwkw.',
    '.wwkkww.',
    '..w..w..'
  ];

  const TROPHY = [
    'yyyyyyyy',
    'yYWWWWYy',
    'yYWWWWYy',
    '.yYYYYy.',
    '..yYYy..',
    '...yy...',
    '..yyyy..',
    '.yyyyyy.'
  ];

  const DEPTH = [
    '..ww..',
    '..ww..',
    '..ww..',
    'wwwwww',
    '.wwww.',
    '..ww..',
    '......',
    'dddddd'
  ];

  /* Tabs: the three things the profile is about. */
  const TAB_DOLL = [
    '..UU..',
    '..UU..',
    'SSSSSS',
    'SSSSSS',
    '.SSSS.',
    '..KK..',
    '..KK..'
  ];

  const TAB_STATS = [
    '......',
    '....ww',
    '..wwww',
    '..wwww',
    'wwwwww',
    'wwwwww'
  ];

  const TAB_RUN = [
    'yyyyyyy',
    '.ywwwy.',
    '..ywy..',
    '...y...',
    '..ywy..',
    '.ywwwy.',
    'yyyyyyy'
  ];

  /* Biome glyphs, for the floor card and the records screen. */
  const BIOME_SHORE = [
    '.s....s.',
    'sSs..sSs',
    'sSSssSSs',
    '.ssssss.'
  ];

  const BIOME_CAVE = [
    '..DDDD..',
    '.D....D.',
    'D......D',
    'D..kk..D',
    'D.kkkk.D',
    'DDDDDDDD'
  ];

  const BIOME_SWAMP = [
    '...l...',
    '..lll..',
    '.lllll.',
    'lllllll',
    'lllllll',
    '.lllLl.',
    '..lll..'
  ];

  const BIOME_MOUNTAIN = [
    '...WW...',
    '..WWWW..',
    '..DGGD..',
    '.DGGGGD.',
    'DGGGGGGD',
    'DDDDDDDD'
  ];

  const BIOME_FLOODED = [
    '.s....s.',
    'sSs..sSs',
    'sSSssSSs',
    '.cSSSSc.',
    '..cccc..'
  ];

  const BIOME_VOLCANIC = [
    '...y...',
    '..yo...',
    '.yoyy..',
    '.yoooy.',
    'yooyyy.',
    'yooooy.',
    '.yyyy..'
  ];

  /* Menu rows: start, help, and the way home. */
  const PLAY = [
    'yy.....',
    'yyy....',
    'yyyy...',
    'yyyyy..',
    'yyyyy..',
    'yyyy...',
    'yyy....',
    'yy.....'
  ];

  const HELP = [
    '..yyy..',
    '.y...y.',
    '.....y.',
    '...yy..',
    '...y...',
    '.......',
    '...y...'
  ];

  const HOUSE = [
    '...WW...',
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    '.WwwwwW.',
    '.WwkkwW.',
    '.WwkkwW.',
    '.WWWWWW.'
  ];

  /* The floor-rule badge: a bolt, so a hazard rule is recognisable at a glance
     without reading its name. */
  const RULE = [
    '..SS.',
    '.SS..',
    'SSSS.',
    '.SSS.',
    '..SS.',
    '..S..'
  ];

  const build = function (rows) { return A.makeSprite(rows); };

  const UI = {
    coin: build(COIN),
    shard: build(SHARD),
    key: build(KEY),
    lock: build(LOCK),
    speakerOn: build(SPEAKER_ON),
    speakerOff: build(SPEAKER_OFF),
    clock: build(CLOCK),
    skull: build(SKULL),
    trophy: build(TROPHY),
    depth: build(DEPTH),
    tabDoll: build(TAB_DOLL),
    tabStats: build(TAB_STATS),
    tabRun: build(TAB_RUN),
    play: build(PLAY),
    help: build(HELP),
    house: build(HOUSE),
    rule: build(RULE),
    shore: build(BIOME_SHORE),
    cave: build(BIOME_CAVE),
    swamp: build(BIOME_SWAMP),
    mountain: build(BIOME_MOUNTAIN),
    flooded: build(BIOME_FLOODED),
    volcanic: build(BIOME_VOLCANIC),
    // The heart was already the right size and shape; aliased, not redrawn.
    heart: DS.SPR.heart
  };

  DS.SPR.ui = UI;

  /* The three money icons are shared with the pickup art: the HUD, the bag and
     the shop should be counting the same coin the floor dropped. */
  DS.SPR.coin = UI.coin;
  DS.SPR.shard = UI.shard;
  DS.SPR.key = UI.key;

  /* Biome key -> glyph name, so no screen has to map it itself. */
  DS.SPR.biomeGlyph = function (biome) {
    if (!biome) return 'depth';
    const key = biome.key;
    if (key === 'shore' || key === 'halls') return 'shore';
    if (key === 'cave' || key === 'caves' || key === 'nest') return 'cave';
    if (key === 'swamp') return 'swamp';
    if (key === 'mountain') return 'mountain';
    if (key === 'flooded' || key === 'prison') return 'flooded';
    if (key === 'volcanic' || key === 'throne') return 'volcanic';
    return 'cave';
  };
})(window.DS);
