<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageType, ConversationType } from '@/types'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useUIStore } from '@/stores/useUIStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { eventBus } from '@/utils/eventBus'
import { useEmojiPanelDismiss } from '@/composables/useEmojiPanelDismiss'
import { getReadBurnTimeText } from '@/utils/readBurn'
import { getUploadToken, getUploadUrl, updateContacts } from '@/api/imBase'
import { updateMember } from '@/api/imChannel'
import { proto } from '@/api/request'
import { aesEncrypt } from '@/utils/crypto'
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
const selectedLinkText = ref('')
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const updatingChannelDisturb = ref(false)

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
  () => chatStore.currentConversation?.targetId === FILE_HELPER_TARGET_ID,
)
const showShutupTip = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv) return false
  // 与 im send/index.vue 对齐：消息免打扰不影响输入区，仅群全员禁言才显示提示
  if (conv.type !== ConversationType.Group) return false
  const group = groupStore.getGroup(conv.targetId)
  return Boolean(group?.isMuted)
})
const showChannelDisabledTip = computed(() => {
  const conv = chatStore.currentConversation
  const channel = currentChannel.value
  if (!conv || conv.type !== ConversationType.Channel || !channel) return false
  return Boolean(channel.isDisable || Number(channel.status ?? 0) === 3)
})
const hasChannelPublishAuthority = computed(() => {
  const channel = currentChannel.value
  if (!channel) return true
  const adminPrivacy = Number(channel.adminPrivacy ?? 0)
  return adminPrivacy > 0 && (adminPrivacy & 2) !== 0
})
const showChannelNotifyToggle = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Channel || !currentChannel.value) return false
  if (showChannelDisabledTip.value) return false
  return !hasChannelPublishAuthority.value
})
const channelNotifyText = computed(() =>
  toBool(currentChannel.value?.isDisturb ?? chatStore.currentConversation?.isMuted ?? false)
    ? '永久静音'
    : '接收通知',
)
const inputPlaceholder = computed(() =>
  settingStore.settings.sendShortcutKey === 'Ctrl+Enter'
    ? t('CtrlEnter发送')
    : t('Enter发送'),
)
const showInputNoticeOnly = computed(() =>
  showChannelDisabledTip.value || showChannelNotifyToggle.value || showShutupTip.value,
)
const convId = computed(() => chatStore.currentConversationId)
const scheduleDeletionTime = ref(0)
const currentContact = computed(() => {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== ConversationType.Friend || conv.targetId === FILE_HELPER_TARGET_ID) return null
  return contactStore.getContact(conv.targetId) ?? null
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
  getReadBurnTimeText(currentContact.value?.msgCancelTime || 30),
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
const MAX_GROUP_IMAGE_DATA_URL_BYTES = 256 * 1024
const GROUP_IMAGE_MAX_DIMENSION = 1600
const GROUP_IMAGE_MIN_DIMENSION = 480
const GROUP_IMAGE_MIN_QUALITY = 0.42
const FILE_ENCRYPT_CHUNK_SIZE = 102400
const VISIBLE_TRAILING_SPACE = '\u00a0'

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

interface LocalFilePreview {
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

function terminalLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  log(`[message-input] ${message}`, data || {})
  if (!(window as any).__TAURI_INTERNALS__) return
  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level,
        message,
        data: data || {},
      },
    }))
    .catch(() => {})
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

function formatReadBurnNotice(seconds: number, enabled: boolean) {
  const name = t('你')
  if (!enabled) return `${name}${t('关闭了阅后即焚')}`
  let timeText = ''
  if (seconds < 60) timeText = `${seconds}${t('秒')}`
  else if (seconds < 3600) timeText = `${seconds / 60}${t('分钟')}`
  else if (seconds < 86400) timeText = `${seconds / 3600}${t('小时')}`
  else timeText = `${seconds / 86400}${t('天')}`
  return `${name} ${t('设置了消息已读XX后销毁').replace('XX', timeText)}`
}

function appendReadBurnNotice(seconds: number, enabled: boolean) {
  const convId = chatStore.currentConversationId
  if (!convId) return
  messageStore.appendLocalSystemNotice(convId, formatReadBurnNotice(seconds, enabled))
}

function withReadBurnExtra(extra?: Record<string, unknown>) {
  const nextExtra = extra ? { ...extra } : {}
  if (currentContact.value?.bfReadCancel) {
    const snapchatTime = Number(currentContact.value.msgCancelTime || 30)
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
    scheduleDeletionTime.value = Number(nextMsgCancelTime || 30)
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

function setEditorText(text: string) {
  content.value = text
  if (editorRef.value) {
    editorRef.value.textContent = text
  }
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
    })
  } else {
    setEditorText('')
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
  showEmoji.value = false
  const text = normalizeEditorText(content.value).trim()
  if (!text && !hasForwardDraft.value) return

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
        emit('send', item.content, item.msgType, item.extra)
      }
    }
    uiStore.clearForwardDraft()
  }

  if (text) {
    emit('send', text, MessageType.Text, withReadBurnExtra(Object.keys(extra).length > 0 ? extra : undefined))
  }
  content.value = ''
  if (editorRef.value) editorRef.value.textContent = ''
  if (convId.value) chatStore.setDraft(convId.value, null)
}

function handleKeydown(e: KeyboardEvent) {
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
    content.value = editorRef.value.textContent ?? ''
  }
  updateAtListFromCaret()
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

function getEditorText(): string {
  return editorRef.value?.textContent ?? ''
}

function normalizeEditorText(value: string): string {
  return value.replace(/\u00a0/g, ' ')
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
  return preRange.toString().length
}

function setEditorTextAndCaret(text: string, caretOffset: number) {
  const editor = editorRef.value
  if (!editor) return

  editor.textContent = text
  content.value = text
  editor.focus()

  const selection = window.getSelection()
  const range = document.createRange()
  const textNode = editor.firstChild
  if (textNode?.nodeType === Node.TEXT_NODE) {
    const offset = Math.max(0, Math.min(caretOffset, textNode.textContent?.length ?? 0))
    range.setStart(textNode, offset)
  } else {
    range.setStart(editor, 0)
  }
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  savedSelection.value = range.cloneRange()
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
      try { await navigator.clipboard.writeText(text) } catch { /* clipboard may be unavailable */ }
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
      document.execCommand('insertText', false, text)
      handleInput()
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
    lastModified: Date.now(),
    webkitRelativePath: '',
    arrayBuffer: async () => (await loadFile()).arrayBuffer(),
    text: async () => (await loadFile()).text(),
    stream: () => emptyBlob.stream(),
    slice: (start?: number, end?: number, contentType?: string) => emptyBlob.slice(start, end, contentType),
  } as unknown as File
}

// 粘贴图片/文件
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  const files: File[] = []
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }

  if (files.length > 0) {
    e.preventDefault()
    pendingFiles.value = files
    showFilePreview.value = true
    return
  }

  // 纯文本粘贴，防止带格式
  const text = e.clipboardData?.getData('text/plain')
  if (text) {
    e.preventDefault()
    document.execCommand('insertText', false, text)
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
        if (path) imageFilesByPath.set(path, clipboardPayloadToFile(item))
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
  content.value += emoji
  if (editorRef.value) editorRef.value.textContent = content.value
  showEmoji.value = false
}

function handleDiceSelect() {
  if (showShutupTip.value) return
  const localDiceResult = 1 + Math.floor(Math.random() * 6)
  const diceContent = String(localDiceResult)
  terminalLog('[dice] picker select', {
    conversationId: chatStore.currentConversationId,
    conversationType: chatStore.currentConversation?.type,
    targetId: chatStore.currentConversation?.targetId,
    localDiceResult,
  }, 'warn')
  showEmoji.value = false
  emit('send', diceContent, MessageType.SetImage, withReadBurnExtra())
}

function handleAtSelect(member: { uid: string; name: string }) {
  restoreEditorSelection()
  const atRange = getActiveAtRange()
  const name = member.name.replace(/^@+/, '')
  const insertText = `@${name}${VISIBLE_TRAILING_SPACE}`

  if (!atRange) {
    const text = getEditorText()
    setEditorTextAndCaret(`${text}${insertText}`, text.length + insertText.length)
  } else {
    const text = getEditorText()
    const nextText = `${text.slice(0, atRange.start)}${insertText}${text.slice(atRange.end)}`
    setEditorTextAndCaret(nextText, atRange.start + insertText.length)
  }

  showAtList.value = false
  atKeyword.value = ''
}

function handleLinkConfirm(data: { linkText: string; linkValue: string; selectText?: string }) {
  const linkHtml = `<a href="${data.linkValue}" target="_blank">${data.linkText}</a>`
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

function handleFileSelect() {
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

async function appendLocalImagePreview(
  file: File,
  fileKey: string,
  trace: ImageSendTrace,
): Promise<LocalImagePreview | null> {
  const conversationId = convId.value
  const uid = authStore.uid
  if (!conversationId || !uid) return null

  const previewUrl = URL.createObjectURL(file)
  const { width, height } = await getImageSize(previewUrl)
  const optimisticId = createOptimisticImageId()
  const extra = withReadBurnExtra({ fileKey, uploadPending: true, imageTraceId: trace.id })
  messageStore.appendMessage(conversationId, {
    id: optimisticId,
    customMsgId: optimisticId,
    conversationId,
    senderId: uid,
    msgType: MessageType.Image,
    content: JSON.stringify({
      url: previewUrl,
      thumbnailUrl: previewUrl,
      width,
      height,
      size: file.size,
      name: file.name,
      fileKey,
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
  })
  return { url: previewUrl, width, height, optimisticId }
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
  const extra = withReadBurnExtra({ fileKey, uploadPending: true, fileTraceId: trace.id })
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
  })
  return { optimisticId }
}

function getFileSizeLimitBytes(file: File): number {
  return file.type.startsWith('image/') ? MAX_IMAGE_SIZE_BYTES : MAX_FILE_SIZE_BYTES
}

function getDataUrlByteLength(dataUrl: string): number {
  return new TextEncoder().encode(dataUrl).length
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
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
  if (file.type) return file.type
  if (suffix === 'jpg' || suffix === 'jpeg') return 'image/jpeg'
  if (suffix === 'png') return 'image/png'
  if (suffix === 'gif') return 'image/gif'
  if (suffix === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

function getUploadAttachType(msgType: MessageType): number {
  if (msgType === MessageType.Image) return 0
  if (msgType === MessageType.Audio) return 2
  if (msgType === MessageType.Video) return 1
  if (msgType === MessageType.DynamicImage) return 4
  return 3
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function resolveOssUploadUrl(responseUrl: string, bucket: string, endpoint: string, objectKey: string): string {
  const key = objectKey.replace(/^\/+/, '')
  if (responseUrl) return stripQuery(responseUrl)

  const normalizedEndpoint = normalizeOssEndpoint(endpoint)
  if (/aliyuncs\.com$/i.test(normalizedEndpoint)) {
    return `https://${bucket}.${normalizedEndpoint}/${key}`
  }

  return `https://${normalizedEndpoint}/${key}`
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
  body: Uint8Array
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
    bodyBytes: options.body.byteLength,
    contentType,
    hasAccessKeyId: Boolean(options.accessKeyId),
    hasAccessKeySecret: Boolean(options.accessKeySecret),
    hasSecurityToken: Boolean(options.securityToken),
  })

  if ((window as any).__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core')
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
      body: result.body,
    }, result.ok ? 'info' : 'error')
    return
  }

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
  },
): Promise<UploadedImagePayload> {
  const trace = options?.trace ?? createImageTrace()
  traceLog(trace, 'upload start', {
    name: file.name,
    size: file.size,
    type: file.type,
  })
  const fileKey = options?.fileKey || createFileKey()
  const encrypted = await encryptFileForUpload(file, fileKey)
  const suffix = getFileSuffix(file)
  const contentType = getUploadContentType(file, suffix)
  traceLog(trace, 'encrypt done', {
    originalBytes: file.size,
    encryptedBytes: encrypted.byteLength,
    suffix,
    contentType,
    fileKeyHead: safeHead(fileKey),
    fileKeyLen: fileKey.length,
  })
  const [uploadUrlInfo, token] = await Promise.all([
    getUploadUrl({
      attachType: getUploadAttachType(MessageType.Image),
      attachWorkspaceType: 1,
      fileSize: encrypted.byteLength,
      suffix,
    }),
    getUploadToken(),
  ])
  traceLog(trace, 'upload api response', {
    fileIdHead: safeHead(String(uploadUrlInfo.fileId || ''), 24),
    fileIdLen: String(uploadUrlInfo.fileId || '').length,
    responseUrlHost: (() => {
      try { return new URL(String(uploadUrlInfo.url || '')).host } catch { return String(uploadUrlInfo.url || '').slice(0, 60) }
    })(),
    ossEndpoint: String(token.ossEndpoint || ''),
    ossBucket: String(token.ossBucket || ''),
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

  const uploadUrl = resolveOssUploadUrl(responseUrl, bucket, endpoint, objectKey)
  await putObjectToOss({
    url: uploadUrl,
    bucket,
    objectKey,
    accessKeyId,
    accessKeySecret,
    securityToken,
    body: encrypted,
    contentType,
    trace,
  })

  const width = options?.width ?? 0
  const height = options?.height ?? 0
  const finalUrl = stripQuery(responseUrl || uploadUrl).replace(/^http:/i, 'https:')
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
  const encrypted = await encryptFileForUpload(file, fileKey)
  const suffix = getFileSuffix(file)
  const contentType = getUploadContentType(file, suffix)
  fileTraceLog(trace, 'encrypt done', {
    originalBytes: file.size,
    encryptedBytes: encrypted.byteLength,
    suffix,
    contentType,
    fileKeyHead: safeHead(fileKey),
    fileKeyLen: fileKey.length,
  })
  fileTraceLog(trace, 'upload api start', {
    attachType: getUploadAttachType(MessageType.File),
    attachWorkspaceType: 1,
    fileSize: encrypted.byteLength,
    suffix,
  })
  const [uploadUrlInfo, token] = await Promise.all([
    getUploadUrl({
      attachType: getUploadAttachType(MessageType.File),
      attachWorkspaceType: 1,
      fileSize: encrypted.byteLength,
      suffix,
    }),
    getUploadToken(),
  ])
  fileTraceLog(trace, 'upload api done', {
    fileIdHead: safeHead(String(uploadUrlInfo.fileId || ''), 24),
    fileIdLen: String(uploadUrlInfo.fileId || '').length,
    responseUrlHost: (() => {
      try { return new URL(String(uploadUrlInfo.url || '')).host } catch { return String(uploadUrlInfo.url || '').slice(0, 60) }
    })(),
    ossEndpoint: String(token.ossEndpoint || ''),
    ossBucket: String(token.ossBucket || ''),
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

  const uploadUrl = resolveOssUploadUrl(responseUrl, bucket, endpoint, objectKey)
  await putObjectToOss({
    url: uploadUrl,
    bucket,
    objectKey,
    accessKeyId,
    accessKeySecret,
    securityToken,
    body: encrypted,
    contentType,
    trace,
    logPrefix: '[file-send] ',
  })

  const finalUrl = stripQuery(responseUrl || uploadUrl).replace(/^http:/i, 'https:')
  fileTraceLog(trace, 'upload done', {
    name: file.name,
    originalBytes: file.size,
    encryptedBytes: encrypted.byteLength,
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

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load image failed'))
    img.src = src
  })
}

async function prepareGroupImagePayload(file: File): Promise<{
  dataUrl: string
  width: number
  height: number
  size: number
}> {
  const originalDataUrl = await fileToDataURL(file)
  const originalSize = await getImageSize(originalDataUrl)
  const originalBytes = getDataUrlByteLength(originalDataUrl)
  const isAnimatedOrVector = /image\/gif$/i.test(file.type) || /image\/svg\+xml$/i.test(file.type)

  if (originalBytes <= MAX_GROUP_IMAGE_DATA_URL_BYTES || isAnimatedOrVector) {
    if (originalBytes > MAX_GROUP_IMAGE_DATA_URL_BYTES) {
      throw new Error('群聊图片过大，请压缩后重试')
    }
    return {
      dataUrl: originalDataUrl,
      width: originalSize.width,
      height: originalSize.height,
      size: file.size,
    }
  }

  const img = await loadImageElement(originalDataUrl)
  let width = img.naturalWidth || originalSize.width || 0
  let height = img.naturalHeight || originalSize.height || 0
  if (width <= 0 || height <= 0) {
    return {
      dataUrl: originalDataUrl,
      width: originalSize.width,
      height: originalSize.height,
      size: file.size,
    }
  }

  const initialScale = Math.min(1, GROUP_IMAGE_MAX_DIMENSION / Math.max(width, height))
  width = Math.max(1, Math.round(width * initialScale))
  height = Math.max(1, Math.round(height * initialScale))

  let quality = file.size > 6 * 1024 * 1024
    ? 0.68
    : file.size > 3 * 1024 * 1024
      ? 0.74
      : 0.82

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) break
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })
    if (!blob) break

    const compressedDataUrl = await blobToDataURL(blob)
    if (getDataUrlByteLength(compressedDataUrl) <= MAX_GROUP_IMAGE_DATA_URL_BYTES) {
      return {
        dataUrl: compressedDataUrl,
        width,
        height,
        size: blob.size,
      }
    }

    quality = Math.max(GROUP_IMAGE_MIN_QUALITY, quality - 0.08)
    width = width > GROUP_IMAGE_MIN_DIMENSION
      ? Math.max(GROUP_IMAGE_MIN_DIMENSION, Math.round(width * 0.85))
      : width
    height = height > GROUP_IMAGE_MIN_DIMENSION
      ? Math.max(GROUP_IMAGE_MIN_DIMENSION, Math.round(height * 0.85))
      : height
  }

  throw new Error('群聊图片过大，请压缩后重试')
}

async function handleFileSend(payload: { text: string; files: File[] } | File[]) {
  const files = Array.isArray(payload) ? payload : payload.files
  const text = Array.isArray(payload) ? '' : (payload.text || '').trim()

  for (const file of files) {
    if (file.size > getFileSizeLimitBytes(file)) {
      continue
    }
    if (file.type.startsWith('image/')) {
      let localPreview: LocalImagePreview | null = null
      try {
        const trace = createImageTrace()
        const fileKey = createFileKey()
        traceLog(trace, 'handle image file', {
          conversationId: convId.value,
          isGroup: isGroup.value,
          isFriend: isFriend.value,
          isFileHelper: isFileHelperChat.value,
          name: file.name,
          size: file.size,
          type: file.type,
        })
        const prepared = isGroup.value && !isFileHelperChat.value
          ? await prepareGroupImagePayload(file)
          : null
        if (prepared) {
          emit('send', JSON.stringify({
            url: prepared.dataUrl,
            thumbnailUrl: prepared.dataUrl,
            width: prepared.width,
            height: prepared.height,
            size: prepared.size,
            name: file.name,
          }), MessageType.Image, withReadBurnExtra())
        } else {
          localPreview = await appendLocalImagePreview(file, fileKey, trace)
          const uploaded = await uploadImageLikeIm(file, {
            fileKey,
            width: localPreview?.width,
            height: localPreview?.height,
            trace,
          })
          traceLog(trace, 'emit uploaded image message', {
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
            thumbnailUrl: uploaded.thumbnailUrl,
            width: uploaded.width,
            height: uploaded.height,
            size: uploaded.size,
            name: uploaded.name,
            fileKey: uploaded.fileKey,
          }), MessageType.Image, withReadBurnExtra({
            fileKey: uploaded.fileKey,
            ...(localPreview?.optimisticId ? { __clientMsgId: localPreview.optimisticId } : {}),
          }))
          if (localPreview?.url.startsWith('blob:')) {
            window.setTimeout(() => URL.revokeObjectURL(localPreview!.url), 5000)
          }
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
          name: file.name,
          size: file.size,
          type: file.type,
        }, 'error')
        showToast((error as Error)?.message || t('操作失败'), 'error')
      }
    } else {
      const trace = createImageTrace()
      const fileKey = createFileKey()
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
  const previousSeconds = Number(contact.msgCancelTime || 30)
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
      appendReadBurnNotice(0, false)
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
    appendReadBurnNotice(seconds, true)
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
  if (msgType === MessageType.Audio) return '[语音]'
  if (msgType === MessageType.Video) return '[视频]'
  if (msgType === MessageType.File) return '[文件]'
  if (msgType === MessageType.Location) return '[位置]'
  if (msgType === MessageType.NameCard) return '[名片]'
  if (msgType === MessageType.RedPacket) return '[红包]'
  return (content || '').slice(0, 80)
}

function getForwardDigest(msgType: number, content: string | null): string {
  if (msgType === MessageType.Text) return (content || '').slice(0, 80)
  if (msgType === MessageType.Image) return '[图片]'
  if (msgType === MessageType.Audio) return '[语音]'
  if (msgType === MessageType.Video) return '[视频]'
  if (msgType === MessageType.File) return '[文件]'
  if (msgType === MessageType.Location) return '[位置]'
  if (msgType === MessageType.NameCard) return '[名片]'
  if (msgType === MessageType.RedPacket) return '[红包]'
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
    <div v-if="showChannelDisabledTip" class="shutup-tip channel-state-tip">
      该频道已禁用
    </div>
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
          @input="handleInput"
          @keydown="handleKeydown"
          @paste="handlePaste"
          @mouseup="saveEditorSelection"
          @keyup="handleEditorKeyup"
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
  padding: 8px 14px 0;

  .toolbar-left {
    display: flex;
    gap: 4px;
    align-items: center;
  }
}

.tool-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  position: relative;

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
}

.editor {
  min-height: 90px;
  max-height: 200px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 20px;
  outline: none;
  word-break: break-all;

  &:empty::before {
    content: attr(placeholder);
    color: #999;
    font-size: 12px;
    pointer-events: none;
  }
}

.emoji-popup {
  position: absolute;
  bottom: 50px;
  left: 10px;
  z-index: 100;
}

.send-area {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 14px 10px;
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
