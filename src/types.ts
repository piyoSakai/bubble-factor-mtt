export type StackUnit = 'chips' | 'bb';

export type ApproximationPhase =
  | 'phase_50'
  | 'phase_25'
  | 'phase_18'
  | 'phase_16'
  | 'phase_near_bubble'
  | 'phase_10'
  | 'phase_5';

export type ApproximationPreset = 'wizard_1000' | 'wizard_200';

export type ApproximationConfig = {
  enabled: boolean;
  fieldSize: number;
  phase: ApproximationPhase;
  payoutPreset: ApproximationPreset;
};

export type PlayerInput = {
  id: string;
  name: string;
  stack: number;
};

export type CalculationInput = {
  players: PlayerInput[];
  payouts: number[];
  stackUnit: StackUnit;
  approximation?: ApproximationConfig;
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
  meta?: {
    mode: 'exact' | 'mtt-approx';
    virtualPlayers: number;
    phase?: ApproximationPhase;
    fieldSize?: number;
    payoutPreset?: ApproximationPreset;
  };
};
