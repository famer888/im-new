const IMAGE_AUTO_RETRY_DELAYS_MS = [500, 1_500, 3_000] as const
const IMAGE_AUTO_RETRY_FRESH_WINDOW_MS = 5 * 60_000

export interface ImageAutoRetryFailure {
  sendTime: number
  now?: number
  httpStatusCode?: number | null
  expired?: boolean
  reason?: string | null
}

function normalizeTimestamp(value: number): number {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0
  return timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp
}

export function getImageAutoRetryDelay(
  attempt: number,
  failure: ImageAutoRetryFailure,
): number | null {
  if (failure.expired || String(failure.reason || '') === 'url_dated_expired') return null

  const sendTime = normalizeTimestamp(failure.sendTime)
  const now = Number(failure.now ?? Date.now())
  const age = now - sendTime
  if (!sendTime || !Number.isFinite(age) || age < -60_000 || age > IMAGE_AUTO_RETRY_FRESH_WINDOW_MS) {
    return null
  }

  const index = Math.trunc(Number(attempt))
  if (index < 0 || index >= IMAGE_AUTO_RETRY_DELAYS_MS.length) return null
  return IMAGE_AUTO_RETRY_DELAYS_MS[index]
}
