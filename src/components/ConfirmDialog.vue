<script setup lang="ts">
const props = withDefaults(defineProps<{
  visible: boolean
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
  type?: 'info' | 'warning' | 'danger'
}>(), {
  title: '提示',
  confirmText: '确定',
  cancelText: '取消',
  type: 'info',
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function handleConfirm() {
  emit('confirm')
  emit('update:visible', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-dialog">
          <div class="modal-header">
            <span class="modal-title">{{ title }}</span>
            <button class="modal-close" @click="handleCancel">×</button>
          </div>
          <div class="modal-body">
            <p>{{ content }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-cancel" @click="handleCancel">{{ cancelText }}</button>
            <button :class="['btn', `btn-${type}`]" @click="handleConfirm">{{ confirmText }}</button>
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
  z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  background: #fff;
  border-radius: 8px;
  width: 360px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;

  .modal-title { font-size: 15px; font-weight: 500; color: #333; }
  .modal-close {
    background: none; border: none; font-size: 20px; color: #999;
    cursor: pointer; line-height: 1;
    &:hover { color: #333; }
  }
}

.modal-body {
  padding: 20px;
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 20px 16px;
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

  &:hover { border-color: #c0c4cc; }
  &-info { background: #3369fe; color: #fff; border-color: #3369fe; &:hover { background: rgba(51, 105, 254, 0.8); } }
  &-warning { background: #e6a23c; color: #fff; border-color: #e6a23c; &:hover { background: #ebb563; } }
  &-danger { background: #f44e5a; color: #fff; border-color: #f44e5a; &:hover { background: #f78989; } }
  &-cancel { &:hover { color: #3369fe; border-color: rgba(51, 105, 254, 0.2); } }
}

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; .modal-dialog { transform: scale(0.95); } }
</style>
