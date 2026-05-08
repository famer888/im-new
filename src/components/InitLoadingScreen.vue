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
    <div v-if="visible" class="init-screen">
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
  top: 28px;
  right: 22px;
  border: none;
  background: transparent;
  color: #b8b8b8;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover:not(:disabled) {
    color: #8b8b8b;
  }

  &:disabled {
    opacity: 0.7;
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
  width: 144px;
  height: 144px;
  object-fit: contain;
}

.loading-dots {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 18px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3369fe;
  animation: init-dot-bounce 1.2s infinite ease-in-out both;
}

.dot-2 {
  animation-delay: 0.16s;
}

.dot-3 {
  animation-delay: 0.32s;
}

.loading-text {
  margin: 22px 0 0;
  color: #666;
  font-size: 18px;
  line-height: 1;
  font-weight: 600;
}

.loading-text--error {
  color: #f44e5a;
}

.init-progress {
  width: 220px;
  margin-top: 12px;
  text-align: center;

  h3 {
    margin: 0 0 8px;
    color: #222;
    font-size: 16px;
    line-height: 22px;
    font-weight: 700;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    position: relative;
    height: 28px;
    margin-top: 6px;
    overflow: hidden;
    border-radius: 14px;
    background: #747474;
  }

  span {
    position: relative;
    z-index: 1;
    display: block;
    color: #fff;
    font-size: 14px;
    line-height: 28px;
    font-weight: 700;
  }

  p {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    margin: 0;
    border-radius: inherit;
    background: #44c917;
    transition: width 0.22s ease;
  }
}

.reload-button {
  margin-top: 18px;
  min-width: 112px;
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: 17px;
  background: #3369fe;
  color: #fff;
  font-size: 14px;
  line-height: 34px;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;

  &:hover {
    opacity: 0.92;
    transform: translateY(-1px);
  }
}

@keyframes init-dot-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.45;
  }

  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
