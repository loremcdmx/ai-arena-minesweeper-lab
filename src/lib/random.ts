export interface RandomSource {
  next: () => number
  nextInt: (max: number) => number
}

export function hashSeed(seed: number): number {
  let state = seed >>> 0
  state ^= state >>> 16
  state = Math.imul(state, 0x7feb352d)
  state ^= state >>> 15
  state = Math.imul(state, 0x846ca68b)
  state ^= state >>> 16
  return state >>> 0
}

export function createRandom(seed: number): RandomSource {
  let state = hashSeed(seed) || 0x12345678

  const next = () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    nextInt(max: number) {
      return Math.floor(next() * max)
    },
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}
