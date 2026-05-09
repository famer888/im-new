<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  useChatStore,
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
import ChannelDetail from '@/modules/channels/views/ChannelDetail.vue'
import RightPanel from '@/modules/chat/components/panels/RightPanel.vue'

import SettingsDialog from '@/modules/settings/views/SettingsDialog.vue'
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
import { ensureFriendRelKey, ensureOwnKeyPair } from '@/utils/e2ee'

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
const initResetConfirmVisible = ref(false)
const resettingInitData = ref(false)
const initReloadVisible = ref(false)
let initReloadTimer: number | null = null
let imageOverwriteResolver: ((value: boolean) => void) | null = null

function setInitText(text: string) {
  initText.value = text
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
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

  try {
    setInitText(t('加载中'))
    await authStore.initSession()
    if (!authStore.uid) {
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
        await contactStore.loadContacts(authStore.uid)
        setFirstInitProgress(100, 0)

        await Promise.all([
          groupStore.loadGroups(authStore.uid),
          channelStore.loadChannels(authStore.uid),
          settingStore.loadSettings(),
        ])

        await chatStore.loadConversations(authStore.uid)
        setFirstInitProgress(100, 100)
      } else {
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

              // 对齐老 im：先保证自身私钥与联系人 relKey 已就绪，再连 WS，避免首批私聊下行解密失败。
              await ensureOwnKeyPair(uid)
              for (const contact of contactStore.contacts) {
                if (!contact.id || contact.status <= 0) continue
                try {
                  await ensureFriendRelKey(uid, contact.id)
                } catch {
                  // ignore single-contact key prewarm failure
                }
              }
            } catch {
              // key prewarm best effort; do not block WS connect forever
            }
          }
          const wsUrl = authStore.wsConnectConfig?.wsUrl?.trim() || ''
          const aesKey = authStore.wsConnectConfig?.aesKey?.trim() || ''
          const sessionId = String(authStore.session?.sessionId || '').trim()
          const installCode = ''
          if (wsUrl && aesKey) {
            await invoke('connect_ws', { url: wsUrl, aesKey, sessionId, installCode })
          } else {
            networkStore.setWsStatus('disconnected')
            console.warn('[ws] skipped connect: missing ws config')
          }
        }
      } catch (err) {
        networkStore.setWsStatus('disconnected')
        console.warn('[ws] connect failed:', err)
      }

    }

    setInitText(t('完成'))
    chatStore.ensureFileHelperConversationInMemory()
    if (authStore.uid && firstInitProgressVisible.value) {
      authStore.markAccountInitialized(authStore.uid)
    }
    isInitialized.value = true
    clearInitReloadTimer()
  } catch (err) {
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
  if (imageOverwriteResolver) {
    imageOverwriteResolver(false)
    imageOverwriteResolver = null
  }
  eventBus.off('show-toast')
})

function openInitResetConfirm() {
  if (resettingInitData.value) return
  initResetConfirmVisible.value = true
}

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

/** 传输助手会话仅在侧栏「传输」选中时显示聊天窗，防止通讯录/消息下误显 */
const showChatWindow = computed(() => {
  if (uiStore.detailView !== 'chat' || !chatStore.currentConversationId) return false
  const isFileHelper = isFileHelperTargetId(chatStore.currentConversation?.targetId)
  if (isFileHelper && uiStore.sidebarTab !== 'transfer') return false
  return true
})

const fallbackChatConversation = computed(() => {
  if (uiStore.sidebarTab !== 'chats') return null
  return chatStore.conversations.find((conv) => {
    if (conv.isArchived !== uiStore.chatArchiveListShow) return false
    if (isFileHelperTargetId(conv.targetId)) return false
    return isConversationInCurrentRelations(conv)
  }) ?? null
})

function recoverBlankChatSelection() {
  if (uiStore.sidebarTab !== 'chats') return
  if (uiStore.detailView !== 'chat' && uiStore.detailView !== 'none') return
  if (chatStore.currentConversationId) return

  const conv = fallbackChatConversation.value
  if (!conv) return

  console.warn('[main-layout] recover blank chat selection', {
    id: conv.id,
    type: conv.type,
    targetId: conv.targetId,
    detailBefore: uiStore.detailView,
    archiveList: uiStore.chatArchiveListShow,
  })
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

watch(
  [
    () => uiStore.sidebarTab,
    () => uiStore.detailView,
    () => uiStore.chatArchiveListShow,
    () => chatStore.currentConversationId,
    () => chatStore.conversations,
    fallbackChatConversation,
  ],
  recoverBlankChatSelection,
  { deep: true, immediate: true },
)

const inviteExistingMemberIds = computed(() => {
  const members = groupStore.getMembers(uiStore.inviteFriendGroupId)
  return new Set(members.map(m => m.userId))
})

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

function normalizeCopyTextContent(rawContent: unknown, extraData: Record<string, unknown>): string {
  let content = String(rawContent || '')
  content = content.replace(/<img[^>]+data-key="(\[.*?\])"[^>]*>/g, '$1')

  const atUsers = Array.isArray(extraData.atUsers) ? extraData.atUsers : []
  if (atUsers.length > 0 && content.includes('@')) {
    for (const user of atUsers) {
      const nickName = typeof user?.nickName === 'string' ? user.nickName : ''
      const name = typeof user?.name === 'string' ? user.name : ''
      if (nickName && name) {
        content = content.replace(nickName, name)
      }
    }
  }

  return content
}

async function writeTextClipboard(text: string) {
  const normalized = String(text ?? '')
  const blob = new Blob([normalized], { type: 'text/plain' })
  const ClipboardItemCtor = window.ClipboardItem
  if (ClipboardItemCtor && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItemCtor({ 'text/plain': blob })])
    return
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalized)
    return
  }
  throw new Error('clipboard text write unsupported')
}

function getGroupReadTotal(data: Record<string, unknown>): number {
  const extra = parseMessageExtra(data)
  const readUsers = Array.isArray(extra.readUsers) ? extra.readUsers : []
  const readTotal = Number(extra.readTotal || 0)
  const fallbackReadCount =
    !Boolean(data.isSelf) && Number(data.readStatus || 0) > 0 ? 1 : 0
  return Math.max(readUsers.length, readTotal, fallbackReadCount)
}

function getGroupReadUserMenuItems(data: Record<string, unknown>): MenuItem[] {
  const extra = parseMessageExtra(data)
  const rawUsers = Array.isArray(extra.readUsers) ? extra.readUsers : []
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

function messageSupportsDeleteEverywhere(data: Record<string, unknown>): boolean {
  const conv = chatStore.currentConversation
  if (!conv || Number(data.readStatus ?? 0) === -1) return false
  if (conv.type === ConversationType.Friend) return true
  return Boolean(data.isSelf)
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
  const filePath = await ensureImageCacheFile(data)
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

  if ((window as any).__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
    const dataUrl = await blobToDataUrl(blob)
    const dataBase64 = dataUrl.split(',', 2)[1] || ''
    if (!dataBase64) {
      throw new Error('image base64 encode failed')
    }
    await invoke('write_clipboard_image', { dataBase64 })
    return
  }

  const ClipboardItemCtor = window.ClipboardItem
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error('clipboard image write unsupported')
  }
  await navigator.clipboard.write([new ClipboardItemCtor({ [mime]: blob })])
}

async function copyMessageText(data: Record<string, unknown>) {
  const text = normalizeCopyTextContent(data.content, parseMessageExtra(data))
  await writeTextClipboard(text)
}

async function copyMessageImage(data: Record<string, unknown>) {
  const imageSrc = String(data.imageSrc || '').trim()
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

async function saveImageAs(src: string, suggestedName: string) {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`image fetch failed: ${response.status}`)
  }

  let blob = await response.blob()
  if ((blob.type || 'image/png') !== 'image/png') {
    blob = await blobToPng(blob)
  }

  const dataUrl = await blobToDataUrl(blob)

  if ((window as any).__TAURI_INTERNALS__) {
    const {
      filePath,
      canceled,
      needsOverwriteConfirm,
    } = await userSelectPngSavePathWithOverwrite(suggestedName)
    if (!filePath || canceled) return
    const finalPath = filePath.toLowerCase().endsWith('.png') ? filePath : `${filePath}.png`
    if (needsOverwriteConfirm) {
      const confirmed = await promptImageOverwrite(finalPath)
      if (!confirmed) return
    }
    const err = await exportBase64ImgToLocal(dataUrl, finalPath)
    if (err) {
      throw err
    }
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

    if (messageSupportsCopy(data.msgType) || messageSupportsImageCopy(data)) {
      items.push({ key: 'copy', label: t('复制'), iconSrc: menuCopy })
    }

    if (messageSupportsImageSave(data)) {
      items.push({ key: 'save_as', label: t('另存为'), iconSrc: menuSave })
    }

    if (messageSupportsImageOpenDirectory(data)) {
      items.push({ key: 'open_directory', label: t('打开目录'), iconSrc: menuOpenDir })
    }

    if (messageSupportsDeleteEverywhere(data)) {
      items.push({
        key: 'delete_everyone',
        label: deleteEveryoneLabelForConversation(),
        iconSrc: menuDelete,
      })
    }

    items.push(
      { key: 'delete_local', label: t('从本地删除'), iconSrc: menuDelete },
      { key: 'select', label: t('选中'), iconSrc: menuSelect },
      { key: 'reply', label: t('回复'), iconSrc: menuReply },
      { key: 'forward', label: t('转发'), iconSrc: menuForward },
    )

    if (canCopyMessageInfo()) {
      items.push({ key: 'copy_msg_info', label: t('复制消息信息'), iconSrc: menuCopy })
    }

    if (messageSupportsGroupReadCount(data)) {
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
    switch (key) {
      case 'copy': {
        if (messageSupportsImageCopy(data)) {
          try { await copyMessageImage(data) } catch { /* clipboard may be unavailable */ }
          break
        }
        try { await copyMessageText(data) } catch { /* clipboard may be unavailable */ }
        break
      }
      case 'save_as': {
        if (!messageSupportsImageSave(data)) break
        const imageSrc = String(data.imageSrc || '').trim()
        if (!imageSrc) break
        try {
          await saveImageAs(imageSrc, suggestImageSaveName(data))
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          showToast(t('保存失败详情', { detail }), 'error')
        }
        break
      }
      case 'open_directory': {
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
        await chatStore.recallMessage(authStore.uid, msgId)
        if (convId) messageStore.deleteMessage(convId, msgId)
        break
      case 'delete_local':
        if (convId) messageStore.deleteMessage(convId, msgId)
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

function buildForwardDraftItems(): ForwardDraftItem[] {
  if (uiStore.forwardMessagePayload) {
    return [{
      msgType: uiStore.forwardMessagePayload.msgType,
      content: uiStore.forwardMessagePayload.content,
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

  return msgsToForward.map((msg) => ({
    msgType: msg.msgType,
    content: msg.content ?? '',
    extra: (() => {
      if (!msg.extra) return undefined
      try {
        return JSON.parse(msg.extra)
      } catch {
        return undefined
      }
    })(),
    senderName: getForwardSenderName(msg.senderId),
  }))
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
      @reset="openInitResetConfirm"
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
      <div v-if="networkStore.isReconnecting" class="network-bar reconnecting">
        {{ $t('网络连接中...') }}
      </div>
      <div v-else-if="!networkStore.isOnline" class="network-bar offline">
        {{ $t('网络已断开') }}
      </div>
    </Transition>

    <!-- Global dialogs -->
    <SettingsDialog v-model:visible="uiStore.settingsVisible" />
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
      v-model:visible="initResetConfirmVisible"
      variant="im"
      :content="$t('确认退出，并重置缓存数据？')"
      @confirm="confirmInitReset"
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
