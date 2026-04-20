import { applyEloUpdate, clamp, createEloMeta, type EloProbeResult } from './elo'
import { PRESET_CONFIGS } from './constants'
import { referenceSource } from './referenceAnchors'
import { replayGenome } from './replay'
import type {
  BoardConfig,
  GenerationSummary,
  MinesweeperBotSnapshot,
  ModelProfile,
  NeuralNetwork,
  TrainingSettings,
} from '../types'

interface MinesweeperCalibrationProbe {
  id: string
  label: string
  referenceId: string
  opponentLabel: string
  opponentElo: number
  board: BoardConfig
  seeds: number[]
  note: string
}

export interface MinesweeperReferencePeak {
  probe: MinesweeperCalibrationProbe
  source: ReturnType<typeof referenceSource>
}

export const MINESWEEPER_CALIBRATION_PROBES: MinesweeperCalibrationProbe[] = [
  {
    id: 'rookie-420',
    label: 'Probe 01',
    referenceId: 'js-minesweeper',
    opponentLabel: 'Rookie-420',
    opponentElo: 420,
    board: PRESET_CONFIGS.beginner,
    seeds: [101, 131],
    note: 'First-click survival and basic frontier discipline.',
  },
  {
    id: 'mapper-620',
    label: 'Probe 02',
    referenceId: 'js-minesweeper',
    opponentLabel: 'Mapper-620',
    opponentElo: 620,
    board: PRESET_CONFIGS.beginner,
    seeds: [211, 233, 241],
    note: 'Stable beginner clears with fewer incorrect flags.',
  },
  {
    id: 'analyst-820',
    label: 'Probe 03',
    referenceId: 'sat-minesweeper',
    opponentLabel: 'Analyst-820',
    opponentElo: 820,
    board: PRESET_CONFIGS.intermediate,
    seeds: [307, 313, 331],
    note: 'Intermediate frontier reading under denser mine pressure.',
  },
  {
    id: 'specialist-1020',
    label: 'Probe 04',
    referenceId: 'sat-minesweeper',
    opponentLabel: 'Specialist-1020',
    opponentElo: 1020,
    board: PRESET_CONFIGS.intermediate,
    seeds: [401, 419, 443],
    note: 'Punishes rushed reveals and weak flag accuracy.',
  },
  {
    id: 'veteran-1240',
    label: 'Probe 05',
    referenceId: 'prob-minesweeper',
    opponentLabel: 'Veteran-1240',
    opponentElo: 1240,
    board: PRESET_CONFIGS.expert,
    seeds: [503, 509],
    note: 'Expert board compression with long-run survival pressure.',
  },
  {
    id: 'oracle-1460',
    label: 'Probe 06',
    referenceId: 'prob-minesweeper',
    opponentLabel: 'Oracle-1460',
    opponentElo: 1460,
    board: PRESET_CONFIGS.expert,
    seeds: [601, 617],
    note: 'High-density expert patterns and late-game mine accounting.',
  },
  {
    id: 'sentinel-1660',
    label: 'Probe 07',
    referenceId: 'prob-minesweeper',
    opponentLabel: 'Sentinel-1660',
    opponentElo: 1660,
    board: PRESET_CONFIGS.expert,
    seeds: [701, 719, 733],
    note: 'Long expert runs with fewer bailout guesses and cleaner flagging.',
  },
  {
    id: 'atlas-1860',
    label: 'Probe 08',
    referenceId: 'prob-minesweeper',
    opponentLabel: 'Atlas-1860',
    opponentElo: 1860,
    board: PRESET_CONFIGS.expert,
    seeds: [809, 821, 853],
    note: 'Reference band for dense frontier accounting and late-game stability.',
  },
]

const MINESWEEPER_ELO_MILESTONES = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200]

function boardDifficulty(board: BoardConfig) {
  const density = board.mines / Math.max(1, board.rows * board.cols)
  const area = Math.min(1, (board.rows * board.cols) / 480)
  return clamp(density * 1.8 + area * 0.45, 0, 1)
}

export function estimateMinesweeperElo(
  summary: GenerationSummary | null,
  board: BoardConfig,
) {
  if (!summary) {
    return 360 + boardDifficulty(board) * 60
  }

  const winRate =
    summary.benchmark.wins / Math.max(1, summary.benchmark.games)
  const difficulty = boardDifficulty(summary.board)
  const maturity = Math.min(1, Math.log2(summary.generation + 2) / 6)
  const endurance = clamp(
    summary.benchmark.avgSurvivalTurns /
      Math.max(18, summary.board.rows * summary.board.cols * 0.18),
    0,
    1.2,
  )
  const tail = Math.max(0, Math.log2(summary.generation + 2) - 4.6)

  return clamp(
    300 +
      winRate * 520 +
      summary.benchmark.avgClearedRatio * 430 +
      summary.benchmark.avgRevealAccuracy * 170 +
      summary.benchmark.avgFlagAccuracy * 150 +
      endurance * 130 +
      difficulty * 220 +
      maturity * 150 +
      tail * (34 + difficulty * 54),
    200,
    2400,
  )
}

export function defaultMinesweeperEloMeta(summary: GenerationSummary | null, board: BoardConfig) {
  return createEloMeta(estimateMinesweeperElo(summary, board))
}

export function readMinesweeperCalibrationProbe(
  network: NeuralNetwork,
  settings: TrainingSettings,
  probe: MinesweeperCalibrationProbe,
  currentElo: number,
): EloProbeResult {
  const reference = referenceSource(probe.referenceId)
  const replays = probe.seeds.map((seed) =>
    replayGenome(
      network,
      probe.board,
      seed,
      Math.max(settings.maxStepsPerGame, probe.board.rows * probe.board.cols * 2),
    ),
  )

  const wins = replays.filter((replay) => replay.win).length
  const averageClear =
    replays.reduce((sum, replay) => sum + replay.clearedRatio, 0) /
    Math.max(1, replays.length)
  const averageReveal =
    replays.reduce((sum, replay) => sum + replay.accuracyReveal, 0) /
    Math.max(1, replays.length)
  const averageFlag =
    replays.reduce((sum, replay) => sum + replay.accuracyFlag, 0) /
    Math.max(1, replays.length)
  const observedScore = clamp(
    (wins / Math.max(1, replays.length)) * 0.58 +
      averageClear * 0.22 +
      averageReveal * 0.12 +
      averageFlag * 0.08,
    0.02,
    0.98,
  )
  const { expectedScore, delta, nextElo } = applyEloUpdate(
    currentElo,
    probe.opponentElo,
    observedScore,
    30,
  )

  return {
    id: probe.id,
    label: probe.label,
    opponentLabel: probe.opponentLabel,
    opponentElo: probe.opponentElo,
    observedScore,
    expectedScore,
    delta,
    resultingElo: nextElo,
    note: `${reference?.label ?? 'Reference'} · ${wins}/${replays.length} wins · clear ${(averageClear * 100).toFixed(1)}% · reveal ${(averageReveal * 100).toFixed(1)}%`,
  }
}

export function minesweeperViewerNote(summary: GenerationSummary | null, elo: number) {
  if (!summary) {
    return `${Math.round(elo)} ELO · uncalibrated core`
  }

  if (summary.benchmark.avgFlagAccuracy > summary.benchmark.avgRevealAccuracy + 0.08) {
    return `${Math.round(elo)} ELO · flag-heavy style`
  }
  if (summary.benchmark.avgRevealAccuracy > summary.benchmark.avgFlagAccuracy + 0.08) {
    return `${Math.round(elo)} ELO · reveal-heavy style`
  }
  return `${Math.round(elo)} ELO · balanced scanner`
}

export function createMinesweeperSnapshot(
  profile: ModelProfile,
  summary: GenerationSummary,
  elo: number,
  milestone: number,
  snapshotType: 'milestone' | 'peak' = 'milestone',
): MinesweeperBotSnapshot {
  return {
    id:
      snapshotType === 'peak'
        ? `${profile.id}-peak-g${summary.generation}`
        : `${profile.id}-elo-${milestone}-g${summary.generation}`,
    profileId: profile.id,
    name: profile.name,
    species: profile.species,
    snapshotType,
    elo,
    milestone,
    generation: summary.generation,
    createdAt: Date.now(),
    board: { ...summary.board },
    champion: summary.champion,
    note:
      snapshotType === 'peak'
        ? `Peak branch · ${minesweeperViewerNote(summary, elo)}`
        : minesweeperViewerNote(summary, elo),
  }
}

export function minesweeperEloMilestones() {
  return MINESWEEPER_ELO_MILESTONES
}

export function strongestMinesweeperReference(): MinesweeperReferencePeak | null {
  const probe = [...MINESWEEPER_CALIBRATION_PROBES].sort(
    (left, right) => right.opponentElo - left.opponentElo,
  )[0]

  if (!probe) {
    return null
  }

  return {
    probe,
    source: referenceSource(probe.referenceId),
  }
}
