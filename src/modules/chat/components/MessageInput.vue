<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageType, ConversationType } from '@/types'
import { useChatStore, isFileHelperTargetId } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useUIStore } from '@/stores/useUIStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { logChannelContentLimitDebug } from '@/utils/channelContentLimit'
import { eventBus } from '@/utils/eventBus'
import { writeClipboardText } from '@/utils/clipboard'
import { useEmojiPanelDismiss } from '@/composables/useEmojiPanelDismiss'
import { DEFAULT_READ_BURN_SECONDS, getReadBurnTimeText } from '@/utils/readBurn'
import { emojiObj } from '@/utils/emoji'
import { getUploadToken, getUploadUrl, updateContacts } from '@/api/imBase'
import { subscribeChannel, updateMember } from '@/api/imChannel'
import { proto } from '@/api/request'
import { aesEncrypt } from '@/utils/crypto'
import { getOssUploadCandidates, reportOssUploadCandidateFailure } from '@/utils/ossUploadDomains'
import type { OssUploadCandidate } from '@/utils/ossUploadDomains'
import { toDisplaySrc } from '@/utils/resourcePath'
import EmojiPicker from './send/EmojiPicker.vue'
import AtListDialog from './send/AtListDialog.vue'
import CreateLinkDialog from './send/CreateLinkDialog.vue'
import ScheduleDeletionDialog from './send/ScheduleDeletionDialog.vue'
import FileUploadPreview from './FileUploadPreview.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import type { MenuItem } from '@/components/ContextMenu.vue'
import Toast from '@/components/Toast.vue'
import iconSmallActive from '@/assets/images/activeIcon/small-active.png'
import iconFileActive from '@/assets/images/activeIcon/file-active.png'
import readBurnTimeIcon from '@/assets/images/chat/read-burn-time.png'
import forwardPreviewIcon from '@/assets/images/forward.png'
import clearIcon from '@/assets/images/message/icon-clear.png'
import replyPreviewIcon from '@/assets/images/menu/menu-reply-preview.svg'
import menuCopy from '@/assets/images/menu/copy.png'
import menuPaste from '@/assets/images/menu/paste.png'
import menuMore from '@/assets/images/menu/more.png'

const emit = defineEmits<{
  (e: 'send', content: string, msgType: number, extra?: Record<string, unknown>): void
}>()

const chatStore = useChatStore()
const groupStore = useGroupStore()
const contactStore = useContactStore()
const messageStore = useMessageStore()
const authStore = useAuthStore()
const settingStore = useSettingStore()
const uiStore = useUIStore()
const channelStore = useChannelStore()
const { t } = useI18n()
const content = ref('')
const editorRef = ref<HTMLDivElement | null>(null)
const showEmoji = ref(false)
const emojiToggleBtnRef = ref<HTMLElement | null>(null)
const emojiPickerPopoverRef = ref<HTMLElement | null>(null)
useEmojiPanelDismiss(showEmoji, emojiToggleBtnRef, emojiPickerPopoverRef)

function sendDiag(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
  void message
  void data
  void level
}
const showAtList = ref(false)
const atKeyword = ref('')
const atListRef = ref<{ handleKeyboard: (key: string) => void } | null>(null)
const suppressNextEnterKeyup = ref(false)
const showCreateLink = ref(false)
const showScheduleDeletion = ref(false)
const pendingFiles = ref<File[]>([])
const showFilePreview = ref(false)
const toolbarFileInputRef = ref<HTMLInputElement | null>(null)
/** 二维码转发（data: 图）：与老 im file-dialog 一致，弹出 FileUploadPreview */
const showQrForwardUpload = ref(false)
const qrForwardPendingFiles = ref<File[]>([])
const qrForwardAutoOpenToken = ref('')
const editorMenuVisible = ref(false)
const editorMenuX = ref(0)
const editorMenuY = ref(0)
const savedSelection = ref<Range | null>(null)
const editorUndoStack = ref<EditorHistoryEntry[]>([])
const editorRedoStack = ref<EditorHistoryEntry[]>([])
const selectedLinkText = ref('')
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const updatingChannelDisturb = ref(false)
const joiningChannel = ref(false)
const selectedAtMentions = new Map<string, { uid: string; matchName: string }>()

const isGroup = computed(() => chatStore.currentConversation?.type === ConversationType.Group)
const isFriend = computed(() => chatStore.currentConversation?.type === ConversationType.Friend)
const currentChannel = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return null
  return channelStore.getChannel(conv.targetId) ?? null
})
const emojiChatType = computed(() => {
  const type = chatStore.currentConversation?.type
  if (type === ConversationType.Group) return 'group'
  if (type === ConversationType.Channel) return 'channel'
  return 'friend'
})
const groupId = computed(() => chatStore.currentConversation?.targetId ?? '')
/** 与 im 传输助手一致：工具栏仅表情 + 文件 */
const isFileHelperChat = computed(
  () => isFileHelperTargetId(chatStore.currentConversation?.targetId),
)
const currentGroupMemberRole = computed(() => {
  const uid = String(authStore.uid || '')
  if (!groupId.value || !uid) return null
  const ownerId = groupStore.getGroup(groupId.value)?.ownerId
  if (ownerId && String(ownerId) === uid) return 0
  const memberRole = groupStore.getMembers(groupId.value).find((member) => member.userId === uid)?.role
  if (Number.isFinite(Number(memberRole))) return Number(memberRole)
  return null
})
const showShutupTip = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv) return false
  // 与 im send/index.vue 对齐：消息免打扰不影响输入区，仅群全员禁言才显示提示
  if (conv.type !== ConversationType.Group) return false
  const group = groupStore.getGroup(conv.targetId)
  // 与旧 im 的 bfShutup && memberType > 1 对齐：群主/管理员不受全员禁言限制；角色未知时不先误挡输入。
  return Boolean(group?.isMuted) && Number(currentGroupMemberRole.value) > 1
})
// 频道底部交互只信“详情态”，避免使用列表/缓存快照导致首屏误判为“加入频道”。
const currentChannelDetailStatus = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return 'idle'
  return channelStore.getChannelDetailStatus(conv.targetId)
})
const showChannelPermissionLoadingTip = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return false
  const status = currentChannelDetailStatus.value
  return status === 'idle' || status === 'loading'
})
const showChannelPermissionErrorTip = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return false
  return currentChannelDetailStatus.value === 'error'
})
const showChannelDisabledTip = computed(() => {
  const conv = chatStore.currentConversation
  const channel = currentChannel.value
  if (!conv || conv.type !== ConversationType.Channel || !channel) return false
  if (currentChannelDetailStatus.value !== 'ready') return false
  return Boolean(channel.isDisable || Number(channel.status ?? 0) === 3)
})
const showChannelJoinButton = computed(() => {
  const conv = chatStore.currentConversation
  const channel = currentChannel.value
  if (!conv || conv.type !== ConversationType.Channel || !channel) return false
  if (currentChannelDetailStatus.value !== 'ready') return false
  if (showChannelDisabledTip.value) return false
  return Number(channel.memberType ?? -1) === 0
})
const hasChannelPublishAuthority = computed(() => {
  const channel = currentChannel.value
  if (!channel) return true
  // 对齐老 im：频道主/管理员应始终可输入。部分线路偶发不返回 adminPrivacy 时，按成员身份兜底避免误判成只读。
  const memberType = Number(channel.memberType ?? -1)
  if (memberType === 1 || memberType === 2) return true
  const adminPrivacy = Number(channel.adminPrivacy ?? 0)
  return adminPrivacy > 0 && (adminPrivacy & 2) !== 0
})
const showChannelNotifyToggle = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel || !currentChannel.value) return false
  if (currentChannelDetailStatus.value !== 'ready') return false
  if (showChannelDisabledTip.value) return false
  if (showChannelJoinButton.value) return false
  return !hasChannelPublishAuthority.value
})
const channelNotifyText = computed(() =>
  toBool(currentChannel.value?.isDisturb ?? chatStore.currentConversation?.isMuted ?? false)
    ? t('永久静音')
    : t('接收通知'),
)
const inputPlaceholder = computed(() =>
  settingStore.settings.sendShortcutKey === 'Ctrl+Enter'
    ? t('CtrlEnter发送')
    : t('Enter发送'),
)
const showInputNoticeOnly = computed(() =>
  showChannelPermissionLoadingTip.value
  || showChannelPermissionErrorTip.value
  || showChannelDisabledTip.value
  || showChannelJoinButton.value
  || showChannelNotifyToggle.value
  || showShutupTip.value,
)
const convId = computed(() => chatStore.currentConversationId)
const scheduleDeletionTime = ref(0)
const currentContact = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Friend || isFileHelperTargetId(conv.targetId)) return null
  return contactStore.getContact(conv.targetId) ?? null
})
const currentGroup = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Group) return null
  return groupStore.getGroup(conv.targetId) ?? null
})
const showReadBurnTip = computed(() =>
  Boolean(currentContact.value?.bfReadCancel),
)
const currentForwardDraftItems = computed(() => (
  convId.value && uiStore.forwardDraftTargetId === convId.value
    ? uiStore.forwardDraftItems
    : []
))
const hasForwardDraft = computed(() => currentForwardDraftItems.value.length > 0)

watch(convId, () => {
  selectedAtMentions.clear()
})

function handleChannelPermissionRetry() {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return
  // 失败态点击后强制重新拉频道详情，恢复当前账号的最新频道权限。
  void channelStore.ensureChannelDetailReady(conv.targetId, { force: true })
}

watch(
  () => chatStore.currentConversation?.type === ConversationType.Channel ? chatStore.currentConversation.targetId : '',
  async (channelId) => {
    if (!channelId) return
    // 切会话后后台补齐频道详情，不阻塞聊天区切换速度。
    await channelStore.ensureChannelDetailReady(channelId)
    logChannelContentLimitDebug(channelId, 'enter-channel')
  },
  { immediate: true },
)

/** 频道/群二维码「转发给朋友」：草稿里是 data: 合成图，输入区展示大图预览（对齐老 im forward + 待发图片） */
const forwardPreviewQrSrc = computed(() => {
  if (currentForwardDraftItems.value.length !== 1) return ''
  const item = currentForwardDraftItems.value[0]
  if (item.msgType !== MessageType.Image) return ''
  try {
    const o = JSON.parse(item.content) as { url?: string; thumbnailUrl?: string }
    const u = String(o.thumbnailUrl || o.url || '')
    return u.startsWith('data:image/') ? u : ''
  } catch {
    return ''
  }
})
const readBurnTimeText = computed(() =>
  getReadBurnTimeText(currentContact.value?.msgCancelTime || DEFAULT_READ_BURN_SECONDS),
)
const editorMenuItems = computed<MenuItem[]>(() => [
  { key: 'copy', label: '复制', iconSrc: menuCopy },
  { key: 'paste', label: '粘贴', iconSrc: menuPaste },
  {
    key: 'text_format',
    label: '文本格式',
    iconSrc: menuMore,
    children: [{ key: 'create_link', label: '创建链接' }],
  },
])

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
const FILE_ENCRYPT_CHUNK_SIZE = 102400
const VISIBLE_TRAILING_SPACE = '\u00a0'
const EDITOR_EMOJI_CARET_ANCHOR = '\u200b'
const VIDEO_FILE_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogg'])
const EDITOR_HISTORY_LIMIT = 80
const emojiMap = emojiObj as Record<string, string>

interface AtSendCandidate {
  uid: string
  matchName: string
  nickName: string
  remarkName: string
  atUid: number
  sendName?: string
}

interface AtSendUser {
  id: string
  uid: string
  userId: string
  nickName: string
  name: string
}

interface EditorHistoryEntry {
  text: string
  caretOffset: number
}

interface UploadedImagePayload {
  url: string
  thumbnailUrl: string
  width: number
  height: number
  size: number
  name: string
  fileKey: string
}

interface UploadedFilePayload {
  url: string
  size: number
  name: string
  ext: string
  mimeType: string
  fileKey: string
}

interface VideoMetadata {
  thumbDataUrl: string
  width: number
  height: number
  duration: number
}

interface UploadedVideoPayload {
  url: string
  thumbUrl: string
  width: number
  height: number
  duration: number
  size: number
  name: string
  fileKey: string
}

interface ImageSendTrace {
  id: string
  startedAt: number
}

interface LocalImagePreview {
  url: string
  width: number
  height: number
  optimisticId: string
}

interface MediaCaptionPreparedSlot {
  file: File
  fileKey: string
  msgType: MessageType
  previewUrl: string
  width: number
  height: number
  size: number
  name: string
  trace: ImageSendTrace
}

interface MediaCaptionUploadedSlot {
  msgType: MessageType
  url: string
  thumbnailUrl: string
  width: number
  height: number
  size: number
}

interface LocalFilePreview {
  optimisticId: string
}

interface LocalVideoPreview {
  url: string
  optimisticId: string
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

function toBool(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (text === '0' || text === 'false' || text === 'no') return false
  if (text === '1' || text === 'true' || text === 'yes') return true
  return Boolean(value)
}

function responseOk(resp: { code?: number } | null | undefined): boolean {
  const code = Number(resp?.code ?? 200)
  return code === 200 || code === 0
}

function firstHttpUrlFromText(text: string): string {
  const match = text.match(/https?:\/\/[^\s]+/i)
  return match ? match[0] : ''
}

function normalizeChannelJoinLink(raw: unknown): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    // 兼容频道短链：subscribeChannel 需要的是链接码，不是完整 URL。
    const pathToken = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''))
    if (pathToken && !pathToken.includes('/')) return pathToken
    const queryToken = String(url.searchParams.get('link') || url.searchParams.get('code') || '').trim()
    if (queryToken) return queryToken
  } catch {
    // 非 URL 时按原值透传（例如接口直接返回的 link token）。
  }
  return text
}

function resolveJoinChannelLink(conversationId: string, preferredLink: unknown): string {
  const directLink = normalizeChannelJoinLink(preferredLink)
  if (directLink) return directLink
  const recent = messageStore.getMessages(conversationId).slice(-20)
  for (let i = recent.length - 1; i >= 0; i--) {
    const raw = String(recent[i]?.content || '').trim()
    if (!raw) continue
    const hit = normalizeChannelJoinLink(firstHttpUrlFromText(raw))
    if (hit) return hit
  }
  return ''
}

function isExpiredInviteError(message: unknown): boolean {
  const text = String(message || '').toLowerCase()
  if (!text) return false
  return text.includes('失效')
    || text.includes('过期')
    || text.includes('expired')
    || text.includes('invalid')
}

function joinChannelErrorToken(resp: { msg?: unknown; errMsg?: unknown; errCode?: unknown } | null | undefined): string {
  const msg = String(resp?.msg || '').trim()
  const errMsg = String(resp?.errMsg || '').trim()
  const errCode = Number(resp?.errCode ?? 0)
  if (msg) return msg
  if (errMsg) return errMsg
  if (Number.isFinite(errCode) && errCode > 0) return String(errCode)
  return ''
}

function isExpiredInviteResponse(resp: { msg?: unknown; errMsg?: unknown; errCode?: unknown } | null | undefined): boolean {
  const token = joinChannelErrorToken(resp)
  if (!token) return false
  // 线上已观测到 1000001：服务端以错误码表示邀请链接失效/过期。
  if (token === '1000001') return true
  return isExpiredInviteError(token)
}

function resolveJoinChannelErrorMessage(resp: { msg?: unknown; errMsg?: unknown; errCode?: unknown } | null | undefined): string {
  const fallback = t('加入频道失败')
  const token = joinChannelErrorToken(resp)
  if (!token) return fallback
  if (token === '1000001' || isExpiredInviteError(token)) return t('此邀请链接已失效或过期')
  // 纯数字错误码对用户不可读，仍回退到通用失败提示。
  if (/^\d+$/.test(token)) return fallback
  return token
}

async function toggleChannelDisturb() {
  const conv = chatStore.currentConversation
  const channel = currentChannel.value
  if (!conv || conv.type !== ConversationType.Channel || !channel || updatingChannelDisturb.value) return

  const nextDisturb = !toBool(channel.isDisturb ?? conv.isMuted)
  updatingChannelDisturb.value = true
  try {
    const resp = await updateMember({
      channelId: channel.channelId || conv.targetId,
      isDisturb: Number(nextDisturb),
    })
    if (!responseOk(resp)) throw new Error(resp?.msg || 'update channel disturb failed')

    channelStore.patchChannel(channel.channelId || conv.targetId, { isDisturb: nextDisturb })
    chatStore.updateConversation({ id: conv.id, isMuted: nextDisturb })
    if (authStore.uid) {
      await chatStore.muteConversation(authStore.uid, conv.id, nextDisturb).catch((error) => {
        console.warn('[MessageInput] local channel mute sync failed:', error)
      })
    }
  } catch (error) {
    console.warn('[MessageInput] update channel disturb failed:', error)
    showToast(t('操作失败'), 'error')
  } finally {
    updatingChannelDisturb.value = false
  }
}

async function handleJoinChannel() {
  const conv = chatStore.currentConversation
  const channel = currentChannel.value
  if (!conv || conv.type !== ConversationType.Channel || !channel || joiningChannel.value) return

  joiningChannel.value = true
  try {
    const channelId = channel.channelId || conv.targetId
    // 私密频道在“被移除后重新加入”场景里，频道快照可能没有 link；这里回退到最近消息中的邀请链接。
    const joinLink = resolveJoinChannelLink(conv.id, channel.link)
    let resp = await subscribeChannel({
      channelId,
      link: joinLink || undefined,
    })
    if (!responseOk(resp) && joinLink && isExpiredInviteResponse(resp)) {
      // 兼容部分线路：历史邀请 link 过期时，服务端仍可能允许按 channelId 直接重新加入。
      resp = await subscribeChannel({ channelId })
    }
    if (!responseOk(resp)) {
      // 接口失败后立刻强刷详情：兼容“服务端已加入但本地 memberType 仍旧值”的短暂不一致。
      const refreshed = await channelStore.ensureChannelDetailReady(channelId, { force: true })
      if (Number(refreshed?.memberType ?? channel.memberType ?? 0) > 0) return
      throw new Error(resolveJoinChannelErrorMessage(resp))
    }

    channelStore.patchChannel(channelId, {
      memberType: 3,
      updatedAt: Date.now(),
    }, { allowRemoved: true })
    void channelStore.ensureChannelDetailReady(channelId, { force: true })
  } catch (error) {
    console.warn('[MessageInput] join channel failed:', error)
    const fallback = t('加入频道失败')
    const reason = error instanceof Error ? String(error.message || '').trim() : ''
    showToast(reason || fallback, 'error')
  } finally {
    joiningChannel.value = false
  }
}

function terminalLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  void message
  void data
  void level
}

function safeHead(value: string, length = 8): string {
  return value ? value.slice(0, length) : ''
}

function createImageTrace(): ImageSendTrace {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt: performance.now(),
  }
}

function traceLog(
  trace: ImageSendTrace,
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  terminalLog(message, {
    traceId: trace.id,
    elapsedMs: Math.round(performance.now() - trace.startedAt),
    ...(data || {}),
  }, level)
}

function fileTraceLog(
  trace: ImageSendTrace,
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  traceLog(trace, `[file-send] ${message}`, data, level)
}

let localImageSeq = 0

function createOptimisticImageId(): string {
  localImageSeq = (localImageSeq + 1) % 1000
  return String(Date.now() * 1000 + localImageSeq)
}

interface ClipboardFilePayload {
  name: string
  mime: string
  dataBase64: string
}

interface LocalFileMetaPayload {
  path: string
  name: string
  mime: string
  size: number
}

type LocalPathFile = File & {
  path?: string
  local?: string
  localPath?: string
  __localPath?: string
}

function getLocalFilePath(file: File): string {
  const localFile = file as LocalPathFile
  return String(localFile.local || localFile.localPath || localFile.__localPath || localFile.path || '').trim()
}

function attachLocalPathToFile(file: File, localPath: string): File {
  const path = localPath.trim()
  if (!path) return file
  const localFile = file as LocalPathFile
  try {
    localFile.local = path
    localFile.localPath = path
    localFile.__localPath = path
    localFile.path = path
  } catch {
    // Some File objects may be non-extensible in embedded webviews.
  }
  return file
}

function isBlobBackedFile(file: File): boolean {
  return file instanceof Blob
}

async function ensureBlobBackedFile(file: File, trace?: ImageSendTrace): Promise<File> {
  if (isBlobBackedFile(file)) return file

  const localPath = getLocalFilePath(file)
  if (!localPath) return file

  const startedAt = performance.now()
  const log = (
    message: string,
    data?: Record<string, unknown>,
    level: 'info' | 'warn' | 'error' = 'info',
  ) => {
    if (trace) {
      fileTraceLog(trace, message, data, level)
    } else {
      terminalLog(`[file-send] ${message}`, data, level)
    }
  }

  log('materialize local path file start', {
    pathHead: safeHead(localPath, 80),
    name: file.name,
    size: file.size,
    type: file.type,
  })

  const buffer = await file.arrayBuffer()
  const materialized = new File([buffer], file.name || 'local-file', {
    type: file.type || 'application/octet-stream',
    lastModified: Number(file.lastModified || Date.now()),
  })

  log('materialize local path file done', {
    elapsedMs: Math.round(performance.now() - startedAt),
    name: materialized.name,
    size: materialized.size,
    type: materialized.type,
  })

  return attachLocalPathToFile(materialized, localPath)
}

function withReadBurnExtra(extra?: Record<string, unknown>) {
  const nextExtra = extra ? { ...extra } : {}
  const readBurnSeconds = currentContact.value?.bfReadCancel
    ? Number(currentContact.value.msgCancelTime || DEFAULT_READ_BURN_SECONDS)
    : (currentGroup.value?.bfGroupReadCancel ? Number(currentGroup.value.groupMsgCancelTime || DEFAULT_READ_BURN_SECONDS) : 0)
  if (readBurnSeconds > 0) {
    // 对齐旧 im：好友和群开启阅后即焚时，发送的普通消息都要携带销毁时间，消息旁边才会显示火焰。
    const snapchatTime = readBurnSeconds
    if (snapchatTime > 0) {
      nextExtra.snapchatTime = snapchatTime
      nextExtra.deleteSeconds = snapchatTime * 1000
    }
  }
  return Object.keys(nextExtra).length > 0 ? nextExtra : undefined
}

watch(
  () => [currentContact.value?.id, currentContact.value?.msgCancelTime],
  ([contactId, nextMsgCancelTime]) => {
    if (!contactId) {
      scheduleDeletionTime.value = 0
      return
    }
    scheduleDeletionTime.value = Number(nextMsgCancelTime || DEFAULT_READ_BURN_SECONDS)
  },
  { immediate: true },
)

function focusEditor() {
  if (showShutupTip.value) return
  nextTick(() => {
    requestAnimationFrame(() => {
      editorRef.value?.focus()
    })
  })
}

function getStoredDraft(conversationId: string) {
  return chatStore.conversations.find((c) => c.id === conversationId)?.draft || ''
}

function getEditorEmojiSrc(emoji: string): string {
  const fileName = emojiMap[emoji]
  return fileName ? `/images/emoji/${fileName}.png` : ''
}

function createEditorEmojiNode(emoji: string): HTMLImageElement {
  const img = document.createElement('img')
  img.className = 'editor-emoji'
  img.src = getEditorEmojiSrc(emoji)
  img.alt = emoji
  img.title = emoji
  img.draggable = false
  img.dataset.emojiText = emoji
  img.contentEditable = 'false'
  return img
}

function createEditorEmojiCaretNode(): Text {
  return document.createTextNode(EDITOR_EMOJI_CARET_ANCHOR)
}

function isEditorEmojiCaretNode(node: Node | null | undefined): node is Text {
  return node?.nodeType === Node.TEXT_NODE && node.textContent === EDITOR_EMOJI_CARET_ANCHOR
}

function isEditorEmojiNode(node: Node | null | undefined): node is HTMLImageElement {
  return node instanceof HTMLImageElement && Boolean(node.dataset.emojiText)
}

function serializeEditorNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replaceAll(EDITOR_EMOJI_CARET_ANCHOR, '')
  }
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return ''

  if (node instanceof HTMLImageElement && node.dataset.emojiText) {
    return node.dataset.emojiText
  }
  if (node instanceof HTMLBRElement) return '\n'
  if (node instanceof HTMLAnchorElement) return node.outerHTML

  return Array.from(node.childNodes).map(serializeEditorNode).join('')
}

function serializeEditorContent(): string {
  return editorRef.value ? serializeEditorNode(editorRef.value) : content.value
}

function renderEditorText(text: string) {
  const editor = editorRef.value
  if (!editor) return

  editor.textContent = ''
  const tokenPattern = /\[[^\]]+\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(text)) !== null) {
    const emoji = match[0]
    const src = getEditorEmojiSrc(emoji)
    if (!src) continue

    if (match.index > lastIndex) {
      editor.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
    }
    editor.appendChild(createEditorEmojiNode(emoji))
    editor.appendChild(createEditorEmojiCaretNode())
    lastIndex = match.index + emoji.length
  }

  if (lastIndex < text.length) {
    editor.appendChild(document.createTextNode(text.slice(lastIndex)))
  }
}

function placeCaretAtTextOffset(offset: number) {
  const editor = editorRef.value
  if (!editor) return

  const selection = window.getSelection()
  const range = document.createRange()
  let remaining = Math.max(0, offset)
  let placed = false

  const placeBeforeOrAfter = (node: Node, after: boolean) => {
    const parent = node.parentNode
    if (!parent) return false
    const index = Array.prototype.indexOf.call(parent.childNodes, node)
    range.setStart(parent, index + (after ? 1 : 0))
    return true
  }

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) {
        range.setStart(node, remaining)
        return true
      }
      remaining -= length
      return false
    }

    if (node instanceof HTMLImageElement && node.dataset.emojiText) {
      const length = node.dataset.emojiText.length
      if (remaining === length && isEditorEmojiCaretNode(node.nextSibling)) {
        range.setStart(node.nextSibling, node.nextSibling.length)
        return true
      }
      if (remaining <= length) {
        return placeBeforeOrAfter(node, remaining >= length)
      }
      remaining -= length
      return false
    }

    if (node instanceof HTMLBRElement) {
      if (remaining <= 1) return placeBeforeOrAfter(node, remaining >= 1)
      remaining -= 1
      return false
    }

    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true
    }
    return false
  }

  placed = walk(editor)
  if (!placed) {
    range.selectNodeContents(editor)
    range.collapse(false)
  }
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  savedSelection.value = range.cloneRange()
}

function setEditorText(text: string) {
  content.value = text
  if (editorRef.value) {
    renderEditorText(text)
  }
}

function captureEditorHistoryEntry(): EditorHistoryEntry {
  return {
    text: serializeEditorContent(),
    caretOffset: getCaretTextOffset(),
  }
}

function isSameEditorHistoryEntry(a: EditorHistoryEntry | null | undefined, b: EditorHistoryEntry | null | undefined): boolean {
  return Boolean(a && b && a.text === b.text && a.caretOffset === b.caretOffset)
}

function pushEditorUndoEntry(entry: EditorHistoryEntry) {
  const stack = editorUndoStack.value
  if (isSameEditorHistoryEntry(stack[stack.length - 1], entry)) return
  stack.push(entry)
  if (stack.length > EDITOR_HISTORY_LIMIT) stack.shift()
}

function resetEditorHistory() {
  editorUndoStack.value = []
  editorRedoStack.value = []
}

function recordEditorChangeStart() {
  // contenteditable 的程序插入没有可靠的现代原生撤销 API，统一记录修改前状态供桌面快捷键回退。
  pushEditorUndoEntry(captureEditorHistoryEntry())
  editorRedoStack.value = []
}

function applyEditorHistoryEntry(entry: EditorHistoryEntry) {
  setEditorTextAndCaret(entry.text, entry.caretOffset)
  showAtList.value = false
  atKeyword.value = ''
  saveEditorSelection()
}

function currentDraftText() {
  const text = normalizeEditorText(content.value)
  return text.trim() ? text : null
}

function saveDraft(conversationId: string | null | undefined) {
  if (!conversationId) return
  chatStore.setDraft(conversationId, currentDraftText())
}

function restoreDraft(conversationId: string) {
  const draft = getStoredDraft(conversationId)
  if (draft) {
    requestAnimationFrame(() => {
      setEditorTextAndCaret(draft, draft.length)
      resetEditorHistory()
    })
  } else {
    setEditorText('')
    resetEditorHistory()
  }
  chatStore.setDraft(conversationId, null)
}

watch(
  convId,
  (newId, oldId) => {
    showQrForwardUpload.value = false
    qrForwardPendingFiles.value = []
    qrForwardAutoOpenToken.value = ''
    if (newId) {
      if (oldId && oldId !== newId) {
        saveDraft(oldId)
      }
      nextTick(() => restoreDraft(newId))
    } else if (oldId) {
      saveDraft(oldId)
    }
    uiStore.clearQuoteMessage()
    uiStore.exitSelectionMode()
    if (newId) {
      focusEditor()
    }
  },
  { immediate: true },
)

function parseForwardImageDataUrl(content: string): { dataUrl: string; fileName: string } | null {
  try {
    const o = JSON.parse(content) as { url?: string; name?: string }
    const dataUrl = String(o.url || '')
    if (!dataUrl.startsWith('data:image/')) return null
    const fileName = String(o.name || 'image.png')
    return { dataUrl, fileName }
  } catch {
    return null
  }
}

function isLikelyBase64ImagePayload(value: string): boolean {
  const raw = value.trim()
  if (!raw || raw.length < 32 || raw.length % 4 !== 0) return false
  if (/^(https?:|blob:|file:|asset:|tauri:|\/)/i.test(raw)) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return false
  return /^(iVBORw0KGgo|\/9j\/|R0lGOD|UklGR|Qk|AAAAIGZ0eXBhdmlm|PD94bWw|PHN2Z)/.test(raw)
}

function normalizeForwardImageSrc(value: unknown, mimeType?: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^data:image\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (isLikelyBase64ImagePayload(raw)) {
    const mime = String(mimeType || 'image/png').trim() || 'image/png'
    return `data:${mime};base64,${raw}`
  }
  return raw
}

function getForwardImagePreviewSrc(item: {
  msgType: number
  content: string | null
  previewSrc?: string
}): string {
  if (item.msgType !== MessageType.Image) return ''
  const previewSrc = normalizeForwardImageSrc(item.previewSrc)
  if (previewSrc) return previewSrc

  const raw = String(item.content || '').trim()
  if (!raw) return ''

  try {
    const o = JSON.parse(raw) as {
      url?: string
      fileUrl?: string
      thumbnailUrl?: string
      thumbUrl?: string
      thumbnail?: string
      thumbBase64?: string
      dataUrl?: string
      data_url?: string
      base64?: string
      mime?: string
      mimeType?: string
      mime_type?: string
      thumbMimeType?: string
      thumb_mime_type?: string
    }
    const url = normalizeForwardImageSrc(
      o.url || o.fileUrl || o.dataUrl || o.data_url || o.base64 || '',
      o.mimeType || o.mime_type || o.mime,
    )
    return normalizeForwardImageSrc(
      o.thumbnailUrl || o.thumbUrl || o.thumbnail || o.thumbBase64 || url,
      o.thumbMimeType || o.thumb_mime_type || o.mimeType || o.mime_type || o.mime,
    )
  } catch {
    const [url = '', thumbUrl = ''] = raw.split('||')
    return normalizeForwardImageSrc(thumbUrl) || normalizeForwardImageSrc(url)
  }
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const segments = dataUrl.split(',')
  const header = segments[0] || ''
  const base64 = segments[1] || ''
  const mimeMatch = header.match(/data:(.*?);base64/)
  const mime = mimeMatch?.[1] || 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mime })
}

function openQrForwardFileDialogFromDraft() {
  const item = currentForwardDraftItems.value[0]
  if (!item || item.msgType !== MessageType.Image) return
  const parsed = parseForwardImageDataUrl(item.content)
  if (!parsed) return
  try {
    qrForwardPendingFiles.value = [dataUrlToFile(parsed.dataUrl, parsed.fileName)]
    showQrForwardUpload.value = true
  } catch (e) {
    console.error('[message-input] QR forward → file dialog failed:', e)
    showToast((e as Error)?.message || t('操作失败'), 'error')
  }
}

watch(
  () => ({
    cid: convId.value,
    tid: uiStore.forwardDraftTargetId,
    qrLen: forwardPreviewQrSrc.value.length,
    draftLen: uiStore.forwardDraftItems.length,
  }),
  (s) => {
    if (showQrForwardUpload.value || showFilePreview.value) return
    if (!s.qrLen || s.draftLen !== 1 || !s.cid || s.cid !== s.tid) return
    const token = `${s.cid}|${s.tid}|${s.qrLen}`
    if (qrForwardAutoOpenToken.value === token) return
    qrForwardAutoOpenToken.value = token
    nextTick(() => {
      if (showQrForwardUpload.value || showFilePreview.value) return
      openQrForwardFileDialogFromDraft()
    })
  },
)

async function handleQrForwardConfirm(payload: { text: string; files: File[] }) {
  showQrForwardUpload.value = false
  qrForwardPendingFiles.value = []
  qrForwardAutoOpenToken.value = ''
  uiStore.clearForwardDraft()
  await handleFileSend(payload)
}

function handleQrForwardCancel() {
  showQrForwardUpload.value = false
  qrForwardPendingFiles.value = []
  qrForwardAutoOpenToken.value = ''
  uiStore.clearForwardDraft()
}

async function handleSend() {
  const startedAt = performance.now()
  showEmoji.value = false
  content.value = serializeEditorContent()
  const text = normalizeEditorText(content.value).trim()
  if (!text && !hasForwardDraft.value) return
  sendDiag('handleSend start', {
    conversationId: convId.value || '',
    isGroup: isGroup.value,
    isFileHelper: isFileHelperChat.value,
    textLen: text.length,
    hasForwardDraft: hasForwardDraft.value,
    forwardCount: currentForwardDraftItems.value.length,
  })

  const extra: Record<string, unknown> = {}
  if (uiStore.quoteMessage) {
    extra.quoteMessage = {
      id: uiStore.quoteMessage.id,
      customMsgId: uiStore.quoteMessage.customMsgId ?? null,
      senderId: uiStore.quoteMessage.senderId,
      senderName: uiStore.quoteMessage.senderName,
      msgType: uiStore.quoteMessage.msgType,
      content: uiStore.quoteMessage.content,
    }
    uiStore.clearQuoteMessage()
  }

  const forwardSnapshot = [...currentForwardDraftItems.value]
  if (forwardSnapshot.length > 0) {
    for (const item of forwardSnapshot) {
      const inlineImage = item.msgType === MessageType.Image ? parseForwardImageDataUrl(item.content) : null
      if (inlineImage) {
        try {
          const file = dataUrlToFile(inlineImage.dataUrl, inlineImage.fileName)
          await handleFileSend([file])
        } catch (error) {
          console.error('[message-input] forward QR/image upload failed:', error)
          showToast((error as Error)?.message || t('操作失败'), 'error')
          return
        }
      } else {
        sendDiag('emit forward message', {
          msgType: item.msgType,
          contentLen: String(item.content || '').length,
          elapsedMs: Math.round(performance.now() - startedAt),
        })
        emit('send', item.content, item.msgType, item.extra)
      }
    }
    uiStore.clearForwardDraft()
  }

  if (text) {
    let staleAtMentions: Array<{ uid: string; matchName: string }> = []
    if (isGroup.value && !isFileHelperChat.value && text.includes('@')) {
      staleAtMentions = buildAtSendCandidates()
        .filter((candidate) => candidate.atUid > 0)
        .map((candidate) => ({ uid: candidate.uid, matchName: candidate.matchName }))
      await refreshCurrentGroupMembersForAtSend()
    }
    const atPayload = isGroup.value && !isFileHelperChat.value
      ? buildTextAtPayload(text, staleAtMentions)
      : { content: text, atUids: [], atUsers: [] }
    const textExtra = atPayload.atUids.length > 0
      ? { ...extra, atUids: atPayload.atUids, atUsers: atPayload.atUsers }
      : extra
    sendDiag('emit text message', {
      msgType: MessageType.Text,
      contentLen: atPayload.content.length,
      atCount: atPayload.atUids.length,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    emit('send', atPayload.content, MessageType.Text, withReadBurnExtra(Object.keys(textExtra).length > 0 ? textExtra : undefined))
  }
  content.value = ''
  if (editorRef.value) editorRef.value.textContent = ''
  if (convId.value) chatStore.setDraft(convId.value, null)
  selectedAtMentions.clear()
  resetEditorHistory()
  sendDiag('handleSend done', {
    elapsedMs: Math.round(performance.now() - startedAt),
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (handleEditorHistoryShortcut(e)) return
  if (handleEditorEmojiDeleteKey(e)) return

  if (e.key === 'Escape') {
    if (showQrForwardUpload.value) return
    if (hasForwardDraft.value) {
      uiStore.clearForwardDraft()
      return
    }
    if (uiStore.quoteMessage) {
      uiStore.clearQuoteMessage()
      return
    }
    if (uiStore.selectionMode) {
      uiStore.exitSelectionMode()
      return
    }
  }
  if (
    showAtList.value
    && ['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)
  ) {
    e.preventDefault()
    if (e.key === 'Enter') suppressNextEnterKeyup.value = true
    atListRef.value?.handleKeyboard(e.key)
    return
  }
  if (e.key === 'Enter' && !e.isComposing) {
    const mode = settingStore.settings.sendShortcutKey
    const shouldSend = mode === 'Ctrl+Enter'
      ? (e.ctrlKey || e.metaKey)
      : !e.shiftKey && !e.ctrlKey && !e.metaKey
    if (shouldSend) {
      e.preventDefault()
    }
  }
  if (e.key === '@' && isGroup.value && !isFileHelperChat.value) {
    showAtList.value = true
    atKeyword.value = ''
  }
}

function handleEditorKeyup(e: KeyboardEvent) {
  saveEditorSelection()
  if (suppressNextEnterKeyup.value && e.key === 'Enter') {
    suppressNextEnterKeyup.value = false
    return
  }
  if (showAtList.value || e.isComposing) return
  const mode = settingStore.settings.sendShortcutKey
  if (mode === 'Ctrl+Enter') {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }
  else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleInput() {
  if (editorRef.value) {
    content.value = serializeEditorContent()
  }
  updateAtListFromCaret()
}

function handleBeforeInput() {
  recordEditorChangeStart()
}

function handleEditorHistoryShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()
  const isUndo = key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey
  const isRedo = (key === 'y' && (event.ctrlKey || event.metaKey))
    || (key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey)
  if (event.altKey || (!isUndo && !isRedo)) return false

  event.preventDefault()
  event.stopPropagation()
  if (isUndo) {
    const previous = editorUndoStack.value.pop()
    if (!previous) return true
    const current = captureEditorHistoryEntry()
    if (!isSameEditorHistoryEntry(previous, current)) editorRedoStack.value.push(current)
    applyEditorHistoryEntry(previous)
  } else {
    const next = editorRedoStack.value.pop()
    if (!next) return true
    pushEditorUndoEntry(captureEditorHistoryEntry())
    applyEditorHistoryEntry(next)
  }
  return true
}

function saveEditorSelection() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !editorRef.value) return
  const range = selection.getRangeAt(0)
  if (editorRef.value.contains(range.commonAncestorContainer)) {
    savedSelection.value = range.cloneRange()
  }
}

function restoreEditorSelection() {
  const range = savedSelection.value
  if (!range || !editorRef.value) {
    editorRef.value?.focus()
    return
  }
  try {
    const selection = window.getSelection()
    editorRef.value.focus()
    selection?.removeAllRanges()
    selection?.addRange(range)
  } catch {
    editorRef.value.focus()
  }
}

function normalizeEditorFocusCaret() {
  requestAnimationFrame(() => {
    const editor = editorRef.value
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!editor || document.activeElement !== editor || !range || !range.collapsed) return

    const lastChild = editor.lastChild
    if (range.endContainer === editor && range.endOffset === editor.childNodes.length && isEditorEmojiCaretNode(lastChild)) {
      range.setStart(lastChild, lastChild.length)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      savedSelection.value = range.cloneRange()
    }
  })
}

function getChildNodeIndex(parent: Node, child: Node): number {
  return Array.prototype.indexOf.call(parent.childNodes, child)
}

function setEditorCaretAtChildOffset(parent: Node, offset: number) {
  const selection = window.getSelection()
  const range = document.createRange()
  const safeOffset = Math.max(0, Math.min(offset, parent.childNodes.length))
  const previous = parent.childNodes[safeOffset - 1]

  if (isEditorEmojiCaretNode(previous)) {
    range.setStart(previous, previous.length)
  } else if (previous?.nodeType === Node.TEXT_NODE) {
    range.setStart(previous, previous.textContent?.length ?? 0)
  } else {
    range.setStart(parent, safeOffset)
  }

  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  savedSelection.value = range.cloneRange()
}

function removeEditorEmojiNode(emojiNode: HTMLImageElement): boolean {
  const parent = emojiNode.parentNode
  if (!parent) return false

  recordEditorChangeStart()
  const offset = getChildNodeIndex(parent, emojiNode)
  const caretNode = emojiNode.nextSibling
  emojiNode.remove()
  if (isEditorEmojiCaretNode(caretNode)) caretNode.remove()
  setEditorCaretAtChildOffset(parent, offset)
  content.value = serializeEditorContent()
  showAtList.value = false
  atKeyword.value = ''
  return true
}

function getBackspaceEmojiTarget(container: Node, offset: number): HTMLImageElement | null {
  if (isEditorEmojiCaretNode(container) && isEditorEmojiNode(container.previousSibling)) {
    return container.previousSibling
  }

  if (container === editorRef.value) {
    const previous = container.childNodes[offset - 1]
    if (isEditorEmojiCaretNode(previous) && isEditorEmojiNode(previous.previousSibling)) {
      return previous.previousSibling
    }
    if (isEditorEmojiNode(previous)) return previous
  }

  if (container.nodeType === Node.TEXT_NODE && offset === 0) {
    const previous = container.previousSibling
    if (isEditorEmojiCaretNode(previous) && isEditorEmojiNode(previous.previousSibling)) {
      return previous.previousSibling
    }
    if (isEditorEmojiNode(previous)) return previous
  }

  return null
}

function getDeleteEmojiTarget(container: Node, offset: number): HTMLImageElement | null {
  if (container === editorRef.value) {
    const next = container.childNodes[offset]
    if (isEditorEmojiNode(next)) return next
  }

  if (container.nodeType === Node.TEXT_NODE && offset === (container.textContent?.length ?? 0)) {
    const next = container.nextSibling
    if (isEditorEmojiNode(next)) return next
  }

  return null
}

function handleEditorEmojiDeleteKey(event: KeyboardEvent): boolean {
  if (!['Backspace', 'Delete'].includes(event.key)) return false
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false

  const editor = editorRef.value
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!editor || !range || !range.collapsed || !editor.contains(range.commonAncestorContainer)) return false

  const target = event.key === 'Backspace'
    ? getBackspaceEmojiTarget(range.startContainer, range.startOffset)
    : getDeleteEmojiTarget(range.startContainer, range.startOffset)
  if (!target) return false

  event.preventDefault()
  return removeEditorEmojiNode(target)
}

function getEditorText(): string {
  return serializeEditorContent()
}

function normalizeEditorText(value: string): string {
  return value.replace(/\u00a0/g, ' ')
}

function isAtMentionBoundary(char: string): boolean {
  return !char || /\s/.test(char) || char === '@'
}

// 同一个成员可能同时命中备注、群昵称和 uid，发送前先按 uid+名称去重。
function pushUniqueAtCandidate(list: AtSendCandidate[], seen: Set<string>, candidate: AtSendCandidate) {
  const key = `${candidate.uid}:${candidate.matchName}`
  if (!candidate.matchName || seen.has(key)) return
  seen.add(key)
  list.push(candidate)
}

function createMemberAtCandidate(userId: string, matchName: string, options?: { sendLatestName?: boolean }): AtSendCandidate | null {
  const uid = String(userId || '').trim()
  const cleanMatchName = String(matchName || '').trim().replace(/^@+/, '')
  if (!uid || !cleanMatchName) return null

  const atUid = Number(uid)
  if (!Number.isFinite(atUid)) return null

  const member = groupStore.getMembers(groupId.value).find((item) => item.userId === uid)
  if (!member) return null
  const contact = contactStore.getContact(uid)
  const nickName = String(member?.profileNickname || contact?.nickname || member?.nickname || uid).trim()
  const remarkName = String(contact?.remark || '').trim()

  return {
    uid,
    matchName: cleanMatchName,
    nickName: nickName || uid,
    remarkName,
    atUid,
    // 从 @ 列表选中的旧展示名只作为识别依据，发送正文必须写刷新后的真实昵称。
    sendName: options?.sendLatestName ? (nickName || uid) : undefined,
  }
}

function buildAtSendCandidates(extraSelectedMentions: Array<{ uid: string; matchName: string }> = []): AtSendCandidate[] {
  const candidates: AtSendCandidate[] = []
  const seen = new Set<string>()

  // 只有群主/管理员允许 @全体成员，避免普通成员发送出服务端不认可的 -1。
  const current = groupStore.getMembers(groupId.value).find(member => member.userId === authStore.uid)
  if (current?.role === 0 || current?.role === 1) {
    pushUniqueAtCandidate(candidates, seen, {
      uid: '-1',
      matchName: '全体成员',
      nickName: '全体成员',
      remarkName: '',
      atUid: -1,
    })
  }

  for (const selected of selectedAtMentions.values()) {
    const candidate = createMemberAtCandidate(selected.uid, selected.matchName, { sendLatestName: true })
    if (candidate) pushUniqueAtCandidate(candidates, seen, candidate)
  }

  for (const selected of extraSelectedMentions) {
    const candidate = createMemberAtCandidate(selected.uid, selected.matchName, { sendLatestName: true })
    if (candidate) pushUniqueAtCandidate(candidates, seen, candidate)
  }

  for (const member of groupStore.getMembers(groupId.value)) {
    if (member.userId === authStore.uid) continue
    const contact = contactStore.getContact(member.userId)
    const nickName = String(member.profileNickname || contact?.nickname || member.nickname || member.userId || '').trim()
    const remarkName = String(contact?.remark || '').trim()
    // 发送时允许用户输入备注名、群昵称或 uid；备注命中后会在正文里转回真实群昵称。
    const names = [remarkName, nickName, member.userId]
      .map((name) => String(name || '').trim().replace(/^@+/, ''))
      .filter(Boolean)

    for (const matchName of names) {
      pushUniqueAtCandidate(candidates, seen, {
        uid: member.userId,
        matchName,
        nickName: nickName || member.userId,
        remarkName,
        atUid: Number(member.userId),
      })
    }
  }

  return candidates
    .filter((candidate) => Number.isFinite(candidate.atUid))
    .sort((a, b) => b.matchName.length - a.matchName.length)
}

async function refreshCurrentGroupMembersForAtSend() {
  const targetGroupId = groupId.value
  const uid = authStore.uid
  if (!targetGroupId || !uid) return

  try {
    // 发送群 @ 前强制校准成员资料，避免用户停留在群里时把旧昵称写进正文和 atUsers。
    await groupStore.loadMembers(uid, targetGroupId, { forceRemote: true, loadAll: true })
  } catch (error) {
    console.warn('[MessageInput] refresh group members before @ send failed:', error)
  }
}

function buildTextAtPayload(
  text: string,
  staleAtMentions: Array<{ uid: string; matchName: string }> = [],
): { content: string; atUids: number[]; atUsers: AtSendUser[] } {
  // 逐字符扫描而不是按空格切词，保证“备注 名 - b”这类带空格备注也能完整匹配。
  const candidates = buildAtSendCandidates(staleAtMentions)
  const selected = new Map<string, AtSendCandidate>()
  let content = ''
  let index = 0

  while (index < text.length) {
    if (text.charAt(index) !== '@') {
      content += text.charAt(index)
      index += 1
      continue
    }

    const candidate = candidates.find((item) => (
      text.startsWith(item.matchName, index + 1)
      && isAtMentionBoundary(text.charAt(index + 1 + item.matchName.length))
    ))

    if (!candidate) {
      content += text.charAt(index)
      index += 1
      continue
    }

    // 对齐旧 im：发出的正文使用真实昵称，备注名只放在 atUsers 里供本地展示替换。
    const sendName = candidate.sendName || (candidate.remarkName && candidate.matchName === candidate.remarkName
      ? candidate.nickName
      : candidate.matchName)
    content += `@${sendName}`
    selected.set(candidate.uid, candidate)
    index += 1 + candidate.matchName.length
  }

  const selectedList = Array.from(selected.values())
  return {
    content,
    atUids: selectedList.map((item) => item.atUid),
    atUsers: selectedList.map((item) => ({
      id: item.uid,
      uid: item.uid,
      userId: item.uid,
      nickName: item.nickName,
      name: item.remarkName,
    })),
  }
}

function getCaretTextOffset(): number {
  const editor = editorRef.value
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return content.value.length
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.endContainer)) return content.value.length

  const preRange = range.cloneRange()
  preRange.selectNodeContents(editor)
  preRange.setEnd(range.endContainer, range.endOffset)
  return serializeEditorNode(preRange.cloneContents()).length
}

function getEditorRangeTextOffsets(range: Range): { start: number; end: number } | null {
  const editor = editorRef.value
  if (!editor || !editor.contains(range.commonAncestorContainer)) return null

  const startRange = range.cloneRange()
  startRange.selectNodeContents(editor)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = range.cloneRange()
  endRange.selectNodeContents(editor)
  endRange.setEnd(range.endContainer, range.endOffset)

  return {
    start: serializeEditorNode(startRange.cloneContents()).length,
    end: serializeEditorNode(endRange.cloneContents()).length,
  }
}

function setEditorTextAndCaret(text: string, caretOffset: number) {
  const editor = editorRef.value
  if (!editor) return

  renderEditorText(text)
  content.value = text
  editor.focus()
  placeCaretAtTextOffset(caretOffset)
}

function createEditorNodesFromText(text: string): Node[] {
  const nodes: Node[] = []
  const tokenPattern = /\[[^\]]+\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  const appendPlainText = (value: string) => {
    const parts = value.split('\n')
    parts.forEach((part, index) => {
      if (part) nodes.push(document.createTextNode(part))
      if (index < parts.length - 1) nodes.push(document.createElement('br'))
    })
  }

  while ((match = tokenPattern.exec(text)) !== null) {
    const emoji = match[0]
    if (!getEditorEmojiSrc(emoji)) continue

    appendPlainText(text.slice(lastIndex, match.index))
    nodes.push(createEditorEmojiNode(emoji), createEditorEmojiCaretNode())
    lastIndex = match.index + emoji.length
  }

  appendPlainText(text.slice(lastIndex))
  return nodes
}

function placeCaretAfterInsertedNode(node: Node) {
  const selection = window.getSelection()
  const range = document.createRange()

  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, node.textContent?.length ?? 0)
  } else {
    const parent = node.parentNode
    const index = parent ? Array.prototype.indexOf.call(parent.childNodes, node) : -1
    if (parent && index >= 0) {
      range.setStart(parent, index + 1)
    } else if (editorRef.value) {
      range.selectNodeContents(editorRef.value)
      range.collapse(false)
    }
  }

  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  savedSelection.value = range.cloneRange()
}

function insertPlainTextAtSelection(text: string) {
  if (!text) return

  restoreEditorSelection()
  const editor = editorRef.value
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (editor && (!range || !editor.contains(range.commonAncestorContainer))) {
    placeCaretAtTextOffset(getEditorText().length)
  }

  const nextSelection = window.getSelection()
  const nextRange = nextSelection?.rangeCount ? nextSelection.getRangeAt(0) : null
  const offsets = nextRange ? getEditorRangeTextOffsets(nextRange) : null
  const currentText = getEditorText()
  const start = offsets?.start ?? currentText.length
  const end = offsets?.end ?? start

  recordEditorChangeStart()
  const activeSelection = window.getSelection()
  const activeRange = activeSelection?.rangeCount ? activeSelection.getRangeAt(0) : null
  if (editor && activeRange && editor.contains(activeRange.commonAncestorContainer)) {
    activeRange.deleteContents()
    const fragment = document.createDocumentFragment()
    const nodes = createEditorNodesFromText(text)
    nodes.forEach(node => fragment.appendChild(node))
    const lastNode = nodes[nodes.length - 1]
    activeRange.insertNode(fragment)
    if (lastNode) placeCaretAfterInsertedNode(lastNode)
    content.value = serializeEditorContent()
  } else {
    const nextText = `${currentText.slice(0, start)}${text}${currentText.slice(end)}`
    setEditorTextAndCaret(nextText, start + text.length)
  }

  showAtList.value = false
  atKeyword.value = ''
}

function getActiveAtRange() {
  const text = getEditorText()
  const caretOffset = getCaretTextOffset()
  const beforeCaret = text.slice(0, caretOffset)
  let atIndex = beforeCaret.lastIndexOf('@')
  if (atIndex < 0) return null

  const afterAt = beforeCaret.slice(atIndex + 1)
  if (/\s/.test(afterAt)) return null

  const prev = atIndex > 0 ? text[atIndex - 1] : ''
  if (prev && !/\s|@/.test(prev)) return null

  while (atIndex > 0 && text[atIndex - 1] === '@') {
    atIndex -= 1
  }

  const afterCaret = text.slice(caretOffset)
  const nextBreak = afterCaret.search(/\s/)
  const end = nextBreak < 0 ? text.length : caretOffset + nextBreak

  return {
    start: atIndex,
    end,
    keyword: text.slice(atIndex + 1, caretOffset).replace(/^@+/, ''),
  }
}

function updateAtListFromCaret() {
  if (!isGroup.value || isFileHelperChat.value) {
    showAtList.value = false
    atKeyword.value = ''
    return
  }

  const atRange = getActiveAtRange()
  if (!atRange) {
    showAtList.value = false
    atKeyword.value = ''
    return
  }

  atKeyword.value = atRange.keyword
  showAtList.value = true
}

function handleEditorContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  saveEditorSelection()
  editorMenuX.value = e.clientX
  editorMenuY.value = e.clientY
  editorMenuVisible.value = true
}

async function handleEditorMenuSelect(key: string) {
  restoreEditorSelection()
  if (key === 'copy') {
    const text = window.getSelection()?.toString() || ''
    if (text) {
      try { await writeClipboardText(text) } catch { /* clipboard may be unavailable */ }
    }
    return
  }
  if (key === 'paste') {
    const files = await readClipboardFiles()
    if (files.length > 0) {
      pendingFiles.value = files
      showFilePreview.value = true
      return
    }

    const text = await readClipboardText()
    if (text) {
      insertPlainTextAtSelection(text)
    }
    return
  }
  if (key === 'create_link') {
    selectedLinkText.value = window.getSelection()?.toString() || ''
    showCreateLink.value = true
  }
}

async function readClipboardText() {
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return String(await invoke('read_clipboard_text') || '')
    } catch {
      return ''
    }
  }
  return ''
}

async function readClipboardFiles() {
  if (!(window as any).__TAURI_INTERNALS__) return []
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const items = await invoke<ClipboardFilePayload[]>('read_clipboard_files')
    return items.map(clipboardPayloadToFile)
  } catch {
    return []
  }
}

function hasMojibakeArtifacts(text: string) {
  return text.includes('\uFFFD')
}

function clipboardPayloadToFile(payload: ClipboardFilePayload) {
  const binary = atob(payload.dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], payload.name || 'clipboard-file', {
    type: payload.mime || 'application/octet-stream',
  })
}

function createLocalPathFile(meta: LocalFileMetaPayload): File {
  let loadedFile: Promise<File> | null = null
  const loadFile = async () => {
    if (!loadedFile) {
      const startedAt = performance.now()
      terminalLog('[file-send] lazy read local file start', {
        pathHead: safeHead(meta.path, 80),
        name: meta.name,
        size: meta.size,
        mime: meta.mime,
      })
      loadedFile = import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke<ClipboardFilePayload[]>('read_local_files', { paths: [meta.path] }))
        .then((items) => {
          const item = items[0]
          if (!item) throw new Error('local file not found')
          const file = clipboardPayloadToFile(item)
          terminalLog('[file-send] lazy read local file done', {
            elapsedMs: Math.round(performance.now() - startedAt),
            name: file.name,
            size: file.size,
            type: file.type,
          })
          return file
        })
        .catch((error) => {
          loadedFile = null
          terminalLog('[file-send] lazy read local file failed', {
            elapsedMs: Math.round(performance.now() - startedAt),
            name: meta.name,
            message: (error as Error)?.message || String(error),
          }, 'error')
          throw error
        })
    }
    return loadedFile
  }

  const emptyBlob = new Blob([], { type: meta.mime || 'application/octet-stream' })
  return {
    name: meta.name || 'local-file',
    size: Number(meta.size || 0),
    type: meta.mime || 'application/octet-stream',
    path: meta.path,
    local: meta.path,
    localPath: meta.path,
    __localPath: meta.path,
    lastModified: Date.now(),
    webkitRelativePath: '',
    arrayBuffer: async () => (await loadFile()).arrayBuffer(),
    text: async () => (await loadFile()).text(),
    stream: () => emptyBlob.stream(),
    slice: (start?: number, end?: number, contentType?: string) => emptyBlob.slice(start, end, contentType),
  } as unknown as File
}

// 粘贴图片/文件
async function handlePaste(e: ClipboardEvent) {
  e.preventDefault()
  const items = e.clipboardData?.items

  const files: File[] = []
  if (items) {
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }

  if (files.length > 0) {
    pendingFiles.value = files
    showFilePreview.value = true
    return
  }

  if ((window as any).__TAURI_INTERNALS__) {
    // 对齐旧 im：桌面端先问原生剪贴板是否有图片/文件，避免 WebView 事件带着旧文本时误粘贴文字。
    const nativeFiles = await readClipboardFiles()
    if (nativeFiles.length > 0) {
      pendingFiles.value = nativeFiles
      showFilePreview.value = true
      return
    }
  }

  let text = e.clipboardData?.getData('text/plain') || ''
  // Windows WebView 下 clipboardData 可能出现乱码；检测到异常字符时强制走原生剪贴板读取。
  if ((window as any).__TAURI_INTERNALS__ && hasMojibakeArtifacts(text)) {
    const nativeText = await readClipboardText()
    if (nativeText) text = nativeText
  }
  if (!text) {
    text = await readClipboardText()
  }
  if (text) {
    insertPlainTextAtSelection(text)
    return
  }
}

// 拖拽上传
function handleDrop(e: DragEvent) {
  e.preventDefault()
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length > 0) {
    pendingFiles.value = files
    showFilePreview.value = true
  }
}

function openDroppedFiles(files: File[]) {
  if (files.length === 0) return
  pendingFiles.value = files
  showFilePreview.value = true
}

async function openDroppedFilePaths(paths: string[]) {
  if (paths.length === 0) return
  const startedAt = performance.now()
  terminalLog('[file-send] read dropped paths start', {
    count: paths.length,
    pathHeads: paths.slice(0, 3).map((path) => safeHead(path, 80)),
  })
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const metas = await invoke<LocalFileMetaPayload[]>('stat_local_files', { paths })
    terminalLog('[file-send] stat dropped paths done', {
      elapsedMs: Math.round(performance.now() - startedAt),
      count: metas.length,
      totalBytes: metas.reduce((sum, file) => sum + Number(file.size || 0), 0),
    })
    const imageMetas = metas.filter((item) => String(item.mime || '').startsWith('image/'))
    const imageFilesByPath = new Map<string, File>()

    if (imageMetas.length > 0) {
      const imageReadStartedAt = performance.now()
      const items = await invoke<ClipboardFilePayload[]>('read_local_files', {
        paths: imageMetas.map((item) => item.path),
      })
      items.forEach((item, index) => {
        const path = imageMetas[index]?.path
        // 拖拽图片会先读成普通 File，这里把原始路径补回去，供桌面端本地预览和拖拽打开使用。
        if (path) imageFilesByPath.set(path, attachLocalPathToFile(clipboardPayloadToFile(item), path))
      })
      terminalLog('[file-send] read dropped image paths done', {
        elapsedMs: Math.round(performance.now() - imageReadStartedAt),
        count: items.length,
        totalBytes: items.reduce((sum, item) => sum + Math.floor((item.dataBase64.length * 3) / 4), 0),
      })
    }

    const files = metas.map((meta) => imageFilesByPath.get(meta.path) ?? createLocalPathFile(meta))
    terminalLog('[file-send] read dropped paths done', {
      elapsedMs: Math.round(performance.now() - startedAt),
      count: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      lazyCount: files.length - imageFilesByPath.size,
      imageCount: imageFilesByPath.size,
    })
    openDroppedFiles(files)
  } catch (error) {
    console.warn('[message-input] read dropped files failed:', error)
    terminalLog('[file-send] read dropped paths failed', {
      elapsedMs: Math.round(performance.now() - startedAt),
      message: (error as Error)?.message || String(error),
    }, 'error')
    showToast(t('操作失败'), 'error')
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleEmojiSelect(emoji: string) {
  const src = getEditorEmojiSrc(emoji)
  if (!src) {
    insertPlainTextAtSelection(emoji)
    showEmoji.value = false
    return
  }

  restoreEditorSelection()
  const editor = editorRef.value
  if (!editor) {
    recordEditorChangeStart()
    content.value += emoji
    showEmoji.value = false
    return
  }

  const selection = window.getSelection()
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range || !editor.contains(range.commonAncestorContainer)) {
    range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
  }

  recordEditorChangeStart()
  range.deleteContents()
  const emojiNode = createEditorEmojiNode(emoji)
  const caretNode = createEditorEmojiCaretNode()
  const fragment = document.createDocumentFragment()
  fragment.append(emojiNode, caretNode)
  range.insertNode(fragment)
  range.setStart(caretNode, caretNode.length)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  savedSelection.value = range.cloneRange()
  content.value = serializeEditorContent()
  showAtList.value = false
  atKeyword.value = ''
  showEmoji.value = false
}

function handleDiceSelect() {
  if ((!isFriend.value && !isGroup.value) || showShutupTip.value) return
  terminalLog('[dice] picker select', {
    conversationId: chatStore.currentConversationId,
    conversationType: chatStore.currentConversation?.type,
    targetId: chatStore.currentConversation?.targetId,
  }, 'warn')
  showEmoji.value = false
  emit('send', '', MessageType.SetImage, withReadBurnExtra())
}

function handlePokerSelect() {
  if ((!isFriend.value && !isGroup.value) || showShutupTip.value) return
  terminalLog('[poker] picker select', {
    conversationId: chatStore.currentConversationId,
    conversationType: chatStore.currentConversation?.type,
    targetId: chatStore.currentConversation?.targetId,
  }, 'warn')
  showEmoji.value = false
  emit('send', '', MessageType.AnimatedGame, withReadBurnExtra())
}

function handleAtSelect(member: { uid: string; name: string }) {
  restoreEditorSelection()
  const atRange = getActiveAtRange()
  const name = member.name.replace(/^@+/, '')
  const insertText = `@${name}${VISIBLE_TRAILING_SPACE}`

  recordEditorChangeStart()
  if (!atRange) {
    const text = getEditorText()
    setEditorTextAndCaret(`${text}${insertText}`, text.length + insertText.length)
  } else {
    const text = getEditorText()
    const nextText = `${text.slice(0, atRange.start)}${insertText}${text.slice(atRange.end)}`
    setEditorTextAndCaret(nextText, atRange.start + insertText.length)
  }

  // 记录列表选择的 uid，发送前成员昵称刷新后仍能把旧展示名映射到最新真实昵称。
  selectedAtMentions.set(`${member.uid}:${name}`, { uid: member.uid, matchName: name })
  showAtList.value = false
  atKeyword.value = ''
}

function handleLinkConfirm(data: { linkText: string; linkValue: string; selectText?: string }) {
  // 对齐旧 im：自定义创建的文本链接需要带 customLink 标记，后续展示/跳转逻辑依赖这个 type。
  const linkHtml = `<a href="${data.linkValue}" type="customLink" target="_blank">${data.linkText}</a>`
  restoreEditorSelection()
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0 && data.selectText) {
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const template = document.createElement('template')
    template.innerHTML = linkHtml
    range.insertNode(template.content)
    selection.removeAllRanges()
  } else if (editorRef.value) {
    editorRef.value.innerHTML += linkHtml
  }
  if (editorRef.value) content.value = editorRef.value.innerHTML
}

async function handleFileSelect() {
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: true,
        directory: false,
      })
      const paths = Array.isArray(selected)
        ? selected.map(String)
        : selected
          ? [String(selected)]
          : []
      if (paths.length > 0) {
        await openDroppedFilePaths(paths)
        return
      }
    } catch (error) {
      console.warn('[message-input] native file select failed:', error)
    }
  }
  toolbarFileInputRef.value?.click()
}

function handleToolbarFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  pendingFiles.value = files
  showFilePreview.value = true
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function getImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = src
  })
}

async function resolveLocalImagePreviewSrc(file: File, previewUrlOverride?: string): Promise<string> {
  const override = String(previewUrlOverride || '').trim()
  if (override) return override

  const localPath = getLocalFilePath(file)
  if ((window as any).__TAURI_INTERNALS__) {
    if (localPath) {
      // 桌面端优先从本地路径派生可渲染地址，避免 WebView 把 blob: 当成本地资源拦截。
      return toDisplaySrc(localPath)
    }
    // 粘贴截图等没有磁盘路径的图片用 data URL 兜底，避免发送占位依赖 blob:。
    return fileToDataURL(file)
  }

  return URL.createObjectURL(file)
}

async function appendLocalImagePreview(
  file: File,
  fileKey: string,
  trace: ImageSendTrace,
  options?: {
    msgType?: MessageType
    previewUrlOverride?: string
  },
): Promise<LocalImagePreview | null> {
  const conversationId = convId.value
  const uid = authStore.uid
  if (!conversationId || !uid) return null

  const localPath = getLocalFilePath(file)
  const previewUrl = await resolveLocalImagePreviewSrc(file, options?.previewUrlOverride)
  const { width, height } = await getImageSize(previewUrl)
  const optimisticId = createOptimisticImageId()
  const extra = withReadBurnExtra({
    fileKey,
    uploadPending: true,
    imageTraceId: trace.id,
    ...(localPath ? { local: localPath, localPath } : {}),
  })
  messageStore.appendMessage(conversationId, {
    id: optimisticId,
    customMsgId: optimisticId,
    conversationId,
    senderId: uid,
    msgType: options?.msgType ?? MessageType.Image,
    content: JSON.stringify({
      url: previewUrl,
      thumbnailUrl: previewUrl,
      width,
      height,
      size: file.size,
      name: file.name,
      fileKey,
      ...(localPath ? { local: localPath, localPath } : {}),
    }),
    sendTime: Date.now(),
    status: 0,
    readStatus: 0,
    version: 0,
    isDeleted: false,
    extra: extra ? JSON.stringify(extra) : null,
  })
  traceLog(trace, 'local preview appended', {
    optimisticId,
    width,
    height,
    size: file.size,
    msgType: options?.msgType ?? MessageType.Image,
    previewScheme: previewUrl.split(':')[0] || 'unknown',
    hasLocalPath: Boolean(localPath),
  })
  return { url: previewUrl, width, height, optimisticId }
}

function buildMediasCaptionSegment(slot: {
  msgType: MessageType
  url: string
  thumbnailUrl: string
  size: number
  width?: number
  height?: number
}): string {
  if (slot.msgType === MessageType.DynamicImage) {
    return `gif:${slot.url}||${slot.thumbnailUrl || slot.url}`
  }
  return `image:${slot.url}||${slot.thumbnailUrl || slot.url}||${slot.size || 0}||0`
}

async function handleChannelMediasCaptionSend(files: File[], caption: string): Promise<boolean> {
  const conversationId = convId.value
  const uid = authStore.uid
  const isChannel = chatStore.currentConversation?.type === ConversationType.Channel
  const imageFiles = files.filter(file => file.type.startsWith('image/'))
  if (!isChannel || files.length < 2 || imageFiles.length !== files.length || !conversationId || !uid) return false
  if (files.some(file => file.size > getFileSizeLimitBytes(file))) return false

  const sharedFileKey = createFileKey()
  const optimisticId = createOptimisticImageId()
  const preparedSlots: MediaCaptionPreparedSlot[] = []

  try {
    for (const file of files) {
      const trace = createImageTrace()
      const sendFile = await ensureBlobBackedFile(file, trace)
      const isGif = /image\/gif$/i.test(sendFile.type) || getFileSuffix(sendFile) === 'gif'
      const msgType = isGif ? MessageType.DynamicImage : MessageType.Image
      const previewUrl = await resolveLocalImagePreviewSrc(
        sendFile,
        isGif ? await fileToDataURL(sendFile) : '',
      )
      const { width, height } = await getImageSize(previewUrl)
      preparedSlots.push({
        file: sendFile,
        fileKey: sharedFileKey,
        msgType,
        previewUrl,
        width,
        height,
        size: sendFile.size,
        name: sendFile.name,
        trace,
      })
    }

    const localContent = preparedSlots
      .map(slot => buildMediasCaptionSegment({
        msgType: slot.msgType,
        url: slot.previewUrl,
        thumbnailUrl: slot.previewUrl,
        size: slot.size,
        width: slot.width,
        height: slot.height,
      }))
      .join('|||') + (caption ? `##caption##${caption}` : '')
    const extra = withReadBurnExtra({
      uploadPending: true,
      mediasCaptionFileKey: sharedFileKey,
    })

    // 对齐旧 im：频道多图先插入一条 msgType 17 本地预览，上传完成后用同一 customMsgId 替换为远端内容。
    messageStore.appendMessage(conversationId, {
      id: optimisticId,
      customMsgId: optimisticId,
      conversationId,
      senderId: uid,
      msgType: MessageType.MediasCaption,
      content: localContent,
      sendTime: Date.now(),
      status: 0,
      readStatus: 0,
      version: 0,
      isDeleted: false,
      extra: extra ? JSON.stringify(extra) : null,
    })

    const uploadedSlots: MediaCaptionUploadedSlot[] = []
    for (const slot of preparedSlots) {
      const uploaded = await uploadImageLikeIm(slot.file, {
        fileKey: slot.fileKey,
        width: slot.width,
        height: slot.height,
        trace: slot.trace,
        msgType: slot.msgType,
      })
      uploadedSlots.push({
        msgType: slot.msgType,
        url: uploaded.url,
        thumbnailUrl: uploaded.thumbnailUrl,
        width: uploaded.width,
        height: uploaded.height,
        size: uploaded.size,
      })
    }

    const remoteContent = uploadedSlots
      .map(buildMediasCaptionSegment)
      .join('|||') + (caption ? `##caption##${caption}` : '')
    emit('send', remoteContent, MessageType.MediasCaption, withReadBurnExtra({
      fileKey: sharedFileKey,
      __clientMsgId: optimisticId,
    }))
    showFilePreview.value = false
    pendingFiles.value = []
    return true
  } catch (error) {
    console.error('[message-input] channel medias caption send failed:', error)
    if (optimisticId) messageStore.updateMessageStatus(optimisticId, -1)
    showToast((error as Error)?.message || t('操作失败'), 'error')
    showFilePreview.value = false
    pendingFiles.value = []
    return true
  }
}

function appendLocalVideoPreview(
  file: File,
  fileKey: string,
  metadata: VideoMetadata,
  trace: ImageSendTrace,
): LocalVideoPreview | null {
  const conversationId = convId.value
  const uid = authStore.uid
  if (!conversationId || !uid) return null

  const previewUrl = URL.createObjectURL(file)
  const optimisticId = createOptimisticImageId()
  const localPath = getLocalFilePath(file)
  const extra = withReadBurnExtra({
    fileKey,
    uploadPending: true,
    videoTraceId: trace.id,
    ...(localPath ? { local: localPath, localPath } : {}),
  })
  messageStore.appendMessage(conversationId, {
    id: optimisticId,
    customMsgId: optimisticId,
    conversationId,
    senderId: uid,
    msgType: MessageType.Video,
    content: JSON.stringify({
      url: previewUrl,
      thumbUrl: metadata.thumbDataUrl,
      thumbnailUrl: metadata.thumbDataUrl,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      size: file.size,
      name: file.name,
      fileKey,
      ...(localPath ? { local: localPath, localPath } : {}),
    }),
    sendTime: Date.now(),
    status: 0,
    readStatus: 0,
    version: 0,
    isDeleted: false,
    extra: extra ? JSON.stringify(extra) : null,
  })
  fileTraceLog(trace, 'local video preview appended', {
    optimisticId,
    name: file.name,
    size: file.size,
    type: file.type,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    hasLocalPath: Boolean(localPath),
  })
  return { url: previewUrl, optimisticId }
}

function appendLocalFilePreview(
  file: File,
  fileKey: string,
  trace: ImageSendTrace,
): LocalFilePreview | null {
  const conversationId = convId.value
  const uid = authStore.uid
  if (!conversationId || !uid) return null

  const suffix = getFileSuffix(file)
  const contentType = getUploadContentType(file, suffix)
  const optimisticId = createOptimisticImageId()
  const localPath = getLocalFilePath(file)
  const extra = withReadBurnExtra({
    fileKey,
    uploadPending: true,
    fileTraceId: trace.id,
    ...(localPath ? { local: localPath, localPath } : {}),
  })
  messageStore.appendMessage(conversationId, {
    id: optimisticId,
    customMsgId: optimisticId,
    conversationId,
    senderId: uid,
    msgType: MessageType.File,
    content: JSON.stringify({
      name: file.name,
      size: file.size,
      ext: suffix,
      mimeType: contentType,
      fileKey,
      uploadPending: true,
      ...(localPath ? { local: localPath, localPath } : {}),
    }),
    sendTime: Date.now(),
    status: 0,
    readStatus: 0,
    version: 0,
    isDeleted: false,
    extra: extra ? JSON.stringify(extra) : null,
  })
  fileTraceLog(trace, 'local file preview appended', {
    optimisticId,
    name: file.name,
    size: file.size,
    type: file.type,
    suffix,
    contentType,
    hasLocalPath: Boolean(localPath),
  })
  return { optimisticId }
}

function getFileSizeLimitBytes(file: File): number {
  return file.type.startsWith('image/') ? MAX_IMAGE_SIZE_BYTES : MAX_FILE_SIZE_BYTES
}

function isVideoFile(file: File): boolean {
  const suffix = getFileSuffix(file)
  return file.type.startsWith('video/') || VIDEO_FILE_EXTENSIONS.has(suffix)
}

function createFileKey(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10).toString(10)).join('')
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function encryptFileForUpload(file: File, fileKey: string): Promise<Uint8Array> {
  const plain = new Uint8Array(await file.arrayBuffer())
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < plain.byteLength; offset += FILE_ENCRYPT_CHUNK_SIZE) {
    chunks.push(aesEncrypt(fileKey, plain.slice(offset, offset + FILE_ENCRYPT_CHUNK_SIZE)))
  }
  return concatUint8Arrays(chunks)
}

function getFileSuffix(file: File): string {
  const name = file.name || ''
  const dot = name.lastIndexOf('.')
  if (dot >= 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase()
  const subtype = (file.type || '').split('/')[1] || 'png'
  return subtype.split(';')[0].toLowerCase() || 'png'
}

function getUploadContentType(file: File, suffix: string): string {
  // 原生文件选择在 Office 文档上可能只给 application/octet-stream；按后缀补齐 MIME，避免上传和 FileObj 都丢失真实类型。
  if (file.type && file.type !== 'application/octet-stream') return file.type
  if (suffix === 'jpg' || suffix === 'jpeg') return 'image/jpeg'
  if (suffix === 'png') return 'image/png'
  if (suffix === 'gif') return 'image/gif'
  if (suffix === 'webp') return 'image/webp'
  if (suffix === 'mp4' || suffix === 'm4v') return 'video/mp4'
  if (suffix === 'mov') return 'video/quicktime'
  if (suffix === 'webm') return 'video/webm'
  if (suffix === 'ogg') return 'video/ogg'
  if (suffix === 'xls') return 'application/vnd.ms-excel'
  if (suffix === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (suffix === 'doc') return 'application/msword'
  if (suffix === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (suffix === 'ppt') return 'application/vnd.ms-powerpoint'
  if (suffix === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (suffix === 'pdf') return 'application/pdf'
  if (suffix === 'zip') return 'application/zip'
  return 'application/octet-stream'
}

function getUploadAttachType(msgType: MessageType): number {
  if (msgType === MessageType.Image) return 0
  if (msgType === MessageType.Audio) return 1
  // 对齐旧 im 的真实上传映射：视频主文件 attachType 传 1，不按 proto 枚举名改成 2。
  if (msgType === MessageType.Video) return 1
  if (msgType === MessageType.DynamicImage) return 4
  return 3
}

function resolveUploadOssSceneType(msgType: MessageType): number {
  // 对齐旧 im：只有普通聊天图片走聊天图片 OSS 场景；GIF、视频主文件、普通文件都走通用 OSS。
  return msgType === MessageType.Image ? 1 : 0
}

function getUploadChannelType(uploadUrlInfo: proto.GetUploadUrlResp): unknown {
  // openchat 上传接口已下发 channelType，但当前生成类型还没包含该字段，先做兼容读取。
  return (uploadUrlInfo as proto.GetUploadUrlResp & { channelType?: unknown }).channelType
}

function normalizeOssEndpoint(endpoint: string): string {
  const raw = String(endpoint || '').trim()
  if (!raw) return ''
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function stripQuery(url: string): string {
  const index = url.indexOf('?')
  return index >= 0 ? url.slice(0, index) : url
}

function toHttpsUrl(url: string): string {
  return String(url || '').replace(/^http:/i, 'https:')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function getEncryptedUploadSize(plainSize: number): number {
  if (!Number.isFinite(plainSize) || plainSize <= 0) return 0
  let encryptedSize = 0
  for (let offset = 0; offset < plainSize; offset += FILE_ENCRYPT_CHUNK_SIZE) {
    const chunkSize = Math.min(FILE_ENCRYPT_CHUNK_SIZE, plainSize - offset)
    const remainder = chunkSize % 16
    encryptedSize += chunkSize + (remainder === 0 ? 16 : 16 - remainder)
  }
  return encryptedSize
}

async function putObjectWithOssCandidates(options: {
  responseUrl: string
  bucket: string
  endpoint: string
  objectKey: string
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  body?: Uint8Array
  localPath?: string
  fileKey?: string
  plainSize?: number
  contentType: string
  channelType?: unknown
  ossSceneType?: number
  trace?: ImageSendTrace
  logPrefix?: string
}): Promise<{ uploadUrl: string; candidate: OssUploadCandidate }> {
  let lastError: unknown = null

  // 对齐老 im：上传先走动态 OSS 域名池，token endpoint / 接口回传 URL 只作为兜底。
  const candidates = await getOssUploadCandidates({
    responseUrl: options.responseUrl,
    bucket: options.bucket,
    endpoint: options.endpoint,
    objectKey: options.objectKey,
    channelType: options.channelType,
    ossSceneType: options.ossSceneType,
  })

  for (const candidate of candidates) {
    try {
      await putObjectToOss({
        url: candidate.url,
        bucket: options.bucket,
        objectKey: options.objectKey,
        accessKeyId: options.accessKeyId,
        accessKeySecret: options.accessKeySecret,
        securityToken: options.securityToken,
        body: options.body,
        localPath: options.localPath,
        fileKey: options.fileKey,
        plainSize: options.plainSize,
        contentType: options.contentType,
        trace: options.trace,
        logPrefix: options.logPrefix,
      })
      return { uploadUrl: candidate.url, candidate }
    } catch (error) {
      lastError = error
      await reportOssUploadCandidateFailure(candidate, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('上传失败：所有 OSS endpoint 均不可用')
}

async function hmacSha1Base64(secret: string, text: string): Promise<string> {
  const cryptoApi = window.crypto?.subtle
  if (!cryptoApi) throw new Error('当前环境不支持文件上传签名')
  const key = await cryptoApi.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await cryptoApi.sign('HMAC', key, new TextEncoder().encode(text))
  const bytes = new Uint8Array(signature)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

async function putObjectToOss(options: {
  url: string
  bucket: string
  objectKey: string
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  body?: Uint8Array
  localPath?: string
  fileKey?: string
  plainSize?: number
  contentType: string
  trace?: ImageSendTrace
  logPrefix?: string
}) {
  const contentType = options.contentType || 'application/octet-stream'
  const logPrefix = options.logPrefix || ''
  const log = options.trace
    ? (message: string, data: Record<string, unknown>, level?: 'info' | 'warn' | 'error') => traceLog(options.trace!, `${logPrefix}${message}`, data, level)
    : terminalLog
  log('oss put start', {
    urlHost: (() => {
      try { return new URL(options.url).host } catch { return options.url.slice(0, 60) }
    })(),
    bucket: options.bucket,
    objectKeyHead: safeHead(options.objectKey, 24),
    objectKeyLen: options.objectKey.length,
    bodyBytes: options.body?.byteLength ?? 0,
    hasLocalPath: Boolean(options.localPath),
    plainSize: options.plainSize ?? 0,
    contentType,
    hasAccessKeyId: Boolean(options.accessKeyId),
    hasAccessKeySecret: Boolean(options.accessKeySecret),
    hasSecurityToken: Boolean(options.securityToken),
  })

  if ((window as any).__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
    if (options.localPath && options.fileKey) {
      // 桌面端有本地路径时交给 Rust 读盘加密上传，避免大视频/动图经 IPC 传 base64 卡住。
      const result = await invoke<{ ok: boolean; status: number; body: string }>('upload_oss_local_file', {
        request: {
          url: options.url,
          bucket: options.bucket,
          objectKey: options.objectKey,
          accessKeyId: options.accessKeyId,
          accessKeySecret: options.accessKeySecret,
          securityToken: options.securityToken,
          contentType,
          filePath: options.localPath,
          fileKey: options.fileKey,
        },
      })
      log('oss local file put response', {
        ok: result.ok,
        status: result.status,
        bodyHead: String(result.body || '').slice(0, 240),
        bodyLen: String(result.body || '').length,
      }, result.ok ? 'info' : 'error')
      if (!result.ok || result.status < 200 || result.status >= 300) {
        const error = new Error(`上传文件失败：HTTP ${result.status}`)
        ;(error as any).status = result.status
        ;(error as any).responseBody = result.body
        throw error
      }
      return
    }
    if (!options.body) throw new Error('上传文件失败：上传内容为空')
    const encodeStartedAt = performance.now()
    const bodyBase64 = bytesToBase64(options.body)
    log('oss body base64 done', {
      elapsedMs: Math.round(performance.now() - encodeStartedAt),
      bodyBytes: options.body.byteLength,
      base64Length: bodyBase64.length,
    })
    const result = await invoke<{ ok: boolean; status: number; body: string }>('upload_oss_object', {
      request: {
        url: options.url,
        bucket: options.bucket,
        objectKey: options.objectKey,
        accessKeyId: options.accessKeyId,
        accessKeySecret: options.accessKeySecret,
        securityToken: options.securityToken,
        contentType,
        bodyBase64,
      },
    })
    log('oss put response', {
      ok: result.ok,
      status: result.status,
      bodyHead: String(result.body || '').slice(0, 240),
      bodyLen: String(result.body || '').length,
    }, result.ok ? 'info' : 'error')
    // 桌面端与浏览器分支统一：非 2xx 必须抛错，交给上层域名轮换重试，避免把失败上传误判为成功。
    if (!result.ok || result.status < 200 || result.status >= 300) {
      const error = new Error(`上传图片失败：HTTP ${result.status}`)
      ;(error as any).status = result.status
      ;(error as any).responseBody = result.body
      throw error
    }
    return
  }

  if (!options.body) throw new Error('上传文件失败：上传内容为空')
  const ossDate = new Date().toUTCString()
  const canonicalResource = `/${options.bucket}/${options.objectKey.replace(/^\/+/, '')}`
  const canonicalHeaders = [
    `x-oss-date:${ossDate}`,
    `x-oss-security-token:${options.securityToken}`,
  ].join('\n') + '\n'
  const stringToSign = `PUT\n\n${contentType}\n${ossDate}\n${canonicalHeaders}${canonicalResource}`
  const signature = await hmacSha1Base64(options.accessKeySecret, stringToSign)
  const authorization = `OSS ${options.accessKeyId}:${signature}`

  const bodyBuffer = new ArrayBuffer(options.body.byteLength)
  new Uint8Array(bodyBuffer).set(options.body)
  const response = await fetch(options.url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'x-oss-date': ossDate,
      'Content-Type': contentType,
      'x-oss-security-token': options.securityToken,
    },
    body: new Blob([bodyBuffer], { type: contentType }),
  })
  log('oss put response', {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  }, response.ok ? 'info' : 'error')
  if (!response.ok) {
    throw new Error(`上传图片失败：HTTP ${response.status}`)
  }
}

async function uploadImageLikeIm(
  file: File,
  options?: {
    fileKey?: string
    width?: number
    height?: number
    trace?: ImageSendTrace
    msgType?: MessageType
  },
): Promise<UploadedImagePayload> {
  const trace = options?.trace ?? createImageTrace()
  traceLog(trace, 'upload start', {
    name: file.name,
    size: file.size,
    type: file.type,
  })
  const fileKey = options?.fileKey || createFileKey()
  const localUploadPath = (window as any).__TAURI_INTERNALS__ ? getLocalFilePath(file) : ''
  // 桌面端本地文件用路径上传，避免大媒体重复读入 JS 并转 base64；无路径文件仍走原来的内存上传。
  const encrypted = localUploadPath ? null : await encryptFileForUpload(file, fileKey)
  const suffix = getFileSuffix(file)
  const contentType = getUploadContentType(file, suffix)
  const encryptedBytes = encrypted?.byteLength ?? getEncryptedUploadSize(file.size)
  const msgType = options?.msgType ?? MessageType.Image
  const ossSceneType = resolveUploadOssSceneType(msgType)
  traceLog(trace, 'encrypt done', {
    originalBytes: file.size,
    encryptedBytes,
    suffix,
    contentType,
    usedLocalPathUpload: Boolean(localUploadPath),
    fileKeyHead: safeHead(fileKey),
    fileKeyLen: fileKey.length,
  })
  const [uploadUrlInfo, token] = await Promise.all([
    getUploadUrl({
      attachType: getUploadAttachType(msgType),
      attachWorkspaceType: 1,
      fileSize: encryptedBytes,
      suffix,
      ossSceneType,
    }),
    getUploadToken({ ossSceneType }),
  ])
  traceLog(trace, 'upload api response', {
    fileIdHead: safeHead(String(uploadUrlInfo.fileId || ''), 24),
    fileIdLen: String(uploadUrlInfo.fileId || '').length,
    responseUrlHost: (() => {
      try { return new URL(String(uploadUrlInfo.url || '')).host } catch { return String(uploadUrlInfo.url || '').slice(0, 60) }
    })(),
    ossEndpoint: String(token.ossEndpoint || ''),
    ossBucket: String(token.ossBucket || ''),
    channelType: Number(getUploadChannelType(uploadUrlInfo) ?? 0),
    ossSceneType,
    hasAccessKeyId: Boolean(token.accessKeyId),
    hasAccessKeySecret: Boolean(token.accessKeySecret),
    hasSecurityToken: Boolean(token.securityToken),
    tokenExpiration: Number(token.expiration || 0),
  })

  const objectKey = String(uploadUrlInfo.fileId || '').trim()
  const endpoint = normalizeOssEndpoint(String(token.ossEndpoint || ''))
  const bucket = String(token.ossBucket || '').trim()
  const responseUrl = String(uploadUrlInfo.url || '').trim()
  const accessKeyId = String(token.accessKeyId || '').trim()
  const accessKeySecret = String(token.accessKeySecret || '').trim()
  const securityToken = String(token.securityToken || '').trim()
  if (!objectKey || !bucket || !endpoint || !accessKeyId || !accessKeySecret || !securityToken) {
    throw new Error('上传图片失败：OSS 参数缺失')
  }

  const { uploadUrl } = await putObjectWithOssCandidates({
    responseUrl,
    bucket,
    endpoint,
    objectKey,
    accessKeyId,
    accessKeySecret,
    securityToken,
    body: encrypted ?? undefined,
    localPath: localUploadPath || undefined,
    fileKey,
    plainSize: file.size,
    contentType,
    channelType: getUploadChannelType(uploadUrlInfo),
    ossSceneType,
    trace,
  })

  const width = options?.width ?? 0
  const height = options?.height ?? 0
  // 优先回填实际上传成功的域名，保持打包端与开发端一致的可访问结果。
  const finalUrl = toHttpsUrl(stripQuery(uploadUrl || responseUrl))
  traceLog(trace, 'upload done', {
    finalUrlHost: (() => {
      try { return new URL(finalUrl).host } catch { return finalUrl.slice(0, 60) }
    })(),
    width,
    height,
    fileKeyHead: safeHead(fileKey),
    fileKeyLen: fileKey.length,
  })
  return {
    url: finalUrl,
    thumbnailUrl: finalUrl,
    width,
    height,
    size: file.size,
    name: file.name,
    fileKey,
  }
}

async function uploadFileLikeIm(
  file: File,
  options?: {
    fileKey?: string
    trace?: ImageSendTrace
  },
): Promise<UploadedFilePayload> {
  const trace = options?.trace ?? createImageTrace()
  fileTraceLog(trace, 'upload start', {
    name: file.name,
    size: file.size,
    type: file.type,
  })
  const fileKey = options?.fileKey || createFileKey()
  const localUploadPath = (window as any).__TAURI_INTERNALS__ ? getLocalFilePath(file) : ''
  // 桌面端本地文件用路径上传，避免大媒体重复读入 JS 并转 base64；无路径文件仍走原来的内存上传。
  const encrypted = localUploadPath ? null : await encryptFileForUpload(file, fileKey)
  const suffix = getFileSuffix(file)
  const contentType = getUploadContentType(file, suffix)
  const encryptedBytes = encrypted?.byteLength ?? getEncryptedUploadSize(file.size)
  const ossSceneType = resolveUploadOssSceneType(MessageType.File)
  fileTraceLog(trace, 'encrypt done', {
    originalBytes: file.size,
    encryptedBytes,
    suffix,
    contentType,
    usedLocalPathUpload: Boolean(localUploadPath),
    fileKeyHead: safeHead(fileKey),
    fileKeyLen: fileKey.length,
  })
  fileTraceLog(trace, 'upload api start', {
    attachType: getUploadAttachType(MessageType.File),
    attachWorkspaceType: 1,
    fileSize: encryptedBytes,
    suffix,
    ossSceneType,
  })
  const [uploadUrlInfo, token] = await Promise.all([
    getUploadUrl({
      attachType: getUploadAttachType(MessageType.File),
      attachWorkspaceType: 1,
      fileSize: encryptedBytes,
      suffix,
      ossSceneType,
    }),
    getUploadToken({ ossSceneType }),
  ])
  fileTraceLog(trace, 'upload api done', {
    fileIdHead: safeHead(String(uploadUrlInfo.fileId || ''), 24),
    fileIdLen: String(uploadUrlInfo.fileId || '').length,
    responseUrlHost: (() => {
      try { return new URL(String(uploadUrlInfo.url || '')).host } catch { return String(uploadUrlInfo.url || '').slice(0, 60) }
    })(),
    ossEndpoint: String(token.ossEndpoint || ''),
    ossBucket: String(token.ossBucket || ''),
    channelType: Number(getUploadChannelType(uploadUrlInfo) ?? 0),
    ossSceneType,
    hasAccessKeyId: Boolean(token.accessKeyId),
    hasAccessKeySecret: Boolean(token.accessKeySecret),
    hasSecurityToken: Boolean(token.securityToken),
    tokenExpiration: Number(token.expiration || 0),
  })

  const objectKey = String(uploadUrlInfo.fileId || '').trim()
  const endpoint = normalizeOssEndpoint(String(token.ossEndpoint || ''))
  const bucket = String(token.ossBucket || '').trim()
  const responseUrl = String(uploadUrlInfo.url || '').trim()
  const accessKeyId = String(token.accessKeyId || '').trim()
  const accessKeySecret = String(token.accessKeySecret || '').trim()
  const securityToken = String(token.securityToken || '').trim()
  if (!objectKey || !bucket || !endpoint || !accessKeyId || !accessKeySecret || !securityToken) {
    throw new Error('上传文件失败：OSS 参数缺失')
  }

  const { uploadUrl } = await putObjectWithOssCandidates({
    responseUrl,
    bucket,
    endpoint,
    objectKey,
    accessKeyId,
    accessKeySecret,
    securityToken,
    body: encrypted ?? undefined,
    localPath: localUploadPath || undefined,
    fileKey,
    plainSize: file.size,
    contentType,
    channelType: getUploadChannelType(uploadUrlInfo),
    ossSceneType,
    trace,
    logPrefix: '[file-send] ',
  })

  // 优先回填实际上传成功的域名，保持打包端与开发端一致的可访问结果。
  const finalUrl = toHttpsUrl(stripQuery(uploadUrl || responseUrl))
  fileTraceLog(trace, 'upload done', {
    name: file.name,
    originalBytes: file.size,
    encryptedBytes,
    finalUrlHost: (() => {
      try { return new URL(finalUrl).host } catch { return finalUrl.slice(0, 60) }
    })(),
    fileKeyHead: safeHead(fileKey),
    fileKeyLen: fileKey.length,
  })

  return {
    url: finalUrl,
    size: file.size,
    name: file.name,
    ext: suffix,
    mimeType: contentType,
    fileKey,
  }
}

function getVideoMetadata(file: File, trace?: ImageSendTrace): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const objectUrl = URL.createObjectURL(file)
    let settled = false
    let timer = 0
    let seekTimer = 0
    let waitingForSeek = false
    let candidateTimes: number[] = []
    let candidateIndex = 0
    const log = (
      message: string,
      data?: Record<string, unknown>,
      level: 'info' | 'warn' | 'error' = 'info',
    ) => {
      if (trace) {
        fileTraceLog(trace, `[single-video-send] metadata ${message}`, data, level)
      } else {
        terminalLog(`[single-video-send] metadata ${message}`, data, level)
      }
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      window.clearTimeout(seekTimer)
      URL.revokeObjectURL(objectUrl)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('loadeddata', handleMediaReady)
      video.removeEventListener('canplay', handleMediaReady)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', fail)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }

    const buildCandidateTimes = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      if (duration <= 0.2) return [0]

      const rawTimes = [
        0.1,
        0.5,
        1,
        2,
        Math.min(Math.max(duration * 0.25, 0.1), Math.max(0.1, duration - 0.1)),
        Math.min(Math.max(duration * 0.5, 0.1), Math.max(0.1, duration - 0.1)),
      ]
      return [...new Set(
        rawTimes
          .filter(time => Number.isFinite(time) && time >= 0 && time < duration)
          .map(time => Number(time.toFixed(2))),
      )]
    }

    const frameLooksBlank = (context: CanvasRenderingContext2D, width: number, height: number): boolean => {
      const sampleWidth = Math.min(80, width)
      const sampleHeight = Math.min(80, height)
      if (sampleWidth <= 0 || sampleHeight <= 0) return false

      const sample = document.createElement('canvas')
      sample.width = sampleWidth
      sample.height = sampleHeight
      const sampleContext = sample.getContext('2d')
      if (!sampleContext) return false
      sampleContext.drawImage(canvas, 0, 0, sampleWidth, sampleHeight)

      const data = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data
      let total = 0
      let brightPixels = 0
      let min = 255
      let max = 0
      for (let i = 0; i < data.length; i += 4) {
        const luma = (data[i] * 0.2126) + (data[i + 1] * 0.7152) + (data[i + 2] * 0.0722)
        total += luma
        if (luma > 28) brightPixels += 1
        if (luma < min) min = luma
        if (luma > max) max = luma
      }
      const pixels = data.length / 4
      const average = pixels > 0 ? total / pixels : 255
      const brightRatio = pixels > 0 ? brightPixels / pixels : 1
      return average < 18 && brightRatio < 0.03 && (max - min) < 35
    }

    const seekToNextCandidate = (): boolean => {
      window.clearTimeout(seekTimer)
      if (candidateIndex >= candidateTimes.length) return false
      const nextTime = candidateTimes[candidateIndex]
      candidateIndex += 1
      try {
        waitingForSeek = true
        video.currentTime = nextTime
        log('seek candidate', {
          nextTime,
          candidateIndex,
          candidateCount: candidateTimes.length,
          readyState: video.readyState,
        })
        seekTimer = window.setTimeout(() => {
          if (settled || !waitingForSeek) return
          log('seek timeout fallback capture', {
            currentTime: video.currentTime,
            readyState: video.readyState,
          }, 'warn')
          waitingForSeek = false
          captureFrame()
        }, 1200)
        return true
      } catch {
        log('seek candidate failed', {
          nextTime,
          candidateIndex,
        }, 'warn')
        waitingForSeek = false
        return seekToNextCandidate()
      }
    }

    const captureFrame = () => {
      if (settled) return
      const sourceWidth = video.videoWidth || 0
      const sourceHeight = video.videoHeight || 0
      if (!sourceWidth || !sourceHeight) {
        log('capture skipped missing dimensions', {
          readyState: video.readyState,
          currentTime: video.currentTime,
          videoWidth: sourceWidth,
          videoHeight: sourceHeight,
        }, 'warn')
        return
      }

      settled = true
      window.clearTimeout(seekTimer)
      const maxThumbEdge = 720
      const scale = Math.min(1, maxThumbEdge / Math.max(sourceWidth, sourceHeight))
      canvas.width = Math.max(1, Math.round(sourceWidth * scale))
      canvas.height = Math.max(1, Math.round(sourceHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        cleanup()
        reject(new Error('生成视频封面失败'))
        return
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      if (frameLooksBlank(context, canvas.width, canvas.height) && seekToNextCandidate()) {
        settled = false
        log('blank frame skipped', {
          currentTime: video.currentTime,
          nextCandidateIndex: candidateIndex,
        }, 'warn')
        return
      }
      const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.82)
      const duration = Number.isFinite(video.duration) ? Math.max(0, Math.round(video.duration)) : 0
      log('capture success', {
        width: sourceWidth,
        height: sourceHeight,
        duration,
        currentTime: video.currentTime,
        thumbDataUrlLen: thumbDataUrl.length,
      })
      cleanup()
      resolve({
        thumbDataUrl,
        width: sourceWidth,
        height: sourceHeight,
        duration,
      })
    }

    const fail = () => {
      if (settled) return
      settled = true
      log('failed', {
        readyState: video.readyState,
        currentTime: video.currentTime,
        videoWidth: video.videoWidth || 0,
        videoHeight: video.videoHeight || 0,
      }, 'error')
      cleanup()
      reject(new Error('视频预览生成失败'))
    }

    const handleMediaReady = () => {
      if (waitingForSeek && video.readyState < 2) return
      if (waitingForSeek) {
        window.clearTimeout(seekTimer)
        seekTimer = window.setTimeout(() => {
          if (settled || !waitingForSeek) return
          waitingForSeek = false
          captureFrame()
        }, 80)
        return
      }
      captureFrame()
    }

    const handleSeeked = () => {
      window.clearTimeout(seekTimer)
      waitingForSeek = false
      captureFrame()
    }

    const handleTimeUpdate = () => {
      if (!waitingForSeek || video.readyState < 2) return
      window.clearTimeout(seekTimer)
      waitingForSeek = false
      captureFrame()
    }

    const handleLoadedMetadata = () => {
      candidateTimes = buildCandidateTimes()
      log('loadedmetadata', {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        videoWidth: video.videoWidth || 0,
        videoHeight: video.videoHeight || 0,
        candidateTimes,
      })
      if (seekToNextCandidate()) return
      captureFrame()
    }

    timer = window.setTimeout(fail, 10000)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('loadeddata', handleMediaReady)
    video.addEventListener('canplay', handleMediaReady)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('error', fail)
    video.src = objectUrl
    video.load()
  })
}

async function uploadVideoLikeIm(
  file: File,
  metadata: VideoMetadata,
  options?: {
    fileKey?: string
    trace?: ImageSendTrace
  },
): Promise<UploadedVideoPayload> {
  const trace = options?.trace ?? createImageTrace()
  const fileKey = options?.fileKey || createFileKey()
  const thumbFile = dataUrlToFile(metadata.thumbDataUrl, `${file.name || 'video'}-thumb.jpg`)
  const uploadedThumb = await uploadImageLikeIm(thumbFile, {
    fileKey,
    width: metadata.width,
    height: metadata.height,
    trace,
  })

  fileTraceLog(trace, 'video upload start', {
    name: file.name,
    size: file.size,
    type: file.type,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
  })
  const localUploadPath = (window as any).__TAURI_INTERNALS__ ? getLocalFilePath(file) : ''
  // 桌面端本地视频用路径上传，避免上传本体再次读入 JS 并转 base64。
  const encrypted = localUploadPath ? null : await encryptFileForUpload(file, fileKey)
  const suffix = getFileSuffix(file)
  const contentType = getUploadContentType(file, suffix)
  const encryptedBytes = encrypted?.byteLength ?? getEncryptedUploadSize(file.size)
  const ossSceneType = resolveUploadOssSceneType(MessageType.Video)
  fileTraceLog(trace, 'video encrypt done', {
    originalBytes: file.size,
    encryptedBytes,
    suffix,
    contentType,
    usedLocalPathUpload: Boolean(localUploadPath),
    fileKeyHead: safeHead(fileKey),
    fileKeyLen: fileKey.length,
  })
  const [uploadUrlInfo, token] = await Promise.all([
    getUploadUrl({
      attachType: getUploadAttachType(MessageType.Video),
      attachWorkspaceType: 1,
      fileSize: encryptedBytes,
      suffix,
      ossSceneType,
    }),
    getUploadToken({ ossSceneType }),
  ])

  const objectKey = String(uploadUrlInfo.fileId || '').trim()
  const endpoint = normalizeOssEndpoint(String(token.ossEndpoint || ''))
  const bucket = String(token.ossBucket || '').trim()
  const responseUrl = String(uploadUrlInfo.url || '').trim()
  const accessKeyId = String(token.accessKeyId || '').trim()
  const accessKeySecret = String(token.accessKeySecret || '').trim()
  const securityToken = String(token.securityToken || '').trim()
  if (!objectKey || !bucket || !endpoint || !accessKeyId || !accessKeySecret || !securityToken) {
    throw new Error('上传视频失败：OSS 参数缺失')
  }

  const { uploadUrl } = await putObjectWithOssCandidates({
    responseUrl,
    bucket,
    endpoint,
    objectKey,
    accessKeyId,
    accessKeySecret,
    securityToken,
    body: encrypted ?? undefined,
    localPath: localUploadPath || undefined,
    fileKey,
    plainSize: file.size,
    contentType,
    channelType: getUploadChannelType(uploadUrlInfo),
    ossSceneType,
    trace,
    logPrefix: '[video-send] ',
  })

  const finalUrl = toHttpsUrl(stripQuery(uploadUrl || responseUrl))
  fileTraceLog(trace, 'video upload done', {
    originalBytes: file.size,
    encryptedBytes,
    finalUrlHost: (() => {
      try { return new URL(finalUrl).host } catch { return finalUrl.slice(0, 60) }
    })(),
    thumbUrlHost: (() => {
      try { return new URL(uploadedThumb.thumbnailUrl).host } catch { return uploadedThumb.thumbnailUrl.slice(0, 60) }
    })(),
  })

  return {
    url: finalUrl,
    thumbUrl: uploadedThumb.thumbnailUrl,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    size: file.size,
    name: file.name,
    fileKey,
  }
}

async function handleFileSend(payload: { text: string; files: File[] } | File[]) {
  const files = Array.isArray(payload) ? payload : payload.files
  const text = Array.isArray(payload) ? '' : (payload.text || '').trim()
  terminalLog('[single-video-send] handleFileSend entry', {
    conversationId: convId.value,
    conversationType: chatStore.currentConversation?.type,
    targetId: chatStore.currentConversation?.targetId,
    isFriend: isFriend.value,
    isGroup: isGroup.value,
    isFileHelper: isFileHelperChat.value,
    fileCount: files.length,
    files: files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      suffix: getFileSuffix(file),
      isVideo: isVideoFile(file),
    })),
    textLen: text.length,
  })

  if (await handleChannelMediasCaptionSend(files, text)) return

  for (const file of files) {
    if (file.size > getFileSizeLimitBytes(file)) {
      terminalLog('[single-video-send] skip oversized file', {
        name: file.name,
        size: file.size,
        limitBytes: getFileSizeLimitBytes(file),
        isVideo: isVideoFile(file),
      }, 'warn')
      continue
    }
    if (file.type.startsWith('image/')) {
      let localPreview: LocalImagePreview | null = null
      let sendFile = file
      try {
        const trace = createImageTrace()
        const fileKey = createFileKey()
        const isGif = /image\/gif$/i.test(file.type) || getFileSuffix(file) === 'gif'
        const imageMsgType = isGif ? MessageType.DynamicImage : MessageType.Image
        sendFile = await ensureBlobBackedFile(file, trace)
        traceLog(trace, 'handle image file', {
          conversationId: convId.value,
          isGroup: isGroup.value,
          isFriend: isFriend.value,
          isFileHelper: isFileHelperChat.value,
          name: sendFile.name,
          size: sendFile.size,
          type: sendFile.type,
          isGif,
          plannedMsgType: imageMsgType,
        })
        // 对齐旧 im：群聊图片也必须走加密上传 + attachmentKey，不发送内联 dataUrl，
        // 否则手机端按远端图片协议解析时会加载失败。
        const previewUrlOverride = isGif ? await fileToDataURL(sendFile) : ''
        localPreview = await appendLocalImagePreview(sendFile, fileKey, trace, {
          msgType: imageMsgType,
          previewUrlOverride,
        })
        const uploaded = await uploadImageLikeIm(sendFile, {
          fileKey,
          width: localPreview?.width,
          height: localPreview?.height,
          trace,
          msgType: imageMsgType,
        })
        traceLog(trace, 'emit uploaded image message', {
          conversationId: convId.value,
          optimisticId: localPreview?.optimisticId || '',
          urlHost: (() => {
            try { return new URL(uploaded.url).host } catch { return uploaded.url.slice(0, 60) }
          })(),
          fileKeyHead: safeHead(uploaded.fileKey),
          fileKeyLen: uploaded.fileKey.length,
          isGif,
          msgType: imageMsgType,
        })
        terminalLog('image send emit uploaded payload', {
          conversationId: convId.value,
          optimisticId: localPreview?.optimisticId || '',
          name: uploaded.name,
          size: uploaded.size,
          isGif,
          msgType: imageMsgType,
          urlHead: uploaded.url.slice(0, 120),
          thumbnailUrlHead: uploaded.thumbnailUrl.slice(0, 120),
          fileKeyLen: uploaded.fileKey.length,
        })
        emit('send', JSON.stringify({
          url: uploaded.url,
          thumbnailUrl: uploaded.thumbnailUrl,
          width: uploaded.width,
          height: uploaded.height,
          size: uploaded.size,
          name: uploaded.name,
          fileKey: uploaded.fileKey,
        }), imageMsgType, withReadBurnExtra({
          fileKey: uploaded.fileKey,
          ...(localPreview?.optimisticId ? { __clientMsgId: localPreview.optimisticId } : {}),
        }))
        if (!isGif && localPreview?.url.startsWith('blob:')) {
          window.setTimeout(() => URL.revokeObjectURL(localPreview!.url), 5000)
        }
      } catch (error) {
        console.error('[message-input] prepare image payload failed:', error)
        if (localPreview?.optimisticId) {
          messageStore.updateMessageStatus(localPreview.optimisticId, -1)
        }
        if (localPreview?.url.startsWith('blob:')) {
          window.setTimeout(() => URL.revokeObjectURL(localPreview!.url), 5000)
        }
        terminalLog('image send prepare/upload failed', {
          message: (error as Error)?.message || String(error),
          name: sendFile.name || file.name,
          size: sendFile.size || file.size,
          type: sendFile.type || file.type,
        }, 'error')
        showToast((error as Error)?.message || t('操作失败'), 'error')
      }
    } else if (isVideoFile(file)) {
      const trace = createImageTrace()
      const fileKey = createFileKey()
      const localPath = getLocalFilePath(file)
      let sendFile = file
      let localPreview: LocalVideoPreview | null = null
      try {
        sendFile = await ensureBlobBackedFile(file, trace)
        fileTraceLog(trace, '[single-video-send] video branch entered', {
          conversationId: convId.value,
          conversationType: chatStore.currentConversation?.type,
          targetId: chatStore.currentConversation?.targetId,
          name: sendFile.name,
          size: sendFile.size,
          type: sendFile.type,
          suffix: getFileSuffix(sendFile),
          attachType: getUploadAttachType(MessageType.Video),
          hasLocalPath: Boolean(localPath),
        })
        fileTraceLog(trace, 'handle video file', {
          conversationId: convId.value,
          isGroup: isGroup.value,
          isFriend: isFriend.value,
          isFileHelper: isFileHelperChat.value,
          name: sendFile.name,
          size: sendFile.size,
          type: sendFile.type,
        })
        const metadata = await getVideoMetadata(sendFile, trace)
        fileTraceLog(trace, '[single-video-send] video metadata ready', {
          width: metadata.width,
          height: metadata.height,
          duration: metadata.duration,
          thumbDataUrlLen: metadata.thumbDataUrl.length,
          thumbDataUrlHead: metadata.thumbDataUrl.slice(0, 48),
        })
        localPreview = appendLocalVideoPreview(sendFile, fileKey, metadata, trace)
        fileTraceLog(trace, '[single-video-send] local preview result', {
          optimisticId: localPreview?.optimisticId || '',
          hasLocalPreview: Boolean(localPreview),
        })
        const uploaded = await uploadVideoLikeIm(sendFile, metadata, { fileKey, trace })
        fileTraceLog(trace, 'emit uploaded video message', {
          conversationId: convId.value,
          optimisticId: localPreview?.optimisticId || '',
          urlHost: (() => {
            try { return new URL(uploaded.url).host } catch { return uploaded.url.slice(0, 60) }
          })(),
          thumbUrlHost: (() => {
            try { return new URL(uploaded.thumbUrl).host } catch { return uploaded.thumbUrl.slice(0, 60) }
          })(),
          fileKeyHead: safeHead(uploaded.fileKey),
          fileKeyLen: uploaded.fileKey.length,
        })
        fileTraceLog(trace, '[single-video-send] emit video send to parent', {
          conversationId: convId.value,
          optimisticId: localPreview?.optimisticId || '',
          msgType: MessageType.Video,
          hasUrl: Boolean(uploaded.url),
          hasThumbUrl: Boolean(uploaded.thumbUrl),
          fileKeyLen: uploaded.fileKey.length,
        })
        emit('send', JSON.stringify({
          url: uploaded.url,
          thumbUrl: uploaded.thumbUrl,
          thumbnailUrl: uploaded.thumbUrl,
          duration: uploaded.duration,
          width: uploaded.width,
          height: uploaded.height,
          size: uploaded.size,
          name: uploaded.name,
          fileKey: uploaded.fileKey,
        }), MessageType.Video, withReadBurnExtra({
          fileKey: uploaded.fileKey,
          localThumbDataUrl: metadata.thumbDataUrl,
          ...(localPath ? { local: localPath, localPath } : {}),
          ...(localPreview?.optimisticId ? { __clientMsgId: localPreview.optimisticId } : {}),
        }))
        if (localPreview?.url.startsWith('blob:')) {
          window.setTimeout(() => URL.revokeObjectURL(localPreview!.url), 5000)
        }
      } catch (error) {
        console.error('[message-input] video upload failed:', error)
        fileTraceLog(trace, '[single-video-send] video branch failed', {
          message: (error as Error)?.message || String(error),
          stack: (error as Error)?.stack || '',
          optimisticId: localPreview?.optimisticId || '',
        }, 'error')
        if (localPreview?.optimisticId) {
          messageStore.updateMessageStatus(localPreview.optimisticId, -1)
        }
        if (localPreview?.url.startsWith('blob:')) {
          window.setTimeout(() => URL.revokeObjectURL(localPreview!.url), 5000)
        }
        fileTraceLog(trace, 'video upload failed', {
          message: (error as Error)?.message || String(error),
          name: sendFile.name || file.name,
          size: sendFile.size || file.size,
          type: sendFile.type || file.type,
        }, 'error')
        showToast((error as Error)?.message || t('操作失败'), 'error')
      }
    } else {
      const trace = createImageTrace()
      const fileKey = createFileKey()
      const localPath = getLocalFilePath(file)
      const localPreview = appendLocalFilePreview(file, fileKey, trace)
      try {
        fileTraceLog(trace, 'prepare upload after confirm', {
          conversationId: convId.value,
          isGroup: isGroup.value,
          isFriend: isFriend.value,
          isFileHelper: isFileHelperChat.value,
          name: file.name,
          size: file.size,
          type: file.type,
          optimisticId: localPreview?.optimisticId || '',
        })
        const uploaded = await uploadFileLikeIm(file, { fileKey, trace })
        fileTraceLog(trace, 'emit uploaded file message', {
          conversationId: convId.value,
          optimisticId: localPreview?.optimisticId || '',
          urlHost: (() => {
            try { return new URL(uploaded.url).host } catch { return uploaded.url.slice(0, 60) }
          })(),
          fileKeyHead: safeHead(uploaded.fileKey),
          fileKeyLen: uploaded.fileKey.length,
        })
        emit('send', JSON.stringify({
          url: uploaded.url,
          fileUrl: uploaded.url,
          name: uploaded.name,
          size: uploaded.size,
          ext: uploaded.ext,
          mimeType: uploaded.mimeType,
          fileKey: uploaded.fileKey,
        }), MessageType.File, withReadBurnExtra({
          fileKey: uploaded.fileKey,
          ...(localPreview?.optimisticId ? { __clientMsgId: localPreview.optimisticId } : {}),
          ...(localPath ? { local: localPath, localPath } : {}),
        }))
      } catch (error) {
        console.error('[message-input] file upload failed:', error)
        if (localPreview?.optimisticId) {
          messageStore.updateMessageStatus(localPreview.optimisticId, -1)
        }
        fileTraceLog(trace, 'upload failed', {
          message: (error as Error)?.message || String(error),
          name: file.name,
          size: file.size,
          type: file.type,
        }, 'error')
        showToast((error as Error)?.message || t('操作失败'), 'error')
      }
    }
  }
  if (text) {
    emit('send', text, MessageType.Text, withReadBurnExtra())
  }
  showFilePreview.value = false
  pendingFiles.value = []
}

async function handleScheduleDeletionConfirm(seconds: number) {
  const contact = currentContact.value
  if (!contact) return
  const previousEnabled = Boolean(contact.bfReadCancel)
  const previousSeconds = Number(contact.msgCancelTime || DEFAULT_READ_BURN_SECONDS)
  scheduleDeletionTime.value = seconds
  if (seconds === 0) {
    contactStore.patchContact(contact.id, {
      bfReadCancel: false,
      msgCancelTime: previousSeconds,
    })
    try {
      const res = await updateContacts({
        op: proto.ContactsOperator.READ_CANCEL,
        param: {
          contactsId: Number(contact.id),
          bfReadCancel: false,
        },
      })
      const errCode = Number((res as any)?.commonResult?.errCode || 200)
      if (errCode !== 200) throw new Error('READ_CANCEL failed')
    } catch {
      scheduleDeletionTime.value = previousSeconds
      contactStore.patchContact(contact.id, {
        bfReadCancel: previousEnabled,
        msgCancelTime: previousSeconds,
      })
    }
    return
  }

  contactStore.patchContact(contact.id, {
    bfReadCancel: true,
    msgCancelTime: seconds,
  })
  try {
    const res = await updateContacts({
      op: proto.ContactsOperator.READ_CANCEL_TIME,
      param: {
        contactsId: Number(contact.id),
        msgCancelTime: seconds,
      },
    })
    const errCode = Number((res as any)?.commonResult?.errCode || 200)
    if (errCode !== 200) throw new Error('READ_CANCEL_TIME failed')
  } catch {
    scheduleDeletionTime.value = previousSeconds
    contactStore.patchContact(contact.id, {
      bfReadCancel: previousEnabled,
      msgCancelTime: previousSeconds,
    })
  }
}

function getQuoteDigest(msgType: number, content: string | null): string {
  if (msgType === MessageType.Text) return (content || '').slice(0, 80)
  if (msgType === MessageType.Image) return '[图片]'
  if (msgType === MessageType.DynamicImage) return '[动画表情]'
  if (msgType === MessageType.Audio) return '[语音]'
  if (msgType === MessageType.Video) return '[视频]'
  if (msgType === MessageType.File) return '[文件]'
  if (msgType === MessageType.Location) return '[位置]'
  if (msgType === MessageType.NameCard) return getNameCardQuoteDigest(content)
  if (msgType === MessageType.SetImage) return '[骰子]'
  if (msgType === MessageType.AnimatedGame) return '[扑克牌]'
  if (
    msgType === MessageType.RedPacket ||
    msgType === MessageType.RedPacketResult ||
    msgType === MessageType.ChatTransfer ||
    msgType === MessageType.ChatTransferResult
  ) return '暂不支持该消息类型'
  return (content || '').slice(0, 80)
}

function getNameCardQuoteDigest(content: string | null): string {
  const name = getNameCardDisplayName(content)
  return name ? `[名片]${name}` : '[名片]'
}

function getNameCardDisplayName(content: string | null): string {
  const raw = String(content || '').trim()
  if (!raw) return ''
  if (raw.includes('*|*|*')) {
    return String(raw.split('*|*|*')[0] || '').trim()
  }
  try {
    const parsed = JSON.parse(raw)
    const value = parsed?.nickname ?? parsed?.name ?? parsed?.nickName ?? parsed?.nick_name ?? parsed?.uid ?? parsed?.id
    return String(value || '').trim()
  } catch {
    return raw.match(/\d{6,}/)?.[0] || ''
  }
}

function getForwardDigest(msgType: number, content: string | null): string {
  if (msgType === MessageType.Text) return (content || '').slice(0, 80)
  if (msgType === MessageType.Image) return '[图片]'
  if (msgType === MessageType.DynamicImage) return '[动画表情]'
  if (msgType === MessageType.Audio) return '[语音]'
  if (msgType === MessageType.Video) return '[视频]'
  if (msgType === MessageType.File) return '[文件]'
  if (msgType === MessageType.Location) return '[位置]'
  if (msgType === MessageType.NameCard) return '[名片]'
  if (msgType === MessageType.SetImage) return '[骰子]'
  if (msgType === MessageType.AnimatedGame) return '[扑克牌]'
  if (
    msgType === MessageType.RedPacket ||
    msgType === MessageType.RedPacketResult ||
    msgType === MessageType.ChatTransfer ||
    msgType === MessageType.ChatTransferResult
  ) return '暂不支持该消息类型'
  return (content || '').slice(0, 80)
}

function handleEditorFocusEvent() {
  focusEditor()
}

onMounted(() => {
  focusEditor()
  eventBus.on('editor:focus', handleEditorFocusEvent)
  eventBus.on('editor:insert-emoji', handleEmojiSelect)
  eventBus.on('editor:insert-at', handleAtSelect)
  eventBus.on('editor:drop-files', openDroppedFiles)
  eventBus.on('editor:drop-file-paths', openDroppedFilePaths)
})

onBeforeUnmount(() => {
  saveDraft(convId.value)
  eventBus.off('editor:focus', handleEditorFocusEvent)
  eventBus.off('editor:insert-emoji', handleEmojiSelect)
  eventBus.off('editor:insert-at', handleAtSelect)
  eventBus.off('editor:drop-files', openDroppedFiles)
  eventBus.off('editor:drop-file-paths', openDroppedFilePaths)
})
</script>

<template>
  <div
    class="message-input"
    :class="{ 'notice-only': showInputNoticeOnly }"
    @drop="handleDrop"
    @dragover="handleDragOver"
  >
    <div v-if="showChannelPermissionLoadingTip" class="shutup-tip channel-state-tip">
      {{ t('正在获取频道权限...') }}
    </div>
    <button
      v-else-if="showChannelPermissionErrorTip"
      class="shutup-tip channel-state-tip channel-permission-retry"
      type="button"
      @click="handleChannelPermissionRetry"
    >
      {{ t('频道权限获取失败，请点击重试') }}
    </button>
    <div v-else-if="showChannelDisabledTip" class="shutup-tip channel-state-tip">
      {{ t('该频道已禁用') }}
    </div>
    <button
      v-else-if="showChannelJoinButton"
      class="channel-notify-toggle"
      type="button"
      :disabled="joiningChannel"
      @click="handleJoinChannel"
    >
      {{ joiningChannel ? t('加入中...') : t('加入频道') }}
    </button>
    <button
      v-else-if="showChannelNotifyToggle"
      class="channel-notify-toggle"
      type="button"
      :disabled="updatingChannelDisturb"
      @click="toggleChannelDisturb"
    >
      {{ channelNotifyText }}
    </button>
    <!-- 与 im 逻辑一致：只在群全员禁言时提示 -->
    <div v-else-if="showShutupTip" class="shutup-tip">
      {{ $t('全员禁言中') }}
    </div>

    <template v-else>
      <!-- 二维码类转发优先弹 file-dialog；若未弹起，保留预览条可手动点开 -->
      <div v-if="hasForwardDraft" class="forward-preview-bar">
        <img class="forward-preview-icon" :src="forwardPreviewIcon" alt="" />
        <div
          class="forward-preview-body"
          @click="forwardPreviewQrSrc && openQrForwardFileDialogFromDraft()"
        >
          <template v-if="currentForwardDraftItems.length === 1">
            <img
              v-if="getForwardImagePreviewSrc(currentForwardDraftItems[0])"
              class="forward-preview-thumb"
              :src="getForwardImagePreviewSrc(currentForwardDraftItems[0])"
              alt=""
            />
            <div class="forward-preview-info">
              <h3 class="forward-preview-sender">{{ currentForwardDraftItems[0].senderName }}</h3>
              <p class="forward-preview-text">
                {{ getForwardDigest(currentForwardDraftItems[0].msgType, currentForwardDraftItems[0].content) }}
              </p>
            </div>
          </template>
          <template v-else>
            <div class="forward-preview-info multiple">
              <div class="forward-preview-list">
                <span
                  v-for="(item, index) in currentForwardDraftItems.slice(0, 3)"
                  :key="`${item.senderName}-${index}`"
                  class="forward-preview-chip"
                >
                  {{ getForwardDigest(item.msgType, item.content) }}
                </span>
              </div>
              <p class="forward-preview-text">{{ $t('总计') }}: {{ currentForwardDraftItems.length }}</p>
            </div>
          </template>
        </div>
        <button class="forward-preview-close" type="button" @click.stop="uiStore.clearForwardDraft()">
          <img :src="clearIcon" alt="" />
        </button>
      </div>

      <!-- Quote reply preview (matches im's quote-info.vue) -->
      <div v-if="uiStore.quoteMessage" class="quote-preview-bar">
        <img class="quote-reply-icon" :src="replyPreviewIcon" alt="" />
        <div class="quote-preview-body">
          <div class="quote-preview-info">
            <h3 class="quote-preview-sender">{{ uiStore.quoteMessage.senderName }}</h3>
            <p class="quote-preview-text">{{ getQuoteDigest(uiStore.quoteMessage.msgType, uiStore.quoteMessage.content) }}</p>
          </div>
        </div>
        <div class="quote-preview-close" @click.stop="uiStore.clearQuoteMessage()">
          <svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="#999" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-left">
          <!-- 与 im components/active-icon.vue 一致：activeIcon/*.png + 灰度 / hover 彩色 -->
          <button
            ref="emojiToggleBtnRef"
            class="tool-btn tool-btn-im-icon"
            type="button"
            :title="$t('表情')"
            @click="showEmoji = !showEmoji"
          >
            <img class="im-active-icon" :src="iconSmallActive" alt="" width="20" height="20" />
          </button>
          <button class="tool-btn tool-btn-im-icon" type="button" :title="$t('文件')" @click="handleFileSelect">
            <img class="im-active-icon" :src="iconFileActive" alt="" width="20" height="20" />
          </button>
          <input
            ref="toolbarFileInputRef"
            class="toolbar-file-input"
            type="file"
            multiple
            tabindex="-1"
            @change="handleToolbarFileChange"
          />
        </div>
      </div>

      <Transition name="popup">
        <div v-if="showEmoji" ref="emojiPickerPopoverRef" class="emoji-popup">
          <EmojiPicker
            :chat-type="emojiChatType"
            @select="handleEmojiSelect"
            @select-dice="handleDiceSelect"
            @select-poker="handlePokerSelect"
            @close="showEmoji = false"
          />
        </div>
      </Transition>

      <div class="editor-wrapper">
        <div
          ref="editorRef"
          class="editor"
          contenteditable="true"
          :placeholder="inputPlaceholder"
          @beforeinput="handleBeforeInput"
          @input="handleInput"
          @keydown="handleKeydown"
          @paste="handlePaste"
          @mouseup="saveEditorSelection"
          @keyup="handleEditorKeyup"
          @focus="normalizeEditorFocusCaret"
          @blur="saveEditorSelection"
          @contextmenu.prevent.stop="handleEditorContextMenu"
        />

        <ContextMenu
          v-model:visible="editorMenuVisible"
          :x="editorMenuX"
          :y="editorMenuY"
          :items="editorMenuItems"
          variant="editor"
          @select="handleEditorMenuSelect"
        />

        <AtListDialog
          ref="atListRef"
          v-model:visible="showAtList"
          :group-id="groupId"
          :keyword="atKeyword"
          @select="handleAtSelect"
        />
      </div>

      <div class="send-area">
        <div class="send-right">
          <span v-if="showReadBurnTip" class="burn-time-tip" @click="showScheduleDeletion = true">
            <img :src="readBurnTimeIcon" alt="" />
            <span>{{ readBurnTimeText }}</span>
          </span>
          <button
            class="send-btn"
            :disabled="!content.trim() && (!hasForwardDraft || !!forwardPreviewQrSrc)"
            @click="handleSend"
          >
            {{ $t('发送') }}
          </button>
        </div>
      </div>
    </template>

    <!-- 弹窗 -->
    <CreateLinkDialog
      :visible="showCreateLink"
      :select-text="selectedLinkText"
      @close="showCreateLink = false"
      @confirm="handleLinkConfirm"
    />

    <ScheduleDeletionDialog
      :visible="showScheduleDeletion"
      :current-time="scheduleDeletionTime"
      @close="showScheduleDeletion = false"
      @confirm="handleScheduleDeletionConfirm"
    />

    <FileUploadPreview
      v-if="showFilePreview"
      v-model:visible="showFilePreview"
      :files="pendingFiles"
      @confirm="handleFileSend"
      @cancel="pendingFiles = []"
    />

    <FileUploadPreview
      v-model:visible="showQrForwardUpload"
      :files="qrForwardPendingFiles"
      large-hero-preview
      @confirm="handleQrForwardConfirm"
      @cancel="handleQrForwardCancel"
    />

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
  </div>
</template>

<style lang="scss" scoped>
.message-input {
  min-height: 91px;
  border-top: 1px solid #eee;
  background: #fff;
  flex-shrink: 0;
  position: relative;
  z-index: 20;
  isolation: isolate;

  &.notice-only {
    min-height: 0;
  }
}

.forward-preview-bar,
.quote-preview-bar {
  position: relative;
  height: 60px;
  background: #fff;
  border-top: 1px solid #eee;
  display: flex;
  align-items: center;
  z-index: 9;
}

.forward-preview-icon,
.quote-reply-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  height: 30px;
  width: 30px;
  z-index: 1;
}

.forward-preview-body,
.quote-preview-body {
  padding-left: 60px;
  height: 100%;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  cursor: pointer;

  &:hover { background: #efefef; }
}

.forward-preview-info,
.quote-preview-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.forward-preview-thumb {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  margin-right: 10px;
  object-fit: cover;
  border-radius: 2px;
  background: #f2f2f2;
}

.forward-preview-sender,
.quote-preview-sender {
  margin: 0;
  padding: 0;
  line-height: 20px;
  font-size: 14px;
  font-weight: bold;
  color: #3369fe;
}

.forward-preview-text,
.quote-preview-text {
  font-size: 12px;
  color: #555;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  margin: 0;
}

.forward-preview-close {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  opacity: 0.8;
  flex-shrink: 0;

  &:hover { opacity: 1; }

  img {
    display: block;
    width: 20px;
    height: 20px;
  }
}

.forward-preview-info.multiple {
  gap: 4px;
}

.forward-preview-list {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 86%;
  overflow: hidden;
}

.forward-preview-chip {
  font-size: 12px;
  color: #333;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.quote-preview-close {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.6;
  flex-shrink: 0;

  &:hover { opacity: 1; }
}

.shutup-tip {
  padding: 10px 0;
  text-align: center;
  color: #da2e2e;
  font-size: 14px;
  line-height: normal;
}

.channel-state-tip {
  color: #333;
}

.channel-permission-retry {
  width: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.channel-notify-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 10px 0;
  border: 0;
  background: #fff;
  color: #178aff;
  font-size: 14px;
  line-height: normal;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.toolbar {
  display: flex;
  align-items: center;
  height: 36px;
  box-sizing: border-box;
  padding: 8px 14px 0;
  flex-shrink: 0;
  background: #fff;
  position: relative;
  z-index: 1;

  .toolbar-left {
    display: flex;
    align-items: center;
    height: 24px;
  }
}

.tool-btn {
  width: 20px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 0;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  position: relative;
  margin-right: 26px;
  padding: 0;

  &:hover { background: #f0f0f0; }

  &.tool-btn-im-icon:hover {
    background: transparent;
  }

  .burn-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #da2e2e;
  }
}

/* im .comActiveIcon */
.im-active-icon {
  display: block;
  width: 20px;
  height: 20px;
  filter: brightness(1) grayscale(1);
  pointer-events: none;
}

.tool-btn-im-icon:hover .im-active-icon {
  filter: unset;
}

.toolbar-file-input {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  left: -9999px;
  top: -9999px;
}

.editor-wrapper {
  padding: 6px 14px;
  position: relative;
  box-sizing: border-box;
  background: #fff;
  z-index: 1;
}

.editor {
  height: 90px;
  min-height: 90px;
  max-height: 90px;
  box-sizing: border-box;
  overflow-y: auto;
  font-size: 14px;
  line-height: 20px;
  outline: none;
  word-break: break-all;
  white-space: pre-wrap;

  &:empty::before {
    content: attr(placeholder);
    color: #999;
    font-weight: normal;
    font-size: 12px;
    pointer-events: none;
  }

  :deep(.editor-emoji) {
    display: inline-block;
    width: 20px;
    height: 20px;
    margin: 0 1px;
    vertical-align: -4px;
    user-select: none;
  }
}

.emoji-popup {
  position: absolute;
  bottom: 50px;
  left: 10px;
  z-index: 30;
}

.send-area {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 14px 10px;
  background: #fff;
  position: relative;
  z-index: 1;
}

.send-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.burn-time-tip {
  display: flex;
  align-items: center;
  height: 24px;
  cursor: pointer;

  img {
    width: 16px;
    height: 16px;
    margin-right: 2px;
  }

  color: #999;
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;

  &:hover {
    color: #666;
  }
}

.send-btn {
  padding: 0 13px;
  height: 24px;
  background: #3369fe;
  color: #fff;
  border: 1px solid #3369fe;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
}

.popup-enter-active, .popup-leave-active { transition: all 0.2s ease; }
.popup-enter-from, .popup-leave-to { opacity: 0; transform: translateY(8px); }
</style>
