<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import closeIcon from '@/assets/images/notification-popup/close.png'
import friendIcon from '@/assets/images/logo/logo-58.png'
import groupIcon from '@/assets/images/notification-popup/default-group-icon.png'
import channelIcon from '@/assets/images/logo/channel-notice.webp'
import groupChatIcon from '@/assets/images/notification-popup/group-chat-icon.png'
import { useMessageStore } from '@/stores/useMessageStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { getNotificationModuleTargetFromConversationId } from '@/utils/notificationNavigation'
import { buildNotificationEmojiSegments } from '@/utils/notificationEmojiSegments'

interface NotificationData {
  conversationId: string
  title: string
  body: string
  avatar: string | null
  conversationType?: 'friend' | 'group' | 'channel'
  senderName?: string | null
  unreadCount?: number | null
}

const { t } = useI18n()
const route = useRoute()
const settingStore = useSettingStore()
const data = ref<NotificationData | null>(null)
const replyInput = ref<HTMLInputElement | null>(null)
const isReplying = ref(false)
const replyText = ref('')
const sending = ref(false)
const sendByEnter = computed(() => settingStore.settings.sendShortcutKey !== 'Ctrl+Enter')
const replyPlaceholder = computed(() =>
  sendByEnter.value ? t('Enter发送') : t('CtrlEnter发送'),
)
const defaultAvatar = computed(() => {
  if (data.value?.conversationType === 'group') return groupIcon
  if (data.value?.conversationType === 'channel') return channelIcon
  return friendIcon
})
const avatarSrc = computed(() => safeImageSrc(data.value?.avatar, defaultAvatar.value))
const isGroup = computed(() => data.value?.conversationType === 'group')
const messageText = computed(() => String(data.value?.body || ''))
const messageSegments = computed(() => buildNotificationEmojiSegments(messageText.value))
const notificationModuleTarget = computed(() =>
  getNotificationModuleTargetFromConversationId(data.value?.conversationId),
)
const actionButtonLabel = computed(() => (
  notificationModuleTarget.value ? t('查看') : t('回复')
))

// 通知 payload 来自跨窗口 query/event，文本虽由 Vue 转义，仍先收窄长度和控制字符。
function sanitizeText(value: unknown, maxLength: number): string {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength)
}

// 头像 src 不走文本转义，必须按协议白名单兜住 javascript: / 非图片 data URL。
function safeImageSrc(value: unknown, fallback: string): string {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^(asset|tauri|blob):/i.test(raw)) return raw
  if (/^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,/i.test(raw)) return raw
  return fallback
}

function sanitizeNotificationData(value: unknown): NotificationData | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<NotificationData>
  const conversationType = ['friend', 'group', 'channel'].includes(String(raw.conversationType || ''))
    ? raw.conversationType
    : 'friend'

  return {
    conversationId: sanitizeText(raw.conversationId, 128),
    title: sanitizeText(raw.title, 120),
    body: sanitizeText(raw.body, 500),
    avatar: safeImageSrc(raw.avatar, ''),
    conversationType,
    senderName: sanitizeText(raw.senderName, 120) || null,
    unreadCount: Math.max(0, Math.min(999, Number(raw.unreadCount || 0))) || null,
  }
}

function readNotificationData(raw: unknown): NotificationData | null {
  const text = Array.isArray(raw) ? raw[0] : raw
  if (typeof text !== 'string' || !text) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(text))
    return sanitizeNotificationData(parsed)
  } catch (error) {
    console.warn('[notification] parse notification data failed:', error)
    return null
  }
}

async function resizeWindow(height: number, pinned: boolean) {
  try {
    await invoke('resize_notification_window', { height, pinned })
  } catch (error) {
    console.warn('[notification] resize failed:', error)
  }
}

onMounted(async () => {
  if (!settingStore.loaded) {
    await settingStore.loadSettings()
  }
  data.value = readNotificationData(route.query.data)

  await listen<NotificationData>('notification:data', (event) => {
    data.value = sanitizeNotificationData(event.payload)
  })
})

async function handleClick() {
  if (data.value) {
    const win = getCurrentWindow()
    await emit('notification:click', { conversationId: data.value.conversationId })
    await win.close()
  }
}

async function handleClose() {
  const win = getCurrentWindow()
  await win.close()
}

async function handleReply() {
  isReplying.value = true
  await resizeWindow(104, true)
  await nextTick()
  replyInput.value?.focus()
}

async function handleActionButton() {
  // 群/频道通知类桌面提醒右下角统一走“查看”，不能继续展开回复输入框。
  if (notificationModuleTarget.value) {
    await handleClick()
    return
  }
  await handleReply()
}

async function handleSend() {
  const content = replyText.value.trim()
  if (!data.value || !content || sending.value) return

  sending.value = true
  try {
    const messageStore = useMessageStore()
    const uid = String(localStorage.getItem('current-uid') || '')
    if (!uid) throw new Error('missing uid')

    await messageStore.sendMessage(uid, data.value.conversationId, 0, content)
    await handleClose()
  } catch (error) {
    console.warn('[notification] reply send failed:', error)
  } finally {
    sending.value = false
  }
}

function handleReplyKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter') return

  const shouldSend = sendByEnter.value
    ? !event.shiftKey && !event.ctrlKey && !event.metaKey
    : event.ctrlKey || event.metaKey

  if (!shouldSend) return
  event.preventDefault()
  void handleSend()
}
</script>

<template>
  <div
    v-if="data"
    class="notification"
    :class="{ replying: isReplying }"
    @click="isReplying ? undefined : handleClick()"
  >
    <div class="info-box">
      <div class="img-box">
        <img class="avatar" :src="avatarSrc" alt="" />
      </div>
      <div class="info">
        <div class="nickname-box">
          <img v-if="isGroup" class="group-chat-icon" :src="groupChatIcon" alt="" />
          <span class="nickname">{{ data.title }}</span>
        </div>
        <div class="text-content">
          <span v-if="data.senderName" class="user-name">{{ data.senderName }}:</span>
          <span class="msg-value">
            <template v-for="(segment, index) in messageSegments" :key="`${segment.type}-${index}`">
              <img
                v-if="segment.type === 'emoji'"
                class="emoji-item"
                :src="segment.src"
                :alt="segment.token"
              />
              <span v-else>{{ segment.value }}</span>
            </template>
          </span>
        </div>
      </div>
      <button
        v-if="!isReplying"
        class="reply-button"
        type="button"
        @click.stop="handleActionButton"
      >
        {{ actionButtonLabel }}
      </button>
    </div>
    <form v-if="isReplying && !notificationModuleTarget" class="reply-form" @submit.prevent.stop>
      <input
        ref="replyInput"
        v-model="replyText"
        class="reply-input"
        type="text"
        :placeholder="replyPlaceholder"
        @click.stop
        @keydown="handleReplyKeydown"
      />
      <button
        class="reply-submit"
        type="button"
        :disabled="sending || !replyText.trim()"
        @click.stop="handleSend"
      >
        {{ t('发送') }}
      </button>
    </form>
    <button class="close-item" type="button" @click.stop="handleClose">
      <img :src="closeIcon" alt="" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

.notification {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
  width: 278px;
  height: 64px;
  padding: 10px 9px;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px 0 10px 10px;
  box-sizing: border-box;
  overflow: hidden;
  cursor: default;

  &:hover {
    background: #fff;
  }
}

.notification.replying {
  height: 104px;
}

.info-box {
  display: flex;
  align-items: center;
  width: 100%;
  height: 44px;
}

.img-box {
  width: 44px;
  height: 44px;
  margin-right: 10px;
  flex-shrink: 0;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  justify-content: center;
}

.nickname-box {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-bottom: 5px;
}

.group-chat-icon {
  width: 16px;
  height: 16px;
  margin-right: 4px;
  flex-shrink: 0;
}

.nickname {
  display: block;
  width: 180px;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-content {
  width: 210px;
  font-size: 12px;
  line-height: 16px;
  color: #999999;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

.user-name {
  color: #fb9e3e;
}

.emoji-item {
  width: 18px;
  height: 18px;
  vertical-align: text-bottom;
}

.close-item {
  position: absolute;
  top: 12px;
  right: 10px;
  width: 12px;
  height: 12px;
  padding: 0;
  border: none;
  background: transparent;
  appearance: none;
  cursor: pointer;

  img {
    display: block;
    width: 12px;
    height: 12px;
  }
}

.reply-button {
  display: none;
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 50px;
  height: 24px;
  border: none;
  border-radius: 99px;
  background: #008dff;
  color: #fff;
  font-size: 12px;
  line-height: 24px;
  box-shadow: 1px 0 10px rgb(0 0 0 / 28%);
  cursor: pointer;
}

.notification:hover .reply-button {
  display: block;
}

.reply-form {
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 8px;
}

.reply-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 2px 6px;
  border: 1px solid #e5e5e5;
  border-radius: 0;
  outline: none;
  box-sizing: border-box;
  font-size: 12px;
  color: #333;
  font-family: inherit;

  &:focus {
    border-color: #d8d8d8;
  }

  &::placeholder {
    color: #999;
    font-family: inherit;
  }
}

.reply-submit {
  flex-shrink: 0;
  width: 50px;
  height: 24px;
  margin-left: 10px;
  border: none;
  border-radius: 99px;
  background: #008dff;
  color: #fff;
  font-size: 12px;
  line-height: 24px;
  box-shadow: 1px 0 10px rgb(0 0 0 / 28%);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}
</style>
