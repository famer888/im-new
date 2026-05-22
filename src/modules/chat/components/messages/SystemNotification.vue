<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { formatSystemNotificationDisplayParts } from '@/utils/systemNotificationDisplay'

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
