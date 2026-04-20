import { useMemo, useState } from 'react'
import { replayGenome } from '../lib/replay'
import type { BoardConfig, GenerationSummary } from '../types'
import { MinesweeperBoard } from './MinesweeperBoard'

interface ComparisonLabProps {
  generationA: GenerationSummary | null
  generationB: GenerationSummary | null
  board: BoardConfig
  benchmarkSeed: number
}

function metricDelta(left: number, right: number) {
  const delta = right - left
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta.toFixed(3)}`
}

function formatBoard(board: BoardConfig) {
  return `${board.rows}x${board.cols} · ${board.mines} мин`
}

export function ComparisonLab({
  generationA,
  generationB,
  board,
  benchmarkSeed,
}: ComparisonLabProps) {
  const [step, setStep] = useState(0)
  const activeBoard = board

  const replayA = useMemo(
    () =>
      generationA
        ? replayGenome(generationA.champion, activeBoard, benchmarkSeed, 180)
        : null,
    [generationA, activeBoard, benchmarkSeed],
  )
  const replayB = useMemo(
    () =>
      generationB
        ? replayGenome(generationB.champion, activeBoard, benchmarkSeed, 180)
        : null,
    [generationB, activeBoard, benchmarkSeed],
  )

  const maxStep =
    Math.max(replayA?.frames.length ?? 0, replayB?.frames.length ?? 0, 1) - 1
  const frameA =
    replayA?.frames[Math.min(step, Math.max(0, (replayA?.frames.length ?? 1) - 1))] ??
    null
  const frameB =
    replayB?.frames[Math.min(step, Math.max(0, (replayB?.frames.length ?? 1) - 1))] ??
    null

  return (
    <section className="compare-lab">
      <div className="section-head">
        <div>
          <p className="eyebrow">Сравнение</p>
          <h2>Реплей на одной и той же арене</h2>
          <p className="section-copy">
            Оба чемпиона играют на текущем поле активного профиля с одним benchmark seed.
            Так видно, кто реально стал сильнее, а кто просто поменял стиль.
          </p>
        </div>
        <div className="compare-meta">
          <span>{formatBoard(activeBoard)}</span>
          <span>seed {benchmarkSeed}</span>
          <span>step {step.toString().padStart(3, '0')}</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={maxStep}
        value={Math.min(step, maxStep)}
        onChange={(event) => setStep(Number(event.target.value))}
      />

      <div className="compare-grid">
        {[
          { label: 'A', generation: generationA, replay: replayA, frame: frameA },
          { label: 'B', generation: generationB, replay: replayB, frame: frameB },
        ].map(({ label, generation, replay, frame }) => (
          <div key={label} className="compare-panel">
            <div className="compare-panel-head">
              <strong>{label}</strong>
              <span>
                {generation
                  ? `G${generation.generation.toString().padStart(3, '0')}`
                  : 'не закреплено'}
              </span>
            </div>
            {generation && replay && frame ? (
              <>
                <MinesweeperBoard
                  board={frame.board}
                  compact
                  highlightMove={frame.move}
                />
                <div className="compare-stats">
                  <span>статус {replay.finalStatus}</span>
                  <span>победа {replay.win ? 'да' : 'нет'}</span>
                  <span>очистка {(replay.clearedRatio * 100).toFixed(1)}%</span>
                  <span>ходов {replay.moveCount}</span>
                </div>
                <div className="trace-row">
                  {frame.move ? (
                    <>
                      <span>{frame.move.action}</span>
                      <span>
                        r{frame.move.row + 1} c{frame.move.col + 1}
                      </span>
                      <span>open {frame.move.openScore.toFixed(2)}</span>
                      <span>flag {frame.move.flagScore.toFixed(2)}</span>
                    </>
                  ) : (
                    <span>ожидание первого хода</span>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">Закрепите поколение в слот {label}</div>
            )}
          </div>
        ))}
      </div>

      {generationA && generationB ? (
        <div className="delta-strip">
          <span>
            fitness {metricDelta(generationA.bestFitness, generationB.bestFitness)}
          </span>
          <span>
            win-rate{' '}
            {metricDelta(
              generationA.benchmark.wins / Math.max(1, generationA.benchmark.games),
              generationB.benchmark.wins / Math.max(1, generationB.benchmark.games),
            )}
          </span>
          <span>
            clear{' '}
            {metricDelta(
              generationA.benchmark.avgClearedRatio,
              generationB.benchmark.avgClearedRatio,
            )}
          </span>
          <span>
            reveal{' '}
            {metricDelta(
              generationA.benchmark.avgRevealAccuracy,
              generationB.benchmark.avgRevealAccuracy,
            )}
          </span>
          <span>
            flag{' '}
            {metricDelta(
              generationA.benchmark.avgFlagAccuracy,
              generationB.benchmark.avgFlagAccuracy,
            )}
          </span>
        </div>
      ) : null}
    </section>
  )
}
