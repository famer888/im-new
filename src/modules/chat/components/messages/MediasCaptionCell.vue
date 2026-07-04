<script setup lang="ts">
import type { Message } from '@/stores/useMessageStore'
import ImageMessage from './ImageMessage.vue'

defineProps<{
  item: Message
  acquireDownloadSlot: () => Promise<() => void>
}>()
</script>

<template>
  <ImageMessage
    :message="item"
    :acquire-download-slot="acquireDownloadSlot"
  />
</template>
