import type { DifficultyPreset } from '../types'
import { STRATEGY_GAME_DEFINITIONS, type StrategyGameId } from './strategyLab'

export type ArenaExperienceId = 'minesweeper' | StrategyGameId

export const EXPERIENCE_CARDS: Array<{
  id: ArenaExperienceId
  eyebrow: string
  title: string
  description: string
  board: string
  theory: string
}> = [
  {
    id: 'minesweeper',
    eyebrow: 'Signal',
    title: 'Minesweeper',
    description:
      'Hidden-information training lab with live runs, frozen archive snapshots, and generation tracking on the same board.',
    board: '9x9 to 16x30',
    theory: 'Theory: hidden information, exact ceiling unknown',
  },
  {
    id: 'chess',
    eyebrow: 'Engine',
    title: STRATEGY_GAME_DEFINITIONS.chess.shortTitle,
    description:
      'Open-information strategy lab where material, tempo, king safety, and pressure stay readable while the policy improves.',
    board: STRATEGY_GAME_DEFINITIONS.chess.boardLabel,
    theory: 'Theory: not solved',
  },
  {
    id: 'tictactoe',
    eyebrow: 'Solved',
    title: STRATEGY_GAME_DEFINITIONS.tictactoe.shortTitle,
    description:
      'Compact solved arena where forks, blocks, and perfect defence are easy to inspect move by move.',
    board: STRATEGY_GAME_DEFINITIONS.tictactoe.boardLabel,
    theory: 'Theory: solved draw',
  },
  {
    id: 'connect4',
    eyebrow: 'Solved',
    title: STRATEGY_GAME_DEFINITIONS.connect4.shortTitle,
    description:
      'Gravity-driven trainer where center control, vertical threats, blocks, and double attacks stay easy to read live.',
    board: STRATEGY_GAME_DEFINITIONS.connect4.boardLabel,
    theory: 'Theory: first-player win',
  },
]

export const ROADMAP_ITEMS = [
  {
    status: 'Planned',
    title: 'Playable ELO ladder bots',
    description:
      'Preset opponents by rating band so you can play directly against weaker and stronger bots instead of only watching training.',
  },
  {
    status: 'Planned',
    title: 'Solved boardgame presets',
    description:
      'A catalog of already-modeled games with rules, simulators, bots, and an immediate theory badge: solved, unsolved, or hidden-information.',
  },
  {
    status: 'Research',
    title: 'Game-by-name solver',
    description:
      'Input a boardgame name, verify the rules, build a simulator, search the position, and explain the strongest move with counterplay.',
  },
  {
    status: 'Research',
    title: 'Strategic game corpus',
    description:
      'Build a database of the most popular strategy boardgames and card games, ranked by popularity, solvability, branching factor, hidden information, and simulator difficulty.',
  },
  {
    status: 'Planned',
    title: 'Split growth charts by scale',
    description:
      'Separate ELO, confidence, win rate, and other training signals into multiple charts with sane axes so growth remains readable instead of flattening mixed-scale metrics into one plot.',
  },
  {
    status: 'Planned',
    title: 'Best-move coach mode',
    description:
      'A helper mode that ranks candidate moves for a human player and says when the game already has a known theoretical ceiling.',
  },
  {
    status: 'Research',
    title: 'Search-guided policy layer',
    description:
      'Add a shallow MCTS or PUCT layer over the current neural move scorer so the bot learns from candidate visits, best lines, and counterplay instead of one-ply scores only.',
  },
  {
    status: 'Planned',
    title: 'Incremental board evaluator',
    description:
      'Cache feature deltas after each move so chess and gravity games update evaluations like an NNUE-style engine instead of recomputing the whole board every turn.',
  },
  {
    status: 'Planned',
    title: 'Exact Minesweeper frontier',
    description:
      'Split the hidden boundary into constraint components, calculate exact mine probabilities, and feed that probability map back into the policy as a stronger tactical teacher.',
  },
  {
    status: 'Research',
    title: 'Analysis API overlays',
    description:
      'Expose each position as raw policy, principal variation, visit counts, and board-pressure layers so every arena can explain why the next move was preferred.',
  },
] as const

export const PROFILE_SPECIES = [
  'Falcon',
  'Quartz',
  'Vector',
  'Radian',
  'Tensor',
  'Striker',
  'Frontier',
  'Sapphire',
]

export const PROFILE_NAMES = [
  'Nova',
  'Signal',
  'Spark',
  'Sigma',
  'Turbo',
  'Cascade',
  'Iris',
  'Staccato',
]

export const ARENA_GROWTH_MILESTONES = {
  intermediate: 6,
  expert: 18,
} as const

export const PRESET_GROWTH_ORDER: Array<Exclude<DifficultyPreset, 'custom'>> = [
  'beginner',
  'intermediate',
  'expert',
]
