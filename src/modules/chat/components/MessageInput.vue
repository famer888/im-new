<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageType, ConversationType } from '@/types'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useUIStore } from '@/stores/useUIStore'
import { eventBus } from '@/utils/eventBus'
import { useEmojiPanelDismiss } from '@/composables/useEmojiPanelDismiss'
import { getReadBurnTimeText } from '@/utils/readBurn'
import { updateContacts } from '@/api/imBase'
import { proto } from '@/api/request'
import EmojiPicker from './send/EmojiPicker.vue'
import AtListDialog from './send/AtListDialog.vue'
import CreateLinkDialog from './send/CreateLinkDialog.vue'
import ScheduleDeletionDialog from './send/ScheduleDeletionDialog.vue'
import FileUploadPreview from './FileUploadPreview.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import type { MenuItem } from '@/components/ContextMenu.vue'
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
const settingStore = useSettingStore()
const uiStore = useUIStore()
const { t } = useI18n()
const content = ref('')
const editorRef = ref<HTMLDivElement | null>(null)
const showEmoji = ref(false)
const emojiToggleBtnRef = ref<HTMLElement | null>(null)
const emojiPickerPopoverRef = ref<HTMLElement | null>(null)
useEmojiPanelDismiss(showEmoji, emojiToggleBtnRef, emojiPickerPopoverRef)
const showAtList = ref(false)
const showCreateLink = ref(false)
const showScheduleDeletion = ref(false)
const pendingFiles = ref<File[]>([])
const showFilePreview = ref(false)
const editorMenuVisible = ref(false)
const editorMenuX = ref(0)
const editorMenuY = ref(0)
const savedSelection = ref<Range | null>(null)
const selectedLinkText = ref('')

const isGroup = computed(() => chatStore.currentConversation?.type === ConversationType.Group)
const isFriend = computed(() => chatStore.currentConversation?.type === ConversationType.Friend)
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

interface ClipboardFilePayload {
  name: string
  mime: string
  dataBase64: string
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

// 草稿保存
const draftMap = new Map<string, string>()

watch(convId, (newId, oldId) => {
  if (oldId && content.value.trim()) {
    draftMap.set(oldId, content.value)
  }
  if (newId) {
    const draft = draftMap.get(newId) || ''
    content.value = draft
    if (editorRef.value) editorRef.value.textContent = draft
  }
  uiStore.clearQuoteMessage()
  uiStore.exitSelectionMode()
})

function handleSend() {
  showEmoji.value = false
  const text = content.value.trim()
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

  for (const item of currentForwardDraftItems.value) {
    emit('send', item.content, item.msgType, item.extra)
  }
  if (hasForwardDraft.value) {
    uiStore.clearForwardDraft()
  }

  if (text) {
    emit('send', text, MessageType.Text, withReadBurnExtra(Object.keys(extra).length > 0 ? extra : undefined))
  }
  content.value = ''
  if (editorRef.value) editorRef.value.textContent = ''
  if (convId.value) draftMap.delete(convId.value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
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
  if (e.key === '@' && isGroup.value && !isFileHelperChat.value) {
    showAtList.value = true
  }
}

function handleInput() {
  if (editorRef.value) {
    content.value = editorRef.value.textContent ?? ''
  }
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

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleEmojiSelect(emoji: string) {
  content.value += emoji
  if (editorRef.value) editorRef.value.textContent = content.value
  showEmoji.value = false
}

function handleAtSelect(member: { uid: string; name: string }) {
  content.value += `@${member.name} `
  if (editorRef.value) editorRef.value.textContent = content.value
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
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.onchange = () => {
    const files = Array.from(input.files ?? [])
    if (files.length > 0) {
      pendingFiles.value = files
      showFilePreview.value = true
    }
  }
  input.click()
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

async function handleFileSend(payload: { text: string; files: File[] } | File[]) {
  const files = Array.isArray(payload) ? payload : payload.files
  const text = Array.isArray(payload) ? '' : (payload.text || '').trim()

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      if (isGroup.value) {
        const dataUrl = await fileToDataURL(file)
        const { width, height } = await getImageSize(dataUrl)
        emit('send', JSON.stringify({
          url: dataUrl,
          thumbnailUrl: dataUrl,
          width,
          height,
          size: file.size,
          name: file.name,
        }), MessageType.Image, withReadBurnExtra())
      } else {
        emit('send', JSON.stringify({ name: file.name, size: file.size, path: '' }), MessageType.Image, withReadBurnExtra())
      }
    } else {
      emit('send', JSON.stringify({ name: file.name, size: file.size, ext: file.name.split('.').pop() }), MessageType.File, withReadBurnExtra())
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

eventBus.on('editor:focus', () => {
  nextTick(() => editorRef.value?.focus())
})
eventBus.on('editor:insert-emoji', handleEmojiSelect)
eventBus.on('editor:insert-at', handleAtSelect)
</script>

<template>
  <div class="message-input" @drop="handleDrop" @dragover="handleDragOver">
    <!-- 与 im 逻辑一致：只在群全员禁言时提示 -->
    <div v-if="showShutupTip" class="shutup-tip">
      {{ $t('全员禁言中') }}
    </div>

    <template v-else>
      <div v-if="hasForwardDraft" class="forward-preview-bar">
        <img class="forward-preview-icon" :src="forwardPreviewIcon" alt="" />
        <div class="forward-preview-body">
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
        </div>
      </div>

      <div class="editor-wrapper">
        <div
          ref="editorRef"
          class="editor"
          contenteditable="true"
          :placeholder="$t('输入消息...')"
          @input="handleInput"
          @keydown="handleKeydown"
          @paste="handlePaste"
          @mouseup="saveEditorSelection"
          @keyup="saveEditorSelection"
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

        <Transition name="popup">
          <div v-if="showEmoji" ref="emojiPickerPopoverRef" class="emoji-popup">
            <EmojiPicker @select="handleEmojiSelect" @close="showEmoji = false" />
          </div>
        </Transition>

        <AtListDialog
          v-model:visible="showAtList"
          :group-id="groupId"
          @select="handleAtSelect"
        />
      </div>

      <div class="send-area">
        <div class="send-right">
          <span v-if="showReadBurnTip" class="burn-time-tip" @click="showScheduleDeletion = true">
            <img :src="readBurnTimeIcon" alt="" />
            <span>{{ readBurnTimeText }}</span>
          </span>
          <button class="send-btn" :disabled="!content.trim() && !hasForwardDraft" @click="handleSend">
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
  </div>
</template>

<style lang="scss" scoped>
.message-input {
  min-height: 91px;
  border-top: 1px solid #eee;
  background: #fff;
  flex-shrink: 0;
  position: relative;
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
  font-size: 13px;
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
  bottom: 100%;
  left: 0;
  z-index: 100;
  margin-bottom: 4px;
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
