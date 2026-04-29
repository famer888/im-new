<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { emojiObj } from '@/utils/emoji'
import emojIcon from '@/assets/images/chat/emoj-icon.png'
import ownIcon from '@/assets/images/chat/own-icon.png'
import arrowIcon from '@/assets/images/chat/jiantou-icon.png'
import touzi from '@/assets/images/message/touz_6.jpg'

const props = withDefaults(defineProps<{
  definedHidden?: boolean
  chatType?: string
}>(), {
  definedHidden: false,
  chatType: '',
})

const emit = defineEmits<{
  (e: 'select', emoji: string): void
  (e: 'select-dice'): void
  (e: 'close'): void
}>()

const activeTab = ref<'emoji' | 'sticker'>('emoji')
const showCustomTab = computed(() => !props.definedHidden && props.chatType !== 'channel')

watch(showCustomTab, (visible) => {
  if (!visible) activeTab.value = 'emoji'
})

const emojis = Object.entries(emojiObj).map(([key, value]) => ({
  key,
  value,
  src: `/images/emoji/${value}.png`,
}))

const stickers = [
  { key: 'dice', src: touzi, type: 2 },
]

function handleSelect(emoji: string) {
  emit('select', emoji)
}

function handleStickerSelect(type: number) {
  if (type === 2) {
    emit('select-dice')
  }
}
</script>

<template>
  <div class="emoji-picker" @click.stop>
    <div class="picker-tabs">
      <button
        :class="['tab', { active: activeTab === 'emoji' }]"
        type="button"
        :title="$t('表情')"
        @click="activeTab = 'emoji'"
      >
        <img :src="emojIcon" alt="" />
      </button>
      <button
        v-if="showCustomTab"
        :class="['tab', { active: activeTab === 'sticker' }]"
        type="button"
        title="贴图"
        @click="activeTab = 'sticker'"
      >
        <img :src="ownIcon" alt="" />
      </button>
    </div>
    <ul v-if="activeTab === 'emoji'" class="emoji-grid">
      <li
        v-for="emoji in emojis"
        :key="emoji.key"
        class="emoji-item"
        @click="handleSelect(emoji.key)"
      >
        <img :src="emoji.src" :alt="emoji.key" />
      </li>
    </ul>
    <ul v-else class="emoji-grid sticker-grid">
      <li
        v-for="item in stickers"
        :key="item.key"
        class="sticker-item"
        @click.stop="handleStickerSelect(item.type)"
      >
        <img :src="item.src" alt="" />
      </li>
    </ul>
    <img class="picker-arrow" :src="arrowIcon" alt="" />
  </div>
</template>

<style lang="scss" scoped>
.emoji-picker {
  width: 300px;
  height: 400px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #cccccc;
  box-shadow: 0 5px 10px rgba(0, 0, 0, 0.05);
  position: relative;
}

.picker-tabs {
  display: flex;
  border-bottom: 1px solid #e5e5e5;
  padding: 5px 10px;

  .tab {
    height: 32px;
    margin-right: 10px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    border-radius: 17px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &.active {
      background: #f4f6f9;
    }

    img {
      display: block;
      width: 23px;
      height: 23px;
      object-fit: contain;
    }
  }
}

.emoji-grid {
  position: absolute;
  top: 50px;
  left: 0;
  right: 0;
  bottom: 0;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  padding: 0;
  margin: 0;
  list-style: none;
}

.emoji-item,
.sticker-item {
  width: 41px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  img {
    display: block;
    width: 23px;
    height: 23px;
    object-fit: contain;
  }
}

.sticker-grid {
  .sticker-item {
    width: 80px;
    height: 80px;

    img {
      width: 50px;
      height: auto;
    }
  }
}

.picker-arrow {
  position: absolute;
  bottom: -24px;
  left: 60px;
}
</style>
