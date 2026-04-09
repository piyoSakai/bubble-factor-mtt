import { describe, expect, it } from 'vitest';
import type { CalculationInput } from '../types';
import { calculateAll, validateInput } from './calculations';

const makeInput = (overrides: Partial<CalculationInput> = {}): CalculationInput => ({
  stackUnit: 'bb',
  players: [
    { id: 'p1', name: 'P1', stack: 50 },
    { id: 'p2', name: 'P2', stack: 30 },
    { id: 'p3', name: 'P3', stack: 20 },
  ],
  payouts: [100, 60, 40],
  ...overrides,
});

const sum = (values: number[]): number => values.reduce((accumulator, value) => accumulator + value, 0);

describe('validateInput', () => {
  it('warns when no active players and no payouts exist', () => {
    const warnings = validateInput(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: 0 },
          { id: 'p2', name: 'P2', stack: 0 },
        ],
        payouts: [],
      }),
    );

    expect(warnings).toContain('Add at least one player with a positive stack.');
    expect(warnings).toContain('Add at least one payout.');
  });

  it('warns for negative stack and negative payout', () => {
    const warnings = validateInput(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: -10 },
          { id: 'p2', name: 'P2', stack: 20 },
        ],
        payouts: [100, -10],
      }),
    );

    expect(warnings).toContain('Payouts must be zero or positive.');
    expect(warnings).toContain('Stacks must be zero or positive.');
  });

  it('emits a warning when player count is greater than 10', () => {
    const players = Array.from({ length: 11 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `P${index + 1}`,
      stack: 10 + index,
    }));
    const payouts = Array.from({ length: 11 }, (_, index) => 120 - index * 10);
    const warnings = validateInput(
      makeInput({
        players,
        payouts,
      }),
    );

    expect(warnings).toContain(
      'Exact ICM is currently tuned for small tables. Large tables may feel slow.',
    );
  });
});

describe('calculateAll', () => {
  it('returns symmetric values for 2-player equal stacks winner-take-most case', () => {
    const result = calculateAll(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: 100 },
          { id: 'p2', name: 'P2', stack: 100 },
        ],
        payouts: [100, 0],
      }),
    );

    expect(result.equities).toHaveLength(2);
    expect(result.equities[0]).toBeCloseTo(50, 6);
    expect(result.equities[1]).toBeCloseTo(50, 6);
    expect(result.chipChop[0]).toBeCloseTo(50, 6);
    expect(result.chipChop[1]).toBeCloseTo(50, 6);

    const cell = result.bubbleMatrix[0][1];
    expect(cell.bubbleFactor).toBe(1);
    expect(cell.requiredEquity).toBe(50);
    expect(cell.riskPremium).toBe(0);
  });

  it('preserves payout totals for ICM and Chip Chop', () => {
    const input = makeInput({
      players: [
        { id: 'p1', name: 'P1', stack: 80 },
        { id: 'p2', name: 'P2', stack: 55 },
        { id: 'p3', name: 'P3', stack: 35 },
        { id: 'p4', name: 'P4', stack: 30 },
      ],
      payouts: [1200, 700, 450, 250],
    });
    const result = calculateAll(input);
    const totalPayout = sum(input.payouts);

    expect(sum(result.equities)).toBeCloseTo(totalPayout, 4);
    expect(sum(result.chipChop)).toBeCloseTo(totalPayout, 4);
  });

  it('returns null values on bubble matrix diagonal', () => {
    const result = calculateAll(makeInput());

    result.bubbleMatrix.forEach((row, index) => {
      expect(row[index]).toEqual({
        bubbleFactor: null,
        riskPremium: null,
        requiredEquity: null,
      });
    });
  });

  it('keeps formula consistency across bubble factor, required equity, and risk premium', () => {
    const result = calculateAll(makeInput());

    result.bubbleMatrix.forEach((row) => {
      row.forEach((cell) => {
        if (cell.bubbleFactor === null || cell.requiredEquity === null || cell.riskPremium === null) {
          return;
        }

        const expectedRequiredEquity = (cell.bubbleFactor / (cell.bubbleFactor + 1)) * 100;
        const expectedRiskPremium = cell.requiredEquity - 50;

        // Values are rounded in calculateAll, so we allow a small tolerance.
        expect(Math.abs(cell.requiredEquity - expectedRequiredEquity)).toBeLessThanOrEqual(0.11);
        expect(Math.abs(cell.riskPremium - expectedRiskPremium)).toBeLessThanOrEqual(0.11);
      });
    });
  });

  it('filters out zero-stack players from output arrays', () => {
    const result = calculateAll(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: 40 },
          { id: 'p2', name: 'P2', stack: 0 },
          { id: 'p3', name: 'P3', stack: 60 },
        ],
      }),
    );

    expect(result.equities).toHaveLength(2);
    expect(result.chipChop).toHaveLength(2);
    expect(result.bubbleMatrix).toHaveLength(2);
    expect(result.bubbleMatrix[0]).toHaveLength(2);
  });

  it('normalizes payouts when payout count is shorter than active players', () => {
    const result = calculateAll(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: 40 },
          { id: 'p2', name: 'P2', stack: 35 },
          { id: 'p3', name: 'P3', stack: 25 },
        ],
        payouts: [100],
      }),
    );

    expect(sum(result.equities)).toBeCloseTo(100, 4);
    expect(sum(result.chipChop)).toBeCloseTo(100, 4);
  });

  it('keeps chip chop proportional in a 2-player winner-take-all setup', () => {
    const result = calculateAll(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: 75 },
          { id: 'p2', name: 'P2', stack: 25 },
        ],
        payouts: [100, 0],
      }),
    );

    expect(result.chipChop[0]).toBeCloseTo(75, 6);
    expect(result.chipChop[1]).toBeCloseTo(25, 6);
  });
});
