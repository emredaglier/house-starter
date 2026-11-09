// What the route sweep asserts of one route: it loads (status 200, no console error, page error,
// failed request or 4xx subresource: `visit`), has a title, and has one visible h1 in its main.
// Proven against a broken page by smoke/checks.selftest.spec.ts.
import type { Page } from '@playwright/test'

import type { Visit } from './fixtures.ts'

export async function sweepProblems(page: Page, visit: Visit, route: string): Promise<string[]> {
  const problems = await visit(route)
  if (!(await page.title()).trim()) problems.push('the page has no <title>')
  const h1 = page.locator('main#main h1')
  if ((await h1.count()) !== 1) problems.push(`${await h1.count()} <h1> in main#main, want 1`)
  else if (!(await h1.isVisible())) problems.push('the <h1> is not visible')
  return problems
}
