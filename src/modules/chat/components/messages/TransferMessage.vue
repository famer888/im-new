<template>
  <div class="transfer-message">
    <div class="transfer-card">
      <div class="transfer-icon">💰</div>
      <div class="transfer-info">
        <p class="transfer-amount">{{ amount }}</p>
        <span class="transfer-label">{{ $t('[转账消息，暂不支持]') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

const props = defineProps<{
  content: string
  isSelf: boolean
}>()

const amount = computed(() => {
  try {
    const parsed = JSON.parse(props.content)
    return parsed.amount ? `¥${parsed.amount}` : ''
  } catch {
    return ''
  }
})
</script>

<style lang="scss" scoped>
.transfer-message {
  .transfer-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: linear-gradient(135deg, #ffa940, #ff7a00);
    border-radius: 8px;
    min-width: 200px;
    color: #fff;
  }

  .transfer-icon {
    font-size: 32px;
  }

  .transfer-info {
    flex: 1;
    min-width: 0;

    .transfer-amount {
      font-size: 18px;
      font-weight: 600;
    }

    .transfer-label {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 2px;
      display: block;
    }
  }
}
</style>
