// Repo guard for the build-time half of "no secrets in the bundle" (the run-time half is
// smoke/secrets.spec.ts, which reads what the container serves). Next inlines `NEXT_PUBLIC_*` values
// into browser code at build time, so a secret under that prefix ships to every visitor; and a
// client component that reads a server variable is a sign a secret is about to be passed to it.
// Not behaviour: it enforces a rule that no test can run, because the value is only dangerous once
// a project has set it.
//
// Adapted from darkroom.engineering's Satus (e2e/secrets-in-bundle.e2e.ts, MIT; see
// THIRD-PARTY-NOTICES.md), which fails when a server secret in its env schema reaches `.next`.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

/** `NEXT_PUBLIC_` followed by a name that says secret. A public API key is not named like this. */
const PUBLIC_SECRET = /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE)[A-Z0-9_]*/g
const CLIENT_FILE = /\.(?:tsx?|jsx?|mjs)$/
const USE_CLIENT = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/
const ENV_READ = /process\.env\.([A-Za-z0-9_]+)/g

/** What is wrong in one file: a secret under the public prefix, or a server variable in a client file. */
export function publicEnvProblems(file: string, text: string): string[] {
  const problems = [...text.matchAll(PUBLIC_SECRET)].map(
    (match) =>
      `${file}: ${match[0]} is shipped to every visitor: a secret must not be NEXT_PUBLIC_`,
  )
  if (CLIENT_FILE.test(file) && USE_CLIENT.test(text)) {
    for (const [, name] of text.matchAll(ENV_READ)) {
      if (name !== 'NODE_ENV' && !name!.startsWith('NEXT_PUBLIC_')) {
        problems.push(`${file}: a client component reads process.env.${name}, a server variable`)
      }
    }
  }
  return problems
}

describe('publicEnvProblems (on broken fixtures)', () => {
  it('finds a secret under the public prefix in any file', () => {
    for (const name of [
      'NEXT_PUBLIC_API_SECRET',
      'NEXT_PUBLIC_ADMIN_TOKEN',
      'NEXT_PUBLIC_DB_PASSWORD',
    ]) {
      expect(publicEnvProblems('apps/web/.env.example', `${name}=x`), name).toHaveLength(1)
    }
    expect(publicEnvProblems('Dockerfile', 'ARG NEXT_PUBLIC_STRIPE_PRIVATE_KEY')).toHaveLength(1)
  })

  it('finds a server variable read in a client component, but not NODE_ENV or a public one', () => {
    const client = `'use client'\nconst a = process.env.PAYLOAD_SECRET\nconst b = process.env.NODE_ENV\nconst c = process.env.NEXT_PUBLIC_SITE_URL`
    expect(publicEnvProblems('apps/web/src/Box.tsx', client)).toEqual([
      'apps/web/src/Box.tsx: a client component reads process.env.PAYLOAD_SECRET, a server variable',
    ])
    // A license comment above the directive is still a client component.
    expect(
      publicEnvProblems('a.tsx', `/* x */\n'use client'\nprocess.env.REVALIDATE_SECRET`),
    ).toHaveLength(1)
  })

  it('lets a server file read what it needs, and a public key be public', () => {
    expect(publicEnvProblems('route.ts', 'const s = process.env.REVALIDATE_SECRET')).toEqual([])
    expect(publicEnvProblems('.env.example', 'NEXT_PUBLIC_MAPS_KEY=abc')).toEqual([])
  })
})

describe('this repository', () => {
  it('has no secret under NEXT_PUBLIC_ and no server variable read in a client component', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
      .filter(
        (file) =>
          !/^(?:docs|\.scratch)\//.test(file) &&
          file !== 'pnpm-lock.yaml' &&
          file !== 'scripts/public-env.test.ts' &&
          !/\.(?:png|jpe?g|webp|avif|gif|ico|woff2?|db|mp4|webm|pdf)$/i.test(file) &&
          fs.existsSync(path.join(root, file)),
      )
    const problems = tracked.flatMap((file) =>
      publicEnvProblems(file, fs.readFileSync(path.join(root, file), 'utf8')),
    )
    expect(problems).toEqual([])
  })
})
