<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { getGroupDetail } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import { eventBus } from '@/utils/eventBus'

const props = defineProps<{ groupId: string }>()
const { t } = useI18n()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const group = computed(() => groupStore.getGroup(props.groupId))

/** 与老项目 im/details/group.vue 一致：store 已按 role 排序，截取前 8 人展示 */
const previewMembers = computed(() => groupStore.getMembers(props.groupId).slice(0, 8))
const displayedMemberCount = computed(() => group.value?.memberCount || previewMembers.value.length)

watch(
  () => props.groupId,
  (groupId) => {
    if (!groupId || !authStore.uid) return
    void groupStore.loadMembers(authStore.uid, groupId, { previewOnly: true })
    void refreshGroupDetail(groupId)
  },
  { immediate: true },
)

async function handleInvalidGroup(groupId: string) {
  const normalizedId = String(groupId || '').trim()
  if (!normalizedId) return
  const conversationId = `1_${normalizedId}`
  // 无效群要同时退出详情视图并清掉当前会话，避免页面继续停留在“资料不可用”状态。
  if (uiStore.detailView === 'group-detail') {
    uiStore.setDetailView('none')
  }
  if (chatStore.currentConversation?.id === conversationId) {
    chatStore.setCurrentConversation(null)
  }
  groupStore.removeGroup(normalizedId)
  if (authStore.uid) {
    await chatStore.deleteConversation(authStore.uid, conversationId).catch(() => undefined)
  }
}

async function refreshGroupDetail(groupId: string): Promise<boolean> {
  try {
    const detail = await getGroupDetail({ groupId })
    const detailCode = Number((detail as any)?.commonResult?.errCode ?? 200)
    const groupBase = (detail as any)?.group
    // 详情接口失败或无群对象时，按无效群处理并从列表移除，避免继续进入空群会话。
    if ((detailCode !== 0 && detailCode !== 200) || !groupBase) {
      await handleInvalidGroup(groupId)
      return false
    }
    // 详情接口比本地缓存更新；打开群资料时回填名称和人数，避免缺失时显示数字 ID 或 0 人。
    groupStore.upsertGroup({
      id: groupId,
      name: groupBase.name ?? groupBase.groupName,
      avatar: groupBase.pic ?? groupBase.avatar ?? groupBase.groupAvatar,
      ownerId: groupBase.hostId ? String(groupBase.hostId) : undefined,
      memberCount: Number(groupBase.memberCount ?? 0),
      groupAliasName: groupBase.groupAliasName ?? null,
    })
    return true
  } catch (error) {
    console.error('[GroupDetail] refresh group detail failed:', error)
    return false
  }
}

async function startChat() {
  const available = await refreshGroupDetail(props.groupId)
  if (!available) {
    eventBus.emit('show-toast', { message: t('该群聊已解散'), type: 'error' })
    return
  }
  const conv = chatStore.ensureConversation(1, props.groupId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}

function handleMemberClick(member: GroupMember) {
  const candidateIds = previewMembers.value.map((m) => m.userId)
  uiStore.openMemberInfo(member.userId, props.groupId, candidateIds)
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
            {{ t('群成员共{value}人', { value: displayedMemberCount }) }}
          </div>
        </div>
      </div>

      <div class="user-des">
        <div class="memberList">
        <div
          v-for="m in previewMembers"
          :key="m.userId"
          class="member-item"
          @click="handleMemberClick(m)"
        >
          <TextAvatar
            :name="m.nickname || m.userId"
            :src="m.avatar"
            avatar-type="friend"
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
