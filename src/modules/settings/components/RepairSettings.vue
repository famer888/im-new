<script setup lang="ts">
import { ref } from 'vue'

const isRepairing = ref(false)
const repairResult = ref('')

async function handleRepair() {
  isRepairing.value = true
  repairResult.value = ''
  try {
    // TODO: invoke repair commands via Tauri
    await new Promise((r) => setTimeout(r, 2000))
    repairResult.value = '修复完成'
  } catch (e) {
    repairResult.value = '修复失败: ' + String(e)
  } finally {
    isRepairing.value = false
  }
}

async function handleClearCache() {
  // TODO: invoke clear cache via Tauri
}
</script>

<template>
  <div class="repair-settings">
    <div class="repair-item">
      <div class="repair-label">
        <span class="label-title">修复聊天记录</span>
        <span class="label-desc">当聊天记录出现异常时，可尝试修复</span>
      </div>
      <button class="repair-btn" :disabled="isRepairing" @click="handleRepair">
        {{ isRepairing ? '修复中...' : '开始修复' }}
      </button>
    </div>
    <div v-if="repairResult" class="repair-result" :class="{ error: repairResult.includes('失败') }">
      {{ repairResult }}
    </div>
    <div class="repair-item">
      <div class="repair-label">
        <span class="label-title">清理缓存</span>
        <span class="label-desc">清除本地缓存的图片、文件等</span>
      </div>
      <button class="repair-btn" @click="handleClearCache">清理</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.repair-settings { display: flex; flex-direction: column; gap: 4px; }

.repair-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid #f5f5f5;
}

.repair-label { display: flex; flex-direction: column; gap: 2px; }
.label-title { font-size: 14px; color: #333; }
.label-desc { font-size: 12px; color: #999; }

.repair-btn {
  height: 28px; padding: 0 14px; background: #fff; color: #3369fe;
  border: 1px solid #3369fe; border-radius: 4px; font-size: 12px; cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  &:hover:not(:disabled) { background: rgba(51, 105, 254, 0.05); }
}

.repair-result {
  padding: 8px 12px; background: #f0f9eb; color: #67c23a;
  border-radius: 4px; font-size: 13px;
  &.error { background: #fddcde; color: #f44e5a; }
}
</style>
