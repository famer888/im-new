import type { Message } from '@/stores/useMessageStore'
import { isHiddenMessageType } from '@/types'
import { formatGroupNoticeDisplayText, parseGroupNoticeExtraObject } from '@/utils/groupNoticeDisplay'
import { isGroupIntroNoticeMessage } from '@/utils/groupIntroNotice'

export const HIDDEN_GROUP_NOTICE_TEXT = '群聊事件'
interface NoticeFormatOptions {
  currentUid?: string
  actorRole?: number | null
  contextMembers?: unknown[]
  resolveUidPlaceholder?: (uid: string) => string
}

interface MessageVisibilityOptions {
  currentGroupMemberRole?: number | null
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function getNoticeUserId(raw: unknown): string {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
  if (!record) return ''
  const nestedUser = record.user && typeof record.user === 'object'
    ? record.user as Record<string, unknown>
    : null
  const nestedUserInfo = record.userInfo && typeof record.userInfo === 'object'
    ? record.userInfo as Record<string, unknown>
    : null

  return [
    record.userId,
    record.user_id,
    record.uid,
    record.id,
    nestedUser?.userId,
    nestedUser?.user_id,
    nestedUser?.uid,
    nestedUser?.id,
    nestedUserInfo?.userId,
    nestedUserInfo?.user_id,
    nestedUserInfo?.uid,
    nestedUserInfo?.id,
  ].map(normalizeText).find(Boolean) || ''
}

function isGroupConversation(conversationId: string | undefined): boolean {
  return Boolean(conversationId?.startsWith('1_'))
}

function isGroupConversationTarget(conversationId: string | undefined): string {
  return isGroupConversation(conversationId) ? String(conversationId).slice(2) : ''
}

function isGroupIntroHidden(message: Message): boolean {
  if (!isGroupIntroNoticeMessage(message)) return false
  const extra = parseGroupNoticeExtraObject(message.extra)
  if (!extra) return false
  if (extra.isHide === true || extra.is_hide === true) return true
  if (extra.showNotify === false || extra.show_notify === false) return true
  return false
}

export function formatSystemNotificationText(
  message: Message,
  options: NoticeFormatOptions = {},
): string {
  const raw = normalizeText(message.content)
  if (!raw) return ''
  if (isGroupRemoveNoticeHiddenForCurrentUser(undefined, message, options.currentUid || '')) return ''
  const extra = parseGroupNoticeExtraObject(message.extra)
  const formatted = normalizeText(formatGroupNoticeDisplayText(raw, extra, options))
  if (!formatted || formatted === HIDDEN_GROUP_NOTICE_TEXT) return ''
  return formatted
}

export function isLegacyGroupInviteRejectionInGroupChat(
  conversationId: string | undefined,
  message: Message,
): boolean {
  if (!isGroupConversation(conversationId)) return false
  const target = isGroupConversationTarget(conversationId)
  if (!target || target === 'invitation') return false
  if (message.msgType !== 8) return false
  const extra = parseGroupNoticeExtraObject(message.extra)
  if (!extra) return false
  if (String(extra.source ?? '') !== 'group-event') return false
  return Number(extra.groupReqStatus ?? 0) === 2
}

export function isSelfLeaveGroupSystemMessage(
  conversationId: string | undefined,
  message: Message,
  currentUid = '',
): boolean {
  if (!isGroupConversation(conversationId)) return false
  const target = isGroupConversationTarget(conversationId)
  if (!target || target === 'invitation') return false
  if (message.msgType !== 8) return false

  const extra = parseGroupNoticeExtraObject(message.extra)
  if (!extra) return false
  if (String(extra.source ?? '') !== 'group-event') return false
  if (Number(extra.groupReqType ?? 0) !== 7) return false

  const uid = normalizeText(currentUid)
  if (!uid) return false

  // 群主收到成员退群通知时 receiveUid 也会是群主；只看真正退群的成员，避免误隐藏群主视角的退群提示。
  const members = Array.isArray(extra.members) ? extra.members : []
  const affectedMemberId = members.map(getNoticeUserId).find(Boolean)
    || getNoticeUserId(extra.targetUser)
    || normalizeText(extra.fromUid ?? extra.sendUid)

  return Boolean(affectedMemberId && affectedMemberId === uid)
}

export function isGroupMemberLeaveNoticeHiddenForCurrentUser(
  conversationId: string | undefined,
  message: Message,
  currentUid = '',
  options: MessageVisibilityOptions = {},
): boolean {
  if (!isGroupConversation(conversationId)) return false
  const target = isGroupConversationTarget(conversationId)
  if (!target || target === 'invitation') return false
  if (message.msgType !== 8) return false

  const extra = parseGroupNoticeExtraObject(message.extra)
  if (!extra) return false
  if (String(extra.source ?? '') !== 'group-event') return false
  if (Number(extra.groupReqType ?? 0) !== 7) return false

  const uid = normalizeText(currentUid)
  if (!uid) return false

  const members = Array.isArray(extra.members) ? extra.members : []
  const affectedMemberId = members.map(getNoticeUserId).find(Boolean)
    || getNoticeUserId(extra.targetUser)
    || normalizeText(extra.fromUid ?? extra.sendUid)
  if (affectedMemberId && affectedMemberId === uid) return true

  const currentRole = Number(options.currentGroupMemberRole)
  if (!Number.isFinite(currentRole)) return false

  // 对齐旧 im：成员主动退群只通知群主（role/type=0），普通成员和管理员只更新成员状态，不显示系统提示。
  return currentRole !== 0
}

export function isGroupRemoveNoticeHiddenForCurrentUser(
  conversationId: string | undefined,
  message: Message,
  currentUid = '',
): boolean {
  if (conversationId && !isGroupConversation(conversationId)) return false
  const target = conversationId ? isGroupConversationTarget(conversationId) : ''
  if (target === 'invitation') return false
  if (message.msgType !== 8) return false

  const extra = parseGroupNoticeExtraObject(message.extra)
  if (!extra) return false
  if (String(extra.source ?? '') !== 'group-event') return false
  if (Number(extra.groupReqType ?? 0) !== 6) return false

  const uid = normalizeText(currentUid)
  if (!uid) return false

  const members = Array.isArray(extra.members) ? extra.members : []
  const removedMemberId = members.map(getNoticeUserId).find(Boolean)
    || getNoticeUserId(extra.targetUser)
  const actorId = normalizeText(extra.fromUid ?? extra.sendUid ?? message.senderId)

  // 旧库里已经落地的踢人提示也要按当前用户兜底：只让被踢者和踢人者看到，其它管理员/群主隐藏。
  return Boolean(removedMemberId && uid !== removedMemberId && uid !== actorId)
}

export function isMessageVisibleInTimeline(
  conversationId: string | undefined,
  message: Message,
  currentUid = '',
  options: MessageVisibilityOptions = {},
): boolean {
  if (message.isDeleted) return false
  if (isHiddenMessageType(message.msgType)) return false
  if (isLegacyGroupInviteRejectionInGroupChat(conversationId, message)) return false
  if (isSelfLeaveGroupSystemMessage(conversationId, message, currentUid)) return false
  if (isGroupMemberLeaveNoticeHiddenForCurrentUser(conversationId, message, currentUid, options)) return false
  if (isGroupRemoveNoticeHiddenForCurrentUser(conversationId, message, currentUid)) return false
  if (isGroupIntroHidden(message)) return false
  if (message.msgType === 6) return formatSystemNotificationText(message, { currentUid }) !== ''
  if (message.msgType === 8 && !isGroupIntroNoticeMessage(message)) {
    return formatSystemNotificationText(message, { currentUid }) !== ''
  }
  return true
}

export function isMessageEligibleForUnreadAnchor(
  conversationId: string | undefined,
  message: Message,
  currentUid = '',
  options: MessageVisibilityOptions = {},
): boolean {
  if (!isMessageVisibleInTimeline(conversationId, message, currentUid, options)) return false
  if (normalizeText(message.senderId) === normalizeText(currentUid)) return false
  if (Number(message.readStatus || 0) !== 0) return false
  if (message.msgType === 6) return false
  if (message.msgType === 8 && !isGroupIntroNoticeMessage(message)) return false
  return true
}
