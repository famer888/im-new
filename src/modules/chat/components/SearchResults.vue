<script setup lang="ts">
import { computed } from 'vue'
import { useSearchStore } from '@/stores/useSearchStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'
import emptyIcon from '@/assets/images/common/empty-icon.png'

const props = defineProps<{
  keyword: string
}>()

const searchStore = useSearchStore()
const chatStore = useChatStore()
const uiStore = useUIStore()
const hasInputKeyword = computed(() => props.keyword.trim().length > 0)

function selectContact(id: string) {
  const conv = chatStore.ensureConversation(0, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('chat')
  searchStore.clearResults()
  uiStore.searchVisible = false
}

function selectGroup(id: string) {
  const conv = chatStore.ensureConversation(1, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('chat')
  searchStore.clearResults()
  uiStore.searchVisible = false
}

function selectChannel(id: string) {
  const conv = chatStore.ensureConversation(2, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('chat')
  searchStore.clearResults()
  uiStore.searchVisible = false
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

.result-name { font-size: 13px; color: #333; }
</style>
