import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import {
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
  parseGroupNoticeExtraObject,
} from '@/utils/groupNoticeDisplay'
import {
  rememberGroupMemberDisplayName,
  resolveGroupMemberDisplayName,
} from '@/utils/groupRemovedMemberNameCache'
import { formatSystemNotificationText } from '@/utils/chatUnreadVisibility'
import { translateGroupNoticeText } from '@/utils/groupNoticeI18n'

const PURE_UID_RE = /\b\d{5,}\b/g

interface SystemNotificationDisplayOptions {
  t: (key: string, args?: Record<string, unknown>) => string
  currentUid?: string
}

interface ParsedNotice {
  prefix: string
  text: string
  highlightPrefix: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function str(value: unknown): string {
  return String(value ?? '').trim()
}

function getExtraUserNameById(extra: Record<string, unknown> | null): Map<string, string> {
  const userMap = new Map<string, string>()
  if (!extra) return userMap

  const addUser = (candidate: unknown) => {
    const raw = asRecord(candidate)
    if (!raw) return
    const nested = asRecord(raw.user) || asRecord(raw.userInfo) || asRecord(raw.user_info)
    const relation = asRecord(raw.friendRelation) || asRecord(raw.friend_relation)
    const nestedRelation = nested ? (asRecord(nested.friendRelation) || asRecord(nested.friend_relation)) : null

    const id = [
      raw.userId, raw.user_id, raw.uid, raw.id,
      nested?.userId, nested?.user_id, nested?.uid, nested?.id,
    ].map(str).find(Boolean) || ''
    if (!id) return

    const name = [
      raw.remarkName, raw.remark_name,
      relation?.remarkName, relation?.remark_name,
      raw.nickname, raw.nickName, raw.nick_name, raw.name, raw.identify,
      nested?.remarkName, nested?.remark_name,
      nestedRelation?.remarkName, nestedRelation?.remark_name,
      nested?.nickname, nested?.nickName, nested?.nick_name, nested?.name, nested?.identify,
    ].map(str).find(Boolean) || ''
    if (!name || name === id) return
    userMap.set(id, name)
  }

  addUser(extra.fromUser)
  addUser(extra.targetUser)
  addUser(extra.checkUser)
  if (Array.isArray(extra.members)) {
    for (const member of extra.members) addUser(member)
  }
  return userMap
}

function translateNoticeText(
  text: string,
  t: (key: string, args?: Record<string, unknown>) => string,
): string {
  return translateGroupNoticeText(text, t)
}

function normalizeComparableName(value: string): string {
  return value.replace(/\s+/g, '')
}

function getGroupIdFromMessage(message: Message, extra: Record<string, unknown> | null): string {
  const extraGroupId = getGroupNoticeGroupId(extra)
  if (extraGroupId) return extraGroupId
  const conversationId = String(message.conversationId || '')
  return conversationId.startsWith('1_') ? conversationId.slice(2) : ''
}

function extractInvitePrefix(text: string): string {
  const index = text.indexOf('邀请')
  if (index <= 0) return ''
  return text.slice(0, index).trim()
}

function getNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getExtraActorRole(extra: Record<string, unknown> | null): number | null {
  const fromUser = asRecord(extra?.fromUser)
  const values = [
    extra?.actorRole,
    extra?.actorMemberRole,
    fromUser?.role,
    fromUser?.type,
    fromUser?.memberType,
  ]
  return values.map(getNumericValue).find((value): value is number => value !== null) ?? null
}

function getExtraOwnerId(extra: Record<string, unknown> | null): string {
  if (!extra) return ''
  return [
    extra.groupHostUid,
    extra.groupHostId,
    extra.hostUid,
    extra.hostId,
    extra.ownerUid,
    extra.ownerId,
    extra.groupOwnerUid,
    extra.groupOwnerId,
  ].map(str).find(Boolean) || ''
}

/**
 * 群通知提醒与会话内系统消息必须共用同一套 UID 解析规则，避免桌面提醒泄露 `#{uids:...}`。
 */
export function formatSystemNotificationDisplayParts(
  message: Message,
  options: SystemNotificationDisplayOptions,
): ParsedNotice {
  const authStore = useAuthStore()
  const contactStore = useContactStore()
  const groupStore = useGroupStore()
  const currentUid = String(options.currentUid || authStore.uid || '')
  const extra = parseGroupNoticeExtraObject(message.extra)
  const groupId = getGroupIdFromMessage(message, extra)
  const actorId = getGroupNoticeActorId(extra)
  const extraUserNameById = getExtraUserNameById(extra)
  const contextMembers = groupId ? groupStore.getMembers(groupId) : []
  const extraOwnerId = getExtraOwnerId(extra)
  const ownerId = groupStore.getGroup(groupId)?.ownerId || extraOwnerId
  const ownerMember = contextMembers.find((member) => member.role === 0)
    || contextMembers.find((member) => ownerId && member.userId === ownerId)
  const extraActorRole = getExtraActorRole(extra)
  const memberNameById = new Map(
    contextMembers
      .filter((member) => member.userId)
      .map((member) => [member.userId, String(member.nickname || '').trim()]),
  )
  const actorRole = groupId && actorId
    ? contextMembers.find((member) => member.userId === actorId)?.role
    : null

  const resolveUidDisplay = (id: string): string => {
    if (!id) return ''
    if (currentUid === id) return options.t('你')
    const cachedRemovedName = resolveGroupMemberDisplayName(groupId, id)
    if (cachedRemovedName && cachedRemovedName !== id) return cachedRemovedName
    const contactName = contactStore.getDisplayName(id)
    if (contactName && contactName !== id) return contactName
    const memberName = memberNameById.get(id) || ''
    if (memberName && memberName !== id) return memberName
    const extraName = extraUserNameById.get(id) || ''
    if (extraName && extraName !== id) return extraName
    return contactName || id
  }

  const isGroupOwnerDisplayName = (name: string): boolean => {
    const normalizedName = normalizeComparableName(name)
    const effectiveOwnerId = ownerMember?.userId || ownerId
    const actorIsDeclaredOwner = Boolean(actorId && (extraActorRole === 0 || (extraOwnerId && actorId === extraOwnerId)))
    if (!normalizedName) return false
    if (!effectiveOwnerId && !actorIsDeclaredOwner) return false
    const ownerDisplayNames = [
      effectiveOwnerId ? contactStore.getDisplayName(effectiveOwnerId) : '',
      ownerMember?.nickname || '',
      effectiveOwnerId ? extraUserNameById.get(effectiveOwnerId) || '' : '',
      effectiveOwnerId,
    ]
    if (!effectiveOwnerId && actorIsDeclaredOwner) {
      // 刚入群时群成员/群详情可能尚未同步；如果通知本身已声明邀请人是群主，先用邀请人显示名完成首屏高亮。
      ownerDisplayNames.push(resolveUidDisplay(actorId))
    }
    // 入群成功通知只在“邀请人是群主”时高亮；备注和群成员昵称都纳入比对，避免备注覆盖后漏高亮。
    return ownerDisplayNames
      .map((value) => normalizeComparableName(String(value || '').trim()))
      .filter(Boolean)
      .some((value) => value === normalizedName)
  }

  let content = formatSystemNotificationText(message, {
    currentUid,
    actorRole,
    contextMembers,
    resolveUidPlaceholder: resolveUidDisplay,
  })
  if (
    (content.includes('邀请') && content.includes('加入群聊'))
    || content.includes('移出群聊')
    || content.includes('退出群聊')
  ) {
    content = content.replace(PURE_UID_RE, (uid) => resolveUidDisplay(uid))
  }
  if (!content) return { prefix: '', text: '', highlightPrefix: false }

  if (!content.startsWith('!@#')) {
    const translatedText = translateNoticeText(content, options.t)
    const invitePrefix = translatedText.includes('加入群聊') ? extractInvitePrefix(translatedText) : ''
    if (invitePrefix && isGroupOwnerDisplayName(invitePrefix)) {
      return {
        prefix: invitePrefix,
        text: translatedText.slice(invitePrefix.length),
        highlightPrefix: true,
      }
    }
    return { prefix: '', text: translatedText, highlightPrefix: false }
  }

  const endIndex = content.lastIndexOf('!@#')
  if (endIndex <= 0) {
    return { prefix: '', text: translateNoticeText(content, options.t), highlightPrefix: false }
  }

  const prefix = content.slice(3, endIndex)
  return {
    prefix,
    text: translateNoticeText(content.slice(endIndex + 3), options.t),
    highlightPrefix: isGroupOwnerDisplayName(prefix),
  }
}

export function formatSystemNotificationPlainText(
  message: Message,
  options: SystemNotificationDisplayOptions,
): string {
  const { prefix, text } = formatSystemNotificationDisplayParts(message, options)
  return `${prefix}${text}`.trim()
}
