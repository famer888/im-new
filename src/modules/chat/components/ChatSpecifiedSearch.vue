<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { useSearchStore } from '@/stores/useSearchStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import type { Message } from '@/stores/useMessageStore'
import TextAvatar from '@/components/TextAvatar.vue'
/** 与 im `@/assets/images/common/search-*.png` 一致 */
import searchDataImg from '@/assets/images/common/search-data.png'
import searchNoDataImg from '@/assets/images/common/search-no-data.png'

const props = defineProps<{
  searchText: string
}>()

const searchStore = useSearchStore()
const authStore = useAuthStore()
const contactStore = useContactStore()

const info = computed(() => searchStore.searchSpecifiedChatInfo)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 与 im `highlightSearchHtml(content, searchText, 'highlight')` 效果一致 */
function highlightHtml(content: string, q: string): string {
  const raw = (content || '').trim().replace(/\s+/g, ' ')
  if (!q.trim()) return escapeHtml(raw)
  const esc = escapeHtml(raw)
  try {
    const re = new RegExp(`(${escapeRegExp(q.trim())})`, 'gi')
    return esc.replace(re, '<span class="search-hit">$1</span>')
  } catch {
    return esc
  }
}

function previewContent(m: Message): string {
  if (m.msgType === 1) return '[图片]'
  if (m.msgType === 2) return '[语音]'
  if (m.msgType === 3) return '[视频]'
  if (m.msgType === 7) return '[文件]'
  return (m.content || '').trim().replace(/\s+/g, ' ')
}

function formatMsgTime(ts: number): string {
  if (!ts) return ''
  return dayjs(ts).format('HH:mm')
}

function avatarForSender(m: Message): { name: string; src: string | null } {
  if (m.senderId === authStore.uid) {
    const self = contactStore.getContact(authStore.uid || '')
    return {
      name: self?.nickname || '我',
      src: self?.avatar ?? null,
    }
  }
  return {
    name: contactStore.getDisplayName(m.senderId),
    src: contactStore.getContact(m.senderId)?.avatar ?? null,
  }
}

/**
 * 与 im `search-specified-chat.vue` `linkTo` 一致 → `chatMsgListSearchScrollTo`
 */
function linkTo(m: Message) {
  const base = info.value
  if (!base) return
  searchStore.requestChatMsgListSearchScrollTo({
    id: base.id,
    type: base.type,
    pic: base.pic,
    name: base.name,
    searchMsgInfo: null,
    customMsgId: m.customMsgId,
    sendTime: m.sendTime,
    comType: 'chat',
    conversationId: m.conversationId,
    messageId: m.id,
  })
}
</script>

<template>
  <div class="search-specified-chat">
    <div class="head-spec">
      <div class="title">搜索消息的范围</div>
      <div v-if="info" class="chat-info">
        <TextAvatar
          class="img-head"
          :name="info.name || info.id"
          :src="info.pic || null"
          :avatar-type="info.type === 'group' ? 'group' : info.type === 'channel' ? 'channel' : 'friend'"
          :size="24"
        />
        <span class="name nowrap">{{ info.name }}</span>
      </div>
      <div class="title">找到{{ searchStore.chatSearchResults.length || 0 }}条消息</div>
    </div>

    <ul
      v-if="searchText.trim() && searchStore.chatSearchResults.length > 0"
      class="msg-list-box"
    >
      <li
        v-for="(item, index) in searchStore.chatSearchResults"
        :key="'searchMsg' + index"
        class="msg-list-item"
        @click="linkTo(item)"
      >
        <TextAvatar
          class="img-head"
          v-bind="avatarForSender(item)"
          :size="40"
        />
        <div class="info">
          <span class="name nowrap">{{ avatarForSender(item).name }}</span>
          <div
            v-if="previewContent(item)"
            class="msg nowrap"
            v-html="highlightHtml(previewContent(item), searchText)"
          />
        </div>
        <span class="time">{{ formatMsgTime(item.sendTime) }}</span>
      </li>
    </ul>

    <!-- 与 im `search-specified-chat.vue`：无关键字 / 无结果 两套插图 -->
    <div v-if="!searchText.trim()" class="search-tip">
      <img class="icon-tip" :src="searchDataImg" alt="" />
      <span class="tip-msg">搜索消息</span>
    </div>
    <div v-else-if="searchText.trim() && searchStore.chatSearchResults.length === 0" class="search-tip">
      <img class="icon-tip" :src="searchNoDataImg" alt="" />
      <span class="tip-msg">搜索无结果</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.search-specified-chat {
  position: relative;
  overflow-y: auto;
  height: 100%;
}

.head-spec {
  width: 100%;

  .title {
    width: 100%;
    font-size: 12px;
    color: #5c6873;
    padding: 6px 20px;
    background: #eff0f4;
  }

  .chat-info {
    display: flex;
    align-items: center;
    padding: 10px;

    .img-head {
      border-radius: 99px;
    }

    .name {
      margin-left: 10px;
      font-size: 12px;
      color: #000;
    }
  }
}

.msg-list-box {
  width: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
}

.msg-list-item {
  display: flex;
  align-items: center;
  padding: 10px;
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
  cursor: pointer;

  &:hover {
    background: #e8e8e8;
  }

  .img-head {
    border-radius: 99px;
    flex-shrink: 0;
  }

  .info {
    flex: 1;
    padding: 0 10px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .name {
    font-size: 14px;
    color: #000;
  }

  .msg {
    font-size: 12px;
    color: #b9babe;

    :deep(.search-hit) {
      font-size: 12px;
      color: #178aff;
    }
  }

  .time {
    font-size: 12px;
    color: #b9babe;
    flex-shrink: 0;
  }
}

.search-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 100%;
  margin-top: 20px;

  .icon-tip {
    display: block;
    width: 30%;
    max-width: 220px;
    min-width: 120px;
    height: auto;
    margin: 0 auto;
    object-fit: contain;
  }

  .tip-msg {
    margin-top: 12px;
    font-size: 13px;
    color: #999;
    text-align: center;
  }
}

.nowrap {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
</style>
