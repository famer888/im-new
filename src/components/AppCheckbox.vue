<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

function toggle() {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>

<template>
  <label :class="['app-checkbox', { checked: modelValue, disabled }]" @click.prevent="toggle">
    <span class="checkbox-box">
      <span v-if="modelValue" class="checkbox-check">✓</span>
    </span>
    <span v-if="label" class="checkbox-label">{{ label }}</span>
  </label>
</template>

<style lang="scss" scoped>
.app-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;

  &.disabled { opacity: 0.5; cursor: not-allowed; }
}

.checkbox-box {
  width: 16px;
  height: 16px;
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  .checked & {
    background: #3369fe;
    border-color: #3369fe;
  }
}

.checkbox-check {
  color: #fff;
  font-size: 11px;
  line-height: 1;
}

.checkbox-label {
  font-size: 13px;
  color: #333;
}
</style>
