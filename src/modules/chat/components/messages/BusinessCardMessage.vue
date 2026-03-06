<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{ message: Message }>()

const cardData = computed(() => {
  try { return JSON.parse(props.message.content ?? '{}') }
  catch { return { nickname: '未知', uid: '' } }
})
</script>

<template>
  <div class="business-card-message">
    <div class="card">
      <div class="card-top">
        <TextAvatar :name="cardData.nickname || '?'" :src="cardData.avatar" :size="36" />
        <span class="card-name">{{ cardData.nickname || '未知' }}</span>
      </div>
      <div class="card-bottom">个人名片</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.card {
  width: 220px;
  background: #fff;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  &:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
}

.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}

.card-name {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-bottom {
  padding: 6px 12px;
  background: #f5f5f5;
  font-size: 11px;
  color: #999;
  border-top: 1px solid #ebeef5;
}
</style>
