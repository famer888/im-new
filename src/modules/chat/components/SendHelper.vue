<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore } from '@/stores/useFileStore'

const fileStore = useFileStore()

const activeTasks = computed(() =>
  Array.from(fileStore.tasks.values()).filter((t) => t.status !== 'done'),
)

const completedTasks = computed(() =>
  Array.from(fileStore.tasks.values()).filter((t) => t.status === 'done'),
)

function formatProgress(progress: number): string {
  return Math.round(progress * 100) + '%'
}
</script>

<template>
  <div class="send-helper">
    <div class="helper-header">文件传输</div>
    <div v-if="activeTasks.length > 0" class="task-section">
      <div class="section-title">传输中</div>
      <div v-for="task in activeTasks" :key="task.id" class="task-item">
        <span class="task-icon">📎</span>
        <div class="task-info">
          <span class="task-name">{{ task.fileName }}</span>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: formatProgress(task.progress) }" />
          </div>
        </div>
        <span class="task-status">{{ formatProgress(task.progress) }}</span>
      </div>
    </div>
    <div v-if="completedTasks.length > 0" class="task-section">
      <div class="section-title">已完成</div>
      <div v-for="task in completedTasks" :key="task.id" class="task-item">
        <span class="task-icon">✅</span>
        <div class="task-info">
          <span class="task-name">{{ task.fileName }}</span>
        </div>
      </div>
    </div>
    <div v-if="activeTasks.length === 0 && completedTasks.length === 0" class="empty">
      暂无文件传输
    </div>
  </div>
</template>

<style lang="scss" scoped>
.send-helper { flex: 1; overflow-y: auto; }

.helper-header {
  padding: 10px 16px; font-size: 13px; color: #999;
}

.task-section { margin-bottom: 8px; }
.section-title { padding: 4px 16px; font-size: 12px; color: #999; background: #f2f2f2; }

.task-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
}

.task-icon { font-size: 16px; }

.task-info { flex: 1; min-width: 0; }
.task-name { font-size: 13px; color: #333; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.progress-bar {
  height: 3px; background: #e8e8e8; border-radius: 2px; margin-top: 4px;
}
.progress-fill { height: 100%; background: #3369fe; border-radius: 2px; transition: width 0.3s; }

.task-status { font-size: 12px; color: #999; flex-shrink: 0; }

.empty { text-align: center; padding: 40px; color: #ccc; font-size: 13px; }
</style>
