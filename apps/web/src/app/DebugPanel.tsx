'use client'

import { setTuningValue, tuningPayload, type TuningKind } from '@house/motion'
import { useTunings } from '@house/motion/react'
import { useState } from 'react'

import { saveTuning } from '../lib/tuning-save'

const INPUT_TYPE: Record<TuningKind, string> = {
  ease: 'text',
  time: 'number',
  color: 'text',
  spacing: 'text',
}

/**
 * The `?debug` tuning panel (ticket 28b): an input per registered value, and Save posts them to HQ.
 * Only `DebugPanelLoader` imports it, and only outside a production build, so none of this reaches
 * a visitor (smoke/debug-panel-scan.ts looks for the marker below in the built files). Its look
 * has no automated test.
 */
export default function DebugPanel() {
  // Only ever rendered in the browser (DebugPanelLoader loads it with ssr: false), so markup never differs.
  const [on] = useState(() => new URLSearchParams(window.location.search).has('debug'))
  const [status, setStatus] = useState('')
  const tunings = useTunings()
  const url = process.env.NEXT_PUBLIC_HQ_TUNING_URL

  if (!on) return null

  const save = async () => {
    setStatus('Saving...')
    const result = await saveTuning(url, { page: window.location.pathname, ...tuningPayload() })
    setStatus(result.ok ? 'Saved.' : `Not saved: ${result.error}`)
  }

  return (
    <aside
      data-house-debug-panel
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 2147483647,
        maxHeight: '80vh',
        overflow: 'auto',
        padding: 12,
        font: '12px/1.4 monospace',
        color: '#eee',
        background: 'rgba(0, 0, 0, 0.85)',
      }}
    >
      <strong>Tuning</strong>
      {tunings.length === 0 && <p>Nothing registered on this page.</p>}
      {tunings.map(({ name, controls, values }) => (
        <fieldset key={name}>
          <legend>{name}</legend>
          {Object.entries(controls).map(([key, { kind }]) => (
            <label key={key} style={{ display: 'block' }}>
              {key} ({kind}){' '}
              <input
                type={INPUT_TYPE[kind]}
                step={kind === 'time' ? 'any' : undefined}
                value={values[key] ?? ''}
                onChange={(event) =>
                  setTuningValue(
                    name,
                    key,
                    kind === 'time' ? Number(event.target.value) : event.target.value,
                  )
                }
              />
            </label>
          ))}
        </fieldset>
      ))}
      <button type="button" disabled={!url} onClick={save}>
        Save
      </button>{' '}
      <span role="status">{url ? status : 'NEXT_PUBLIC_HQ_TUNING_URL is not set.'}</span>
    </aside>
  )
}
