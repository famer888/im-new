<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

export interface MenuItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  divider?: boolean
}

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  items: MenuItem[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'select', key: string): void
}>()

const menuRef = ref<HTMLElement | null>(null)
const adjustedX = ref(0)
const adjustedY = ref(0)

watch(() => [props.visible, props.x, props.y], () => {
  if (props.visible) {
    adjustedX.value = props.x
    adjustedY.value = props.y

    requestAnimationFrame(() => {
      if (menuRef.value) {
        const rect = menuRef.value.getBoundingClientRect()
        if (rect.right > window.innerWidth) adjustedX.value = window.innerWidth - rect.width - 4
        if (rect.bottom > window.innerHeight) adjustedY.value = window.innerHeight - rect.height - 4
      }
    })
  }
})

function handleClick(item: MenuItem) {
  if (item.disabled || item.divider) return
  emit('select', item.key)
  emit('update:visible', false)
}

function handleOutside() {
  emit('update:visible', false)
}

onMounted(() => document.addEventListener('click', handleOutside))
onUnmounted(() => document.removeEventListener('click', handleOutside))
</script>

<template>
  <Teleport to="body">
    <Transition name="menu">
      <div
        v-if="visible"
        ref="menuRef"
        class="context-menu"
        :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
        @click.stop
        @contextmenu.prevent
      >
        <template v-for="item in items" :key="item.key">
          <div v-if="item.divider" class="menu-divider" />
          <div
            v-else
            :class="['menu-item', { danger: item.danger, disabled: item.disabled }]"
            @click="handleClick(item)"
          >
            <span v-if="item.icon" class="menu-icon">{{ item.icon }}</span>
            <span class="menu-label">{{ item.label }}</span>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.context-menu {
  position: fixed;
  z-index: 9800;
  min-width: 140px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  font-size: 13px;
  color: #333;
  cursor: pointer;

  &:hover { background: #f2f3f5; }
  &.danger { color: #f44e5a; &:hover { background: #fddcde; } }
  &.disabled { color: #c0c4cc; cursor: not-allowed; &:hover { background: transparent; } }
}

.menu-icon { font-size: 14px; width: 18px; text-align: center; }
.menu-divider { height: 1px; background: #ebeef5; margin: 4px 0; }

.menu-enter-active, .menu-leave-active { transition: all 0.15s ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: scale(0.95); }
</style>
