/* Every pixel in the game, authored as character rows and baked once at load.
   Palette keys are defined in art/base.js; '.' is transparent.
   Variants that differ only in colour (chest tiers, elemental projectiles,
   the boss) reuse a shape with a palette override instead of new art. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const A = DS.Art;

  // ---- player (24 x 34 art at 2x detail, over an 8 x 14 body box) ----------

  /* Chibi proportions: the head takes the top 20 of 34 art rows, the torso is
     deliberately stubby and the legs are short. The art is wider and taller
     than the collision box on purpose -- growing the box instead would make
     the hero a full tile tall and every one-tile gap in every existing level
     would become impassable. The renderer offsets the sprite so the feet still
     land on the box.

     Authored at HERO_D detail: 24x34 art pixels cover the same 12x17 logical
     units the 1x version did, so placement and physics are untouched. The
     palette letters are the ones the paper doll remaps, so armour recolouring
     keeps working unchanged. */
  const HERO_D = 2;

  const HERO_HEAD = [
    '.......kkkkkkkkkk.......',
    '.....kkNNNNNNNNNNkk.....',
    '....kNNNNNNNNNNNNNNk....',
    '...kNNNNNNNNNNNNNNNNk...',
    '...kNNNNNNNNNNNNNNNNk...',
    '..kNNNNNNNNNNNNNNNNNNk..',
    '..kNNNNNNNNNNNNNNNNNNk..',
    '..kNNNNNNNNNNNNNNNNNNk..',
    '..kNNuUUUUUUUUUUUUuNNk..',
    '..kNNuUUUUUUUUUUUUuNNk..',
    '..kNNuUUkkkUUkkkUUuNNk..',
    '..kNNuUUkWkUUkWkUUuNNk..',
    '..kNNuUUkkkUUkkkUUuNNk..',
    '..kNNuUUUUUUUUUUUUuNNk..',
    '..kNNumUUUUkkUUUUmuNNk..',
    '..kNNumUUUUUUUUUUmuNNk..',
    '...kNNuUUUUUUUUUUuNNk...',
    '....kuUUUUUUUUUUUUuk....',
    '.....kuUUUUUUUUUUuk.....',
    '........kkuuuukk........'
  ];

  const HERO_BODY = [
    '.....kCCCCCCCCCCCCk.....',
    '....kCCCCCCCCCCCCCCk....',
    '....kCCCCCCCCCCCCCCk....',
    '....kCCCCCCCCCCCCCCk....',
    '....kCCbbbbbbbbbbCCk....',
    '....kCbbbbbbbbbbbbCk....',
    '....kCbbbbbbbbbbbbCk....',
    '....kCCCCCCCCCCCCCCk....'
  ];

  const HERO_TORSO = HERO_HEAD.concat(HERO_BODY);
  const BLANK_ROW = '........................';

  function heroWith(legs) { return HERO_TORSO.concat(legs); }

  const HERO_IDLE_0 = heroWith([
    '....kcccccccccccccck....',
    '....kccccck..kccccck....',
    '....kccccck..kccccck....',
    '....knnnnnk..knnnnnk....',
    '...knnnnnnk..knnnnnnk...',
    '...kkkkkkkk..kkkkkkkk...'
  ]);

  const HERO_RUN_0 = heroWith([
    '....kcccccccccccccck....',
    '..kccccck.....kccccck...',
    '.kccccck.......kccccck..',
    '.knnnnnk........knnnnnk.',
    'knnnnnnk........knnnnnnk',
    'kkkkkkkk........kkkkkkkk'
  ]);

  const HERO_RUN_1 = heroWith([
    '....kcccccccccccccck....',
    '....kcccccccccccccck....',
    '....kcccccccccccccck....',
    '....knnnnnnnnnnnnnnk....',
    '...knnnnnnnnnnnnnnnnk...',
    '...kkkkkkkk..kkkkkkkk...'
  ]);

  const HERO_RUN_2 = heroWith([
    '....kcccccccccccccck....',
    '...kccccck.....kccccck..',
    '..kccccck.......kccccck.',
    '.knnnnnk........knnnnnk.',
    'knnnnnnk........knnnnnnk',
    'kkkkkkkk........kkkkkkkk'
  ]);

  const HERO_JUMP = heroWith([
    '....kcccccccccccccck....',
    '....kccccck..kccccck....',
    '...kccccck....kccccck...',
    '...knnnnnk....knnnnnk...',
    '..knnnnnnk....knnnnnnk..',
    '..kkkkkkkk....kkkkkkkk..'
  ]);

  const HERO_FALL = heroWith([
    '....kcccccccccccccck....',
    '..kccccck.....kccccck...',
    '.kccccck.......kccccck..',
    'kccccck.........kccccck.',
    'knnnnnk.........knnnnnk.',
    'kkkkkkk.........kkkkkkk.'
  ]);

  /* Same pose two art pixels lower -- one logical pixel of breathing bob. The
     feet stay put, so the drop is taken out of the torso. */
  const HERO_IDLE_1 = [BLANK_ROW, BLANK_ROW]
    .concat(HERO_HEAD, HERO_BODY.slice(2), HERO_IDLE_0.slice(28));

  // ---- enemies -------------------------------------------------------------

  /* Every monster is drawn chibi at 2x detail: an oversized round head with
     big eyes over a small body. Footprints in LOGICAL units are unchanged --
     the collision box, the spawn spacing and the elite/mini/colossal scaling
     all derive from them. Palette letters are unchanged too, so the elite,
     miniboss and colossal recolours keep working untouched. */
  const ENEMY_D = 2;

  const SLIME_0 = [
    '.......kkkkkkkkkk.......',
    '.....kkLLLLLLLLLLkk.....',
    '....kLLLLLLLLLLLLLLk....',
    '...kLLWWLLLLLLLLLLLLk...',
    '..kLLWWLLLLLLLLLLLLLLk..',
    '..kLLLLLLLLLLLLLLLLLLk..',
    '..kLLLkkkLLLLkkkLLLLLk..',
    '..kLLLkWkLLLLkWkLLLLLk..',
    '..kLLLkkkLLLLkkkLLLLLk..',
    '..kLLLLLLLLLLLLLLLLLLk..',
    '..kLLLLLLkkkkLLLLLLLLk..',
    '..klllLLLLLLLLLLLLlllk..',
    '..kllllllLLLLLLllllllk..',
    '..keelllllllllllllleek..',
    '.keeeelllllllllllleeeek.',
    '.keeeeeeeeeeeeeeeeeeeek.',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'kkkkkkkkkkkkkkkkkkkkkkkk'
  ];

  // Squashed landing frame -- wider, flatter, highlight thrown left.
  const SLIME_1 = [
    '........................',
    '........................',
    '........................',
    '.......kkkkkkkkkk.......',
    '....kkLLLWWLLLLLLLkk....',
    '..kLLLLLWWLLLLLLLLLLLk..',
    '..kLLkkkLLLLLkkkLLLLLk..',
    '..kLLkWkLLLLLkWkLLLLLk..',
    '..kLLkkkLLLLLkkkLLLLLk..',
    '.kLLLLLLLLkkkkLLLLLLLLk.',
    '.klllLLLLLLLLLLLLLLLllk.',
    'kllllllllLLLLLLLLllllllk',
    'keelllllllllllllllllleek',
    'keeeeellllllllllllleeeek',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'kkkkkkkkkkkkkkkkkkkkkkkk'
  ];

  const ZOMBIE_0 = [
    '......kkkkkkkk......',
    '....kknnnnnnnnkk....',
    '...knnnnnnnnnnnnk...',
    '..knnnnnnnnnnnnnnk..',
    '..knnnnnnnnnnnnnnk..',
    '..knnllllllllllnnk..',
    '..knllllllllllllnk..',
    '..kllkkkllllkkkllk..',
    '..kllkRkllllkRkllk..',
    '..kllkkkllllkkkllk..',
    '..kllllllllllllllk..',
    '..kllllkkkkkkllllk..',
    '..kllllllllllllllk..',
    '...kllllllllllllk...',
    '....klllllllllllk...',
    '......kkllllkk......',
    '....keeeeeeeeeek....',
    '...keeeeeeeeeeeek...',
    '..keeeeeeeeeeeeeek..',
    '..keeeeeeeeeeeeeek..',
    '..keelllllllllleek..',
    '..keeeeeeeeeeeeeek..',
    '...kddddddddddddk...',
    '...kddddddddddddk...',
    '...kddddk..kddddk...',
    '...knnnnk..knnnnk...',
    '..knnnnnk..knnnnnk..',
    '..kkkkkkk..kkkkkkk..'
  ];

  const ZOMBIE_1 = ZOMBIE_0.slice(0, 22).concat([
    '...kddddddddddddk...',
    '..kddddk....kddddk..',
    '..knnnnk....knnnnk..',
    '.knnnnnk....knnnnnk.',
    '.kkkkkkk....kkkkkkk.',
    '....................'
  ]);

  // Wings up.
  const BAT_0 = [
    'kddk............kddk',
    'kddk............kddk',
    'kddk..kkkkkkkk..kddk',
    'kddk.kddddddddk.kddk',
    'kddk.kddddddddk.kddk',
    'kddk.kdRRddRRdk.kddk',
    'kddk.kdRRddRRdk.kddk',
    'kddk.kddddddddk.kddk',
    'kddk.kdWWWWWWdk.kddk',
    'kddk..kdWWWWdk..kddk',
    '.kdk...kkkkkk...kdk.',
    '.kdk...kddddk...kdk.',
    '..k....kddddk....k..',
    '.......kddddk.......',
    '.......kkkkkk.......',
    '....................'
  ];

  // Wings down.
  const BAT_1 = [
    '....................',
    '....................',
    '......kkkkkkkk......',
    '.....kddddddddk.....',
    'kk...kddddddddk...kk',
    'kdk..kdRRddRRdk..kdk',
    'kddk.kdRRddRRdk.kddk',
    'kddk.kddddddddk.kddk',
    'kddkkkdWWWWWWdkkkddk',
    'kddk..kdWWWWdk..kddk',
    'kddk...kkkkkk...kddk',
    '.kdk...kddddk...kdk.',
    '..k....kddddk....k..',
    '.......kddddk.......',
    '.......kkkkkk.......',
    '....................'
  ];

  const SKELETON_0 = [
    '......kkkkkkkk......',
    '....kkwwwwwwwwkk....',
    '...kwwwwwwwwwwwwk...',
    '..kwwwwwwwwwwwwwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwkkkkwwwwkkkkwk..',
    '..kwkRRkwwwwkRRkwk..',
    '..kwkRRkwwwwkRRkwk..',
    '..kwkkkkwwwwkkkkwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwwwwwkkkkwwwwwk..',
    '..kwwkwkwkwkwkwwwk..',
    '...kwwwwwwwwwwwwk...',
    '.....kkwwwwwwkk.....',
    '.......kwwwwk.......',
    '....kwwwwwwwwwwk....',
    '...kwwwwwwwwwwwwk...',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '...kwwwwwwwwwwwwk...',
    '....kwwwwwwwwwwk....',
    '...kwwwwk..kwwwwk...',
    '...kwwwwk..kwwwwk...',
    '...kwwwwk..kwwwwk...',
    '..kwwwwwk..kwwwwwk..',
    '..kkkkkkk..kkkkkkk..'
  ];

  // Drawing the bow: stance widened.
  const SKELETON_1 = SKELETON_0.slice(0, 22).concat([
    '....kwwwwwwwwwwk....',
    '..kwwwwk....kwwwwk..',
    '..kwwwwk....kwwwwk..',
    '.kwwwwwk....kwwwwwk.',
    '.kkkkkkk....kkkkkkk.',
    '....................'
  ]);

  const CROWN = [
    '..y......yy......y..',
    '.yy.....yyyy.....yy.',
    '.yyy...yyyyyy...yyy.',
    '.yyyy.yyyyyyyy.yyyy.',
    '.yyyyyyyyyyyyyyyyyy.',
    'kyyyyyyyyyyyyyyyyyyk',
    'kyyYYyyyyRRyyyyYYyyk',
    'kyyYYyyyyRRyyyyYYyyk',
    'kyyyyyyyyyyyyyyyyyyk',
    'kyyyyyyyyyyyyyyyyyyk',
    '.kyyyyyyyyyyyyyyyyk.',
    '..kkkkkkkkkkkkkkkk..'
  ];

  // Hurt faces: eyes crossed out, mouth thrown open. Only the face band differs, so the silhouette never shifts.
  const SLIME_HURT = [
    '.......kkkkkkkkkk.......',
    '.....kkLLLLLLLLLLkk.....',
    '....kLLLLLLLLLLLLLLk....',
    '...kLLWWLLLLLLLLLLLLk...',
    '..kLLWWLLLLLLLLLLLLLLk..',
    '..kLLLLLLLLLLLLLLLLLLk..',
    '..kLLLkLkLLLLkLkLLLLLk..',
    '..kLLLLkLLLLLLkLLLLLLk..',
    '..kLLLkLkLLLLkLkLLLLLk..',
    '..kLLLLLLLLLLLLLLLLLLk..',
    '..kLLLLkkkkkkkkLLLLLLk..',
    '..klllLLLLLLLLLLLLlllk..',
    '..kllllllLLLLLLllllllk..',
    '..keelllllllllllllleek..',
    '.keeeelllllllllllleeeek.',
    '.keeeeeeeeeeeeeeeeeeeek.',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'kkkkkkkkkkkkkkkkkkkkkkkk'
  ];

  const ZOMBIE_HURT = [
    '......kkkkkkkk......',
    '....kknnnnnnnnkk....',
    '...knnnnnnnnnnnnk...',
    '..knnnnnnnnnnnnnnk..',
    '..knnnnnnnnnnnnnnk..',
    '..knnllllllllllnnk..',
    '..knllllllllllllnk..',
    '..kllkLkllllkLkllk..',
    '..kllLkLllllLkLllk..',
    '..kllkLkllllkLkllk..',
    '..kllllllllllllllk..',
    '..kllkkkkkkkkkkllk..',
    '..kllllllllllllllk..',
    '...kllllllllllllk...',
    '....klllllllllllk...',
    '......kkllllkk......',
    '....keeeeeeeeeek....',
    '...keeeeeeeeeeeek...',
    '..keeeeeeeeeeeeeek..',
    '..keeeeeeeeeeeeeek..',
    '..keelllllllllleek..',
    '..keeeeeeeeeeeeeek..',
    '...kddddddddddddk...',
    '...kddddddddddddk...',
    '...kddddk..kddddk...',
    '...knnnnk..knnnnk...',
    '..knnnnnk..knnnnnk..',
    '..kkkkkkk..kkkkkkk..'
  ];

  const BAT_HURT = [
    'kddk............kddk',
    'kddk............kddk',
    'kddk..kkkkkkkk..kddk',
    'kddkkddLddddLddkkddk',
    'kddkkdLdLddLdLddkddk',
    'kddkkddLddddLddkkddk',
    'kddkkddddddddddkkddk',
    'kddkkdWWWWWWWWdkkddk',
    'kddk.kdWWWWWWdk.kddk',
    'kddk..kdWWWWdk..kddk',
    '.kdk...kkkkkk...kdk.',
    '.kdk...kddddk...kdk.',
    '..k....kddddk....k..',
    '.......kddddk.......',
    '.......kkkkkk.......',
    '....................'
  ];

  const SKELETON_HURT = [
    '......kkkkkkkk......',
    '....kkwwwwwwwwkk....',
    '...kwwwwwwwwwwwwk...',
    '..kwwwwwwwwwwwwwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwkwkwwwwkwkwwwk..',
    '..kwwkwwwwwwkwwwwk..',
    '..kwkwkwwwwkwkwwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwkkkkkkkkkkkkwk..',
    '..kwwkwkwkwkwkwwwk..',
    '...kwwwwwwwwwwwwk...',
    '.....kkwwwwwwkk.....',
    '.......kwwwwk.......',
    '....kwwwwwwwwwwk....',
    '...kwwwwwwwwwwwwk...',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '...kwwwwwwwwwwwwk...',
    '....kwwwwwwwwwwk....',
    '...kwwwwk..kwwwwk...',
    '...kwwwwk..kwwwwk...',
    '...kwwwwk..kwwwwk...',
    '..kwwwwwk..kwwwwwk..',
    '..kkkkkkk..kkkkkkk..'
  ];

  // ---- world tiles (16 x 16) -----------------------------------------------

  const SOLID = 'k'.repeat(32);

  /* Tiles are authored at 2x detail: a 32x32 grid covering the same 16x16
     logical tile. The brick patterns are generated modulo the tile size, so
     they still wrap seamlessly on all four edges. */
  const TILE_D = 2;

  const WALL = [
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'xgggggggggggggggxggggggggggggggg',
    'xDDDDDggDDDDDDDDxDDDDDDDDDDDDDDD',
    'xDDDDDggDDDDDDDDxDDDDDDDDDDDDDDD',
    'xDDDDDDDDDDDDDDDxDDDDDDDDDDDDDDD',
    'xDDDDDDDDDDDDDDDxDDDDDDDDDDDDDDD',
    'xDDDDDDDDDDDDDddxDDDDDDDddDDDDDD',
    'xdddddddddddddddxddddddddddddddd',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'ggggggggxgggggggggggggggxggggggg',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDggDD',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDggDD',
    'DDDDDDDDxDDDDDDDDDDDggDDxDDDddDD',
    'DDDDDDDDxDDDDDDDDDDDggDDxDDDddDD',
    'DDDDDDggxDDDDDDDDDDDDDddxDDDDDDD',
    'ddddddddxdddddddddddddddxddddddd',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'xgggggggggggggggxggggggggggggggg',
    'xDDDDDDDDDDDddDDxDDDDDDDDDDDDDDD',
    'xDDDDDDDDDDDddDDxDDDDDDDDDDDDDDD',
    'xDDDDDddDDDDDDDDxDDDDDDDDDddDDDD',
    'xDDDDDddDDDDDDDDxDDDDDDDDDddDDDD',
    'xDDDDDDDDDDDDDDDxdDDDDDDDDDDDDdd',
    'xdddddddddddddddxddddddddddddddd',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'ggggggggxgggggggggggggggxggggggg',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDDDDD',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDDDDD',
    'DDDDggDDxDDDDDddDDDDDDDDxDDDDDDD',
    'DDDDggDDxDDDDDddDDDDDDDDxDDDDDDD',
    'DDDDDDDDxDDDDDDDDDggDDDDxDDDDDDD',
    'ddddddddxdddddddddddddddxddddddd'
  ];

  // Wall with a lit top edge -- used for the surface of any floor.
  const FLOOR = [
    'gggggggggggggggggggggggggggggggg',
    'GgGgGgGgGgGgGgGgGgGgGgGgGgGgGgGg',
    'gggggggGggGgGggGgggggGgggggGgggg',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'xDDDDDDDDDDDDDDDxDDDDDDDDDDDDDDD',
    'xDDDDDDDDDDDDDDDxDDDDDDDDDDDDDDD',
    'xDDDDDDDDDDDDDddxDDDDDDDddDDDDDD',
    'xdddddddddddddddxddddddddddddddd',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'ggggggggxgggggggggggggggxggggggg',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDggDD',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDggDD',
    'DDDDDDDDxDDDDDDDDDDDggDDxDDDddDD',
    'DDDDDDDDxDDDDDDDDDDDggDDxDDDddDD',
    'DDDDDDggxDDDDDDDDDDDDDddxDDDDDDD',
    'ddddddddxdddddddddddddddxddddddd',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'xgggggggggggggggxggggggggggggggg',
    'xDDDDDDDDDDDddDDxDDDDDDDDDDDDDDD',
    'xDDDDDDDDDDDddDDxDDDDDDDDDDDDDDD',
    'xDDDDDddDDDDDDDDxDDDDDDDDDddDDDD',
    'xDDDDDddDDDDDDDDxDDDDDDDDDddDDDD',
    'xDDDDDDDDDDDDDDDxdDDDDDDDDDDDDdd',
    'xdddddddddddddddxddddddddddddddd',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'ggggggggxgggggggggggggggxggggggg',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDDDDD',
    'DDDDDDDDxDDDDDDDDDDDDDDDxDDDDDDD',
    'DDDDggDDxDDDDDddDDDDDDDDxDDDDDDD',
    'DDDDggDDxDDDDDddDDDDDDDDxDDDDDDD',
    'DDDDDDDDxDDDDDDDDDggDDDDxDDDDDDD',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  ];

  const PLATFORM = [
    'BBbbBBBBbbBBBBBbBBBBBbbBBBBbbBBB',
    'BbbbbbbbBbbbbbbbBbbbbbbbBbbbbbbb',
    'bnnnnnnnbnnnnnnnbnnnnnnnbnnnnnnn',
    'bnnnnnnnbnnnnnnnbnnnnnnnbnnnnnnn',
    'bnnnnnnnbnnnnnnnbnnnnnnnbnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'GkkkkkkkGkkkkkkkGkkkkkkkGkkkkkkk',
    '.kkk.kkk.kkk.kkk.kkk.kkk.kkk.kkk',
    '................................',
    '................................'
  ];

  const SPIKE = [
    '....W.......W.......W.......W...',
    '....W.......W.......W.......W...',
    '....W.......W.......W.......W...',
    '....W.......W.......W.......W...',
    '....w.......w.......w.......w...',
    '...Gwx.....Gwx.....Gwx.....Gwx..',
    '...Gwx.....Gwx.....Gwx.....Gwx..',
    '...Gwx.....Gwx.....Gwx.....Gwx..',
    '...Gwx.....Gwx.....Gwx.....Gwx..',
    '..GGwGx...GGwGx...GGwGx...GGwGx.',
    '..GGwGx...GGwGx...GGwGx...GGwGx.',
    '..GGwGx...GGwGx...GGwGx...GGwGx.',
    '..GGwGx...GGwGx...GGwGx...GGwGx.',
    'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  ];

  /* Exits are two tiles tall and stand on the floor, so they read as doorways
     rather than as a picture hung in mid-air. Three silhouettes are generated
     rather than hand-drawn, because the only thing that differs between them is
     the shape of the opening. */
  /* Doors are generated rather than hand-drawn, so raising the detail is just
     a matter of sampling the same logical shape on a denser grid: the silhouette
     is identical, the curve of the arch simply lands on twice the pixels. */
  const DOOR_W = 16 * TILE_D, DOOR_H = 32 * TILE_D;
  const DOOR_LH = 32;

  function doorOpening(style, ax, ay) {
    const x = ax / TILE_D, y = ay / TILE_D;
    const dx = Math.abs(x - 7.5);
    if (y < 2 || y > DOOR_LH - 2) return false;

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
    const r = 2 * TILE_D;
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
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
          if (style === 'gate' && (x - 2 * TILE_D) % (4 * TILE_D) < TILE_D) row += 'g';
          else if (style === 'gate' && y % (9 * TILE_D) < TILE_D) row += 'g';
          else if ((x * 7 + y * 13) % 37 === 0) row += 's';            // glint
          else row += 'K';
        } else if (nearOpening(style, x, y)) {
          row += (x + y) % 5 === 0 ? 'G' : (style === 'cave' ? 'd' : 'g');
        } else if (y >= DOOR_H - 2 * TILE_D && nearOpening(style, x, y - 2 * TILE_D)) {
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
      '....tttttt......',
      '..ttBBBBBBtt....',
      '..tBBBBBBBBt....',
      '..tbBBBBBBbt....',
      '..tbbBBBBbbt....',
      '..tbbbbbbbbt....',
      '...tbbbbbbt.....',
      '....tttttt......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '..GGkkNNkkGG....',
      'GGGGkkNNkkGGGG..',
      'GGGGkkNNkkGGGG..',
      '..GGkkNNkkGG....',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '.....kNNk.......',
      '....kkNNk.......',
      '..kkGGNNk.......',
      '..kGGGkkk.......',
      '..kGGx..........',
      '..kGGx..........',
      '..kGGx..........',
      '..kGGx..........',
      '..kkxx..........',
      '................',
      '................',
      '................',
      '................'
  ];

  /* Four flame frames on a slow cycle. The shape breathes rather than swings —
     a torch that whips side to side reads as wind, not as a light source. */
  const TORCH_FLAMES = [
    [
      '......YY........',
      '.....YWWY.......',
      '....yYWWYy......',
      '....yYWWYy......',
      '...yyYYYYyy.....',
      '...yyYYYYyy.....',
      '....yoYYoy......',
      '....yooooy......',
      '.....oooo.......',
      '......oo........'
    ],
    [
      '.....YYY........',
      '.....YWWY.......',
      '....yYWWYy......',
      '...yyYWWYy......',
      '...yyYYYYyy.....',
      '..yyoYYYYyy.....',
      '...yooYYoy......',
      '....yooooy......',
      '.....oooo.......',
      '......oo........'
    ],
    [
      '......YY........',
      '.....YWWYY......',
      '....yYWWWYy.....',
      '....yYWWWYy.....',
      '...yyYYYYYy.....',
      '...yyYYYYoy.....',
      '....yoYYooy.....',
      '....yoooooy.....',
      '.....ooooo......',
      '......oo........'
    ],
    [
      '......Y.........',
      '.....YWY........',
      '....yYWWYy......',
      '....yYWWYy......',
      '...yyYYYYy......',
      '...yoYYYYy......',
      '....ooYYoy......',
      '....yoooo.......',
      '.....ooo........',
      '......o.........'
    ]
  ];

  // The killing floor at the bottom of a pit.
  const DEATH_SPIKE = [
      '................................',
      '................................',
      '...R..............R.............',
      '...R....R.........R....R........',
      '...R....R....R....R....R....R...',
      '...r....R....R....r....R....R...',
      '...r....r....R....r....r....R...',
      '...r....r....r....r....r....r...',
      '...r....r....r....r....r....r...',
      '...r....r....r....r....r....r...',
      '...r....r....r....r....r....r...',
      '...r....r....r....r....r....r...',
      '..RrR...r....r...RrR...r....r...',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      '..RrR..RrR..RrR..RrR..RrR..RrR..',
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
      'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
      'krrrrrrrrrrrrrrrrrrrrrrrrrrrrrrk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk'
  ];

  /* Props, chests and item icons are authored at 2x detail over their
     original logical footprints. */
  const PROP_D = 2;

  const ENCHANT_TABLE = [
    '.......kk.....kSSk..............',
    '......kSSk....kSSk.....kk.......',
    '......kSSk.kk..kk..kk.kSSk......',
    '.......kk.kSSk....kSSkkSSk......',
    '...kkkkkkkkSSkkkkkkSSkkkkkkkk...',
    '..kPPPPPPPPPPPPPPPPPPPPPPPPPPk..',
    '..kPPPPPPPPPPPPPPPPPPPPPPPPPPk..',
    '.kmmmmmmmmmmmmmPPmmmmmmmmmmmmmk.',
    '.kmSSSSSSSSSSSSPPSSSSSSSSSSSSmk.',
    '.kmSSSSSSSSSSSSPPSSSSSSSSSSSSmk.',
    '.kmSSSSSSSSSSSSPPSSSSSSSSSSSSmk.',
    '.kmmmmmmmmmmmmmPPmmmmmmmmmmmmmk.',
    '.kPPPPPPPPPPPPPPPPPPPPPPPPPPPPk.',
    '.kPPPPPPPPPPPPPPPPPPPPPPPPPPPPk.',
    'kppppppppppppppppppppppppppppppk',
    'kppppppppppppppppppppppppppppppk',
    'kppppppppppppppppppppppppppppppk',
    '.kkkppppkkkkkkkkkkkkkkkkppppkkk.',
    '...kpPPpk..............kpPPpk...',
    '...kpPPpk..............kpPPpk...',
    '...kpPPpk..............kpPPpk...',
    '...kpPPpk..............kpPPpk...',
    '...kpPPpk..............kpPPpk...',
    '...kppppk..............kppppk...'
  ];

  // ---- chests (14 x 11) ----------------------------------------------------

  /* Armour icons. One silhouette per slot, repainted per material. Five tones
     rather than three: 'G' highlight, 'D' mid, 'x' shade, 'd' dark and 'k'
     outline, so the plates read as metal or cloth instead of a flat blob.
     Rivets, stitching and plate seams are drawn in the shade tone. */
  const ICON_HELM = [
    '...kkkkkkddkkkkkk...',
    '..kGGGGGGddGGGGGGk..',
    '..kGGGGGGddGGGGGGk..',
    '.kkGGGGGGddGGGGGGkk.',
    'kGGGGGGGGddGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGxxxxxxxxxxxxxxGGk',
    'kGGxWWWWWxxWWWWWxGGk',
    'kGGxWWWWWxxWWWWWxGGk',
    'kGGxxxxxxxxxxxxxxGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    '.kkGGGGGGGGGGGGGGkk.',
    '..kGGGGGGGGGGGGGGk..',
    '...kkkkkkkkkkkkkk...',
    '....................'
  ];

  const ICON_CHEST = [
    'kkkkkk........kkkkkk',
    'ddddddk......kdddddd',
    'ddddddkkkkkkkkdddddd',
    'ddddGGGGGGGGGGGGdddd',
    'ddddGGGGGGGGGGGGdddd',
    'ddddGGGGGxxGGGGGdddd',
    'kkkkGWWWGxxGWWWGkkkk',
    '...kGWWWGxxGWWWGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGxxGGGGGk...',
    '...kGGGGGGGGGGGGk...',
    '....kkGGGGGGGGkk....',
    '.....kGGGGGGGGk.....',
    '......kkkkkkkk......'
  ];

  const ICON_LEGS = [
    '.kkkkkkkkkkkkkkkkkk.',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGGGGGk',
    '.kGGGGGGGkkGGGGGGGk.',
    '.kGWWGGGGkkGGGGWWGk.',
    '.kGWWGGGGkkGGGGWWGk.',
    '.kGWWGGGGkkGGGGWWGk.',
    '.kGWWGGGGkkGGGGWWGk.',
    '.kGWWGGGGkkGGGGWWGk.',
    '.kGWWGGGGkkGGGGWWGk.',
    '.kGGGGGGGkkGGGGGGGk.',
    '.kGGGGGGGkkGGGGGGGk.',
    '.kGGGGGGGkkGGGGGGGk.',
    '.kGdddddGkkGdddddGk.',
    '.kGdddddGkkGdddddGk.',
    '.kGdddddGkkGdddddGk.',
    '..kkkkkkk..kkkkkkk..',
    '....................'
  ];

  /* The shrine: a small obelisk with a floating rune. The rune pixels are
     drawn by the scene so it can pulse and dim once the shrine is spent. */
  const SHRINE = [
    '...........kkkkkkkkkk...........',
    '.........kkPPPPPPPPPPkk.........',
    '........kPPPPPPPPPPPPPPk........',
    '........kPmmmmmmmmmmmmPk........',
    '........kPmmmmmmmmmmmmPk........',
    '........kPmmSSSSSSSSmmPk........',
    '........kPmmSSSSSSSSmmPk........',
    '........kPmmSSWWWWSSmmPk........',
    '........kPmmSSWWWWSSmmPk........',
    '........kPmmSSWWWWSSmmPk........',
    '........kPmmSSWWWWSSmmPk........',
    '........kPmmSSSSSSSSmmPk........',
    '........kPmmSSSSSSSSmmPk........',
    '........kPmmmmmmmmmmmmPk........',
    '........kPmmmmmmmmmmmmPk........',
    '........kPPPPPPPPPPPPPPk........',
    '.........kkppppppppppkk.........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPmmmmmmPpk..........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPmmmmmmPpk..........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPmmmmmmPpk..........',
    '..........kpPPPPPPPPpk..........',
    '..........kpPPPPPPPPpk..........',
    '........kkkppppppppppkkk........',
    '.......kppppppppppppppppk.......',
    '.......kppppppppppppppppk.......',
    '.......kppppppppppppppppk.......',
    '......kkppppppppppppppppkk......',
    '.....kPPPPPPPPPPPPPPPPPPPPk.....',
    '.....kPppppppppppppppppppPk.....',
    '.....kPppppppppppppppppppPk.....',
    '.....kPPPPPPPPPPPPPPPPPPPPk.....',
    '....kppppppppppppppppppppppk....',
    '....kppppppppppppppppppppppk....'
  ];

  const CHEST_CLOSED = [
    '....kkkkkkkkkkkkkkkkkkkk....',
    '...kbbbbbbbbbbbbbbbbbbbbk...',
    '..kkbbbbbbbbbbbbbbbbbbbbkk..',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBByyyyBBBBBBBBBBk.',
    'kbbbbbbbbbbbyyyybbbbbbbbbbbk',
    'kbbbbbbbbbbbyYYybbbbbbbbbbbk',
    'kBBBBBBBBBBByYYyBBBBBBBBBBBk',
    'kBBBBBBBBBBByyyyBBBBBBBBBBBk',
    'kBBBBBBBBBBByyyyBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kbbbbbbbbbbbbbbbbbbbbbbbbbbk',
    'kbbbbbbbbbbbbbbbbbbbbbbbbbbk',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkk.'
  ];

  const CHEST_OPEN = [
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '.kBBBBBBBBBBBBBBBBBBBBBBBBk.',
    '..kbbbbbbbbbbbbbbbbbbbbbbk..',
    '..kbbbbbbbbbbbbbbbbbbbbbbk..',
    '...kkkkkkkkkkkkkkkkkkkkkk...',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkk.',
    'kYYYYYYYYYYWWWWWWYYYYYYYYYYk',
    'kYYYYYYYYYYWWWWWWYYYYYYYYYYk',
    'kYYYYYYYYYYWWWWWWYYYYYYYYYYk',
    'kYYYYYYYYYYYYYYYYYYYYYYYYYYk',
    '.kyyyyyyyyyyyyyyyyyyyyyyyyk.',
    '.kyyyyyyyyyyyyyyyyyyyyyyyyk.',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kBBBBBBBBBBBBBBBBBBBBBBBBBBk',
    'kbbbbbbbbbbbbbbbbbbbbbbbbbbk',
    'kbbbbbbbbbbbbbbbbbbbbbbbbbbk',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkk.'
  ];

  const CHEST_TIERS = {
    wood:   null,                                   // palette as authored
    iron:   { b: '#6f6a90', B: '#9b96b8', y: '#4fb3e0', Y: '#a8e4ff' },
    cursed: { b: '#3c2154', B: '#7f45b8', y: '#c86ee0', Y: '#a8e4ff' },
    // Only ever placed by hand, behind a boss - so it looks like the prize.
    vault:  { b: '#8a7440', B: '#f2c14e', y: '#fff0a8', Y: '#ffffff' }
  };

  // ---- weapon icons (12 x 12) ----------------------------------------------

  /* Weapon models. Every archetype is now a distinct silhouette rather than a
     recoloured stick: a fullered blade, a crossguarded dagger, a bearded axe, a
     leaf-bladed spear, a recurve bow, and a gem-headed stave.

     Palette keys that the rarity re-tint replaces:
       W  blade highlight   w  blade body    G  metal fittings
       y  guard / pommel    b  grip wrap     n  grip shadow            */
  const ICON_SWORD = [
    '........................',
    '........................',
    '....................WW..',
    '...................WWww.',
    '..................WWww..',
    '.................WWww...',
    '................WWww....',
    '...............WWww.....',
    '..............WWww......',
    '.............WWww.......',
    '............WWww........',
    '...........WWww.........',
    '..........WWww..........',
    '.........WWww...........',
    '........WWww............',
    '...GyyyyyyyyyG..........',
    '...GyyyyyyyyyG..........',
    '......bnb...............',
    '......bnb...............',
    '......bnb...............',
    '......bnb...............',
    '......bnb...............',
    '.....GyyyG..............',
    '.....GGGGG..............'
  ];

  const ICON_DAGGER = [
    '........................',
    '........................',
    '........................',
    '........................',
    '..................WW....',
    '.................WWww...',
    '................WWww....',
    '...............WWww.....',
    '..............WWww......',
    '.............WWww.......',
    '............WWww........',
    '...........WWww.........',
    '..........WWww..........',
    '......yyyyyyw...........',
    '......yyyyyy............',
    '.......bnb..............',
    '.......bnb..............',
    '.......bnb..............',
    '.......bnb..............',
    '......GGGGG.............',
    '......GGGGG.............',
    '........................',
    '........................',
    '........................'
  ];

  const ICON_AXE = [
    '........................',
    '........................',
    '...........bbb..........',
    '...........bnb..........',
    '...........bnb..........',
    '........WwGGGGGwwW......',
    '......WWwwGyyyGwwwWW....',
    '....WWwwwwwyyywwwwwwWW..',
    '...WWwwwwwwyyywwwwwwwWW.',
    '...WWwwwwwwyyywwwwwwwWW.',
    '....WWwwwwwyyywwwwwwWW..',
    '......WWwwGGGGGwwwWW....',
    '........WwGGGGGwwW......',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '..........GGGGG.........',
    '..........GGGGG.........',
    '........................'
  ];

  const ICON_BOW = [
    '........................',
    '.............G..........',
    '.............Wb.........',
    '.............Wbb........',
    '.............W.bb.......',
    '.............W.bb.......',
    '.............W..bb......',
    '.............W..bb......',
    '.............W..bb......',
    '.............W..bb......',
    '.............W.nyn......',
    '.............W.nnn......',
    '.............W.nnn......',
    '.............W.nyn......',
    '.............W..bb......',
    '.............W..bb......',
    '.............W..bb......',
    '.............W.bb.......',
    '.............W.bb.......',
    '.............Wbb........',
    '.............Wbb........',
    '.............Wb.........',
    '.............G..........',
    '........................'
  ];

  const ICON_STAFF = [
    '........................',
    '........................',
    '..........wwwww.........',
    '.........wWWWWWw........',
    '.........wWWWWWw........',
    '........wWWWWWWWw.......',
    '........wWWWWWWWw.......',
    '........wWWWWWWWw.......',
    '.........yyyyyyy........',
    '.........yyyyyyy........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '..........GGGGG.........',
    '..........GGGGG.........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........',
    '...........bnb..........'
  ];

  const ICON_SPEAR = [
    '........................',
    '.......................w',
    '......................w.',
    '.....................wW.',
    '....................wW..',
    '...................wW...',
    '..................wW....',
    '.................wW.....',
    '................wWnb....',
    '...............wWnb.....',
    '...............bnb......',
    '..............bnb.......',
    '............yyyy........',
    '...........Gyyyy........',
    '...........bnb..........',
    '..........bnb...........',
    '.........bnb............',
    '........bnb.............',
    '.......bnb..............',
    '......bnb...............',
    '.....bnb................',
    '....bnb.................',
    '..GGGG..................',
    '..GGGG..................'
  ];

  /* Rarity is visible on the weapon itself, not only on the frame around it:
     the metal changes, and legendaries get a hot core. */
  /* Skill icons, 12x12, one per weapon skill and ultimate. The HUD used to
     print the skill's name in 3px type, which at 320x180 was a smear — an icon
     that matches the name reads instantly at any size. */
  const SKILL_ICONS = {
    // BLADE DASH — blade thrown forward with speed lines behind it.
    swordSkill: [
      '..........Wk',
      '.........WWk',
      '.w......WWk.',
      '..w....WWk..',
      '...w..WWk...',
      '.ww..WWk....',
      '....WWk.....',
      '..wWWk......',
      '..yWk.......',
      '.yyk........',
      'kyk.........',
      'kk..........'
    ],
    // TEMPEST BLADE — blade at the centre of a whirl.
    swordUlt: [
      '...WW..W....',
      '..W..WW.W...',
      '.W...Wk..W..',
      'W...WWk...W.',
      'W..WWk....W.',
      'W.WWk.....W.',
      '.WWk.....W..',
      'WWk.....W...',
      'Wk...WWW....',
      'yk..W.......',
      'yk.W........',
      'kk..........'
    ],
    // SHADOW FLURRY — three staggered daggers.
    daggerSkill: [
      '.......Wk...',
      '......Wk....',
      '...Wk.yk....',
      '..Wk..k.....',
      '..yk........',
      '.....Wk.....',
      '....Wk......',
      '....yk......',
      '.Wk.k.......',
      'Wk..........',
      'yk..........',
      'k...........'
    ],
    // ASSASSINATE — dagger driven through a mark.
    daggerUlt: [
      '.....Wk.....',
      '.....Wk.....',
      '.RR..Wk..RR.',
      'R..R.Wk.R..R',
      'R..R.yk.R..R',
      '.RR..k..RR..',
      '.....k......',
      '..RRRkRRR...',
      '.R...k...R..',
      '.R.......R..',
      '..R.....R...',
      '...RRRRR....'
    ],
    // EARTHSHATTER — axe head over a split ground line.
    greataxeSkill: [
      '..WWWW......',
      '.WWWWWW.....',
      'WWWkkWWW....',
      'WWk..kWW....',
      '.Wk...yk....',
      '..k...yk....',
      '......yk....',
      '......yk....',
      '....kkkkkk..',
      '..kk......kk',
      '.k..........',
      'k...........'
    ],
    // RAGNAROK — axe wreathed in flame.
    greataxeUlt: [
      '.y..WWWW..y.',
      'yY.WWWWWW.Yy',
      'yYWWWkkWWWYy',
      'oYWWk..kWWYo',
      'oy.Wk...yk.y',
      'o...k...yk..',
      'o.......yk.o',
      'oy......yk.o',
      'yY......yk.Y',
      '.y.....kkk.y',
      '..o...o..o..',
      '...oooo.....'
    ],
    // PIERCING LUNGE — spearhead with a long shaft and thrust lines.
    spearSkill: [
      '.........W..',
      '........WWk.',
      '.......WWWk.',
      '......WWWk..',
      '.wwwwyyk....',
      '.....yk.....',
      '.wwwyk......',
      '....yk......',
      '.wwyk.......',
      '..yk........',
      '.yk.........',
      'kk..........'
    ],
    // DRAGON CHARGE — spear behind a horned dragon head.
    spearUlt: [
      '.......R..R.',
      '........RR..',
      '......RRRRR.',
      '.....RrrrrRk',
      '....RrWrrRk.',
      '..yyRrrrrRk.',
      '.yk..RRRRk..',
      'yk....RRk...',
      'k...RRk.....',
      '...Rk.......',
      '..Rk........',
      '.kk.........'
    ],
    // ARROW RAIN — three arrows falling.
    bowSkill: [
      'k..k....k...',
      'k..k....k...',
      'Wk.Wk...Wk..',
      'Wk.Wk...Wk..',
      'Wk.Wk...Wk..',
      'Wk.Wk...Wk..',
      '.k..Wk..Wk..',
      '....Wk..Wk..',
      'yk..yk..yk..',
      '.k...k...k..',
      '............',
      'kkkkkkkkkkkk'
    ],
    // STORM OF ARROWS — a cloud of arrows above a struck ground.
    bowUlt: [
      'k.k..k..k.k.',
      'Wk.Wk.Wk.Wk.',
      'Wk.Wk.Wk.Wk.',
      '.Wk.Wk.Wk.Wk',
      '.Wk.Wk.Wk.Wk',
      '..Wk.Wk.Wk..',
      '..Wk.Wk.Wk..',
      '..yk.yk.yk..',
      '...k..k..k..',
      '............',
      '.kk.kkk.kk..',
      'k..k...k..k.'
    ],
    // ELEMENTAL NOVA — a burst radiating from a core.
    staffSkill: [
      '.....S......',
      '..s..S..s...',
      '...s.S.s....',
      '....sSs.....',
      'SSssSWSssSSS',
      '....sSs.....',
      '...s.S.s....',
      '..s..S..s...',
      '.....S......',
      '............',
      '....yyy.....',
      '.....y......'
    ],
    // ELEMENTAL STORM — a spiral throwing bolts.
    staffUlt: [
      '..SSSSSS....',
      '.S......S...',
      'S..ssss..S..',
      'S.s....s.S..',
      'S.s.WW.s.S..',
      'S.s....s.S..',
      '.S..ssss.S..',
      '..S.....S...',
      '...SSSSS....',
      '..y..y..y...',
      '.y..y..y....',
      'y..y..y.....'
    ]
  };

  const RARITY_SKINS = [
    { W: '#e8e6f0', w: '#9b96b8', G: '#6f6a90', y: '#9b96b8', b: '#5c3f2a', n: '#2e2018' },
    { W: '#d8ffd0', w: '#5cbf62', G: '#2f7d4f', y: '#a3e86b', b: '#5c3f2a', n: '#2e2018' },
    { W: '#a8e4ff', w: '#4fb3e0', G: '#2f6fa8', y: '#a8e4ff', b: '#16324f', n: '#0d1e2e' },
    { W: '#f0d0ff', w: '#c86ee0', G: '#7f45b8', y: '#c86ee0', b: '#3c2154', n: '#1e0f2a' },
    { W: '#fff0a8', w: '#f2c14e', G: '#e8743b', y: '#fff0a8', b: '#6e1b28', n: '#2e0a10' }
  ];

  /* Pickups and projectiles are authored at 2x detail: the art grid doubles
     while the logical footprint stays exactly what the pickup radii and the
     projectile hit boxes already assume. */
  const PICKUP_D = 2;

  // ---- pickups & projectiles ----------------------------------------------

  const COIN = [
    '...yyyyyy...',
    '..yYYYYYYy..',
    '.yYYYYYYYYy.',
    'yYYYYYYYYYYy',
    'yYYyyyyyyYYy',
    'yYyy....yyYy',
    'yYyy....yyYy',
    'yYYyyyyyyYYy',
    'yYYYYYYYYYYy',
    '.yYYYYYYYYy.',
    '..yYYYYYYy..',
    '...yyyyyy...'
  ];

  const HEART = [
    '..RRR..RRR......',
    '.RrrrRRrrrR.....',
    'RrrrrrrrrrrR....',
    'RrWrrrrrrrrR....',
    'RrWrrrrrrrrR....',
    'RrrrrrrrrrrR....',
    '.RrrrrrrrrR.....',
    '.RrrrrrrrrR.....',
    '..RrrrrrrR......',
    '...RrrrrR.......',
    '....RrrR........',
    '.....RR.........',
    '................',
    '................'
  ];

  const SHARD = [
    '......SS......',
    '.....SSSS.....',
    '....SSsSSS....',
    '...SSsSSsSS...',
    '..SSsSSSSsSS..',
    '.SSsSSWWSSsSS.',
    'SSsSSSWWSSSsSS',
    'SSsSSSWWSSSsSS',
    '.SSsSSWWSSsSS.',
    '..SSsSSSSsSS..',
    '...SSsSSsSS...',
    '....SSsSSS....',
    '.....SSSS.....',
    '......SS......',
    '..............',
    '..............'
  ];

  const KEY = [
    '..yyyyyy........',
    '.yyYYYYyy.......',
    'yyY....Yyy......',
    'yY......Yy......',
    'yY......Yy......',
    'yyY....Yyy......',
    '.yyYYYYyy.......',
    '..yyyyyy........',
    '....yy..........',
    '....yy..........',
    '....yyyyy.......',
    '....yy..........',
    '....yyyy........',
    '....yy..........',
    '....yyy.........',
    '................'
  ];

  const ARROW = [
    '..............w...',
    '.............ww...',
    'nnnnnnnnnnnnnnWWw.',
    'nnnnnnnnnnnnnnWWw.',
    '.............ww...',
    '..............w...'
  ];

  const ORB = [
    '......yyyy......',
    '....yyYYYYyy....',
    '...yYYYYYYYYy...',
    '..yYYYYYYYYYYy..',
    '.oyYYYYWWYYYYyo.',
    'oyYYYYWWWWYYYYyo',
    'oyYYYWWWWWWYYYyo',
    'oyYYYWWWWWWYYYyo',
    'oyYYYYWWWWYYYYyo',
    '.oyYYYYWWYYYYyo.',
    '..oyYYYYYYYYyo..',
    '...oyyYYYYyyo...',
    '....ooyyyyoo....',
    '.....oooooo.....',
    '......oooo......',
    '................'
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
    '........................',
    'WWWWWW..................',
    '.....WWW................',
    'WWWWWWW.WW..............',
    '..w...WWWWW.............',
    'wwwwwww.WW.W............',
    'wwwww.wwwWWWW...........',
    'w...www.wwWWWW..........',
    '......ww.w.W.W..........',
    '........w.wWWWW.........',
    '........ww..W.W.........',
    '............W...........',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................'
  ];

  // ---- bake ----------------------------------------------------------------

  const S = {};

  S.hero = {
    idle: [A.makeSprite(HERO_IDLE_0, null, HERO_D),
           A.makeSprite(HERO_IDLE_1, null, HERO_D)],
    run:  [A.makeSprite(HERO_RUN_0, null, HERO_D),
           A.makeSprite(HERO_RUN_1, null, HERO_D),
           A.makeSprite(HERO_RUN_2, null, HERO_D),
           A.makeSprite(HERO_RUN_1, null, HERO_D)],
    jump: A.makeSprite(HERO_JUMP, null, HERO_D),
    fall: A.makeSprite(HERO_FALL, null, HERO_D)
  };

  // The shopkeeper is the hero silhouette in robed colours.
  const MERCHANT_PAL = { C: '#7f45b8', c: '#3c2154', N: '#f2c14e', b: '#c86ee0' };
  S.merchant = [
    A.makeSprite(HERO_IDLE_0, MERCHANT_PAL, HERO_D),
    A.makeSprite(HERO_IDLE_1, MERCHANT_PAL, HERO_D)
  ];

  S.slime = [A.makeSprite(SLIME_0, null, ENEMY_D),
             A.makeSprite(SLIME_1, null, ENEMY_D),
             A.makeSprite(SLIME_HURT, null, ENEMY_D)];
  S.zombie = [A.makeSprite(ZOMBIE_0, null, ENEMY_D),
              A.makeSprite(ZOMBIE_1, null, ENEMY_D),
              A.makeSprite(ZOMBIE_HURT, null, ENEMY_D)];
  S.bat = [A.makeSprite(BAT_0, null, ENEMY_D),
           A.makeSprite(BAT_1, null, ENEMY_D),
           A.makeSprite(BAT_HURT, null, ENEMY_D)];
  S.skeleton = [A.makeSprite(SKELETON_0, null, ENEMY_D),
                A.makeSprite(SKELETON_1, null, ENEMY_D),
                A.makeSprite(SKELETON_HURT, null, ENEMY_D)];

  /* Tier packs. Elite, miniboss and colossal are the same bodies through a
     different palette (and, for the bigger two, an integer upscale) -- so they
     are built from one table rather than three near-identical literals. Adding
     a frame to BASE_ROWS gives every tier that frame automatically.

     Frame order is load bearing: 0 and 1 are the animation pair the draw code
     indexes into, 2 is the hurt face. */
  const BASE_ROWS = {
    slime:    [SLIME_0, SLIME_1, SLIME_HURT],
    zombie:   [ZOMBIE_0, ZOMBIE_1, ZOMBIE_HURT],
    bat:      [BAT_0, BAT_1, BAT_HURT],
    skeleton: [SKELETON_0, SKELETON_1, SKELETON_HURT]
  };

  // Elites are the same body tinted hot orange.
  const ELITE_PAL = { l: '#e8743b', L: '#f2c14e', e: '#8a3b2a', d: '#8a3b2a' };

  /* Key-carrying mini-bosses are double-size versions of an ordinary enemy in
     a bloodier palette, so they read as "same creature, much worse" at a
     glance without needing their own art. */
  const MINI_PAL = {
    l: '#c0303c', L: '#e8743b', e: '#6e1b28', d: '#6e1b28',
    w: '#e8743b', W: '#fff0a8', K: '#6e1b28', C: '#c0303c', c: '#6e1b28'
  };

  /* Colossal spawns: the same body at 3x in a bruised, near-black palette so a
     glance tells you this one is not an ordinary elite. */
  const COLOSSAL_PAL = {
    l: '#4a2b6b', L: '#7f45b8', e: '#1e0f2a', d: '#1e0f2a',
    w: '#7f45b8', W: '#c86ee0', K: '#1e0f2a', C: '#4a2b6b', c: '#1e0f2a'
  };

  function tierPack(pal, scale) {
    const out = {};
    for (const kind in BASE_ROWS) {
      if (!Object.prototype.hasOwnProperty.call(BASE_ROWS, kind)) continue;
      out[kind] = BASE_ROWS[kind].map(function (rows) {
        const spr = A.makeSprite(rows, pal, ENEMY_D);
        return scale ? A.scaled(spr, scale) : spr;
      });
    }
    return out;
  }

  S.elite = tierPack(ELITE_PAL, 0);
  S.mini = tierPack(MINI_PAL, 2);
  S.colossal = tierPack(COLOSSAL_PAL, 3);

  /* The Slime King has his own hand-authored 64x48 sheet (art/king.js), six
     poses deep. The art is far wider than the 24x18 collision box on purpose —
     the boss renderer centres it and lands the baseline on the box floor, the
     same trick the hero uses. S.boss keeps its two-frame idle shape so nothing
     that indexed it before has to change; S.bossPose carries the rest. */
  const KR = DS.KingRows;
  const KING_D = KR.detail || 1;
  S.boss = [A.makeSprite(KR.idle0, null, KING_D), A.makeSprite(KR.idle1, null, KING_D)];
  S.bossPose = {
    idle: S.boss,
    rear: A.makeSprite(KR.rear, null, KING_D),
    slam: A.makeSprite(KR.slam, null, KING_D),
    hurt: A.makeSprite(KR.hurt, null, KING_D),
    death: A.makeSprite(KR.death, null, KING_D)
  };
  S.crown = A.makeSprite(CROWN, null, ENEMY_D);

  S.tileDetail = TILE_D;
  S.tile = {
    wall: A.makeSprite(WALL, null, TILE_D),
    floor: A.makeSprite(FLOOR, null, TILE_D),
    platform: A.makeSprite(PLATFORM, null, TILE_D),
    spike: A.makeSprite(SPIKE, null, TILE_D),
    door: A.makeSprite(buildDoor('arch'), null, TILE_D),
    doorStyles: DOOR_STYLES.reduce(function (out, style) {
      out[style] = A.makeSprite(buildDoor(style), null, TILE_D);
      return out;
    }, {}),
    torch: A.makeSprite(TORCH_FLAMES[0].concat(TORCH_BODY), null, TILE_D),
    torchFrames: TORCH_FLAMES.map(function (flame) {
      return A.makeSprite(flame.concat(TORCH_BODY), null, TILE_D);
    }),
    deathspike: A.makeSprite(DEATH_SPIKE, null, TILE_D),
    table: A.makeSprite(ENCHANT_TABLE, null, PROP_D)
  };

  S.chest = {};
  for (const tier in CHEST_TIERS) {
    if (!Object.prototype.hasOwnProperty.call(CHEST_TIERS, tier)) continue;
    S.chest[tier] = {
      closed: A.makeSprite(CHEST_CLOSED, CHEST_TIERS[tier], PROP_D),
      open: A.makeSprite(CHEST_OPEN, CHEST_TIERS[tier], PROP_D)
    };
  }

  /* Weapon icons are authored at 2x detail: 24x24 art over the same 12x12
     logical footprint the swing arithmetic already assumes. */
  const ICON_D = 2;

  const ICON_ROWS = {
    sword: ICON_SWORD, dagger: ICON_DAGGER, greataxe: ICON_AXE,
    bow: ICON_BOW, staff: ICON_STAFF, spear: ICON_SPEAR
  };

  // Baked per rarity so the weapon in your hand looks as good as it rolls.
  S.iconByRarity = {};
  for (const key in ICON_ROWS) {
    if (!Object.prototype.hasOwnProperty.call(ICON_ROWS, key)) continue;
    S.iconByRarity[key] = RARITY_SKINS.map(function (skin) {
      return A.makeSprite(ICON_ROWS[key], skin, ICON_D);
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

  const ARMOR_ROWS = { head: ICON_HELM, chest: ICON_CHEST, legs: ICON_LEGS };

  /* Baked on first use, not at load: armor.js defines the material palette and
     is loaded after this file, so the table does not exist yet at bake time. */
  const armorCache = {};

  // Halfway between the material's mid and dark tone — the seam and rivet
  // colour, which is what stops the icons reading as one flat fill.
  function shade(mid, dark) {
    const a = parseInt(mid.slice(1), 16), b = parseInt(dark.slice(1), 16);
    const mix = function (sh) {
      const v = Math.round((((a >> sh) & 255) + ((b >> sh) & 255)) / 2);
      return ('0' + v.toString(16)).slice(-2);
    };
    return '#' + mix(16) + mix(8) + mix(0);
  }

  S.armorIcon = function (slot, material) {
    const rows = ARMOR_ROWS[slot];
    if (!rows) return null;
    const mat = DS.Armor && DS.Armor.MATERIALS[material];
    if (!mat) return null;
    const key = slot + ':' + material;
    if (!armorCache[key]) {
      armorCache[key] = A.makeSprite(rows, {
        D: mat.mid, d: mat.dark, G: mat.light, x: shade(mat.mid, mat.dark)
      }, PROP_D);
    }
    return armorCache[key];
  };

  /* One lookup for any item, weapon or armour. Call sites used to branch on
     kind and half of them forgot armour entirely, which is why armour showed
     up as a blank space in the bag and as a plain square on the floor. */
  S.itemIcon = function (item) {
    if (!item) return null;
    if (item.kind === 'armor') return S.armorIcon(item.slot, item.material);
    return S.iconFor(item.type, item.rarity);
  };

  S.shrine = A.makeSprite(SHRINE, null, PROP_D);

  // Skill icons, keyed 'sword:skill' / 'sword:ult'.
  S.skillIcon = (function () {
    const out = {};
    const types = ['sword', 'dagger', 'greataxe', 'spear', 'bow', 'staff'];
    types.forEach(function (type) {
      out[type + ':skill'] = A.makeSprite(SKILL_ICONS[type + 'Skill']);
      out[type + ':ult'] = A.makeSprite(SKILL_ICONS[type + 'Ult']);
    });
    return function (type, which) {
      return out[type + ':' + which] || out['sword:' + which];
    };
  })();

  S.coin  = A.makeSprite(COIN, null, PICKUP_D);
  S.heart = A.makeSprite(HEART, null, PICKUP_D);
  S.shard = A.makeSprite(SHARD, null, PICKUP_D);
  S.key   = A.makeSprite(KEY, null, PICKUP_D);
  S.arrow = A.makeSprite(ARROW, null, PICKUP_D);
  S.slash = A.makeSprite(SLASH, null, PROP_D);

  S.orb = {};
  for (const tint in ORB_TINTS) {
    if (!Object.prototype.hasOwnProperty.call(ORB_TINTS, tint)) continue;
    S.orb[tint] = A.makeSprite(ORB, ORB_TINTS[tint], PICKUP_D);
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
    colossal: mirror(S.colossal),
    boss: mirror(S.boss),
    bossPose: mirror(S.bossPose),
    arrow: mirror(S.arrow),
    slash: mirror(S.slash)
  };

  // Hero rows, so the paper doll can re-bake the character in armour.
  S.heroDetail = HERO_D;
  S.heroRows = {
    idle: [HERO_IDLE_0, HERO_IDLE_1],
    run: [HERO_RUN_0, HERO_RUN_1, HERO_RUN_2, HERO_RUN_1],
    attack: [HERO_IDLE_0, HERO_IDLE_0, HERO_IDLE_0],
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
    DEATH_SPIKE: DEATH_SPIKE,
    SLIME_0: SLIME_0, SLIME_1: SLIME_1,
    ENEMY_D: ENEMY_D
  };

  DS.SPR = S;
})(window.DS);
