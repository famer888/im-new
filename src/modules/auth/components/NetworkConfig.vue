<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'back'): void
}>()

const serverUrl = ref('')
const isChecking = ref(false)

async function checkNetwork() {
  isChecking.value = true
  try {
    // TODO: Validate server URL
  } finally {
    isChecking.value = false
  }
}
</script>

<template>
  <div class="network-config">
    <div class="header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <span class="title">网络设置</span>
    </div>
    <div class="form">
      <div class="form-item">
        <label>服务器地址</label>
        <input v-model="serverUrl" placeholder="请输入服务器地址" />
      </div>
      <button class="check-btn" :disabled="isChecking" @click="checkNetwork">
        {{ isChecking ? '检测中...' : '检测连接' }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.network-config {
  width: 100%;
  max-width: 300px;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;

  .back-btn {
    background: none;
    border: none;
    color: #3369fe;
    cursor: pointer;
    font-size: 14px;
  }

  .title {
    font-size: 16px;
    font-weight: 500;
  }
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .form-item {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 13px;
      color: #666;
    }

    input {
      height: 36px;
      border: 1px solid #dcdfe6;
      border-radius: 4px;
      padding: 0 12px;
      font-size: 14px;
      outline: none;

      &:focus {
        border-color: #3369fe;
      }
    }
  }

  .check-btn {
    height: 36px;
    background: #3369fe;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;

    &:disabled {
      opacity: 0.6;
    }
  }
}
</style>
