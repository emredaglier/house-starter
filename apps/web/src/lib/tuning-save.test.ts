import { describe, expect, it, vi } from 'vitest'

import { saveTuning } from './tuning-save'

const payload = { page: '/', pieces: { hero: { ease: 'expo.out', duration: 0.6 } } }

describe('saveTuning', () => {
  it('posts the payload as JSON to the URL', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }))
    expect(await saveTuning('https://hq.test/tuning', payload, fetcher)).toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://hq.test/tuning')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual(payload)
  })

  it('sends nothing without a URL', async () => {
    const fetcher = vi.fn()
    expect(await saveTuning(undefined, payload, fetcher)).toEqual({
      ok: false,
      error: 'no tuning URL set',
    })
    expect(await saveTuning('', payload, fetcher)).toMatchObject({ ok: false })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports a refusal with its status and the reason HQ gave', async () => {
    const fetcher = async () => new Response('not in Polish', { status: 409 })
    expect(await saveTuning('https://hq.test/tuning', payload, fetcher)).toEqual({
      ok: false,
      error: 'HQ answered 409: not in Polish',
    })
  })

  it('reports a network failure instead of throwing', async () => {
    const fetcher = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await saveTuning('https://hq.test/tuning', payload, fetcher)).toEqual({
      ok: false,
      error: 'Failed to fetch',
    })
  })
})
