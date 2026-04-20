import type { BoardConfig, NeuralNetwork, ReplayFrame, ReplayResult } from '../types'
import { applyMove, chooseMove } from './evolution'
import { countCorrectFlags, countWrongFlags, createGame, snapshotBoard } from './minesweeper'

export function replayGenome(
  network: NeuralNetwork,
  board: BoardConfig,
  seed: number,
  maxSteps: number,
): ReplayResult {
  const game = createGame(board, seed)
  const frames: ReplayFrame[] = [
    {
      board: snapshotBoard(game),
      move: null,
      status: game.status,
      flagsUsed: game.flagsUsed,
      revealedSafe: game.revealedSafe,
      minesRemaining: board.mines - game.flagsUsed,
    },
  ]

  while ((game.status === 'ready' || game.status === 'playing') && frames.length <= maxSteps) {
    const decision = chooseMove(network, game)
    if (!decision) {
      break
    }

    applyMove(game, decision)
    frames.push({
      board: snapshotBoard(game),
      move: decision,
      status: game.status,
      flagsUsed: game.flagsUsed,
      revealedSafe: game.revealedSafe,
      minesRemaining: board.mines - game.flagsUsed,
    })
  }

  const revealMoves = frames.filter((frame) => frame.move?.action === 'reveal').length
  const flagMoves = frames.filter((frame) => frame.move?.action === 'flag').length
  const wrongFlags = countWrongFlags(game)
  const correctFlags = countCorrectFlags(game)

  return {
    frames,
    finalStatus: game.status,
    moveCount: game.moveCount,
    win: game.status === 'won',
    accuracyReveal: revealMoves > 0 ? Math.max(0, revealMoves - (game.status === 'lost' ? 1 : 0)) / revealMoves : 1,
    accuracyFlag: flagMoves > 0 ? correctFlags / Math.max(1, correctFlags + wrongFlags) : 1,
    clearedRatio: game.revealedSafe / Math.max(1, game.totalSafe),
  }
}
