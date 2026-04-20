import { describe, expect, it } from 'vitest'

import { DEFAULT_TRAINING_SETTINGS } from '../src/lib/constants'
import { sanitizeSettings } from '../src/lib/minesweeperPersistence'

describe('minesweeper training settings', () => {
  it('sanitizes modern mutation and policy controls from persisted profiles', () => {
    const settings = sanitizeSettings({
      ...DEFAULT_TRAINING_SETTINGS,
      mutationAggression: 9,
      adaptiveMutation: false,
      immigrantRate: 2,
      tournamentSize: 99,
      noveltyWeight: 4,
      frontierSolverCells: 99,
      logicAssistStrength: -1,
      riskTolerance: 4,
      valueHeadWeight: 8,
    })

    expect(settings.mutationAggression).toBe(3)
    expect(settings.adaptiveMutation).toBe(false)
    expect(settings.immigrantRate).toBe(0.35)
    expect(settings.tournamentSize).toBe(12)
    expect(settings.noveltyWeight).toBe(1)
    expect(settings.frontierSolverCells).toBe(22)
    expect(settings.logicAssistStrength).toBe(0)
    expect(settings.riskTolerance).toBe(0.65)
    expect(settings.valueHeadWeight).toBe(1)
  })
})
