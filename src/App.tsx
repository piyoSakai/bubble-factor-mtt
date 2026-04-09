import { useEffect, useMemo, useRef, useState } from 'react';
import './app.css';
import type { CalculationInput, CalculationResult, PlayerInput } from './types';
import DrillPage from './DrillPage';
import {
  buildInputFromPreset,
  buildPlayersFromPreset,
  DEFAULT_PRESET_ID,
  PRESET_DEFS,
} from './lib/presets';

const STORAGE_KEY = 'bubble-factor-mtt-state-v1';
const SAVES_KEY = 'bubble-factor-mtt-saves-v1';

const createPlayer = (index: number, stack: number): PlayerInput => ({
  id: crypto.randomUUID(),
  name: `P${index + 1}`,
  stack,
});

const defaultPreset = PRESET_DEFS.find((preset) => preset.id === DEFAULT_PRESET_ID) ?? PRESET_DEFS[0];
if (!defaultPreset) {
  throw new Error('No presets configured.');
}
const defaultPlayers: PlayerInput[] = buildPlayersFromPreset(defaultPreset);
const defaultPayouts = [...defaultPreset.payouts];

const defaultState: CalculationInput = {
  players: defaultPlayers,
  payouts: defaultPayouts,
  stackUnit: 'bb',
};

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

type AppView = 'calculator' | 'drill';

const readViewFromHash = (): AppView => (window.location.hash === '#/drill' ? 'drill' : 'calculator');

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

    return {
      players: parsed.players.map((player, index) => ({
        id: player.id || crypto.randomUUID(),
        name: player.name || `P${index + 1}`,
        stack: Number.isFinite(player.stack) ? player.stack : 0,
      })),
      payouts: parsed.payouts.map((payout) => (Number.isFinite(payout) ? payout : 0)),
      stackUnit: parsed.stackUnit === 'chips' ? 'chips' : 'bb',
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
  const [view, setView] = useState<AppView>(() => readViewFromHash());
  const [input, setInput] = useState<CalculationInput>(() => readInitialState());
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [completedRequestKey, setCompletedRequestKey] = useState('');
  const [inFlightRequestKey, setInFlightRequestKey] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => readSavedScenarios());
  const [saveName, setSaveName] = useState('Final table sample');
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [matrixFitMode, setMatrixFitMode] = useState(false);
  const [matrixScale, setMatrixScale] = useState(1);
  const [matrixScaledHeight, setMatrixScaledHeight] = useState<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const matrixViewportRef = useRef<HTMLDivElement | null>(null);
  const matrixTableRef = useRef<HTMLTableElement | null>(null);
  const requestKey = useMemo(() => JSON.stringify(input), [input]);
  const isCalculating = inFlightRequestKey !== null;
  const needsRecalculation = completedRequestKey !== requestKey;

  useEffect(() => {
    const onHashChange = () => setView(readViewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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

  useEffect(() => {
    if (!matrixFitMode) {
      return;
    }

    const viewport = matrixViewportRef.current;
    const table = matrixTableRef.current;
    if (!viewport || !table) {
      return;
    }

    const updateScale = () => {
      const availableWidth = viewport.clientWidth;
      const naturalWidth = table.scrollWidth;
      const naturalHeight = table.scrollHeight;
      if (availableWidth <= 0 || naturalWidth <= 0) {
        return;
      }

      const nextScale = Math.min(1, availableWidth / naturalWidth);
      const nextHeight = naturalHeight * nextScale;

      setMatrixScale((current) => (Math.abs(current - nextScale) > 0.001 ? nextScale : current));
      setMatrixScaledHeight((current) =>
        current === null || Math.abs(current - nextHeight) > 1 ? nextHeight : current,
      );
    };

    const frameId = window.requestAnimationFrame(updateScale);

    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(viewport);
    resizeObserver.observe(table);
    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [matrixFitMode, result, input.players, input.stackUnit]);

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

  const loadPreset = (presetId: string) => {
    const preset = PRESET_DEFS.find((p) => p.id === presetId);
    if (!preset) {
      return;
    }
    setInput(buildInputFromPreset(preset, 'bb'));
  };

  const navigateTo = (nextView: AppView) => {
    const nextHash = nextView === 'drill' ? '#/drill' : '#/';
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
      return;
    }
    setView(nextView);
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
      <div className="view-switch" role="tablist" aria-label="Page switch">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'calculator'}
          className={view === 'calculator' ? 'pill active' : 'pill'}
          onClick={() => navigateTo('calculator')}
        >
          Calculator
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'drill'}
          className={view === 'drill' ? 'pill active' : 'pill'}
          onClick={() => navigateTo('drill')}
        >
          BF Drill
        </button>
      </div>

      {view === 'drill' ? <DrillPage /> : <main className="app">
        <section className="hero">
          <div>
            <p className="eyebrow">Privacy-first · Works offline</p>
            <h1>Bubble Factor MTT</h1>
            <p className="hero-copy">
              Exact ICM, Chip Chop, Bubble Factor, and Risk Premium.
            </p>
          </div>
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
            <button type="button" className="primary-button" onClick={addPlayer}>
              Add
            </button>
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
            <h2>Scenarios</h2>
          </div>

          {/* Preset loader */}
          <select
            className="preset-select preset-select--block"
            value=""
            onChange={(e) => {
              loadPreset(e.target.value);
              e.target.value = '';
            }}
            aria-label="Load preset scenario"
          >
            <option value="" disabled>
              Load preset…
            </option>
            {PRESET_DEFS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>

          {/* Saved scenarios */}
          {savedScenarios.length > 0 && (
            <div className="scenario-list scenario-list--spaced">
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
          )}

          {/* Save — subtle, at the bottom */}
          <div className="save-bar save-bar--subtle">
            <label className="grow">
              <span>Save current setup</span>
              <input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <button type="button" className="ghost-button" onClick={exportScenario}>
              Export
            </button>
            <button type="button" className="ghost-button" onClick={saveScenario}>
              Save
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Results</h2>
              <p className="helper-copy">Manual mode: press Recalculate after edits.</p>
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
              <p className="helper-copy">
                Top = Risk Premium. Bottom = Bubble Factor. Use &quot;Fit to screen&quot; for sharing screenshots.
              </p>
            </div>
            <div className="matrix-tools">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setMatrixFitMode((current) => !current)}
              >
                {matrixFitMode ? 'Scrollable view' : 'Fit to screen'}
              </button>
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
          </div>

          <div className={`matrix-wrap ${matrixFitMode ? 'fit' : ''}`} ref={matrixViewportRef}>
            <div
              className="matrix-fit-stage"
              style={matrixFitMode && matrixScaledHeight !== null ? { height: `${matrixScaledHeight}px` } : undefined}
            >
              <table
                ref={matrixTableRef}
                className="matrix"
                style={
                  matrixFitMode
                    ? {
                        transform: `scale(${matrixScale})`,
                        transformOrigin: 'top left',
                      }
                    : undefined
                }
              >
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
      </main>}

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
