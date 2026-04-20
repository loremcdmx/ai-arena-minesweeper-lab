import type {
  EvalAggregate,
  GameSession,
  GenerationSummary,
  GenomeResult,
  MoveDecision,
  NeuralNetwork,
  TrainingSettings,
} from '../types'
import {
  countCorrectFlags,
  countWrongFlags,
  createGame,
  forEachNeighbor,
  revealCell,
  toggleFlag,
} from './minesweeper'
import {
  cloneNetwork,
  createNetwork,
  evaluateCandidate,
  networkDistance,
  normalizeNetworkShape,
  summarizeWeights,
  INPUT_FEATURES,
  OUTPUT_HEADS,
} from './neural'
import { createRandom, hashSeed, type RandomSource } from './random'

interface Genome {
  id: string
  network: NeuralNetwork
}

export interface TrainingGenome {
  id: string
  network: NeuralNetwork
}

interface GameMetrics {
  fitness: number
  win: boolean
  clearedRatio: number
  revealAccuracy: number
  flagAccuracy: number
  moves: number
  survivalTurns: number
}

export interface EvolutionState {
  bestFitness: number
  stagnation: number
}

interface BreedingPlan {
  eliteCount: number
  immigrantCount: number
  mutationRate: number
  mutationScale: number
  explorationPressure: number
}

interface MovePolicySettings {
  frontierSolverCells: number
  logicAssistStrength: number
  riskTolerance: number
  valueHeadWeight: number
}

interface FrontierProbability {
  risk: number
  samples: number
}

interface HiddenCellRef {
  row: number
  col: number
  key: string
}

interface HiddenConstraint {
  anchorRow: number
  anchorCol: number
  requiredMines: number
  cells: HiddenCellRef[]
}

function makeGenomeId(generation: number, index: number) {
  return `g${generation.toString().padStart(3, '0')}-${index.toString().padStart(3, '0')}`
}

function gaussian(random: RandomSource): number {
  const u = Math.max(1e-7, random.next())
  const v = Math.max(1e-7, random.next())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hasAdjacentReveal(game: GameSession, row: number, col: number) {
  let adjacentRevealed = 0

  forEachNeighbor(game.config, row, col, (nextRow, nextCol) => {
    if (game.board[nextRow][nextCol].revealed) {
      adjacentRevealed += 1
    }
  })

  return adjacentRevealed > 0
}

function collectCandidateCells(game: GameSession) {
  const frontier: Array<{ row: number; col: number }> = []
  const hidden: Array<{ row: number; col: number }> = []

  for (let row = 0; row < game.config.rows; row += 1) {
    for (let col = 0; col < game.config.cols; col += 1) {
      const cell = game.board[row][col]
      if (cell.revealed || cell.flagged) {
        continue
      }

      if (hasAdjacentReveal(game, row, col)) {
        frontier.push({ row, col })
      } else {
        hidden.push({ row, col })
      }
    }
  }

  return frontier.length > 0 ? frontier : hidden
}

function pointKey(row: number, col: number) {
  return `${row}:${col}`
}

function countAvailableHiddenCells(game: GameSession) {
  let count = 0

  for (const row of game.board) {
    for (const cell of row) {
      if (!cell.revealed && !cell.flagged) {
        count += 1
      }
    }
  }

  return count
}

function collectHiddenConstraints(game: GameSession) {
  const constraints: HiddenConstraint[] = []

  for (let row = 0; row < game.config.rows; row += 1) {
    for (let col = 0; col < game.config.cols; col += 1) {
      const cell = game.board[row][col]
      if (!cell.revealed || cell.adjacent === 0) {
        continue
      }

      let flagged = 0
      const hiddenNeighbors: HiddenCellRef[] = []

      forEachNeighbor(game.config, row, col, (nextRow, nextCol) => {
        const neighbor = game.board[nextRow][nextCol]
        if (neighbor.flagged) {
          flagged += 1
          return
        }

        if (!neighbor.revealed) {
          hiddenNeighbors.push({
            row: nextRow,
            col: nextCol,
            key: pointKey(nextRow, nextCol),
          })
        }
      })

      const requiredMines = Math.max(0, cell.adjacent - flagged)
      if (hiddenNeighbors.length === 0 || requiredMines > hiddenNeighbors.length) {
        continue
      }

      constraints.push({
        anchorRow: row,
        anchorCol: col,
        requiredMines,
        cells: hiddenNeighbors,
      })
    }
  }

  return constraints
}

function pushInference(
  target: Map<string, HiddenCellRef>,
  cell: HiddenCellRef,
) {
  if (!target.has(cell.key)) {
    target.set(cell.key, cell)
  }
}

function inferDeterministicCells(game: GameSession) {
  const constraints = collectHiddenConstraints(game)
  const safe = new Map<string, HiddenCellRef>()
  const mines = new Map<string, HiddenCellRef>()

  constraints.forEach((constraint) => {
    if (constraint.requiredMines === 0) {
      constraint.cells.forEach((cell) => pushInference(safe, cell))
    }

    if (constraint.requiredMines === constraint.cells.length) {
      constraint.cells.forEach((cell) => pushInference(mines, cell))
    }
  })

  for (let leftIndex = 0; leftIndex < constraints.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < constraints.length; rightIndex += 1) {
      if (leftIndex === rightIndex) {
        continue
      }

      const left = constraints[leftIndex]
      const right = constraints[rightIndex]

      if (left.cells.length >= right.cells.length) {
        continue
      }

      const rightKeys = new Set(right.cells.map((cell) => cell.key))
      const isSubset = left.cells.every((cell) => rightKeys.has(cell.key))
      if (!isSubset) {
        continue
      }

      const difference = right.cells.filter(
        (cell) => !left.cells.some((candidate) => candidate.key === cell.key),
      )
      if (difference.length === 0) {
        continue
      }

      const mineDelta = right.requiredMines - left.requiredMines
      if (mineDelta === 0) {
        difference.forEach((cell) => pushInference(safe, cell))
      } else if (mineDelta === difference.length) {
        difference.forEach((cell) => pushInference(mines, cell))
      }
    }
  }

  return {
    constraints,
    safe: [...safe.values()],
    mines: [...mines.values()],
  }
}

function logicRiskForCell(
  game: GameSession,
  row: number,
  col: number,
  constraints: HiddenConstraint[],
) {
  const related = constraints.filter((constraint) =>
    constraint.cells.some((cell) => cell.row === row && cell.col === col),
  )
  const remainingMines = Math.max(0, game.config.mines - game.flagsUsed)
  const hiddenCells = countAvailableHiddenCells(game)
  const globalRisk = hiddenCells > 0 ? remainingMines / hiddenCells : 1

  if (related.length === 0) {
    return clamp(globalRisk, 0, 1)
  }

  const localRisks = related.map((constraint) => constraint.requiredMines / constraint.cells.length)
  const minRisk = Math.min(...localRisks)
  const maxRisk = Math.max(...localRisks)
  const avgRisk =
    localRisks.reduce((sum, value) => sum + value, 0) / Math.max(1, localRisks.length)
  const safeProbability = localRisks.reduce((probability, value) => probability * (1 - value), 1)
  const stackedRisk = 1 - safeProbability

  return clamp(
    avgRisk * 0.42 + stackedRisk * 0.46 + globalRisk * 0.12,
    Math.min(minRisk, globalRisk),
    Math.max(maxRisk, globalRisk),
  )
}

function resolveMovePolicy(
  settings?: Partial<MovePolicySettings>,
): MovePolicySettings {
  return {
    frontierSolverCells: Math.max(
      0,
      Math.round(settings?.frontierSolverCells ?? 16),
    ),
    logicAssistStrength: clamp(settings?.logicAssistStrength ?? 0.82, 0, 1),
    riskTolerance: clamp(settings?.riskTolerance ?? 0.18, 0, 0.65),
    valueHeadWeight: clamp(settings?.valueHeadWeight ?? 0.22, 0, 1),
  }
}

function frontierProbabilityMap(
  game: GameSession,
  constraints: HiddenConstraint[],
  maxCells: number,
): Map<string, FrontierProbability> {
  if (maxCells <= 0 || constraints.length === 0) {
    return new Map()
  }

  const cellByKey = new Map<string, HiddenCellRef>()
  constraints.forEach((constraint) => {
    constraint.cells.forEach((cell) => cellByKey.set(cell.key, cell))
  })

  const cells = [...cellByKey.values()]
  if (cells.length === 0 || cells.length > maxCells) {
    return new Map()
  }

  const cellIndex = new Map(cells.map((cell, index) => [cell.key, index]))
  const indexedConstraints = constraints.map((constraint) => ({
    requiredMines: constraint.requiredMines,
    indexes: constraint.cells.map((cell) => cellIndex.get(cell.key) ?? -1),
  }))
  const remainingMines = Math.max(0, game.config.mines - game.flagsUsed)
  const hiddenCells = countAvailableHiddenCells(game)
  const outsideCells = Math.max(0, hiddenCells - cells.length)
  const assignment = Array<number>(cells.length).fill(-1)
  const mineCounts = Array<number>(cells.length).fill(0)
  let totalAssignments = 0

  const isPartialValid = (assignedMineTotal: number) => {
    if (assignedMineTotal > remainingMines) {
      return false
    }

    return indexedConstraints.every((constraint) => {
      let assigned = 0
      let mines = 0
      for (const index of constraint.indexes) {
        const value = assignment[index]
        if (value === -1) {
          continue
        }
        assigned += 1
        mines += value
      }

      const unknown = constraint.indexes.length - assigned
      return (
        mines <= constraint.requiredMines &&
        mines + unknown >= constraint.requiredMines
      )
    })
  }

  const visit = (index: number, assignedMineTotal: number) => {
    if (index >= cells.length) {
      if (
        !isPartialValid(assignedMineTotal) ||
        assignedMineTotal + outsideCells < remainingMines
      ) {
        return
      }

      totalAssignments += 1
      assignment.forEach((value, cellIndex) => {
        mineCounts[cellIndex] += value
      })
      return
    }

    assignment[index] = 0
    if (isPartialValid(assignedMineTotal)) {
      visit(index + 1, assignedMineTotal)
    }

    assignment[index] = 1
    if (isPartialValid(assignedMineTotal + 1)) {
      visit(index + 1, assignedMineTotal + 1)
    }

    assignment[index] = -1
  }

  visit(0, 0)

  if (totalAssignments === 0) {
    return new Map()
  }

  return new Map(
    cells.map((cell, index) => [
      cell.key,
      {
        risk: mineCounts[index] / totalAssignments,
        samples: totalAssignments,
      },
    ]),
  )
}

function deterministicMove(
  network: NeuralNetwork,
  game: GameSession,
  cells: HiddenCellRef[],
  action: 'reveal' | 'flag',
): MoveDecision | null {
  if (cells.length === 0) {
    return null
  }

  const ranked = cells
    .map((cell) => {
      const evaluation = evaluateCandidate(network, game, cell.row, cell.col)
      return {
        ...evaluation,
        action,
        certainty:
          action === 'reveal'
            ? 1.12 + evaluation.safeSignal * 0.2 + (evaluation.frontier ? 0.08 : 0)
            : 1.08 + evaluation.mineSignal * 0.24 + (evaluation.frontier ? 0.06 : 0),
      }
    })
    .sort((left, right) => right.certainty - left.certainty)

  return ranked[0] ?? null
}

function fitnessImproved(previousBest: number, nextBest: number) {
  if (!Number.isFinite(previousBest)) {
    return true
  }

  const requiredGain = Math.max(0.2, Math.abs(previousBest) * 0.004)
  return nextBest > previousBest + requiredGain
}

function estimatePopulationDiversity(ranked: GenomeResult[]) {
  const sample = ranked.slice(0, Math.min(6, ranked.length))
  if (sample.length < 2) {
    return 0
  }

  const anchor = sample[0].network
  const total = sample
    .slice(1)
    .reduce((sum, result) => sum + networkDistance(anchor, result.network), 0)

  return total / Math.max(1, sample.length - 1)
}

function buildBreedingPlan(
  settings: TrainingSettings,
  evolution: EvolutionState,
  diversity: number,
): BreedingPlan {
  const diversityGap = Math.max(0, 0.16 - diversity)
  const rawExplorationPressure = clamp(
    evolution.stagnation / 7 + diversityGap * 3.4,
    0,
    1,
  )
  const explorationPressure = settings.adaptiveMutation ? rawExplorationPressure : 0
  const mutationAggression = clamp(settings.mutationAggression, 0.1, 3)
  const immigrantCount = Math.min(
    settings.populationSize - 2,
    Math.max(
      0,
      Math.round(
        settings.populationSize *
          clamp(
            settings.immigrantRate + explorationPressure * 0.18 * mutationAggression,
            0,
            0.45,
          ),
      ),
    ),
  )

  return {
    eliteCount: Math.max(
      1,
      Math.min(settings.eliteCount, settings.populationSize - immigrantCount - 1),
    ),
    immigrantCount,
    mutationRate: clamp(
      settings.mutationRate *
        mutationAggression *
        (1 + explorationPressure * 0.9),
      0.01,
      0.96,
    ),
    mutationScale: clamp(
      settings.mutationScale *
        Math.sqrt(mutationAggression) *
        (1 + explorationPressure * 1.35),
      0.01,
      2.2,
    ),
    explorationPressure,
  }
}

export function createEvolutionState(): EvolutionState {
  return {
    bestFitness: Number.NEGATIVE_INFINITY,
    stagnation: 0,
  }
}

export function chooseMove(
  network: NeuralNetwork,
  game: GameSession,
  settings?: Partial<MovePolicySettings>,
): MoveDecision | null {
  let bestReveal: MoveDecision | null = null
  let bestFlag: MoveDecision | null = null
  const policy = resolveMovePolicy(settings)

  if (game.moveCount === 0) {
    const centerRow = Math.floor(game.config.rows / 2)
    const centerCol = Math.floor(game.config.cols / 2)
    const first = evaluateCandidate(network, game, centerRow, centerCol)
    return {
      ...first,
      action: 'reveal',
      certainty: 1,
    }
  }

  const logic = inferDeterministicCells(game)
  const exactRisks = frontierProbabilityMap(
    game,
    logic.constraints,
    policy.frontierSolverCells,
  )
  const forcedReveal = deterministicMove(network, game, logic.safe, 'reveal')
  if (forcedReveal) {
    return forcedReveal
  }

  const forcedFlag = deterministicMove(network, game, logic.mines, 'flag')
  if (forcedFlag) {
    return forcedFlag
  }

  for (const { row, col } of collectCandidateCells(game)) {
    const evaluation = evaluateCandidate(network, game, row, col)
    const logicRisk = logicRiskForCell(game, row, col, logic.constraints)
    const exactRisk = exactRisks.get(pointKey(row, col)) ?? null
    const solverRisk = exactRisk?.risk ?? logicRisk
    const riskEstimate = clamp(
      solverRisk * policy.logicAssistStrength +
        evaluation.riskEstimate * (1 - policy.logicAssistStrength),
      0,
      1,
    )
    const valueLift = (evaluation.valueScore - 0.5) * policy.valueHeadWeight
    const riskOverTolerance = Math.max(0, riskEstimate - policy.riskTolerance)
    const revealDecision: MoveDecision = {
      ...evaluation,
      riskEstimate,
      exactRisk: exactRisk?.risk ?? null,
      solverSamples: exactRisk?.samples ?? 0,
      action: 'reveal',
      certainty:
        evaluation.openScore * (0.34 + (1 - riskEstimate) * 0.92) +
        evaluation.safeSignal * 0.62 +
        (evaluation.frontier ? 0.08 : 0.03) -
        riskEstimate * 0.2 -
        riskOverTolerance * 0.42 +
        valueLift,
    }
    const flagDecision: MoveDecision = {
      ...evaluation,
      riskEstimate,
      exactRisk: exactRisk?.risk ?? null,
      solverSamples: exactRisk?.samples ?? 0,
      action: 'flag',
      certainty:
        evaluation.flagScore * (0.18 + riskEstimate * 1.08) +
        evaluation.mineSignal * 0.74 +
        riskEstimate * 0.18 -
        valueLift * 0.35,
    }

    if (bestReveal === null || revealDecision.certainty > bestReveal.certainty) {
      bestReveal = revealDecision
    }

    if (bestFlag === null || flagDecision.certainty > bestFlag.certainty) {
      bestFlag = flagDecision
    }
  }

  if (bestReveal === null) {
    return null
  }

  if (
    bestFlag &&
    bestFlag.flagScore > 0.82 &&
    bestFlag.mineSignal + bestFlag.riskEstimate > bestReveal.safeSignal + 0.82 &&
    bestFlag.riskEstimate > 0.92 - policy.riskTolerance * 0.18 &&
    bestFlag.certainty > bestReveal.certainty * 0.98
  ) {
    return bestFlag
  }

  return bestReveal
}

export function applyMove(game: GameSession, decision: MoveDecision): boolean {
  if (decision.action === 'flag') {
    return toggleFlag(game, decision.row, decision.col)
  }
  return revealCell(game, decision.row, decision.col)
}

function evaluateSingleGame(network: NeuralNetwork, settings: TrainingSettings, seed: number): GameMetrics {
  const game = createGame(settings.board, seed)
  let revealAttempts = 0
  let correctRevealAttempts = 0
  let flagAttempts = 0
  let correctFlagAttempts = 0
  let steps = 0

  while ((game.status === 'ready' || game.status === 'playing') && steps < settings.maxStepsPerGame) {
    const decision = chooseMove(network, game, settings)
    if (!decision) {
      break
    }

    steps += 1
    const targetCell = game.board[decision.row][decision.col]
    const targetWasMine = targetCell.mine
    const applied = applyMove(game, decision)
    if (!applied) {
      break
    }

    if (decision.action === 'reveal') {
      revealAttempts += 1
      if (!targetWasMine) {
        correctRevealAttempts += 1
      }
    } else {
      flagAttempts += 1
      if (targetWasMine) {
        correctFlagAttempts += 1
      }
    }
  }

  const clearedRatio = game.revealedSafe / Math.max(1, game.totalSafe)
  const revealAccuracy = revealAttempts > 0 ? correctRevealAttempts / revealAttempts : 1
  const flagAccuracy = flagAttempts > 0 ? correctFlagAttempts / flagAttempts : 1
  const wrongFlags = countWrongFlags(game)
  const correctFlags = countCorrectFlags(game)
  const fitness =
    game.revealedSafe * 1.8 +
    correctFlags * 1.3 -
    wrongFlags * 3.8 +
    (game.status === 'won' ? 85 : 0) -
    (game.status === 'lost' ? 15 : 0) +
    clearedRatio * 18 +
    revealAccuracy * 6 +
    flagAccuracy * 4 -
    steps * 0.06

  return {
    fitness,
    win: game.status === 'won',
    clearedRatio,
    revealAccuracy,
    flagAccuracy,
    moves: game.moveCount,
    survivalTurns: game.moveCount,
  }
}

function aggregateMetrics(results: GameMetrics[]): EvalAggregate {
  const totals = results.reduce(
    (accumulator, result) => {
      accumulator.games += 1
      accumulator.wins += result.win ? 1 : 0
      accumulator.losses += result.win ? 0 : 1
      accumulator.avgFitness += result.fitness
      accumulator.avgClearedRatio += result.clearedRatio
      accumulator.avgRevealAccuracy += result.revealAccuracy
      accumulator.avgFlagAccuracy += result.flagAccuracy
      accumulator.avgMoves += result.moves
      accumulator.avgSurvivalTurns += result.survivalTurns
      return accumulator
    },
    {
      games: 0,
      wins: 0,
      losses: 0,
      avgFitness: 0,
      avgClearedRatio: 0,
      avgRevealAccuracy: 0,
      avgFlagAccuracy: 0,
      avgMoves: 0,
      avgSurvivalTurns: 0,
    },
  )

  const games = Math.max(1, totals.games)
  return {
    games: totals.games,
    wins: totals.wins,
    losses: totals.losses,
    avgFitness: totals.avgFitness / games,
    avgClearedRatio: totals.avgClearedRatio / games,
    avgRevealAccuracy: totals.avgRevealAccuracy / games,
    avgFlagAccuracy: totals.avgFlagAccuracy / games,
    avgMoves: totals.avgMoves / games,
    avgSurvivalTurns: totals.avgSurvivalTurns / games,
  }
}

function evaluateGenome(
  genome: TrainingGenome,
  settings: TrainingSettings,
  seeds: number[],
): GenomeResult {
  const results = seeds.map((seed) => evaluateSingleGame(genome.network, settings, seed))
  const metrics = aggregateMetrics(results)

  return {
    id: genome.id,
    network: genome.network,
    fitness: metrics.avgFitness,
    metrics,
  }
}

export function buildGenerationSeeds(
  settings: TrainingSettings,
  generationNumber: number,
) {
  return {
    trainSeeds: Array.from({ length: settings.gamesPerGenome }, (_, index) =>
      hashSeed(settings.benchmarkSeed + generationNumber * 1009 + index * 97),
    ),
    validationSeeds: Array.from(
      { length: settings.validationGames },
      (_, index) =>
        hashSeed(settings.benchmarkSeed ^ (generationNumber * 4099 + index * 193)),
    ),
  }
}

export function evaluatePopulationChunk(
  genomes: TrainingGenome[],
  settings: TrainingSettings,
  seeds: number[],
) {
  return genomes.map((genome) => evaluateGenome(genome, settings, seeds))
}

export function rankGenomeResults(results: GenomeResult[], noveltyWeight = 0) {
  const rawRanked = [...results].sort(
    (left, right) =>
      right.fitness - left.fitness ||
      right.metrics.avgClearedRatio - left.metrics.avgClearedRatio ||
      right.metrics.avgSurvivalTurns - left.metrics.avgSurvivalTurns,
  )
  const anchor = rawRanked[0]?.network ?? null
  const noveltyScale = clamp(noveltyWeight, 0, 1) * 18

  return [...results].sort(
    (left, right) => {
      const leftScore =
        left.fitness +
        (anchor ? networkDistance(anchor, left.network) * noveltyScale : 0)
      const rightScore =
        right.fitness +
        (anchor ? networkDistance(anchor, right.network) * noveltyScale : 0)

      return (
        rightScore - leftScore ||
        right.fitness - left.fitness ||
      right.metrics.avgClearedRatio - left.metrics.avgClearedRatio ||
        right.metrics.avgSurvivalTurns - left.metrics.avgSurvivalTurns
      )
    },
  )
}

function tournament(
  results: GenomeResult[],
  random: RandomSource,
  tournamentSize: number,
): GenomeResult {
  const size = Math.min(Math.max(2, Math.round(tournamentSize)), results.length)
  let winner = results[random.nextInt(results.length)]
  for (let pick = 1; pick < size; pick += 1) {
    const challenger = results[random.nextInt(results.length)]
    if (challenger.fitness > winner.fitness) {
      winner = challenger
    }
  }
  return winner
}

function crossover(
  left: NeuralNetwork,
  right: NeuralNetwork,
  random: RandomSource,
): NeuralNetwork {
  const child = cloneNetwork(left)

  for (let layerIndex = 0; layerIndex < child.weights.length; layerIndex += 1) {
    const matrix = child.weights[layerIndex]
    const rightMatrix = right.weights[layerIndex]
    for (let index = 0; index < matrix.values.length; index += 1) {
      const choice = random.next()
      if (choice < 0.45) {
        matrix.values[index] = rightMatrix.values[index]
      } else if (choice < 0.9) {
        matrix.values[index] = (matrix.values[index] + rightMatrix.values[index]) / 2
      }
    }

    for (let index = 0; index < child.biases[layerIndex].length; index += 1) {
      const choice = random.next()
      if (choice < 0.45) {
        child.biases[layerIndex][index] = right.biases[layerIndex][index]
      } else if (choice < 0.9) {
        child.biases[layerIndex][index] =
          (child.biases[layerIndex][index] + right.biases[layerIndex][index]) / 2
      }
    }
  }

  return child
}

function mutate(network: NeuralNetwork, settings: TrainingSettings, random: RandomSource): NeuralNetwork {
  const next = cloneNetwork(network)

  for (const matrix of next.weights) {
    for (let index = 0; index < matrix.values.length; index += 1) {
      if (random.next() < settings.mutationRate) {
        matrix.values[index] += gaussian(random) * settings.mutationScale
      }
    }
  }

  for (const bias of next.biases) {
    for (let index = 0; index < bias.length; index += 1) {
      if (random.next() < settings.mutationRate) {
        bias[index] += gaussian(random) * settings.mutationScale
      }
    }
  }

  return next
}

function seedPopulation(
  settings: TrainingSettings,
  generation: number,
  seedChampion: NeuralNetwork | null,
): Genome[] {
  const random = createRandom(hashSeed(settings.benchmarkSeed + generation * 101))
  const layers = [INPUT_FEATURES, ...settings.hiddenLayers, OUTPUT_HEADS]
  const genomes: Genome[] = []

  if (seedChampion) {
    const champion = normalizeNetworkShape(seedChampion, layers, random)
    genomes.push({
      id: makeGenomeId(generation, 0),
      network: champion,
    })

    for (let index = 1; index < settings.populationSize; index += 1) {
      genomes.push({
        id: makeGenomeId(generation, index),
        network: mutate(champion, settings, random),
      })
    }

    return genomes
  }

  for (let index = 0; index < settings.populationSize; index += 1) {
    genomes.push({
      id: makeGenomeId(generation, index),
      network: createNetwork(layers, random),
    })
  }

  return genomes
}

function breedPopulation(
  settings: TrainingSettings,
  generation: number,
  ranked: GenomeResult[],
  plan: BreedingPlan,
): Genome[] {
  const random = createRandom(hashSeed(settings.benchmarkSeed + generation * 31337))
  const elites = ranked.slice(0, plan.eliteCount)
  const adaptiveSettings = {
    ...settings,
    mutationRate: plan.mutationRate,
    mutationScale: plan.mutationScale,
  }
  const next: Genome[] = elites.map((result, index) => ({
    id: makeGenomeId(generation, index),
    network: cloneNetwork(result.network),
  }))

  while (next.length < settings.populationSize - plan.immigrantCount) {
    const left = tournament(ranked, random, settings.tournamentSize)
    const right = tournament(ranked, random, settings.tournamentSize)
    let child =
      random.next() < settings.crossoverRate
        ? crossover(left.network, right.network, random)
        : cloneNetwork(left.network)
    child = mutate(child, adaptiveSettings, random)
    next.push({
      id: makeGenomeId(generation, next.length),
      network: child,
    })
  }

  while (next.length < settings.populationSize) {
    next.push({
      id: makeGenomeId(generation, next.length),
      network: createNetwork(ranked[0].network.layers, random),
    })
  }

  return next
}

export function finalizeGeneration(
  settings: TrainingSettings,
  generationNumber: number,
  evaluationResults: GenomeResult[],
  previousChampion: NeuralNetwork | null,
  validationSeeds: number[],
  evolution = createEvolutionState(),
): {
  summary: GenerationSummary
  nextPopulation: Genome[]
  evolution: EvolutionState
} {
  const ranked = rankGenomeResults(evaluationResults, settings.noveltyWeight)

  const champion = ranked[0]
  const benchmark = aggregateMetrics(
    validationSeeds.map((seed) => evaluateSingleGame(champion.network, settings, seed)),
  )
  const bestFitness = champion.fitness
  const averageFitness =
    ranked.reduce((sum, result) => sum + result.fitness, 0) / Math.max(1, ranked.length)
  const medianFitness = ranked[Math.floor(ranked.length / 2)]?.fitness ?? champion.fitness
  const lowestFitness = ranked[ranked.length - 1]?.fitness ?? champion.fitness
  const driftFromPrevious = networkDistance(previousChampion, champion.network)
  const populationDiversity = estimatePopulationDiversity(ranked)
  const nextEvolution = fitnessImproved(evolution.bestFitness, champion.fitness)
    ? {
        bestFitness: champion.fitness,
        stagnation: 0,
      }
    : {
        bestFitness: Math.max(evolution.bestFitness, champion.fitness),
        stagnation: evolution.stagnation + 1,
      }
  const breedingPlan = buildBreedingPlan(settings, nextEvolution, populationDiversity)
  const nextPopulation = breedPopulation(
    settings,
    generationNumber + 1,
    ranked,
    breedingPlan,
  )

  return {
    summary: {
      profileId: '',
      generation: generationNumber,
      board: { ...settings.board },
      championId: champion.id,
      champion: champion.network,
      bestFitness,
      averageFitness,
      medianFitness,
      lowestFitness,
      benchmark,
      populationTopFitness: ranked.slice(0, 48).map((result) => result.fitness),
      weightStats: summarizeWeights(champion.network),
      driftFromPrevious,
      populationDiversity,
      explorationPressure: breedingPlan.explorationPressure,
      adaptiveMutationRate: breedingPlan.mutationRate,
      adaptiveMutationScale: breedingPlan.mutationScale,
      immigrantCount: breedingPlan.immigrantCount,
      stagnationCount: nextEvolution.stagnation,
      createdAt: Date.now(),
    },
    nextPopulation,
    evolution: nextEvolution,
  }
}

export function runGeneration(
  settings: TrainingSettings,
  generationNumber: number,
  population: Genome[],
  previousChampion: NeuralNetwork | null,
  evolution = createEvolutionState(),
): {
  summary: GenerationSummary
  nextPopulation: Genome[]
  evolution: EvolutionState
} {
  const { trainSeeds, validationSeeds } = buildGenerationSeeds(
    settings,
    generationNumber,
  )
  const evaluationResults = evaluatePopulationChunk(
    population,
    settings,
    trainSeeds,
  )

  return finalizeGeneration(
    settings,
    generationNumber,
    evaluationResults,
    previousChampion,
    validationSeeds,
    evolution,
  )
}

export function initializePopulation(
  settings: TrainingSettings,
  existingGenerationCount: number,
  seedChampion: NeuralNetwork | null,
): Genome[] {
  return seedPopulation(settings, existingGenerationCount + 1, seedChampion)
}
