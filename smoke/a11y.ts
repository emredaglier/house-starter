// The accessibility assertions: axe-core's critical and serious findings, plus the page structure
// every page needs (a language, a title, one main landmark, one h1). Used by smoke/a11y.spec.ts on
// every route, and proven against a broken page by smoke/checks.selftest.spec.ts.
//
// Adapted from darkroom.engineering's Satus (e2e/route-sweep.e2e.ts, MIT; see
// THIRD-PARTY-NOTICES.md): it runs axe on each route and keeps critical and serious findings only,
// so minor third-party findings do not churn the baseline.
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** What the page itself must have, read in the browser. */
export type Structure = { lang: string; title: string; mains: number; h1s: number }

/** The structure problems of a page, as sentences. Pure, so it is unit-tested. */
export function structureProblems({ lang, title, mains, h1s }: Structure): string[] {
  const problems: string[] = []
  if (!lang.trim()) problems.push('<html> has no lang')
  if (!title.trim()) problems.push('the page has no <title>')
  if (mains !== 1) problems.push(`${mains} <main> landmarks, want 1`)
  if (h1s !== 1) problems.push(`${h1s} <h1> headings, want 1`)
  return problems
}

/** Critical and serious axe violations and structure problems of the page now open; empty is clean. */
export async function a11yProblems(page: Page): Promise<string[]> {
  // Fonts change layout, so they change what axe measures for contrast.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  const results = await new AxeBuilder({ page }).analyze()
  const problems = results.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map(
      (violation) =>
        `axe ${violation.id} (${violation.impact}): ${violation.help} [${violation.nodes
          .map((node) => node.target.join(' '))
          .join(' | ')}]`,
    )
  const structure = await page.evaluate((): Structure => ({
    lang: document.documentElement.lang,
    title: document.title,
    mains: document.querySelectorAll('main, [role="main"]').length,
    h1s: document.querySelectorAll('h1').length,
  }))
  return [...problems, ...structureProblems(structure)]
}
