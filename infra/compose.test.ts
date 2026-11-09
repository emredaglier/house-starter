import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => fs.readFileSync(path.resolve(import.meta.dirname, rel), 'utf8')

/** The lines of one top-level service in a compose file (2-space indent, as in these files). */
function service(file: string, name: string): string {
  const match = read(file).match(new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n|  #.*\\n)*)`, 'm'))
  if (!match) throw new Error(`no service ${name} in ${file}`)
  return match[1] ?? ''
}
const urls = (block: string) => block.match(/^\s+REVALIDATE_URLS: (.+)$/m)?.[1]

describe('compose: seed revalidation', () => {
  it('migrate (where the seed runs) posts to the same web instances as cms', () => {
    const cms = urls(service('compose.yaml', 'cms'))
    expect(cms).toMatch(/web:3000.*web-preview:3000/)
    expect(urls(service('compose.yaml', 'migrate'))).toBe(cms)
  })

  it('migrate keeps a REVALIDATE_SECRET wherever it has the URLs, or config.ts throws', () => {
    expect(service('compose.yaml', 'migrate')).toMatch(/env_file: .*\/cms\.env/)
    // The laptop override gives migrate and cms the same environment, secret included.
    expect(service('compose.local.yaml', 'migrate')).toContain('*local-cms-env')
    expect(read('compose.local.yaml')).toMatch(
      /x-local-cms-env: &local-cms-env\n(?:  .*\n)*?  REVALIDATE_SECRET: \S+/,
    )
  })
})
