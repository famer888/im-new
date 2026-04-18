import { type Ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 与 im `editor.vue` 中 `closeOperator` / 点击输入区关闭表情层一致：
 * 打开表情后无需必选表情即可关闭（点外部、Esc、再次点表情按钮由业务侧 toggle）。
 */
export function useEmojiPanelDismiss(
  showEmoji: Ref<boolean>,
  toggleRef: Ref<HTMLElement | null>,
  panelRef: Ref<HTMLElement | null>,
) {
  function onDocPointerDown(e: PointerEvent) {
    if (!showEmoji.value) return
    const t = e.target as Node
    if (toggleRef.value?.contains(t)) return
    if (panelRef.value?.contains(t)) return
    showEmoji.value = false
  }

  function onDocKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !showEmoji.value) return
    e.preventDefault()
    e.stopPropagation()
    showEmoji.value = false
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeydown, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    document.removeEventListener('keydown', onDocKeydown, true)
  })
}
