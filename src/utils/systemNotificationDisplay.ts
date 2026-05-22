import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import {
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
  parseGroupNoticeExtraObject,
} from '@/utils/groupNoticeDisplay'
import { formatSystemNotificationText } from '@/utils/chatUnreadVisibility'
import { translateGroupNoticeText } from '@/utils/groupNoticeI18n'

const PURE_UID_RE = /\b\d{5,}\b/g

interface SystemNotificationDisplayOptions {
  t: (key: string) => string
  currentUid?: string
}

interface ParsedNotice {
  prefix: string
  text: string
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

function translateNoticeText(text: string, t: (key: string) => string): string {
  const translatedGroupNotice = translateGroupNoticeText(text, t)
  if (translatedGroupNotice !== text) return translatedGroupNotice
  const translated = t(text)
  return translated === text ? text : translated
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
  const groupId = getGroupNoticeGroupId(extra)
  const actorId = getGroupNoticeActorId(extra)
  const extraUserNameById = getExtraUserNameById(extra)
  const contextMembers = groupId ? groupStore.getMembers(groupId) : []
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
    const contactName = contactStore.getDisplayName(id)
    if (contactName && contactName !== id) return contactName
    const memberName = memberNameById.get(id) || ''
    if (memberName && memberName !== id) return memberName
    const extraName = extraUserNameById.get(id) || ''
    if (extraName && extraName !== id) return extraName
    return contactName || id
  }

  let content = formatSystemNotificationText(message, {
    currentUid,
    actorRole,
    contextMembers,
    resolveUidPlaceholder: resolveUidDisplay,
  })
  if (content.includes('邀请') && content.includes('加入群聊')) {
    content = content.replace(PURE_UID_RE, (uid) => resolveUidDisplay(uid))
  }
  if (!content) return { prefix: '', text: '' }

  if (!content.startsWith('!@#')) {
    return { prefix: '', text: translateNoticeText(content, options.t) }
  }

  const endIndex = content.lastIndexOf('!@#')
  if (endIndex <= 0) {
    return { prefix: '', text: translateNoticeText(content, options.t) }
  }

  return {
    prefix: content.slice(3, endIndex),
    text: translateNoticeText(content.slice(endIndex + 3), options.t),
  }
}

export function formatSystemNotificationPlainText(
  message: Message,
  options: SystemNotificationDisplayOptions,
): string {
  const { prefix, text } = formatSystemNotificationDisplayParts(message, options)
  return `${prefix}${text}`.trim()
}
