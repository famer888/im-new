<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  OFFICIAL_ACCOUNT_NAME,
  useChatStore,
  isFileHelperTargetId,
  isOfficialAccountTargetId,
  type Conversation,
} from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { API_CONFIG } from '@/api/config'
import { ConversationType, isHiddenMessageType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import dayjs from 'dayjs'
import {
  formatGroupNoticeDisplayText,
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
  parseGroupNoticeExtraObject,
  replaceGroupNoticeUidPlaceholders,
} from '@/utils/groupNoticeDisplay'
import { normalizeGroupNoticeText, translateGroupNoticeText } from '@/utils/groupNoticeI18n'
import { isGroupIntroNoticeMessage } from '@/utils/groupIntroNotice'
import { openNotificationModuleByConversationId } from '@/utils/notificationNavigation'
import { isSelfLeaveGroupSystemMessage } from '@/utils/chatUnreadVisibility'
import { emojiObj } from '@/utils/emoji'
import mdrIcon from '@/assets/images/message/mdr-icon.png'
import archiveIcon from '@/assets/images/message/archive-icon.png'
import groupNotificationIcon from '@/assets/images/logo/group-icon.png'
import channelNotificationIcon from '@/assets/images/logo/channel-notice.webp'
import brandLogoIcon from '@/assets/images/logo/logo.png'
import official55Icon from '@/assets/images/logo/official-55.png'
import channelFeatureIcon from '@/assets/images/channel/feature.png'

const { t, locale } = useI18n()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()
const authStore = useAuthStore()
const emojiMap = emojiObj as Record<string, string>
const officialAccountIcon = API_CONFIG.brandId === '55' ? official55Icon : brandLogoIcon
const HIDDEN_GROUP_NOTICE_TEXT = '群聊事件'
const GROUP_NOTICE_UID_PLACEHOLDER_RE = /#\{uids:([^}]+)\}/g
const PURE_UID_RE = /\b\d{5,}\b/g
const LEGACY_CHANNEL_NOTIFICATION_TARGET_ID = '9902'
const CONVERSATION_ITEM_HEIGHT = 59
const VIRTUAL_OVERSCAN_COUNT = 36
const MIN_VIRTUAL_VIEWPORT_HEIGHT = CONVERSATION_ITEM_HEIGHT * 12
const repairingGroupDigestIds = new Set<string>()
const repairingChannelNameIds = new Set<string>()
const groupIntroTagTraceCache = new Map<string, string>()
const conversationListRef = ref<HTMLElement | null>(null)
const archiveEntryRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const archiveEntryHeight = ref(0)
let resizeObserver: ResizeObserver | null = null
let previewRefreshTimer: number | null = null
const previewRepairSeenKeys = new Set<string>()

type DigestSegment =
  | { type: 'text'; text: string }
  | { type: 'emoji'; text: string; src: string }
  | { type: 'group-intro-unread'; text: string }
  | { type: 'sender'; text: string }

function groupNoticeDebug(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'warn') {
  if (!isConversationListDebugEnabled()) return
  console[level](`[conversation-list] ${message}`, data || {})
}

function isConversationListDebugEnabled() {
  return localStorage.getItem('debug:conversation-list') === '1'
}

function groupIntroTagTrace(conv: Conversation, data: Record<string, unknown>) {
  if (!isConversationListDebugEnabled()) return
  const key = [
    conv.id,
    conv.unreadCount,
    conv.lastMsgId || '',
    conv.lastMsgTime || 0,
    conv.lastMsgDigest || '',
    data.reason || '',
    data.showTag ? '1' : '0',
  ].join('|')
  if (groupIntroTagTraceCache.get(conv.id) === key) return
  groupIntroTagTraceCache.set(conv.id, key)
  // console.info('[conversation-list] group intro unread tag decision', data)
}

/** 传输助手仅通过侧栏「传输」进入，不在会话列表重复展示（与 im 一致） */
function isNotFileHelper(c: Conversation): boolean {
  return !isFileHelperTargetId(c.targetId)
}

function isChannelNotificationConversation(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Friend) return false
  const targetId = String(conv.targetId || '')
  const conversationId = String(conv.id || '')
  // 对齐老 im：频道通知伪会话既可能是 channelNotice，也可能沿用历史 targetId=9902。
  return targetId === CHANNEL_NOTIFICATION_TARGET_ID
    || targetId === LEGACY_CHANNEL_NOTIFICATION_TARGET_ID
    || conversationId === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`
    || conversationId === `0_${LEGACY_CHANNEL_NOTIFICATION_TARGET_ID}`
}

function isConversationInCurrentRelations(conv: Conversation): boolean {
  if (isChannelNotificationConversation(conv)) {
    return true
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return true
  }
  switch (conv.type) {
    case ConversationType.Friend:
      // 对齐旧 im：官方号不依赖通讯录存在，也要保留在会话列表。
      if (isOfficialAccountTargetId(conv.targetId)) return true
      // 关系列表远端刷新期间先保留本地会话，避免大账号启动时左侧列表长期空白。
      return contactIdSet.value.has(conv.targetId) || contactStore.loading
    case ConversationType.Group:
      if (chatStore.isPendingGroupInviteConversation(conv.targetId)) return false
      return groupByIdMap.value.has(conv.targetId) || groupStore.loading
    case ConversationType.Channel:
      // 对齐旧 im：频道会话来自 MessageChannelList，不能因为频道列表/详情短暂没命中就从左侧消失；
      // 真正退出、解散或被移除频道时，ChannelStore 会显式 deleteConversation。
      return true
    default:
      return false
  }
}

/** 未确认的入群邀请会先挂在「群通知」，普通会话列表里的群会话预览需要隐藏。 */
function isPendingInviteConversationPreview(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Group) return false
  if (conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  if (chatStore.isPendingGroupInviteConversation(conv.targetId)) return true

  // 再兜底看一次当前会话已加载的最新系统消息：只有“待确认”状态才隐藏；
  // 已同意后的入群系统消息即使文案还带“邀请/加入群聊”，也不能继续挡住群会话。
  const latest = [...messageStore.getMessages(conv.id)].reverse().find((message) => message.msgType === 8)
  if (!latest) return false

  const extra = parseGroupNoticeExtraObject(latest.extra)
  const source = String(extra?.source || '')
  const status = Number(extra?.groupReqStatus ?? 0)
  return source === 'group-event-req-chat' && status !== 1
}

/**
 * Windows 本地库里可能残留仅由群事件撑出来的占位群：
 * 只有群号、没有头像、也没有可见摘要。旧 im 不会把这类项长期展示在会话列表里。
 */
function isSuspiciousPlaceholderGroupConversation(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Group || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false

  const group = groupByIdMap.value.get(conv.targetId)
  if (!group) return false

  const explicitName = String(group.name || '').trim()
  const hasResolvedName = Boolean(explicitName) && explicitName !== conv.targetId
  const hasAvatar = Boolean(group.avatar)
  const lastDigest = String(conv.lastMsgDigest || '').trim()
  const hasVisibleDigest = Boolean(lastDigest)
    && !isHiddenGroupNoticeDigest(lastDigest)
    && !isRejectedGroupInviteDigestInGroupChat(conv)

  return !hasResolvedName && !hasAvatar && !hasVisibleDigest
}

/**
 * 某些群事件只会落一条 source=group-event / content=群聊事件 的占位消息。
 * 旧 im 不会把这类没有任何可见摘要的群长期保留在主会话列表里。
 * 这里等本地消息加载完成后再隐藏，避免误伤仍可回退到旧消息摘要的正常群。
 */
function isHiddenOnlyGroupEventConversation(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Group || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  if (!isHiddenGroupNoticeDigest(String(conv.lastMsgDigest || ''))) return false

  const loaded = messageStore.getMessages(conv.id)
  if (loaded.length === 0) return false
  if (getLoadedLatestVisibleMessage(conv)) return false

  const latest = [...loaded].reverse().find((message) => !message.isDeleted) ?? null
  if (!latest || latest.msgType !== 8) return false

  const extra = parseGroupNoticeExtraObject(latest.extra)
  return String(extra?.source || '') === 'group-event'
}

function hasMeaningfulDigestText(raw: string | null | undefined): boolean {
  // 兼容历史脏数据：零宽字符不应算作“有摘要”。
  return raw ? raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length > 0 : false
}

function hasMeaningfulLoadedHistory(conv: Conversation): boolean {
  const latest = getLoadedLatestVisibleMessage(conv)
  if (!latest) return false
  // 仅有空内容/0时间的占位消息不算历史，避免“点开联系人后空会话残留在最近记录”。
  return Number(latest.sendTime || 0) > 0 || hasMeaningfulDigestText(getMessageDigest(latest))
}

function isConversationWithoutHistory(conv: Conversation): boolean {
  // 对齐旧 im：仅因“点开联系人”创建的空会话不应污染最近记录；
  // 但有草稿/未读等待处理内容时必须保留可见。
  if (isFileHelperTargetId(conv.targetId)) return false
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  if (isChannelNotificationConversation(conv)) return false
  // 对齐旧 im：群/频道清空消息只清内容，不应把会话从左侧列表隐藏；退出、解散、移除仍走显式删除。
  if (conv.type === ConversationType.Group || conv.type === ConversationType.Channel) return false
  if (shouldShowDraft(conv)) return false
  if (Number(conv.unreadCount || 0) > 0) return false
  if (Number(conv.lastMsgTime || 0) > 0) return false
  if (hasMeaningfulDigestText(conv.lastMsgDigest || '')) return false
  return !hasMeaningfulLoadedHistory(conv)
}

const contactIdSet = computed(() => new Set(contactStore.contacts.map((contact) => contact.id)))
const groupByIdMap = computed(() => new Map(groupStore.groups.map((group) => [group.id, group])))
const channelByIdMap = computed(() => {
  const map = new Map<string, (typeof channelStore.channels)[number]>()
  for (const channel of channelStore.channels) {
    // 频道接口和本地缓存可能混用 number/string；统一字符串 key，避免清空摘要后关系匹配抖动导致列表隐藏。
    if (channel.id) map.set(String(channel.id), channel)
    if (channel.channelId) map.set(String(channel.channelId), channel)
  }
  return map
})

const normalConversations = computed(() =>
  chatStore.conversations.filter(
    c => !c.isArchived
      && isNotFileHelper(c)
      && isConversationInCurrentRelations(c)
      && !isPendingInviteConversationPreview(c)
      && !isSuspiciousPlaceholderGroupConversation(c)
      && !isHiddenOnlyGroupEventConversation(c)
      && !isConversationWithoutHistory(c),
  ),
)

const archivedConversations = computed(() =>
  chatStore.conversations.filter(
    c => c.isArchived
      && isNotFileHelper(c)
      && isConversationInCurrentRelations(c)
      && !isPendingInviteConversationPreview(c)
      && !isSuspiciousPlaceholderGroupConversation(c)
      && !isHiddenOnlyGroupEventConversation(c)
      && !isConversationWithoutHistory(c),
  ),
)

/** 与旧 im 归档入口 archiveText 一致：归档会话名称逗号拼接预览 */
const archivePreviewText = computed(() =>
  archivedConversations.value.map((c) => getName(c)).filter(Boolean).join(','),
)

/** 归档会话汇总未读（旧 im archiveUnreadCount） */
const archiveUnreadTotal = computed(() =>
  archivedConversations.value.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
)

const displayList = computed(() =>
  uiStore.chatArchiveListShow
    ? archivedConversations.value
    : ensureGroupNotificationVisible(normalConversations.value),
)

const archiveEntryVisible = computed(() =>
  archivedConversations.value.length > 0 && !uiStore.chatArchiveListShow,
)

const listTopOffset = computed(() =>
  archiveEntryVisible.value ? archiveEntryHeight.value || CONVERSATION_ITEM_HEIGHT : 0,
)

const visibleConversationRange = computed(() => {
  const listScrollTop = Math.max(0, scrollTop.value - listTopOffset.value)
  const effectiveViewportHeight = Math.max(viewportHeight.value, MIN_VIRTUAL_VIEWPORT_HEIGHT)
  const startIndex = Math.max(0, Math.floor(listScrollTop / CONVERSATION_ITEM_HEIGHT) - VIRTUAL_OVERSCAN_COUNT)
  const endIndex = Math.min(
    displayList.value.length,
    Math.ceil((listScrollTop + effectiveViewportHeight) / CONVERSATION_ITEM_HEIGHT) + VIRTUAL_OVERSCAN_COUNT,
  )

  return { startIndex, endIndex }
})

const visibleConversationRows = computed(() => {
  const { startIndex, endIndex } = visibleConversationRange.value
  return displayList.value.slice(startIndex, endIndex)
})

const virtualListStyle = computed(() => {
  const { startIndex, endIndex } = visibleConversationRange.value
  // 用上下 padding 撑出未渲染区域，避免绝对定位在快速滚动时出现半屏空白。
  return {
    paddingTop: `${startIndex * CONVERSATION_ITEM_HEIGHT}px`,
    paddingBottom: `${Math.max(0, displayList.value.length - endIndex) * CONVERSATION_ITEM_HEIGHT}px`,
  }
})

function ensureGroupNotificationVisible(conversations: Conversation[]): Conversation[] {
  const hasGroupNotification = conversations.some(
    (conv) => conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID,
  )
  if (hasGroupNotification) return conversations

  const pendingInvites = chatStore.conversations
    .filter(
      (conv) => conv.type === ConversationType.Group
        && conv.targetId !== GROUP_NOTIFICATION_TARGET_ID
        && chatStore.isPendingGroupInviteConversation(conv.targetId),
    )
    .sort((a, b) => Number(b.lastMsgTime || 0) - Number(a.lastMsgTime || 0))
  const pendingInvite = pendingInvites[0]
    || chatStore.conversations.find(
    (conv) => conv.type === ConversationType.Group
      && conv.targetId !== GROUP_NOTIFICATION_TARGET_ID
      && String(conv.lastMsgDigest || '').includes('邀请你加入群聊'),
    )
  if (!pendingInvite) return conversations

  return [
    {
      ...pendingInvite,
      id: `1_${GROUP_NOTIFICATION_TARGET_ID}`,
      targetId: GROUP_NOTIFICATION_TARGET_ID,
      senderName: null,
      unreadCount: Number(pendingInvite.unreadCount || 0) > 0 ? 1 : 0,
    },
    ...conversations,
  ]
}

function getName(conv: Conversation): string {
  if (isChannelNotificationConversation(conv)) {
    return t('频道通知')
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return t('群通知')
  }
  switch (conv.type) {
    case ConversationType.Friend:
      if (isOfficialAccountTargetId(conv.targetId)) return OFFICIAL_ACCOUNT_NAME
      return contactStore.getDisplayName(conv.targetId)
    case ConversationType.Group:
      return groupByIdMap.value.get(conv.targetId)?.name ?? conv.targetId
    case ConversationType.Channel:
      return channelByIdMap.value.get(conv.targetId)?.channelName
        ?? channelByIdMap.value.get(conv.targetId)?.name
        ?? conv.targetId
    default:
      return conv.targetId
  }
}

function explicitConversationName(conv: Conversation): string {
  if (isChannelNotificationConversation(conv)) {
    return t('频道通知')
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return t('群通知')
  }
  switch (conv.type) {
    case ConversationType.Friend: {
      if (isOfficialAccountTargetId(conv.targetId)) return OFFICIAL_ACCOUNT_NAME
      const contact = contactStore.getContact(conv.targetId)
      return String(contact?.remark || contact?.nickname || '').trim()
    }
    case ConversationType.Group:
      return String(groupByIdMap.value.get(conv.targetId)?.name || '').trim()
    case ConversationType.Channel: {
      const channel = channelByIdMap.value.get(conv.targetId)
      return String(channel?.channelName || channel?.name || '').trim()
    }
    default:
      return ''
  }
}

function shouldShowNamePlaceholder(conv: Conversation): boolean {
  if (!(window as any).__TAURI_INTERNALS__) return false
  if (isChannelNotificationConversation(conv)) return false
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  return !explicitConversationName(conv)
}

function getDisplayNameForAvatar(conv: Conversation): string {
  if (shouldShowNamePlaceholder(conv)) {
    return conv.type === ConversationType.Channel ? t('频道') : ''
  }
  return explicitConversationName(conv) || getName(conv)
}

function shouldRepairChannelName(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Channel) return false
  const channel = channelByIdMap.value.get(conv.targetId)
  if (!channel) return false
  const name = String(channel.channelName || channel.name || '').trim()
  return !name || name === String(conv.targetId)
}

function repairChannelName(conv: Conversation) {
  if (!shouldRepairChannelName(conv)) return
  if (repairingChannelNameIds.has(conv.targetId)) {
    return
  }

  repairingChannelNameIds.add(conv.targetId)
  void channelStore.refreshChannelDetail(conv.targetId).finally(() => {
    repairingChannelNameIds.delete(conv.targetId)
  })
}

function getAvatar(conv: Conversation): string | null {
  if (isChannelNotificationConversation(conv)) {
    return channelNotificationIcon
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return groupNotificationIcon
  }
  switch (conv.type) {
    case ConversationType.Friend:
      if (isOfficialAccountTargetId(conv.targetId)) {
        // 按当前品牌包展示官方号头像：55 使用老 im 头像，其它品牌使用各自 logo。
        return officialAccountIcon
      }
      return contactStore.getContact(conv.targetId)?.avatar ?? null
    case ConversationType.Group:
      return groupByIdMap.value.get(conv.targetId)?.avatar ?? null
    case ConversationType.Channel:
      return channelByIdMap.value.get(conv.targetId)?.avatar ?? null
    default:
      return null
  }
}

function getAvatarId(conv: Conversation): string | undefined {
  if (conv.type !== ConversationType.Channel) return undefined
  const channel = channelByIdMap.value.get(conv.targetId)
  return channel?.channelId || channel?.id || conv.targetId
}

function getAvatarColor(conv: Conversation): string | undefined {
  if (conv.type !== ConversationType.Channel) return undefined
  return channelByIdMap.value.get(conv.targetId)?.logoColor || undefined
}

function getAvatarType(conv: Conversation): 'friend' | 'group' | 'channel' {
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return 'group'
  }
  switch (conv.type) {
    case ConversationType.Group:
      return 'group'
    case ConversationType.Channel:
      return 'channel'
    default:
      return 'friend'
  }
}

function formatTime(ts: number): string {
  if (!ts) return ''
  void locale.value
  const d = dayjs(ts)
  const today = dayjs()
  // 对齐旧 im 的 chatTime 展示：今天仅时分，昨天带“昨天+时分”，更早日期保留“月/日+时分”。
  if (d.isSame(today, 'day')) return d.format('HH:mm')
  if (d.isSame(today.subtract(1, 'day'), 'day')) return `${t('昨天')}${d.format('HH:mm')}`
  if (d.isSame(today, 'year')) return d.format('MM/DD HH:mm')
  return d.format('YYYY/MM/DD HH:mm')
}

function getDisplayTime(conv: Conversation): number {
  if (conv.id !== chatStore.currentConversationId) return conv.lastMsgTime
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return conv.lastMsgTime

  const loaded = messageStore.getMessages(conv.id)
  if (loaded.length === 0) return conv.lastMsgTime

  const latest = getLoadedLatestVisibleMessage(conv)
  return latest ? Number(latest.sendTime || 0) : 0
}

/** 与 im 会话列表 `&.online` 绿点一致：单聊好友在线且允许展示时显示 */
function showFriendOnlineDot(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Friend) return false
  if (isFileHelperTargetId(conv.targetId)) return false
  const c = contactStore.getContact(conv.targetId)
  if (!c || c.bfShowOnline === false) return false
  return Boolean(c.online)
}

function translateKnownDigest(raw: string): string {
  return translateGroupNoticeText(raw, t)
}

function isHiddenGroupNoticeDigest(digest: string): boolean {
  const raw = digest.trim().replace(/\s+/g, ' ')
  return raw === HIDDEN_GROUP_NOTICE_TEXT
}

function decodeDigestHtmlEntities(value: string): string {
  if (!value.includes('&')) return value
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

function normalizeDigestPlainText(value: string): string {
  if (!/<\/?[a-z][\s\S]*>/i.test(value)) return decodeDigestHtmlEntities(value)

  // 会话列表只展示摘要：富文本里的链接、样式标签都降级成普通文字，链接高亮仅保留在聊天窗口正文。
  return decodeDigestHtmlEntities(value
    .replace(/<img\b[^>]*>/gi, `[${t('图片')}]`)
    .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, `[${t('视频')}]`)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim())
}

function formatDigestText(digest: string): string {
  const raw = normalizeDigestPlainText(digest.trim())
  if (!raw) return ''
  // 对齐旧 im：msgType 17 的多图正文是 image/video/gif 片段协议，列表摘要固定显示“多图”。
  if (/(?:^|\|\|\||\|\|)(?:image|video|gif):/i.test(raw)) return `[${t('多图')}]`
  const translated = translateKnownDigest(raw)
  if (translated !== raw) return translated
  if (raw === '暂不支持该消息类型') return ''
  if (raw.includes('\uFFFD')) return `[${t('名片')}]`

  if (/^(?:ht_(?:[2-9]|10|[AJQK])|JOCK[12])(?:\|\|.+)?$/i.test(raw)) {
    return `[${t('扑克牌')}]`
  }

  const bracketMatch = raw.match(/^\[(图片|语音|视频|名片|文件|骰子|扑克牌|多图)\]$/)
  if (bracketMatch) return `[${t(bracketMatch[1])}]`

  try {
    const parsed = JSON.parse(raw)
    if (
      parsed
      && typeof parsed === 'object'
      && (parsed.url || parsed.fileUrl || parsed.thumbnailUrl || parsed.thumbUrl)
    ) {
      return `[${t('图片')}]`
    }
  } catch {
    // 非 JSON 文本按原内容显示
  }

  return raw
}

function parseMessageExtra(rawExtra: unknown): Record<string, unknown> | null {
  if (!rawExtra) return null
  if (typeof rawExtra === 'string') {
    try {
      const parsed = JSON.parse(rawExtra)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof rawExtra === 'object' ? rawExtra as Record<string, unknown> : null
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

function getGroupReqUserName(user: unknown, fallbackId?: unknown): string {
  const raw = user && typeof user === 'object' ? user as Record<string, unknown> : null
  const relation = raw?.friendRelation && typeof raw.friendRelation === 'object'
    ? raw.friendRelation as Record<string, unknown>
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

function getGroupNoticeActorRole(extra: Record<string, unknown> | null): number | null {
  if (!extra) return null
  const groupId = getGroupNoticeGroupId(extra)
  const actorId = getGroupNoticeActorId(extra)
  if (!groupId || !actorId) return null
  const role = groupStore.getMembers(groupId).find((member) => member.userId === actorId)?.role
  return Number.isFinite(Number(role)) ? Number(role) : null
}

function getGroupNoticeContextMembers(extra: Record<string, unknown> | null) {
  if (!extra) return []
  const groupId = getGroupNoticeGroupId(extra)
  return groupId ? groupStore.getMembers(groupId) : []
}

function resolveUidNick(id: string, groupId?: string, extra?: Record<string, unknown> | null): string {
  const uid = String(id || '').trim()
  if (!uid) return ''
  if (String(authStore.uid || '') === uid) return t('你')

  const contactName = contactStore.getDisplayName(uid)
  if (contactName && contactName !== uid) {
    // groupNoticeDebug('resolve uid by contact', { uid, groupId: groupId || '', contactName }, 'info')
    return contactName
  }

  if (groupId) {
    const groupMemberName = String(
      groupStore.getMembers(groupId).find((member) => member.userId === uid)?.nickname || '',
    ).trim()
    if (groupMemberName && groupMemberName !== uid) {
      groupNoticeDebug('resolve uid by current group member', { uid, groupId, groupMemberName }, 'info')
      return groupMemberName
    }
  }

  const extraName = getExtraUserNameById(extra ?? null).get(uid) || ''
  if (extraName && extraName !== uid) {
    groupNoticeDebug('resolve uid by message extra', { uid, groupId: groupId || '', extraName }, 'info')
    return extraName
  }

  for (const members of groupStore.memberMap.values()) {
    const name = String(members.find((member) => member.userId === uid)?.nickname || '').trim()
    if (name && name !== uid) {
      groupNoticeDebug('resolve uid by cached memberMap', { uid, groupId: groupId || '', name }, 'info')
      return name
    }
  }
  groupNoticeDebug('resolve uid fallback raw uid', { uid, groupId: groupId || '', contactName }, 'warn')
  return contactName || uid
}

function formatGroupNotificationDigest(content: string, extra: Record<string, unknown> | null): string {
  const groupId = getGroupNoticeGroupId(extra)
  const formattedContent = formatGroupNoticeDisplayText(content, extra, {
    currentUid: authStore.uid,
    actorRole: getGroupNoticeActorRole(extra),
    resolveUidPlaceholder: (id) => resolveUidNick(id, groupId, extra),
  })
  let raw = normalizeGroupNoticeText(formattedContent.trim().replace(/\s+/g, ' '))
  if (extra && raw.includes('邀请') && raw.includes('加入群聊')) {
    raw = raw.replace(PURE_UID_RE, (uid) => resolveUidNick(uid, groupId, extra))
  }
  if (isHiddenGroupNoticeDigest(raw)) return ''
  const translated = translateKnownDigest(raw)
  if (!extra) return translated
  if (/^\S*(?:群主|群员|管理员|（群员）|（管理员）|（群主）)/.test(raw)) return translated

  const type = Number(extra.groupReqType ?? 0)
  const status = Number(extra.groupReqStatus ?? 0)
  if (status === 2) return translated
  const shouldPrefix =
    /^(拒绝加入|同意加入|申请加入|邀请你加入|加入)/.test(raw) ||
    [1, 2, 3, 4, 14, 15].includes(type)
  if (!shouldPrefix) return translated

  const user =
    status === 2
      ? extra.targetUser || extra.fromUser || extra.checkUser
      : extra.fromUser || extra.targetUser || extra.checkUser
  const fallbackId = status === 2 ? extra.receiveUid : extra.sendUid
  const name = getGroupReqUserName(user, fallbackId)
  if (!name || raw.includes(name)) return translated

  return `${name}${translated}`.slice(0, 200)
}

function shouldShowDraft(conv: Conversation): boolean {
  return Boolean(conv.draft) && conv.id !== chatStore.currentConversationId
}

function getMessageDigest(message: Message): string {
  const raw = (message.content || '').trim()
  if (message.msgType === 1) return `[${t('图片')}]`
  if (message.msgType === 9) return `[${t('动画表情')}]`
  if (message.msgType === 2) return `[${t('语音')}]`
  if (message.msgType === 3) return `[${t('视频')}]`
  if (message.msgType === 5) return `[${t('名片')}]`
  if (message.msgType === 7) return `[${t('文件')}]`
  if (message.msgType === 12) return `[${t('骰子')}]`
  if (message.msgType === 18) return `[${t('扑克牌')}]`
  if (isHiddenMessageType(message.msgType)) return ''
  if (message.msgType === 8) {
    const extra = parseGroupNoticeExtraObject(message.extra)
    const isGroupNotification = message.conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`
    const groupId = getGroupNoticeGroupId(extra)
    const formatted = formatGroupNoticeDisplayText(raw, extra, {
      currentUid: authStore.uid,
      actorRole: getGroupNoticeActorRole(extra),
      contextMembers: isGroupNotification ? [] : getGroupNoticeContextMembers(extra),
      resolveUidPlaceholder: (id) => resolveUidNick(id, groupId, extra),
    })
    // groupNoticeDebug('message digest formatted', {
    //   conversationId: message.conversationId,
    //   groupId: groupId || '',
    //   rawContent: raw,
    //   formattedContent: formatted,
    //   isGroupNotification,
    // }, 'info')
    if (isHiddenGroupNoticeDigest(formatted)) return ''
    const normalized = extra && formatted.includes('邀请') && formatted.includes('加入群聊')
      ? formatted.replace(PURE_UID_RE, (uid) => resolveUidNick(uid, groupId, extra))
      : formatted
    const digest = normalized ? formatDigestText(normalized) : ''
    if (isGroupIntroNoticeMessage(message)) {
      if (!digest) return `[${t('群简介')}]`
      if (digest.startsWith(`[${t('群简介')}]`) || digest.startsWith('[群简介]')) return digest
      return `[${t('群简介')}] ${digest}`
    }
    return digest
  }
  return raw ? formatDigestText(raw) : ''
}

function isRejectedGroupInviteNoticeInGroupChat(conversationId: string, message: Message): boolean {
  if (!conversationId.startsWith('1_') || conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) return false
  if (message.msgType !== 8) return false

  const extra = parseGroupNoticeExtraObject(message.extra)
  if (!extra || String(extra.source ?? '') !== 'group-event') return false
  if (Number(extra.groupReqStatus ?? 0) !== 2) return false

  const reqType = Number(extra.groupReqType ?? 0)
  const content = String(message.content || '')
  return [3, 4, 5].includes(reqType) || content.includes('拒绝')
}

function isRejectedGroupInviteDigestInGroupChat(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Group || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  return /拒绝.*加入|拒絕.*加入|rejected joining|recusou entrar|từ chối tham gia/i.test(
    String(conv.lastMsgDigest || ''),
  )
}

function shouldRepairGroupDigestPreview(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Group || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  const digest = String(conv.lastMsgDigest || '').trim()
  return isHiddenGroupNoticeDigest(digest) || isRejectedGroupInviteDigestInGroupChat(conv)
}

function repairGroupDigestPreview(conv: Conversation) {
  if (!shouldRepairGroupDigestPreview(conv)) return
  if (!authStore.uid) {
    groupNoticeDebug('skip repair: uid not ready', {
      conversationId: conv.id,
      name: getName(conv),
      lastMsgDigest: conv.lastMsgDigest || '',
    })
    return
  }
  if (messageStore.getMessages(conv.id).length > 0) return
  if (repairingGroupDigestIds.has(conv.id)) return

  groupNoticeDebug('repair preview: load messages', {
    conversationId: conv.id,
    name: getName(conv),
    lastMsgId: conv.lastMsgId || '',
    lastMsgTime: conv.lastMsgTime || 0,
    lastMsgDigest: conv.lastMsgDigest || '',
  })
  repairingGroupDigestIds.add(conv.id)
  void messageStore.loadMessages(authStore.uid, conv.id).finally(() => {
    groupNoticeDebug('repair preview: load done', {
      conversationId: conv.id,
      loadedCount: messageStore.getMessages(conv.id).length,
      digest: getDigest(conv),
    })
    repairingGroupDigestIds.delete(conv.id)
  })
}

function refreshConversationListPreview(reason = 'manual') {
  const candidates = getPreviewRepairCandidates()
  // groupNoticeDebug('refresh preview', {
  //   reason,
  //   uid: authStore.uid || '',
  //   currentConversationId: chatStore.currentConversationId || '',
  //   count: candidates.length,
  // })
  for (const conv of candidates) {
    const channel = conv.type === ConversationType.Channel ? channelByIdMap.value.get(conv.targetId) : null
    const repairKey = [
      conv.id,
      conv.lastMsgId || '',
      conv.lastMsgTime || 0,
      conv.lastMsgDigest || '',
      channel?.channelName || '',
      channel?.name || '',
    ].join('|')
    if (previewRepairSeenKeys.has(repairKey)) continue
    previewRepairSeenKeys.add(repairKey)
    repairGroupDigestPreview(conv)
    repairChannelName(conv)
  }
}

function getPreviewRepairCandidates(): Conversation[] {
  const seen = new Set<string>()
  const candidates: Conversation[] = []
  for (const conv of [...visibleConversationRows.value, ...displayList.value.slice(0, 12)]) {
    if (seen.has(conv.id)) continue
    seen.add(conv.id)
    candidates.push(conv)
  }
  return candidates
}

function scheduleRefreshConversationListPreview(reason: string) {
  if (previewRefreshTimer !== null) return
  previewRefreshTimer = window.setTimeout(() => {
    previewRefreshTimer = null
    refreshConversationListPreview(reason)
  }, 120)
}

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__refreshConversationListPreview = refreshConversationListPreview
}

function getLoadedLatestVisibleMessage(conv: Conversation): Message | null {
  const loaded = messageStore.getMessages(conv.id)
  if (loaded.length === 0) return null
  return [...loaded].reverse().find((message) => (
    !isHiddenMessageType(message.msgType)
    && !(
      conv.type === ConversationType.Group
      && conv.targetId !== GROUP_NOTIFICATION_TARGET_ID
      && message.msgType === 8
      && String(message.content || '').trim() === HIDDEN_GROUP_NOTICE_TEXT
      && String(parseGroupNoticeExtraObject(message.extra)?.source || '') === 'group-event'
    )
    && !isSelfLeaveGroupSystemMessage(conv.id, message, authStore.uid)
    && !isRejectedGroupInviteNoticeInGroupChat(conv.id, message)
  )) ?? null
}

function getLoadedLatestDigest(conv: Conversation): string {
  // 群通知右侧列表会合并接口返回与本地消息，排序基于 updateTime；
  // 本地消息时间线未必就是右侧顶部那一条，因此这里不要反向覆盖已同步好的会话摘要。
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return ''
  }
  const latest = getLoadedLatestVisibleMessage(conv)
  if (!latest) return ''
  const isCurrentConversation = conv.id === chatStore.currentConversationId
  const summaryNeedsRepair = shouldRepairGroupDigestPreview(conv)
  const latestTime = Number(latest.sendTime || 0)
  const convTime = Number(conv.lastMsgTime || 0)
  const lastMsgId = String(conv.lastMsgId || '')
  const latestMatchesSummary = Boolean(
    lastMsgId
    && (String(latest.id || '') === lastMsgId || String(latest.customMsgId || '') === lastMsgId),
  )

  if (!summaryNeedsRepair && !isCurrentConversation && !latestMatchesSummary && latestTime < convTime) return ''
  const digest = getMessageDigest(latest)
  // groupNoticeDebug('loaded latest digest', {
  //   conversationId: conv.id,
  //   name: getName(conv),
  //   isCurrentConversation,
  //   summaryNeedsRepair,
  //   latestId: latest.id || latest.customMsgId || '',
  //   latestTime,
  //   convTime,
  //   latestMatchesSummary,
  //   rawDigest: conv.lastMsgDigest || '',
  //   digest,
  // }, digest ? 'info' : 'warn')
  return digest
}

function getDigest(conv: Conversation): string {
  if (shouldShowDraft(conv)) return conv.draft || ''
  const loadedDigest = getLoadedLatestDigest(conv)
  if (loadedDigest) return loadedDigest
  if (conv.lastMsgDigest && conv.lastMsgDigest.trim()) {
    if (isHiddenGroupNoticeDigest(conv.lastMsgDigest)) return ''
    if (isRejectedGroupInviteDigestInGroupChat(conv)) return ''
    if (conv.type === ConversationType.Group) {
      const placeholders = Array.from(String(conv.lastMsgDigest).matchAll(GROUP_NOTICE_UID_PLACEHOLDER_RE))
        .flatMap((match) => String(match[1] || '').split(/[,，]/))
        .map((id) => id.trim())
        .filter(Boolean)
      let replacedRaw = replaceGroupNoticeUidPlaceholders(conv.lastMsgDigest, (id) => resolveUidNick(id))
      if (replacedRaw.includes('邀请') && replacedRaw.includes('加入群聊')) {
        replacedRaw = replacedRaw.replace(PURE_UID_RE, (uid) => resolveUidNick(uid))
      }
      const replaced = formatDigestText(replacedRaw)
      // groupNoticeDebug('group conv.lastMsgDigest replaced', {
      //   conversationId: conv.id,
      //   rawDigest: conv.lastMsgDigest,
      //   placeholders,
      //   replacedDigest: replaced,
      // }, 'info')
      return replaced
    }
    return formatDigestText(conv.lastMsgDigest)
  }

  return ''
}

function isGroupIntroDigestText(digest: string): boolean {
  const raw = digest.trim()
  if (!raw) return false
  return raw.includes(`[${t('群简介')}]`) || raw.includes('[群简介]')
}

function isLatestLoadedMessageForConversation(conv: Conversation, message: Message): boolean {
  const lastMsgId = String(conv.lastMsgId || '')
  if (lastMsgId && (String(message.id || '') === lastMsgId || String(message.customMsgId || '') === lastMsgId)) {
    return true
  }
  return Number(message.sendTime || 0) >= Number(conv.lastMsgTime || 0)
}

function isUnreadLoadedGroupIntroMessage(conv: Conversation, message: Message | null): boolean {
  if (!message) return false
  if (conv.id === chatStore.currentConversationId) return false
  return isLatestLoadedMessageForConversation(conv, message)
    && isGroupIntroNoticeMessage(message)
    && Number(message.readStatus || 0) === 0
}

function getUnreadLoadedGroupIntroCount(conv: Conversation): number {
  if (conv.type !== ConversationType.Group || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return 0
  if (conv.id === chatStore.currentConversationId) return 0
  return messageStore.getMessages(conv.id).filter((message) =>
    isGroupIntroNoticeMessage(message)
    && Number(message.readStatus || 0) === 0,
  ).length
}

function shouldShowUnreadGroupIntroTag(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Group || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  const latest = getLoadedLatestVisibleMessage(conv)
  const latestUnreadIntro = isUnreadLoadedGroupIntroMessage(conv, latest)
  if (shouldShowDraft(conv)) {
    if (Number(conv.unreadCount || 0) > 0 || latestUnreadIntro) {
      groupIntroTagTrace(conv, {
        reason: 'draft-visible',
        showTag: false,
        conversationId: conv.id,
        targetId: conv.targetId,
        unreadCount: conv.unreadCount,
        lastMsgId: conv.lastMsgId || '',
        lastMsgDigest: conv.lastMsgDigest || '',
        digest: getDigest(conv),
        latestReadStatus: latest?.readStatus ?? null,
        latestUnreadIntro,
      })
    }
    return false
  }
  if (Number(conv.unreadCount || 0) <= 0) {
    if (latestUnreadIntro) {
      groupIntroTagTrace(conv, {
        reason: 'latest-message-unread',
        showTag: true,
        conversationId: conv.id,
        targetId: conv.targetId,
        unreadCount: conv.unreadCount,
        lastMsgId: conv.lastMsgId || '',
        lastMsgTime: conv.lastMsgTime || 0,
        lastMsgDigest: conv.lastMsgDigest || '',
        digest: getDigest(conv),
        latestId: latest?.id || '',
        latestCustomMsgId: latest?.customMsgId || '',
        latestMsgType: latest?.msgType ?? null,
        latestReadStatus: latest?.readStatus ?? null,
        latestSendTime: latest?.sendTime || 0,
        latestExtra: latest?.extra || null,
        latestUnreadIntro,
      })
      return true
    }
    if (isGroupIntroDigestText(String(conv.lastMsgDigest || ''))) {
      groupIntroTagTrace(conv, {
        reason: 'no-unread',
        showTag: false,
        conversationId: conv.id,
        targetId: conv.targetId,
        unreadCount: conv.unreadCount,
        lastMsgId: conv.lastMsgId || '',
        lastMsgDigest: conv.lastMsgDigest || '',
        digest: getDigest(conv),
        latestReadStatus: latest?.readStatus ?? null,
        latestUnreadIntro,
      })
    }
    return false
  }
  const digest = getDigest(conv)
  const latestMatches = latest ? isLatestLoadedMessageForConversation(conv, latest) : false
  const latestIsIntro = latest ? isGroupIntroNoticeMessage(latest) : false
  const digestIsIntro = isGroupIntroDigestText(digest)
  const showTag = Boolean(latestUnreadIntro || (latest && latestMatches && latestIsIntro) || digestIsIntro)
  groupIntroTagTrace(conv, {
    reason: showTag ? 'matched' : 'not-group-intro',
    showTag,
    conversationId: conv.id,
    targetId: conv.targetId,
    unreadCount: conv.unreadCount,
    lastMsgId: conv.lastMsgId || '',
    lastMsgTime: conv.lastMsgTime || 0,
    lastMsgDigest: conv.lastMsgDigest || '',
    digest,
    latestId: latest?.id || '',
    latestCustomMsgId: latest?.customMsgId || '',
    latestMsgType: latest?.msgType ?? null,
    latestReadStatus: latest?.readStatus ?? null,
    latestSendTime: latest?.sendTime || 0,
    latestExtra: latest?.extra || null,
    latestMatches,
    latestIsIntro,
    latestUnreadIntro,
    digestIsIntro,
  })
  return showTag
}

function getDisplayUnreadCount(conv: Conversation): number {
  const unreadCount = Math.max(0, Number(conv.unreadCount || 0))
  const unreadIntroCount = getUnreadLoadedGroupIntroCount(conv)
  return Math.max(unreadCount, unreadIntroCount)
}

function hasDisplayUnread(conv: Conversation): boolean {
  return getDisplayUnreadCount(conv) > 0
}

function shouldShowUnreadBadge(conv: Conversation): boolean {
  // 对齐旧 im：选中会话后先隐藏当前项红点；真实已读仍由 ChatWindow 异步落库，避免丢失未读分隔线快照。
  return conv.id !== chatStore.currentConversationId && hasDisplayUnread(conv)
}

function hasUidInAtList(rawList: unknown, uid: string): boolean {
  if (!Array.isArray(rawList)) return false
  return rawList.some((item) => {
    if (item && typeof item === 'object') {
      const raw = item as Record<string, unknown>
      const id = String(raw.uid ?? raw.userId ?? raw.user_id ?? raw.id ?? '').trim()
      return id === uid || id === '-1'
    }
    const id = String(item ?? '').trim()
    return id === uid || id === '-1'
  })
}

function normalizeAtName(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function getSelfMentionNames(conv: Conversation): string[] {
  const uid = String(authStore.uid || '').trim()
  const names = [
    authStore.nickname,
    uid,
    groupStore.getMembers(conv.targetId).find((member) => member.userId === uid)?.nickname,
  ]
  return Array.from(new Set(names.map(normalizeAtName).filter(Boolean)))
}

function digestMentionsCurrentUser(conv: Conversation, digest: string): boolean {
  const text = normalizeAtName(digest)
  if (!text) return false
  if (text.includes('@全体成员') || text.includes('@所有人')) return true
  return getSelfMentionNames(conv).some((name) => text.includes(`@${name}`))
}

function messageMentionsCurrentUser(message: Message): boolean {
  const uid = String(authStore.uid || '').trim()
  if (!uid) return false
  const extra = parseMessageExtra(message.extra)
  const content = String(message.content || '')
  return content.includes('@全体成员')
    || content.includes('@所有人')
    || hasUidInAtList(extra?.atUids ?? extra?.at_uids, uid)
    || hasUidInAtList(extra?.atUsers ?? extra?.at_users, uid)
}

function shouldShowAtMe(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Group || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return false
  if (conv.id === chatStore.currentConversationId) return false
  if (shouldShowDraft(conv) || !hasDisplayUnread(conv)) return false
  if (conv.atMe) return true

  const latest = getLoadedLatestVisibleMessage(conv)
  if (
    latest
    && Number(latest.readStatus || 0) === 0
    && isLatestLoadedMessageForConversation(conv, latest)
    && messageMentionsCurrentUser(latest)
  ) {
    return true
  }

  // 兼容旧数据/缓存恢复：会话 atMe 未落下来时，列表摘要里已出现 @ 我的昵称，也要补出旧 im 的红色提醒。
  return digestMentionsCurrentUser(conv, String(conv.lastMsgDigest || '') || getDigest(conv))
    || digestMentionsCurrentUser(conv, getDigest(conv))
}

watch(
  () => [
    String(authStore.uid || ''),
    ...visibleConversationRows.value.map((conv) => `${conv.id}:${conv.lastMsgDigest || ''}`),
    ...visibleConversationRows.value.map((conv) => {
      const channel = conv.type === ConversationType.Channel ? channelByIdMap.value.get(conv.targetId) : null
      return channel ? `${conv.id}:${channel.channelName || ''}:${channel.name || ''}` : ''
    }),
  ],
  () => {
    if (isConversationListDebugEnabled()) {
      // groupNoticeDebug('sidebar data', {
      //   uid: authStore.uid || '',
      //   currentConversationId: chatStore.currentConversationId || '',
      //   items: visibleConversationRows.value.map((conv) => ({
      //     id: conv.id,
      //     type: conv.type,
      //     targetId: conv.targetId,
      //     name: getName(conv),
      //     lastMsgId: conv.lastMsgId,
      //     lastMsgTime: conv.lastMsgTime,
      //     lastMsgDigest: conv.lastMsgDigest,
      //     channelName: conv.type === ConversationType.Channel
      //       ? channelByIdMap.value.get(conv.targetId)?.channelName || channelByIdMap.value.get(conv.targetId)?.name || ''
      //       : '',
      //     loadedCount: messageStore.getMessages(conv.id).length,
      //     shouldRepair: shouldRepairGroupDigestPreview(conv),
      //     shouldRepairChannelName: shouldRepairChannelName(conv),
      //     digest: getDigest(conv),
      //   })),
      // })
    }
    scheduleRefreshConversationListPreview('watch')
  },
  { immediate: true },
)

function getDigestEmojiSrc(token: string): string {
  const fileName = emojiMap[token]
  return fileName ? `/images/emoji/${fileName}.png` : ''
}

function splitDigestSegments(text: string): DigestSegment[] {
  const segments: DigestSegment[] = []
  const tokenPattern = /\[[^\]]+\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  const pushText = (value: string) => {
    if (!value) return
    const last = segments[segments.length - 1]
    if (last?.type === 'text') {
      last.text += value
    } else {
      segments.push({ type: 'text', text: value })
    }
  }

  while ((match = tokenPattern.exec(text)) !== null) {
    const token = match[0]
    const src = getDigestEmojiSrc(token)
    if (!src) continue

    pushText(text.slice(lastIndex, match.index))
    segments.push({ type: 'emoji', text: token, src })
    lastIndex = match.index + token.length
  }

  pushText(text.slice(lastIndex))
  return segments
}

function getDigestSegments(conv: Conversation): DigestSegment[] {
  const segments: DigestSegment[] = []
  if (shouldShowUnreadGroupIntroTag(conv)) {
    segments.push({ type: 'group-intro-unread', text: `[${t('有新群简介')}]` })
  }
  if (conv.senderName && !shouldShowDraft(conv)) {
    segments.push({ type: 'sender', text: `${conv.senderName}:` })
  }
  return segments.concat(splitDigestSegments(getDigest(conv)))
}

function isConversationMuted(conv: Conversation): boolean {
  if (conv.isMuted) return true
  if (conv.type !== ConversationType.Channel) return false
  const channel = channelStore.getChannel(conv.targetId)
    || channelStore.channels.find((item) => item.id === conv.targetId || item.channelId === conv.targetId)
  return Boolean(channel?.isDisturb)
}

function handleSelect(conv: Conversation) {
  if (
    (conv.type === ConversationType.Friend && conv.targetId === CHANNEL_NOTIFICATION_TARGET_ID)
    || (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID)
  ) {
    void openNotificationModuleByConversationId(conv.id)
    return
  }
  if (conv.type === ConversationType.Friend && !isFileHelperTargetId(conv.targetId)) {
    void contactStore.ensureContactDetailLoaded(conv.targetId)
  }
  if (conv.type === ConversationType.Channel) {
    // 不阻塞切会话，后台补齐频道权限，避免点击频道产生明显延迟。
    void channelStore.ensureChannelDetailReady(conv.targetId)
  }
  chatStore.setCurrentConversation(conv.id)
  // 点击会话项后收起右侧信息面板（与 im 交互一致）
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function handleContextMenu(e: MouseEvent, conv: Conversation) {
  e.preventDefault()
  uiStore.showContextMenu(e.clientX, e.clientY, {
    type: 'conversation',
    conversationId: conv.id,
    isPinned: conv.isPinned,
    isMuted: isConversationMuted(conv),
    isArchived: conv.isArchived,
  })
}

function handleListScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

function updateVirtualMetrics() {
  viewportHeight.value = conversationListRef.value?.clientHeight || 0
  archiveEntryHeight.value = archiveEntryVisible.value ? archiveEntryRef.value?.offsetHeight || 0 : 0
}

function observeVirtualMetrics() {
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(updateVirtualMetrics)
  if (conversationListRef.value) resizeObserver.observe(conversationListRef.value)
  if (archiveEntryRef.value) resizeObserver.observe(archiveEntryRef.value)
  updateVirtualMetrics()
}

onMounted(() => {
  void nextTick(observeVirtualMetrics)
})

watch(archiveEntryVisible, () => {
  void nextTick(observeVirtualMetrics)
})

onBeforeUnmount(() => {
  if (previewRefreshTimer !== null) {
    window.clearTimeout(previewRefreshTimer)
    previewRefreshTimer = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div ref="conversationListRef" class="conversation-list" @scroll.passive="handleListScroll">
    <!-- 归档入口（对齐旧 im chats/index.vue .archive） -->
    <div
      v-if="archivedConversations.length > 0 && !uiStore.chatArchiveListShow"
      ref="archiveEntryRef"
      class="archive-entry"
      @click="uiStore.setChatArchiveListShow(true)"
    >
      <img class="archive-entry-icon" :src="archiveIcon" alt="" />
      <div class="archive-entry-main">
        <div class="archive-entry-title-row">
          <span class="archive-entry-title">{{ $t('归档会话') }}</span>
          <span v-if="archiveUnreadTotal > 0" class="archive-entry-badge">
            {{ archiveUnreadTotal > 99 ? '99+' : archiveUnreadTotal }}
          </span>
        </div>
        <div v-if="archivePreviewText" class="archive-entry-preview">{{ archivePreviewText }}</div>
      </div>
    </div>

    <div class="list" :style="virtualListStyle">
      <div
        v-for="conv in visibleConversationRows"
        :key="conv.id"
        :class="['conv-item', {
          active: conv.id === chatStore.currentConversationId,
          pinned: conv.isPinned && !conv.isArchived,
          'friend-online': showFriendOnlineDot(conv),
          'has-unread': shouldShowUnreadBadge(conv),
          'muted-conversation': isConversationMuted(conv),
          'wide-unread': getDisplayUnreadCount(conv) > 99,
        }]"
        @click="handleSelect(conv)"
        @contextmenu="handleContextMenu($event, conv)"
      >
        <div class="conv-avatar-wrap">
          <TextAvatar
            :id="getAvatarId(conv)"
            :name="getDisplayNameForAvatar(conv)"
            :src="getAvatar(conv)"
            :avatar-type="getAvatarType(conv)"
            :color="getAvatarColor(conv)"
            :size="35"
            :rounded="!!getAvatar(conv)"
          />
        </div>

        <div class="conv-body">
          <div class="conv-row-top">
            <h3 class="conv-name">
              <img
                v-if="conv.type === ConversationType.Channel"
                class="channel-feature"
                :src="channelFeatureIcon"
                alt=""
              />
              <span v-if="shouldShowNamePlaceholder(conv)" class="conv-name-skeleton" aria-hidden="true" />
              <span v-else class="conv-name-text">{{ getName(conv) }}</span>
            </h3>
            <span class="conv-time">{{ formatTime(getDisplayTime(conv)) }}</span>
          </div>
          <div class="conv-row-bottom">
            <span v-if="shouldShowAtMe(conv)" class="at-me">[{{ t('有人@我') }}]</span>
            <span v-if="shouldShowDraft(conv)" class="draft-tag">[{{ t('草稿') }}]</span>
            <span class="conv-digest">
              <template v-for="(segment, index) in getDigestSegments(conv)" :key="`${conv.id}-digest-${index}`">
                <img
                  v-if="segment.type === 'emoji'"
                  class="conv-digest-emoji"
                  :src="segment.src"
                  :alt="segment.text"
                />
                <span v-else-if="segment.type === 'group-intro-unread'" class="group-intro-unread-tag">
                  {{ segment.text }}
                </span>
                <span v-else-if="segment.type === 'sender'" class="sender-name">{{ segment.text }}</span>
                <span v-else class="digest-text">{{ segment.text }}</span>
              </template>
            </span>
            <span v-if="isConversationMuted(conv) && !shouldShowUnreadBadge(conv)" class="muted-icon">
              <img :src="mdrIcon" alt="" />
            </span>
          </div>
        </div>

        <div
          v-if="shouldShowUnreadBadge(conv)"
          :class="['unread-meta', { 'muted-unread-meta': isConversationMuted(conv) }]"
        >
          <span v-if="isConversationMuted(conv)" class="muted-icon muted-icon--unread">
            <img :src="mdrIcon" alt="" />
          </span>
          <span :class="['badge', { 'muted-badge': isConversationMuted(conv) }]">
            {{ getDisplayUnreadCount(conv) > 99 ? '99+' : getDisplayUnreadCount(conv) }}
          </span>
        </div>

        <div class="conv-divider" />
      </div>
    </div>

    <div v-if="displayList.length === 0" class="empty-tip">
      {{ uiStore.chatArchiveListShow ? t('暂无归档会话') : t('暂时没有新的聊天会话') }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.conversation-list {
  flex: 1;
  position: relative;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #999 transparent;
}

.list {
  position: relative;
  min-height: 100%;
}

.archive-entry {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 59px;
  padding: 8px 16px 8px 63px;
  box-sizing: border-box;
  background-color: #fcfcfc;
  border-bottom: 1px solid #f1f0f0;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover { background: #f9f9f9; }
}

.archive-entry-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  width: 35px;
  height: 35px;
  transform: translateY(-50%);
  object-fit: cover;
}

.archive-entry-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.archive-entry-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.archive-entry-title {
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}

.archive-entry-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  box-sizing: border-box;
  background: #666;
  border-radius: 20px;
  transform: scale(0.86);
  color: #fff;
  font-size: 12px;
  font-style: normal;
  line-height: 20px;
  text-align: center;
}

.archive-entry-preview {
  font-size: 12px;
  color: #999;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 16px 0 63px;
  height: 59px;
  box-sizing: border-box;
  background-color: #fcfcfc;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover { background: #f9f9f9; }
  &.active { background: #efefef; }
  &.pinned { background: #ede7e7; }
  &.pinned.active { background: #efefef; }

  &.friend-online .conv-avatar-wrap::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    right: -1px;
    bottom: -1px;
    background: #10d561;
    border: 1px solid #fcfcfc;
    box-sizing: border-box;
    z-index: 2;
  }
}

.conv-avatar-wrap {
  position: absolute;
  left: 16px;
  width: 35px;
  height: 35px;
  flex-shrink: 0;
}

.unread-meta {
  position: absolute;
  right: 12px;
  bottom: 11px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 18px;
}

.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  box-sizing: border-box;
  background: #f44e5a;
  border-radius: 18px;
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 18px;
  white-space: nowrap;
}

.conv-item.wide-unread .badge {
  min-width: 34px;
  padding: 0 7px;
}

.muted-badge {
  background: #ccc;
}

.conv-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.conv-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conv-name {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  max-width: 120px;
  line-height: 18px;
}

.conv-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-name-skeleton {
  display: inline-block;
  width: 112px;
  max-width: 100%;
  height: 16px;
  border-radius: 999px;
  background: linear-gradient(90deg, #f2f3f5 25%, #e8ebef 37%, #f2f3f5 63%);
  background-size: 400% 100%;
  animation: conv-name-skeleton-shimmer 1.25s ease infinite;
}

@keyframes conv-name-skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.channel-feature {
  width: 14px;
  height: 16px;
  margin-right: 4px;
  flex-shrink: 0;
}

.conv-time {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
  margin-left: 8px;
}

.conv-row-bottom {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #999;
  line-height: 20px;
  gap: 2px;
}

.conv-item.has-unread .conv-row-bottom {
  padding-right: 38px;
  box-sizing: border-box;
}

.conv-item.muted-conversation .conv-row-bottom {
  padding-right: 16px;
  box-sizing: border-box;
}

.conv-item.muted-conversation.has-unread .conv-row-bottom {
  padding-right: 48px;
  box-sizing: border-box;
}

.conv-item.muted-conversation.has-unread.wide-unread .conv-row-bottom {
  padding-right: 64px;
  box-sizing: border-box;
}

.at-me {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.draft-tag {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.group-intro-unread-tag {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.sender-name {
  color: #999;
  font-size: 12px;
  flex-shrink: 0;
}

.conv-digest {
  color: #999;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.digest-text {
  color: #999;
  font-size: 12px;
}

.conv-digest :deep(a) {
  color: #999;
  text-decoration: none;
  cursor: default;
  pointer-events: none;
}

.conv-digest-emoji {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin: 0 1px;
  vertical-align: -3px;
}

.muted-icon {
  position: absolute;
  right: 34px;
  bottom: 14px;
  z-index: 3;
  display: flex;
  align-items: center;

  img {
    display: block;
    width: 12px;
    height: 12px;
  }
}

.muted-icon--unread {
  position: static;
  right: auto;
  bottom: auto;
  flex-shrink: 0;
}

.conv-divider {
  position: absolute;
  bottom: 0;
  left: 63px;
  right: 0;
  height: 1px;
  background: #f1f0f0;
}

.empty-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  // width: 100%;
  transform: translate(-50%);
  text-align: center;
  color: #333;
  font-weight: 500;
  font-size: 13px;
}
</style>
