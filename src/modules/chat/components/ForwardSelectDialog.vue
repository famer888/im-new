<script setup lang="ts">
import { ref, computed, onBeforeUnmount, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore, isFileHelperTargetId } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'

import logoFriend from '@/assets/images/logo/logo-58.png'
import logoGroup from '@/assets/images/logo/group-icon.png'
import logoChannel from '@/assets/images/logo/channel-notice.webp'
import searchIcon from '@/assets/images/headNav/search-icon.png'
import searchCloseIcon from '@/assets/images/headNav/search-close-icon.png'
import arrowRight from '@/assets/images/headNav/arrow-right.png'

const props = defineProps<{ visible: boolean; messageId: string | null }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'forward', targetId: string): void
}>()

const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const { t } = useI18n()

const searchText = ref('')
const selectedType = ref<null | 'friend' | 'group' | 'channel'>(null)
const scrollShowIndex = ref(0)
const listRef = ref<HTMLElement | null>(null)

const currentTitle = computed(() => {
  if (selectedType.value === 'friend') return t('选择朋友')
  if (selectedType.value === 'group') return t('选择群聊')
  if (selectedType.value === 'channel') return t('选择频道')
  return t('消息转发')
})

interface ForwardItem {
  id: string
  channelId?: string
  name: string
  avatar: string | null
  type: 'friend' | 'group' | 'channel'
  color?: string
}

const list = computed((): ForwardItem[] => {
  const searchLower = searchText.value.toLowerCase()
  const hasSearch = searchText.value !== ''
  const typeFilter = selectedType.value
  const uniqueMap = new Map<string, ForwardItem>()

  const matchSearch = (name: string) => {
    if (!hasSearch) return true
    return name.toLowerCase().includes(searchLower)
  }

  const addItem = (item: ForwardItem) => {
    if (typeFilter && item.type !== typeFilter) return
    if (!matchSearch(item.name)) return
    const key = `${item.type}_${item.id}`
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item)
    }
  }

  // Recent conversations first
  for (const conv of chatStore.conversations) {
    if (isFileHelperTargetId(conv.targetId)) continue
    if (conv.type === ConversationType.Friend) {
      const contact = contactStore.getContact(conv.targetId)
      if (!contact) continue
      addItem({
        id: conv.id,
        name: contactStore.getDisplayName(conv.targetId),
        avatar: contact.avatar || null,
        type: 'friend',
      })
    } else if (conv.type === ConversationType.Group) {
      const group = groupStore.getGroup(conv.targetId)
      if (!group) continue
      addItem({
        id: conv.id,
        name: group.name ?? conv.targetId,
        avatar: group.avatar || null,
        type: 'group',
      })
    } else if (conv.type === ConversationType.Channel) {
      const channel = channelStore.getChannel(conv.targetId)
      addItem({
        id: conv.id,
        channelId: channel?.channelId ?? channel?.id ?? conv.targetId,
        name: channel?.channelName ?? channel?.name ?? conv.targetId,
        avatar: channel?.avatar ?? channel?.icon ?? null,
        type: 'channel',
        color: channel?.logoColor || undefined,
      })
    }
  }

  // Friends not in conversations
  for (const contact of contactStore.contacts) {
    if (!contact.id || contact.status <= 0) continue
    const conv = chatStore.conversations.find(
      c => c.type === ConversationType.Friend && c.targetId === contact.id
    )
    const convId = conv?.id ?? `${ConversationType.Friend}_${contact.id}`
    addItem({
      id: convId,
      name: contactStore.getDisplayName(contact.id),
      avatar: contact.avatar || null,
      type: 'friend',
    })
  }

  // Groups not in conversations
  for (const group of groupStore.groups) {
    if (!group.id) continue
    const conv = chatStore.conversations.find(
      c => c.type === ConversationType.Group && c.targetId === group.id
    )
    const convId = conv?.id ?? `${ConversationType.Group}_${group.id}`
    addItem({
      id: convId,
      name: group.name ?? group.id,
      avatar: group.avatar || null,
      type: 'group',
    })
  }

  // Channels not in conversations
  for (const channel of channelStore.channels) {
    if (!channel.id) continue
    const conv = chatStore.conversations.find(
      c => c.type === ConversationType.Channel && c.targetId === channel.id
    )
    const convId = conv?.id ?? `${ConversationType.Channel}_${channel.id}`
    addItem({
      id: convId,
      channelId: channel.channelId ?? channel.id,
      name: channel.channelName ?? channel.name ?? channel.id,
      avatar: channel.avatar ?? channel.icon ?? null,
      type: 'channel',
      color: channel.logoColor || undefined,
    })
  }

  return Array.from(uniqueMap.values())
})

const listLazy = computed(() => {
  return list.value.slice(scrollShowIndex.value, scrollShowIndex.value + 20)
})

function handleListScrollChange() {
  if (!listRef.value) return
  const scrollTop = listRef.value.scrollTop
  const num = Math.ceil(scrollTop / 60)
  scrollShowIndex.value = num > 10 ? num - 11 : 0
}

function handleSelectFriend() {
  selectedType.value = 'friend'
  searchText.value = ''
  scrollShowIndex.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
}

function handleSelectGroup() {
  selectedType.value = 'group'
  searchText.value = ''
  scrollShowIndex.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
}

function handleSelectChannel() {
  selectedType.value = 'channel'
  searchText.value = ''
  scrollShowIndex.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
}

function handleBack() {
  if (selectedType.value !== null) {
    selectedType.value = null
    searchText.value = ''
    scrollShowIndex.value = 0
    if (listRef.value) listRef.value.scrollTop = 0
  }
}

function handleSelect(item: ForwardItem) {
  emit('forward', item.id)
  emit('update:visible', false)
  resetState()
}

function handleClose() {
  emit('update:visible', false)
  resetState()
}

function resetState() {
  searchText.value = ''
  selectedType.value = null
  scrollShowIndex.value = 0
}

watch(() => props.visible, (val) => {
  if (val) {
    resetState()
    nextTick(() => {
      if (listRef.value) {
        listRef.value.addEventListener('scroll', handleListScrollChange)
      }
    })
  }
})

onBeforeUnmount(() => {
  if (listRef.value) {
    listRef.value.removeEventListener('scroll', handleListScrollChange)
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="forwardSelectDialog" @click.self="handleClose">
      <div @click.stop>
        <h1>
          <img
            v-if="selectedType !== null"
            class="back-arrow"
            :src="arrowRight"
            @click="handleBack"
          />
          <div @click="handleBack">{{ currentTitle }}</div>
        </h1>
        <div class="search">
          <img :src="searchIcon" />
          <input v-model="searchText" :placeholder="t('搜索')" />
          <picture v-if="searchText !== ''" @click="searchText = ''">
            <img :src="searchCloseIcon" />
          </picture>
        </div>
        <div class="content-wrapper" :class="{ 'slide-left': selectedType !== null }">
          <div class="main-view">
            <div v-show="selectedType === null" class="top-items">
              <div class="top-item" @click="handleSelectFriend">
                <img class="avatar" :src="logoFriend" />
                <span class="label">{{ t('选择朋友') }}</span>
                <img class="arrow" :src="arrowRight" />
              </div>
              <div class="divider"></div>
              <div class="top-item" @click="handleSelectGroup">
                <img class="avatar" :src="logoGroup" />
                <span class="label">{{ t('选择群聊') }}</span>
                <img class="arrow" :src="arrowRight" />
              </div>
              <div class="divider"></div>
              <div class="top-item" @click="handleSelectChannel">
                <img class="avatar" :src="logoChannel" />
                <span class="label">{{ t('选择频道') }}</span>
                <img class="arrow" :src="arrowRight" />
              </div>
            </div>
            <div v-show="selectedType === null" class="section-separator">
              <span>{{ t('最近') }}</span>
            </div>
            <section ref="listRef">
              <div v-if="list.length === 0" class="empty-state">
                {{ t('暂无数据') }}
              </div>
              <ul
                v-else
                :style="{
                  paddingTop: scrollShowIndex * 60 + 'px',
                  height: list.length * 60 + 'px',
                }"
              >
                <li
                  v-for="(item, index) in listLazy"
                  :key="scrollShowIndex + index"
                  @click="handleSelect(item)"
                >
                  <TextAvatar
                    :id="item.channelId"
                    :name="item.name"
                    :src="item.avatar"
                    :avatar-type="item.type"
                    :color="item.color"
                    :size="40"
                    rounded
                    class="item-avatar"
                  />
                  {{ item.name }}
                </li>
              </ul>
            </section>
          </div>
        </div>
        <div class="btns">
          <span @click.stop="handleClose">{{ t('取消') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss">
.forwardSelectDialog {
  position: fixed;
  z-index: 9000;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.2);

  > div {
    position: absolute;
    width: 350px;
    top: 50%;
    left: 50%;
    background: #fff;
    border-radius: 5px;
    transform: translate(-50%, -50%);

    > h1 {
      margin: 0;
      padding: 15px 0 5px 20px;
      font-size: 16px;
      font-weight: bold;
      position: relative;
      display: flex;
      align-items: center;

      > .back-arrow {
        position: absolute;
        left: 10px;
        height: 12px;
        transform: rotate(180deg);
        cursor: pointer;
        opacity: 0.6;

        &:hover {
          opacity: 1;
        }
      }
    }

    > .search {
      height: 40px;
      padding-left: 45px;
      position: relative;
      border-bottom: 1px solid #eee;
      display: flex;

      > img {
        position: absolute;
        left: 20px;
        height: 15px;
        top: 50%;
        transform: translateY(-50%);
      }

      > input {
        width: 100%;
        background: none;
        border: none;
        outline: none;
        font-size: 14px;

        &::placeholder {
          color: #999;
        }
      }

      > picture {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        cursor: pointer;

        &:hover {
          opacity: 0.8;
        }

        > img {
          display: block;
          width: 15px;
          height: 15px;
        }
      }
    }

    > .content-wrapper {
      position: relative;
      overflow: hidden;

      > .main-view {
        width: 100%;
        transition: all 0.3s ease-in-out;

        > .top-items {
          background: #fff;

          > .top-item {
            display: flex;
            align-items: center;
            height: 60px;
            padding-left: 70px;
            padding-right: 20px;
            cursor: pointer;
            position: relative;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;

            &:hover {
              background: #f6f4f4;
            }

            > .avatar {
              position: absolute;
              left: 10px;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              object-fit: cover;
            }

            > .label {
              flex: 1;
              font-size: 14px;
              color: #666;
            }

            > .arrow {
              height: 12px;
              opacity: 0.4;
              margin-left: 10px;
            }
          }

          > .divider {
            height: 1px;
            background: #eee;
            margin: 0 20px;
          }
        }

        > .section-separator {
          height: 20px;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          padding-left: 10px;

          > span {
            font-size: 12px;
            color: #999;
          }
        }

        > section {
          position: relative;
          height: 240px;
          overflow-y: auto;
          transition: height 0.3s ease-in-out;

          > .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            font-size: 14px;
            color: #999;
          }

          > ul {
            padding: 0;
            margin: 0;
            box-sizing: border-box;
            list-style: none;

            > li {
              display: flex;
              height: 60px;
              align-items: center;
              font-size: 14px;
              color: #666;
              cursor: pointer;
              position: relative;
              padding-left: 70px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
              box-sizing: border-box;

              &:hover {
                background: #f6f4f4;
              }

              > .item-avatar {
                position: absolute;
                left: 10px;
              }
            }
          }
        }
      }

      &.slide-left {
        > .main-view {
          animation: forwardSlideIn 0.3s ease-in-out;

          > section {
            height: 442px;
          }
        }
      }
    }

    @keyframes forwardSlideIn {
      0% {
        transform: translateX(100%);
        opacity: 0;
      }
      100% {
        transform: translateX(0);
        opacity: 1;
      }
    }

    > .btns {
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 10px;
      border-top: #e4e4e4 1px solid;

      > span {
        cursor: pointer;
        color: #0084cb;
        font-size: 14px;
        line-height: 34px;
        display: block;
        padding: 0 20px;
        border-radius: 4px;

        &:hover {
          background: #e3f1fa;
        }
      }
    }
  }
}
</style>
