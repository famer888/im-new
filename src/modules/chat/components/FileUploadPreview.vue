<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  files: File[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', files: File[]): void
  (e: 'cancel'): void
}>()

const previewUrls = computed(() =>
  props.files.map((f) => ({
    name: f.name,
    size: formatSize(f.size),
    isImage: f.type.startsWith('image/'),
    url: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
  })),
)

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function handleConfirm() {
  emit('confirm', props.files)
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="emit('update:visible', false)">
        <div class="preview-dialog">
          <div class="dialog-header">
            <span>发送文件</span>
            <button class="close-btn" @click="emit('update:visible', false)">×</button>
          </div>
          <div class="preview-list">
            <div v-for="(file, i) in previewUrls" :key="i" class="preview-item">
              <img v-if="file.isImage" :src="file.url" class="preview-img" />
              <div v-else class="preview-file-icon">📎</div>
              <div class="preview-info">
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">{{ file.size }}</span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('update:visible', false)">取消</button>
            <button class="btn btn-primary" @click="handleConfirm">发送</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center;
}
.preview-dialog {
  width: 400px; max-height: 500px; background: #fff; border-radius: 8px; overflow: hidden;
  display: flex; flex-direction: column;
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; font-size: 15px; font-weight: 500;
  .close-btn { background: none; border: none; font-size: 20px; color: #999; cursor: pointer; }
}
.preview-list { flex: 1; overflow-y: auto; padding: 0 20px; }
.preview-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.preview-img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; }
.preview-file-icon { width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; font-size: 32px; background: #f5f5f5; border-radius: 4px; }
.preview-info { flex: 1; min-width: 0; }
.file-name { display: block; font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { font-size: 12px; color: #999; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px; }
.btn {
  height: 32px; padding: 0 16px; border-radius: 4px; font-size: 13px; cursor: pointer;
  &-cancel { border: 1px solid #dcdfe6; background: #fff; color: #666; }
  &-primary { border: none; background: #3369fe; color: #fff; &:hover { background: rgba(51, 105, 254, 0.8); } }
}
.modal-enter-active, .modal-leave-active { transition: all 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
