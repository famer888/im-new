<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { MessageType, ConversationType } from '@/types'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useUIStore } from '@/stores/useUIStore'
import { eventBus } from '@/utils/eventBus'
import EmojiPicker from './send/EmojiPicker.vue'
import AtListDialog from './send/AtListDialog.vue'
import CreateLinkDialog from './send/CreateLinkDialog.vue'
import ScheduleDeletionDialog from './send/ScheduleDeletionDialog.vue'
import FileUploadPreview from './FileUploadPreview.vue'
import iconSmallActive from '@/assets/images/activeIcon/small-active.png'
import iconFileActive from '@/assets/images/activeIcon/file-active.png'

const emit = defineEmits<{
  (e: 'send', content: string, msgType: number): void
}>()

const chatStore = useChatStore()
const settingStore = useSettingStore()
const uiStore = useUIStore()
const content = ref('')
const editorRef = ref<HTMLDivElement | null>(null)
const showEmoji = ref(false)
const showAtList = ref(false)
const showCreateLink = ref(false)
const showScheduleDeletion = ref(false)
const pendingFiles = ref<File[]>([])
const showFilePreview = ref(false)

const isGroup = computed(() => chatStore.currentConversation?.type === ConversationType.Group)
const groupId = computed(() => chatStore.currentConversation?.targetId ?? '')
/** 与 im 传输助手一致：工具栏仅表情 + 文件 */
const isFileHelperChat = computed(
  () => chatStore.currentConversation?.targetId === FILE_HELPER_TARGET_ID,
)
const isMuted = computed(() => chatStore.currentConversation?.isMuted ?? false)
const convId = computed(() => chatStore.currentConversationId)
const scheduleDeletionTime = ref(0)

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
  scheduleDeletionTime.value = seconds
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
    <!-- 全员禁言提示 -->
    <div v-if="isMuted" class="shutup-tip">
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
          <template v-if="!isFileHelperChat">
            <button class="tool-btn" type="button" :title="$t('截图')" @click="handleGlobalKeydown({ ctrlKey: true, shiftKey: true, key: 'a', preventDefault: () => {} } as any)">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#666" stroke-width="1.5"/><path d="M9 3v18M3 9h18" fill="none" stroke="#666" stroke-width="1.5" opacity="0.4"/></svg>
            </button>
            <button v-if="isGroup" class="tool-btn" :title="$t('@提及')" @click="showAtList = !showAtList">@</button>
            <button class="tool-btn" :title="$t('创建链接')" @click="showCreateLink = true">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <button class="tool-btn" :title="$t('阅后即焚')" @click="showScheduleDeletion = true">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#666"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" fill="#666"/></svg>
              <span v-if="scheduleDeletionTime > 0" class="burn-indicator" />
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
        <div class="send-left">
          <span v-if="scheduleDeletionTime > 0 && !isFileHelperChat" class="burn-time-tip">
            <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7z" fill="none" stroke="#da2e2e" stroke-width="1.2"/><path d="M8.5 4H7v5l3.5 2.1.5-.82L8.5 8.5V4z" fill="#da2e2e"/></svg>
            {{ $t('阅后即焚已开启') }}
          </span>
        </div>
        <button class="send-btn" :disabled="!content.trim()" @click="handleSend">
          {{ $t('发送') }}
        </button>
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
  justify-content: space-between;
  padding: 0 14px 10px;
}

.send-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.burn-time-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #da2e2e;
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
