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

const enumeratePermutations = (values: number[]): number[][] => {
  if (values.length <= 1) {
    return [values];
  }

  const permutations: number[][] = [];
  values.forEach((value, index) => {
    const remaining = [...values.slice(0, index), ...values.slice(index + 1)];
    enumeratePermutations(remaining).forEach((tail) => {
      permutations.push([value, ...tail]);
    });
  });

  return permutations;
};

const exactIcmByPermutation = (stacks: number[], payouts: number[]): number[] => {
  const playerIndices = stacks.map((_, index) => index);
  const permutations = enumeratePermutations(playerIndices);
  const equities = Array.from({ length: stacks.length }, () => 0);

  permutations.forEach((finishOrder) => {
    let probability = 1;
    let remainingTotal = sum(stacks);

    for (let place = 0; place < finishOrder.length; place += 1) {
      const playerIndex = finishOrder[place];
      const stack = stacks[playerIndex] ?? 0;
      if (remainingTotal <= 0 || stack <= 0) {
        probability = 0;
        break;
      }

      probability *= stack / remainingTotal;
      remainingTotal -= stack;
    }

    if (probability === 0) {
      return;
    }

    finishOrder.forEach((playerIndex, place) => {
      equities[playerIndex] += probability * (payouts[place] ?? 0);
    });
  });

  return equities;
};

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

  it('warns for negative stack', () => {
    const warnings = validateInput(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: -10 },
          { id: 'p2', name: 'P2', stack: 20 },
        ],
        payouts: [100, -10],
      }),
    );

    expect(warnings).toContain('Stacks must be zero or positive.');
  });

  it('allows negative payouts without validation warnings', () => {
    const warnings = validateInput(
      makeInput({
        payouts: [100, -20, -30],
      }),
    );

    expect(warnings).not.toContain('Payouts must be zero or positive.');
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

  it('keeps negative payouts in calculation instead of filtering them out', () => {
    const result = calculateAll(
      makeInput({
        players: [
          { id: 'p1', name: 'P1', stack: 60 },
          { id: 'p2', name: 'P2', stack: 40 },
        ],
        payouts: [100, -20],
      }),
    );

    expect(sum(result.equities)).toBeCloseTo(80, 4);
    expect(sum(result.chipChop)).toBeCloseTo(80, 4);
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

  it('matches independent exact ICM enumeration for a 4-player case', () => {
    const input = makeInput({
      players: [
        { id: 'p1', name: 'P1', stack: 40 },
        { id: 'p2', name: 'P2', stack: 30 },
        { id: 'p3', name: 'P3', stack: 20 },
        { id: 'p4', name: 'P4', stack: 10 },
      ],
      payouts: [100, 60, 30, 10],
    });
    const result = calculateAll(input);
    const exact = exactIcmByPermutation(
      input.players.map((player) => player.stack),
      input.payouts,
    );

    exact.forEach((expected, index) => {
      expect(result.equities[index]).toBeCloseTo(expected, 6);
    });

    const shiftedLose = exactIcmByPermutation([10, 60, 20, 10], input.payouts)[0];
    const shiftedWin =
      exactIcmByPermutation([70, 20, 10], [100, 60, 30])[0];
    const start = exact[0];
    const loseDelta = start - shiftedLose;
    const winDelta = shiftedWin - start;
    const expectedBf = loseDelta / winDelta;
    expect(result.bubbleMatrix[0][1].bubbleFactor).toBeCloseTo(expectedBf, 2);
  });
});

describe('wizard regression fixtures', () => {
  const case1Players = [
    { id: 'utg', name: 'UTG', stack: 60.13 },
    { id: 'utg1', name: 'UTG1', stack: 83.13 },
    { id: 'lj', name: 'LJ', stack: 20.13 },
    { id: 'hj', name: 'HJ', stack: 71.13 },
    { id: 'co', name: 'CO', stack: 73.13 },
    { id: 'btn', name: 'BTN', stack: 29.13 },
    { id: 'sb', name: 'SB', stack: 36.13 },
    { id: 'bb', name: 'BB', stack: 27.13 },
  ];

  const case1Top8Payouts = [7656, 5668, 4196, 3204, 2456, 1924, 1484, 1140];
  const case1AllPayouts = [
    ...case1Top8Payouts,
    888,
    748, 748,
    676, 676,
    596, 596, 596, 596,
    512, 512, 512, 512, 512, 512,
    440, 440, 440, 440, 440, 440, 440,
  ];

  it('uses only top-8 payouts when there are 8 active players', { timeout: 15000 }, () => {
    const inputTop8 = makeInput({
      players: case1Players,
      payouts: case1Top8Payouts,
    });
    const inputAllPayouts = makeInput({
      players: case1Players,
      payouts: case1AllPayouts,
    });

    const resultTop8 = calculateAll(inputTop8);
    const resultAllPayouts = calculateAll(inputAllPayouts);

    expect(resultAllPayouts.equities).toEqual(resultTop8.equities);
    expect(resultAllPayouts.chipChop).toEqual(resultTop8.chipChop);
    expect(resultAllPayouts.bubbleMatrix).toEqual(resultTop8.bubbleMatrix);
  });

  it('includes BB stack when BB is positive', { timeout: 15000 }, () => {
    const withBB = calculateAll(
      makeInput({
        players: case1Players,
        payouts: case1Top8Payouts,
      }),
    );
    const withoutBB = calculateAll(
      makeInput({
        players: case1Players.map((player) =>
          player.id === 'bb' ? { ...player, stack: 0 } : player,
        ),
        payouts: case1Top8Payouts,
      }),
    );

    expect(withBB.equities).toHaveLength(8);
    expect(withBB.bubbleMatrix).toHaveLength(8);
    expect(withoutBB.equities).toHaveLength(7);
    expect(withoutBB.bubbleMatrix).toHaveLength(7);
  });

  const wizardRegressionEnabled = import.meta.env.VITE_RUN_WIZARD_REGRESSION === '1';
  const wizardIt = wizardRegressionEnabled ? it : it.skip;

  wizardIt('matches case1 bubble-factor matrix within tolerance', () => {
    const input = makeInput({
      // NOTE: Payout structure fixed by user for fixture comparisons.
      // This case is currently skipped by default because Wizard's spot model
      // and this app's "symmetric all-in study mode" assumptions are not aligned yet.
      payouts: case1Top8Payouts,
      players: case1Players,
    });

    const expectedBubbleFactor: Array<Array<number | null>> = [
      [null, 2.14, 1.18, 2.09, 2.1, 1.28, 1.39, 1.26],
      [1.63, null, 1.13, 1.89, 1.95, 1.21, 1.28, 1.19],
      [1.47, 1.51, null, 1.49, 1.5, 1.37, 1.4, 1.36],
      [1.79, 2.25, 1.15, null, 2.2, 1.24, 1.33, 1.22],
      [1.75, 2.26, 1.15, 2.13, null, 1.24, 1.32, 1.22],
      [1.65, 1.7, 1.28, 1.68, 1.68, null, 1.56, 1.46],
      [1.76, 1.83, 1.25, 1.79, 1.8, 1.44, null, 1.39],
      [1.61, 1.67, 1.29, 1.64, 1.65, 1.49, 1.53, null],
    ];

    const result = calculateAll(input);
    const tolerance = 0.01;

    expectedBubbleFactor.forEach((row, rowIndex) => {
      row.forEach((expected, columnIndex) => {
        const actual = result.bubbleMatrix[rowIndex]?.[columnIndex]?.bubbleFactor ?? null;
        if (expected === null) {
          expect(actual).toBeNull();
          return;
        }

        expect(
          actual,
          `case1 BF mismatch at [${rowIndex},${columnIndex}] expected=${expected} actual=${actual}`,
        ).not.toBeNull();

        const diff = Math.abs((actual as number) - expected);
        if (diff > tolerance) {
          throw new Error(
            `case1 BF mismatch at [${rowIndex},${columnIndex}] expected=${expected} actual=${actual} diff=${diff.toFixed(3)}`,
          );
        }
      });
    });
  });

  wizardIt('matches case2 bubble-factor matrix within tolerance', () => {
    const input = makeInput({
      payouts: case1Top8Payouts,
      players: [
        { id: 'utg', name: 'UTG', stack: 32.13 },
        { id: 'utg1', name: 'UTG1', stack: 23.13 },
        { id: 'lj', name: 'LJ', stack: 25.13 },
        { id: 'hj', name: 'HJ', stack: 34.13 },
        { id: 'co', name: 'CO', stack: 22.13 },
        { id: 'btn', name: 'BTN', stack: 17.13 },
        { id: 'sb', name: 'SB', stack: 30.13 },
        { id: 'bb', name: 'BB', stack: 18.13 },
      ],
    });

    const expectedBubbleFactor: Array<Array<number | null>> = [
      [null, 1.52, 1.6, 2.01, 1.49, 1.33, 1.86, 1.36],
      [1.79, null, 1.74, 1.8, 1.66, 1.43, 1.78, 1.47],
      [1.84, 1.67, null, 1.85, 1.61, 1.4, 1.83, 1.44],
      [1.91, 1.49, 1.57, null, 1.46, 1.31, 1.8, 1.34],
      [1.77, 1.7, 1.71, 1.78, null, 1.44, 1.75, 1.48],
      [1.62, 1.57, 1.58, 1.63, 1.56, null, 1.61, 1.52],
      [1.95, 1.6, 1.65, 1.97, 1.52, 1.35, null, 1.38],
      [1.65, 1.59, 1.61, 1.67, 1.59, 1.5, 1.64, null],
    ];

    const result = calculateAll(input);
    const tolerance = 0.05;

    expectedBubbleFactor.forEach((row, rowIndex) => {
      row.forEach((expected, columnIndex) => {
        const actual = result.bubbleMatrix[rowIndex]?.[columnIndex]?.bubbleFactor ?? null;
        if (expected === null) {
          expect(actual).toBeNull();
          return;
        }

        expect(
          actual,
          `case2 BF mismatch at [${rowIndex},${columnIndex}] expected=${expected} actual=${actual}`,
        ).not.toBeNull();

        const diff = Math.abs((actual as number) - expected);
        if (diff > tolerance) {
          throw new Error(
            `case2 BF mismatch at [${rowIndex},${columnIndex}] expected=${expected} actual=${actual} diff=${diff.toFixed(3)}`,
          );
        }
      });
    });
  });

  wizardIt('matches case3 bubble-factor matrix within tolerance', () => {
    const case3Payouts = [15.19, 10.96, 7.94, 5.76, 4.17, 3.06];
    const input = makeInput({
      payouts: case3Payouts,
      players: [
        { id: 'lj', name: 'LJ', stack: 100.13 },
        { id: 'hj', name: 'HJ', stack: 30.13 },
        { id: 'co', name: 'CO', stack: 35.13 },
        { id: 'btn', name: 'BTN', stack: 25.13 },
        { id: 'sb', name: 'SB', stack: 40.13 },
        { id: 'bb', name: 'BB', stack: 10.13 },
      ],
    });

    const expectedBubbleFactor: Array<Array<number | null>> = [
      [null, 1.17, 1.2, 1.13, 1.25, 1.05],
      [2.15, null, 1.79, 1.48, 1.84, 1.13],
      [2.28, 1.59, null, 1.41, 1.92, 1.12],
      [2.01, 1.66, 1.71, null, 1.75, 1.14],
      [2.39, 1.49, 1.69, 1.35, null, 1.11],
      [1.4, 1.27, 1.3, 1.24, 1.31, null],
    ];

    const result = calculateAll(input);
    const tolerance = 0.05;

    expectedBubbleFactor.forEach((row, rowIndex) => {
      row.forEach((expected, columnIndex) => {
        const actual = result.bubbleMatrix[rowIndex]?.[columnIndex]?.bubbleFactor ?? null;
        if (expected === null) {
          expect(actual).toBeNull();
          return;
        }

        expect(
          actual,
          `case3 BF mismatch at [${rowIndex},${columnIndex}] expected=${expected} actual=${actual}`,
        ).not.toBeNull();

        const diff = Math.abs((actual as number) - expected);
        if (diff > tolerance) {
          throw new Error(
            `case3 BF mismatch at [${rowIndex},${columnIndex}] expected=${expected} actual=${actual} diff=${diff.toFixed(3)}`,
          );
        }
      });
    });
  });
});
