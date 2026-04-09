export type StackUnit = 'chips' | 'bb';

export type PlayerInput = {
  id: string;
  name: string;
  stack: number;
};

export type CalculationInput = {
  players: PlayerInput[];
  payouts: number[];
  stackUnit: StackUnit;
};

export type MatrixCell = {
  bubbleFactor: number | null;
  riskPremium: number | null;
  requiredEquity: number | null;
};

export type CalculationResult = {
  equities: number[];
  chipChop: number[];
  bubbleMatrix: MatrixCell[][];
  warnings: string[];
};
