<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

export interface MenuItem {
  key: string
  label: string
  /** Emoji / character icon (conversation menu, default layout) */
  icon?: string
  /** Right-side image URL (message menu, im layout) */
  iconSrc?: string
  danger?: boolean
  disabled?: boolean
  divider?: boolean
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    x: number
    y: number
    items: MenuItem[]
    /** Align with legacy im message menu: label left, 16px icon right, row borders */
    variant?: 'default' | 'im'
  }>(),
  { variant: 'default' },
)

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
        :class="['context-menu', { 'context-menu--im': variant === 'im' }]"
        :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
        @click.stop
        @contextmenu.prevent
      >
        <template v-for="item in items" :key="item.key">
          <div v-if="item.divider" class="menu-divider" />
          <div
            v-else-if="variant === 'im'"
            :class="['menu-item', 'menu-item--im', { disabled: item.disabled }]"
            @click="handleClick(item)"
          >
            <span class="menu-label">{{ item.label }}</span>
            <img v-if="item.iconSrc" class="menu-icon-img" :src="item.iconSrc" alt="" />
          </div>
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

.context-menu--im {
  min-width: 180px;
  width: 180px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  box-shadow: none;
}

.menu-item--im {
  justify-content: space-between;
  gap: 8px;
  height: auto;
  min-height: 0;
  padding: 0 10px;
  border-bottom: 1px solid #f0f0f0;
  color: #000;
  font-size: 14px;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #fafafa;
  }

  &.disabled {
    color: #c0c4cc;
    &:hover { background: transparent; }
  }

  .menu-label {
    flex: 1;
    padding: 10px 0;
  }

  .menu-icon-img {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    object-fit: contain;
  }
}

.menu-enter-active, .menu-leave-active { transition: all 0.15s ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: scale(0.95); }
</style>
