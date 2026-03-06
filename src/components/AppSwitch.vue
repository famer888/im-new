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
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: #dcdfe6;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;

  &.active { background: #3369fe; }
  &.disabled { opacity: 0.5; cursor: not-allowed; }
}

.switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);

  .active & { transform: translateX(18px); }
}
</style>
