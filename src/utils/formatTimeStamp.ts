/**
 * 与旧 im `src/utils/base.js::formatTimeStamp` 一致：
 * 12 小时制 + 上午/下午（中文）或 AM/PM（其它语言）。
 */
export function formatTimeStamp(timestamp: number | string): string {
  const date = new Date(Number(timestamp))
  const hours = date.getHours()
  const hour12 = hours % 12 || 12
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'zh-CN'
  const isChina = /^zh/i.test(lang)
  const ampmLabels = isChina ? (['上午', '下午'] as const) : (['AM', 'PM'] as const)
  const ampm = hours < 12 ? ampmLabels[0] : ampmLabels[1]
  return isChina ? `${ampm} ${hour12}:${minutes}` : `${hour12}:${minutes} ${ampm} `
}
