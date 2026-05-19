import type { Message } from '@/stores/useMessageStore'
import { parseGroupNoticeExtraObject } from '@/utils/groupNoticeDisplay'

export interface GroupIntroNoticePayload {
  groupId: string
  notice: string
  noticeId: string
  key: string
  editorId: string
}

const GROUP_INTRO_NOTICE_META_KEYS = [
  'noticeId',
  'notice_id',
  'showNotify',
  'show_notify',
  'bfAll',
  'bf_all',
  'isHide',
  'is_hide',
]

function normalizeString(value: unknown): string {
  return String(value ?? '').trim()
}

function hasGroupIntroNoticeMeta(extra: Record<string, unknown>): boolean {
  return GROUP_INTRO_NOTICE_META_KEYS.some((key) => Object.prototype.hasOwnProperty.call(extra, key))
}

function isGroupEventSource(source: unknown): boolean {
  const value = normalizeString(source)
  return value.startsWith('group-event') || value.startsWith('channel-')
}

export function isGroupIntroNoticeMessage(message: Message | null | undefined): boolean {
  if (!message || message.msgType !== 8) return false
  const extra = parseGroupNoticeExtraObject(message.extra)
  if (!extra) return false
  if (isGroupEventSource(extra.source)) return false
  return hasGroupIntroNoticeMeta(extra)
}

export function getGroupIntroNoticeKey(message: Message): string {
  const extra = parseGroupNoticeExtraObject(message.extra)
  const noticeId = normalizeString(extra?.noticeId ?? extra?.notice_id)
  if (noticeId && noticeId !== '0') return noticeId
  return normalizeString(message.customMsgId) || normalizeString(message.id) || normalizeString(message.sendTime)
}

export function getGroupIntroNoticePayload(message: Message): GroupIntroNoticePayload {
  const extra = parseGroupNoticeExtraObject(message.extra)
  const groupId = normalizeString(extra?.groupId ?? extra?.group_id)
    || (message.conversationId?.startsWith('1_') ? message.conversationId.slice(2) : '')
  const noticeId = normalizeString(extra?.noticeId ?? extra?.notice_id)
  return {
    groupId,
    notice: normalizeString(message.content),
    noticeId,
    key: getGroupIntroNoticeKey(message),
    editorId: normalizeString(message.senderId),
  }
}
