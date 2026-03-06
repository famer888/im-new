/// Message processing Web Worker
/// Handles: content formatting, emoji resolution, HTML sanitization, pinyin indexing

interface WorkerMessage {
  type: 'format' | 'sanitize' | 'pinyin' | 'batch-format'
  id: string
  payload: unknown
}

interface FormatPayload {
  content: string
  msgType: number
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, id, payload } = event.data

  switch (type) {
    case 'format': {
      const { content, msgType } = payload as FormatPayload
      const formatted = formatMessageContent(content, msgType)
      self.postMessage({ id, result: formatted })
      break
    }
    case 'sanitize': {
      const html = payload as string
      const sanitized = sanitizeHtml(html)
      self.postMessage({ id, result: sanitized })
      break
    }
    case 'batch-format': {
      const messages = payload as FormatPayload[]
      const results = messages.map((m) => formatMessageContent(m.content, m.msgType))
      self.postMessage({ id, result: results })
      break
    }
  }
}

function formatMessageContent(content: string, msgType: number): string {
  if (msgType === 0) {
    // Text: resolve emoji placeholders → img tags
    return content.replace(
      /\[([^\]]+)\]/g,
      (match, name) => `<img class="emoji" src="/images/emoji/${name}.png" alt="${name}" />`,
    )
  }
  return content
}

function sanitizeHtml(html: string): string {
  // Basic XSS prevention (DOMPurify should be used in main thread for full protection)
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
}

export {}
