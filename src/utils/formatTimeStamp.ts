/**
 * 消息区统一使用 24 小时制，保持与搜索结果、会话列表时间一致。
 */
import type { ChatDateTranslateFn } from '@/utils/chatMessageDate'

export function formatTimeStamp(
  timestamp: number | string,
  locale: string,
  t: ChatDateTranslateFn,
): string {
  void locale
  void t
  const date = new Date(Number(timestamp))
  const hours = date.getHours()
  const hour24 = hours.toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hour24}:${minutes}`
}
