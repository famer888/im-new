<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'
import jtIcon from '@/assets/images/headNav/jt-icon.png'

const { t } = useI18n()
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
      {{ t('群组') }}
      <img class="arrow" :src="jtIcon" :style="expanded ? {} : { transform: 'rotate(180deg)' }" alt="toggle" />
    </h2>
    <div
      v-if="expanded"
      v-for="group in groupStore.groups"
      :key="group.id"
      :class="['group-item', { active: uiStore.detailView === 'group-detail' && chatStore.currentConversation?.type === 1 && chatStore.currentConversation?.targetId === group.id }]"
      @click="handleSelect(group)"
    >
      <TextAvatar class="group-avatar" :name="group.name || group.id" :src="group.avatar" avatar-type="group" :size="35" />
      <h3 class="group-name">{{ (group.name || group.id).replaceAll('🪵', '?') }}</h3>
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
  font-weight: normal;
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
  position: relative;
  padding: 0 16px 0 63px;
  display: flex;
  align-items: center;
  width: 100%;
  background-color: #fcfcfc;
  height: 59px;
  box-sizing: border-box;
  cursor: pointer;

  &:hover { background: #f9f9f9; }
  &.active { background: #efefef; }
}

.group-avatar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.group-name {
  margin: 0;
  width: 120px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}
</style>
