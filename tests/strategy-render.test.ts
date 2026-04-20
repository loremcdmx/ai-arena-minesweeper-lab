import { describe, expect, it } from 'vitest'

import {
  advanceStrategyPreview,
  createStrategyPreview,
  createStrategyProfile,
} from '../src/lib/strategyLab'

const MOJIBAKE_MARKERS = /[\u00c2\u00c3\u00e2]/

describe('strategy board rendering data', () => {
  it('uses stable Unicode chess glyphs instead of mojibake fragments', () => {
    const profile = createStrategyProfile('chess', 0)
    const preview = createStrategyPreview('chess', profile)
    const pieces = preview.board.cells.map((cell) => cell.content).filter(Boolean)

    expect(pieces.join('')).not.toMatch(MOJIBAKE_MARKERS)
    expect(pieces).toEqual(expect.arrayContaining(['\u2654', '\u2655', '\u265a', '\u265b']))
    expect(pieces.every((piece) => [...piece].length === 1)).toBe(true)
  })

  it('uses single-symbol marks for tic-tac-toe and connect4 pieces', () => {
    const ticTacToeProfile = createStrategyProfile('tictactoe', 0)
    const connect4Profile = createStrategyProfile('connect4', 0)
    let ticTacToePreview = createStrategyPreview('tictactoe', ticTacToeProfile)
    let connect4Preview = createStrategyPreview('connect4', connect4Profile)

    ticTacToePreview = advanceStrategyPreview(ticTacToePreview, ticTacToeProfile, {
      poweredActor: 'both',
    })
    ticTacToePreview = advanceStrategyPreview(ticTacToePreview, ticTacToeProfile, {
      poweredActor: 'both',
    })
    connect4Preview = advanceStrategyPreview(connect4Preview, connect4Profile, {
      poweredActor: 'both',
    })

    const marks = [
      ...ticTacToePreview.board.cells.map((cell) => cell.content),
      ...connect4Preview.board.cells.map((cell) => cell.content),
    ].filter(Boolean)

    expect(marks.join('')).not.toMatch(MOJIBAKE_MARKERS)
    expect(marks).toEqual(expect.arrayContaining(['\u00d7', '\u25cb', '\u25cf']))
    expect(marks.every((mark) => [...mark].length === 1)).toBe(true)
  })
})
