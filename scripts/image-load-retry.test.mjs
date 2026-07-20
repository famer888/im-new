import assert from 'node:assert/strict'
import test from 'node:test'

import { getImageAutoRetryDelay } from '../src/utils/imageLoadRetry.ts'

test('fresh app image failures use bounded delayed retries', () => {
  const now = 1_800_000_000_000
  const failure = {
    sendTime: now - 5_000,
    now,
    httpStatusCode: 404,
  }

  assert.equal(getImageAutoRetryDelay(0, failure), 500)
  assert.equal(getImageAutoRetryDelay(1, failure), 1_500)
  assert.equal(getImageAutoRetryDelay(2, failure), 3_000)
  assert.equal(getImageAutoRetryDelay(3, failure), null)
})

test('expired and historical image failures are not automatically retried', () => {
  const now = 1_800_000_000_000

  assert.equal(getImageAutoRetryDelay(0, {
    sendTime: now - 5_000,
    now,
    expired: true,
    reason: 'url_dated_expired',
  }), null)
  assert.equal(getImageAutoRetryDelay(0, {
    sendTime: now - 10 * 60_000,
    now,
    httpStatusCode: 404,
  }), null)
})
