<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

function toggle() {
  if (!props.disabled) emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div :class="['app-switch', { active: modelValue, disabled }]" @click="toggle">
    <div class="switch-thumb" />
  </div>
</template>

<style lang="scss" scoped>
.app-switch {
  display: flex;
  align-items: center;
  width: 32px;
  height: 16px;
  border-radius: 1000px;
  background: #dcdfe6;
  cursor: pointer;
  position: relative;
  transition: 0.3s ease-out;

  &.active { background: #3369fe; }
  &.disabled { opacity: 0.5; cursor: not-allowed; }
}

.switch-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: 0.3s ease-out;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);

  .active & { transform: translateX(16px); }
}
</style>
