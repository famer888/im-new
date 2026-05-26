import { emojiObj } from './emoji.js'

export type NotificationEmojiSegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; token: string; src: string }

const EMOJI_TOKEN_RE = /\[[^\]]+\]/g

function pushTextSegment(segments: NotificationEmojiSegment[], value: string) {
  if (!value) return
  const last = segments[segments.length - 1]
  if (last?.type === 'text') {
    last.value += value
    return
  }
  segments.push({ type: 'text', value })
}

export function buildNotificationEmojiSegments(text: string): NotificationEmojiSegment[] {
  const raw = String(text || '')
  const segments: NotificationEmojiSegment[] = []
  let cursor = 0

  // 右下角通知要和旧 im 一致：命中已知 [表情] 时渲染图片，未知 token 继续按原文展示。
  for (const match of raw.matchAll(EMOJI_TOKEN_RE)) {
    const token = match[0]
    const start = match.index ?? 0
    if (start > cursor) {
      pushTextSegment(segments, raw.slice(cursor, start))
    }

    const fileName = (emojiObj as Record<string, string>)[token]
    if (fileName) {
      segments.push({
        type: 'emoji',
        token,
        src: `/images/emoji/${fileName}.png`,
      })
    } else {
      pushTextSegment(segments, token)
    }
    cursor = start + token.length
  }

  if (cursor < raw.length) {
    pushTextSegment(segments, raw.slice(cursor))
  }
  if (segments.length === 0) {
    segments.push({ type: 'text', value: raw })
  }
  return segments
}
