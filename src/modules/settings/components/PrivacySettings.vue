<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/stores/useSettingStore'
import AppSwitch from '@/components/AppSwitch.vue'

const { t: $t } = useI18n()
const settingStore = useSettingStore()

onMounted(() => {
  if (!settingStore.loaded) void settingStore.loadSettings()
})

async function onFriendVerifyChange(v: boolean) {
  await settingStore.updateSettings({ friendVerifyRequired: v })
}
</script>

<template>
  <div class="com-setting-dialog-privacy">
    <h3>{{ $t('设置') }}</h3>
    <dl>
      <dt>{{ $t('加我为朋友时需要验证') }}</dt>
      <dd>
        <AppSwitch
          :model-value="settingStore.settings.friendVerifyRequired"
          @update:model-value="onFriendVerifyChange"
        />
      </dd>
    </dl>
  </div>
</template>

<style lang="scss" scoped>
.com-setting-dialog-privacy {
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
}
</style>
