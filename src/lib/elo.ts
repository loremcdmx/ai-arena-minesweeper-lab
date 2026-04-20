export interface EloProfileMeta {
  currentElo: number
  calibratedElo: number | null
  peakElo: number
  lastCalibratedAt: number | null
  archivedMilestones: number[]
}

export interface EloProbeResult {
  id: string
  label: string
  opponentLabel: string
  opponentElo: number
  observedScore: number
  expectedScore: number
  delta: number
  resultingElo: number
  note: string
}

export const DEFAULT_ELO_MILESTONES = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000]

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function expectedEloScore(playerElo: number, opponentElo: number) {
  return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400))
}

export function applyEloUpdate(
  currentElo: number,
  opponentElo: number,
  observedScore: number,
  kFactor = 28,
) {
  const expectedScore = expectedEloScore(currentElo, opponentElo)
  const delta = kFactor * (observedScore - expectedScore)
  return {
    expectedScore,
    delta,
    nextElo: clamp(currentElo + delta, 100, 3000),
  }
}

export function createEloMeta(baseElo: number): EloProfileMeta {
  const normalized = clamp(baseElo, 100, 3000)
  return {
    currentElo: normalized,
    calibratedElo: null,
    peakElo: normalized,
    lastCalibratedAt: null,
    archivedMilestones: [],
  }
}

export function stableChampionElo(meta: EloProfileMeta, candidateElo: number) {
  return clamp(Math.max(meta.currentElo, meta.peakElo, candidateElo), 100, 3000)
}

export function nextUnreachedMilestone(
  currentElo: number,
  archivedMilestones: number[],
  milestones = DEFAULT_ELO_MILESTONES,
) {
  return (
    milestones.find(
      (milestone) =>
        milestone > currentElo && !archivedMilestones.includes(milestone),
    ) ?? null
  )
}

export function collectUnlockedMilestones(
  currentElo: number,
  archivedMilestones: number[],
  milestones = DEFAULT_ELO_MILESTONES,
) {
  return milestones.filter(
    (milestone) =>
      currentElo >= milestone && !archivedMilestones.includes(milestone),
  )
}

export function eloBandLabel(elo: number) {
  if (elo >= 2000) {
    return 'solver band'
  }
  if (elo >= 1800) {
    return 'master band'
  }
  if (elo >= 1400) {
    return 'advanced band'
  }
  if (elo >= 1000) {
    return 'trained band'
  }
  if (elo >= 700) {
    return 'developing band'
  }
  return 'bootstrap band'
}
