/// <reference lib="webworker" />

import {
  buildGenerationSeeds,
  createEvolutionState,
  evaluatePopulationChunk,
  finalizeGeneration,
  initializePopulation,
  type EvolutionState,
  type TrainingGenome,
} from '../lib/evolution'
import type { NeuralNetwork, TrainingSettings, TrainingWorkerCommand, TrainingWorkerMessage } from '../types'

let stopped = false
let evaluationWorkers: Worker[] = []

interface CachedTrainingState {
  settingsKey: string
  generationCount: number
  population: ReturnType<typeof initializePopulation>
  previousChampion: NeuralNetwork | null
  evolution: EvolutionState
}

const trainingCache = new Map<string, CachedTrainingState>()

function post(message: TrainingWorkerMessage) {
  self.postMessage(message)
}

function buildSettingsCacheKey(settings: TrainingSettings) {
  return JSON.stringify({
    board: settings.board,
    populationSize: settings.populationSize,
    gamesPerGenome: settings.gamesPerGenome,
    validationGames: settings.validationGames,
    eliteCount: settings.eliteCount,
    mutationRate: settings.mutationRate,
    mutationScale: settings.mutationScale,
    mutationAggression: settings.mutationAggression,
    adaptiveMutation: settings.adaptiveMutation,
    immigrantRate: settings.immigrantRate,
    tournamentSize: settings.tournamentSize,
    noveltyWeight: settings.noveltyWeight,
    crossoverRate: settings.crossoverRate,
    hiddenLayers: settings.hiddenLayers,
    frontierSolverCells: settings.frontierSolverCells,
    logicAssistStrength: settings.logicAssistStrength,
    riskTolerance: settings.riskTolerance,
    valueHeadWeight: settings.valueHeadWeight,
    maxStepsPerGame: settings.maxStepsPerGame,
    benchmarkSeed: settings.benchmarkSeed,
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createEvaluationWorker() {
  return new Worker(new URL('./trainingEvalWorker.ts', import.meta.url), {
    type: 'module',
  })
}

function ensureEvaluationWorkers(count: number) {
  if (evaluationWorkers.length === count) {
    return evaluationWorkers
  }

  evaluationWorkers.forEach((worker) => worker.terminate())
  evaluationWorkers = Array.from({ length: count }, () => createEvaluationWorker())
  return evaluationWorkers
}

function runEvaluationChunk(
  worker: Worker,
  settings: TrainingSettings,
  trainSeeds: number[],
  genomes: TrainingGenome[],
) {
  return new Promise<ReturnType<typeof evaluatePopulationChunk>>((resolve, reject) => {
    const handleMessage = (
      event: MessageEvent<{
        results?: ReturnType<typeof evaluatePopulationChunk>
        error?: string
      }>,
    ) => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)

      if (event.data.error) {
        reject(new Error(event.data.error))
        return
      }

      resolve(event.data.results ?? [])
    }

    const handleError = (event: ErrorEvent) => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      reject(new Error(event.message || 'Evaluation worker crashed'))
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)
    worker.postMessage({
      settings,
      trainSeeds,
      genomes,
    })
  })
}

async function evaluatePopulationParallel(
  settings: TrainingSettings,
  population: TrainingGenome[],
  trainSeeds: number[],
) {
  const workerCount = Math.min(
    Math.max(1, Math.round(settings.parallelWorkers)),
    population.length,
  )

  if (workerCount <= 1 || population.length <= 1) {
    return evaluatePopulationChunk(population, settings, trainSeeds)
  }

  const workers = ensureEvaluationWorkers(workerCount)
  const chunkSize = Math.ceil(population.length / workerCount)
  const chunks = Array.from({ length: workerCount }, (_, index) =>
    population.slice(index * chunkSize, (index + 1) * chunkSize),
  ).filter((chunk) => chunk.length > 0)

  const chunkResults = await Promise.all(
    chunks.map((chunk, index) =>
      runEvaluationChunk(workers[index], settings, trainSeeds, chunk),
    ),
  )

  return chunkResults.flat()
}

self.onmessage = async (event: MessageEvent<TrainingWorkerCommand>) => {
  const message = event.data

  if (message.type === 'stop') {
    stopped = true
    return
  }

  if (message.type !== 'start') {
    return
  }

  stopped = false

  try {
    const profileKey = message.profileId ?? 'default'
    const settingsKey = buildSettingsCacheKey(message.settings)
    const cached = trainingCache.get(profileKey)
    const canResume =
      cached &&
      cached.settingsKey === settingsKey &&
      cached.generationCount === message.existingGenerationCount

    let previousChampion =
      message.settings.continueFromChampion && message.seedChampion ? message.seedChampion : null
    let population = initializePopulation(
      message.settings,
      message.existingGenerationCount,
      previousChampion,
    )
    let evolution = createEvolutionState()

    if (canResume) {
      previousChampion = cached.previousChampion ?? previousChampion
      population = cached.population
      evolution = cached.evolution
    }

    for (let offset = 0; offset < message.settings.generations; offset += 1) {
      if (stopped) {
        break
      }

      const generationNumber = message.existingGenerationCount + offset + 1
      const { trainSeeds, validationSeeds } = buildGenerationSeeds(
        message.settings,
        generationNumber,
      )
      const evaluationResults = await evaluatePopulationParallel(
        message.settings,
        population,
        trainSeeds,
      )

      if (stopped) {
        break
      }

      const { summary, nextPopulation, evolution: nextEvolution } = finalizeGeneration(
        message.settings,
        generationNumber,
        evaluationResults,
        previousChampion,
        validationSeeds,
        evolution,
      )

      previousChampion = summary.champion
      population = nextPopulation
      evolution = nextEvolution
      trainingCache.set(profileKey, {
        settingsKey,
        generationCount: generationNumber,
        population,
        previousChampion,
        evolution,
      })

      post({
        type: 'generation',
        summary,
        progress: {
          current: offset + 1,
          total: message.settings.generations,
        },
        log: `gen ${generationNumber.toString().padStart(3, '0')} | best ${summary.bestFitness.toFixed(2)} | avg ${summary.averageFitness.toFixed(2)} | wins ${(summary.benchmark.wins / Math.max(1, summary.benchmark.games) * 100).toFixed(1)}% | div ${(summary.populationDiversity ?? 0).toFixed(3)} | mut ${(summary.adaptiveMutationRate ?? message.settings.mutationRate).toFixed(2)}/${(summary.adaptiveMutationScale ?? message.settings.mutationScale).toFixed(2)} x${message.settings.mutationAggression.toFixed(2)} | novelty ${message.settings.noveltyWeight.toFixed(2)} | solver ${message.settings.frontierSolverCells} | stall ${summary.stagnationCount ?? 0} | cpu ${message.settings.parallelWorkers}`,
      })

      await sleep(0)
    }

    post({ type: 'complete' })
  } catch (error) {
    post({
      type: 'error',
      error: error instanceof Error ? error.message : 'Worker failed',
    })
  }
}

export {}
