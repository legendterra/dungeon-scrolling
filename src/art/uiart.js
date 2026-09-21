/* Art that only the interface uses: the merchant's goods, the enchanter's
   four rites, and the camp on the main menu.

   Shop and enchant rows are built around these. A row that says only
   "SHARD POUCH  50C" is a spreadsheet; the same row with the pouch drawn on it
   is a shop. Icons are authored on the same 24x24 grid at 2x detail that the
   weapon icons use, so they sit at 12x12 logical units and mix with item icons
   in the same list without one looking twice the size of the other.

   Rows are written as short strings and padded into the grid, because writing
   twenty-four dots on either side of every line is how art files become
   unreadable. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const A = DS.Art;
  const S = DS.SPR;
  const ICON_D = 2;
  const GRID = 24;

  /* Centre a block of authored rows inside the icon grid. `dy` nudges art that
     should sit low (a boot) or high (a flame) rather than dead centre. */
  function pad(rows, dy) {
    const w = rows.reduce(function (max, r) { return Math.max(max, r.length); }, 0);
    const left = Math.floor((GRID - w) / 2);
    const top = Math.floor((GRID - rows.length) / 2) + (dy || 0);
    const blank = new Array(GRID + 1).join('.');
    const out = [];

    for (let y = 0; y < GRID; y++) {
      const row = rows[y - top];
      if (row === undefined) { out.push(blank); continue; }
      out.push(
        blank.slice(0, left) + row +
        blank.slice(0, GRID - left - row.length)
      );
    }
    return out;
  }

  function icon(rows, dy) { return A.makeSprite(pad(rows, dy), null, ICON_D); }

  // --- the merchant's stock -------------------------------------------------

  const BREAD = [
    '....bbbbbbbb....',
    '..bbBBBBBBBBbb..',
    '.bBBUUUUUUUUBBb.',
    'bBUUUUUUUUUUUUBb',
    'bBUUnUUnUUnUUUBb',
    'bBUUUUUUUUUUUUBb',
    'bBBUUUUUUUUUUBBb',
    'bBBBBBBBBBBBBBBb',
    '.bBBbbbbbbbbBBb.',
    '..bbbbbbbbbbbb..'
  ];

  const QUIVER = [
    '..w..w..w...',
    '.Sw.Sw.Sw...',
    '..w..w..w...',
    '.NNNNNNNNN..',
    'NbBBBBBBBbN.',
    'NbBnnnnnBbN.',
    'NbBBBBBBBbN.',
    'NbBnnnnnBbN.',
    'NbBBBBBBBbN.',
    'NbBBBBBBBbN.',
    '.NbBBBBBbN..',
    '..NNNNNNN...'
  ];

  const POUCH = [
    '...S..S.....',
    '..SSs.SS....',
    '.SSSs.sSS...',
    '..Ss...sS...',
    '..NNNNNNN...',
    '.NbBBBBBbN..',
    'NbBBBBBBBBbN',
    'NbBBBBBBBBbN',
    'NbBBnnnBBBbN',
    'NbBBBBBBBBbN',
    '.NbBBBBBbN..',
    '..NNNNNNN...'
  ];

  const VESSEL = [
    '...GGGGGG...',
    '..GwwwwwwG..',
    '.GwRRRRRRwG.',
    'GwRRWRRWRRwG',
    'GwRWWRWWRRwG',
    'GwRRRRRRRRwG',
    'GwRRRRRRRRwG',
    'GwwRRRRRRwwG',
    '.GwwRRRRwwG.',
    '..GwwRRwwG..',
    '...GwwwwG...',
    '....GGGG....'
  ];

  const BOOTS = [
    '...LLLL.....',
    '..LlllLL....',
    '..LlllLL....',
    '..LlllLL....',
    '..LlllLL....',
    '..LlllLLLL..',
    '..LllllllLL.',
    '.LLllllllLLL',
    'nNNNNNNNNNNn',
    '.nnnnnnnnnn.'
  ];

  const FLASK = [
    '...GwwG.....',
    '...GwwG.....',
    '...GwwG.....',
    '..GwwwwG....',
    '.GwLLLLwG...',
    'GwLLllLLwG..',
    'GwLllllLwG..',
    'GwLllLllLwG.',
    'GwLlllllLwG.',
    'GwwLLLLLLwG.',
    '.GwwwwwwwG..',
    '..GGGGGGG...'
  ];

  // --- the enchanter's rites ------------------------------------------------

  const REROLL = [
    '...yyyyyy...',
    '..yyWWWWyy..',
    '.yyWW..WWyy.',
    'yyWW..y.WWyy',
    'yWW..yyy.WWy',
    'yW....y...Wy',
    'yW...y....Wy',
    'yWWy.yyy.WWy',
    'yyWWyy..WWyy',
    '.yyWWWWWWyy.',
    '..yyWWWWyy..',
    '...yyyyyy...'
  ];

  const AFFIX = [
    '.....mm.....',
    '....mPPm....',
    '...mPWWPm...',
    '..mPWmmWPm..',
    '.mPWmWWmWPm.',
    'mPWmWmmWmWPm',
    'mPWmWmmWmWPm',
    '.mPWmWWmWPm.',
    '..mPWmmWPm..',
    '...mPWWPm...',
    '....mPPm....',
    '.....mm.....'
  ];

  const UPGRADE = [
    '.....WW.....',
    '....WYYW....',
    '...WYYYYW...',
    '..WYYYYYYW..',
    '.WYYyyyyYYW.',
    'WYYy.yy.yYYW',
    'WYy..yy..yYW',
    '...yyyyyy...',
    '...yYYYYy...',
    '...yyyyyy...',
    '...yYYYYy...',
    '...yyyyyy...'
  ];

  const SALVAGE = [
    '.......SS...',
    '..S...SssS..',
    '.SsS.SssssS.',
    '..S...SssS..',
    'GGGGGG.SS...',
    'GwwwwGG.....',
    'GGGGGGGG....',
    '...NN..GG...',
    '...NN.......',
    '..NN........',
    '..NN........',
    '.NN.........'
  ];

  // --- empty-slot glyphs ----------------------------------------------------

  /* Drawn dim, in the shape of what belongs there, so an empty inventory still
     reads as a character sheet rather than as five identical grey boxes. */
  const SLOT_HAND = [
    '.....dd.....',
    '.....dd.....',
    '....dDDd....',
    '....dDDd....',
    '....dDDd....',
    '....dDDd....',
    '..dddddddd..',
    '.....dd.....',
    '.....dd.....',
    '....ddDdd...'
  ];

  const SLOT_HEAD = [
    '...dddddd...',
    '..dDDDDDDd..',
    '.dDDDDDDDDd.',
    'dDDdddddDDDd',
    'dDDd....dDDd',
    'dDDd....dDDd',
    'dDDDDddDDDDd',
    '.dDDDDDDDDd.',
    '..dd....dd..'
  ];

  const SLOT_BODY = [
    '..dd....dd..',
    '.dDDdddDDDd.',
    'dDDDDDDDDDDd',
    'dDDDDDDDDDDd',
    'dDDDDDDDDDDd',
    '.dDDDDDDDDd.',
    '.dDDDDDDDDd.',
    '.dDDDDDDDDd.',
    '..dddddddd..'
  ];

  const SLOT_LEGS = [
    '.dDDDDDDDDd.',
    '.dDDDDDDDDd.',
    '.dDDDDDDDDd.',
    '.dDDDdddDDd.',
    '.dDDd..dDDd.',
    '.dDDd..dDDd.',
    '.dDDd..dDDd.',
    '.dDDd..dDDd.',
    '..dd....dd..'
  ];

  // --- the camp on the main menu --------------------------------------------

  /* The hero, seen from behind, sitting at the fire with the forest at his
     back. Authored at 1x rather than 2x: the menu wants him a good deal larger
     than he is in play, and doubling a 2x sprite reads as a blur where honest
     big pixels read as a poster. */
  const HERO_SIT = [
    '.......LLLLLL.......',
    '.....LLllllllLL.....',
    '....LlllllllllllL...',
    '...LlllllllllllllL..',
    '...LlllUUUUUUlllllL.',
    '...LllUUUUUUUUlllL..',
    '....LUUUUUUUUUUL....',
    '.....UUUUUUUUUU.....',
    '.....UUnUUUUnUU.....',
    '......UUUUUUUU......',
    '.......UUUUUU.......',
    '......ccsssscc......',
    '.....cssSSSSssc.....',
    '....csssSSSSsssc....',
    '...cssssSSSSssssc...',
    '...cssssSSSSssssc...',
    '...csssssssssssssc..',
    '...cKKKKKKKKKKKKKc..',
    '...KKKxxxxxxxxKKKK..',
    '..KKxxxxxxxxxxxxKK..',
    '.NNxxxxxxxxxxxxxxNN.',
    'NNNNxxxxxxxxxxxxNNNN',
    'NnnN..........NnnnN.',
    '.NN............NNN..'
  ];

  const LOGS = [
    '....nnnnnnnnnnnn....',
    '..nnNbbbbbbbbbbNnn..',
    '.nNbBBnBBnBBnBBbNn..',
    'nNbBBBBBBBBBBBBBbNn.',
    '.nNbbBBnBBnBBnBbNn..',
    '..nnNNbbbbbbbNNnn...',
    '....nnnnnnnnnnn.....'
  ];

  const FLAME_A = [
    '......WW......',
    '.....WYYW.....',
    '....WYYYYW....',
    '...oYYYYYYo...',
    '...oyYYYYyo...',
    '..toyyYYyyot..',
    '..toyyyyyyot..',
    '.ttoooyyooott.',
    '.tttoooooottt.',
    '..tttooootttt.'
  ];

  const FLAME_B = [
    '.....WW.......',
    '....WYYW......',
    '...WYYYYW.....',
    '..oYYYYYYo....',
    '..oyYYYYyo.o..',
    '.toyyYYyyotto.',
    '.toyyyyyyoott.',
    'ttoooyyoooottt',
    'tttoooooootttt',
    '.ttoooooootttt'
  ];

  const FLAME_C = [
    '.......WW.....',
    '......WYYW....',
    '.....WYYYYW...',
    '..o.oYYYYYYo..',
    '..o.oyYYYYyo..',
    '.tt.oyyYYyyot.',
    '.tttoyyyyyyot.',
    'tttoooyyoooott',
    'ttttooooooottt',
    'tttoooooooottt'
  ];

  // --- registration ---------------------------------------------------------

  S.uiIcon = {
    bread: icon(BREAD),
    quiver: icon(QUIVER),
    pouch: icon(POUCH),
    vessel: icon(VESSEL),
    boots: icon(BOOTS, 1),
    flask: icon(FLASK),
    reroll: icon(REROLL),
    affix: icon(AFFIX),
    upgrade: icon(UPGRADE),
    salvage: icon(SALVAGE)
  };

  S.slotIcon = {
    weapon: icon(SLOT_HAND),
    head: icon(SLOT_HEAD),
    chest: icon(SLOT_BODY),
    legs: icon(SLOT_LEGS)
  };

  S.camp = {
    hero: A.makeSprite(HERO_SIT),
    logs: A.makeSprite(LOGS),
    flames: [A.makeSprite(FLAME_A), A.makeSprite(FLAME_B), A.makeSprite(FLAME_C)]
  };

  // Shop entries are keyed by the stock's own key, with a sensible fallback.
  S.shopIcon = function (entry) {
    if (!entry) return null;
    if (entry.kind === 'item') return S.itemIcon(entry.item);
    return S.uiIcon[entry.key] || S.uiIcon.pouch;
  };
})(window.DS);
