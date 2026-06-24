<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'
import { getChannelDetail, getChannelUsers } from '@/api/imChannel'
import { useI18n } from 'vue-i18n'
import { filterSensitiveWords } from '@/utils/sensitiveWords'

const props = defineProps<{ channelId: string }>()
const { t } = useI18n()
const channelStore = useChannelStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const channel = computed(() => channelStore.getChannel(props.channelId))
const detail = ref<{
  channelName: string
  icon: string
  logoColor: string
  memberCount: number
}>({
  channelName: '',
  icon: '',
  logoColor: '',
  memberCount: 0,
})
const memberList = ref<Array<{ id: string; name: string; icon: string; type: number }>>([])

function sensitiveName(value: string | null | undefined, fallback = '') {
  return filterSensitiveWords(value || fallback)
}

watch(
  () => props.channelId,
  async (channelId) => {
    if (!channelId) return
    try {
      const [detailResp, usersResp] = await Promise.all([
        getChannelDetail({ channelId }),
        getChannelUsers({ channelId, pageNum: 1, pageSize: 10 }),
      ])
      const d = (detailResp?.data || {}) as Record<string, any>
      detail.value = {
        channelName: String(d.channelName || channel.value?.name || channelId),
        icon: String(d.icon || channel.value?.avatar || ''),
        logoColor: String(d.logoColor || channel.value?.logoColor || ''),
        memberCount: Number(d.memberCount || channel.value?.memberCount || 0),
      }

      const users = usersResp?.data?.rowList || []
      memberList.value = users.map((item: any) => ({
        id: String(item.uid || item.id || ''),
        name: String(item.name || item.nickName || item.nickname || item.uid || item.id || ''),
        icon: String(item.icon || ''),
        type: Number(item.type ?? item.role ?? 9),
      }))
    } catch (e) {
      console.error('[ChannelDetail] load channel detail failed:', e)
      detail.value = {
        channelName: String(channel.value?.name || channelId),
        icon: String(channel.value?.avatar || ''),
        logoColor: String(channel.value?.logoColor || ''),
        memberCount: Number(channel.value?.memberCount || 0),
      }
      memberList.value = []
    }
  },
  { immediate: true },
)

function startChat() {
  // 详情页“发送消息”入口也走后台预热，保持跳转即时响应。
  void channelStore.ensureChannelDetailReady(props.channelId)
  const conv = chatStore.ensureConversation(2, props.channelId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}
</script>

<template>
  <div class="communication-page">
    <div v-if="channel || detail.channelName" class="communication-page-box">
      <div class="user-info">
        <TextAvatar
          class="avatar"
          :id="channel?.channelId || channel?.id || props.channelId"
          :name="sensitiveName(detail.channelName || channel?.name, channel?.id || props.channelId)"
          :src="detail.icon || channel?.avatar || null"
          avatar-type="channel"
          :color="detail.logoColor || channel?.logoColor || undefined"
          :size="60"
          rounded
        />
        <div>
          <div class="name">{{ sensitiveName(detail.channelName || channel?.name, channel?.id || props.channelId) }}</div>
          <div class="count">
            {{ t('群成员共{value}人', { value: detail.memberCount }) }}
          </div>
        </div>
      </div>

      <div class="user-des">
        <div class="memberList">
          <div
            v-for="item in memberList.slice(0, 8)"
            :key="item.id"
            class="member-item"
          >
            <TextAvatar
              :name="sensitiveName(item.name, item.id)"
              :src="item.icon || null"
              avatar-type="friend"
              :size="35"
              rounded
            />
            <div class="nick-name" :title="sensitiveName(item.name, item.id)">
              {{ sensitiveName(item.name, item.id) }}
            </div>
            <div class="member-identity member-master" v-if="item.type === 0">
              {{ t('群主') }}
            </div>
            <div class="member-identity" v-else-if="item.type === 1">
              {{ t('管理员') }}
            </div>
          </div>
        </div>
      </div>

      <div class="primaryBtn small" @click="startChat">
        {{ t('发送消息') }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.communication-page {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
}

.communication-page-box {
  padding: 80px 40px;
}

.user-info {
  padding: 20px 0;
  border-bottom: 1px solid #eee;
  display: block;

  .avatar {
    margin-right: 20px;
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 50%;
    display: block;
    margin-bottom: 12px;
  }

  .name {
    font-size: 16px;
    font-weight: 600;
    color: #333;
  }

  .count {
    margin-top: 5px;
    color: #999;
  }
}

.user-des {
  padding: 20px 0 40px;

  .memberList {
    min-height: 77px;
    display: flex;

    .member-item {
      margin-right: 10px;
      text-align: center;
      min-width: 50px;
      width: max-content;
      max-width: 128px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;

      .nick-name {
        font-size: 12px;
        line-height: 12px;
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
}

.member-identity {
  display: inline-block;
  max-width: 100%;
  font-size: 12px;
  color: #fff;
  padding: 2px 6px;
  border-radius: 99px;
  background: #fb9203;
  margin-top: 6px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-master {
  background: #3369fe;
}

.primaryBtn {
  color: #fff;
  background-color: #3369fe;
  text-align: center;
  border: 1px solid #3369fe;
  cursor: pointer;
  padding: 0 28px;
  display: inline-block;
  height: 32px;
  line-height: 32px;
  font-size: 12px;
  border-radius: 4px;

  &.small {
    margin-top: 0;
  }
}
</style>
