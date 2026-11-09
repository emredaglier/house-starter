import { describe, expect, it } from 'vitest'

import { SCENARIOS, skipReason } from './scenarios.ts'

describe('scenario registry', () => {
  it('has unique ids', () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every scenario names the page it runs on and the element that proves the feature exists', () => {
    for (const s of SCENARIOS) {
      expect(s.path.startsWith('/')).toBe(true)
      expect(s.requires.length).toBeGreaterThan(0)
      expect(s.steps.length).toBeGreaterThan(0)
    }
  })

  it('measures the example effect, and every route it names exists in the web app', async () => {
    const { existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    for (const s of SCENARIOS) {
      const page = resolve(import.meta.dirname, '../apps/web/src/app', `.${s.path}`, 'page.tsx')
      expect(existsSync(page), `${s.id}: no page at ${s.path}`).toBe(true)
    }
    expect(SCENARIOS.map((s) => s.id)).toContain('glow-sweep')
  })
})

describe('skipReason', () => {
  const [scenario] = SCENARIOS
  it('skips a scenario whose feature is not on the page, with a notice', () => {
    expect(skipReason(scenario!, 0)).toContain(scenario!.requires)
  })
  it('runs it when the feature is there', () => {
    expect(skipReason(scenario!, 1)).toBeNull()
  })
})
