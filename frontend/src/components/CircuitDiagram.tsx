/*
 * Draws the QAOA circuit from the gate list the API rebuilt from the solver's
 * reported angles (src/waterweave/api/service.py, circuit_details). Gates are
 * placed left to right in phases: preparation, then for each layer the cost
 * gates (RZZ, RZ) and the mixer gates (RX).
 */
import type { CircuitInfo } from '../api/types'
import { formatNumber } from '../lib/format'
import { ScrollRegion } from './ScrollRegion'

export interface PlacedGate {
  name: string
  qubits: number[]
  column: number
  phase: number
}

export interface Phase {
  label: string
  detail: string
  start: number
  end: number
}

/** Splits gates into phases and packs each phase into as few columns as possible. */
export function layoutCircuit(circuit: CircuitInfo): { gates: PlacedGate[]; phases: Phase[]; columns: number } {
  // Phase 0 prepares (H). Layer l has a cost phase 2l+1 (RZZ, RZ) and a mixer
  // phase 2l+2 (RX); a cost gate after a mixer gate starts the next layer.
  const phased: { name: string; qubits: number[]; phase: number }[] = []
  let layer = 0
  let afterMixer = false
  for (const g of circuit.gates) {
    if (g.name === 'h') {
      phased.push({ name: g.name, qubits: g.qubits, phase: 0 })
      continue
    }
    if (g.name === 'rx') {
      afterMixer = true
      phased.push({ name: g.name, qubits: g.qubits, phase: 2 * layer + 2 })
      continue
    }
    if (afterMixer) {
      layer += 1
      afterMixer = false
    }
    phased.push({ name: g.name, qubits: g.qubits, phase: 2 * layer + 1 })
  }

  const gates: PlacedGate[] = []
  const phases: Phase[] = []
  let offset = 0
  const phaseCount = phased.reduce((m, g) => Math.max(m, g.phase), 0) + 1
  for (let p = 0; p < phaseCount; p++) {
    const inPhase = phased.filter((g) => g.phase === p)
    if (!inPhase.length) continue
    const busyUntil = new Array(circuit.num_qubits).fill(-1)
    let width = 0
    for (const g of inPhase) {
      const lo = Math.min(...g.qubits)
      const hi = Math.max(...g.qubits)
      let col = 0
      for (let q = lo; q <= hi; q++) col = Math.max(col, busyUntil[q] + 1)
      for (let q = lo; q <= hi; q++) busyUntil[q] = col
      gates.push({ name: g.name, qubits: g.qubits, column: offset + col, phase: p })
      width = Math.max(width, col + 1)
    }
    // Leave room for the phase label above narrow phases.
    width = Math.max(width, 3)
    const l = Math.floor((p - 1) / 2)
    phases.push({
      label: p === 0 ? 'Prepare' : p % 2 === 1 ? `Cost ${l + 1}` : `Mix ${l + 1}`,
      detail:
        p === 0
          ? 'H on every qubit'
          : p % 2 === 1
            ? `γ = ${formatNumber(circuit.gammas[l], 3)}`
            : `β = ${formatNumber(circuit.betas[l], 3)}`,
      start: offset,
      end: offset + width,
    })
    offset += width
  }
  return { gates, phases, columns: offset }
}

const COL = 34
const ROW = 34
const TOP = 58

export function CircuitDiagram({ circuit, labels }: { circuit: CircuitInfo; labels: string[] }) {
  const { gates, phases, columns } = layoutCircuit(circuit)
  const width = columns * COL + 16
  const height = TOP + circuit.num_qubits * ROW + 8
  const y = (q: number) => TOP + q * ROW + ROW / 2
  const x = (c: number) => c * COL + COL / 2
  const counts = Object.entries(circuit.gate_counts)
    .map(([name, n]) => `${n} ${name.toUpperCase()}`)
    .join(', ')

  return (
    <div className="circuit-figure">
      {/* Qubit names stay in view while the gates scroll sideways. They are HTML so they can wrap on phones;
          each row is exactly one wire high. */}
      <ol className="circuit-labels" style={{ paddingTop: TOP }} aria-hidden="true">
        {labels.slice(0, circuit.num_qubits).map((label, q) => (
          <li key={q} style={{ height: ROW }}>
            {label}
          </li>
        ))}
      </ol>
      <ScrollRegion className="circuit-wrap" label="QAOA circuit diagram">
        <svg
          className="circuit"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`QAOA circuit on ${circuit.num_qubits} qubits, depth ${circuit.depth}, ${circuit.layers} layer(s): ${counts} gates.`}
        >
          {phases.map((p, i) => (
            <g key={p.label}>
              <rect
                className={`circuit__phase circuit__phase--${p.label === 'Prepare' ? 'prep' : p.label.startsWith('Cost') ? 'cost' : 'mix'}`}
                x={p.start * COL + 2}
                y={TOP - 50}
                width={(p.end - p.start) * COL - 4}
                height={height - TOP + 46}
                rx={6}
              />
              <text className="circuit__phase-label" x={p.start * COL + 9} y={TOP - 31}>
                {p.label}
              </text>
              <text className="circuit__phase-detail" x={p.start * COL + 9} y={TOP - 13}>
                {i === 0 ? '' : p.detail}
              </text>
            </g>
          ))}
          {labels.slice(0, circuit.num_qubits).map((_, q) => (
            <line key={q} className="circuit__wire" x1={0} y1={y(q)} x2={width - 8} y2={y(q)} />
          ))}
          {gates.map((g, i) => {
            if (g.qubits.length === 2) {
              const [a, b] = g.qubits
              return (
                <g key={i} className="circuit__rzz">
                  <line x1={x(g.column)} y1={y(a)} x2={x(g.column)} y2={y(b)} />
                  <circle cx={x(g.column)} cy={y(a)} r={5.5} />
                  <circle cx={x(g.column)} cy={y(b)} r={5.5} />
                </g>
              )
            }
            const q = g.qubits[0]
            return (
              <g key={i} className={`circuit__gate circuit__gate--${g.name}`}>
                <rect x={x(g.column) - 14} y={y(q) - 12} width={28} height={24} rx={4} />
                <text x={x(g.column)} y={y(q) + 4.5} textAnchor="middle">
                  {g.name.toUpperCase()}
                </text>
              </g>
            )
          })}
        </svg>
      </ScrollRegion>
    </div>
  )
}
