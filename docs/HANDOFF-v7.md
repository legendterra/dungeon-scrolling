# v7 Handoff

Plan: [PLAN-v7.md](PLAN-v7.md). Branch kerja: `claude/modest-rubin-yaqfoa` (tanpa merge ke `main`).
Perbarui file ini di akhir setiap fase.

## Status

| Fase | Isi | Status |
|---|---|---|
| 0 | Persiapan, bug senjata, jam menu, `shoot-maps.js`, baseline | dikerjakan |
| 1 | Backdrop world-space raksasa | belum |
| 2 | Level diperbesar | belum |
| 3 | Tekstur CC0 HD | belum |
| 4-6 | Map per act + monster | belum |
| 7 | MC baru | belum |
| 8 | Suara, dokumen, review | belum |

## Cara jalan

- Dev server: `python devserver.py 8124` (port yang dipakai `.claude/launch.json`).
- `node tools/qa/shoot-maps.js http://127.0.0.1:8124/ --tag NAMA [--depths 2,3|all]` menulis contact sheet
  ke `tools/qa/out/maps/NAMA/` (gitignored). Baseline: tag `before-v7`.
- `npm test`, `npm run solve 50`, `node tools/qa/probe-load.js`.
