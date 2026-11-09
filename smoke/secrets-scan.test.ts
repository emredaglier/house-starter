import { describe, expect, it } from 'vitest'

import { chunkPaths, findLeaks, type Served } from './secrets-scan.ts'

const SECRET = 'smoke-only-web-payload-secret'
const served = (url: string, text: string): Served => ({ url, text })

describe('findLeaks', () => {
  it('passes files that hold none of the secrets and no secret-shaped text', () => {
    expect(
      findLeaks(
        [
          served('/', '<html><h1>Hello</h1><script src="/_next/static/chunks/a.js"></script>'),
          served('/_next/static/chunks/a.js', 'var a=process.env.NODE_ENV;console.log("hi")'),
        ],
        [SECRET],
      ),
    ).toEqual([])
  })

  it('finds a secret value in a script, in the page HTML and in RSC data, naming the file', () => {
    const leaks = findLeaks(
      [
        served('/_next/static/chunks/a.js', `fetch("/x",{headers:{k:"${SECRET}"}})`),
        served('/', `<html>...</html>`),
        served('/other', `self.__next_f.push([1,"{\\"token\\":\\"${SECRET}\\"}"])`),
      ],
      [SECRET],
    )
    expect(leaks.map((leak) => leak.url)).toEqual(['/_next/static/chunks/a.js', '/other'])
    expect(leaks[0]?.kind).toBe('value')
  })

  it('finds the value written URL-encoded or as base64', () => {
    const secret = 'a secret/with+chars&more'
    const encoded = findLeaks([served('/u', `href="?k=${encodeURIComponent(secret)}"`)], [secret])
    const base64 = findLeaks([served('/b', `x="${btoa(secret)}"`)], [secret])
    expect(encoded).toHaveLength(1)
    expect(base64).toHaveLength(1)
  })

  it('never prints the secret itself, only which secret it was by position', () => {
    const [leak] = findLeaks([served('/a.js', SECRET)], [SECRET])
    expect(JSON.stringify(leak)).not.toContain(SECRET)
    expect(leak?.what).toBe('secret #1')
  })

  it('finds text shaped like a credential, with no list of values needed', () => {
    const cases: Record<string, string> = {
      'private key': 'x="-----BEGIN RSA PRIVATE KEY-----MIIE"',
      'AWS access key id': 'id:"AKIAIOSFODNN7EXAMPLE"',
      'GitHub token': 'token:"ghp_abcdefghijklmnopqrstuvwxyz0123456789"',
      'Stripe secret key': 'k:"sk_' + 'live_abcdefghijklmnopqrstuvwx"',
      'Slack token': 't:"xoxb-123456789012-abcdefghij"',
    }
    for (const [name, text] of Object.entries(cases)) {
      const leaks = findLeaks([served('/a.js', text)], [])
      expect(
        leaks.map((leak) => leak.what),
        name,
      ).toEqual([name])
      expect(leaks[0]?.kind).toBe('shape')
    }
  })

  it('does not mistake a public key for a private one, or a short word for a key id', () => {
    expect(
      findLeaks([served('/a.js', '-----BEGIN PUBLIC KEY----- AKIA sk_live_ ghp_short')], []),
    ).toEqual([])
  })

  it('refuses a secret too short to scan for, instead of passing on a meaningless scan', () => {
    expect(() => findLeaks([served('/', 'x')], ['short'])).toThrow(/too short/)
    expect(() => findLeaks([served('/', 'x')], [''])).toThrow(/too short/)
  })
})

describe('chunkPaths', () => {
  it('lists every script and stylesheet a document or a script points at, once', () => {
    const html = `
      <link rel="stylesheet" href="https://cdn.example.com/releases/v1/_next/static/css/app.css?dpl=v1"/>
      <script src="/_next/static/chunks/main-abc.js?dpl=v1" async=""></script>
      <script src="/_next/static/chunks/main-abc.js?dpl=v1" async=""></script>
      <script>self.__next_f.push([1,"[\\"static/chunks/lazy-def.js\\",\\"static/chunks/%5Bturbo%5D.js\\"]"])</script>
      <img src="/_next/static/media/logo.png"/>`
    expect(chunkPaths(html).sort()).toEqual([
      'static/chunks/%5Bturbo%5D.js',
      'static/chunks/lazy-def.js',
      'static/chunks/main-abc.js',
      'static/css/app.css',
    ])
  })

  it('returns nothing for a document with no build files', () => {
    expect(chunkPaths('<html><body>plain</body></html>')).toEqual([])
  })
})
