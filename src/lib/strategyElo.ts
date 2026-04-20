import { applyEloUpdate, clamp, createEloMeta, type EloProbeResult } from './elo'
import { referenceSource } from './referenceAnchors'
import {
  currentStrategySummary,
  strategyTier,
  type StrategyGameId,
  type StrategyProfile,
  type StrategyTrainingSettings,
} from './strategyLab'

export interface StrategyBotSnapshot {
  id: string
  profileId: string
  name: string
  archetype: string
  snapshotType: 'milestone' | 'peak'
  elo: number
  milestone: number
  generation: number
  createdAt: number
  weights: number[]
  settings: StrategyTrainingSettings
  note: string
}

interface StrategyCalibrationProbe {
  id: string
  label: string
  referenceId: string
  opponentLabel: string
  opponentElo: number
  emphasis: 'attack' | 'planning' | 'resilience'
  note: string
}

export interface StrategyReferencePeak {
  probe: StrategyCalibrationProbe
  source: ReturnType<typeof referenceSource>
}

const STRATEGY_CALIBRATION_POOLS: Record<StrategyGameId, StrategyCalibrationProbe[]> = {
  chess: [
    {
      id: 'academy-520',
      label: 'Probe 01',
      referenceId: 'stockfish',
      opponentLabel: 'Academy-520',
      opponentElo: 520,
      emphasis: 'planning',
      note: 'Early development and center discipline.',
    },
    {
      id: 'club-780',
      label: 'Probe 02',
      referenceId: 'stockfish',
      opponentLabel: 'Club-780',
      opponentElo: 780,
      emphasis: 'attack',
      note: 'Punishes loose king safety and passive pieces.',
    },
    {
      id: 'league-1040',
      label: 'Probe 03',
      referenceId: 'stockfish',
      opponentLabel: 'League-1040',
      opponentElo: 1040,
      emphasis: 'resilience',
      note: 'Longer conversion and fewer tactical oversights.',
    },
    {
      id: 'expert-1300',
      label: 'Probe 04',
      referenceId: 'stockfish',
      opponentLabel: 'Expert-1300',
      opponentElo: 1300,
      emphasis: 'planning',
      note: 'Stable middlegame plans and cleaner endgame exits.',
    },
    {
      id: 'master-1540',
      label: 'Probe 05',
      referenceId: 'stockfish',
      opponentLabel: 'Master-1540',
      opponentElo: 1540,
      emphasis: 'attack',
      note: 'Sharp tactical punishment in crowded positions.',
    },
    {
      id: 'candidate-1780',
      label: 'Probe 06',
      referenceId: 'stockfish',
      opponentLabel: 'Candidate-1780',
      opponentElo: 1780,
      emphasis: 'planning',
      note: 'More stable conversion and better piece coordination.',
    },
    {
      id: 'principal-2020',
      label: 'Probe 07',
      referenceId: 'stockfish',
      opponentLabel: 'Principal-2020',
      opponentElo: 2020,
      emphasis: 'resilience',
      note: 'Punishes shallow tactics and weak king timing.',
    },
    {
      id: 'engine-2260',
      label: 'Probe 08',
      referenceId: 'stockfish',
      opponentLabel: 'Engine-2260',
      opponentElo: 2260,
      emphasis: 'attack',
      note: 'Reference pressure band for deeper tactical reads.',
    },
  ],
  tictactoe: [
    {
      id: 'grid-420',
      label: 'Probe 01',
      referenceId: 'perfect-ttt',
      opponentLabel: 'Grid-420',
      opponentElo: 420,
      emphasis: 'planning',
      note: 'Basic center and edge discipline.',
    },
    {
      id: 'fork-620',
      label: 'Probe 02',
      referenceId: 'perfect-ttt',
      opponentLabel: 'Fork-620',
      opponentElo: 620,
      emphasis: 'attack',
      note: 'Creates early fork threats if left unchecked.',
    },
    {
      id: 'shield-820',
      label: 'Probe 03',
      referenceId: 'perfect-ttt',
      opponentLabel: 'Shield-820',
      opponentElo: 820,
      emphasis: 'resilience',
      note: 'Strong draw conversion and anti-fork defence.',
    },
    {
      id: 'solver-980',
      label: 'Probe 04',
      referenceId: 'perfect-ttt',
      opponentLabel: 'Solver-980',
      opponentElo: 980,
      emphasis: 'planning',
      note: 'Almost perfect solve shell under pressure.',
    },
    {
      id: 'perfect-1080',
      label: 'Probe 05',
      referenceId: 'perfect-ttt',
      opponentLabel: 'Perfect-1080',
      opponentElo: 1080,
      emphasis: 'resilience',
      note: 'Solved draw ceiling with almost no tactical leakage.',
    },
  ],
  connect4: [
    {
      id: 'drop-500',
      label: 'Probe 01',
      referenceId: 'connect4-solver',
      opponentLabel: 'Drop-500',
      opponentElo: 500,
      emphasis: 'planning',
      note: 'Center-first column discipline.',
    },
    {
      id: 'stack-720',
      label: 'Probe 02',
      referenceId: 'connect4-solver',
      opponentLabel: 'Stack-720',
      opponentElo: 720,
      emphasis: 'resilience',
      note: 'Blocks vertical threes and edge traps.',
    },
    {
      id: 'fork-940',
      label: 'Probe 03',
      referenceId: 'connect4-solver',
      opponentLabel: 'Fork-940',
      opponentElo: 940,
      emphasis: 'attack',
      note: 'Finds double-threat ladders from stable center drops.',
    },
    {
      id: 'gravity-1180',
      label: 'Probe 04',
      referenceId: 'connect4-solver',
      opponentLabel: 'Gravity-1180',
      opponentElo: 1180,
      emphasis: 'planning',
      note: 'Avoids poisoned supports and weak outer files.',
    },
    {
      id: 'solver-1420',
      label: 'Probe 05',
      referenceId: 'connect4-solver',
      opponentLabel: 'Solver-1420',
      opponentElo: 1420,
      emphasis: 'resilience',
      note: 'Near-perfect connect-four reference band.',
    },
    {
      id: 'threat-1600',
      label: 'Probe 06',
      referenceId: 'connect4-solver',
      opponentLabel: 'Threat-1600',
      opponentElo: 1600,
      emphasis: 'attack',
      note: 'Converts center pressure into repeated two-way threats.',
    },
    {
      id: 'ladder-1780',
      label: 'Probe 07',
      referenceId: 'connect4-solver',
      opponentLabel: 'Ladder-1780',
      opponentElo: 1780,
      emphasis: 'planning',
      note: 'Rarely gives poisoned supports and sees deeper trap ladders.',
    },
    {
      id: 'oracle-1960',
      label: 'Probe 08',
      referenceId: 'connect4-solver',
      opponentLabel: 'Oracle-1960',
      opponentElo: 1960,
      emphasis: 'resilience',
      note: 'Solver-adjacent pressure band for late-stage calibration.',
    },
  ],
}

const STRATEGY_ELO_MILESTONES: Record<StrategyGameId, number[]> = {
  chess: [600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400],
  tictactoe: [400, 600, 800, 900, 1000, 1100],
  connect4: [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000],
}

function attackPotential(game: StrategyGameId, profile: StrategyProfile) {
  const summary = currentStrategySummary(game, profile)
  return clamp(
    summary.winRate * 0.38 +
      summary.attackScore * 0.34 +
      summary.confidence * 0.16 +
      (1 - summary.errorRate) * 0.12,
    0,
    1,
  )
}

export function estimateStrategyElo(game: StrategyGameId, profile: StrategyProfile) {
  const summary = currentStrategySummary(game, profile)
  return clamp(
    summary.rating,
    200,
    game === 'chess' ? 2600 : game === 'connect4' ? 2400 : 1200,
  )
}

export function defaultStrategyEloMeta(game: StrategyGameId, profile: StrategyProfile) {
  return createEloMeta(estimateStrategyElo(game, profile))
}

export function strategyCalibrationPlan(game: StrategyGameId) {
  return STRATEGY_CALIBRATION_POOLS[game]
}

export function strategyEloMilestones(game: StrategyGameId) {
  return STRATEGY_ELO_MILESTONES[game]
}

export function runStrategyCalibrationProbe(
  game: StrategyGameId,
  profile: StrategyProfile,
  probe: StrategyCalibrationProbe,
  currentElo: number,
): EloProbeResult {
  const reference = referenceSource(probe.referenceId)
  const summary = currentStrategySummary(game, profile)
  const estimatedElo = estimateStrategyElo(game, profile)
  const basePotential = attackPotential(game, profile)
  const emphasisFactor =
    probe.emphasis === 'attack'
      ? summary.attackScore
      : probe.emphasis === 'planning'
        ? summary.planningScore
        : summary.resilienceScore
  const observedScore = clamp(
    0.5 +
      (estimatedElo - probe.opponentElo) / 780 +
      (basePotential - 0.5) * 0.34 +
      (emphasisFactor - 0.5) * 0.24 +
      (summary.confidence - 0.5) * 0.14 -
      summary.errorRate * 0.12,
    0.04,
    0.97,
  )
  const { expectedScore, delta, nextElo } = applyEloUpdate(
    currentElo,
    probe.opponentElo,
    observedScore,
    26,
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
    note: `${reference?.label ?? 'Reference'} · ${probe.note} · W ${(summary.winRate * 100).toFixed(1)}% · conf ${(summary.confidence * 100).toFixed(1)}%`,
  }
}

export function createStrategySnapshot(
  game: StrategyGameId,
  profile: StrategyProfile,
  elo: number,
  milestone: number,
  snapshotType: 'milestone' | 'peak' = 'milestone',
): StrategyBotSnapshot {
  return {
    id:
      snapshotType === 'peak'
        ? `${profile.id}-peak-g${profile.history.length}`
        : `${profile.id}-elo-${milestone}-g${profile.history.length}`,
    profileId: profile.id,
    name: profile.name,
    archetype: profile.archetype,
    snapshotType,
    elo,
    milestone,
    generation: profile.history.length,
    createdAt: Date.now(),
    weights: [...profile.weights],
    settings: { ...profile.settings },
    note:
      snapshotType === 'peak'
        ? `Peak branch · ${strategyTier(game, elo)} · ${Math.round(elo)} ELO`
        : `${strategyTier(game, elo)} · ${Math.round(elo)} ELO`,
  }
}

export function strongestStrategyReference(game: StrategyGameId): StrategyReferencePeak | null {
  const probe = [...STRATEGY_CALIBRATION_POOLS[game]].sort(
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
