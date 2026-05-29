<script setup lang="ts">
import TextAvatar from '@/components/TextAvatar.vue'
import { ref, watch, onMounted, onUnmounted } from 'vue'

export interface MenuItem {
  key: string
  label: string
  /** Emoji / character icon (conversation menu, default layout) */
  icon?: string
  /** Right-side image URL (message menu, im layout) */
  iconSrc?: string
  children?: MenuItem[]
  avatarName?: string
  avatarSrc?: string | null
  avatarType?: 'friend' | 'group' | 'channel' | 'member' | 'text'
  secondaryLabel?: string
  secondaryIconSrc?: string
  tone?: 'default' | 'title' | 'muted'
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
    variant?: 'default' | 'im' | 'editor'
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
const VIEWPORT_PADDING = 4
const SUBMENU_WIDTH = 152

watch(() => [props.visible, props.x, props.y, props.variant, props.items], () => {
  if (props.visible) {
    adjustedX.value = props.x
    adjustedY.value = props.y

    requestAnimationFrame(() => {
      if (menuRef.value) {
        const rect = menuRef.value.getBoundingClientRect()
        const shouldReserveSubmenuSpace =
          props.variant === 'im' && props.items.some((item) => item.children?.length)
        const reservedSubmenuWidth = shouldReserveSubmenuSpace ? SUBMENU_WIDTH : 0
        const maxVisibleX =
          window.innerWidth - rect.width - reservedSubmenuWidth - VIEWPORT_PADDING
        const nextX = Math.min(props.x, maxVisibleX)
        const nextY = rect.bottom > window.innerHeight - VIEWPORT_PADDING
          ? props.y - rect.height
          : props.y

        adjustedX.value = Math.max(
          VIEWPORT_PADDING,
          Math.min(nextX, window.innerWidth - rect.width - VIEWPORT_PADDING),
        )
        adjustedY.value = Math.max(
          VIEWPORT_PADDING,
          Math.min(nextY, window.innerHeight - rect.height - VIEWPORT_PADDING),
        )
      }
    })
  }
})

function handleClick(item: MenuItem) {
  if (item.disabled || item.divider || item.children?.length) return
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
        :class="[
          'context-menu',
          {
            'context-menu--im': variant === 'im',
            'context-menu--editor': variant === 'editor',
          },
        ]"
        :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
        @click.stop
        @contextmenu.prevent
      >
        <template v-for="item in items" :key="item.key">
          <div v-if="item.divider" class="menu-divider" />
          <div
            v-else-if="variant === 'im' || variant === 'editor'"
            :class="[
              'menu-item',
              variant === 'editor' ? 'menu-item--editor' : 'menu-item--im',
              { disabled: item.disabled },
            ]"
            @click="handleClick(item)"
          >
            <span class="menu-label">{{ item.label }}</span>
            <img v-if="item.iconSrc" class="menu-icon-img" :src="item.iconSrc" alt="" />
            <div v-if="item.children?.length" class="submenu">
              <div
                v-for="child in item.children"
                :key="child.key"
                :class="[
                  'submenu-item',
                  {
                    disabled: child.disabled,
                    'submenu-item--rich': child.avatarName,
                    'submenu-item--title': child.tone === 'title',
                    'submenu-item--muted': child.tone === 'muted',
                  },
                ]"
                @click.stop="handleClick(child)"
              >
                <template v-if="child.avatarName">
                  <TextAvatar
                    class="submenu-avatar"
                    :name="child.avatarName"
                    :src="child.avatarSrc || undefined"
                    :size="28"
                    :avatar-type="child.avatarType || 'friend'"
                    rounded
                  />
                  <div class="submenu-info">
                    <span class="submenu-name">{{ child.label }}</span>
                    <span v-if="child.secondaryLabel" class="submenu-meta">
                      <img v-if="child.secondaryIconSrc" class="submenu-meta-icon" :src="child.secondaryIconSrc" alt="" />
                      {{ child.secondaryLabel }}
                    </span>
                  </div>
                </template>
                <template v-else>
                  {{ child.label }}
                </template>
              </div>
            </div>
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
  z-index: 11000;
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

.menu-label {
  font-weight: 400;
}

.context-menu--im {
  min-width: 180px;
  width: 180px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  box-shadow: none;
}

.menu-item--im {
  position: relative;
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

    .submenu {
      opacity: 1;
      pointer-events: auto;
    }
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

.context-menu--editor {
  width: 160px;
  min-width: 160px;
  padding: 0;
  border: none;
  border-radius: 8px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
}

.menu-item--editor {
  position: relative;
  justify-content: space-between;
  gap: 8px;
  height: auto;
  min-height: 0;
  padding: 10px;
  color: #000;
  font-size: 14px;

  &::after {
    content: "";
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 0;
    height: 1px;
    background: #f0f0f0;
  }

  &:last-child::after {
    background: none;
  }

  &:hover {
    background: #fafafa;

    .submenu {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &.disabled {
    color: #c0c4cc;
    &:hover { background: transparent; }
  }

  .menu-label {
    flex: 1;
  }

  .menu-icon-img {
    flex-shrink: 0;
    max-width: 16px;
    max-height: 16px;
    object-fit: contain;
  }
}

.submenu {
  position: absolute;
  z-index: 1;
  left: 160px;
  top: 0;
  min-width: 160px;
  max-height: 280px;
  overflow-y: auto;
  padding: 0 10px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
  opacity: 0;
  pointer-events: none;
}

.context-menu--im .submenu {
  left: calc(100% - 1px);
  top: -1px;
  min-width: 130px;
  padding: 10px;
  border: 1px solid #f0f0f0;
  box-shadow: none;
}

.context-menu--im .menu-item--im:last-child .submenu {
  top: auto;
  bottom: -1px;
}

.submenu-item {
  padding: 10px 0;
  cursor: pointer;
  font-size: 14px;
  font-weight: 400;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.disabled {
    color: #c0c4cc;
    cursor: not-allowed;
  }
}

.context-menu--im .submenu-item {
  padding: 0;
}

.context-menu--im .submenu-item + .submenu-item {
  margin-top: 10px;
}

.submenu-item--rich {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: normal;
}

.submenu-avatar {
  flex-shrink: 0;
}

.submenu-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.submenu-name {
  width: 80px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.2;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.submenu-meta {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.2;
  color: #999;
  white-space: nowrap;
}

.submenu-meta-icon {
  height: 12px;
  width: auto;
}

.submenu-item--title {
  font-weight: 400;
  color: #000;
  cursor: default;
}

.submenu-item--muted {
  color: #999;
  cursor: default;
}

.submenu-item.disabled.submenu-item--title {
  color: #000;
}

.submenu-item.disabled.submenu-item--muted {
  color: #999;
}

.submenu-item.disabled.submenu-item--rich {
  color: inherit;
  cursor: default;
}

.menu-enter-active, .menu-leave-active { transition: all 0.15s ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: scale(0.95); }
</style>
