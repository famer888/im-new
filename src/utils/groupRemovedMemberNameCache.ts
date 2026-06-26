const removedMemberNameCache = new Map<string, string>()

function cacheKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`
}

/** 移出群成员前缓存展示名，避免成员列表刷新后事件消息只能显示 uid。 */
export function rememberGroupMemberDisplayName(
  groupId: string | number | null | undefined,
  userId: string | number | null | undefined,
  name: string | null | undefined,
) {
  const gid = String(groupId ?? '').trim()
  const uid = String(userId ?? '').trim()
  const display = String(name ?? '').trim()
  if (!gid || !uid || !display || display === uid) return
  removedMemberNameCache.set(cacheKey(gid, uid), display)
}

export function resolveGroupMemberDisplayName(
  groupId: string | number | null | undefined,
  userId: string | number | null | undefined,
): string {
  const gid = String(groupId ?? '').trim()
  const uid = String(userId ?? '').trim()
  if (!gid || !uid) return ''
  return removedMemberNameCache.get(cacheKey(gid, uid)) || ''
}
