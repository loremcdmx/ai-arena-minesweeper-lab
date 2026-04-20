import type {
  CandidateEvaluation,
  GameSession,
  NeuralNetwork,
  WeightMatrix,
  WeightStats,
} from '../types'
import { countHiddenCells, countNeighborState, forEachNeighbor } from './minesweeper'
import type { RandomSource } from './random'

export const INPUT_FEATURES = 24
export const OUTPUT_HEADS = 3

function createWeightMatrix(rows: number, cols: number, random: RandomSource): WeightMatrix {
  const limit = Math.sqrt(6 / (rows + cols))
  return {
    rows,
    cols,
    values: Array.from({ length: rows * cols }, () => (random.next() * 2 - 1) * limit),
  }
}

export function createNetwork(layers: number[], random: RandomSource): NeuralNetwork {
  const weights: WeightMatrix[] = []
  const biases: number[][] = []

  for (let index = 0; index < layers.length - 1; index += 1) {
    weights.push(createWeightMatrix(layers[index + 1], layers[index], random))
    biases.push(Array.from({ length: layers[index + 1] }, () => (random.next() * 2 - 1) * 0.2))
  }

  return { layers, weights, biases }
}

export function cloneNetwork(network: NeuralNetwork): NeuralNetwork {
  return {
    layers: [...network.layers],
    weights: network.weights.map((matrix) => ({
      rows: matrix.rows,
      cols: matrix.cols,
      values: [...matrix.values],
    })),
    biases: network.biases.map((row) => [...row]),
  }
}

export function normalizeNetworkShape(
  network: NeuralNetwork,
  layers: number[],
  random: RandomSource,
): NeuralNetwork {
  if (
    network.layers.length === layers.length &&
    network.layers.every((size, index) => size === layers[index])
  ) {
    return cloneNetwork(network)
  }

  const next = createNetwork(layers, random)
  const layerCount = Math.min(network.weights.length, next.weights.length)

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const sourceMatrix = network.weights[layerIndex]
    const targetMatrix = next.weights[layerIndex]
    const rows = Math.min(sourceMatrix.rows, targetMatrix.rows)
    const cols = Math.min(sourceMatrix.cols, targetMatrix.cols)

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        targetMatrix.values[row * targetMatrix.cols + col] =
          sourceMatrix.values[row * sourceMatrix.cols + col]
      }
    }

    const biasCount = Math.min(
      network.biases[layerIndex].length,
      next.biases[layerIndex].length,
    )
    for (let index = 0; index < biasCount; index += 1) {
      next.biases[layerIndex][index] = network.biases[layerIndex][index]
    }
  }

  return next
}

function activate(value: number): number {
  return Math.tanh(value)
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

export function forward(network: NeuralNetwork, input: number[]): number[] {
  let state = input

  for (let layerIndex = 0; layerIndex < network.weights.length; layerIndex += 1) {
    const matrix = network.weights[layerIndex]
    const bias = network.biases[layerIndex]
    const next = new Array<number>(matrix.rows)

    for (let row = 0; row < matrix.rows; row += 1) {
      let sum = bias[row]
      const offset = row * matrix.cols
      for (let col = 0; col < matrix.cols; col += 1) {
        sum += matrix.values[offset + col] * state[col]
      }
      next[row] =
        layerIndex === network.weights.length - 1 ? sum : activate(sum)
    }

    state = next
  }

  return state
}

function getConstraintFeatures(game: GameSession, row: number, col: number) {
  let clueCount = 0
  let clueMin = 1
  let clueMax = 0
  let clueSum = 0
  let riskSum = 0
  let minRisk = 1
  let maxRisk = 0
  let safeSignal = 0
  let mineSignal = 0
  let satisfied = 0

  forEachNeighbor(game.config, row, col, (nextRow, nextCol) => {
    const cell = game.board[nextRow][nextCol]
    if (!cell.revealed) {
      return
    }

    clueCount += 1
    const clueValue = cell.adjacent / 8
    clueSum += clueValue
    clueMin = Math.min(clueMin, clueValue)
    clueMax = Math.max(clueMax, clueValue)

    let flagged = 0
    let unresolved = 0
    forEachNeighbor(game.config, nextRow, nextCol, (neighborRow, neighborCol) => {
      const neighbor = game.board[neighborRow][neighborCol]
      if (neighbor.flagged) {
        flagged += 1
      } else if (!neighbor.revealed) {
        unresolved += 1
      }
    })

    if (flagged === cell.adjacent) {
      satisfied += 1
    }

    const remainingMines = Math.max(0, cell.adjacent - flagged)
    const risk = unresolved > 0 ? remainingMines / unresolved : 0
    riskSum += risk
    minRisk = Math.min(minRisk, risk)
    maxRisk = Math.max(maxRisk, risk)

    if (remainingMines === 0) {
      safeSignal += 1
    } else if (remainingMines === unresolved) {
      mineSignal += 1
    }
  })

  return {
    frontier: clueCount > 0,
    clueCount,
    clueMin: clueCount > 0 ? clueMin : 0,
    clueMax,
    clueAvg: clueCount > 0 ? clueSum / clueCount : 0,
    riskAvg: clueCount > 0 ? riskSum / clueCount : 0.5,
    minRisk: clueCount > 0 ? minRisk : 0.5,
    maxRisk,
    safeSignal: clueCount > 0 ? safeSignal / clueCount : 0,
    mineSignal: clueCount > 0 ? mineSignal / clueCount : 0,
    satisfiedFraction: clueCount > 0 ? satisfied / clueCount : 0,
  }
}

export function extractFeatures(game: GameSession, row: number, col: number): number[] {
  const hiddenCells = countHiddenCells(game)
  const remainingMines = Math.max(0, game.config.mines - game.flagsUsed)
  const adjacentRevealed = countNeighborState(game, row, col, (cell) => cell.revealed)
  const adjacentFlagged = countNeighborState(game, row, col, (cell) => cell.flagged)
  const adjacentHidden = countNeighborState(
    game,
    row,
    col,
    (cell) => !cell.revealed && !cell.flagged,
  )

  let radiusTwoRevealed = 0
  let radiusTwoCells = 0
  for (let deltaRow = -2; deltaRow <= 2; deltaRow += 1) {
    for (let deltaCol = -2; deltaCol <= 2; deltaCol += 1) {
      const nextRow = row + deltaRow
      const nextCol = col + deltaCol
      if (nextRow < 0 || nextCol < 0 || nextRow >= game.config.rows || nextCol >= game.config.cols) {
        continue
      }
      radiusTwoCells += 1
      if (game.board[nextRow][nextCol].revealed) {
        radiusTwoRevealed += 1
      }
    }
  }

  const constraints = getConstraintFeatures(game, row, col)
  const rowNorm = game.config.rows > 1 ? row / (game.config.rows - 1) : 0
  const colNorm = game.config.cols > 1 ? col / (game.config.cols - 1) : 0
  const centerDistance =
    Math.hypot(rowNorm - 0.5, colNorm - 0.5) / Math.hypot(0.5, 0.5)
  const edgeBias =
    row === 0 || col === 0 || row === game.config.rows - 1 || col === game.config.cols - 1 ? 1 : 0
  const cornerBias =
    (row === 0 || row === game.config.rows - 1) &&
    (col === 0 || col === game.config.cols - 1)
      ? 1
      : 0

  return [
    1,
    rowNorm * 2 - 1,
    colNorm * 2 - 1,
    1 - centerDistance,
    hiddenCells / (game.config.rows * game.config.cols),
    game.flagsUsed / Math.max(1, game.config.mines),
    remainingMines / Math.max(1, hiddenCells),
    adjacentRevealed / 8,
    adjacentFlagged / 8,
    adjacentHidden / 8,
    constraints.frontier ? 1 : 0,
    constraints.safeSignal,
    constraints.mineSignal,
    constraints.minRisk,
    constraints.riskAvg,
    constraints.maxRisk,
    constraints.clueMin,
    constraints.clueAvg,
    constraints.clueMax,
    constraints.satisfiedFraction,
    radiusTwoCells > 0 ? radiusTwoRevealed / radiusTwoCells : 0,
    edgeBias,
    cornerBias,
    Math.min(1, game.moveCount / Math.max(1, game.totalSafe)),
  ]
}

export function evaluateCandidate(
  network: NeuralNetwork,
  game: GameSession,
  row: number,
  col: number,
): CandidateEvaluation {
  const features = extractFeatures(game, row, col)
  const constraints = {
    safeSignal: features[11],
    mineSignal: features[12],
    risk: features[14],
  }
  const outputs = forward(network, features)
  const [openHead, flagHead, valueHead] = outputs
  const valueScore =
    typeof valueHead === 'number'
      ? sigmoid(valueHead)
      : sigmoid(openHead - flagHead + constraints.safeSignal - constraints.mineSignal)
  const valueBias = (valueScore - 0.5) * 0.36
  const openScore = sigmoid(
    openHead + constraints.safeSignal * 2.2 - constraints.mineSignal * 1.8 + valueBias,
  )
  const flagScore = sigmoid(
    flagHead + constraints.mineSignal * 2.4 - constraints.safeSignal * 2.1 - valueBias,
  )

  return {
    row,
    col,
    openScore,
    flagScore,
    valueScore,
    riskEstimate: constraints.risk,
    exactRisk: null,
    solverSamples: 0,
    frontier: features[10] > 0,
    safeSignal: constraints.safeSignal,
    mineSignal: constraints.mineSignal,
    features,
  }
}

export function summarizeWeights(network: NeuralNetwork): WeightStats {
  const values = network.weights.flatMap((matrix) => matrix.values)
  const absValues = values.map((value) => Math.abs(value))
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  const meanAbs = absValues.reduce((sum, value) => sum + value, 0) / Math.max(1, absValues.length)
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length)

  return {
    meanAbs,
    maxAbs: absValues.reduce((max, value) => Math.max(max, value), 0),
    stdDev: Math.sqrt(variance),
  }
}

export function networkDistance(a: NeuralNetwork | null, b: NeuralNetwork): number {
  if (!a) {
    return 0
  }

  let total = 0
  let count = 0

  for (let layerIndex = 0; layerIndex < b.weights.length; layerIndex += 1) {
    const current = b.weights[layerIndex].values
    const previous = a.weights[layerIndex].values
    for (let index = 0; index < current.length; index += 1) {
      total += Math.abs(current[index] - previous[index])
      count += 1
    }
  }

  return count === 0 ? 0 : total / count
}
