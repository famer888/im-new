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
const extraFiles = ref<File[]>([])
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

function triggerAddFile() {
  fileInputRef.value?.click()
}

function handleAddFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length > 0) {
    extraFiles.value = [...extraFiles.value, ...files]
  }
  input.value = ''
}

function removeExtraFile(index: number) {
  extraFiles.value = extraFiles.value.filter((_, i) => i !== index)
}

function removeMainPreview() {
  handleCancel()
}

function handleConfirm() {
  emit('confirm', {
    text: text.value.trim(),
    files: extraFiles.value,
  })
  text.value = ''
  extraFiles.value = []
}

function handleCancel() {
  showEmoji.value = false
  text.value = ''
  extraFiles.value = []
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
          <ul :class="{ only: imagePreview && extraFiles.length === 0 }">
            <li v-if="imagePreview" class="main-image-item">
              <picture>
                <img :src="imagePreview" alt="" />
              </picture>
              <span class="close-main" @click="removeMainPreview">×</span>
            </li>
            <li
              v-for="(file, index) in extraFiles"
              :key="`${file.name}_${index}`"
              class="extra-file-item"
            >
              <div class="extra-file-name">{{ file.name }}</div>
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
  z-index: 9100;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
}

.extra-file-name {
  line-height: 32px;
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.close-extra {
  color: #999;
  font-size: 14px;
  cursor: pointer;
}

.editor-wrap {
  height: 110px;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px dashed #ddd;
  padding: 8px 20px 0;
  position: relative;

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
    font-size: 32px;
    transform: scale(0.375);
    transform-origin: left top;
    width: calc(100% / 0.375);
    min-height: calc(64px / 0.375);
    color: #333;
    line-height: 1.4;
    margin: 0;
    padding: 0;
  }

  .emoji-popup {
    position: absolute;
    left: 0;
    bottom: calc(100% + 4px);
    z-index: 20;
  }
}

.footer {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
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
