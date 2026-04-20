import type { StrategyGameId } from './strategyLab'

export type ArenaReferenceGameId = 'minesweeper' | StrategyGameId

export interface ReferenceAnchorSource {
  id: string
  game: ArenaReferenceGameId
  label: string
  type: 'engine' | 'solver' | 'baseline'
  sourceLabel: string
  sourceUrl?: string
  note: string
}

const REFERENCE_SOURCES: ReferenceAnchorSource[] = [
  {
    id: 'stockfish',
    game: 'chess',
    label: 'Stockfish Reference Ladder',
    type: 'engine',
    sourceLabel: 'official-stockfish/Stockfish',
    sourceUrl: 'https://github.com/official-stockfish/Stockfish',
    note: 'Open-source chess engine used as an external ELO anchor only.',
  },
  {
    id: 'perfect-ttt',
    game: 'tictactoe',
    label: 'Perfect Solver Baseline',
    type: 'solver',
    sourceLabel: 'Local exact solver',
    note: 'Perfect-play reference used to anchor draws, forks, and tactical losses.',
  },
  {
    id: 'connect4-solver',
    game: 'connect4',
    label: 'Connect4 Perfect Solver',
    type: 'solver',
    sourceLabel: 'lhorrell99/connect-4-solver',
    sourceUrl: 'https://github.com/lhorrell99/connect-4-solver',
    note: 'Open-source perfect-play Connect4 solver used as an external ELO anchor.',
  },
  {
    id: 'js-minesweeper',
    game: 'minesweeper',
    label: 'JSMinesweeper Solver',
    type: 'solver',
    sourceLabel: 'DavidNHill/JSMinesweeper',
    sourceUrl: 'https://github.com/DavidNHill/JSMinesweeper',
    note: 'Constraint-driven solver benchmark for stable board reading.',
  },
  {
    id: 'sat-minesweeper',
    game: 'minesweeper',
    label: 'SAT Minesweeper Agent',
    type: 'solver',
    sourceLabel: 'kkew3/sat-minesweeper',
    sourceUrl: 'https://github.com/kkew3/sat-minesweeper',
    note: 'SAT-style logical anchor for exact frontier reasoning.',
  },
  {
    id: 'prob-minesweeper',
    game: 'minesweeper',
    label: 'Probabilistic Solver',
    type: 'solver',
    sourceLabel: 'JohnnyDeuss/minesweeper-solver',
    sourceUrl: 'https://github.com/JohnnyDeuss/minesweeper-solver',
    note: 'Probability-based benchmark for late-game ambiguity and risk balance.',
  },
]

export function referenceSource(referenceId: string) {
  return REFERENCE_SOURCES.find((source) => source.id === referenceId) ?? null
}

export function referenceCatalog(game: ArenaReferenceGameId) {
  return REFERENCE_SOURCES.filter((source) => source.game === game)
}

export function referenceViewItems(game: ArenaReferenceGameId) {
  return referenceCatalog(game).map((source) => ({
    id: source.id,
    label: `${source.label} · ${source.type.toUpperCase()}`,
    subtitle: source.sourceUrl
      ? `${source.note} · ${source.sourceLabel}`
      : source.note,
  }))
}
