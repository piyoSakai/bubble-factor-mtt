# Bubble Factor MTT

A local-first, mobile-first study tool for MTT poker tournaments.

Calculates **Bubble Factor**, **Risk Premium**, **ICM equity**, and **Chip Chop** entirely in the browser — no data ever leaves your device.

---

## Features

- **Bubble Factor matrix** — full N×N grid showing ICM pressure for every player match-up
- **Risk Premium** — shown as `+x%` over the 50% chip-EV baseline (symmetric all-in assumption)
- **Exact ICM** (Malmuth–Harville) — for small to mid-size tables
- **Chip Chop** — side-by-side comparison with ICM equity
- **Scenario save / load / export** — LocalStorage-backed, JSON export for sharing
- **Web Worker** — all computation off the main thread; no UI freeze
- **Mobile-first** — designed for Android/iPhone browsers at 390 px and up

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

- [ ] Mid-run estimation mode (approx BF from prize curve + players remaining + hero stack)
- [ ] Scenario import from JSON file
- [ ] Preset payout structures (common MTT / SNG / satellite)
- [ ] Dark mode and color-independent cell encoding
- [ ] Large-field mode with Monte Carlo ICM and error display
- [ ] PKO / Progressive Knockout support (v2)

---

## License

[MIT](./LICENSE) — feel free to fork, extend, and deploy your own instance.

---

## Disclaimer

This tool is intended for study and analysis only.  
Results are approximations based on mathematical models (Malmuth–Harville ICM, symmetric all-in assumption).  
Do not treat output as financial advice.
