/** 好友号 identify 是否可作为展示/复制用的有效值（拉黑等场景服务端可能下发 "--"）。 */
export function isValidFriendIdentify(value: unknown): boolean {
  const text = String(value ?? '').trim()
  if (!text) return false
  if (text === '--' || text === '-') return false
  return true
}

export function normalizeFriendIdentify(value: unknown): string | null {
  return isValidFriendIdentify(value) ? String(value).trim() : null
}
