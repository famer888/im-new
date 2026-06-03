<template>
  <Teleport to="body">
    <div v-if="visible" class="create-link-dialog">
      <div class="dialog-body">
        <h6>{{ $t('创建链接') }}</h6>
        <span class="title">Text</span>
        <div
          ref="linkTextRef"
          contenteditable="true"
          draggable="false"
          spellcheck="false"
          class="create-link-input"
          :textContent="selectText"
        />
        <span class="title">URL</span>
        <input
          v-model="linkValue"
          type="text"
          maxlength="100"
          class="create-link-url"
        />

        <div class="buttons">
          <button class="button cancel" @click="handleClose">{{ $t('取消') }}</button>
          <button class="button" @click="handleConfirm">{{ $t('创建') }}</button>
        </div>
      </div>
      <Toast
        v-model:visible="toastVisible"
        :message="toastMessage"
        type="error"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Toast from '@/components/Toast.vue'

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
const toastVisible = ref(false)
const toastMessage = ref('')

function showToast(message: string) {
  toastMessage.value = message
  toastVisible.value = true
}

function ensureHttpProtocol(url: string): string {
  if (!url) return url
  if (!/^https?:\/\//i.test(url)) return 'https://' + url
  return url
}

function handleConfirm() {
  const linkText = linkTextRef.value?.innerHTML || ''
  // 对齐旧 im：点击创建时先校验链接文本和地址，缺失时只弹 toast，不关闭弹窗。
  if (!linkText) {
    showToast($t('请输入链接文本'))
    return
  }
  if (!linkValue.value) {
    showToast($t('请输入链接地址'))
    return
  }
  emit('confirm', {
    linkText,
    linkValue: ensureHttpProtocol(linkValue.value),
    selectText: props.selectText,
  })
  handleClose()
}

function handleClose() {
  linkValue.value = ''
  toastVisible.value = false
  emit('close')
}
</script>

<style lang="scss" scoped>
.create-link-dialog {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: center;
  align-items: center;
}

.dialog-body {
  width: 290px;
  min-height: 316px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  padding: 20px;
  box-sizing: border-box;
  border-radius: 6px;

  h6 {
    color: #000;
    font-size: 18px;
    line-height: 25px;
    margin: 0 0 10px;
    text-align: center;
  }

  .title {
    color: #787878;
    font-weight: 400;
    font-size: 12px;
    line-height: 17px;
    margin-top: 16px;
  }
}

.create-link-url,
.create-link-input {
  width: 100%;
  margin-top: 10px;
  background: #dcdfe6;
  color: #000;
  height: 46px;
  border: 0;
  border-radius: 8px;
  padding: 12px 16px;
  box-sizing: border-box;
  font-weight: 400;
  font-size: 14px;
  line-height: 20px;
  outline: none;
  white-space: nowrap;
  overflow-x: auto;
}

.buttons {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  margin-top: 30px;

  .button {
    font-size: 16px;
    color: #fff;
    margin-left: 20px;
    cursor: pointer;
    background: #178aff;
    width: 100%;
    height: 48px;
    border: 0;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;

    &:first-child {
      margin-left: 0;
    }
  }

  .cancel {
    background: #9197ad;
  }
}

.create-link-input {
  img {
    height: 18px;
  }
}
</style>
