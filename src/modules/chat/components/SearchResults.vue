<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { useSearchStore } from '@/stores/useSearchStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import type { Message } from '@/stores/useMessageStore'
import TextAvatar from '@/components/TextAvatar.vue'
import emptyIcon from '@/assets/images/common/empty-icon.png'

const props = defineProps<{
  keyword: string
}>()

const searchStore = useSearchStore()
const chatStore = useChatStore()
const uiStore = useUIStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const hasInputKeyword = computed(() => props.keyword.trim().length > 0)

function parseConversationRef(conversationId: string): { type: number; targetId: string } {
  const i = conversationId.indexOf('_')
  if (i <= 0) return { type: 0, targetId: conversationId }
  const type = Number(conversationId.slice(0, i))
  return {
    type: Number.isFinite(type) ? type : 0,
    targetId: conversationId.slice(i + 1),
  }
}

function convLabelForMessage(m: Message): string {
  const { type, targetId } = parseConversationRef(m.conversationId)
  if (type === 1) return groupStore.getGroup(targetId)?.name ?? targetId
  if (type === 2) return channelStore.getChannel(targetId)?.name ?? targetId
  return contactStore.getDisplayName(targetId)
}

function avatarPropsForMessage(m: Message): {
  name: string
  src: string | null
  avatarType: 'friend' | 'group' | 'channel'
} {
  const { type, targetId } = parseConversationRef(m.conversationId)
  if (type === 1) {
    const g = groupStore.getGroup(targetId)
    return { name: g?.name ?? targetId, src: g?.avatar ?? null, avatarType: 'group' }
  }
  if (type === 2) {
    const ch = channelStore.getChannel(targetId)
    return { name: ch?.name ?? targetId, src: ch?.avatar ?? null, avatarType: 'channel' }
  }
  const c = contactStore.getContact(targetId)
  return {
    name: contactStore.getDisplayName(targetId),
    src: c?.avatar ?? null,
    avatarType: 'friend',
  }
}

function previewContent(m: Message): string {
  if (m.msgType === 1) return '[图片]'
  if (m.msgType === 2) return '[语音]'
  if (m.msgType === 3) return '[视频]'
  if (m.msgType === 7) return '[文件]'
  return (m.content || '').trim().replace(/\s+/g, ' ').slice(0, 80)
}

function formatMsgTime(ts: number): string {
  if (!ts) return ''
  const d = dayjs(ts)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('HH:mm')
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天'
  return d.format('MM/DD')
}

function clearSearchUi() {
  searchStore.clearResults()
  uiStore.searchVisible = false
}

function selectContact(id: string) {
  const conv = chatStore.ensureConversation(0, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  clearSearchUi()
}

function selectGroup(id: string) {
  const conv = chatStore.ensureConversation(1, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  clearSearchUi()
}

function selectChannel(id: string) {
  const conv = chatStore.ensureConversation(2, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  clearSearchUi()
}

/**
 * 与 im `searchs.vue` `linkTo` 一致：切会话 + `chatMsgListSearchScrollTo`（此处走 Pinia 请求 MessageList 滚动）。
 */
function selectMessage(m: Message) {
  const { type, targetId } = parseConversationRef(m.conversationId)
  const conv = chatStore.ensureConversation(type, targetId)
  const convName = convLabelForMessage(m)
  const av = avatarPropsForMessage(m)
  searchStore.requestChatMsgListSearchScrollTo(
    searchStore.buildScrollPayloadFromMessage(m, convName, av.src ?? undefined),
  )
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
  clearSearchUi()
}
</script>

<template>
  <div class="search-results">
    <div v-if="searchStore.isSearching" class="searching">搜索中...</div>
    <template v-else-if="searchStore.hasResults">
      <div v-if="searchStore.results.contacts.length > 0" class="result-section">
        <div class="section-title">联系人</div>
        <div
          v-for="c in searchStore.results.contacts"
          :key="c.id"
          class="result-item"
          @click="selectContact(c.id)"
        >
          <TextAvatar :name="c.nickname || c.id" :src="c.avatar" :size="32" />
          <span class="result-name">{{ c.remark || c.nickname || c.id }}</span>
        </div>
      </div>
      <div v-if="searchStore.results.groups.length > 0" class="result-section">
        <div class="section-title">群组</div>
        <div
          v-for="g in searchStore.results.groups"
          :key="g.id"
          class="result-item"
          @click="selectGroup(g.id)"
        >
          <TextAvatar :name="g.name || g.id" :src="g.avatar" avatar-type="group" :size="32" />
          <span class="result-name">{{ g.name || g.id }}</span>
        </div>
      </div>
      <div v-if="searchStore.results.channels.length > 0" class="result-section">
        <div class="section-title">频道</div>
        <div
          v-for="ch in searchStore.results.channels"
          :key="ch.id"
          class="result-item"
          @click="selectChannel(ch.id)"
        >
          <TextAvatar :name="ch.name || ch.id" :src="ch.avatar" avatar-type="channel" :size="32" />
          <span class="result-name">{{ ch.name || ch.id }}</span>
        </div>
      </div>
      <div v-if="searchStore.results.messages.length > 0" class="result-section">
        <div class="section-title">消息</div>
        <div
          v-for="m in searchStore.results.messages"
          :key="`${m.conversationId}-${m.id}`"
          class="result-item message-result"
          @click="selectMessage(m)"
        >
          <TextAvatar
            v-bind="avatarPropsForMessage(m)"
            :size="32"
          />
          <div class="message-result-body">
            <div class="message-result-top">
              <span class="result-name">{{ convLabelForMessage(m) }}</span>
              <span class="msg-time">{{ formatMsgTime(m.sendTime) }}</span>
            </div>
            <div class="msg-preview">{{ previewContent(m) }}</div>
          </div>
        </div>
      </div>
    </template>
    <div v-else-if="hasInputKeyword" class="no-results">
      <img :src="emptyIcon" alt="empty" />
      <span>暂无数据</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.search-results {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.searching {
  text-align: center;
  padding: 32px;
  color: #333;
  font-size: 13px;
}

.no-results {
  position: absolute;
  top: 30%;
  left: 0px;
  transform: translateY(-50%);
  color: #333;
  text-align: left;
  width: 100%;

  > img {
    display: block;
    width: 30%;
    margin: 0 auto 0;
  }

  > span {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    line-height: 18px;
    width: 100%;
    text-align: center;
    font-weight: 500;
  }
}

.result-section { margin-bottom: 4px; }

.section-title {
  padding: 6px 16px; font-size: 12px; color: #999; background: #f2f2f2;
}

.result-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; cursor: pointer;
  &:hover { background: #e0e0e0; }
}

.result-item.message-result {
  align-items: flex-start;
}

.message-result-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-result-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.msg-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #999;
}

.msg-preview {
  font-size: 12px;
  color: #787878;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-name { font-size: 13px; color: #333; }
</style>
