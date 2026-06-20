<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { formatSystemNotificationDisplayParts } from '@/utils/systemNotificationDisplay'
import {
  getGroupNoticeGroupId,
  parseGroupNoticeExtraObject,
} from '@/utils/groupNoticeDisplay'
import {
  openNotificationModule,
  resolveNotificationModuleTargetFromMessage,
} from '@/utils/notificationNavigation'

const props = defineProps<{
  message: Message
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const groupStore = useGroupStore()
const warmedOwnerGroupIds = new Set<string>()

const parsedNotice = computed(() => {
  return formatSystemNotificationDisplayParts(props.message, {
    t,
    currentUid: String(authStore.uid || ''),
  })
})

const notificationActionTarget = computed(() => resolveNotificationModuleTargetFromMessage(props.message))

const inviteNoticeGroupId = computed(() => {
  const extra = parseGroupNoticeExtraObject(props.message.extra)
  const extraGroupId = getGroupNoticeGroupId(extra)
  if (extraGroupId) return extraGroupId
  const conversationId = String(props.message.conversationId || '')
  return conversationId.startsWith('1_') ? conversationId.slice(2) : ''
})

const hasGroupOwnerData = computed(() => {
  const groupId = inviteNoticeGroupId.value
  if (!groupId) return false
  if (groupStore.getGroup(groupId)?.ownerId) return true
  return groupStore.getMembers(groupId).some((member) => member.role === 0)
})

watch(
  () => ({
    groupId: inviteNoticeGroupId.value,
    ownerReady: hasGroupOwnerData.value,
    text: `${parsedNotice.value.prefix}${parsedNotice.value.text}`,
  }),
  ({ groupId, ownerReady, text }) => {
    if (!groupId || ownerReady || warmedOwnerGroupIds.has(groupId) || !authStore.uid) return
    if (!text.includes('邀请') || !text.includes('加入群聊')) return

    warmedOwnerGroupIds.add(groupId)
    // 刚加入群时群主/成员数据可能晚于消息到达；主动拉一次成员，让高亮不必等后台同步。
    void groupStore.loadMembers(String(authStore.uid), groupId, { forceRemote: true }).catch((error) => {
      console.warn('[SystemNotification] warm group owner failed:', error)
    })
  },
  { immediate: true },
)

function handleOpenNotificationModule() {
  const target = notificationActionTarget.value
  if (!target) return
  void openNotificationModule(target)
}
</script>

<template>
  <div v-if="parsedNotice.prefix || parsedNotice.text" class="system-notification">
    <span class="text">
      <strong
        v-if="parsedNotice.prefix"
        :class="{ highlight: parsedNotice.highlightPrefix }"
      >{{ parsedNotice.prefix }}</strong>{{ parsedNotice.text }}
    </span>
    <button
      v-if="notificationActionTarget"
      class="view-btn"
      type="button"
      @click.stop="handleOpenNotificationModule"
    >
      {{ t('查看') }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
.system-notification {
  text-align: center;
  padding: 10px 30px !important;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;

  .text {
    display: inline-block;
    max-width: 100%;
    font-size: 12px;
    color: rgba(91, 91, 91);
    line-height: normal;
    text-align: center;
    word-break: break-word;

    strong {
      font-size: 12px;
      font-weight: 600;
      color: #333;

      &.highlight {
        color: #3369fe;
      }
    }
  }

  .view-btn {
    flex-shrink: 0;
    border: 0;
    background: transparent;
    padding: 0;
    font-size: 12px;
    font-weight: 500;
    color: #178aff;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>
