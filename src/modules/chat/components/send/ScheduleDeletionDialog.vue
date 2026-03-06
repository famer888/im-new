<template>
  <div v-if="visible" class="schedule-deletion-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="dialog-body">
      <div class="dialog-header">
        <span>{{ $t('阅后即焚') }}</span>
        <span class="close-btn" @click="$emit('close')">✕</span>
      </div>
      <div class="dialog-content">
        <p class="tip">{{ $t('开启后，双方发送的消息将在指定时间后自动销毁') }}</p>
        <div class="time-list">
          <div
            v-for="item in timeOptions"
            :key="item.value"
            :class="['time-item', { active: selectedTime === item.value }]"
            @click="selectedTime = item.value"
          >
            {{ item.name }}
          </div>
        </div>
        <div
          :class="['time-item off', { active: selectedTime === 0 }]"
          @click="selectedTime = 0"
        >
          {{ $t('关闭') }}
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="$emit('close')">{{ $t('取消') }}</button>
        <button class="btn-primary" @click="handleConfirm">{{ $t('确定') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

defineProps<{ visible: boolean; currentTime?: number }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', seconds: number): void
}>()

const selectedTime = ref(0)

const timeOptions = computed(() => [
  { name: '5' + $t('秒'), value: 5 },
  { name: '10' + $t('秒'), value: 10 },
  { name: '30' + $t('秒'), value: 30 },
  { name: '1' + $t('分钟'), value: 60 },
  { name: '1' + $t('小时'), value: 3600 },
  { name: '6' + $t('小时'), value: 21600 },
  { name: '12' + $t('小时'), value: 43200 },
  { name: '1' + $t('天'), value: 86400 },
  { name: '3' + $t('天'), value: 259200 },
  { name: '7' + $t('天'), value: 604800 },
])

function handleConfirm() {
  emit('confirm', selectedTime.value)
  emit('close')
}
</script>

<style lang="scss" scoped>
.schedule-deletion-dialog {
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
  width: 380px;
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

  .tip {
    font-size: 13px;
    color: #999;
    margin-bottom: 16px;
  }
}

.time-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.time-item {
  padding: 6px 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  color: #333;

  &:hover { border-color: #3369fe; }

  &.active {
    background: #3369fe;
    color: #fff;
    border-color: #3369fe;
  }

  &.off {
    color: #da2e2e;
    border-color: #da2e2e;

    &.active {
      background: #da2e2e;
      color: #fff;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;

  .btn-cancel {
    padding: 0 16px;
    height: 32px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
    &:hover { background: #f5f5f5; }
  }
}
</style>
