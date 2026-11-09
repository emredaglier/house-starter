import { describe, expect, it } from 'vitest'

import { structureProblems } from './a11y.ts'

describe('structureProblems', () => {
  it('passes a page with a language, a title, one main and one h1', () => {
    expect(structureProblems({ lang: 'en', title: 'Home', mains: 1, h1s: 1 })).toEqual([])
  })

  it('names each thing missing or doubled', () => {
    expect(structureProblems({ lang: '', title: ' ', mains: 0, h1s: 2 })).toEqual([
      '<html> has no lang',
      'the page has no <title>',
      '0 <main> landmarks, want 1',
      '2 <h1> headings, want 1',
    ])
  })
})
