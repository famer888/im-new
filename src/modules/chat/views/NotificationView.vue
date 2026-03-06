<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

interface NotificationData {
  conversationId: string
  title: string
  body: string
  avatar: string | null
}

const data = ref<NotificationData | null>(null)

onMounted(async () => {
  await listen<NotificationData>('notification:data', (event) => {
    data.value = event.payload
  })
})

async function handleClick() {
  if (data.value) {
    const win = getCurrentWindow()
    await win.emit('notification:click', { conversationId: data.value.conversationId })
    await win.close()
  }
}

async function handleClose() {
  const win = getCurrentWindow()
  await win.close()
}
</script>

<template>
  <div v-if="data" class="notification" @click="handleClick">
    <div class="avatar">
      <img v-if="data.avatar" :src="data.avatar" alt="" />
      <div v-else class="avatar-placeholder">{{ data.title[0] }}</div>
    </div>
    <div class="content">
      <div class="title">{{ data.title }}</div>
      <div class="body">{{ data.body }}</div>
    </div>
    <button class="close-btn" @click.stop="handleClose">×</button>
  </div>
</template>

<style lang="scss" scoped>
.notification {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    background: #f5f5f5;
  }
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: #3369fe;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 500;
}

.content {
  flex: 1;
  min-width: 0;

  .title {
    font-size: 13px;
    font-weight: 500;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .body {
    font-size: 12px;
    color: #999;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #999;
  cursor: pointer;
  padding: 0 4px;

  &:hover {
    color: #333;
  }
}
</style>
