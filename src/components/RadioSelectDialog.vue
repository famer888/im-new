<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import closeIcon from '@/assets/images/common/close-icon.png'
import checkBoxIcon from '@/assets/images/message/checkBox.png'
import checkBoxedIcon from '@/assets/images/message/checkBoxed.png'

const props = defineProps<{
  title: string
  radioTextList: string[]
}>()

const emit = defineEmits<{
  (e: 'submit', index: number): void
}>()

const indexActive = ref(0)

function onKeydown(ev: KeyboardEvent) {
  switch (ev.key) {
    case 'ArrowDown':
      if (indexActive.value < props.radioTextList.length - 1) {
        indexActive.value++
      }
      break
    case 'ArrowUp':
      if (indexActive.value > 0) {
        indexActive.value--
      }
      break
    case 'Enter':
      ev.preventDefault()
      emit('submit', indexActive.value)
      break
    case 'Escape':
      ev.preventDefault()
      emit('submit', -1)
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="radio-select-overlay" @click.self="emit('submit', -1)">
      <div class="radio-select-dialog">
        <img
          class="close-btn"
          :src="closeIcon"
          alt=""
          @click="emit('submit', -1)"
        />
        <h1 v-if="title">{{ title }}</h1>
        <ul>
          <li
            v-for="(item, index) in radioTextList"
            :key="index"
            :class="{ active: indexActive === index }"
            @click="indexActive = index"
          >
            <img :src="checkBoxIcon" class="icon-unchecked" alt="" />
            <img :src="checkBoxedIcon" class="icon-checked" alt="" />
            {{ item }}
          </li>
        </ul>
        <div class="btn-row">
          <button class="btn-confirm" @click="emit('submit', indexActive)">确定</button>
          <button class="btn-cancel" @click="emit('submit', -1)">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.radio-select-overlay {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: 11000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radio-select-dialog {
  position: relative;
  width: 300px;
  background-color: #fff;
  padding: 20px 16px 10px;
  border-radius: 8px;
  font-size: 12px;

  .close-btn {
    position: absolute;
    right: 10px;
    top: 10px;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }
  }

  > h1 {
    height: 30px;
    line-height: 30px;
    margin: 0;
    padding: 0;
    font-size: 14px;
    font-weight: 400;
    color: #f44e5a;
  }

  > ul {
    padding: 0;
    margin: 20px 0;
    list-style: none;

    > li {
      height: 25px;
      display: flex;
      align-items: center;
      cursor: pointer;
      font-size: 12px;

      &:hover {
        opacity: 0.8;
      }

      .icon-unchecked,
      .icon-checked {
        width: 16px;
        height: 16px;
        margin-right: 8px;
      }

      .icon-checked {
        display: none;
      }

      &.active {
        .icon-unchecked {
          display: none;
        }
        .icon-checked {
          display: block;
        }
      }
    }
  }

  .btn-row {
    margin-top: 10px;
    display: flex;
    justify-content: center;

    > button {
      display: block;
      padding: 0 13px;
      height: 24px;
      line-height: 24px;
      border-radius: 4px;
      background-color: #fff;
      border: 1px solid #eeeeee;
      color: #666666;
      cursor: pointer;
      font-size: 12px;

      &:first-child {
        background: #3369fe;
        border: 1px solid #3369fe;
        color: #fff;
        margin-right: 10px;
      }
    }
  }
}
</style>
