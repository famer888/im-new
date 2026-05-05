<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import searchIcon from '@/assets/images/headNav/search-icon.png'
import searchCloseIcon from '@/assets/images/headNav/search-close-icon.png'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  debounce?: number
}>(), {
  placeholder: '',
  debounce: 300,
})

const { t } = useI18n()
const effectivePlaceholder = computed(() => props.placeholder || t('搜索'))

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
    <img class="search-icon" :src="searchIcon" alt="search" />
    <input
      ref="inputRef"
      :value="modelValue"
      :placeholder="effectivePlaceholder"
      @input="handleInput"
    />
    <img
      v-if="modelValue"
      class="clear-btn"
      :src="searchCloseIcon"
      alt="clear"
      @click="handleClear"
    />
  </div>
</template>

<style lang="scss" scoped>
.search-input {
  display: flex;
  align-items: center;
  flex: 1;
  width: 100%;
  height: 26px;
  line-height: 26px;
  background-color: rgb(243, 243, 243);
  border-radius: 4px;
  padding: 0 8px;
  position: relative;
  font-size: 12px;

  .search-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    padding: 0 5px;
    height: 26px;
    line-height: 26px;
    background-color: #f3f3f3 !important;
    border: none;
    outline: none;
    font-size: 12px;
    color: #333;
    &::placeholder {
      color: #999;
      font-size: 12px;
    }
  }

  .clear-btn {
    position: absolute;
    right: 4px;
    width: 16px;
    height: 16px;
    cursor: pointer;
    &:hover { opacity: 0.85; }
  }
}
</style>
