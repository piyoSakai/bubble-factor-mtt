# Design Document — Bubble Factor MTT

**Version**: 1.0  
**Author**: [YEBISU](https://x.com/YEBISU_NLH)  
**Status**: Active (reflects implemented MVP)

This document captures the product goals, algorithm definitions, and technical decisions
that underpin the implementation. Because this is open-source software, all assumptions and
formulas are spelled out explicitly so that anyone can audit, replicate, or extend the
calculations.

---

## 1. Background & Goals

### 1.1 Motivation

Practical ICM / Bubble Factor tools for Android are scarce. The goal is a **locally-executed
WebApp** that covers at minimum what iOS tools like *Tournament Cruncher* offer, with room to
grow beyond that.

### 1.2 Product Goals

| Goal | Description |
|------|-------------|
| **Privacy-first** | Stack sizes and payout structures are never sent to any server. All computation runs in the browser. |
| **Works offline** | Static build; no backend required. Installable as a PWA. |
| **Mobile UX as a first-class concern** | Primary target is a phone browser. No freeze or unresponsive states even with many players. |
| **Algorithmically verifiable** | Formulas are documented here and cross-validated against GTO Wizard reference data (see §4). |

---

## 2. MVP Scope

### Implemented (v0.x)

- **ICM** — Malmuth–Harville recursive calculation, exact for N ≤ ~12 players.
- **Chip Chop** — Proportional chip-based deal allocation displayed alongside ICM for comparison.
- **Bubble Factor matrix** — N×N grid showing BF(i→j) for every ordered pair; diagonal is empty.
- **Risk Premium** — Derived from BF using the 50 % Chip-EV baseline (see §4.3).
- **Manual recalculation** — Triggered by a dedicated button; status indicators show *Calculating / Needs recalc / Ready*. Heavy scenarios (large N) never block the UI.
- **Web Worker** — All ICM/BF computation is offloaded from the main thread.
- **Mobile-first layout** — Responsive design; matrix cells open a bottom sheet for detail.
- **Matrix header extras** — Each player header shows stack (BB or chips), chip-leader (👑) and short-stack (💀) emoji, and average BF/RP as caller and shover.
- **Summary grid** — ICM $EV, Chip Chop, average stack, and other key numbers at a glance.

### Out of Scope for MVP (v1.x / v2.x)

- Blind / ante / pot-size aware spot tool
- Mid-field / bubble-phase approximate mode
- PKO / progressive bounty
- Future Game Simulation (FGS)
- Multiple all-in scenarios
- CSV / JSON import

---

## 3. Minimum Input Model

ICM and Bubble Factor require exactly two inputs:

| Input | Description |
|-------|-------------|
| **Player stacks** | Any consistent unit (chips or BB). Internally treated as non-negative numbers. Negative stacks are clamped to 0. |
| **Payout structure** | Prize amounts for each finishing position (1st through k-th). Negative payouts (e.g. staking losses) are accepted. |

M, Q, and raw BB counts are deliberately excluded from the core model — they add no information
to the ICM formula.

---

## 4. Algorithms

### 4.1 ICM — Malmuth–Harville Model

Given player stacks \( s_1, \ldots, s_N \) and payouts \( p_1 \geq p_2 \geq \ldots \geq p_k \):

**Probability that player i finishes in position r** (Harville formula):

\[
\Pr[\text{rank}(i) = 1] = \frac{s_i}{\sum_j s_j}
\]

\[
\Pr[\text{rank}(i) = r] = \sum_{S \subseteq \{1,\ldots,N\} \setminus \{i\},\, |S|=r-1}
  \left(\prod_{j \in S} \frac{s_j}{\sum_{l \notin \text{ranked so far}} s_l}\right)
  \cdot \frac{s_i}{\sum_{l \notin (S \cup \{i\})} s_l + s_i}
\]

**ICM equity**:

\[
EV_i = \sum_{r=1}^{k} p_r \cdot \Pr[\text{rank}(i) = r]
\]

**Implementation**: recursive MH with memoisation (`calculateIcm` in `src/lib/calculations.ts`).  
**Payout truncation**: only the top-N payouts (where N = number of active players) are used;
remaining prizes have no effect on equity.

#### All-in Bust-out Correction

When computing post-all-in equities, a player whose stack drops to 0 **locks in the lowest
remaining payout** rather than receiving 0. Concretely:

1. Find all players with `stack ≤ ε` after the all-in.
2. Assign them the lowest available payout(s) in descending bust order.
3. Recompute ICM for the remaining active players against the reduced payout array.

This matches GTO Wizard's behaviour and is essential for correct Bubble Factor values at a
final table. See `calculateDecisionMakerEquityAfterAllIn` in `src/lib/calculations.ts`.

### 4.2 Bubble Factor

**Definition** (ICMIZER / GTO Wizard):

\[
\mathrm{BF}(i \to j) = \frac{EV_{\text{begin},i} - EV_{\text{lose},i}}{EV_{\text{win},i} - EV_{\text{begin},i}}
  = \frac{\Delta_{\text{lose}}}{\Delta_{\text{win}}}
\]

where:
- \( EV_{\text{begin},i} \) — current ICM equity of decision-maker i
- \( EV_{\text{lose},i} \) — ICM equity of i after losing the all-in to j
- \( EV_{\text{win},i} \) — ICM equity of i after winning the all-in against j

**Matrix interpretation**:

| Axis | Meaning |
|------|---------|
| Row (i) | **Decision-maker** — the player facing a shove and deciding whether to call |
| Column (j) | **Opponent** — the player who shoved |
| Cell BF(i→j) | How much tighter than Chip EV the caller must play; higher = tighter |
| Diagonal | Empty (undefined) |

**MVP chip-movement rule** (symmetric all-in):

Effective stack = min(stack\_i, stack\_j). The full effective stack is wagered. If i wins, i
gains the effective stack from j; if i loses, i loses it to j. The rule is identical for every
cell in the matrix.

**Edge cases**:
- If \( EV_{\text{win}} - EV_{\text{begin}} < \varepsilon \), BF is undefined → displayed as `—`.
- If a player's stack is 0, they cannot win a chip from j → BF(i→j) is undefined.

### 4.3 Required Equity & Risk Premium

**Required equity** (approximate, equal-stack shove context):

\[
E_{\$} \approx \frac{\mathrm{BF}}{\mathrm{BF} + 1}
\]

**Risk Premium** (percentage-point add-on over the Chip-EV break-even):

\[
\text{RP (\%pt)} = 100 \times (E_{\$} - E_{\text{chip}})
\]

**MVP assumption**: \( E_{\text{chip}} = 50\% \) (symmetric equal-stack all-in, no antes/pot).

> RP is labelled "50 % Chip EV baseline" throughout the UI to prevent confusion with GTO
> Wizard's spot-aware RP (which accounts for pot odds).

### 4.4 Chip Chop

Proportional allocation of the total prize pool by chip stack:

\[
\text{ChipChop}_i = \frac{s_i}{\sum_j s_j} \times \text{total prize pool}
\]

Displayed side-by-side with ICM equity in the results table.

---

## 5. Validation Against GTO Wizard

Three regression fixtures from actual GTO Wizard sessions are encoded in
`src/lib/calculations.test.ts`. They verify that the BF matrix produced by this app matches
GTO Wizard output within the noted tolerance.

| Fixture | Players | Notes | BF tolerance |
|---------|---------|-------|-------------|
| Case 1 | 8 (FT) | Ave ~50 BB, standard payout | ±0.01 |
| Case 2 | 8 (FT) | Varied stack distribution | ±0.05 |
| Case 3 | Different player count / payout structure | — | ±0.05 |

Run the wizard regression suite:

```bash
VITE_RUN_WIZARD_REGRESSION=true npx vitest run
```

Standard `npm test` skips these fixtures (they use `it.skip`) to keep CI fast.

---

## 6. Non-Functional Requirements

### 6.1 Privacy

Stacks, payouts, and player names never leave the browser. No analytics scripts, no CDN-hosted
code paths that could exfiltrate data.

### 6.2 Performance

| Concern | Approach |
|---------|---------|
| Main-thread blocking | All heavy computation in a Web Worker |
| Manual recalculation | User triggers calculation explicitly; no debounce race |
| Large N | ICM complexity is O(N!) in the naive case; MH recursion + memoisation keeps it practical up to ~12 players. A warning is emitted for N > 10. |
| Cancellation | Worker is replaced on new requests; in-flight results for stale keys are discarded |

### 6.3 Quality

- TypeScript strict mode; `any` avoided throughout.
- ESLint with react-hooks rules.
- Unit tests (Vitest) covering ICM correctness, ChipChop, BF formula consistency, edge cases,
  and GTO Wizard regression fixtures.

### 6.4 Mobile UX

- Mobile-first responsive layout; primary viewport target ~390 px wide.
- Tap targets ≥ 44×44 CSS px.
- BF matrix scrollable horizontally; cells open a bottom sheet for detail.
- `inputmode="decimal"` on numeric fields; negative stacks clamped to 0 on blur.
- Status indicators keep the user informed during calculation without blocking interaction.

---

## 7. Technology Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| UI | React 19 + Vite | Fast HMR, component model, small bundle |
| Language | TypeScript (strict) | Type safety for financial arithmetic |
| Calculation | Web Worker (TypeScript) | Keeps UI responsive |
| Styling | Plain CSS (custom properties) | Zero dependencies, full control |
| Testing | Vitest | Native ESM, fast, co-located with source |
| Deployment | Vercel (static) | CDN, preview URLs, zero config |

---

## 8. Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **M0** | Algorithm spec, BF movement rule definition | ✅ Done |
| **M1** | ICM + BF matrix + Web Worker | ✅ Done |
| **M2** | Chip Chop, Risk Premium, mobile UX, manual recalc, Vercel deploy | ✅ Done |
| **M3** | Mid-field / bubble approximate mode | Planned |
| **M4** | Spot tool (blind / ante / pot size inputs) | Planned |
| **M5** | PKO prototype | Research |

---

## 9. M3 Approximation Plan (1000-player phases)

M3 extends the current FT-exact model with an estimate mode for non-FT tournament stages.

### 9.1 Target phases

For a 1000-player tournament, the following phase granularity is supported:

- 50%
- 25%
- 18%
- 16%
- Near bubble
- 10%
- 5%

For practical use and consistency with Wizard-style workflows, M3 supports two payout presets:

- **MTT 1000 players**
- **MTT 200 players**

Selecting a preset auto-loads its payout ladder and sets field size accordingly.

### 9.2 Core approximation idea

Full-field ICM is not tractable on device when all remaining players are modeled explicitly.
Instead, we compress the off-table field into a small number of **virtual players**:

- 50 / 25 / 18 / 16 / near bubble: 3 virtual players
- 10 / 5: 2 virtual players

The app then computes ICM/BF on:

`your table players + virtual players` (typically 10-11 modeled players total)

This keeps computation local and practical while preserving meaningful ICM pressure changes
across tournament phases.

### 9.3 Product constraints

- M3 values are explicitly labeled as **estimates** in UI and warnings.
- Wizard parity is treated as a calibration target, not an identity guarantee.
- Phase profiles (virtual stack weights and pressure factors) are tunable and can be fitted to
  Wizard snapshots over time.

---

## 10. BF Drill Plan (next feature)

The next major feature is a training mode inspired by Wizard drills: users estimate BF values
without seeing the matrix, then compare against exact outputs.

### 10.1 Drill format

- Prompt style: **one caller row at a time** (row player fixed, all opponent cells hidden)
- User enters BF guesses for each opponent
- Submit reveals:
  - exact BF row
  - absolute and relative error by cell
  - round score + streak update

### 10.2 Scenario design

- Prize structures are fixed presets (initially six):
  - A1: 1000-player FT style
  - A2: 200-player FT style
  - B: satellite-style equal-ticket payouts
  - C: winner-take-most steep structure
  - D: deep-run / near-bubble style
  - E: 8-player small-field with 6 ITM
- Stacks are randomized within bounded ranges for each drill round.

### 10.3 Scoring model (planned)

To avoid bias from large-BF spots, scoring uses relative error normalization:

\\[
\\text{relErr} = \\frac{|\\text{guess} - \\text{actual}|}{\\max(\\text{actual}, \\epsilon)}
\\]

\\[
\\text{cellScore} = 100 \\times \\max(0, 1 - \\text{relErr})
\\]

Round score is the mean of cell scores. Streak logic will be threshold-based (e.g. all cells
within a configurable relative error bound).

---

## 11. References

- [ICMIZER Blog — Bubble Factor](https://www.icmizer.com/en/blog/bubble-factor-advanced-fgs-better-limps-and-more/)
- [GTO Wizard — What is the Bubble Factor in poker tournaments?](https://blog.gtowizard.com/what-is-the-bubble-factor-in-poker-tournaments/)
- [GTO Wizard Glossary — Bubble Factor](https://gtowizard.com/glossary/bubble-factor/)
- [GTO Wizard Glossary — Risk Premium](https://gtowizard.com/glossary/risk-premium/)
- [Wikipedia — Independent Chip Model](https://en.wikipedia.org/wiki/Independent_Chip_Model)
- [GTO Wizard — Theoretical Breakthroughs in ICM](https://blog.gtowizard.com/theoretical-breakthroughs-in-icm/)
