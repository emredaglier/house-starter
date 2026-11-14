import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTunings,
  registerTuning,
  resetTuning,
  setTuningValue,
  subscribeTuning,
  tuningPayload,
} from './tuning'

afterEach(resetTuning)

const controls = {
  ease: { kind: 'ease', value: 'power2.out' },
  duration: { kind: 'time', value: 0.6 },
} as const

describe('the tuning registry', () => {
  it('lists a registered piece with its defaults as current values', () => {
    registerTuning('hero', controls)
    expect(getTunings()).toEqual([
      { name: 'hero', controls, values: { ease: 'power2.out', duration: 0.6 } },
    ])
  })

  it('changes one value, tells the piece and the subscribers, and leaves the others alone', () => {
    const onChange = vi.fn()
    const listener = vi.fn()
    registerTuning('hero', controls, onChange)
    subscribeTuning(listener)
    setTuningValue('hero', 'duration', 1.2)
    expect(getTunings()[0]?.values).toEqual({ ease: 'power2.out', duration: 1.2 })
    expect(onChange).toHaveBeenCalledWith({ ease: 'power2.out', duration: 1.2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores a value for an unknown piece or key', () => {
    registerTuning('hero', controls)
    const listener = vi.fn()
    subscribeTuning(listener)
    setTuningValue('nope', 'duration', 1)
    setTuningValue('hero', 'nope', 1)
    expect(getTunings()[0]?.values).toEqual({ ease: 'power2.out', duration: 0.6 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('returns the same snapshot until something changes (safe for useSyncExternalStore)', () => {
    registerTuning('hero', controls)
    const before = getTunings()
    expect(getTunings()).toBe(before)
    setTuningValue('hero', 'duration', 2)
    expect(getTunings()).not.toBe(before)
  })

  it('does not change what a piece registered with when the panel edits a value', () => {
    registerTuning('hero', controls)
    setTuningValue('hero', 'duration', 2)
    expect(controls.duration.value).toBe(0.6)
    expect(getTunings()[0]?.controls.duration?.value).toBe(0.6)
  })

  it('removes a piece on unregister, once, and not a newer piece of the same name', () => {
    const first = registerTuning('hero', controls)
    const second = registerTuning('hero', { ease: { kind: 'ease', value: 'none' } })
    first()
    expect(getTunings().map((t) => t.values)).toEqual([{ ease: 'none' }])
    second()
    second()
    expect(getTunings()).toEqual([])
  })

  it('stops telling a subscriber that unsubscribed', () => {
    const listener = vi.fn()
    const stop = subscribeTuning(listener)
    stop()
    registerTuning('hero', controls)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('tuningPayload', () => {
  it('is the current values of every piece, by piece name', () => {
    registerTuning('hero', controls)
    registerTuning('menu', {
      gap: { kind: 'spacing', value: '1rem' },
      tint: { kind: 'color', value: '#fff' },
    })
    setTuningValue('hero', 'ease', 'expo.out')
    setTuningValue('menu', 'gap', '2rem')
    expect(tuningPayload()).toEqual({
      pieces: {
        hero: { ease: 'expo.out', duration: 0.6 },
        menu: { gap: '2rem', tint: '#fff' },
      },
    })
  })

  it('is empty when nothing is registered', () => {
    expect(tuningPayload()).toEqual({ pieces: {} })
  })

  it('survives a JSON round trip unchanged', () => {
    registerTuning('hero', controls)
    expect(JSON.parse(JSON.stringify(tuningPayload()))).toEqual(tuningPayload())
  })
})
