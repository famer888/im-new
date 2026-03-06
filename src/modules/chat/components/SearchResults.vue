<script setup lang="ts">
import { computed } from 'vue'
import { useSearchStore } from '@/stores/useSearchStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const searchStore = useSearchStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

function selectContact(id: string) {
  chatStore.setCurrentConversation(`0_${id}`)
  uiStore.setDetailView('chat')
  searchStore.clearResults()
  uiStore.searchVisible = false
}

function selectGroup(id: string) {
  chatStore.setCurrentConversation(`1_${id}`)
  uiStore.setDetailView('chat')
  searchStore.clearResults()
  uiStore.searchVisible = false
}

function selectChannel(id: string) {
  chatStore.setCurrentConversation(`2_${id}`)
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
          <TextAvatar :name="g.name || g.id" :src="g.avatar" :size="32" />
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
          <TextAvatar :name="ch.name || ch.id" :src="ch.avatar" :size="32" />
          <span class="result-name">{{ ch.name || ch.id }}</span>
        </div>
      </div>
    </template>
    <div v-else-if="searchStore.keyword" class="no-results">无搜索结果</div>
  </div>
</template>

<style lang="scss" scoped>
.search-results { flex: 1; overflow-y: auto; }

.searching, .no-results {
  text-align: center; padding: 32px; color: #ccc; font-size: 13px;
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
