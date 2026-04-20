import faceSheet from '../assets/sprites/faces-2000.png'

export type FaceState = 'smile' | 'smile-click' | 'excited' | 'winner' | 'dead'

interface SpriteFaceProps {
  state: FaceState
}

const FACE_INDEX: Record<FaceState, number> = {
  smile: 0,
  'smile-click': 1,
  excited: 2,
  winner: 3,
  dead: 4,
}

export function SpriteFace({ state }: SpriteFaceProps) {
  return (
    <span
      aria-hidden="true"
      className="face-sprite"
      style={{
        backgroundImage: `url(${faceSheet})`,
        backgroundSize: '180px 36px',
        backgroundPosition: `${-FACE_INDEX[state] * 36}px 0px`,
      }}
    />
  )
}
