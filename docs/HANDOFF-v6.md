# v6 Overhaul — Handoff (stopped 2026-09-29)

Full plan: [PLAN-v6.md](PLAN-v6.md) (in Indonesian; phases 0–9). Goal: turn the three.js voxel
side-scroller into a 3D, 2.5D-camera anime action RPG (refs: Elsword, Honkai, Prometheus/Genmu).
Everything stays three.js r128 (vendored), classic-script IIFE modules on `window.DS`, no bundler.

## Branches
- `feat/v6-foundation` — **stable**. Phases 0, 1, 2, 3, 4, 7 done, tested, verified in a browser.
- `wip/phase6` — **unfinished, untested** Phase 6 work (branched from `feat/v6-foundation`).
  Agents were stopped mid-task; treat every file as possibly half-patched.
- `main` — untouched (pre-v6).

## Done (on feat/v6-foundation)
| Commit | Phase | What |
|---|---|---|
| d2df5f5 | 0+1 | `npm test` harness (node:test + vm loader `tests/_load.js`); rarer armour auto-equips |
| 47ca4ca | 1 | Worldgen: designed-tile layer, anchored ladders/ropes, barrier puzzles; `npm run solve` gates floating rungs/orphan ropes (all 0) |
| b65c7e0 | 1 | 3 acts × 10 depths + endless, 6 bosses (Warden, King, Arbiter, Frost Wyrm, Lich, Magma), 4 new enemies, biome spawns |
| 3c9b721 | 2 | `DS.PostFX` (SAO, god rays, bloom, grade, SMAA; F8 low/med/high), shadows, 2.5D camera |
| 4eca87b | 2 | Backlit themed voxel backdrop (`backdrop3d.js`, `heroInfo()`); ui3 batch-per-space fix |
| cf232c8 | 3 | `src/fx3d/` pooled 3D VFX, real combos (`src/systems/combos.js`), element infusion (R/T keys) |
| df05ae9 | 4 | HTML UI foundation: `styles/ui.css` tokens, `src/ui-html/core.js` (`DS.HUI`) |
| 02f41ad | 4+7 | HTML HUD, in-world UI, menus, inventory, shop/shrine/enchant, run summary. Fallback: `DS.HUI_ENABLED=false`, `?huimenus=0` |

Checks at 02f41ad: `npm test` 82/82, `npm run solve 10` 0 unreachable exits, zero console errors.

## Where it stopped: Phase 6 (on `wip/phase6`)
User feedback being addressed:
1. Backdrop should stay still (only parallax); it "blinks" when the player jumps.
   Cause: `renderer3d.js` re-seated the horizon every 8 frames with 0.22 easing; dynamic zoom pumped on vertical speed.
2. Key light should come from the backdrop sun (`DS.Backdrop3D.heroInfo()`), every torch should light its area.
3. Torch flame should be a realistic shader flame, not a light blob.
4. Polish: sun blow-out under bloom, stepped-pyramid far mountains, runtime check of harpy/new enemies/bosses,
   HTML UI leftovers (empty minimap on flat floors, crit numbers over elite names, Warden boss bar before it wakes,
   essence banner style, hero name tag hidden by prompts), ice ground VFX washing the floor white,
   cap `biomeForDepth` endless cache.

Partial files on `wip/phase6`: new `src/core/camfollow.js`, `src/core/flame.js`, `src/core/torchlight.js`,
`tests/camera.test.js`, `tests/lights.test.js`, `tools/qa/{shoot-phase6,check-bestiary,probe-load}.js`;
edits to `renderer3d.js` (a "big renderer patch" was in progress when stopped), `backdrop3d.js`, `postfx.js`,
`game.js` (camera block), `index.html`, `tools/qa/shoot-backdrop.js`.

**Next step:** check out `wip/phase6`, run `node --check` on every touched file and `npm test`, finish the
brief above, verify in a browser, then merge into `feat/v6-foundation`. If it is too broken, restart Phase 6
from `feat/v6-foundation` using the description above.

## Remaining after Phase 6
- **Phase 8 — character animation:** full voxel rig for player & enemies (idle, walk/run, jump anticipation/apex/fall,
  land squash, dash, climb, hit flinch, death shatter), state blending, boss telegraphs. Pose code: `poseHero`/`poseEnemy` in `renderer3d.js`.
- **Phase 9 — SFX:** combos per weapon, 8 elements + reactions, new bosses/enemies, torches, new UI (via `DS.Audio`; procedural if no assets).
- Then: code review, CHANGELOG + GDD update, merge `feat/v6-foundation` → `main`.

## How to run / verify
- `npm run dev` → http://localhost:8123 (Python dev server). F8 cycles graphics quality.
- `npm test` (node:test), `npm run solve 10` (level solver), `npm run qa:*` and `tools/qa/shoot-*.js`
  (headless Chrome via `tools/docs/cdp.js`, need a running dev server; screenshots go to `tools/qa/out/`, gitignored).
- Debug handles: `DS.Scenes.play(seed, {})`, `DS.currentGame`, `g.depth = N; DS.Game.loadLevel(g, DS.Game.kindForDepth(N))`.
- Cache-buster: `?v=6.0.0` on every script tag in `index.html`.
