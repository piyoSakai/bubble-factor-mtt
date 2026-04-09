# M3 Approximation Postmortem (Archived)

## Context

We attempted to add an approximate non-FT mode ("M3 Approx") so users could estimate Bubble
Factor in mid-field / near-bubble tournament phases (for example, 1000-player and 200-player
Wizard-like contexts).

The implementation was intentionally local-only and designed to finish in a few seconds on
commodity devices.

## What We Tried

1. **Field compression via virtual players**
   - Modeled table players plus 2-6 virtual off-table players.
   - Tuned virtual stack distributions per phase (`50%`, `25%`, `18%`, `16%`, `Near bubble`, `10%`, `5%`).

2. **Payout compression**
   - Converted long payout ladders into a reduced modeled payout vector for the compressed field.
   - Added phase-dependent paid-spot scaling.

3. **Phase calibration**
   - Added phase-specific BF scaling to pull outputs toward Wizard-like values.

## Results

- In symmetric cases (e.g. 1000-player near-bubble, 8-max, all 30bb), calibration could move
  values into the expected range.
- In asymmetric realistic stack distributions, errors remained too large.
  - Example mismatch observed:
    - Wizard: `1.04`
    - Approx result: `1.69`
    - Absolute error: `0.65`

This indicates the approximation overfit to specific patterns and did not generalize reliably
across stack-shape regimes.

## Decision

**M3 Approx is removed from the product UI and active calculation flow.**

Reason: current approximation quality is not stable enough for study trust. We prefer no feature
over a misleading feature.

## Lessons Learned

- Near-bubble pressure is highly sensitive to both field context and local stack geometry.
- Simple global calibration factors are insufficient.
- Fast local approximation is still possible in theory, but requires a more principled model:
  likely multi-parameter fitting (or data-driven regression) across many Wizard snapshots.

## If Revisited Later

Recommended minimum requirements before re-enabling:

1. Build a benchmark corpus with diverse Wizard scenarios (not just equal-stack cases).
2. Validate with holdout scenarios and publish error metrics (`max error`, `median error`,
   percentile bands).
3. Gate release on strict quality thresholds and clearly versioned model assumptions.

