<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Toast from '@/components/Toast.vue'
import dockIcon from '@/assets/images/login/dock.png'
import closeIcon from '@/assets/images/common/close-icon.png'
import { importAccountHistoryFile } from '@/utils/accountTransfer'

const { t: $t } = useI18n()

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const passwordInputRef = ref<HTMLInputElement | null>(null)
const password = ref('')
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

const canSelectFile = computed(() => /^\d{4}$/.test(password.value))

watch(() => props.visible, async (visible) => {
  if (visible) {
    password.value = ''
    await nextTick()
    passwordInputRef.value?.focus()
    passwordInputRef.value?.select()
    return
  }

  password.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
})

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

function handleConfirmClick() {
  if (!canSelectFile.value) {
    return
  }
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    input.value = ''
    return
  }

  importAccountHistoryFile(file, password.value)
    .then(() => {
      showToast($t('导入成功'))
    })
    .catch(() => {
      showToast($t('密码或文件错误'), 'error')
    })
    .finally(() => {
      input.value = ''
    })
}
</script>

<template>
  <div v-if="visible" class="file-import-dialog" @click.self="emit('close')">
    <div class="dialog-body" @click.stop>
      <button class="close-btn" type="button" @click="emit('close')">
        <img :src="closeIcon" alt="" />
      </button>

      <img class="dialog-icon" :src="dockIcon" alt="" />
      <div class="dialog-title">{{ $t('请输入导出密码') }}</div>

      <input
        ref="passwordInputRef"
        v-model="password"
        class="password-input"
        type="password"
        maxlength="4"
        inputmode="numeric"
        @keydown.enter.prevent="handleConfirmClick"
      />

      <button
        type="button"
        class="confirm-btn"
        :class="{ disabled: !canSelectFile }"
        @click="handleConfirmClick"
      >
        {{ $t('确定') }}
      </button>

      <input
        ref="fileInputRef"
        class="hidden-input"
        type="file"
        @change="handleFileChange"
      />
    </div>

    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />
  </div>
</template>

<style lang="scss" scoped>
.file-import-dialog {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.dialog-body {
  position: relative;
  width: 200px;
  padding: 10px 16px;
  background: #fff;
  border-radius: 8px;
  box-sizing: border-box;
  text-align: center;
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 0.8;
  }

  > img {
    width: 14px;
    height: 14px;
  }
}

.dialog-icon {
  display: block;
  width: 70px;
  margin: 10px auto 5px;
}

.dialog-title {
  color: #3369fe;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 400;
}

.password-input {
  display: block;
  width: 60%;
  height: 24px;
  margin: 10px auto 15px;
  padding: 0 10px;
  border: 1px solid #3369fe;
  border-radius: 4px;
  outline: none;
  text-align: center;
  font-size: 20px;
  color: #333;

  &:focus {
    box-shadow: 0 0 0 2px rgba(51, 105, 254, 0.08);
  }
}

.confirm-btn {
  min-width: 68px;
  height: 24px;
  padding: 0 14px;
  border: 0;
  border-radius: 4px;
  background: #3369fe;
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  line-height: 24px;
  cursor: pointer;

  &.disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.hidden-input {
  display: none;
}
</style>
