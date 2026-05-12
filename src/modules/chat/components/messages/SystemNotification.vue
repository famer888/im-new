<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'

const props = defineProps<{
  message: Message
}>()

const { t } = useI18n()

function translateNoticeText(text: string): string {
  const translated = t(text)
  return translated === text ? text : translated
}

const parsedNotice = computed(() => {
  const content = props.message.content || ''
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
  <div class="system-notification">
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
