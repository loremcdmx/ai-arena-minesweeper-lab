import { useEffect, useState } from 'react'
import tileSheet from '../assets/sprites/tiles-95.png'
import type {
  BoardSnapshotCell,
  CandidateEvaluation,
  MoveDecision,
} from '../types'

interface MinesweeperBoardProps {
  board: BoardSnapshotCell[][]
  overlay?: CandidateEvaluation[]
  onReveal?: (row: number, col: number) => void
  onFlag?: (row: number, col: number) => void
  onChord?: (row: number, col: number) => void
  interactive?: boolean
  compact?: boolean
  highlightMove?: MoveDecision | null
}

function keyFor(row: number, col: number) {
  return `${row}:${col}`
}

function spriteIndexForCell(cell: BoardSnapshotCell): number | null {
  if (cell.wrongFlag) {
    return 6
  }

  if (!cell.revealed) {
    return cell.flagged ? 1 : 0
  }

  if (cell.mine) {
    if (cell.exploded) {
      return 5
    }
    return 4
  }

  if (cell.adjacent === 0) {
    return null
  }

  return 7 + cell.adjacent
}

function spriteStyle(index: number | null, cellSize: number) {
  if (index === null) {
    return undefined
  }
  const x = -(index % 8) * cellSize
  const y = -Math.floor(index / 8) * cellSize
  return {
    backgroundImage: `url(${tileSheet})`,
    backgroundSize: `${cellSize * 8}px ${cellSize * 2}px`,
    backgroundPosition: `${x}px ${y}px`,
  }
}

function resolveCellSize(
  cols: number,
  compact: boolean,
  viewportWidth: number,
) {
  if (compact) {
    if (cols >= 28) {
      return viewportWidth >= 1200 ? 12 : 10
    }
    if (cols >= 24) {
      return viewportWidth >= 1200 ? 14 : 12
    }
    if (cols >= 20) {
      return 14
    }
    return 18
  }

  if (cols >= 28) {
    if (viewportWidth >= 1100) {
      return 22
    }
    if (viewportWidth >= 920) {
      return 20
    }
    if (viewportWidth >= 760) {
      return 18
    }
    return 16
  }

  if (cols >= 24) {
    if (viewportWidth >= 1100) {
      return 22
    }
    if (viewportWidth >= 920) {
      return 20
    }
    return 18
  }

  if (cols >= 16) {
    return viewportWidth >= 760 ? 24 : 22
  }

  return 30
}

export function MinesweeperBoard({
  board,
  overlay = [],
  onReveal,
  onFlag,
  onChord,
  interactive = false,
  compact = false,
  highlightMove = null,
}: MinesweeperBoardProps) {
  const overlayMap = new Map(
    overlay.map((item) => [keyFor(item.row, item.col), item]),
  )
  const cols = board[0]?.length ?? 0
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const updateViewportWidth = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', updateViewportWidth)
    return () => window.removeEventListener('resize', updateViewportWidth)
  }, [])

  const cellSize = resolveCellSize(cols, compact, viewportWidth)

  return (
    <div
      className={`mine-grid${compact ? ' compact' : ''}`}
      style={{
        ['--cell-size' as string]: `${cellSize}px`,
        gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
      }}
    >
      {board.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const overlayEntry = overlayMap.get(keyFor(rowIndex, colIndex))
          const isHighlighted =
            highlightMove?.row === rowIndex && highlightMove?.col === colIndex
          const spriteIndex = spriteIndexForCell(cell)
          const isZeroReveal = cell.revealed && !cell.mine && cell.adjacent === 0

          return (
            <button
              type="button"
              key={keyFor(rowIndex, colIndex)}
              className={[
                'mine-cell',
                cell.revealed ? 'revealed' : 'hidden',
                cell.flagged ? 'flagged' : '',
                cell.exploded ? 'exploded' : '',
                cell.wrongFlag ? 'wrong-flag' : '',
                isZeroReveal ? 'revealed-zero' : '',
                isHighlighted ? 'highlighted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!interactive}
              onClick={() => {
                if (!interactive) {
                  return
                }
                if (cell.revealed) {
                  onChord?.(rowIndex, colIndex)
                } else {
                  onReveal?.(rowIndex, colIndex)
                }
              }}
              onDoubleClick={() => {
                if (interactive && cell.revealed) {
                  onChord?.(rowIndex, colIndex)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                if (interactive) {
                  onFlag?.(rowIndex, colIndex)
                }
              }}
            >
              <span
                className={[
                  'tile-sprite',
                  spriteIndex === null ? 'tile-zero' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={spriteStyle(spriteIndex, cellSize)}
              />
              {!cell.revealed && !cell.flagged && overlayEntry ? (
                <span className="cell-overlay">
                  <span className="overlay-open">
                    {Math.round(overlayEntry.openScore * 99)}
                  </span>
                  <span className="overlay-flag">
                    {Math.round(overlayEntry.flagScore * 99)}
                  </span>
                </span>
              ) : null}
            </button>
          )
        }),
      )}
    </div>
  )
}
