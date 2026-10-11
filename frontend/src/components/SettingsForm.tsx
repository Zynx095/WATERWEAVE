import { useId } from 'react'
import type { ModelDetails, SolveSettings } from '../api/types'
import type { Slice } from '../state/store'
import { NumberStepper } from './NumberStepper'

const SHOT_OPTIONS = [256, 512, 1024, 2048, 4096]

export interface SettingsFormProps {
  settings: SolveSettings
  onChange: (settings: Partial<SolveSettings>) => void
  model: Slice<ModelDetails>
  disabled?: boolean
}

/** Scoring weight and QAOA settings; ranges match the API's validation. */
export function SettingsForm({ settings, onChange, model, disabled = false }: SettingsFormProps) {
  const id = useId()
  const details = model.data
  const overBudget = details ? !details.qaoa_within_budget : false

  return (
    <div className="settings">
      <div className="field">
        <label htmlFor={`${id}-alpha`} className="field__label">
          Fairness weight
        </label>
        <div className="range">
          <input
            id={`${id}-alpha`}
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={settings.fairness_weight}
            disabled={disabled}
            aria-describedby={`${id}-alpha-hint`}
            onChange={(e) => onChange({ fairness_weight: Number(e.target.value) })}
          />
          <output htmlFor={`${id}-alpha`} className="range__value num">
            {settings.fairness_weight.toFixed(1)}
          </output>
        </div>
        <p id={`${id}-alpha-hint`} className="field__hint">
          How much uneven service costs compared with unmet demand. At 0 only shortage counts. Very high values
          make delivering nothing look best, because then nobody is served worse than anybody else.
        </p>
      </div>

      <fieldset className="fieldset" disabled={disabled}>
        <legend>Quantum solver (QAOA)</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.include_qaoa}
            onChange={(e) => onChange({ include_qaoa: e.target.checked })}
          />
          Include QAOA in the run
        </label>

        <div className="settings__grid" aria-disabled={!settings.include_qaoa || undefined}>
          <fieldset className="segmented" disabled={!settings.include_qaoa}>
            <legend>Layers (p)</legend>
            {[1, 2, 3].map((p) => (
              <label key={p} className="segmented__option">
                <input
                  type="radio"
                  name={`${id}-p`}
                  value={p}
                  checked={settings.p === p}
                  onChange={() => onChange({ p })}
                />
                <span>{p}</span>
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor={`${id}-shots`} className="field__label">
              Samples (shots)
            </label>
            <select
              id={`${id}-shots`}
              className="select"
              value={settings.shots}
              disabled={!settings.include_qaoa}
              onChange={(e) => onChange({ shots: Number(e.target.value) })}
            >
              {SHOT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.toLocaleString('en-GB')}
                </option>
              ))}
            </select>
          </div>

          <NumberStepper
            label="random seed"
            visibleLabel="Seed"
            value={settings.seed ?? 42}
            min={0}
            max={99999}
            onChange={(seed) => onChange({ seed })}
            disabled={!settings.include_qaoa}
            hint="Changes which samples are drawn."
          />

          <NumberStepper
            label="optimiser evaluations"
            visibleLabel="Optimiser steps"
            value={settings.maxiter}
            min={5}
            max={100}
            step={5}
            onChange={(maxiter) => onChange({ maxiter })}
            disabled={!settings.include_qaoa}
            hint="COBYLA evaluations after the 36-point grid."
          />
        </div>
      </fieldset>

      <div className="model-size" aria-live="polite">
        {model.status === 'loading' && !details && <p>Building the model.</p>}
        {model.status === 'error' && <p className="field__error">{model.error}</p>}
        {details && (
          <p>
            This scenario has <strong className="num">{details.n_decision}</strong> yes/no decisions. As a quantum
            circuit it needs <strong className="num">{details.n_vars} qubits</strong>: one per decision plus{' '}
            {details.n_slack} slack qubits that encode the supply and storage limits. Rule-breaking penalty P ={' '}
            <span className="num">{details.penalty_weight}</span>, set from the scenario.
            {overBudget && settings.include_qaoa && (
              <strong className="field__error">
                {' '}
                QAOA will be skipped: live simulation is limited to {details.max_qaoa_qubits} qubits.
              </strong>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
