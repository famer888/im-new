<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import defaultConfirmAppIcon from '@/assets/images/common/confirm-app-icon.png'

const props = withDefaults(defineProps<{
  visible: boolean
  /** 与 im 一致时可不传，仅保留右上角关闭 */
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
  /** default：带标题栏；im：无标题、正文居中、按钮样式对齐老 im */
  variant?: 'default' | 'im'
  type?: 'info' | 'warning' | 'danger'
  /** 顶部应用图标（对齐老 im 原生确认框 / window.confirm 样式） */
  showIcon?: boolean
  icon?: string
}>(), {
  title: '提示',
  confirmText: '确定',
  cancelText: '取消',
  variant: 'default',
  type: 'info',
  showIcon: false,
  icon: '',
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()
const displayTitle = computed(() => t(props.title))
const displayContent = computed(() => t(props.content))
const displayConfirmText = computed(() => t(props.confirmText))
const displayCancelText = computed(() => t(props.cancelText))
const iconSrc = computed(() => {
  if (!props.showIcon) return ''
  return props.icon || defaultConfirmAppIcon
})

function close() {
  emit('update:visible', false)
}

function handleConfirm() {
  emit('confirm')
  close()
}

function handleCancel() {
  emit('cancel')
  close()
}

function onKeydown(ev: KeyboardEvent) {
  if (!props.visible) return
  if (ev.key === 'Escape') {
    ev.preventDefault()
    handleCancel()
  }
  else if (ev.key === 'Enter') {
    ev.preventDefault()
    handleConfirm()
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      window.addEventListener('keydown', onKeydown)
    }
    else {
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
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-dialog" :class="{ 'modal-dialog--im': variant === 'im' }">
          <div class="modal-header" :class="{ 'modal-header--im': variant === 'im' }">
            <span v-if="variant === 'default'" class="modal-title">{{ displayTitle }}</span>
            <button
              type="button"
              class="modal-close"
              :class="{ 'modal-close--im': variant === 'im' }"
              :aria-label="t('关闭')"
              @click="handleCancel"
            >×</button>
          </div>
          <div class="modal-body" :class="{ 'modal-body--im': variant === 'im' }">
            <img v-if="iconSrc" class="modal-app-icon" :src="iconSrc" alt="">
            <p>{{ displayContent }}</p>
          </div>
          <div class="modal-footer" :class="{ 'modal-footer--im': variant === 'im' }">
            <button type="button" class="btn btn-cancel" @click="handleCancel">{{ displayCancelText }}</button>
            <button type="button" :class="['btn', variant === 'im' ? 'btn-im-primary' : `btn-${type}`]" @click="handleConfirm">
              {{ displayConfirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  background: #fff;
  border-radius: 8px;
  width: 360px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

/* 与 im/src/components/confirm.vue 白框一致：300×、padding、圆角、整体比例 */
.modal-dialog--im {
  position: relative;
  width: 300px;
  box-sizing: border-box;
  padding: 20px 16px 10px;
  border-radius: 8px;
  font-size: 12px;
  box-shadow: none;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;

  .modal-title {
    font-size: 15px;
    font-weight: 500;
    color: #333;
  }

  .modal-close {
    flex-shrink: 0;
    background: none;
    border: none;
    font-size: 22px;
    font-weight: 300;
    color: #999;
    cursor: pointer;
    line-height: 1;
    padding: 4px 6px;
    margin: -4px -6px 0 0;

    &:hover {
      color: #333;
    }
  }
}

.modal-header--im {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 0;
  margin: 0;
  width: auto;
  min-height: 0;
  justify-content: flex-end;
  align-items: flex-start;
}

.modal-close--im {
  padding: 0;
  margin: 0;
  font-size: 18px;
  font-weight: 400;
  line-height: 1;
}

.modal-body {
  padding: 20px;
  font-size: 14px;
  color: #666;
  line-height: 1.6;

  p {
    margin: 0;
  }
}

.modal-body--im {
  padding: 10px 0 5px;
  text-align: center;
  color: #999;
  font-size: 14px;
  line-height: 20px;
  word-wrap: break-word;
}

.modal-app-icon {
  display: block;
  width: 64px;
  height: 64px;
  margin: 4px auto 14px;
  object-fit: contain;
  flex-shrink: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 20px 16px;
}

.modal-footer--im {
  display: flex;
  justify-content: center;
  align-items: stretch;
  margin-top: 16px;
  padding: 0;
  gap: 0;

  .btn {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 32px;
    line-height: 32px;
    padding: 0 13px;
    border-radius: 6px;
    font-size: 14px;
    border: none;
    box-sizing: border-box;
  }

  .btn-cancel {
    margin-right: 10px;
    background: #9197ad;
    color: #fff;

    &:hover {
      background: #82889a;
      color: #fff;
    }
  }

  .btn-im-primary {
    background: #178aff;
    color: #fff;

    &:hover {
      background: #0f7ae8;
    }
  }
}

.btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #666;

  &:hover {
    border-color: #c0c4cc;
  }

  &-info {
    background: #3369fe;
    color: #fff;
    border-color: #3369fe;

    &:hover {
      background: rgba(51, 105, 254, 0.88);
    }
  }

  &-warning {
    background: #e6a23c;
    color: #fff;
    border-color: #e6a23c;

    &:hover {
      background: #ebb563;
    }
  }

  &-danger {
    background: #f44e5a;
    color: #fff;
    border-color: #f44e5a;

    &:hover {
      background: #f78989;
    }
  }

  &-cancel:hover {
    color: #3369fe;
    border-color: rgba(51, 105, 254, 0.2);
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-dialog,
.modal-leave-active .modal-dialog {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal-dialog {
    transform: scale(0.96);
  }
}
</style>
