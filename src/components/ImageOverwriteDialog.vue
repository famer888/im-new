<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import overwriteWarningIcon from '@/assets/images/dialog/overwrite-warning-icon.png'

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
            <img class="overwrite-warning" :src="overwriteWarningIcon" alt="" />
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
  background: rgba(224, 224, 223);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  text-align: center;
}

.overwrite-icon {
  width: 84px;
  height: 74px;
  margin: 0 auto 10px;
}

.overwrite-warning {
  display: block;
  width: 77px;
  height: 74px;
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
  color:rgba(133, 137, 144);
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
