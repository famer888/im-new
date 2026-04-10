<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useContactStore } from '@/stores/useContactStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const contactStore = useContactStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

onMounted(() => {
  if (authStore.uid) contactStore.loadContacts(authStore.uid)
})

interface GroupedContacts {
  letter: string
  items: typeof contactStore.contacts
}

const grouped = computed((): GroupedContacts[] => {
  const map = new Map<string, typeof contactStore.contacts>()
  for (const c of contactStore.contacts) {
    const letter = (c.pinyin?.[0] ?? '#').toUpperCase()
    const key = /^[A-Z]$/.test(letter) ? letter : '#'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))
    .map(([letter, items]) => ({ letter, items }))
})

function handleSelect(contact: typeof contactStore.contacts[0]) {
  const convId = `0_${contact.id}`
  chatStore.setCurrentConversation(convId)
  uiStore.setDetailView('friend-detail')
}
</script>

<template>
  <div class="friend-list">
    <!-- Old friend actions UI (kept for rollback)
    <div class="friend-actions">
      <button class="action-btn" @click="uiStore.addContactVisible = true">
        <span>➕</span> 添加好友
      </button>
      <button class="action-btn" @click="uiStore.setDetailView('friend-examine')">
        <span>📋</span> 好友验证
      </button>
    </div>
    -->

    <h2 class="section-title">联系人</h2>
    <div v-for="group in grouped" :key="group.letter" class="friend-group">
      <div class="group-letter">{{ group.letter }}</div>
      <div
        v-for="contact in group.items"
        :key="contact.id"
        class="friend-item"
        @click="handleSelect(contact)"
      >
        <TextAvatar :name="contact.nickname || contact.id" :src="contact.avatar" :size="36" />
        <div class="friend-info">
          <span class="friend-name">{{ contact.remark || contact.nickname || contact.id }}</span>
        </div>
      </div>
    </div>
    <div class="contact-count">{{ contactStore.contacts.length }} 位联系人</div>
  </div>
</template>

<style lang="scss" scoped>
/* Old friend list styles (kept for rollback)
.friend-list { padding: 4px 0; }
*/

.friend-list { padding: 0; }

.section-title {
  margin: 0;
  padding-left: 20px;
  height: 26px;
  line-height: 26px;
  font-size: 14px;
  color: #333;
  font-weight: 600;
}

.group-letter {
  padding: 0 16px 0 20px;
  height: 40px;
  line-height: 40px;
  font-size: 14px;
  color: #333;
  border-top: 1px solid #eee;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  &:hover { background: #e0e0e0; }
}

.friend-name {
  font-size: 14px;
  color: #333;
}

.contact-count {
  line-height: 38px;
  text-align: center;
  font-size: 14px;
  color: #333;
  font-weight: 500;
  border-top: 1px solid #eee;
  margin-bottom: 50px;
}
</style>
