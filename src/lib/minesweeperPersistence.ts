import {
  DEFAULT_TRAINING_SETTINGS,
  PRESET_CONFIGS,
  STORAGE_KEYS,
} from './constants'
import { mergeSnapshotArchive } from './archiveSnapshots'
import {
  ARENA_GROWTH_MILESTONES,
  PRESET_GROWTH_ORDER,
  PROFILE_NAMES,
  PROFILE_SPECIES,
} from './minesweeperArenaConfig'
import type {
  BoardConfig,
  DifficultyPreset,
  GenerationSummary,
  MinesweeperBotSnapshot,
  ModelProfile,
  TrainingSettings,
} from '../types'
import type { EloProfileMeta } from './elo'
import { randomSeed } from './random'

export interface PersistedState {
  profiles: ModelProfile[]
  activeProfileId: string
  history: GenerationSummary[]
}

export const MINESWEEPER_ELO_META_STORAGE_KEY = 'minesweeper-lab-elo-meta-v1'
export const MINESWEEPER_ARCHIVE_STORAGE_KEY = 'minesweeper-lab-elo-archive-v1'

function boardKey(board: BoardConfig) {
  return `${board.rows}x${board.cols}x${board.mines}`
}

export function sameBoard(left: BoardConfig, right: BoardConfig) {
  return (
    left.rows === right.rows &&
    left.cols === right.cols &&
    left.mines === right.mines
  )
}

export function detectPreset(board: BoardConfig): DifficultyPreset {
  if (board.label === 'Custom') {
    return 'custom'
  }
  if (sameBoard(board, PRESET_CONFIGS.beginner)) {
    return 'beginner'
  }
  if (sameBoard(board, PRESET_CONFIGS.intermediate)) {
    return 'intermediate'
  }
  if (sameBoard(board, PRESET_CONFIGS.expert)) {
    return 'expert'
  }
  return 'custom'
}

export function presetRank(preset: DifficultyPreset) {
  return PRESET_GROWTH_ORDER.indexOf(
    preset === 'custom' ? 'beginner' : preset,
  )
}

export function recommendedGrowthPreset(
  level: number,
): Exclude<DifficultyPreset, 'custom'> {
  if (level >= ARENA_GROWTH_MILESTONES.expert) {
    return 'expert'
  }
  if (level >= ARENA_GROWTH_MILESTONES.intermediate) {
    return 'intermediate'
  }
  return 'beginner'
}

export function clampBoard(config: BoardConfig): BoardConfig {
  const rows = Math.min(24, Math.max(6, Math.round(config.rows)))
  const cols = Math.min(30, Math.max(6, Math.round(config.cols)))
  const maxMines = Math.max(5, rows * cols - 1)
  const mines = Math.min(maxMines, Math.max(5, Math.round(config.mines)))
  return {
    rows,
    cols,
    mines,
    label: config.label,
  }
}

export function sanitizeSettings(settings: TrainingSettings): TrainingSettings {
  const board = clampBoard(settings.board)
  const hiddenLayers = Array.isArray(settings.hiddenLayers)
    ? settings.hiddenLayers
    : DEFAULT_TRAINING_SETTINGS.hiddenLayers

  return {
    ...DEFAULT_TRAINING_SETTINGS,
    ...settings,
    board,
    generations: Math.min(240, Math.max(1, Math.round(settings.generations))),
    populationSize: Math.min(
      180,
      Math.max(8, Math.round(settings.populationSize)),
    ),
    gamesPerGenome: Math.min(
      40,
      Math.max(2, Math.round(settings.gamesPerGenome)),
    ),
    validationGames: Math.min(
      40,
      Math.max(2, Math.round(settings.validationGames)),
    ),
    parallelWorkers: Math.min(
      16,
      Math.max(
        1,
        Math.round(
          settings.parallelWorkers ?? DEFAULT_TRAINING_SETTINGS.parallelWorkers,
        ),
      ),
    ),
    eliteCount: Math.min(
      Math.max(1, Math.round(settings.populationSize) - 1),
      Math.max(1, Math.round(settings.eliteCount)),
    ),
    mutationRate: Math.min(0.9, Math.max(0.01, settings.mutationRate)),
    mutationScale: Math.min(1.4, Math.max(0.01, settings.mutationScale)),
    mutationAggression: Math.min(
      3,
      Math.max(
        0.1,
        settings.mutationAggression ??
          DEFAULT_TRAINING_SETTINGS.mutationAggression,
      ),
    ),
    adaptiveMutation:
      typeof settings.adaptiveMutation === 'boolean'
        ? settings.adaptiveMutation
        : DEFAULT_TRAINING_SETTINGS.adaptiveMutation,
    immigrantRate: Math.min(
      0.35,
      Math.max(
        0,
        settings.immigrantRate ?? DEFAULT_TRAINING_SETTINGS.immigrantRate,
      ),
    ),
    tournamentSize: Math.min(
      12,
      Math.max(
        2,
        Math.round(settings.tournamentSize ?? DEFAULT_TRAINING_SETTINGS.tournamentSize),
      ),
    ),
    noveltyWeight: Math.min(
      1,
      Math.max(0, settings.noveltyWeight ?? DEFAULT_TRAINING_SETTINGS.noveltyWeight),
    ),
    crossoverRate: Math.min(1, Math.max(0, settings.crossoverRate)),
    frontierSolverCells: Math.min(
      22,
      Math.max(
        0,
        Math.round(
          settings.frontierSolverCells ??
            DEFAULT_TRAINING_SETTINGS.frontierSolverCells,
        ),
      ),
    ),
    logicAssistStrength: Math.min(
      1,
      Math.max(
        0,
        settings.logicAssistStrength ??
          DEFAULT_TRAINING_SETTINGS.logicAssistStrength,
      ),
    ),
    riskTolerance: Math.min(
      0.65,
      Math.max(0, settings.riskTolerance ?? DEFAULT_TRAINING_SETTINGS.riskTolerance),
    ),
    valueHeadWeight: Math.min(
      1,
      Math.max(
        0,
        settings.valueHeadWeight ?? DEFAULT_TRAINING_SETTINGS.valueHeadWeight,
      ),
    ),
    maxStepsPerGame: Math.min(
      600,
      Math.max(20, Math.round(settings.maxStepsPerGame)),
    ),
    hiddenLayers:
      hiddenLayers.length > 0
        ? hiddenLayers.map((value) =>
            Math.min(48, Math.max(4, Math.round(value))),
          )
        : DEFAULT_TRAINING_SETTINGS.hiddenLayers,
    continueFromChampion: true,
    benchmarkSeed: Math.round(settings.benchmarkSeed || randomSeed()),
  }
}

function buildProfileIdentity(index: number) {
  return {
    name: `${PROFILE_NAMES[index % PROFILE_NAMES.length]}-${(index + 1)
      .toString()
      .padStart(2, '0')}`,
    species: PROFILE_SPECIES[index % PROFILE_SPECIES.length],
  }
}

export function createProfile(
  settings: TrainingSettings,
  index: number,
  overrides?: Partial<ModelProfile>,
): ModelProfile {
  const identity = buildProfileIdentity(index)
  const normalizedSettings = sanitizeSettings(settings)
  return {
    id:
      overrides?.id ??
      `profile-${Date.now()}-${index}-${Math.abs(randomSeed()).toString(36)}`,
    name: overrides?.name ?? identity.name,
    species: overrides?.species ?? identity.species,
    createdAt: overrides?.createdAt ?? Date.now(),
    board: clampBoard(overrides?.board ?? normalizedSettings.board),
    settings: sanitizeSettings({
      ...normalizedSettings,
      ...overrides?.settings,
      board: clampBoard(overrides?.board ?? normalizedSettings.board),
    }),
  }
}

export function sanitizeProfile(
  profile: Partial<ModelProfile>,
  fallbackSettings: TrainingSettings,
  index: number,
): ModelProfile {
  const identity = buildProfileIdentity(index)
  const board = clampBoard(
    profile.board ?? profile.settings?.board ?? fallbackSettings.board,
  )
  const settings = sanitizeSettings({
    ...fallbackSettings,
    ...profile.settings,
    board,
  })

  return {
    id: profile.id ?? `profile-migrated-${index}`,
    name:
      typeof profile.name === 'string' && profile.name.trim().length > 0
        ? profile.name
        : identity.name,
    species:
      typeof profile.species === 'string' && profile.species.trim().length > 0
        ? profile.species
        : identity.species,
    createdAt:
      typeof profile.createdAt === 'number' ? profile.createdAt : Date.now(),
    board,
    settings,
  }
}

function sanitizeHistoryItems(
  rawHistory: GenerationSummary[],
  fallbackBoard: BoardConfig,
): GenerationSummary[] {
  return rawHistory
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      profileId: typeof item.profileId === 'string' ? item.profileId : '',
      board: clampBoard(item.board ?? fallbackBoard),
    }))
    .filter(
      (item) =>
        typeof item.generation === 'number' &&
        item.champion &&
        typeof item.bestFitness === 'number',
    )
}

function migrateLegacyState(
  settings: TrainingSettings,
  history: GenerationSummary[],
): PersistedState {
  const grouped = new Map<string, GenerationSummary[]>()

  history.forEach((item) => {
    const key = boardKey(item.board)
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  })

  if (grouped.size === 0) {
    const profile = createProfile(settings, 0)
    return {
      profiles: [profile],
      activeProfileId: profile.id,
      history: [],
    }
  }

  const profiles = Array.from(grouped.entries()).map(([key, items], index) => {
    const board = items[0]?.board ?? settings.board
    const createdAt =
      items
        .map((item) => item.createdAt)
        .sort((left, right) => left - right)[0] ?? Date.now()

    return createProfile(
      {
        ...settings,
        board,
      },
      index,
      {
        createdAt,
        id: `profile-legacy-${key}`,
      },
    )
  })

  const migratedHistory = history.map((item) => {
    const profile =
      profiles.find((candidate) => sameBoard(candidate.board, item.board)) ??
      profiles[0]

    return {
      ...item,
      profileId: profile.id,
    }
  })

  const activeProfile =
    profiles.find((profile) => sameBoard(profile.board, settings.board)) ??
    profiles[0]

  return {
    profiles,
    activeProfileId: activeProfile.id,
    history: migratedHistory,
  }
}

export function readPersistedState(): PersistedState {
  const settingsRaw = localStorage.getItem(STORAGE_KEYS.settings)
  const profilesRaw = localStorage.getItem(STORAGE_KEYS.profiles)
  const historyRaw = localStorage.getItem(STORAGE_KEYS.history)
  const activeProfileRaw = localStorage.getItem(STORAGE_KEYS.activeProfile)

  const parsedSettings = settingsRaw
    ? sanitizeSettings(JSON.parse(settingsRaw) as TrainingSettings)
    : DEFAULT_TRAINING_SETTINGS
  const rawHistory = historyRaw
    ? sanitizeHistoryItems(
        JSON.parse(historyRaw) as GenerationSummary[],
        parsedSettings.board,
      )
    : []

  if (!profilesRaw) {
    return migrateLegacyState(parsedSettings, rawHistory)
  }

  try {
    const parsedProfiles = (JSON.parse(profilesRaw) as ModelProfile[]).map(
      (profile, index) => sanitizeProfile(profile, parsedSettings, index),
    )

    const profiles =
      parsedProfiles.length > 0 ? parsedProfiles : [createProfile(parsedSettings, 0)]
    const fallbackProfile = profiles[0]
    const history = rawHistory.map((item) => {
      if (profiles.some((profile) => profile.id === item.profileId)) {
        return item
      }

      const matchedProfile =
        profiles.find((profile) => sameBoard(profile.board, item.board)) ??
        fallbackProfile

      return {
        ...item,
        profileId: matchedProfile.id,
      }
    })

    const activeProfileId =
      activeProfileRaw && profiles.some((profile) => profile.id === activeProfileRaw)
        ? activeProfileRaw
        : fallbackProfile.id

    return {
      profiles,
      activeProfileId,
      history,
    }
  } catch {
    return migrateLegacyState(parsedSettings, rawHistory)
  }
}

export function readMinesweeperEloMeta() {
  const raw = localStorage.getItem(MINESWEEPER_ELO_META_STORAGE_KEY)
  if (!raw) {
    return {} as Record<string, EloProfileMeta>
  }

  try {
    return JSON.parse(raw) as Record<string, EloProfileMeta>
  } catch {
    return {} as Record<string, EloProfileMeta>
  }
}

export function mergeArchivedMilestones(existing: number[], incoming: number[]) {
  return [...new Set([...existing, ...incoming])].sort(
    (left, right) => left - right,
  )
}

function normalizeMinesweeperSnapshot(
  item: Partial<MinesweeperBotSnapshot>,
): MinesweeperBotSnapshot | null {
  if (
    !item ||
    typeof item.id !== 'string' ||
    typeof item.profileId !== 'string' ||
    !item.champion
  ) {
    return null
  }

  return {
    id: item.id,
    profileId: item.profileId,
    name: typeof item.name === 'string' ? item.name : 'Archived bot',
    species: typeof item.species === 'string' ? item.species : 'Unknown',
    snapshotType: item.snapshotType === 'peak' ? 'peak' : 'milestone',
    elo: typeof item.elo === 'number' ? item.elo : 0,
    milestone:
      typeof item.milestone === 'number'
        ? item.milestone
        : Math.round(typeof item.elo === 'number' ? item.elo : 0),
    generation: typeof item.generation === 'number' ? item.generation : 0,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    board: clampBoard(item.board ?? DEFAULT_TRAINING_SETTINGS.board),
    champion: item.champion,
    note: typeof item.note === 'string' ? item.note : '',
  }
}

export function mergeMinesweeperArchive(
  existing: MinesweeperBotSnapshot[],
  incoming: MinesweeperBotSnapshot[] = [],
) {
  return mergeSnapshotArchive(
    [...existing, ...incoming].map((snapshot) =>
      normalizeMinesweeperSnapshot(snapshot),
    ),
  )
}

export function readMinesweeperArchive() {
  const raw = localStorage.getItem(MINESWEEPER_ARCHIVE_STORAGE_KEY)
  if (!raw) {
    return [] as MinesweeperBotSnapshot[]
  }

  try {
    return mergeMinesweeperArchive(JSON.parse(raw) as MinesweeperBotSnapshot[])
  } catch {
    return [] as MinesweeperBotSnapshot[]
  }
}
