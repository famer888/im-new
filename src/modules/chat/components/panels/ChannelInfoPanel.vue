<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { ConversationType } from '@/types'
import { getChannelDetail, getChannelUsers } from '@/api/imChannel'
import AppSwitch from '@/components/AppSwitch.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import searchIcon from '@/assets/images/headNav/search-icon.png'
import codeIcon from '@/assets/images/chat/code.png'

interface ChannelMember {
  id: string
  name: string
  avatar: string
  memberType: number
}

const { t } = useI18n()
const authStore = useAuthStore()
const chatStore = useChatStore()
const channelStore = useChannelStore()
const messageStore = useMessageStore()

const detail = ref<Record<string, any>>({})
const members = ref<ChannelMember[]>([])
const keyword = ref('')

const conv = computed(() => chatStore.currentConversation)
const channel = computed(() => {
  const id = conv.value?.targetId || ''
  return id ? channelStore.getChannel(id) : null
})
const channelId = computed(() => conv.value?.targetId || '')
const channelName = computed(() =>
  String(detail.value.channelName || channel.value?.channelName || channel.value?.name || channelId.value),
)
const alias = computed(() => String(detail.value.alias || ''))
const description = computed(() =>
  String(detail.value.channelDesc || detail.value.remark || channel.value?.description || ''),
)
const adminPrivacy = computed(() => Number(detail.value.adminPrivacy ?? channel.value?.adminPrivacy ?? 0))
const filteredMembers = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return members.value
  return members.value.filter((item) => item.name.toLowerCase().includes(q) || item.id.includes(q))
})

async function loadChannelInfo() {
  if (!channelId.value || conv.value?.type !== ConversationType.Channel) return

  try {
    const [detailResp, usersResp] = await Promise.all([
      getChannelDetail({ channelId: channelId.value }),
      getChannelUsers({ channelId: channelId.value, pageNum: 1, pageSize: 50 }),
    ])

    detail.value = detailResp.data || {}
    const rows = usersResp.data?.rowList || []
    members.value = rows.map((raw) => {
      const user = raw.userInfoDTO || raw
      const id = String(user.uid ?? user.id ?? raw.uid ?? raw.id ?? '')
      return {
        id,
        name: String(user.name || user.nickName || user.nickname || id),
        avatar: String(user.icon || raw.icon || ''),
        memberType: Number(raw.memberType ?? raw.type ?? raw.role ?? 3),
      }
    }).filter((item) => item.id)
  } catch (error) {
    console.warn('[ChannelInfoPanel] load channel info failed:', error)
  }
}

async function togglePin() {
  if (!conv.value) return
  await chatStore.pinConversation(authStore.uid, conv.value.id, !conv.value.isPinned)
}

async function toggleMute() {
  if (!conv.value) return
  await chatStore.muteConversation(authStore.uid, conv.value.id, !conv.value.isMuted)
}

async function clearHistory() {
  if (!conv.value) return
  await messageStore.clearConversationHistory(conv.value.id, false)
  chatStore.updateConversation({
    id: conv.value.id,
    lastMsgDigest: null,
    lastMsgId: null,
    unreadCount: 0,
  })
}

function roleLabel(memberType: number): string {
  if (memberType === 1) return '所有者'
  if (memberType === 2) return t('管理员')
  return ''
}

watch(channelId, loadChannelInfo)
onMounted(loadChannelInfo)
</script>

<template>
  <div v-if="conv" class="channel-info-panel">
    <section v-if="alias || adminPrivacy" class="channel-link">
      <h4>{{ t('频道别名') }}</h4>
      <div class="channel-link-info">
        <span class="alias">{{ alias ? `@${alias}` : '' }}</span>
        <img class="code-icon" :src="codeIcon" alt="" />
        <span class="arrow">›</span>
      </div>
    </section>

    <section class="panel-section intro-section">
      <div class="section-head">
        <h4>{{ t('频道简介') }}</h4>
        <span class="arrow">›</span>
      </div>
      <p>{{ description || channelName }}</p>
    </section>

    <section class="panel-section config-section">
      <div class="config-item">
        <span>置顶聊天</span>
        <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
      </div>
      <div class="config-item">
        <span>接收通知</span>
        <AppSwitch :model-value="!conv.isMuted" @update:model-value="toggleMute" />
      </div>
      <button class="clear-btn" type="button" @click="clearHistory">清空聊天记录</button>
    </section>

    <section class="manager-title">
      <h4>{{ t('管理员') }}</h4>
    </section>

    <section class="member-section">
      <label class="member-search">
        <img :src="searchIcon" alt="" />
        <input v-model="keyword" type="text" :placeholder="t('搜索')" />
      </label>

      <ul class="member-list">
        <li v-for="member in filteredMembers" :key="member.id">
          <TextAvatar
            :name="member.name || member.id"
            :src="member.avatar || null"
            :size="35"
            rounded
          />
          <div class="member-info">
            <div class="member-name">{{ member.name || member.id }}</div>
            <div class="member-status">在线</div>
          </div>
          <span v-if="roleLabel(member.memberType)" class="role-badge">
            {{ roleLabel(member.memberType) }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.channel-info-panel {
  min-height: 100%;
  background: #f4f4f4;
  color: #333;
  font-size: 14px;
}

.channel-link,
.panel-section,
.manager-title,
.member-section {
  background: #fff;
}

.channel-link {
  height: 55px;
  padding: 8px 10px;
  box-sizing: border-box;
  display: flex;
  align-items: center;

  h4 {
    flex: 1;
    margin: 0;
    font-size: 14px;
    color: #000;
  }
}

.channel-link-info {
  display: flex;
  align-items: center;
  min-width: 0;
}

.alias {
  max-width: 118px;
  color: #178aff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-icon {
  width: 22px;
  height: 22px;
  margin-left: 8px;
}

.arrow {
  color: #9aa3b5;
  font-size: 24px;
  line-height: 1;
}

.panel-section {
  margin-top: 10px;
}

.intro-section {
  min-height: 80px;
  padding: 10px;
  box-sizing: border-box;

  p {
    margin: 0;
    line-height: 22px;
    color: #333;
    word-break: break-word;
  }
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h4 {
    margin: 0;
    line-height: 32px;
    font-size: 14px;
    color: #000;
  }
}

.config-section {
  padding: 18px 10px 10px;
}

.config-item {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: #333;
}

.clear-btn {
  display: block;
  width: 100%;
  height: 42px;
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: #f44e5a;
  font-size: 15px;
  cursor: pointer;
}

.manager-title {
  height: 45px;
  margin-top: 10px;
  padding: 0 10px;
  display: flex;
  align-items: center;

  h4 {
    margin: 0;
    font-size: 14px;
    color: #333;
  }
}

.member-section {
  margin-top: 10px;
  padding: 10px;
}

.member-search {
  height: 30px;
  padding: 0 10px;
  border-radius: 4px;
  background: #f0f2f5;
  display: flex;
  align-items: center;

  img {
    width: 16px;
    height: 16px;
    margin-right: 6px;
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font-size: 14px;
  }
}

.member-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;

  li {
    height: 50px;
    display: flex;
    align-items: center;
  }
}

.member-info {
  flex: 1;
  min-width: 0;
  margin-left: 10px;
}

.member-name {
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-status {
  line-height: 18px;
  color: #999;
  font-size: 12px;
}

.role-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 9px;
  background: #3369fe;
  color: #fff;
  font-size: 12px;
}
</style>
