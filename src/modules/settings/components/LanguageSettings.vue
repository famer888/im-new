<script setup lang="ts">
import { computed } from 'vue'
import { useSettingStore } from '@/stores/useSettingStore'
import { useI18n } from 'vue-i18n'

const settingStore = useSettingStore()
const { locale } = useI18n()

const languages = [
  { code: 'ch', name: '简体中文' },
  { code: 'tw', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'pt', name: 'Português' },
]

async function selectLanguage(code: string) {
  await settingStore.updateSettings({ language: code })
  locale.value = code
}
</script>

<template>
  <div class="language-settings">
    <div
      v-for="lang in languages"
      :key="lang.code"
      :class="['lang-item', { active: settingStore.settings.language === lang.code }]"
      @click="selectLanguage(lang.code)"
    >
      <span class="lang-name">{{ lang.name }}</span>
      <span v-if="settingStore.settings.language === lang.code" class="check-icon">✓</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.language-settings { display: flex; flex-direction: column; }

.lang-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 0; border-bottom: 1px solid #f5f5f5;
  cursor: pointer; font-size: 14px; color: #333;
  &:hover { background: #fafafa; }
  &.active { color: #3369fe; }
}

.check-icon { color: #3369fe; font-size: 16px; }
</style>
