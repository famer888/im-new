export function shouldShowChannelShareInfo(linkType: number | null, memberType: number | null): boolean {
  // 对齐老 im：公开频道（linkType !== 1）所有已加入成员可见；私密频道仅频道主/管理员可见。
  if (Number(linkType ?? 0) !== 1) return true
  return memberType === 1 || memberType === 2
}
