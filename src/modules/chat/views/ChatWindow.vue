<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { FILE_HELPER_TARGET_ID, useChatStore } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { ConversationType } from '@/types'
import ChatHeader from '../components/ChatHeader.vue'
import MessageList from '../components/MessageList.vue'
import MessageInput from '../components/MessageInput.vue'
import lockIcon from '@/assets/images/message/lock.png'
import dropFileIcon from '@/assets/images/file/file-icon.png'
import { eventBus } from '@/utils/eventBus'

const route = useRoute()
const { t } = useI18n()
const authStore = useAuthStore()
const messageStore = useMessageStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()

const conversationId = computed(() => (route.query.id as string) || chatStore.currentConversationId || '')
const conversation = computed(() =>
  chatStore.conversations.find((c) => c.id === conversationId.value) ?? null,
)
const currentFriendContact = computed(() => {
  const conv = conversation.value
  if (!conv || conv.type !== ConversationType.Friend || conv.targetId === FILE_HELPER_TARGET_ID) {
    return null
  }
  return contactStore.getContact(conv.targetId) ?? null
})
const friendConversationTargetId = computed(() => currentFriendContact.value?.id ?? '')

const messages = computed(() => messageStore.getMessages(conversationId.value))
const isLoading = computed(() => messageStore.isLoading(conversationId.value))
const showReadBurnBackground = computed(() => currentFriendContact.value?.bfReadCancel === true)

/** 进入会话时的未读条数快照，供「未读消息」分隔条（markAsRead 后列表里会变成 0，故单独存） */
const sessionInitialUnread = ref(0)
/** 已为当前会话执行过 markAsRead 后，不再用 store 覆盖快照，避免把已算好的 N 冲掉 */
const unreadSnapshotLocked = ref(false)
const dropAreaVisible = ref(false)
const chatWindowRef = ref<HTMLElement | null>(null)
let unlistenTauriDragDrop: (() => void) | null = null
let closeDropAreaTimer: ReturnType<typeof window.setTimeout> | null = null
let lastDropHandledAt = 0
const DROP_DEDUPE_MS = 500
const dropAreaStyle = computed(() => {
  const rect = chatWindowRef.value?.getBoundingClientRect()
  if (!rect) return {}
  return {
    left: `${rect.left}px`,
    width: `${rect.width}px`,
  }
})

function captureUnreadSnapshot(convId: string) {
  const conv = chatStore.conversations.find((c) => c.id === convId)
  const n = conv?.unreadCount ?? 0
  sessionInitialUnread.value = Math.max(sessionInitialUnread.value, n)
}

/**
 * 会话列表可能晚于路由到达：在 locked 前持续用 store 里的 unread 抬快照，
 * 解决「第一次 capture 为 0、分隔条永远不出现」。
 */
watch(
  [conversationId, () => chatStore.conversations],
  () => {
    if (unreadSnapshotLocked.value) return
    const id = conversationId.value
    if (!id) return
    captureUnreadSnapshot(id)
  },
  { deep: true, immediate: true },
)

function loadGroupMembersIfNeeded(convId: string) {
  if (!authStore.uid || !convId) return
  const conv = chatStore.conversations.find((c) => c.id === convId)
  if (conv?.type === ConversationType.Group && conv.targetId) {
    groupStore.loadMembers(authStore.uid, conv.targetId).catch(() => {})
  }
}

watch(
  friendConversationTargetId,
  (targetId) => {
    if (!targetId) return
    void contactStore.ensureContactDetailLoaded(targetId)
  },
  { immediate: true },
)

watch(
  conversationId,
  async (newId, oldId) => {
    if (oldId !== undefined && newId !== oldId) {
      sessionInitialUnread.value = 0
      unreadSnapshotLocked.value = false
    }
    if (!newId) {
      sessionInitialUnread.value = 0
      unreadSnapshotLocked.value = false
      return
    }
    if (!authStore.uid) return
    const myId = newId
    await nextTick()
    captureUnreadSnapshot(myId)
    await messageStore.loadMessages(authStore.uid, myId)
    if (conversationId.value !== myId) return
    await chatStore.markAsRead(authStore.uid, myId)
    if (conversationId.value !== myId) return
    unreadSnapshotLocked.value = true
    loadGroupMembersIfNeeded(myId)
    await nextTick()
    eventBus.emit('editor:focus')
  },
  { immediate: true },
)

async function handleLoadMore() {
  if (conversationId.value && authStore.uid) {
    await messageStore.loadOlderMessages(authStore.uid, conversationId.value)
  }
}

async function handleSend(content: string, msgType: number, extra?: Record<string, unknown>) {
  if (!conversationId.value || !authStore.uid) return
  await messageStore.sendMessage(authStore.uid, conversationId.value, msgType, content, extra)
}

function hasDraggedFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

function normalizeTauriDropPosition(position?: { x: number; y: number }) {
  if (!position) return undefined
  const scale = window.devicePixelRatio || 1
  if (scale > 1 && (position.x > window.innerWidth || position.y > window.innerHeight)) {
    return {
      x: position.x / scale,
      y: position.y / scale,
    }
  }
  return position
}

function isPositionInDropArea(position?: { x: number; y: number }) {
  if (!position || !chatWindowRef.value) return false
  const rect = chatWindowRef.value.getBoundingClientRect()
  return position.x >= rect.left
    && position.x <= rect.right
    && position.y >= 0
    && position.y <= window.innerHeight
}

function setDropEffect(e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function clearCloseDropAreaTimer() {
  if (!closeDropAreaTimer) return
  window.clearTimeout(closeDropAreaTimer)
  closeDropAreaTimer = null
}

function scheduleCloseDropArea() {
  clearCloseDropAreaTimer()
  closeDropAreaTimer = window.setTimeout(() => {
    dropAreaVisible.value = false
    closeDropAreaTimer = null
  }, 80)
}

function markDropHandled() {
  const now = Date.now()
  if (now - lastDropHandledAt < DROP_DEDUPE_MS) return false
  lastDropHandledAt = now
  return true
}

function emitDroppedFiles(files: File[]) {
  if (files.length === 0 || !markDropHandled()) return
  eventBus.emit('editor:drop-files', files)
}

function emitDroppedFilePaths(paths: string[]) {
  if (paths.length === 0 || !markDropHandled()) return
  eventBus.emit('editor:drop-file-paths', paths)
}

function updateDropAreaFromDomDrag(e: DragEvent) {
  if (!hasDraggedFiles(e)) return false
  const inside = isPositionInDropArea({ x: e.clientX, y: e.clientY })
  if (!inside) {
    dropAreaVisible.value = false
    return false
  }
  clearCloseDropAreaTimer()
  e.preventDefault()
  setDropEffect(e)
  dropAreaVisible.value = true
  return true
}

function handleDragEnter(e: DragEvent) {
  if (!hasDraggedFiles(e)) return
  e.preventDefault()
  setDropEffect(e)
  dropAreaVisible.value = true
}

function handleDropAreaDragOver(e: DragEvent) {
  e.preventDefault()
  setDropEffect(e)
}

function closeDropArea() {
  clearCloseDropAreaTimer()
  dropAreaVisible.value = false
}

function handleDropAreaDrop(e: DragEvent) {
  e.preventDefault()
  const files = Array.from(e.dataTransfer?.files ?? [])
  closeDropArea()
  emitDroppedFiles(files)
}

function handleWindowDragEnter(e: DragEvent) {
  updateDropAreaFromDomDrag(e)
}

function handleWindowDragOver(e: DragEvent) {
  updateDropAreaFromDomDrag(e)
}

function handleWindowDragLeave(e: DragEvent) {
  if (!hasDraggedFiles(e)) return
  scheduleCloseDropArea()
}

function handleWindowDrop(e: DragEvent) {
  if (!hasDraggedFiles(e)) return
  const inside = isPositionInDropArea({ x: e.clientX, y: e.clientY })
  closeDropArea()
  if (!inside) return
  e.preventDefault()
  emitDroppedFiles(Array.from(e.dataTransfer?.files ?? []))
}

function setupDomDragDrop() {
  window.addEventListener('dragenter', handleWindowDragEnter, true)
  window.addEventListener('dragover', handleWindowDragOver, true)
  window.addEventListener('dragleave', handleWindowDragLeave, true)
  window.addEventListener('drop', handleWindowDrop, true)
  window.addEventListener('blur', closeDropArea)
}

function cleanupDomDragDrop() {
  window.removeEventListener('dragenter', handleWindowDragEnter, true)
  window.removeEventListener('dragover', handleWindowDragOver, true)
  window.removeEventListener('dragleave', handleWindowDragLeave, true)
  window.removeEventListener('drop', handleWindowDrop, true)
  window.removeEventListener('blur', closeDropArea)
  clearCloseDropAreaTimer()
}

async function setupTauriDragDrop() {
  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    unlistenTauriDragDrop = await getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload
      if (payload.type === 'enter' || payload.type === 'over') {
        dropAreaVisible.value = isPositionInDropArea(normalizeTauriDropPosition(payload.position))
        return
      }
      if (payload.type === 'drop') {
        const shouldDrop = dropAreaVisible.value || isPositionInDropArea(normalizeTauriDropPosition(payload.position))
        dropAreaVisible.value = false
        if (shouldDrop && payload.paths.length > 0) {
          emitDroppedFilePaths(payload.paths)
        }
        return
      }
      dropAreaVisible.value = false
    })
  } catch (error) {
    console.warn('[chat-window] tauri drag-drop listen failed:', error)
  }
}

onMounted(() => {
  setupDomDragDrop()
  void setupTauriDragDrop()
})

onBeforeUnmount(() => {
  cleanupDomDragDrop()
  unlistenTauriDragDrop?.()
  unlistenTauriDragDrop = null
})
</script>

<template>
  <div ref="chatWindowRef" class="chat-window" @dragenter="handleDragEnter">
    <ChatHeader :conversation-id="conversationId" />
    <div class="e2e-notice">
      <!-- 视觉 10px：浏览器常限制最小字号，用 12px 基准 + scale(10/12) -->
      <div class="e2e-notice-scale">
        <img class="e2e-lock" :src="lockIcon" alt="" />
        <span class="e2e-text">{{ t('此对话中的信息和通话已经进行端对端加密') }}</span>
      </div>
    </div>
    <MessageList
      :conversation-id="conversationId"
      :messages="messages"
      :loading="isLoading"
      :has-more="messageStore.hasMore(conversationId)"
      :unread-count="sessionInitialUnread"
      :show-read-burn-background="showReadBurnBackground"
      align-top
      @load-more="handleLoadMore"
    />
    <MessageInput @send="handleSend" />
    <div
      v-if="dropAreaVisible"
      class="dom-drop-area"
      :style="dropAreaStyle"
      draggable="true"
      @dragover="handleDropAreaDragOver"
      @drop="handleDropAreaDrop"
      @click="closeDropArea"
    >
      <p>
        <img :src="dropFileIcon" alt="" />
        <span>{{ t('拖入您要发送的文件') }}</span>
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: #fff;
  position: relative;
}

.dom-drop-area {
  color: #fff;
  text-align: center;
  position: fixed;
  top: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  z-index: 10000;

  > p {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 14px;
    height: 24px;
    margin: 0;

    > img {
      display: block;
      height: 100%;
      width: 24px;
      margin-right: 10px;
    }
  }
}

/* 传输助手：顶栏下加密说明（与消息区同底色） */
.e2e-notice {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 16px;
  background: #f6f6f6;
}

/* 基准 12px，整体缩放为视觉约 10px（规避 Chrome 等最小字号） */
.e2e-notice-scale {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: #333;
  transform: scale(calc(11 / 12));
  transform-origin: center center;
}

.e2e-lock {
  flex-shrink: 0;
  display: block;
  width: 12px;
  height: 12px;
}

.e2e-text {
  text-align: center;
}
</style>
