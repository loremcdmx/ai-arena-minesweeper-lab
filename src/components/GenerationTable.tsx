import type { GenerationSummary } from '../types'

interface GenerationTableProps {
  history: GenerationSummary[]
  selected: number | null
  compareA: number | null
  compareB: number | null
  onSelect: (generation: number) => void
  onPinA: (generation: number) => void
  onPinB: (generation: number) => void
}

function percentage(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatBoardCompact(summary: GenerationSummary) {
  return `${summary.board.rows}x${summary.board.cols}x${summary.board.mines}`
}

export function GenerationTable({
  history,
  selected,
  compareA,
  compareB,
  onSelect,
  onPinA,
  onPinB,
}: GenerationTableProps) {
  return (
    <div className="generation-table">
      <div className="generation-table-header">
        <span>Покол.</span>
        <span>Лидер</span>
        <span>Средн.</span>
        <span>Победы</span>
        <span>Очистка</span>
        <span>A/B</span>
      </div>
      <div className="generation-rows">
        {history.length === 0 ? (
          <div className="empty-state">У этого профиля пока нет выращенных поколений.</div>
        ) : (
          [...history].reverse().map((generation) => (
            <div
              key={`${generation.generation}-${generation.createdAt}`}
              className={[
                'generation-row',
                selected === generation.generation ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="generation-select"
                onClick={() => onSelect(generation.generation)}
              >
                <span className="generation-identity">
                  <strong>G{generation.generation.toString().padStart(3, '0')}</strong>
                  <small>{formatBoardCompact(generation)}</small>
                </span>
                <span>{generation.bestFitness.toFixed(1)}</span>
                <span>{generation.averageFitness.toFixed(1)}</span>
                <span>
                  {percentage(
                    generation.benchmark.wins /
                      Math.max(1, generation.benchmark.games),
                  )}
                </span>
                <span>{percentage(generation.benchmark.avgClearedRatio)}</span>
              </button>
              <span className="compare-buttons">
                <button
                  type="button"
                  aria-label={`Поставить поколение ${generation.generation} в слот A`}
                  className={compareA === generation.generation ? 'active-a' : ''}
                  onClick={() => onPinA(generation.generation)}
                >
                  A
                </button>
                <button
                  type="button"
                  aria-label={`Поставить поколение ${generation.generation} в слот B`}
                  className={compareB === generation.generation ? 'active-b' : ''}
                  onClick={() => onPinB(generation.generation)}
                >
                  B
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
