import type { ReactNode } from 'react'

interface EloArchiveOption {
  id: string
  label: string
  subtitle: string
}

interface ComparisonMetric {
  label: string
  value: string
  detail: string
}

interface ComparisonSide {
  eyebrow: string
  title: string
  subtitle: string
  metrics: ComparisonMetric[]
}

interface ChampionComparisonCard {
  title: string
  description: string
  summary: string
  ourChampion: ComparisonSide
  externalChampion: ComparisonSide
}

interface EloArchivePanelProps {
  title: string
  description: string
  currentLabel: string
  currentElo: number
  peakElo: number
  calibratedElo: number | null
  lastCalibratedAt: number | null
  nextMilestone: number | null
  referencePeakLabel?: string
  referencePeakNote?: string
  selectedViewerId: string
  options: EloArchiveOption[]
  onSelectViewer: (viewerId: string) => void
  onCalibrate: () => void
  calibrationDisabled?: boolean
  calibrationRunning: boolean
  calibrationCurrent: number
  calibrationTotal: number
  calibrationCurrentElo: number
  calibrationProbeLabel: string
  calibrationLogs: string[]
  viewerNote: string
  comparison?: ChampionComparisonCard | null
  referenceItems?: EloArchiveOption[]
  testIdPrefix: string
}

function DisclosureSection({
  title,
  detail,
  defaultOpen = false,
  children,
}: {
  title: string
  detail: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className="disclosure-panel" open={defaultOpen}>
      <summary className="disclosure-header">
        <div className="disclosure-copy">
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
        <span className="disclosure-toggle" aria-hidden="true">
          open
        </span>
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  )
}

function formatDate(timestamp: number | null) {
  if (!timestamp) {
    return 'not calibrated yet'
  }

  return new Date(timestamp).toLocaleString()
}

export function EloArchivePanel({
  title,
  description,
  currentLabel,
  currentElo,
  peakElo,
  calibratedElo,
  lastCalibratedAt,
  nextMilestone,
  referencePeakLabel,
  referencePeakNote,
  selectedViewerId,
  options,
  onSelectViewer,
  onCalibrate,
  calibrationDisabled = false,
  calibrationRunning,
  calibrationCurrent,
  calibrationTotal,
  calibrationCurrentElo,
  calibrationProbeLabel,
  calibrationLogs,
  viewerNote,
  comparison = null,
  referenceItems = [],
  testIdPrefix,
}: EloArchivePanelProps) {
  const progress =
    calibrationTotal > 0 ? (calibrationCurrent / calibrationTotal) * 100 : 0
  const hasFrozenBots = options.length > 0
  const hasReferences = referenceItems.length > 0

  return (
    <section className="assistant-panel elo-panel">
      <div className="elo-topline">
        <div className="widget-head">
          <p className="eyebrow">ELO archive</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>

        <div className="settings-form elo-controls">
          <label className="settings-group">
            <span>Watch bot</span>
            <select
              value={selectedViewerId}
              onChange={(event) => onSelectViewer(event.target.value)}
              data-testid={`${testIdPrefix}-viewer-select`}
            >
              <option value="current">{currentLabel}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="secondary-pill"
            onClick={onCalibrate}
            disabled={calibrationRunning || calibrationDisabled}
            data-testid={`${testIdPrefix}-calibrate`}
          >
            {calibrationRunning ? 'Calibrating...' : 'Calibrate ELO'}
          </button>
        </div>
      </div>

      <div className="profile-vitals elo-vitals">
        <div>
          <span>current ELO</span>
          <strong data-testid={`${testIdPrefix}-elo-current`}>
            {Math.round(currentElo)}
          </strong>
        </div>
        <div>
          <span>peak ELO</span>
          <strong>{Math.round(peakElo)}</strong>
        </div>
        <div>
          <span>last calibrated</span>
          <strong>{calibratedElo !== null ? Math.round(calibratedElo) : 'n/a'}</strong>
        </div>
        <div>
          <span>next milestone</span>
          <strong>{nextMilestone ? `${nextMilestone} ELO` : 'archive saturated'}</strong>
        </div>
        {referencePeakLabel ? (
          <div>
            <span>top reference</span>
            <strong>{referencePeakLabel}</strong>
            <small>{referencePeakNote}</small>
          </div>
        ) : null}
      </div>

      <div className="training-monitor elo-monitor">
        <div className="training-status">
          <span
            className={['training-spinner', calibrationRunning ? 'running' : '']
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          />
          <div className="training-status-copy">
            <span>ELO calibration</span>
            <strong data-testid={`${testIdPrefix}-calibration-status`}>
              {calibrationRunning
                ? `${calibrationProbeLabel} - ${calibrationCurrent}/${calibrationTotal}`
                : 'Waiting to start'}
            </strong>
            <small>
              provisional {Math.round(calibrationCurrentElo)} - last{' '}
              {formatDate(lastCalibratedAt)}
            </small>
          </div>
        </div>

        <div className="training-meter" aria-label="elo calibration progress">
          <div className="training-meter-fill" style={{ width: `${progress}%` }} />
          <div className="training-meter-meta">
            <span>
              {calibrationCurrent}/{calibrationTotal}
            </span>
            <strong>{Math.round(progress)}%</strong>
            <span>{Math.round(calibrationCurrentElo)} ELO</span>
          </div>
        </div>
      </div>

      <div className="elo-deck">
        <div className="elo-primary-stack">
          <div className="profile-train-note elo-viewer-note">{viewerNote}</div>

          {comparison ? (
            <DisclosureSection
              title="Champion comparison"
              detail="Live branch versus the strongest external anchor."
              defaultOpen={false}
            >
              <section className="champion-comparison">
                <div className="widget-head">
                  <h3>{comparison.title}</h3>
                  <p>{comparison.description}</p>
                </div>

                <div className="champion-comparison-grid">
                  {[comparison.ourChampion, comparison.externalChampion].map((side) => (
                    <div key={side.title} className="champion-side">
                      <span className="champion-side-eyebrow">{side.eyebrow}</span>
                      <strong>{side.title}</strong>
                      <p>{side.subtitle}</p>
                      <div className="champion-metrics">
                        {side.metrics.map((metric) => (
                          <div
                            key={`${side.title}-${metric.label}`}
                            className="champion-metric"
                          >
                            <span>{metric.label}</span>
                            <strong>{metric.value}</strong>
                            <small>{metric.detail}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="profile-train-note champion-summary">
                  {comparison.summary}
                </div>
              </section>
            </DisclosureSection>
          ) : null}
        </div>

        <div className="elo-side-stack">
          <DisclosureSection
            title="Saved bots"
            detail={
              hasFrozenBots
                ? `${options.length} archived checkpoints ready to watch.`
                : 'Peak and milestone snapshots will appear here.'
            }
            defaultOpen
          >
            <div className="strategy-feed-list elo-option-list">
              {hasFrozenBots ? (
                options.map((option) => (
                  <div key={option.id} className="strategy-feed-row">
                    <strong>{option.label}</strong>
                    <span>{option.subtitle}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  No frozen bots yet. The latest peak ELO and each milestone checkpoint will appear here.
                </div>
              )}
            </div>
          </DisclosureSection>

          {hasReferences ? (
            <DisclosureSection
              title="Reference anchors"
              detail={`${referenceItems.length} external checkpoints used for calibration.`}
            >
              <div className="strategy-feed-list elo-reference-list">
                {referenceItems.map((reference) => (
                  <div key={reference.label} className="strategy-feed-row">
                    <strong>{reference.label}</strong>
                    <span>{reference.subtitle}</span>
                  </div>
                ))}
              </div>
            </DisclosureSection>
          ) : null}

          <DisclosureSection
            title="Calibration console"
            detail={
              calibrationRunning
                ? `Probe ${calibrationCurrent}/${calibrationTotal} is running right now.`
                : 'Open only when you need the detailed calibration trace.'
            }
            defaultOpen={calibrationRunning}
          >
            <div className="terminal-log elo-log" data-testid={`${testIdPrefix}-calibration-log`}>
              {calibrationLogs.length > 0 ? (
                calibrationLogs.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))
              ) : (
                <div>Waiting for calibration launch.</div>
              )}
            </div>
          </DisclosureSection>
        </div>
      </div>
    </section>
  )
}
