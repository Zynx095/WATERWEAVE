/*
 * The QUBO coefficients as a grid: the diagonal holds each bit's own (linear)
 * coefficient, the cells above it the pairwise couplings. Blue cells reward
 * switching both bits on, ochre cells penalise it. Values come from the API's
 * build_model output; a table with every value sits underneath.
 */
import type { ModelDetails } from '../api/types'
import { formatNumber } from '../lib/format'
import { ScrollRegion } from './ScrollRegion'

export function CouplingMatrix({ model, labels, longLabels }: { model: ModelDetails; labels: string[]; longLabels: string[] }) {
  const n = model.n_vars
  const grid: (number | null)[][] = Array.from({ length: n }, (_, k) =>
    Array.from({ length: n }, (_, l) => (l === k ? model.qubo.linear[k] : l > k ? 0 : null)),
  )
  for (const [k, l, v] of model.qubo.quadratic) grid[k][l] = v
  const max = Math.max(...grid.flat().map((v) => Math.abs(v ?? 0)), 1e-9)
  const cell = 42

  const color = (v: number) => {
    if (Math.abs(v) < 1e-12) return 'var(--sheet)'
    const strength = 0.12 + 0.88 * Math.sqrt(Math.abs(v) / max)
    return v < 0
      ? `color-mix(in srgb, var(--indigo) ${Math.round(strength * 100)}%, white)`
      : `color-mix(in srgb, #b07a00 ${Math.round(strength * 100)}%, white)`
  }

  return (
    <figure className="matrix">
      <ScrollRegion className="matrix__scroll" label="QUBO coefficient grid">
        <svg
          viewBox={`0 0 ${56 + n * cell} ${56 + n * cell}`}
          width={56 + n * cell}
          height={56 + n * cell}
          role="img"
          aria-label={`QUBO coefficients for ${n} binary variables: ${model.qubo.quadratic.length} non-zero pairwise couplings. The table below lists every value.`}
        >
          {labels.map((label, i) => (
            <g key={i}>
              <text className="matrix__label" x={56 + i * cell + cell / 2} y={42} textAnchor="middle">
                {label}
              </text>
              <text className="matrix__label" x={48} y={56 + i * cell + cell / 2 + 5} textAnchor="end">
                {label}
              </text>
            </g>
          ))}
          {grid.map((row, k) =>
            row.map((v, l) =>
              v === null ? null : (
                <rect
                  key={`${k}-${l}`}
                  x={56 + l * cell + 1}
                  y={56 + k * cell + 1}
                  width={cell - 2}
                  height={cell - 2}
                  rx={3}
                  fill={color(v)}
                  className={k === l ? 'matrix__diag' : 'matrix__cell'}
                >
                  <title>
                    {k === l
                      ? `${longLabels[k]}: linear coefficient ${formatNumber(v, 3)}`
                      : `${longLabels[k]} with ${longLabels[l]}: ${formatNumber(v, 3)}`}
                  </title>
                </rect>
              ),
            ),
          )}
        </svg>
      </ScrollRegion>
      <ul className="matrix__key" aria-label="Short names used in the grid">
        {labels.map((label, i) => (
          <li key={label}>
            <strong>{label}</strong> {longLabels[i]}
          </li>
        ))}
      </ul>
      <figcaption className="matrix__legend">
        <span className="matrix__swatch matrix__swatch--neg" aria-hidden="true" /> negative: switching both on lowers
        the energy
        <span className="matrix__swatch matrix__swatch--pos" aria-hidden="true" /> positive: raises it (penalties,
        unevenness)
      </figcaption>
      <details className="explain">
        <summary>All {model.qubo.quadratic.length} couplings and {n} linear coefficients as a table</summary>
        <ScrollRegion className="table-scroll" label="QUBO coefficient table">
          <table className="data-table data-table--compact">
            <caption className="sr-only">QUBO coefficients</caption>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">With</th>
                <th scope="col">Coefficient</th>
              </tr>
            </thead>
            <tbody>
              {model.qubo.linear.map((v, k) => (
                <tr key={`l${k}`}>
                  <th scope="row">{longLabels[k]}</th>
                  <td>itself (linear)</td>
                  <td className="num">{formatNumber(v, 3)}</td>
                </tr>
              ))}
              {model.qubo.quadratic.map(([k, l, v]) => (
                <tr key={`q${k}-${l}`}>
                  <th scope="row">{longLabels[k]}</th>
                  <td>{longLabels[l]}</td>
                  <td className="num">{formatNumber(v, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </details>
    </figure>
  )
}
