<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  fallback?: string
  lazy?: boolean
  previewable?: boolean
}>(), {
  alt: '',
  fallback: '',
  lazy: true,
  previewable: false,
})

const loaded = ref(false)
const error = ref(false)
const showPreview = ref(false)

function onLoad() {
  loaded.value = true
}

function onError() {
  error.value = true
}

function handleClick() {
  if (props.previewable) {
    showPreview.value = true
  }
}
</script>

<template>
  <div class="app-image" @click="handleClick">
    <div v-if="!loaded && !error" class="image-skeleton" />
    <img
      v-show="loaded && !error"
      :src="src"
      :alt="alt"
      :loading="lazy ? 'lazy' : 'eager'"
      @load="onLoad"
      @error="onError"
    />
    <div v-if="error" class="image-error">
      <span>图片加载失败</span>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPreview" class="image-preview-overlay" @click="showPreview = false">
          <img :src="src" :alt="alt" class="preview-img" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.app-image {
  display: inline-block;
  position: relative;

  img {
    max-width: 100%;
    display: block;
  }
}

.image-skeleton {
  width: 100%;
  min-width: 80px;
  min-height: 60px;
  background: #e8e8e8;
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

.image-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  min-height: 60px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 12px;
  color: #ccc;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;

  .preview-img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
