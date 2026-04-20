import { Chess } from 'chess.js'

export type StrategyGameId = 'chess' | 'tictactoe' | 'connect4'
export type StrategyActor = 'champion' | 'sparring'

export interface StrategyTrainingSettings {
  cycleGenerations: number
  selfPlayGames: number
  sparringGames: number
  learningRate: number
  exploration: number
  previewDelayMs: number
}

export interface StrategyGenerationSummary {
  generation: number
  createdAt: number
  rating: number
  winRate: number
  drawRate: number
  lossRate: number
  attackScore: number
  planningScore: number
  resilienceScore: number
  errorRate: number
  throughput: number
  confidence: number
  trend: number
}

export interface StrategyProfile {
  id: string
  name: string
  archetype: string
  createdAt: number
  rating: number
  weights: number[]
  settings: StrategyTrainingSettings
  history: StrategyGenerationSummary[]
}

export interface StrategyArenaState {
  profiles: StrategyProfile[]
  activeProfileId: string
}

export interface StrategyBoardCell {
  key: string
  content: string
  surface: 'light' | 'dark' | 'grid'
  owner: 'champion' | 'sparring' | 'empty'
  highlight: boolean
}

export interface StrategyBoardView {
  rows: number
  cols: number
  dense: boolean
  cells: StrategyBoardCell[]
}

export interface StrategyMatchMove {
  actor: StrategyActor
  notation: string
  insight: string
  evaluation: number
}

interface StrategyPreviewBase {
  gameId: StrategyGameId
  board: StrategyBoardView
  moveCount: number
  turnLabel: string
  status: 'live' | 'finished'
  outcomeLabel: string
  lastMove: StrategyMatchMove | null
  feed: string[]
  hint: string
  detail: string
}

export interface StrategyAdvanceOptions {
  poweredActor?: StrategyActor | 'both'
}

interface ChessPreviewState extends StrategyPreviewBase {
  gameId: 'chess'
  raw: {
    fen: string
    championColor: 'w' | 'b'
    openingName: string
    highlightSquares: string[]
  }
}

interface GridPreviewState extends StrategyPreviewBase {
  gameId: 'tictactoe' | 'connect4'
  raw: {
    board: Array<'X' | 'O' | 'R' | 'Y' | null>
    rows: number
    cols: number
    championMark: 'X' | 'R'
    sparringMark: 'O' | 'Y'
    currentActor: StrategyActor
    highlightIndices: number[]
    winner: StrategyActor | 'draw' | null
  }
}

export type StrategyPreviewState = ChessPreviewState | GridPreviewState

export interface StrategyGameDefinition {
  id: StrategyGameId
  title: string
  shortTitle: string
  eyebrow: string
  description: string
  boardLabel: string
  trainingNote: string
  paceUnit: string
  focusLabels: [string, string, string]
  targetWeights: number[]
  baselineWeights: number[]
  defaults: StrategyTrainingSettings
  baseRating: number
  ratingSpan: number
  drawBias: number
}

const CHESS_GLYPHS: Record<string, string> = {
  wp: '\u2659',
  wn: '\u2658',
  wb: '\u2657',
  wr: '\u2656',
  wq: '\u2655',
  wk: '\u2654',
  bp: '\u265f',
  bn: '\u265e',
  bb: '\u265d',
  br: '\u265c',
  bq: '\u265b',
  bk: '\u265a',
}

const TIC_TAC_TOE_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const CONNECT4_DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const

const CONNECT4_ROWS = 6
const CONNECT4_COLS = 7

const CHESS_OPENINGS = [
  {
    name: 'Italian structure',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
  },
  {
    name: 'Queen pawn shell',
    moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3', 'e6'],
  },
  {
    name: 'Sicilian pressure',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'],
  },
  {
    name: 'English centre',
    moves: ['c4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5'],
  },
] as const

const PROFILE_NAMES: Record<StrategyGameId, string[]> = {
  chess: ['Vector', 'Rook', 'Atlas', 'Caissa', 'Tempo', 'File', 'Lumen', 'Parity'],
  tictactoe: ['Fork', 'Grid', 'Axis', 'Pivot', 'Delta', 'Pulse', 'Logic', 'Trace'],
  connect4: ['Column', 'Cascade', 'Vector', 'Orbit', 'Prism', 'Latch', 'Signal', 'Drop'],
}

const PROFILE_ARCHETYPES: Record<StrategyGameId, string[]> = {
  chess: [
    'Endgame Analyst',
    'Opening Mapper',
    'Pressure Engine',
    'Positional Walker',
  ],
  tictactoe: [
    'Fork Hunter',
    'Solve Core',
    'Zero Blunder Shell',
    'Mirror Defender',
  ],
  connect4: [
    'Column Reader',
    'Center Pressure Core',
    'Trap Builder',
    'Vertical Timing Engine',
  ],
}

export const STRATEGY_GAME_DEFINITIONS: Record<
  StrategyGameId,
  StrategyGameDefinition
> = {
  chess: {
    id: 'chess',
    title: 'Chess Engine Trainer',
    shortTitle: 'Chess',
    eyebrow: 'Engine',
    description:
      'Профиль растит оценочную функцию для шахматного движка: материал, центр, темп, безопасность короля и качество развития.',
    boardLabel: '8x8 board · opening rotation',
    trainingNote:
      'Каждый цикл усиливает позиционную оценку, снижает шум поиска и поднимает рейтинг против спарринг-пула.',
    paceUnit: 'gens / min',
    focusLabels: ['такт. точность', 'позиционный вес', 'устойчивость'],
    targetWeights: [1.18, 0.84, 0.63, 0.58, 0.52, 0.46],
    baselineWeights: [0.76, 0.32, 0.18, 0.2, 0.16, 0.12],
    defaults: {
      cycleGenerations: 8,
      selfPlayGames: 18,
      sparringGames: 12,
      learningRate: 0.22,
      exploration: 0.18,
      previewDelayMs: 420,
    },
    baseRating: 840,
    ratingSpan: 1260,
    drawBias: 0.24,
  },
  tictactoe: {
    id: 'tictactoe',
    title: 'Tic-Tac-Toe Solver Trainer',
    shortTitle: 'Tic-Tac-Toe',
    eyebrow: 'Solved game',
    description:
      'Мини-лаборатория для роста от грубых эвристик к почти идеальной защите: блокировки, вилки, центр и темп.',
    boardLabel: '3x3 board · perfect defence',
    trainingNote:
      'Тут видно, как профиль очень быстро переходит из случайной игры в точный контроль вилок и ничейных линий.',
    paceUnit: 'gens / min',
    focusLabels: ['fork vision', 'defence grid', 'solve confidence'],
    targetWeights: [1.22, 1.06, 0.88, 0.6, 0.42],
    baselineWeights: [0.46, 0.32, 0.18, 0.12, 0.08],
    defaults: {
      cycleGenerations: 6,
      selfPlayGames: 20,
      sparringGames: 16,
      learningRate: 0.28,
      exploration: 0.14,
      previewDelayMs: 560,
    },
    baseRating: 420,
    ratingSpan: 520,
    drawBias: 0.48,
  },
  connect4: {
    id: 'connect4',
    title: 'Connect4 Engine Trainer',
    shortTitle: 'Connect4',
    eyebrow: 'Solved race',
    description:
      'Connect4 engine trainer: reads columns, values the center, builds double threats, and plans under gravity.',
    boardLabel: '7x6 board · gravity search',
    trainingNote:
      'Each cycle removes bad drops, teaches center discipline, and starts spotting forks where one column creates two wins.',
    paceUnit: 'gens / min',
    focusLabels: ['center control', 'trap timing', 'column balance'],
    targetWeights: [1.14, 0.98, 0.82, 0.64, 0.5],
    baselineWeights: [0.48, 0.3, 0.18, 0.14, 0.1],
    defaults: {
      cycleGenerations: 7,
      selfPlayGames: 16,
      sparringGames: 12,
      learningRate: 0.22,
      exploration: 0.2,
      previewDelayMs: 180,
    },
    baseRating: 580,
    ratingSpan: 900,
    drawBias: 0.18,
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function randomSpread(amount: number) {
  return (Math.random() - 0.5) * amount
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function oppositeActor(actor: StrategyActor): StrategyActor {
  return actor === 'champion' ? 'sparring' : 'champion'
}

function hasFullStrength(
  actor: StrategyActor,
  options?: StrategyAdvanceOptions,
) {
  if (options?.poweredActor === 'both') {
    return true
  }

  if (options?.poweredActor) {
    return options.poweredActor === actor
  }

  return actor === 'champion'
}

function strategyWeightsForActor(
  profile: StrategyProfile,
  actor: StrategyActor,
  fallbackScale: (value: number, index: number) => number,
  options?: StrategyAdvanceOptions,
) {
  if (hasFullStrength(actor, options)) {
    return profile.weights
  }

  return profile.weights.map((value, index) =>
    clamp(fallbackScale(value, index), 0.02, 1.4),
  )
}

function gridIndexFromKey(
  gameId: 'tictactoe' | 'connect4',
  cellKey: string,
) {
  const prefix = `${gameId}-`
  if (!cellKey.startsWith(prefix)) {
    return null
  }

  const index = Number.parseInt(cellKey.slice(prefix.length), 10)
  return Number.isInteger(index) ? index : null
}

function profileIdentity(gameId: StrategyGameId, index: number) {
  const names = PROFILE_NAMES[gameId]
  const archetypes = PROFILE_ARCHETYPES[gameId]
  return {
    name: `${names[index % names.length]}-${(index + 1).toString().padStart(2, '0')}`,
    archetype: archetypes[index % archetypes.length],
  }
}

function normalizeSettings(
  gameId: StrategyGameId,
  settings?: Partial<StrategyTrainingSettings>,
): StrategyTrainingSettings {
  const defaults = STRATEGY_GAME_DEFINITIONS[gameId].defaults
  return {
    cycleGenerations: clamp(
      Math.round(settings?.cycleGenerations ?? defaults.cycleGenerations),
      1,
      24,
    ),
    selfPlayGames: clamp(
      Math.round(settings?.selfPlayGames ?? defaults.selfPlayGames),
      4,
      48,
    ),
    sparringGames: clamp(
      Math.round(settings?.sparringGames ?? defaults.sparringGames),
      4,
      40,
    ),
    learningRate: clamp(settings?.learningRate ?? defaults.learningRate, 0.05, 0.45),
    exploration: clamp(settings?.exploration ?? defaults.exploration, 0.02, 0.5),
    previewDelayMs: clamp(
      Math.round(settings?.previewDelayMs ?? defaults.previewDelayMs),
      80,
      1200,
    ),
  }
}

function chessCurriculumTargets(
  generation: number,
  settings: StrategyTrainingSettings,
) {
  const workloadPressure = clamp(
    (settings.selfPlayGames + settings.sparringGames - 18) / 42,
    0,
    1,
  )
  const certainty = clamp((0.5 - settings.exploration) / 0.48, 0, 1)
  const maturity = clamp(Math.log2(generation + 2) / 6.4, 0, 1.12)
  const stage = clamp(
    maturity + workloadPressure * 0.18 + certainty * 0.12 + settings.learningRate * 0.08,
    0,
    1.16,
  )

  return [
    clamp(0.92 + stage * 0.32, 0.76, 1.28),
    clamp(0.44 + stage * 0.28, 0.32, 0.96),
    clamp(0.24 + stage * 0.28, 0.18, 0.82),
    clamp(0.24 + stage * 0.24, 0.2, 0.76),
    clamp(0.18 + stage * 0.22, 0.16, 0.68),
    clamp(0.14 + stage * 0.2, 0.12, 0.62),
  ]
}

function ticTacToeCurriculumTargets(
  generation: number,
  settings: StrategyTrainingSettings,
) {
  const workloadPressure = clamp(
    (settings.selfPlayGames + settings.sparringGames - 12) / 36,
    0,
    1,
  )
  const certainty = clamp((0.4 - settings.exploration) / 0.38, 0, 1)
  const maturity = clamp(Math.log2(generation + 2) / 4.2, 0, 1.08)
  const stage = clamp(
    maturity + workloadPressure * 0.18 + certainty * 0.14 + settings.learningRate * 0.12,
    0,
    1.15,
  )

  return [
    clamp(0.86 + stage * 0.38, 0.46, 1.26),
    clamp(0.8 + stage * 0.32, 0.32, 1.12),
    clamp(0.56 + stage * 0.34, 0.18, 0.96),
    clamp(0.24 + stage * 0.22, 0.12, 0.68),
    clamp(0.16 + stage * 0.18, 0.08, 0.54),
  ]
}

function connect4CurriculumTargets(
  generation: number,
  settings: StrategyTrainingSettings,
) {
  const workloadPressure = clamp(
    (settings.selfPlayGames + settings.sparringGames - 16) / 44,
    0,
    1,
  )
  const certainty = clamp((0.5 - settings.exploration) / 0.48, 0, 1)
  const maturity = clamp(Math.log2(generation + 2) / 6, 0, 1.08)
  const stage = clamp(
    maturity + workloadPressure * 0.18 + certainty * 0.12 + settings.learningRate * 0.1,
    0,
    1.18,
  )

  return [
    clamp(0.82 + stage * 0.32, 0.48, 1.24),
    clamp(0.76 + stage * 0.4, 0.3, 1.28),
    clamp(0.44 + stage * 0.3, 0.18, 0.9),
    clamp(0.26 + stage * 0.24, 0.14, 0.78),
    clamp(0.18 + stage * 0.22, 0.1, 0.68),
  ]
}

function targetWeightsForGeneration(
  gameId: StrategyGameId,
  generation: number,
  settings: StrategyTrainingSettings,
) {
  const definition = STRATEGY_GAME_DEFINITIONS[gameId]

  if (gameId === 'chess') {
    return chessCurriculumTargets(generation, settings)
  }

  if (gameId === 'tictactoe') {
    return ticTacToeCurriculumTargets(generation, settings)
  }

  if (gameId === 'connect4') {
    return connect4CurriculumTargets(generation, settings)
  }

  return definition.targetWeights
}

function initialWeights(gameId: StrategyGameId, settings: StrategyTrainingSettings) {
  const definition = STRATEGY_GAME_DEFINITIONS[gameId]
  const targetWeights = targetWeightsForGeneration(gameId, 0, settings)
  return definition.baselineWeights.map((value, index) =>
    clamp(
      value + (targetWeights[index] - value) * 0.18 + randomSpread(0.06),
      0.02,
      1.4,
    ),
  )
}

function weightAlignment(
  gameId: StrategyGameId,
  weights: number[],
  target = STRATEGY_GAME_DEFINITIONS[gameId].targetWeights,
) {
  return average(
    target.map((targetValue, index) =>
      clamp(1 - Math.abs(targetValue - (weights[index] ?? targetValue)) / 1.25, 0, 1),
    ),
  )
}

function connect4TacticalMastery(weights: number[]) {
  const attack = clamp((weights[0] - 0.48) / 0.76, 0, 1)
  const defence = clamp((weights[1] - 0.3) / 0.94, 0, 1)
  const center = clamp((weights[2] - 0.18) / 0.64, 0, 1)
  const support = clamp((weights[3] - 0.14) / 0.5, 0, 1)
  const vertical = clamp((weights[4] - 0.1) / 0.42, 0, 1)

  return clamp(
    attack * 0.28 + defence * 0.28 + center * 0.18 + support * 0.14 + vertical * 0.12,
    0,
    1,
  )
}

function connect4DepthBonus(
  generation: number,
  settings: StrategyTrainingSettings,
) {
  const tail = Math.max(0, Math.log2(generation + 2) - 4.6)
  const workload = settings.selfPlayGames * 0.75 + settings.sparringGames * 0.55
  return tail * (18 + workload)
}

function chessStrategicMastery(weights: number[]) {
  const material = clamp((weights[0] - 0.76) / 0.52, 0, 1)
  const centre = clamp((weights[1] - 0.32) / 0.64, 0, 1)
  const development = clamp((weights[2] - 0.18) / 0.64, 0, 1)
  const kingSafety = clamp((weights[3] - 0.2) / 0.56, 0, 1)
  const structure = clamp((weights[4] - 0.16) / 0.52, 0, 1)
  const initiative = clamp((weights[5] - 0.12) / 0.5, 0, 1)

  return clamp(
    material * 0.28 +
      centre * 0.16 +
      development * 0.16 +
      kingSafety * 0.16 +
      structure * 0.1 +
      initiative * 0.14,
    0,
    1,
  )
}

function ticTacToeMastery(weights: number[]) {
  const finishing = clamp((weights[0] - 0.46) / 0.8, 0, 1)
  const defence = clamp((weights[1] - 0.32) / 0.8, 0, 1)
  const solve = clamp((weights[2] - 0.18) / 0.78, 0, 1)
  const centre = clamp((weights[3] - 0.12) / 0.56, 0, 1)
  const corner = clamp((weights[4] - 0.08) / 0.46, 0, 1)

  return clamp(
    finishing * 0.24 + defence * 0.24 + solve * 0.24 + centre * 0.16 + corner * 0.12,
    0,
    1,
  )
}

function chessDepthBonus(
  generation: number,
  settings: StrategyTrainingSettings,
) {
  const tail = Math.max(0, Math.log2(generation + 2) - 4.8)
  const workload = settings.selfPlayGames * 0.85 + settings.sparringGames * 0.65
  return tail * (22 + workload)
}

function projectSummary(
  gameId: StrategyGameId,
  profile: Pick<StrategyProfile, 'weights' | 'settings' | 'rating' | 'history'>,
  generation: number,
): StrategyGenerationSummary {
  const definition = STRATEGY_GAME_DEFINITIONS[gameId]
  const targetWeights = targetWeightsForGeneration(gameId, generation, profile.settings)
  const alignment = weightAlignment(gameId, profile.weights, targetWeights)
  const chessMastery = gameId === 'chess' ? chessStrategicMastery(profile.weights) : 0
  const tttMastery = gameId === 'tictactoe' ? ticTacToeMastery(profile.weights) : 0
  const tacticalMastery =
    gameId === 'connect4' ? connect4TacticalMastery(profile.weights) : 0
  const maturity =
    gameId === 'connect4'
      ? clamp(Math.log2(generation + 2) / 5.4, 0, 1.12)
      : gameId === 'chess'
        ? clamp(Math.log2(generation + 2) / 5.6, 0, 1.16)
        : gameId === 'tictactoe'
          ? clamp(Math.log2(generation + 2) / 4.1, 0, 1.04)
      : clamp(Math.log2(generation + 2) / 5, 0, 1)
  const volatility =
    profile.settings.exploration * 0.22 +
    (1 - profile.settings.learningRate / 0.45) * 0.08
  const attackScore = clamp(
    0.24 +
      profile.weights[0] * 0.26 +
      profile.weights[1] * 0.14 +
      maturity * 0.24 +
      chessMastery * (gameId === 'chess' ? 0.1 : 0) +
      tttMastery * (gameId === 'tictactoe' ? 0.14 : 0) +
      tacticalMastery * 0.12,
    0,
    1,
  )
  const planningScore = clamp(
    0.22 +
      average(profile.weights.slice(1, Math.min(profile.weights.length, 4))) * 0.28 +
      maturity * 0.22 +
      chessMastery * (gameId === 'chess' ? 0.12 : 0) +
      tttMastery * (gameId === 'tictactoe' ? 0.12 : 0) +
      tacticalMastery * (gameId === 'connect4' ? 0.1 : 0),
    0,
    1,
  )
  const resilienceScore = clamp(
    0.26 +
      alignment * 0.34 +
      (1 - profile.settings.exploration) * 0.16 +
      maturity * 0.16 +
      chessMastery * (gameId === 'chess' ? 0.12 : 0) +
      tttMastery * (gameId === 'tictactoe' ? 0.12 : 0) +
      tacticalMastery * (gameId === 'connect4' ? 0.08 : 0),
    0,
    1,
  )
  const errorRate = clamp(0.42 - alignment * 0.26 - maturity * 0.12 + volatility, 0.02, 0.52)
  const rating =
    gameId === 'connect4'
      ? definition.baseRating +
        clamp(
          alignment * 0.48 +
            attackScore * 0.18 +
            planningScore * 0.16 +
            resilienceScore * 0.08 +
            tacticalMastery * 0.1,
          0,
          1.08,
        ) *
          980 +
        maturity * 170 +
        connect4DepthBonus(generation, profile.settings) +
        (profile.settings.selfPlayGames - 4) * 4 +
        (profile.settings.sparringGames - 4) * 3
      : gameId === 'chess'
        ? definition.baseRating +
          clamp(
            alignment * 0.34 +
              attackScore * 0.14 +
              planningScore * 0.18 +
              resilienceScore * 0.12 +
              chessMastery * 0.22,
            0,
            1.1,
          ) *
            1320 +
          maturity * 220 +
          chessDepthBonus(generation, profile.settings) +
          (profile.settings.selfPlayGames - 4) * 4 +
          (profile.settings.sparringGames - 4) * 3
        : gameId === 'tictactoe'
          ? definition.baseRating +
            clamp(
              alignment * 0.36 +
                attackScore * 0.16 +
                planningScore * 0.14 +
                resilienceScore * 0.1 +
                tttMastery * 0.24,
              0,
              1.04,
            ) *
              520 +
            maturity * 72 +
            Math.max(0, Math.log2(generation + 2) - 3.2) * 11 +
            (profile.settings.selfPlayGames - 4) * 2 +
            (profile.settings.sparringGames - 4) * 1.5
      : definition.baseRating +
        alignment * definition.ratingSpan +
        maturity * 120 +
        (profile.settings.selfPlayGames - 4) * 3 +
        (profile.settings.sparringGames - 4) * 2
  const rawWinRate =
    gameId === 'connect4'
      ? 0.14 +
        alignment * 0.34 +
        maturity * 0.14 +
        attackScore * 0.16 +
        planningScore * 0.12 +
        tacticalMastery * 0.12 +
        profile.settings.learningRate * 0.1 -
        profile.settings.exploration * 0.1
      : gameId === 'chess'
        ? 0.12 +
          alignment * 0.28 +
          maturity * 0.12 +
          attackScore * 0.12 +
          planningScore * 0.14 +
          chessMastery * 0.18 +
          profile.settings.learningRate * 0.1 -
          profile.settings.exploration * 0.08
        : gameId === 'tictactoe'
          ? 0.1 +
            alignment * 0.18 +
            maturity * 0.08 +
            attackScore * 0.08 +
            planningScore * 0.08 +
            tttMastery * 0.14 +
            profile.settings.learningRate * 0.06 -
            profile.settings.exploration * 0.03
      : 0.18 +
        alignment * 0.5 +
        maturity * 0.18 +
        profile.settings.learningRate * 0.12 -
        profile.settings.exploration * 0.08
  const drawRate = clamp(
    gameId === 'connect4'
      ? definition.drawBias +
          resilienceScore * 0.14 -
          attackScore * 0.12 -
          tacticalMastery * 0.08
      : gameId === 'chess'
        ? definition.drawBias +
            resilienceScore * 0.14 -
            attackScore * 0.08 +
            (1 - chessMastery) * 0.06
        : gameId === 'tictactoe'
          ? definition.drawBias +
              resilienceScore * 0.18 -
              attackScore * 0.06 -
              tttMastery * 0.04
      : definition.drawBias + resilienceScore * 0.18 - attackScore * 0.1,
    gameId === 'connect4' ? 0.03 : 0.04,
    gameId === 'connect4' ? 0.22 : gameId === 'tictactoe' ? 0.82 : 0.7,
  )
  const winRate = clamp(rawWinRate, 0.08, 0.94 - drawRate)
  const lossRate = clamp(1 - winRate - drawRate, 0.01, 0.86)
  const throughput =
    profile.settings.selfPlayGames *
    profile.settings.sparringGames *
    (definition.id === 'chess' ? 42 : definition.id === 'connect4' ? 34 : 18)
  const previousRating = profile.history.at(-1)?.rating ?? profile.rating

  return {
    generation,
    createdAt: Date.now(),
    rating,
    winRate,
    drawRate,
    lossRate,
    attackScore,
    planningScore,
    resilienceScore,
    errorRate,
    throughput,
    confidence: clamp(
      gameId === 'connect4'
        ? alignment * 0.52 +
            planningScore * 0.18 +
            resilienceScore * 0.14 +
            tacticalMastery * 0.16
        : gameId === 'chess'
          ? alignment * 0.42 +
              planningScore * 0.18 +
              resilienceScore * 0.14 +
              chessMastery * 0.18 +
              maturity * 0.08
          : gameId === 'tictactoe'
            ? alignment * 0.32 +
                planningScore * 0.12 +
                resilienceScore * 0.12 +
                tttMastery * 0.34 +
                maturity * 0.1
        : alignment * 0.74 + maturity * 0.18 + resilienceScore * 0.08,
      0,
      1,
    ),
    trend: rating - previousRating,
  }
}

export function createStrategyProfile(
  gameId: StrategyGameId,
  index: number,
  overrides?: Partial<StrategyProfile>,
): StrategyProfile {
  const identity = profileIdentity(gameId, index)
  const settings = normalizeSettings(gameId, overrides?.settings)
  const definition = STRATEGY_GAME_DEFINITIONS[gameId]
  const weights =
    overrides?.weights && overrides.weights.length > 0
      ? definition.baselineWeights.map((fallback, weightIndex) =>
          clamp(overrides.weights?.[weightIndex] ?? fallback, 0.02, 1.4),
        )
      : initialWeights(gameId, settings)
  const history =
    overrides?.history?.filter((item) => typeof item?.generation === 'number') ?? []
  const baseProfile: StrategyProfile = {
    id:
      overrides?.id ??
      `${gameId}-${Date.now()}-${index}-${Math.abs(randomSpread(1_000_000)).toFixed(0)}`,
    name: overrides?.name ?? identity.name,
    archetype: overrides?.archetype ?? identity.archetype,
    createdAt: overrides?.createdAt ?? Date.now(),
    rating: overrides?.rating ?? STRATEGY_GAME_DEFINITIONS[gameId].baseRating,
    weights,
    settings,
    history,
  }

  if (baseProfile.history.length === 0) {
    baseProfile.rating = projectSummary(gameId, baseProfile, 0).rating
  } else {
    baseProfile.rating = baseProfile.history.at(-1)?.rating ?? baseProfile.rating
  }

  return baseProfile
}

export function createStrategyArenaState(gameId: StrategyGameId): StrategyArenaState {
  const profile = createStrategyProfile(gameId, 0)
  return {
    profiles: [profile],
    activeProfileId: profile.id,
  }
}

export function sanitizeStrategyArenaState(
  gameId: StrategyGameId,
  raw: unknown,
): StrategyArenaState {
  if (!raw || typeof raw !== 'object') {
    return createStrategyArenaState(gameId)
  }

  const candidate = raw as Partial<StrategyArenaState>
  const profiles =
    candidate.profiles?.map((profile, index) =>
      createStrategyProfile(gameId, index, profile),
    ) ?? []
  const normalizedProfiles = profiles.length > 0 ? profiles : createStrategyArenaState(gameId).profiles
  const activeProfileId =
    candidate.activeProfileId &&
    normalizedProfiles.some((profile) => profile.id === candidate.activeProfileId)
      ? candidate.activeProfileId
      : normalizedProfiles[0].id

  return {
    profiles: normalizedProfiles,
    activeProfileId,
  }
}

export function currentStrategySummary(
  gameId: StrategyGameId,
  profile: StrategyProfile,
) {
  return profile.history.at(-1) ?? projectSummary(gameId, profile, profile.history.length)
}

export function evolveStrategyProfile(
  gameId: StrategyGameId,
  profile: StrategyProfile,
): StrategyProfile {
  const generation = profile.history.length + 1
  const target = targetWeightsForGeneration(gameId, generation, profile.settings)
  const nextWeights = profile.weights.map((value, index) => {
    const adjustment =
      (target[index] - value) *
      profile.settings.learningRate *
      (0.72 + Math.min(0.28, generation / 28))
    const noise =
      gameId === 'connect4'
        ? randomSpread(profile.settings.exploration * 0.11)
        : gameId === 'chess'
          ? randomSpread(profile.settings.exploration * 0.14)
          : gameId === 'tictactoe'
            ? randomSpread(profile.settings.exploration * 0.07)
        : randomSpread(profile.settings.exploration * 0.18)
    return clamp(value + adjustment + noise, 0.02, 1.4)
  })

  const nextProfile: StrategyProfile = {
    ...profile,
    weights: nextWeights,
  }
  const summary = projectSummary(gameId, nextProfile, generation)

  return {
    ...nextProfile,
    rating: summary.rating,
    history: [...profile.history, summary],
  }
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export function strategyProfileNarrative(
  gameId: StrategyGameId,
  profile: StrategyProfile,
) {
  const summary = currentStrategySummary(gameId, profile)
  if (profile.history.length === 0) {
    if (gameId === 'chess') {
      return 'Пока это сырой движок оценки. Один цикл обучения даст стартовый стиль игры и первую серию осмысленных решений.'
    }
    if (gameId === 'tictactoe') {
      return 'Профиль ещё не держит вилки и ничейные линии. Первый цикл быстро поднимет защиту и контроль центра.'
    }
    return 'Пока профиль играет по месту и поздно уважает вертикали. Первый цикл поднимет чтение колонок, центр и ранние блоки.'
  }

  if (summary.winRate >= 0.62) {
    return 'Профиль уже играет уверенно: темп высокий, ошибок мало, и спарринг-пул перестаёт его наказывать.'
  }
  if (summary.winRate >= 0.42) {
    return 'Видно стабильный рост: решение стало собраннее, а ошибки чаще превращаются в терпимую ничью, а не в провал.'
  }
  return 'Модель ещё растёт. Логика уже читается, но ей не хватает глубины, чтобы стабильно закрывать партии в свою пользу.'
}

function boardCell(index: number, colCount: number) {
  return {
    row: Math.floor(index / colCount),
    col: index % colCount,
  }
}

function indexAt(row: number, col: number, colCount: number) {
  return row * colCount + col
}

function inside(row: number, col: number, rowCount: number, colCount: number) {
  return row >= 0 && row < rowCount && col >= 0 && col < colCount
}

const TIC_TAC_TOE_SOLVE_CACHE = new Map<string, number>()

function ticTacToeForkMoves(board: Array<'X' | 'O' | null>, mark: 'X' | 'O') {
  return board
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value === null)
    .filter((entry) => {
      const nextBoard = [...board]
      nextBoard[entry.index] = mark

      const threats = TIC_TAC_TOE_LINES.filter((line) => {
        const marks = line.map((cell) => nextBoard[cell])
        return marks.filter((cell) => cell === mark).length === 2 && marks.includes(null)
      }).length

      return threats >= 2
    })
    .map((entry) => entry.index)
}

function ticTacToeSolve(
  board: Array<'X' | 'O' | null>,
  turn: 'X' | 'O',
  perspective: 'X' | 'O',
): number {
  const winner = ticTacToeWinner(board)
  if (winner) {
    return winner === perspective ? 1 : -1
  }

  if (board.every(Boolean)) {
    return 0
  }

  const cacheKey = `${turn}:${perspective}:${board.map((cell) => cell ?? '-').join('')}`
  const cached = TIC_TAC_TOE_SOLVE_CACHE.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const nextTurn = turn === 'X' ? 'O' : 'X'
  const maximizing = turn === perspective
  let best = maximizing ? -Infinity : Infinity

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] !== null) {
      continue
    }

    const nextBoard = [...board]
    nextBoard[index] = turn
    const score = ticTacToeSolve(nextBoard, nextTurn, perspective)

    if (maximizing) {
      best = Math.max(best, score)
      if (best === 1) {
        break
      }
    } else {
      best = Math.min(best, score)
      if (best === -1) {
        break
      }
    }
  }

  TIC_TAC_TOE_SOLVE_CACHE.set(cacheKey, best)
  return best
}

function scoreTicTacToeMove(
  board: Array<'X' | 'O' | null>,
  index: number,
  mark: 'X' | 'O',
  weights: number[],
) {
  const opponent = mark === 'X' ? 'O' : 'X'
  const nextBoard = [...board]
  nextBoard[index] = mark

  if (ticTacToeWinner(nextBoard) === mark) {
    return { score: 140 + weights[0] * 20, insight: 'finishing line' }
  }

  const blockBoard = [...board]
  blockBoard[index] = opponent
  if (ticTacToeWinner(blockBoard) === opponent) {
    return { score: 110 + weights[1] * 18, insight: 'forced block' }
  }

  const opponentForkThreats = ticTacToeForkMoves(board, opponent)
  const forkPotential = TIC_TAC_TOE_LINES.filter((line) => {
    const marks = line.map((cell) => nextBoard[cell])
    return (
      marks.filter((cell) => cell === mark).length === 2 &&
      marks.includes(null)
    )
  }).length
  const ownForks = ticTacToeForkMoves(nextBoard, mark)
  const opponentForksAfter = ticTacToeForkMoves(nextBoard, opponent)
  const solvedOutcome = ticTacToeSolve(nextBoard, opponent, mark)

  const centreBonus = index === 4 ? 20 + weights[3] * 10 : 0
  const cornerBonus = [0, 2, 6, 8].includes(index) ? 8 + weights[4] * 8 : 0
  const linePressure = TIC_TAC_TOE_LINES
    .filter((line) => line.includes(index))
    .reduce((sum, line) => {
      const marks = line.map((cell) => nextBoard[cell])
      if (marks.includes(opponent)) {
        return sum
      }
      return sum + marks.filter((cell) => cell === mark).length * 7
    }, 0)
  const blocksFork = opponentForkThreats.includes(index)
  const solveBonus = solvedOutcome === 1 ? 180 : solvedOutcome === 0 ? 84 : -120
  const forkLockBonus = ownForks.length > 0 ? 96 + ownForks.length * 24 : 0
  const forkDenyBonus = blocksFork ? 72 : 0
  const forkRiskPenalty = opponentForksAfter.length > 0 ? opponentForksAfter.length * 82 : 0

  return {
    score:
      solveBonus +
      forkPotential * (18 + weights[2] * 12) +
      forkLockBonus +
      forkDenyBonus -
      forkRiskPenalty +
      centreBonus +
      cornerBonus +
      linePressure,
    insight:
      solvedOutcome === 1
        ? 'forced win'
        : solvedOutcome === 0 && blocksFork
          ? 'anti-fork'
          : ownForks.length > 0 || forkPotential > 0
            ? 'fork pressure'
            : index === 4
              ? 'centre lock'
              : cornerBonus > 0
                ? 'corner net'
                : 'line build',
  }
}

function ticTacToeWinner(board: Array<'X' | 'O' | null>) {
  for (const line of TIC_TAC_TOE_LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return null
}

function createTicTacToePreview(profile: StrategyProfile): GridPreviewState {
  const board = Array<'X' | 'O' | null>(9).fill(null)
  return buildGridPreviewState(
    'tictactoe',
    board,
    3,
    3,
    'X',
    'O',
    'champion',
    [],
    null,
    [],
    'Ход чемпиона',
    'Открывающий ран',
    strategyProfileNarrative('tictactoe', profile),
  )
}

function buildGridPreviewState(
  gameId: 'tictactoe' | 'connect4',
  board: Array<'X' | 'O' | 'R' | 'Y' | null>,
  rows: number,
  cols: number,
  championMark: 'X' | 'R',
  sparringMark: 'O' | 'Y',
  currentActor: StrategyActor,
  highlightIndices: number[],
  winner: StrategyActor | 'draw' | null,
  feed: string[],
  turnLabel: string,
  outcomeLabel: string,
  detail: string,
): GridPreviewState {
  const dense = false
  const cells: StrategyBoardCell[] = board.map((value, index) => ({
    key: `${gameId}-${index}`,
    content:
      value === 'X'
        ? '\u00d7'
        : value === 'O'
          ? '\u25cb'
          : value === 'R' || value === 'Y'
            ? '\u25cf'
            : '',
    surface: 'grid',
    owner:
      value === championMark
        ? 'champion'
        : value === sparringMark
          ? 'sparring'
          : 'empty',
    highlight: highlightIndices.includes(index),
  }))

  return {
    gameId,
    board: {
      rows,
      cols,
      dense,
      cells,
    },
    moveCount: board.filter(Boolean).length,
    turnLabel,
    status: winner ? 'finished' : 'live',
    outcomeLabel,
    lastMove:
      highlightIndices.length > 0
        ? {
            actor: currentActor === 'champion' ? 'sparring' : 'champion',
            notation: (() => {
              const { row, col } = boardCell(highlightIndices[0], cols)
              return gameId === 'connect4' ? `c${col + 1}` : `${row + 1}:${col + 1}`
            })(),
            insight: feed[0]?.split(' · ')[1] ?? 'latest move',
            evaluation: 0,
          }
        : null,
    feed,
    hint: winner
      ? winner === 'draw'
        ? 'Партия ушла в ничью'
        : winner === 'champion'
          ? gameId === 'connect4'
            ? 'Чемпион закрыл четыре'
            : 'Чемпион закрыл линию'
          : gameId === 'connect4'
            ? 'Спарринг закрыл четыре'
            : 'Спарринг закрыл линию'
      : currentActor === 'champion'
        ? 'Ход чемпиона'
        : 'Ход спарринга',
    detail,
    raw: {
      board,
      rows,
      cols,
      championMark,
      sparringMark,
      currentActor,
      highlightIndices,
      winner,
    },
  }
}
function chooseBestMove(
  candidates: Array<{ index: number; score: number; insight: string }>,
  exploration: number,
) {
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      weightedScore: candidate.score + randomSpread(exploration * 10),
    }))
    .sort((left, right) => right.weightedScore - left.weightedScore)

  return ranked[0]
}

function ticTacToeDecisionExploration(
  profile: StrategyProfile,
  actor: StrategyActor,
) {
  const ratingFactor = clamp(1.02 - profile.rating / 1400, 0.04, 1)
  const actorFactor = actor === 'champion' ? 0.42 : 0.74
  return clamp(profile.settings.exploration * ratingFactor * actorFactor, 0.005, 0.12)
}

function advanceTicTacToePreview(
  preview: GridPreviewState,
  profile: StrategyProfile,
  options?: StrategyAdvanceOptions,
): GridPreviewState {
  const board = [...preview.raw.board] as Array<'X' | 'O' | null>
  const mark = preview.raw.currentActor === 'champion' ? 'X' : 'O'
  const weights = strategyWeightsForActor(
    profile,
    preview.raw.currentActor,
    (value, index) => value * (0.72 + index * 0.02),
    options,
  )
  const legalMoves = board
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value === null)
    .map((entry) => ({
      index: entry.index,
      ...scoreTicTacToeMove(board, entry.index, mark, weights),
    }))

  if (legalMoves.length === 0) {
    return buildGridPreviewState(
      'tictactoe',
      board,
      3,
      3,
      'X',
      'O',
      'champion',
      [],
      'draw',
      ['draw · full board', ...preview.feed].slice(0, 6),
      'Ничья',
      'Доска заполнена',
      'Обе стороны держат решённую структуру.',
    )
  }

  const selected = chooseBestMove(
    legalMoves,
    ticTacToeDecisionExploration(profile, preview.raw.currentActor),
  )
  board[selected.index] = mark
  const winner = ticTacToeWinner(board)
  const outcome =
    winner === 'X'
      ? 'Чемпион закрыл линию'
      : winner === 'O'
        ? 'Спарринг нашёл наказание'
        : board.every(Boolean)
          ? 'Ничья'
          : 'Партия продолжается'

  return buildGridPreviewState(
    'tictactoe',
    board,
    3,
    3,
    'X',
    'O',
    winner || board.every(Boolean)
      ? preview.raw.currentActor
      : preview.raw.currentActor === 'champion'
        ? 'sparring'
        : 'champion',
    [selected.index],
    winner
      ? winner === 'X'
        ? 'champion'
        : 'sparring'
      : board.every(Boolean)
        ? 'draw'
        : null,
    [`${mark}@${selected.index + 1} · ${selected.insight}`, ...preview.feed].slice(0, 6),
    winner || board.every(Boolean)
      ? winner
        ? winner === 'X'
          ? 'Чемпион завершил партию'
          : 'Спарринг завершил партию'
        : 'Ничья'
      : preview.raw.currentActor === 'champion'
        ? 'Ход спарринга'
        : 'Ход чемпиона',
    outcome,
    selected.insight,
  )
}

function playableConnect4Index(board: Array<'R' | 'Y' | null>, col: number) {
  for (let row = CONNECT4_ROWS - 1; row >= 0; row -= 1) {
    const index = indexAt(row, col, CONNECT4_COLS)
    if (board[index] === null) {
      return index
    }
  }

  return null
}

function connect4CandidateSet(board: Array<'R' | 'Y' | null>) {
  return Array.from({ length: CONNECT4_COLS }, (_, col) => playableConnect4Index(board, col)).filter(
    (index): index is number => index !== null,
  )
}

function countConnect4Line(
  board: Array<'R' | 'Y' | null>,
  row: number,
  col: number,
  rowDelta: number,
  colDelta: number,
  mark: 'R' | 'Y',
) {
  let count = 1
  let openEnds = 0

  for (const direction of [-1, 1]) {
    let nextRow = row + rowDelta * direction
    let nextCol = col + colDelta * direction

    while (
      inside(nextRow, nextCol, CONNECT4_ROWS, CONNECT4_COLS) &&
      board[indexAt(nextRow, nextCol, CONNECT4_COLS)] === mark
    ) {
      count += 1
      nextRow += rowDelta * direction
      nextCol += colDelta * direction
    }

    if (
      inside(nextRow, nextCol, CONNECT4_ROWS, CONNECT4_COLS) &&
      board[indexAt(nextRow, nextCol, CONNECT4_COLS)] === null
    ) {
      openEnds += 1
    }
  }

  return { count, openEnds }
}

function connect4Winner(
  board: Array<'R' | 'Y' | null>,
  index: number,
  mark: 'R' | 'Y',
) {
  const { row, col } = boardCell(index, CONNECT4_COLS)
  return CONNECT4_DIRECTIONS.some(([rowDelta, colDelta]) => {
    const { count } = countConnect4Line(board, row, col, rowDelta, colDelta, mark)
    return count >= 4
  })
}

function connect4PlacedBoard(
  board: Array<'R' | 'Y' | null>,
  index: number,
  mark: 'R' | 'Y',
) {
  const nextBoard = [...board]
  nextBoard[index] = mark
  return nextBoard
}

function connect4ImmediateWinningMoves(
  board: Array<'R' | 'Y' | null>,
  mark: 'R' | 'Y',
) {
  return connect4CandidateSet(board).filter((candidate) => {
    const nextBoard = connect4PlacedBoard(board, candidate, mark)
    return connect4Winner(nextBoard, candidate, mark)
  })
}

function connect4ForkSetupMoves(
  board: Array<'R' | 'Y' | null>,
  mark: 'R' | 'Y',
) {
  return connect4CandidateSet(board).filter((candidate) => {
    const nextBoard = connect4PlacedBoard(board, candidate, mark)
    if (connect4Winner(nextBoard, candidate, mark)) {
      return false
    }

    return connect4ImmediateWinningMoves(nextBoard, mark).length >= 2
  })
}

function connect4WindowsThroughIndex(index: number) {
  const { row, col } = boardCell(index, CONNECT4_COLS)
  const windows: number[][] = []

  for (const [rowDelta, colDelta] of CONNECT4_DIRECTIONS) {
    for (let offset = -3; offset <= 0; offset += 1) {
      const cells: number[] = []
      let valid = true

      for (let step = 0; step < 4; step += 1) {
        const nextRow = row + (offset + step) * rowDelta
        const nextCol = col + (offset + step) * colDelta

        if (!inside(nextRow, nextCol, CONNECT4_ROWS, CONNECT4_COLS)) {
          valid = false
          break
        }

        cells.push(indexAt(nextRow, nextCol, CONNECT4_COLS))
      }

      if (valid) {
        windows.push(cells)
      }
    }
  }

  return windows
}

function connect4WindowPressure(
  board: Array<'R' | 'Y' | null>,
  cells: number[],
  mark: 'R' | 'Y',
  opponent: 'R' | 'Y',
) {
  let own = 0
  let opp = 0
  let empty = 0

  cells.forEach((cell) => {
    const value = board[cell]

    if (value === mark) {
      own += 1
      return
    }

    if (value === opponent) {
      opp += 1
      return
    }

    empty += 1
  })

  if (own > 0 && opp > 0) {
    return { attack: 0, defence: 0 }
  }

  let attack = 0
  let defence = 0

  if (opp === 0) {
    if (own === 3 && empty === 1) {
      attack += 120
    } else if (own === 2 && empty === 2) {
      attack += 34
    } else if (own === 1 && empty === 3) {
      attack += 8
    }
  }

  if (own === 0) {
    if (opp === 3 && empty === 1) {
      defence += 112
    } else if (opp === 2 && empty === 2) {
      defence += 30
    } else if (opp === 1 && empty === 3) {
      defence += 7
    }
  }

  return { attack, defence }
}

interface Connect4ThreatContext {
  opponentImmediateWins: number[]
  opponentForkSetups: number[]
}

function scoreConnect4Move(
  board: Array<'R' | 'Y' | null>,
  index: number,
  mark: 'R' | 'Y',
  weights: number[],
  threatContext?: Connect4ThreatContext,
) {
  const opponent = mark === 'R' ? 'Y' : 'R'
  const { row, col } = boardCell(index, CONNECT4_COLS)
  const placedBoard = connect4PlacedBoard(board, index, mark)

  if (connect4Winner(placedBoard, index, mark)) {
    return { score: 100000, insight: 'connect four' }
  }

  const context = threatContext ?? {
    opponentImmediateWins: connect4ImmediateWinningMoves(board, opponent),
    opponentForkSetups: connect4ForkSetupMoves(board, opponent),
  }
  const opponentNextWins = connect4ImmediateWinningMoves(placedBoard, opponent)
  const ownNextWins = connect4ImmediateWinningMoves(placedBoard, mark)
  const opponentForksAfter = connect4ForkSetupMoves(placedBoard, opponent)
  const ownForksAfter = connect4ForkSetupMoves(placedBoard, mark)
  const blocksImmediateLoss = context.opponentImmediateWins.includes(index)
  const blocksForkSetup = context.opponentForkSetups.includes(index)

  let attack = 0
  let defence = 0

  connect4WindowsThroughIndex(index).forEach((window) => {
    const pressure = connect4WindowPressure(placedBoard, window, mark, opponent)
    attack += pressure.attack
    defence += pressure.defence
  })

  for (const [rowDelta, colDelta] of CONNECT4_DIRECTIONS) {
    const own = countConnect4Line(placedBoard, row, col, rowDelta, colDelta, mark)
    const opp = countConnect4Line(placedBoard, row, col, rowDelta, colDelta, opponent)
    attack += own.count * own.count * 16 + own.openEnds * 8
    defence += opp.count * opp.count * 14 + opp.openEnds * 7
  }

  const centerBias = (4 - Math.abs(col - 3)) * 18 + (col === 3 ? 10 : 0)
  const rackDepth = row * 4
  const support =
    row === CONNECT4_ROWS - 1 ||
    board[indexAt(row + 1, col, CONNECT4_COLS)] !== null
      ? 18
      : -40
  const verticalBuild =
    row < CONNECT4_ROWS - 1 &&
    board[indexAt(row + 1, col, CONNECT4_COLS)] === mark
      ? 24
      : 0
  const forcedBlockBonus = blocksImmediateLoss
    ? 2200 + context.opponentImmediateWins.length * 320
    : 0
  const forkLockBonus =
    ownNextWins.length >= 2
      ? 2600 + ownNextWins.length * 220
      : ownNextWins.length === 1
        ? 540
        : 0
  const ownForkBonus =
    ownNextWins.length < 2 && ownForksAfter.length > 0 ? ownForksAfter.length * 560 : 0
  const forkBlockBonus = blocksForkSetup
    ? 640 + context.opponentForkSetups.length * 120
    : 0
  const poisonedPenalty =
    opponentNextWins.length > 0 ? 3200 + opponentNextWins.length * 950 : 0
  const forkRiskPenalty = opponentForksAfter.length > 0 ? opponentForksAfter.length * 760 : 0
  const stabilityBonus =
    opponentNextWins.length === 0 && opponentForksAfter.length === 0 ? 120 : 0

  return {
    score:
      attack * weights[0] +
      defence * weights[1] +
      centerBias * weights[2] +
      support * weights[3] +
      verticalBuild * weights[4] +
      rackDepth * 0.8 +
      forcedBlockBonus +
      forkLockBonus +
      ownForkBonus +
      forkBlockBonus +
      stabilityBonus -
      poisonedPenalty -
      forkRiskPenalty +
      randomSpread(4),
    insight:
      poisonedPenalty > 0
        ? 'poisoned drop'
        : blocksImmediateLoss
          ? 'forced block'
          : ownNextWins.length >= 2
            ? 'fork lock'
            : ownForksAfter.length > 0
              ? 'ladder build'
              : blocksForkSetup
                ? 'deny fork'
                : col === 3
                  ? 'center pressure'
                  : attack >= defence
                    ? 'threat build'
                    : 'safety hold',
  }
}

function createConnect4Preview(profile: StrategyProfile): GridPreviewState {
  const board = Array<'R' | 'Y' | null>(CONNECT4_ROWS * CONNECT4_COLS).fill(null)
  return buildGridPreviewState(
    'connect4',
    board,
    CONNECT4_ROWS,
    CONNECT4_COLS,
    'R',
    'Y',
    'champion',
    [],
    null,
    [],
    'Ход чемпиона',
    'Открывающий ран',
    strategyProfileNarrative('connect4', profile),
  )
}

function connect4DecisionExploration(
  profile: StrategyProfile,
  actor: StrategyActor,
) {
  const ratingFactor = clamp(1.08 - profile.rating / 2200, 0.14, 1)
  const actorFactor = actor === 'champion' ? 0.58 : 0.86
  return clamp(profile.settings.exploration * ratingFactor * actorFactor, 0.01, 0.22)
}

function advanceConnect4Preview(
  preview: GridPreviewState,
  profile: StrategyProfile,
  options?: StrategyAdvanceOptions,
): GridPreviewState {
  const board = [...preview.raw.board] as Array<'R' | 'Y' | null>
  const mark = preview.raw.currentActor === 'champion' ? 'R' : 'Y'
  const weights = strategyWeightsForActor(
    profile,
    preview.raw.currentActor,
    (value, index) => value * (0.84 + index * 0.03),
    options,
  )
  const threatContext = {
    opponentImmediateWins: connect4ImmediateWinningMoves(board, mark === 'R' ? 'Y' : 'R'),
    opponentForkSetups: connect4ForkSetupMoves(board, mark === 'R' ? 'Y' : 'R'),
  }
  const candidates = connect4CandidateSet(board).map((index) => ({
    index,
    ...scoreConnect4Move(board, index, mark, weights, threatContext),
  }))

  if (candidates.length === 0) {
    return buildGridPreviewState(
      'connect4',
      board,
      CONNECT4_ROWS,
      CONNECT4_COLS,
      'R',
      'Y',
      'champion',
      [],
      'draw',
      ['draw · full rack', ...preview.feed].slice(0, 6),
      'Ничья',
      'Колонки закончились',
      'Обе стороны разменяли угрозы и упёрлись в полный столбчатый рисунок.',
    )
  }

  const selected = chooseBestMove(
    candidates,
    connect4DecisionExploration(profile, preview.raw.currentActor),
  )
  board[selected.index] = mark
  const hasWinner = connect4Winner(board, selected.index, mark)
  const winner = hasWinner ? (mark === 'R' ? 'champion' : 'sparring') : null
  const nextActor =
    winner || board.every(Boolean)
      ? preview.raw.currentActor
      : preview.raw.currentActor === 'champion'
        ? 'sparring'
        : 'champion'
  const { col } = boardCell(selected.index, CONNECT4_COLS)

  return buildGridPreviewState(
    'connect4',
    board,
    CONNECT4_ROWS,
    CONNECT4_COLS,
    'R',
    'Y',
    nextActor,
    [selected.index],
    winner ?? (board.every(Boolean) ? 'draw' : null),
    [`${mark} c${col + 1} · ${selected.insight}`, ...preview.feed].slice(0, 6),
    winner
      ? winner === 'champion'
        ? 'Чемпион закрыл четыре'
        : 'Спарринг закрыл четыре'
      : board.every(Boolean)
        ? 'Ничья'
        : nextActor === 'champion'
          ? 'Ход чемпиона'
          : 'Ход спарринга',
    winner
      ? winner === 'champion'
        ? 'Четыре в ряд у чемпиона'
        : 'Спарринг поймал окно'
      : board.every(Boolean)
        ? 'Ничья'
        : 'Партия продолжается',
    selected.insight,
  )
}

function createSeededChess(index: number) {
  const opening = CHESS_OPENINGS[index % CHESS_OPENINGS.length]
  const chess = new Chess()
  opening.moves.forEach((move) => {
    chess.move(move)
  })
  return { chess, openingName: opening.name }
}

function evaluateChessPosition(
  chess: Chess,
  perspective: 'w' | 'b',
  weights: number[],
) {
  const board = chess.board()
  const pieceValues: Record<string, number> = {
    p: 1,
    n: 3.2,
    b: 3.35,
    r: 5.1,
    q: 9.6,
    k: 0,
  }

  let material = 0
  let centre = 0
  let development = 0
  let kingSafety = 0
  let structure = 0
  let initiative = 0

  board.forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (!piece) {
        return
      }

      const sign = piece.color === perspective ? 1 : -1
      material += pieceValues[piece.type] * sign

      const centreDistance = Math.abs(3.5 - rowIndex) + Math.abs(3.5 - colIndex)
      centre += ((4 - centreDistance) / 4) * sign

      if (piece.type !== 'p' && piece.type !== 'k') {
        const homeRank = piece.color === 'w' ? 7 : 0
        if (rowIndex !== homeRank) {
          development += 0.7 * sign
        }
      }

      if (piece.type === 'k') {
        const castleFile = piece.color === 'w' ? rowIndex === 7 && (colIndex === 6 || colIndex === 2) : rowIndex === 0 && (colIndex === 6 || colIndex === 2)
        if (castleFile) {
          kingSafety += 1.8 * sign
        }
        if (colIndex >= 2 && colIndex <= 5) {
          kingSafety -= 0.6 * sign
        }
      }

      if (piece.type === 'p') {
        structure += ((piece.color === 'w' ? 6 - rowIndex : rowIndex - 1) / 6) * sign
      }

      initiative +=
        (piece.type === 'q' || piece.type === 'r' || piece.type === 'b' || piece.type === 'n'
          ? 0.35
          : piece.type === 'p'
            ? 0.1
            : 0) *
        sign
    })
  })

  return (
    material * weights[0] +
    centre * weights[1] * 0.8 +
    development * weights[2] * 0.6 +
    kingSafety * weights[3] * 0.8 +
    structure * weights[4] * 0.55 +
    initiative * weights[5] * 0.4
  )
}

function chessMoveInsight(move: {
  san: string
  captured?: string
  promotion?: string
  flags?: string
}) {
  if (move.san.includes('#')) {
    return 'mate net'
  }
  if (move.promotion) {
    return 'promotion route'
  }
  if (move.captured) {
    return 'material pickup'
  }
  if (move.flags?.includes('k') || move.flags?.includes('q')) {
    return 'king safety'
  }
  if (move.san.includes('+')) {
    return 'check pressure'
  }
  if (move.san.startsWith('N') || move.san.startsWith('B')) {
    return 'piece activity'
  }
  return 'space gain'
}

function chessMovePriority(move: {
  san: string
  captured?: string
  promotion?: string
  flags?: string
}) {
  let priority = 0

  if (move.san.includes('#')) {
    priority += 2000
  }
  if (move.promotion) {
    priority += 400
  }
  if (move.captured) {
    priority += 220
  }
  if (move.san.includes('+')) {
    priority += 120
  }
  if (move.flags?.includes('k') || move.flags?.includes('q')) {
    priority += 80
  }
  if (move.san.startsWith('N') || move.san.startsWith('B')) {
    priority += 20
  }

  return priority
}

function orderedChessMoves(chess: Chess) {
  return chess
    .moves({ verbose: true })
    .sort((left, right) => chessMovePriority(right) - chessMovePriority(left))
}

function chessTerminalScore(chess: Chess, perspective: 'w' | 'b', ply: number) {
  if (chess.isCheckmate()) {
    return chess.turn() === perspective ? -9000 + ply : 9000 - ply
  }

  if (chess.isDraw()) {
    return 0
  }

  return null
}

function searchChessPosition(
  chess: Chess,
  perspective: 'w' | 'b',
  weights: number[],
  depth: number,
  alpha: number,
  beta: number,
  ply = 0,
): number {
  const terminal = chessTerminalScore(chess, perspective, ply)
  if (terminal !== null) {
    return terminal
  }

  if (depth <= 0) {
    return evaluateChessPosition(chess, perspective, weights)
  }

  const maximizing = chess.turn() === perspective
  const moves = orderedChessMoves(chess)

  if (maximizing) {
    let best = Number.NEGATIVE_INFINITY

    for (const move of moves) {
      chess.move(move)
      const score = searchChessPosition(chess, perspective, weights, depth - 1, alpha, beta, ply + 1)
      chess.undo()
      best = Math.max(best, score)
      alpha = Math.max(alpha, score)
      if (alpha >= beta) {
        break
      }
    }

    return best
  }

  let best = Number.POSITIVE_INFINITY

  for (const move of moves) {
    chess.move(move)
    const score = searchChessPosition(chess, perspective, weights, depth - 1, alpha, beta, ply + 1)
    chess.undo()
    best = Math.min(best, score)
    beta = Math.min(beta, score)
    if (alpha >= beta) {
      break
    }
  }

  return best
}

function selectChessMove(
  chess: Chess,
  perspective: 'w' | 'b',
  weights: number[],
  exploration: number,
  searchDepth: number,
) {
  const moves = orderedChessMoves(chess)
  const ranked = moves.map((move) => {
    chess.move(move)
    const score =
      searchChessPosition(
        chess,
        perspective,
        weights,
        Math.max(0, searchDepth - 1),
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        1,
      ) +
      (chess.isCheckmate() ? 800 : 0) +
      (move.captured ? 28 : 0) +
      (move.promotion ? 70 : 0) +
      (move.san.includes('+') ? 18 : 0) +
      randomSpread(exploration * 16)
    chess.undo()
    return {
      move,
      score,
      insight: chessMoveInsight(move),
    }
  })

  ranked.sort((left, right) => right.score - left.score)
  return ranked[0]
}

function chessDecisionDepth(
  profile: StrategyProfile,
  actor: StrategyActor,
) {
  if (actor === 'champion' && (profile.rating >= 1550 || profile.history.length >= 14)) {
    return 2
  }

  if (profile.rating >= 2050 || profile.history.length >= 42) {
    return 2
  }

  return 1
}

function chessDecisionExploration(
  profile: StrategyProfile,
  actor: StrategyActor,
) {
  const ratingFactor = clamp(1.06 - profile.rating / 2600, 0.08, 1)
  const actorFactor = actor === 'champion' ? 0.44 : 0.72
  return clamp(profile.settings.exploration * ratingFactor * actorFactor, 0.01, 0.18)
}

function adjudicateChess(game: Chess, championColor: 'w' | 'b', weights: number[]) {
  const evalScore = evaluateChessPosition(game, championColor, weights)
  if (evalScore > 1.35) {
    return 'Чемпион дожал позицию'
  }
  if (evalScore < -1.35) {
    return 'Спарринг удержал перевес'
  }
  return 'Ничья по оценке'
}

function buildChessPreviewState(
  game: Chess,
  openingName: string,
  championColor: 'w' | 'b',
  lastMove: StrategyMatchMove | null,
  highlightSquares: string[],
  feed: string[],
  outcomeLabel: string,
  detail: string,
  forcedFinished = false,
): ChessPreviewState {
  const board = game.board()
  const cells: StrategyBoardCell[] = board.flatMap((row, rowIndex) =>
    row.map((piece, colIndex) => {
      const key = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`
      return {
        key,
        content: piece ? CHESS_GLYPHS[`${piece.color}${piece.type}`] : '',
        surface: (rowIndex + colIndex) % 2 === 0 ? 'light' : 'dark',
        owner:
          piece?.color === championColor
            ? 'champion'
            : piece
              ? 'sparring'
              : 'empty',
        highlight: highlightSquares.includes(key),
      }
    }),
  )

  return {
    gameId: 'chess',
    board: {
      rows: 8,
      cols: 8,
      dense: false,
      cells,
    },
    moveCount: game.history().length,
    turnLabel: forcedFinished || game.isGameOver()
      ? 'Партия завершена'
      : game.turn() === championColor
        ? 'Ход чемпиона'
        : 'Ход спарринга',
    status: forcedFinished || game.isGameOver() ? 'finished' : 'live',
    outcomeLabel,
    lastMove,
    feed,
    hint: `${openingName} · ${game.turn() === championColor ? 'champion to move' : 'sparring to move'}`,
    detail,
    raw: {
      fen: game.fen(),
      championColor,
      openingName,
      highlightSquares,
    },
  }
}

function createChessPreview(profile: StrategyProfile): ChessPreviewState {
  const { chess, openingName } = createSeededChess(profile.history.length)
  return buildChessPreviewState(
    chess,
    openingName,
    'w',
    null,
    [],
    [],
    'Открывающий ран',
    strategyProfileNarrative('chess', profile),
  )
}

function advanceChessPreview(
  preview: ChessPreviewState,
  profile: StrategyProfile,
  options?: StrategyAdvanceOptions,
): ChessPreviewState {
  const game = new Chess(preview.raw.fen)
  const actor: StrategyActor = game.turn() === preview.raw.championColor ? 'champion' : 'sparring'
  const weights = strategyWeightsForActor(
    profile,
    actor,
    (value, index) => value * (0.74 + index * 0.02),
    options,
  )
  const chosen = selectChessMove(
    game,
    actor === 'champion'
      ? preview.raw.championColor
      : preview.raw.championColor === 'w'
        ? 'b'
        : 'w',
    weights,
    chessDecisionExploration(profile, actor),
    chessDecisionDepth(profile, actor),
  )

  const applied = game.move(chosen.move)
  const lastMove: StrategyMatchMove = {
    actor,
    notation: applied.san,
    insight: chosen.insight,
    evaluation: chosen.score,
  }

  const highlightSquares = [applied.from, applied.to]
  const feed = [`${actor === 'champion' ? 'C' : 'S'} ${applied.san} · ${chosen.insight}`, ...preview.feed].slice(0, 6)

  if (!game.isGameOver() && game.history().length >= 52) {
    const adjudication = adjudicateChess(game, preview.raw.championColor, profile.weights)
    return buildChessPreviewState(
      game,
      preview.raw.openingName,
      preview.raw.championColor,
      lastMove,
      highlightSquares,
      feed,
      adjudication,
      chosen.insight,
      true,
    )
  }

  let outcomeLabel = 'Партия продолжается'
  if (game.isCheckmate()) {
    outcomeLabel = actor === 'champion' ? 'Чемпион поставил мат' : 'Спарринг поставил мат'
  } else if (game.isDraw()) {
    outcomeLabel = 'Ничья'
  }

  return buildChessPreviewState(
    game,
    preview.raw.openingName,
    preview.raw.championColor,
    lastMove,
    highlightSquares,
    feed,
    outcomeLabel,
    chosen.insight,
  )
}

export function createStrategyPreview(
  gameId: StrategyGameId,
  profile: StrategyProfile,
): StrategyPreviewState {
  switch (gameId) {
    case 'chess':
      return createChessPreview(profile)
    case 'tictactoe':
      return createTicTacToePreview(profile)
    case 'connect4':
      return createConnect4Preview(profile)
  }
}

export function strategyCurrentActor(
  preview: StrategyPreviewState,
): StrategyActor | null {
  if (preview.status === 'finished') {
    return null
  }

  switch (preview.gameId) {
    case 'chess': {
      const game = new Chess(preview.raw.fen)
      return game.turn() === preview.raw.championColor ? 'champion' : 'sparring'
    }
    case 'tictactoe':
    case 'connect4':
      return preview.raw.currentActor
  }
}

export function strategyPlayableKeys(
  preview: StrategyPreviewState,
  actor: StrategyActor,
  selectedKey?: string | null,
): string[] {
  if (strategyCurrentActor(preview) !== actor) {
    return []
  }

  switch (preview.gameId) {
    case 'tictactoe':
      return preview.raw.board
        .map((value, index) => (value === null ? `tictactoe-${index}` : null))
        .filter((value): value is string => value !== null)
    case 'connect4':
      return Array.from({ length: CONNECT4_COLS }, (_, col) =>
        playableConnect4Index(preview.raw.board as Array<'R' | 'Y' | null>, col),
      )
        .flatMap((index) => {
          if (index === null) {
            return []
          }

          const column = index % CONNECT4_COLS
          return Array.from({ length: CONNECT4_ROWS }, (_, row) => {
            const cellIndex = row * CONNECT4_COLS + column
            return `connect4-${cellIndex}`
          })
        })
    case 'chess': {
      const game = new Chess(preview.raw.fen)
      const actorColor =
        actor === 'champion'
          ? preview.raw.championColor
          : preview.raw.championColor === 'w'
            ? 'b'
            : 'w'
      const verboseMoves = game.moves({ verbose: true }) as Array<{
        from: string
        to: string
        color: 'w' | 'b'
      }>

      if (selectedKey) {
        return verboseMoves
          .filter((move) => move.color === actorColor && move.from === selectedKey)
          .map((move) => move.to)
      }

      return Array.from(
        new Set(
          verboseMoves
            .filter((move) => move.color === actorColor)
            .map((move) => move.from),
        ),
      )
    }
  }
}

export function applyStrategyInteractiveMove(
  preview: StrategyPreviewState,
  actor: StrategyActor,
  cellKey: string,
  selectedKey?: string | null,
): StrategyPreviewState | null {
  if (strategyCurrentActor(preview) !== actor) {
    return null
  }

  if (preview.gameId === 'tictactoe') {
    const board = [...preview.raw.board] as Array<'X' | 'O' | null>
    const index = gridIndexFromKey('tictactoe', cellKey)
    if (index === null || board[index] !== null) {
      return null
    }

    const mark: 'X' | 'O' = actor === 'champion' ? 'X' : 'O'
    board[index] = mark
    const winner = ticTacToeWinner(board)
    const finished = Boolean(winner) || board.every(Boolean)
    const winnerActor = winner === 'X' ? 'champion' : winner === 'O' ? 'sparring' : null
    const turnLabel = finished
      ? 'Run finished'
      : oppositeActor(actor) === 'champion'
        ? 'Champion turn'
        : 'Your turn'
    const outcomeLabel = finished
      ? winnerActor
        ? `${winnerActor === 'champion' ? 'Champion' : 'Human'} won`
        : 'Draw'
      : 'Game continues'

    return buildGridPreviewState(
      'tictactoe',
      board,
      preview.raw.rows,
      preview.raw.cols,
      preview.raw.championMark,
      preview.raw.sparringMark,
      finished ? actor : oppositeActor(actor),
      [index],
      winnerActor ?? (board.every(Boolean) ? 'draw' : null),
      [`H @${index + 1} · manual move`, ...preview.feed].slice(0, 6),
      turnLabel,
      outcomeLabel,
      finished
        ? winnerActor
          ? `${winnerActor === 'champion' ? 'Champion' : 'Human'} converted the tactic`
          : 'Resolved board'
        : 'Manual placement locked the lane',
    )
  }

  if (preview.gameId === 'connect4') {
    const board = [...preview.raw.board] as Array<'R' | 'Y' | null>
    const index = gridIndexFromKey('connect4', cellKey)
    if (index === null) {
      return null
    }

    const { col } = boardCell(index, CONNECT4_COLS)
    const targetIndex = playableConnect4Index(board, col)
    if (targetIndex === null) {
      return null
    }

    const mark: 'R' | 'Y' = actor === 'champion' ? 'R' : 'Y'
    board[targetIndex] = mark
    const winner = connect4Winner(board, targetIndex, mark) ? actor : null
    const finished = winner !== null || board.every(Boolean)
    const turnLabel = finished
      ? 'Run finished'
      : oppositeActor(actor) === 'champion'
        ? 'Champion turn'
        : 'Your turn'
    const outcomeLabel = finished
      ? winner
        ? `${winner === 'champion' ? 'Champion' : 'Human'} won`
        : 'Draw'
      : 'Game continues'

    return buildGridPreviewState(
      'connect4',
      board,
      preview.raw.rows,
      preview.raw.cols,
      preview.raw.championMark,
      preview.raw.sparringMark,
      finished ? actor : oppositeActor(actor),
      [targetIndex],
      winner ?? (board.every(Boolean) ? 'draw' : null),
      [`H c${col + 1} · manual drop`, ...preview.feed].slice(0, 6),
      turnLabel,
      outcomeLabel,
      finished
        ? winner
          ? `${winner === 'champion' ? 'Champion' : 'Human'} converted the column`
          : 'Full rack'
        : 'Manual drop changed the threat map',
    )
  }

  if (preview.gameId !== 'chess') {
    return null
  }

  const chessPreview = preview
  const from = selectedKey ?? ''
  if (!from || from === cellKey) {
    return null
  }

  const game = new Chess(chessPreview.raw.fen)
  const actorColor =
    actor === 'champion'
      ? chessPreview.raw.championColor
      : chessPreview.raw.championColor === 'w'
        ? 'b'
        : 'w'

  const legalMoves = game.moves({ verbose: true }) as Array<{
    from: string
    to: string
    color: 'w' | 'b'
  }>
  const isLegal = legalMoves.some(
    (move) => move.color === actorColor && move.from === from && move.to === cellKey,
  )

  if (!isLegal) {
    return null
  }

  const applied = game.move({ from, to: cellKey, promotion: 'q' })
  if (!applied) {
    return null
  }

  const lastMove: StrategyMatchMove = {
    actor,
    notation: applied.san,
    insight: 'manual move',
    evaluation: 0,
  }
  const highlightSquares = [applied.from, applied.to]
  const feed = [`H ${applied.san} · manual move`, ...preview.feed].slice(0, 6)

  if (!game.isGameOver() && game.history().length >= 52) {
    const adjudication = adjudicateChess(
      game,
      chessPreview.raw.championColor,
      STRATEGY_GAME_DEFINITIONS.chess.targetWeights,
    )
    return buildChessPreviewState(
      game,
      chessPreview.raw.openingName,
      chessPreview.raw.championColor,
      lastMove,
      highlightSquares,
      feed,
      adjudication,
      'manual move',
      true,
    )
  }

  let outcomeLabel = 'Game continues'
  if (game.isCheckmate()) {
    outcomeLabel = actor === 'champion' ? 'Champion delivered mate' : 'Human delivered mate'
  } else if (game.isDraw()) {
    outcomeLabel = 'Draw'
  }

  return buildChessPreviewState(
    game,
    chessPreview.raw.openingName,
    chessPreview.raw.championColor,
    lastMove,
    highlightSquares,
    feed,
    outcomeLabel,
    'manual move',
  )
}
export function advanceStrategyPreview(
  preview: StrategyPreviewState,
  profile: StrategyProfile,
  options?: StrategyAdvanceOptions,
): StrategyPreviewState {
  if (preview.status === 'finished') {
    return preview
  }

  switch (preview.gameId) {
    case 'chess':
      return advanceChessPreview(preview, profile, options)
    case 'tictactoe':
      return advanceTicTacToePreview(preview, profile, options)
    case 'connect4':
      return advanceConnect4Preview(preview, profile, options)
  }
}

export function strategyChartSeries(profile: StrategyProfile) {
  return [
    {
      label: 'rating',
      color: '#d6a064',
      values: profile.history.map((item) => item.rating),
    },
    {
      label: 'win rate',
      color: '#77b5c6',
      values: profile.history.map((item) => item.winRate * 100),
    },
    {
      label: 'confidence',
      color: '#8bb378',
      values: profile.history.map((item) => item.confidence * 100),
    },
  ]
}

export function strategyChartGroups(profile: StrategyProfile) {
  return [
    {
      title: 'Strength curve',
      note: 'Absolute rating on its own scale.',
      series: [
        {
          label: 'rating',
          color: '#d6a064',
          values: profile.history.map((item) => item.rating),
        },
      ],
    },
    {
      title: 'Quality curve',
      note: 'Percent-scale metrics that should share one axis.',
      series: [
        {
          label: 'win rate',
          color: '#77b5c6',
          values: profile.history.map((item) => item.winRate * 100),
        },
        {
          label: 'confidence',
          color: '#8bb378',
          values: profile.history.map((item) => item.confidence * 100),
        },
        {
          label: 'error rate',
          color: '#d7837f',
          values: profile.history.map((item) => item.errorRate * 100),
        },
      ],
    },
    {
      title: 'Style balance',
      note: 'How the profile distributes attack, planning, and resilience.',
      series: [
        {
          label: 'attack',
          color: '#d7837f',
          values: profile.history.map((item) => item.attackScore * 100),
        },
        {
          label: 'planning',
          color: '#78abc9',
          values: profile.history.map((item) => item.planningScore * 100),
        },
        {
          label: 'resilience',
          color: '#8bb378',
          values: profile.history.map((item) => item.resilienceScore * 100),
        },
      ],
    },
  ]
}

export function strategyFocusValues(summary: StrategyGenerationSummary) {
  return [summary.attackScore, summary.planningScore, summary.resilienceScore]
}

export function strategyRecord(summary: StrategyGenerationSummary) {
  return `${formatPercent(summary.winRate)} / ${formatPercent(summary.drawRate)} / ${formatPercent(summary.lossRate)}`
}

export function strategyTier(gameId: StrategyGameId, rating: number) {
  if (gameId === 'tictactoe') {
    if (rating >= 1080) {
      return 'perfect shell'
    }
    if (rating >= 900) {
      return 'solved shell'
    }
    if (rating >= 720) {
      return 'draw-safe core'
    }
    return 'learning'
  }

  if (gameId === 'chess') {
    if (rating >= 2200) {
      return 'engine pressure'
    }
    if (rating >= 1900) {
      return 'elite sparring'
    }
    if (rating >= 1500) {
      return 'ranked sparring'
    }
    return 'bootstrap pool'
  }

  if (gameId === 'connect4') {
    if (rating >= 1900) {
      return 'solver pressure'
    }
    if (rating >= 1650) {
      return 'threat engine'
    }
    if (rating >= 1320) {
      return 'ranked sparring'
    }
    return 'bootstrap pool'
  }

  if (rating >= 1750) {
    return 'elite sparring'
  }
  if (rating >= 1320) {
    return 'ranked sparring'
  }
  return 'bootstrap pool'
}

export function strategyFeedLabel(preview: StrategyPreviewState) {
  if (preview.lastMove) {
    return `${preview.lastMove.notation} · ${preview.lastMove.insight}`
  }
  return preview.detail
}

export function strategyBoardAccent(preview: StrategyPreviewState) {
  switch (preview.gameId) {
    case 'chess':
      return preview.raw.openingName
    case 'tictactoe':
      return 'solved tree'
    case 'connect4':
      return 'gravity columns'
  }
}
