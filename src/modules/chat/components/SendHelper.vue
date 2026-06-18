<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { API_CONFIG } from '@/api/config'
import { useFileStore } from '@/stores/useFileStore'
import pkg from '../../../../package.json'
import logo45 from '../../../../resources/icons_45/logo.png'
import logo97 from '../../../../resources/icons_97/logo.png'
import legacy55Logo from '@/assets/images/headNav/message/send-helper-logo-55.png'

const { t } = useI18n()
const fileStore = useFileStore()

const appVersion = ref(String(pkg.version ?? '1.0.0'))
const brandLogoMap = {
  '45': logo45,
  '97': logo97,
} as const
type StandardBrandId = keyof typeof brandLogoMap

const activeTasks = computed(() =>
  Array.from(fileStore.tasks.values()).filter((t) => t.status !== 'done'),
)

const completedTasks = computed(() =>
  Array.from(fileStore.tasks.values()).filter((t) => t.status === 'done'),
)

const hasAnyTasks = computed(
  () => activeTasks.value.length > 0 || completedTasks.value.length > 0,
)

// 55 传输助手沿用老 im 的独立 logo 位图，避免包图标的圆角素材误用到这里。
const isLegacy55Brand = computed(() => API_CONFIG.brandId === '55')
const brandLogo = computed(() =>
  isLegacy55Brand.value ? legacy55Logo : (brandLogoMap[API_CONFIG.brandId as StandardBrandId] || logo97),
)
const brandNumber = computed(() => API_CONFIG.brandId)
// 数字色值按品牌包对齐：45 默认沿用 55 蓝色，97 使用 97 紫蓝色。
const brandNumberColor = computed(() => API_CONFIG.brandId === '97' ? 'rgb(63, 85, 200)' : 'rgb(22, 138, 255)')

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
          <img class="login-icon" :src="brandLogo" alt="" />
        </div>
        <h1 class="brand-number" :style="{ color: brandNumberColor }">{{ brandNumber }}</h1>
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
  height: auto;
  display: block;
}

.brand-number {
  margin-top: 20px;
  line-height: 1;
  font-size: 30px;
  // 旧 im 这里是位图数字，文本实现需要用更黑的字体族来贴近原始粗细。
  font-family: 'Arial Black', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0.3px;
  // 用轻微倾斜替代 italic，避免倾斜角度过大。
  display: inline-block;
  transform: skewX(-8deg);
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
