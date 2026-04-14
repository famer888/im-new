<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{ groupId: string }>()
const { t } = useI18n()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const group = computed(() => groupStore.getGroup(props.groupId))

/** 与老项目 im/details/group.vue 一致：按 type 升序，截取前 8 人展示 */
const previewMembers = computed(() => {
  const list = [...groupStore.getMembers(props.groupId)]
  list.sort((a, b) => a.role - b.role)
  return list.slice(0, 8)
})

watch(
  () => props.groupId,
  (groupId) => {
    if (!groupId || !authStore.uid) return
    groupStore.loadMembers(authStore.uid, groupId)
  },
  { immediate: true },
)

function startChat() {
  const conv = chatStore.ensureConversation(1, props.groupId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}
</script>

<template>
  <div class="communication-page">
    <div v-if="group" class="communication-page-box">
      <div class="user-info">
        <TextAvatar
          class="avatar"
          :name="group.name || group.id"
          :src="group.avatar"
          avatar-type="group"
          :size="60"
          rounded
        />
        <div>
          <div class="name">{{ group.name || group.id }}</div>
          <div class="count">
            {{ t('群成员共{value}人', { value: group.memberCount }) }}
          </div>
        </div>
      </div>

      <div class="user-des">
        <div class="memberList">
        <div
          v-for="m in previewMembers"
          :key="m.userId"
          class="member-item"
        >
          <TextAvatar
            :name="m.nickname || m.userId"
            :src="m.avatar"
            :size="35"
            rounded
          />
          <div class="nick-name" :title="m.nickname || m.userId">
            {{ m.nickname || m.userId }}
          </div>
          <div
            v-if="m.role === 0"
            class="member-identity member-master"
          >
            {{ t('群主') }}
          </div>
          <div
            v-else-if="m.role === 1"
            class="member-identity"
          >
            {{ t('管理员') }}
          </div>
        </div>
      </div>
      </div>

      <div class="primaryBtn small" @click="startChat">
        {{ t('发送消息') }}
      </div>
    </div>
    <div v-else class="empty-hint">群资料暂不可用</div>
  </div>
</template>

<style lang="scss" scoped>
/* 布局对齐老项目 im/src/pages/home/details/group.vue，头图区按设计稿居中 */
.communication-page {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
}

.communication-page-box {
  padding: 80px 40px;
}

.user-info {
  padding: 0 0 20px;
  border-bottom: 1px solid #eee;
  display: block;
  .name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  user-select: text;
}

.count {
  margin-top: 5px;
  color: #999;
}
  .avatar {
    margin-right: 20px;
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 50%;
    display: block;
    margin-bottom: 12px;
  }
}

.user-des {
  padding: 20px 0 40px;
  .memberList {
    min-height: 77px;
    display: flex;
    flex-wrap: wrap;
    .member-item {
      margin-right: 10px;
      text-align: center;
      width: 50px;
      cursor: pointer;
      .nick-name {
        margin-top: 6px;
        font-size: 12px;
        line-height: 12px;
        color: #333;
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: text;
      }
    }
  }
}


.member-identity {
  font-size: 12px;
  color: #fff;
  padding: 2px 6px;
  border-radius: 99px;
  background: #fb9203;
  margin-top: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}

.member-master {
  background: #3369fe;
}

.primaryBtn {
  color: #fff;
  background-color: #3369fe;
  text-align: center;
  border: 1px solid #3369fe;
  cursor: pointer;
  padding: 0 28px;
  display: inline-block;
  height: 32px;
  line-height: 32px;
  font-size: 12px;
  border-radius: 4px;

  &.small {
    margin-top: 0;
  }

  &:hover {
    background-color: rgba(51, 105, 254, 0.9);
  }
}

.empty-hint {
  padding: 80px 40px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
