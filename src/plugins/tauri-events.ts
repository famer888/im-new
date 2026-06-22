import { useNetworkStore, type WsStatus } from '@/stores/useNetworkStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  useChatStore,
  type Conversation,
} from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useScheduleDeletionStore } from '@/stores/useScheduleDeletionStore'
import { setupGlobalErrorHandler } from '@/utils/sentry'
import { playNotificationSound } from '@/utils/notificationSound'
import { isRepeatableGroupInviteReminderMessage, showMinimizedMessageReminder } from '@/utils/minimizedMessageReminder'
import { eventBus } from '@/utils/eventBus'
import { openNotificationModuleByConversationId } from '@/utils/notificationNavigation'
import { DEFAULT_READ_BURN_SECONDS } from '@/utils/readBurn'
import { isRemoteDefaultGroupIcon } from '@/utils/domainSafety'
import { router } from '@/router'
import { watch, type WatchStopHandle } from 'vue'
import {
  ensureChannelRelKey,
  ensureFriendRelKey,
  ensureFriendRelKeyForVersion,
  ensureGroupRelKey,
  normalizeResolvedFileKey,
  refreshGroupRelKey,
  resolvePrivateAttachmentFileKey,
  updateFriendKeyCacheFromPush,
} from '@/utils/e2ee'
import { isHiddenMessageType } from '@/types'

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

function groupInviteDebug(message: string, data?: Record<string, unknown>) {
  void message
  void data
}

const LOGOUT_CLEARED_HISTORY_FLAG_PREFIX = 'logout-cleared-history:'

function getLogoutClearedHistoryAt(uid: string): number {
  if (!uid) return 0
  const raw = localStorage.getItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${uid}`)
  const value = Number(raw || 0)
  return Number.isFinite(value) ? value : 0
}

function normalizeReceiptTime(value: unknown): number {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return Date.now()
  return n < 10_000_000_000 ? n * 1000 : n
}

type GroupEventMemberPatch = {
  groupId: string
  userId: string
  nickname: string | null
  avatar: string | null
  role: number
}

const pendingGroupInfoRefreshIds = new Set<string>()
let pendingGroupInfoRefreshTimer: ReturnType<typeof setTimeout> | null = null

function getGroupEventUserId(raw: any): string {
  return String(raw?.userId ?? raw?.uid ?? raw?.id ?? raw?.user?.uid ?? '').trim()
}

function getGroupEventUserName(raw: any): string | null {
  return String(
    raw?.nickname
      ?? raw?.nickName
      ?? raw?.remarkName
      ?? raw?.name
      ?? raw?.user?.nickName
      ?? '',
  ).trim() || null
}

function getGroupEventUserAvatar(raw: any): string | null {
  return String(raw?.avatar ?? raw?.icon ?? raw?.user?.icon ?? '').trim() || null
}

function getGroupEventAvatar(raw: any): string | null {
  const candidates = [
    raw?.pic,
    raw?.icon,
    raw?.headerImage,
    raw?.header_image,
    raw?.avatar,
    raw?.groupAvatar,
    raw?.group_avatar,
    raw?.headImage,
    raw?.head_image,
    raw?.faceUrl,
    raw?.face_url,
  ]

  for (const value of candidates) {
    // 群事件也按群列表规则过滤远程默认头像；否则会误判“事件已有头像”而跳过后续补拉。
    const avatar = String(value ?? '').trim()
    if (avatar && !isRemoteDefaultGroupIcon(avatar)) return avatar
  }
  return null
}

function scheduleGroupInfoRefresh(
  groupStore: ReturnType<typeof useGroupStore>,
  uid: string,
  groupId: string,
) {
  if (!uid || !groupId) return
  pendingGroupInfoRefreshIds.add(groupId)
  if (pendingGroupInfoRefreshTimer) return

  // 对齐旧 im：新群事件只带简略资料时，延迟补拉通讯录群列表，避免头像长期停留在默认图。
  pendingGroupInfoRefreshTimer = setTimeout(() => {
    pendingGroupInfoRefreshTimer = null
    const refreshingIds = Array.from(pendingGroupInfoRefreshIds)
    pendingGroupInfoRefreshIds.clear()
    void groupStore.loadGroups(uid, { forceApi: true }).then(() => {
      const stillMissingAvatar = refreshingIds.some(id => !groupStore.getGroup(id)?.avatar)
      if (stillMissingAvatar) {
        window.setTimeout(() => {
          void groupStore.loadGroups(uid, { forceApi: true })
        }, 3000)
      }
    })
  }, 800)
}

function normalizeGroupEventMember(
  raw: any,
  groupId: string,
  existingRole?: number,
): GroupEventMemberPatch | null {
  const userId = getGroupEventUserId(raw)
  if (!userId) return null
  return {
    groupId,
    userId,
    nickname: getGroupEventUserName(raw),
    avatar: getGroupEventUserAvatar(raw),
    role: Number(raw?.role ?? raw?.type ?? existingRole ?? 2),
  }
}

function getFiniteGroupRole(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const role = Number(value)
  return Number.isFinite(role) ? role : null
}

function getFiniteChannelMemberType(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const memberType = Number(value)
  return Number.isFinite(memberType) ? memberType : null
}

function getGroupEventActorId(extra: any): string {
  return String(
    extra?.fromUid
      ?? extra?.sendUid
      ?? extra?.fromUser?.userId
      ?? extra?.fromUser?.uid
      ?? '',
  ).trim()
}

function resolveGroupEventActorRole(
  groupStore: ReturnType<typeof useGroupStore>,
  groupId: string,
  extra: any,
): number | null {
  const actorId = getGroupEventActorId(extra)
  if (!actorId) return null

  const explicitRole = getFiniteGroupRole(extra?.actorRole ?? extra?.actorMemberRole)
  if (explicitRole !== null) return explicitRole

  const fromUserRole = getFiniteGroupRole(extra?.fromUser?.role ?? extra?.fromUser?.type ?? extra?.fromUser?.memberType)
  if (fromUserRole !== null) return fromUserRole

  const cachedRole = groupStore.getMembers(groupId).find((member) => member.userId === actorId)?.role
  const cachedRoleValue = getFiniteGroupRole(cachedRole)
  if (cachedRoleValue !== null) return cachedRoleValue

  const checkUserType = getFiniteGroupRole(extra?.checkUserType)
  if (checkUserType === 1 || checkUserType === 2) return checkUserType

  return null
}

function enrichGroupEventNoticeExtra(
  groupStore: ReturnType<typeof useGroupStore>,
  groupId: string,
  extra: any,
) {
  if (!extra || typeof extra !== 'object') return
  const actorRole = resolveGroupEventActorRole(groupStore, groupId, extra)
  if (actorRole === null) return

  extra.actorRole = actorRole
  if (extra.fromUser && typeof extra.fromUser === 'object') {
    extra.fromUser = {
      ...extra.fromUser,
      role: getFiniteGroupRole(extra.fromUser.role ?? extra.fromUser.type ?? extra.fromUser.memberType) ?? actorRole,
    }
  }
}

function collectGroupEventMemberPatches(
  groupStore: ReturnType<typeof useGroupStore>,
  groupId: string,
  extra: any,
) {
  const existingMembers = groupStore.getMembers(groupId)
  const existingRoleMap = new Map(existingMembers.map((member) => [member.userId, member.role]))
  const patchMap = new Map<string, GroupEventMemberPatch>()

  const addPatch = (raw: any) => {
    const userId = getGroupEventUserId(raw)
    const member = normalizeGroupEventMember(raw, groupId, userId ? existingRoleMap.get(userId) : undefined)
    if (member) patchMap.set(member.userId, member)
  }
  const addUidPatch = (uid: unknown) => {
    const userId = String(uid ?? '').trim()
    if (!userId || userId === '0') return
    addPatch({ userId, role: existingRoleMap.get(userId) ?? 2 })
  }
  const addActorPatch = (raw: any) => {
    const actorId = getGroupEventActorId(extra)
    const existingRole = actorId ? getFiniteGroupRole(existingRoleMap.get(actorId)) : null
    const fromUserRole = getFiniteGroupRole(raw?.role ?? raw?.type ?? raw?.memberType)
    const checkUserType = getFiniteGroupRole(extra?.checkUserType)
    const actorRole = existingRole
      ?? fromUserRole
      ?? (checkUserType === 1 || checkUserType === 2 ? checkUserType : null)
    if (actorRole === null) return
    addPatch({ ...raw, userId: actorId || getGroupEventUserId(raw), role: actorRole })
  }
  const removeMode = shouldRemoveGroupEventMembers(extra)
  const reqType = Number(extra?.groupReqType ?? 0)

  if (Array.isArray(extra?.members)) {
    for (const item of extra.members) addPatch(item)
  }
  if (Array.isArray(extra?.groupMember)) {
    for (const item of extra.groupMember) addPatch(item)
  } else {
    addPatch(extra?.groupMember)
  }

  if (removeMode) {
    addPatch(extra?.targetUser)
    if (reqType === 7) {
      addPatch(extra?.fromUser)
      addUidPatch(extra?.fromUid ?? extra?.sendUid)
    }
  } else {
    addActorPatch(extra?.fromUser)
    addPatch(extra?.targetUser)
    addPatch(extra?.checkUser)
  }

  return Array.from(patchMap.values())
}

function shouldRemoveGroupEventMembers(extra: any): boolean {
  const reqType = Number(extra?.groupReqType ?? 0)
  return reqType === 6 || reqType === 7 || reqType === 18
}

function isGroupEventSource(source: string): boolean {
  return (
    source === 'group-event'
    || source === 'group-update-event'
    || source === 'group-event-req'
    || source === 'group-event-req-chat'
  )
}

function getFirstGroupEventMemberId(extra: any): string {
  const memberGroups = [extra?.members, extra?.groupMember]
  for (const group of memberGroups) {
    const members = Array.isArray(group) ? group : [group]
    for (const member of members) {
      const userId = getGroupEventUserId(member)
      if (userId) return userId
    }
  }
  return ''
}

function getGroupEventAffectedMemberId(extra: any): string {
  const reqType = Number(extra?.groupReqType ?? 0)
  const memberId = getFirstGroupEventMemberId(extra)
  if (memberId) return memberId

  const targetUserId = getGroupEventUserId(extra?.targetUser)
  if (targetUserId) return targetUserId

  if (reqType === 7) {
    return getGroupEventActorId(extra)
  }

  return ''
}

function shouldRemoveLocalGroupForEvent(extra: any, currentUid: string): boolean {
  if (String(extra?.source || '') !== 'group-event') return false
  const reqType = Number(extra?.groupReqType ?? 0)
  if (reqType === 13) return true
  if (reqType !== 6 && reqType !== 7) return false

  const affectedMemberId = getGroupEventAffectedMemberId(extra)
  return Boolean(currentUid && affectedMemberId && affectedMemberId === currentUid)
}

function getGroupEventReceiptPayload(extra: any): { groupId: number; msgType: number; msgIds: number[] } | null {
  const source = String(extra?.source || '')
  if (source !== 'group-event' && source !== 'group-update-event') return null

  const groupId = Number(extra?.groupId || 0)
  const msgType = Number(extra?.groupMsgType ?? 0)
  const msgId = Number(extra?.groupEventMsgId ?? 0)
  if (!Number.isFinite(groupId) || groupId <= 0) return null
  if (!Number.isFinite(msgId) || msgId <= 0) return null

  return {
    groupId,
    msgType: Number.isFinite(msgType) ? msgType : 0,
    msgIds: [msgId],
  }
}

async function sendGroupEventReceipt(extra: any, receiptStatus: 0 | 3) {
  const payload = getGroupEventReceiptPayload(extra)
  if (!payload) return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('send_group_event_receipt', {
      ...payload,
      receiptStatus,
    })
  } catch (err) {
    console.warn('[group-event] send receipt failed:', { receiptStatus, payload, err })
  }
}

function isPendingGroupReqChatMessage(message: any): boolean {
  const convId = String(message?.conversationId ?? message?.conversation_id ?? '')
  const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
  return convId.startsWith('1_')
    && String(extra?.source || '') === 'group-event-req-chat'
    && Number(extra?.groupReqStatus ?? 0) !== 1
}

function isPendingGroupInvitationNotice(convId: string, extra: any): boolean {
  if (convId !== `1_${GROUP_NOTIFICATION_TARGET_ID}`) return false

  const source = String(extra?.source || '')
  const status = Number(extra?.groupReqStatus ?? 0)
  if (source === 'group-event-req') {
    return status !== 1
  }
  // 兼容 WS `group-event`：邀请你入群（未同意）会落到 `1_invitation`，必须视作“待同意通知”，不能写入通讯录群列表。
  if (source === 'group-event') {
    const reqType = Number(extra?.groupReqType ?? 0)
    if ([1, 2, 15].includes(reqType)) return status !== 1
    if ([3, 4].includes(reqType)) return status === 2
  }
  return false
}

function applyGroupEventMemberPatch(groupStore: ReturnType<typeof useGroupStore>, groupId: string, extra: any) {
  const patches = collectGroupEventMemberPatches(groupStore, groupId, extra)
  if (!patches.length) return

  const existingMembers = groupStore.getMembers(groupId)
  const existingMap = new Map(existingMembers.map((member) => [member.userId, member]))
  const beforeCount = existingMembers.length

  if (shouldRemoveGroupEventMembers(extra)) {
    for (const patch of patches) existingMap.delete(patch.userId)
  } else {
    for (const patch of patches) {
      const previous = existingMap.get(patch.userId)
      existingMap.set(patch.userId, {
        ...previous,
        ...patch,
        nickname: patch.nickname || previous?.nickname || patch.userId,
        avatar: patch.avatar || previous?.avatar || null,
        role: patch.role || previous?.role || 2,
      })
    }
  }

  const mergedMembers = Array.from(existingMap.values())
  groupInviteDebug('merge group event members before append message', {
    groupId,
    source: String(extra?.source || ''),
    groupReqType: Number(extra?.groupReqType ?? 0),
    handleType: Number(extra?.handleType ?? 0),
    beforeCount,
    patchCount: patches.length,
    afterCount: mergedMembers.length,
    patchMemberIds: patches.map((member) => member.userId),
    removeMode: shouldRemoveGroupEventMembers(extra),
  })
  groupStore.setGroupMembers(groupId, mergedMembers)
}

interface ReadProcessingResult {
  readMessageIds: string[]
  localReadMessageIds?: string[]
  scheduledDeletions: Array<{
    conversationId: string
    messageId: string
    expireAt: number
  }>
  groupReadUpdates?: GroupReadReceiptUpdate[]
  conversationReadUpdates?: Array<{
    conversationId: string
    unreadCount: number
  }>
}

interface GroupReadReceiptUpdate {
  conversationId: string
  messageId: string
  readStatus: number
  extra?: string | null
}

interface ForceLogoutPayload {
  cmd?: number
  reason?: string
  kickType?: number
}

interface TrayLogoutPayload {
  quit?: boolean
}

function shouldPlayIncomingMessageSound(messages: any[], currentUid: string): boolean {
  if (!currentUid) return false

  const settingStore = useSettingStore()
  if (!settingStore.settings.notificationSound) return false

  const chatStore = useChatStore()
  const channelStore = useChannelStore()
  return messages.some((item) => {
    const convId = String(item?.conversationId ?? item?.conversation_id ?? '')
    const senderId = String(item?.senderId ?? item?.sender_id ?? '')
    if (!convId.includes('_') || !senderId || senderId === currentUid) return false
    if (Boolean(item?.isDeleted ?? item?.is_deleted ?? false)) return false

    const conv = chatStore.conversations.find((row) => row.id === convId)
    if (conv?.isMuted) return false
    if (convId.startsWith('2_')) {
      const channelId = conv?.targetId || convId.split('_')[1] || ''
      const channel = channelStore.getChannel(channelId)
        || channelStore.channels.find((row) => row.id === channelId || row.channelId === channelId)
      if (channel?.isDisturb) return false
    }

    return true
  })
}

function getMessageIdentity(message: any): { conversationId: string; id: string; customMsgId: string; senderId: string } {
  return {
    conversationId: String(message?.conversationId ?? message?.conversation_id ?? ''),
    id: String(message?.id ?? message?.msgId ?? message?.msg_id ?? ''),
    customMsgId: String(message?.customMsgId ?? message?.custom_msg_id ?? ''),
    senderId: String(message?.senderId ?? message?.sender_id ?? ''),
  }
}

function numericPayloadField(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function stringPayloadField(value: unknown): string {
  return String(value ?? '')
}

function shouldPreserveConversationOrderForUpdate(existing: Conversation | undefined, payload: any): boolean {
  if (!existing) return false

  const nextPinned = Boolean(payload?.isPinned ?? payload?.is_pinned ?? existing.isPinned)
  if (nextPinned !== existing.isPinned) return false

  const hasLastMsgTime = payload?.lastMsgTime !== undefined || payload?.last_msg_time !== undefined
  const hasLastMsgId = payload?.lastMsgId !== undefined || payload?.last_msg_id !== undefined
  const hasLastMsgDigest = payload?.lastMsgDigest !== undefined || payload?.last_msg_digest !== undefined
  const rawNextLastMsgTime = payload?.lastMsgTime !== undefined
    ? payload.lastMsgTime
    : payload?.last_msg_time !== undefined ? payload.last_msg_time : existing.lastMsgTime
  const rawNextLastMsgId = payload?.lastMsgId !== undefined
    ? payload.lastMsgId
    : payload?.last_msg_id !== undefined ? payload.last_msg_id : existing.lastMsgId
  const rawNextLastMsgDigest = payload?.lastMsgDigest !== undefined
    ? payload.lastMsgDigest
    : payload?.last_msg_digest !== undefined ? payload.last_msg_digest : ''
  const nextLastMsgTime = numericPayloadField(rawNextLastMsgTime)
  const nextLastMsgId = stringPayloadField(rawNextLastMsgId)
  const nextLastMsgDigest = stringPayloadField(rawNextLastMsgDigest)
  // 清空聊天记录会把摘要清成空，但旧 im 只清内容不移动会话窗口；这里保留原列表位置，避免单聊/群/频道看起来像会话消失。
  if (
    hasLastMsgTime
    && hasLastMsgId
    && nextLastMsgTime <= 0
    && !nextLastMsgId
    && (!hasLastMsgDigest || !nextLastMsgDigest)
  ) {
    return true
  }

  if (nextLastMsgTime !== numericPayloadField(existing.lastMsgTime)) return false

  if (nextLastMsgId !== stringPayloadField(existing.lastMsgId)) return false

  // 对齐旧 im：资料、未读、已读回执、摘要修正不改变 sendTime，所以只替换当前项，不触发左侧列表重排。
  return true
}

function getBatchMessageKey(message: any): string {
  const { conversationId, id, customMsgId } = getMessageIdentity(message)
  const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
  const fallbackId = String(extra?.notificationIdentity ?? extra?.groupEventMsgId ?? '')
  return `${conversationId}:${id || customMsgId || fallbackId}`
}

function isCachedMessage(message: any): boolean {
  const messageStore = useMessageStore()
  const { conversationId, id, customMsgId } = getMessageIdentity(message)
  if (!conversationId.includes('_') || (!id && !customMsgId)) return false
  return messageStore.getMessages(conversationId).some((item) => (
    (!!id && String(item.id || '') === id) ||
    (!!customMsgId && String(item.customMsgId || '') === customMsgId)
  ))
}

function getNewIncomingMessages(messages: any[], currentUid: string): any[] {
  if (!currentUid) return []
  return messages.filter((message) => {
    const { conversationId, senderId } = getMessageIdentity(message)
    if (!conversationId.includes('_') || !senderId || senderId === currentUid) return false
    if (Boolean(message?.isDeleted ?? message?.is_deleted ?? false)) return false
    return !isCachedMessage(message)
  })
}

const ALERT_HISTORY_GRACE_MS = 5000
const alertBaselineByUid = new Map<string, number>()
const HIDDEN_BATCH_UPDATE_GRACE_MS = 10_000
const hiddenOnlyBatchByConversation = new Map<string, {
  hiddenMaxSendTime: number
  previous: Conversation | null
  expiresAt: number
}>()
// 频道移除后，Rust 落库可能还会异步推 conv:update；短时间屏蔽该会话，避免左侧列表闪回。
const CHANNEL_REMOVED_UPDATE_BLOCK_MS = 5 * 60 * 1000
const removedChannelConversationBlockById = new Map<string, number>()

// Rust 只发内部状态事件；频道通知是否可见仍由服务端 channelNoticeMsg 决定。
type ChannelRemovedPayload = {
  channelId?: string | number
  channelName?: string
  icon?: string
  reason?: 'subscriber-remove' | 'dissolved' | 'cancelled' | string
}

function getChannelConversationId(channelId: string | number | null | undefined): string {
  const id = String(channelId ?? '').trim()
  return id ? `2_${id}` : ''
}

function pruneRemovedChannelConversationBlocks(now = Date.now()) {
  for (const [conversationId, expiresAt] of removedChannelConversationBlockById) {
    if (expiresAt <= now) removedChannelConversationBlockById.delete(conversationId)
  }
}

function blockRemovedChannelConversation(channelId: string | number | null | undefined) {
  const conversationId = getChannelConversationId(channelId)
  if (!conversationId) return
  // 防止同批消息落库后的 conv:update 把刚删除的频道会话重新塞回左侧列表。
  removedChannelConversationBlockById.set(conversationId, Date.now() + CHANNEL_REMOVED_UPDATE_BLOCK_MS)
}

function unblockRemovedChannelConversation(channelId: string | number | null | undefined) {
  const conversationId = getChannelConversationId(channelId)
  if (!conversationId) return
  removedChannelConversationBlockById.delete(conversationId)
}

function isBlockedRemovedChannelConversation(conversationId: string): boolean {
  pruneRemovedChannelConversationBlocks()
  return removedChannelConversationBlockById.has(conversationId)
}

function isChannelRemovalBatchMessage(message: any): boolean {
  const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
  const source = String(extra?.source || '')
  const subscriberOperateType = Number(extra?.subscriberOperateType ?? -1)
  // 兼容旧批次：移除事件可能是显式 channel-remove，也可能是 channel-notice + operateType=2。
  return source === 'channel-remove' || (source === 'channel-notice' && subscriberOperateType === 2)
}

function collectRemovedChannelIdsFromBatch(messages: any[]): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    if (!isChannelRemovalBatchMessage(message)) continue
    const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
    const channelId = String(extra?.channelId || '').trim()
    if (channelId) ids.add(channelId)
  }
  return ids
}

function filterMessagesForRemovedChannels(messages: any[], removedChannelIds: Set<string>): any[] {
  if (removedChannelIds.size === 0) return messages
  // 同批里移除事件后面的频道消息不能继续入内存/落库，否则会重新 ensure 出频道会话。
  return messages.filter((message) => {
    const conversationId = String(message?.conversationId ?? message?.conversation_id ?? '')
    if (!conversationId.startsWith('2_')) return true
    const channelId = conversationId.split('_')[1] || ''
    return !removedChannelIds.has(channelId)
  })
}

function getMessageSendTime(message: any): number {
  const value = Number(message?.sendTime ?? message?.send_time ?? 0)
  if (!Number.isFinite(value) || value <= 0) return Date.now()
  return value < 10_000_000_000 ? value * 1000 : value
}

function getRealtimeIncomingMessages(messages: any[], currentUid: string): any[] {
  const alertBaseline = alertBaselineByUid.get(currentUid) ?? Date.now()
  alertBaselineByUid.set(currentUid, alertBaseline)
  const minSendTime = alertBaseline - ALERT_HISTORY_GRACE_MS
  return getNewIncomingMessages(messages, currentUid).filter((message) => getMessageSendTime(message) >= minSendTime)
}

/**
 * 桌面提醒与会话列表去重解耦：
 * 群邀请类通知按服务端到达事件数提醒，普通消息仍沿用“实时新消息”口径，避免回归现有提醒范围。
 */
function getDesktopReminderMessages(
  visibleMessages: any[],
  realtimeIncomingMessages: any[],
  currentUid: string,
): any[] {
  const repeatableInvites = visibleMessages.filter((message) => {
    const { conversationId, senderId } = getMessageIdentity(message)
    if (!conversationId.includes('_') || !senderId || senderId === currentUid) return false
    if (Boolean(message?.isDeleted ?? message?.is_deleted ?? false)) return false
    return isRepeatableGroupInviteReminderMessage(message)
  })

  if (repeatableInvites.length === 0) return realtimeIncomingMessages

  const regularRealtimeMessages = realtimeIncomingMessages.filter(
    (message) => !isRepeatableGroupInviteReminderMessage(message),
  )
  return [...repeatableInvites, ...regularRealtimeMessages]
}

function getBatchMsgType(message: any): number {
  return Number(message?.msgType ?? message?.msg_type ?? 0)
}

function isHiddenBatchMessage(message: any): boolean {
  return isHiddenMessageType(getBatchMsgType(message))
}

function rememberHiddenOnlyBatchConversations(messages: any[], visibleMessages: any[]) {
  const chatStore = useChatStore()
  const visibleConvIds = new Set(
    visibleMessages
      .map((m: any) => String(m?.conversationId ?? m?.conversation_id ?? ''))
      .filter((convId) => convId.includes('_')),
  )
  for (const convId of visibleConvIds) {
    hiddenOnlyBatchByConversation.delete(convId)
  }

  const hiddenMaxByConv = new Map<string, number>()
  for (const message of messages) {
    if (!isHiddenBatchMessage(message)) continue
    const convId = String(message?.conversationId ?? message?.conversation_id ?? '')
    if (!convId.includes('_') || visibleConvIds.has(convId)) continue
    hiddenMaxByConv.set(convId, Math.max(hiddenMaxByConv.get(convId) ?? 0, getMessageSendTime(message)))
  }

  const expiresAt = Date.now() + HIDDEN_BATCH_UPDATE_GRACE_MS
  for (const [convId, hiddenMaxSendTime] of hiddenMaxByConv) {
    hiddenOnlyBatchByConversation.set(convId, {
      hiddenMaxSendTime,
      previous: chatStore.conversations.find((conv) => conv.id === convId) ?? null,
      expiresAt,
    })
  }
}

async function removeLocalChannelConversation(payload: ChannelRemovedPayload, source: string) {
  const channelId = String(payload?.channelId ?? '').trim()
  if (!channelId) return

  const authStore = useAuthStore()
  const chatStore = useChatStore()
  const channelStore = useChannelStore()
  const currentUid = String(authStore.uid || '')
  const channelConvId = getChannelConversationId(channelId)
  const wasCurrentChannel = chatStore.currentConversationId === channelConvId
  const cachedChannel = channelStore.getChannel(channelId)

  // 先保留一份频道展示信息，再删除频道；频道通知页面还需要用这些信息展示历史移除通知。
  blockRemovedChannelConversation(channelId)
  if (payload.channelName || payload.icon || cachedChannel) {
    channelStore.patchChannel(channelId, {
      id: channelId,
      channelId,
      name: payload.channelName || cachedChannel?.name || cachedChannel?.channelName || channelId,
      channelName: payload.channelName || cachedChannel?.channelName || cachedChannel?.name || channelId,
      avatar: payload.icon || cachedChannel?.avatar || null,
      icon: payload.icon || cachedChannel?.icon || null,
      logoColor: cachedChannel?.logoColor || null,
    })
  }
  await channelStore.removeChannel(currentUid, channelId)
  if (currentUid) {
    await chatStore.deleteConversation(currentUid, channelConvId).catch((err: unknown) => {
      console.warn('[channel] delete removed channel conversation failed:', { channelId, source, err })
    })
  }

  if (wasCurrentChannel) {
    // 当前正停留在被移除频道时，旧 im 会退出该会话；这里同步关闭聊天详情和右侧面板。
    chatStore.setCurrentConversation(null)
    const uiStore = useUIStore()
    uiStore.setRightPanel('none')
    uiStore.setDetailView('none')
  }
}

let screenshotShortcutBound = false
let screenshotStarting = false
let forceLogoutHandling = false
let trayLogoutHandling = false
let lastTrayFlashAt = 0
const tauriListenersGlobal = globalThis as typeof globalThis & {
  __OCS_TAURI_LISTENER_GENERATION__?: number
  __OCS_TAURI_LISTENER_UNLISTENS__?: Array<() => void>
  __OCS_TAURI_DOM_LISTENERS_BOUND__?: boolean
  __OCS_TRAY_UNREAD_WATCH_STOP__?: WatchStopHandle
  __OCS_NOTIFICATION_REPLY_IDS__?: Map<string, number>
  __OCS_NOTIFICATION_REPLY_FINGERPRINTS__?: Map<string, number>
}

type TauriEvent<T> = { payload: T }
type TauriListen = <T>(
  eventName: string,
  handler: (event: TauriEvent<T>) => void | Promise<void>,
) => Promise<() => void>
type NotificationReplyPayload = {
  requestId?: string
  conversationId?: string
  content?: string
}
const NOTIFICATION_REPLY_DEDUP_MS = 30_000
const NOTIFICATION_REPLY_FINGERPRINT_DEDUP_MS = 3_000

function cleanupNotificationReplyMap(map: Map<string, number>, now: number, ttl: number) {
  for (const [id, createdAt] of map) {
    if (now - createdAt > ttl) map.delete(id)
  }
}

function consumeNotificationReplyRequest(requestId: string, conversationId: string, content: string): boolean {
  const now = Date.now()
  const seenIds = tauriListenersGlobal.__OCS_NOTIFICATION_REPLY_IDS__
    ?? new Map<string, number>()
  const seenFingerprints = tauriListenersGlobal.__OCS_NOTIFICATION_REPLY_FINGERPRINTS__
    ?? new Map<string, number>()
  tauriListenersGlobal.__OCS_NOTIFICATION_REPLY_IDS__ = seenIds
  tauriListenersGlobal.__OCS_NOTIFICATION_REPLY_FINGERPRINTS__ = seenFingerprints

  cleanupNotificationReplyMap(seenIds, now, NOTIFICATION_REPLY_DEDUP_MS)
  cleanupNotificationReplyMap(seenFingerprints, now, NOTIFICATION_REPLY_FINGERPRINT_DEDUP_MS)
  if (requestId && seenIds.has(requestId)) {
    return false
  }

  const fingerprint = `${conversationId}\u0000${content}`
  if (seenFingerprints.has(fingerprint)) {
    return false
  }

  // 右下角通知回复可能因双击或热更新残留监听重复到达；同一请求只允许主发送链路消费一次。
  if (requestId) seenIds.set(requestId, now)
  // 也按会话和内容做短窗口去重，防止双击或热更新残留监听用不同 requestId 重复消费。
  seenFingerprints.set(fingerprint, now)
  return true
}

function isScreenshotShortcut(e: KeyboardEvent): boolean {
  const isA = e.key.toLowerCase() === 'a' || e.code === 'KeyA'
  if (!isA || !e.shiftKey) return false
  return e.ctrlKey
}

function setupScreenshotShortcut() {
  if (screenshotShortcutBound || !isTauri()) return
  screenshotShortcutBound = true
  window.addEventListener('keydown', async (e) => {
    if (!isScreenshotShortcut(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat || screenshotStarting) return
    screenshotStarting = true
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('start_screenshot')
    } catch (err) {
      console.warn('[screenshot] start failed:', err)
    } finally {
      window.setTimeout(() => {
        screenshotStarting = false
      }, 600)
    }
  }, true)
}

function setupTrayUnreadSync() {
  if (!isTauri()) return

  tauriListenersGlobal.__OCS_TRAY_UNREAD_WATCH_STOP__?.()

  const chatStore = useChatStore()
  let lastSynced = -1

  tauriListenersGlobal.__OCS_TRAY_UNREAD_WATCH_STOP__ = watch(
    () => chatStore.totalUnread,
    async (value) => {
      const count = Math.max(0, Math.floor(Number(value || 0)))
      if (count === lastSynced) return
      lastSynced = count

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('update_tray_unread_count', { count, flash: false })
      } catch (err) {
        console.warn('[tray] update unread count failed:', err)
      }
    },
    { immediate: true },
  )
}

async function flashTrayForIncomingMessage(incomingCount = 1) {
  if (!isTauri()) return

  try {
    const now = Date.now()
    if (now - lastTrayFlashAt < 1200) {
      return
    }
    lastTrayFlashAt = now

    const chatStore = useChatStore()
    const totalUnread = Math.floor(Number(chatStore.totalUnread || 0))
    const count = Math.max(
      0,
      totalUnread,
      Math.floor(Number(incomingCount || 0)),
    )
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('update_tray_unread_count', { count, flash: true })
  } catch (err) {
    console.warn('[tray] flash incoming message failed:', err)
  }
}

function resetClientStateAfterLogout() {
  const chatStore = useChatStore()
  const messageStore = useMessageStore()
  const contactStore = useContactStore()
  const groupStore = useGroupStore()
  const channelStore = useChannelStore()
  const uiStore = useUIStore()
  const networkStore = useNetworkStore()

  alertBaselineByUid.clear()
  networkStore.setWsStatus('disconnected')
  chatStore.enablePersistence('')
  chatStore.currentConversationId = null
  chatStore.conversations = []
  messageStore.clearAllMessageCaches()
  contactStore.contacts = []
  contactStore.searchResults = []
  groupStore.groups = []
  groupStore.memberMap = new Map()
  channelStore.channels = []
  uiStore.setDetailView('none')
  uiStore.setRightPanel('none')
  uiStore.setSidebarTab('chats')
  uiStore.closeSettings()
}

export async function setupTauriListeners() {
  setupGlobalErrorHandler()
  let groupKeyWarmupPending: Promise<void> | null = null

  if (!tauriListenersGlobal.__OCS_TAURI_DOM_LISTENERS_BOUND__) {
    tauriListenersGlobal.__OCS_TAURI_DOM_LISTENERS_BOUND__ = true

    window.addEventListener('online', () => {
      const networkStore = useNetworkStore()
      networkStore.setOnline(true)
    })

    window.addEventListener('offline', () => {
      const networkStore = useNetworkStore()
      networkStore.setOnline(false)
    })
  }

  if (!isTauri()) {
    console.warn('[tauri-events] Not running in Tauri, skipping native event listeners')
    return
  }

  setupScreenshotShortcut()
  setupTrayUnreadSync()

  for (const unlisten of tauriListenersGlobal.__OCS_TAURI_LISTENER_UNLISTENS__ ?? []) {
    try {
      unlisten()
    } catch (err) {
      console.warn('[tauri-events] unlisten stale listener failed:', err)
    }
  }
  tauriListenersGlobal.__OCS_TAURI_LISTENER_UNLISTENS__ = []
  const generation = (tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ ?? 0) + 1
  tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ = generation

  const { listen: rawListen } = await import('@tauri-apps/api/event') as { listen: TauriListen }
  const listen = <T>(
    eventName: string,
    handler: (event: TauriEvent<T>) => void | Promise<void>,
  ) => {
    rawListen<T>(eventName, (event) => {
      if (tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ !== generation) return
      void handler(event)
    })
      .then((unlisten) => {
        if (tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ !== generation) {
          unlisten()
          return
        }
        tauriListenersGlobal.__OCS_TAURI_LISTENER_UNLISTENS__?.push(unlisten)
      })
      .catch((err) => {
        console.warn('[tauri-events] listen failed:', { eventName, err })
      })
  }
  const scheduleDeletionStore = useScheduleDeletionStore()

  scheduleDeletionStore.startCleanup((timer) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    messageStore.deleteMessage(timer.conversationId, timer.messageId)

    const uid = String(authStore.uid || '')
    if (!uid) return

    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('delete_message', { uid, messageId: timer.messageId }))
      .catch((err) => {
        console.warn('[read-burn] delete_message failed:', err)
      })
  })

  listen('tray:open-settings', async () => {
    const authStore = useAuthStore()
    const uiStore = useUIStore()

    if (authStore.isLoggedIn && router.currentRoute.value.path !== '/home') {
      await router.replace('/home').catch(() => {})
    }
    uiStore.openSettings()
  })

  listen<TrayLogoutPayload>('tray:logout', async (event) => {
    if (trayLogoutHandling) return
    trayLogoutHandling = true

    try {
      const authStore = useAuthStore()
      resetClientStateAfterLogout()
      await authStore.logout()
      if (!isTauri()) {
        await router.replace('/login').catch(() => {})
      }
      if (event.payload?.quit) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('exit_app')
      }
    } finally {
      trayLogoutHandling = false
    }
  })

  listen<string>('ws:status', (event) => {
    const networkStore = useNetworkStore()
    networkStore.setWsStatus(event.payload as WsStatus)

    // WS 连接成功后，预热当前会话列表中的群 relKey，避免入站群消息解密失败。
    if (event.payload === 'connected' && !groupKeyWarmupPending) {
      const authStore = useAuthStore()
      const chatStore = useChatStore()
      const contactStore = useContactStore()
      const uid = String(authStore.uid || '')
      if (!uid) return
      const groupIds = chatStore.conversations
        .filter((c) => c.type === 1 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      const channelIds = chatStore.conversations
        .filter((c) => c.type === 2 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      const friendIds = chatStore.conversations
        .filter((c) => c.type === 0 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      const contactFriendIds = contactStore.contacts
        .map((c) => String(c.id || ''))
        .filter((id) => /^\d+$/.test(id))
      const allFriendIds = Array.from(new Set([...friendIds, ...contactFriendIds]))
      if (groupIds.length === 0 && channelIds.length === 0 && allFriendIds.length === 0) return
      groupKeyWarmupPending = (async () => {
        for (const gid of groupIds) {
          try {
            await ensureGroupRelKey(uid, gid)
          } catch {
            // relKey 预热失败不阻塞连接流程；真正收消息/发消息时会按原路径重试。
          }
        }
        for (const cid of channelIds) {
          try {
            await ensureChannelRelKey(uid, cid)
          } catch (err) {
            console.warn('[channel] warmup channel relKey failed', { cid, err: String(err) })
          }
        }
        for (const fid of allFriendIds) {
          try {
            await ensureFriendRelKey(uid, fid)
          } catch {
            // 好友 relKey 预热失败不阻塞连接流程；单聊实际解密/发送时会按原路径重试。
          }
        }
      })().finally(() => {
        groupKeyWarmupPending = null
      })
    }
  })

  listen<{
    uid?: string | number
    appKeyPair?: { publicKey?: string; keyVersion?: number } | null
    webKeyPair?: { publicKey?: string; keyVersion?: number } | null
  }>('key-pair:change', (event) => {
    const authStore = useAuthStore()
    const uid = String(authStore.uid || '').trim()
    if (!uid) return
    updateFriendKeyCacheFromPush(uid, event.payload || {})
  })

  listen<{ conversationId?: string }>('notification:click', async (event) => {
    const conversationId = String(event.payload?.conversationId || '')
    if (!conversationId) return

    try {
      const { Window } = await import('@tauri-apps/api/window')
      const mainWindow = await Window.getByLabel('main')
      if (mainWindow) {
        await mainWindow.show().catch(() => {})
        await mainWindow.unminimize().catch(() => {})
        await mainWindow.setFocus().catch(() => {})
      }
    } catch (error) {
      console.warn('[notification] focus main window failed:', error)
    }

    const chatStore = useChatStore()
    const [convTypeRaw, convTargetId = ''] = conversationId.split('_')
    const convType = Number(convTypeRaw)
    if (convType === 2 && convTargetId) {
      const channelStore = useChannelStore()
      // 系统通知点开频道会话时，不等待详情接口，先恢复窗口和会话焦点。
      void channelStore.ensureChannelDetailReady(convTargetId)
    }
    if (conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) {
      console.warn('[group-notification-unread] notification click', {
        conversationId,
        currentConversationId: chatStore.currentConversationId || '',
      })
    }
    const openedNotificationModule = await openNotificationModuleByConversationId(conversationId)
    if (!openedNotificationModule) {
      if ([0, 1, 2].includes(convType) && convTargetId) {
        // 对齐旧 im：通知点击后先确保会话条目存在，再切到该会话，避免边界时机点开空白聊天区。
        chatStore.ensureConversation(convType, convTargetId)
      }
      chatStore.setCurrentConversation(conversationId)
      const uiStore = useUIStore()
      uiStore.setDetailView('chat')
    }
    if (router.currentRoute.value.path !== '/home') {
      await router.replace('/home').catch(() => {})
    }
  })

  listen<NotificationReplyPayload>('notification:reply:v3', async (event) => {
    const payload = event.payload || {}

    try {
      const requestId = String(payload.requestId || '')
      const conversationId = String(payload.conversationId || '')
      const content = String(payload.content || '').trim()
      if (!conversationId || !content) throw new Error('invalid notification reply')
      if (!consumeNotificationReplyRequest(requestId, conversationId, content)) return

      const authStore = useAuthStore()
      const uid = String(authStore.uid || localStorage.getItem('current-uid') || '')
      if (!uid) throw new Error('missing uid')

      const [convTypeRaw, convTargetId = ''] = conversationId.split('_')
      const convType = Number(convTypeRaw)
      if ([0, 1, 2].includes(convType) && convTargetId) {
        // 对齐旧 im：通知回复也回到主窗口既有发送链路，先保证会话壳存在再发送。
        useChatStore().ensureConversation(convType, convTargetId)
      }
      await useMessageStore().sendMessage(uid, conversationId, 0, content)
    } catch (error) {
      console.warn('[notification] reply send failed in main:', error)
    }
  })

  /** 与 im 20601 `PushUserOnOrOffLineMessageResp` 一致：实时刷新好友在线状态 */
  listen<
    Array<{ uid: string; online: boolean; createTime: number; bfShow?: boolean }>
  >('user:online-status', (event) => {
    const contactStore = useContactStore()
    const groupStore = useGroupStore()
    const raw = Array.isArray(event.payload) ? event.payload : []
    contactStore.applyOnlineStatusUpdates(raw)
    groupStore.applyOnlineStatusUpdates(raw)
  })

  listen<{ total: number }>('friend:req-num', (event) => {
    const authStore = useAuthStore()
    const contactStore = useContactStore()
    contactStore.setNewFriendReqTotal(Number(event.payload?.total || 0), String(authStore.uid || ''))
  })

  listen<ChannelRemovedPayload>('channel:removed', async (event) => {
    await removeLocalChannelConversation(event.payload || {}, 'channel:removed')
  })

  listen<ForceLogoutPayload>('auth:force-logout', async (event) => {
    if (forceLogoutHandling) return
    forceLogoutHandling = true

    const authStore = useAuthStore()
    const networkStore = useNetworkStore()

    console.warn('[auth] force logout received', event.payload)
    networkStore.setWsStatus('disconnected')

    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('disconnect_ws'))
      .catch((err) => {
        console.warn('[auth] disconnect ws after force logout failed:', err)
      })

    resetClientStateAfterLogout()

    try {
      await authStore.logout({
        keepHistoryOnLogout: true,
        preserveLoginCache: event.payload?.reason === 'local-login-replaced',
      })
      if (!isTauri()) {
        await router.replace('/login')
        if (window.location.hash !== '#/login') {
          window.location.hash = '#/login'
        }
      }
    } finally {
      forceLogoutHandling = false
    }
  })

  listen<Message[]>('msg:batch', async (event) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    const currentUid = String(authStore.uid || '')
    const logoutClearedHistoryAt = getLogoutClearedHistoryAt(currentUid)
    const raw = (Array.isArray(event.payload) ? event.payload : []).map((item: any) => {
      const m = { ...item }
      let extra = m?.extra
      if (typeof extra === 'string') {
        try {
          extra = JSON.parse(extra)
        } catch {
          extra = {}
        }
      }
      if (!extra || typeof extra !== 'object') extra = {}
      m.extra = extra

      const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
      const senderId = String(m?.senderId ?? m?.sender_id ?? '')
      const receiveUid = String(extra?.receiveUid ?? m?.receiveUid ?? m?.receive_uid ?? '')
      if (
        currentUid &&
        convId.startsWith('0_') &&
        senderId === currentUid &&
        receiveUid &&
        receiveUid !== currentUid
      ) {
        const fixedConvId = `0_${receiveUid}`
        m.conversationId = fixedConvId
        m.conversation_id = fixedConvId
        m.extra = {
          ...extra,
          receiveUid,
          originalConversationId: convId,
        }
      }
      return m
    })
    const valid = raw.filter((m: any) => {
      const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
      return convId.includes('_')
    })
    const filtered = logoutClearedHistoryAt > 0
      ? valid.filter((m: any) => {
          const sendTime = Number(m?.sendTime ?? m?.send_time ?? 0)
          return !(sendTime > 0 && sendTime <= logoutClearedHistoryAt)
        })
      : valid
    if (valid.length !== raw.length) {
      console.warn('[msg:batch] dropped invalid items:', raw.length - valid.length)
    }
    if (filtered.length !== valid.length) {
      // Dropped stale messages after local logout history clear.
    }
    if (filtered.length === 0) return
    // 入站时兜底预热 relKey（防止首次收到该联系人/群的消息时 Rust 侧还没缓存 key）。
    // 1. 私聊：所有 `0_xxx` 会话；2. 群聊：仅对真正需要重试解密（decryptPending）
    //    的消息按 groupId 预热，避免对每条已正常的群消息都发 HTTP 请求。
    if (authStore.uid) {
      const uid = String(authStore.uid)
      const pendingFriendIds = Array.from(
        new Set(
          filtered
            .filter((m: any) => Boolean(m?.extra?.decryptPending))
            .map((m: any) => String(m?.conversationId ?? m?.conversation_id ?? ''))
            .filter((convId) => convId.startsWith('0_') && convId.includes('_'))
            .map((convId) => convId.split('_')[1] || '')
            .filter((fid) => !!fid && fid !== uid),
        ),
      )
      for (const fid of pendingFriendIds) {
        try {
          await ensureFriendRelKey(uid, fid, true)
        } catch (err) {
          console.warn('[e2ee] ensureFriendRelKey on msg:batch failed', { fid, err: String(err) })
        }
      }

      const pendingGroupIds = Array.from(
        new Set(
          filtered
            .filter((m: any) => Boolean(m?.extra?.decryptPending))
            .map((m: any) => {
              const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
              return String(m?.extra?.groupId || convId.split('_')[1] || '')
            })
            .filter((gid) => !!gid),
        ),
      )
      for (const gid of pendingGroupIds) {
        try {
          await ensureGroupRelKey(uid, gid)
        } catch (err) {
          console.warn('[e2ee] ensureGroupRelKey on msg:batch failed', { gid, err: String(err) })
        }
      }

      const pendingChannelIds = Array.from(
        new Set(
          filtered
            .filter((m: any) => Boolean(m?.extra?.decryptPending))
            .map((m: any) => {
              const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
              return String(m?.extra?.channelId || convId.split('_')[1] || '')
            })
            .filter((cid) => !!cid),
        ),
      )
      for (const cid of pendingChannelIds) {
        try {
          await ensureChannelRelKey(uid, cid)
        } catch (err) {
          console.warn('[channel] ensureChannelRelKey on msg:batch failed', { cid, err: String(err) })
        }
      }
    }

    if (filtered.length > 0) {
      let normalized: any[] = filtered.filter((m: any) => !isPendingGroupReqChatMessage(m))
      if (authStore.uid) {
        const uid = String(authStore.uid)
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          for (const m of normalized) {
            const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
            const extra = m?.extra || {}
            const decryptPending = Boolean(extra?.decryptPending)
            const cipherHex = String(extra?.cipherHex || '')
            const cipherCandidates = Array.isArray(extra?.cipherCandidates)
              ? extra.cipherCandidates
                  .map((c: any) => ({
                    version: Number(c?.version || extra?.version || 1),
                    source: String(c?.source || ''),
                    cipherHex: String(c?.cipherHex || ''),
                    attachmentKey: String(c?.attachmentKey || c?.attachment_key || ''),
                  }))
                  .filter((c: any) => !!c.cipherHex)
              : []
            if (cipherHex && cipherCandidates.length === 0) {
              cipherCandidates.push({
                version: Number(extra?.version || 1),
                source: '',
                cipherHex,
                attachmentKey: String(extra?.attachmentKey || extra?.attachment_key || ''),
              })
            }
            if (!decryptPending || cipherCandidates.length === 0 || !convId.includes('_')) continue

            const msgType = Number(m?.msgType ?? m?.msg_type ?? 0)
            const msgId = String(m?.id ?? m?.msgId ?? m?.msg_id ?? '')

            if (convId.startsWith('0_')) {
              const senderId = String(m?.senderId ?? m?.sender_id ?? '')
              const peerId = String(convId.split('_')[1] || '')
              if (!senderId) continue
              let privateDecrypted = false
              let lastErr: unknown = null
              const applyRealtimePrivatePlain = async (plain: string, candidate: any) => {
                const resolvedFileKey = await resolvePrivateAttachmentFileKey({
                  uid,
                  senderId,
                  version: Number(candidate.version || 0),
                  source: String(candidate.source || ''),
                  attachmentKey: String(candidate.attachmentKey || ''),
                })
                m.content = plain
                if (m.extra && typeof m.extra === 'object') {
                  m.extra.decryptPending = false
                  m.extra.cipherHex = candidate.cipherHex
                  if (resolvedFileKey && !normalizeResolvedFileKey(m.extra.fileKey)) {
                    m.extra.fileKey = resolvedFileKey
                  }
                }
                await invoke('mark_private_message_decrypted', {
                  uid,
                  request: {
                    messageId: msgId,
                    conversationId: convId,
                    content: plain,
                    extra: m.extra && typeof m.extra === 'object' ? m.extra : null,
                  },
                }).catch((persistErr) => {
                  console.warn('[e2ee] persist realtime decrypted private failed', {
                    msgId,
                    convId,
                    err: String(persistErr),
                  })
                })
              }
              try {
                for (const candidate of cipherCandidates) {
                  try {
                    try {
                      await ensureFriendRelKeyForVersion(
                        uid,
                        senderId,
                        Number(candidate.version || 0),
                        String(candidate.source || ''),
                      )
                    } catch (keyErr) {
                      console.warn('[e2ee] ensureFriendRelKeyForVersion failed', {
                        msgId,
                        senderId,
                        peerId,
                        version: candidate.version,
                        source: candidate.source,
                        err: String(keyErr),
                      })
                    }
                    const plain = await invoke<string>('decrypt_private_incoming', {
                      senderId,
                      peerId,
                      version: Number(candidate.version || 1),
                      source: String(candidate.source || ''),
                      ciphertextHex: String(candidate.cipherHex || ''),
                      msgType,
                      contentMd5: String(extra?.contentMd5 || extra?.content_md5 || ''),
                    })
                    await applyRealtimePrivatePlain(plain, candidate)
                    privateDecrypted = true
                    break
                  } catch (err) {
                    try {
                      await ensureFriendRelKeyForVersion(
                        uid,
                        senderId,
                        Number(candidate.version || 0),
                        String(candidate.source || ''),
                        true,
                      )
                      const plain = await invoke<string>('decrypt_private_incoming', {
                        senderId,
                        peerId,
                        version: Number(candidate.version || 1),
                        source: String(candidate.source || ''),
                        ciphertextHex: String(candidate.cipherHex || ''),
                        msgType,
                        contentMd5: String(extra?.contentMd5 || extra?.content_md5 || ''),
                      })
                      await applyRealtimePrivatePlain(plain, candidate)
                      privateDecrypted = true
                      break
                    } catch (refreshErr) {
                      lastErr = refreshErr
                      console.warn('[e2ee] retry decrypt_private refresh failed', {
                        msgId,
                        senderId,
                        peerId,
                        version: candidate.version,
                        source: candidate.source,
                        err: String(refreshErr),
                        firstErr: String(err),
                      })
                    }
                  }
                }
                if (privateDecrypted) continue
                throw lastErr || new Error('decrypt_private failed for all candidates')
              } catch (err) {
                console.warn('[e2ee] retry decrypt_private FAILED', {
                  msgId,
                  peerId,
                  msgType,
                  candidates: cipherCandidates.map((c: any) => ({
                    version: c.version,
                    source: c.source,
                    cipherLen: String(c.cipherHex || '').length,
                  })),
                  err: String(err),
                })
                if (msgType === 7) {
                  console.warn('[DEBUG-doc-file] private file decrypt failed after retries', {
                    msgId,
                    peerId,
                    senderId,
                    version: Number(extra?.version || 0),
                    cipherHexLen: String(extra?.cipherHex || '').length,
                    contentMd5: String(extra?.contentMd5 || extra?.content_md5 || ''),
                  })
                }
              }
            } else if (convId.startsWith('1_')) {
              const groupId = String(extra?.groupId || convId.split('_')[1] || '')
              if (!groupId) continue
              // 第一次重试：用当前 Rust 侧已有/刚 warmup 拿到的 relKey 解密。
              try {
                const plain = await invoke<string>('decrypt_group_incoming', {
                  groupId,
                  ciphertextHex: cipherHex,
                  msgType,
                })
                m.content = plain
                if (m.extra && typeof m.extra === 'object') {
                  m.extra.decryptPending = false
                }
                continue
              } catch (err) {
                console.warn('[e2ee] retry decrypt_group FAILED (1st pass)', {
                  msgId,
                  groupId,
                  msgType,
                  cipherLen: cipherHex.length,
                  err: String(err),
                })
              }
              // 第二次重试：强制刷新 relKey（key 可能已轮换），再解一次。
              try {
                await refreshGroupRelKey(uid, groupId)
                const plain = await invoke<string>('decrypt_group_incoming', {
                  groupId,
                  ciphertextHex: cipherHex,
                  msgType,
                })
                m.content = plain
                if (m.extra && typeof m.extra === 'object') {
                  m.extra.decryptPending = false
                }
              } catch (err) {
                console.warn('[e2ee] retry decrypt_group FAILED (2nd pass, after refresh)', {
                  msgId,
                  groupId,
                  msgType,
                  cipherLen: cipherHex.length,
                  err: String(err),
                })
                if (msgType === 7) {
                  console.warn('[DEBUG-doc-file] group file decrypt failed after refresh', {
                    msgId,
                    groupId,
                    version: Number(extra?.version || 0),
                    cipherHexLen: cipherHex.length,
                    contentMd5: String(extra?.contentMd5 || extra?.content_md5 || ''),
                  })
                }
                // 保留占位文案 + decryptPending=true，下一轮 batch/重启后仍可再试。
              }
            } else if (convId.startsWith('2_')) {
              const channelId = String(extra?.channelId || convId.split('_')[1] || '')
              if (!channelId) continue
              try {
                const plain = await invoke<string>('decrypt_channel_incoming', {
                  channelId,
                  ciphertextHex: cipherHex,
                  msgType,
                })
                m.content = plain
                if (m.extra && typeof m.extra === 'object') {
                  m.extra.decryptPending = false
                }
              } catch (err) {
                console.warn('[channel] retry decrypt_channel FAILED', {
                  msgId,
                  channelId,
                  msgType,
                  cipherLen: cipherHex.length,
                  err: String(err),
                })
              }
            }
          }
        } catch {
          // ignore invoke dynamic import failure
        }
      }

      const chatStore = useChatStore()
      const groupStore = useGroupStore()
  const channelStore = useChannelStore()
  const locallyConsumedGroupRemovalMessageKeys = new Set<string>()
  const removedChannelIdsInBatch = collectRemovedChannelIdsFromBatch(normalized)
  for (const channelId of removedChannelIdsInBatch) {
    await removeLocalChannelConversation({ channelId }, 'msg:batch')
  }
  // 删除频道后再过滤同批频道消息，防止 batchAppendMessages/upsert_incoming_messages 把会话加回来。
  normalized = filterMessagesForRemovedChannels(normalized, removedChannelIdsInBatch)
      const groupEventMessages = normalized.filter((m: any) => {
        const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
        const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
        const source = String(extra?.source || '')
        return convId.startsWith('1_') && isGroupEventSource(source)
      })
      const hasGroupNotificationMessages = normalized.some((m: any) =>
        String(m?.conversationId ?? m?.conversation_id ?? '') === '1_invitation',
      )
      const hasChannelNoticeMessages = normalized.some((m: any) =>
        String(m?.conversationId ?? m?.conversation_id ?? '') === '0_channelNotice',
      )
      if (groupEventMessages.length > 0) {
        groupInviteDebug('msg:batch received group event messages', {
          count: groupEventMessages.length,
          items: groupEventMessages.map((m: any) => ({
            id: String(m?.id ?? m?.msgId ?? m?.msg_id ?? ''),
            conversationId: String(m?.conversationId ?? m?.conversation_id ?? ''),
            senderId: String(m?.senderId ?? m?.sender_id ?? ''),
            msgType: Number(m?.msgType ?? m?.msg_type ?? 0),
            content: String(m?.content ?? '').slice(0, 120),
            extra: m?.extra ?? null,
          })),
          conversationCountBefore: chatStore.conversations.length,
          groupCountBefore: groupStore.groups.length,
        })
      }
      for (const m of normalized) {
        const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
        const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
        const source = String(extra?.source || '')
        if (!convId.startsWith('1_') || !isGroupEventSource(source)) continue

        const groupId = String(extra?.groupId || convId.split('_')[1] || '')
        if (!groupId) continue
        const groupReqType = Number(extra?.groupReqType ?? 0)
        const groupReqStatus = Number(extra?.groupReqStatus ?? 0)
        const affectedMemberId = getGroupEventAffectedMemberId(extra)
        await sendGroupEventReceipt(extra, 0)
        if ([6, 7, 13].includes(groupReqType)) {
          groupInviteDebug('processing leave/remove/dismiss group event', {
            currentUid,
            conversationId: convId,
            groupId,
            source,
            groupReqType,
            groupReqStatus,
            receiveUid: String(extra?.receiveUid ?? ''),
            fromUid: String(extra?.fromUid ?? extra?.sendUid ?? ''),
            affectedMemberId,
            senderId: String(m?.senderId ?? m?.sender_id ?? ''),
            msgId: String(m?.id ?? m?.msgId ?? m?.msg_id ?? ''),
            content: String(m?.content ?? '').slice(0, 160),
            hasConversationBefore: chatStore.conversations.some((conv) => conv.id === `1_${groupId}`),
            hasGroupBefore: Boolean(groupStore.getGroup(groupId)),
          })
        }
        if (isPendingGroupInvitationNotice(convId, extra)) {
          const receiveUid = String(extra?.receiveUid ?? '')
          if (receiveUid && receiveUid === currentUid) {
            groupInviteDebug('delete pending invite conversation', {
              currentUid,
              groupId,
              conversationId: `1_${groupId}`,
              receiveUid,
              groupReqType,
              groupReqStatus,
            })
            chatStore.markPendingGroupInviteConversation(groupId)
            // 对齐旧行为：待同意邀请不属于“已加入群”，要从通讯录群组中移除，避免出现“群资料暂不可用”。
            groupStore.removeGroup(groupId)
            await chatStore.deleteConversation(currentUid, `1_${groupId}`).catch((err: unknown) => {
              console.warn('[group-invite] delete pending group conversation failed:', { groupId, err })
            })
          }
          continue
        }
        if (
          (String(extra?.source || '') === 'group-event-req'
            || String(extra?.source || '') === 'group-event-req-chat')
          && Number(extra?.groupReqStatus ?? 0) === 1
        ) {
          chatStore.clearPendingGroupInviteConversation(groupId)
        }

        const shouldRemoveLocalGroup = shouldRemoveLocalGroupForEvent(extra, currentUid)
        if (shouldRemoveLocalGroup) {
          groupInviteDebug('local group removal event matched, removing local group conversation', {
            currentUid,
            groupId,
            conversationId: `1_${groupId}`,
            source,
            groupReqType,
            groupReqStatus,
            receiveUid: String(extra?.receiveUid ?? ''),
            fromUid: String(extra?.fromUid ?? extra?.sendUid ?? ''),
            affectedMemberId,
            groupExistsBefore: Boolean(groupStore.getGroup(groupId)),
            conversationExistsBefore: chatStore.conversations.some((conv) => conv.id === `1_${groupId}`),
            currentConversationId: chatStore.currentConversationId,
          })
          groupStore.removeGroup(groupId)
          await chatStore.deleteConversation(currentUid, `1_${groupId}`).catch((err: unknown) => {
            console.warn('[group-event] delete removed group conversation failed:', { groupId, err })
          })
          locallyConsumedGroupRemovalMessageKeys.add(getBatchMessageKey(m))
          groupInviteDebug('local group removal event finished', {
            currentUid,
            groupId,
            conversationId: `1_${groupId}`,
            groupReqType,
            affectedMemberId,
            groupExistsAfter: Boolean(groupStore.getGroup(groupId)),
            conversationExistsAfter: chatStore.conversations.some((conv) => conv.id === `1_${groupId}`),
            currentConversationId: chatStore.currentConversationId,
          })
          await sendGroupEventReceipt(extra, 3)
          continue
        }

        const existingGroup = groupStore.getGroup(groupId)
        const cachedMemberCount = Number(existingGroup?.memberCount || 0)
        const cachedMemberMapCount = groupStore.getMembers(groupId).length
        const eventMemberCount = Number(extra?.memberCount || 0)
        const nextMemberCount = Math.max(cachedMemberCount, cachedMemberMapCount, eventMemberCount)
        const eventGroupAvatar = getGroupEventAvatar(extra)
        groupInviteDebug('upsert group before append message', {
          conversationId: convId,
          groupId,
          groupName: String(extra?.groupName || ''),
          existedBefore: Boolean(existingGroup),
          eventMemberCount,
          cachedMemberCount,
          cachedMemberMapCount,
          nextMemberCount,
        })
        groupStore.upsertGroup({
          id: groupId,
          groupId,
          name: String(extra?.groupName || existingGroup?.name || groupId),
          avatar: eventGroupAvatar,
          memberCount: nextMemberCount,
          isMuted: Boolean(extra?.groupMuted || false),
          updatedAt: Number(m?.sendTime ?? m?.send_time ?? Date.now()),
        })
        if (!eventGroupAvatar && !existingGroup?.avatar) {
          scheduleGroupInfoRefresh(groupStore, currentUid, groupId)
        }

        enrichGroupEventNoticeExtra(groupStore, groupId, extra)
        applyGroupEventMemberPatch(groupStore, groupId, extra)
        await sendGroupEventReceipt(extra, 3)
      }
      for (const m of normalized) {
        const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
        const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
        const source = String(extra?.source || '')
        const subscriberOperateType = Number(extra?.subscriberOperateType ?? -1)
        if (source === 'channel-remove' || (source === 'channel-notice' && subscriberOperateType === 2)) {
          const channelId = String(extra?.channelId || '')
          if (channelId) {
            const cachedChannel = channelStore.getChannel(channelId)
            if (m.extra && typeof m.extra === 'object' && cachedChannel) {
              m.extra.channelName = m.extra.channelName || cachedChannel.channelName || cachedChannel.name || ''
              m.extra.icon = m.extra.icon || cachedChannel.icon || cachedChannel.avatar || ''
              m.extra.logoColor = m.extra.logoColor || cachedChannel.logoColor || ''
            }
            await removeLocalChannelConversation({
              channelId,
              channelName: String(m.extra?.channelName || ''),
              icon: String(m.extra?.icon || ''),
              reason: 'subscriber-remove',
            }, 'msg:batch-notice')
          }
          continue
        }
        if (!convId.startsWith('2_') || String(extra?.source || '') !== 'channel-event') continue

        const channelId = String(extra?.channelId || convId.split('_')[1] || '')
        if (!channelId) continue
        const eventType = Number(extra?.eventType ?? -1)
        const joinOperateType = Number(extra?.subscriberOperateType ?? -1)
        const pushedMemberType = getFiniteChannelMemberType(extra?.memberType)
        const cachedChannel = channelStore.getChannel(channelId)
        const cachedMemberType = getFiniteChannelMemberType(cachedChannel?.memberType)
        const isConfirmedJoinEvent = eventType === 2 && joinOperateType === 0
        const isConfirmedJoinedMember = pushedMemberType !== null && pushedMemberType > 0
        // 对齐旧 im：只有确认加入/仍是成员的频道事件才进入频道列表，避免邀请和普通通知污染通讯录频道数据。
        if (!isConfirmedJoinEvent && !isConfirmedJoinedMember) continue
        // 明确重新加入后允许后续会话更新恢复该频道。
        unblockRemovedChannelConversation(channelId)
        const channelName = String(extra?.channelName || channelStore.getChannel(channelId)?.channelName || channelId)
        channelStore.patchChannel(channelId, {
          id: channelId,
          channelId,
          name: channelName,
          channelName,
          avatar: String(extra?.icon || '') || cachedChannel?.avatar || null,
          icon: String(extra?.icon || '') || cachedChannel?.icon || null,
          logoColor: String(extra?.logoColor || '') || cachedChannel?.logoColor || null,
          memberType: (pushedMemberType !== null && pushedMemberType > 0) ? pushedMemberType : (cachedMemberType ?? 9),
          updatedAt: Number(m?.sendTime ?? m?.send_time ?? Date.now()),
        }, { allowRemoved: true, uid: currentUid })
      }
      const contactStore = useContactStore()
      for (const m of normalized) {
        const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
        const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
        if (!convId.startsWith('0_') || String(extra?.source || '') !== 'friend-record') continue
        const friendId = String(extra?.friendId || convId.split('_')[1] || '')
        if (!friendId) continue
        const patch: Record<string, unknown> = {}
        if (Object.prototype.hasOwnProperty.call(extra, 'bfReadCancel')) {
          patch.bfReadCancel = Boolean(extra.bfReadCancel)
        }
        if (Object.prototype.hasOwnProperty.call(extra, 'msgCancelTime')) {
          patch.msgCancelTime = Number(extra.msgCancelTime || DEFAULT_READ_BURN_SECONDS)
        }
        if (typeof extra.nickname === 'string' && extra.nickname) patch.nickname = extra.nickname
        if (typeof extra.avatar === 'string') patch.avatar = extra.avatar || null
        if (typeof extra.identify === 'string' && extra.identify) patch.identify = extra.identify
        if (typeof extra.remark === 'string') patch.remark = extra.remark || null
        if (Object.keys(patch).length > 0) {
          await contactStore.upsertContact({
            id: friendId,
            ...patch,
            status: 1,
            updatedAt: Number(m?.sendTime ?? m?.send_time ?? Date.now()),
          } as any, {
            uid: currentUid,
            source: 'remote',
            markDetailLoaded: true,
          })
        }
      }
      const appendableNormalized = locallyConsumedGroupRemovalMessageKeys.size > 0
        ? normalized.filter((m: any) => !locallyConsumedGroupRemovalMessageKeys.has(getBatchMessageKey(m)))
        : normalized
      const visibleAppendableNormalized = appendableNormalized.filter((m: any) => !isHiddenBatchMessage(m))
      rememberHiddenOnlyBatchConversations(appendableNormalized, visibleAppendableNormalized)
      const newIncomingMessages = getRealtimeIncomingMessages(visibleAppendableNormalized, currentUid)
      const desktopReminderMessages = getDesktopReminderMessages(
        visibleAppendableNormalized,
        newIncomingMessages,
        currentUid,
      )
      const shouldPlaySound = shouldPlayIncomingMessageSound(newIncomingMessages, currentUid)
      messageStore.batchAppendMessages(appendableNormalized as Message[])
      const privateConversationIds = Array.from(new Set(
        appendableNormalized
          .map((m: any) => String(m?.conversationId ?? m?.conversation_id ?? ''))
          .filter((convId: string) => convId.startsWith('0_')),
      ))
      if (privateConversationIds.length > 0 && authStore.uid) {
        await messageStore.retryDecryptPendingPrivateConversations(String(authStore.uid), privateConversationIds)
      }
      if (
        hasGroupNotificationMessages
        || groupEventMessages.some((m: any) => {
          const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
          const source = String(extra?.source || '')
          return source === 'group-event-req' || source === 'group-event-req-chat'
        })
      ) {
        eventBus.emit('group-invitation:update')
      }
      if (hasChannelNoticeMessages) {
        eventBus.emit('channel-notice:update')
      }
      if (groupEventMessages.length > 0) {
        groupInviteDebug('after batchAppendMessages', {
          conversationCountAfter: chatStore.conversations.length,
          groupCountAfter: groupStore.groups.length,
          conversations: groupEventMessages.map((m: any) => {
            const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
            const conv = chatStore.conversations.find((item) => item.id === convId)
            return {
              conversationId: convId,
              exists: Boolean(conv),
              targetId: conv?.targetId || null,
              lastMsgDigest: conv?.lastMsgDigest || null,
              lastMsgTime: conv?.lastMsgTime || null,
            }
          }),
        })
      }
      const activeConversationId = chatStore.currentConversationId
      const hasIncomingMessageForTray = newIncomingMessages.length > 0
      const hasIncomingForActiveConversation = Boolean(
        currentUid
        && activeConversationId
        && visibleAppendableNormalized.some((m: any) => {
          const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
          const senderId = String(m?.senderId ?? m?.sender_id ?? '')
          return convId === activeConversationId && senderId && senderId !== currentUid
        }),
      )
      if (shouldPlaySound) {
        void playNotificationSound()
      }
      void showMinimizedMessageReminder(desktopReminderMessages as Message[], currentUid)
      if (hasIncomingMessageForTray) {
        void flashTrayForIncomingMessage(newIncomingMessages.length)
      }
      if (authStore.uid) {
        const incoming = appendableNormalized.map((m: any) => ({
          id: String(m?.id ?? m?.msgId ?? m?.msg_id ?? ''),
          customMsgId: m?.customMsgId ?? m?.custom_msg_id ?? null,
          conversationId: String(m?.conversationId ?? m?.conversation_id ?? ''),
          senderId: String(m?.senderId ?? m?.sender_id ?? ''),
          msgType: Number(m?.msgType ?? m?.msg_type ?? 0),
          content: m?.content ?? null,
          sendTime: Number(m?.sendTime ?? m?.send_time ?? Date.now()),
          status: Number(m?.status ?? 1),
          readStatus: Number(m?.readStatus ?? m?.read_status ?? 0),
          version: Number(m?.version ?? 0),
          isDeleted: Boolean(m?.isDeleted ?? m?.is_deleted ?? false),
          extra: m?.extra ?? null,
        }))
        try {
          // 先落库，再 auto markAsRead；Rust 才能基于刚收到的消息注册阅后即焚定时器。
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('upsert_incoming_messages', {
            uid: authStore.uid,
            messages: incoming,
          })
        } catch (err) {
          console.warn('[msg:batch] upsert_incoming_messages failed:', err)
        }
      }
      if (hasIncomingForActiveConversation && activeConversationId && chatStore.currentConversationId === activeConversationId) {
        void chatStore.markAsRead(currentUid, activeConversationId).catch((err: unknown) => {
          console.warn('[read-burn] auto markAsRead failed:', err)
        })
      }
    }
  })

  listen<Message>('msg:local-sent', (event) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    const currentUid = String(authStore.uid || '')
    const payload: any = event.payload || {}
    const senderId = String(payload?.senderId ?? payload?.sender_id ?? '')
    const conversationId = String(payload?.conversationId ?? payload?.conversation_id ?? '')
    if (!conversationId.includes('_')) return
    if (currentUid && senderId && senderId !== currentUid) return
    messageStore.batchAppendMessages([payload] as Message[])
  })

  /**
   * 群消息 20201 回执（SendGroupMessageResp）。
   * 由 Rust `ws/batcher.rs::emit_group_msg_sent` 派发。
   * - 更新内存里的消息状态（sending → sent，并替换为服务器 msgId）
   * - 触发 Tauri `mark_message_sent` 把结果落到本地 SQLite
   */
  listen<{
    flag: number
    msgId: number
    groupId: number
    sentOverTime: number
    conversationId: string
  }>('msg:sent', async (event) => {
    const payload = event.payload || ({} as any)
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    const receiptApplied = messageStore.applySendReceipt({
      conversationId: payload.conversationId,
      flag: payload.flag,
      serverMsgId: payload.msgId,
      sentOverTime: payload.sentOverTime,
    })

    if (!authStore.uid) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mark_message_sent', {
        uid: authStore.uid,
        request: {
          conversationId: payload.conversationId,
          customMsgId: String(payload.flag),
          serverMsgId: Number(payload.msgId),
          sentOverTime: Number(payload.sentOverTime) || null,
        },
      })
      if (!receiptApplied && String(payload.conversationId || '').startsWith('1_')) {
        await messageStore.loadMessages(authStore.uid, payload.conversationId, true)
      }
    } catch (err) {
      console.warn('[msg:sent] mark_message_sent failed:', err)
    }
  })

  listen<{
    flag: number
    targetId: number
    messageProtocolId: number
    errCode: number
    errMsg: string
    conversationId: string
  }>('msg:send-failed', (event) => {
    const payload = event.payload || ({} as any)
    const messageStore = useMessageStore()
    messageStore.applySendFailed({
      flag: payload.flag,
      conversationId: payload.conversationId,
      reason: payload.errMsg || `errCode=${payload.errCode || 0}`,
    })
  })

  listen<Conversation>('conv:update', (event) => {
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const currentUid = String(authStore.uid || '')
    const logoutClearedHistoryAt = getLogoutClearedHistoryAt(currentUid)
    const payload: any = event.payload || {}
    const conversationId = String(payload?.id ?? '')
    const lastMsgTime = Number(payload?.lastMsgTime ?? payload?.last_msg_time ?? 0)
    // 本地刚处理完频道移除时，忽略随后到达的会话落库更新，直到明确重新加入再解除屏蔽。
    if (isBlockedRemovedChannelConversation(conversationId)) {
      return
    }
    if (logoutClearedHistoryAt > 0 && lastMsgTime > 0 && lastMsgTime <= logoutClearedHistoryAt) {
      return
    }
    const hiddenOnlyBatch = hiddenOnlyBatchByConversation.get(conversationId)
    if (hiddenOnlyBatch && hiddenOnlyBatch.expiresAt < Date.now()) {
      hiddenOnlyBatchByConversation.delete(conversationId)
    } else if (
      hiddenOnlyBatch
      && lastMsgTime > 0
      && lastMsgTime <= hiddenOnlyBatch.hiddenMaxSendTime
    ) {
      if (!hiddenOnlyBatch.previous) return
      chatStore.addOrUpdateConversation({
        ...payload,
        lastMsgId: hiddenOnlyBatch.previous.lastMsgId,
        lastMsgTime: hiddenOnlyBatch.previous.lastMsgTime,
        lastMsgDigest: hiddenOnlyBatch.previous.lastMsgDigest,
        unreadCount: hiddenOnlyBatch.previous.unreadCount,
        atMe: hiddenOnlyBatch.previous.atMe,
        updatedAt: hiddenOnlyBatch.previous.updatedAt,
      })
      return
    }
    // if (String(payload?.id ?? '') === `1_${GROUP_NOTIFICATION_TARGET_ID}`) {
    //   console.warn('[group-notification-unread] conv:update', {
    //     id: payload?.id,
    //     currentConversationId: chatStore.currentConversationId || '',
    //     unreadCount: Number(payload?.unreadCount ?? payload?.unread_count ?? 0),
    //     lastMsgTime,
    //     lastMsgDigest: String(payload?.lastMsgDigest ?? payload?.last_msg_digest ?? ''),
    //   })
    // }
    const existingConversation = chatStore.conversations.find((conv) => conv.id === conversationId)
    chatStore.addOrUpdateConversation(event.payload, {
      preserveListOrder: shouldPreserveConversationOrderForUpdate(existingConversation, payload),
    })
  })

  listen<{ messageId: string; conversationId?: string; clear?: number | string | boolean }>('msg:recall', (event) => {
    const messageStore = useMessageStore()
    const chatStore = useChatStore()
    const conversationId = String(event.payload?.conversationId || '')
    const clear = event.payload?.clear
    const shouldClearConversation = clear === true || Number(clear || 0) === 1
    if (shouldClearConversation && conversationId) {
      // 其它端发起整会话清空时，只同步清本地，避免再次发送 remote 清空包形成回环。
      messageStore.clearConversationHistory(conversationId, false)
        .then(() => {
          chatStore.updateConversation({
            id: conversationId,
            lastMsgDigest: null,
            lastMsgId: null,
            unreadCount: 0,
          })
        })
        .catch((error) => {
          console.warn('[msg:recall] clear local conversation failed:', error)
        })
      return
    }
    const messageId = String(event.payload?.messageId || '')
    if (!messageId || messageId === '-1') return
    messageStore.deleteMessageLocalById(messageId).catch((error) => {
      console.warn('[msg:recall] delete local failed:', error)
    })
  })

  listen<{ messageId: string; readBy: string }>('msg:read', (event) => {
    const messageStore = useMessageStore()
    messageStore.updateMessage(event.payload.messageId, {
      readStatus: 2,
    })
  })

  listen<Array<{
    msgId: number
    sendUid: number
    targetId: number
    status: number
    readTime: number
    snapchatTime: number
  }>>('msg:read-receipt', async (event) => {
    const authStore = useAuthStore()
    const uid = String(authStore.uid || '')
    if (!uid) return

    const receipts = Array.isArray(event.payload) ? event.payload : []
    if (receipts.length === 0) return
    const messageStore = useMessageStore()
    const viewedSelfMessageIds = receipts
      .filter((item) =>
        Number(item?.status || 0) === 1
        && Number(item?.targetId || 0) === Number(uid || 0)
        && Number(item?.msgId || 0) > 0,
      )
      .map((item) => String(item.msgId))
    if (viewedSelfMessageIds.length > 0) {
      messageStore.markMessagesRead(viewedSelfMessageIds, 2)
    }
    const receiptScheduledKeys = new Set<string>()
    for (const item of receipts) {
      if (
        Number(item?.status || 0) !== 1
        || Number(item?.targetId || 0) !== Number(uid || 0)
        || Number(item?.msgId || 0) <= 0
      ) continue
      const conversationId = `0_${String(item.sendUid || '')}`
      const messageId = String(item.msgId)
      if (!conversationId.includes('_') || !messageId) continue
      const readTime = normalizeReceiptTime(item.readTime)
      const messages = messageStore.getMessages(conversationId)
      const exact = messages.find((m) => String(m.id) === messageId || String(m.customMsgId || '') === messageId)
      const boundaryTime = exact?.sendTime || readTime
      const fallbackDelay = Number(item?.snapchatTime || 0) > 0
        ? Number(item.snapchatTime) * 1000
        : 0
      const candidates = exact
        ? [exact]
        : messages.filter((m) =>
            String(m.senderId) === uid
            && Number(m.deleteSeconds || 0) > 0
            && Number(m.sendTime || 0) <= boundaryTime,
          )
      for (const message of candidates) {
        const deleteDelay = Number(message.deleteSeconds || fallbackDelay || 0)
        if (!Number.isFinite(deleteDelay) || deleteDelay <= 0) continue
        const expireAt = readTime + deleteDelay
        const ids = new Set([
          String(message.id || ''),
          String(message.customMsgId || ''),
          messageId,
        ].filter(Boolean))
        for (const id of ids) {
          scheduleDeletionStore.addMessageTimer(conversationId, id, expireAt)
          receiptScheduledKeys.add(`${conversationId}:${id}`)
        }
      }
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<ReadProcessingResult>('apply_friend_read_receipts', {
        uid,
        receipts,
      })
      if (Array.isArray(result?.readMessageIds) && result.readMessageIds.length > 0) {
        messageStore.markMessagesRead(result.readMessageIds, 2)
      }
      if (Array.isArray(result?.localReadMessageIds) && result.localReadMessageIds.length > 0) {
        messageStore.markMessagesRead(result.localReadMessageIds, 1)
      }
      const chatStore = useChatStore()
      for (const item of Array.isArray(result?.conversationReadUpdates) ? result.conversationReadUpdates : []) {
        const unreadCount = Math.max(0, Number(item.unreadCount || 0))
        chatStore.updateConversation({
          id: String(item.conversationId || ''),
          unreadCount,
          ...(unreadCount > 0 ? {} : { atMe: false }),
        })
      }
      for (const item of Array.isArray(result?.scheduledDeletions) ? result.scheduledDeletions : []) {
        const conversationId = String(item.conversationId || '')
        const messageId = String(item.messageId || '')
        if (receiptScheduledKeys.has(`${conversationId}:${messageId}`)) continue
        scheduleDeletionStore.addMessageTimer(
          conversationId,
          messageId,
          Number(item.expireAt || 0),
        )
      }
    } catch (err) {
      console.warn('[read-burn] apply_friend_read_receipts failed:', err)
    }
  })

  listen<Array<{
    msgId: number
    groupId: number
    sendUid: number
    status: number
    readTime: number
  }>>('msg:group-read-receipt', async (event) => {
    const authStore = useAuthStore()
    const uid = String(authStore.uid || '')
    if (!uid) return

    const receipts = Array.isArray(event.payload) ? event.payload : []
    if (receipts.length === 0) return

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<ReadProcessingResult>('apply_group_read_receipts', {
        uid,
        receipts,
      })
      const messageStore = useMessageStore()
      messageStore.applyGroupReadReceiptPatches(Array.isArray(result?.groupReadUpdates) ? result.groupReadUpdates : [])
      if (Array.isArray(result?.readMessageIds) && result.readMessageIds.length > 0) {
        messageStore.markMessagesRead(result.readMessageIds, 2)
      }
      if (Array.isArray(result?.localReadMessageIds) && result.localReadMessageIds.length > 0) {
        messageStore.markMessagesRead(result.localReadMessageIds, 1)
      }
      const chatStore = useChatStore()
      for (const item of Array.isArray(result?.conversationReadUpdates) ? result.conversationReadUpdates : []) {
        const unreadCount = Math.max(0, Number(item.unreadCount || 0))
        chatStore.updateConversation({
          id: String(item.conversationId || ''),
          unreadCount,
          ...(unreadCount > 0 ? {} : { atMe: false }),
        })
      }
    } catch (err) {
      console.warn('[group-read] apply_group_read_receipts failed:', err)
    }
  })

  listen<{
    channelId: number
    readChannelMessages: Array<{
      msgId: number
      total: number
    }>
  }>('msg:channel-read-receipt', async (event) => {
    const authStore = useAuthStore()
    const uid = String(authStore.uid || '')
    if (!uid) return

    const channelId = Number(event.payload?.channelId || 0)
    const receipts = Array.isArray(event.payload?.readChannelMessages)
      ? event.payload.readChannelMessages
      : []
    if (channelId <= 0 || receipts.length === 0) return

    const conversationId = `2_${channelId}`
    const messageStore = useMessageStore()
    const localPatches = receipts.map((item) => ({
      conversationId,
      messageId: String(item.msgId || ''),
      readTotal: Number(item.total || 0),
    }))
    messageStore.applyChannelReadReceiptPatches(localPatches)

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const patches = await invoke<Array<{
        conversationId: string
        messageId: string
        readTotal: number
        extra?: string | null
      }>>('apply_channel_read_receipts', {
        uid,
        channelId,
        receipts,
      })
      const dbPatches = Array.isArray(patches) ? patches : []
      messageStore.applyChannelReadReceiptPatches(dbPatches)
    } catch (err) {
      console.warn('[channel] apply_channel_read_receipts failed:', err)
    }
  })

  listen<{ version: string; title?: string; content?: string; url: string; flag?: number }>(
    'app:version-update',
    (event) => {
      const uiStore = useUIStore()
      uiStore.openUpVersion(event.payload)
    },
  )

  listen<{ filePath: string }>('screenshots-ok', (event) => {
    const filePath = String(event.payload?.filePath || '')
    if (!filePath) return
    eventBus.emit('editor:drop-file-paths', [filePath])
  })

  listen<string>('deep-link', (event) => {
    handleDeepLink(event.payload)
  })

  // 只在这里做 NTP 初始化；domain pool 由 main.ts 统一启动，避免重复触发同一批域名请求。
  try {
    const { initNtpTime } = await import('@/utils/ntp')
    initNtpTime()
  } catch (e) {
    console.warn('[tauri-events] NTP init skipped:', e)
  }
}

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url)
    const action = parsed.hostname
    const params = Object.fromEntries(parsed.searchParams)

    switch (action) {
      case 'join':
        if (params.group) {
          // Navigate to group join
        }
        break
      case 'chat':
        if (params.id) {
          const chatStore = useChatStore()
          const [convTypeRaw, convTargetId = ''] = String(params.id).split('_')
          if (Number(convTypeRaw) === 2 && convTargetId) {
            const channelStore = useChannelStore()
            // deep-link 进入频道会话与手动点击保持一致：先进入，后校准权限。
            void channelStore.ensureChannelDetailReady(convTargetId)
          }
          chatStore.setCurrentConversation(params.id)
        }
        break
      case 'channel':
        if (params.id) {
          const channelId = String(params.id).trim()
          if (!channelId) break
          const channelStore = useChannelStore()
          const chatStore = useChatStore()
          // channel 专用 deep-link 也采用非阻塞预热，减少唤起时的等待感。
          void channelStore.ensureChannelDetailReady(channelId)
          const conversationId = `2_${channelId}`
          chatStore.ensureConversation(2, channelId)
          chatStore.setCurrentConversation(conversationId)
        }
        break
    }
  } catch (e) {
    console.error('Invalid deep link:', url, e)
  }
}
