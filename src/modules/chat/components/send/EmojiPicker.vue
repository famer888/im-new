<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ (e: 'select', emoji: string): void; (e: 'close'): void }>()

const activeTab = ref<'emoji' | 'sticker'>('emoji')

const emojis = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉',
  '😊', '😇', '🥰', '😍', '😘', '😗', '😚', '😙', '🥲', '😋',
  '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡',
  '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬',
  '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
  '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎',
  '🤓', '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳',
  '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
  '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠',
  '👍', '👎', '👋', '🤝', '👏', '🙏', '❤️', '💔', '🎉', '🔥',
]

function handleSelect(emoji: string) {
  emit('select', emoji)
}
</script>

<template>
  <div class="emoji-picker" @click.stop>
    <div class="picker-tabs">
      <button :class="['tab', { active: activeTab === 'emoji' }]" @click="activeTab = 'emoji'">表情</button>
      <button :class="['tab', { active: activeTab === 'sticker' }]" @click="activeTab = 'sticker'">贴图</button>
    </div>
    <div v-if="activeTab === 'emoji'" class="emoji-grid">
      <button
        v-for="emoji in emojis"
        :key="emoji"
        class="emoji-item"
        @click="handleSelect(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
    <div v-else class="sticker-grid">
      <div class="sticker-empty">暂无贴图</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.emoji-picker {
  width: 340px;
  height: 280px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.picker-tabs {
  display: flex;
  border-bottom: 1px solid #ebeef5;

  .tab {
    flex: 1;
    height: 36px;
    background: none;
    border: none;
    font-size: 13px;
    color: #666;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    &.active { color: #3369fe; border-bottom-color: #3369fe; }
    &:hover:not(.active) { color: #333; }
  }
}

.emoji-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
  padding: 8px;
}

.emoji-item {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  &:hover { background: #f2f3f5; }
}

.sticker-grid {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sticker-empty {
  color: #ccc;
  font-size: 13px;
}
</style>
