<template>
  <div v-if="visible" class="group-qrcode-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="dialog-body">
      <div class="dialog-header">
        <span>{{ $t('群二维码') }}</span>
        <span class="close-btn" @click="$emit('close')">✕</span>
      </div>
      <div class="dialog-content">
        <div class="qr-info">
          <TextAvatar :name="groupName" avatar-type="group" :size="48" />
          <div class="group-meta">
            <h3>{{ groupName }}</h3>
            <span>{{ $t('扫一扫，加入该群') }}</span>
          </div>
        </div>
        <div class="qr-container">
          <canvas ref="canvasRef" />
          <p v-if="loading" class="loading">{{ $t('加载中...') }}</p>
        </div>
        <p class="tip">{{ $t('该二维码7天内有效，重新进入将更新') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TextAvatar from '@/components/TextAvatar.vue'

const { t: $t } = useI18n()

const props = defineProps<{
  visible: boolean
  groupId: string
  groupName: string
}>()

defineEmits<{ (e: 'close'): void }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)

watch(() => props.visible, async (v) => {
  if (v && props.groupId) {
    loading.value = true
    try {
      // TODO: invoke('group_qr_code', { groupId }) → get QR data → render to canvas
    } finally {
      loading.value = false
    }
  }
})
</script>

<style lang="scss" scoped>
.group-qrcode-dialog {
  position: fixed;
  inset: 0;
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
  width: 320px;
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
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-info {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-bottom: 20px;

  .group-meta {
    h3 { font-size: 15px; color: #333; }
    span { font-size: 12px; color: #999; }
  }
}

.qr-container {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #f0f0f0;
  border-radius: 4px;

  canvas { max-width: 100%; max-height: 100%; }
  .loading { color: #999; font-size: 13px; }
}

.tip {
  margin-top: 12px;
  font-size: 12px;
  color: #999;
}
</style>
