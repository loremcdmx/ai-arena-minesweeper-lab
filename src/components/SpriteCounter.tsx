import scoreSheet from '../assets/sprites/scores-2000.png'

interface SpriteCounterProps {
  value: number
}

function clampDigits(value: number): string[] {
  const normalized = Math.min(999, Math.max(0, Math.round(value)))
  return normalized
    .toString()
    .padStart(3, '0')
    .split('')
}

function digitStyle(digit: string) {
  const digitIndex = Number(digit)
  return {
    backgroundImage: `url(${scoreSheet})`,
    backgroundSize: '260px 46px',
    backgroundPosition: `${-digitIndex * 26}px 0px`,
  }
}

export function SpriteCounter({ value }: SpriteCounterProps) {
  return (
    <div className="counter-box sprite-counter" aria-label={`Counter ${value}`}>
      {clampDigits(value).map((digit, index) => (
        <span
          key={`${digit}-${index}`}
          className="score-digit"
          style={digitStyle(digit)}
        />
      ))}
    </div>
  )
}
