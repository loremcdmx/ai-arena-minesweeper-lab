import { useCallback, useEffect, useRef, useState } from 'react'
import type { GenerationSummary, NeuralNetwork, TrainingSettings, TrainingState, TrainingWorkerMessage } from '../types'

const createTrainingWorker = () =>
  new Worker(new URL('../workers/trainingWorker.ts', import.meta.url), {
    type: 'module',
  })

export function useTrainingWorker(initialHistory: GenerationSummary[]) {
  const workerRef = useRef<Worker | null>(null)
  const activeProfileRef = useRef<string | null>(null)
  const [state, setState] = useState<TrainingState>({
    running: false,
    currentGeneration: 0,
    targetGenerations: 0,
    history: initialHistory,
    logs: [],
    error: null,
  })

  useEffect(() => {
    const worker = createTrainingWorker()
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<TrainingWorkerMessage>) => {
      const message = event.data

      if (message.type === 'generation') {
        setState((current) => ({
          ...current,
          currentGeneration: message.progress.current,
          targetGenerations: message.progress.total,
          history: [
            ...current.history,
            {
              ...message.summary,
              profileId: activeProfileRef.current ?? message.summary.profileId,
            },
          ],
          logs: [message.log, ...current.logs].slice(0, 120),
          error: null,
        }))
        return
      }

      if (message.type === 'complete') {
        setState((current) => ({
          ...current,
          running: false,
        }))
        return
      }

      if (message.type === 'error') {
        setState((current) => ({
          ...current,
          running: false,
          error: message.error,
          logs: [`worker error: ${message.error}`, ...current.logs].slice(0, 120),
        }))
      }
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const run = useCallback(
    (
      settings: TrainingSettings,
      seedChampion: NeuralNetwork | null,
      existingGenerationCount = state.history.length,
      profileId?: string,
    ) => {
      if (!workerRef.current) {
        return
      }

      activeProfileRef.current = profileId ?? null

      setState((current) => ({
        ...current,
        running: true,
        currentGeneration: 0,
        targetGenerations: settings.generations,
        error: null,
        logs: [
          `launch ${new Date().toLocaleTimeString()} | board ${settings.board.rows}x${settings.board.cols}x${settings.board.mines} | pop ${settings.populationSize} | gens ${settings.generations} | mut x${settings.mutationAggression.toFixed(2)} | novelty ${settings.noveltyWeight.toFixed(2)} | solver ${settings.frontierSolverCells} | cpu ${settings.parallelWorkers}`,
          ...current.logs,
        ].slice(0, 120),
      }))

      workerRef.current.postMessage({
        type: 'start',
        settings,
        seedChampion,
        existingGenerationCount,
        profileId,
      })
    },
    [state.history.length],
  )

  const stop = useCallback(() => {
    if (!workerRef.current) {
      return
    }
    workerRef.current.postMessage({ type: 'stop' })
    setState((current) => ({
      ...current,
      running: false,
      logs: [`stop requested ${new Date().toLocaleTimeString()}`, ...current.logs].slice(0, 120),
    }))
  }, [])

  const clearHistory = useCallback(() => {
    activeProfileRef.current = null
    setState((current) => ({
      ...current,
      history: [],
      logs: ['history cleared'],
    }))
  }, [])

  return {
    state,
    setHistory(history: GenerationSummary[]) {
      setState((current) => ({ ...current, history }))
    },
    run,
    stop,
    clearHistory,
  }
}
