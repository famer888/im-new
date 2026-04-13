<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'
import jtIcon from '@/assets/images/headNav/jt-icon.png'

const groupStore = useGroupStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()
const expanded = ref(true)

onMounted(() => {
  if (authStore.uid) groupStore.loadGroups(authStore.uid)
})

function handleSelect(group: typeof groupStore.groups[0]) {
  const conv = chatStore.ensureConversation(1, group.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('group-detail')
}
</script>

<template>
  <div class="group-list">
    <h2 class="section-title" @click="expanded = !expanded">
      群组
      <img class="arrow" :src="jtIcon" :style="expanded ? {} : { transform: 'rotate(180deg)' }" alt="toggle" />
    </h2>
    <div
      v-if="expanded"
      v-for="group in groupStore.groups"
      :key="group.id"
      class="group-item"
      @click="handleSelect(group)"
    >
      <TextAvatar :name="group.name || group.id" :src="group.avatar" :size="36" />
      <div class="group-info">
        <span class="group-name">{{ group.name || group.id }}</span>
        <span class="group-count">{{ group.memberCount }} 人</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* Old group list styles (kept for rollback)
.group-list { padding: 4px 0; }
*/

.group-list { padding: 0; }

.section-title {
  position: relative;
  margin: 0;
  padding-left: 20px;
  height: 26px;
  line-height: 26px;
  font-size: 14px;
  color: #333;
  font-weight: 600;
  cursor: pointer;
}

.arrow {
  position: absolute;
  width: 12px;
  right: 16px;
  top: 7px;
  transition: 0.3s all;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  &:hover { background: #e0e0e0; }
}

.group-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.group-name { font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-count { font-size: 12px; color: #999; }
</style>
