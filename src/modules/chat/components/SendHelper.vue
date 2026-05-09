<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '@/stores/useFileStore'
import pkg from '../../../../package.json'
import logoIcon from '@/assets/images/headNav/message/logo-icon.png'
import logoNumIcon from '@/assets/images/headNav/message/logo-num-icon.png'

const { t } = useI18n()
const fileStore = useFileStore()

const appVersion = ref(String(pkg.version ?? '1.0.0'))

const activeTasks = computed(() =>
  Array.from(fileStore.tasks.values()).filter((t) => t.status !== 'done'),
)

const completedTasks = computed(() =>
  Array.from(fileStore.tasks.values()).filter((t) => t.status === 'done'),
)

const hasAnyTasks = computed(
  () => activeTasks.value.length > 0 || completedTasks.value.length > 0,
)

function formatProgress(progress: number): string {
  return Math.round(progress * 100) + '%'
}

onMounted(async () => {
  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    appVersion.value = await getVersion()
  } catch {
    /* keep package.json version */
  }
})
</script>

<template>
  <div class="send-helper">
    <!-- 与 im send-helper.vue 一致：中间栏品牌图 + 版本号 -->
    <div class="brand-wrap" :class="{ compact: hasAnyTasks }">
      <div class="brand-inner">
        <div>
          <img class="login-icon" :src="logoIcon" alt="" />
        </div>
        <div>
          <img class="login-num-icon" :src="logoNumIcon" alt="" />
        </div>
        <div class="version">{{ t('版本信息') }} {{ appVersion }}</div>
      </div>
    </div>

    <div v-if="hasAnyTasks" class="tasks-section">
      <div class="helper-header">{{ t('文件传输') }}</div>
      <div v-if="activeTasks.length > 0" class="task-section">
        <div class="section-title">{{ t('传输中') }}</div>
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
        <div class="section-title">{{ t('已完成') }}</div>
        <div v-for="task in completedTasks" :key="task.id" class="task-item">
          <span class="task-icon">✅</span>
          <div class="task-info">
            <span class="task-name">{{ task.fileName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.send-helper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 对齐 im .message-send-helper-box */
.brand-wrap {
  flex: 1;
  position: relative;
  min-height: 200px;

  &.compact {
    flex: 0 0 auto;
    min-height: 160px;
  }
}

.brand-inner {
  position: absolute;
  top: 40%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.login-icon {
  width: 160px;
  display: block;
}

.login-num-icon {
  margin-top: 20px;
  height: 26px;
  display: block;
}

.version {
  font-size: 16px;
  color: #999;
  margin-top: 10px;
}

.tasks-section {
  flex-shrink: 0;
  border-top: 1px solid #f1f0f0;
}

.helper-header {
  padding: 10px 16px;
  font-size: 13px;
  color: #999;
}

.task-section {
  margin-bottom: 8px;
}

.section-title {
  padding: 4px 16px;
  font-size: 12px;
  color: #999;
  background: #f2f2f2;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
}

.task-icon {
  font-size: 16px;
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-name {
  font-size: 13px;
  color: #333;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-bar {
  height: 3px;
  background: #e8e8e8;
  border-radius: 2px;
  margin-top: 4px;
}

.progress-fill {
  height: 100%;
  background: #3369fe;
  border-radius: 2px;
  transition: width 0.3s;
}

.task-status {
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
}
</style>
