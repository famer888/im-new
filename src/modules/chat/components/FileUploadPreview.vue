<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EmojiPicker from './send/EmojiPicker.vue'

const { t: $t } = useI18n()

const props = defineProps<{
  visible: boolean
  files: File[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', data: { text: string; files: File[] }): void
  (e: 'cancel'): void
}>()

interface PreviewItem {
  file: File
  name: string
  sizeLabel: string
  isImage: boolean
  previewUrl: string
  isError: boolean
}

const list = ref<PreviewItem[]>([])
const text = ref('')
const showEmoji = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const MAX_SIZE_MB = 50

function formatFileSize(size: number): string {
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(2)} kb`
  return `${(kb / 1024).toFixed(2)} mb`
}

function createPreview(file: File): PreviewItem {
  const isImage = file.type.startsWith('image/')
  const previewUrl = isImage ? URL.createObjectURL(new Blob([file])) : ''
  return {
    file,
    name: file.name,
    sizeLabel: formatFileSize(file.size),
    isImage,
    previewUrl,
    isError: Math.ceil(file.size / 1024 / 1024) > MAX_SIZE_MB,
  }
}

function revokePreviews(items: PreviewItem[]) {
  items.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  })
}

function resetList(newFiles: File[]) {
  revokePreviews(list.value)
  list.value = newFiles.map(createPreview)
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetList(props.files)
      text.value = ''
      showEmoji.value = false
    } else {
      revokePreviews(list.value)
      list.value = []
    }
  },
  { immediate: true },
)

watch(
  () => props.files,
  (newFiles) => {
    if (props.visible) resetList(newFiles)
  },
)

const isOnlyImage = computed(
  () => list.value.length === 1 && list.value[0].isImage,
)

function triggerAddFile() {
  fileInputRef.value?.click()
}

function handleAddFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  if (picked.length > 0) {
    list.value = [...list.value, ...picked.map(createPreview)]
  }
  input.value = ''
}

function handleRemove(index: number) {
  const item = list.value[index]
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
  if (list.value.length === 1) {
    handleCancel()
    return
  }
  list.value = list.value.filter((_, i) => i !== index)
}

function handleConfirm() {
  if (list.value.length === 0) return
  if (list.value.some((item) => item.isError)) return
  emit('confirm', {
    text: text.value.trim(),
    files: list.value.map((item) => item.file),
  })
  revokePreviews(list.value)
  list.value = []
  text.value = ''
  showEmoji.value = false
  emit('update:visible', false)
}

function handleCancel() {
  revokePreviews(list.value)
  list.value = []
  text.value = ''
  showEmoji.value = false
  emit('cancel')
  emit('update:visible', false)
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
    <Transition name="file-dialog">
      <div
        v-if="visible"
        class="file-upload-dialog"
        @click.self="handleCancel"
      >
        <div class="panel" @click.stop>
          <div class="preview-area">
            <ul
              :class="{
                only: isOnlyImage,
                multiple: list.length > 1 || (list.length === 1 && !list[0].isImage),
              }"
            >
              <li
                v-for="(item, index) in list"
                :key="index"
                :class="{ 'is-error': item.isError }"
              >
                <p v-if="item.isError" class="error-mask" @click="handleRemove(index)">
                  {{ $t('上传/文件视频大小超过50M!') }}
                </p>
                <picture>
                  <img v-if="item.isImage" :src="item.previewUrl" alt="" />
                  <div v-else class="file-fallback">📎</div>
                </picture>
                <span class="close-btn" @click="handleRemove(index)">
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                </span>
                <div
                  v-if="list.length > 1 || !item.isImage"
                  class="meta"
                >
                  <p class="meta-name">
                    <span>{{ $t('名称') }}:</span>{{ item.name }}
                  </p>
                  <p class="meta-size">
                    <span>{{ $t('大小') }}:</span>{{ item.sizeLabel }}
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div class="editor-wrap">
            <button class="emoji-icon" type="button" @click="handleEmojiToggle">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="#999" stroke-width="1.5" />
                <circle cx="9" cy="10" r="1.1" fill="#999" />
                <circle cx="15" cy="10" r="1.1" fill="#999" />
                <path d="M8.5 14c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" fill="none" stroke="#999" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
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
            <button class="link-btn" type="button" @click="triggerAddFile">
              {{ $t('添加文件') }}
            </button>
            <div class="actions">
              <button class="btn cancel" type="button" @click="handleCancel">
                {{ $t('取消') }}
              </button>
              <button class="btn send" type="button" @click="handleConfirm">
                {{ $t('发送') }}
              </button>
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
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.file-upload-dialog {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(0, 0, 0, 0.2);
  overflow-y: auto;
}

.panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  min-height: 390px;
  background: #fff;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  padding: 20px 20px 40px;
  box-sizing: border-box;
}

.preview-area {
  flex: auto;
  position: relative;
  padding: 0;
  margin: 0 0 6px;
  max-height: 420px;
  overflow-y: auto;

  > ul {
    margin: 0;
    padding: 0;
    list-style: none;

    > li {
      position: relative;
      margin: 0 0 6px;
      background: #eee;
      box-sizing: border-box;
      padding: 5px 0;
      border-radius: 5px;

      > picture {
        display: block;
        height: 60px;
        width: 70px;

        > img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .file-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: #555;
          background: #fff;
        }
      }

      > .close-btn {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        right: 6px;
        top: 6px;
        background: rgba(0, 0, 0, 0.35);
        border-radius: 50%;
        cursor: pointer;
        z-index: 2;

        &:hover { opacity: 0.85; }
      }

      > .meta {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 75px;
        right: 36px;
        display: flex;
        flex-direction: column;
        justify-content: center;

        > p {
          height: 25px;
          line-height: 25px;
          font-size: 14px;
          margin: 0;
          padding: 0;
          color: #666;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;

          > span {
            color: #333;
            display: inline-block;
            margin-right: 5px;
            font-size: 14px;
          }
        }
      }

      > .error-mask {
        position: absolute;
        inset: 0;
        border: 1px solid #ff0000;
        background: rgba(38, 1, 1, 0.6);
        color: #fff;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        margin: 0;
        border-radius: 5px;
        z-index: 3;
      }
    }

    &.only {
      > li {
        background: #fff;
        display: flex;
        justify-content: center;
        padding: 0;

        > picture {
          width: auto;
          height: auto;

          img {
            display: block;
            max-height: 200px;
            max-width: 360px;
          }
        }
      }
    }

    &.multiple {
      > li {
        height: 80px;
        margin-bottom: 8px;

        > picture {
          height: 65px;
          width: 65px;
          position: absolute;
          left: 5px;
          top: 50%;
          transform: translateY(-50%);
          overflow: hidden;
          margin-right: 5px;
          border-radius: 4px;
          background: #fff;

          > img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
        }
      }
    }
  }
}

.editor-wrap {
  position: relative;
  border-top: 1px dashed #e0e0e0;
  padding: 8px 0 0;
  min-height: 96px;

  .emoji-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  textarea {
    width: 100%;
    min-height: 48px;
    border: none;
    outline: none;
    resize: none;
    font-size: 14px;
    color: #333;
    line-height: 20px;
    margin: 4px 0 0;
    padding: 0;
    background: transparent;

    &::placeholder { color: #bbb; }
  }

  .emoji-popup {
    position: absolute;
    left: 0;
    bottom: calc(100% + 4px);
    z-index: 12001;
  }
}

.footer {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
}

.link-btn {
  border: 0;
  background: transparent;
  color: #3369fe;
  font-size: 12px;
  cursor: pointer;
  padding: 0;

  &:hover { opacity: 0.8; }
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  border: 0;
  border-radius: 4px;
  height: 28px;
  min-width: 64px;
  padding: 0 14px;
  font-size: 13px;
  cursor: pointer;

  &.cancel {
    background: #999;
    color: #fff;
    &:hover { opacity: 0.9; }
  }

  &.send {
    background: #3369fe;
    color: #fff;
    &:hover { opacity: 0.9; }
  }
}

.file-dialog-enter-active, .file-dialog-leave-active { transition: opacity 0.18s ease; }
.file-dialog-enter-from, .file-dialog-leave-to { opacity: 0; }

.popup-enter-active, .popup-leave-active { transition: all 0.2s ease; }
.popup-enter-from, .popup-leave-to { opacity: 0; transform: translateY(8px); }
</style>
