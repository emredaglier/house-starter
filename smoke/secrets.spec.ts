// Secrets in the bundle: nothing the browser is served may hold a server secret. smoke/run.ts gives
// the containers throwaway secrets and passes their values here (SMOKE_SECRETS); this reads every
// page, its flight data (a server value handed to a client component lands there) and every script
// and stylesheet reachable from them, and fails on a secret's value or on text shaped like a
// credential (smoke/secrets-scan.ts, with its own unit tests).
//
// Adapted from darkroom.engineering's Satus (e2e/secrets-in-bundle.e2e.ts, MIT; see
// THIRD-PARTY-NOTICES.md).
import { UNKNOWN_PATH } from './fixture-data.ts'
import { expect, test } from './fixtures.ts'
import { publicRoutes } from './routes.ts'
import { chunkPaths, findLeaks, type Served } from './secrets-scan.ts'

/** More than any page of a small site loads; a runaway crawl fails instead of running on. */
const MAX_FILES = 500

const secrets: string[] = JSON.parse(process.env.SMOKE_SECRETS ?? '[]')

test('no server secret reaches anything the browser is served', async ({ request }) => {
  expect(
    secrets.length,
    'smoke/run.ts passes the container secrets as SMOKE_SECRETS',
  ).toBeGreaterThan(0)

  const files: Served[] = []
  const seen = new Set<string>()
  const queue: string[] = []
  const take = async (url: string, headers?: Record<string, string>) => {
    const response = await request.get(url, { headers, maxRedirects: 0 })
    const text = await response.text()
    // A page may answer its own non-200 (the 404 page): it is still served to the browser.
    files.push({ url: headers ? `${url} (flight data)` : url, text })
    for (const chunk of chunkPaths(text)) {
      if (!seen.has(chunk)) {
        seen.add(chunk)
        queue.push(`/_next/${chunk}`)
      }
    }
    return response
  }

  for (const route of [...publicRoutes(), UNKNOWN_PATH]) {
    await take(route)
    await take(route, { RSC: '1' })
  }
  while (queue.length > 0 && files.length < MAX_FILES) {
    const url = queue.shift()!
    // A referenced file that is not served is not this check's business (the route sweep fails on
    // a 404 the page itself loads); it is read like any other and holds nothing.
    await take(url)
  }
  expect(queue, 'the crawl found more files than it will read').toEqual([])

  // The scan must have read build output, or "no leaks" says nothing.
  expect(files.filter((file) => file.url.endsWith('.js')).length).toBeGreaterThan(0)

  await test.info().attach('secrets-scan', {
    body: JSON.stringify(
      { files: files.map((file) => file.url), secretCount: secrets.length },
      null,
      2,
    ),
    contentType: 'application/json',
  })
  expect(findLeaks(files, secrets)).toEqual([])
})
