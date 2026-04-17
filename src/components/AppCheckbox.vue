<script setup lang="ts">
import checkboxImg from '@/assets/images/message/checkBox.png'
import checkboxedImg from '@/assets/images/message/checkBoxed.png'

const props = withDefaults(defineProps<{
  modelValue: boolean
  label?: string
  disabled?: boolean
  size?: number | string
}>(), {
  size: 16
})

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

function toggle() {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>

<template>
  <label :class="['app-checkbox', { disabled }]" @click.prevent="toggle">
    <img
      :src="modelValue ? checkboxedImg : checkboxImg"
      class="checkbox-icon"
      :style="{ width: size + 'px', height: size + 'px' }"
    />
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

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.checkbox-icon {
  display: block;
}

.checkbox-label {
  font-size: 13px;
  color: #333;
}
</style>
