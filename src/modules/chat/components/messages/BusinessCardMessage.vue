<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{ message: Message }>()
const uiStore = useUIStore()

const cardData = computed(() => {
  const content = props.message.content ?? ''
  if (content.includes('*|*|*')) {
    const parts = content.split('*|*|*')
    if (parts.length >= 3) {
      const [nickname, avatar, uid] = parts
      return { nickname, avatar, uid }
    }
    const [nickname, uid] = parts
    return { nickname, avatar: '', uid }
  }

  try {
    const parsed = JSON.parse(content || '{}')
    return {
      nickname: parsed.nickname || parsed.name || '未知',
      avatar: parsed.avatar || parsed.pic || '',
      uid: parsed.uid || parsed.id || '',
    }
  } catch {
    const fallbackId = content.match(/\d{6,}/)?.[0] || ''
    return { nickname: fallbackId || '未知', avatar: '', uid: fallbackId }
  }
})

function handleClick() {
  const uid = String(cardData.value.uid || '').trim()
  const nickname = String(cardData.value.nickname || '').trim()
  const candidates = Array.from(new Set([uid, nickname].filter(Boolean)))
  if (candidates.length > 0) {
    uiStore.openMemberInfo(uid || nickname, undefined, candidates)
  }
}
</script>

<template>
  <div
    class="business-card-message"
    @click="handleClick"
  >
    <TextAvatar
      :name="cardData.nickname || '?'"
      :src="cardData.avatar"
      :size="42"
      avatar-type="friend"
      rounded
      class="card-avatar"
    />
    <h2 class="card-name">{{ cardData.nickname || '未知' }}</h2>
    <span class="card-tag">名片</span>
  </div>
</template>

<style lang="scss" scoped>
.business-card-message {
  position: relative;
  width: 100%;
  height: 82px;
  box-sizing: border-box;
  padding: 10px 10px 10px 12px;
  border: 1px solid #eeeff3;
  border-radius: 10px;
  border-top-left-radius: 0;
  background: rgb(243, 243, 243);
  word-wrap: break-word;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

.card-avatar {
  position: absolute;
  left: 15px;
  top: 50%;
  transform: translateY(-50%);
}

.card-name {
  position: absolute;
  left: 65px;
  top: 50%;
  right: 78px;
  max-height: 66px;
  margin: 0;
  padding: 0;
  transform: translateY(-50%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #333;
  font-size: 16px;
  font-weight: 500;
  line-height: 22px;
}

.card-tag {
  position: absolute;
  right: 14px;
  top: 50%;
  height: 23px;
  padding: 0 10px;
  transform: translateY(-50%);
  border-radius: 23px;
  background-color: #3369fe;
  color: #fff;
  font-size: 12px;
  line-height: 23px;
}
</style>
