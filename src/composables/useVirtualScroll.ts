import { ref, computed, onMounted, onUnmounted, watch, type Ref } from 'vue'

interface VirtualScrollOptions<T> {
  items: Ref<T[]>
  estimatedItemHeight: number
  bufferSize?: number
  containerRef: Ref<HTMLElement | null>
  getItemKey: (item: T) => string
}

export function useVirtualScroll<T>({
  items,
  estimatedItemHeight,
  bufferSize = 5,
  containerRef,
  getItemKey,
}: VirtualScrollOptions<T>) {
  const scrollTop = ref(0)
  const containerHeight = ref(0)
  const heightCache = new Map<string, number>()
  const resizeObserver = ref<ResizeObserver | null>(null)

  const totalHeight = computed(() => {
    let total = 0
    for (const item of items.value) {
      const key = getItemKey(item)
      total += heightCache.get(key) ?? estimatedItemHeight
    }
    return total
  })

  const visibleRange = computed(() => {
    let accHeight = 0
    let startIndex = 0
    let endIndex = items.value.length - 1

    // Find start
    for (let i = 0; i < items.value.length; i++) {
      const key = getItemKey(items.value[i])
      const height = heightCache.get(key) ?? estimatedItemHeight
      if (accHeight + height >= scrollTop.value) {
        startIndex = Math.max(0, i - bufferSize)
        break
      }
      accHeight += height
    }

    // Find end
    accHeight = 0
    for (let i = 0; i < items.value.length; i++) {
      const key = getItemKey(items.value[i])
      accHeight += heightCache.get(key) ?? estimatedItemHeight
      if (accHeight >= scrollTop.value + containerHeight.value) {
        endIndex = Math.min(items.value.length - 1, i + bufferSize)
        break
      }
    }

    return { start: startIndex, end: endIndex }
  })

  const visibleItems = computed(() => {
    const { start, end } = visibleRange.value
    return items.value.slice(start, end + 1).map((item, i) => ({
      item,
      index: start + i,
      key: getItemKey(item),
    }))
  })

  const offsetTop = computed(() => {
    let offset = 0
    for (let i = 0; i < visibleRange.value.start; i++) {
      const key = getItemKey(items.value[i])
      offset += heightCache.get(key) ?? estimatedItemHeight
    }
    return offset
  })

  function onScroll() {
    if (containerRef.value) {
      scrollTop.value = containerRef.value.scrollTop
    }
  }

  function updateItemHeight(key: string, height: number) {
    if (height > 0) {
      heightCache.set(key, height)
    }
  }

  function scrollToBottom(smooth = false) {
    if (containerRef.value) {
      containerRef.value.scrollTo({
        top: totalHeight.value,
        behavior: smooth ? 'smooth' : 'instant',
      })
    }
  }

  function scrollToItem(key: string) {
    let offset = 0
    for (const item of items.value) {
      const itemKey = getItemKey(item)
      if (itemKey === key) break
      offset += heightCache.get(itemKey) ?? estimatedItemHeight
    }
    if (containerRef.value) {
      containerRef.value.scrollTop = offset
    }
  }

  /**
   * 根据滚动偏移找到「视口顶端」落在哪一条消息上（与旧 im 用 offsetTop 遍历等效，供浮动日期条使用）。
   */
  function indexAtScrollTop(scrollTopValue: number): number {
    const list = items.value
    if (list.length === 0) return 0
    let acc = 0
    for (let i = 0; i < list.length; i++) {
      const key = getItemKey(list[i])
      const h = heightCache.get(key) ?? estimatedItemHeight
      if (scrollTopValue >= acc && scrollTopValue < acc + h) {
        return i
      }
      acc += h
    }
    return list.length - 1
  }

  onMounted(() => {
    if (containerRef.value) {
      containerHeight.value = containerRef.value.clientHeight
      containerRef.value.addEventListener('scroll', onScroll, { passive: true })

      resizeObserver.value = new ResizeObserver(() => {
        if (containerRef.value) {
          containerHeight.value = containerRef.value.clientHeight
        }
      })
      resizeObserver.value.observe(containerRef.value)
    }
  })

  onUnmounted(() => {
    if (containerRef.value) {
      containerRef.value.removeEventListener('scroll', onScroll)
    }
    resizeObserver.value?.disconnect()
  })

  return {
    visibleItems,
    totalHeight,
    offsetTop,
    scrollTop,
    containerHeight,
    updateItemHeight,
    scrollToBottom,
    scrollToItem,
    visibleRange,
    indexAtScrollTop,
  }
}
