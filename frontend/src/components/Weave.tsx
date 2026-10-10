/*
 * An allocation drawn as a weave. Each neighborhood is a horizontal warp
 * thread, each delivery slot a vertical weft thread. Where a unit is
 * delivered the slot thread crosses over and is dyed indigo; where a request
 * is unmet the crossing is marked with an open ring. The markup is a real
 * table, so screen readers get rows, columns and a text state per crossing.
 */
import type { Allocation, ScenarioSpec } from '../api/types'
import { capitalise, shortName } from '../lib/format'

export type CellState = 'delivered' | 'unmet' | 'requested' | 'none' | 'over'

export const CELL_TEXT: Record<CellState, string> = {
  delivered: 'Delivered',
  unmet: 'Requested, not delivered',
  requested: 'Requested',
  none: 'No request',
  over: 'Delivered without a request',
}

export function cellState(demand: number, allocated: number | null): CellState {
  if (allocated === null) return demand > 0 ? 'requested' : 'none'
  if (demand > 0) return allocated > 0 ? 'delivered' : 'unmet'
  return allocated > 0 ? 'over' : 'none'
}

const W = 112
const H = 72
const CX = W / 2
const CY = H / 2
const THREAD = 16

function Crossing({ state, index }: { state: CellState; index: number }) {
  const weftOver = state === 'delivered' || state === 'over'
  return (
    <svg
      className="weave__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line className="weave__weft" x1={CX} y1={0} x2={CX} y2={H} strokeWidth={THREAD} />
      <line className="weave__warp" x1={0} y1={CY} x2={W} y2={CY} strokeWidth={THREAD} />
      {weftOver ? (
        <>
          <line className="weave__halo" x1={CX} y1={CY - 16} x2={CX} y2={CY + 16} strokeWidth={THREAD + 10} />
          <line
            className={`weave__float weave__float--${state}`}
            style={{ ['--i' as string]: index }}
            x1={CX}
            y1={CY - 25}
            x2={CX}
            y2={CY + 25}
            strokeWidth={THREAD}
          />
        </>
      ) : (
        <>
          <line className="weave__halo" x1={CX - 15} y1={CY} x2={CX + 15} y2={CY} strokeWidth={THREAD + 10} />
          <line className="weave__warp" x1={CX - 17} y1={CY} x2={CX + 17} y2={CY} strokeWidth={THREAD} />
          {(state === 'unmet' || state === 'requested') && (
            <circle className={`weave__ring weave__ring--${state}`} cx={CX} cy={CY} r={10.5} />
          )}
        </>
      )}
    </svg>
  )
}

export interface WeaveProps {
  scenario: ScenarioSpec
  /** null shows requests only, before anything is allocated. */
  allocation: Allocation | null
  caption: string
  captionHidden?: boolean
  /** Changing this replays the draw-in of delivered threads. */
  animateKey?: string
  compact?: boolean
}

export function Weave({ scenario, allocation, caption, captionHidden = false, animateKey, compact = false }: WeaveProps) {
  const { slots, neighborhoods } = scenario
  const allocated = (nid: string, slot: string) => (allocation ? (allocation[nid]?.[slot] ?? 0) : null)

  const slotUse = slots.map((slot) => neighborhoods.reduce((sum, n) => sum + (allocated(n.id, slot) ?? 0), 0))
  const totalDemand = neighborhoods.reduce(
    (sum, n) => sum + slots.reduce((s, slot) => s + (n.demand_by_slot[slot] ?? 0), 0),
    0,
  )
  let index = 0

  return (
    <div className="weave-wrap">
      <table className={compact ? 'weave weave--compact' : 'weave'} key={animateKey}>
        <caption className={captionHidden ? 'sr-only' : 'weave__caption'}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="weave__corner">
              <span className="sr-only">Neighborhood</span>
            </th>
            {slots.map((slot) => (
              <th scope="col" key={slot} className="weave__slot">
                <span className="weave__slot-name">{capitalise(slot)}</span>
                <span className="weave__slot-meta">{scenario.supply_by_slot[slot] ?? 0} units available</span>
              </th>
            ))}
            <th scope="col" className="weave__summary-head">
              {allocation === null ? 'Requested' : 'Served'}
            </th>
          </tr>
        </thead>
        <tbody>
          {neighborhoods.map((n) => {
            const demand = slots.reduce((s, slot) => s + (n.demand_by_slot[slot] ?? 0), 0)
            const served = slots.reduce(
              (s, slot) => s + Math.min(allocated(n.id, slot) ?? 0, n.demand_by_slot[slot] ?? 0),
              0,
            )
            const stored = slots.reduce((s, slot) => s + (allocated(n.id, slot) ?? 0), 0)
            const overStorage = allocation !== null && stored > n.storage_capacity_units
            return (
              <tr key={n.id}>
                <th scope="row" className="weave__row-head">
                  <span className="weave__name">{shortName(n.name)}</span>
                  <span className="weave__meta">
                    Weight {n.priority_weight}, storage {n.storage_capacity_units}
                  </span>
                </th>
                {slots.map((slot) => {
                  const state = cellState(n.demand_by_slot[slot] ?? 0, allocated(n.id, slot))
                  const i = state === 'delivered' || state === 'over' ? index++ : index
                  return (
                    <td key={slot} className="weave__cell" data-state={state}>
                      <Crossing state={state} index={i} />
                      <span className="sr-only">{CELL_TEXT[state]}</span>
                    </td>
                  )
                })}
                <td className="weave__summary" data-over={overStorage || undefined}>
                  {allocation === null ? (
                    <span className="num">{demand}</span>
                  ) : (
                    <span className="num">
                      {served} of {demand}
                    </span>
                  )}
                  {overStorage && <span className="weave__warn">storage exceeded</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="weave__row-head weave__foot-head">
              {allocation === null ? 'Requested' : 'Units used'}
            </th>
            {slots.map((slot, i) => {
              const supply = scenario.supply_by_slot[slot] ?? 0
              const requested = neighborhoods.reduce((s, n) => s + (n.demand_by_slot[slot] ?? 0), 0)
              const over = allocation !== null && slotUse[i] > supply
              return (
                <td key={slot} className="weave__foot num" data-over={over || undefined}>
                  {allocation === null ? requested : `${slotUse[i]} of ${supply}`}
                  {over && <span className="weave__warn">over supply</span>}
                </td>
              )
            })}
            <td className="weave__foot num">
              {allocation === null
                ? `${totalDemand} in total`
                : `${slotUse.reduce((a, b) => a + b, 0)} of ${totalDemand} requested`}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function WeaveLegend({ mode = 'allocation' }: { mode?: 'allocation' | 'requests' }) {
  return (
    <ul className="weave-legend" aria-label="How to read the weave">
      {mode === 'allocation' ? (
        <>
          <li>
            <svg viewBox="0 0 40 24" aria-hidden="true">
              <line className="weave__warp" x1="0" y1="12" x2="40" y2="12" strokeWidth="6" />
              <line className="weave__halo" x1="20" y1="5" x2="20" y2="19" strokeWidth="11" />
              <line className="weave__float" x1="20" y1="1" x2="20" y2="23" strokeWidth="6" />
            </svg>
            Delivered: the slot thread crosses over, dyed blue
          </li>
          <li>
            <svg viewBox="0 0 40 24" aria-hidden="true">
              <line className="weave__weft" x1="20" y1="0" x2="20" y2="24" strokeWidth="6" />
              <line className="weave__warp" x1="0" y1="12" x2="40" y2="12" strokeWidth="6" />
              <circle className="weave__ring weave__ring--unmet" cx="20" cy="12" r="5" />
            </svg>
            Requested but not delivered
          </li>
        </>
      ) : (
        <li>
          <svg viewBox="0 0 40 24" aria-hidden="true">
            <line className="weave__weft" x1="20" y1="0" x2="20" y2="24" strokeWidth="6" />
            <line className="weave__warp" x1="0" y1="12" x2="40" y2="12" strokeWidth="6" />
            <circle className="weave__ring weave__ring--requested" cx="20" cy="12" r="5" />
          </svg>
          Requested, not yet allocated
        </li>
      )}
      <li>
        <svg viewBox="0 0 40 24" aria-hidden="true">
          <line className="weave__weft" x1="20" y1="0" x2="20" y2="24" strokeWidth="6" />
          <line className="weave__warp" x1="0" y1="12" x2="40" y2="12" strokeWidth="6" />
        </svg>
        No request in that slot
      </li>
    </ul>
  )
}
