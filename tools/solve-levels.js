/* Level QA solver - the command line over tools/lib/levelcheck.js.

   Builds floors through the REAL generator (no mocks of the terrain code), then
   asks the two things a level must answer:

     can the hero walk from the spawn to the exit door with nothing but the
     moves the physics actually gives them?
     does it look built - no repair floating in the air, no rope tied to
     nothing, no ladder missing its bottom half, no one-tile pillar walling off
     a corridor?

   Every floor kind the game can load is built: each depth 1..FINAL_DEPTH as
   the scene would load it (the act bosses included), plus the safe room in
   front of every boss and the trial on the depths that can roll one.

   Usage:
     node tools/solve-levels.js [seeds]                     summarise every depth
     node tools/solve-levels.js --seed 1262 --depth 2        one level, drawn
     node tools/solve-levels.js --seed 1262 --depth 2 --kind trial
     node tools/solve-levels.js [seeds] --no-reach           judge the raw terrain
*/

const levelcheck = require('./lib/levelcheck');

const lc = levelcheck.open();
const DS = lc.DS;
const T = lc.T;

/* --no-reach builds with the reach pass disabled, so a level's own terrain can
   be judged separately from what the guarantee did to it. */
const NO_REACH = process.argv.includes('--no-reach');
const reachModule = DS.Reach;

function buildLevel(seed, depth, kind) {
  if (NO_REACH) DS.Reach = null;
  const level = lc.buildLevel(seed, depth, kind);
  DS.Reach = reachModule;
  return level;
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

/* The floors a run can meet at a depth: the one the stairs lead to, the safe
   room in front of a boss, and the trial ambush on the depths that allow it. */
function kindsAt(depth, seedIndex) {
  const kinds = [lc.kindForDepth(depth)];
  const safeBefore = DS.Acts && DS.Acts.isSafeBefore ? DS.Acts.isSafeBefore(depth)
    : (DS.C.SAFE_BEFORE || []).indexOf(depth) >= 0;
  if (safeBefore && seedIndex % 4 === 0) kinds.push('safe');
  if (depth >= 3 && kinds[0] !== 'boss' && seedIndex % 4 === 1) kinds.push('trial');
  return kinds;
}

function report(level, seed, depth) {
  const c = lc.check(level);
  const sp = level.spawns.player;
  const reach = c.reach && c.reach.ok ? c.reach : { seen: new Set() };
  console.log('\n--- depth ' + depth + ' seed ' + seed +
              '  kind ' + level.kind + '  flavor ' + (level.flavor || level.kind) +
              '  size ' + level.map.w + 'x' + level.map.h +
              '  spawn tile(' + Math.floor(sp.x / T) + ',' + Math.floor(sp.y / T) + ')' +
              '  door x' + c.doorTx + '  reached x' + (c.reach && c.reach.ok ? c.reach.maxX : 'n/a') + ' ---');
  const gen = Object.assign({}, level.reach || {});
  delete gen.trace;
  console.log('    generator says ' + JSON.stringify(gen));
  console.log('    support ' + JSON.stringify(level.support || null) +
              '  anchor ' + JSON.stringify(level.anchor || null));
  const a = c.audit;
  console.log('    audit: floating ' + JSON.stringify(a.floatingRungs) +
              '\n           orphan ropes ' + JSON.stringify(a.orphanRopes) +
              '\n           half ladders ' + JSON.stringify(a.halfLadders) +
              '\n           pillars ' + JSON.stringify(a.pillarsInCorridor));
  if (c.reach && c.reach.ok && c.doorTx != null && c.reach.maxX < c.doorTx) {
    console.log('    STUCK: the frontier is at ' + c.reach.front.join(',') +
                ', ' + (c.doorTx - c.reach.maxX) + ' columns short of the door');
  }
  console.log(lc.dump(level.map, reach, sp));
}

const METRICS = ['floatingRungs', 'orphanRopes', 'halfLadders', 'pillarsInCorridor'];
const METRIC_LIMIT = 1;        // average per floor, for each metric

function main() {
  const seedArg = argValue('--seed');
  if (seedArg != null) {
    const depth = Number(argValue('--depth')) || 1;
    const kind = argValue('--kind') || undefined;
    report(buildLevel(Number(seedArg), depth, kind), Number(seedArg), depth);
    return;
  }

  const seeds = Number(process.argv[2]) || 40;
  const last = lc.finalDepth();
  const t0 = Date.now();
  let floors = 0, unreachable = 0, genFails = 0, genMs = 0;
  let repairs = 0, rungs = 0, ropes = 0, genPockets = 0, genStuck = 0;
  let pocketFloors = 0, pocketCells = 0, trapFloors = 0, drowned = 0;
  const audit = {};
  METRICS.forEach(function (m) { audit[m] = 0; });
  const byKind = {};
  let firstFail = null, pocketExample = null, auditExample = null;

  for (let depth = 1; depth <= last; depth++) {
    let fails = 0, pFloors = 0, marks = 0;
    const seen = {};
    for (let s = 0; s < seeds; s++) {
      const seed = 1000 + s * 7 + depth * 131;
      const kinds = kindsAt(depth, s);
      for (let k = 0; k < kinds.length; k++) {
        const b0 = Date.now();
        const level = buildLevel(seed, depth, kinds[k]);
        genMs += Date.now() - b0;
        const c = lc.check(level);
        floors++;
        const label = level.kind === 'normal' ? (level.flavor || 'normal') : level.kind;
        seen[label] = (seen[label] || 0) + 1;
        byKind[label] = (byKind[label] || 0) + 1;

        if (level.reach) {
          if (!level.reach.ok) genFails++;
          repairs += level.reach.repairs || 0;
          rungs += level.reach.rungs || 0;
          ropes += level.reach.ropes || 0;
          genPockets += level.reach.pockets || 0;
          genStuck += level.reach.stuck || 0;
        }
        if (c.pockets.length) {
          pFloors++; pocketFloors++; pocketCells += c.pockets.length;
          if (!pocketExample) pocketExample = { seed: seed, depth: depth, kind: kinds[k], cells: c.pockets };
        }
        if (c.traps.length) trapFloors++;
        drowned += lc.drownedSpikes(level.map);
        let bad = 0;
        METRICS.forEach(function (m) { audit[m] += c.audit[m].length; bad += c.audit[m].length; });
        marks += bad;
        if (bad && !auditExample) auditExample = { seed: seed, depth: depth, kind: kinds[k] };
        if (!c.ok) {
          fails++; unreachable++;
          if (!firstFail) firstFail = { seed: seed, depth: depth, kind: kinds[k] };
        }
      }
    }
    console.log('depth ' + String(depth).padStart(2) + '  ' +
                Object.keys(seen).map(function (k) { return k + ' ' + seen[k]; }).join(', ').padEnd(30) +
                '  UNREACHABLE EXIT: ' + fails +
                '  pocket floors: ' + pFloors + '  audit marks: ' + marks);
  }

  const per = function (n) { return (n / floors).toFixed(2); };
  console.log('\nTOTAL floors with an unreachable exit: ' + unreachable + ' / ' + floors +
              '  (' + Object.keys(byKind).map(function (k) { return k + ' ' + byKind[k]; }).join(', ') + ')' +
              '\nTOTAL pockets (can get in, cannot get out): ' + pocketCells + ' cells on ' + pocketFloors + ' floors' +
              '\n  the generator gave up on ' + genFails + ' floors; per floor it made ' + per(repairs) +
              ' exit repairs, added ' + per(rungs) + ' repair platform tiles and ' + per(ropes) + ' repair ropes,' +
              '\n  repaired ' + per(genPockets) + ' pockets, and reported ' + genStuck + ' it could not repair' +
              '\n  ' + trapFloors + ' floors have a column you could fall into and never leave; ' +
              drowned + ' killing floors sit against water' +
              '\nSANITY (average per floor, gate > ' + METRIC_LIMIT + '):' +
              METRICS.map(function (m) { return '\n  ' + m.padEnd(18) + per(audit[m]) + '  (' + audit[m] + ' total)'; }).join('') +
              '\n  (' + ((Date.now() - t0) / floors).toFixed(0) + ' ms per floor, ' +
              (genMs / floors).toFixed(0) + ' of them inside the generator)');

  /* The gates. An unreachable exit is the failure this tool exists for; a
     sanity metric averaging more than one per floor means the generator is
     shipping scaffolding again. Pockets are gated loosely, scaled to the run. */
  const pocketBudget = Math.max(20, Math.round(floors / 15));
  let failed = false;
  if (pocketCells > pocketBudget && pocketExample) {
    console.log('\nPOCKETS LEFT -- the first one, depth ' + pocketExample.depth +
                ' seed ' + pocketExample.seed + ' ' + pocketExample.kind + ': ' +
                pocketExample.cells.slice(0, 8).join(' | '));
    failed = true;
  }
  METRICS.forEach(function (m) {
    if (audit[m] / floors > METRIC_LIMIT) {
      console.log('\nSANITY GATE: ' + m + ' averages ' + per(audit[m]) + ' per floor');
      failed = true;
    }
  });
  if (unreachable > 0) {
    console.log('\nUNREACHABLE EXITS: ' + unreachable + ' -- that is the failure this gate exists for.');
    failed = true;
  }
  if (failed) process.exitCode = 1;

  const show = firstFail || auditExample;
  if (show) {
    report(buildLevel(show.seed, show.depth, show.kind), show.seed, show.depth);
  } else {
    console.log('\nNo failures to draw.');
  }
}

main();
