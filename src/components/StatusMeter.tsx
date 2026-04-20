interface StatusMeterProps {
  label: string
  value: number
  max: number
  summary?: string
  startLabel?: string
  endLabel?: string
  testId?: string
}

function clampPercent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, (value / max) * 100))
}

export function StatusMeter({
  label,
  value,
  max,
  summary,
  startLabel,
  endLabel,
  testId,
}: StatusMeterProps) {
  const percent = clampPercent(value, max)
  const left = startLabel ?? `${Math.round(value)}`
  const center = summary ?? `${Math.round(value)} / ${Math.round(max)}`
  const right = endLabel ?? `${Math.round(max)}`

  return (
    <div className="status-meter" data-testid={testId}>
      <div className="status-meter-head">
        <span>{label}</span>
        <strong>{Math.round(percent)}%</strong>
      </div>
      <div className="status-meter-track" aria-hidden="true">
        <div className="status-meter-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="status-meter-meta">
        <span>{left}</span>
        <strong>{center}</strong>
        <span>{right}</span>
      </div>
    </div>
  )
}
