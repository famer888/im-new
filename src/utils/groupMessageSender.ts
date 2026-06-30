import { parseGroupNoticeExtraObject } from '@/utils/groupNoticeDisplay'

export interface GroupSenderProfile {
  nickname: string
  avatar?: string | null
}

const groupSenderProfileMap = new Map<string, Map<string, GroupSenderProfile>>()

function normalizeId(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeName(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isMeaningfulName(name: string, userId: string): boolean {
  if (!name) return false
  if (userId && name === userId) return false
  return !/^\d{5,}$/.test(name)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function pickNameFromRecord(raw: Record<string, unknown> | null, userId = ''): string {
  if (!raw) return ''
  const nestedUser = asRecord(raw.user) || asRecord(raw.userInfo) || asRecord(raw.user_info)
  const relation = asRecord(raw.friendRelation) || asRecord(raw.friend_relation)
  const nestedRelation = nestedUser
    ? (asRecord(nestedUser.friendRelation) || asRecord(nestedUser.friend_relation))
    : null

  const candidates = [
    raw.remarkName,
    raw.remark_name,
    relation?.remarkName,
    relation?.remark_name,
    nestedRelation?.remarkName,
    nestedRelation?.remark_name,
    raw.nickname,
    raw.nickName,
    raw.nick_name,
    raw.name,
    raw.identify,
    nestedUser?.remarkName,
    nestedUser?.remark_name,
    nestedUser?.nickname,
    nestedUser?.nickName,
    nestedUser?.nick_name,
    nestedUser?.name,
    nestedUser?.identify,
    raw.senderName,
    raw.sender_name,
  ].map(normalizeName).filter(Boolean)

  for (const candidate of candidates) {
    if (isMeaningfulName(candidate, userId)) return candidate
  }
  return ''
}

function pickAvatarFromRecord(raw: Record<string, unknown> | null): string {
  if (!raw) return ''
  const nestedUser = asRecord(raw.user) || asRecord(raw.userInfo) || asRecord(raw.user_info)
  return normalizeName(
    raw.senderAvatar
      ?? raw.sender_avatar
      ?? raw.icon
      ?? raw.avatar
      ?? nestedUser?.icon
      ?? nestedUser?.avatar,
  )
}

function pickUserIdFromRecord(raw: Record<string, unknown> | null): string {
  if (!raw) return ''
  const nestedUser = asRecord(raw.user) || asRecord(raw.userInfo) || asRecord(raw.user_info)
  return normalizeId(
    raw.userId
      ?? raw.user_id
      ?? raw.uid
      ?? raw.id
      ?? nestedUser?.userId
      ?? nestedUser?.user_id
      ?? nestedUser?.uid
      ?? nestedUser?.id,
  )
}

function rememberProfile(groupId: string, userId: string, profile: GroupSenderProfile) {
  const normalizedGroupId = normalizeId(groupId)
  const normalizedUserId = normalizeId(userId)
  const nickname = normalizeName(profile.nickname)
  if (!normalizedGroupId || !normalizedUserId || !isMeaningfulName(nickname, normalizedUserId)) return

  const nextGroup = new Map(groupSenderProfileMap.get(normalizedGroupId) ?? [])
  const previous = nextGroup.get(normalizedUserId)
  nextGroup.set(normalizedUserId, {
    nickname,
    avatar: normalizeName(profile.avatar) || previous?.avatar || null,
  })
  groupSenderProfileMap.set(normalizedGroupId, nextGroup)
}

export function resolveGroupSenderProfile(groupId: string, userId: string): GroupSenderProfile | null {
  const normalizedGroupId = normalizeId(groupId)
  const normalizedUserId = normalizeId(userId)
  if (!normalizedGroupId || !normalizedUserId) return null
  return groupSenderProfileMap.get(normalizedGroupId)?.get(normalizedUserId) ?? null
}

export function extractGroupSenderProfileFromExtra(
  rawExtra: unknown,
  fallbackUserId = '',
): GroupSenderProfile | null {
  const extra = parseGroupNoticeExtraObject(rawExtra)
  if (!extra) return null

  const sendMember = asRecord(extra.sendMember) || asRecord(extra.send_member)
  const user = asRecord(extra.user) || asRecord(extra.sendUser) || asRecord(extra.send_user)
  const userId = pickUserIdFromRecord(sendMember) || pickUserIdFromRecord(user) || normalizeId(fallbackUserId)

  const nickname = pickNameFromRecord(sendMember, userId)
    || pickNameFromRecord(user, userId)
    || pickNameFromRecord(extra, userId)
  if (!isMeaningfulName(nickname, userId)) return null

  const avatar = pickAvatarFromRecord(sendMember)
    || pickAvatarFromRecord(user)
    || pickAvatarFromRecord(extra)
    || null

  return { nickname, avatar }
}

function ingestAtUsers(groupId: string, extra: Record<string, unknown>) {
  const groups = [extra.atUsers, extra.at_users]
  for (const group of groups) {
    if (!Array.isArray(group)) continue
    for (const item of group) {
      const raw = asRecord(item)
      const userId = pickUserIdFromRecord(raw)
      const nickname = pickNameFromRecord(raw, userId)
      if (!userId || !nickname) continue
      rememberProfile(groupId, userId, { nickname })
    }
  }
}

export function ingestGroupSenderProfileFromMessage(
  groupId: string,
  message: { senderId?: string | null; extra?: unknown },
) {
  const normalizedGroupId = normalizeId(groupId)
  if (!normalizedGroupId) return

  const senderId = normalizeId(message.senderId)
  const profile = extractGroupSenderProfileFromExtra(message.extra, senderId)
  if (profile && senderId) {
    rememberProfile(normalizedGroupId, senderId, profile)
  }

  const extra = parseGroupNoticeExtraObject(message.extra)
  if (extra) ingestAtUsers(normalizedGroupId, extra)
}

export function ingestGroupSenderProfilesFromMessages(
  groupId: string,
  messages: Array<{ senderId?: string | null; extra?: unknown }>,
) {
  for (const message of messages) {
    ingestGroupSenderProfileFromMessage(groupId, message)
  }
}

export function resolveGroupMessageSenderDisplay(
  groupId: string,
  userId: string,
  rawExtra: unknown,
  options: {
    contactName?: string | null
    memberNickname?: string | null
    memberAvatar?: string | null
  } = {},
): GroupSenderProfile & { displayName: string } {
  const normalizedUserId = normalizeId(userId)
  const contactName = normalizeName(options.contactName)
  if (contactName && isMeaningfulName(contactName, normalizedUserId)) {
    return {
      nickname: contactName,
      avatar: options.memberAvatar || null,
      displayName: contactName,
    }
  }

  const extraProfile = extractGroupSenderProfileFromExtra(rawExtra, normalizedUserId)
  if (extraProfile) {
    rememberProfile(groupId, normalizedUserId, extraProfile)
    return {
      ...extraProfile,
      displayName: extraProfile.nickname,
    }
  }

  const cachedProfile = resolveGroupSenderProfile(groupId, normalizedUserId)
  if (cachedProfile) {
    return {
      ...cachedProfile,
      displayName: cachedProfile.nickname,
    }
  }

  const memberNickname = normalizeName(options.memberNickname)
  if (memberNickname && isMeaningfulName(memberNickname, normalizedUserId)) {
    rememberProfile(groupId, normalizedUserId, {
      nickname: memberNickname,
      avatar: options.memberAvatar || null,
    })
    return {
      nickname: memberNickname,
      avatar: options.memberAvatar || null,
      displayName: memberNickname,
    }
  }

  return {
    nickname: normalizedUserId,
    avatar: options.memberAvatar || null,
    displayName: normalizedUserId,
  }
}
