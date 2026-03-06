<template>
  <div v-if="visible" class="up-version-dialog">
    <div class="dialog-mask" />
    <div class="dialog-body">
      <div class="renew-icon">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r="30" fill="#3369fe" />
          <path d="M32 18v20M24 30l8-8 8 8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" />
          <line x1="22" y1="44" x2="42" y2="44" stroke="#fff" stroke-width="3" stroke-linecap="round" />
        </svg>
      </div>
      <h2>{{ $t('发现新版本') }} {{ info.version }}</h2>
      <h3 v-if="info.title">{{ info.title }}</h3>
      <div class="update-content">
        <p v-for="(line, i) in contentLines" :key="i">{{ line }}</p>
      </div>
      <div class="dialog-actions">
        <div v-if="info.flag != 2" class="btn-later" @click="handleLater">
          {{ $t('稍后更新') }}
        </div>
        <a class="btn-primary btn-update" target="_blank" :href="info.url">
          {{ $t('立即升級') }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

export interface VersionInfo {
  version: string
  title?: string
  content?: string
  url: string
  flag?: number
}

const props = defineProps<{
  visible: boolean
  info: VersionInfo
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const contentLines = computed(() => {
  return (props.info.content || '').split('\n').filter(Boolean)
})

function handleLater() {
  const key = 'upVersionDay'
  localStorage.setItem(key, new Date().toDateString())
  emit('close')
}
</script>

<style lang="scss" scoped>
.up-version-dialog {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}

.dialog-body {
  position: relative;
  width: 360px;
  background: #fff;
  border-radius: 12px;
  padding: 30px 24px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.renew-icon {
  margin-bottom: 16px;
}

h2 {
  font-size: 18px;
  color: #333;
  margin-bottom: 6px;
}

h3 {
  font-size: 14px;
  color: #666;
  font-weight: normal;
  margin-bottom: 12px;
}

.update-content {
  text-align: left;
  padding: 12px;
  background: #f8f8f8;
  border-radius: 6px;
  margin-bottom: 20px;
  max-height: 200px;
  overflow-y: auto;

  p {
    font-size: 13px;
    color: #666;
    line-height: 1.6;
  }
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.btn-later {
  cursor: pointer;
  font-size: 13px;
  color: #999;
  &:hover { color: #666; }
}

.btn-update {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  background: #3369fe;
  color: #fff;
  border-radius: 6px;
  font-size: 15px;
  text-decoration: none;
  &:hover { opacity: 0.9; }
}
</style>
