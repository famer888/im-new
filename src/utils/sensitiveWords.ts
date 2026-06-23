import { getChatSensitive } from '@/api/imBase'

let sensitiveWords: string[] = []
let fakeSendSensitiveWords: string[] = []
let refreshPromise: Promise<void> | null = null

function normalizeWords(words: unknown): string[] {
  if (!Array.isArray(words)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of words) {
    const word = String(item || '').trim()
    if (!word || seen.has(word)) continue
    seen.add(word)
    result.push(word)
  }
  return result
}

export function setSensitiveWords(words: string[]) {
  sensitiveWords = normalizeWords(words)
}

export function setFakeSendSensitiveWords(words: string[]) {
  fakeSendSensitiveWords = normalizeWords(words)
}

export function clearSensitiveWords() {
  sensitiveWords = []
  fakeSendSensitiveWords = []
}

export function filterSensitiveWords(text: string): string {
  if (text === '我们已成为好友，打声招呼吧') return text
  if (sensitiveWords.length === 0) return text
  let result = text
  for (const word of sensitiveWords) {
    if (!word || ['<', '>', '='].includes(word)) continue
    const replacement = '*'.repeat(word.length)
    result = result.replaceAll(word, replacement)
  }
  return result
}

export function hasSensitiveWord(text: string): boolean {
  return sensitiveWords.some(w => w && text.includes(w))
}

export function shouldFakeSendMessage(text: string): boolean {
  return fakeSendSensitiveWords.some(w => w && text.includes(w))
}

export async function refreshChatSensitiveWords(reason = 'manual'): Promise<void> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      // 对齐旧 im：敏感词和假发送词来自同一个接口，30001 推送后也重新拉全量。
      const resp = await getChatSensitive()
      setSensitiveWords(resp.addSensitives || [])
      setFakeSendSensitiveWords(resp.fakeSendSensitives || [])
    } catch (error) {
      console.warn('[sensitive-words] refresh failed:', {
        reason,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}
