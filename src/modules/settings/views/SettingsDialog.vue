<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SystemSettings from '../components/SystemSettings.vue'
import ChatSettings from '../components/ChatSettings.vue'
import PrivacySettings from '../components/PrivacySettings.vue'
import LanguageSettings from '../components/LanguageSettings.vue'
import RepairSettings from '../components/RepairSettings.vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const { t } = useI18n()

type Tab = 'system' | 'chat' | 'privacy' | 'language' | 'repair'
const activeTab = ref<Tab>('chat')

const tabs = computed((): { key: Tab; label: string }[] => [
  { key: 'chat', label: t('聊天设置') },
  { key: 'system', label: t('系统设置') },
  { key: 'privacy', label: t('隐私设置') },
  { key: 'language', label: t('语言设置') },
  { key: 'repair', label: t('异常修复') },
])

function closeDialog() {
  emit('update:visible', false)
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && props.visible) {
    ev.preventDefault()
    closeDialog()
  }
}

watch(() => props.visible, (visible) => {
  if (visible) {
    window.addEventListener('keydown', onKeydown)
  }
  else {
    window.removeEventListener('keydown', onKeydown)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="closeDialog">
        <div class="settings-dialog">
          <button class="close-btn" type="button" @click="closeDialog">×</button>
          <nav class="settings-sidebar">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              :class="['sidebar-item', { active: activeTab === tab.key }]"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </nav>
          <section class="settings-content">
            <div class="content-body">
              <SystemSettings v-if="activeTab === 'system'" />
              <ChatSettings v-else-if="activeTab === 'chat'" />
              <PrivacySettings v-else-if="activeTab === 'privacy'" />
              <LanguageSettings v-else-if="activeTab === 'language'" />
              <RepairSettings v-else-if="activeTab === 'repair'" />
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-dialog {
  position: relative;
  display: flex;
  height: 310px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.settings-sidebar {
  border-right: 1px solid #eee;
  display: flex;
  flex-direction: column;

  .sidebar-item {
    display: block;
    height: 44px;
    line-height: 44px;
    text-align: center;
    padding: 0 18px;
    border: none;
    background: transparent;
    font-size: 14px;
    color: #333;
    position: relative;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }

    &.active {
      color: #3369fe;

      &:hover {
        opacity: 1;
      }

      &::after {
        content: '';
        position: absolute;
        width: 2px;
        height: 40%;
        background: #3369fe;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
      }
    }
  }
}

.settings-content {
  width: 353px;
  padding: 35px 16px 0 30px;
}

.content-body {
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}

.close-btn {
  position: absolute;
  right: 0;
  top: 0;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: #999;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
