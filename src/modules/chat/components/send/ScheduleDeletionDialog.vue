<template>
  <div v-if="visible" class="rcheduleDeletionConfigDialog" @click.stop>
    <div>
      <picture @click.stop="$emit('close')">
        <img :src="closeIcon" alt="" />
      </picture>
      <h2>{{ $t('设置消息已读后销毁时间') }}</h2>
      <div class="picker-wrap">
        <div class="picker-overlay-top" />
        <div class="picker-overlay-bottom" />
        <div class="picker-center-line" />
        <div ref="pickerRef" class="picker-list" @scroll="handleScroll">
          <div
            v-for="item in options"
            :key="item.value"
            :class="['picker-item', { active: selectedTime === item.value }]"
            @click="handleItemClick(item.value)"
          >
            {{ item.label }}
          </div>
        </div>
      </div>
      <div class="footer">
        <div class="button-cancel left" @click="handleCloseReadBurn">
          {{ $t('关闭') }}
        </div>
        <div class="right">
          <div class="button-cancel" @click="$emit('close')">{{ $t('取消') }}</div>
          <div class="button-submit" @click="handleSave">{{ $t('保存') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import closeIcon from '@/assets/images/common/close-icon.png'
import { READ_BURN_TIME_OPTIONS } from '@/utils/readBurn'

const props = defineProps<{ visible: boolean; currentTime?: number }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', seconds: number): void
}>()

const options = computed(() => READ_BURN_TIME_OPTIONS)
const selectedTime = ref(30)
const pickerRef = ref<HTMLDivElement | null>(null)
const ITEM_HEIGHT = 32

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    selectedTime.value = props.currentTime || 30
    await nextTick()
    scrollToValue(selectedTime.value)
  },
  { immediate: true },
)

function scrollToValue(value: number) {
  const idx = options.value.findIndex((it) => it.value === value)
  if (idx < 0 || !pickerRef.value) return
  pickerRef.value.scrollTop = Math.max(0, idx * ITEM_HEIGHT)
}

function handleItemClick(value: number) {
  selectedTime.value = value
  scrollToValue(value)
}

function handleScroll() {
  if (!pickerRef.value) return
  const idx = Math.round(pickerRef.value.scrollTop / ITEM_HEIGHT)
  const clamped = Math.max(0, Math.min(idx, options.value.length - 1))
  selectedTime.value = options.value[clamped].value
}

function handleSave() {
  emit('confirm', selectedTime.value)
  emit('close')
}

function handleCloseReadBurn() {
  emit('confirm', 0)
  emit('close')
}
</script>

<style scoped lang="scss">
.rcheduleDeletionConfigDialog {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.2);

  > div {
    background: #fff;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 10px 16px;
    border-radius: 8px;
    width: 400px;
    box-sizing: border-box;
  }
}

picture {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

h2 {
  margin: 0;
  padding: 0;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.picker-wrap {
  position: relative;
  height: 160px;
  margin-top: 12px;
  overflow: hidden;
}

.picker-list {
  height: 160px;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 64px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-snap-type: y mandatory;

  &::-webkit-scrollbar {
    display: none;
  }
}

.picker-item {
  height: 32px;
  line-height: 32px;
  text-align: center;
  color: #c9c9c9;
  font-size: 14px;
  scroll-snap-align: center;
  user-select: none;

  &.active {
    color: #000 !important;
    font-weight: 600;
    font-size: 28px;
    transform: scale(0.5);
    transform-origin: center center;
  }
}

.picker-center-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  border-top: 1px solid #b9bcc4;
  border-bottom: 1px solid #b9bcc4;
  height: 32px;
  pointer-events: none;
}

.picker-overlay-top,
.picker-overlay-bottom {
  position: absolute;
  left: 0;
  right: 0;
  height: 48px;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(to bottom, #fff, rgba(255, 255, 255, 0));
}

.picker-overlay-top {
  top: 0;
}

.picker-overlay-bottom {
  bottom: 0;
  transform: rotate(180deg);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
}

.right {
  display: flex;
  align-items: center;
}

.button-cancel,
.button-submit {
  width: 52px;
  height: 24px;
  background: #d5d6da;
  color: #fff;
  font-size: 14px;
  text-align: center;
  line-height: 24px;
  border-radius: 4px;
  cursor: pointer;
}

.button-cancel.left {
  width: 52px;
}

.button-submit {
  background: #178aff;
  margin-left: 10px;
}
</style>
