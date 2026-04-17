<script setup lang="ts">
import { computed, ref } from 'vue'
import EmojiPicker from './send/EmojiPicker.vue'

interface ForwardPayload {
  msgType: number
  content: string
  extra?: Record<string, unknown>
}

const props = defineProps<{
  visible: boolean
  payload: ForwardPayload | null
}>()

const emit = defineEmits<{
  (e: 'confirm', data: { text: string; files: File[] }): void
  (e: 'cancel'): void
}>()

const text = ref('')
const extraFileItems = ref<Array<{
  file: File
  name: string
  sizeLabel: string
  isImage: boolean
  previewUrl: string
}>>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showEmoji = ref(false)

const imagePreview = computed(() => {
  if (!props.payload || props.payload.msgType !== 1) return ''
  try {
    const parsed = JSON.parse(props.payload.content || '{}')
    return String(parsed.thumbnailUrl || parsed.url || '')
  } catch {
    return ''
  }
})

function estimateDataUrlSizeLabel(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || ''
  const bytes = Math.floor((base64.length * 3) / 4)
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} kb`
  return `${(kb / 1024).toFixed(1)} mb`
}

const mainImageMeta = computed(() => {
  if (!props.payload || props.payload.msgType !== 1) return null
  try {
    const parsed = JSON.parse(props.payload.content || '{}')
    const url = String(parsed.thumbnailUrl || parsed.url || '')
    const name = String(parsed.name || '二维码图片.jpg')
    return {
      name,
      sizeLabel: estimateDataUrlSizeLabel(url),
    }
  } catch {
    return {
      name: '二维码图片.jpg',
      sizeLabel: '--',
    }
  }
})

function triggerAddFile() {
  fileInputRef.value?.click()
}

function formatSize(size: number) {
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(1)} kb`
  return `${(kb / 1024).toFixed(1)} mb`
}

function createPreview(file: File) {
  const isImage = file.type.startsWith('image/')
  return {
    file,
    name: file.name,
    sizeLabel: formatSize(file.size),
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : '',
  }
}

function handleAddFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length > 0) {
    extraFileItems.value = [...extraFileItems.value, ...files.map(createPreview)]
  }
  input.value = ''
}

function removeExtraFile(index: number) {
  const item = extraFileItems.value[index]
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
  extraFileItems.value = extraFileItems.value.filter((_, i) => i !== index)
}

function removeMainPreview() {
  handleCancel()
}

function handleConfirm() {
  emit('confirm', {
    text: text.value.trim(),
    files: extraFileItems.value.map((item) => item.file),
  })
  extraFileItems.value.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  })
  text.value = ''
  extraFileItems.value = []
}

function handleCancel() {
  extraFileItems.value.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  })
  showEmoji.value = false
  text.value = ''
  extraFileItems.value = []
  emit('cancel')
}

function handleEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleConfirm()
  }
}

function handleEmojiToggle() {
  showEmoji.value = !showEmoji.value
}

function handleEmojiSelect(emoji: string) {
  text.value += emoji
  showEmoji.value = false
  requestAnimationFrame(() => textareaRef.value?.focus())
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="forward-confirm-dialog" @click.self="handleCancel">
      <div class="panel" @click.stop>
        <div class="preview-area">
          <ul :class="{ only: imagePreview && extraFileItems.length === 0, multiple: extraFileItems.length > 0 }">
            <li v-if="imagePreview && extraFileItems.length === 0" class="main-image-item">
              <picture>
                <img :src="imagePreview" alt="" />
              </picture>
              <span class="close-main" @click="removeMainPreview">×</span>
            </li>
            <li v-else-if="imagePreview" class="extra-file-item main-file-row">
              <picture>
                <img :src="imagePreview" alt="" />
              </picture>
              <div class="extra-file-meta">
                <p class="extra-file-name"><span>名称:</span>{{ mainImageMeta?.name || '二维码图片.jpg' }}</p>
                <p class="extra-file-size"><span>大小:</span>{{ mainImageMeta?.sizeLabel || '--' }}</p>
              </div>
              <span class="close-extra" @click="removeMainPreview">×</span>
            </li>
            <li
              v-for="(item, index) in extraFileItems"
              :key="`${item.name}_${index}`"
              class="extra-file-item"
            >
              <picture>
                <img v-if="item.isImage" :src="item.previewUrl" alt="" />
                <div v-else class="file-fallback">📎</div>
              </picture>
              <div class="extra-file-meta">
                <p class="extra-file-name"><span>名称:</span>{{ item.name }}</p>
                <p class="extra-file-size"><span>大小:</span>{{ item.sizeLabel }}</p>
              </div>
              <span class="close-extra" @click="removeExtraFile(index)">×</span>
            </li>
          </ul>
        </div>

        <div class="editor-wrap">
          <button class="emoji-icon" type="button" @click="handleEmojiToggle">☺</button>
          <textarea
            ref="textareaRef"
            v-model="text"
            :placeholder="$t('Enter发送')"
            @keydown="handleEditorKeydown"
          />
          <Transition name="popup">
            <div v-if="showEmoji" class="emoji-popup">
              <EmojiPicker @select="handleEmojiSelect" @close="showEmoji = false" />
            </div>
          </Transition>
        </div>

        <div class="footer">
          <button class="link-btn" type="button" @click="triggerAddFile">{{ $t('添加文件') }}</button>
          <div class="actions">
            <button class="btn cancel" type="button" @click="handleCancel">{{ $t('取消') }}</button>
            <button class="btn send" type="button" @click="handleConfirm">{{ $t('发送') }}</button>
          </div>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          multiple
          style="display: none"
          @change="handleAddFiles"
        />
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.forward-confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(0, 0, 0, 0.2);
}

.panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  min-height: 390px;
  background: #fff;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.preview-area {
  flex: 1;
  padding: 20px 20px 8px;
  overflow-y: auto;

  > ul {
    margin: 0;
    padding: 0;
    list-style: none;

    > li {
      position: relative;
      background: #eee;
      margin-bottom: 8px;
      min-height: 60px;
      border-radius: 4px;
    }

    &.only {
      > li.main-image-item {
        background: #fff;
        margin-bottom: 0;
        min-height: 0;

        > picture {
          display: flex;
          justify-content: center;

          > img {
            display: block;
            width: auto;
            height: auto;
            max-width: 360px;
            max-height: 200px;
            object-fit: contain;
          }
        }
      }
    }

    &.multiple {
      > li {
        margin-bottom: 6px;
      }
    }
  }
}

.main-image-item {
  > picture {
    display: block;
    width: 100%;
    text-align: center;
  }
}

.close-main {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
}

.extra-file-item {
  height: 80px;
  padding: 0;
  border-radius: 5px;
  background: #eee;

  > picture {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 64px;
    height: 64px;
    border-radius: 4px;
    overflow: hidden;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;

    > img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }
}

.main-file-row {
  background: #eee;
}

.extra-file-meta {
  position: absolute;
  left: 78px;
  right: 38px;
  top: 50%;
  transform: translateY(-50%);

  p {
    margin: 0;
    line-height: 22px;
    font-size: 14px;
    color: #666;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    margin-right: 4px;
    color: #333;
  }
}

.file-fallback {
  font-size: 26px;
  line-height: 1;
}

.close-extra {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
}

.editor-wrap {
  height: 110px;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px dashed #ddd;
  padding: 8px 20px 0;
  position: relative;
  overflow: visible;

  .emoji-icon {
    display: block;
    width: 24px;
    height: 24px;
    line-height: 24px;
    text-align: center;
    color: #999;
    font-size: 18px;
    margin-bottom: 6px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  textarea {
    width: 100%;
    min-height: 64px;
    border: none;
    outline: none;
    resize: none;
    font-size: 14px;
    color: #333;
    line-height: 20px;
    margin: 0;
    padding: 0;
    background: transparent;
  }

  .emoji-popup {
    position: absolute;
    left: 0;
    bottom: calc(100% + 4px);
    z-index: 12001;
  }
}

.footer {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: relative;
  z-index: 2;
  background: #fff;
}

.link-btn {
  border: none;
  background: transparent;
  color: #3369fe;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  border: none;
  border-radius: 4px;
  height: 32px;
  min-width: 74px;
  padding: 0 14px;
  font-size: 14px;
  cursor: pointer;

  &.cancel {
    background: #999;
    color: #fff;
  }

  &.send {
    background: #3369fe;
    color: #fff;
  }
}

.popup-enter-active, .popup-leave-active { transition: all 0.2s ease; }
.popup-enter-from, .popup-leave-to { opacity: 0; transform: translateY(8px); }
</style>
