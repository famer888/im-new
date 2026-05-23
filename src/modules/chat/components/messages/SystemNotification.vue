<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { formatSystemNotificationDisplayParts } from '@/utils/systemNotificationDisplay'
import {
  openNotificationModule,
  resolveNotificationModuleTargetFromMessage,
} from '@/utils/notificationNavigation'

const props = defineProps<{
  message: Message
}>()

const { t } = useI18n()
const authStore = useAuthStore()

const parsedNotice = computed(() => {
  return formatSystemNotificationDisplayParts(props.message, {
    t,
    currentUid: String(authStore.uid || ''),
  })
})

const notificationActionTarget = computed(() => resolveNotificationModuleTargetFromMessage(props.message))

function handleOpenNotificationModule() {
  const target = notificationActionTarget.value
  if (!target) return
  void openNotificationModule(target)
}
</script>

<template>
  <div v-if="parsedNotice.prefix || parsedNotice.text" class="system-notification">
    <span class="text">
      <strong v-if="parsedNotice.prefix">{{ parsedNotice.prefix }}</strong>{{ parsedNotice.text }}
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
