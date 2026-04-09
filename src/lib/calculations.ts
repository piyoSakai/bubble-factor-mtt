import type {
  ApproximationPhase,
  CalculationInput,
  CalculationResult,
  MatrixCell,
} from '../types';

const EPSILON = 1e-9;

const round = (value: number, digits = 4): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const sum = (values: number[]): number =>
  values.reduce((accumulator, value) => accumulator + value, 0);

const normalizePayouts = (payouts: number[], playerCount: number): number[] => {
  const trimmed = payouts.slice(0, playerCount);
  if (trimmed.length === playerCount) {
    return trimmed;
  }

  return [...trimmed, ...Array.from({ length: playerCount - trimmed.length }, () => 0)];
};

type ApproximationPhaseProfile = {
  virtualPlayerCount: number;
  fieldPressure: number;
  weights: number[];
};

const APPROXIMATION_PHASES: Record<ApproximationPhase, ApproximationPhaseProfile> = {
  phase_50: {
    virtualPlayerCount: 3,
    fieldPressure: 0.45,
    weights: [0.34, 0.33, 0.33],
  },
  phase_25: {
    virtualPlayerCount: 3,
    fieldPressure: 0.65,
    weights: [0.38, 0.34, 0.28],
  },
  phase_18: {
    virtualPlayerCount: 3,
    fieldPressure: 0.8,
    weights: [0.43, 0.34, 0.23],
  },
  phase_16: {
    virtualPlayerCount: 3,
    fieldPressure: 0.9,
    weights: [0.46, 0.34, 0.2],
  },
  phase_near_bubble: {
    virtualPlayerCount: 3,
    fieldPressure: 1.1,
    weights: [0.52, 0.32, 0.16],
  },
  phase_10: {
    virtualPlayerCount: 2,
    fieldPressure: 1.25,
    weights: [0.62, 0.38],
  },
  phase_5: {
    virtualPlayerCount: 2,
    fieldPressure: 1.35,
    weights: [0.68, 0.32],
  },
};

const buildApproximateStacks = (stacks: number[], phase: ApproximationPhase): number[] => {
  const profile = APPROXIMATION_PHASES[phase];
  if (!profile || stacks.length === 0) {
    return stacks;
  }

  const tableChipTotal = sum(stacks);
  if (tableChipTotal <= EPSILON) {
    return stacks;
  }

  const virtualTotal = tableChipTotal * profile.fieldPressure;
  const weightTotal = sum(profile.weights);
  if (weightTotal <= EPSILON) {
    return stacks;
  }

  const virtualStacks = profile.weights
    .slice(0, profile.virtualPlayerCount)
    .map((weight) => (virtualTotal * weight) / weightTotal)
    .map((value) => (value <= EPSILON ? EPSILON : value));

  return [...stacks, ...virtualStacks];
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

const calculateDecisionMakerEquityAfterAllIn = (
  stacks: number[],
  payouts: number[],
  decisionMakerIndex: number,
  opponentIndex: number,
  decisionMakerWins: boolean,
): number => {
  const shifted = shiftStacksForAllIn(
    stacks,
    decisionMakerIndex,
    opponentIndex,
    decisionMakerWins,
  );

  const loserIndex = decisionMakerWins ? opponentIndex : decisionMakerIndex;
  const loserStack = shifted[loserIndex] ?? 0;

  // In pairwise all-in modeling, one player can become exactly 0 chips.
  // If payouts are defined for all remaining players, that busted player
  // should lock the lowest remaining payout immediately.
  if (loserStack <= EPSILON && payouts.length >= shifted.length) {
    if (loserIndex === decisionMakerIndex) {
      return payouts[shifted.length - 1] ?? 0;
    }

    const activeStacks = shifted.filter((_, index) => index !== loserIndex);
    const activePayouts = payouts.slice(0, activeStacks.length);
    const activeEquities = memoizedIcm(activeStacks, activePayouts);
    const activeDecisionMakerIndex =
      decisionMakerIndex < loserIndex ? decisionMakerIndex : decisionMakerIndex - 1;
    return activeEquities[activeDecisionMakerIndex] ?? 0;
  }

  return memoizedIcm(shifted, payouts)[decisionMakerIndex] ?? 0;
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
      const loseEquity = calculateDecisionMakerEquityAfterAllIn(
        stacks,
        payouts,
        decisionMakerIndex,
        opponentIndex,
        false,
      );
      const winEquity = calculateDecisionMakerEquityAfterAllIn(
        stacks,
        payouts,
        decisionMakerIndex,
        opponentIndex,
        true,
      );

      const loseDelta = start - loseEquity;
      const winDelta = winEquity - start;

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

  if (input.players.some((player) => player.stack < 0)) {
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
  const approximationEnabled = Boolean(input.approximation?.enabled);
  const phase = input.approximation?.phase ?? 'phase_near_bubble';
  const modeledStacks = approximationEnabled ? buildApproximateStacks(stacks, phase) : stacks;
  const virtualPlayers = Math.max(modeledStacks.length - stacks.length, 0);
  const payouts = normalizePayouts(input.payouts, modeledStacks.length);

  if (players.length === 0 || payouts.length === 0) {
    return {
      equities: [],
      chipChop: [],
      bubbleMatrix: [],
      warnings,
      meta: {
        mode: approximationEnabled ? 'mtt-approx' : 'exact',
        virtualPlayers,
        phase: approximationEnabled ? phase : undefined,
        fieldSize: approximationEnabled ? input.approximation?.fieldSize : undefined,
        payoutPreset: approximationEnabled ? input.approximation?.payoutPreset : undefined,
      },
    };
  }

  if (approximationEnabled) {
    warnings.push(
      'Approx mode (M3 beta): field outside your table is compressed into virtual players. Values are estimates.',
    );
  }

  const fullEquities = memoizedIcm(modeledStacks, payouts).map((value) => round(value, 6));
  const fullChipChop = calculateChipChop(modeledStacks, payouts).map((value) => round(value, 6));
  const fullBubbleMatrix = calculateBubbleMatrix(modeledStacks, payouts, fullEquities);
  const equities = fullEquities.slice(0, stacks.length);
  const chipChop = fullChipChop.slice(0, stacks.length);
  const bubbleMatrix = fullBubbleMatrix.slice(0, stacks.length).map((row) =>
    row.slice(0, stacks.length).map((cell) => ({
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
    meta: {
      mode: approximationEnabled ? 'mtt-approx' : 'exact',
      virtualPlayers,
      phase: approximationEnabled ? phase : undefined,
      fieldSize: approximationEnabled ? input.approximation?.fieldSize : undefined,
      payoutPreset: approximationEnabled ? input.approximation?.payoutPreset : undefined,
    },
  };
};
