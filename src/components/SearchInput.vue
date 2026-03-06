<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  debounce?: number
}>(), {
  placeholder: '搜索',
  debounce: 300,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'search', v: string): void
  (e: 'clear'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

function handleInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  emit('update:modelValue', val)

  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('search', val), props.debounce)
}

function handleClear() {
  emit('update:modelValue', '')
  emit('clear')
  inputRef.value?.focus()
}

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="search-input">
    <span class="search-icon">🔍</span>
    <input
      ref="inputRef"
      :value="modelValue"
      :placeholder="placeholder"
      @input="handleInput"
    />
    <button v-if="modelValue" class="clear-btn" @click="handleClear">×</button>
  </div>
</template>

<style lang="scss" scoped>
.search-input {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  background: #e0e0e0;
  border-radius: 4px;
  padding: 0 8px;
  margin: 0 12px;

  .search-icon { font-size: 12px; opacity: 0.5; }

  input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 12px;
    color: #333;
    &::placeholder { color: #999; }
  }

  .clear-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: #999;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    &:hover { color: #666; }
  }
}
</style>
