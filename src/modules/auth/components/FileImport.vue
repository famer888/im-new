<template>
  <div v-if="visible" class="file-import-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="dialog-body">
      <div class="dialog-header">
        <span>{{ $t('导入账户') }}</span>
        <span class="close-btn" @click="$emit('close')">✕</span>
      </div>
      <div class="dialog-content">
        <p class="tip">{{ $t('请输入4位数字密码以解密导入文件') }}</p>
        <div class="password-input">
          <input
            v-for="(_, i) in 4"
            :key="i"
            :ref="el => { if (el) inputRefs[i] = el as HTMLInputElement }"
            v-model="digits[i]"
            type="password"
            maxlength="1"
            class="digit-input"
            @input="handleDigitInput(i)"
            @keydown.backspace="handleBackspace(i)"
          />
        </div>
        <div class="file-select">
          <button class="btn-primary btn-outline" @click="selectFile">
            {{ selectedFile ? selectedFile.name : $t('选择文件') }}
          </button>
          <input
            ref="fileInputRef"
            type="file"
            style="display: none"
            @change="handleFileChange"
          />
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="$emit('close')">{{ $t('取消') }}</button>
        <button class="btn-primary" :disabled="!canImport" @click="handleImport">
          {{ $t('导入') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported'): void
}>()

const digits = reactive(['', '', '', ''])
const inputRefs = ref<HTMLInputElement[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)

const canImport = computed(() => {
  return digits.every(d => d !== '') && selectedFile.value !== null
})

function handleDigitInput(index: number) {
  if (digits[index] && index < 3) {
    inputRefs.value[index + 1]?.focus()
  }
}

function handleBackspace(index: number) {
  if (!digits[index] && index > 0) {
    inputRefs.value[index - 1]?.focus()
  }
}

function selectFile() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    selectedFile.value = input.files[0]
  }
}

async function handleImport() {
  if (!canImport.value || !selectedFile.value) return
  const password = digits.join('')
  try {
    // TODO: invoke('import_account_file', { filePath, password })
    emit('imported')
    emit('close')
  } catch {
    // toast error
  }
}
</script>

<style lang="scss" scoped>
.file-import-dialog {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
}

.dialog-body {
  position: relative;
  width: 360px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 16px;
  font-weight: 500;
  border-bottom: 1px solid #f0f0f0;

  .close-btn {
    cursor: pointer;
    color: #999;
    &:hover { color: #333; }
  }
}

.dialog-content {
  padding: 20px;

  .tip {
    font-size: 13px;
    color: #666;
    margin-bottom: 16px;
  }
}

.password-input {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 20px;

  .digit-input {
    width: 48px;
    height: 48px;
    text-align: center;
    font-size: 20px;
    border: 2px solid #ddd;
    border-radius: 8px;
    outline: none;

    &:focus {
      border-color: #3369fe;
    }
  }
}

.file-select {
  text-align: center;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;

  .btn-cancel {
    padding: 0 16px;
    height: 32px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
    &:hover { background: #f5f5f5; }
  }
}
</style>
