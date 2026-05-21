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

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
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

  const receiveUid = normalizeText(extra.receiveUid)
  if (receiveUid && receiveUid === uid) return true

  const members = Array.isArray(extra.members) ? extra.members : []
  return members.some((member) => {
    if (!member || typeof member !== 'object') return false
    return normalizeText((member as Record<string, unknown>).userId) === uid
  })
}

export function isMessageVisibleInTimeline(
  conversationId: string | undefined,
  message: Message,
  currentUid = '',
): boolean {
  if (message.isDeleted) return false
  if (isHiddenMessageType(message.msgType)) return false
  if (isLegacyGroupInviteRejectionInGroupChat(conversationId, message)) return false
  if (isSelfLeaveGroupSystemMessage(conversationId, message, currentUid)) return false
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
): boolean {
  if (!isMessageVisibleInTimeline(conversationId, message, currentUid)) return false
  if (normalizeText(message.senderId) === normalizeText(currentUid)) return false
  if (Number(message.readStatus || 0) !== 0) return false
  if (message.msgType === 6) return false
  if (message.msgType === 8 && !isGroupIntroNoticeMessage(message)) return false
  return true
}
