/* The signature of each Act III monster (enemies6.js): the one thing it does that
   the monsters before it do not, checked on a flat room with a stand-in hero that
   counts the wounds it is given. The generic "fights at every rank without throwing"
   sweep is in bestiary.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorld, world } = require('./_bestiary-world');

const FLOOR = 12;

/* Every scenario is played from three seeds: the monsters roll their pauses from DS.rand, and
   a behaviour that only shows on a lucky roll is not a behaviour. */
const SEEDS = [1, 2, 3];

function spawn(kind, tier, seed) {
  const DS = loadWorld();
  const T = DS.C.TILE;
  DS.rand = DS.makeRng(seed || 1);
  const w = world(DS, 24);
  const e = DS.Enemies.create(w.g, 10 * T, (FLOOR - 1) * T, kind, tier || 'normal');
  w.DS = DS; w.T = T; w.e = e; w.x0 = e.x;
  /* The hero stands dx from where the monster began, and stays there: it is the monster that moves. */
  w.hero = function (dx, dy) {
    w.g.player.x = w.x0 + dx;
    w.g.player.y = FLOOR * T - 14 - (dy || 0);
    w.g.player.facing = 1;
  };
  w.run = function (frames, each) {
    for (let f = 0; f < frames && !e.dead; f++) {
      w.g.frames = (w.g.frames || 0) + 1;
      if (each) each(f);
      for (const en of w.g.enemies.slice()) if (!en.dead) DS.Enemies.update(w.g, en);
      DS.Ent.updateProjectiles(w.g);
    }
  };
  return w;
}

test('the hoplite thrusts in a line: a hero under the point is hit, a hero who jumped it is not', () => {
  for (const seed of SEEDS) {
    const still = spawn('hoplite', 'normal', seed);
    still.run(500, () => still.hero(30, 0));
    assert.ok(still.hits.n > 0, 'a hero standing in the line is hit');

    const jumped = spawn('hoplite', 'normal', seed);
    jumped.run(600, () => jumped.hero(30, 14));            // feet above the thrust
    assert.equal(jumped.hits.n, 0, 'a hero above the line is not');
  }
});

test('the hoplite carries its shield up while it walks at you', () => {
  for (const seed of SEEDS) {
    const w = spawn('hoplite', 'normal', seed);
    w.run(40, () => w.hero(70, 0));
    assert.equal(w.e.shieldUp, true);
  }
});

test('the centaur gallops away when you close, and shoots when it has room', () => {
  for (const seed of SEEDS) {
    const close = spawn('centaur', 'normal', seed);
    close.run(60, () => close.hero(-40, 0));               // the hero stands to its left, inside sixty pixels
    assert.ok(close.e.x > close.x0 + 6, 'it backed off to the right (' + (close.e.x - close.x0) + ')');

    const far = spawn('centaur', 'normal', seed);
    let arrows = 0;
    far.run(300, () => { far.hero(-100, 0); arrows = Math.max(arrows, far.g.projectiles.length); });
    assert.ok(arrows > 0, 'it drew and loosed');
  }
});

test('the gorgonite\'s gaze turns the legs to stone, and only within its reach', () => {
  for (const seed of SEEDS) {
    const near = spawn('gorgonite', 'normal', seed);
    near.run(300, () => near.hero(-60, 0));
    assert.ok(near.hits.n > 0, 'the gaze lands on a hero in front of it');
    assert.ok(near.g.player.slowT > 0 && near.g.player.slowMul < 1, 'and the legs are heavy');

    // It sees further than its eyes reach: every gaze that landed did so inside the reach.
    const far = spawn('gorgonite', 'normal', seed);
    let watched = false, worst = 0, seenHits = 0;
    far.run(600, () => {
      far.hero(-110, 0);
      if (far.e.state === 'CHASE') watched = true;
      if (far.hits.n > seenHits) {
        seenHits = far.hits.n;
        worst = Math.max(worst, Math.abs(far.g.player.x + 4 - (far.e.x + far.e.w / 2)));
      }
    });
    assert.ok(watched, 'it noticed the hero');
    assert.ok(worst <= 96 + 8, 'a gaze landed from ' + worst.toFixed(0) + ' px');
  }
});

test('the fury whips along the height it flies, and never touches for damage', () => {
  for (const seed of SEEDS) {
    const w = spawn('fury', 'normal', seed);
    w.run(400, () => w.hero(-60, 0));
    assert.equal(w.DS.Enemies.TYPES.fury.flying, true);
    assert.equal(w.e.touchDamage, 0);
    assert.ok(w.hits.n > 0, 'the whip lands');
  }
});

test('the shade is a smear nothing can hurt until it steps out behind you', () => {
  for (const seed of SEEDS) {
    const w = spawn('shade', 'normal', seed);
    w.run(40, () => w.hero(200, 0));
    assert.equal(w.e.hidden, true, 'hidden while far');
    assert.ok(w.e.invuln > 0, 'and not hittable');

    // The hero faces left with the shade coming from the left: behind the hero is to the right.
    let behind = false, seen = false;
    w.run(400, () => {
      w.hero(30, 0);
      w.g.player.facing = -1;
      if (!w.e.hidden) {
        seen = true;
        if (w.e.x + w.e.w / 2 > w.g.player.x + w.g.player.w / 2) behind = true;
      }
    });
    assert.ok(seen, 'it came out');
    assert.ok(behind, 'behind the hero');
    assert.ok(w.hits.n > 0, 'and struck');
  }
});

test('the automaton heats as it fights: armour while cool, none when hot, and a vent at the top', () => {
  for (const seed of SEEDS) {
    const w = spawn('automaton', 'normal', seed);
    const armour = w.DS.Enemies.TYPES.automaton.armor;
    let hotArmour = null, vented = false, peak = 0;
    w.run(2400, () => {
      w.hero(50, 0);
      peak = Math.max(peak, w.e.heat || 0);
      if ((w.e.heat || 0) >= 70 && !(w.e.venting > 0)) hotArmour = w.e.armor;
      if (w.e.venting > 0) { vented = true; assert.ok(Math.abs(w.e.vx) < 0.01, 'it stands still to vent'); assert.equal(w.e.armor, 0); }
    });
    assert.ok(peak >= 70, 'it got hot (' + peak.toFixed(0) + ')');
    assert.equal(hotArmour, 0, 'hot bronze turns nothing');
    assert.ok(vented, 'and it vents');
    assert.ok(armour > 0);
  }
});

test('the cyclops throws from afar and stamps up close', () => {
  for (const seed of SEEDS) {
    const far = spawn('cyclops', 'normal', seed);
    let thrown = false;
    far.run(400, () => { far.hero(-120, 0); if (far.g.projectiles.length) thrown = true; });
    assert.ok(thrown, 'a boulder in the air');
    assert.ok(far.hits.n > 0 || thrown);

    const close = spawn('cyclops', 'normal', seed);
    close.run(500, () => close.hero(-30, 0));
    assert.ok(close.hits.n > 0, 'the stamp ring reaches a hero at its feet');
  }
});

test('the sun priest\'s light falls where you were: still and you are hit, walking away and you are not', () => {
  for (const seed of SEEDS) {
    const still = spawn('sunpriest', 'normal', seed);
    still.run(500, () => still.hero(-120, 0));
    assert.ok(still.hits.n > 0);

    const walker = spawn('sunpriest', 'normal', seed);
    // Walk clear the moment a prayer is under way: the ring holds after the first half of the wind.
    walker.run(700, () => {
      const lastMoments = walker.e.attackState === 'wind' && walker.e.attackTimer < 10;
      if (lastMoments || walker.e.attackState === 'strike') walker.g.player.x = walker.e.tx + 90;
      else walker.hero(-120, 0);
      walker.g.player.y = FLOOR * walker.T - 14;
    });
    assert.equal(walker.hits.n, 0, 'the column found nobody');
  }
});

test('the satyr leaps: it leaves the ground for a jab and lands again', () => {
  for (const seed of SEEDS) {
    const w = spawn('satyr', 'normal', seed);
    let airborne = false;
    w.run(400, () => { w.hero(-60, 0); if (!w.e.onGround && w.e.vy < 0) airborne = true; });
    assert.ok(airborne, 'it left the floor');
    assert.ok(w.hits.n > 0, 'and the jab found the hero');
  }
});

test('the stone snake\'s bite leaves the legs heavy', () => {
  for (const seed of SEEDS) {
    const w = spawn('stonesnake', 'normal', seed);
    w.run(400, () => w.hero(-24, 0));
    assert.ok(w.hits.n > 0);
    assert.ok(w.g.player.slowT > 0);
  }
});

test('the titan\'s slave swings its chain in a ring around it', () => {
  for (const seed of SEEDS) {
    const w = spawn('titanslave', 'normal', seed);
    w.run(400, () => w.hero(-30, 0));
    assert.ok(w.hits.n > 0);
  }
});

test('a storm spirit rains straight down and is harmless to touch', () => {
  for (const seed of SEEDS) {
    const w = spawn('stormspirit', 'normal', seed);
    assert.equal(w.e.touchDamage, 0);
    let sparks = 0;
    w.run(500, () => { w.hero(0, 0); sparks = Math.max(sparks, w.g.projectiles.length); });
    assert.ok(sparks > 0, 'sparks fall');
  }
});

test('the Cerberus pup bites with three heads, one after another', () => {
  const perAttack = [];
  for (const seed of SEEDS) {
    const w = spawn('cerberuspup', 'normal', seed);
    let cur = null, lastHits = 0, prev = 'none';
    w.run(900, () => {
      w.hero(-12, 0);
      const st = w.e.attackState, n = w.hits.n;
      if (prev === 'none' && st !== 'none') cur = 0;                 // an attack begins
      if (cur !== null) cur += n - lastHits;
      if (st === 'none' && prev !== 'none' && cur !== null) { perAttack.push(cur); cur = null; }
      lastHits = n; prev = st;
    });
  }
  assert.ok(perAttack.length >= 4, perAttack.length + ' attacks measured');
  assert.equal(Math.max.apply(null, perAttack), 3, 'three wounds in one attack: ' + perAttack.join(','));
  assert.ok(perAttack.every((n) => n <= 3), 'never more than the three heads: ' + perAttack.join(','));
});

test('an elite automaton keeps the armour of its rank while it is cool, loses it when hot, and gets it back', () => {
  for (const tier of ['elite', 'miniboss']) {
    const w = spawn('automaton', tier, 1);
    const ranked = w.e.armor;
    assert.ok(ranked > w.DS.Enemies.TYPES.automaton.armor, tier + ' carries more than the kind');
    w.run(40, () => w.hero(50, 0));
    assert.equal(w.e.armor, ranked, tier + ' cool: ' + w.e.armor + ' of ' + ranked);
    let hot = null, back = false, vented = false;
    w.run(3000, () => {
      w.hero(50, 0);
      if (w.e.heat >= 70 && !(w.e.venting > 0)) hot = w.e.armor;
      if (w.e.venting > 0) vented = true;
      if (vented && w.e.heat < 40 && w.e.armor === ranked) back = true;
    });
    assert.equal(hot, 0, tier + ' hot: none');
    assert.ok(back, tier + ' has its rank armour back after the vent');
  }
});
