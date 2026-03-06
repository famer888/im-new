<script setup lang="ts">
import { ref } from 'vue'
import SystemSettings from '../components/SystemSettings.vue'
import ChatSettings from '../components/ChatSettings.vue'
import PrivacySettings from '../components/PrivacySettings.vue'
import LanguageSettings from '../components/LanguageSettings.vue'
import RepairSettings from '../components/RepairSettings.vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

type Tab = 'system' | 'chat' | 'privacy' | 'language' | 'repair'
const activeTab = ref<Tab>('system')

const tabs: { key: Tab; label: string }[] = [
  { key: 'system', label: '系统设置' },
  { key: 'chat', label: '聊天设置' },
  { key: 'privacy', label: '隐私设置' },
  { key: 'language', label: '语言设置' },
  { key: 'repair', label: '修复' },
]
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="emit('update:visible', false)">
        <div class="settings-dialog">
          <div class="settings-sidebar">
            <div class="sidebar-header">设置</div>
            <div
              v-for="tab in tabs"
              :key="tab.key"
              :class="['sidebar-item', { active: activeTab === tab.key }]"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </div>
          </div>
          <div class="settings-content">
            <div class="content-header">
              <span>{{ tabs.find(t => t.key === activeTab)?.label }}</span>
              <button class="close-btn" @click="emit('update:visible', false)">×</button>
            </div>
            <div class="content-body">
              <SystemSettings v-if="activeTab === 'system'" />
              <ChatSettings v-else-if="activeTab === 'chat'" />
              <PrivacySettings v-else-if="activeTab === 'privacy'" />
              <LanguageSettings v-else-if="activeTab === 'language'" />
              <RepairSettings v-else-if="activeTab === 'repair'" />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center;
}

.settings-dialog {
  width: 600px; height: 460px; background: #fff; border-radius: 8px;
  display: flex; overflow: hidden;
}

.settings-sidebar {
  width: 160px; background: #f5f5f5; display: flex; flex-direction: column;
  .sidebar-header { padding: 16px; font-size: 15px; font-weight: 500; color: #333; }
  .sidebar-item {
    padding: 10px 16px; font-size: 13px; color: #666; cursor: pointer;
    &:hover { background: #eaeaea; }
    &.active { background: #e0e0e0; color: #333; font-weight: 500; }
  }
}

.settings-content {
  flex: 1; display: flex; flex-direction: column;
}

.content-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #ebeef5;
  font-size: 15px; font-weight: 500;
  .close-btn { background: none; border: none; font-size: 20px; color: #999; cursor: pointer; }
}

.content-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

.modal-enter-active, .modal-leave-active { transition: all 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
