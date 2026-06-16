<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import Toast from '@/components/Toast.vue'
import { uploadPackagedLog } from '@/utils/logUpload'
import closeIcon from '@/assets/images/common/close-icon.png'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const { t } = useI18n()
const authStore = useAuthStore()

const loading = ref(false)
const percent = ref(0)
const errorMsg = ref('')
const filepath = ref('')
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

const uploadButtonText = computed(() => {
  if (!loading.value) return t('上传日志')
  return `${t('上传中')} ${percent.value}%`
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    errorMsg.value = ''
  },
)

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

function close() {
  if (loading.value) return
  emit('update:visible', false)
}

async function copyTextToClipboard(text: string) {
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('write_clipboard_text', { text })
      return
    } catch {
      /* fallback below */
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('copy command failed')
}

async function handleUpload() {
  const loginId = String(authStore.uid || '').trim()
  if (!loginId) {
    errorMsg.value = t('未获取到登录信息')
    return
  }

  loading.value = true
  percent.value = 0
  errorMsg.value = ''
  filepath.value = ''

  const res = await uploadPackagedLog({
    loginId,
    onProgress: (nextPercent) => {
      percent.value = Math.max(percent.value, Math.min(100, nextPercent))
    },
  })

  loading.value = false
  if (!res.success) {
    errorMsg.value = res.msg || t('上传失败')
    return
  }

  filepath.value = res.filepath
}

async function handleCopyResult() {
  try {
    await copyTextToClipboard(`上传地址：${filepath.value || ''}`)
    showToast(t('已复制到剪贴板'))
  } catch {
    showToast(t('复制失败'), 'error')
  }
}
</script>

<template>
  <div v-if="visible" class="post-upload-dialog">
    <div class="dialog-mask" @click="close" />
    <div class="dialog-card">
      <button class="close-btn" type="button" @click="close">
        <img :src="closeIcon" alt="" />
      </button>
      <h3>{{ t('上传日志') }}</h3>
      <p class="desc">
        {{ t('隐私提醒：日志可能包含设备与网络信息，请仅在官方客服指导下上传。我们理解你的顾虑，日志仅用于定位问题，不会用于其他用途。') }}
      </p>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

      <div class="result">
        <p><span>{{ t('上传地址：') }}</span>{{ filepath }}</p>
      </div>

      <div class="action-bar">
        <button class="copy-btn" type="button" :disabled="!filepath || loading" @click="handleCopyResult">
          {{ t('复制到剪贴板') }}
        </button>
        <button class="upload-btn" type="button" :disabled="loading" @click="handleUpload">
          {{ uploadButtonText }}
        </button>
      </div>
    </div>

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
  </div>
</template>

<style lang="scss" scoped>
.post-upload-dialog {
  position: fixed;
  inset: 0;
  z-index: 10020;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
}

.dialog-card {
  position: relative;
  width: 460px;
  min-height: 240px;
  box-sizing: border-box;
  padding: 20px 20px 72px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.16);

  > h3 {
    margin: 0;
    color: #333;
    font-size: 18px;
    font-weight: 400;
  }
}

.close-btn {
  position: absolute;
  right: 12px;
  top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;

  > img {
    width: 14px;
    height: 14px;
  }
}

.desc {
  margin: 12px 0;
  color: #666;
  font-size: 13px;
  line-height: 1.5;
}

.error {
  margin: 12px 0 0;
  color: #f44141;
  font-size: 12px;
}

.result {
  margin-top: 12px;
  padding: 10px;
  border-radius: 4px;
  background: #f8f9fd;
  word-break: break-all;

  p {
    margin: 4px 0;
    color: #333;
    font-size: 12px;
    line-height: 1.5;
  }

  span {
    color: #999;
  }
}

.action-bar {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  min-width: 0;
}

.copy-btn,
.upload-btn {
  min-width: 120px;
  width: auto;
  max-width: 100%;
  min-height: 34px;
  padding: 0 16px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
}

.copy-btn {
  border: 1px solid #3369fe;
  color: #3369fe;
  background: #fff;
}

.upload-btn {
  border: 1px solid #3369fe;
  color: #fff;
  background: #3369fe;
}

@media (max-width: 520px) {
  .dialog-card {
    width: calc(100vw - 32px);
    padding-bottom: 20px;
  }

  .action-bar {
    position: static;
    margin-top: 18px;
    flex-wrap: wrap;
  }
}
</style>
