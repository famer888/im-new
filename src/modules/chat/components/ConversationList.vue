<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore, FILE_HELPER_TARGET_ID, type Conversation } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useUIStore } from '@/stores/useUIStore'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import dayjs from 'dayjs'
import mdrIcon from '@/assets/images/message/mdr-icon.png'

const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const uiStore = useUIStore()

const showArchive = ref(false)

/** 传输助手仅通过侧栏「传输」进入，不在会话列表重复展示（与 im 一致） */
function isNotFileHelper(c: Conversation): boolean {
  return c.targetId !== FILE_HELPER_TARGET_ID
}

const normalConversations = computed(() =>
  chatStore.conversations.filter(c => !c.isArchived && isNotFileHelper(c)),
)

const archivedConversations = computed(() =>
  chatStore.conversations.filter(c => c.isArchived && isNotFileHelper(c)),
)

const displayList = computed(() =>
  showArchive.value ? archivedConversations.value : normalConversations.value,
)

function getName(conv: Conversation): string {
  switch (conv.type) {
    case ConversationType.Friend:
      return contactStore.getDisplayName(conv.targetId)
    case ConversationType.Group:
      return groupStore.getGroup(conv.targetId)?.name ?? conv.targetId
    case ConversationType.Channel:
      return channelStore.getChannel(conv.targetId)?.name ?? conv.targetId
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
  const d = dayjs(ts)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('HH:mm')
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天'
  if (d.isSame(today, 'year')) return d.format('MM/DD')
  return d.format('YYYY/MM/DD')
}

function getDigest(conv: Conversation): string {
  if (conv.draft) return `[草稿] ${conv.draft}`
  return conv.lastMsgDigest ?? ''
}

function handleSelect(conv: Conversation) {
  chatStore.setCurrentConversation(conv.id)
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
    <!-- 归档入口 -->
    <div
      v-if="archivedConversations.length > 0 && !showArchive"
      class="archive-entry"
      @click="showArchive = true"
    >
      {{ $t('已归档会话') }} ({{ archivedConversations.length }})
    </div>

    <div v-if="showArchive" class="archive-header" @click="showArchive = false">
      ← {{ $t('返回') }}
    </div>

    <div class="list">
      <div
        v-for="conv in displayList"
        :key="conv.id"
        :class="['conv-item', {
          active: conv.id === chatStore.currentConversationId,
          pinned: conv.isPinned && !conv.isArchived,
        }]"
        @click="handleSelect(conv)"
        @contextmenu="handleContextMenu($event, conv)"
      >
        <div class="conv-avatar-wrap">
          <TextAvatar
            :name="getName(conv)"
            :src="getAvatar(conv)"
            :avatar-type="getAvatarType(conv)"
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
            <span v-if="conv.atMe" class="at-me">[有人@我]</span>
            <span v-if="conv.draft" class="draft-tag">[{{ $t('草稿') }}]</span>
            <span v-if="conv.senderName && !conv.draft" class="sender-name">{{ conv.senderName }}:</span>
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
      {{ showArchive ? $t('暂无归档会话') : '暂时没有新的聊天会话' }}
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
  padding: 10px 16px;
  font-size: 13px;
  color: #3369fe;
  cursor: pointer;
  text-align: center;
  border-bottom: 1px solid #f1f0f0;

  &:hover { background: #f5f5f5; }
}

.archive-header {
  padding: 10px 16px;
  font-size: 13px;
  color: #3369fe;
  cursor: pointer;
  border-bottom: 1px solid #f1f0f0;

  &:hover { background: #f5f5f5; }
}

.conv-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 16px 0 63px;
  height: 59px;
  background-color: #fcfcfc;
  cursor: pointer;
  transition: background 0.1s;

  &:hover { background: #f9f9f9; }
  &.active { background: #efefef; }
  &.pinned { background: #ede7e7; }
  &.pinned.active { background: #efefef; }
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
  color: #999;
  line-height: 20px;
  gap: 2px;
}

.at-me {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.draft-tag {
  color: #da2e2e;
  font-size: 12px;
  flex-shrink: 0;
}

.sender-name {
  color: #aaa;
  font-size: 12px;
  flex-shrink: 0;
}

.conv-digest {
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
