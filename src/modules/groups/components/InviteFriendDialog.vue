<template>
  <div v-if="visible" class="invite-friend-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="content">
      <div class="top">
        <div class="head">
          <span class="title">{{ $t('邀请好友') }}</span>
          <img class="close" src="@/assets/images/common/close-icon.png" @click="$emit('close')" />
        </div>
        <SearchInput v-model="searchKey" :placeholder="$t('搜索')" class="search" />
        <div :class="['form-link', { disabled: isCopyingInviteLink }]" @click="copyGroupInviteLink">
          <img src="@/assets/images/system/link.png" />
          <span class="title">{{ $t('通过邀请链接加入群组') }}</span>
        </div>
      </div>

      <ul class="friend-list">
        <li
          v-for="friend in filteredFriends"
          :key="friend.id"
          :class="['friend-item', { disable: isPendingAuditFriend(friend) }]"
          @click="selectFriend(friend)"
        >
          <div class="left">
            <TextAvatar
              :name="displayName(friend)"
              :src="friend.avatar"
              :size="38"
              rounded
              class="member-avatar"
            />
            <span class="name">{{ displayName(friend) }}</span>
            <div v-if="isPendingAuditFriend(friend)" class="pending-tag">{{ $t('进群审核中') }}</div>
          </div>
          <AppCheckbox :modelValue="selectedIds.has(friend.id)" :disabled="isPendingAuditFriend(friend)" />
        </li>
      </ul>

      <div class="primaryBtn" @click="handleInvite">
        {{ $t('完成') }}
      </div>
    </div>

    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      :duration="toastDuration"
      @update:visible="toastVisible = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactStore, type Contact } from '@/stores/useContactStore'
import SearchInput from '@/components/SearchInput.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import AppCheckbox from '@/components/AppCheckbox.vue'
import Toast from '@/components/Toast.vue'
import { checkUidList, groupQrCode } from '@/api/imBase'

const { t: $t } = useI18n()
const contactStore = useContactStore()

const props = defineProps<{
  visible: boolean
  groupId: string
  existingMemberIds: Set<string>
  qrcodeUrl?: string
  confirmBeforeInvite?: boolean
  pendingAuditIds?: Set<string> | string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'invited', payload?: { message?: string; type?: 'success' | 'error'; needCheckUids?: string[] }): void
  (e: 'confirm-invite', payload: { members: string[]; message: string }): void
  (e: 'pending-audit-loaded', ids: string[]): void
}>()

const searchKey = ref('')
const selectedIds = reactive(new Set<string>())
const pendingAuditIds = ref(new Set<string>())
const isCopyingInviteLink = ref(false)

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastDuration = ref(2000)

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

function showToast(msg: string, type: 'success' | 'error' = 'success', duration = 2000) {
  toastMessage.value = msg
  toastType.value = type
  toastDuration.value = duration
  toastVisible.value = true
}

async function copyTextToClipboard(text: string) {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('write_clipboard_text', { text })
      return
    } catch (error) {
      console.warn('[InviteFriendDialog] native clipboard write failed, fallback to web clipboard:', error)
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // fallback below
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('copy command failed')
}

function displayName(friend: Contact) {
  return friend.remark || friend.nickname || friend.id
}

function normalizeIds(ids?: Set<string> | string[] | Array<number | string>) {
  if (!ids) return []
  const list = ids instanceof Set ? Array.from(ids) : ids
  return list.map((id) => String(id)).filter(Boolean)
}

const blockedPendingAuditIds = computed(() => new Set([
  ...Array.from(pendingAuditIds.value),
  ...normalizeIds(props.pendingAuditIds),
]))

function isPendingAuditFriend(friend: Contact) {
  return blockedPendingAuditIds.value.has(String(friend.id))
}

async function loadPendingAuditIds() {
  try {
    const res = await checkUidList({ groupId: props.groupId })
    if (Number(res?.code) === 200) {
      const ids = normalizeIds(res.data?.checkList || [])
      pendingAuditIds.value = new Set(ids)
      emit('pending-audit-loaded', ids)
      return
    }
  } catch (error) {
    console.warn('[InviteFriendDialog] load pending audit ids failed:', error)
  }
  pendingAuditIds.value = new Set()
}

watch(
  () => props.visible,
  async (visible) => {
    searchKey.value = ''
    selectedIds.clear()
    isCopyingInviteLink.value = false
    if (visible) {
      pendingAuditIds.value = new Set(normalizeIds(props.pendingAuditIds))
      await loadPendingAuditIds()
    } else {
      pendingAuditIds.value = new Set()
    }
  },
  { immediate: true },
)

const filteredFriends = computed(() => {
  const key = searchKey.value.trim().toLowerCase()
  return contactStore.contacts.filter((friend) => {
    if (!friend.id) return false
    if (props.existingMemberIds.has(friend.id)) return false
    if (friend.nickname === '账号已注销') return false
    if (!key) return true
    return [
      displayName(friend),
      friend.nickname || '',
      friend.id,
    ].some((value) => value.toLowerCase().includes(key))
  })
})

function selectFriend(friend: Contact) {
  if (isPendingAuditFriend(friend)) return
  if (selectedIds.has(friend.id)) {
    selectedIds.delete(friend.id)
  } else {
    selectedIds.add(friend.id)
  }
}

function getContactNames(ids: Array<number | string>) {
  return ids
    .map((id) => contactStore.getContact(String(id)))
    .filter((friend): friend is Contact => Boolean(friend))
    .map((friend) => displayName(friend))
    .filter(Boolean)
    .join('、')
}

function getNeedCheckMessage(ids: Array<number | string>) {
  const names = getContactNames(ids)
  if (names) {
    return `${names}${$t('开启了入群需审核，对方同意后才会进入群聊')}`
  }
  return $t('开启了入群需审核，对方同意后才会进入群聊')
}

function handleInvite() {
  if (selectedIds.size === 0) {
    showToast($t('请选择邀请的好友'), 'error')
    return
  }

  const members = Array.from(selectedIds).filter((id) => !blockedPendingAuditIds.value.has(String(id)))
  if (members.length === 0) {
    selectedIds.clear()
    showToast($t('请选择邀请的好友'), 'error')
    return
  }

  emit('confirm-invite', {
    members,
    message: getNeedCheckMessage(members),
  })
  selectedIds.clear()
  emit('close')
}

async function copyGroupInviteLink() {
  if (isCopyingInviteLink.value) return
  isCopyingInviteLink.value = true
  try {
    const cachedLink = String(props.qrcodeUrl || '').trim()
    const res = cachedLink ? null : await groupQrCode({ groupId: props.groupId, force: false })
    const inviteLink = cachedLink || res?.shortLink || res?.qrUrl || ''
    if (!inviteLink) {
      showToast($t('获取邀请链接失败'), 'error')
      return
    }
    await copyTextToClipboard(inviteLink)
    showToast($t('链接已复制在剪贴板'))
  } catch (error) {
    console.error('[InviteFriendDialog] copy invite link failed:', error)
    showToast($t('获取邀请链接失败'), 'error')
  } finally {
    isCopyingInviteLink.value = false
  }
}
</script>

<style lang="scss" scoped>
.invite-friend-dialog {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
}

.content {
  background: #fff;
  position: relative;
  border-radius: 8px;
  width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.close {
  cursor: pointer;
  width: 14px;
  height: 14px;

  &:hover {
    opacity: 0.8;
  }
}

.top {
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
  border-bottom: 1px solid #f2f2f2;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .title {
    font-size: 16px;
    color: #787878;
  }
}

.search {
  margin-top: 10px;
}

.form-link {
  display: flex;
  align-items: center;
  margin-top: 10px;
  cursor: pointer;
  user-select: none;

  > img {
    width: 14px;
    height: 14px;
    margin-right: 4px;
  }

  .title {
    font-size: 14px;
    color: #178AFF;
  }

  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }
}

.friend-list {
  width: 100%;
  height: 260px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.friend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  box-sizing: border-box;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }

  .left {
    display: flex;
    align-items: center;
    flex-shrink: 1;
    min-width: 0;
  }

  .member-avatar {
    margin-right: 10px;
  }

  .name {
    font-size: 14px;
    color: #494949;
    word-break: break-all;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
}

.disable {
  opacity: 0.5;
  pointer-events: none;
}

.pending-tag {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #178AFF;
  color: #fff;
  font-size: 12px;
  flex-shrink: 0;
}

.primaryBtn {
  width: 206px;
  height: 32px;
  margin: 16px 0;
  background: #3369FE;
  color: #fff;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }
}
</style>
