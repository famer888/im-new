<template>
  <div v-if="visible" class="create-link-dialog">
    <div class="dialog-mask" @click="handleClose" />
    <div class="dialog-body">
      <div class="dialog-header">
        <span>{{ $t('创建链接') }}</span>
        <span class="close-btn" @click="handleClose">✕</span>
      </div>
      <div class="dialog-content">
        <div class="form-item">
          <label>{{ $t('链接文本') }}</label>
          <div
            ref="linkTextRef"
            contenteditable="true"
            class="link-text-input"
            :textContent="selectText"
          />
        </div>
        <div class="form-item">
          <label>{{ $t('链接地址') }}</label>
          <input
            v-model="linkValue"
            type="text"
            :placeholder="$t('请输入链接地址')"
            class="link-url-input"
          />
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="handleClose">{{ $t('取消') }}</button>
        <button class="btn-primary" @click="handleConfirm">{{ $t('确定') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

const props = defineProps<{
  visible: boolean
  selectText?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: { linkText: string; linkValue: string; selectText?: string }): void
}>()

const linkTextRef = ref<HTMLElement | null>(null)
const linkValue = ref('')

function ensureHttpProtocol(url: string): string {
  if (!url) return url
  if (!/^https?:\/\//i.test(url)) return 'https://' + url
  return url
}

function handleConfirm() {
  const linkText = linkTextRef.value?.innerText || ''
  if (!linkText) return
  if (!linkValue.value) return
  emit('confirm', {
    linkText,
    linkValue: ensureHttpProtocol(linkValue.value),
    selectText: props.selectText,
  })
  handleClose()
}

function handleClose() {
  linkValue.value = ''
  emit('close')
}
</script>

<style lang="scss" scoped>
.create-link-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  width: 380px;
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
}

.form-item {
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 13px;
    color: #666;
    margin-bottom: 6px;
  }
}

.link-text-input {
  width: 100%;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  &:focus { border-color: #3369fe; }
}

.link-url-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  &:focus { border-color: #3369fe; }
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
