import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseProjectEnv } from './settings'

const infra = import.meta.dirname
const read = (file: string) => fs.readFileSync(path.join(infra, file), 'utf8')
const readme = read('README.md')
const workflows = fs
  .readdirSync(path.join(infra, '../.github/workflows'))
  .filter((file) => file.endsWith('.yml'))
  .map((file) => fs.readFileSync(path.join(infra, '../.github/workflows', file), 'utf8'))
  .join('\n')

describe('setup docs list what the owner fills in', () => {
  it('names every secret and variable a workflow reads', () => {
    const names = new Set(
      [...workflows.matchAll(/\b(?:secrets|vars)\.([A-Z][A-Z0-9_]*)/g)]
        .map((m) => m[1]!)
        // Automatic: no secret to create.
        .filter((name) => name !== 'GITHUB_TOKEN'),
    )
    expect(names.size).toBeGreaterThan(5)
    for (const name of names) expect(readme, name).toContain(`\`${name}\``)
  })

  it('documents every key of infra/project.env', () => {
    const keys = Object.keys(parseProjectEnv(read('project.env').replace(/^# ([A-Z_]+=)/gm, '$1')))
    expect(keys.sort()).toEqual(['CDN_HOST', 'DOMAIN', 'PROJECT_NAME', 'TIMEZONE', 'TS_HOSTNAME'])
    for (const key of keys) expect(readme, key).toContain(`\`${key}\``)
  })

  it('has no hard-coded server folder in a script', () => {
    // The names come from project.env; a leftover default would deploy under the wrong name.
    for (const file of [
      'compose.yaml',
      'compose.local.yaml',
      'deploy.sh',
      'ci.sh',
      'bootstrap.sh',
    ]) {
      expect(read(file), file).not.toMatch(/\/opt\/[a-z]/)
    }
  })
})
