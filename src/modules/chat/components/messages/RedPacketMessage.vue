<template>
  <div class="red-packet-message">
    <div class="packet-card">
      <div class="packet-icon">🧧</div>
      <div class="packet-info">
        <p class="packet-text">{{ remark || $t('恭喜发财，大吉大利') }}</p>
        <span class="packet-label">{{ $t('[红包消息，暂不支持]') }}</span>
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

const remark = computed(() => {
  try {
    const parsed = JSON.parse(props.content)
    return parsed.remark || parsed.title || ''
  } catch {
    return ''
  }
})
</script>

<style lang="scss" scoped>
.red-packet-message {
  .packet-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: linear-gradient(135deg, #fa5151, #e8432a);
    border-radius: 8px;
    min-width: 200px;
    color: #fff;
  }

  .packet-icon {
    font-size: 32px;
  }

  .packet-info {
    flex: 1;
    min-width: 0;

    .packet-text {
      font-size: 14px;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .packet-label {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 2px;
      display: block;
    }
  }
}
</style>
