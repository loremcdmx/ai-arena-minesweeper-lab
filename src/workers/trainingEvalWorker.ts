/// <reference lib="webworker" />

import { evaluatePopulationChunk, type TrainingGenome } from '../lib/evolution'
import type { GenomeResult, TrainingSettings } from '../types'

interface EvalWorkerRequest {
  settings: TrainingSettings
  trainSeeds: number[]
  genomes: TrainingGenome[]
}

interface EvalWorkerResponse {
  results?: GenomeResult[]
  error?: string
}

self.onmessage = (event: MessageEvent<EvalWorkerRequest>) => {
  try {
    const { settings, trainSeeds, genomes } = event.data
    const results = evaluatePopulationChunk(genomes, settings, trainSeeds)
    self.postMessage({ results } satisfies EvalWorkerResponse)
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Evaluation worker failed',
    } satisfies EvalWorkerResponse)
  }
}

export {}
