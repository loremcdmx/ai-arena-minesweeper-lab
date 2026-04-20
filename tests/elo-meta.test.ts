import { describe, expect, it } from 'vitest'

import { createEloMeta, stableChampionElo } from '../src/lib/elo'

describe('stable champion elo', () => {
  it('does not let a weaker live estimate lower the public champion rating', () => {
    const meta = createEloMeta(1200)
    meta.currentElo = 1500
    meta.peakElo = 1700

    expect(stableChampionElo(meta, 800)).toBe(1700)
  })

  it('still accepts genuine champion improvements', () => {
    const meta = createEloMeta(1200)
    meta.currentElo = 1500
    meta.peakElo = 1700

    expect(stableChampionElo(meta, 1825)).toBe(1825)
  })
})
