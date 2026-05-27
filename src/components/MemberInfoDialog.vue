<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactStore } from '@/stores/useContactStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { useGroupStore } from '@/stores/useGroupStore'
import TextAvatar from '@/components/TextAvatar.vue'
import { contactsRelation, findContactsList, updateContacts } from '@/api/imBase'
import { proto } from '@/api/request'
import { eventBus } from '@/utils/eventBus'
import editIcon from '@/assets/images/message/edit-icon.png'
import closeIcon from '@/assets/images/common/close-icon.png'

const { t } = useI18n()
const contactStore = useContactStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()
const groupStore = useGroupStore()

const visible = computed(() => uiStore.memberInfoVisible)
const target = computed(() => uiStore.memberInfoTarget)
const userId = computed(() => target.value.userId)
const groupId = computed(() => target.value.groupId)
const profile = computed(() => target.value.profile || null)
const candidateIds = computed(() => {
  const values = [
    target.value.userId,
    ...((target.value as { candidateIds?: string[] }).candidateIds || []),
    nickname.value,
    remark.value,
  ]
  return Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean)))
})

const isSelf = computed(() => userId.value === authStore.uid)

const contactInfo = computed(() => contactStore.getContact(userId.value))
const isFriend = computed(() => !!contactInfo.value || profile.value?.isFriend === true)

const groupMemberInfo = computed(() => {
  if (!groupId.value) return null
  return groupStore.getMembers(groupId.value).find(m => m.userId === userId.value)
})

const avatar = computed(() => contactInfo.value?.avatar || groupMemberInfo.value?.avatar || profile.value?.avatar || '')
const nickname = computed(() => contactInfo.value?.nickname || groupMemberInfo.value?.nickname || profile.value?.nickname || userId.value)
const remark = computed(() => contactInfo.value?.remark || profile.value?.remark || '')
const depict = computed(() => (contactInfo.value as any)?.depict || (groupMemberInfo.value as any)?.depict || profile.value?.depict || '')
const addToken = computed(() => profile.value?.addToken || '')
const memberRoleLabel = computed(() => {
  const role = Number(groupMemberInfo.value?.role ?? -1)
  if (role === 0) return t('群主')
  if (role === 1) return t('管理员')
  return ''
})
const memberRoleClass = computed(() => {
  const role = Number(groupMemberInfo.value?.role ?? -1)
  if (role === 0) return 'owner'
  if (role === 1) return 'admin'
  return ''
})

const displayName = computed(() => {
  if (isSelf.value) return nickname.value
  return remark.value || nickname.value
})

const editingRemark = ref(false)
const editingDepict = ref(false)
const remarkDraft = ref('')
const depictDraft = ref('')
const savingRemark = ref(false)
const savingDepict = ref(false)
const addVerifyVisible = ref(false)
const addVerifyMessage = ref('')
const sendingAdd = ref(false)
const remarkInputRef = ref<HTMLInputElement | null>(null)
const depictInputRef = ref<HTMLInputElement | null>(null)

watch(visible, (val) => {
  if (val) {
    remarkDraft.value = remark.value
    depictDraft.value = depict.value
    editingRemark.value = false
    editingDepict.value = false
    addVerifyVisible.value = false
    addVerifyMessage.value = ''
    sendingAdd.value = false
  }
})

watch(addVerifyMessage, (value) => {
  if (value.length <= 20) return
  addVerifyMessage.value = truncateVerifyMessage(value)
})

function close() {
  uiStore.closeMemberInfo()
}

function truncateVerifyMessage(value: string) {
  let next = value.slice(0, 20)
  const lastCode = next.charCodeAt(next.length - 1)
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
    next = next.slice(0, -1)
  }
  return next
}

function startEditRemark() {
  if (!isFriend.value) return
  editingRemark.value = true
  remarkDraft.value = remark.value
  nextTick(() => {
    remarkInputRef.value?.focus()
  })
}

function startEditDepict() {
  if (!isFriend.value && !isSelf.value) return
  editingDepict.value = true
  depictDraft.value = depict.value
  nextTick(() => {
    depictInputRef.value?.focus()
  })
}

async function saveRemark() {
  if (!isFriend.value || !contactInfo.value || savingRemark.value) return
  const newRemark = remarkDraft.value.trim()
  const currentRemark = contactInfo.value.remark || ''

  if (newRemark === currentRemark) {
    editingRemark.value = false
    return
  }

  savingRemark.value = true
  try {
    const res = await updateContacts({
      op: proto.ContactsOperator.REMARK,
      param: {
        contactsId: Number(userId.value),
        noteName: newRemark,
      },
    })
    const { errCode, errMsg } = (res as any)?.commonResult || {}
    if (errCode == 200) {
      contactStore.patchContact(userId.value, { remark: newRemark || null })
      editingRemark.value = false
    } else {
      remarkDraft.value = currentRemark
      console.warn('[MemberInfoDialog] update remark failed:', errMsg || errCode)
    }
  } catch (error) {
    remarkDraft.value = currentRemark
    console.warn('[MemberInfoDialog] update remark failed:', error)
  } finally {
    savingRemark.value = false
  }
}

async function saveDepict() {
  if (savingDepict.value) return
  const newDepict = depictDraft.value.trim()
  if (isFriend.value && contactInfo.value) {
    const currentDepict = contactInfo.value.depict || ''
    if (newDepict === currentDepict) {
      editingDepict.value = false
      return
    }

    savingDepict.value = true
    try {
      const res = await updateContacts({
        op: proto.ContactsOperator.DESCRIBE,
        param: {
          contactsId: Number(userId.value),
          depict: newDepict,
        },
      })
      const { errCode, errMsg } = (res as any)?.commonResult || {}
      if (errCode == 200) {
        contactStore.patchContact(userId.value, { depict: newDepict || null })
        editingDepict.value = false
      } else {
        depictDraft.value = currentDepict
        console.warn('[MemberInfoDialog] update depict failed:', errMsg || errCode)
      }
    } catch (error) {
      depictDraft.value = currentDepict
      console.warn('[MemberInfoDialog] update depict failed:', error)
    } finally {
      savingDepict.value = false
    }
  } else if (isSelf.value) {
    if (contactInfo.value) {
      contactStore.patchContact(userId.value, { depict: newDepict || null })
    }
    editingDepict.value = false
  }
}

function findLocalFriendTargetId(candidates: string[]): string {
  for (const key of candidates) {
    const conv = chatStore.conversations.find(c => c.type === 0 && c.targetId === key)
    if (conv) return conv.targetId
  }
  for (const key of candidates) {
    const contact = contactStore.contacts.find(c =>
      c.id === key ||
      c.nickname === key ||
      c.remark === key,
    )
    if (contact?.id) return contact.id
  }
  return candidates[0] || ''
}

async function resolveFriendTargetId(): Promise<string> {
  const localTargetId = findLocalFriendTargetId(candidateIds.value)
  if (localTargetId && contactStore.getContact(localTargetId)) return localTargetId

  for (const key of candidateIds.value) {
    if (!/^\d{6,}$/.test(key)) continue
    try {
      const resp = await findContactsList({ targetUid: Number(key), findType: 1 })
      const userInfo = (resp as any)?.contactsList?.[0]?.userInfo || (resp as any)?.contactsList?.[0]
      const uid = String(userInfo?.uid || '').trim()
      if (uid) return uid
    } catch {
      // targetUid 不一定支持手机号，继续按 phoneNum 查
    }

    try {
      const resp = await findContactsList({ phoneNum: key, findType: 1 })
      const userInfo = (resp as any)?.contactsList?.[0]?.userInfo || (resp as any)?.contactsList?.[0]
      const uid = String(userInfo?.uid || '').trim()
      if (uid) return uid
    } catch (error) {
      console.warn('[MemberInfoDialog] resolve card target failed:', key, error)
    }
  }

  return localTargetId
}

async function handleSendMsg() {
  const targetId = await resolveFriendTargetId()
  if (!targetId) return
  close()
  const conv = chatStore.ensureConversation(0, targetId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
  uiStore.setRightPanel('none')
  nextTick(() => {
    eventBus.emit('editor:focus')
  })
}

function defaultVerifyMessage() {
  return `我是${authStore.nickname || authStore.uid || ''}`
}

function showAddVerifyDialog() {
  if (!addToken.value || sendingAdd.value) return
  addVerifyMessage.value = truncateVerifyMessage(defaultVerifyMessage())
  addVerifyVisible.value = true
}

function closeAddVerifyDialog() {
  if (sendingAdd.value) return
  addVerifyVisible.value = false
}

function getResponseErrorMessage(resp: unknown, fallback = t('添加失败，请稍后重试')) {
  const raw = resp as {
    commonResult?: { errMsg?: string | null }
    errorDesc?: string | null
  } | null
  return raw?.commonResult?.errMsg || raw?.errorDesc || fallback
}

async function handleConfirmAdd() {
  if (!addToken.value || sendingAdd.value) return
  const targetUid = Number(userId.value)
  if (!Number.isFinite(targetUid)) {
    eventBus.emit('show-toast', { message: t('用户 ID 无效'), type: 'error' })
    return
  }

  sendingAdd.value = true
  try {
    const resp = await contactsRelation({
      targetUid,
      msg: addVerifyMessage.value.trim() || defaultVerifyMessage(),
      type: 0,
      op: 0,
      addToken: addToken.value,
    })
    const errCode = Number((resp as any)?.commonResult?.errCode ?? 0)
    if (errCode === 200 || errCode === 0) {
      addVerifyVisible.value = false
      eventBus.emit('show-toast', { message: t('已向对方发送添加申请'), type: 'success' })
    } else {
      eventBus.emit('show-toast', { message: getResponseErrorMessage(resp), type: 'error' })
    }
  } catch (error) {
    console.warn('[MemberInfoDialog] add contact failed:', error)
    eventBus.emit('show-toast', { message: t('当前网络异常，请检查网络设置'), type: 'error' })
  } finally {
    sendingAdd.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="member-dialog-overlay" @click.self="close">
      <div class="member-dialog-content">
        <img class="close-btn" :src="closeIcon" @click="close" />
        
        <div class="top">
          <TextAvatar :name="displayName" :src="avatar" :size="60" rounded />
          <div class="title-row">
            <h2 class="name-h2">{{ displayName }}</h2>
            <span v-if="memberRoleLabel" class="role-badge" :class="memberRoleClass">{{ memberRoleLabel }}</span>
          </div>
        </div>

        <div class="info-list">
          <dl>
            <dt>{{ t('昵称：') }}</dt>
            <dd>{{ nickname }}</dd>
          </dl>
          
          <dl v-if="!isSelf">
            <dt>{{ t('备注名：') }}</dt>
            <dd>
              <input 
                v-if="editingRemark" 
                ref="remarkInputRef"
                v-model="remarkDraft" 
                class="edit-input"
                maxlength="32"
                @blur="saveRemark"
                @keyup.enter="saveRemark"
              />
              <span v-else class="info-text">{{ remark || nickname }}</span>
              <img v-if="!editingRemark && isFriend" class="edit-icon" :src="editIcon" @click="startEditRemark" />
            </dd>
          </dl>

          <dl>
            <dt>{{ t('描述：') }}</dt>
            <dd>
              <input 
                v-if="editingDepict" 
                ref="depictInputRef"
                v-model="depictDraft" 
                class="edit-input"
                maxlength="64"
                @blur="saveDepict"
                @keyup.enter="saveDepict"
                :placeholder="t('什么都没写')"
              />
              <span v-else class="info-text">{{ depict || t('什么都没写') }}</span>
              <img v-if="!editingDepict && (isFriend || isSelf)" class="edit-icon" :src="editIcon" @click="startEditDepict" />
            </dd>
          </dl>
        </div>

        <div v-if="!isSelf" class="bottom">
          <button v-if="isFriend" class="primaryBtn" @click="handleSendMsg">{{ t('发送消息') }}</button>
          <button v-else-if="addToken" class="primaryBtn" @click="showAddVerifyDialog">{{ t('添加') }}</button>
        </div>

        <div v-if="addVerifyVisible" class="verify-overlay">
          <div class="verify-dialog" @click.stop>
            <div class="verify-header">
              <span class="verify-title">{{ t('添加验证') }}</span>
              <button type="button" class="verify-close" :disabled="sendingAdd" @click="closeAddVerifyDialog">
                <img :src="closeIcon" alt="" />
              </button>
            </div>
            <textarea
              v-model="addVerifyMessage"
              class="verify-textarea"
              rows="3"
              maxlength="20"
              :disabled="sendingAdd"
            />
            <button type="button" class="primaryBtn verify-submit" :disabled="sendingAdd" @click="handleConfirmAdd">
              {{ sendingAdd ? t('发送中...') : t('完成') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.member-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.member-dialog-content {
  position: relative;
  width: 400px;
  box-sizing: border-box;
  background: #fff;
  border-radius: 8px;
  padding: 10px 16px;
}

.close-btn {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  padding: 9px;
  box-sizing: border-box;
  cursor: pointer;
  opacity: 1;
  &:hover { opacity: 0.8; }
}

.top {
  height: 100px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #eee;
  margin-bottom: 15px;
  gap: 20px;

  .title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;

    .name-h2 {
      margin: 0;
      line-height: 30px;
      font-size: 16px;
      color: #333;
      font-weight: 600;
      word-break: break-all;
      max-height: 90px;
      overflow: hidden;
      min-width: 0;
    }

    .role-badge {
      flex: 0 0 auto;
      height: 22px;
      line-height: 22px;
      padding: 0 8px;
      border-radius: 11px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;

      &.owner {
        background: #3369fe;
        color: #fff;
      }

      &.admin {
        background: #3369fe;
        color: #fff;
      }
    }
  }
}

.info-list {
  margin-bottom: 0;

  dl {
    display: flex;
    align-items: center;
    line-height: 30px;
    margin: 0;
    font-size: 14px;
    
    dt {
      width: auto;
      padding: 0 10px 0 0;
      color: #999;
      flex-shrink: 0;
      white-space: nowrap;
    }
    
    dd {
      margin: 0;
      flex: 1;
      color: #333;
      display: flex;
      align-items: center;
      min-width: 0;
      
      .info-text {
        font-size: 14px;
        max-width: calc(100% - 30px);
        word-break: break-word;
      }
      
      .edit-input {
        width: 100%;
        height: 30px;
        border: 0;
        border-radius: 0;
        padding: 0;
        font-size: 14px;
        font-family: PingFangSC-Regular, sans-serif;
      }
      
      .edit-icon {
        width: 15px;
        height: 15px;
        margin-left: 10px;
        cursor: pointer;
        opacity: 1;
        &:hover { opacity: 0.8; }
      }
    }
  }
}

.bottom {
  display: flex;
  margin-top: 15px;
  padding-bottom: 10px;
  
  .primaryBtn {
    background: #3369fe;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0 24px;
    height: 32px;
    line-height: 32px;
    font-size: 12px;
    cursor: pointer;
    
    &:hover {
      opacity: 0.8;
    }

    &:disabled {
      cursor: default;
      opacity: 0.65;
    }
  }
}

.verify-overlay {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.verify-dialog {
  width: 300px;
  box-sizing: border-box;
  border-radius: 6px;
  padding: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.verify-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #787878;
  font-size: 16px;
}

.verify-title {
  font-size: 16px;
  line-height: 22px;
  color: #787878;
}

.verify-close {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    display: block;
  }

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
}

.verify-textarea {
  width: 100%;
  height: 100px;
  margin-top: 26px;
  padding: 8px;
  border: none;
  outline: none;
  resize: none;
  box-sizing: border-box;
  background: #f5f6fa;
  border-radius: 2px;
  color: #000;
  font-size: 13px;
  line-height: 20px;
  font-family: inherit;
}

.verify-submit {
  width: 100%;
  height: 32px;
  margin-top: 32px;
  padding: 0 28px;
  border: 1px solid #3369fe;
  border-radius: 4px;
  background: #3369fe;
  color: #fff;
  line-height: 32px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }
}

</style>
