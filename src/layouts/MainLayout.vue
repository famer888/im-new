<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore, PROCESS_LOCAL_INIT_SESSION_OPTIONS } from '@/stores/useAuthStore'
import {
  useChatStore,
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  isFileHelperTargetId,
  isOfficialAccountTargetId,
  type Conversation,
} from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useUIStore, type ForwardDraftItem } from '@/stores/useUIStore'
import { useNetworkStore } from '@/stores/useNetworkStore'

import HomeTop from '@/modules/chat/components/HomeTop.vue'
import HomeSidebar from '@/modules/chat/components/HomeSidebar.vue'
import ChatWindow from '@/modules/chat/views/ChatWindow.vue'
import FriendDetail from '@/modules/contacts/components/FriendDetail.vue'
import FriendExamine from '@/modules/contacts/components/FriendExamine.vue'
import AddContactPreview from '@/modules/contacts/components/AddContactPreview.vue'
import AddGroupPreview from '@/modules/contacts/components/AddGroupPreview.vue'
import GroupDetail from '@/modules/groups/views/GroupDetail.vue'
import GroupInvitation from '@/modules/groups/views/GroupInvitation.vue'
import ChannelNotice from '@/modules/channels/views/ChannelNotice.vue'
import ChannelDetail from '@/modules/channels/views/ChannelDetail.vue'
import RightPanel from '@/modules/chat/components/panels/RightPanel.vue'

import SettingsDialog from '@/modules/settings/views/SettingsDialog.vue'
import PostUploadDialog from '@/modules/settings/components/PostUploadDialog.vue'
import AddContactDialog from '@/modules/contacts/components/AddContactDialog.vue'
import ForwardSelectDialog from '@/modules/chat/components/ForwardSelectDialog.vue'
import FileImport from '@/modules/auth/components/FileImport.vue'
import CreateGroupDialog from '@/modules/groups/components/CreateGroupDialog.vue'
import InviteFriendDialog from '@/modules/groups/components/InviteFriendDialog.vue'
import AddChannelDialog from '@/modules/channels/components/AddChannelDialog.vue'
import GroupQRCode from '@/modules/chat/components/panels/GroupQRCode.vue'
import UpVersionDialog from '@/components/UpVersionDialog.vue'
import MemberInfoDialog from '@/components/MemberInfoDialog.vue'
import ImageOverwriteDialog from '@/components/ImageOverwriteDialog.vue'
import Toast from '@/components/Toast.vue'

import ContextMenu from '@/components/ContextMenu.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import InitLoadingScreen from '@/components/InitLoadingScreen.vue'
import type { MenuItem } from '@/components/ContextMenu.vue'
import { ConversationType, MessageType } from '@/types'
import { useMessageStore } from '@/stores/useMessageStore'
import { eventBus } from '@/utils/eventBus'
import { writeClipboardText } from '@/utils/clipboard'
import { ensureChannelRelKey, ensureFriendRelKey, ensureGroupRelKey, ensureOwnKeyPair, normalizeResolvedFileKey } from '@/utils/e2ee'
import { getOssDownloadCandidates } from '@/utils/ossDownload'
import { isLocalLikePath, toDisplaySrc, toFsPath } from '@/utils/resourcePath'
import { runLegacyDesktopMigration, runLegacyDesktopMigrationWithRetry } from '@/utils/legacyMigration'
import { refreshAfterLegacyImport } from '@/utils/legacyImportRefresh'
import { isCurrentChannelContentSaveRestricted } from '@/utils/channelContentLimit'

import { API_CONFIG } from '@/api/config'
import emptyBrandImg from '@/assets/images/common/defalut-icon.png'
import menuCopy from '@/assets/images/menu/copy.png'
import menuDelete from '@/assets/images/menu/delete.png'
import menuSelect from '@/assets/images/menu/select.png'
import menuReply from '@/assets/images/menu/forward.png'
import menuForward from '@/assets/images/menu/share.png'
import menuSave from '@/assets/images/menu/save.png'
import menuOpenDir from '@/assets/images/menu/open_dir.png'
import menuMore from '@/assets/images/menu/more.png'
import hasReadUrl from '@/assets/images/message/has-read.png'
import hasReceiveUrl from '@/assets/images/message/has-resive.png'
import { chatPageDateformat } from '@/utils/chatMessageDate'
import { exportBase64ImgToLocal, userSelectPngSavePathWithOverwrite } from '@/utils/fileTools'
import { formatTimeStamp } from '@/utils/formatTimeStamp'

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const settingStore = useSettingStore()
const router = useRouter()
const { locale: appLocale, t } = useI18n()
const uiStore = useUIStore()
const networkStore = useNetworkStore()
const messageStore = useMessageStore()
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const LOGOUT_CLEARED_HISTORY_FLAG_PREFIX = 'logout-cleared-history:'
const ACTIVE_GROUP_MEMBER_SYNC_INTERVAL_MS = 5000
const ACTIVE_GROUP_MEMBER_SYNC_MIN_GAP_MS = 2500
const CHAT_LIST_NAME_READY_TIMEOUT_MS = 1800
const INIT_OPTIONAL_STEP_TIMEOUT_MS = 8000
const LEGACY_CHANNEL_NOTIFICATION_TARGET_ID = '9902'
const imageOverwriteVisible = ref(false)
const imageOverwriteFileName = ref('')
const imageOverwriteDirectoryName = ref('')
const deleteConversationConfirmVisible = ref(false)
const pendingDeleteConversationId = ref('')

const isInitialized = ref(false)
const initText = ref('')
const firstInitProgressVisible = ref(false)
const initFriendProgress = ref(0)
const initChatProgress = ref(0)
const resettingInitData = ref(false)
const initReloadVisible = ref(false)
let initReloadTimer: number | null = null
let activeGroupMemberSyncTimer: number | null = null
let activeGroupMemberSyncInFlight = false
let lastActiveGroupMemberSyncAt = 0
let imageOverwriteResolver: ((value: boolean) => void) | null = null
const GROUP_NOTICE_UID_PLACEHOLDER_RE = /#\{uids:([^}]+)\}/
const LEGACY_TEXT_COPY_MESSAGE_TYPES = new Set<number>([
  MessageType.Text,
  MessageType.Html2,
  MessageType.System,
  MessageType.Notice,
  50,
  51,
  52,
])
let initTraceStartedAt = 0
let initHeartbeatTimer: number | null = null
let currentInitStep = ''
let currentInitStepStartedAt = 0
let currentInitPhase = 'idle'

function setInitText(text: string) {
  const previousText = initText.value
  initText.value = text
  initDiag('init text changed', {
    from: previousText,
    to: text,
  })
}

function initDiag(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'warn') {
  void message
  void data
  void level
}

function setCurrentInitStep(label: string, phase: string) {
  currentInitStep = label
  currentInitPhase = phase
  currentInitStepStartedAt = Date.now()
  if (initReloadVisible.value) {
    initReloadVisible.value = false
    initDiag('reload button hidden: bootstrap progressed', {
      nextStep: label,
      nextPhase: phase,
    })
  }
}

function clearCurrentInitStep(label: string) {
  if (currentInitStep !== label) return
  currentInitPhase = 'idle'
  currentInitStep = ''
  currentInitStepStartedAt = 0
}

function startInitHeartbeat() {
  stopInitHeartbeat()
  initHeartbeatTimer = window.setInterval(() => {
    if (isInitialized.value) return
    initDiag('heartbeat: init still pending', {
      contactCount: contactStore.contacts.length,
      groupCount: groupStore.groups.length,
      channelCount: channelStore.channels.length,
      conversationCount: chatStore.conversations.length,
    }, 'warn')
  }, 5000)
}

function stopInitHeartbeat() {
  if (initHeartbeatTimer === null) return
  window.clearInterval(initHeartbeatTimer)
  initHeartbeatTimer = null
}

async function traceInitStep<T>(label: string, task: () => Promise<T>, options: { rethrow?: boolean } = {}): Promise<T | null> {
  const startedAt = Date.now()
  let settled = false
  setCurrentInitStep(label, 'blocking')
  const slowTimer = window.setTimeout(() => {
    if (!settled) {
      initDiag(`${label} still pending`, {
        durationMs: Date.now() - startedAt,
      }, 'warn')
    }
  }, 3000)
  initDiag(`${label} start`)
  try {
    const result = await task()
    settled = true
    initDiag(`${label} done`, { durationMs: Date.now() - startedAt })
    return result
  } catch (error) {
    settled = true
    initDiag(`${label} failed`, {
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    }, 'error')
    if (options.rethrow) throw error
    return null
  } finally {
    window.clearTimeout(slowTimer)
    clearCurrentInitStep(label)
  }
}

async function traceOptionalInitStep<T>(label: string, task: () => Promise<T>, timeoutMs = INIT_OPTIONAL_STEP_TIMEOUT_MS): Promise<T | null> {
  const startedAt = Date.now()
  let settled = false
  let timedOut = false
  setCurrentInitStep(label, 'optional')
  const slowTimer = window.setTimeout(() => {
    if (!settled) {
      initDiag(`${label} still pending`, {
        optional: true,
        durationMs: Date.now() - startedAt,
      }, 'warn')
    }
  }, 3000)
  initDiag(`${label} start`, { optional: true, timeoutMs })
  const taskPromise = task()
    .then((result) => {
      settled = true
      initDiag(`${label} done`, {
        optional: true,
        timedOut,
        durationMs: Date.now() - startedAt,
      })
      return result
    })
    .catch((error) => {
      settled = true
      initDiag(`${label} failed`, {
        optional: true,
        timedOut,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      }, 'error')
      return null
    })

  const timeoutPromise = new Promise<null>((resolve) => {
    window.setTimeout(() => {
      if (!settled) {
        timedOut = true
        initDiag(`${label} timeout, continue bootstrap`, {
          optional: true,
          durationMs: Date.now() - startedAt,
          timeoutMs,
        }, 'warn')
      }
      resolve(null)
    }, timeoutMs)
  })

  // 加密检测/WS 连接是启动增强任务，线上域名异常时不能无限挡住进入主页。
  return Promise.race([taskPromise, timeoutPromise]).finally(() => {
    window.clearTimeout(slowTimer)
    clearCurrentInitStep(label)
  })
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

async function preloadConversationSummariesNeedingNames(uid: string) {
  if (!uid || !(window as any).__TAURI_INTERNALS__) return

  const targets = chatStore.conversations
    .filter((conv) => (
      conv.type === ConversationType.Group
      && conv.targetId !== GROUP_NOTIFICATION_TARGET_ID
      && GROUP_NOTICE_UID_PLACEHOLDER_RE.test(String(conv.lastMsgDigest || ''))
    ))
    .sort((a, b) => Number(b.lastMsgTime || 0) - Number(a.lastMsgTime || 0))
    .slice(0, 8)

  if (targets.length === 0) return

  await Promise.allSettled(
    targets.map((conv) => messageStore.loadMessages(uid, conv.id)),
  )
}

function terminalDebugLog(
  scope: string,
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'warn',
) {
  void scope
  void message
  void data
  void level
}

function copyDebugPreview(value: unknown, limit = 160): string {
  const text = String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit)}...(len=${text.length})` : text
}

function copyDebugLog(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'warn') {
  if (!import.meta.env.DEV) return
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug
  logFn(`[copy-debug] ${message}`, data)
  if (!(window as any).__TAURI_INTERNALS__) return
  void import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level,
        message: `[copy-debug] ${message}`,
        data,
      },
    }))
    .catch(() => {})
}

function getCopyDebugMessageData(data: Record<string, unknown>): Record<string, unknown> {
  const content = String(data.content || '')
  const selectedText = String(data.selectedText || '')
  const extraText = typeof data.extra === 'string' ? data.extra : JSON.stringify(data.extra || {})
  const msgType = Number(data.msgType ?? 0)
  const readBurn = isReadBurnMessage(data)
  return {
    currentConversationId: chatStore.currentConversationId,
    currentConversationType: chatStore.currentConversation?.type ?? null,
    currentTargetId: chatStore.currentConversation?.targetId ?? '',
    dataConversationType: data.conversationType ?? null,
    messageId: data.messageId || data.msgId || data.id || '',
    customMsgId: data.customMsgId || '',
    senderId: data.senderId || '',
    senderName: data.senderName || '',
    isSelf: data.isSelf ?? null,
    avatarMenu: data.avatarMenu ?? false,
    msgTypeRaw: data.msgType,
    msgTypeNumber: msgType,
    readStatus: data.readStatus ?? null,
    deleteSeconds: data.deleteSeconds ?? 0,
    readBurn,
    isGroupIntroNotice: data.isGroupIntroNotice ?? false,
    contentLength: content.length,
    contentHead: copyDebugPreview(content),
    contentTail: content.length > 160 ? content.slice(-160) : '',
    selectedTextLength: selectedText.length,
    selectedTextHead: copyDebugPreview(selectedText),
    selectedTextTail: selectedText.length > 160 ? selectedText.slice(-160) : '',
    extraType: typeof data.extra,
    extraHead: copyDebugPreview(extraText),
    imageSrcHead: copyDebugPreview(data.imageSrc),
    imagePath: data.imagePath || '',
    supportsTextCopy: messageSupportsCopy(data.msgType),
    supportsImageCopy: messageSupportsImageCopy(data),
    supportsVideoCopy: messageSupportsVideoCopy(data),
  }
}

function pathBaseName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || filePath
}

function pathDirectoryName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean)
  return segments.length > 1 ? segments[segments.length - 2] : pathBaseName(filePath)
}

function resolveImageOverwrite(result: boolean) {
  imageOverwriteVisible.value = false
  const resolver = imageOverwriteResolver
  imageOverwriteResolver = null
  resolver?.(result)
}

function promptImageOverwrite(filePath: string): Promise<boolean> {
  if (imageOverwriteResolver) {
    imageOverwriteResolver(false)
    imageOverwriteResolver = null
  }

  imageOverwriteFileName.value = pathBaseName(filePath)
  imageOverwriteDirectoryName.value = pathDirectoryName(filePath)
  imageOverwriteVisible.value = true

  return new Promise((resolve) => {
    imageOverwriteResolver = resolve
  })
}

function openDeleteConversationConfirm(conversationId: string) {
  pendingDeleteConversationId.value = conversationId
  deleteConversationConfirmVisible.value = true
}

function cancelDeleteConversation() {
  pendingDeleteConversationId.value = ''
}

async function confirmDeleteConversation() {
  const conversationId = pendingDeleteConversationId.value
  pendingDeleteConversationId.value = ''
  if (!conversationId) return

  try {
    await chatStore.deleteConversation(authStore.uid, conversationId)
    messageStore.clearConversationMessages(conversationId)
    if (chatStore.currentConversationId === null) {
      uiStore.setDetailView('none')
      uiStore.setRightPanel('none')
    }
  } catch (error) {
    showToast((error as Error)?.message || t('操作失败'), 'error')
  }
}

function startInitReloadTimer() {
  clearInitReloadTimer()
  initReloadVisible.value = false

  // 对齐老 im 初始化页：若初始化长时间卡住，显式给用户一个“重新加载”的兜底操作。
  initReloadTimer = window.setTimeout(() => {
    if (!isInitialized.value) {
      initReloadVisible.value = true
      initDiag('reload button shown: init still pending after 15000ms', {
        initText: initText.value,
      }, 'warn')
    }
  }, 15000)
}

function clearInitReloadTimer() {
  if (initReloadTimer === null) return
  window.clearTimeout(initReloadTimer)
  initReloadTimer = null
}

function reloadInitPage() {
  window.location.reload()
}

function setFirstInitProgress(friend: number, chat: number) {
  initFriendProgress.value = Math.min(100, Math.max(0, friend))
  initChatProgress.value = Math.min(100, Math.max(0, chat))
  initDiag('first init progress changed', {
    nextFriendProgress: initFriendProgress.value,
    nextChatProgress: initChatProgress.value,
  })
}

function syncRemoteConversationMuteStatesFromRelations() {
  const uid = String(authStore.uid || '').trim()
  if (!uid) return

  const states = [
    ...contactStore.contacts
      .filter((contact) => contact.bfDisturb !== undefined)
      .map((contact) => ({
        type: ConversationType.Friend,
        targetId: contact.id,
        muted: Boolean(contact.bfDisturb),
      })),
    ...groupStore.groups
      .filter((group) => group.bfDisturb !== undefined)
      .map((group) => ({
        type: ConversationType.Group,
        targetId: group.id,
        muted: Boolean(group.bfDisturb),
      })),
  ]

  if (states.length === 0) return
  // 远端好友/群免打扰是跨端权威状态；应用到会话后，App 和 PC 的开关才能互相校准。
  void chatStore.applyRemoteMuteStates(uid, states)
}

function refreshInitializedAccountData(uid: string) {
  if (!uid) return Promise.resolve([])
  return Promise.allSettled([
    traceInitStep('background refresh contacts', () => contactStore.loadContacts(uid, { refreshRemote: true })),
    traceInitStep('background refresh groups', () => groupStore.loadGroups(uid, { forceApi: true })),
    traceInitStep('background refresh channels', () => channelStore.loadChannels(uid)),
    traceInitStep('background refresh settings', () => settingStore.loadSettings()),
  ]).then((results) => {
    syncRemoteConversationMuteStatesFromRelations()
    return results
  })
}

watch(
  () => [
    String(authStore.uid || ''),
    contactStore.contacts.map((contact) => `${contact.id}:${contact.bfDisturb}`).join('|'),
    groupStore.groups.map((group) => `${group.id}:${group.bfDisturb}`).join('|'),
  ],
  () => syncRemoteConversationMuteStatesFromRelations(),
)

async function releaseChatListNameGate(refreshPromise: Promise<unknown> | null) {
  if (!refreshPromise) {
    uiStore.setChatListNamesReady(true)
    return
  }

  let timeoutId: number | null = null
  let timedOut = false

  try {
    await Promise.race([
      refreshPromise,
      new Promise<void>((resolve) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true
          resolve()
        }, CHAT_LIST_NAME_READY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
    if (timedOut) {
      // 名称预热超时只影响展示兜底，不再写控制台诊断日志。
    }
    uiStore.setChatListNamesReady(true)
  }
}

function isChannelNotificationConversation(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Friend) return false
  const targetId = String(conv.targetId || '')
  const conversationId = String(conv.id || '')
  // 兼容旧 im 的频道通知伪会话：新 ID 是 channelNotice，历史数据里可能仍是 9902。
  return targetId === CHANNEL_NOTIFICATION_TARGET_ID
    || targetId === LEGACY_CHANNEL_NOTIFICATION_TARGET_ID
    || conversationId === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`
    || conversationId === `0_${LEGACY_CHANNEL_NOTIFICATION_TARGET_ID}`
}

function hasConversationListActivity(conv: Conversation): boolean {
  if (String(conv.draft || '').trim()) return true
  if (String(conv.lastMsgId || '').trim()) return true
  if (Number(conv.lastMsgTime || 0) > 0) return true
  if (Number(conv.unreadCount || 0) > 0) return true
  // 过滤零宽字符，避免只有脏占位摘要的空会话被当成真实历史。
  return String(conv.lastMsgDigest || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length > 0
}

function canRetainMissingRelationConversation(conv: Conversation): boolean {
  // 普通好友/群会话的 targetId 应为数字；伪会话已在上层单独放行，避免脏 ID 借历史摘要长期留存。
  return /^\d+$/.test(String(conv.targetId || '').trim()) && hasConversationListActivity(conv)
}

function isConversationInCurrentRelations(conv: Conversation): boolean {
  if (isFileHelperTargetId(conv.targetId)) return true
  if (conv.type === ConversationType.Friend) {
    if (isChannelNotificationConversation(conv)) return true
    // 对齐旧 im：官方号 9900 不是普通通讯录联系人，也不能被初始化清理掉。
    if (isOfficialAccountTargetId(conv.targetId)) return true
    // 桌面端启动时先显示本地会话；远端通讯录仍在刷新时不能把会话当作未知项提前删掉。
    return Boolean(contactStore.getContact(conv.targetId))
      || contactStore.loading
      || canRetainMissingRelationConversation(conv)
  }
  if (conv.type === ConversationType.Group) {
    if (conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return true
    return Boolean(groupStore.getGroup(conv.targetId))
      || groupStore.loading
      || canRetainMissingRelationConversation(conv)
  }
  if (conv.type === ConversationType.Channel) {
    // 频道会话来源是本地消息/会话表；退出、解散或被移除会走显式删除，不能因频道列表短暂未命中而清掉左侧列表。
    return true
  }
  return false
}

function pruneUnknownConversations() {
  // 通讯录/群列表仍在刷新时不要裁剪会话，避免双开或冷启动时第二个账号列表被清空。
  if (contactStore.loading || groupStore.loading) return
  const validConversations = chatStore.conversations.filter(isConversationInCurrentRelations)
  if (validConversations.length === chatStore.conversations.length) return

  chatStore.conversations = validConversations
  if (
    chatStore.currentConversationId
    && !validConversations.some((conv) => conv.id === chatStore.currentConversationId)
  ) {
    chatStore.currentConversationId = null
    uiStore.setDetailView('none')
    uiStore.setRightPanel('none')
  }
}

function ensureChannelPlaceholdersFromConversations() {
  const channelConversations = chatStore.conversations
    .filter((conv) => conv.type === ConversationType.Channel && /^\d+$/.test(String(conv.targetId || '')))

  if (channelConversations.length === 0) return

  let addedCount = 0
  for (const conv of channelConversations) {
    if (channelStore.getChannel(conv.targetId)) continue
    channelStore.patchChannel(conv.targetId, {
      id: conv.targetId,
      channelId: conv.targetId,
      name: conv.targetId,
      channelName: conv.targetId,
      updatedAt: conv.updatedAt || conv.lastMsgTime || Date.now(),
    })
    addedCount += 1
  }

  if (addedCount > 0) {
    initDiag('channel placeholders restored from conversations', {
      addedCount,
      channelConversationCount: channelConversations.length,
      channelCount: channelStore.channels.length,
      sampleIds: channelConversations.slice(0, 5).map((item) => item.targetId),
    })
    void channelStore.hydratePlaceholderChannels(authStore.uid)
  }
}

function seedConversationsFromRelations(skipBootstrapAfterLogoutClear: boolean) {
  // 对齐旧 im：本地没有真实会话时，才用通讯录关系补一个可点击的最近列表；已有缓存会话时不重建。
  const hasRealConversations = chatStore.conversations.some(
    (c) => !isFileHelperTargetId(c.targetId) && isConversationInCurrentRelations(c),
  )
  if (hasRealConversations || skipBootstrapAfterLogoutClear) return

  initDiag('seed conversations from relations start', {
    contactCount: contactStore.contacts.length,
    groupCount: groupStore.groups.length,
    channelCount: channelStore.channels.length,
  })
  for (const contact of contactStore.contacts) {
    if (contact.id && contact.status > 0) {
      chatStore.ensureConversation(0, contact.id)
    }
  }
  for (const group of groupStore.groups) {
    if (group.id) {
      chatStore.ensureConversation(1, group.id)
    }
  }
  for (const channel of channelStore.channels) {
    if (channel.id) {
      chatStore.ensureConversation(2, channel.id)
    }
  }
  initDiag('seed conversations from relations done', {
    conversationCount: chatStore.conversations.length,
  })
}

function finalizeBackgroundRelationRefresh(skipBootstrapAfterLogoutClear: boolean) {
  initDiag('background refresh final prune start')
  ensureChannelPlaceholdersFromConversations()
  pruneUnknownConversations()
  seedConversationsFromRelations(skipBootstrapAfterLogoutClear)
  initDiag('background refresh final prune done', {
    conversationCount: chatStore.conversations.length,
    channelCount: channelStore.channels.length,
  })
}

onMounted(async () => {
  initTraceStartedAt = Date.now()
  initDiag('bootstrap mounted', {
    isTauri: !!(window as any).__TAURI_INTERNALS__,
  })
  startInitReloadTimer()
  startInitHeartbeat()
  window.addEventListener('focus', handleWindowFocusRefreshGroupMembers)
  document.addEventListener('visibilitychange', handleVisibilityRefreshGroupMembers)
  uiStore.setChatListNamesReady(true)

  try {
    setInitText(t('加载中'))
    await traceInitStep(
      'auth initSession',
      () => authStore.initSession(PROCESS_LOCAL_INIT_SESSION_OPTIONS),
      { rethrow: true },
    )
    if (!authStore.uid) {
      initDiag('no uid after initSession, show login')
      uiStore.setChatListNamesReady(true)
      isInitialized.value = true
      clearInitReloadTimer()
      stopInitHeartbeat()
      if ((window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('show_login_window')
      } else {
        await router.replace('/login')
      }
      return
    }

    if (authStore.uid) {
      let chatListNameWarmupPromise: Promise<unknown> | null = null
      firstInitProgressVisible.value = !authStore.isAccountInitialized(authStore.uid)
      initDiag('account init state resolved', {
        isAccountInitialized: !firstInitProgressVisible.value,
      })
      setFirstInitProgress(0, 0)

      if ((window as any).__TAURI_INTERNALS__) {
        const earlyUid = String(authStore.uid || '').trim()
        const earlySessionId = String(authStore.session?.sessionId || '').trim()

        // 对齐旧 ocs：加密检测（自身密钥）必须在连 WS 之前完成。
        // 否则 early WS 收包时 Rust 无私钥 → 落库「等待密钥同步」，发送也会红感叹号。
        if (earlyUid) {
          setInitText(t('加密检测'))
          try {
            await traceInitStep('ensure own key pair before ws', () => ensureOwnKeyPair(earlyUid), {
              rethrow: false,
            })
          } catch (err) {
            console.warn('[e2ee] ensureOwnKeyPair before early ws failed:', err)
          }
        }

        // 自身密钥就绪后再连 WS；迁移仍可并行，避免同步期间完全收不到新消息。
        const earlyWsConnectPromise = (async () => {
          if (!earlyUid || !earlySessionId) return
          try {
            await messageStore.ensureWsConnected()
            initDiag('early ws connect ready during legacy migration')
          } catch (err) {
            console.warn('[ws] early connect during migration failed:', err)
          }
        })()

        const migrationResult = await traceInitStep(
          'legacy desktop migration',
          () => runLegacyDesktopMigration(authStore.uid),
        )
        if (migrationResult?.migrated) {
          // 提前连上的 WS 可能已把实时消息写入内存；整表清缓存会把它们抹掉，
          // 启动阶段尚未打开具体会话时只依赖后续 loadConversations 读库即可。
          // 后台补导仍走 refreshAfterLegacyImport 的定点清缓存。
          initDiag('legacy desktop migration imported history', {
            importedCount: migrationResult.importedCount,
            reason: migrationResult.reason,
            complete: migrationResult.complete,
          })
        }
        // IndexedDB 半导入也要继续后台轮询等 abc 补全；只有 abc 完整导入或已标记完成才停。
        const migrationComplete =
          migrationResult?.complete === true ||
          migrationResult?.reason === 'already migrated' ||
          /temp cache/i.test(migrationResult?.reason || '')
        if (!migrationComplete) {
          void runLegacyDesktopMigrationWithRetry(authStore.uid, {
            onImported: async (result) => {
              initDiag('legacy desktop migration late import', {
                importedCount: result.importedCount,
                reason: result.reason,
                complete: result.complete,
              })
              try {
                await refreshAfterLegacyImport({
                  currentConversationId: chatStore.currentConversationId,
                  clearMessageCaches: () => messageStore.clearAllMessageCaches(),
                  reloadConversations: () => chatStore.loadConversations(authStore.uid),
                  reloadMessages: (conversationId) => (
                    messageStore.loadMessages(authStore.uid, conversationId, true)
                  ),
                })
              } catch (err) {
                console.warn('[legacy-migration] reload after late import failed', err)
              }
            },
          })
        }
        // 迁移结束后若提前连接仍在进行，继续等；后面 ensureWsConnected 会复用同一任务。
        void earlyWsConnectPromise
      }

      // 头像/昵称刷新只是启动增强信息，线上 /user/userInfo 慢时不能阻塞本地数据加载和进入主页。
      void traceOptionalInitStep('refresh profile', () => authStore.refreshProfile(), 3000)

      const skipBootstrapAfterLogoutClear = Boolean(
        localStorage.getItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${authStore.uid}`),
      )
      setInitText(t('数据载入'))
      if (firstInitProgressVisible.value) {
        if ((window as any).__TAURI_INTERNALS__) {
          uiStore.setChatListNamesReady(false)
          // 首次进入桌面端也先走本地缓存，避免联系人/群/频道远端全量接口慢时挡住会话列表。
          await Promise.all([
            traceInitStep('first desktop cache conversations', () => chatStore.loadConversations(authStore.uid), { rethrow: true }),
            traceInitStep('first desktop cache contacts', () => contactStore.loadContacts(authStore.uid, { fallbackToApi: false, refreshRemote: false }), { rethrow: true }),
            traceInitStep('first desktop cache groups', () => groupStore.loadGroups(authStore.uid, { fallbackToApi: false }), { rethrow: true }),
            traceInitStep('first desktop cache channels', () => channelStore.loadChannels(authStore.uid, { refreshRemote: false }), { rethrow: true }),
            traceInitStep('first desktop cache settings', () => settingStore.loadSettings({ syncRemote: false }), { rethrow: true }),
          ])
          setFirstInitProgress(100, 100)
          chatListNameWarmupPromise = refreshInitializedAccountData(authStore.uid)
            .finally(() => finalizeBackgroundRelationRefresh(skipBootstrapAfterLogoutClear))
          initDiag('first desktop cache loaded, background refresh started')
        } else {
          uiStore.setChatListNamesReady(true)
          await traceInitStep('first init contacts', () => contactStore.loadContacts(authStore.uid), { rethrow: true })
          setFirstInitProgress(100, 0)

          await Promise.all([
            traceInitStep('first init groups', () => groupStore.loadGroups(authStore.uid), { rethrow: true }),
            traceInitStep('first init channels', () => channelStore.loadChannels(authStore.uid), { rethrow: true }),
            traceInitStep('first init settings', () => settingStore.loadSettings(), { rethrow: true }),
          ])

          await traceInitStep('first init conversations', () => chatStore.loadConversations(authStore.uid), { rethrow: true })
          setFirstInitProgress(100, 100)
          initDiag('first init progress reached 100, post steps start')
        }
      } else if ((window as any).__TAURI_INTERNALS__) {
        // 所有 Tauri 桌面端（macOS/Windows）统一走这里：
        // 已初始化账号优先读本地；联系人名称对齐旧 im，加载后立即后台强刷远端通讯录。
        uiStore.setChatListNamesReady(false)
        await Promise.all([
          traceInitStep('desktop cache conversations', () => chatStore.loadConversations(authStore.uid), { rethrow: true }),
          traceInitStep('desktop cache contacts', () => contactStore.loadContacts(authStore.uid, { fallbackToApi: false, refreshRemote: false }), { rethrow: true }),
          traceInitStep('desktop cache groups', () => groupStore.loadGroups(authStore.uid, { fallbackToApi: false }), { rethrow: true }),
          traceInitStep('desktop cache channels', () => channelStore.loadChannels(authStore.uid, { refreshRemote: false }), { rethrow: true }),
          traceInitStep('desktop cache settings', () => settingStore.loadSettings({ syncRemote: false }), { rethrow: true }),
        ])
        chatListNameWarmupPromise = refreshInitializedAccountData(authStore.uid)
          .finally(() => finalizeBackgroundRelationRefresh(skipBootstrapAfterLogoutClear))
      } else {
        uiStore.setChatListNamesReady(true)
        await Promise.all([
          traceInitStep('web conversations', () => chatStore.loadConversations(authStore.uid), { rethrow: true }),
          traceInitStep('web contacts', () => contactStore.loadContacts(authStore.uid), { rethrow: true }),
          traceInitStep('web groups', () => groupStore.loadGroups(authStore.uid), { rethrow: true }),
          traceInitStep('web channels', () => channelStore.loadChannels(authStore.uid), { rethrow: true }),
          traceInitStep('web settings', () => settingStore.loadSettings(), { rethrow: true }),
        ])
      }
      initDiag('primary data load done', {
        contactCount: contactStore.contacts.length,
        groupCount: groupStore.groups.length,
        channelCount: channelStore.channels.length,
        conversationCount: chatStore.conversations.length,
      })
      syncRemoteConversationMuteStatesFromRelations()
      setInitText(t('数据已载入'))
      appLocale.value = settingStore.settings.language
      void preloadConversationSummariesNeedingNames(authStore.uid)
      initDiag('prune conversations start', { beforeCount: chatStore.conversations.length })
      ensureChannelPlaceholdersFromConversations()
      pruneUnknownConversations()
      initDiag('prune conversations done', { afterCount: chatStore.conversations.length })

      seedConversationsFromRelations(skipBootstrapAfterLogoutClear)
      try {
        if ((window as any).__TAURI_INTERNALS__) {
          const { invoke } = await import('@tauri-apps/api/core')
          const uid = String(authStore.uid || '').trim()
          if (uid) {
            try {
              setInitText(t('加密检测'))

              // 幂等兜底：early 路径已注入则很快返回；失败也不永久挡主界面。
              await traceOptionalInitStep('ensure own key pair', () => ensureOwnKeyPair(uid))
            } catch {
              // key prewarm best effort; do not block WS connect forever
            }
          }
          const sessionId = String(authStore.session?.sessionId || '').trim()
          if (sessionId && uid) {
            // 启动恢复登录时 authStore 可能还没有 wsUrl/aesKey；复用发送前连接逻辑从域名池恢复 WS。
            await traceOptionalInitStep('connect ws', () => messageStore.ensureWsConnected())
            // early WS 可能在会话列表为空时已 connected，导致 ws:status 预热空跑且不再触发。
            // 数据就绪后补一轮 relKey 预热，并重试已落库的「等待密钥同步」占位。
            void (async () => {
              try {
                const groupIds = chatStore.conversations
                  .filter((c) => c.type === 1 && /^\d+$/.test(String(c.targetId || '')))
                  .map((c) => String(c.targetId))
                const channelIds = chatStore.conversations
                  .filter((c) => c.type === 2 && /^\d+$/.test(String(c.targetId || '')))
                  .map((c) => String(c.targetId))
                const friendIds = Array.from(new Set([
                  ...chatStore.conversations
                    .filter((c) => c.type === 0 && /^\d+$/.test(String(c.targetId || '')))
                    .map((c) => String(c.targetId)),
                  ...contactStore.contacts
                    .map((c) => String(c.id || ''))
                    .filter((id) => /^\d+$/.test(id)),
                ]))
                for (const gid of groupIds) {
                  await ensureGroupRelKey(uid, gid).catch(() => {})
                }
                for (const cid of channelIds) {
                  await ensureChannelRelKey(uid, cid).catch(() => {})
                }
                for (const fid of friendIds) {
                  await ensureFriendRelKey(uid, fid).catch(() => {})
                }
                await messageStore.retryDecryptPendingPrivateConversations(uid)
                await messageStore.retryDecryptPendingGroupConversations(uid)
                initDiag('post-connect key warmup and pending decrypt done', {
                  groupCount: groupIds.length,
                  channelCount: channelIds.length,
                  friendCount: friendIds.length,
                })
              } catch (err) {
                console.warn('[e2ee] post-connect warmup/retry failed:', err)
              }
            })()
          } else if (uid) {
            networkStore.setWsStatus('disconnected')
            // 10001 必须带登录 session；缺失时跳过 WS，避免空 session 重连导致消息只显示本地气泡。
            console.warn('[AUTH-DIAG][ws] skipped connect: missing ws config', {
              uid,
              hasSessionId: !!sessionId,
            })
            // 对齐老 im：登录态由 sessionId/account 缓存维持，WS 配置缺失只阻断长连接，不能主动清登录态回登录页。
          }
        }
      } catch (err) {
        networkStore.setWsStatus('disconnected')
        console.warn('[ws] connect failed:', err)
      }

      void releaseChatListNameGate(chatListNameWarmupPromise)

    }

    setInitText(t('完成'))
    initDiag('before final initialized', {
      channelCount: channelStore.channels.length,
      placeholderChannelCount: channelStore.channels.filter((item) => {
        const name = String(item.channelName || item.name || '').trim()
        const id = String(item.id || item.channelId || '').trim()
        return !name || name === id
      }).length,
    })
    chatStore.ensureFileHelperConversationInMemory()
    if (authStore.uid && firstInitProgressVisible.value) {
      authStore.markAccountInitialized(authStore.uid)
    }
    isInitialized.value = true
    initDiag('bootstrap initialized true', {
      totalDurationMs: Date.now() - initTraceStartedAt,
      conversationCount: chatStore.conversations.length,
      channelCount: channelStore.channels.length,
    })
    clearInitReloadTimer()
    stopInitHeartbeat()
  } catch (err) {
    uiStore.setChatListNamesReady(true)
    initReloadVisible.value = true
    initDiag('bootstrap failed, reload button shown', {
      initText: initText.value,
      message: err instanceof Error ? err.message : String(err),
    }, 'error')
    console.warn('[init] bootstrap failed:', err)
  }

  // Listen for toast events from other components
  eventBus.on('show-toast', (payload) => {
    showToast(payload.message, payload.type)
  })
})

onBeforeUnmount(() => {
  clearInitReloadTimer()
  stopInitHeartbeat()
  clearActiveGroupMemberSyncTimer()
  window.removeEventListener('focus', handleWindowFocusRefreshGroupMembers)
  document.removeEventListener('visibilitychange', handleVisibilityRefreshGroupMembers)
  if (imageOverwriteResolver) {
    imageOverwriteResolver(false)
    imageOverwriteResolver = null
  }
  eventBus.off('show-toast')
})

async function confirmInitReset() {
  if (resettingInitData.value) return
  resettingInitData.value = true

  const currentUid = String(authStore.uid || '').trim()
  const remainingAccounts = authStore.accounts.filter((item) => item.id !== currentUid)

  // 对齐老 im 初始化页：放弃当前账号本地数据后，移除该账号并重启到登录态。
  if ((window as any).__TAURI_INTERNALS__ && currentUid) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('repair_reset_user_local_data', { uid: currentUid })
      await invoke('disconnect_ws')
    } catch (err) {
      console.warn('[init] reset local data failed:', err)
    }
  }

  try {
    localStorage.clear()
  } catch {
    // ignore storage cleanup failure
  }
  if (remainingAccounts.length > 0) {
    localStorage.setItem('login-account-list', JSON.stringify(remainingAccounts))
  }

  chatStore.enablePersistence('')
  chatStore.currentConversationId = null
  chatStore.conversations = []
  messageStore.clearAllMessageCaches()
  contactStore.contacts = []
  contactStore.searchResults = []
  groupStore.groups = []
  groupStore.memberMap = new Map()
  channelStore.channels = []
  uiStore.setChatListNamesReady(true)
  uiStore.setDetailView('none')
  uiStore.setRightPanel('none')
  uiStore.setSidebarTab('chats')

  authStore.accounts = remainingAccounts
  await authStore.logout()

  if ((window as any).__TAURI_INTERNALS__) {
    window.location.reload()
    return
  }

  resettingInitData.value = false
  await router.replace('/login')
}

const currentTargetId = computed(() => chatStore.currentConversation?.targetId ?? '')
const activeGroupMemberSyncGroupId = computed(() => {
  const conv = chatStore.currentConversation
  if (!authStore.uid || uiStore.detailView !== 'chat' || !conv) return ''
  if (conv.type !== ConversationType.Group) return ''
  if (!conv.targetId || conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return ''
  return conv.targetId
})

/** 传输助手会话仅在侧栏「传输」选中时显示聊天窗，防止通讯录/消息下误显 */
const showChatWindow = computed(() => {
  if (uiStore.detailView !== 'chat' || !chatStore.currentConversationId) return false
  if (
    chatStore.currentConversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`
    || chatStore.currentConversationId === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`
  ) {
    return false
  }
  const isFileHelper = isFileHelperTargetId(chatStore.currentConversation?.targetId)
  if (isFileHelper && uiStore.sidebarTab !== 'transfer') return false
  return true
})

const inviteExistingMemberIds = computed(() => {
  const members = groupStore.getMembers(uiStore.inviteFriendGroupId)
  return new Set(members.map(m => m.userId))
})

function clearActiveGroupMemberSyncTimer() {
  if (activeGroupMemberSyncTimer === null) return
  window.clearInterval(activeGroupMemberSyncTimer)
  activeGroupMemberSyncTimer = null
}

function canRefreshActiveGroupMembers(force = false) {
  if (document.hidden) return false
  if (activeGroupMemberSyncInFlight) return false
  if (force) return true
  return Date.now() - lastActiveGroupMemberSyncAt >= ACTIVE_GROUP_MEMBER_SYNC_MIN_GAP_MS
}

async function refreshActiveGroupMembers(reason: string, force = false) {
  const uid = String(authStore.uid || '').trim()
  const groupId = activeGroupMemberSyncGroupId.value
  if (!uid || !groupId || !canRefreshActiveGroupMembers(force)) return

  activeGroupMemberSyncInFlight = true
  lastActiveGroupMemberSyncAt = Date.now()
  terminalDebugLog('main-layout', 'active group member sync start', {
    reason,
    groupId,
    memberMapCountBefore: groupStore.getMembers(groupId).length,
    groupMemberCountBefore: groupStore.getGroup(groupId)?.memberCount ?? null,
  }, 'info')

  try {
    // 定时同步走缓存优先，避免每 5 秒强制全量远端拉群成员拖慢右侧首屏。
    const members = await groupStore.loadMembers(uid, groupId, { forceRemote: force })
    terminalDebugLog('main-layout', 'active group member sync resolved', {
      reason,
      groupId,
      returnedCount: members.length,
      memberMapCountAfter: groupStore.getMembers(groupId).length,
      groupMemberCountAfter: groupStore.getGroup(groupId)?.memberCount ?? null,
      returnedMemberIds: members.map((member) => member.userId).slice(0, 10),
    }, 'info')
  } catch (error) {
    terminalDebugLog('main-layout', 'active group member sync failed', {
      reason,
      groupId,
      error: error instanceof Error ? error.message : String(error),
    }, 'error')
  } finally {
    activeGroupMemberSyncInFlight = false
  }
}

function startActiveGroupMemberSyncTimer() {
  clearActiveGroupMemberSyncTimer()
  if (!activeGroupMemberSyncGroupId.value) return
  activeGroupMemberSyncTimer = window.setInterval(() => {
    void refreshActiveGroupMembers('interval')
  }, ACTIVE_GROUP_MEMBER_SYNC_INTERVAL_MS)
}

function handleWindowFocusRefreshGroupMembers() {
  const groupId = activeGroupMemberSyncGroupId.value
  if (groupId) {
    // 窗口恢复时先校准群详情人数；另一个窗口没打开成员面板也能收到正确 memberCount。
    void groupStore.refreshGroupDetail(groupId)
  }
  void refreshActiveGroupMembers('window-focus', true)
}

function handleVisibilityRefreshGroupMembers() {
  if (!document.hidden) {
    const groupId = activeGroupMemberSyncGroupId.value
    if (groupId) {
      // 页面从后台回到前台时补拉轻量群详情，避免只依赖本地成员缓存判断人数。
      void groupStore.refreshGroupDetail(groupId)
    }
    void refreshActiveGroupMembers('visibility-visible', true)
  }
}

watch(
  activeGroupMemberSyncGroupId,
  (groupId, previousGroupId) => {
    clearActiveGroupMemberSyncTimer()
    if (!groupId) return
    if (groupId !== previousGroupId) {
      lastActiveGroupMemberSyncAt = 0
    }
    startActiveGroupMemberSyncTimer()
    // 切群时先拉群详情修正标题人数；成员列表仍走缓存优先，避免打开聊天就全量拉大群成员。
    void groupStore.refreshGroupDetail(groupId)
    void refreshActiveGroupMembers('active-group-change')
  },
  { immediate: true },
)

function handleGlobalInviteInvited(payload?: { message?: string; type?: 'success' | 'error' }) {
  if (payload?.message) {
    showToast(payload.message, payload.type || 'success')
  }

  const groupId = uiStore.inviteFriendGroupId
  terminalDebugLog('main-layout', 'global invite invited', {
    groupId,
    payload,
    authUid: authStore.uid,
    memberMapCountBefore: groupId ? groupStore.getMembers(groupId).length : null,
    groupMemberCountBefore: groupId ? groupStore.getGroup(groupId)?.memberCount ?? null : null,
  })
  if (authStore.uid && groupId) {
    groupStore.loadMembers(authStore.uid, groupId, { forceRemote: true }).then((members) => {
      terminalDebugLog('main-layout', 'global invite remote refresh resolved', {
        groupId,
        returnedCount: members.length,
        memberMapCountAfter: groupStore.getMembers(groupId).length,
        groupMemberCountAfter: groupStore.getGroup(groupId)?.memberCount ?? null,
        returnedMemberIds: members.map((member) => member.userId).slice(0, 10),
      })
    }).catch((error) => {
      terminalDebugLog('main-layout', 'global invite remote refresh failed', {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      }, 'error')
      console.error('[MainLayout] refresh members after invite failed:', error)
    })
  }
}

function messageSupportsCopy(msgType: unknown): boolean {
  if (isCurrentChannelContentSaveRestricted()) return false
  const t = Number(msgType)
  // 对齐旧 im：50/51/52 是服务端下发的文本类通知，仍按文本消息允许右键复制。
  return LEGACY_TEXT_COPY_MESSAGE_TYPES.has(t)
}

function messageSupportsImageCopy(data: Record<string, unknown>): boolean {
  if (isCurrentChannelContentSaveRestricted()) return false
  return Number(data.msgType) === MessageType.Image
    && typeof data.imageSrc === 'string'
    && data.imageSrc.trim().length > 0
}

function messageSupportsImageSave(data: Record<string, unknown>): boolean {
  if (isCurrentChannelContentSaveRestricted()) return false
  return Number(data.msgType) === MessageType.Image
    && typeof data.imageSrc === 'string'
    && data.imageSrc.trim().length > 0
}

function messageSupportsVideoFileActions(data: Record<string, unknown>): boolean {
  if (isCurrentChannelContentSaveRestricted()) return false
  const conversationType = chatStore.currentConversation?.type
  return (
    conversationType === ConversationType.Friend ||
    conversationType === ConversationType.Group ||
    conversationType === ConversationType.Channel
  )
    && Number(data.msgType) === MessageType.Video
    && Boolean(getVideoFileSource(data).url)
}

function normalizeFileUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

function sanitizeFileName(fileName: string): string {
  return String(fileName || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/^\.+$/, '_') || 'file'
}

function getFileExtensionFromName(fileName: string): string {
  const name = String(fileName || '').trim().split('?')[0]
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot >= name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

function parseFileMessageContent(data: Record<string, unknown>): Record<string, unknown> {
  const raw = String(data.content || '').trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    const parts = raw.split('||')
    return {
      fileUrl: parts[0] || '',
      name: parts[1] || '',
      size: Number(parts[2] || 0) || 0,
      mimeType: parts[3] || '',
    }
  }
}

function getFileMessageSource(data: Record<string, unknown>) {
  const content = parseFileMessageContent(data)
  const extra = parseMessageExtra(data)
  const url = normalizeFileUrl(content.url || content.fileUrl || content.path || '')
  const urlName = url.split('?')[0].split('/').pop() || ''
  const name = sanitizeFileName(String(content.name || content.fileName || urlName || 'file'))
  const ext = String(content.ext || getFileExtensionFromName(name) || getFileExtensionFromName(urlName)).replace(/^\./, '').toLowerCase()
  const fileKey = String(
    content.fileKey ||
    content.file_key ||
    extra.fileKey ||
    extra.file_key ||
    '',
  ).trim()
  const attachmentKey = String(extra.attachmentKey || extra.attachment_key || '').trim()

  return { url, name, ext, fileKey, attachmentKey, extra }
}

function messageSupportsFileActions(data: Record<string, unknown>): boolean {
  if (isCurrentChannelContentSaveRestricted()) return false
  if (!(window as any).__TAURI_INTERNALS__) return false
  if (Number(data.msgType) !== MessageType.File) return false
  const source = getFileMessageSource(data)
  // 对齐旧 im：文件消息（7）右键“另存为/打开目录”不限制为 Office 扩展名。
  return Boolean(source.url)
}

function parseMessageExtra(data: Record<string, unknown>): Record<string, unknown> {
  const raw = data.extra
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(raw))
    if (typeof parsed === 'string') {
      const nested = JSON.parse(parsed)
      return nested && typeof nested === 'object' ? nested as Record<string, unknown> : {}
    }
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function getMessageReadUsers(data: Record<string, unknown>): unknown[] {
  const extra = parseMessageExtra(data)
  if (Array.isArray(data.readUsers)) return data.readUsers
  if (Array.isArray(extra.readUsers)) return extra.readUsers
  return []
}

function getMessageReadTotal(data: Record<string, unknown>): number {
  const extra = parseMessageExtra(data)
  const directTotal = Number(data.readTotal ?? data.read_total ?? 0)
  const extraTotal = Number(extra.readTotal ?? extra.read_total ?? 0)
  return Math.max(
    Number.isFinite(directTotal) ? directTotal : 0,
    Number.isFinite(extraTotal) ? extraTotal : 0,
  )
}

function normalizeCopyTextContent(rawContent: unknown, extraData: Record<string, unknown>): string {
  let content = String(rawContent || '')
  content = content.replace(/<img[^>]+data-key="(\[.*?\])"[^>]*>/g, '$1')

  const atUsers = Array.isArray(extraData.atUsers) ? extraData.atUsers : []
  if (atUsers.length > 0 && content.includes('@')) {
    const usersWithRemark = atUsers
      .map((user) => ({
        nickName: typeof user?.nickName === 'string' ? user.nickName : '',
        name: typeof user?.name === 'string' ? user.name : '',
      }))
      .filter((user) => user.nickName && user.name)
      .sort((a, b) => b.nickName.length - a.nickName.length)

    if (usersWithRemark.length > 0) {
      const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const nameMap = new Map(usersWithRemark.map((user) => [user.nickName, user.name]))
      const pattern = usersWithRemark.map((user) => escapeRegExp(user.nickName)).join('|')
      const atMentionReg = new RegExp(`@(${pattern})(?=$|[\\s@])`, 'g')
      content = content.replace(atMentionReg, (_, nickName: string) => `@${nameMap.get(nickName) || nickName}`)
    }
  }

  return content
}

async function writeTextClipboard(text: string) {
  // 文本复制统一走兼容工具：桌面原生优先，Web Clipboard 失败后回落到旧 im 的 execCommand。
  copyDebugLog('write text clipboard start', {
    textLength: String(text || '').length,
    textHead: copyDebugPreview(text),
    textTail: String(text || '').length > 160 ? String(text || '').slice(-160) : '',
    isTauri: Boolean((window as any).__TAURI_INTERNALS__),
    hasNavigatorClipboard: Boolean(navigator.clipboard?.writeText),
  }, 'info')
  await writeClipboardText(text)
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const actual = await invoke<string>('read_clipboard_text')
      // 复制成功后立刻读回，判断系统剪贴板是否真的变成目标文本。
      copyDebugLog('write text clipboard readback', {
        expectedLength: String(text || '').length,
        actualLength: String(actual || '').length,
        exactMatch: String(actual || '') === String(text || ''),
        actualHead: copyDebugPreview(actual),
        actualTail: String(actual || '').length > 160 ? String(actual || '').slice(-160) : '',
      }, String(actual || '') === String(text || '') ? 'info' : 'warn')
    } catch (error) {
      copyDebugLog('write text clipboard readback failed', {
        error: error instanceof Error ? error.message : String(error),
      }, 'warn')
    }
  }
  copyDebugLog('write text clipboard success', {
    textLength: String(text || '').length,
  }, 'info')
}

function getGroupReadTotal(data: Record<string, unknown>): number {
  const rawUsers = getMessageReadUsers(data)
  const readUsers = rawUsers.filter((item) => {
    if (!item || typeof item !== 'object') return false
    const user = item as Record<string, unknown>
    return Number(user.readState ?? user.status ?? 0) === 1
  })
  const readTotal = getMessageReadTotal(data)
  const fallbackReadCount = Number(data.readStatus || 0) === 2 ? 1 : 0
  return Math.max(readUsers.length, readTotal, fallbackReadCount)
}

function getGroupReadUserMenuItems(data: Record<string, unknown>): MenuItem[] {
  const readTotal = getGroupReadTotal(data)
  // 0 个已读是明确空态；只有已读数存在但成员明细缺失时，才显示加载中。
  if (readTotal <= 0) {
    return [
      {
        key: 'group_read_submenu_empty',
        label: '暂无已读成员',
        disabled: true,
        tone: 'muted',
      },
    ]
  }

  const rawUsers = getMessageReadUsers(data)
  if (!rawUsers.length) {
    if (!Boolean(data.isSelf) && Number(data.readStatus || 0) > 0) {
      const selfName = authStore.nickname || t('你') || authStore.uid || 'User'
      return [
        {
          key: `group_read_user_${authStore.uid || 'self'}`,
          label: selfName,
          avatarName: selfName,
          avatarSrc: authStore.avatar || null,
          avatarType: 'friend',
          secondaryLabel: t('标记已读'),
          secondaryIconSrc: hasReadUrl,
          disabled: true,
        },
      ]
    }
    return [
      {
        key: 'group_read_submenu_loading',
        label: '群成员加载中',
        disabled: true,
        tone: 'muted',
      },
    ]
  }

  const groupId = String(chatStore.currentConversation?.targetId || '').trim()
  const groupMembers = groupId ? groupStore.getMembers(groupId) : []
  const groupMemberMap = new Map(groupMembers.map((member) => [member.userId, member]))
  const readUsers = new Map<string, {
    userId: string
    name: string
    avatarSrc: string | null
    readState: number
    readTime: number
  }>()

  for (const rawUser of rawUsers) {
    if (!rawUser || typeof rawUser !== 'object') continue
    const user = rawUser as Record<string, unknown>
    const userId = String(user.userId ?? user.uid ?? '').trim()
    if (!userId) continue

    const readState = Number(user.readState ?? user.status ?? 0)
    if (readState <= 0) continue

    const readTime = Number(user.readTime || 0)
    const member = groupMemberMap.get(userId)
    const contact = contactStore.getContact(userId)
    const name = member?.nickname?.trim() || contactStore.getDisplayName(userId) || userId
    const avatarSrc = member?.avatar || contact?.avatar || null
    const previous = readUsers.get(userId)
    if (!previous || readTime >= previous.readTime) {
      readUsers.set(userId, {
        userId,
        name,
        avatarSrc,
        readState,
        readTime,
      })
    }
  }

  const sortedUsers = [...readUsers.values()].sort((a, b) => b.readTime - a.readTime)
  if (!sortedUsers.length) {
    return [
      {
        key: 'group_read_submenu_loading',
        label: '群成员加载中',
        disabled: true,
        tone: 'muted',
      },
    ]
  }

  return sortedUsers.map((user) => ({
      key: `group_read_user_${user.userId}`,
      label: user.name,
      avatarName: user.name,
      avatarSrc: user.avatarSrc,
      avatarType: 'friend',
      secondaryLabel: formatTimeStamp(user.readTime, appLocale.value, t),
      secondaryIconSrc: user.readState === 1 ? hasReadUrl : hasReceiveUrl,
      disabled: true,
    }))
}

function messageSupportsGroupReadCount(data: Record<string, unknown>): boolean {
  // 对齐旧 im：0 人已读时不展示「0个已读」菜单项。
  return chatStore.currentConversation?.type === ConversationType.Group
    && Boolean(data.isSelf)
    && Number(data.readStatus ?? 0) !== -1
    && getGroupReadTotal(data) > 0
}

function canCopyMessageInfo(): boolean {
  return ['test', 'uat'].includes(String(API_CONFIG.env || '').toLowerCase())
}

function groupReadCountLabel(data: Record<string, unknown>): string {
  return t('已读数量', { count: getGroupReadTotal(data) })
}

function messageSupportsImageOpenDirectory(data: Record<string, unknown>): boolean {
  return !!(window as any).__TAURI_INTERNALS__ && messageSupportsImageSave(data)
}

function messageSupportsVideoOpenDirectory(data: Record<string, unknown>): boolean {
  return !!(window as any).__TAURI_INTERNALS__ && messageSupportsVideoFileActions(data)
}

function messageSupportsVideoCopy(_data: Record<string, unknown>): boolean {
  return false
}

function messageSupportsDeleteEverywhere(data: Record<string, unknown>): boolean {
  const conv = chatStore.currentConversation
  if (!conv || Number(data.readStatus ?? 0) === -1) return false
  if (conv.type === ConversationType.Friend) return true
  return Boolean(data.isSelf)
}

function hasCurrentChannelReplyAuthority(): boolean {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return true
  const channel = channelStore.getChannel(conv.targetId)
  if (!channel) return false
  if (Number(channel.memberType ?? -1) === 3) return false
  const adminPrivacy = Number(channel.adminPrivacy ?? 0)
  return adminPrivacy > 0 && (adminPrivacy & 2) !== 0
}

function isReadBurnMessage(data: Record<string, unknown>): boolean {
  const directDeleteSeconds = Number(data.deleteSeconds ?? 0)
  const directSnapchatTime = Number(data.snapchatTime ?? data.snapchat_time ?? 0)
  if (directDeleteSeconds > 0 || directSnapchatTime > 0) return true

  try {
    const extra = typeof data.extra === 'string' ? JSON.parse(data.extra) : data.extra
    if (extra && typeof extra === 'object') {
      return Number((extra as Record<string, unknown>).deleteSeconds ?? 0) > 0
        || Number((extra as Record<string, unknown>).snapchatTime ?? (extra as Record<string, unknown>).snapchat_time ?? 0) > 0
    }
  } catch {
    // 非 JSON extra 不影响普通菜单判断
  }

  return false
}

function deleteEveryoneLabelForConversation(): string {
  const conv = chatStore.currentConversation
  if (!conv) return t('为所有人删除')
  if (conv.type !== 0) return t('为所有人删除')

  const targetName = contactStore.getDisplayName(conv.targetId) || conv.targetId || t('对方')
  return t('从本地和{value}删除', { value: targetName })
}

function imageCacheSafeName(name: string): string {
  return name.replace(/[^\w.-]/g, '_') || 'image'
}

function imageExtFromMime(src: string): string {
  const matched = src.match(/^data:image\/([^;,]+)[;,]/i)
  const mime = matched?.[1]?.toLowerCase() || ''
  if (mime === 'jpeg' || mime === 'jpg') return '.jpg'
  if (mime === 'png') return '.png'
  if (mime === 'gif') return '.gif'
  if (mime === 'webp') return '.webp'
  if (mime === 'bmp') return '.bmp'
  if (mime === 'avif') return '.avif'
  if (mime === 'svg+xml') return '.svg'
  return '.png'
}

function resolveImageCacheExt(data: Record<string, unknown>): string {
  const rawContent = String(data.content || '').trim()
  if (rawContent) {
    try {
      const parsed = JSON.parse(rawContent) as Record<string, unknown>
      const rawUrl = String(parsed.url || parsed.fileUrl || parsed.thumbnailUrl || parsed.thumbUrl || '').trim()
      const fromUrl = rawUrl.split('?')[0].match(/\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i)
      if (fromUrl?.[0]) return fromUrl[0].toLowerCase()
    } catch {
      // ignore invalid image payload
    }
  }

  return imageExtFromMime(String(data.imageSrc || '').trim())
}

async function tauriFileExists(path: string): Promise<boolean> {
  if (!(window as any).__TAURI_INTERNALS__) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('file_exists', { path })
  } catch {
    return false
  }
}

async function resolveImageCacheFilePath(data: Record<string, unknown>): Promise<string> {
  const existingPath = String(data.imagePath || '').trim()
  if (existingPath) return existingPath

  if (!(window as any).__TAURI_INTERNALS__) return ''
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const baseDir = await appDataDir()
  const messageId = imageCacheSafeName(String(data.messageId || data.msgId || 'image'))
  return join(baseDir, 'image-cache', `${messageId}${resolveImageCacheExt(data)}`)
}

async function ensureImageCacheFile(data: Record<string, unknown>): Promise<string> {
  const filePath = await resolveImageCacheFilePath(data)
  if (!filePath) {
    throw new Error('image cache path unavailable')
  }

  if (await tauriFileExists(filePath)) {
    return filePath
  }

  const imageSrc = String(data.imageSrc || '').trim()
  if (!imageSrc) {
    throw new Error('image source unavailable')
  }

  const response = await fetch(imageSrc)
  if (!response.ok) {
    throw new Error(`image fetch failed: ${response.status}`)
  }

  const dataUrl = await blobToDataUrl(await response.blob())
  const err = await exportBase64ImgToLocal(dataUrl, filePath)
  if (err) {
    throw err
  }

  return filePath
}

async function openImageDirectory(data: Record<string, unknown>) {
  const rememberedPath = await resolveRememberedImagePath(data)
  const filePath = rememberedPath || await ensureImageCacheFile(data)
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('reveal_file_in_directory', { path: filePath })
}

function normalizeVideoUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

function getVideoFileSource(data: Record<string, unknown>): {
  url: string
  fileKey: string
  attachmentKey: string
  fileName: string
} {
  const extra = parseMessageExtra(data)
  const rawContent = String(data.content || '').trim()
  let url = ''
  let fileName = ''
  let fileKey = String(extra.fileKey || extra.file_key || '').trim()
  let attachmentKey = String(extra.attachmentKey || extra.attachment_key || '').trim()

  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    url = normalizeVideoUrl(parsed.url || parsed.fileUrl || parsed.path || '')
    fileName = String(parsed.name || parsed.fileName || parsed.file_name || '').trim()
    fileKey = String(parsed.fileKey || parsed.file_key || fileKey).trim()
    attachmentKey = String(parsed.attachmentKey || parsed.attachment_key || attachmentKey).trim()
  } catch {
    const [head = ''] = rawContent.split('||')
    const [legacyUrl = ''] = head.split('*P')
    url = normalizeVideoUrl(legacyUrl)
  }

  if (!fileName && url) {
    const cleanUrl = url.split('?')[0]
    const rawFileName = cleanUrl.split(/[\\/]/).pop() || ''
    try {
      fileName = decodeURIComponent(rawFileName)
    } catch {
      fileName = rawFileName
    }
  }

  return {
    url,
    fileKey,
    attachmentKey,
    fileName: sanitizeMediaFileName(fileName || String(data.messageId || 'video')),
  }
}

function sanitizeMediaFileName(fileName: string): string {
  return String(fileName || 'video').replace(/[\\/:*?"<>|]/g, '_').trim() || 'video'
}

function videoExtFromUrl(url: string): string {
  const matched = String(url || '').split('?')[0].match(/\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i)
  return matched?.[0]?.toLowerCase() || '.mp4'
}

function videoMenuLog(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  const payload = data || {}
  console.warn(`[video-menu] ${message}`, payload)
  if (!(window as any).__TAURI_INTERNALS__) return
  void import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level,
        message: `[video-menu] ${message}`,
        data: payload,
      },
    }))
    .catch(() => {})
}

function videoUrlCandidates(url: string, fileName = ''): string[] {
  const raw = String(url || '').trim()
  if (!raw || !isRemoteUrl(raw)) return raw ? [raw] : []
  const [withoutHash, hash = ''] = raw.split('#')
  const [base, query = ''] = withoutHash.split('?')
  const hasVideoExt = /\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i.test(base)
  if (hasVideoExt) return getOssDownloadCandidates({ url: raw })

  const suffixFromName = videoExtFromUrl(fileName)
  const suffixes = [suffixFromName, '.mp4', '.mov'].filter((item, index, list) => item && list.indexOf(item) === index)
  const withSuffix = suffixes.map(suffix => `${base}${suffix}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`)
  // 右键视频菜单保留原有“补后缀”候选，同时按旧 im 展开 OSS 域名兜底。
  return [...new Set([...withSuffix, raw].flatMap(candidate => getOssDownloadCandidates({ url: candidate })))]
}

function suggestedVideoSaveName(data: Record<string, unknown>): string {
  const source = getVideoFileSource(data)
  const name = sanitizeMediaFileName(source.fileName || String(data.messageId || 'video'))
  if (/\.[A-Za-z0-9]{2,5}$/.test(name)) return name
  return `${name}${videoExtFromUrl(source.url)}`
}

const SAVE_EXTENSION_GUARD = '\u2063\u2063\u2063'

function isMacOS(): boolean {
  return /mac/i.test(navigator.platform || '')
}

function isWindowsOS(): boolean {
  return /win/i.test(navigator.platform || '')
}

function ensureVideoSaveExtension(filePath: string, extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  return filePath.toLowerCase().endsWith(ext.toLowerCase()) ? filePath : `${filePath}${ext}`
}

function addSaveExtensionGuard(fileName: string, extension: string): string {
  const normalized = ensureVideoSaveExtension(fileName, extension)
  const lastDotIndex = normalized.lastIndexOf('.')
  if (lastDotIndex <= 0) return `${normalized}${SAVE_EXTENSION_GUARD}`
  return `${normalized.slice(0, lastDotIndex)}${SAVE_EXTENSION_GUARD}${normalized.slice(lastDotIndex)}`
}

function stripKnownExtension(fileName: string, extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  return fileName.toLowerCase().endsWith(ext.toLowerCase())
    ? fileName.slice(0, -ext.length)
    : fileName
}

function addSaveBaseNameGuard(fileName: string, extension: string): string {
  const baseName = stripKnownExtension(ensureVideoSaveExtension(fileName, extension), extension)
  return `${baseName}${SAVE_EXTENSION_GUARD}`
}

function hasSaveExtensionGuard(filePath: string): boolean {
  return filePath.includes(SAVE_EXTENSION_GUARD)
}

function stripSaveExtensionGuard(filePath: string): string {
  return filePath.split(SAVE_EXTENSION_GUARD).join('')
}

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function isBlobOrDataUrl(url: string): boolean {
  return /^(blob|data):/i.test(url)
}

type ContextMenuDownloadRequestState = {
  requestId: string
  statusVersion: number
}

// 右键下载/另存为按“消息维度”记录当前有效请求，防止旧事件回写污染最新状态。
const latestContextMenuDownloadRequest = new Map<string, ContextMenuDownloadRequestState>()
const contextMenuDownloadVersionCounter = new Map<string, number>()

function createContextMenuRequestId(channelId: string): string {
  const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${channelId}-${randomSuffix}`
}

function extractDownloadRequestId(payload: { requestId?: string; request_id?: string } | null | undefined): string {
  return String(payload?.requestId || payload?.request_id || '')
}

function extractDownloadStatusVersion(
  payload: { statusVersion?: number; status_version?: number } | null | undefined,
): number {
  const raw = payload?.statusVersion ?? payload?.status_version ?? -1
  const version = Number(raw)
  return Number.isFinite(version) ? version : -1
}

function nextContextMenuDownloadStatusVersion(channelId: string): number {
  // 每个消息通道单调递增版本号，配合 requestId 双重校验事件归属。
  const next = (contextMenuDownloadVersionCounter.get(channelId) || 0) + 1
  contextMenuDownloadVersionCounter.set(channelId, next)
  return next
}

function registerContextMenuDownloadRequest(channelId: string): ContextMenuDownloadRequestState {
  const activeRequest = latestContextMenuDownloadRequest.get(channelId)
  // 同一消息右键重复点击时复用进行中的 requestId，避免并发监听全部等待不到匹配事件。
  if (activeRequest) return activeRequest
  const requestId = createContextMenuRequestId(channelId)
  const statusVersion = nextContextMenuDownloadStatusVersion(channelId)
  const requestState = { requestId, statusVersion }
  latestContextMenuDownloadRequest.set(channelId, requestState)
  return requestState
}

function clearContextMenuDownloadRequest(channelId: string, requestState: ContextMenuDownloadRequestState) {
  const activeRequest = latestContextMenuDownloadRequest.get(channelId)
  if (
    activeRequest?.requestId === requestState.requestId
    && activeRequest?.statusVersion === requestState.statusVersion
  ) {
    latestContextMenuDownloadRequest.delete(channelId)
  }
}

function isActiveContextMenuDownloadRequest(
  channelId: string,
  requestState: ContextMenuDownloadRequestState,
  payload: {
    requestId?: string
    request_id?: string
    statusVersion?: number
    status_version?: number
  } | null | undefined,
): boolean {
  // 只消费“当前最新请求 + 同 requestId + 同状态版本戳”事件，避免旧请求状态覆盖新请求结果。
  const activeRequest = latestContextMenuDownloadRequest.get(channelId)
  return (
    activeRequest?.requestId === requestState.requestId
    && activeRequest?.statusVersion === requestState.statusVersion
    && extractDownloadRequestId(payload) === requestState.requestId
    && extractDownloadStatusVersion(payload) === requestState.statusVersion
  )
}

function buildContextMenuDownloadChannel(data: Record<string, unknown>, scope: 'video' | 'file'): string {
  const messageId = String(data.messageId || data.msgId || '').trim()
  return messageId ? `${scope}-menu-${imageCacheSafeName(messageId)}` : `${scope}-menu-${Date.now()}`
}

function showVideoPreparingProgress(progress: number) {
  const percent = Math.max(1, Math.min(99, Math.round(progress * 100)))
  showToast(`正在准备视频文件 ${percent}%`)
}

async function waitForDownloadFile(
  url: string,
  fileKey: string,
  savePath: string,
  msgId: string,
  requestState: ContextMenuDownloadRequestState,
  onProgress?: (progress: number) => void,
) {
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ])

  await new Promise<void>(async (resolve, reject) => {
    let settled = false
    let unlistenDone: (() => void) | null = null
    let unlistenError: (() => void) | null = null
    let unlistenProgress: (() => void) | null = null
    const cleanup = () => {
      // 每次调用都只保留一组监听，避免重复注册造成多次回调。
      unlistenDone?.()
      unlistenError?.()
      unlistenProgress?.()
      unlistenDone = null
      unlistenError = null
      unlistenProgress = null
    }

    try {
      unlistenDone = await listen<{ requestId?: string; request_id?: string; statusVersion?: number; status_version?: number }>(`file:done:${msgId}`, (event) => {
        if (settled) return
        if (!isActiveContextMenuDownloadRequest(msgId, requestState, event.payload)) return
        settled = true
        cleanup()
        clearContextMenuDownloadRequest(msgId, requestState)
        resolve()
      })
      unlistenError = await listen<{ error?: string; requestId?: string; request_id?: string; statusVersion?: number; status_version?: number }>(`file:error:${msgId}`, (event) => {
        if (settled) return
        if (!isActiveContextMenuDownloadRequest(msgId, requestState, event.payload)) return
        settled = true
        cleanup()
        clearContextMenuDownloadRequest(msgId, requestState)
        reject(new Error(event.payload?.error || '视频下载失败'))
      })
      unlistenProgress = await listen<{ progress?: number; requestId?: string; request_id?: string; statusVersion?: number; status_version?: number }>(`file:progress:${msgId}`, (event) => {
        if (!isActiveContextMenuDownloadRequest(msgId, requestState, event.payload)) return
        const progress = Number(event.payload?.progress || 0)
        if (Number.isFinite(progress)) onProgress?.(Math.max(0, Math.min(1, progress)))
      })
      await invoke('download_file', {
        url,
        fileKey,
        savePath,
        msgId,
        requestId: requestState.requestId,
        statusVersion: requestState.statusVersion,
        logTag: 'video-menu',
        emitDataUrl: false,
      })
    } catch (error) {
      if (!settled) {
        settled = true
        cleanup()
        clearContextMenuDownloadRequest(msgId, requestState)
        reject(error)
      }
    }
  })
}

async function writeRemoteFile(url: string, savePath: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`video fetch failed: ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const { writeFile } = await import('@tauri-apps/plugin-fs')
  await writeFile(savePath, bytes)
}

async function ensureVideoLocalFile(data: Record<string, unknown>): Promise<string> {
  const source = getVideoFileSource(data)
  const url = source.url
  if (!url || isBlobOrDataUrl(url)) throw new Error('video source unavailable')
  const fileKey = await resolveVideoMessageKey(data)

  videoMenuLog('ensure local file start', {
    messageId: String(data.messageId || data.msgId || ''),
    urlHead: url.slice(0, 160),
    fileName: source.fileName,
    hasFileKey: Boolean(fileKey),
    fileKeyLen: fileKey.length,
    isRemote: isRemoteUrl(url),
  })

  if (!isRemoteUrl(url)) {
    const localPath = toFsPath(url)
    videoMenuLog('check local video path', { localPath })
    if (await tauriFileExists(localPath)) return localPath
    throw new Error('video file not found')
  }

  const baseSavePath = await (async () => {
    const { appDataDir, join } = await import('@tauri-apps/api/path')
    const baseDir = await appDataDir()
    const messageId = imageCacheSafeName(String(data.messageId || data.msgId || 'video'))
    return join(baseDir, 'video-cache', `${messageId}${videoExtFromUrl(url)}`)
  })()

  if (await tauriFileExists(baseSavePath)) {
    videoMenuLog('local video cache hit', { savePath: baseSavePath })
    return baseSavePath
  }

  const candidates = videoUrlCandidates(url, source.fileName)
  videoMenuLog('remote video candidates', {
    baseSavePath,
    candidateCount: candidates.length,
    candidates: candidates.map(item => item.slice(0, 160)),
  })

  let lastError: unknown = null
  for (const candidate of candidates) {
    const savePath = ensureVideoSaveExtension(baseSavePath.replace(/\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i, ''), videoExtFromUrl(candidate))
    if (await tauriFileExists(savePath)) {
      videoMenuLog('candidate cache hit', { candidateHead: candidate.slice(0, 160), savePath })
      return savePath
    }

    try {
      videoMenuLog('candidate download start', {
        candidateHead: candidate.slice(0, 160),
        savePath,
        encrypted: Boolean(fileKey),
      })
      if (fileKey) {
        const menuChannel = buildContextMenuDownloadChannel(data, 'video')
        const requestState = registerContextMenuDownloadRequest(menuChannel)
        await waitForDownloadFile(
          candidate,
          fileKey,
          savePath,
          menuChannel,
          requestState,
          showVideoPreparingProgress,
        )
      } else {
        showToast('正在准备视频文件')
        await writeRemoteFile(candidate, savePath)
      }
      videoMenuLog('candidate download success', {
        candidateHead: candidate.slice(0, 160),
        savePath,
      })
      return savePath
    } catch (error) {
      lastError = error
      // 对齐旧 im：4xx 和日期过期说明资源本身不可用，继续换域名也不会成功。
      const message = (error as Error)?.message || String(error)
      videoMenuLog('candidate download failed', {
        candidateHead: candidate.slice(0, 160),
        savePath,
        error: message,
      }, 'warn')
      if (/HTTP 4\d\d/i.test(message) || /\b4\d\d\b/.test(message) || /url_dated_expired/i.test(message)) {
        throw error
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('video download failed')
}

// 记录本次会话里视频消息“另存为”的实际目标，避免打开目录回到内部缓存文件名。
const videoSavedPathByMessageKey = new Map<string, string>()

function videoSavedPathKey(data?: Record<string, unknown>): string {
  return String(data?.messageId || data?.msgId || data?.customMsgId || '').trim()
}

function rememberSavedVideoPath(data: Record<string, unknown> | undefined, filePath: string) {
  const key = videoSavedPathKey(data)
  const normalizedPath = String(filePath || '').trim()
  if (!key || !normalizedPath) return
  videoSavedPathByMessageKey.set(key, normalizedPath)
}

async function resolveRememberedVideoPath(data: Record<string, unknown>): Promise<string> {
  const key = videoSavedPathKey(data)
  if (!key) return ''

  const rememberedPath = String(videoSavedPathByMessageKey.get(key) || '').trim()
  if (!rememberedPath) return ''
  if (await tauriFileExists(rememberedPath)) return rememberedPath

  videoSavedPathByMessageKey.delete(key)
  return ''
}

async function saveVideoAs(data: Record<string, unknown>) {
  if (!(window as any).__TAURI_INTERNALS__) return
  const { save } = await import('@tauri-apps/plugin-dialog')
  const suggestedName = suggestedVideoSaveName(data)
  const extension = videoExtFromUrl(suggestedName)
  const defaultFileName = isMacOS()
    ? addSaveBaseNameGuard(suggestedName, extension)
    : ensureVideoSaveExtension(suggestedName, extension)
  let defaultPath = defaultFileName
  if (isMacOS()) {
    try {
      const { downloadDir, join } = await import('@tauri-apps/api/path')
      defaultPath = await join(await downloadDir(), defaultFileName)
    } catch {
      defaultPath = defaultFileName
    }
  }
  const selectedPath = await save({
    defaultPath,
    ...(!isMacOS()
      ? { filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'ogg', 'm4v'] }] }
      : {}),
  })
  if (!selectedPath) return

  const didUseGuardedPath = isMacOS() && hasSaveExtensionGuard(selectedPath)
  const selectedAlreadyHasExtension = selectedPath.toLowerCase().endsWith(extension.toLowerCase())
  const finalPath = ensureVideoSaveExtension(stripSaveExtensionGuard(selectedPath), extension)
  // macOS 原生 save 面板会在带扩展名的同名路径上抢先弹系统 Replace；
  // 默认用不带扩展名的 guard 名称返回路径，再由应用内覆盖弹窗接管同名确认。
  const needsOverwriteConfirm = isMacOS() && !didUseGuardedPath && selectedAlreadyHasExtension
    ? false
    : await tauriFileExists(finalPath)
  if (needsOverwriteConfirm) {
    const confirmed = await promptImageOverwrite(finalPath)
    if (!confirmed) return
  }
  const localPath = await ensureVideoLocalFile(data)
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('copy_file_overwrite', {
    sourcePath: localPath,
    targetPath: finalPath,
  })
  // 对齐旧 im：另存为成功后，“打开目录”应定位用户刚保存的新视频文件。
  rememberSavedVideoPath(data, finalPath)
  showToast(t('保存成功'))
}

async function openVideoDirectory(data: Record<string, unknown>) {
  videoMenuLog('open directory click', {
    messageId: String(data.messageId || data.msgId || ''),
    msgType: data.msgType,
    contentHead: String(data.content || '').slice(0, 260),
  })
  showToast('正在准备视频文件')
  const rememberedPath = await resolveRememberedVideoPath(data)
  const filePath = rememberedPath || await ensureVideoLocalFile(data)
  videoMenuLog('reveal video directory', { filePath })
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('reveal_file_in_directory', { path: filePath })
  showToast('已打开目录')
}

function fallbackPlainFileKey(key: string): string {
  const raw = key.trim()
  if (!raw) return ''
  if (raw.length <= 32 || !/^[0-9a-f]+$/i.test(raw)) return raw
  return ''
}

function getMessageGroupId(data: Record<string, unknown>): string {
  const extra = parseMessageExtra(data)
  const extraGroupId = String(extra.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const conversationId = String(data.conversationId || chatStore.currentConversationId || '')
  return conversationId.startsWith('1_') ? conversationId.split('_')[1] || '' : ''
}

function getMessageChannelId(data: Record<string, unknown>): string {
  const extra = parseMessageExtra(data)
  const extraChannelId = String(extra.channelId || extra.channel_id || '').trim()
  if (extraChannelId) return extraChannelId
  const conversationId = String(data.conversationId || chatStore.currentConversationId || '')
  return conversationId.startsWith('2_') ? conversationId.split('_')[1] || '' : ''
}

async function resolveVideoMessageKey(data: Record<string, unknown>): Promise<string> {
  const source = getVideoFileSource(data)
  if (source.fileKey) return source.fileKey
  const plainAttachmentKey = fallbackPlainFileKey(source.attachmentKey)
  if (plainAttachmentKey) return plainAttachmentKey

  const groupId = getMessageGroupId(data)
  const channelId = getMessageChannelId(data)
  if (!source.attachmentKey || (!groupId && !channelId)) return ''

  try {
    if (groupId && authStore.uid) {
      await ensureGroupRelKey(String(authStore.uid), groupId)
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string>('decrypt_group_incoming', {
        groupId,
        ciphertextHex: source.attachmentKey,
        msgType: 0,
      })
    }
    if (channelId && authStore.uid) {
      await ensureChannelRelKey(String(authStore.uid), channelId)
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string>('decrypt_channel_incoming', {
        channelId,
        ciphertextHex: source.attachmentKey,
        msgType: 0,
      })
    }
    return ''
  } catch {
    return ''
  }
}

async function decryptAttachmentKeyForConversation(data: Record<string, unknown>, attachmentKey: string): Promise<string> {
  const groupId = getMessageGroupId(data)
  const channelId = getMessageChannelId(data)
  if (!attachmentKey || (!groupId && !channelId)) return ''

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    if (groupId) {
      if (authStore.uid) await ensureGroupRelKey(String(authStore.uid), groupId)
      return await invoke<string>('decrypt_group_incoming', {
        groupId,
        ciphertextHex: attachmentKey,
        msgType: 0,
      })
    }

    if (authStore.uid) await ensureChannelRelKey(String(authStore.uid), channelId)
    return await invoke<string>('decrypt_channel_incoming', {
      channelId,
      ciphertextHex: attachmentKey,
      msgType: 0,
    })
  } catch {
    return ''
  }
}

async function resolveFileMessageKey(data: Record<string, unknown>): Promise<string> {
  const source = getFileMessageSource(data)
  if (source.fileKey) return source.fileKey
  const plainAttachmentKey = fallbackPlainFileKey(source.attachmentKey)
  if (plainAttachmentKey) return plainAttachmentKey
  return decryptAttachmentKeyForConversation(data, source.attachmentKey)
}

async function waitForOfficeFileDownload(
  url: string,
  fileKey: string,
  savePath: string,
  msgId: string,
  requestState: ContextMenuDownloadRequestState,
  downloadOptions: { urlCandidates?: string[]; msgType?: number; sendTime?: number } = {},
): Promise<{ filePath: string; isDangerous: boolean }> {
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ])

  return new Promise(async (resolve, reject) => {
    let settled = false
    let unlistenDone: (() => void) | null = null
    let unlistenError: (() => void) | null = null
    const cleanup = () => {
      // 结束后立即清监听，避免重试叠加旧监听。
      unlistenDone?.()
      unlistenError?.()
      unlistenDone = null
      unlistenError = null
    }

    try {
      unlistenDone = await listen<{ filePath?: string; file_path?: string; isDangerous?: boolean; is_dangerous?: boolean; requestId?: string; request_id?: string; statusVersion?: number; status_version?: number }>(`file:done:${msgId}`, (event) => {
        if (settled) return
        if (!isActiveContextMenuDownloadRequest(msgId, requestState, event.payload)) return
        settled = true
        cleanup()
        clearContextMenuDownloadRequest(msgId, requestState)
        resolve({
          filePath: event.payload?.filePath || event.payload?.file_path || savePath,
          isDangerous: Boolean(event.payload?.isDangerous ?? event.payload?.is_dangerous),
        })
      })
      unlistenError = await listen<{ error?: string; requestId?: string; request_id?: string; statusVersion?: number; status_version?: number }>(`file:error:${msgId}`, (event) => {
        if (settled) return
        if (!isActiveContextMenuDownloadRequest(msgId, requestState, event.payload)) return
        settled = true
        cleanup()
        clearContextMenuDownloadRequest(msgId, requestState)
        reject(new Error(event.payload?.error || '文件下载失败'))
      })
      await invoke('download_file', {
        url,
        fileKey,
        savePath,
        msgId,
        requestId: requestState.requestId,
        statusVersion: requestState.statusVersion,
        logTag: 'file',
        emitDataUrl: false,
        // 文件右键下载也走旧 im 的 OSS 候选域名，避免组件内可用、菜单下载不可用。
        urlCandidates: downloadOptions.urlCandidates,
        msgType: downloadOptions.msgType,
        sendTime: downloadOptions.sendTime,
      })
    } catch (error) {
      if (!settled) {
        settled = true
        cleanup()
        clearContextMenuDownloadRequest(msgId, requestState)
        reject(error)
      }
    }
  })
}

function ensureFileSaveExtension(filePath: string, extension: string): string {
  if (!extension) return filePath
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  return filePath.toLowerCase().endsWith(ext.toLowerCase()) ? filePath : `${filePath}${ext}`
}

function suggestedFileSaveName(data: Record<string, unknown>): string {
  const source = getFileMessageSource(data)
  const name = sanitizeFileName(source.name || String(data.messageId || 'file'))
  if (!source.ext || name.toLowerCase().endsWith(`.${source.ext}`)) return name
  return `${name}.${source.ext}`
}

// 记录本次会话里文件消息“另存为”的实际目标，避免打开目录回到内部缓存文件名。
const officeFileSavedPathByMessageKey = new Map<string, string>()

function officeFileSavedPathKey(data?: Record<string, unknown>): string {
  return String(data?.messageId || data?.msgId || data?.customMsgId || '').trim()
}

function rememberSavedOfficeFilePath(data: Record<string, unknown> | undefined, filePath: string) {
  const key = officeFileSavedPathKey(data)
  const normalizedPath = String(filePath || '').trim()
  if (!key || !normalizedPath) return
  officeFileSavedPathByMessageKey.set(key, normalizedPath)
}

async function resolveRememberedOfficeFilePath(data: Record<string, unknown>): Promise<string> {
  const key = officeFileSavedPathKey(data)
  if (!key) return ''

  const rememberedPath = String(officeFileSavedPathByMessageKey.get(key) || '').trim()
  if (!rememberedPath) return ''
  if (await tauriFileExists(rememberedPath)) return rememberedPath

  officeFileSavedPathByMessageKey.delete(key)
  return ''
}

async function resolveOfficeFileCachePath(data: Record<string, unknown>): Promise<string> {
  const source = getFileMessageSource(data)
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const baseDir = await appDataDir()
  const messageId = imageCacheSafeName(String(data.messageId || data.msgId || 'file'))
  return join(baseDir, 'file-cache', messageId, suggestedFileSaveName(data) || source.name)
}

async function ensureOfficeFileLocalFile(data: Record<string, unknown>): Promise<string> {
  const source = getFileMessageSource(data)
  const url = source.url
  if (!url || isBlobOrDataUrl(url)) throw new Error('文件地址不可用')

  if (!isRemoteUrl(url)) {
    const localPath = toFsPath(url)
    if (await tauriFileExists(localPath)) return localPath
    throw new Error('本地文件不存在')
  }

  const savePath = await resolveOfficeFileCachePath(data)
  if (await tauriFileExists(savePath)) return savePath

  const key = await resolveFileMessageKey(data)
  const menuChannel = buildContextMenuDownloadChannel(data, 'file')
  const requestState = registerContextMenuDownloadRequest(menuChannel)
  // 文件密钥可能为空（明文文件），此时仍走同一下载链路，避免把“可下载文件”误判成失败。
  const result = await waitForOfficeFileDownload(url, key, savePath, menuChannel, requestState, {
    urlCandidates: getOssDownloadCandidates({
      url,
      channelType: source.extra.channelType ?? source.extra.channel_type,
    }),
    msgType: Number(data.msgType || MessageType.File),
    sendTime: Number(data.sendTime || 0) || undefined,
  })
  // 对齐旧 im：右键“打开目录/另存为”允许继续使用隔离后的 .dangerous 文件路径，
  // 由用户在系统目录中手动确认来源并重命名后再打开。
  return result.filePath
}

async function saveOfficeFileAs(data: Record<string, unknown>) {
  if (!(window as any).__TAURI_INTERNALS__) return
  const source = getFileMessageSource(data)
  const { save } = await import('@tauri-apps/plugin-dialog')
  const suggestedName = suggestedFileSaveName(data)
  const extension = source.ext
  const defaultFileName = isMacOS()
    ? addSaveBaseNameGuard(suggestedName, extension)
    : ensureFileSaveExtension(suggestedName, extension)
  let defaultPath = defaultFileName
  if (isMacOS()) {
    try {
      const { downloadDir, join } = await import('@tauri-apps/api/path')
      defaultPath = await join(await downloadDir(), defaultFileName)
    } catch {
      defaultPath = defaultFileName
    }
  }
  const selectedPath = await save({
    defaultPath,
    ...(!isMacOS() && extension
      ? { filters: [{ name: '文件', extensions: [extension] }] }
      : {}),
  })
  if (!selectedPath) return

  const didUseGuardedPath = isMacOS() && hasSaveExtensionGuard(selectedPath)
  const selectedAlreadyHasExtension = extension
    ? selectedPath.toLowerCase().endsWith(`.${extension}`.toLowerCase())
    : false
  const finalPath = ensureFileSaveExtension(stripSaveExtensionGuard(selectedPath), extension)
  // macOS 普通文件和视频一样：默认不让原生 save 面板先按扩展名做同名判断；
  // 拿到路径后再补扩展名，并统一走应用内覆盖确认弹窗。
  const needsOverwriteConfirm = isMacOS() && !didUseGuardedPath && selectedAlreadyHasExtension
    ? false
    : await tauriFileExists(finalPath)
  if (needsOverwriteConfirm) {
    const confirmed = await promptImageOverwrite(finalPath)
    if (!confirmed) return
  }
  const localPath = await ensureOfficeFileLocalFile(data)
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('copy_file_overwrite', {
    sourcePath: localPath,
    targetPath: finalPath,
  })
  // 对齐旧 im：另存为成功后，“打开目录”应定位用户刚保存的新文件，而不是内部下载缓存。
  rememberSavedOfficeFilePath(data, finalPath)
  showToast(t('保存成功'))
}

async function openOfficeFileDirectory(data: Record<string, unknown>) {
  const rememberedPath = await resolveRememberedOfficeFilePath(data)
  const filePath = rememberedPath || await ensureOfficeFileLocalFile(data)
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('reveal_file_in_directory', { path: filePath })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })
}

function blobToPng(blob: Blob): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const src = await blobToDataUrl(blob)
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas context unavailable'))
          return
        }
        ctx.drawImage(image, 0, 0, width, height)
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error('png conversion failed'))
            return
          }
          resolve(pngBlob)
        }, 'image/png')
      }
      image.onerror = () => reject(new Error('image decode failed'))
      image.src = src
    } catch (error) {
      reject(error instanceof Error ? error : new Error('png conversion failed'))
    }
  })
}

function withClipboardTimeout<T>(task: Promise<T>, label: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out`))
    }, timeoutMs)

    task.then((result) => {
      window.clearTimeout(timer)
      resolve(result)
    }).catch((error) => {
      window.clearTimeout(timer)
      reject(error)
    })
  })
}

async function writeImageBlobWithWebClipboard(blob: Blob, mime: string) {
  const ClipboardItemCtor = window.ClipboardItem
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error('clipboard image write unsupported')
  }
  await withClipboardTimeout(
    navigator.clipboard.write([new ClipboardItemCtor({ [mime]: blob })]),
    'web clipboard image write',
  )
}

async function writeImageBlobWithNativeClipboard(blob: Blob) {
  if (!(window as any).__TAURI_INTERNALS__) {
    throw new Error('native clipboard image write unsupported')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const dataUrl = await blobToDataUrl(blob)
  const dataBase64 = dataUrl.split(',', 2)[1] || ''
  if (!dataBase64) {
    throw new Error('image base64 encode failed')
  }
  await withClipboardTimeout(
    invoke('write_clipboard_image', { dataBase64 }),
    'native clipboard image write',
    8000,
  )
}

async function writeLocalImageWithNativeClipboard(path: string) {
  if (!(window as any).__TAURI_INTERNALS__) {
    throw new Error('native clipboard image path write unsupported')
  }
  const filePath = toFsPath(path)
  if (!filePath) {
    throw new Error('image local path unavailable')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  // 对齐旧 im：本地图片复制直接让原生层读磁盘写剪贴板，避免 fetch(asset/local-resource) 被 CORS 拦截。
  await withClipboardTimeout(
    invoke('write_clipboard_image_from_path', { path: filePath }),
    'native clipboard image path write',
    8000,
  )
}

async function writeRemoteImageWithNativeClipboard(url: string) {
  if (!(window as any).__TAURI_INTERNALS__) {
    throw new Error('native clipboard image url write unsupported')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  // 桌面端远端图片复制交给主进程下载，避开 WebView fetch 被图片域名 CORS 拦截。
  await withClipboardTimeout(
    invoke('write_clipboard_image_from_url', { url }),
    'native clipboard image url write',
    12000,
  )
}

async function copyImageToClipboard(src: string) {
  if ((window as any).__TAURI_INTERNALS__ && /^https?:\/\//i.test(src)) {
    try {
      await writeRemoteImageWithNativeClipboard(src)
      return
    } catch (error) {
      console.warn('[clipboard] native image url write failed, fallback to web:', error)
    }
  }

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`image fetch failed: ${response.status}`)
  }

  let blob = await response.blob()
  let mime = blob.type || 'image/png'

  if (mime !== 'image/png') {
    blob = await blobToPng(blob)
    mime = 'image/png'
  }

  let triedWebClipboard = false
  let triedNativeClipboard = false
  if ((window as any).__TAURI_INTERNALS__ && isWindowsOS()) {
    triedWebClipboard = true
    try {
      await writeImageBlobWithWebClipboard(blob, mime)
      return
    } catch (error) {
      console.warn('[clipboard] web image write failed, fallback to native:', error)
    }
  }

  if ((window as any).__TAURI_INTERNALS__) {
    triedNativeClipboard = true
    try {
      await writeImageBlobWithNativeClipboard(blob)
      return
    } catch (error) {
      console.warn('[clipboard] native image write failed, fallback to web:', error)
    }
  }

  if (!triedWebClipboard) {
    try {
      await writeImageBlobWithWebClipboard(blob, mime)
      return
    } catch (error) {
      if (!(window as any).__TAURI_INTERNALS__) {
        throw error
      }
      console.warn('[clipboard] web image write failed, fallback to native:', error)
    }
  }

  if ((window as any).__TAURI_INTERNALS__ && !triedNativeClipboard) {
    await writeImageBlobWithNativeClipboard(blob)
    return
  }
}

async function copyMessageText(data: Record<string, unknown>) {
  // 选中消息局部文字后右键复制时，优先复制选区；未选中时保持复制整条消息。
  const selectedText = String(data.selectedText || '')
  const text = selectedText || normalizeCopyTextContent(data.content, parseMessageExtra(data))
  copyDebugLog('copy message text resolved', {
    ...getCopyDebugMessageData(data),
    copySource: selectedText ? 'selectedText' : 'messageContent',
    resolvedTextLength: text.length,
    resolvedTextHead: copyDebugPreview(text),
    resolvedTextTail: text.length > 160 ? text.slice(-160) : '',
  }, 'info')
  await writeTextClipboard(text)
}

async function copyMessageImage(data: Record<string, unknown>) {
  let imageSrc = String(data.imageSrc || '').trim()
  const imagePath = String(data.imagePath || '').trim()
  if ((window as any).__TAURI_INTERNALS__ && imagePath) {
    await writeLocalImageWithNativeClipboard(imagePath)
    return
  }
  if (!imageSrc) {
    throw new Error('image source unavailable')
  }
  if ((window as any).__TAURI_INTERNALS__ && isLocalLikePath(imageSrc)) {
    // 右键数据偶发只有本地展示 URL、没有 data-local-path；仍按旧 im 走原生剪贴板，避免 fetch 本地协议失败。
    await writeLocalImageWithNativeClipboard(imageSrc)
    return
  }
  await copyImageToClipboard(imageSrc)
}

function formatCopyMessageInfoTime(timestamp: unknown): string {
  const date = new Date(Number(timestamp || 0))
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function parseRawContentObject(rawContent: unknown): Record<string, unknown> | null {
  const text = String(rawContent || '').trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function toLegacyIdValue(value: unknown): string | number {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d+$/.test(text)) {
    const asNumber = Number(text)
    if (Number.isSafeInteger(asNumber)) return asNumber
  }
  return text
}

function buildLegacyMessageUser(senderId: string): Record<string, unknown> | null {
  if (!senderId) return null
  const contact = contactStore.getContact(senderId)
  const displayName = contactStore.getDisplayName(senderId) || senderId
  const conv = chatStore.currentConversation
  const groupId = conv?.type === ConversationType.Group ? conv.targetId : ''
  const member = groupId
    ? groupStore.getMembers(groupId).find((item) => item.userId === senderId)
    : undefined

  return {
    uid: senderId,
    nickName: member?.nickname || contact?.nickname || displayName,
    identify: '--',
    createTime: '',
  }
}

function buildCopyMessageInfo(data: Record<string, unknown>): Record<string, unknown> {
  const convId = String(chatStore.currentConversationId || '').trim()
  const messageId = String(data.messageId || '').trim()
  const sourceMessage = convId && messageId
    ? messageStore.getMessages(convId).find((item) => item.id === messageId)
    : null
  const extraData = parseMessageExtra(sourceMessage ? { extra: sourceMessage.extra } : data)
  const msgType = Number(sourceMessage?.msgType ?? data.msgType ?? 0)
  const senderId = String(sourceMessage?.senderId ?? data.senderId ?? '').trim()
  const isSelf = Boolean(data.isSelf ?? (sourceMessage ? sourceMessage.senderId === authStore.uid : senderId === authStore.uid))
  const sendTime = Number(sourceMessage?.sendTime ?? data.sendTime ?? 0)
  const rawContent = sourceMessage?.content ?? data.content ?? ''
  const currentConversation = chatStore.currentConversation
  const currentTargetId = String(currentConversation?.targetId || '').trim()
  const currentType = currentConversation?.type
  const currentTypeText =
    currentType === ConversationType.Group
      ? 'group'
      : currentType === ConversationType.Channel
        ? 'channel'
        : 'friend'
  const currentName =
    currentType === ConversationType.Group
      ? (groupStore.getGroup(currentTargetId)?.name || currentTargetId)
      : currentType === ConversationType.Channel
        ? (channelStore.getChannel(currentTargetId)?.channelName || channelStore.getChannel(currentTargetId)?.name || currentTargetId)
        : (contactStore.getDisplayName(currentTargetId) || currentTargetId)
  const legacyUser = buildLegacyMessageUser(senderId)
  const msgIdValue = toLegacyIdValue(messageId || sourceMessage?.id || data.id || '')
  const groupIdValue = currentType === ConversationType.Group ? toLegacyIdValue(currentTargetId) : undefined
  const sendUidValue = toLegacyIdValue(senderId)
  const atUsers = Array.isArray(extraData.atUsers) ? extraData.atUsers : []
  const atUids = atUsers
    .map((item) => item?.uid ?? item?.userId ?? item?.id)
    .filter((item) => item != null && String(item).trim() !== '')
    .map((item) => toLegacyIdValue(item))
  const links = Array.isArray(extraData.links)
    ? extraData.links
    : Array.isArray(data.links)
      ? data.links
      : []

  return {
    msgType,
    atUids,
    atUsers,
    links,
    sendUid: sendUidValue,
    groupId: groupIdValue,
    content: rawContent,
    sendTime,
    msgId: msgIdValue,
    sendMember: currentType === ConversationType.Group
      ? {
          user: legacyUser,
          groupId: String(currentTargetId || ''),
          score: data.sendMember && typeof data.sendMember === 'object'
            ? (data.sendMember as Record<string, unknown>).score ?? undefined
            : undefined,
        }
      : undefined,
    version: Number(sourceMessage?.version ?? data.version ?? extraData.version ?? 1),
    contentMd5: String(extraData.contentMd5 || ''),
    groupName: currentType === ConversationType.Group ? currentName : undefined,
    sentOverTime: Number(data.sentOverTime ?? sendTime),
    customMsgId: String(sourceMessage?.customMsgId ?? data.customMsgId ?? ''),
    MsgID: msgIdValue,
    UserID: sendUidValue,
    isSelf,
    ChatType: msgType,
    chatType: msgType,
    id: currentType === ConversationType.Group || currentType === ConversationType.Channel
      ? toLegacyIdValue(currentTargetId)
      : sendUidValue,
    name: currentName,
    sendUserName: isSelf ? '' : `${legacyUser?.nickName || senderId}：`,
    time: sendTime,
    type: currentTypeText,
    user: legacyUser,
    showTimeDay: chatPageDateformat(sendTime, t, appLocale.value),
    sendTimeStr: formatCopyMessageInfoTime(sendTime),
    sendLog: `${String(sourceMessage?.customMsgId ?? data.customMsgId ?? '')}: ${String(msgIdValue)} | 无记录`,
  }
}

function normalizeImageFileName(fileName: string): string {
  const sanitized = String(fileName || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/\.[^.]+$/, '')

  return `${sanitized || 'image'}.png`
}

const imageSavedPathByMessageKey = new Map<string, string>()

function imageSavedPathKey(data?: Record<string, unknown>): string {
  return String(data?.messageId || data?.msgId || data?.customMsgId || '').trim()
}

function rememberSavedImagePath(data: Record<string, unknown> | undefined, filePath: string) {
  const key = imageSavedPathKey(data)
  const normalizedPath = String(filePath || '').trim()
  if (!key || !normalizedPath) return
  imageSavedPathByMessageKey.set(key, normalizedPath)
}

async function resolveRememberedImagePath(data: Record<string, unknown>): Promise<string> {
  const key = imageSavedPathKey(data)
  if (!key) return ''

  const rememberedPath = String(imageSavedPathByMessageKey.get(key) || '').trim()
  if (!rememberedPath) return ''
  if (await tauriFileExists(rememberedPath)) return rememberedPath

  imageSavedPathByMessageKey.delete(key)
  return ''
}

function suggestImageSaveName(data: Record<string, unknown>): string {
  const rawContent = String(data.content || '').trim()
  if (!rawContent) return normalizeImageFileName(String(data.messageId || 'image'))

  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    const explicitName = String(parsed.name || '').trim()
    if (explicitName) return normalizeImageFileName(explicitName)

    const rawUrl = String(parsed.url || parsed.fileUrl || parsed.thumbnailUrl || parsed.thumbUrl || '').trim()
    if (rawUrl) {
      const fileName = rawUrl.split('?')[0].split('/').pop() || ''
      if (fileName) return normalizeImageFileName(fileName)
    }
  } catch {
    // ignore invalid image payload
  }

  return normalizeImageFileName(String(data.messageId || 'image'))
}

async function saveImageAs(src: string, suggestedName: string, data?: Record<string, unknown>) {
  let tauriTargetPath = ''

  if ((window as any).__TAURI_INTERNALS__) {
    const {
      filePath,
      canceled,
      needsOverwriteConfirm,
    } = await userSelectPngSavePathWithOverwrite(suggestedName)
    if (!filePath || canceled) return
    const finalPath = filePath.toLowerCase().endsWith('.png') ? filePath : `${filePath}.png`
    tauriTargetPath = finalPath
    if (needsOverwriteConfirm) {
      const confirmed = await promptImageOverwrite(finalPath)
      if (!confirmed) return
    }

    if (data) {
      try {
        const localPath = await ensureImageCacheFile(data)
        if (localPath) {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('copy_file_overwrite', {
            sourcePath: localPath,
            targetPath: finalPath,
          })
          // 对齐旧 im：另存为成功后，后续“打开目录”应回到用户选择的新文件。
          rememberSavedImagePath(data, finalPath)
          showToast(t('保存成功'))
          return
        }
      } catch (error) {
        console.warn('[image-save] local copy fallback failed:', error)
      }
    }
  }

  const source = data && (window as any).__TAURI_INTERNALS__
    ? (() => {
        try {
          const imagePath = String(data.imagePath || '').trim()
          if (imagePath) return toDisplaySrc(imagePath)
        } catch {
          // ignore local path conversion failure and fallback to original src
        }
        return src
      })()
    : src
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`image fetch failed: ${response.status}`)
  }

  let blob = await response.blob()
  if ((blob.type || 'image/png') !== 'image/png') {
    blob = await blobToPng(blob)
  }

  const dataUrl = await blobToDataUrl(blob)

  if ((window as any).__TAURI_INTERNALS__) {
    if (!tauriTargetPath) {
      throw new Error('image save target path unavailable')
    }
    const err = await exportBase64ImgToLocal(dataUrl, tauriTargetPath)
    if (err) {
      throw err
    }
    rememberSavedImagePath(data, tauriTargetPath)
    showToast(t('保存成功'))
    return
  }

  const link = document.createElement('a')
  link.download = suggestedName
  link.href = dataUrl
  link.click()
  showToast(t('保存成功'))
}

const contextMenuVariant = computed(() =>
  uiStore.contextMenuData.type === 'message' ? 'im' : 'default',
)

const contextMenuItems = computed((): MenuItem[] => {
  const data = uiStore.contextMenuData
  if (data.type === 'conversation') {
    // 与旧 im chats/index.vue 右键一致：删除 → 消息置顶 → 消息免打扰 → 归档（纯文案、无分隔线）
    return [
      { key: 'delete', label: t('删除聊天'), danger: true },
      { key: 'pin', label: data.isPinned ? t('取消置顶') : t('消息置顶') },
      { key: 'mute', label: data.isMuted ? t('取消消息免打扰') : t('消息免打扰') },
      { key: 'archive', label: data.isArchived ? t('取消归档') : t('归档') },
      // im-new 扩展菜单（旧 im 无此项；按需恢复）
      // { key: 'read', label: t('标记已读') },
    ]
  }
  if (data.type === 'message') {
    if (data.avatarMenu === true && data.conversationType === ConversationType.Group) {
      // 对齐旧 im：群聊头像右键只显示“@成员”，避免出现复制/删除等消息菜单。
      const memberName = String(data.senderName || '').replace(/^@+/, '').trim()
      const avatarItems = memberName ? [{ key: 'at_member', label: `@${memberName}` }] : []
      copyDebugLog('message menu built for avatar', {
        ...getCopyDebugMessageData(data),
        itemKeys: avatarItems.map((item) => item.key),
      }, 'info')
      return avatarItems
    }

    const items: MenuItem[] = []
    const readBurnOnlyDelete = isReadBurnMessage(data)
    const isGroupIntroNoticeMenu = Boolean(data.isGroupIntroNotice)
    const channelCopyForwardRestricted = isCurrentChannelContentSaveRestricted()
    const supportsTextCopy = messageSupportsCopy(data.msgType)
    const supportsImageCopy = messageSupportsImageCopy(data)
    const supportsVideoCopy = messageSupportsVideoCopy(data)

    if (!readBurnOnlyDelete && (supportsTextCopy || supportsImageCopy || supportsVideoCopy)) {
      items.push({ key: 'copy', label: t('复制'), iconSrc: menuCopy })
    }

    if (!readBurnOnlyDelete && (messageSupportsImageSave(data) || messageSupportsVideoFileActions(data) || messageSupportsFileActions(data))) {
      items.push({ key: 'save_as', label: t('另存为'), iconSrc: menuSave })
    }

    if (!readBurnOnlyDelete && (messageSupportsImageOpenDirectory(data) || messageSupportsVideoOpenDirectory(data) || messageSupportsFileActions(data))) {
      items.push({ key: 'open_directory', label: t('打开目录'), iconSrc: menuOpenDir })
    }

    if (messageSupportsDeleteEverywhere(data)) {
      items.push({
        key: 'delete_everyone',
        label: deleteEveryoneLabelForConversation(),
        iconSrc: menuDelete,
      })
    }

    items.push({ key: 'delete_local', label: t('从本地删除'), iconSrc: menuDelete })

    if (!readBurnOnlyDelete) {
      items.push({ key: 'select', label: t('选中'), iconSrc: menuSelect })
      if (data.isSelf === true && hasCurrentChannelReplyAuthority()) {
        items.push({ key: 'reply', label: t('回复'), iconSrc: menuReply })
      }
      if (!isGroupIntroNoticeMenu && !channelCopyForwardRestricted) {
        items.push({ key: 'forward', label: t('转发'), iconSrc: menuForward })
      }
    }

    if (!readBurnOnlyDelete && canCopyMessageInfo()) {
      items.push({ key: 'copy_msg_info', label: t('复制消息信息'), iconSrc: menuCopy })
    }

    if (!readBurnOnlyDelete && !isGroupIntroNoticeMenu && messageSupportsGroupReadCount(data)) {
      items.push({
        key: 'group_read_count',
        label: groupReadCountLabel(data),
        iconSrc: menuMore,
        children: getGroupReadUserMenuItems(data),
      })
    }
    copyDebugLog('message menu built', {
      ...getCopyDebugMessageData(data),
      itemKeys: items.map((item) => item.key),
      hasCopyItem: items.some((item) => item.key === 'copy'),
      readBurnOnlyDelete,
      isGroupIntroNoticeMenu,
      supportsTextCopy,
      supportsImageCopy,
      supportsVideoCopy,
    }, 'info')
    return items
  }
  return []
})

async function handleContextMenuSelect(key: string) {
  const data = uiStore.contextMenuData
  if (data.type === 'conversation') {
    const convId = data.conversationId as string
    switch (key) {
      case 'pin':
        await chatStore.pinConversation(authStore.uid, convId, !data.isPinned)
        break
      case 'mute':
        await chatStore.muteConversation(authStore.uid, convId, !data.isMuted)
        break
      // case 'read':
      //   await chatStore.markAsRead(authStore.uid, convId)
      //   break
      case 'archive':
        await chatStore.archiveConversation(authStore.uid, convId, !data.isArchived)
        break
      case 'delete':
        openDeleteConversationConfirm(convId)
        break
    }
  }
  if (data.type === 'message') {
    const msgId = data.messageId as string
    const convId = chatStore.currentConversationId
    copyDebugLog('message menu select', {
      ...getCopyDebugMessageData(data),
      key,
    }, 'info')
    if (isReadBurnMessage(data) && key !== 'delete_everyone' && key !== 'delete_local') {
      copyDebugLog('message menu select ignored by read burn', {
        ...getCopyDebugMessageData(data),
        key,
      }, 'warn')
      return
    }
    if (
      isCurrentChannelContentSaveRestricted()
      && (key === 'copy' || key === 'forward')
    ) {
      showToast(t('频道已限制保存内容'), 'error')
      return
    }
    if (
      isCurrentChannelContentSaveRestricted()
      && (key === 'save_as' || key === 'open_directory')
      && (messageSupportsImageCopy(data) || messageSupportsImageSave(data) || messageSupportsVideoFileActions(data) || messageSupportsFileActions(data))
    ) {
      showToast(t('频道已限制保存内容'), 'error')
      return
    }
    switch (key) {
      case 'copy': {
        if (messageSupportsImageCopy(data)) {
          try {
            await copyMessageImage(data)
            copyDebugLog('copy image success', getCopyDebugMessageData(data), 'info')
            showToast(t('复制成功'))
          } catch (error) {
            console.warn('[clipboard] copy image failed:', error)
            copyDebugLog('copy image failed', {
              ...getCopyDebugMessageData(data),
              error: error instanceof Error ? error.message : String(error),
            }, 'error')
            showToast(t('复制失败'), 'error')
          }
          break
        }
        if (!messageSupportsCopy(data.msgType)) {
          copyDebugLog('copy text ignored by unsupported msgType', getCopyDebugMessageData(data), 'warn')
          break
        }
        try {
          await copyMessageText(data)
          copyDebugLog('copy text success', getCopyDebugMessageData(data), 'info')
          showToast(t('复制成功'))
        } catch (error) {
          console.warn('[clipboard] copy text failed:', error)
          copyDebugLog('copy text failed', {
            ...getCopyDebugMessageData(data),
            error: error instanceof Error ? error.message : String(error),
          }, 'error')
          showToast(t('复制失败'), 'error')
        }
        break
      }
      case 'save_as': {
        if (messageSupportsFileActions(data)) {
          try {
            await saveOfficeFileAs(data)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            showToast(t('保存失败详情', { detail }), 'error')
          }
          break
        }
        if (messageSupportsVideoFileActions(data)) {
          try {
            await saveVideoAs(data)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            showToast(t('保存失败详情', { detail }), 'error')
          }
          break
        }
        if (!messageSupportsImageSave(data)) break
        const imageSrc = String(data.imageSrc || '').trim()
        if (!imageSrc) break
        try {
          await saveImageAs(imageSrc, suggestImageSaveName(data), data)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          showToast(t('保存失败详情', { detail }), 'error')
        }
        break
      }
      case 'open_directory': {
        if (messageSupportsFileActions(data)) {
          try {
            await openOfficeFileDirectory(data)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            showToast(t('打开目录失败详情', { detail }), 'error')
          }
          break
        }
        if (messageSupportsVideoOpenDirectory(data)) {
          try {
            await openVideoDirectory(data)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            showToast(t('打开目录失败详情', { detail }), 'error')
          }
          break
        }
        if (!messageSupportsImageOpenDirectory(data)) break
        try {
          await openImageDirectory(data)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          showToast(t('打开目录失败详情', { detail }), 'error')
        }
        break
      }
      case 'delete_everyone':
        if (convId) messageStore.deleteMessage(convId, msgId)
        chatStore.recallMessage(authStore.uid, msgId, convId || undefined).catch((error) => {
          console.warn('[message-menu] remote delete failed:', error)
        })
        break
      case 'delete_local':
        if (convId) await messageStore.deleteMessageLocal(convId, msgId)
        break
      case 'select':
        uiStore.enterSelectionMode({
          id: msgId,
          msgId: (data.msgId as string) || msgId,
          isSelf: Boolean(data.isSelf),
        })
        break
      case 'reply': {
        const senderName = data.isSelf
          ? '我'
          : contactStore.getDisplayName(data.senderId as string)
        uiStore.setQuoteMessage({
          id: msgId,
          customMsgId: String(data.customMsgId || '') || null,
          senderId: data.senderId as string,
          senderName,
          msgType: data.msgType as number,
          content: data.content as string | null,
        })
        eventBus.emit('editor:focus')
        break
      }
      case 'forward':
        uiStore.openForwardDialog(msgId)
        break
      case 'at_member': {
        const uid = String(data.senderId || '').trim()
        const name = String(data.senderName || '').trim() || uid
        if (!uid || !name) break
        // 统一复用输入框现有的 @ 插入通道，保证桌面端/网页端行为一致。
        eventBus.emit('editor:insert-at', { uid, name })
        eventBus.emit('editor:focus')
        break
      }
      case 'copy_msg_info': {
        if (!canCopyMessageInfo()) break
        const info = JSON.stringify(buildCopyMessageInfo(data))
        try {
          await writeTextClipboard(info)
          showToast(t('复制成功'))
        } catch {
          /* clipboard may be unavailable */
        }
        break
      }
      case 'group_read_count':
        break
    }
  }
}

function getForwardSenderName(senderId: string) {
  if (!senderId) return ''
  if (senderId === authStore.uid) return '我'
  return contactStore.getDisplayName(senderId) || senderId
}

function getCurrentConversationForwardSenderName() {
  const conv = chatStore.currentConversation
  if (!conv) return '我'
  if (conv.type === ConversationType.Friend) {
    return contactStore.getDisplayName(conv.targetId) || conv.targetId || '我'
  }
  if (conv.type === ConversationType.Group) {
    return groupStore.getGroup(conv.targetId)?.name || conv.targetId || '我'
  }
  if (conv.type === ConversationType.Channel) {
    const channel = channelStore.getChannel(conv.targetId)
    return channel?.channelName || channel?.name || conv.targetId || '我'
  }
  return conv.targetId || '我'
}

function normalizeForwardImageContent(content: string, extra?: Record<string, unknown>): string {
  const raw = String(content || '').trim()
  const fileKey = String(extra?.fileKey || extra?.file_key || '').trim()

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return JSON.stringify({
      ...parsed,
      ...(fileKey ? { fileKey } : {}),
    })
  } catch {
    const [url = '', thumbnailUrl = '', size = '0', sizeType = '0'] = raw.split('||')
    return JSON.stringify({
      url: url.trim(),
      thumbnailUrl: (thumbnailUrl || url).trim(),
      size: Number(size || 0),
      sizeType: Number(sizeType || 0),
      ...(fileKey ? { fileKey } : {}),
    })
  }
}

function parseForwardExtra(raw: unknown): Record<string, unknown> | undefined {
  if (!raw) return undefined
  if (typeof raw === 'object') return raw as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

async function resolveForwardChannelFileKey(extra?: Record<string, unknown>): Promise<string> {
  const directFileKey = normalizeResolvedFileKey(
    extra?.fileKey || extra?.file_key || extra?.mediasCaptionFileKey || '',
  )
  if (directFileKey) return directFileKey

  const channelId = String(extra?.channelId || extra?.channel_id || '').trim()
  const attachmentKey = String(extra?.attachmentKey || extra?.attachment_key || '').trim()
  if (!channelId || !attachmentKey || !(window as any).__TAURI_INTERNALS__) return ''

  try {
    // 频道多图转发到单聊/群聊前，先把频道 attachmentKey 还原成真实 fileKey；
    // 发送到目标会话时协议层会再按目标 relKey 生成新的 attachmentKey。
    if (authStore.uid) await ensureChannelRelKey(authStore.uid, channelId)
    const { invoke } = await import('@tauri-apps/api/core')
    const resolved = await invoke<string>('decrypt_channel_incoming', {
      channelId,
      ciphertextHex: attachmentKey,
      msgType: 0,
    })
    return normalizeResolvedFileKey(resolved)
  } catch (error) {
    console.warn('[forward] resolve channel fileKey failed:', {
      channelId,
      attachmentKeyLen: attachmentKey.length,
      error: String(error),
    })
    return ''
  }
}

async function normalizeForwardExtraForTarget(
  item: ForwardDraftItem,
  targetType: number,
  targetId: string,
): Promise<ForwardDraftItem | null> {
  const extra = item.extra ? { ...item.extra } : undefined
  if (item.msgType !== MessageType.MediasCaption) return item
  // msgType 17 的附件解密必须依赖 extra 里的 fileKey/attachmentKey；缺失时直接拦截，避免发出破图消息。
  if (!extra) return null

  const fileKey = await resolveForwardChannelFileKey(extra)

  // 频道多图不能沿用来源频道的加密字段；保留明文 fileKey，让目标会话发送时重新加密附件 key。
  for (const key of [
    'attachmentKey',
    'attachment_key',
    'cipherHex',
    'cipherCandidates',
    'decryptPending',
    'contentMd5',
    'content_md5',
    'readTotal',
    'read_total',
  ]) {
    delete extra[key]
  }

  if (fileKey) extra.fileKey = fileKey
  else delete extra.fileKey
  delete extra.file_key

  if (targetType === ConversationType.Channel) {
    extra.channelId = targetId
  } else {
    delete extra.channelId
    delete extra.channel_id
  }

  if (targetType === ConversationType.Group) {
    extra.groupId = targetId
  } else {
    delete extra.groupId
    delete extra.group_id
  }

  if (!fileKey) return null

  return {
    ...item,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  }
}

function buildForwardDraftItems(): ForwardDraftItem[] {
  if (uiStore.forwardMessagePayload) {
    return [{
      msgType: uiStore.forwardMessagePayload.msgType,
      content: uiStore.forwardMessagePayload.msgType === MessageType.Image
        ? normalizeForwardImageContent(uiStore.forwardMessagePayload.content, uiStore.forwardMessagePayload.extra)
        : uiStore.forwardMessagePayload.content,
      extra: uiStore.forwardMessagePayload.extra,
      senderName: getCurrentConversationForwardSenderName(),
    }]
  }

  const msgId = uiStore.forwardMessageId
  const convId = chatStore.currentConversationId
  if (!msgId || !convId) return []

  const messages = messageStore.getMessages(convId)
  const selectedIds = uiStore.selectedMessageIds
  const msgsToForward = selectedIds.size > 0
    ? messages.filter(m => selectedIds.has(m.id))
    : messages.filter(m => m.id === msgId)

  return msgsToForward.map((msg) => {
    const extra = parseForwardExtra(msg.extra)
    return {
      msgType: msg.msgType,
      content: msg.msgType === MessageType.Image
        ? normalizeForwardImageContent(msg.content ?? '', extra)
        : msg.content ?? '',
      extra,
      senderName: getForwardSenderName(msg.senderId),
      previewSrc: msg.msgType === MessageType.Image && String(uiStore.contextMenuData.messageId || '') === msg.id
        ? String(uiStore.contextMenuData.imageSrc || '')
        : undefined,
    }
  })
}

function normalizeForwardTargetConvId(targetConvId: string): string {
  const raw = String(targetConvId || '').trim()
  if (!raw) return raw
  if (/^\d+_.+/.test(raw)) return raw
  if (chatStore.conversations.some((c) => c.id === raw)) return raw

  if (raw.startsWith('friend_')) {
    return `${ConversationType.Friend}_${raw.slice('friend_'.length)}`
  }
  if (raw.startsWith('group_')) {
    return `${ConversationType.Group}_${raw.slice('group_'.length)}`
  }
  if (raw.startsWith('channel_')) {
    return `${ConversationType.Channel}_${raw.slice('channel_'.length)}`
  }
  return raw
}

async function handleForward(targetConvId: string) {
  const normalizedTargetConvId = normalizeForwardTargetConvId(targetConvId)
  const [convTypeRaw, convTargetId = ''] = normalizedTargetConvId.split('_')
  const convType = Number(convTypeRaw)
  const sourceDrafts = buildForwardDraftItems()
  if (sourceDrafts.length === 0) return
  const drafts = (await Promise.all(
    sourceDrafts.map(item => normalizeForwardExtraForTarget(item, convType, convTargetId)),
  )).filter((item): item is ForwardDraftItem => Boolean(item))
  if (drafts.length === 0) {
    showToast(t('转发失败'), 'error')
    return
  }
  if (!Number.isNaN(convType) && convTargetId) {
    if (convType === ConversationType.Channel) {
      // 转发落到频道时后台补齐权限，不阻塞切换到目标会话。
      void channelStore.ensureChannelDetailReady(convTargetId)
    }
    chatStore.ensureConversation(convType, convTargetId)
  }

  uiStore.clearQuoteMessage()
  uiStore.setForwardDraft(normalizedTargetConvId, drafts)
  uiStore.exitSelectionMode()
  uiStore.closeForwardDialog()

  chatStore.setCurrentConversation(normalizedTargetConvId)
  // 转发落到新会话后，关闭之前会话残留的右侧信息面板（频道二维码/详情等）
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  eventBus.emit('editor:focus')
}

</script>

<template>
  <div class="main-layout" @contextmenu.prevent>
    <InitLoadingScreen
      :visible="!isInitialized"
      :text="initText"
      :resetting="resettingInitData"
      :offline="!networkStore.isOnline"
      :show-reload="initReloadVisible"
      :progress-mode="firstInitProgressVisible"
      :friend-progress="initFriendProgress"
      :chat-progress="initChatProgress"
      @reset="confirmInitReset"
      @reload="reloadInitPage"
    />

    <HomeTop />

    <div class="main-content">
      <HomeSidebar />

      <div class="content-area">
        <template v-if="showChatWindow">
          <ChatWindow />
        </template>
        <template v-else-if="uiStore.detailView === 'friend-detail'">
          <FriendDetail :contact-id="currentTargetId" />
        </template>
        <template v-else-if="uiStore.detailView === 'group-detail'">
          <GroupDetail :group-id="currentTargetId" />
        </template>
        <template v-else-if="uiStore.detailView === 'channel-detail'">
          <ChannelDetail :channel-id="currentTargetId" />
        </template>
        <template v-else-if="uiStore.detailView === 'friend-examine'">
          <FriendExamine />
        </template>
        <template v-else-if="uiStore.detailView === 'group-invitation'">
          <GroupInvitation />
        </template>
        <template v-else-if="uiStore.detailView === 'channel-notice-list'">
          <ChannelNotice />
        </template>
        <template v-else-if="uiStore.detailView === 'add-contact'">
          <AddContactPreview />
        </template>
        <template v-else-if="uiStore.detailView === 'add-group'">
          <AddGroupPreview />
        </template>
        <template v-else>
          <div class="default-content">
            <div class="empty-state">
              <img :src="emptyBrandImg" alt="" class="empty-brand-icon" />
            </div>
          </div>
        </template>

        <RightPanel />
      </div>
    </div>

    <!-- Network status bar -->
    <Transition name="slide-down">
      <div v-if="networkStore.reconnectingVisible" class="network-bar reconnecting">
        {{ $t('网络连接中...') }}
      </div>
      <div v-else-if="!networkStore.isOnline" class="network-bar offline">
        {{ $t('网络已断开') }}
      </div>
    </Transition>

    <!-- Global dialogs -->
    <SettingsDialog v-model:visible="uiStore.settingsVisible" />
    <PostUploadDialog v-model:visible="uiStore.postUploadVisible" />
    <AddContactDialog v-model:visible="uiStore.addContactVisible" />
    <AddGroupPreview
      mode="dialog"
      :visible="uiStore.addGroupDialogVisible"
      @close="uiStore.closeAddGroupDialog()"
    />
    <AddChannelDialog
      :visible="uiStore.addChannelDialogVisible"
      @close="uiStore.closeAddChannelDialog()"
    />
    <ForwardSelectDialog
      v-model:visible="uiStore.forwardDialogVisible"
      :message-id="uiStore.forwardMessageId"
      @forward="handleForward"
    />
    <FileImport
      :visible="uiStore.fileImportVisible"
      @close="uiStore.closeFileImport()"
    />
    <CreateGroupDialog
      :visible="uiStore.createGroupVisible"
      @close="uiStore.closeCreateGroup()"
    />
    <InviteFriendDialog
      :visible="uiStore.inviteFriendVisible"
      :group-id="uiStore.inviteFriendGroupId"
      :existing-member-ids="inviteExistingMemberIds"
      @close="uiStore.closeInviteFriend()"
      @invited="handleGlobalInviteInvited"
    />
    <GroupQRCode
      :visible="uiStore.groupQRCodeVisible"
      :group-id="uiStore.groupQRCodeTarget.id"
      :group-name="uiStore.groupQRCodeTarget.name"
      @close="uiStore.closeGroupQRCode()"
    />
    <UpVersionDialog
      :visible="uiStore.upVersionVisible"
      :info="uiStore.upVersionInfo"
      @close="uiStore.closeUpVersion()"
    />

    <MemberInfoDialog />

    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />

    <ImageOverwriteDialog
      v-model:visible="imageOverwriteVisible"
      :file-name="imageOverwriteFileName"
      :directory-name="imageOverwriteDirectoryName"
      @confirm="resolveImageOverwrite(true)"
      @cancel="resolveImageOverwrite(false)"
    />

    <ContextMenu
      v-model:visible="uiStore.contextMenuVisible"
      :x="uiStore.contextMenuPosition.x"
      :y="uiStore.contextMenuPosition.y"
      :variant="contextMenuVariant"
      :items="contextMenuItems"
      @select="handleContextMenuSelect"
    />

    <ConfirmDialog
      v-model:visible="deleteConversationConfirmVisible"
      variant="im"
      :content="$t('删除聊天后，将同时删除记录。包括聊天中的文件、图片、视频等内容')"
      @confirm="confirmDeleteConversation"
      @cancel="cancelDeleteConversation"
    />
  </div>
</template>

<style lang="scss" scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #fff;
  position: relative;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  padding-top: 32px;
}

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.default-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-brand-icon {
  width: 144px;
  height: auto;
  display: block;
}

.network-bar {
  position: absolute;
  top: 32px;
  left: 0;
  right: 0;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 100;

  &.reconnecting { background: #f6f6f6; color: #e6a23c; }
  &.offline { background: #fddcde; color: #f44e5a; }
}

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-100%); }

</style>
