import { FEATURE_LABELS } from '../lib/constants'
import type { NeuralNetwork } from '../types'

interface NetworkGraphProps {
  network: NeuralNetwork | null
}

interface NodePosition {
  x: number
  y: number
  label: string
}

interface Edge {
  x1: number
  y1: number
  x2: number
  y2: number
  value: number
}

function buildNodes(network: NeuralNetwork): NodePosition[][] {
  return network.layers.map((size, layerIndex) => {
    const x = 80 + (layerIndex / Math.max(1, network.layers.length - 1)) * 640
    return Array.from({ length: size }, (_, nodeIndex) => {
      const y = 40 + ((nodeIndex + 1) / (size + 1)) * 320
      const label =
        layerIndex === 0
          ? FEATURE_LABELS[nodeIndex] ?? `in ${nodeIndex + 1}`
          : layerIndex === network.layers.length - 1
            ? nodeIndex === 0
              ? 'open'
              : 'flag'
            : `h${layerIndex}.${nodeIndex + 1}`

      return { x, y, label }
    })
  })
}

function pickEdges(network: NeuralNetwork, nodes: NodePosition[][]): Edge[] {
  const edges: Edge[] = []

  network.weights.forEach((matrix, layerIndex) => {
    const left = nodes[layerIndex]
    const right = nodes[layerIndex + 1]
    for (let row = 0; row < matrix.rows; row += 1) {
      const offset = row * matrix.cols
      for (let col = 0; col < matrix.cols; col += 1) {
        edges.push({
          x1: left[col].x,
          y1: left[col].y,
          x2: right[row].x,
          y2: right[row].y,
          value: matrix.values[offset + col],
        })
      }
    }
  })

  return edges.sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 140)
}

export function NetworkGraph({ network }: NetworkGraphProps) {
  if (!network) {
    return <div className="graph-empty">Выберите поколение, чтобы посмотреть веса чемпиона.</div>
  }

  const nodes = buildNodes(network)
  const edges = pickEdges(network, nodes)

  return (
    <div className="graph-shell">
      <svg viewBox="0 0 800 380" className="network-svg" role="img" aria-label="Champion network">
        <g className="network-edges">
          {edges.map((edge, index) => (
            <line
              key={index}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={edge.value >= 0 ? 'rgba(113, 144, 108, 0.42)' : 'rgba(184, 127, 88, 0.38)'}
              strokeWidth={0.4 + Math.min(2.6, Math.abs(edge.value) * 2.4)}
            />
          ))}
        </g>
        <g className="network-nodes">
          {nodes.flat().map((node) => (
            <g key={`${node.x}-${node.y}-${node.label}`}>
              <circle cx={node.x} cy={node.y} r="7" />
              {node.x < 150 || node.x > 650 ? (
                <text x={node.x + (node.x < 150 ? -12 : 12)} y={node.y + 4} textAnchor={node.x < 150 ? 'end' : 'start'}>
                  {node.label}
                </text>
              ) : null}
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
