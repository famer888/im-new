<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import overwriteRefresh from '@/assets/images/dialog/overwrite-refresh.png'

const props = defineProps<{
  visible: boolean
  fileName: string
  directoryName: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()

const titleText = computed(() => t('文件已存在替换标题', { name: props.fileName }))
const descriptionText = computed(() => t('文件已存在替换说明', { dir: props.directoryName }))

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}

function handleConfirm() {
  emit('confirm')
  emit('update:visible', false)
}

function onKeydown(event: KeyboardEvent) {
  if (!props.visible) return
  if (event.key === 'Escape') {
    event.preventDefault()
    handleCancel()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    handleConfirm()
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="overwrite-modal">
      <div v-if="visible" class="overwrite-overlay">
        <div class="overwrite-dialog" role="dialog" aria-modal="true" :aria-label="titleText">
          <div class="overwrite-icon" aria-hidden="true">
            <svg class="overwrite-warning" viewBox="0 0 86 80" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M43 4.5C45.8 4.5 48.38 5.96 49.82 8.35L81.4 60.7C84.41 65.69 80.81 72 75.01 72H10.99C5.19 72 1.59 65.69 4.6 60.7L36.18 8.35C37.62 5.96 40.2 4.5 43 4.5Z"
                fill="#FFCC10"
                stroke="#F6F8FC"
                stroke-width="4"
              />
              <path
                d="M43 23C45.9 23 48.25 25.36 48.25 28.26V41.48C48.25 44.38 45.9 46.74 43 46.74C40.1 46.74 37.75 44.38 37.75 41.48V28.26C37.75 25.36 40.1 23 43 23Z"
                fill="#FFFFFF"
              />
              <circle cx="43" cy="56.45" r="4.65" fill="#FFFFFF" />
            </svg>
            <span class="overwrite-badge">
              <img :src="overwriteRefresh" alt="" />
            </span>
          </div>

          <p class="overwrite-title">{{ titleText }}</p>
          <p class="overwrite-description">{{ descriptionText }}</p>

          <div class="overwrite-actions">
            <button type="button" class="overwrite-btn overwrite-btn-cancel" @click="handleCancel">
              {{ t('取消') }}
            </button>
            <button type="button" class="overwrite-btn overwrite-btn-confirm" @click="handleConfirm">
              {{ t('替换') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.overwrite-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.overwrite-dialog {
  width: 260px;
  box-sizing: border-box;
  padding: 18px 14px 14px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  text-align: center;
}

.overwrite-icon {
  position: relative;
  width: 86px;
  height: 80px;
  margin: 0 auto 14px;
}

.overwrite-warning {
  display: block;
  width: 86px;
  height: 80px;
}

.overwrite-badge {
  position: absolute;
  right: 6px;
  bottom: 2px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #2e3542;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(16, 20, 28, 0.18);

  img {
    width: 16px;
    height: 16px;
    display: block;
    filter: brightness(0) invert(1);
  }
}

.overwrite-title {
  margin: 0;
  color: #2c2f36;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-word;
}

.overwrite-description {
  margin: 10px 0 0;
  color: #666b76;
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}

.overwrite-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.overwrite-btn {
  flex: 1;
  height: 30px;
  border-radius: 8px;
  border: 1px solid #d9dee8;
  background: #fff;
  font-size: 14px;
  line-height: 30px;
  cursor: pointer;
}

.overwrite-btn-cancel {
  color: #33383f;
}

.overwrite-btn-confirm {
  color: #ff4d4f;
}

.overwrite-modal-enter-active,
.overwrite-modal-leave-active {
  transition: opacity 0.18s ease;
}

.overwrite-modal-enter-active .overwrite-dialog,
.overwrite-modal-leave-active .overwrite-dialog {
  transition: transform 0.18s ease;
}

.overwrite-modal-enter-from,
.overwrite-modal-leave-to {
  opacity: 0;

  .overwrite-dialog {
    transform: scale(0.96);
  }
}
</style>
