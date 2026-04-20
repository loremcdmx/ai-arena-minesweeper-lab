import type {
  BoardConfig,
  BoardSnapshotCell,
  CellState,
  GameSession,
  Point,
} from '../types'
import { createRandom, randomSeed } from './random'

const NEIGHBOR_OFFSETS = [-1, 0, 1]

function makeCell(): CellState {
  return {
    mine: false,
    revealed: false,
    flagged: false,
    adjacent: 0,
    exploded: false,
  }
}

export function createBoardConfig(
  rows: number,
  cols: number,
  mines: number,
  label: string,
): BoardConfig {
  return { rows, cols, mines, label }
}

export function createGame(config: BoardConfig, seed = randomSeed()): GameSession {
  const board = Array.from({ length: config.rows }, () =>
    Array.from({ length: config.cols }, makeCell),
  )

  return {
    config,
    board,
    generated: false,
    status: 'ready',
    flagsUsed: 0,
    revealedSafe: 0,
    totalSafe: config.rows * config.cols - config.mines,
    safeSeed: seed,
    moveCount: 0,
    startedAt: null,
    finishedAt: null,
    explodedAt: null,
  }
}

export function cloneGame(game: GameSession): GameSession {
  return {
    ...game,
    board: game.board.map((row) => row.map((cell) => ({ ...cell }))),
    config: { ...game.config },
    explodedAt: game.explodedAt ? { ...game.explodedAt } : null,
  }
}

export function inBounds(config: BoardConfig, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < config.rows && col < config.cols
}

export function forEachNeighbor(
  config: BoardConfig,
  row: number,
  col: number,
  callback: (nextRow: number, nextCol: number) => void,
): void {
  for (const rowOffset of NEIGHBOR_OFFSETS) {
    for (const colOffset of NEIGHBOR_OFFSETS) {
      if (rowOffset === 0 && colOffset === 0) {
        continue
      }

      const nextRow = row + rowOffset
      const nextCol = col + colOffset

      if (inBounds(config, nextRow, nextCol)) {
        callback(nextRow, nextCol)
      }
    }
  }
}

function countAdjacentMines(board: CellState[][], config: BoardConfig, row: number, col: number) {
  let count = 0
  forEachNeighbor(config, row, col, (nextRow, nextCol) => {
    if (board[nextRow][nextCol].mine) {
      count += 1
    }
  })
  return count
}

function placeMines(game: GameSession, safeRow: number, safeCol: number) {
  const random = createRandom(game.safeSeed)
  const candidates: Point[] = []

  for (let row = 0; row < game.config.rows; row += 1) {
    for (let col = 0; col < game.config.cols; col += 1) {
      if (row === safeRow && col === safeCol) {
        continue
      }
      candidates.push({ row, col })
    }
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(index + 1)
    ;[candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]]
  }

  for (let index = 0; index < game.config.mines; index += 1) {
    const point = candidates[index]
    game.board[point.row][point.col].mine = true
  }

  for (let row = 0; row < game.config.rows; row += 1) {
    for (let col = 0; col < game.config.cols; col += 1) {
      const cell = game.board[row][col]
      cell.adjacent = cell.mine ? 0 : countAdjacentMines(game.board, game.config, row, col)
    }
  }

  game.generated = true
}

function revealFlood(game: GameSession, startRow: number, startCol: number) {
  const queue: Point[] = [{ row: startRow, col: startCol }]

  while (queue.length > 0) {
    const point = queue.shift()!
    const cell = game.board[point.row][point.col]

    if (cell.revealed || cell.flagged) {
      continue
    }

    cell.revealed = true

    if (!cell.mine) {
      game.revealedSafe += 1
    }

    if (cell.adjacent !== 0) {
      continue
    }

    forEachNeighbor(game.config, point.row, point.col, (nextRow, nextCol) => {
      const neighbor = game.board[nextRow][nextCol]
      if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) {
        queue.push({ row: nextRow, col: nextCol })
      }
    })
  }
}

function maybeFinishWin(game: GameSession) {
  if (game.revealedSafe === game.totalSafe) {
    game.status = 'won'
    game.finishedAt = Date.now()
  }
}

export function revealCell(game: GameSession, row: number, col: number): boolean {
  if (!inBounds(game.config, row, col) || game.status === 'won' || game.status === 'lost') {
    return false
  }

  const cell = game.board[row][col]
  if (cell.revealed || cell.flagged) {
    return false
  }

  if (!game.generated) {
    placeMines(game, row, col)
    game.status = 'playing'
    game.startedAt = Date.now()
  }

  game.moveCount += 1

  if (cell.mine) {
    cell.revealed = true
    cell.exploded = true
    game.status = 'lost'
    game.finishedAt = Date.now()
    game.explodedAt = { row, col }
    return true
  }

  revealFlood(game, row, col)
  maybeFinishWin(game)
  return true
}

export function toggleFlag(game: GameSession, row: number, col: number): boolean {
  if (!inBounds(game.config, row, col) || game.status === 'won' || game.status === 'lost') {
    return false
  }

  const cell = game.board[row][col]
  if (cell.revealed) {
    return false
  }

  if (!cell.flagged && game.flagsUsed >= game.config.mines) {
    return false
  }

  cell.flagged = !cell.flagged
  game.flagsUsed += cell.flagged ? 1 : -1

  if (!game.generated && game.startedAt === null) {
    game.status = 'ready'
  }

  return true
}

export function chordCell(game: GameSession, row: number, col: number): boolean {
  if (!inBounds(game.config, row, col) || game.status === 'won' || game.status === 'lost') {
    return false
  }

  const cell = game.board[row][col]
  if (!cell.revealed || cell.adjacent === 0) {
    return false
  }

  let flagCount = 0
  const targets: Point[] = []

  forEachNeighbor(game.config, row, col, (nextRow, nextCol) => {
    const neighbor = game.board[nextRow][nextCol]
    if (neighbor.flagged) {
      flagCount += 1
    } else if (!neighbor.revealed) {
      targets.push({ row: nextRow, col: nextCol })
    }
  })

  if (flagCount !== cell.adjacent) {
    return false
  }

  let changed = false
  for (const point of targets) {
    changed = revealCell(game, point.row, point.col) || changed
  }

  return changed
}

export function getElapsedSeconds(game: GameSession): number {
  if (game.startedAt === null) {
    return 0
  }

  const end = game.finishedAt ?? Date.now()
  return Math.max(0, Math.floor((end - game.startedAt) / 1000))
}

export function countHiddenCells(game: GameSession): number {
  let hidden = 0
  for (const row of game.board) {
    for (const cell of row) {
      if (!cell.revealed) {
        hidden += 1
      }
    }
  }
  return hidden
}

export function countCorrectFlags(game: GameSession): number {
  let count = 0
  for (const row of game.board) {
    for (const cell of row) {
      if (cell.flagged && cell.mine) {
        count += 1
      }
    }
  }
  return count
}

export function countWrongFlags(game: GameSession): number {
  let count = 0
  for (const row of game.board) {
    for (const cell of row) {
      if (cell.flagged && !cell.mine) {
        count += 1
      }
    }
  }
  return count
}

export function snapshotBoard(game: GameSession): BoardSnapshotCell[][] {
  const revealAll = game.status === 'lost' || game.status === 'won'

  return game.board.map((row) =>
    row.map((cell) => ({
      revealed: cell.revealed,
      flagged: cell.flagged,
      adjacent: cell.adjacent,
      mine: revealAll ? cell.mine : false,
      exploded: cell.exploded,
      wrongFlag: revealAll ? cell.flagged && !cell.mine : false,
    })),
  )
}

export function countNeighborState(
  game: GameSession,
  row: number,
  col: number,
  predicate: (cell: CellState) => boolean,
): number {
  let count = 0
  forEachNeighbor(game.config, row, col, (nextRow, nextCol) => {
    if (predicate(game.board[nextRow][nextCol])) {
      count += 1
    }
  })
  return count
}

export function getFrontierCells(game: GameSession): Point[] {
  const frontier: Point[] = []
  for (let row = 0; row < game.config.rows; row += 1) {
    for (let col = 0; col < game.config.cols; col += 1) {
      const cell = game.board[row][col]
      if (cell.revealed || cell.flagged) {
        continue
      }

      let isFrontier = false
      forEachNeighbor(game.config, row, col, (nextRow, nextCol) => {
        if (game.board[nextRow][nextCol].revealed) {
          isFrontier = true
        }
      })

      if (isFrontier) {
        frontier.push({ row, col })
      }
    }
  }

  return frontier
}
