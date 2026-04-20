interface Series {
  label: string
  color: string
  values: number[]
}

interface LineChartProps {
  series: Series[]
}

const VIEWBOX_WIDTH = 480
const VIEWBOX_HEIGHT = 138
const PLOT_LEFT = 30
const PLOT_RIGHT = 12
const PLOT_TOP = 12
const PLOT_BOTTOM = 22
const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT_TOP - PLOT_BOTTOM

function normalizeSeries(series: Series[]) {
  const flatValues = series.flatMap((item) => item.values)
  const finiteValues = flatValues.filter((value) => Number.isFinite(value))

  if (finiteValues.length === 0) {
    return { min: 0, max: 1 }
  }

  const rawMin = Math.min(...finiteValues)
  const rawMax = Math.max(...finiteValues)

  if (rawMax === rawMin) {
    const padding = Math.max(1, Math.abs(rawMax) * 0.08)
    return { min: rawMin - padding, max: rawMax + padding }
  }

  const padding = Math.max(0.5, (rawMax - rawMin) * 0.08)
  return { min: rawMin - padding, max: rawMax + padding }
}

function xFor(index: number, total: number) {
  if (total <= 1) {
    return PLOT_LEFT + PLOT_WIDTH
  }
  return PLOT_LEFT + (index / (total - 1)) * PLOT_WIDTH
}

function yFor(value: number, min: number, max: number) {
  return PLOT_TOP + PLOT_HEIGHT - ((value - min) / (max - min)) * PLOT_HEIGHT
}

function points(values: number[], min: number, max: number) {
  if (values.length === 1) {
    const y = yFor(values[0], min, max)
    return `${PLOT_LEFT},${y} ${PLOT_LEFT + PLOT_WIDTH},${y}`
  }

  return values
    .map((value, index) => `${xFor(index, values.length)},${yFor(value, min, max)}`)
    .join(' ')
}

function formatValue(value: number, min: number, max: number) {
  const range = Math.abs(max - min)
  if (range >= 100) {
    return value.toFixed(0)
  }
  if (range >= 10) {
    return value.toFixed(1)
  }
  return value.toFixed(2)
}

export function LineChart({ series }: LineChartProps) {
  const active = series.filter((item) => item.values.length > 0)
  const fallback = [{ label: 'zero', color: '#000', values: [0] }]
  const normalizedSeries = active.length > 0 ? active : fallback
  const { min, max } = normalizeSeries(normalizedSeries)
  const generationCount = Math.max(...normalizedSeries.map((item) => item.values.length))
  const gridLabels = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    return {
      value: max - (max - min) * ratio,
      y: PLOT_TOP + PLOT_HEIGHT * ratio,
    }
  })

  return (
    <div className="chart-shell">
      <div className="chart-head">
        <span>{generationCount} поколений</span>
        <span>
          диапазон {formatValue(min, min, max)} - {formatValue(max, min, max)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label="Training metrics"
      >
        <g className="chart-grid">
          {gridLabels.map((label, index) => (
            <line
              key={index}
              x1={PLOT_LEFT}
              x2={VIEWBOX_WIDTH - PLOT_RIGHT}
              y1={label.y}
              y2={label.y}
            />
          ))}
        </g>

        <g className="chart-axis-labels">
          {gridLabels.map((label, index) => (
            <text key={index} x={0} y={label.y + 4}>
              {formatValue(label.value, min, max)}
            </text>
          ))}
          <text x={PLOT_LEFT} y={VIEWBOX_HEIGHT - 2}>
            G001
          </text>
          <text x={VIEWBOX_WIDTH - PLOT_RIGHT} y={VIEWBOX_HEIGHT - 2} textAnchor="end">
            G{generationCount.toString().padStart(3, '0')}
          </text>
        </g>

        {active.map((entry) => {
          const lastIndex = entry.values.length - 1
          const lastX = xFor(lastIndex, entry.values.length)
          const lastY = yFor(entry.values[lastIndex], min, max)

          return (
            <g key={entry.label}>
              <polyline
                className="chart-line"
                stroke={entry.color}
                points={points(entry.values, min, max)}
              />
              <circle
                className="chart-point"
                cx={lastX}
                cy={lastY}
                r="3.5"
                fill={entry.color}
              />
            </g>
          )
        })}
      </svg>

      <div className="chart-legend">
        {active.map((entry) => {
          const latest = entry.values.at(-1) ?? 0
          const peak = Math.max(...entry.values)

          return (
            <span key={entry.label} className="legend-pill">
              <i style={{ background: entry.color }} />
              <span className="legend-copy">
                <strong>{entry.label}</strong>
                <small>
                  now {formatValue(latest, min, max)} · peak {formatValue(peak, min, max)}
                </small>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
