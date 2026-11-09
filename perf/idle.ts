// Idle-CPU check: open a page that runs a decorative loop, wait until the idle timeout has passed,
// then touch nothing. Decorative loops must stop when idle, so the main thread should be almost
// free and requestAnimationFrame should be nearly silent. Chromium only:
// WebKit has no CDP metrics.
import { chromium } from '@playwright/test'

import { newInstrumentedPage, rafCalls } from './browser.ts'
import type { IdleResult } from './budget.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The page the loop runs on: the example effect's page. */
const IDLE_PATH = '/examples/glow'
/** The idle timeout the page is given (the `__HOUSE_IDLE_MS__` test hook of packages/motion). */
const IDLE_TIMEOUT_MS = 2000
/** Wait after load so the idle timeout has elapsed before sampling. */
const SETTLE_MS = 6000
const SAMPLE_SECONDS = 5

export async function runIdle(baseUrl: string): Promise<IdleResult> {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(`window.__HOUSE_IDLE_MS__ = ${IDLE_TIMEOUT_MS}`)
    const page = await newInstrumentedPage(context)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await page.goto(`${baseUrl}${IDLE_PATH}`, { waitUntil: 'load' })
    await sleep(SETTLE_MS)

    const taskSeconds = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics')
      return metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0
    }
    const t0 = await taskSeconds()
    const raf0 = await rafCalls(page)
    const started = Date.now()
    await sleep(SAMPLE_SECONDS * 1000)
    const elapsed = (Date.now() - started) / 1000
    const cpuPct = Math.round((((await taskSeconds()) - t0) / elapsed) * 1000) / 10
    const rafPerSec = Math.round((((await rafCalls(page)) - raf0) / elapsed) * 10) / 10
    console.log(`[perf] idle: ${cpuPct}% main-thread CPU, ${rafPerSec} rAF callbacks/s`)
    return { status: 'ok', cpuPct, rafPerSec, sampleSeconds: SAMPLE_SECONDS }
  } finally {
    await browser.close()
  }
}
