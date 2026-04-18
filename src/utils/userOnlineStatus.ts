/** 与 im `member-list.vue` handleOnlineTime 一致：根据最后活跃时间生成文案 */
export function formatLastActiveText(
  lastActiveMs: number | undefined,
  t: (key: string) => string,
): string {
  if (!lastActiveMs) return t('近期不在线')
  const dateNow = Date.now()
  const minute = 1000 * 60
  const hour = minute * 60
  const day = hour * 24
  const week = day * 7
  const month = day * 30
  const remainderTime = dateNow - lastActiveMs
  if (remainderTime < minute) return t('不久前在线')
  if (remainderTime < hour) return Math.floor(remainderTime / minute) + t('分钟前在线')
  if (remainderTime < day) return Math.floor(remainderTime / hour) + t('小时前在线')
  if (remainderTime < week) return Math.floor(remainderTime / day) + t('天前在线')
  if (remainderTime < month) return Math.floor(remainderTime / week) + t('周前在线')
  return t('近期不在线')
}
