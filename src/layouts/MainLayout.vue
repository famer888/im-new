<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  useChatStore,
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  isFileHelperTargetId,
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
import { ensureGroupRelKey, ensureOwnKeyPair } from '@/utils/e2ee'
import { getOrCreateInstallCode } from '@/utils/installCode'
import { convertFileSrc } from '@tauri-apps/api/core'

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

function setInitText(text: string) {
  initText.value = text
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
}

function refreshInitializedAccountData(uid: string) {
  if (!uid) return Promise.resolve([])
  return Promise.allSettled([
    contactStore.loadContacts(uid, { refreshRemote: true }),
    groupStore.loadGroups(uid, { forceApi: true }),
    channelStore.loadChannels(uid),
    settingStore.loadSettings(),
  ])
}

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
      console.warn('[init] chat list name warmup timed out, fallback to current local names')
    }
    uiStore.setChatListNamesReady(true)
  }
}

function isConversationInCurrentRelations(conv: Conversation): boolean {
  if (isFileHelperTargetId(conv.targetId)) return true
  if (conv.type === ConversationType.Friend) return Boolean(contactStore.getContact(conv.targetId))
  if (conv.type === ConversationType.Group) return Boolean(groupStore.getGroup(conv.targetId))
  if (conv.type === ConversationType.Channel) return Boolean(channelStore.getChannel(conv.targetId))
  return false
}

function pruneUnknownConversations() {
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

onMounted(async () => {
  startInitReloadTimer()
  window.addEventListener('focus', handleWindowFocusRefreshGroupMembers)
  document.addEventListener('visibilitychange', handleVisibilityRefreshGroupMembers)
  uiStore.setChatListNamesReady(true)

  try {
    setInitText(t('加载中'))
    await authStore.initSession()
    if (!authStore.uid) {
      uiStore.setChatListNamesReady(true)
      isInitialized.value = true
      clearInitReloadTimer()
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
      setFirstInitProgress(0, 0)

      try {
        await authStore.refreshProfile()
      } catch (error) {
        console.warn('[init] refresh profile failed:', error)
      }

      const skipBootstrapAfterLogoutClear = Boolean(
        localStorage.getItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${authStore.uid}`),
      )
      setInitText(t('数据载入'))
      if (firstInitProgressVisible.value) {
        uiStore.setChatListNamesReady(true)
        await contactStore.loadContacts(authStore.uid)
        setFirstInitProgress(100, 0)

        await Promise.all([
          groupStore.loadGroups(authStore.uid),
          channelStore.loadChannels(authStore.uid),
          settingStore.loadSettings(),
        ])

        await chatStore.loadConversations(authStore.uid)
        setFirstInitProgress(100, 100)
      } else if ((window as any).__TAURI_INTERNALS__) {
        // 所有 Tauri 桌面端（macOS/Windows）统一走这里：
        // 已初始化账号优先读本地；联系人名称对齐旧 im，加载后立即后台强刷远端通讯录。
        uiStore.setChatListNamesReady(false)
        await Promise.all([
          chatStore.loadConversations(authStore.uid),
          contactStore.loadContacts(authStore.uid),
          groupStore.loadGroups(authStore.uid, { fallbackToApi: false }),
          channelStore.loadChannels(authStore.uid, { refreshRemote: false }),
          settingStore.loadSettings({ syncRemote: false }),
        ])
        chatListNameWarmupPromise = refreshInitializedAccountData(authStore.uid).finally(() => {
          pruneUnknownConversations()
        })
      } else {
        uiStore.setChatListNamesReady(true)
        await Promise.all([
          chatStore.loadConversations(authStore.uid),
          contactStore.loadContacts(authStore.uid),
          groupStore.loadGroups(authStore.uid),
          channelStore.loadChannels(authStore.uid),
          settingStore.loadSettings(),
        ])
      }
      setInitText(t('数据已载入'))
      appLocale.value = settingStore.settings.language
      void preloadConversationSummariesNeedingNames(authStore.uid)
      pruneUnknownConversations()

      // Bootstrap: if no real conversations exist, seed from contacts/groups
      // (mirrors old im project's behavior of building the chat list from synced data)
      const hasRealConversations = chatStore.conversations.some(
        (c) => !isFileHelperTargetId(c.targetId) && isConversationInCurrentRelations(c),
      )
      if (!hasRealConversations && !skipBootstrapAfterLogoutClear) {
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
      }
      try {
        if ((window as any).__TAURI_INTERNALS__) {
          const { invoke } = await import('@tauri-apps/api/core')
          const uid = String(authStore.uid || '').trim()
          if (uid) {
            try {
              setInitText(t('加密检测'))

              // 对齐老 im：启动页只阻塞自身密钥初始化；联系人 relKey 在 WS 连接后由 tauri-events
              // 后台预热，避免联系人多时长时间停留在“加密检测”。
              await ensureOwnKeyPair(uid)
            } catch {
              // key prewarm best effort; do not block WS connect forever
            }
          }
          const wsUrl = authStore.wsConnectConfig?.wsUrl?.trim() || ''
          const aesKey = authStore.wsConnectConfig?.aesKey?.trim() || ''
          const sessionId = String(authStore.session?.sessionId || '').trim()
          const installCode = authStore.wsConnectConfig?.installCode || getOrCreateInstallCode()
          if (wsUrl && aesKey) {
            await invoke('connect_ws', { url: wsUrl, aesKey, sessionId, installCode, uid })
          } else {
            networkStore.setWsStatus('disconnected')
            console.warn('[ws] skipped connect: missing ws config')
          }
        }
      } catch (err) {
        networkStore.setWsStatus('disconnected')
        console.warn('[ws] connect failed:', err)
      }

      void releaseChatListNameGate(chatListNameWarmupPromise)

    }

    setInitText(t('完成'))
    chatStore.ensureFileHelperConversationInMemory()
    if (authStore.uid && firstInitProgressVisible.value) {
      authStore.markAccountInitialized(authStore.uid)
    }
    isInitialized.value = true
    clearInitReloadTimer()
  } catch (err) {
    uiStore.setChatListNamesReady(true)
    initReloadVisible.value = true
    console.warn('[init] bootstrap failed:', err)
  }

  // Listen for toast events from other components
  eventBus.on('show-toast', (payload) => {
    showToast(payload.message, payload.type)
  })
})

onBeforeUnmount(() => {
  clearInitReloadTimer()
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

  const currentUid = String(authStore.uid || localStorage.getItem('current-uid') || '').trim()
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
    const members = await groupStore.loadMembers(uid, groupId, { forceRemote: true })
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
  void refreshActiveGroupMembers('window-focus', true)
}

function handleVisibilityRefreshGroupMembers() {
  if (!document.hidden) {
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
    void refreshActiveGroupMembers('active-group-change', true)
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
  const t = Number(msgType)
  return t === MessageType.Text || t === MessageType.Html2
}

function messageSupportsImageCopy(data: Record<string, unknown>): boolean {
  return Number(data.msgType) === MessageType.Image
    && typeof data.imageSrc === 'string'
    && data.imageSrc.trim().length > 0
}

function messageSupportsImageSave(data: Record<string, unknown>): boolean {
  return Number(data.msgType) === MessageType.Image
    && typeof data.imageSrc === 'string'
    && data.imageSrc.trim().length > 0
}

function messageSupportsVideoFileActions(data: Record<string, unknown>): boolean {
  const conversationType = chatStore.currentConversation?.type
  return (conversationType === ConversationType.Friend || conversationType === ConversationType.Group)
    && Number(data.msgType) === MessageType.Video
    && Boolean(getVideoFileSource(data).url)
}

const OFFICE_COMPATIBLE_FILE_EXTENSIONS = new Set([
  'doc',
  'docx',
  'dot',
  'dotx',
  'rtf',
  'odt',
  'wps',
  'ppt',
  'pptx',
  'pps',
  'ppsx',
  'pot',
  'potx',
  'odp',
  'dps',
  'xls',
  'xlsx',
  'xlt',
  'xltx',
  'csv',
  'ods',
  'et',
])

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
  if (!(window as any).__TAURI_INTERNALS__) return false
  if (Number(data.msgType) !== MessageType.File) return false
  const source = getFileMessageSource(data)
  return Boolean(source.url) && OFFICE_COMPATIBLE_FILE_EXTENSIONS.has(source.ext)
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
  const normalized = String(text ?? '')
  const blob = new Blob([normalized], { type: 'text/plain' })
  const ClipboardItemCtor = window.ClipboardItem
  if (ClipboardItemCtor && navigator.clipboard?.write) {
    try {
      await withClipboardTimeout(
        navigator.clipboard.write([new ClipboardItemCtor({ 'text/plain': blob })]),
        'web clipboard text write',
      )
      return
    } catch (error) {
      console.warn('[clipboard] web text write failed:', error)
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await withClipboardTimeout(
        navigator.clipboard.writeText(normalized),
        'web clipboard text write',
      )
      return
    } catch (error) {
      console.warn('[clipboard] web text writeText failed:', error)
    }
  }
  if ((window as any).__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
    await withClipboardTimeout(
      invoke('write_clipboard_text', { text: normalized }),
      'native clipboard text write',
      5000,
    )
    return
  }
  throw new Error('clipboard text write unsupported')
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
  return chatStore.currentConversation?.type === ConversationType.Group
    && Boolean(data.isSelf)
    && Number(data.readStatus ?? 0) !== -1
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

function fileUrlToLocalPath(src: string): string {
  const raw = String(src || '').trim()
  if (!/^file:/i.test(raw)) return raw
  try {
    const parsed = new URL(raw)
    let pathname = decodeURIComponent(parsed.pathname.replace(/\+/g, ' '))
    if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1)
    return pathname
  } catch {
    return raw.replace(/^file:\/\/?/i, '')
  }
}

function getVideoFileSource(data: Record<string, unknown>): { url: string; fileKey: string; fileName: string } {
  const extra = parseMessageExtra(data)
  const rawContent = String(data.content || '').trim()
  let url = ''
  let fileName = ''
  let fileKey = String(extra.fileKey || extra.file_key || '').trim()

  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    url = normalizeVideoUrl(parsed.url || parsed.fileUrl || parsed.path || '')
    fileName = String(parsed.name || parsed.fileName || parsed.file_name || '').trim()
    fileKey = String(parsed.fileKey || parsed.file_key || fileKey).trim()
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
  if (hasVideoExt) return [raw]

  const suffixFromName = videoExtFromUrl(fileName)
  const suffixes = [suffixFromName, '.mp4', '.mov'].filter((item, index, list) => item && list.indexOf(item) === index)
  const withSuffix = suffixes.map(suffix => `${base}${suffix}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`)
  return [...new Set([...withSuffix, raw])]
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

  videoMenuLog('ensure local file start', {
    messageId: String(data.messageId || data.msgId || ''),
    urlHead: url.slice(0, 160),
    fileName: source.fileName,
    hasFileKey: Boolean(source.fileKey),
    fileKeyLen: source.fileKey.length,
    isRemote: isRemoteUrl(url),
  })

  if (!isRemoteUrl(url)) {
    const localPath = fileUrlToLocalPath(url)
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
        encrypted: Boolean(source.fileKey),
      })
      if (source.fileKey) {
        const menuChannel = buildContextMenuDownloadChannel(data, 'video')
        const requestState = registerContextMenuDownloadRequest(menuChannel)
        await waitForDownloadFile(
          candidate,
          source.fileKey,
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
      videoMenuLog('candidate download failed', {
        candidateHead: candidate.slice(0, 160),
        savePath,
        error: (error as Error)?.message || String(error),
      }, 'warn')
    }
  }

  throw lastError instanceof Error ? lastError : new Error('video download failed')
}

async function saveVideoAs(data: Record<string, unknown>) {
  if (!(window as any).__TAURI_INTERNALS__) return
  const { save } = await import('@tauri-apps/plugin-dialog')
  const suggestedName = suggestedVideoSaveName(data)
  const extension = videoExtFromUrl(suggestedName)
  const defaultFileName = isMacOS()
    ? addSaveExtensionGuard(suggestedName, extension)
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

  const finalPath = ensureVideoSaveExtension(stripSaveExtensionGuard(selectedPath), extension)
  if (await tauriFileExists(finalPath)) {
    const confirmed = await promptImageOverwrite(finalPath)
    if (!confirmed) return
  }
  const localPath = await ensureVideoLocalFile(data)
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('copy_file_overwrite', {
    sourcePath: localPath,
    targetPath: finalPath,
  })
  showToast(t('保存成功'))
}

async function openVideoDirectory(data: Record<string, unknown>) {
  videoMenuLog('open directory click', {
    messageId: String(data.messageId || data.msgId || ''),
    msgType: data.msgType,
    contentHead: String(data.content || '').slice(0, 260),
  })
  showToast('正在准备视频文件')
  const filePath = await ensureVideoLocalFile(data)
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

async function resolveFileMessageKey(data: Record<string, unknown>): Promise<string> {
  const source = getFileMessageSource(data)
  if (source.fileKey) return source.fileKey
  const plainAttachmentKey = fallbackPlainFileKey(source.attachmentKey)
  if (plainAttachmentKey) return plainAttachmentKey

  const groupId = getMessageGroupId(data)
  if (!source.attachmentKey || !groupId) return ''

  try {
    if (authStore.uid) {
      await ensureGroupRelKey(String(authStore.uid), groupId)
    }
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('decrypt_group_incoming', {
      groupId,
      ciphertextHex: source.attachmentKey,
      msgType: 0,
    })
  } catch {
    return ''
  }
}

async function waitForOfficeFileDownload(
  url: string,
  fileKey: string,
  savePath: string,
  msgId: string,
  requestState: ContextMenuDownloadRequestState,
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
    const localPath = fileUrlToLocalPath(url)
    if (await tauriFileExists(localPath)) return localPath
    throw new Error('本地文件不存在')
  }

  const savePath = await resolveOfficeFileCachePath(data)
  if (await tauriFileExists(savePath)) return savePath

  const key = await resolveFileMessageKey(data)
  if (!key) throw new Error('文件密钥缺失，无法下载')
  const menuChannel = buildContextMenuDownloadChannel(data, 'file')
  const requestState = registerContextMenuDownloadRequest(menuChannel)
  const result = await waitForOfficeFileDownload(url, key, savePath, menuChannel, requestState)
  if (result.isDangerous) throw new Error('高危文件已隔离，不支持直接打开或另存为')
  return result.filePath
}

async function saveOfficeFileAs(data: Record<string, unknown>) {
  if (!(window as any).__TAURI_INTERNALS__) return
  const source = getFileMessageSource(data)
  const { save } = await import('@tauri-apps/plugin-dialog')
  const suggestedName = suggestedFileSaveName(data)
  const extension = source.ext
  const defaultFileName = isMacOS()
    ? addSaveExtensionGuard(suggestedName, extension)
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
      ? { filters: [{ name: 'Office', extensions: [extension] }] }
      : {}),
  })
  if (!selectedPath) return

  const finalPath = ensureFileSaveExtension(stripSaveExtensionGuard(selectedPath), extension)
  if (await tauriFileExists(finalPath)) {
    const confirmed = await promptImageOverwrite(finalPath)
    if (!confirmed) return
  }
  const localPath = await ensureOfficeFileLocalFile(data)
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('copy_file_overwrite', {
    sourcePath: localPath,
    targetPath: finalPath,
  })
  showToast(t('保存成功'))
}

async function openOfficeFileDirectory(data: Record<string, unknown>) {
  const filePath = await ensureOfficeFileLocalFile(data)
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

async function copyImageToClipboard(src: string) {
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
  const text = normalizeCopyTextContent(data.content, parseMessageExtra(data))
  await writeTextClipboard(text)
}

async function copyMessageImage(data: Record<string, unknown>) {
  let imageSrc = String(data.imageSrc || '').trim()
  const imagePath = String(data.imagePath || '').trim()
  if ((window as any).__TAURI_INTERNALS__ && imagePath) {
    try {
      imageSrc = convertFileSrc(imagePath)
    } catch (error) {
      console.warn('[clipboard] image local path conversion failed:', error)
    }
  }
  if (!imageSrc) {
    throw new Error('image source unavailable')
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
          if (imagePath) return convertFileSrc(imagePath)
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
    const items: MenuItem[] = []
    const readBurnOnlyDelete = isReadBurnMessage(data)
    const isGroupIntroNoticeMenu = Boolean(data.isGroupIntroNotice)

    if (!readBurnOnlyDelete && (messageSupportsCopy(data.msgType) || messageSupportsImageCopy(data) || messageSupportsVideoCopy(data))) {
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
      if (!isGroupIntroNoticeMenu) {
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
    if (isReadBurnMessage(data) && key !== 'delete_everyone' && key !== 'delete_local') return
    switch (key) {
      case 'copy': {
        if (messageSupportsImageCopy(data)) {
          try {
            await copyMessageImage(data)
            showToast(t('复制成功'))
          } catch (error) {
            console.warn('[clipboard] copy image failed:', error)
            showToast(t('复制失败'), 'error')
          }
          break
        }
        if (!messageSupportsCopy(data.msgType)) break
        try {
          await copyMessageText(data)
          showToast(t('复制成功'))
        } catch (error) {
          console.warn('[clipboard] copy text failed:', error)
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
        chatStore.recallMessage(authStore.uid, msgId).catch((error) => {
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
    const extra = (() => {
      if (!msg.extra) return undefined
      try {
        return JSON.parse(msg.extra)
      } catch {
        return undefined
      }
    })()

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
  const drafts = buildForwardDraftItems()
  if (drafts.length === 0) return
  const normalizedTargetConvId = normalizeForwardTargetConvId(targetConvId)
  const [convTypeRaw, convTargetId = ''] = normalizedTargetConvId.split('_')
  const convType = Number(convTypeRaw)
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
