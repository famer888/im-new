import { getChatSensitive } from '@/api/imBase'
import { ref } from 'vue'

let sensitiveWords: string[] = []
let fakeSendSensitiveWords: string[] = []
let refreshPromise: Promise<void> | null = null
const sensitiveWordsVersion = ref(0)
const HTTP_SENSITIVE_REPLACEMENT = '********'
const HTTP_URL_RE = /https?:\/\/[^\s"'<>]+/gi

function markSensitiveWordsChanged() {
  sensitiveWordsVersion.value += 1
}

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
  markSensitiveWordsChanged()
}

export function setFakeSendSensitiveWords(words: string[]) {
  fakeSendSensitiveWords = normalizeWords(words)
}

export function clearSensitiveWords() {
  sensitiveWords = []
  fakeSendSensitiveWords = []
  markSensitiveWordsChanged()
}

function getReplacement(word: string): string {
  // 产品要求：敏感词本身是 http/https 内容时，统一显示 8 个星号，避免暴露链接长度。
  if (/https?:\/\//i.test(word)) return HTTP_SENSITIVE_REPLACEMENT
  return '*'.repeat(word.length)
}

function replaceSensitiveWord(text: string, word: string): string {
  // 如果敏感词命中链接内部，整段链接固定显示 8 星，避免残留域名、路径或参数。
  const maskedHttpText = text.replace(HTTP_URL_RE, (url) =>
    url.includes(word) ? HTTP_SENSITIVE_REPLACEMENT : url,
  )
  return maskedHttpText.replaceAll(word, getReplacement(word))
}

export function filterSensitiveWords(text: string): string {
  // 让 Vue computed 在敏感词推送更新后重新计算展示文本。
  void sensitiveWordsVersion.value
  if (text === '我们已成为好友，打声招呼吧') return text
  if (sensitiveWords.length === 0) return text
  let result = text
  for (const word of sensitiveWords) {
    if (!word || ['<', '>', '='].includes(word)) continue
    result = replaceSensitiveWord(result, word)
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
