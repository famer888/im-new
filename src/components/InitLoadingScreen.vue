<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import brandIcon from '@/assets/images/common/defalut-icon.png'

defineProps<{
  visible: boolean
  text?: string
  resetting?: boolean
  offline?: boolean
  showReload?: boolean
  progressMode?: boolean
  friendProgress?: number
  chatProgress?: number
}>()

const emit = defineEmits<{
  (e: 'reset'): void
  (e: 'reload'): void
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="init-screen" data-tauri-drag-region>
      <button
        type="button"
        class="reset-link"
        :disabled="resetting"
        @click="emit('reset')"
      >
        {{ t('退出，重置数据') }}
      </button>

      <div class="init-center">
        <img class="brand-icon" :src="brandIcon" alt="" />

        <div class="init-body">
          <div v-if="progressMode && !offline" class="init-progress">
            <h3>{{ t('首次数据初始化') }}</h3>
            <ul>
              <li>
                <span>{{ t('好友') }} {{ (friendProgress ?? 0).toFixed(1) }}%</span>
                <p :style="{ width: `${Math.min(100, Math.max(0, friendProgress ?? 0)).toFixed(1)}%` }"></p>
              </li>
              <li>
                <span>{{ t('聊天窗口') }} {{ Math.round(chatProgress ?? 0) }}%</span>
                <p :style="{ width: `${Math.min(100, Math.max(0, chatProgress ?? 0))}%` }"></p>
              </li>
            </ul>
          </div>

          <template v-else>
            <div class="loading-dots" aria-hidden="true">
              <span class="dot dot-1" />
              <span class="dot dot-2" />
              <span class="dot dot-3" />
            </div>

            <p class="loading-text" :class="{ 'loading-text--error': offline }">
              {{ offline ? t('当前网络异常，请检查网络设置') : text || t('加载中') }}
            </p>
          </template>

          <button
            v-if="showReload"
            type="button"
            class="reload-button"
            @click="emit('reload')"
          >
            {{ t('重新加载') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.init-screen {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: #fff;
  overflow: hidden;
}

.reset-link {
  position: absolute;
  top: 30px;
  right: 10px;
  -webkit-app-region: no-drag;
  border: none;
  padding: 0;
  background: transparent;
  color: #666;
  font-size: 12px;
  line-height: 1;
  font-weight: 400;
  opacity: 0.5;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover:not(:disabled) {
    opacity: 1;
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
}

.init-center {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -50%);
}

.brand-icon {
  display: block;
  width: 80px;
  height: auto;
  margin-bottom: 10px;
  object-fit: contain;
}

.init-body {
  height: 150px;
}

.loading-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3369fe;
  animation: init-dot-grow 1.2s infinite ease-in-out both;
}

.dot-2 {
  margin: 0 10px;
  animation-delay: 0.15555s;
}

.dot-3 {
  animation-delay: 0.3s;
}

.loading-text {
  margin: 0;
  color: #666;
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  text-align: center;
}

.loading-text--error {
  color: #f00;
}

.init-progress {
  width: 200px;
  text-align: center;

  h3 {
    margin: 0 0 5px;
    color: #000;
    font-size: 14px;
    line-height: 20px;
    font-weight: 700;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    position: relative;
    width: 200px;
    height: 25px;
    margin-bottom: 5px;
    overflow: hidden;
    border-radius: 25px;
    background: #666;
  }

  span {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1;
    white-space: nowrap;
    color: #fff;
    font-size: 12px;
    line-height: 25px;
    font-weight: 400;
  }

  p {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    height: 100%;
    margin: 0;
    border-radius: inherit;
    background: rgb(82, 196, 26);
    transition: width 0.5s ease;
  }
}

.reload-button {
  display: block;
  margin: 10px auto;
  -webkit-app-region: no-drag;
  min-width: 88px;
  height: 30px;
  padding: 0 16px;
  border: none;
  border-radius: 15px;
  background: #3369fe;
  color: #fff;
  font-size: 12px;
  line-height: 30px;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.92;
  }
}

@keyframes init-dot-grow {
  0%,
  40%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}
</style>
