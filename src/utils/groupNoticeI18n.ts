type TranslateFn = (key: string, args?: Record<string, unknown>) => string

export function normalizeGroupNoticeText(raw: string): string {
  return String(raw || '')
    .replace(/!@#([\S\s]*?)!@#/g, '$1')
    .replaceAll('!@#', '')
    .replace(/你(?=(?:申请加入|拒绝加入|同意加入))/g, '')
}

export function translateGroupNoticeText(raw: string, t: TranslateFn): string {
  const normalized = normalizeGroupNoticeText(raw)
  // 频道/群系统消息会把“操作者+动作”拼成一句，先拆出变量，再用参数化 i18n 组装多语言文案。
  const actorActionMap: Array<[RegExp, string, (match: RegExpMatchArray) => Record<string, unknown>]> = [
    [/^(.+?)\s*(添加您至此频道|添加你至此频道)$/, '频道通知添加你至此频道', (match) => ({ name: String(match[1] || '').trim() })],
    [/^(.+?)\s*(邀请您加入频道|邀请你加入频道)$/, '频道通知邀请你加入频道', (match) => ({ name: String(match[1] || '').trim() })],
    [/^(.+?)\s*(将您设置为管理员|将你设置为管理员)$/, '由{name}设置为管理员', (match) => ({ name: String(match[1] || '').trim() })],
    [/^你将(.+?)移出群聊$/, '群通知你将移出群聊', (match) => ({ name: String(match[1] || '').trim() })],
    [/^(.+?)被移出群聊$/, '群通知被移出群聊', (match) => ({ name: String(match[1] || '').trim() })],
    [/^(.+?)退出群聊$/, '群通知成员退出群聊', (match) => ({ name: String(match[1] || '').trim() })],
    [/^(.+?)邀请(.+?)加入群聊$/, '群通知邀请加入群聊', (match) => ({
      inviter: String(match[1] || '').trim(),
      invitee: String(match[2] || '').trim(),
    })],
  ]
  for (const [pattern, key, buildArgs] of actorActionMap) {
    const match = normalized.match(pattern)
    if (!match) continue
    const args = buildArgs(match)
    const primaryValue = String(args.name || args.inviter || '').trim()
    if (!primaryValue) continue
    return t(key, args)
  }

  const phraseMap: Record<string, string> = {
    该群聊已解散: t('该群聊已解散'),
    拒绝加入: t('拒绝加入'),
    同意加入: t('同意加入'),
    申请加入: t('申请加入'),
    您已加入频道: t('您已加入频道'),
    你已加入频道: t('你已加入频道'),
    频道已创建: t('频道已创建'),
    您创建了频道: t('您创建了频道'),
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
    /该群聊已解散|拒绝加入|同意加入|申请加入|您已加入频道|你已加入频道|频道已创建|您创建了频道|邀请您加入频道|邀请你加入频道|邀请你加入|加入群聊|将您设置为管理员|将你设置为管理员|添加您至此频道|添加你至此频道|您已被移出频道|你已被移出频道|邀请/g,
    (matched) => phraseMap[matched] || matched,
  )
}
