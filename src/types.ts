export type DifficultyPreset = 'beginner' | 'intermediate' | 'expert' | 'custom'

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost'

export type PlayerAction = 'reveal' | 'flag'

export interface BoardConfig {
  rows: number
  cols: number
  mines: number
  label: string
}

export interface CellState {
  mine: boolean
  revealed: boolean
  flagged: boolean
  adjacent: number
  exploded: boolean
}

export interface BoardSnapshotCell {
  revealed: boolean
  flagged: boolean
  adjacent: number
  mine: boolean
  exploded: boolean
  wrongFlag: boolean
}

export interface GameSession {
  config: BoardConfig
  board: CellState[][]
  generated: boolean
  status: GameStatus
  flagsUsed: number
  revealedSafe: number
  totalSafe: number
  safeSeed: number
  moveCount: number
  startedAt: number | null
  finishedAt: number | null
  explodedAt: Point | null
}

export interface Point {
  row: number
  col: number
}

export interface CandidateEvaluation {
  row: number
  col: number
  openScore: number
  flagScore: number
  riskEstimate: number
  frontier: boolean
  safeSignal: number
  mineSignal: number
  features: number[]
}

export interface MoveDecision extends CandidateEvaluation {
  action: PlayerAction
  certainty: number
}

export interface ReplayFrame {
  board: BoardSnapshotCell[][]
  move: MoveDecision | null
  status: GameStatus
  flagsUsed: number
  revealedSafe: number
  minesRemaining: number
}

export interface ReplayResult {
  frames: ReplayFrame[]
  finalStatus: GameStatus
  moveCount: number
  win: boolean
  accuracyReveal: number
  accuracyFlag: number
  clearedRatio: number
}

export interface WeightMatrix {
  rows: number
  cols: number
  values: number[]
}

export interface NeuralNetwork {
  layers: number[]
  weights: WeightMatrix[]
  biases: number[][]
}

export interface WeightStats {
  meanAbs: number
  maxAbs: number
  stdDev: number
}

export interface EvalAggregate {
  games: number
  wins: number
  losses: number
  avgFitness: number
  avgClearedRatio: number
  avgRevealAccuracy: number
  avgFlagAccuracy: number
  avgMoves: number
  avgSurvivalTurns: number
}

export interface GenomeResult {
  id: string
  network: NeuralNetwork
  fitness: number
  metrics: EvalAggregate
}

export interface TrainingSettings {
  board: BoardConfig
  generations: number
  populationSize: number
  gamesPerGenome: number
  validationGames: number
  parallelWorkers: number
  eliteCount: number
  mutationRate: number
  mutationScale: number
  crossoverRate: number
  hiddenLayers: number[]
  maxStepsPerGame: number
  continueFromChampion: boolean
  benchmarkSeed: number
}

export interface ModelProfile {
  id: string
  name: string
  species: string
  createdAt: number
  board: BoardConfig
  settings: TrainingSettings
}

export interface MinesweeperBotSnapshot {
  id: string
  profileId: string
  name: string
  species: string
  snapshotType: 'milestone' | 'peak'
  elo: number
  milestone: number
  generation: number
  createdAt: number
  board: BoardConfig
  champion: NeuralNetwork
  note: string
}

export interface GenerationSummary {
  profileId: string
  generation: number
  board: BoardConfig
  championId: string
  champion: NeuralNetwork
  bestFitness: number
  averageFitness: number
  medianFitness: number
  lowestFitness: number
  benchmark: EvalAggregate
  populationTopFitness: number[]
  weightStats: WeightStats
  driftFromPrevious: number
  populationDiversity?: number
  explorationPressure?: number
  adaptiveMutationRate?: number
  adaptiveMutationScale?: number
  immigrantCount?: number
  stagnationCount?: number
  createdAt: number
}

export interface TrainingState {
  running: boolean
  currentGeneration: number
  targetGenerations: number
  history: GenerationSummary[]
  logs: string[]
  error: string | null
}

export interface WorkerStartMessage {
  type: 'start'
  settings: TrainingSettings
  seedChampion: NeuralNetwork | null
  existingGenerationCount: number
  profileId?: string
}

export interface WorkerStopMessage {
  type: 'stop'
}

export interface WorkerGenerationMessage {
  type: 'generation'
  summary: GenerationSummary
  progress: {
    current: number
    total: number
  }
  log: string
}

export interface WorkerCompleteMessage {
  type: 'complete'
}

export interface WorkerErrorMessage {
  type: 'error'
  error: string
}

export type TrainingWorkerMessage =
  | WorkerGenerationMessage
  | WorkerCompleteMessage
  | WorkerErrorMessage

export type TrainingWorkerCommand = WorkerStartMessage | WorkerStopMessage
