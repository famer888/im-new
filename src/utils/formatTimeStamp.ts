/**
 * 与旧 im `src/utils/base.js::formatTimeStamp` 一致：
 * 12 小时制；简体/繁体用「上午/下午」，其它语言用 AM/PM。
 * `locale` 须与 vue-i18n 当前语言一致（勿用 navigator.language 硬编码）。
 */
import type { ChatDateTranslateFn } from '@/utils/chatMessageDate'

export function formatTimeStamp(
  timestamp: number | string,
  locale: string,
  t: ChatDateTranslateFn,
): string {
  const date = new Date(Number(timestamp))
  const hours = date.getHours()
  const hour12 = hours % 12 || 12
  const minutes = date.getMinutes().toString().padStart(2, '0')
  if (locale === 'ch' || locale === 'tw') {
    const period = hours < 12 ? t('上午') : t('下午')
    return `${period} ${hour12}:${minutes}`
  }
  const ampm = hours < 12 ? 'AM' : 'PM'
  return `${hour12}:${minutes} ${ampm}`
}
