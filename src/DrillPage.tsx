import { useCallback, useMemo, useState } from 'react';
import { calculateAll } from './lib/calculations';
import { DEFAULT_PRESET_ID, PRESET_DEFS } from './lib/presets';
import type { CalculationInput, CalculationResult } from './types';

const RELATIVE_ERROR_EPSILON = 1e-6;
const STREAK_SUCCESS_THRESHOLD = 0.15;

type AvgStack = 20 | 40 | 60;
const AVG_STACK_OPTIONS: AvgStack[] = [20, 40, 60];

type DrillRound = {
  presetId: string;
  avgStack: AvgStack;
  input: CalculationInput;
  result: CalculationResult;
  callerIndex: number;
};

type ScoredCell = {
  opponentIndex: number;
  guess: number;
  actual: number;
  relativeError: number;
  cellScore: number;
};

const bfFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const stackFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const scoreFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

// Box-Muller transform for normal random variable
const randNormal = (): number => {
  const u = Math.max(Math.random(), 1e-10);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// Log-normal stack generation: σ=0.65 gives a realistic tournament spread
const generateRandomStacks = (playerCount: number, targetAvg: AvgStack): number[] => {
  const SIGMA = 0.65;
  const raw = Array.from({ length: playerCount }, () => Math.exp(randNormal() * SIGMA));
  const mean = raw.reduce((a, b) => a + b, 0) / playerCount;
  return raw.map((v) => Math.max(1, Math.round((v / mean) * targetAvg)));
};

const getRandomCallerIndex = (playerCount: number): number =>
  Math.floor(Math.random() * playerCount);

const parseGuess = (value: string): number | null => {
  if (value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const computeRoundScore = (
  round: DrillRound,
  guessInputs: string[],
): {
  scoredCells: ScoredCell[];
  roundScore: number;
  streakSuccess: boolean;
} => {
  const cells: ScoredCell[] = [];
  const matrixRow = round.result.bubbleMatrix[round.callerIndex] ?? [];

  matrixRow.forEach((cell, opponentIndex) => {
    if (opponentIndex === round.callerIndex || cell.bubbleFactor === null) {
      return;
    }

    const guess = parseGuess(guessInputs[opponentIndex]);
    if (guess === null) {
      return;
    }

    const actual = cell.bubbleFactor;
    const relativeError =
      Math.abs(guess - actual) / Math.max(Math.abs(actual), RELATIVE_ERROR_EPSILON);
    const cellScore = 100 * Math.max(0, 1 - relativeError);

    cells.push({ opponentIndex, guess, actual, relativeError, cellScore });
  });

  if (cells.length === 0) {
    return { scoredCells: [], roundScore: 0, streakSuccess: false };
  }

  const roundScore = cells.reduce((acc, cell) => acc + cell.cellScore, 0) / cells.length;
  const streakSuccess = cells.every((cell) => cell.relativeError <= STREAK_SUCCESS_THRESHOLD);

  return { scoredCells: cells, roundScore, streakSuccess };
};

const createDrillRound = (presetId: string, avgStack: AvgStack): DrillRound | null => {
  const preset = PRESET_DEFS.find((item) => item.id === presetId);
  if (!preset) {
    return null;
  }

  const playerCount = preset.stackDefs.length;
  const stacks = generateRandomStacks(playerCount, avgStack);
  const input: CalculationInput = {
    players: stacks.map((stack, index) => ({
      id: crypto.randomUUID(),
      name: `P${index + 1}`,
      stack,
    })),
    payouts: [...preset.payouts],
    stackUnit: 'bb',
  };

  const result = calculateAll(input);
  const callerIndex = getRandomCallerIndex(playerCount);

  return { presetId, avgStack, input, result, callerIndex };
};

const DEFAULT_AVG_STACK: AvgStack = 40;

function DrillPage() {
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET_ID);
  const [avgStack, setAvgStack] = useState<AvgStack>(DEFAULT_AVG_STACK);
  const initialRound = useMemo(
    () => createDrillRound(DEFAULT_PRESET_ID, DEFAULT_AVG_STACK),
    [],
  );
  const [round, setRound] = useState<DrillRound | null>(initialRound);
  const [guessInputs, setGuessInputs] = useState<string[]>(() =>
    Array.from({ length: initialRound?.input.players.length ?? 0 }, () => ''),
  );
  const [submitted, setSubmitted] = useState(false);
  const [streak, setStreak] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(null);

  const startRound = useCallback((presetId: string, avg: AvgStack) => {
    const nextRound = createDrillRound(presetId, avg);
    if (!nextRound) {
      return;
    }
    setRound(nextRound);
    setGuessInputs(Array.from({ length: nextRound.input.players.length }, () => ''));
    setSubmitted(false);
  }, []);

  const caller = round?.input.players[round.callerIndex] ?? null;

  const scoreSummary = useMemo(() => {
    if (!round || !submitted) {
      return null;
    }
    return computeRoundScore(round, guessInputs);
  }, [guessInputs, round, submitted]);

  const handleSubmit = () => {
    if (!round) {
      return;
    }
    const summary = computeRoundScore(round, guessInputs);
    setSubmitted(true);
    setLastScore(summary.roundScore);
    setBestScore((current) =>
      current === null ? summary.roundScore : Math.max(current, summary.roundScore),
    );
    setStreak((current) => (summary.streakSuccess ? current + 1 : 0));
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    startRound(presetId, avgStack);
  };

  const handleAvgStackChange = (avg: AvgStack) => {
    setAvgStack(avg);
    startRound(selectedPresetId, avg);
  };

  const scoredByOpponent = useMemo(() => {
    const map = new Map<number, ScoredCell>();
    scoreSummary?.scoredCells.forEach((cell) => map.set(cell.opponentIndex, cell));
    return map;
  }, [scoreSummary]);

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Drill mode · Exact ICM</p>
          <h1>BF Drill</h1>
          <p className="hero-copy">
            One caller row is hidden. Enter your BF guesses, then hit Submit to score.
          </p>
        </div>
        <div className="pill-row">
          <span className="status-chip">{`Streak ${streak}`}</span>
          <span className="status-chip">{`Last ${lastScore === null ? '-' : scoreFormatter.format(lastScore)}`}</span>
          <span className="status-chip">{`Best ${bestScore === null ? '-' : scoreFormatter.format(bestScore)}`}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Round setup</h2>
          <div className="action-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => startRound(selectedPresetId, avgStack)}
            >
              New round
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSubmit}
              disabled={!round || submitted}
            >
              {submitted ? 'Submitted' : 'Submit'}
            </button>
          </div>
        </div>

        <select
          className="preset-select preset-select--block"
          value={selectedPresetId}
          onChange={(event) => handlePresetChange(event.target.value)}
          aria-label="Select drill preset"
        >
          {PRESET_DEFS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>

        <div className="drill-setup-row">
          <span className="drill-setup-label">Avg stack</span>
          <div className="pill-row">
            {AVG_STACK_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={avgStack === option ? 'pill active' : 'pill'}
                onClick={() => handleAvgStackChange(option)}
              >
                {`${option} BB`}
              </button>
            ))}
          </div>
        </div>

        {caller ? (
          <p className="helper-copy">
            Caller: <strong>{caller.name}</strong> &mdash; {stackFormatter.format(caller.stack)} BB
          </p>
        ) : null}
      </section>

      {round ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Guess bubble factors</h2>
              <p className="helper-copy">
                Enter your BF estimate for each opponent. Diagonal (caller vs. self) is skipped.
              </p>
            </div>
          </div>

          <div className="list-grid">
            {round.input.players.map((player, index) => {
              if (index === round.callerIndex) {
                return null;
              }

              const matrixCell = round.result.bubbleMatrix[round.callerIndex]?.[index];
              const scored = scoredByOpponent.get(index);

              return (
                <div className="input-row drill-row" key={`${player.id}-drill`}>
                  <label>
                    <span>{`${player.name} — ${stackFormatter.format(player.stack)} BB`}</span>
                    <input
                      inputMode="decimal"
                      value={guessInputs[index] ?? ''}
                      onChange={(event) =>
                        setGuessInputs((current) =>
                          current.map((value, valueIndex) =>
                            valueIndex === index ? event.target.value : value,
                          ),
                        )
                      }
                      placeholder="e.g. 1.8"
                      disabled={submitted}
                    />
                  </label>

                  <div className="drill-result">
                    <span className="drill-result-label">Actual</span>
                    <strong>
                      {submitted && matrixCell?.bubbleFactor !== null
                        ? bfFormatter.format(matrixCell.bubbleFactor)
                        : '\u2013'}
                    </strong>
                  </div>

                  <div className="drill-result">
                    <span className="drill-result-label">Err</span>
                    <strong>
                      {submitted && scored
                        ? `${scoreFormatter.format(scored.relativeError * 100)}%`
                        : '\u2013'}
                    </strong>
                  </div>

                  <div className="drill-result">
                    <span className="drill-result-label">Pts</span>
                    <strong>
                      {submitted && scored ? scoreFormatter.format(scored.cellScore) : '\u2013'}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          {submitted && scoreSummary ? (
            <div className="warning-box drill-score-box" role="status">
              <p>
                Round score: <strong>{scoreFormatter.format(scoreSummary.roundScore)}</strong> / 100
              </p>
              <p>
                Streak: all cells within{' '}
                {scoreFormatter.format(STREAK_SUCCESS_THRESHOLD * 100)}% relative error.{' '}
                {scoreSummary.streakSuccess ? '✓ Streak extended!' : '✗ Streak reset.'}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

export default DrillPage;
