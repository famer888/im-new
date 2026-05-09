<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore, isFileHelperTargetId, type Conversation } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import dayjs from 'dayjs'
import mdrIcon from '@/assets/images/message/mdr-icon.png'
import archiveIcon from '@/assets/images/message/archive-icon.png'

const { t, locale } = useI18n()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()

/** 传输助手仅通过侧栏「传输」进入，不在会话列表重复展示（与 im 一致） */
function isNotFileHelper(c: Conversation): boolean {
  return !isFileHelperTargetId(c.targetId)
}

function isConversationInCurrentRelations(conv: Conversation): boolean {
  switch (conv.type) {
    case ConversationType.Friend:
      return Boolean(contactStore.getContact(conv.targetId))
    case ConversationType.Group:
      return Boolean(groupStore.getGroup(conv.targetId))
    case ConversationType.Channel:
      return Boolean(channelStore.getChannel(conv.targetId))
    default:
      return false
  }
}

const normalConversations = computed(() =>
  chatStore.conversations.filter(
    c => !c.isArchived && isNotFileHelper(c) && isConversationInCurrentRelations(c),
  ),
)

const archivedConversations = computed(() =>
  chatStore.conversations.filter(
    c => c.isArchived && isNotFileHelper(c) && isConversationInCurrentRelations(c),
  ),
)

/** 与旧 im 归档入口 archiveText 一致：归档会话名称逗号拼接预览 */
const archivePreviewText = computed(() =>
  archivedConversations.value.map((c) => getName(c)).filter(Boolean).join(','),
)

/** 归档会话汇总未读（旧 im archiveUnreadCount） */
const archiveUnreadTotal = computed(() =>
  archivedConversations.value.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
)

const displayList = computed(() =>
  uiStore.chatArchiveListShow ? archivedConversations.value : normalConversations.value,
)

function getName(conv: Conversation): string {
  switch (conv.type) {
    case ConversationType.Friend:
      return contactStore.getDisplayName(conv.targetId)
    case ConversationType.Group:
      return groupStore.getGroup(conv.targetId)?.name ?? conv.targetId
    case ConversationType.Channel:
      return channelStore.getChannel(conv.targetId)?.channelName
        ?? channelStore.getChannel(conv.targetId)?.name
        ?? conv.targetId
    default:
      return conv.targetId
  }
}

function getAvatar(conv: Conversation): string | null {
  switch (conv.type) {
    case ConversationType.Friend:
      return contactStore.getContact(conv.targetId)?.avatar ?? null
    case ConversationType.Group:
      return groupStore.getGroup(conv.targetId)?.avatar ?? null
    case ConversationType.Channel:
      return channelStore.getChannel(conv.targetId)?.avatar ?? null
    default:
      return null
  }
}

function getAvatarId(conv: Conversation): string | undefined {
  if (conv.type !== ConversationType.Channel) return undefined
  const channel = channelStore.getChannel(conv.targetId)
  return channel?.channelId || channel?.id || conv.targetId
}

function getAvatarColor(conv: Conversation): string | undefined {
  if (conv.type !== ConversationType.Channel) return undefined
  return channelStore.getChannel(conv.targetId)?.logoColor || undefined
}

function getAvatarType(conv: Conversation): 'friend' | 'group' | 'channel' {
  switch (conv.type) {
    case ConversationType.Group:
      return 'group'
    case ConversationType.Channel:
      return 'channel'
    default:
      return 'friend'
  }
}

function formatTime(ts: number): string {
  if (!ts) return ''
  void locale.value
  const d = dayjs(ts)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('HH:mm')
  if (d.isSame(today.subtract(1, 'day'), 'day')) return t('昨天')
  if (d.isSame(today, 'year')) return d.format('MM/DD')
  return d.format('YYYY/MM/DD')
}

/** 与 im 会话列表 `&.online` 绿点一致：单聊好友在线且允许展示时显示 */
function showFriendOnlineDot(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Friend) return false
  if (isFileHelperTargetId(conv.targetId)) return false
  const c = contactStore.getContact(conv.targetId)
  if (!c || c.bfShowOnline === false) return false
  return Boolean(c.online)
}

function formatDigestText(digest: string): string {
  const raw = digest.trim()
  if (!raw) return ''
  if (raw === '暂不支持该消息类型') return t('暂不支持该消息类型')
  if (raw.includes('\uFFFD')) return `[${t('名片')}]`

  const bracketMatch = raw.match(/^\[(图片|语音|视频|名片|文件|骰子)\]$/)
  if (bracketMatch) return `[${t(bracketMatch[1])}]`

  try {
    const parsed = JSON.parse(raw)
    if (
      parsed
      && typeof parsed === 'object'
      && (parsed.url || parsed.fileUrl || parsed.thumbnailUrl || parsed.thumbUrl)
    ) {
      return `[${t('图片')}]`
    }
  } catch {
    // 非 JSON 文本按原内容显示
  }

  return raw
}

function shouldShowDraft(conv: Conversation): boolean {
  return Boolean(conv.draft) && conv.id !== chatStore.currentConversationId
}

function getMessageDigest(message: Message): string {
  const raw = (message.content || '').trim()
  if (message.msgType === 1) return `[${t('图片')}]`
  if (message.msgType === 2) return `[${t('语音')}]`
  if (message.msgType === 3) return `[${t('视频')}]`
  if (message.msgType === 5) return `[${t('名片')}]`
  if (message.msgType === 7) return `[${t('文件')}]`
  if (message.msgType === 12) return `[${t('骰子')}]`
  if ([10, 13, 14, 15].includes(message.msgType)) return t('暂不支持该消息类型')
  return raw ? formatDigestText(raw) : ''
}

function getLoadedLatestDigest(conv: Conversation): string {
  const loaded = messageStore.getMessages(conv.id)
  if (loaded.length === 0) return ''
  const latest = loaded[loaded.length - 1]
  const isCurrentConversation = conv.id === chatStore.currentConversationId
  const latestTime = Number(latest.sendTime || 0)
  const convTime = Number(conv.lastMsgTime || 0)
  const lastMsgId = String(conv.lastMsgId || '')
  const latestMatchesSummary = Boolean(
    lastMsgId
    && (String(latest.id || '') === lastMsgId || String(latest.customMsgId || '') === lastMsgId),
  )

  if (!isCurrentConversation && !latestMatchesSummary && latestTime < convTime) return ''
  return getMessageDigest(latest)
}

function getDigest(conv: Conversation): string {
  if (shouldShowDraft(conv)) return conv.draft || ''
  const loadedDigest = getLoadedLatestDigest(conv)
  if (loadedDigest) return loadedDigest
  if (conv.lastMsgDigest && conv.lastMsgDigest.trim()) {
    return formatDigestText(conv.lastMsgDigest)
  }

  return ''
}

function handleSelect(conv: Conversation) {
  if (conv.type === ConversationType.Friend && !isFileHelperTargetId(conv.targetId)) {
    void contactStore.ensureContactDetailLoaded(conv.targetId)
  }
  chatStore.setCurrentConversation(conv.id)
  // 点击会话项后收起右侧信息面板（与 im 交互一致）
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function handleContextMenu(e: MouseEvent, conv: Conversation) {
  e.preventDefault()
  uiStore.showContextMenu(e.clientX, e.clientY, {
    type: 'conversation',
    conversationId: conv.id,
    isPinned: conv.isPinned,
    isMuted: conv.isMuted,
    isArchived: conv.isArchived,
  })
}
</script>

<template>
  <div class="conversation-list">
    <!-- 归档入口（对齐旧 im chats/index.vue .archive） -->
    <div
      v-if="archivedConversations.length > 0 && !uiStore.chatArchiveListShow"
      class="archive-entry"
      @click="uiStore.setChatArchiveListShow(true)"
    >
      <img class="archive-entry-icon" :src="archiveIcon" alt="" />
      <div class="archive-entry-main">
        <div class="archive-entry-title-row">
          <span class="archive-entry-title">{{ $t('归档会话') }}</span>
          <span v-if="archiveUnreadTotal > 0" class="archive-entry-badge">
            {{ archiveUnreadTotal > 99 ? '99+' : archiveUnreadTotal }}
          </span>
        </div>
        <div v-if="archivePreviewText" class="archive-entry-preview">{{ archivePreviewText }}</div>
      </div>
    </div>

    <div class="list">
      <div
        v-for="conv in displayList"
        :key="conv.id"
        :class="['conv-item', {
          active: conv.id === chatStore.currentConversationId,
          pinned: conv.isPinned && !conv.isArchived,
          'friend-online': showFriendOnlineDot(conv),
        }]"
        @click="handleSelect(conv)"
        @contextmenu="handleContextMenu($event, conv)"
      >
        <div class="conv-avatar-wrap">
          <TextAvatar
            :id="getAvatarId(conv)"
            :name="getName(conv)"
            :src="getAvatar(conv)"
            :avatar-type="getAvatarType(conv)"
            :color="getAvatarColor(conv)"
            :size="35"
            :rounded="!!getAvatar(conv)"
          />
          <span v-if="conv.unreadCount > 0 && !conv.isMuted" class="badge">
            {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
          </span>
          <span v-else-if="conv.unreadCount > 0 && conv.isMuted" class="muted-dot" />
        </div>

        <div class="conv-body">
          <div class="conv-row-top">
            <h3 class="conv-name">{{ getName(conv) }}</h3>
            <span class="conv-time">{{ formatTime(conv.lastMsgTime) }}</span>
          </div>
          <div class="conv-row-bottom">
            <span v-if="!shouldShowDraft(conv) && conv.atMe" class="at-me">[{{ t('有人@我') }}]</span>
            <span v-if="shouldShowDraft(conv)" class="draft-tag">[{{ t('草稿') }}]</span>
            <span v-if="conv.senderName && !shouldShowDraft(conv)" class="sender-name">{{ conv.senderName }}:</span>
            <span class="conv-digest">{{ getDigest(conv) }}</span>
            <span v-if="conv.isMuted" class="muted-icon">
              <img :src="mdrIcon" alt="" />
            </span>
          </div>
        </div>

        <div class="conv-divider" />
      </div>
    </div>

    <div v-if="displayList.length === 0" class="empty-tip">
      {{ uiStore.chatArchiveListShow ? t('暂无归档会话') : t('暂时没有新的聊天会话') }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.conversation-list {
  flex: 1;
  position: relative;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #999 transparent;
}

.list {
  position: relative;
  min-height: 100%;
}

.archive-entry {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 59px;
  padding: 8px 16px 8px 63px;
  box-sizing: border-box;
  background-color: #fcfcfc;
  border-bottom: 1px solid #f1f0f0;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover { background: #f9f9f9; }
}

.archive-entry-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  width: 35px;
  height: 35px;
  transform: translateY(-50%);
  object-fit: cover;
}

.archive-entry-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.archive-entry-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.archive-entry-title {
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}

.archive-entry-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  box-sizing: border-box;
  background: #666;
  border-radius: 20px;
  transform: scale(0.86);
  color: #fff;
  font-size: 12px;
  font-style: normal;
  line-height: 20px;
  text-align: center;
}

.archive-entry-preview {
  font-size: 12px;
  color: #999;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 16px 0 63px;
  height: 59px;
  background-color: #fcfcfc;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover { background: #f9f9f9; }
  &.active { background: #efefef; }
  &.pinned { background: #ede7e7; }
  &.pinned.active { background: #efefef; }

  &.friend-online .conv-avatar-wrap::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    right: -1px;
    bottom: -1px;
    background: #10d561;
    border: 1px solid #fcfcfc;
    box-sizing: border-box;
    z-index: 2;
  }
}

.conv-avatar-wrap {
  position: absolute;
  left: 16px;
  width: 35px;
  height: 35px;
  flex-shrink: 0;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  background: #f44e5a;
  border-radius: 20px;
  transform: scale(0.86);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.muted-dot {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 8px;
  background: #ccc;
  border-radius: 50%;
}

.conv-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.conv-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conv-name {
  font-size: 14px;
  color: #333;
  font-weight: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  max-width: 120px;
  line-height: 18px;
}

.conv-time {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
  margin-left: 8px;
}

.conv-row-bottom {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #aaaaaa;
  line-height: 20px;
  gap: 2px;
}

.at-me {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.draft-tag {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.sender-name {
  color: #aaaaaa;
  font-size: 12px;
  flex-shrink: 0;
}

.conv-digest {
  color: #aaaaaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.muted-icon {
  flex-shrink: 0;
  margin-left: 6px;
  display: flex;
  align-items: center;

  img {
    display: block;
    width: 12px;
    height: 12px;
  }
}

.conv-divider {
  position: absolute;
  bottom: 0;
  left: 63px;
  right: 0;
  height: 1px;
  background: #f1f0f0;
}

.empty-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  // width: 100%;
  transform: translate(-50%);
  text-align: center;
  color: #333;
  font-weight: 500;
  font-size: 13px;
}
</style>
