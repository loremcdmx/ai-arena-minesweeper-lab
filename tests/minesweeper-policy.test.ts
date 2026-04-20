import { describe, expect, it } from 'vitest'

import { chooseMove } from '../src/lib/evolution'
import { createBoardConfig, createGame, forEachNeighbor } from '../src/lib/minesweeper'
import { INPUT_FEATURES, createNetwork } from '../src/lib/neural'
import { createRandom } from '../src/lib/random'
import type { GameSession } from '../src/types'

const testNetwork = createNetwork([INPUT_FEATURES, 8, 2], createRandom(7))

function parsePoint(point: string) {
  const [row, col] = point.split(':').map((value) => Number.parseInt(value, 10))
  return { row, col }
}

function pointKey(row: number, col: number) {
  return `${row}:${col}`
}

function buildGameState(options: {
  rows: number
  cols: number
  mines: string[]
  revealed: string[]
  flagged?: string[]
}): GameSession {
  const config = createBoardConfig(
    options.rows,
    options.cols,
    options.mines.length,
    `${options.rows}x${options.cols}`,
  )
  const game = createGame(config, 1)
  const flagged = options.flagged ?? []
  const mineSet = new Set(options.mines)
  const revealedSet = new Set(options.revealed)
  const flaggedSet = new Set(flagged)

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      game.board[row][col].mine = mineSet.has(pointKey(row, col))
    }
  }

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      const cell = game.board[row][col]
      if (cell.mine) {
        cell.adjacent = 0
        continue
      }

      let adjacent = 0
      forEachNeighbor(config, row, col, (nextRow, nextCol) => {
        if (game.board[nextRow][nextCol].mine) {
          adjacent += 1
        }
      })
      cell.adjacent = adjacent
    }
  }

  for (const point of revealedSet) {
    const { row, col } = parsePoint(point)
    game.board[row][col].revealed = true
  }

  for (const point of flaggedSet) {
    const { row, col } = parsePoint(point)
    game.board[row][col].flagged = true
  }

  game.generated = true
  game.status = 'playing'
  game.flagsUsed = flaggedSet.size
  game.revealedSafe = [...revealedSet].filter((point) => !mineSet.has(point)).length
  game.totalSafe = config.rows * config.cols - mineSet.size
  game.moveCount = Math.max(1, revealedSet.size + flaggedSet.size)
  game.startedAt = Date.now()

  return game
}

describe('minesweeper policy', () => {
  it('reveals a guaranteed safe cell when a clue is already fully satisfied by flags', () => {
    const game = buildGameState({
      rows: 3,
      cols: 3,
      mines: ['0:0'],
      revealed: ['0:1'],
      flagged: ['0:0'],
    })

    const move = chooseMove(testNetwork, game)

    expect(move).not.toBeNull()
    expect(move?.action).toBe('reveal')
    expect(['0:2', '1:0', '1:1', '1:2']).toContain(pointKey(move!.row, move!.col))
  })

  it('uses subset inference to reveal the extra cell when two clues share the same mine count', () => {
    const game = buildGameState({
      rows: 3,
      cols: 3,
      mines: ['0:0'],
      revealed: ['0:1', '1:1', '0:2', '1:2', '2:1', '2:2'],
    })

    const move = chooseMove(testNetwork, game)

    expect(move).not.toBeNull()
    expect(move?.action).toBe('reveal')
    expect(pointKey(move!.row, move!.col)).toBe('2:0')
  })

  it('uses subset inference to flag the extra cell when the larger clue needs one more mine', () => {
    const game = buildGameState({
      rows: 3,
      cols: 3,
      mines: ['0:0', '2:0'],
      revealed: ['0:1', '1:1', '0:2', '1:2', '2:1', '2:2'],
    })

    const move = chooseMove(testNetwork, game)

    expect(move).not.toBeNull()
    expect(move?.action).toBe('flag')
    expect(pointKey(move!.row, move!.col)).toBe('2:0')
  })
})
