<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/stores/useSettingStore'

const { t: $t } = useI18n()
const settingStore = useSettingStore()
const { locale } = useI18n()

/** 与 im language 列表顺序、文案一致；code 使用本项目 vue-i18n 的 locale */
const languageOptions = [
  { code: 'en', label: 'English' },
  { code: 'ch', label: '中文' },
  { code: 'tw', label: '繁体' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'pt', label: 'Português' },
] as const

const languageLabels = languageOptions.map((o) => o.label)

const languageIndex = computed(() => {
  const i = languageOptions.findIndex((o) => o.code === settingStore.settings.language)
  return i >= 0 ? i : 1
})

const currentLabel = computed(() => languageLabels[languageIndex.value] ?? languageLabels[1])

onMounted(() => {
  if (!settingStore.loaded) void settingStore.loadSettings()
})

async function handleLanguageSet(index: number) {
  const opt = languageOptions[index]
  if (!opt) return
  await settingStore.updateSettings({ language: opt.code })
  locale.value = opt.code
}
</script>

<template>
  <div class="com-setting-dialog-language">
    <h3>{{ $t('语言') }}</h3>
    <dl>
      <dt>{{ $t('选择语言') }}</dt>
      <dd>
        <div class="select">
          <span>{{ currentLabel }}</span>
          <span class="choice-caret" aria-hidden="true" />
          <ul>
            <li
              v-for="(item, index) in languageLabels"
              :key="item"
              @click="handleLanguageSet(index)"
            >
              {{ item }}
            </li>
          </ul>
        </div>
      </dd>
    </dl>
  </div>
</template>

<style lang="scss" scoped>
.com-setting-dialog-language {
  > h3 {
    line-height: 40px;
    margin: 0;
    color: #999;
    font-size: 14px;
    font-weight: 400;
  }

  > dl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 10px;

    > dt {
      font-size: 14px;
      color: #333;
    }

    > dd {
      margin: 0;
    }
  }

  .select {
    padding: 5px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 150px;
    background: #f5f5f5;
    border-radius: 4px;
    position: relative;
    box-sizing: border-box;
    font-family: 'Times New Roman', serif;

    > span:first-of-type {
      font-size: 14px;
      color: #333;
    }
  }

  .choice-caret {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid #999;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .select {
    cursor: pointer;

    &:hover > ul {
      display: block;
    }

    > ul {
      position: absolute;
      top: 28px;
      left: 0;
      background: #fff;
      z-index: 10;
      margin: 0;
      width: 150px;
      padding: 0;
      list-style: none;
      box-shadow: 0 20px 60px -2px rgb(27 33 58 / 40%);
      border-radius: 3px;
      display: none;

      > li {
        line-height: 30px;
        padding-left: 10px;
        font-size: 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;

        &:hover {
          opacity: 0.8;
        }

        &:last-child {
          border-bottom: none;
        }
      }
    }
  }
}
</style>
