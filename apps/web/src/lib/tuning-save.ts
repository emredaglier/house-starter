import type { TuningPayload } from '@house/motion'

export type SaveResult = { ok: true } | { ok: false; error: string }

/** What Save posts: the page the owner tuned and every registered piece's values. */
export type SavedTuning = TuningPayload & { page: string }

/**
 * Posts the tuned values to HQ (`NEXT_PUBLIC_HQ_TUNING_URL`). Never throws: the panel shows the
 * error. With no URL nothing is sent.
 */
export async function saveTuning(
  url: string | undefined,
  payload: SavedTuning,
  fetcher: typeof fetch = fetch,
): Promise<SaveResult> {
  if (!url) return { ok: false, error: 'no tuning URL set' }
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (response.ok) return { ok: true }
    return {
      ok: false,
      error: `HQ answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
