<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{ groupId: string }>()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const group = computed(() => groupStore.getGroup(props.groupId))
const members = computed(() => groupStore.getMembers(props.groupId).slice(0, 12))

onMounted(() => {
  if (authStore.uid) groupStore.loadMembers(authStore.uid, props.groupId)
})

function startChat() {
  const conv = chatStore.ensureConversation(1, props.groupId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}
</script>

<template>
  <div class="group-detail" v-if="group">
    <div class="detail-header">
      <TextAvatar :name="group.name || group.id" :src="group.avatar" :size="64" />
      <div class="detail-name">{{ group.name || group.id }}</div>
      <div class="detail-count">{{ group.memberCount }} 位成员</div>
    </div>
    <div class="detail-members">
      <div class="members-header">群成员</div>
      <div class="members-grid">
        <div v-for="m in members" :key="m.userId" class="member-cell">
          <TextAvatar :name="m.nickname || m.userId" :size="40" />
          <span class="member-name">{{ m.nickname || m.userId }}</span>
        </div>
      </div>
    </div>
    <div v-if="group.notice" class="detail-section">
      <div class="section-label">群公告</div>
      <div class="section-content">{{ group.notice }}</div>
    </div>
    <div class="detail-actions">
      <button class="btn-chat" @click="startChat">发消息</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.group-detail { padding: 32px 24px; display: flex; flex-direction: column; align-items: center; }
.detail-header { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 20px; }
.detail-name { font-size: 18px; font-weight: 500; color: #333; }
.detail-count { font-size: 13px; color: #999; }

.detail-members { width: 100%; max-width: 360px; margin-bottom: 16px; }
.members-header { font-size: 13px; color: #999; margin-bottom: 8px; }
.members-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px;
}
.member-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  .member-name { font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 48px; text-align: center; }
}

.detail-section {
  width: 100%; max-width: 360px; margin-bottom: 16px;
  padding: 12px; background: #f5f5f5; border-radius: 4px;
}
.section-label { font-size: 12px; color: #999; margin-bottom: 6px; }
.section-content { font-size: 14px; color: #333; line-height: 1.5; }

.detail-actions { margin-top: 16px; }
.btn-chat {
  width: 200px; height: 40px; background: #3369fe; color: #fff;
  border: none; border-radius: 4px; font-size: 14px; cursor: pointer;
  &:hover { background: rgba(51, 105, 254, 0.8); }
}
</style>
