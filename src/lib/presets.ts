import type { CalculationInput, PlayerInput } from '../types';

export type PresetStack = {
  name: string;
  stack: number;
};

export type PresetDef = {
  id: string;
  label: string;
  stackDefs: PresetStack[];
  payouts: number[];
};

const STACKS_8P: PresetStack[] = [
  { name: 'P1', stack: 60 },
  { name: 'P2', stack: 83 },
  { name: 'P3', stack: 20 },
  { name: 'P4', stack: 71 },
  { name: 'P5', stack: 73 },
  { name: 'P6', stack: 29 },
  { name: 'P7', stack: 36 },
  { name: 'P8', stack: 27 },
];

const STACKS_5P: PresetStack[] = [
  { name: 'P1', stack: 80 },
  { name: 'P2', stack: 55 },
  { name: 'P3', stack: 40 },
  { name: 'P4', stack: 70 },
  { name: 'P5', stack: 55 },
];

const STACKS_3P: PresetStack[] = [
  { name: 'P1', stack: 120 },
  { name: 'P2', stack: 80 },
  { name: 'P3', stack: 100 },
];

export const PRESET_DEFS: PresetDef[] = [
  {
    id: 'A1',
    label: 'A1 - 1000-player FT (8 left)',
    stackDefs: STACKS_8P,
    payouts: [30380, 21920, 15880, 11520, 8340, 6120, 4480, 3280],
  },
  {
    id: 'A1p',
    label: "A1' - 1000-player FT (5 left)",
    stackDefs: STACKS_5P,
    payouts: [30380, 21920, 15880, 11520, 8340],
  },
  {
    id: 'A1pp',
    label: "A1'' - 1000-player FT (3 left)",
    stackDefs: STACKS_3P,
    payouts: [30380, 21920, 15880],
  },
  {
    id: 'A2',
    label: 'A2 - 200-player FT (8 left)',
    stackDefs: STACKS_8P,
    payouts: [7656, 5668, 4196, 3204, 2456, 1924, 1484, 1140],
  },
  {
    id: 'B',
    label: 'B - Satellite top 3 ITM',
    stackDefs: STACKS_8P,
    payouts: [1000, 1000, 1000, 0, 0, 0, 0, 0],
  },
  {
    id: 'Bp',
    label: "B' - Satellite top 6 ITM (flat)",
    stackDefs: STACKS_8P,
    payouts: [1000, 1000, 1000, 1000, 1000, 1000, 0, 0],
  },
  {
    id: 'Bpp',
    label: "B'' - Satellite top 6 ITM (6th = half)",
    stackDefs: STACKS_8P,
    payouts: [1000, 1000, 1000, 1000, 1000, 500, 0, 0],
  },
  {
    id: 'C',
    label: 'C - Winner-take-most',
    stackDefs: STACKS_8P,
    payouts: [40000, 8000, 2400, 800, 300, 150, 100, 50],
  },
  {
    id: 'E',
    label: 'E - Small-field FT (top 6 ITM)',
    stackDefs: STACKS_8P,
    payouts: [4500, 3000, 2000, 1300, 900, 800, 0, 0],
  },
];

export const DEFAULT_PRESET_ID = 'A2';

export const buildPlayersFromPreset = (preset: PresetDef): PlayerInput[] =>
  preset.stackDefs.map((stackDef, index) => ({
    id: crypto.randomUUID(),
    name: stackDef.name || `P${index + 1}`,
    stack: stackDef.stack,
  }));

export const buildInputFromPreset = (
  preset: PresetDef,
  stackUnit: CalculationInput['stackUnit'] = 'bb',
): CalculationInput => ({
  players: buildPlayersFromPreset(preset),
  payouts: [...preset.payouts],
  stackUnit,
});
