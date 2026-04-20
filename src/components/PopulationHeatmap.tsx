interface PopulationHeatmapProps {
  values: number[]
}

function colorFor(value: number, min: number, max: number) {
  const ratio = max === min ? 1 : (value - min) / (max - min)
  const hue = 212 - ratio * 176
  const saturation = 26 + ratio * 34
  const lightness = 34 + ratio * 18
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

export function PopulationHeatmap({ values }: PopulationHeatmapProps) {
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)

  return (
    <div className="heatmap-grid">
      {values.length === 0 ? (
        <div className="heatmap-empty">Данные популяции появятся после первого прогона.</div>
      ) : (
        values.map((value, index) => (
          <div
            key={`${index}-${value}`}
            className="heat-cell"
            style={{ background: colorFor(value, min, max) }}
            title={`#${index + 1}: ${value.toFixed(2)}`}
          >
            <span>{index + 1}</span>
          </div>
        ))
      )}
    </div>
  )
}
