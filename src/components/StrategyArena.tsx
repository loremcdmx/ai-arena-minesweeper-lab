import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { EloArchivePanel } from './EloArchivePanel'
import { LineChart } from './LineChart'
import { StatusMeter } from './StatusMeter'
import { mergeSnapshotArchive } from '../lib/archiveSnapshots'
import { collectUnlockedMilestones, nextUnreachedMilestone, type EloProfileMeta } from '../lib/elo'
import { referenceSource, referenceViewItems } from '../lib/referenceAnchors'
import {
  STRATEGY_GAME_DEFINITIONS,
  applyStrategyInteractiveMove,
  advanceStrategyPreview,
  createStrategyArenaState,
  createStrategyPreview,
  createStrategyProfile,
  currentStrategySummary,
  evolveStrategyProfile,
  sanitizeStrategyArenaState,
  strategyBoardAccent,
  strategyChartGroups,
  strategyCurrentActor,
  strategyFeedLabel,
  strategyFocusValues,
  strategyPlayableKeys,
  strategyProfileNarrative,
  strategyRecord,
  strategyTier,
  type StrategyArenaState,
  type StrategyGameId,
  type StrategyProfile,
  type StrategyPreviewState,
  type StrategyTrainingSettings,
} from '../lib/strategyLab'
import {
  createStrategySnapshot,
  defaultStrategyEloMeta,
  estimateStrategyElo,
  runStrategyCalibrationProbe,
  strategyCalibrationPlan,
  strategyEloMilestones,
  strongestStrategyReference,
  type StrategyBotSnapshot,
} from '../lib/strategyElo'

interface StrategyArenaProps {
  game: StrategyGameId
}

interface StrategyTrainingState {
  running: boolean
  current: number
  target: number
  cycleStart: number
  startedAt: number | null
  logs: string[]
}

interface StrategyCalibrationState {
  running: boolean
  current: number
  total: number
  currentElo: number
  activeProbeLabel: string
  logs: string[]
}

const STORAGE_PREFIX = 'ai-arena-strategy-v1'
const ELO_META_STORAGE_PREFIX = 'ai-arena-strategy-elo-meta-v1'
const ARCHIVE_STORAGE_PREFIX = 'ai-arena-strategy-archive-v1'

function storageKey(game: StrategyGameId) {
  return `${STORAGE_PREFIX}-${game}`
}

function eloMetaStorageKey(game: StrategyGameId) {
  return `${ELO_META_STORAGE_PREFIX}-${game}`
}

function archiveStorageKey(game: StrategyGameId) {
  return `${ARCHIVE_STORAGE_PREFIX}-${game}`
}

function readState(game: StrategyGameId): StrategyArenaState {
  const raw = localStorage.getItem(storageKey(game))
  if (!raw) {
    return createStrategyArenaState(game)
  }

  try {
    return sanitizeStrategyArenaState(game, JSON.parse(raw))
  } catch {
    return createStrategyArenaState(game)
  }
}

function readEloMeta(game: StrategyGameId) {
  const raw = localStorage.getItem(eloMetaStorageKey(game))
  if (!raw) {
    return {} as Record<string, EloProfileMeta>
  }

  try {
    return JSON.parse(raw) as Record<string, EloProfileMeta>
  } catch {
    return {} as Record<string, EloProfileMeta>
  }
}

function readArchive(game: StrategyGameId) {
  const raw = localStorage.getItem(archiveStorageKey(game))
  if (!raw) {
    return [] as StrategyBotSnapshot[]
  }

  try {
    return mergeStrategyArchive(game, JSON.parse(raw) as StrategyBotSnapshot[])
  } catch {
    return [] as StrategyBotSnapshot[]
  }
}

function normalizeStrategySnapshot(
  game: StrategyGameId,
  entry: Partial<StrategyBotSnapshot>,
): StrategyBotSnapshot | null {
  if (!entry || typeof entry.id !== 'string' || typeof entry.profileId !== 'string') {
    return null
  }

  return {
    id: entry.id,
    profileId: entry.profileId,
    name: typeof entry.name === 'string' ? entry.name : 'Archived bot',
    archetype: typeof entry.archetype === 'string' ? entry.archetype : 'Unknown',
    snapshotType: entry.snapshotType === 'peak' ? 'peak' : 'milestone',
    elo: typeof entry.elo === 'number' ? entry.elo : 0,
    milestone:
      typeof entry.milestone === 'number'
        ? entry.milestone
        : Math.round(typeof entry.elo === 'number' ? entry.elo : 0),
    generation: typeof entry.generation === 'number' ? entry.generation : 0,
    createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
    weights: Array.isArray(entry.weights) ? [...entry.weights] : [],
    settings:
      entry.settings && typeof entry.settings === 'object'
        ? { ...entry.settings }
        : createStrategyArenaState(game).profiles[0].settings,
    note: typeof entry.note === 'string' ? entry.note : '',
  }
}

function mergeStrategyArchive(
  game: StrategyGameId,
  existing: StrategyBotSnapshot[],
  incoming: StrategyBotSnapshot[] = [],
) {
  return mergeSnapshotArchive(
    [...existing, ...incoming].map((entry) => normalizeStrategySnapshot(game, entry)),
  )
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatSigned(value: number, digits = 1) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

type StrategyLayoutMode = 'focus' | 'broadcast' | 'analysis'
type RunSpeedId = 'cinematic' | 'normal' | 'fast' | 'turbo'
type StrategyStageMode = 'watch' | 'play'

const RUN_SPEED_PRESETS: Array<{ id: RunSpeedId; label: string; factor: number }> = [
  { id: 'cinematic', label: 'Cinematic', factor: 1.55 },
  { id: 'normal', label: 'Normal', factor: 1 },
  { id: 'fast', label: 'Fast', factor: 0.68 },
  { id: 'turbo', label: 'Turbo', factor: 0.42 },
]

const STAGE_LAYOUT_PRESETS: Array<{ id: StrategyLayoutMode; label: string }> = [
  { id: 'focus', label: 'Focus' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'analysis', label: 'Analysis' },
]

interface StrategyBotOption {
  id: string
  label: string
  subtitle: string
  source: 'live' | 'archive' | 'external'
  profile: StrategyProfile
}

interface StrategyReplayState {
  frames: StrategyPreviewState[]
  frameIndex: number
}

interface StrategyBoardProps {
  profile: StrategyProfile
  game: StrategyGameId
  opponents: StrategyBotOption[]
  viewerNote: string
}

function previewDelay(delayMs: number, speedId: RunSpeedId) {
  const preset =
    RUN_SPEED_PRESETS.find((candidate) => candidate.id === speedId) ?? RUN_SPEED_PRESETS[1]
  return Math.max(70, Math.round(delayMs * preset.factor))
}

function strategyTrainingBatchSize(
  game: StrategyGameId,
  settings: StrategyTrainingSettings,
) {
  const workload = settings.selfPlayGames + settings.sparringGames

  if (game === 'chess') {
    return workload >= 28 ? 2 : 3
  }

  if (game === 'connect4') {
    return workload >= 24 ? 4 : 5
  }

  return workload >= 30 ? 3 : 4
}

function strategyTrainingTickMs(game: StrategyGameId) {
  if (game === 'chess') {
    return 120
  }

  if (game === 'connect4') {
    return 70
  }

  return 90
}

function formatWeightVector(weights: number[], count = 3) {
  return weights
    .slice(0, count)
    .map((value) => value.toFixed(2))
    .join(' / ')
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function sideLabel(game: StrategyGameId, actor: 'champion' | 'sparring') {
  if (game === 'chess') {
    return actor === 'champion' ? 'You play white' : 'You play black'
  }

  if (game === 'connect4') {
    return actor === 'champion' ? 'You drop first' : 'You drop second'
  }

  return actor === 'champion' ? 'You open the board' : 'You answer second'
}

function createReplayState(game: StrategyGameId, profile: StrategyProfile): StrategyReplayState {
  return {
    frames: [createStrategyPreview(game, profile)],
    frameIndex: 0,
  }
}

function buildReferenceWeights(game: StrategyGameId, opponentElo: number) {
  const definition = STRATEGY_GAME_DEFINITIONS[game]
  const strength = clampNumber(
    (opponentElo - definition.baseRating) / Math.max(1, definition.ratingSpan),
    0,
    1.22,
  )

  return definition.baselineWeights.map((baseline, index) => {
    const target = definition.targetWeights[index] ?? definition.targetWeights.at(-1) ?? baseline
    const blend = clampNumber(0.36 + strength * 0.82, 0.22, 1.18)
    return Number((baseline + (target - baseline) * blend).toFixed(4))
  })
}

function buildReferenceOpponent(
  game: StrategyGameId,
  probe: ReturnType<typeof strategyCalibrationPlan>[number],
  seedIndex: number,
): StrategyBotOption {
  const definition = STRATEGY_GAME_DEFINITIONS[game]
  const strength = clampNumber(
    (probe.opponentElo - definition.baseRating) / Math.max(1, definition.ratingSpan),
    0,
    1.22,
  )
  const source = referenceSource(probe.referenceId)
  const profile = createStrategyProfile(game, seedIndex, {
    id: `reference-${probe.id}`,
    name: probe.opponentLabel,
    archetype: `${probe.emphasis} anchor`,
    rating: probe.opponentElo,
    weights: buildReferenceWeights(game, probe.opponentElo),
    settings: {
      ...definition.defaults,
      exploration: clampNumber(0.2 - strength * 0.12, 0.02, 0.2),
      learningRate: clampNumber(definition.defaults.learningRate + strength * 0.04, 0.08, 0.45),
    },
  })

  return {
    id: `reference:${probe.id}`,
    label: `External · ${probe.opponentLabel} · ${Math.round(probe.opponentElo)} ELO`,
    subtitle: `${source?.label ?? 'Reference anchor'} · ${probe.note}`,
    source: 'external',
    profile,
  }
}

function StrategyBoard({ profile, game, opponents, viewerNote }: StrategyBoardProps) {
  const [mode, setMode] = useState<StrategyStageMode>('watch')
  const [paused, setPaused] = useState(false)
  const [autoRestart, setAutoRestart] = useState(false)
  const [speedId, setSpeedId] = useState<RunSpeedId>(
    game === 'connect4' ? 'fast' : 'normal',
  )
  const [layout, setLayout] = useState<StrategyLayoutMode>('focus')
  const [watchReplay, setWatchReplay] = useState(() => createReplayState(game, profile))
  const [selectedOpponentId, setSelectedOpponentId] = useState(opponents[0]?.id ?? '')
  const [humanActor, setHumanActor] = useState<'champion' | 'sparring'>('sparring')
  const [playState, setPlayState] = useState(() =>
    createStrategyPreview(game, opponents[0]?.profile ?? profile),
  )
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const effectiveOpponentId = opponents.some((candidate) => candidate.id === selectedOpponentId)
    ? selectedOpponentId
    : opponents[0]?.id ?? ''
  const selectedOpponent =
    opponents.find((candidate) => candidate.id === effectiveOpponentId) ?? opponents[0] ?? null
  const opponentProfile = selectedOpponent?.profile ?? profile
  const botActor = humanActor === 'champion' ? 'sparring' : 'champion'
  const watchState =
    watchReplay.frames[watchReplay.frameIndex] ??
    watchReplay.frames[Math.max(0, watchReplay.frames.length - 1)]
  const displayState = mode === 'watch' ? watchState : playState
  const playTurn = strategyCurrentActor(playState)
  const activeDelayProfile = mode === 'watch' ? profile : opponentProfile
  const runDelayMs = previewDelay(activeDelayProfile.settings.previewDelayMs, speedId)
  const activeSpeed =
    RUN_SPEED_PRESETS.find((preset) => preset.id === speedId) ?? RUN_SPEED_PRESETS[1]
  const stageLayoutClass = `layout-${layout}`
  const replayCount = watchReplay.frames.length
  const replayPercent =
    replayCount > 1 ? (watchReplay.frameIndex / Math.max(1, replayCount - 1)) * 100 : 0
  const chessPlayableSources =
    mode === 'play' && game === 'chess'
      ? strategyPlayableKeys(playState, humanActor)
      : []
  const chessPlayableTargets =
    mode === 'play' && game === 'chess' && selectedSquare
      ? strategyPlayableKeys(playState, humanActor, selectedSquare)
      : []
  const playableKeys = new Set(
    mode === 'play'
      ? game === 'chess'
        ? selectedSquare
          ? chessPlayableTargets
          : chessPlayableSources
        : strategyPlayableKeys(playState, humanActor)
      : [],
  )

  const resetWatchRun = () => {
    setWatchReplay(createReplayState(game, profile))
    setPaused(false)
    setSelectedSquare(null)
  }

  const resetPlayRun = () => {
    setPlayState(createStrategyPreview(game, opponentProfile))
    setPaused(false)
    setSelectedSquare(null)
  }

  const advanceWatchReplay = useCallback(
    (current: StrategyReplayState, restartFinished: boolean): StrategyReplayState => {
      const active =
        current.frames[current.frameIndex] ??
        current.frames[Math.max(0, current.frames.length - 1)]

      if (!active) {
        return createReplayState(game, profile)
      }

      if (active.status === 'finished') {
        if (!restartFinished) {
          return current
        }

        const fresh = createStrategyPreview(game, profile)
        return {
          frames: [...current.frames.slice(0, current.frameIndex + 1), fresh],
          frameIndex: current.frameIndex + 1,
        }
      }

      const next = advanceStrategyPreview(active, profile)
      return {
        frames: [...current.frames.slice(0, current.frameIndex + 1), next],
        frameIndex: current.frameIndex + 1,
      }
    },
    [game, profile],
  )

  const switchMode = (nextMode: StrategyStageMode) => {
    setMode(nextMode)
    setSelectedSquare(null)
    setPaused(false)

    if (nextMode === 'play') {
      setPlayState(createStrategyPreview(game, opponentProfile))
    }
  }

  const changeOpponent = (nextId: string) => {
    const nextOpponent = opponents.find((candidate) => candidate.id === nextId) ?? opponents[0] ?? null
    setSelectedOpponentId(nextId)
    setPlayState(createStrategyPreview(game, nextOpponent?.profile ?? profile))
    setSelectedSquare(null)
    setPaused(false)
  }

  const changeHumanActor = (nextActor: 'champion' | 'sparring') => {
    setHumanActor(nextActor)
    setPlayState(createStrategyPreview(game, opponentProfile))
    setSelectedSquare(null)
    setPaused(false)
  }

  const stepWatchReplay = () => {
    setPaused(true)
    setWatchReplay((current) => {
      if (current.frameIndex < current.frames.length - 1) {
        return { ...current, frameIndex: current.frameIndex + 1 }
      }

      return advanceWatchReplay(current, true)
    })
  }

  const stepPlayBot = () => {
    if (playState.status === 'finished' || playTurn !== botActor) {
      return
    }

    setPlayState((current) =>
      advanceStrategyPreview(current, opponentProfile, { poweredActor: botActor }),
    )
    setSelectedSquare(null)
  }

  const moveReplayCursor = (nextIndex: number) => {
    setPaused(true)
    setWatchReplay((current) => ({
      ...current,
      frameIndex: clampNumber(nextIndex, 0, Math.max(0, current.frames.length - 1)),
    }))
  }

  const handleBoardCellClick = (cellKey: string) => {
    if (mode !== 'play' || playState.status === 'finished' || playTurn !== humanActor) {
      return
    }

    if (game === 'chess') {
      if (selectedSquare && chessPlayableTargets.includes(cellKey)) {
        const next = applyStrategyInteractiveMove(playState, humanActor, cellKey, selectedSquare)
        if (next) {
          setPlayState(next)
          setSelectedSquare(null)
        }
        return
      }

      if (chessPlayableSources.includes(cellKey)) {
        setSelectedSquare((current) => (current === cellKey ? null : cellKey))
        return
      }

      setSelectedSquare(null)
      return
    }

    const next = applyStrategyInteractiveMove(playState, humanActor, cellKey, selectedSquare)
    if (next) {
      setPlayState(next)
      setSelectedSquare(null)
    }
  }

  useEffect(() => {
    if (mode !== 'watch' || paused) {
      return
    }

    const active =
      watchReplay.frames[watchReplay.frameIndex] ??
      watchReplay.frames[Math.max(0, watchReplay.frames.length - 1)]

    if (!active) {
      return
    }

    const delay = active.status === 'finished' ? 920 : runDelayMs
    const timer = window.setTimeout(() => {
      if (watchReplay.frameIndex < watchReplay.frames.length - 1) {
        setWatchReplay((current) => ({
          ...current,
          frameIndex: Math.min(current.frameIndex + 1, current.frames.length - 1),
        }))
        return
      }

      if (active.status === 'finished' && !autoRestart) {
        return
      }

      setWatchReplay((current) => advanceWatchReplay(current, autoRestart))
    }, delay)

    return () => window.clearTimeout(timer)
  }, [advanceWatchReplay, autoRestart, mode, paused, runDelayMs, watchReplay])

  useEffect(() => {
    if (mode !== 'play' || paused || playState.status === 'finished' || playTurn !== botActor) {
      return
    }

    const timer = window.setTimeout(() => {
      setPlayState((current) =>
        advanceStrategyPreview(current, opponentProfile, { poweredActor: botActor }),
      )
      setSelectedSquare(null)
    }, Math.max(180, runDelayMs))

    return () => window.clearTimeout(timer)
  }, [botActor, mode, opponentProfile, paused, playState, playTurn, runDelayMs])

  return (
    <section className="play-stage top-stage strategy-stage">
      <div className="section-head">
        <div>
          <p className="eyebrow">{STRATEGY_GAME_DEFINITIONS[game].eyebrow}</p>
          <h2>{STRATEGY_GAME_DEFINITIONS[game].title}</h2>
        </div>
        <div className="play-toolbar strategy-run-toolbar" data-testid="strategy-run-controls">
          <div className="run-control-group" aria-label="board mode">
            <button
              type="button"
              className={mode === 'watch' ? 'active' : ''}
              onClick={() => switchMode('watch')}
              data-testid="strategy-mode-watch"
            >
              Watch bot
            </button>
            <button
              type="button"
              className={mode === 'play' ? 'active' : ''}
              onClick={() => switchMode('play')}
              data-testid="strategy-mode-play"
            >
              Play vs bot
            </button>
          </div>
          <div className="run-control-group">
            <button
              type="button"
              onClick={mode === 'watch' ? resetWatchRun : resetPlayRun}
              data-testid="strategy-reset-run"
            >
              {mode === 'watch' ? 'New run' : 'New duel'}
            </button>
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              data-testid="strategy-toggle-run"
            >
              {paused
                ? mode === 'watch'
                  ? 'Resume run'
                  : 'Resume bot'
                : mode === 'watch'
                  ? 'Pause run'
                  : 'Pause bot'}
            </button>
            <button
              type="button"
              onClick={mode === 'watch' ? stepWatchReplay : stepPlayBot}
              disabled={
                mode === 'watch'
                  ? false
                  : playState.status === 'finished' || playTurn !== botActor
              }
              data-testid="strategy-step-run"
            >
              {mode === 'watch' ? 'Step' : 'Bot step'}
            </button>
            {mode === 'watch' ? (
              <button
                type="button"
                className={['run-toggle', autoRestart ? 'active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setAutoRestart((value) => !value)}
                data-testid="strategy-auto-restart"
              >
                {autoRestart ? 'Auto replay on' : 'Auto replay off'}
              </button>
            ) : null}
          </div>
          <div className="run-control-group" aria-label="run speed">
            {RUN_SPEED_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={speedId === preset.id ? 'active' : ''}
                onClick={() => setSpeedId(preset.id)}
                data-testid={`strategy-speed-${preset.id}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="run-control-group layout-switcher" aria-label="board layout">
            {STAGE_LAYOUT_PRESETS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={layout === candidate.id ? 'active' : ''}
                onClick={() => setLayout(candidate.id)}
                data-testid={
                  game === 'chess'
                    ? `chess-layout-${candidate.id}`
                    : `strategy-layout-${candidate.id}`
                }
              >
                {candidate.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="section-copy">{STRATEGY_GAME_DEFINITIONS[game].description}</p>

      <div className="signal-strip arena-strip">
        <div>
          <span>view mode</span>
          <strong data-testid="strategy-view-mode">
            {mode === 'watch'
              ? displayState.status === 'finished'
                ? 'ready to replay'
                : paused
                  ? 'paused'
                  : 'live run'
              : displayState.status === 'finished'
                ? 'match finished'
                : paused
                  ? 'bot paused'
                  : playTurn === humanActor
                    ? 'your turn'
                    : 'bot turn'}
          </strong>
        </div>
        <div>
          <span>run speed</span>
          <strong data-testid="strategy-run-speed">
            {activeSpeed.label} · {runDelayMs} ms
          </strong>
        </div>
        <div>
          <span>{mode === 'watch' ? 'replay mode' : 'bot setup'}</span>
          <strong>
            {mode === 'watch'
              ? autoRestart
                ? 'auto replay'
                : 'manual hold'
              : `${selectedOpponent?.source ?? 'live'} · ${sideLabel(game, humanActor)}`}
          </strong>
        </div>
        <div>
          <span>match state</span>
          <strong data-testid="strategy-match-state">{displayState.outcomeLabel}</strong>
        </div>
        <div>
          <span>latest decision</span>
          <strong data-testid="strategy-latest-decision">{strategyFeedLabel(displayState)}</strong>
        </div>
        <div>
          <span>{mode === 'watch' ? 'moves in run' : 'moves in duel'}</span>
          <strong data-testid="strategy-move-count">{displayState.moveCount}</strong>
        </div>
      </div>

      <div className={['strategy-stage-grid', stageLayoutClass].join(' ')}>
        <div className="strategy-board-shell">
          <div className="strategy-board-frame">
            <div className="strategy-board-head">
              <div className="strategy-board-title">
                <span className="eyebrow">{mode === 'watch' ? 'Replay stage' : 'Interactive stage'}</span>
                <strong>
                  {mode === 'watch'
                    ? `${profile.name} · watchable run`
                    : `${selectedOpponent?.label ?? opponentProfile.name}`}
                </strong>
                <small>{mode === 'watch' ? viewerNote : selectedOpponent?.subtitle}</small>
              </div>
              <div className="strategy-board-chip-row">
                <span className="profile-chip">{STRATEGY_GAME_DEFINITIONS[game].boardLabel}</span>
                <span className="profile-chip">{strategyBoardAccent(displayState)}</span>
                <span className="profile-chip">
                  {mode === 'watch'
                    ? `Frame ${watchReplay.frameIndex + 1}/${watchReplay.frames.length}`
                    : sideLabel(game, humanActor)}
                </span>
              </div>
            </div>
            <div
              className={[
                'strategy-board',
                `strategy-board-${game}`,
                displayState.board.dense ? 'dense' : '',
                mode === 'play' ? 'interactive' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  '--strategy-cols': String(displayState.board.cols),
                  '--strategy-rows': String(displayState.board.rows),
                } as CSSProperties
              }
              data-testid="strategy-board"
            >
              {displayState.board.cells.map((cell) => (
                <button
                  type="button"
                  key={cell.key}
                  className={[
                    'strategy-cell',
                    `surface-${cell.surface}`,
                    `owner-${cell.owner}`,
                    cell.highlight ? 'highlight' : '',
                    selectedSquare === cell.key ? 'selected' : '',
                    playableKeys.has(cell.key) ? 'legal-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={cell.key}
                  aria-label={`${cell.key}${cell.content ? ` ${cell.content}` : ''}`}
                  onClick={() => handleBoardCellClick(cell.key)}
                  disabled={!playableKeys.has(cell.key)}
                >
                  <span className="strategy-cell-content">{cell.content}</span>
                </button>
              ))}
            </div>

            {mode === 'watch' ? (
              <div className="strategy-replay-panel">
                <div className="strategy-replay-controls">
                  <button
                    type="button"
                    onClick={() => moveReplayCursor(0)}
                    disabled={watchReplay.frameIndex === 0}
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() => moveReplayCursor(watchReplay.frameIndex - 1)}
                    disabled={watchReplay.frameIndex === 0}
                  >
                    Prev
                  </button>
                  <button type="button" onClick={stepWatchReplay}>
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => moveReplayCursor(watchReplay.frames.length - 1)}
                    disabled={watchReplay.frameIndex >= watchReplay.frames.length - 1}
                  >
                    Last
                  </button>
                </div>
                <div className="strategy-replay-slider-row">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, watchReplay.frames.length - 1)}
                    value={watchReplay.frameIndex}
                    onChange={(event) => moveReplayCursor(Number(event.target.value))}
                    aria-label="Replay frame"
                    data-testid={`strategy-${game}-replay-slider`}
                  />
                  <div className="strategy-replay-meta">
                    <span>{watchReplay.frameIndex + 1}/{watchReplay.frames.length}</span>
                    <strong>{replayPercent.toFixed(0)}%</strong>
                    <span>{displayState.moveCount} moves</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="strategy-duel-panel">
                <div>
                  <span>Opponent</span>
                  <strong>{selectedOpponent?.label ?? opponentProfile.name}</strong>
                </div>
                <div>
                  <span>Side</span>
                  <strong>{sideLabel(game, humanActor)}</strong>
                </div>
                <div>
                  <span>Board cue</span>
                  <strong>{selectedSquare ? `Selected ${selectedSquare}` : 'Pick a legal square'}</strong>
                </div>
              </div>
            )}
          </div>
          <div className="strategy-board-meta">
            <span>{STRATEGY_GAME_DEFINITIONS[game].boardLabel}</span>
            <span>{strategyBoardAccent(displayState)}</span>
            <span>{displayState.hint}</span>
          </div>
        </div>

        <div className="assistant-panel strategy-sidefeed">
          <div className="strategy-side-section">
            <div className="widget-head">
              <p className="eyebrow">{mode === 'watch' ? 'Replay control' : 'Match control'}</p>
              <h3>{mode === 'watch' ? 'Replay deck' : 'Pick your opponent'}</h3>
              <p>
                {mode === 'watch'
                  ? 'Manual frame control stays available even while the run is generating new positions.'
                  : 'Any live bot, archived peak, or external reference anchor can be used as the opponent.'}
              </p>
            </div>
            {mode === 'play' ? (
              <>
                <label className="profile-picker">
                  <span>Opponent bot</span>
                  <select
                    value={effectiveOpponentId}
                    onChange={(event) => changeOpponent(event.target.value)}
                    data-testid={`strategy-${game}-opponent-select`}
                  >
                    {opponents.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="run-control-group">
                  <button
                    type="button"
                    className={humanActor === 'champion' ? 'active' : ''}
                    onClick={() => changeHumanActor('champion')}
                  >
                    {game === 'chess' ? 'Play white' : 'Play first'}
                  </button>
                  <button
                    type="button"
                    className={humanActor === 'sparring' ? 'active' : ''}
                    onClick={() => changeHumanActor('sparring')}
                  >
                    {game === 'chess' ? 'Play black' : 'Play second'}
                  </button>
                </div>
                <div className="strategy-detail-grid">
                  <div>
                    <span>Opponent source</span>
                    <strong>{selectedOpponent?.source ?? 'live'}</strong>
                    <small>{selectedOpponent?.subtitle}</small>
                  </div>
                  <div>
                    <span>Turn control</span>
                    <strong>
                      {playTurn === humanActor
                        ? 'Waiting for you'
                        : playState.status === 'finished'
                          ? 'Game finished'
                          : 'Bot is active'}
                    </strong>
                    <small>
                      {playTurn === humanActor
                        ? selectedSquare
                          ? `Piece ${selectedSquare} selected`
                          : 'Click any highlighted square'
                        : 'Bot keeps moving until paused'}
                    </small>
                  </div>
                </div>
              </>
            ) : (
              <div className="strategy-detail-grid">
                <div>
                  <span>Replay source</span>
                  <strong>{profile.name}</strong>
                  <small>{viewerNote}</small>
                </div>
                <div>
                  <span>Frame depth</span>
                  <strong>{watchReplay.frames.length} frames</strong>
                  <small>Scrub by slider, or step frame by frame.</small>
                </div>
              </div>
            )}
          </div>

          <div className="strategy-side-section">
            <div className="widget-head">
              <p className="eyebrow">Live feed</p>
              <h3>Current match analysis</h3>
              <p>{displayState.detail}</p>
            </div>
            <div className="strategy-feed-list">
              {displayState.feed.length > 0 ? (
                displayState.feed.map((line, index) => (
                  <div key={`${line}-${index}`} className="strategy-feed-row">
                    <strong>{index === 0 ? 'now' : `-${index}`}</strong>
                    <span>{line}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">The match is just starting.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
export function StrategyArena({ game }: StrategyArenaProps) {
  const definition = STRATEGY_GAME_DEFINITIONS[game]
  const [arenaState, setArenaState] = useState(() => readState(game))
  const [eloMetaMap, setEloMetaMap] = useState(() => readEloMeta(game))
  const [archive, setArchive] = useState(() => readArchive(game))
  const [selectedViewerId, setSelectedViewerId] = useState('current')
  const [training, setTraining] = useState<StrategyTrainingState>({
    running: false,
    current: 0,
    target: 0,
    cycleStart: 0,
    startedAt: null,
    logs: [],
  })
  const [calibration, setCalibration] = useState<StrategyCalibrationState>({
    running: false,
    current: 0,
    total: 0,
    currentElo: 0,
    activeProbeLabel: 'idle',
    logs: [],
  })
  const [trainingElapsedMs, setTrainingElapsedMs] = useState(0)

  const profiles = arenaState.profiles
  const activeProfile =
    profiles.find((profile) => profile.id === arenaState.activeProfileId) ?? profiles[0]
  const estimatedElo = estimateStrategyElo(game, activeProfile)
  const activeMeta =
    eloMetaMap[activeProfile.id] ?? defaultStrategyEloMeta(game, activeProfile)
  const activeArchive = archive.filter((entry) => entry.profileId === activeProfile.id)
  const selectedViewer =
    selectedViewerId === 'current'
      ? null
      : activeArchive.find((entry) => entry.id === selectedViewerId) ?? null
  const viewerProfile = selectedViewer
    ? createStrategyProfile(game, 0, {
        id: selectedViewer.id,
        name: `${selectedViewer.name} ${
          selectedViewer.snapshotType === 'peak'
            ? `Peak ${Math.round(selectedViewer.elo)}`
            : `${selectedViewer.milestone} ELO`
        }`,
        archetype: selectedViewer.archetype,
        weights: selectedViewer.weights,
        settings: selectedViewer.settings,
        rating: selectedViewer.elo,
      })
    : activeProfile

  const latestSummary = currentStrategySummary(game, activeProfile)
  const focusValues = strategyFocusValues(latestSummary)
  const bestRating = Math.max(
    activeMeta.peakElo,
    latestSummary.rating,
    ...activeProfile.history.map((item) => item.rating),
  )
  const chartGroups = useMemo(() => strategyChartGroups(activeProfile), [activeProfile])
  const eloMilestones = useMemo(() => strategyEloMilestones(game), [game])
  const strongestReference = strongestStrategyReference(game)
  const strongestReferenceGap = strongestReference
    ? activeMeta.currentElo - strongestReference.probe.opponentElo
    : null
  const highestArchivedModel =
    [...activeArchive].sort((left, right) => right.elo - left.elo)[0] ?? null
  const archiveOptions = activeArchive
    .sort((left, right) => left.generation - right.generation)
    .map((entry) => ({
      id: entry.id,
      label:
        entry.snapshotType === 'peak'
          ? `Peak ${Math.round(entry.elo)} ELO - G${entry.generation.toString().padStart(3, '0')}`
          : `Milestone ${entry.milestone} - G${entry.generation.toString().padStart(3, '0')}`,
      subtitle: entry.note,
    }))
  const viewerLabel = selectedViewer
    ? `${
        selectedViewer.snapshotType === 'peak'
          ? 'Peak'
          : `Milestone ${selectedViewer.milestone}`
      } - ${selectedViewer.name}`
    : `Current model - ${Math.round(activeMeta.currentElo)} ELO`
  const viewerNote = selectedViewer
    ? `${selectedViewer.note} - watching frozen bot`
    : `${Math.round(activeMeta.currentElo)} ELO - current growth branch`
  const playOpponentOptions = useMemo<StrategyBotOption[]>(() => {
    const liveOptions = profiles.map((candidate) => {
      const candidateMeta =
        eloMetaMap[candidate.id] ?? defaultStrategyEloMeta(game, candidate)
      return {
        id: `live:${candidate.id}`,
        label: `${candidate.id === activeProfile.id ? 'Current' : 'Live'} · ${candidate.name} · ${Math.round(candidateMeta.currentElo)} ELO`,
        subtitle: `${candidate.archetype} · ${strategyTier(game, currentStrategySummary(game, candidate).rating)}`,
        source: 'live' as const,
        profile: candidate,
      }
    })

    const archiveOptions = [...archive]
      .sort((left, right) => right.elo - left.elo)
      .map((entry) => ({
        id: `archive:${entry.id}`,
        label: `${entry.snapshotType === 'peak' ? 'Peak' : `Milestone ${entry.milestone}`} · ${entry.name} · ${Math.round(entry.elo)} ELO`,
        subtitle:
          entry.note || `${entry.archetype} · G${entry.generation.toString().padStart(3, '0')}`,
        source: 'archive' as const,
        profile: createStrategyProfile(game, 0, {
          id: entry.id,
          name: entry.name,
          archetype: entry.archetype,
          weights: entry.weights,
          settings: entry.settings,
          rating: entry.elo,
        }),
      }))

    const referenceOptions = strategyCalibrationPlan(game).map((probe, index) =>
      buildReferenceOpponent(game, probe, profiles.length + archive.length + index),
    )

    return [...liveOptions, ...archiveOptions, ...referenceOptions]
  }, [activeProfile.id, archive, eloMetaMap, game, profiles])

  const cycleLength = Math.max(1, activeProfile.settings.cycleGenerations)
  const cycleProgressGenerations = training.running
    ? Math.max(0, training.current - training.cycleStart)
    : 0
  const cycleProgressBudget = Math.max(1, training.target - training.cycleStart)
  const elapsed = training.startedAt ? trainingElapsedMs : 0
  const progress = training.running
    ? (cycleProgressGenerations / cycleProgressBudget) * 100
    : 0
  const pacePerMinute = elapsed > 0 ? training.current / (elapsed / 60000) : 0
  const remainingMinutes =
    training.running && pacePerMinute > 0
      ? (training.target - training.current) / pacePerMinute
      : 0
  const currentCycleNumber = Math.floor(training.cycleStart / cycleLength) + 1
  const matchesPerGeneration =
    activeProfile.settings.selfPlayGames + activeProfile.settings.sparringGames
  const matchBudget = cycleLength * matchesPerGeneration
  const completedMatchCount = Math.min(
    matchBudget,
    cycleProgressGenerations * matchesPerGeneration,
  )
  const sessionSimulationCount = training.current * matchesPerGeneration
  const trainingBatch = strategyTrainingBatchSize(game, activeProfile.settings)
  const trainingTick = strategyTrainingTickMs(game)
  const modelWeightVector = formatWeightVector(activeProfile.weights)
  const nextArchiveMilestone = nextUnreachedMilestone(
    activeMeta.currentElo,
    activeMeta.archivedMilestones,
    eloMilestones,
  )
  const previousArchiveMilestone =
    activeMeta.archivedMilestones.at(-1) ?? eloMilestones[0] - 200
  const milestoneBudget = nextArchiveMilestone
    ? nextArchiveMilestone - previousArchiveMilestone
    : Math.max(1, activeMeta.currentElo)
  const milestoneProgress = nextArchiveMilestone
    ? Math.max(0, activeMeta.currentElo - previousArchiveMilestone)
    : milestoneBudget
  const strategyReferenceItems = referenceViewItems(game)
  const referenceCeilingLabel = strongestReference
    ? `${strongestReference.probe.opponentLabel} · ${strongestReference.probe.opponentElo} ELO`
    : 'n/a'
  const referenceCeilingNote = strongestReference
    ? strongestReference.source?.label ?? 'Reference'
    : 'No external anchor loaded'
  const championComparison = {
    title: 'Current champion vs top external anchor',
    description:
      'The live model is compared against the strongest calibration anchor available for this game.',
    summary: strongestReference
      ? `Current gap to the strongest available reference: ${formatSigned(strongestReferenceGap ?? 0, 0)} ELO. The latest peak and every milestone stay frozen as watchable engine snapshots.`
      : 'No external anchor is currently available for this game.',
    ourChampion: {
      eyebrow: 'Our champion',
      title: `${activeProfile.name} · ${Math.round(activeMeta.currentElo)} ELO`,
      subtitle: highestArchivedModel
        ? `Top frozen model: ${Math.round(highestArchivedModel.elo)} ELO · G${highestArchivedModel.generation.toString().padStart(3, '0')}`
        : 'No frozen engines yet.',
      metrics: [
        {
          label: 'Peak',
          value: `${Math.round(activeMeta.peakElo)} ELO`,
          detail:
            activeMeta.calibratedElo !== null
              ? `Last calibrated ${Math.round(activeMeta.calibratedElo)} ELO`
              : 'Using projected ELO',
        },
        {
          label: 'Record',
          value: strategyRecord(latestSummary),
          detail: `Confidence ${formatPercent(latestSummary.confidence)} · errors ${formatPercent(latestSummary.errorRate)}`,
        },
        {
          label: 'Engine core',
          value: modelWeightVector,
          detail: `${definition.focusLabels.join(' · ')} · ${strategyTier(game, latestSummary.rating)}`,
        },
        {
          label: 'Training branch',
          value: `${activeProfile.history.length} generations`,
          detail: `${sessionSimulationCount.toLocaleString()} sims · ${matchesPerGeneration} matches / gen`,
        },
      ],
    },
    externalChampion: {
      eyebrow: 'External anchor',
      title: strongestReference
        ? `${strongestReference.probe.opponentLabel} · ${strongestReference.probe.opponentElo} ELO`
        : 'Reference unavailable',
      subtitle: strongestReference
        ? strongestReference.source?.label ?? 'Reference'
        : 'No probe configured',
      metrics: strongestReference
        ? [
            {
              label: 'Method',
              value: strongestReference.source?.type.toUpperCase() ?? 'REFERENCE',
              detail: strongestReference.source?.note ?? strongestReference.probe.note,
            },
            {
              label: 'Source',
              value: strongestReference.source?.sourceLabel ?? 'Local anchor',
              detail: strongestReference.source?.sourceUrl ?? 'No public URL',
            },
            {
              label: 'Probe focus',
              value: strongestReference.probe.emphasis,
              detail: strongestReference.probe.note,
            },
            {
              label: 'ELO gap',
              value: `${formatSigned(strongestReferenceGap ?? 0, 0)} ELO`,
              detail:
                (strongestReferenceGap ?? 0) >= 0
                  ? 'Current branch is above the strongest external anchor.'
                  : 'The branch still has headroom before the anchor ceiling.',
            },
          ]
        : [],
    },
  }

  useEffect(() => {
    localStorage.setItem(storageKey(game), JSON.stringify(arenaState))
  }, [arenaState, game])

  useEffect(() => {
    localStorage.setItem(eloMetaStorageKey(game), JSON.stringify(eloMetaMap))
  }, [eloMetaMap, game])

  useEffect(() => {
    localStorage.setItem(archiveStorageKey(game), JSON.stringify(archive))
  }, [archive, game])

  useEffect(() => {
    if (!training.running) {
      return
    }

    const timer = window.setInterval(() => {
      setTrainingElapsedMs((value) => value + 250)
    }, 250)

    return () => window.clearInterval(timer)
  }, [training.running])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentMeta = eloMetaMap[activeProfile.id] ?? defaultStrategyEloMeta(game, activeProfile)
      const nextCurrentElo = calibration.running
        ? currentMeta.currentElo
        : estimatedElo
      const unlocked = collectUnlockedMilestones(
        nextCurrentElo,
        currentMeta.archivedMilestones,
        eloMilestones,
      )
      const peakImproved = nextCurrentElo > currentMeta.peakElo + 0.001

      if (
        Math.round(currentMeta.currentElo) === Math.round(nextCurrentElo) &&
        unlocked.length === 0 &&
        !peakImproved
      ) {
        return
      }

      setEloMetaMap((current) => ({
        ...current,
        [activeProfile.id]: {
          ...currentMeta,
          currentElo: nextCurrentElo,
          peakElo: Math.max(currentMeta.peakElo, nextCurrentElo),
          archivedMilestones: [
            ...currentMeta.archivedMilestones,
            ...unlocked,
          ].sort((left, right) => left - right),
        },
      }))

      if (unlocked.length > 0 || peakImproved) {
        const createdSnapshots = [
          ...(peakImproved
            ? [
                createStrategySnapshot(
                  game,
                  activeProfile,
                  nextCurrentElo,
                  Math.round(nextCurrentElo),
                  'peak',
                ),
              ]
            : []),
          ...unlocked.map((milestone) =>
            createStrategySnapshot(
              game,
              activeProfile,
              nextCurrentElo,
              milestone,
              'milestone',
            ),
          ),
        ]
        setArchive((current) => mergeStrategyArchive(game, current, createdSnapshots))
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeProfile, calibration.running, eloMetaMap, eloMilestones, estimatedElo, game])

  useEffect(() => {
    if (!training.running) {
      return
    }

    const processedPerTick = trainingBatch
    const timer = window.setInterval(() => {
      let nextGeneration = 0
      let nextRating = 0

      setArenaState((current) => {
        const nextProfiles = current.profiles.map((profile, index) => {
          if (profile.id !== current.activeProfileId) {
            return profile
          }

          let evolved = profile

          for (let step = 0; step < processedPerTick; step += 1) {
            evolved = evolveStrategyProfile(game, evolved)
          }

          nextGeneration = evolved.history.length
          nextRating = evolved.history.at(-1)?.rating ?? evolved.rating
          return createStrategyProfile(game, index, evolved)
        })

        return {
          ...current,
          profiles: nextProfiles,
        }
      })

      setTraining((current) => {
        const nextCurrent = current.current + processedPerTick
        let nextCycleStart = current.cycleStart
        let nextTarget = current.target
        let completedCycles = 0

        while (nextCurrent >= nextTarget) {
          nextCycleStart = nextTarget
          nextTarget += cycleLength
          completedCycles += 1
        }

        const cycleNumber = Math.floor(Math.max(0, nextCurrent - 1) / cycleLength) + 1
        return {
          ...current,
          current: nextCurrent,
          target: nextTarget,
          cycleStart: nextCycleStart,
          running: true,
          logs: [
            ...(completedCycles > 0
              ? [
                  `cycle ${cycleNumber - completedCycles + 1} checkpoint hit - continuing live`,
                ]
              : []),
            `G${nextGeneration.toString().padStart(3, '0')} - rating ${nextRating.toFixed(0)} - +${processedPerTick} gens - cycle ${cycleNumber}`,
            ...current.logs,
          ].slice(0, 18),
        }
      })
    }, trainingTick)

    return () => window.clearInterval(timer)
  }, [cycleLength, game, training.running, trainingBatch, trainingTick])

  useEffect(() => {
    if (!calibration.running) {
      return
    }

    const plan = strategyCalibrationPlan(game)
    const probe = plan[calibration.current]
    if (!probe) {
      const finalizeTimer = window.setTimeout(() => {
        const completedAt = Date.now()
        const currentMeta =
          eloMetaMap[activeProfile.id] ?? defaultStrategyEloMeta(game, activeProfile)
        const nextMeta = {
          ...currentMeta,
          currentElo: calibration.currentElo,
          calibratedElo: calibration.currentElo,
          peakElo: Math.max(currentMeta.peakElo, calibration.currentElo),
          lastCalibratedAt: completedAt,
        }
        const unlocked = collectUnlockedMilestones(
          nextMeta.currentElo,
          nextMeta.archivedMilestones,
          eloMilestones,
        )
        const peakImproved = nextMeta.currentElo > currentMeta.peakElo + 0.001

        setEloMetaMap((current) => ({
          ...current,
          [activeProfile.id]: {
            ...nextMeta,
            archivedMilestones: [
              ...nextMeta.archivedMilestones,
              ...unlocked,
            ].sort((left, right) => left - right),
          },
        }))

        if (unlocked.length > 0 || peakImproved) {
          setArchive((current) =>
            mergeStrategyArchive(game, current, [
              ...(peakImproved
                ? [
                    createStrategySnapshot(
                      game,
                      activeProfile,
                      calibration.currentElo,
                      Math.round(calibration.currentElo),
                      'peak',
                    ),
                  ]
                : []),
              ...unlocked.map((milestone) =>
                createStrategySnapshot(
                  game,
                  activeProfile,
                  calibration.currentElo,
                  milestone,
                  'milestone',
                ),
              ),
            ]),
          )
        }

        setCalibration((current) => ({
          ...current,
          running: false,
          logs: [
            `calibrated ${Math.round(calibration.currentElo)} ELO`,
            ...current.logs,
          ].slice(0, 18),
        }))
      }, 0)

      return () => window.clearTimeout(finalizeTimer)
    }

    const timer = window.setTimeout(() => {
      const probeReference = referenceSource(probe.referenceId)
      const result = runStrategyCalibrationProbe(
        game,
        activeProfile,
        probe,
        calibration.currentElo,
      )
      setCalibration((current) => ({
        ...current,
        current: current.current + 1,
        currentElo: result.resultingElo,
        activeProbeLabel: `${probe.label} - ${probeReference?.label ?? 'Reference'}`,
        logs: [
          `${probeReference?.label ?? 'Reference'} - ${probe.opponentLabel} (${probe.opponentElo}) - score ${result.observedScore.toFixed(2)} - delta ${result.delta.toFixed(1)}`,
          `${result.note}`,
          ...current.logs,
        ].slice(0, 18),
      }))
    }, 320)

    return () => window.clearTimeout(timer)
  }, [activeProfile, calibration, eloMetaMap, eloMilestones, game])

  const updateActiveProfile = (
    updater: (profile: StrategyProfile, index: number) => StrategyProfile,
  ) => {
    setArenaState((current) => ({
      ...current,
      profiles: current.profiles.map((profile, index) =>
        profile.id === current.activeProfileId
          ? createStrategyProfile(game, index, updater(profile, index))
          : profile,
      ),
    }))
  }

  const updateSetting = <K extends keyof StrategyTrainingSettings>(
    key: K,
    value: StrategyTrainingSettings[K],
  ) => {
    updateActiveProfile((profile) => ({
      ...profile,
      settings: {
        ...profile.settings,
        [key]: value,
      },
    }))
  }

  const startTraining = () => {
    if (calibration.running || training.running) {
      return
    }

    setTrainingElapsedMs(0)
    setTraining({
      running: true,
      current: 0,
      target: cycleLength,
      cycleStart: 0,
      startedAt: Date.now(),
      logs: [
        `launch ${definition.shortTitle} live - batch x${trainingBatch} - tick ${trainingTick}ms - pop ${activeProfile.settings.selfPlayGames} - sparring ${activeProfile.settings.sparringGames}`,
      ],
    })
  }

  const stopTraining = () => {
    if (!training.running) {
      return
    }

    setTraining((current) => ({
      ...current,
      running: false,
      logs: [`manual stop - ${definition.shortTitle}`, ...current.logs].slice(0, 18),
    }))
  }

  const startCalibration = () => {
    if (training.running || calibration.running) {
      return
    }

    const plan = strategyCalibrationPlan(game)
    const startingElo =
      eloMetaMap[activeProfile.id]?.calibratedElo ??
      eloMetaMap[activeProfile.id]?.currentElo ??
      estimatedElo

    setCalibration({
      running: true,
      current: 0,
      total: plan.length,
      currentElo: startingElo,
      activeProbeLabel: plan[0]?.label ?? 'idle',
      logs: [
        `launch calibration · ${definition.shortTitle} · start ${Math.round(startingElo)} ELO`,
      ],
    })
  }

  const createNewProfile = () => {
    if (training.running || calibration.running) {
      return
    }

    const nextProfile = createStrategyProfile(game, profiles.length, {
      settings: activeProfile.settings,
    })

    setArenaState((current) => ({
      activeProfileId: nextProfile.id,
      profiles: [...current.profiles, nextProfile],
    }))
    setSelectedViewerId('current')
  }

  const selectProfile = (profileId: string) => {
    if (training.running || calibration.running) {
      return
    }

    setArenaState((current) => ({
      ...current,
      activeProfileId: profileId,
    }))
    setSelectedViewerId('current')
  }

  return (
    <>
      <section className="workflow-grid strategy-workflow">
        <StrategyBoard
          key={`${game}-${selectedViewer?.id ?? activeProfile.id}`}
          profile={viewerProfile}
          game={game}
          opponents={playOpponentOptions}
          viewerNote={viewerNote}
        />

        <section className="profile-hub strategy-hub">
          <div className="section-head">
            <div>
              <p className="eyebrow">Companion</p>
              <h2>Engine dossier</h2>
            </div>
          </div>
          <p className="section-copy">{definition.trainingNote}</p>

          <div className="profile-toolbar">
            <label className="profile-picker">
              <span>Active profile</span>
              <select
                value={activeProfile.id}
                onChange={(event) => selectProfile(event.target.value)}
                disabled={training.running || calibration.running}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} - {profile.archetype} - G{profile.history.length
                      .toString()
                      .padStart(3, '0')}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="secondary-pill"
              onClick={createNewProfile}
              disabled={training.running || calibration.running}
            >
              New profile
            </button>
          </div>

          <div className="profile-hero strategy-hero">
            <div className="profile-avatar">
              <span className="profile-avatar-code">
                {activeProfile.archetype.slice(0, 3).toUpperCase()}
              </span>
              <span className="profile-avatar-tag">
                latest peak pinned automatically
              </span>
              <div className="profile-avatar-meta">
                <strong data-testid="strategy-current-elo">
                  {Math.round(activeMeta.currentElo)} ELO
                </strong>
                <small>{sessionSimulationCount.toLocaleString()} sims in this run</small>
              </div>
            </div>

            <div className="profile-identity">
              <p className="eyebrow">Engine dossier</p>
              <h1>{activeProfile.name}</h1>
              <p className="profile-species">{activeProfile.archetype}</p>
              <p className="profile-story">
                {strategyProfileNarrative(game, activeProfile)}
              </p>
              <div className="profile-card-grid">
                <div className="profile-card-stat">
                  <span>champion rating</span>
                  <strong>{Math.round(activeMeta.currentElo)} ELO</strong>
                  <small>
                    peak {Math.round(activeMeta.peakElo)} - calibrated{' '}
                    {activeMeta.calibratedElo !== null
                      ? Math.round(activeMeta.calibratedElo)
                      : 'pending'}
                  </small>
                </div>
                <div className="profile-card-stat">
                  <span>reference ceiling</span>
                  <strong>{referenceCeilingLabel}</strong>
                  <small>
                    {strongestReferenceGap !== null
                      ? `${formatSigned(strongestReferenceGap, 0)} ELO vs top external anchor`
                      : 'No external anchor'}
                  </small>
                </div>
                <div className="profile-card-stat">
                  <span>engine core</span>
                  <strong>{modelWeightVector}</strong>
                  <small>{definition.focusLabels.join(' - ')}</small>
                </div>
                <div className="profile-card-stat">
                  <span>branch state</span>
                  <strong>
                    {training.running ? `cycle ${currentCycleNumber}` : "ready to train"}
                  </strong>
                  <small>
                    {training.running
                      ? `${cycleProgressGenerations}/${cycleLength} gens - ${sessionSimulationCount} sims`
                      : 'Train runs continuously until Stop now'}
                  </small>
                </div>
                <div className="profile-card-stat">
                  <span>optimizer</span>
                  <strong>
                    lr {activeProfile.settings.learningRate.toFixed(2)} - noise{' '}
                    {activeProfile.settings.exploration.toFixed(2)}
                  </strong>
                  <small>
                    batch x{trainingBatch} - tick {trainingTick}ms
                  </small>
                </div>
              </div>
              <div className="profile-chip-row">
                <span className="profile-chip">{strategyTier(game, latestSummary.rating)}</span>
                <span className="profile-chip">{definition.boardLabel}</span>
                <span className="profile-chip">{strategyRecord(latestSummary)}</span>
              </div>
            </div>

            <div className="profile-actions">
              <button
                type="button"
                className="train-cta"
                onClick={startTraining}
                disabled={training.running || calibration.running}
                data-testid="strategy-train-button"
              >
                {training.running ? 'Training live' : 'Train'}
              </button>
              <div className="action-row compact">
                <button
                  type="button"
                  className="danger"
                  onClick={stopTraining}
                  disabled={!training.running}
                  data-testid="strategy-stop-training"
                >
                  Stop now
                </button>
              </div>
              <div className="profile-train-note">
                Train starts a continuous session and never auto-stops. Current cycle window:{' '}
                {activeProfile.settings.cycleGenerations} generations ·{' '}
                {activeProfile.settings.selfPlayGames} self-play ·{' '}
                {activeProfile.settings.sparringGames} sparring · ~{matchBudget} simulations
              </div>
            </div>
          </div>

          <div className="profile-vitals strategy-vitals">
            <div>
              <span>rating</span>
              <strong data-testid="strategy-current-rating">
                {latestSummary.rating.toFixed(0)}
              </strong>
            </div>
            <div>
              <span>best rating</span>
              <strong>{bestRating.toFixed(0)}</strong>
            </div>
            <div>
              <span>W / D / L</span>
              <strong>{strategyRecord(latestSummary)}</strong>
            </div>
            <div>
              <span>errors</span>
              <strong>{formatPercent(latestSummary.errorRate)}</strong>
            </div>
            <div>
              <span>throughput</span>
              <strong>{latestSummary.throughput.toFixed(0)}</strong>
            </div>
            <div>
              <span>confidence</span>
              <strong>{formatPercent(latestSummary.confidence)}</strong>
            </div>
          </div>

          <EloArchivePanel
            title="Archived bots"
            description="The latest peak ELO and every milestone checkpoint are frozen so you can inspect the current champion and the major checkpoints."
            currentLabel={viewerLabel}
            currentElo={activeMeta.currentElo}
            peakElo={activeMeta.peakElo}
            calibratedElo={activeMeta.calibratedElo}
            lastCalibratedAt={activeMeta.lastCalibratedAt}
            nextMilestone={nextUnreachedMilestone(
              activeMeta.currentElo,
              activeMeta.archivedMilestones,
              eloMilestones,
            )}
            referencePeakLabel={referenceCeilingLabel}
            referencePeakNote={referenceCeilingNote}
            selectedViewerId={selectedViewerId}
            options={archiveOptions}
            onSelectViewer={setSelectedViewerId}
            onCalibrate={startCalibration}
            calibrationDisabled={training.running || calibration.running}
            calibrationRunning={calibration.running}
            calibrationCurrent={calibration.current}
            calibrationTotal={calibration.total}
            calibrationCurrentElo={calibration.currentElo || activeMeta.currentElo}
            calibrationProbeLabel={calibration.activeProbeLabel}
            calibrationLogs={calibration.logs}
            viewerNote={viewerNote}
            comparison={championComparison}
            referenceItems={strategyReferenceItems}
            testIdPrefix={`strategy-${game}`}
          />
        </section>
      </section>

      <section className="main-grid strategy-main-grid">
        <section className="priority-panel strategy-priority-panel">
          <div className="widget-head">
            <p className="eyebrow">Live telemetry</p>
            <h3>Training loop</h3>
            <p>Cycle status, growth pace, and the key profile parameters stay visible at a glance.</p>
          </div>

          <div className="training-monitor" data-testid="strategy-training-monitor">
            <div className="training-status">
              <span
                className={['training-spinner', training.running ? 'running' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />
              <div className="training-status-copy">
                <span>cycle status</span>
                <strong data-testid="strategy-training-status">
                  {training.running
                    ? `Training live · G${training.current.toString().padStart(3, '0')}`
                    : 'Waiting to start'}
                </strong>
                <small>
                  {training.running
                    ? `Session ${formatDuration(elapsed)} - cycle ${currentCycleNumber} - next rollover in ${
                        remainingMinutes > 0 ? `${remainingMinutes.toFixed(1)} min` : 'almost done'
                      }`
                    : 'Press "Train" to start a continuous session. It runs until you press "Stop now".'}
                </small>
              </div>
            </div>

            <div
              className="training-meter"
              data-testid="strategy-progress"
              aria-label="strategy progress meter"
            >
              <div className="training-meter-fill" style={{ width: `${progress}%` }} />
              <div className="training-meter-meta">
                <span>{training.running ? `cycle ${currentCycleNumber}` : 'idle'}</span>
                <strong>
                  {training.running
                    ? `${cycleProgressGenerations}/${cycleProgressBudget}`
                    : `${Math.round(progress)}%`}
                </strong>
                <span>
                  {pacePerMinute > 0
                    ? `${pacePerMinute.toFixed(1)} ${definition.paceUnit}`
                    : 'waiting'}
                </span>
              </div>
            </div>

            <div className="status-meter-grid">
              <StatusMeter
                label="Cycle matches"
                value={completedMatchCount}
                max={matchBudget}
                summary={`${completedMatchCount}/${matchBudget} matches`}
                startLabel="start"
                endLabel="budget"
                testId={`strategy-${game}-match-budget`}
              />
              <StatusMeter
                label="To next ELO milestone"
                value={milestoneProgress}
                max={milestoneBudget}
                summary={
                  nextArchiveMilestone
                    ? `${Math.round(activeMeta.currentElo)} / ${nextArchiveMilestone} ELO`
                    : 'archive complete'
                }
                startLabel={`${Math.max(0, Math.round(previousArchiveMilestone))} ELO`}
                endLabel={
                  nextArchiveMilestone
                    ? `${nextArchiveMilestone} ELO`
                    : `${Math.round(activeMeta.currentElo)} ELO`
                }
                testId={`strategy-${game}-elo-budget`}
              />
            </div>

            <div className="training-grid">
              <div className="live-metric">
                <span>{definition.focusLabels[0]}</span>
                <strong>{formatPercent(focusValues[0])}</strong>
              </div>
              <div className="live-metric">
                <span>{definition.focusLabels[1]}</span>
                <strong>{formatPercent(focusValues[1])}</strong>
              </div>
              <div className="live-metric">
                <span>{definition.focusLabels[2]}</span>
                <strong>{formatPercent(focusValues[2])}</strong>
              </div>
              <div className="live-metric">
                <span>delta rating</span>
                <strong>{formatSigned(latestSummary.trend, 0)}</strong>
              </div>
              <div className="live-metric">
                <span>cycle pace</span>
                <strong>
                  {pacePerMinute > 0 ? `${pacePerMinute.toFixed(2)} / min` : '0.00 / min'}
                </strong>
              </div>
              <div className="live-metric">
                <span>session sims</span>
                <strong>{sessionSimulationCount.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="analytics-panel strategy-analytics-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">History</p>
              <h2>Growth history</h2>
            </div>
          </div>
          <p className="section-copy">
            Growth is split by scale so rating, momentum, confidence, and error do not flatten
            each other on one axis.
          </p>
          <div className="chart-cluster">
            {chartGroups.map((group) => (
              <div key={group.title} className="chart-panel">
                <div className="chart-panel-copy">
                  <strong>{group.title}</strong>
                  <span>{group.note}</span>
                </div>
                <LineChart series={group.series} />
              </div>
            ))}
          </div>

          <div className="strategy-history-list">
            {activeProfile.history.length > 0 ? (
              [...activeProfile.history].reverse().slice(0, 8).map((entry) => (
                <div key={entry.generation} className="strategy-history-row">
                  <strong>G{entry.generation.toString().padStart(3, '0')}</strong>
                  <span>rating {entry.rating.toFixed(0)}</span>
                  <span>{strategyRecord(entry)}</span>
                  <span>err {formatPercent(entry.errorRate)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">This profile has no trained generations yet.</div>
            )}
          </div>
        </section>

        <section className="ledger-grid strategy-ledger-grid">
          <section className="settings-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Cycle settings</h2>
              </div>
            </div>
            <p className="section-copy">
              Defaults are tuned for the one-click workflow: press Train and keep the profile
              growing. Change these only when you want a longer or denser run.
            </p>

            <div className="settings-form">
              <label className="settings-group">
                <span>Simulations per cycle</span>
                <input
                  type="number"
                  min={matchesPerGeneration}
                  step={Math.max(1, matchesPerGeneration)}
                  max={24 * Math.max(1, matchesPerGeneration)}
                  value={activeProfile.settings.cycleGenerations * matchesPerGeneration}
                  disabled={training.running || calibration.running}
                  onChange={(event) =>
                    updateSetting(
                      'cycleGenerations',
                      Math.max(
                        1,
                        Math.round(Number(event.target.value) / Math.max(1, matchesPerGeneration)),
                      ),
                    )
                  }
                />
              </label>
              <label className="settings-group">
                <span>Generations per cycle window</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={activeProfile.settings.cycleGenerations}
                  disabled={training.running || calibration.running}
                  onChange={(event) =>
                    updateSetting('cycleGenerations', Number(event.target.value))
                  }
                />
              </label>
              <label className="settings-group">
                <span>Self-play matches</span>
                <input
                  type="number"
                  min={4}
                  max={48}
                  value={activeProfile.settings.selfPlayGames}
                  disabled={training.running || calibration.running}
                  onChange={(event) =>
                    updateSetting('selfPlayGames', Number(event.target.value))
                  }
                />
              </label>
              <label className="settings-group">
                <span>Sparring matches</span>
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={activeProfile.settings.sparringGames}
                  disabled={training.running || calibration.running}
                  onChange={(event) =>
                    updateSetting('sparringGames', Number(event.target.value))
                  }
                />
              </label>
              <label className="settings-group">
                <span>Learning rate</span>
                <input
                  type="number"
                  step="0.01"
                  min={0.05}
                  max={0.45}
                  value={activeProfile.settings.learningRate}
                  disabled={training.running || calibration.running}
                  onChange={(event) =>
                    updateSetting('learningRate', Number(event.target.value))
                  }
                />
              </label>
              <label className="settings-group">
                <span>Exploration noise</span>
                <input
                  type="number"
                  step="0.01"
                  min={0.02}
                  max={0.5}
                  value={activeProfile.settings.exploration}
                  disabled={training.running || calibration.running}
                  onChange={(event) =>
                    updateSetting('exploration', Number(event.target.value))
                  }
                />
              </label>
              <label className="settings-group">
                <span>Live match speed, ms</span>
                <input
                  type="number"
                  step="10"
                  min={80}
                  max={1200}
                  value={activeProfile.settings.previewDelayMs}
                  disabled={training.running || calibration.running}
                  onChange={(event) =>
                    updateSetting('previewDelayMs', Number(event.target.value))
                  }
                />
              </label>
            </div>
          </section>

          <section className="terminal-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Console</p>
                <h2>Cycle log</h2>
              </div>
            </div>
            <div className="terminal-log">
              {training.logs.length > 0 ? (
                training.logs.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
              ) : (
                <div>Waiting to start the cycle.</div>
              )}
            </div>
          </section>
        </section>
      </section>
    </>
  )
}
