import type { CalculationInput, CalculationResult, MatrixCell } from '../types';

const EPSILON = 1e-9;

const round = (value: number, digits = 4): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const sum = (values: number[]): number =>
  values.reduce((accumulator, value) => accumulator + value, 0);

const normalizePayouts = (payouts: number[], playerCount: number): number[] => {
  const trimmed = payouts.filter((value) => value >= 0).slice(0, playerCount);
  if (trimmed.length === playerCount) {
    return trimmed;
  }

  return [...trimmed, ...Array.from({ length: playerCount - trimmed.length }, () => 0)];
};

const memoizedIcm = (stacks: number[], payouts: number[]): number[] => {
  const memo = new Map<string, number[]>();

  const recurse = (currentStacks: number[], payoutIndex: number): number[] => {
    const remainingPrizeCount = payouts.length - payoutIndex;
    const activePlayerCount = currentStacks.filter((stack) => stack > EPSILON).length;

    if (remainingPrizeCount <= 0 || activePlayerCount === 0) {
      return Array.from({ length: currentStacks.length }, () => 0);
    }

    const key = `${payoutIndex}|${currentStacks.map((stack) => stack.toFixed(6)).join(',')}`;
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }

    const total = sum(currentStacks);
    if (total <= EPSILON) {
      return Array.from({ length: currentStacks.length }, () => 0);
    }

    const prize = payouts[payoutIndex] ?? 0;
    const equities = Array.from({ length: currentStacks.length }, () => 0);

    currentStacks.forEach((stack, playerIndex) => {
      if (stack <= EPSILON) {
        return;
      }

      const winProbability = stack / total;
      equities[playerIndex] += winProbability * prize;

      if (remainingPrizeCount > 1) {
        const nextStacks = [...currentStacks];
        nextStacks[playerIndex] = 0;
        const nextEquities = recurse(nextStacks, payoutIndex + 1);

        nextEquities.forEach((value, index) => {
          equities[index] += winProbability * value;
        });
      }
    });

    memo.set(key, equities);
    return equities;
  };

  return recurse(stacks, 0);
};

const calculateChipChop = (stacks: number[], payouts: number[]): number[] => {
  const totalPrize = sum(payouts);
  const minimumPrize = payouts.length > 0 ? Math.min(...payouts) : 0;
  const guaranteedPool = minimumPrize * stacks.length;
  const variablePool = Math.max(totalPrize - guaranteedPool, 0);
  const chipTotal = sum(stacks);

  if (chipTotal <= EPSILON) {
    return Array.from({ length: stacks.length }, () => minimumPrize);
  }

  return stacks.map((stack) => minimumPrize + (variablePool * stack) / chipTotal);
};

const shiftStacksForAllIn = (
  stacks: number[],
  decisionMakerIndex: number,
  opponentIndex: number,
  decisionMakerWins: boolean,
): number[] => {
  const shifted = [...stacks];
  const effectiveStack = Math.min(stacks[decisionMakerIndex] ?? 0, stacks[opponentIndex] ?? 0);

  if (effectiveStack <= EPSILON) {
    return shifted;
  }

  if (decisionMakerWins) {
    shifted[decisionMakerIndex] += effectiveStack;
    shifted[opponentIndex] -= effectiveStack;
  } else {
    shifted[decisionMakerIndex] -= effectiveStack;
    shifted[opponentIndex] += effectiveStack;
  }

  return shifted.map((value) => (Math.abs(value) <= EPSILON ? 0 : value));
};

const calculateBubbleMatrix = (stacks: number[], payouts: number[], equities: number[]): MatrixCell[][] =>
  stacks.map((_, decisionMakerIndex) =>
    stacks.map((__, opponentIndex) => {
      if (decisionMakerIndex === opponentIndex) {
        return {
          bubbleFactor: null,
          riskPremium: null,
          requiredEquity: null,
        };
      }

      const start = equities[decisionMakerIndex] ?? 0;
      const loseEquities = memoizedIcm(
        shiftStacksForAllIn(stacks, decisionMakerIndex, opponentIndex, false),
        payouts,
      );
      const winEquities = memoizedIcm(
        shiftStacksForAllIn(stacks, decisionMakerIndex, opponentIndex, true),
        payouts,
      );

      const loseDelta = start - (loseEquities[decisionMakerIndex] ?? 0);
      const winDelta = (winEquities[decisionMakerIndex] ?? 0) - start;

      if (winDelta <= EPSILON) {
        return {
          bubbleFactor: null,
          riskPremium: null,
          requiredEquity: null,
        };
      }

      const bubbleFactor = loseDelta / winDelta;
      const requiredEquity = bubbleFactor / (bubbleFactor + 1);
      const riskPremium = (requiredEquity - 0.5) * 100;

      return {
        bubbleFactor,
        riskPremium,
        requiredEquity,
      };
    }),
  );

export const validateInput = (input: CalculationInput): string[] => {
  const warnings: string[] = [];
  const activePlayers = input.players.filter((player) => player.stack > 0);

  if (activePlayers.length === 0) {
    warnings.push('Add at least one player with a positive stack.');
  }

  if (input.payouts.length === 0) {
    warnings.push('Add at least one payout.');
  }

  if (input.payouts.some((payout) => payout < 0)) {
    warnings.push('Payouts must be zero or positive.');
  }

  if (activePlayers.some((player) => player.stack < 0)) {
    warnings.push('Stacks must be zero or positive.');
  }

  if (input.players.length > 10) {
    warnings.push('Exact ICM is currently tuned for small tables. Large tables may feel slow.');
  }

  return warnings;
};

export const calculateAll = (input: CalculationInput): CalculationResult => {
  const warnings = validateInput(input);
  const players = input.players.filter((player) => player.stack > 0);
  const stacks = players.map((player) => player.stack);
  const payouts = normalizePayouts(input.payouts, players.length);

  if (players.length === 0 || payouts.length === 0) {
    return {
      equities: [],
      chipChop: [],
      bubbleMatrix: [],
      warnings,
    };
  }

  const equities = memoizedIcm(stacks, payouts).map((value) => round(value, 6));
  const chipChop = calculateChipChop(stacks, payouts).map((value) => round(value, 6));
  const bubbleMatrix = calculateBubbleMatrix(stacks, payouts, equities).map((row) =>
    row.map((cell) => ({
      bubbleFactor: cell.bubbleFactor === null ? null : round(cell.bubbleFactor, 2),
      riskPremium: cell.riskPremium === null ? null : round(cell.riskPremium, 1),
      requiredEquity: cell.requiredEquity === null ? null : round(cell.requiredEquity * 100, 1),
    })),
  );

  return {
    equities,
    chipChop,
    bubbleMatrix,
    warnings,
  };
};
