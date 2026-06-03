<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  isFileHelperTargetId,
  useChatStore,
} from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { ConversationType } from '@/types'
import {
  getGroupIntroNoticePayload,
  isGroupIntroNoticeMessage,
  type GroupIntroNoticePayload,
} from '@/utils/groupIntroNotice'
import { isMessageEligibleForUnreadAnchor } from '@/utils/chatUnreadVisibility'
import { isPendingGroupInviteChatMessage } from '@/utils/notificationNavigation'
import ChatHeader from '../components/ChatHeader.vue'
import MessageList from '../components/MessageList.vue'
import MessageInput from '../components/MessageInput.vue'
import GroupNoticeDialog from '../components/panels/GroupNoticeDialog.vue'
import GroupNoticeContent from '../components/panels/GroupNoticeContent.vue'
import lockIcon from '@/assets/images/message/lock.png'
import dropFileIcon from '@/assets/images/file/file-icon.png'
import topNoticeArrowIcon from '@/assets/images/headNav/jt-icon.png'
import { eventBus } from '@/utils/eventBus'

const route = useRoute()
const { t } = useI18n()
const authStore = useAuthStore()
const messageStore = useMessageStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()

const conversationId = computed(() => chatStore.currentConversationId || (route.query.id as string) || '')
const conversation = computed(() =>
  chatStore.conversations.find((c) => c.id === conversationId.value) ?? null,
)
const currentFriendContact = computed(() => {
  const conv = conversation.value
  if (!conv || conv.type !== ConversationType.Friend || isFileHelperTargetId(conv.targetId)) {
    return null
  }
  return contactStore.getContact(conv.targetId) ?? null
})
const friendConversationTargetId = computed(() => currentFriendContact.value?.id ?? '')

const messages = computed(() => messageStore.getMessages(conversationId.value))
const isLoading = computed(() => messageStore.isLoading(conversationId.value))
const showReadBurnBackground = computed(() => currentFriendContact.value?.bfReadCancel === true)
const currentGroupId = computed(() => {
  const conv = conversation.value
  if (conv?.type === ConversationType.Group) return conv.targetId
  return conversationId.value.startsWith('1_') ? conversationId.value.slice(2) : ''
})
const isGroupConversation = computed(() => Boolean(currentGroupId.value))
const groupNoticeDialogVisible = ref(false)
const groupNoticeDialogHistory = ref<{ notice: string; editorId: string; groupId: string } | null>(null)
const dismissedGroupNoticeKey = ref('')

/** 进入会话时的未读条数快照，供「未读消息」分隔条（markAsRead 后列表里会变成 0，故单独存） */
const sessionInitialUnread = ref(0)
/** 进入会话时实际已加载到的未读消息 ID；用于把分隔条锚到真实消息，避免只凭未读数误显示 */
const sessionUnreadMessageIds = ref<string[]>([])
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

const latestGroupIntroNoticeMessage = computed(() => {
  if (!isGroupConversation.value) return null
  return messages.value.reduce<Message | null>((latest, message) => {
    if (!isGroupIntroNoticeMessage(message)) return latest
    if (!latest || message.sendTime >= latest.sendTime) return message
    return latest
  }, null)
})

const latestGroupIntroNotice = computed<GroupIntroNoticePayload | null>(() => {
  const message = latestGroupIntroNoticeMessage.value
  if (!message) return null
  const payload = getGroupIntroNoticePayload(message)
  if (!payload.groupId || !payload.notice) return null
  return payload
})

const topGroupNoticeVisible = computed(() =>
  Boolean(
    isGroupConversation.value
    && latestGroupIntroNotice.value
    && latestGroupIntroNotice.value.key !== dismissedGroupNoticeKey.value,
  ),
)

const hideMessageInput = computed(() => {
  const conv = conversation.value
  if (!conv) return false
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return true
  if (conv.type === ConversationType.Friend && conv.targetId === CHANNEL_NOTIFICATION_TARGET_ID) return true

  // 待处理入群邀请的聊天只允许查看通知，不应继续展示输入区。
  const latestVisibleMessage = [...messages.value].reverse().find((message) => !message.isDeleted) ?? null
  return isPendingGroupInviteChatMessage(latestVisibleMessage)
})

function getGroupNoticeAckStorageKey(uid: string, groupId: string): string {
  return `group-intro-notice-ack:${uid}:${groupId}`
}

function loadDismissedGroupNoticeKey() {
  const uid = String(authStore.uid || '')
  const groupId = currentGroupId.value
  if (!uid || !groupId) {
    dismissedGroupNoticeKey.value = ''
    return
  }
  dismissedGroupNoticeKey.value = localStorage.getItem(getGroupNoticeAckStorageKey(uid, groupId)) || ''
}

function handleCloseTopGroupNotice() {
  const uid = String(authStore.uid || '')
  const groupId = currentGroupId.value
  const payload = latestGroupIntroNotice.value
  if (!uid || !groupId || !payload) return
  localStorage.setItem(getGroupNoticeAckStorageKey(uid, groupId), payload.key)
  dismissedGroupNoticeKey.value = payload.key
}

function openGroupNotice(payload: GroupIntroNoticePayload) {
  if (!payload.groupId) return
  groupNoticeDialogHistory.value = {
    groupId: payload.groupId,
    notice: payload.notice,
    editorId: payload.editorId,
  }
  groupNoticeDialogVisible.value = true
}

function handleOpenTopGroupNotice() {
  const payload = latestGroupIntroNotice.value
  if (!payload) return
  openGroupNotice(payload)
}

function handleOpenGroupNoticeFromMessage(payload: { message: Message }) {
  openGroupNotice(getGroupIntroNoticePayload(payload.message))
}

function handleCloseGroupNoticeDialog() {
  groupNoticeDialogVisible.value = false
  groupNoticeDialogHistory.value = null
}

function captureUnreadSnapshot(convId: string) {
  const conv = chatStore.conversations.find((c) => c.id === convId)
  const n = conv?.unreadCount ?? 0
  sessionInitialUnread.value = Math.max(sessionInitialUnread.value, n)
}

function collectUnreadCandidates(convId: string, uid: string): Message[] {
  return messageStore.getMessages(convId).filter((message) =>
    String(message.senderId || '') !== uid
    && Number(message.readStatus || 0) === 0,
  )
}

function collectEligibleUnreadMessageIds(convId: string, uid: string): string[] {
  const ids = new Set<string>()
  for (const message of collectUnreadCandidates(convId, uid)) {
    if (!isMessageEligibleForUnreadAnchor(convId, message, uid)) continue
    if (message.id) ids.add(String(message.id))
    if (message.customMsgId) ids.add(String(message.customMsgId))
  }
  return [...ids]
}

async function resolveVisibleUnreadSnapshot(convId: string, uid: string) {
  const targetUnreadCount = Math.max(0, Number(sessionInitialUnread.value || 0))
  if (targetUnreadCount <= 0) {
    sessionUnreadMessageIds.value = []
    sessionInitialUnread.value = 0
    return
  }

  let pageLoads = 0
  while (conversationId.value === convId) {
    const eligibleIds = collectEligibleUnreadMessageIds(convId, uid)
    if (eligibleIds.length > 0) {
      sessionUnreadMessageIds.value = eligibleIds
      return
    }

    const inspectedUnreadCount = collectUnreadCandidates(convId, uid).length
    const exhaustedHistory = !messageStore.hasMore(convId)
    // 未读锚点补齐只做有限页数扫描，避免进入会话时长时间“加载中”。
    if (exhaustedHistory || inspectedUnreadCount >= targetUnreadCount || pageLoads >= 6) {
      sessionUnreadMessageIds.value = []
      sessionInitialUnread.value = 0
      return
    }

    await messageStore.loadOlderMessages(uid, convId, { silent: true })
    if (conversationId.value !== convId) return
    pageLoads += 1
  }
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

watch(
  [() => authStore.uid, currentGroupId],
  () => {
    loadDismissedGroupNoticeKey()
  },
  { immediate: true },
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
      sessionUnreadMessageIds.value = []
      unreadSnapshotLocked.value = false
    }
    if (!newId) {
      sessionInitialUnread.value = 0
      sessionUnreadMessageIds.value = []
      unreadSnapshotLocked.value = false
      return
    }
    if (!authStore.uid) return
    const myId = newId
    await nextTick()
    captureUnreadSnapshot(myId)
    await messageStore.loadMessages(authStore.uid, myId)
    if (conversationId.value !== myId) return
    await resolveVisibleUnreadSnapshot(myId, authStore.uid)
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

function handleSend(content: string, msgType: number, extra?: Record<string, unknown>) {
  if (!conversationId.value || !authStore.uid) return
  messageStore.sendMessage(authStore.uid, conversationId.value, msgType, content, extra).catch((error) => {
    console.warn('[chat-window] send message failed:', error)
  })
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
    <div v-if="topGroupNoticeVisible && latestGroupIntroNotice" class="group-top-notice-dialog">
      <h2
        role="button"
        tabindex="0"
        @click="handleOpenTopGroupNotice"
        @keydown.enter.prevent="handleOpenTopGroupNotice"
        @keydown.space.prevent="handleOpenTopGroupNotice"
      >
        <span>{{ t('群简介') }}</span>
        <img :src="topNoticeArrowIcon" alt="" />
      </h2>
      <GroupNoticeContent
        class="group-top-notice-content"
        :content="latestGroupIntroNotice.notice"
        :group-id="latestGroupIntroNotice.groupId"
        @navigated="handleCloseTopGroupNotice"
      />
      <button type="button" @click.stop="handleCloseTopGroupNotice">{{ t('知道了') }}</button>
    </div>
    <MessageList
      :conversation-id="conversationId"
      :messages="messages"
      :loading="isLoading"
      :has-more="messageStore.hasMore(conversationId)"
      :unread-count="sessionInitialUnread"
      :unread-message-ids="sessionUnreadMessageIds"
      :show-read-burn-background="showReadBurnBackground"
      align-top
      @load-more="handleLoadMore"
      @open-group-notice="handleOpenGroupNoticeFromMessage"
    />
    <MessageInput v-if="!hideMessageInput" @send="handleSend" />
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
    <GroupNoticeDialog
      v-if="groupNoticeDialogVisible && currentGroupId"
      :visible="groupNoticeDialogVisible"
      :group-id="groupNoticeDialogHistory?.groupId || currentGroupId"
      :history-notice="groupNoticeDialogHistory"
      @close="handleCloseGroupNoticeDialog"
      @published="handleCloseGroupNoticeDialog"
    />
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
  font-weight: normal;
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

.group-top-notice-dialog {
  padding: 15px 15px 30px;
  box-sizing: border-box;
  position: absolute;
  width: 95%;
  top: 53px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #fff;
  border-radius: 10px;
  z-index: 10;
  box-shadow: 0 0 10px #eee;

  > h2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    margin: 0;
    font-size: 14px;
    cursor: pointer;
    outline: none;

    > img {
      display: block;
      height: 12px;
      width: 12px;
      transform: rotate(-90deg);
      cursor: pointer;
    }
  }

  .group-top-notice-content {
    margin: 5px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    word-wrap: break-word;
    line-height: 20px;
    max-height: 190px;
    color: #333;
    font-size: 14px;
  }

  > button {
    color: #3369fe;
    position: absolute;
    right: 15px;
    font-size: 12px;
    font-weight: 600;
    bottom: 8px;
    cursor: pointer;
    user-select: none;
    border: 0;
    background: transparent;
    padding: 0;

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>
