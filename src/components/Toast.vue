<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = withDefaults(defineProps<{
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  visible: boolean
}>(), {
  type: 'info',
  duration: 2000,
})

const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

let hideTimer: ReturnType<typeof window.setTimeout> | null = null

function clearHideTimer() {
  if (!hideTimer) return
  window.clearTimeout(hideTimer)
  hideTimer = null
}

function scheduleHide() {
  clearHideTimer()
  if (!props.visible || props.duration <= 0) return

  // Toast 可能以 visible=true 的状态重新挂载；每次可见或文案变化都重置关闭计时。
  hideTimer = window.setTimeout(() => {
    hideTimer = null
    emit('update:visible', false)
  }, props.duration)
}

watch(() => [props.visible, props.message, props.duration] as const, scheduleHide, { immediate: true })

onBeforeUnmount(clearHideTimer)
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" class="toast-overlay" role="status" aria-live="polite">
        <div class="toast">
          <span class="toast-text">{{ message }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
/* 全屏 flex 居中，避免仅用 transform 时与动画冲突 */
.toast-overlay {
  position: fixed;
  inset: 0;
  z-index: 30000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  pointer-events: none;
}

.toast {
  max-width: min(90vw, 320px);
  padding: 12px 20px;
  border-radius: 14px;
  background: #4d4d4d;
  color: #ffffff;
  font-size: 14px;
  line-height: 1.45;
  text-align: center;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}

.toast-text {
  display: block;
  color: #ffffff;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease;
}

.toast-enter-active .toast,
.toast-leave-active .toast {
  transition: transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}

.toast-enter-from .toast,
.toast-leave-to .toast {
  transform: scale(0.96);
}
</style>
