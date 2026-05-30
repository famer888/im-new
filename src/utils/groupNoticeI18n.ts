type TranslateFn = (key: string, args?: Record<string, unknown>) => string

export function normalizeGroupNoticeText(raw: string): string {
  return String(raw || '').replace(/你(?=(?:申请加入|拒绝加入|同意加入))/g, '')
}

export function translateGroupNoticeText(raw: string, t: TranslateFn): string {
  const normalized = normalizeGroupNoticeText(raw)
  // 频道系统消息常见为“{操作者}添加您至此频道”，这里先拆出人名再走 i18n，避免在多语言下丢失前缀人名。
  const channelInviteMatch = normalized.match(/^(.+?)\s*(添加您至此频道|添加你至此频道)$/)
  if (channelInviteMatch) {
    const actor = String(channelInviteMatch[1] || '').trim()
    if (actor) return t('频道通知添加你至此频道', { name: actor })
  }

  const phraseMap: Record<string, string> = {
    该群聊已解散: t('该群聊已解散'),
    拒绝加入: t('拒绝加入'),
    同意加入: t('同意加入'),
    申请加入: t('申请加入'),
    邀请你加入: t('邀请你加入'),
    加入群聊: t('群通知加入群聊'),
    邀请: t('群通知邀请'),
    添加您至此频道: t('添加您至此频道'),
    添加你至此频道: t('添加你至此频道'),
  }

  return normalized.replace(
    /该群聊已解散|拒绝加入|同意加入|申请加入|邀请你加入|加入群聊|邀请|添加您至此频道|添加你至此频道/g,
    (matched) => phraseMap[matched] || matched,
  )
}
