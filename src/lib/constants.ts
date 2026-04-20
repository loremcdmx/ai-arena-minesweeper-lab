import type { BoardConfig, DifficultyPreset, TrainingSettings } from '../types'
import { createBoardConfig } from './minesweeper'
import { randomSeed } from './random'

const detectedHardwareConcurrency =
  typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
    ? navigator.hardwareConcurrency
    : 4

export const DEFAULT_PARALLEL_WORKERS = Math.max(
  1,
  Math.min(12, detectedHardwareConcurrency - 1),
)

export const PRESET_CONFIGS: Record<Exclude<DifficultyPreset, 'custom'>, BoardConfig> = {
  beginner: createBoardConfig(9, 9, 10, 'Beginner'),
  intermediate: createBoardConfig(16, 16, 40, 'Intermediate'),
  expert: createBoardConfig(16, 30, 99, 'Expert'),
}

export const DEFAULT_CUSTOM_BOARD = createBoardConfig(12, 18, 34, 'Custom')

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  board: PRESET_CONFIGS.beginner,
  generations: 6,
  populationSize: 24,
  gamesPerGenome: 8,
  validationGames: 8,
  parallelWorkers: DEFAULT_PARALLEL_WORKERS,
  eliteCount: 4,
  mutationRate: 0.14,
  mutationScale: 0.38,
  crossoverRate: 0.72,
  hiddenLayers: [18, 12],
  maxStepsPerGame: 220,
  continueFromChampion: true,
  benchmarkSeed: randomSeed(),
}

export const FEATURE_LABELS = [
  'bias',
  'row',
  'col',
  'center',
  'hidden',
  'flags',
  'mines left',
  'adjacent revealed',
  'adjacent flagged',
  'adjacent hidden',
  'frontier',
  'safe signal',
  'mine signal',
  'min risk',
  'avg risk',
  'max risk',
  'clue min',
  'clue avg',
  'clue max',
  'satisfied',
  'radius-2 reveal',
  'edge',
  'corner',
  'tempo',
]

export const STORAGE_KEYS = {
  settings: 'minesweeper-lab-settings-v1',
  history: 'minesweeper-lab-history-v1',
  profiles: 'minesweeper-lab-profiles-v2',
  activeProfile: 'minesweeper-lab-active-profile-v2',
}
