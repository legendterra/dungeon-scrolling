# Act III monsters: drafts

Untested drafts of the 14 Act III monsters (`enemies6.js`) and their voxel models (`voxel-bestiary3.js`).
Not loaded by the game. To use: move them to `src/entities/` and `src/core/`, add script tags after enemies5.js / voxel-bestiary2.js in index.html,
add the cues `whisper` and `chime` to `core/audio.js`, add rosters to `src/world/maps/act3.js` (see docs/PLAN-v7.md), then run `npm test` (the bestiary tests pick the new files up by themselves) and `tools/qa/check-bestiary.js --only v7`.
