import { useEffect, useMemo, useRef, useState } from 'react';
import './app.css';
import type {
  ApproximationConfig,
  ApproximationPhase,
  ApproximationPreset,
  CalculationInput,
  CalculationResult,
  PlayerInput,
} from './types';

const STORAGE_KEY = 'bubble-factor-mtt-state-v1';
const SAVES_KEY = 'bubble-factor-mtt-saves-v1';

const createPlayer = (index: number, stack: number): PlayerInput => ({
  id: crypto.randomUUID(),
  name: `P${index + 1}`,
  stack,
});

const defaultPlayers: PlayerInput[] = [
  { id: crypto.randomUUID(), name: 'UTG', stack: 60.13 },
  { id: crypto.randomUUID(), name: 'UTG1', stack: 83.13 },
  { id: crypto.randomUUID(), name: 'LJ', stack: 20.13 },
  { id: crypto.randomUUID(), name: 'HJ', stack: 71.13 },
  { id: crypto.randomUUID(), name: 'CO', stack: 73.13 },
  { id: crypto.randomUUID(), name: 'BTN', stack: 29.13 },
  { id: crypto.randomUUID(), name: 'SB', stack: 36.13 },
  { id: crypto.randomUUID(), name: 'BB', stack: 27 },
];

const defaultPayouts = [7656, 5668, 4196, 3204, 2456, 1924, 1484, 1140];

type PayoutRange = {
  from: number;
  to: number;
  value: number;
};

const expandPayoutRanges = (ranges: PayoutRange[]): number[] => {
  const payouts: number[] = [];
  ranges.forEach((range) => {
    for (let position = range.from; position <= range.to; position += 1) {
      payouts.push(range.value);
    }
  });
  return payouts;
};

const WIZARD_PAYOUT_PRESETS: Record<
  ApproximationPreset,
  { label: string; fieldSize: 200 | 1000; payouts: number[] }
> = {
  wizard_1000: {
    label: 'MTT 1000 players',
    fieldSize: 1000,
    payouts: expandPayoutRanges([
      { from: 1, to: 1, value: 30380 },
      { from: 2, to: 2, value: 21920 },
      { from: 3, to: 3, value: 15880 },
      { from: 4, to: 4, value: 11520 },
      { from: 5, to: 5, value: 8340 },
      { from: 6, to: 6, value: 6120 },
      { from: 7, to: 7, value: 4480 },
      { from: 8, to: 8, value: 3280 },
      { from: 9, to: 9, value: 2780 },
      { from: 10, to: 10, value: 2040 },
      { from: 11, to: 11, value: 1900 },
      { from: 12, to: 13, value: 1640 },
      { from: 14, to: 14, value: 1540 },
      { from: 15, to: 17, value: 1400 },
      { from: 18, to: 21, value: 1200 },
      { from: 22, to: 23, value: 1100 },
      { from: 24, to: 25, value: 1020 },
      { from: 26, to: 33, value: 920 },
      { from: 34, to: 35, value: 880 },
      { from: 36, to: 41, value: 820 },
      { from: 42, to: 53, value: 760 },
      { from: 54, to: 57, value: 700 },
      { from: 58, to: 73, value: 660 },
      { from: 74, to: 77, value: 620 },
      { from: 78, to: 89, value: 580 },
      { from: 90, to: 101, value: 540 },
      { from: 102, to: 116, value: 460 },
      { from: 117, to: 125, value: 440 },
      { from: 126, to: 150, value: 400 },
    ]),
  },
  wizard_200: {
    label: 'MTT 200 players',
    fieldSize: 200,
    payouts: expandPayoutRanges([
      { from: 1, to: 1, value: 7656 },
      { from: 2, to: 2, value: 5668 },
      { from: 3, to: 3, value: 4196 },
      { from: 4, to: 4, value: 3204 },
      { from: 5, to: 5, value: 2456 },
      { from: 6, to: 6, value: 1924 },
      { from: 7, to: 7, value: 1484 },
      { from: 8, to: 8, value: 1140 },
      { from: 9, to: 9, value: 888 },
      { from: 10, to: 11, value: 748 },
      { from: 12, to: 13, value: 676 },
      { from: 14, to: 17, value: 596 },
      { from: 18, to: 23, value: 512 },
      { from: 24, to: 30, value: 440 },
    ]),
  },
};

const PRESET_OPTIONS: Array<{ value: ApproximationPreset; label: string }> = [
  { value: 'wizard_1000', label: 'MTT 1000 players' },
  { value: 'wizard_200', label: 'MTT 200 players' },
];

const normalizeApproximationPreset = (value: unknown): ApproximationPreset =>
  typeof value === 'string' && PRESET_OPTIONS.some((option) => option.value === value)
    ? (value as ApproximationPreset)
    : 'wizard_1000';

const defaultState: CalculationInput = {
  players: defaultPlayers,
  payouts: defaultPayouts,
  stackUnit: 'bb',
  approximation: {
    enabled: false,
    fieldSize: 1000,
    phase: 'phase_near_bubble',
    payoutPreset: 'wizard_1000',
  },
};

const PHASE_OPTIONS: Array<{ value: ApproximationPhase; label: string }> = [
  { value: 'phase_50', label: '50%' },
  { value: 'phase_25', label: '25%' },
  { value: 'phase_18', label: '18%' },
  { value: 'phase_16', label: '16%' },
  { value: 'phase_near_bubble', label: 'Near bubble' },
  { value: 'phase_10', label: '10%' },
  { value: 'phase_5', label: '5%' },
];

const normalizeApproximationPhase = (value: unknown): ApproximationPhase =>
  typeof value === 'string' && PHASE_OPTIONS.some((option) => option.value === value)
    ? (value as ApproximationPhase)
    : 'phase_near_bubble';

type WorkerResponse = {
  type: 'result';
  requestKey: string;
  payload: CalculationResult;
};

type SavedScenario = {
  id: string;
  name: string;
  savedAt: string;
  input: CalculationInput;
};

type ActiveCell = {
  rowIndex: number;
  columnIndex: number;
};

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const valueFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const bubbleFactorFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const formatRiskPremium = (value: number | null): string =>
  value === null ? '-' : `${value > 0 ? '+' : ''}${Math.round(value)}%`;

const formatBubbleFactor = (value: number | null): string =>
  value === null ? '-' : bubbleFactorFormatter.format(value);

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;

const readInitialState = (): CalculationInput => {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(saved) as CalculationInput;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.payouts)) {
      return defaultState;
    }

    const approximationConfig: ApproximationConfig =
      typeof parsed.approximation === 'object' && parsed.approximation !== null
        ? (() => {
            const inferredPreset =
              parsed.approximation.payoutPreset ??
              (parsed.approximation.fieldSize === 200 ? 'wizard_200' : 'wizard_1000');
            const payoutPreset = normalizeApproximationPreset(inferredPreset);
            return {
              enabled: Boolean(parsed.approximation.enabled),
              fieldSize: WIZARD_PAYOUT_PRESETS[payoutPreset].fieldSize,
              phase: normalizeApproximationPhase(parsed.approximation.phase),
              payoutPreset,
            };
          })()
        : {
            enabled: false,
            fieldSize: 1000,
            phase: 'phase_near_bubble',
            payoutPreset: 'wizard_1000',
          };

    return {
      players: parsed.players.map((player, index) => ({
        id: player.id || crypto.randomUUID(),
        name: player.name || `P${index + 1}`,
        stack: Number.isFinite(player.stack) ? player.stack : 0,
      })),
      payouts: parsed.payouts.map((payout) => (Number.isFinite(payout) ? payout : 0)),
      stackUnit: parsed.stackUnit === 'chips' ? 'chips' : 'bb',
      approximation: approximationConfig,
    };
  } catch {
    return defaultState;
  }
};

const readSavedScenarios = (): SavedScenario[] => {
  const saved = window.localStorage.getItem(SAVES_KEY);
  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved) as SavedScenario[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (scenario) =>
        typeof scenario.id === 'string' &&
        typeof scenario.name === 'string' &&
        typeof scenario.savedAt === 'string' &&
        typeof scenario.input === 'object' &&
        scenario.input !== null,
    );
  } catch {
    return [];
  }
};

const getCellTone = (bubbleFactor: number | null): string => {
  if (bubbleFactor === null) {
    return 'cell-neutral';
  }

  if (bubbleFactor >= 2.1) {
    return 'cell-hot';
  }

  if (bubbleFactor >= 1.6) {
    return 'cell-warm';
  }

  if (bubbleFactor >= 1.25) {
    return 'cell-mid';
  }

  return 'cell-cool';
};

const parseNumber = (value: string): number => {
  if (value.trim() === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseNonNegativeNumber = (value: string): number => {
  const parsed = parseNumber(value);
  return parsed < 0 ? 0 : parsed;
};

function App() {
  const [input, setInput] = useState<CalculationInput>(() => readInitialState());
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [completedRequestKey, setCompletedRequestKey] = useState('');
  const [inFlightRequestKey, setInFlightRequestKey] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => readSavedScenarios());
  const [saveName, setSaveName] = useState('Final table sample');
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestKey = useMemo(() => JSON.stringify(input), [input]);
  const isCalculating = inFlightRequestKey !== null;
  const needsRecalculation = completedRequestKey !== requestKey;
  const isApproxMode = Boolean(input.approximation?.enabled);
  const currentPreset = input.approximation?.payoutPreset ?? 'wizard_1000';
  const currentPresetDef = WIZARD_PAYOUT_PRESETS[currentPreset];
  const phaseLabel =
    PHASE_OPTIONS.find((option) => option.value === (input.approximation?.phase ?? 'phase_near_bubble'))
      ?.label ?? 'Near bubble';

  useEffect(() => {
    const worker = new Worker(new URL('./workers/calculatorWorker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type !== 'result') {
        return;
      }

      setResult(event.data.payload);
      setCompletedRequestKey(event.data.requestKey);
      setInFlightRequestKey(null);
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
  }, [input]);

  useEffect(() => {
    window.localStorage.setItem(SAVES_KEY, JSON.stringify(savedScenarios));
  }, [savedScenarios]);

  const visiblePlayers = useMemo(
    () => input.players.filter((player) => player.stack > 0),
    [input.players],
  );

  const totalPrizePool = useMemo(() => input.payouts.reduce((total, payout) => total + payout, 0), [input.payouts]);
  const totalChips = useMemo(
    () => visiblePlayers.reduce((total, player) => total + player.stack, 0),
    [visiblePlayers],
  );
  const averageStack = useMemo(
    () => (visiblePlayers.length > 0 ? totalChips / visiblePlayers.length : 0),
    [totalChips, visiblePlayers.length],
  );

  const chipLeaderStack = useMemo(
    () => (visiblePlayers.length > 0 ? Math.max(...visiblePlayers.map((p) => p.stack)) : 0),
    [visiblePlayers],
  );

  const shortStackVal = useMemo(
    () => (visiblePlayers.length > 0 ? Math.min(...visiblePlayers.map((p) => p.stack)) : 0),
    [visiblePlayers],
  );

  const getPlayerEmoji = (stack: number): string => {
    if (visiblePlayers.length < 2 || chipLeaderStack === shortStackVal) return '';
    if (stack === chipLeaderStack) return '👑';
    if (stack === shortStackVal) return '💀';
    return '';
  };

  const updatePlayer = (playerId: string, nextValue: Partial<PlayerInput>) => {
    setInput((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, ...nextValue } : player,
      ),
    }));
  };

  const updatePayout = (index: number, value: number) => {
    setInput((current) => ({
      ...current,
      payouts: current.payouts.map((payout, payoutIndex) =>
        payoutIndex === index ? value : payout,
      ),
    }));
  };

  const addPlayer = () => {
    setInput((current) => ({
      ...current,
      players: [...current.players, createPlayer(current.players.length, 0)],
      payouts: [...current.payouts, 0],
    }));
  };

  const removePlayer = (playerId: string) => {
    setInput((current) => {
      if (current.players.length <= 2) {
        return current;
      }

      const nextPlayers = current.players.filter((player) => player.id !== playerId);
      return {
        ...current,
        players: nextPlayers,
        payouts: current.payouts.slice(0, nextPlayers.length),
      };
    });
  };

  const addPayout = () => {
    setInput((current) => ({
      ...current,
      payouts: [...current.payouts, 0],
    }));
  };

  const removePayout = (index: number) => {
    setInput((current) => {
      if (current.payouts.length <= 1) {
        return current;
      }

      return {
        ...current,
        payouts: current.payouts.filter((_, payoutIndex) => payoutIndex !== index),
      };
    });
  };

  const loadSample = () => {
    setInput(defaultState);
  };

  const saveScenario = () => {
    const trimmed = saveName.trim();
    const scenario: SavedScenario = {
      id: crypto.randomUUID(),
      name: trimmed || `Scenario ${savedScenarios.length + 1}`,
      savedAt: new Date().toISOString(),
      input,
    };

    setSavedScenarios((current) => [scenario, ...current].slice(0, 12));
    setSaveName(scenario.name);
  };

  const loadScenario = (scenario: SavedScenario) => {
    setInput(scenario.input);
  };

  const deleteScenario = (scenarioId: string) => {
    setSavedScenarios((current) => current.filter((scenario) => scenario.id !== scenarioId));
  };

  const exportScenario = () => {
    const payload = JSON.stringify(input, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (saveName.trim() || 'bubble-factor-scenario')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    link.href = url;
    link.download = `${safeName || 'bubble-factor-scenario'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runCalculation = () => {
    if (!workerRef.current || isCalculating) {
      return;
    }

    setInFlightRequestKey(requestKey);
    setActiveCell(null);
    workerRef.current.postMessage({
      type: 'calculate',
      requestKey,
      payload: input,
    });
  };

  const applyApproximationPreset = (preset: ApproximationPreset) => {
    const presetDef = WIZARD_PAYOUT_PRESETS[preset];
    setInput((current) => ({
      ...current,
      payouts: [...presetDef.payouts],
      approximation: {
        enabled: true,
        fieldSize: presetDef.fieldSize,
        phase: current.approximation?.phase ?? 'phase_near_bubble',
        payoutPreset: preset,
      },
    }));
  };

  const activeCellData = useMemo(() => {
    if (!activeCell || !result) {
      return null;
    }

    const rowPlayer = visiblePlayers[activeCell.rowIndex];
    const columnPlayer = visiblePlayers[activeCell.columnIndex];
    const cell = result.bubbleMatrix[activeCell.rowIndex]?.[activeCell.columnIndex];

    if (!rowPlayer || !columnPlayer || !cell) {
      return null;
    }

    return {
      rowPlayer,
      columnPlayer,
      cell,
    };
  }, [activeCell, result, visiblePlayers]);

  const matrixAverages = useMemo(() => {
    if (!result) {
      return null;
    }

    const call = visiblePlayers.map((_, rowIndex) => {
      const bfValues: number[] = [];
      const rpValues: number[] = [];
      const row = result.bubbleMatrix[rowIndex] ?? [];

      row.forEach((cell, columnIndex) => {
        if (rowIndex === columnIndex || !cell) {
          return;
        }

        if (cell.bubbleFactor !== null) {
          bfValues.push(cell.bubbleFactor);
        }
        if (cell.riskPremium !== null) {
          rpValues.push(cell.riskPremium);
        }
      });

      return {
        bubbleFactor: average(bfValues),
        riskPremium: average(rpValues),
      };
    });

    const shove = visiblePlayers.map((_, columnIndex) => {
      const bfValues: number[] = [];
      const rpValues: number[] = [];

      visiblePlayers.forEach((__, rowIndex) => {
        if (rowIndex === columnIndex) {
          return;
        }

        const cell = result.bubbleMatrix[rowIndex]?.[columnIndex];
        if (!cell) {
          return;
        }

        if (cell.bubbleFactor !== null) {
          bfValues.push(cell.bubbleFactor);
        }
        if (cell.riskPremium !== null) {
          rpValues.push(cell.riskPremium);
        }
      });

      return {
        bubbleFactor: average(bfValues),
        riskPremium: average(rpValues),
      };
    });

    return { call, shove };
  }, [result, visiblePlayers]);

  return (
    <div className="app-shell">
      <main className="app">
        <section className="hero">
          <div>
            <p className="eyebrow">Privacy-first · Works offline</p>
            <h1>Bubble Factor MTT</h1>
            <p className="hero-copy">
              Exact ICM, Chip Chop, Bubble Factor, and Risk Premium.
            </p>
          </div>
          <div className="hero-controls">
            <div className="pill-row">
              <button
                type="button"
                className={input.stackUnit === 'bb' ? 'pill active' : 'pill'}
                onClick={() => setInput((current) => ({ ...current, stackUnit: 'bb' }))}
              >
                BB
              </button>
              <button
                type="button"
                className={input.stackUnit === 'chips' ? 'pill active' : 'pill'}
                onClick={() => setInput((current) => ({ ...current, stackUnit: 'chips' }))}
              >
                Chips
              </button>
            </div>
            <div className="pill-row">
              <button
                type="button"
                className={!isApproxMode ? 'pill active' : 'pill'}
                onClick={() =>
                  setInput((current) => ({
                    ...current,
                    approximation: {
                      enabled: false,
                      fieldSize: current.approximation?.fieldSize ?? currentPresetDef.fieldSize,
                      phase: current.approximation?.phase ?? 'phase_near_bubble',
                      payoutPreset: current.approximation?.payoutPreset ?? 'wizard_1000',
                    },
                  }))
                }
              >
                Exact FT
              </button>
              <button
                type="button"
                className={isApproxMode ? 'pill active' : 'pill'}
                onClick={() =>
                  applyApproximationPreset(currentPreset)
                }
              >
                M3 Approx
              </button>
            </div>
            {isApproxMode ? (
              <>
                <label className="phase-select">
                  <span>Wizard payout preset (field size)</span>
                  <select
                    value={currentPreset}
                    onChange={(event) => {
                      const nextPreset = normalizeApproximationPreset(event.target.value);
                      applyApproximationPreset(nextPreset);
                    }}
                  >
                    {PRESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="phase-select">
                  <span>{input.approximation?.fieldSize ?? currentPresetDef.fieldSize}-player phase</span>
                  <select
                    value={input.approximation?.phase ?? 'phase_near_bubble'}
                    onChange={(event) => {
                      const nextPhase = event.target.value as ApproximationPhase;
                      setInput((current) => ({
                        ...current,
                        approximation: {
                          enabled: true,
                          fieldSize: current.approximation?.fieldSize ?? currentPresetDef.fieldSize,
                          phase: nextPhase,
                          payoutPreset: current.approximation?.payoutPreset ?? currentPreset,
                        },
                      }));
                    }}
                  >
                    {PHASE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </div>
        </section>

        <section className="summary-grid">
          <article className="stat-card">
            <span className="stat-label">Players</span>
            <strong>{visiblePlayers.length}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Stacks</span>
            <strong>{numberFormatter.format(totalChips)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Avg stack</span>
            <strong>{numberFormatter.format(averageStack)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Payouts</span>
            <strong>{input.payouts.length}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Prize pool</span>
            <strong>{valueFormatter.format(totalPrizePool)}</strong>
          </article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Players</h2>
            <div className="action-row">
              <button type="button" className="ghost-button" onClick={loadSample}>
                Sample
              </button>
              <button type="button" className="primary-button" onClick={addPlayer}>
                Add
              </button>
            </div>
          </div>
          <div className="list-grid">
            {input.players.map((player, index) => (
              <div className="input-row" key={player.id}>
                <label>
                  <span>
                    Name
                    {getPlayerEmoji(player.stack) && (
                      <span className="player-badge">{getPlayerEmoji(player.stack)}</span>
                    )}
                  </span>
                  <input
                    value={player.name}
                    onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                  />
                </label>
                <label>
                  <span>{input.stackUnit === 'bb' ? 'Stack (BB)' : 'Stack'}</span>
                  <input
                    inputMode="decimal"
                    min={0}
                    value={player.stack}
                    onChange={(event) =>
                      updatePlayer(player.id, { stack: parseNonNegativeNumber(event.target.value) })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove player ${index + 1}`}
                  onClick={() => removePlayer(player.id)}
                >
                  -
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Payouts</h2>
            <button type="button" className="primary-button" onClick={addPayout}>
              Add
            </button>
          </div>
          <div className="list-grid">
            {input.payouts.map((payout, index) => (
              <div className="input-row compact" key={`payout-${index}`}>
                <label>
                  <span>#{index + 1}</span>
                  <input
                    inputMode="decimal"
                    value={payout}
                    onChange={(event) => updatePayout(index, parseNumber(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove payout ${index + 1}`}
                  onClick={() => removePayout(index)}
                >
                  -
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Scenarios</h2>
              <p className="helper-copy">Quick save, reload, or export your current setup.</p>
            </div>
          </div>
          <div className="save-bar">
            <label className="grow">
              <span>Scenario name</span>
              <input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <button type="button" className="ghost-button" onClick={exportScenario}>
              Export
            </button>
            <button type="button" className="primary-button" onClick={saveScenario}>
              Save
            </button>
          </div>
          {savedScenarios.length > 0 ? (
            <div className="scenario-list">
              {savedScenarios.map((scenario) => (
                <article className="scenario-card" key={scenario.id}>
                  <div>
                    <strong>{scenario.name}</strong>
                    <p>{new Date(scenario.savedAt).toLocaleString('en-US')}</p>
                  </div>
                  <div className="action-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => loadScenario(scenario)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${scenario.name}`}
                      onClick={() => deleteScenario(scenario.id)}
                    >
                      -
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No saved scenarios yet.</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Results</h2>
              <p className="helper-copy">
                Manual mode: press Recalculate after edits.
                {result?.meta?.mode === 'mtt-approx'
                  ? ` Approx estimate active (${result.meta.fieldSize ?? currentPresetDef.fieldSize}-player, ${phaseLabel}, ${WIZARD_PAYOUT_PRESETS[result.meta.payoutPreset ?? currentPreset].label}).`
                  : ''}
              </p>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={runCalculation}
                disabled={isCalculating || !needsRecalculation}
              >
                {isCalculating ? 'Calculating…' : 'Recalculate'}
              </button>
              <span className={isCalculating ? 'status-chip live' : 'status-chip'}>
                {isCalculating ? 'Calculating' : needsRecalculation ? 'Needs recalc' : 'Ready'}
              </span>
            </div>
          </div>

          {result?.warnings.length ? (
            <div className="warning-box" role="status">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Stack</th>
                  <th>ICM</th>
                  <th>Chip Chop</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((player, index) => (
                  <tr key={player.id}>
                    <td>
                      {player.name}
                      {getPlayerEmoji(player.stack) && (
                        <span className="player-badge">{getPlayerEmoji(player.stack)}</span>
                      )}
                    </td>
                    <td>{numberFormatter.format(player.stack)}</td>
                    <td>{result ? valueFormatter.format(result.equities[index] ?? 0) : '-'}</td>
                    <td>{result ? valueFormatter.format(result.chipChop[index] ?? 0) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Bubble Factor Matrix</h2>
              <p className="helper-copy">Top = Risk Premium. Bottom = Bubble Factor.</p>
            </div>
            <div className="legend">
              <span className="legend-item">
                <i className="legend-swatch cool" />
                Low
              </span>
              <span className="legend-item">
                <i className="legend-swatch hot" />
                High
              </span>
            </div>
          </div>

          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="sticky">Call vs shove</th>
                  {visiblePlayers.map((player, columnIndex) => (
                    <th key={`head-${player.id}`}>
                      <span>
                        {player.name}
                        {getPlayerEmoji(player.stack) && (
                          <span className="player-badge">{getPlayerEmoji(player.stack)}</span>
                        )}
                      </span>
                      <span className="matrix-header-stack">
                        {numberFormatter.format(player.stack)}
                        {input.stackUnit === 'bb' ? ' BB' : ''}
                      </span>
                      <span className="matrix-header-avg">
                        Shove BF {formatBubbleFactor(matrixAverages?.shove[columnIndex]?.bubbleFactor ?? null)} / RP{' '}
                        {formatRiskPremium(matrixAverages?.shove[columnIndex]?.riskPremium ?? null)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((rowPlayer, rowIndex) => (
                  <tr key={`row-${rowPlayer.id}`}>
                    <th className="sticky">
                      <span>
                        {rowPlayer.name}
                        {getPlayerEmoji(rowPlayer.stack) && (
                          <span className="player-badge">{getPlayerEmoji(rowPlayer.stack)}</span>
                        )}
                      </span>
                      <span className="matrix-header-stack">
                        {numberFormatter.format(rowPlayer.stack)}
                        {input.stackUnit === 'bb' ? ' BB' : ''}
                      </span>
                      <span className="matrix-header-avg">
                        Call BF {formatBubbleFactor(matrixAverages?.call[rowIndex]?.bubbleFactor ?? null)} / RP{' '}
                        {formatRiskPremium(matrixAverages?.call[rowIndex]?.riskPremium ?? null)}
                      </span>
                    </th>
                    {visiblePlayers.map((columnPlayer, columnIndex) => {
                      const cell = result?.bubbleMatrix[rowIndex]?.[columnIndex];
                      const toneClass = getCellTone(cell?.bubbleFactor ?? null);

                      return (
                        <td
                          key={`cell-${rowPlayer.id}-${columnPlayer.id}`}
                          className={`matrix-cell ${toneClass}`}
                        >
                          {rowIndex === columnIndex || !cell ? (
                            <span className="cell-empty">-</span>
                          ) : (
                            <button
                              type="button"
                              className="matrix-button"
                              aria-label={`${rowPlayer.name} calling versus ${columnPlayer.name} shove`}
                              onClick={() =>
                                setActiveCell({
                                  rowIndex,
                                  columnIndex,
                                })
                              }
                            >
                              <span className="cell-top">
                                {formatRiskPremium(cell.riskPremium)}
                              </span>
                              <span className="cell-bottom">
                                {cell.bubbleFactor === null
                                  ? '-'
                                  : bubbleFactorFormatter.format(cell.bubbleFactor)}
                              </span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {activeCellData ? (
          <div
            className="sheet-backdrop"
            role="presentation"
            onClick={() => setActiveCell(null)}
          >
            <section
              className="detail-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Bubble factor detail"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Cell detail</p>
                  <h2>{activeCellData.rowPlayer.name} vs {activeCellData.columnPlayer.name}</h2>
                  <p className="helper-copy">
                    Row player is calling. Column player is shoving.
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close detail"
                  onClick={() => setActiveCell(null)}
                >
                  ×
                </button>
              </div>
              <div className="detail-grid">
                <article className="detail-card">
                  <span>Risk Premium</span>
                  <strong>
                    {activeCellData.cell.riskPremium === null
                      ? 'N/A'
                      : formatRiskPremium(activeCellData.cell.riskPremium)}
                  </strong>
                </article>
                <article className="detail-card">
                  <span>Bubble Factor</span>
                  <strong>
                    {activeCellData.cell.bubbleFactor === null
                      ? 'N/A'
                      : bubbleFactorFormatter.format(activeCellData.cell.bubbleFactor)}
                  </strong>
                </article>
                <article className="detail-card">
                  <span>Required equity</span>
                  <strong>
                    {activeCellData.cell.requiredEquity === null
                      ? 'N/A'
                      : `${activeCellData.cell.requiredEquity}%`}
                  </strong>
                </article>
              </div>
              <p className="sheet-note">
                Study mode assumption: symmetric all-in, no blinds, no antes, no side pots, 50%
                chip-EV baseline for Risk Premium.
              </p>
            </section>
          </div>
        ) : null}
      </main>

      <footer className="app-footer">
        <p>
          Open-source software — algorithm is fully verifiable.{' '}
          <a
            href="https://github.com/piyoSakai/bubble-factor-mtt"
            target="_blank"
            rel="noopener noreferrer"
          >
            Clone, fork, or contribute on GitHub
          </a>
          . Commercial use permitted under the{' '}
          <a
            href="https://github.com/piyoSakai/bubble-factor-mtt/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT License
          </a>
          .
        </p>
        <p>
          &copy; 2026{' '}
          <a
            href="https://x.com/YEBISU_NLH"
            target="_blank"
            rel="noopener noreferrer"
          >
            YEBISU
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
