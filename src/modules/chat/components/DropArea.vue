<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ (e: 'drop-files', files: File[]): void }>()
const isDragging = ref(false)

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length > 0) {
    emit('drop-files', files)
  }
}
</script>

<template>
  <div
    class="drop-area"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <slot />
    <Transition name="fade">
      <div v-if="isDragging" class="drop-overlay">
        <div class="drop-hint">
          <span class="drop-icon">📎</span>
          <span>拖放文件到这里发送</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.drop-area {
  position: relative;
  width: 100%;
  height: 100%;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(64, 158, 255, 0.08);
  border: 2px dashed #3369fe;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #3369fe;
  font-size: 14px;
}

.drop-icon { font-size: 32px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
