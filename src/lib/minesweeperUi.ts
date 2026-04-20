import type { BoardConfig, GenerationSummary, ModelProfile } from '../types'
import { detectPreset } from './minesweeperPersistence'

export function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export function signed(value: number, digits = 2) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatEta(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 'not started'
  }
  if (minutes < 1) {
    return '< 1 min'
  }
  if (minutes < 60) {
    return `${minutes.toFixed(1)} min`
  }
  return `${(minutes / 60).toFixed(1)} h`
}

export function formatBoard(board: BoardConfig) {
  return `${board.rows}x${board.cols} - ${board.mines} mines`
}

export function formatBoardCompact(board: BoardConfig) {
  return `${board.rows}x${board.cols}x${board.mines}`
}

export function gameStatusLabel(status: string) {
  switch (status) {
    case 'ready':
      return 'ready'
    case 'playing':
      return 'running'
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    default:
      return status
  }
}

export function profileStage(level: number, winRate: number) {
  if (level === 0) {
    return 'seed'
  }
  if (level < 4) {
    return 'growing'
  }
  if (level < 12) {
    return winRate > 0.18 ? 'aggressive' : 'methodical'
  }
  if (level < 28) {
    return winRate > 0.34 ? 'attacking' : 'tactical'
  }
  return winRate > 0.55 ? 'apex form' : 'veteran'
}

export function profileTemperament(summary: GenerationSummary | null) {
  if (!summary) {
    return 'unprofiled'
  }
  if (
    summary.benchmark.avgFlagAccuracy >
    summary.benchmark.avgRevealAccuracy + 0.08
  ) {
    return 'flag-forward'
  }
  if (
    summary.benchmark.avgRevealAccuracy >
    summary.benchmark.avgFlagAccuracy + 0.08
  ) {
    return 'reveal-forward'
  }
  return 'balanced'
}

export function profileHeadline(
  profile: ModelProfile,
  summary: GenerationSummary | null,
) {
  if (!summary) {
    return `No benchmark data yet. Start a training run to see how ${profile.name} behaves under pressure.`
  }

  const winRate = summary.benchmark.wins / Math.max(1, summary.benchmark.games)
  if (winRate >= 0.55) {
    return 'The current branch is clearing boards with real confidence and is starting to look production-grade.'
  }
  if (winRate >= 0.3) {
    return 'The policy has a stable foothold. It is finding cleaner reveals and fewer self-inflicted losses.'
  }
  return `${profile.species} is still learning the board, but the current branch already exposes where the next gains should come from.`
}

export function arenaLabel(board: BoardConfig) {
  const preset = detectPreset(board)
  switch (preset) {
    case 'beginner':
      return 'Beginner arena'
    case 'intermediate':
      return 'Intermediate arena'
    case 'expert':
      return 'Expert arena'
    default:
      return 'Custom arena'
  }
}
