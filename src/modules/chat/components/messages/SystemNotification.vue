<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useGroupStore } from '@/stores/useGroupStore'
import {
  formatGroupNoticeDisplayText,
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
  parseGroupNoticeExtraObject,
} from '@/utils/groupNoticeDisplay'
import { translateGroupNoticeText } from '@/utils/groupNoticeI18n'

const props = defineProps<{
  message: Message
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const groupStore = useGroupStore()
const HIDDEN_GROUP_NOTICE_TEXT = '群聊事件'

function translateNoticeText(text: string): string {
  const translatedGroupNotice = translateGroupNoticeText(text, t)
  if (translatedGroupNotice !== text) return translatedGroupNotice
  const translated = t(text)
  return translated === text ? text : translated
}

const parsedNotice = computed(() => {
  const extra = parseGroupNoticeExtraObject(props.message.extra)
  const groupId = getGroupNoticeGroupId(extra)
  const actorId = getGroupNoticeActorId(extra)
  const contextMembers = groupId ? groupStore.getMembers(groupId) : []
  const actorRole = groupId && actorId
    ? contextMembers.find((member) => member.userId === actorId)?.role
    : null
  const content = formatGroupNoticeDisplayText(props.message.content || '', extra, {
    currentUid: authStore.uid,
    actorRole,
    contextMembers,
  })
  if (content === HIDDEN_GROUP_NOTICE_TEXT) {
    return { prefix: '', text: '' }
  }
  if (!content.startsWith('!@#')) {
    return { prefix: '', text: translateNoticeText(content) }
  }

  const endIndex = content.lastIndexOf('!@#')
  if (endIndex <= 0) {
    return { prefix: '', text: translateNoticeText(content) }
  }

  return {
    prefix: content.slice(3, endIndex),
    text: translateNoticeText(content.slice(endIndex + 3)),
  }
})
</script>

<template>
  <div v-if="parsedNotice.prefix || parsedNotice.text" class="system-notification">
    <span class="text">
      <strong v-if="parsedNotice.prefix">{{ parsedNotice.prefix }}</strong>{{ parsedNotice.text }}
    </span>
  </div>
</template>

<style lang="scss" scoped>
.system-notification {
  text-align: center;
  padding: 10px 30px !important;
  position: relative;

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
    }
  }
}
</style>
