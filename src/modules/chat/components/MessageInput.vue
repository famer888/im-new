<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageType, ConversationType } from '@/types'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useUIStore } from '@/stores/useUIStore'
import { eventBus } from '@/utils/eventBus'
import { getReadBurnTimeText } from '@/utils/readBurn'
import { updateContacts } from '@/api/imBase'
import { proto } from '@/api/request'
import EmojiPicker from './send/EmojiPicker.vue'
import AtListDialog from './send/AtListDialog.vue'
import CreateLinkDialog from './send/CreateLinkDialog.vue'
import ScheduleDeletionDialog from './send/ScheduleDeletionDialog.vue'
import FileUploadPreview from './FileUploadPreview.vue'
import iconSmallActive from '@/assets/images/activeIcon/small-active.png'
import iconFileActive from '@/assets/images/activeIcon/file-active.png'
import readBurnTimeIcon from '@/assets/images/chat/read-burn-time.png'

const emit = defineEmits<{
  (e: 'send', content: string, msgType: number): void
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
const showAtList = ref(false)
const showCreateLink = ref(false)
const showScheduleDeletion = ref(false)
const pendingFiles = ref<File[]>([])
const showFilePreview = ref(false)

const isGroup = computed(() => chatStore.currentConversation?.type === ConversationType.Group)
const isFriend = computed(() => chatStore.currentConversation?.type === ConversationType.Friend)
const groupId = computed(() => chatStore.currentConversation?.targetId ?? '')
/** 与 im 传输助手一致：工具栏仅表情 + 文件 */
const isFileHelperChat = computed(
  () => chatStore.currentConversation?.targetId === FILE_HELPER_TARGET_ID,
)
/** 单聊与传输助手：仅保留表情+文件；群/频道显示扩展工具 */
const showAdvancedTools = computed(
  () => !isFileHelperChat.value && !isFriend.value,
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
const readBurnTimeText = computed(() =>
  getReadBurnTimeText(currentContact.value?.msgCancelTime || 30),
)

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

watch(currentContact, (contact) => {
  if (!contact) {
    scheduleDeletionTime.value = 0
    return
  }
  scheduleDeletionTime.value = Number(contact.msgCancelTime || 30)
}, { immediate: true })

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
})

function handleSend() {
  const text = content.value.trim()
  if (!text) return
  emit('send', text, MessageType.Text)
  content.value = ''
  if (editorRef.value) editorRef.value.textContent = ''
  if (convId.value) draftMap.delete(convId.value)
}

function handleKeydown(e: KeyboardEvent) {
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

function handleLinkConfirm(data: { linkText: string; linkValue: string }) {
  const linkHtml = `<a href="${data.linkValue}" target="_blank">${data.linkText}</a>`
  content.value += linkHtml
  if (editorRef.value) editorRef.value.innerHTML += linkHtml
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

function handleFileSend(files: File[]) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      emit('send', JSON.stringify({ name: file.name, size: file.size, path: '' }), MessageType.Image)
    } else {
      emit('send', JSON.stringify({ name: file.name, size: file.size, ext: file.name.split('.').pop() }), MessageType.File)
    }
  }
  showFilePreview.value = false
  pendingFiles.value = []
}

function handleScheduleDeletionConfirm(seconds: number) {
  const contact = currentContact.value
  if (!contact) return
  scheduleDeletionTime.value = seconds
  if (seconds === 0) {
    updateContacts({
      op: proto.ContactsOperator.READ_CANCEL,
      param: {
        contactsId: Number(contact.id),
        bfReadCancel: false,
      },
    }).then(() => {
      contactStore.patchContact(contact.id, { bfReadCancel: false })
      appendReadBurnNotice(0, false)
    }).catch(() => {
      // ignore update failure in UI layer
    })
    return
  }

  updateContacts({
    op: proto.ContactsOperator.READ_CANCEL_TIME,
    param: {
      contactsId: Number(contact.id),
      msgCancelTime: seconds,
    },
  }).then(() => {
    contactStore.patchContact(contact.id, {
      bfReadCancel: true,
      msgCancelTime: seconds,
    })
    appendReadBurnNotice(seconds, true)
  }).catch(() => {
    // ignore update failure in UI layer
  })
}

// 截图快捷键 (Ctrl+Shift+A)
function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    // TODO: invoke('start_screenshot')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
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
      <div class="toolbar">
        <div class="toolbar-left">
          <!-- 与 im components/active-icon.vue 一致：activeIcon/*.png + 灰度 / hover 彩色 -->
          <button class="tool-btn tool-btn-im-icon" type="button" :title="$t('表情')" @click="showEmoji = !showEmoji">
            <img class="im-active-icon" :src="iconSmallActive" alt="" width="20" height="20" />
          </button>
          <button class="tool-btn tool-btn-im-icon" type="button" :title="$t('文件')" @click="handleFileSelect">
            <img class="im-active-icon" :src="iconFileActive" alt="" width="20" height="20" />
          </button>
          <template v-if="showAdvancedTools">
            <button class="tool-btn" type="button" :title="$t('截图')" @click="handleGlobalKeydown({ ctrlKey: true, shiftKey: true, key: 'a', preventDefault: () => {} } as any)">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#666" stroke-width="1.5"/><path d="M9 3v18M3 9h18" fill="none" stroke="#666" stroke-width="1.5" opacity="0.4"/></svg>
            </button>
            <button v-if="isGroup" class="tool-btn" :title="$t('@提及')" @click="showAtList = !showAtList">@</button>
            <button class="tool-btn" :title="$t('创建链接')" @click="showCreateLink = true">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </template>
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
        />

        <Transition name="popup">
          <div v-if="showEmoji" class="emoji-popup">
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
          <button class="send-btn" :disabled="!content.trim()" @click="handleSend">
            {{ $t('发送') }}
          </button>
        </div>
      </div>
    </template>

    <!-- 弹窗 -->
    <CreateLinkDialog
      :visible="showCreateLink"
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
      :visible="showFilePreview"
      :files="pendingFiles"
      @send="handleFileSend"
      @cancel="showFilePreview = false; pendingFiles = []"
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
