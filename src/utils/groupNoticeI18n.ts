type TranslateFn = (key: string) => string

export function normalizeGroupNoticeText(raw: string): string {
  return String(raw || '').replace(/你(?=(?:申请加入|拒绝加入|同意加入))/g, '')
}

export function translateGroupNoticeText(raw: string, t: TranslateFn): string {
  const normalized = normalizeGroupNoticeText(raw)
  const phraseMap: Record<string, string> = {
    该群聊已解散: t('该群聊已解散'),
    拒绝加入: t('拒绝加入'),
    同意加入: t('同意加入'),
    申请加入: t('申请加入'),
    邀请你加入: t('邀请你加入'),
    加入群聊: t('群通知加入群聊'),
    邀请: t('群通知邀请'),
  }

  return normalized.replace(
    /该群聊已解散|拒绝加入|同意加入|申请加入|邀请你加入|加入群聊|邀请/g,
    (matched) => phraseMap[matched] || matched,
  )
}
