<template>
  <div class="gif-message">
    <img :src="gifUrl" alt="GIF" @load="onLoad" @error="onError" />
    <span v-if="!loaded" class="loading-text">GIF</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  content: string
  isSelf: boolean
}>()

const loaded = ref(false)

const gifUrl = computed(() => {
  try {
    const parsed = JSON.parse(props.content)
    return parsed.url || parsed.gif || props.content
  } catch {
    return props.content
  }
})

function onLoad() { loaded.value = true }
function onError() { loaded.value = true }
</script>

<style lang="scss" scoped>
.gif-message {
  position: relative;
  max-width: 200px;

  img {
    max-width: 100%;
    border-radius: 4px;
    display: block;
  }

  .loading-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 12px;
    color: #999;
  }
}
</style>
