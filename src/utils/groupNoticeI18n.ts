type TranslateFn = (key: string, args?: Record<string, unknown>) => string

export function normalizeGroupNoticeText(raw: string): string {
  return String(raw || '').replace(/你(?=(?:申请加入|拒绝加入|同意加入))/g, '')
}

export function translateGroupNoticeText(raw: string, t: TranslateFn): string {
  const normalized = normalizeGroupNoticeText(raw)
  // 频道系统消息会把“操作者+动作”拼成一句，这里先拆出操作者，再用参数化 i18n 组装多语言文案。
  const actorActionMap: Array<[RegExp, string]> = [
    [/^(.+?)\s*(添加您至此频道|添加你至此频道)$/, '频道通知添加你至此频道'],
    [/^(.+?)\s*(邀请您加入频道|邀请你加入频道)$/, '频道通知邀请你加入频道'],
    [/^(.+?)\s*(将您设置为管理员|将你设置为管理员)$/, '由{name}设置为管理员'],
  ]
  for (const [pattern, key] of actorActionMap) {
    const match = normalized.match(pattern)
    if (!match) continue
    const actor = String(match[1] || '').trim()
    if (actor) return t(key, { name: actor })
  }

  const phraseMap: Record<string, string> = {
    该群聊已解散: t('该群聊已解散'),
    拒绝加入: t('拒绝加入'),
    同意加入: t('同意加入'),
    申请加入: t('申请加入'),
    您已加入频道: t('您已加入频道'),
    你已加入频道: t('你已加入频道'),
    邀请你加入: t('邀请你加入'),
    加入群聊: t('群通知加入群聊'),
    邀请: t('群通知邀请'),
    添加您至此频道: t('添加您至此频道'),
    添加你至此频道: t('添加你至此频道'),
    邀请您加入频道: t('邀请您加入频道'),
    邀请你加入频道: t('邀请你加入频道'),
    将您设置为管理员: t('将您设置为管理员'),
    将你设置为管理员: t('将你设置为管理员'),
    您已被移出频道: t('您已被移出频道'),
    你已被移出频道: t('你已被移出频道'),
  }

  return normalized.replace(
    /该群聊已解散|拒绝加入|同意加入|申请加入|您已加入频道|你已加入频道|邀请您加入频道|邀请你加入频道|邀请你加入|加入群聊|将您设置为管理员|将你设置为管理员|添加您至此频道|添加你至此频道|您已被移出频道|你已被移出频道|邀请/g,
    (matched) => phraseMap[matched] || matched,
  )
}
