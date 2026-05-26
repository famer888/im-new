<script setup lang="ts">
import { onBeforeUnmount, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { GROUP_NOTIFICATION_TARGET_ID, useChatStore } from '@/stores/useChatStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { getGroupDetail, getGroupReqList, groupCheckJoin, groupUserCheckJoin } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import { eventBus } from '@/utils/eventBus'
import { formatGroupNoticeDisplayText } from '@/utils/groupNoticeDisplay'
import { normalizeGroupNoticeText, translateGroupNoticeText } from '@/utils/groupNoticeI18n'
import { ConversationType } from '@/types'

interface GroupReqItem {
  groupReqId: number
  groupId: string
  groupName: string
  pic: string
  msg: string
  groupReqType: number
  groupReqStatus: number
  groupHostUid: string
  checkUserType: number
  sendUid: string
  receiveUid: string
  targetUser?: Record<string, any> | null
  checkUser?: Record<string, any> | null
  fromUser?: Record<string, any> | null
  members?: unknown[]
  createTime: number
  updateTime: number
  localId?: string
}

const authStore = useAuthStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const chatStore = useChatStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()
const { t } = useI18n()
const list = ref<GroupReqItem[]>([])
const listLoading = ref(false)
const notificationConversationId = `1_${GROUP_NOTIFICATION_TARGET_ID}`
const SELF_INVITE_REQ_TYPES = new Set([1, 2, 15])
const GROUP_DETAIL_CHECK_TTL_MS = 30 * 1000
let groupInvitationRefreshSeq = 0
let groupInvitationRefreshRunning = false
let groupInvitationRefreshQueuedReason = ''
const groupDetailCheckCache = new Map<string, { valid: boolean; checkedAt: number }>()

function groupInvitationRefreshLog(message: string, data?: Record<string, unknown>) {
  console.warn(`[group-invitation-refresh] ${message}`, data || {})
}

function statusLabel(status: number): string {
  const map: Record<number, string> = {
    1: t('已同意'),
    2: t('已拒绝'),
    3: t('已失效'),
  }
  return map[status] || ''
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (isToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getReqUserId(user: unknown): string {
  const raw = user && typeof user === 'object' ? user as Record<string, any> : null
  return String(raw?.uid ?? raw?.userId ?? '').trim()
}

function getReqUserName(user: unknown, fallbackId?: unknown): string {
  const raw = user && typeof user === 'object' ? user as Record<string, any> : null
  const relation = raw?.friendRelation && typeof raw.friendRelation === 'object'
    ? raw.friendRelation as Record<string, any>
    : null
  const names = [
    raw?.remarkName,
    relation?.remarkName,
    raw?.nickName,
    raw?.nickname,
    raw?.nick_name,
    raw?.name,
    raw?.identify,
    raw?.uid,
    raw?.userId,
    fallbackId,
  ]
  return names.map((v) => String(v ?? '').trim()).find(Boolean) || ''
}

function resolveReqUid(uid: string | number | null | undefined): string {
  const id = String(uid ?? '').trim()
  if (!id) return ''
  if (id === String(authStore.uid || '').trim()) return t('你')

  const contactName = contactStore.getDisplayName(id)
  if (contactName && contactName !== id) return contactName
  return id
}

/** 群通知里的人名统一走这里：自己显示“你”，其次用通讯录备注/昵称，最后才退回消息内名字/uid。 */
function resolveReqDisplayName(user: unknown, fallbackId?: unknown): string {
  const userId = getReqUserId(user) || String(fallbackId ?? '').trim()
  const resolvedById = resolveReqUid(userId)
  if (resolvedById && resolvedById !== userId) return resolvedById

  const embeddedName = getReqUserName(user, fallbackId)
  if (embeddedName && embeddedName !== userId) return embeddedName

  return resolvedById || embeddedName || ''
}

function isSelfUser(user: unknown, fallbackId?: unknown): boolean {
  const uid = String(authStore.uid || '')
  if (!uid) return false
  const userId = getReqUserId(user) || String(fallbackId ?? '').trim()
  return userId === uid
}

function formatReqMemberName(user: unknown, fallbackId?: unknown): string {
  return resolveReqDisplayName(user, fallbackId)
}

function translateKnownGroupNotice(raw: string): string {
  return translateGroupNoticeText(raw, t)
}

function isCurrentUid(value: unknown): boolean {
  const uid = String(authStore.uid || '').trim()
  return Boolean(uid) && String(value ?? '').trim() === uid
}

function isSelfInviteItem(item: GroupReqItem): boolean {
  const memberList = Array.isArray(item.members) ? item.members : []
  return Boolean(String(authStore.uid || '').trim())
    && SELF_INVITE_REQ_TYPES.has(Number(item.groupReqType || 0))
    && (
      isCurrentUid(item.receiveUid)
      || isSelfUser(item.targetUser, item.receiveUid)
      || isSelfUser(item.checkUser)
      || memberList.some((member) => isSelfUser(member))
    )
}

function formatSelfInviteMessage(item: GroupReqItem): string {
  const actorId = String(item.sendUid || getReqUserId(item.fromUser) || '').trim()
  let actorName = resolveReqDisplayName(item.fromUser, actorId)
  if (!actorName && item.groupHostUid && actorId === String(item.groupHostUid).trim()) {
    actorName = t('群主')
  }
  if (!actorName) return t('邀请你加入群聊')
  return `${actorName}${t('邀请')}${t('你')}${t('加入群聊')}`
}

function getGroupReqActorRole(item: GroupReqItem): number | null {
  const cachedRole = groupStore.getMembers(item.groupId).find((member) => member.userId === item.sendUid)?.role
  if (Number.isFinite(Number(cachedRole))) return Number(cachedRole)
  if (Number(item.checkUserType) === 1 || Number(item.checkUserType) === 2) return Number(item.checkUserType)
  if (item.groupHostUid && item.sendUid === item.groupHostUid) return 0
  return null
}

function groupReqNoticeExtra(item: GroupReqItem): Record<string, unknown> {
  return {
    groupReqType: item.groupReqType,
    groupReqStatus: item.groupReqStatus,
    checkUserType: item.checkUserType,
    actorRole: getGroupReqActorRole(item),
    sendUid: item.sendUid,
    receiveUid: item.receiveUid,
    targetUser: item.targetUser,
    checkUser: item.checkUser,
    fromUser: item.fromUser,
    members: item.members || [],
  }
}

function formatReqMessage(item: GroupReqItem): string {
  if (isSelfInviteItem(item)) {
    return formatSelfInviteMessage(item)
  }

  const formattedContent = formatGroupNoticeDisplayText(
    (item.msg || '').trim().replace(/\s+/g, ' '),
    groupReqNoticeExtra(item),
    {
      currentUid: authStore.uid,
      resolveUidPlaceholder: resolveReqUid,
    },
  )
  const raw = normalizeGroupNoticeText(formattedContent)
  if (!raw) {
    return item.groupName ? t('群通知条目摘要', { name: item.groupName }) : t('群通知')
  }
  const translated = translateKnownGroupNotice(raw)
  if (/^\S*(?:群主|管理员|（群员）|（管理员）|（群主）)/.test(raw)) return translated

  const shouldPrefix =
    /^(拒绝加入|同意加入|申请加入|邀请你加入|加入)/.test(raw) ||
    (item.groupReqStatus === 2 && raw.includes('拒绝')) ||
    [1, 2, 3, 4, 14, 15].includes(item.groupReqType)
  if (!shouldPrefix) return translated

  const user = item.groupReqStatus === 2
    ? item.targetUser || item.fromUser || item.checkUser
    : item.fromUser || item.targetUser || item.checkUser
  const name = resolveReqDisplayName(
    user,
    item.groupReqStatus === 2 ? item.receiveUid : item.sendUid,
  )
  if (!name || raw.includes(name)) return translated

  return `${name}${translated}`
}

function parseExtraObject(extra: unknown): Record<string, any> {
  if (!extra) return {}
  if (typeof extra === 'object') return extra as Record<string, any>
  if (typeof extra !== 'string') return {}
  try {
    const parsed = JSON.parse(extra)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : {}
  } catch {
    return {}
  }
}

function formatAcceptedGroupDigest(item: GroupReqItem): string {
  const targetName = isSelfUser(item.targetUser, item.receiveUid)
    ? t('你')
    : formatReqMemberName(item.targetUser, item.receiveUid)
  const groupName = item.groupName || t('群聊')
  if (targetName) return `${targetName}${t('同意加入')} ${groupName}`.trim()
  return `${t('已同意')} ${groupName}`.trim()
}

function formatRejectedGroupDigest(item: GroupReqItem): string {
  const targetName = formatReqMemberName(item.targetUser, item.receiveUid)
    || resolveReqDisplayName(item.fromUser, item.sendUid)
    || t('你')
  const groupName = item.groupName || t('群聊')
  return `${targetName}${t('拒绝加入')} ${groupName}`.trim()
}

function parseGroupReqItems(raw: any[]): GroupReqItem[] {
  return raw
    .map((item: any) => {
      const targetUser = item.targetUser || null
      const checkUser = item.checkUser || null
      const fromUser = item.fromUser || null
      return {
        localId: item.groupReqId ? undefined : `api-${item.groupId || ''}-${item.groupReqType || 0}-${item.updateTime || item.createTime || Date.now()}`,
        groupReqId: Number(item.groupReqId || 0),
        groupId: String(item.groupId ?? ''),
        groupName: item.groupName || '',
        pic: item.pic || '',
        msg: item.msg || '',
        groupReqType: item.groupReqType || 0,
        groupReqStatus: item.groupReqStatus || 0,
        groupHostUid: String(item.groupHostUid ?? ''),
        checkUserType: Number(item.checkUserType ?? -1),
        sendUid: String(item.sendUid ?? getReqUserId(fromUser) ?? ''),
        receiveUid: String(item.receiveUid ?? getReqUserId(targetUser) ?? ''),
        targetUser,
        checkUser,
        fromUser,
        members: Array.isArray(item.members) ? item.members : [],
        createTime: Number(item.createTime || 0),
        updateTime: Number(item.updateTime || item.createTime || 0),
      }
    })
    .filter((item: GroupReqItem) => !(item as any).isHide)
}

function localMessageToGroupReqItem(message: Message): GroupReqItem | null {
  if (message.msgType !== 8) return null
  const extra = parseExtraObject(message.extra)
  const groupId = String(extra.groupId ?? '').trim()
  const msg = String(message.content || '').trim()
  if (!groupId || !msg) return null

  const sendTime = Number(message.sendTime || Date.now())
  const targetUser = extra.targetUser || null
  const checkUser = extra.checkUser || null
  const fromUser = extra.fromUser || null
  return {
    localId: String(message.id || message.customMsgId || `local-${groupId}-${sendTime}`),
    groupReqId: Number(extra.groupReqId || 0),
    groupId,
    groupName: String(extra.groupName || groupStore.getGroup(groupId)?.name || groupId),
    pic: String(extra.groupAvatar || groupStore.getGroup(groupId)?.avatar || ''),
    msg,
    groupReqType: Number(extra.groupReqType ?? 0),
    groupReqStatus: Number(extra.groupReqStatus ?? 0),
    groupHostUid: String(extra.groupHostUid ?? ''),
    checkUserType: Number(extra.checkUserType ?? -1),
    sendUid: String(extra.sendUid ?? extra.fromUid ?? getReqUserId(fromUser) ?? message.senderId ?? ''),
    receiveUid: String(extra.receiveUid ?? getReqUserId(targetUser) ?? ''),
    targetUser,
    checkUser,
    fromUser,
    members: Array.isArray(extra.members) ? extra.members : [],
    createTime: sendTime,
    updateTime: sendTime,
  }
}

function getLocalGroupReqItems(): GroupReqItem[] {
  return messageStore
    .getMessages(notificationConversationId)
    .map(localMessageToGroupReqItem)
    .filter((item): item is GroupReqItem => Boolean(item))
}

function normalizeMergeText(value: unknown): string {
  return normalizeGroupNoticeText(String(value ?? '').trim().replace(/\s+/g, ' ')).slice(0, 120)
}

function makeSemanticGroupReqKey(item: GroupReqItem): string {
  const sendUid = item.sendUid || getReqUserId(item.fromUser)
  const receiveUid = item.receiveUid || getReqUserId(item.targetUser) || getReqUserId(item.checkUser)
  return [
    'sem',
    item.groupId || '',
    Number(item.groupReqType || 0),
    Number(item.groupReqStatus || 0),
    sendUid,
    receiveUid,
    normalizeMergeText(item.msg),
  ].join(':')
}

function makeLooseGroupReqKey(item: GroupReqItem): string {
  const sendUid = item.sendUid || getReqUserId(item.fromUser)
  const receiveUid = item.receiveUid || getReqUserId(item.targetUser) || getReqUserId(item.checkUser)
  return [
    'loose',
    item.groupId || '',
    Number(item.groupReqType || 0),
    sendUid,
    receiveUid,
  ].join(':')
}

function makePrimaryGroupReqKey(item: GroupReqItem): string {
  if (item.groupReqId > 0) return `req:${item.groupReqId}`
  return `local:${item.localId || `${item.groupId}-${item.groupReqType}-${item.updateTime}-${item.msg}`}`
}

function chooseGroupReqItem(previous: GroupReqItem | undefined, incoming: GroupReqItem): GroupReqItem {
  if (!previous) return incoming
  const previousTime = previous.updateTime || previous.createTime || 0
  const incomingTime = incoming.updateTime || incoming.createTime || 0
  if (incoming.groupReqId > 0 && previous.groupReqId <= 0) {
    return { ...previous, ...incoming, localId: previous.localId || incoming.localId }
  }
  if (incomingTime >= previousTime) {
    return {
      ...previous,
      ...incoming,
      groupReqId: incoming.groupReqId || previous.groupReqId,
      localId: previous.localId || incoming.localId,
    }
  }
  return {
    ...incoming,
    ...previous,
    groupReqId: previous.groupReqId || incoming.groupReqId,
    localId: previous.localId || incoming.localId,
  }
}

function mergeGroupReqItems(apiItems: GroupReqItem[], localItems: GroupReqItem[]): GroupReqItem[] {
  const merged = new Map<string, GroupReqItem>()
  const aliasToPrimary = new Map<string, string>()
  const duplicateKeys: string[] = []

  for (const item of [...apiItems, ...localItems]) {
    const primaryKey = makePrimaryGroupReqKey(item)
    const semanticKey = makeSemanticGroupReqKey(item)
    const looseKey = makeLooseGroupReqKey(item)
    const aliases = [primaryKey, semanticKey, looseKey]
    const existingKey = aliases.map((key) => aliasToPrimary.get(key)).find(Boolean)
    const targetKey = existingKey || primaryKey
    const previous = merged.get(targetKey)
    if (previous) {
      duplicateKeys.push(semanticKey)
    }
    merged.set(targetKey, chooseGroupReqItem(previous, item))
    for (const alias of aliases) aliasToPrimary.set(alias, targetKey)
  }

  if (duplicateKeys.length > 0) {
    groupInvitationRefreshLog('merge duplicates', {
      duplicateCount: duplicateKeys.length,
      duplicateKeys: Array.from(new Set(duplicateKeys)).slice(0, 5),
    })
  }
  return sortGroupReqItems(Array.from(merged.values()))
}

function sortGroupReqItems(items: GroupReqItem[]): GroupReqItem[] {
  return [...items].sort(
    (a, b) => (b.updateTime || b.createTime || 0) - (a.updateTime || a.createTime || 0),
  )
}

function getPendingGroupNotificationCount(items: GroupReqItem[]): number {
  return items.filter((item) => Number(item.groupReqStatus || 0) === 0).length
}

function isPendingSelfGroupInvite(item: GroupReqItem): boolean {
  return SELF_INVITE_REQ_TYPES.has(Number(item.groupReqType || 0))
    && Number(item.groupReqStatus || 0) === 0
    && isSelfInviteItem(item)
    && Boolean(item.groupId)
}

async function cleanupPendingGroupConversations(items: GroupReqItem[]) {
  const uid = String(authStore.uid || '')
  if (!uid) return

  const pendingGroupIds = Array.from(new Set(
    items
      .filter(isPendingSelfGroupInvite)
      .map((item) => String(item.groupId || ''))
      .filter(Boolean),
  ))

  for (const groupId of pendingGroupIds) {
    chatStore.markPendingGroupInviteConversation(groupId)
    // 待同意邀请不应出现在通讯录群组；这里和实时事件链保持一致，兜底清理历史残留。
    groupStore.removeGroup(groupId)
    const conversationId = `1_${groupId}`
    messageStore.clearConversationMessages(conversationId)
    if (!chatStore.conversations.some((conv) => conv.id === conversationId)) continue
    await chatStore.deleteConversation(uid, conversationId).catch(() => undefined)
  }
}

function syncSidebarPreview(items: GroupReqItem[], timeOverride?: number) {
  const latest = items[0]
  if (latest) {
    chatStore.updateGroupNotificationConv(
      formatReqMessage(latest),
      timeOverride || latest.updateTime || latest.createTime,
      null,
    )
  } else {
    chatStore.removeGroupNotificationConversation()
  }
}

function promoteGroupNotificationConversation(item: GroupReqItem, items: GroupReqItem[], time = Date.now()) {
  const newestNonPinnedTime = chatStore.conversations.reduce((latest, conv) => {
    if (conv.isPinned) return latest
    return Math.max(latest, Number(conv.updatedAt || 0), Number(conv.lastMsgTime || 0))
  }, 0)
  const nextTime = Math.max(time, newestNonPinnedTime + 1)
  chatStore.updateGroupNotificationConv(
    formatReqMessage(item),
    nextTime,
    null,
  )
}

function promoteGroupConversationAboveNotification(groupId: string) {
  const convId = `1_${groupId}`
  const groupConv = chatStore.conversations.find((conv) => conv.id === convId)
  const noticeConv = chatStore.conversations.find((conv) => conv.id === notificationConversationId)
  if (!groupConv || !noticeConv) return

  const noticeTime = Math.max(
    Number(noticeConv.updatedAt || 0),
    Number(noticeConv.lastMsgTime || 0),
  )
  const nextUpdatedAt = Math.max(Date.now(), noticeTime + 1)
  chatStore.addOrUpdateConversation({
    ...groupConv,
    updatedAt: nextUpdatedAt,
  })
}

async function doLoadList(reason: string) {
  const seq = ++groupInvitationRefreshSeq
  const startedAt = Date.now()
  const noticeUnreadBefore = Number(
    chatStore.conversations.find((conv) => conv.id === notificationConversationId)?.unreadCount || 0,
  )
  groupInvitationRefreshLog('start', {
    seq,
    reason,
    localBefore: getLocalGroupReqItems().length,
    currentConversationId: chatStore.currentConversationId || '',
    noticeUnreadBefore,
  })
  let apiItems: GroupReqItem[] = []
  try {
    if (authStore.uid) {
      await messageStore.loadMessages(authStore.uid, notificationConversationId)
    }
  } catch {
    // 本地通知加载失败时继续使用接口数据兜底。
  }

  try {
    const res = await getGroupReqList({ pageNum: 1, pageSize: 100 })
    if (res?.groupReqs) {
      apiItems = parseGroupReqItems(res.groupReqs)
    }
  } catch {
    // 接口失败时仍展示本地通知，避免页面空白中断。
  }

  const localItems = getLocalGroupReqItems()
  const mergedItems = mergeGroupReqItems(apiItems, localItems)
  list.value = mergedItems
  await cleanupPendingGroupConversations(list.value)
  syncSidebarPreview(list.value)
  const noticeUnreadAfter = Number(
    chatStore.conversations.find((conv) => conv.id === notificationConversationId)?.unreadCount || 0,
  )
  groupInvitationRefreshLog('done', {
    seq,
    reason,
    apiCount: apiItems.length,
    localCount: localItems.length,
    mergedCount: mergedItems.length,
    pendingCount: getPendingGroupNotificationCount(mergedItems),
    currentConversationId: chatStore.currentConversationId || '',
    noticeUnreadBefore,
    noticeUnreadAfter,
    durationMs: Date.now() - startedAt,
  })
}

async function loadList(reason = 'manual') {
  if (groupInvitationRefreshRunning) {
    groupInvitationRefreshQueuedReason = reason
    groupInvitationRefreshLog('queued', { reason })
    return
  }

  // 群通知在首次或空列表刷新时需要明确展示“加载中”，避免误显示“暂无群通知”。
  listLoading.value = true
  groupInvitationRefreshRunning = true
  try {
    let nextReason = reason
    do {
      groupInvitationRefreshQueuedReason = ''
      await doLoadList(nextReason)
      nextReason = groupInvitationRefreshQueuedReason || ''
    } while (nextReason)
  } finally {
    groupInvitationRefreshRunning = false
    listLoading.value = false
  }
}

async function handleCheck(item: GroupReqItem, flag: boolean, index: number) {
  const isAuditor =
    [2, 15].includes(item.groupReqType) ||
    item.groupHostUid === String(authStore.uid || '')

  const apiFn = isAuditor ? groupCheckJoin : groupUserCheckJoin

  try {
    const res = await apiFn({ groupReqId: item.groupReqId, flag })
    if (Number((res as any)?.commonResult?.errCode) === 200) {
      const now = Date.now()
      const handledItem = {
        ...list.value[index],
        groupReqStatus: flag ? 1 : 2,
        msg: flag ? list.value[index].msg : formatRejectedGroupDigest(list.value[index]),
        updateTime: now,
      }
      list.value = sortGroupReqItems([
        ...list.value.slice(0, index),
        handledItem,
        ...list.value.slice(index + 1),
      ])
      let shouldPromoteGroup = Boolean(chatStore.conversations.find((conv) => conv.id === `1_${item.groupId}`))
      if (flag) {
        const gid = item.groupId
        const conversationId = `1_${gid}`
        chatStore.clearPendingGroupInviteConversation(gid)
        messageStore.clearConversationMessages(conversationId)
        if (!groupStore.groups.find((g) => g.id === gid)) {
          groupStore.groups.push({
            id: gid,
            name: item.groupName,
            avatar: item.pic || null,
            ownerId: null,
            memberCount: 0,
            notice: null,
            isMuted: false,
            updatedAt: Date.now(),
          })
        }
        const conv = chatStore.ensureConversation(1, gid)
        const acceptedDigest = formatAcceptedGroupDigest(handledItem)
        chatStore.addOrUpdateConversation({
          ...conv,
          lastMsgDigest: acceptedDigest,
          lastMsgTime: now,
          updatedAt: now,
        })
        messageStore.appendLocalSystemNotice(conversationId, acceptedDigest)
        shouldPromoteGroup = true
      }
      syncSidebarPreview(list.value, now)
      if (flag && shouldPromoteGroup) {
        promoteGroupConversationAboveNotification(item.groupId)
      } else if (!flag) {
        promoteGroupNotificationConversation(handledItem, list.value, now)
      }
    }
  } catch {
    // 操作失败保持当前列表状态，不向控制台输出调试信息。
  }
}

function canOpenGroup(item: GroupReqItem): boolean {
  // 群通知仅“已同意”允许跳转，待同意/已拒绝/已失效等状态都必须禁止打开。
  return Boolean(item.groupId && Number(item.groupReqStatus) === 1)
}

function getCachedGroupDetailCheck(groupId: string): boolean | null {
  const cached = groupDetailCheckCache.get(groupId)
  if (!cached) return null
  if (Date.now() - cached.checkedAt > GROUP_DETAIL_CHECK_TTL_MS) {
    groupDetailCheckCache.delete(groupId)
    return null
  }
  return cached.valid
}

async function verifyGroupAvailableBeforeOpen(item: GroupReqItem): Promise<boolean> {
  const groupId = String(item.groupId || '')
  if (!groupId) return false

  const cachedResult = getCachedGroupDetailCheck(groupId)
  if (cachedResult !== null) return cachedResult

  const detail = await getGroupDetail({ groupId })
  const code = Number((detail as any)?.commonResult?.errCode ?? 200)
  const groupBase = (detail as any)?.group
  const isAvailable = (code === 0 || code === 200) && Boolean(groupBase)
  groupDetailCheckCache.set(groupId, { valid: isAvailable, checkedAt: Date.now() })
  if (!isAvailable) return false

  // 详情校验通过后回填群资料，避免进入会话后显示旧名称/旧头像。
  groupStore.upsertGroup({
    id: groupId,
    name: groupBase.name ?? groupBase.groupName ?? item.groupName,
    avatar: groupBase.pic ?? groupBase.avatar ?? groupBase.groupAvatar ?? item.pic ?? null,
    ownerId: groupBase.hostId ? String(groupBase.hostId) : undefined,
    memberCount: Number(groupBase.memberCount ?? 0),
    groupAliasName: groupBase.groupAliasName ?? null,
  })
  return true
}

async function handleGroupClick(item: GroupReqItem) {
  if (!canOpenGroup(item)) return
  try {
    const available = await verifyGroupAvailableBeforeOpen(item)
    if (!available) throw new Error('group unavailable')
  } catch {
    item.groupReqStatus = 3
    eventBus.emit('show-toast', { message: t('该群聊已解散'), type: 'error' })
    return
  }
  const conv = chatStore.ensureConversation(ConversationType.Group, item.groupId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

onMounted(() => {
  chatStore.clearGroupNotificationUnread()
  loadList('mounted')
  eventBus.on('group-invitation:update', handleGroupInvitationUpdate)
})

onBeforeUnmount(() => {
  eventBus.off('group-invitation:update', handleGroupInvitationUpdate)
})

function handleGroupInvitationUpdate() {
  loadList('eventBus')
}
</script>

<template>
  <div class="group-invitation">
    <h1>{{ t('群通知') }}</h1>
    <ul class="notify-box">
      <li
        v-for="(item, index) in list"
        :key="item.localId || item.groupReqId"
        :class="{ clickable: canOpenGroup(item) }"
        @click="handleGroupClick(item)"
      >
        <TextAvatar
          class="item-avatar"
          :name="item.groupName"
          :src="item.pic || null"
          avatar-type="group"
          :size="40"
          rounded
        />
        <div class="item-body">
          <div class="top-info">
            <h2>{{ item.groupName }}</h2>
            <span class="time"> · {{ formatTime(item.updateTime) }}</span>
          </div>
          <p class="line-notify">{{ formatReqMessage(item) }}</p>
        </div>
        <div
          v-if="[1, 2, 15].includes(item.groupReqType)"
          class="right-info"
        >
          <template v-if="!item.groupReqStatus">
            <button type="button" @click.stop="handleCheck(item, false, index)">{{ t('拒绝') }}</button>
            <button type="button" class="active" @click.stop="handleCheck(item, true, index)">{{ t('通过') }}</button>
          </template>
          <span v-else class="status-label">{{ statusLabel(item.groupReqStatus) }}</span>
        </div>
      </li>
      <li v-if="listLoading && list.length === 0" class="empty-tip">{{ t('加载中') }}</li>
      <li v-else-if="list.length === 0" class="empty-tip">{{ t('暂无群通知') }}</li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.group-invitation {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: #fff;

  > h1 {
    margin: 0;
    display: flex;
    height: 51px;
    padding: 0 16px;
    align-items: center;
    border-bottom: 1px solid #eee;
    font-size: 16px;
    font-weight: 700;
    color: #333;
    flex-shrink: 0;
  }
}

.notify-box {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    min-height: 72px;
    position: relative;
    padding: 12px 150px 12px 65px;
    display: flex;
    align-items: center;

    &::after {
      content: "";
      display: block;
      position: absolute;
      right: 0;
      bottom: 0;
      left: 65px;
      height: 1px;
      background: #ebebeb;
    }

    &.clickable {
      cursor: pointer;
    }

    &.empty-tip {
      justify-content: center;
      padding: 24px;
      color: #999;
      font-size: 14px;
      &::after { display: none; }
    }
  }
}

.item-avatar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.item-body {
  flex: 1;
  min-width: 0;
}

.top-info {
  display: flex;
  align-items: center;

  > h2 {
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    color: #000;
    margin: 0;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    max-width: 70%;
    margin-right: 5px;
  }

  .time {
    font-size: 12px;
    color: #999;
  }
}

.line-notify {
  margin: 0;
  line-height: 20px;
  color: #2288f0;
  font-size: 12px;
}

.right-info {
  position: absolute;
  right: 15px;
  display: flex;
  gap: 5px;

  > button {
    border: 0;
    color: #fff;
    background: #666;
    line-height: 30px;
    padding: 0 10px;
    border-radius: 5px;
    min-width: 60px;
    width: auto;
    text-align: center;
    cursor: pointer;

    &:hover { opacity: 0.8; }
    &.active { background: #3369fe; }
  }

  .status-label {
    display: inline-block;
    line-height: 30px;
    min-height: 30px;
    padding: 0 8px;
    background: #eeeff3;
    color: #999b9e;
    min-width: 60px;
    width: auto;
    max-width: 120px;
    text-align: center;
    border-radius: 5px;
    font-size: 12px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
