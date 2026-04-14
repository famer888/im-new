<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppSwitch from '@/components/AppSwitch.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import { contactsRelation, getContactsDetail, updateBlackContacts, updateContacts } from '@/api/imBase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { proto } from '@/api/request'

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()

const conv = computed(() => chatStore.currentConversation)
const contact = computed(() => (conv.value ? contactStore.getContact(conv.value.targetId) : undefined))

const readBurn = ref(false)
const inBlacklist = ref(false)
const working = ref(false)

watch(contact, async (nextContact) => {
  readBurn.value = Boolean(nextContact?.bfReadCancel)
  inBlacklist.value = Boolean(nextContact?.bfMyBlack)
  if (!nextContact) return
  try {
    const resp = await getContactsDetail({ targetUid: Number(nextContact.id) })
    const detail = (resp as any).contactsDetailBase
    if (!detail) return
    const patch: Partial<typeof nextContact> = {
      bfReadCancel: Boolean(detail.bfReadCancel),
      bfMyBlack: Boolean(detail.bfMyBlack),
    }
    contactStore.patchContact(nextContact.id, patch)
  } catch {
    // ignore details failures, use current in-memory state
  }
}, { immediate: true })

watch(contact, (nextContact) => {
  readBurn.value = Boolean(nextContact?.bfReadCancel)
  inBlacklist.value = Boolean(nextContact?.bfMyBlack)
})

async function copyId() {
  if (!contact.value?.id) return
  try {
    await navigator.clipboard.writeText(contact.value.id)
  } catch {
    // ignore clipboard failure
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

async function toggleReadBurn() {
  if (!contact.value || working.value) return
  working.value = true
  const next = !readBurn.value
  try {
    await updateContacts({
      op: proto.ContactsOperator.READ_CANCEL,
      param: {
        contactsId: Number(contact.value.id),
        bfReadCancel: next,
      },
    })
    readBurn.value = next
    contactStore.patchContact(contact.value.id, { bfReadCancel: next })
  } finally {
    working.value = false
  }
}

async function toggleBlacklist() {
  if (!contact.value || working.value) return
  const next = !inBlacklist.value
  working.value = true
  try {
    await updateBlackContacts({
      targetUid: Number(contact.value.id),
      op: next ? 6 : 7,
    })
    inBlacklist.value = next
    contactStore.patchContact(contact.value.id, { bfMyBlack: next })
  } finally {
    working.value = false
  }
}

function clearHistory() {
  if (!conv.value) return
  messageStore.clearConversationMessages(conv.value.id)
}

async function deleteContactItem() {
  if (!contact.value) return
  const targetId = contact.value.id
  await contactsRelation({
    targetUid: Number(targetId),
    msg: '',
    op: 1,
  })
  contactStore.removeContact(targetId)
  if (conv.value) {
    await chatStore.deleteConversation(authStore.uid, conv.value.id)
  }
  uiStore.setRightPanel('none')
}
</script>

<template>
  <div class="friend-info" v-if="contact && conv">
    <div class="profile">
      <TextAvatar
        :name="contact.nickname || contact.id"
        :src="contact.avatar"
        :size="45"
        rounded
      />
      <div class="profile-text">
        <h2>{{ contact.remark || contact.nickname || contact.id }}</h2>
        <p>
          ID: {{ contact.id }}
          <span class="copy-btn" @click="copyId">复制</span>
        </p>
      </div>
    </div>

    <ul class="config-list">
      <li>
        <span>置顶聊天</span>
        <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
      </li>
      <li>
        <span>消息免打扰</span>
        <AppSwitch :model-value="conv.isMuted" @update:model-value="toggleMute" />
      </li>
      <li>
        <span>阅后即焚</span>
        <AppSwitch :model-value="readBurn" @update:model-value="toggleReadBurn" />
      </li>
      <li>
        <span>加入黑名单</span>
        <AppSwitch :model-value="inBlacklist" @update:model-value="toggleBlacklist" />
      </li>
      <li class="danger friend-left" @click="clearHistory">清空聊天记录</li>
      <li class="danger friend-left" @click="deleteContactItem">删除联系人</li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.friend-info {
  display: flex;
  flex-direction: column;
}

.profile {
  padding: 12px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 75px;
  background: #f5f5f5;
}

.profile-text {
  h2 {
    margin: 0;
    line-height: 25px;
    font-size: 16px;
    font-weight: 700;
    color: #333;
  }

  p {
    margin: 0;
    width: 100%;
    display: flex;
    align-items: center;
    font-size: 12px;
    color: #333;
  }
}

.copy-btn {
  background: #326aff;
  color: #fff;
  width: 36px;
  height: 20px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  margin-left: 10px;
  cursor: pointer;
}

.config-list {
  padding: 14px 0 0;
  margin: 0;

  li {
    list-style: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 35px;
    padding: 0 10px;
    font-size: 14px;
    color: #333;
  }
}

.danger {
  color: #f44e5a !important;
  cursor: pointer;
}

.friend-left {
  justify-content: flex-start !important;
}
</style>
