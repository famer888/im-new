import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test } from 'node:test'
import { transformWithEsbuild } from 'vite'

const sourceUrl = new URL('../src/utils/legacyImportRefresh.ts', import.meta.url)
const source = await fs.readFile(sourceUrl, 'utf8')
const transformed = await transformWithEsbuild(source, sourceUrl.pathname, {
  loader: 'ts',
  format: 'esm',
  target: 'es2022',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
const { refreshAfterLegacyImport } = await import(moduleUrl)

test('late legacy import reloads the active conversation after clearing caches', async () => {
  const calls = []

  await refreshAfterLegacyImport({
    currentConversationId: '1_499005',
    clearMessageCaches: () => calls.push('clear'),
    reloadConversations: async () => { calls.push('conversations') },
    reloadMessages: async (conversationId) => { calls.push(`messages:${conversationId}`) },
  })

  assert.deepEqual(calls, ['clear', 'conversations', 'messages:1_499005'])
})

test('active messages still reload when refreshing the conversation list fails', async () => {
  const calls = []

  await assert.rejects(() => refreshAfterLegacyImport({
    currentConversationId: '0_123',
    clearMessageCaches: () => calls.push('clear'),
    reloadConversations: async () => {
      calls.push('conversations')
      throw new Error('conversation refresh failed')
    },
    reloadMessages: async (conversationId) => { calls.push(`messages:${conversationId}`) },
  }))

  assert.deepEqual(calls, ['clear', 'conversations', 'messages:0_123'])
})

test('no message reload runs when there is no active conversation', async () => {
  const calls = []

  await refreshAfterLegacyImport({
    currentConversationId: null,
    clearMessageCaches: () => calls.push('clear'),
    reloadConversations: async () => { calls.push('conversations') },
    reloadMessages: async (conversationId) => { calls.push(`messages:${conversationId}`) },
  })

  assert.deepEqual(calls, ['clear', 'conversations'])
})
