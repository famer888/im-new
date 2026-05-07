<template>
  <div class="red-packet-unsupported">
    {{ t('暂不支持该消息类型') }}
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'

const { t } = useI18n()

defineProps<{
  message: Message
}>()
</script>

<style lang="scss" scoped>
.red-packet-unsupported {
  display: inline-block;
  padding: 12px 22px 16px;
  background: rgba(218, 46, 46, 0.1);
  border-radius: 5px;
  color: #333;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
}
</style>
