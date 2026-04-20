import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { ComparisonLab } from './components/ComparisonLab'
import { EloArchivePanel } from './components/EloArchivePanel'
import { GenerationTable } from './components/GenerationTable'
import { LineChart } from './components/LineChart'
import { MinesweeperBoard } from './components/MinesweeperBoard'
import { NetworkGraph } from './components/NetworkGraph'
import { PopulationHeatmap } from './components/PopulationHeatmap'
import { StrategyArena } from './components/StrategyArena'
import { StatusMeter } from './components/StatusMeter'
import { SpriteCounter } from './components/SpriteCounter'
import { SpriteFace, type FaceState } from './components/SpriteFace'
import { useTrainingWorker } from './hooks/useTrainingWorker'
import {
  DEFAULT_PARALLEL_WORKERS,
  PRESET_CONFIGS,
  STORAGE_KEYS,
} from './lib/constants'
import {
  collectUnlockedMilestones,
  nextUnreachedMilestone,
} from './lib/elo'
import { applyMove, chooseMove } from './lib/evolution'
import {
  ARENA_GROWTH_MILESTONES,
  EXPERIENCE_CARDS,
  ROADMAP_ITEMS,
  type ArenaExperienceId,
} from './lib/minesweeperArenaConfig'
import {
  createMinesweeperSnapshot,
  defaultMinesweeperEloMeta,
  estimateMinesweeperElo,
  minesweeperEloMilestones,
  minesweeperViewerNote,
  MINESWEEPER_CALIBRATION_PROBES,
  readMinesweeperCalibrationProbe,
  strongestMinesweeperReference,
} from './lib/minesweeperElo'
import { referenceSource, referenceViewItems } from './lib/referenceAnchors'
import {
  chordCell,
  cloneGame,
  createGame,
  createBoardConfig,
  getElapsedSeconds,
  revealCell,
  snapshotBoard,
  toggleFlag,
} from './lib/minesweeper'
import {
  clampBoard,
  createProfile,
  detectPreset,
  mergeArchivedMilestones,
  mergeMinesweeperArchive,
  MINESWEEPER_ARCHIVE_STORAGE_KEY,
  MINESWEEPER_ELO_META_STORAGE_KEY,
  presetRank,
  readMinesweeperArchive,
  readMinesweeperEloMeta,
  readPersistedState,
  recommendedGrowthPreset,
  sanitizeProfile,
  sanitizeSettings,
} from './lib/minesweeperPersistence'
import {
  arenaLabel,
  formatBoard,
  formatBoardCompact,
  formatDuration,
  formatEta,
  gameStatusLabel,
  percent,
  profileHeadline,
  profileStage,
  profileTemperament,
  signed,
} from './lib/minesweeperUi'
import { evaluateCandidate } from './lib/neural'
import { randomSeed } from './lib/random'
import type {
  BoardConfig,
  DifficultyPreset,
  ModelProfile,
  TrainingSettings,
} from './types'

interface LiveTrainingSession {
  baseGenerationCount: number
  baseBestFitness: number
  baseWinRate: number
}

interface MinesweeperCalibrationState {
  running: boolean
  current: number
  total: number
  currentElo: number
  activeProbeLabel: string
  logs: string[]
}

const ACTIVE_EXPERIENCE_STORAGE_KEY = 'ai-arena-active-experience-v1'

function App() {
  const [persisted] = useState(() => readPersistedState())
  const [activeExperience, setActiveExperience] = useState<ArenaExperienceId>(() => {
    const stored = localStorage.getItem(ACTIVE_EXPERIENCE_STORAGE_KEY)
    return EXPERIENCE_CARDS.some((card) => card.id === stored)
      ? (stored as ArenaExperienceId)
      : 'minesweeper'
  })
  const training = useTrainingWorker(persisted.history)
  const history = training.state.history

  const initialProfile =
    persisted.profiles.find((profile) => profile.id === persisted.activeProfileId) ??
    persisted.profiles[0]

  const [profiles, setProfiles] = useState(persisted.profiles)
  const [activeProfileId, setActiveProfileId] = useState(persisted.activeProfileId)
  const [hiddenLayerInput, setHiddenLayerInput] = useState(
    initialProfile.settings.hiddenLayers.join(', '),
  )
  const [game, setGame] = useState(() => createGame(initialProfile.board))
  const [showOverlay, setShowOverlay] = useState(true)
  const [selectedGeneration, setSelectedGeneration] = useState<number | null>(null)
  const [compareA, setCompareA] = useState<number | null>(null)
  const [compareB, setCompareB] = useState<number | null>(null)
  const [liveSession, setLiveSession] = useState<LiveTrainingSession | null>(null)
  const [previewPaused, setPreviewPaused] = useState(false)
  const [mineBoardMode, setMineBoardMode] = useState<'watch' | 'play'>('watch')
  const [mineEloMetaMap, setMineEloMetaMap] = useState(() => readMinesweeperEloMeta())
  const [mineArchive, setMineArchive] = useState(() => readMinesweeperArchive())
  const [selectedMineViewerId, setSelectedMineViewerId] = useState('current')
  const [mineCalibration, setMineCalibration] = useState<MinesweeperCalibrationState>({
    running: false,
    current: 0,
    total: 0,
    currentElo: 0,
    activeProbeLabel: 'idle',
    logs: [],
  })
  const [, setTick] = useState(0)
  const [trainingElapsedMs, setTrainingElapsedMs] = useState(0)
  const [continuousTraining, setContinuousTraining] = useState(false)
  const minesweeperLabActive = activeExperience === 'minesweeper'
  const trainingRunning = training.state.running
  const runTrainingBatch = training.run
  const trainingActive = continuousTraining || training.state.running

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]
  const activeSettings = activeProfile.settings
  const activePreset = detectPreset(activeProfile.board)
  const settingsLocked = trainingActive || mineCalibration.running
  const profileHistory = useMemo(
    () => history.filter((item) => item.profileId === activeProfile.id),
    [history, activeProfile.id],
  )
  const latestSummary = profileHistory.at(-1) ?? null
  const latestWinRate = latestSummary
    ? latestSummary.benchmark.wins / Math.max(1, latestSummary.benchmark.games)
    : 0
  const estimatedMineElo = estimateMinesweeperElo(latestSummary, activeProfile.board)
  const activeMineMeta =
    mineEloMetaMap[activeProfile.id] ??
    defaultMinesweeperEloMeta(latestSummary, activeProfile.board)
  const latestGeneration = profileHistory.at(-1)?.generation ?? null
  const previousGeneration = profileHistory.at(-2)?.generation ?? latestGeneration
  const effectiveSelectedGeneration =
    selectedGeneration !== null &&
    profileHistory.some((item) => item.generation === selectedGeneration)
      ? selectedGeneration
      : latestGeneration
  const effectiveCompareA =
    compareA !== null && profileHistory.some((item) => item.generation === compareA)
      ? compareA
      : previousGeneration
  const effectiveCompareB =
    compareB !== null && profileHistory.some((item) => item.generation === compareB)
      ? compareB
      : latestGeneration
  const selectedSummary =
    profileHistory.find((item) => item.generation === effectiveSelectedGeneration) ??
    profileHistory.at(-1) ??
    null
  const summaryA =
    profileHistory.find((item) => item.generation === effectiveCompareA) ?? null
  const summaryB =
    profileHistory.find((item) => item.generation === effectiveCompareB) ?? null
  const liveChampionSummary =
    trainingActive
      ? profileHistory.at(-1) ?? selectedSummary
      : selectedSummary
  const activeMineArchive = mineArchive.filter(
    (entry) => entry.profileId === activeProfile.id,
  )
  const selectedMineViewer =
    selectedMineViewerId === 'current'
      ? null
      : activeMineArchive.find((entry) => entry.id === selectedMineViewerId) ?? null
  const previewBoardConfig = selectedMineViewer?.board ?? activeProfile.board
  const previewChampionNetwork =
    selectedMineViewer?.champion ?? liveChampionSummary?.champion ?? null
  const mineEloMilestones = minesweeperEloMilestones()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles))
  }, [profiles])

  useEffect(() => {
    localStorage.setItem(ACTIVE_EXPERIENCE_STORAGE_KEY, activeExperience)
  }, [activeExperience])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeProfile, activeProfileId)
  }, [activeProfileId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history))
  }, [history])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(activeSettings))
  }, [activeSettings])

  useEffect(() => {
    localStorage.setItem(
      MINESWEEPER_ELO_META_STORAGE_KEY,
      JSON.stringify(mineEloMetaMap),
    )
  }, [mineEloMetaMap])

  useEffect(() => {
    localStorage.setItem(
      MINESWEEPER_ARCHIVE_STORAGE_KEY,
      JSON.stringify(mineArchive),
    )
  }, [mineArchive])

  useEffect(() => {
    if (!minesweeperLabActive || game.status !== 'playing') {
      return
    }

    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [game.status, minesweeperLabActive])

  useEffect(() => {
    if (!trainingActive) {
      return
    }

    const timer = window.setInterval(() => {
      setTrainingElapsedMs((value) => value + 250)
    }, 250)
    return () => window.clearInterval(timer)
  }, [trainingActive])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentMeta =
        mineEloMetaMap[activeProfile.id] ??
        defaultMinesweeperEloMeta(latestSummary, activeProfile.board)
      const nextCurrentElo = mineCalibration.running
        ? currentMeta.currentElo
        : estimatedMineElo
      const unlocked = collectUnlockedMilestones(
        nextCurrentElo,
        currentMeta.archivedMilestones,
        mineEloMilestones,
      )
      const peakImproved = nextCurrentElo > currentMeta.peakElo + 0.001

      if (
        Math.round(currentMeta.currentElo) === Math.round(nextCurrentElo) &&
        unlocked.length === 0 &&
        !peakImproved
      ) {
        return
      }

      setMineEloMetaMap((current) => ({
        ...current,
        [activeProfile.id]: {
          ...currentMeta,
          currentElo: nextCurrentElo,
          peakElo: Math.max(currentMeta.peakElo, nextCurrentElo),
          archivedMilestones: mergeArchivedMilestones(
            currentMeta.archivedMilestones,
            unlocked,
          ),
        },
      }))

      if (latestSummary && (unlocked.length > 0 || peakImproved)) {
        setMineArchive((current) =>
          mergeMinesweeperArchive(
            current,
            [
              ...(peakImproved
                ? [
                    createMinesweeperSnapshot(
                      activeProfile,
                      latestSummary,
                      nextCurrentElo,
                      Math.round(nextCurrentElo),
                      'peak',
                    ),
                  ]
                : []),
              ...unlocked.map((milestone) =>
                createMinesweeperSnapshot(
                  activeProfile,
                  latestSummary,
                  nextCurrentElo,
                  milestone,
                  'milestone',
                ),
              ),
            ],
          ),
        )
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [
    activeProfile,
    estimatedMineElo,
    latestSummary,
    mineCalibration.running,
    mineEloMetaMap,
    mineEloMilestones,
  ])

  const overlay = (() => {
    if (
      !minesweeperLabActive ||
      !showOverlay ||
      !previewChampionNetwork ||
      game.status === 'won' ||
      game.status === 'lost'
    ) {
      return []
    }

    const evaluations = []
    for (let row = 0; row < game.config.rows; row += 1) {
      for (let col = 0; col < game.config.cols; col += 1) {
        const cell = game.board[row][col]
        if (cell.revealed || cell.flagged) {
          continue
        }
        evaluations.push(evaluateCandidate(previewChampionNetwork, game, row, col))
      }
    }
    return evaluations
  })()

  const bestOpen =
    overlay
      .filter((item) => item.openScore >= item.flagScore)
      .sort((left, right) => right.openScore - left.openScore)[0] ?? null

  const bestFlag =
    [...overlay].sort((left, right) => right.flagScore - left.flagScore)[0] ?? null

  useEffect(() => {
    if (
      !minesweeperLabActive ||
      !previewChampionNetwork ||
      previewPaused ||
      mineBoardMode === 'play'
    ) {
      return
    }

    if (game.status === 'won' || game.status === 'lost') {
      const restart = window.setTimeout(() => {
        setGame(createGame(previewBoardConfig, randomSeed()))
      }, trainingActive ? 64 : 120)

      return () => window.clearTimeout(restart)
    }

    const interval = window.setInterval(() => {
      setGame((current) => {
        if (current.status === 'won' || current.status === 'lost') {
          return current
        }

        const next = cloneGame(current)
        const decision = chooseMove(previewChampionNetwork, next, activeSettings)
        if (!decision) {
          return createGame(previewBoardConfig, randomSeed())
        }
        applyMove(next, decision)
        return next
      })
    }, trainingActive ? 30 : 56)

    return () => window.clearInterval(interval)
  }, [
    game.status,
    activeSettings,
    mineBoardMode,
    minesweeperLabActive,
    previewPaused,
    previewBoardConfig,
    previewChampionNetwork,
    trainingActive,
  ])

  const elapsed = getElapsedSeconds(game)
  const strongestMineReference = strongestMinesweeperReference()
  const strongestMineReferenceGap = strongestMineReference
    ? strongestMineReference.probe.opponentElo - activeMineMeta.currentElo
    : null
  const highestArchivedMineModel =
    [...activeMineArchive].sort((left, right) => right.elo - left.elo)[0] ?? null
  const mineArchiveOptions = activeMineArchive
    .sort((left, right) => left.generation - right.generation)
    .map((entry) => ({
      id: entry.id,
      label:
        entry.snapshotType === 'peak'
          ? `Peak ${Math.round(entry.elo)} ELO - G${entry.generation.toString().padStart(3, '0')}`
          : `Milestone ${entry.milestone} - G${entry.generation.toString().padStart(3, '0')}`,
      subtitle: entry.note,
    }))
  const mineViewerNote = selectedMineViewer
    ? `${selectedMineViewer.note} - watching frozen bot`
    : minesweeperViewerNote(latestSummary, activeMineMeta.currentElo)
  const mineViewerLabel = selectedMineViewer
    ? `${
        selectedMineViewer.snapshotType === 'peak'
          ? 'Peak'
          : `Milestone ${selectedMineViewer.milestone}`
      } - ${selectedMineViewer.name}`
    : activeProfile.name
  const profileLevel = profileHistory.length
  const bestFitnessOverall = profileHistory.reduce(
    (best, item) => Math.max(best, item.bestFitness),
    0,
  )
  const mineChartGroups = useMemo(
    () => [
      {
        title: 'Fitness curve',
        note: 'Champion strength and average population level.',
        series: [
          {
            label: 'лучший fitness',
            color: '#d09d6d',
            values: profileHistory.map((item) => item.bestFitness),
          },
          {
            label: 'средний fitness',
            color: '#7eb6c5',
            values: profileHistory.map((item) => item.averageFitness),
          },
          {
            label: 'медиана',
            color: '#b47ac0',
            values: profileHistory.map((item) => item.medianFitness),
          },
        ],
      },
      {
        title: 'Outcome quality',
        note: 'Percent metrics on a shared scale.',
        series: [
          {
            label: 'win rate',
            color: '#8fb476',
            values: profileHistory.map(
              (item) => (item.benchmark.wins / Math.max(1, item.benchmark.games)) * 100,
            ),
          },
          {
            label: 'clear rate',
            color: '#77b5c6',
            values: profileHistory.map((item) => item.benchmark.avgClearedRatio * 100),
          },
          {
            label: 'reveal acc',
            color: '#d68b6a',
            values: profileHistory.map((item) => item.benchmark.avgRevealAccuracy * 100),
          },
          {
            label: 'flag acc',
            color: '#d7c06f',
            values: profileHistory.map((item) => item.benchmark.avgFlagAccuracy * 100),
          },
        ],
      },
      {
        title: 'Search pressure',
        note: 'Evolution dynamics without sharing an axis with fitness.',
        series: [
          {
            label: 'diversity',
            color: '#8aa3d1',
            values: profileHistory.map((item) => (item.populationDiversity ?? 0) * 100),
          },
          {
            label: 'exploration',
            color: '#d37a9c',
            values: profileHistory.map((item) => (item.explorationPressure ?? 0) * 100),
          },
          {
            label: 'mutation',
            color: '#7fb889',
            values: profileHistory.map((item) => (item.adaptiveMutationRate ?? 0) * 100),
          },
        ],
      },
    ],
    [profileHistory],
  )
  const sessionGenerations = liveSession
    ? profileHistory.slice(liveSession.baseGenerationCount)
    : []
  const sessionLatest = sessionGenerations.at(-1) ?? null
  const sessionPrevious = sessionGenerations.at(-2) ?? null
  const observedGenerations = Math.max(
    training.state.currentGeneration,
    sessionGenerations.length,
  )
  const sessionDurationMs = liveSession
    ? Math.max(trainingElapsedMs, observedGenerations > 0 ? 250 : 0)
    : 0
  const currentCycleProgress =
    training.state.targetGenerations > 0
      ? (training.state.currentGeneration / training.state.targetGenerations) * 100
      : 0
  const pacePerMinute =
    sessionDurationMs > 0 ? observedGenerations / (sessionDurationMs / 60000) : 0
  const etaMinutes =
    trainingActive && pacePerMinute > 0
      ? (training.state.targetGenerations - training.state.currentGeneration) /
        pacePerMinute
      : 0
  const baselineBestFitness = liveSession?.baseBestFitness ?? 0
  const baselineWinRate = liveSession?.baseWinRate ?? 0
  const liveWinRate = sessionLatest
    ? sessionLatest.benchmark.wins / Math.max(1, sessionLatest.benchmark.games)
    : latestWinRate
  const fitnessGain = (sessionLatest?.bestFitness ?? baselineBestFitness) - baselineBestFitness
  const winRateGain = liveWinRate - baselineWinRate
  const latestJump = sessionLatest
    ? sessionLatest.bestFitness -
      (sessionPrevious?.bestFitness ?? baselineBestFitness)
    : 0
  const survivalTempo = sessionLatest?.benchmark.avgSurvivalTurns ?? 0
  const currentAverageFitness = sessionLatest?.averageFitness ?? latestSummary?.averageFitness ?? 0
  const liveClearedRatio =
    sessionLatest?.benchmark.avgClearedRatio ??
    latestSummary?.benchmark.avgClearedRatio ??
    0
  const liveRevealAccuracy =
    sessionLatest?.benchmark.avgRevealAccuracy ??
    latestSummary?.benchmark.avgRevealAccuracy ??
    0
  const liveFlagAccuracy =
    sessionLatest?.benchmark.avgFlagAccuracy ??
    latestSummary?.benchmark.avgFlagAccuracy ??
    0
  const liveAverageMoves =
    sessionLatest?.benchmark.avgMoves ?? latestSummary?.benchmark.avgMoves ?? 0
  const liveMedianFitness = sessionLatest?.medianFitness ?? latestSummary?.medianFitness ?? 0
  const liveDrift = sessionLatest?.driftFromPrevious ?? latestSummary?.driftFromPrevious ?? 0
  const currentDiversity =
    sessionLatest?.populationDiversity ?? latestSummary?.populationDiversity ?? 0
  const currentExploration =
    sessionLatest?.explorationPressure ?? latestSummary?.explorationPressure ?? 0
  const currentAdaptiveMutationRate =
    sessionLatest?.adaptiveMutationRate ??
    latestSummary?.adaptiveMutationRate ??
    activeSettings.mutationRate
  const currentAdaptiveMutationScale =
    sessionLatest?.adaptiveMutationScale ??
    latestSummary?.adaptiveMutationScale ??
    activeSettings.mutationScale
  const currentStagnation =
    sessionLatest?.stagnationCount ?? latestSummary?.stagnationCount ?? 0
  const liveBenchmarkGames =
    sessionLatest?.benchmark.games ?? latestSummary?.benchmark.games ?? 0
  const liveBenchmarkWins =
    sessionLatest?.benchmark.wins ?? latestSummary?.benchmark.wins ?? 0
  const currentClearRatio =
    game.totalSafe > 0 ? game.revealedSafe / game.totalSafe : 0
  const minesRemaining = Math.max(0, previewBoardConfig.mines - game.flagsUsed)
  const previewStatusLabel =
    mineBoardMode === 'play'
      ? 'manual board'
      : previewPaused
        ? 'watch paused'
        : trainingActive
          ? 'live bot run'
          : 'auto watch'
  const previewStatusNote =
    mineBoardMode === 'play'
      ? 'human moves are enabled on the board'
      : previewPaused
        ? 'training can continue in the background'
        : trainingActive
          ? 'the current champion is playing this run'
          : 'the latest champion keeps replaying'
  const networkShape =
    activeSettings.hiddenLayers.length > 0
      ? activeSettings.hiddenLayers.join(' × ')
      : 'стандартная'
  const progressPercentLabel = `${Math.round(currentCycleProgress)}%`
  const progressGenerationLabel =
    training.state.targetGenerations > 0
      ? `${training.state.currentGeneration}/${training.state.targetGenerations}`
      : '0/0'
  const progressPaceLabel =
    pacePerMinute > 0 ? `${pacePerMinute.toFixed(1)} / мин` : 'ожидание'
  const cycleGenerationBudget =
    training.state.targetGenerations > 0
      ? training.state.targetGenerations
      : activeSettings.generations
  const simulationsPerGeneration =
    activeSettings.populationSize * activeSettings.gamesPerGenome
  const simulationsPerCycle = cycleGenerationBudget * simulationsPerGeneration
  const cpuWorkerLimit =
    typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
      ? Math.max(1, Math.min(16, navigator.hardwareConcurrency - 1))
      : DEFAULT_PARALLEL_WORKERS
  const completedSimulationCount = Math.min(
    simulationsPerCycle,
    training.state.currentGeneration * simulationsPerGeneration,
  )
  const validationSimulationsPerCycle =
    cycleGenerationBudget * activeSettings.validationGames
  const completedValidationCount = Math.min(
    validationSimulationsPerCycle,
    training.state.currentGeneration * activeSettings.validationGames,
  )
  const growthTargetPreset = recommendedGrowthPreset(profileLevel)
  const autoArenaGrowthEnabled = activePreset !== 'custom'
  const growthStartGeneration =
    !autoArenaGrowthEnabled || activePreset === 'beginner'
      ? 0
      : activePreset === 'intermediate'
        ? ARENA_GROWTH_MILESTONES.intermediate
        : ARENA_GROWTH_MILESTONES.expert
  const growthTargetGeneration =
    !autoArenaGrowthEnabled
      ? profileLevel
      : activePreset === 'expert'
        ? ARENA_GROWTH_MILESTONES.expert
        : activePreset === 'intermediate'
          ? ARENA_GROWTH_MILESTONES.expert
          : ARENA_GROWTH_MILESTONES.intermediate
  const arenaGrowthValue =
    activePreset === 'expert'
      ? growthTargetGeneration - growthStartGeneration
      : Math.max(
          0,
          Math.min(profileLevel, growthTargetGeneration) - growthStartGeneration,
        )
  const arenaGrowthMax = Math.max(1, growthTargetGeneration - growthStartGeneration)
  const mineReferenceItems = referenceViewItems('minesweeper')
  const nextArenaMilestoneLabel = !autoArenaGrowthEnabled
    ? 'кастомное поле — без автороста'
    : activePreset === 'expert'
      ? 'достигнут максимум: Expert'
      : activePreset === 'intermediate'
        ? `G${ARENA_GROWTH_MILESTONES.expert.toString().padStart(3, '0')} -> 16x30 · 99`
        : profileLevel < ARENA_GROWTH_MILESTONES.intermediate
          ? `G${ARENA_GROWTH_MILESTONES.intermediate.toString().padStart(3, '0')} -> 16x16 · 40`
          : `G${ARENA_GROWTH_MILESTONES.expert.toString().padStart(3, '0')} -> 16x30 · 99`

  const faceState: FaceState =
    game.status === 'won'
      ? 'winner'
      : game.status === 'lost'
        ? 'dead'
        : 'smile'
  const mineReferenceCeilingLabel = strongestMineReference
    ? `${strongestMineReference.probe.opponentLabel} · ${strongestMineReference.probe.opponentElo} ELO`
    : 'n/a'
  const mineReferenceCeilingNote = strongestMineReference
    ? `${strongestMineReference.source?.label ?? 'Reference'} · ${formatBoard(strongestMineReference.probe.board)}`
    : 'No external anchor loaded'
  const mineChampionComparison = {
    title: 'Current champion vs top external anchor',
    description:
      'The left side is the live branch you are growing. The right side is the strongest outside reference currently wired into calibration.',
    summary: strongestMineReference
      ? `Gap to strongest available reference: ${signed(activeMineMeta.currentElo - strongestMineReference.probe.opponentElo, 0)} ELO. The latest peak and every milestone stay frozen as watchable models.`
      : 'No external reference is currently available for this game.',
    ourChampion: {
      eyebrow: 'Our champion',
      title: `${activeProfile.name} · ${Math.round(activeMineMeta.currentElo)} ELO`,
      subtitle: highestArchivedMineModel
        ? `Top frozen bot: ${Math.round(highestArchivedMineModel.elo)} ELO · G${highestArchivedMineModel.generation.toString().padStart(3, '0')}`
        : 'No frozen bots yet.',
      metrics: [
        {
          label: 'Peak',
          value: `${Math.round(activeMineMeta.peakElo)} ELO`,
          detail:
            activeMineMeta.calibratedElo !== null
              ? `Last calibrated ${Math.round(activeMineMeta.calibratedElo)} ELO`
              : 'Using live projected ELO',
        },
        {
          label: 'Board',
          value: formatBoardCompact(activeProfile.board),
          detail: `${profileStage(profileLevel, latestWinRate)} · ${profileLevel} trained generations`,
        },
        {
          label: 'Benchmark',
          value: `W ${percent(latestWinRate)} · clear ${percent(liveClearedRatio)}`,
          detail: `Reveal ${percent(liveRevealAccuracy)} · flag ${percent(liveFlagAccuracy)}`,
        },
        {
          label: 'Champion fitness',
          value: (latestSummary?.bestFitness ?? 0).toFixed(2),
          detail: `Network ${networkShape} · pop ${activeSettings.populationSize}`,
        },
      ],
    },
    externalChampion: {
      eyebrow: 'External anchor',
      title: strongestMineReference
        ? `${strongestMineReference.probe.opponentLabel} · ${strongestMineReference.probe.opponentElo} ELO`
        : 'Reference unavailable',
      subtitle: strongestMineReference
        ? strongestMineReference.source?.label ?? 'Reference'
        : 'No probe configured',
      metrics: strongestMineReference
        ? [
            {
              label: 'Method',
              value: strongestMineReference.source?.type.toUpperCase() ?? 'REFERENCE',
              detail: strongestMineReference.source?.note ?? strongestMineReference.probe.note,
            },
            {
              label: 'Arena',
              value: formatBoardCompact(strongestMineReference.probe.board),
              detail: strongestMineReference.probe.note,
            },
            {
              label: 'Source',
              value: strongestMineReference.source?.sourceLabel ?? 'Local anchor',
              detail: strongestMineReference.source?.sourceUrl ?? 'No public URL',
            },
            {
              label: 'ELO gap',
              value: `${signed(
                activeMineMeta.currentElo - strongestMineReference.probe.opponentElo,
                0,
              )} ELO`,
              detail:
                strongestMineReferenceGap !== null && strongestMineReferenceGap > 0
                  ? 'Current branch is above the strongest external anchor.'
                  : 'More growth is needed to close the anchor gap.',
            },
          ]
        : [],
    },
  }

  const updateActiveProfile = useCallback((
    updater: (profile: ModelProfile, index: number) => ModelProfile,
  ) => {
    setProfiles((current) =>
      current.map((profile, index) =>
        profile.id === activeProfile.id
          ? sanitizeProfile(updater(profile, index), profile.settings, index)
          : profile,
      ),
    )
  }, [activeProfile.id])

  const updateActiveBoard = (nextBoard: BoardConfig) => {
    const board = clampBoard(nextBoard)
    const nextSettings = sanitizeSettings({
      ...activeSettings,
      board,
      continueFromChampion: true,
    })

    updateActiveProfile((profile) => ({
      ...profile,
      board,
      settings: nextSettings,
    }))
    setPreviewPaused(false)
    setGame(createGame(board))
  }

  const updateActiveSetting = <K extends keyof TrainingSettings>(
    key: K,
    value: TrainingSettings[K],
  ) => {
    const nextSettings = sanitizeSettings({
      ...activeSettings,
      [key]: value,
      board: activeProfile.board,
      continueFromChampion: true,
    })

    updateActiveProfile((profile) => ({
      ...profile,
      settings: nextSettings,
    }))
  }

  useEffect(() => {
    if (trainingRunning || previewPaused || !autoArenaGrowthEnabled) {
      return
    }

    if (presetRank(growthTargetPreset) <= presetRank(activePreset)) {
      return
    }

    const nextBoard = PRESET_CONFIGS[growthTargetPreset]
    const nextSettings = sanitizeSettings({
      ...activeSettings,
      board: nextBoard,
      continueFromChampion: true,
    })

    const timer = window.setTimeout(() => {
      updateActiveProfile((profile) => ({
        ...profile,
        board: nextBoard,
        settings: nextSettings,
      }))
      setPreviewPaused(false)
      setGame(createGame(nextBoard))
    }, 0)

    return () => window.clearTimeout(timer)
  }, [
    activePreset,
    activeSettings,
    autoArenaGrowthEnabled,
    growthTargetPreset,
    previewPaused,
    trainingRunning,
    updateActiveProfile,
  ])

  useEffect(() => {
    if (!mineCalibration.running || !latestSummary) {
      return
    }

    const probe = MINESWEEPER_CALIBRATION_PROBES[mineCalibration.current]
    if (!probe) {
      const finalizeTimer = window.setTimeout(() => {
        const completedAt = Date.now()
        const currentMeta =
          mineEloMetaMap[activeProfile.id] ??
          defaultMinesweeperEloMeta(latestSummary, activeProfile.board)
        const nextMeta = {
          ...currentMeta,
          currentElo: mineCalibration.currentElo,
          calibratedElo: mineCalibration.currentElo,
          peakElo: Math.max(currentMeta.peakElo, mineCalibration.currentElo),
          lastCalibratedAt: completedAt,
        }
        const unlocked = collectUnlockedMilestones(
          nextMeta.currentElo,
          nextMeta.archivedMilestones,
          mineEloMilestones,
        )
        const peakImproved = nextMeta.currentElo > currentMeta.peakElo + 0.001

        setMineEloMetaMap((current) => ({
          ...current,
          [activeProfile.id]: {
            ...nextMeta,
            archivedMilestones: mergeArchivedMilestones(
              nextMeta.archivedMilestones,
              unlocked,
            ),
          },
        }))

        if (unlocked.length > 0 || peakImproved) {
          setMineArchive((current) =>
            mergeMinesweeperArchive(
              current,
              [
                ...(peakImproved
                  ? [
                      createMinesweeperSnapshot(
                        activeProfile,
                        latestSummary,
                        mineCalibration.currentElo,
                        Math.round(mineCalibration.currentElo),
                        'peak',
                      ),
                    ]
                  : []),
                ...unlocked.map((milestone) =>
                  createMinesweeperSnapshot(
                    activeProfile,
                    latestSummary,
                    mineCalibration.currentElo,
                    milestone,
                    'milestone',
                  ),
                ),
              ],
            ),
          )
        }

        setMineCalibration((current) => ({
          ...current,
          running: false,
          logs: [
            `calibrated ${Math.round(mineCalibration.currentElo)} ELO`,
            ...current.logs,
          ].slice(0, 18),
        }))
      }, 0)

      return () => window.clearTimeout(finalizeTimer)
    }

    const timer = window.setTimeout(() => {
      const probeReference = referenceSource(probe.referenceId)
      const result = readMinesweeperCalibrationProbe(
        latestSummary.champion,
        activeSettings,
        probe,
        mineCalibration.currentElo,
      )

      setMineCalibration((current) => ({
        ...current,
        current: current.current + 1,
        currentElo: result.resultingElo,
        activeProbeLabel: `${probe.label} · ${probeReference?.label ?? 'Reference'}`,
        logs: [
          `${probeReference?.label ?? 'Reference'} · ${probe.opponentLabel} (${probe.opponentElo}) · score ${result.observedScore.toFixed(2)} · Δ${result.delta.toFixed(1)}`,
          `${result.note}`,
          ...current.logs,
        ].slice(0, 18),
      }))
    }, 280)

    return () => window.clearTimeout(timer)
  }, [
    activeProfile,
    activeSettings,
    latestSummary,
    mineCalibration,
    mineEloMetaMap,
    mineEloMilestones,
  ])

  const selectProfile = (profileId: string) => {
    const nextProfile = profiles.find((profile) => profile.id === profileId)
    if (!nextProfile || trainingActive || mineCalibration.running) {
      return
    }

    setActiveProfileId(nextProfile.id)
    setHiddenLayerInput(nextProfile.settings.hiddenLayers.join(', '))
    setSelectedGeneration(null)
    setCompareA(null)
    setCompareB(null)
    setLiveSession(null)
    setPreviewPaused(false)
    setSelectedMineViewerId('current')
    setGame(createGame(nextProfile.board))
  }

  const createNewProfile = () => {
    if (trainingActive || mineCalibration.running) {
      return
    }

    const nextProfile = createProfile(
      {
        ...activeSettings,
        board: activeProfile.board,
        continueFromChampion: true,
        benchmarkSeed: randomSeed(),
      },
      profiles.length,
    )

    setProfiles((current) => [...current, nextProfile])
    setActiveProfileId(nextProfile.id)
    setHiddenLayerInput(nextProfile.settings.hiddenLayers.join(', '))
    setSelectedGeneration(null)
    setCompareA(null)
    setCompareB(null)
    setLiveSession(null)
    setPreviewPaused(false)
    setSelectedMineViewerId('current')
    setGame(createGame(nextProfile.board))
  }

  const resetGame = (seed?: number) => {
    setPreviewPaused(mineBoardMode === 'play')
    setGame(createGame(previewBoardConfig, seed))
  }

  const setMineWatchMode = () => {
    setMineBoardMode('watch')
    setPreviewPaused(false)
  }

  const setMinePlayMode = () => {
    setMineBoardMode('play')
    setPreviewPaused(true)
  }

  const stepPreviewRun = () => {
    if (!previewChampionNetwork || mineBoardMode === 'play') {
      return
    }

    setGame((current) => {
      if (current.status === 'won' || current.status === 'lost') {
        return createGame(previewBoardConfig, randomSeed())
      }

      const next = cloneGame(current)
      const decision = chooseMove(previewChampionNetwork, next, activeSettings)
      if (!decision) {
        return createGame(previewBoardConfig, randomSeed())
      }

      applyMove(next, decision)
      return next
    })
  }

  const revealMineCell = (row: number, col: number) => {
    setMinePlayMode()
    setGame((current) => {
      const next = cloneGame(current)
      return revealCell(next, row, col) ? next : current
    })
  }

  const flagMineCell = (row: number, col: number) => {
    setMinePlayMode()
    setGame((current) => {
      const next = cloneGame(current)
      return toggleFlag(next, row, col) ? next : current
    })
  }

  const chordMineCell = (row: number, col: number) => {
    setMinePlayMode()
    setGame((current) => {
      const next = cloneGame(current)
      return chordCell(next, row, col) ? next : current
    })
  }

  const togglePreviewRun = () => {
    if (!previewChampionNetwork || mineBoardMode === 'play') {
      return
    }
    setPreviewPaused((value) => !value)
  }

  const selectMineViewer = (viewerId: string) => {
    const nextViewer =
      viewerId === 'current'
        ? null
        : activeMineArchive.find((entry) => entry.id === viewerId) ?? null
    setSelectedMineViewerId(viewerId)
    setMineBoardMode('watch')
    setPreviewPaused(false)
    setGame(createGame(nextViewer?.board ?? activeProfile.board))
  }

  const resolveTrainingSettings = useCallback(() => {
    const parsedHiddenLayers = hiddenLayerInput
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)

    return sanitizeSettings({
      ...activeSettings,
      board: activeProfile.board,
      continueFromChampion: true,
      hiddenLayers:
        parsedHiddenLayers.length > 0
          ? parsedHiddenLayers
          : activeSettings.hiddenLayers,
    })
  }, [activeProfile.board, activeSettings, hiddenLayerInput])

  const startTraining = () => {
    if (mineCalibration.running || trainingActive) {
      return
    }

    const nextSettings = resolveTrainingSettings()

    setHiddenLayerInput(nextSettings.hiddenLayers.join(', '))
    setTrainingElapsedMs(0)
    setMineBoardMode('watch')
    setPreviewPaused(false)
    setContinuousTraining(true)
    setLiveSession({
      baseGenerationCount: profileHistory.length,
      baseBestFitness: latestSummary?.bestFitness ?? 0,
      baseWinRate: latestWinRate,
    })
    updateActiveProfile((profile) => ({
      ...profile,
      settings: nextSettings,
    }))
    training.run(
      nextSettings,
      profileHistory.at(-1)?.champion ?? null,
      profileHistory.length,
      activeProfile.id,
    )
  }

  const stopTrainingLoop = () => {
    if (!trainingActive) {
      return
    }

    setContinuousTraining(false)
    if (training.state.running) {
      training.stop()
    }
  }

  useEffect(() => {
    if (!continuousTraining || trainingRunning || mineCalibration.running) {
      return
    }

    const timer = window.setTimeout(() => {
      runTrainingBatch(
        activeProfile.settings,
        profileHistory.at(-1)?.champion ?? null,
        profileHistory.length,
        activeProfile.id,
      )
    }, 0)

    return () => window.clearTimeout(timer)
  }, [
    activeProfile.id,
    activeProfile.settings,
    continuousTraining,
    mineCalibration.running,
    profileHistory,
    runTrainingBatch,
    trainingRunning,
  ])

  const startMineCalibration = () => {
    if (trainingActive || mineCalibration.running || !latestSummary) {
      return
    }

    const startingElo =
      mineEloMetaMap[activeProfile.id]?.calibratedElo ??
      mineEloMetaMap[activeProfile.id]?.currentElo ??
      estimatedMineElo

    setMineCalibration({
      running: true,
      current: 0,
      total: MINESWEEPER_CALIBRATION_PROBES.length,
      currentElo: startingElo,
      activeProbeLabel: MINESWEEPER_CALIBRATION_PROBES[0]?.label ?? 'idle',
      logs: [
        `launch calibration · minesweeper · start ${Math.round(startingElo)} ELO`,
      ],
    })
  }

  const clearActiveProfile = () => {
    if (trainingActive || mineCalibration.running) {
      return
    }
    const retainedHistory = history.filter(
      (item) => item.profileId !== activeProfile.id,
    )
    training.setHistory(retainedHistory)
    setSelectedGeneration(null)
    setCompareA(null)
    setCompareB(null)
    setLiveSession(null)
    setPreviewPaused(false)
    setSelectedMineViewerId('current')
    setGame(createGame(activeProfile.board))
  }

  const profileCardChips = [
    activeProfile.species,
    profileTemperament(latestSummary),
    arenaLabel(activeProfile.board),
    strongestMineReference
      ? `Ref gap ${signed(activeMineMeta.currentElo - strongestMineReference.probe.opponentElo, 0)}`
      : 'No external anchor',
  ]
  const switchExperience = (next: ArenaExperienceId) => {
    if (next !== 'minesweeper') {
      if (trainingActive) {
        stopTrainingLoop()
      }
      if (mineCalibration.running) {
        setMineCalibration((current) => ({ ...current, running: false }))
      }
      setPreviewPaused(true)
    } else {
      setPreviewPaused(false)
    }

    setActiveExperience(next)
  }
  const activeExperienceCard =
    EXPERIENCE_CARDS.find((card) => card.id === activeExperience) ?? EXPERIENCE_CARDS[0]
  const windowCaption =
    activeExperience === 'minesweeper'
      ? 'AI Arena | Minesweeper Neural Lab'
      : `AI Arena | ${activeExperienceCard.title}`
  const windowMode =
    activeExperience === 'minesweeper'
      ? trainingActive
        ? 'идёт обучение'
        : 'профиль активен'
      : 'стратегическая лаборатория'

  return (
    <div className="app-shell">
      <div className="app-window">
        <div className="window-chrome">
          <div className="window-controls" aria-hidden="true">
            <span className="control-dot control-close" />
            <span className="control-dot control-minimize" />
            <span className="control-dot control-expand" />
          </div>
          <span className="window-caption">{windowCaption}</span>
          <span className="window-mode">
            {trainingActive ? 'идёт обучение' : 'профиль активен'}
          </span>
        </div>

        <section className="experience-switchboard" data-mode={windowMode}>
          <div className="section-head">
            <div>
              <p className="eyebrow">Game matrix</p>
              <h2>Multi-game AI labs</h2>
            </div>
          </div>
          <p className="section-copy">One workspace, several game arenas. Train engines, watch archived peaks, and play against any saved or external bot.</p>
          <div className="experience-card-grid">
            {EXPERIENCE_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                className={[
                  'experience-card',
                  activeExperience === card.id ? 'active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => switchExperience(card.id)}
                data-testid={`game-switch-${card.id}`}
              >
                <span className="experience-card-eyebrow">{card.eyebrow}</span>
                <strong>{card.title}</strong>
                <p>{card.description}</p>
                <span className="experience-card-theory">{card.theory}</span>
                <span className="experience-card-board">{card.board}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="experience-roadmap">
          <div className="section-head">
            <div>
              <p className="eyebrow">Roadmap</p>
              <h2>Project roadmap</h2>
            </div>
          </div>
          <details className="disclosure-panel" open={false}>
            <summary className="disclosure-header">
              <div className="disclosure-copy">
                <strong>Product roadmap</strong>
                <span>{ROADMAP_ITEMS.length} backlog tracks, kept secondary to the live game labs.</span>
              </div>
              <span className="disclosure-toggle" aria-hidden="true">
                open
              </span>
            </summary>
            <div className="disclosure-body">
              <p className="section-copy">
                The next product layers stay here as backlog, not as first-screen noise: playable
                bots by ELO band, a catalog of already solved tabletop games, a ranked database of
                popular strategy and card games by solution difficulty, and a mode that can study a
                new ruleset and recommend the best move.
              </p>
              <div className="roadmap-grid">
                {ROADMAP_ITEMS.map((item) => (
                  <article key={item.title} className="roadmap-item">
                    <span className="roadmap-status">{item.status}</span>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </details>
        </section>

        {activeExperience === 'minesweeper' ? (
          <>
          <section className="workflow-grid">
          <section className="play-stage top-stage">
            <div className="section-head">
              <div>
                <p className="eyebrow">Arena</p>
                <h2>Живая партия</h2>
              </div>
              <div className="play-toolbar">
                <button type="button" onClick={() => resetGame()}>
                  Новый ран
                </button>
                <button type="button" onClick={() => resetGame(randomSeed())}>
                  Новый seed
                </button>
                <button
                  type="button"
                  className={mineBoardMode === 'watch' ? 'active' : ''}
                  onClick={setMineWatchMode}
                >
                  Watch bot
                </button>
                <button
                  type="button"
                  className={mineBoardMode === 'play' ? 'active' : ''}
                  onClick={setMinePlayMode}
                >
                  Play board
                </button>
                <button
                  type="button"
                  onClick={stepPreviewRun}
                  disabled={!previewChampionNetwork || mineBoardMode === 'play'}
                >
                  Bot step
                </button>
              </div>
            </div>
            <p className="section-copy">
              Верхний экран показывает только то, что нужно в моменте: живой ран,
              текущее состояние доски и качество чемпиона.
            </p>

            <div className="signal-strip arena-strip">
              <div>
                <span>режим показа</span>
                <strong data-testid="preview-status">{previewStatusLabel}</strong>
              </div>
              <div>
                <span>состояние показа</span>
                <strong>{previewStatusNote}</strong>
              </div>
              <div>
                <span>очистка текущего рана</span>
                <strong>{percent(currentClearRatio)}</strong>
              </div>
              <div>
                <span>мины осталось</span>
                <strong>{minesRemaining}</strong>
              </div>
              <div>
                <span>ходов в ране</span>
                <strong>{game.moveCount}</strong>
              </div>
              <div>
                <span>время рана</span>
                <strong>{elapsed}s</strong>
              </div>
            </div>

            <div className="play-panel">
              <div className="classic-window">
                <div className="window-titlebar">
                  <strong>Minesweeper</strong>
                  <span>
                    {mineViewerLabel} · {previewBoardConfig.label} ·{' '}
                    {previewBoardConfig.rows}x{previewBoardConfig.cols} ·{' '}
                    {previewBoardConfig.mines} mines
                  </span>
                </div>

                <div className="window-menubar">
                  <span>Game</span>
                  <span>Help</span>
                </div>

                <div className="game-shell">
                  <div className="board-header">
                    <SpriteCounter value={previewBoardConfig.mines - game.flagsUsed} />
                    <button
                      type="button"
                      className="reset-face"
                      onClick={() => resetGame()}
                    >
                      <SpriteFace state={faceState} />
                    </button>
                    <SpriteCounter value={elapsed} />
                  </div>

                  <div className="board-surface">
                    <div className="play-meta">
                      <span>{formatBoard(previewBoardConfig)}</span>
                      <span>{previewStatusLabel}</span>
                      <span>{gameStatusLabel(game.status)}</span>
                      <span>очистка {percent(currentClearRatio)}</span>
                      <span>мин осталось {minesRemaining}</span>
                      <span>ходов {game.moveCount}</span>
                    </div>

                    <MinesweeperBoard
                      board={snapshotBoard(game)}
                      overlay={overlay}
                      interactive={mineBoardMode === 'play'}
                      onReveal={revealMineCell}
                      onFlag={flagMineCell}
                      onChord={chordMineCell}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="profile-hub">
            <div className="section-head">
              <div>
                <p className="eyebrow">Workflow</p>
                <h2>Профиль выращивания</h2>
              </div>
            </div>
            <p className="section-copy">
              Основной сценарий один: выбрать профиль и жать <strong>Обучать</strong>.
            </p>

            <div className="profile-toolbar">
              <label className="profile-picker">
                <span>Активный профиль</span>
                <select
                  value={activeProfile.id}
                  disabled={settingsLocked}
                  onChange={(event) => selectProfile(event.target.value)}
                >
                  {profiles.map((profile) => {
                    const generations = history.filter(
                      (item) => item.profileId === profile.id,
                    ).length

                    return (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} · {profile.species} · G{generations
                          .toString()
                          .padStart(3, '0')}
                      </option>
                    )
                  })}
                </select>
              </label>

              <button
                type="button"
                className="secondary-pill"
                disabled={settingsLocked}
                onClick={createNewProfile}
                data-testid="new-profile-button"
              >
                New profile
              </button>
            </div>

            <div className="profile-hero">
              <div className="profile-avatar">
                <span className="profile-avatar-code">
                  {activeProfile.species.slice(0, 3).toUpperCase()}
                </span>
                <span className="profile-avatar-tag">
                  latest peak pinned automatically
                </span>
                <div className="profile-avatar-meta">
                  <strong>{Math.round(activeMineMeta.currentElo)} ELO</strong>
                  <small>{observedGenerations} generations trained in this run</small>
                </div>
              </div>

              <div className="profile-identity">
                <p className="eyebrow">Engine dossier</p>
                <h1>{activeProfile.name}</h1>
                <p className="profile-species">{activeProfile.species}</p>
                <p className="profile-story">
                  {profileHeadline(activeProfile, latestSummary)}
                </p>
                <div className="profile-card-grid">
                  <div className="profile-card-stat">
                    <span>champion rating</span>
                    <strong>{Math.round(activeMineMeta.currentElo)} ELO</strong>
                    <small>
                      peak {Math.round(activeMineMeta.peakElo)} - calibrated{' '}
                      {activeMineMeta.calibratedElo !== null
                        ? Math.round(activeMineMeta.calibratedElo)
                        : 'pending'}
                    </small>
                  </div>
                  <div className="profile-card-stat">
                    <span>reference ceiling</span>
                    <strong>{mineReferenceCeilingLabel}</strong>
                    <small>
                      {strongestMineReferenceGap !== null
                        ? `${signed(strongestMineReferenceGap, 0)} ELO vs top external anchor`
                        : 'No external anchor'}
                    </small>
                  </div>
                  <div className="profile-card-stat">
                    <span>training branch</span>
                    <strong>
                      {trainingActive
                        ? `${observedGenerations} gens - ${pacePerMinute.toFixed(1)} / min`
                        : 'ready to train'}
                    </strong>
                    <small>
                      {trainingActive
                        ? `${completedSimulationCount}/${simulationsPerCycle} sims in cycle`
                        : `next arena ${nextArenaMilestoneLabel}`}
                    </small>
                  </div>
                  <div className="profile-card-stat">
                    <span>network core</span>
                    <strong>{networkShape}</strong>
                    <small>
                      pop {activeSettings.populationSize} - {activeSettings.gamesPerGenome} games /
                      genome - validation {activeSettings.validationGames}
                    </small>
                  </div>
                  <div className="profile-card-stat">
                    <span>solver signal</span>
                    <strong>
                      fit {currentAverageFitness.toFixed(2)} - reveal {percent(liveRevealAccuracy)}
                    </strong>
                    <small>
                      win {percent(liveWinRate)} - cleared {percent(liveClearedRatio)} - flag{' '}
                      {percent(liveFlagAccuracy)}
                    </small>
                  </div>
                </div>
                <div className="profile-chip-row">
                  {profileCardChips.map((chip, index) => (
                    <span key={`${index}-${chip}`} className="profile-chip">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div className="profile-actions">
                <button
                  type="button"
                  className="train-cta"
                  disabled={trainingActive || mineCalibration.running}
                  onClick={startTraining}
                  data-testid="train-button"
                >
                  {trainingActive ? 'Training live' : 'Train'}
                </button>
                <div className="action-row compact">
                  <button
                    type="button"
                    className="danger"
                    onClick={stopTrainingLoop}
                    disabled={!trainingActive}
                    data-testid="stop-training"
                  >
                    Stop training
                  </button>
                  <button
                    type="button"
                    onClick={togglePreviewRun}
                    disabled={!previewChampionNetwork}
                    data-testid="toggle-preview-run"
                  >
                    {previewPaused ? 'Resume run' : 'Pause run'}
                  </button>
                </div>
                <div className="profile-train-note">
                  Кнопка «Обучать» запускает непрерывную сессию: новые циклы стартуют сами,
                  пока вы не нажмёте «Остановить обучение». Размер окна цикла: {activeSettings.generations}{' '}
                  поколений · популяция {activeSettings.populationSize} · ~{simulationsPerCycle}{' '}
                  симуляций.
                </div>
              </div>
            </div>

            <div className="profile-vitals">
              <div>
                <span>арена</span>
                <strong>{formatBoard(activeProfile.board)}</strong>
              </div>
              <div>
                <span>лучшая форма</span>
                <strong>{bestFitnessOverall.toFixed(1)}</strong>
              </div>
              <div>
                <span>последний win rate</span>
                <strong>{percent(latestWinRate)}</strong>
              </div>
              <div>
                <span>поколений выращено</span>
                <strong>{profileLevel}</strong>
              </div>
              <div>
                <span>следующая арена</span>
                <strong>{nextArenaMilestoneLabel}</strong>
              </div>
              <div>
                <span>архитектура сети</span>
                <strong>{networkShape}</strong>
              </div>
              <div>
                <span>эволюционный цикл</span>
                <strong>
                  {activeSettings.populationSize} × {activeSettings.gamesPerGenome}
                </strong>
              </div>
              <div>
                <span>мутация</span>
                <strong>
                  {(activeSettings.mutationRate * 100).toFixed(0)}% ·{' '}
                  {activeSettings.mutationScale.toFixed(2)} · x
                  {activeSettings.mutationAggression.toFixed(2)}
                </strong>
              </div>
              <div>
                <span>elite / crossover</span>
                <strong>
                  {activeSettings.eliteCount} · {(activeSettings.crossoverRate * 100).toFixed(0)}%
                </strong>
              </div>
            </div>

            <EloArchivePanel
              title="Archived bots"
              description="The latest peak ELO and every milestone checkpoint are frozen so you can inspect the current champion and the major checkpoints."
              currentLabel={`${mineViewerLabel} - ${Math.round(
                selectedMineViewer?.elo ?? activeMineMeta.currentElo,
              )} ELO`}
              currentElo={activeMineMeta.currentElo}
              peakElo={activeMineMeta.peakElo}
              calibratedElo={activeMineMeta.calibratedElo}
              lastCalibratedAt={activeMineMeta.lastCalibratedAt}
              nextMilestone={nextUnreachedMilestone(
                activeMineMeta.currentElo,
                activeMineMeta.archivedMilestones,
                mineEloMilestones,
              )}
              referencePeakLabel={mineReferenceCeilingLabel}
              referencePeakNote={mineReferenceCeilingNote}
              selectedViewerId={selectedMineViewerId}
              options={mineArchiveOptions}
              onSelectViewer={selectMineViewer}
              onCalibrate={startMineCalibration}
              calibrationDisabled={!latestSummary || trainingActive || mineCalibration.running}
              calibrationRunning={mineCalibration.running}
              calibrationCurrent={mineCalibration.current}
              calibrationTotal={mineCalibration.total}
              calibrationCurrentElo={mineCalibration.currentElo || activeMineMeta.currentElo}
              calibrationProbeLabel={mineCalibration.activeProbeLabel}
              calibrationLogs={mineCalibration.logs}
              viewerNote={mineViewerNote}
              comparison={mineChampionComparison}
              referenceItems={mineReferenceItems}
              testIdPrefix="minesweeper"
            />

            <div className="priority-panel">
              <div className="widget-head">
                <p className="eyebrow">Live telemetry</p>
                <h3>Быстрый контур управления</h3>
                <p>Здесь всё, что нужно для оценки прогресса без прокрутки вниз.</p>
              </div>

              <div className="training-monitor" data-testid="training-monitor">
                <div className="training-status">
                  <span
                    className={[
                      'training-spinner',
                      trainingActive ? 'running' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  />
                  <div className="training-status-copy">
                    <span>Статус цикла</span>
                    <strong data-testid="training-status">
                      {trainingActive
                        ? `Обучение ${training.state.currentGeneration}/${training.state.targetGenerations}`
                        : 'Ожидание запуска'}
                    </strong>
                    <small>
                      {liveSession
                        ? `Сессия ${formatDuration(sessionDurationMs)} · ETA ${formatEta(etaMinutes)} · остановится только вручную`
                        : 'Нажмите "Обучать", чтобы запустить непрерывную сессию.'}
                    </small>
                  </div>
                </div>

                <div
                  className="training-meter"
                  aria-label="progress meter"
                  data-testid="training-progress"
                >
                  <div
                    className="training-meter-fill"
                    style={{ width: `${currentCycleProgress}%` }}
                  />
                  <div className="training-meter-meta">
                    <span>{progressGenerationLabel}</span>
                    <strong>{progressPercentLabel}</strong>
                    <span>{progressPaceLabel}</span>
                  </div>
                </div>

                <div className="status-meter-grid">
                  <StatusMeter
                    label="Симуляции цикла"
                    value={completedSimulationCount}
                    max={simulationsPerCycle}
                    summary={`${completedSimulationCount}/${simulationsPerCycle} прогонов`}
                    startLabel="старт"
                    endLabel="бюджет"
                    testId="simulation-budget-meter"
                  />
                  <StatusMeter
                    label="Validation budget"
                    value={completedValidationCount}
                    max={validationSimulationsPerCycle}
                    summary={`${completedValidationCount}/${validationSimulationsPerCycle} benchmark`}
                    startLabel="0"
                    endLabel={`${validationSimulationsPerCycle}`}
                    testId="validation-budget-meter"
                  />
                  <StatusMeter
                    label="Рост арены"
                    value={arenaGrowthValue}
                    max={arenaGrowthMax}
                    summary={
                      autoArenaGrowthEnabled
                        ? `${Math.min(profileLevel, growthTargetGeneration)}/${growthTargetGeneration} поколений`
                        : 'кастом без авто-роста'
                    }
                    startLabel={
                      autoArenaGrowthEnabled ? `G${growthStartGeneration}` : 'manual'
                    }
                    endLabel={
                      autoArenaGrowthEnabled
                        ? `G${growthTargetGeneration}`
                        : formatBoardCompact(activeProfile.board)
                    }
                    testId="arena-growth-meter"
                  />
                </div>

                <div className="training-grid">
                  <div className="live-metric" data-testid="metric-pace">
                    <span>темп поколений</span>
                    <strong>{pacePerMinute > 0 ? `${pacePerMinute.toFixed(2)} / мин` : '0.00 / мин'}</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-fitness-gain">
                    <span>прирост fitness</span>
                    <strong>{signed(fitnessGain)}</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-win-rate-gain">
                    <span>прирост win rate</span>
                    <strong>{signed(winRateGain * 100)} п.п.</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-jump">
                    <span>последний скачок</span>
                    <strong>{signed(latestJump)}</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-survival">
                    <span>средняя живучесть</span>
                    <strong>{survivalTempo.toFixed(1)} ходов</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-average-fitness">
                    <span>средний fitness цикла</span>
                    <strong>{currentAverageFitness.toFixed(2)}</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-diversity">
                    <span>population diversity</span>
                    <strong>{currentDiversity.toFixed(3)}</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-exploration">
                    <span>exploration pulse</span>
                    <strong>{Math.round(currentExploration * 100)}%</strong>
                  </div>
                  <div className="live-metric" data-testid="metric-adaptive-mutation">
                    <span>adaptive mutation</span>
                    <strong>
                      {currentAdaptiveMutationRate.toFixed(2)} ·{' '}
                      {currentAdaptiveMutationScale.toFixed(2)}
                    </strong>
                  </div>
                  <div className="live-metric" data-testid="metric-stagnation">
                    <span>plateau counter</span>
                    <strong>{currentStagnation.toString().padStart(2, '0')}</strong>
                  </div>
                </div>
              </div>

              <div className="action-row">
                <button
                  type="button"
                  onClick={() => resetGame()}
                  disabled={!liveChampionSummary}
                >
                  Новый ран
                </button>
                <button
                  type="button"
                  onClick={() => resetGame(randomSeed())}
                  disabled={!liveChampionSummary}
                >
                  Новый seed
                </button>
                <button
                  type="button"
                  onClick={() => setShowOverlay((value) => !value)}
                  disabled={!liveChampionSummary}
                >
                  {showOverlay ? 'Скрыть оценки' : 'Показать оценки'}
                </button>
              </div>

              <div className="signal-strip">
                <div>
                  <span>активный чемпион</span>
                  <strong>
                    {liveChampionSummary
                      ? `G${liveChampionSummary.generation.toString().padStart(3, '0')}`
                      : 'нет'}
                  </strong>
                </div>
                <div>
                  <span>benchmark</span>
                  <strong>
                    {liveBenchmarkGames > 0
                      ? `${liveBenchmarkWins}/${liveBenchmarkGames}`
                      : 'нет'}
                  </strong>
                </div>
                <div>
                  <span>дрейф поколения</span>
                  <strong>{signed(liveDrift)}</strong>
                </div>
                <div>
                  <span>лучшее открытие</span>
                  <strong>
                    {bestOpen
                      ? `r${bestOpen.row + 1} c${bestOpen.col + 1} · ${bestOpen.openScore.toFixed(2)}`
                      : 'n/a'}
                  </strong>
                </div>
                <div>
                  <span>лучший флаг</span>
                  <strong>
                    {bestFlag
                      ? `r${bestFlag.row + 1} c${bestFlag.col + 1} · ${bestFlag.flagScore.toFixed(2)}`
                      : 'n/a'}
                  </strong>
                </div>
              </div>
              <details className="disclosure-panel" open={false}>
                <summary className="disclosure-header">
                  <div className="disclosure-copy">
                    <strong>Growth charts</strong>
                    <span>Trend curves are kept one tap away instead of taking the whole first screen.</span>
                  </div>
                  <span className="disclosure-toggle" aria-hidden="true">
                    open
                  </span>
                </summary>
                <div className="disclosure-body">
                  <div className="chart-cluster">
                    {mineChartGroups.map((group) => (
                      <div key={group.title} className="chart-panel">
                        <div className="chart-panel-copy">
                          <strong>{group.title}</strong>
                          <span>{group.note}</span>
                        </div>
                        <LineChart series={group.series} />
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <details className="disclosure-panel" open={false}>
                <summary className="disclosure-header">
                  <div className="disclosure-copy">
                    <strong>Quality breakdown</strong>
                    <span>Secondary quality metrics stay available without stretching the page.</span>
                  </div>
                  <span className="disclosure-toggle" aria-hidden="true">
                    open
                  </span>
                </summary>
                <div className="disclosure-body">
                  <div className="stats-grid quality-grid">
                    <div className="stat-chip">
                      <span>best fitness</span>
                      <strong>
                        {(sessionLatest?.bestFitness ?? latestSummary?.bestFitness ?? 0).toFixed(2)}
                      </strong>
                      <small>Peak shape of the current champion.</small>
                    </div>
                    <div className="stat-chip">
                      <span>population median</span>
                      <strong>{liveMedianFitness.toFixed(2)}</strong>
                      <small>How strong the whole population is, not only the leader.</small>
                    </div>
                    <div className="stat-chip">
                      <span>last win rate</span>
                      <strong>{percent(latestWinRate)}</strong>
                      <small>Final benchmark win rate of the last completed generation.</small>
                    </div>
                    <div className="stat-chip">
                      <span>live win rate</span>
                      <strong>{percent(liveWinRate)}</strong>
                      <small>How the current benchmark window is performing right now.</small>
                    </div>
                    <div className="stat-chip">
                      <span>field clear</span>
                      <strong>{percent(liveClearedRatio)}</strong>
                      <small>Share of safe cells cleared on average.</small>
                    </div>
                    <div className="stat-chip">
                      <span>reveal accuracy</span>
                      <strong>{percent(liveRevealAccuracy)}</strong>
                      <small>How often the model chooses the correct safe move.</small>
                    </div>
                    <div className="stat-chip">
                      <span>flag accuracy</span>
                      <strong>{percent(liveFlagAccuracy)}</strong>
                      <small>Mine recognition quality.</small>
                    </div>
                    <div className="stat-chip">
                      <span>survival tempo</span>
                      <strong>{survivalTempo.toFixed(1)} moves</strong>
                      <small>How long the model survives before a run ends.</small>
                    </div>
                    <div className="stat-chip">
                      <span>average moves</span>
                      <strong>{liveAverageMoves.toFixed(1)} moves</strong>
                      <small>Average pace of benchmark runs.</small>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </section>

          <div className="side-dock">
            <section className="settings-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2>Пульт профиля</h2>
                </div>
              </div>
              <p className="section-copy">
                Рабочие настройки вынесены вниз. Базовые дефолты уже пригодны для запуска.
              </p>

              <div className="settings-stack">
                <div className="settings-group">
                  <div className="widget-head">
                    <h3>Имя и арена</h3>
                    <p>Профиль и поле, на котором растёт модель.</p>
                  </div>
                  <div className="settings-form">
                    <label>
                      <span>имя профиля</span>
                      <input
                        type="text"
                        disabled={settingsLocked}
                        value={activeProfile.name}
                        onChange={(event) =>
                          updateActiveProfile((profile) => ({
                            ...profile,
                            name: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      <span>режим</span>
                      <select
                        disabled={settingsLocked}
                        value={activePreset}
                        onChange={(event) => {
                          const nextPreset = event.target.value as DifficultyPreset
                          if (nextPreset === 'custom') {
                            updateActiveBoard(
                              createBoardConfig(
                                activeProfile.board.rows,
                                activeProfile.board.cols,
                                activeProfile.board.mines,
                                'Custom',
                              ),
                            )
                            return
                          }
                          updateActiveBoard(PRESET_CONFIGS[nextPreset])
                        }}
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="expert">Expert</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>

                    {activePreset === 'custom' ? (
                      <>
                        <label>
                          <span>rows</span>
                          <input
                            type="number"
                            min={6}
                            max={24}
                            disabled={settingsLocked}
                            value={activeProfile.board.rows}
                            onChange={(event) =>
                              updateActiveBoard({
                                ...activeProfile.board,
                                rows: Number(event.target.value),
                                label: 'Custom',
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>cols</span>
                          <input
                            type="number"
                            min={6}
                            max={30}
                            disabled={settingsLocked}
                            value={activeProfile.board.cols}
                            onChange={(event) =>
                              updateActiveBoard({
                                ...activeProfile.board,
                                cols: Number(event.target.value),
                                label: 'Custom',
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>mines</span>
                          <input
                            type="number"
                            min={5}
                            max={activeProfile.board.rows * activeProfile.board.cols - 1}
                            disabled={settingsLocked}
                            value={activeProfile.board.mines}
                            onChange={(event) =>
                              updateActiveBoard({
                                ...activeProfile.board,
                                mines: Number(event.target.value),
                                label: 'Custom',
                              })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="settings-group">
                  <div className="widget-head">
                    <h3>Цикл обучения</h3>
                    <p>Объём работы, который делает один запуск обучения.</p>
                  </div>
                  <div className="settings-form">
                    <label>
                      <span>симуляций за цикл</span>
                      <input
                        type="number"
                        min={simulationsPerGeneration}
                        step={Math.max(1, simulationsPerGeneration)}
                        max={240 * Math.max(1, simulationsPerGeneration)}
                        disabled={settingsLocked}
                        value={activeSettings.generations * simulationsPerGeneration}
                        onChange={(event) =>
                          updateActiveSetting(
                            'generations',
                            Math.max(
                              1,
                              Math.round(
                                Number(event.target.value) /
                                  Math.max(1, simulationsPerGeneration),
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>поколений за клик</span>
                      <input
                        type="number"
                        min={1}
                        max={240}
                        disabled={settingsLocked}
                        value={activeSettings.generations}
                        data-testid="settings-generations"
                        onChange={(event) =>
                          updateActiveSetting('generations', Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      <span>популяция</span>
                      <input
                        type="number"
                        min={8}
                        max={180}
                        disabled={settingsLocked}
                        value={activeSettings.populationSize}
                        data-testid="settings-population"
                        onChange={(event) =>
                          updateActiveSetting(
                            'populationSize',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>игр на геном</span>
                      <input
                        type="number"
                        min={2}
                        max={40}
                        disabled={settingsLocked}
                        value={activeSettings.gamesPerGenome}
                        data-testid="settings-games-per-genome"
                        onChange={(event) =>
                          updateActiveSetting(
                            'gamesPerGenome',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>validation</span>
                      <input
                        type="number"
                        min={2}
                        max={40}
                        disabled={settingsLocked}
                        value={activeSettings.validationGames}
                        data-testid="settings-validation"
                        onChange={(event) =>
                          updateActiveSetting(
                            'validationGames',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>CPU workers</span>
                      <input
                        type="number"
                        min={1}
                        max={cpuWorkerLimit}
                        disabled={settingsLocked}
                        value={activeSettings.parallelWorkers}
                        onChange={(event) =>
                          updateActiveSetting(
                            'parallelWorkers',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="settings-group">
                  <div className="widget-head">
                    <h3>Тонкая настройка</h3>
                    <p>Параметры мутации, отбора и формы сети.</p>
                  </div>
                  <div className="settings-form">
                    <label>
                      <span>elite</span>
                      <input
                        type="number"
                        min={1}
                        max={activeSettings.populationSize - 1}
                        disabled={settingsLocked}
                        value={activeSettings.eliteCount}
                        onChange={(event) =>
                          updateActiveSetting('eliteCount', Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      <span>mutation rate</span>
                      <input
                        type="number"
                        min={0.01}
                        max={0.9}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.mutationRate}
                        onChange={(event) =>
                          updateActiveSetting(
                            'mutationRate',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>mutation scale</span>
                      <input
                        type="number"
                        min={0.01}
                        max={1.4}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.mutationScale}
                        onChange={(event) =>
                          updateActiveSetting(
                            'mutationScale',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>mutation aggression</span>
                      <input
                        type="number"
                        min={0.1}
                        max={3}
                        step={0.05}
                        disabled={settingsLocked}
                        value={activeSettings.mutationAggression}
                        data-testid="settings-mutation-aggression"
                        onChange={(event) =>
                          updateActiveSetting(
                            'mutationAggression',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>adaptive mutation</span>
                      <input
                        type="checkbox"
                        disabled={settingsLocked}
                        checked={activeSettings.adaptiveMutation}
                        data-testid="settings-adaptive-mutation"
                        onChange={(event) =>
                          updateActiveSetting(
                            'adaptiveMutation',
                            event.target.checked,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>crossover</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.crossoverRate}
                        onChange={(event) =>
                          updateActiveSetting(
                            'crossoverRate',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>immigrant rate</span>
                      <input
                        type="number"
                        min={0}
                        max={0.35}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.immigrantRate}
                        data-testid="settings-immigrant-rate"
                        onChange={(event) =>
                          updateActiveSetting(
                            'immigrantRate',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>tournament size</span>
                      <input
                        type="number"
                        min={2}
                        max={12}
                        disabled={settingsLocked}
                        value={activeSettings.tournamentSize}
                        data-testid="settings-tournament-size"
                        onChange={(event) =>
                          updateActiveSetting(
                            'tournamentSize',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>novelty weight</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.noveltyWeight}
                        data-testid="settings-novelty-weight"
                        onChange={(event) =>
                          updateActiveSetting(
                            'noveltyWeight',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>max steps</span>
                      <input
                        type="number"
                        min={20}
                        max={600}
                        disabled={settingsLocked}
                        value={activeSettings.maxStepsPerGame}
                        onChange={(event) =>
                          updateActiveSetting(
                            'maxStepsPerGame',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>frontier solver cells</span>
                      <input
                        type="number"
                        min={0}
                        max={22}
                        disabled={settingsLocked}
                        value={activeSettings.frontierSolverCells}
                        data-testid="settings-frontier-solver-cells"
                        onChange={(event) =>
                          updateActiveSetting(
                            'frontierSolverCells',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>logic assist</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.logicAssistStrength}
                        data-testid="settings-logic-assist"
                        onChange={(event) =>
                          updateActiveSetting(
                            'logicAssistStrength',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>risk tolerance</span>
                      <input
                        type="number"
                        min={0}
                        max={0.65}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.riskTolerance}
                        data-testid="settings-risk-tolerance"
                        onChange={(event) =>
                          updateActiveSetting(
                            'riskTolerance',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>value head weight</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={settingsLocked}
                        value={activeSettings.valueHeadWeight}
                        data-testid="settings-value-head-weight"
                        onChange={(event) =>
                          updateActiveSetting(
                            'valueHeadWeight',
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>hidden layers</span>
                      <input
                        type="text"
                        disabled={settingsLocked}
                        value={hiddenLayerInput}
                        onChange={(event) => setHiddenLayerInput(event.target.value)}
                        placeholder="18, 12"
                      />
                    </label>
                  </div>
                </div>

                <div className="action-row compact">
                  <button
                    type="button"
                    className="secondary-pill"
                    disabled={settingsLocked}
                    onClick={() => updateActiveSetting('benchmarkSeed', randomSeed())}
                  >
                    Новый benchmark seed
                  </button>
                  <button
                    type="button"
                    className="secondary-pill danger"
                    onClick={clearActiveProfile}
                    disabled={settingsLocked || profileHistory.length === 0}
                  >
                    Очистить профиль
                  </button>
                </div>
              </div>
            </section>

            <section className="terminal-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Telemetry</p>
                  <h2>Лента роста</h2>
                </div>
                <div className="progress-pill">
                  {trainingActive
                    ? `${progressGenerationLabel} · ${progressPercentLabel}`
                    : `${profileHistory.length} gen`}
                </div>
              </div>
              <p className="section-copy">
                Лента запуска, fitness и benchmark без лишней телеметрической болтовни.
              </p>
              <div className="terminal-log" data-testid="training-log">
                {training.state.logs.length === 0 ? (
                  <span className="muted">Профиль ещё не проходил ни одного цикла.</span>
                ) : (
                  training.state.logs.map((line, index) => (
                    <div key={`${line}-${index}`}>{line}</div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>

        <section className="main-grid">
          <section className="analytics-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Deep telemetry</p>
                <h2>Глубокая аналитика профиля</h2>
              </div>
            </div>
            <p className="section-copy">
              Ниже остаются глубокие инженерные виджеты популяции и структуры сети.
            </p>

            <div className="split-panel">
              <div className="widget-panel">
                <div className="widget-head">
                  <p className="eyebrow">Population Slice</p>
                  <h3>Лучшие особи цикла</h3>
                  <p>
                    Каждый квадрат — один сильный геном из последнего поколения.
                    Чем ярче клетка, тем выше результат в текущем цикле.
                  </p>
                </div>
                <PopulationHeatmap
                  values={selectedSummary?.populationTopFitness ?? []}
                />
              </div>

              <div className="widget-panel">
                <div className="widget-head">
                  <p className="eyebrow">Weights</p>
                  <h3>Схема мозга чемпиона</h3>
                  <p>
                    Самый технический виджет: сильные связи сети, её структура и
                    визуальный отпечаток текущего чемпиона.
                  </p>
                </div>
                <NetworkGraph network={selectedSummary?.champion ?? null} />
              </div>
            </div>
          </section>
        </section>

        <section className="ledger-grid">
          <section className="ledger-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Ledger</p>
                <h2>История выращивания</h2>
              </div>
            </div>
            <p className="section-copy">
              История поколений текущего профиля и быстрый выбор для A/B.
            </p>
            <GenerationTable
              history={profileHistory}
              selected={effectiveSelectedGeneration}
              compareA={effectiveCompareA}
              compareB={effectiveCompareB}
              onSelect={setSelectedGeneration}
              onPinA={setCompareA}
              onPinB={setCompareB}
            />
          </section>

          <section className="summary-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Selected</p>
                <h2>Паспорт поколения</h2>
              </div>
            </div>
            <p className="section-copy">
              Короткий техпаспорт выбранного поколения.
            </p>

            {selectedSummary ? (
              <div className="summary-grid">
                <div>
                  <span>generation</span>
                  <strong>
                    G{selectedSummary.generation.toString().padStart(3, '0')}
                  </strong>
                </div>
                <div>
                  <span>арена поколения</span>
                  <strong>{formatBoardCompact(selectedSummary.board)}</strong>
                </div>
                <div>
                  <span>created</span>
                  <strong>{new Date(selectedSummary.createdAt).toLocaleString()}</strong>
                </div>
                <div>
                  <span>avg moves</span>
                  <strong>{selectedSummary.benchmark.avgMoves.toFixed(1)}</strong>
                </div>
                <div>
                  <span>mean |w|</span>
                  <strong>{selectedSummary.weightStats.meanAbs.toFixed(4)}</strong>
                </div>
                <div>
                  <span>std</span>
                  <strong>{selectedSummary.weightStats.stdDev.toFixed(4)}</strong>
                </div>
                <div>
                  <span>max |w|</span>
                  <strong>{selectedSummary.weightStats.maxAbs.toFixed(4)}</strong>
                </div>
                <div>
                  <span>benchmark seed</span>
                  <strong>{activeSettings.benchmarkSeed}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                У этого профиля ещё нет поколений. Нажмите `Обучать`, чтобы
                вырастить первую форму.
              </div>
            )}
          </section>
        </section>

        <ComparisonLab
          generationA={summaryA}
          generationB={summaryB}
          board={activeProfile.board}
          benchmarkSeed={activeSettings.benchmarkSeed}
        />
          </>
        ) : (
          <StrategyArena key={activeExperience} game={activeExperience} />
        )}
      </div>
    </div>
  )
}

export default App
