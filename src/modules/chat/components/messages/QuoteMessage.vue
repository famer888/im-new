<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'

const props = defineProps<{ message: Message }>()
const authStore = useAuthStore()
const contactStore = useContactStore()
const isSelf = computed(() => props.message.senderId === authStore.uid)

const quoteData = computed(() => {
  try {
    const data = JSON.parse(props.message.extra ?? '{}')
    return { quoteSenderId: data.quoteSenderId, quoteContent: data.quoteContent, text: props.message.content }
  } catch { return { quoteSenderId: '', quoteContent: '', text: props.message.content } }
})

const quoteSenderName = computed(() =>
  contactStore.getDisplayName(quoteData.value.quoteSenderId ?? ''),
)
</script>

<template>
  <div :class="['quote-message', { self: isSelf }]">
    <div class="bubble">
      <div class="quote-block">
        <span class="quote-sender">{{ quoteSenderName }}：</span>
        <span class="quote-text">{{ quoteData.quoteContent }}</span>
      </div>
      <div class="main-text">{{ quoteData.text }}</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.quote-message {
  .bubble {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 4px;
    background: #fff;
    max-width: 100%;
  }

  &.self .bubble { background: #95ec69; }
}

.quote-block {
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 3px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #999;
  border-left: 2px solid #c0c4cc;

  .quote-sender { font-weight: 500; }
}

.main-text {
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  word-break: break-all;
}
</style>
