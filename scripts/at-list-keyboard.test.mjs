import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldCaptureAtListKeyboard } from '../src/utils/atListKeyboard.ts'

test('Enter is not captured when a pasted 68 ID has no matching @ candidate', () => {
  assert.equal(shouldCaptureAtListKeyboard('Enter', 0), false)
})

test('Enter and arrow keys are captured while the @ list has candidates', () => {
  assert.equal(shouldCaptureAtListKeyboard('Enter', 1), true)
  assert.equal(shouldCaptureAtListKeyboard('ArrowUp', 1), true)
  assert.equal(shouldCaptureAtListKeyboard('ArrowDown', 1), true)
  assert.equal(shouldCaptureAtListKeyboard('Escape', 1), false)
})
