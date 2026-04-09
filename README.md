# Bubble Factor MTT

[![CI](https://github.com/piyoSakai/bubble-factor-mtt/actions/workflows/ci.yml/badge.svg)](https://github.com/piyoSakai/bubble-factor-mtt/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A local-first, mobile-first study tool for MTT poker tournaments.

Calculates **Bubble Factor**, **Risk Premium**, **ICM equity**, and **Chip Chop** entirely in the browser — no data ever leaves your device.

---

## Features

- **Bubble Factor matrix** — full N×N grid showing ICM pressure for every player match-up
- **Risk Premium** — shown as `+x%` over the 50% chip-EV baseline (symmetric all-in assumption)
- **Exact ICM** (Malmuth–Harville) — for small to mid-size tables
- **Chip Chop** — side-by-side comparison with ICM equity
- **9 payout presets** — 1000-player / 200-player MTT FT, Satellite (3 variants), Winner-take-most, Small-field FT; loaded in one tap from the Scenarios panel
- **Scenario save / load / export** — LocalStorage-backed, JSON export for sharing
- **BF Drill mode** — training mode: guess BF values for a hidden caller row, then compare against exact ICM output; scored with relative-error per cell, round average, and streak counter
- **Web Worker** — all computation off the main thread; no UI freeze
- **Mobile-first** — designed for Android/iPhone browsers at 390 px and up

---

## Algorithm & Design

All formulas, assumptions, and GTO Wizard validation results are documented in
[docs/DESIGN.md](docs/DESIGN.md). The implementation is fully open, so you can audit
every calculation step.

---

## MVP scope and assumptions

| Area | Detail |
|------|--------|
| Bubble Factor | **Symmetric all-in study tool** — no blinds, antes, existing pots, side pots, or multi-way all-ins in this version |
| Risk Premium | Fixed **50% chip-EV baseline**. Always labeled in the UI. |
| Privacy | Zero telemetry. Stack and payout data never leave the browser. |

---

## Tech stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- Web Worker for calculation isolation
- ESLint (flat config, TypeScript + React Hooks rules)
- [Vitest](https://vitest.dev/) for calculation unit tests

---

## Deploy to Vercel

The app builds to a fully static bundle — no server required.

1. Fork or clone this repo
2. Import the project in [Vercel](https://vercel.com/)
3. Set **Framework Preset** → `Vite`
4. Leave all other settings as default and deploy

Vercel only serves the static files. All calculation and data storage happen client-side.

---

## Local development

```bash
git clone <repo-url>
cd bubble-factor-mtt
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> **Note:** Worker imports require an HTTP context.  
> Opening `dist/index.html` as a `file://` URL will break the Worker.  
> Use `npm run dev` or `npm run preview` locally.

---

## Build

```bash
npm run build    # TypeScript check + Vite production build → dist/
npm run preview  # Preview the production build locally
npm run lint     # ESLint
npm run test     # Vitest (calculation logic)
```

---

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| M0 | Algorithm spec, BF movement rule | ✅ Done |
| M1 | ICM + BF matrix + Web Worker | ✅ Done |
| M2 | Chip Chop, Risk Premium, mobile UX, manual recalc, Vercel deploy | ✅ Done |
| M3 | Mid-field approximate mode | Archived — see [`docs/M3_APPROX_POSTMORTEM.md`](docs/M3_APPROX_POSTMORTEM.md) |
| M2.5 | Payout presets + BF Drill (random stacks, avg-BB selector, scoring) | ✅ Done |
| M4 | Spot tool (blind / ante / pot size inputs) | Planned |
| M5 | PKO / Progressive Knockout prototype | Research |

---

## License

[MIT](./LICENSE) — feel free to fork, extend, and deploy your own instance.

---

## Disclaimer

This tool is intended for study and analysis only.  
Results are approximations based on mathematical models (Malmuth–Harville ICM, symmetric all-in assumption).  
Do not treat output as financial advice.
