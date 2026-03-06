<script setup lang="ts">
import { ref, watch } from 'vue'

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

watch(() => props.visible, (v) => {
  if (v && props.duration > 0) {
    setTimeout(() => emit('update:visible', false), props.duration)
  }
})

const iconMap: Record<string, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" :class="['toast', `toast--${type}`]">
        <span class="toast-icon">{{ iconMap[type] }}</span>
        <span class="toast-text">{{ message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;

  &--info { background: rgba(51, 105, 254, 0.08); color: #3369fe; }
  &--success { background: #f0f9eb; color: #67c23a; }
  &--warning { background: #fdf6ec; color: #e6a23c; }
  &--error { background: #fddcde; color: #f44e5a; }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
