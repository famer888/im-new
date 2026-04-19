<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactStore } from '@/stores/useContactStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { useGroupStore } from '@/stores/useGroupStore'
import TextAvatar from '@/components/TextAvatar.vue'
import { updateContacts } from '@/api/imBase'
import { proto } from '@/api/request'
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

const isSelf = computed(() => userId.value === authStore.uid)

const contactInfo = computed(() => contactStore.getContact(userId.value))
const isFriend = computed(() => !!contactInfo.value)

const groupMemberInfo = computed(() => {
  if (!groupId.value) return null
  return groupStore.getMembers(groupId.value).find(m => m.userId === userId.value)
})

const avatar = computed(() => contactInfo.value?.avatar || groupMemberInfo.value?.avatar || '')
const nickname = computed(() => contactInfo.value?.nickname || groupMemberInfo.value?.nickname || userId.value)
const remark = computed(() => contactInfo.value?.remark || '')
const depict = computed(() => (contactInfo.value as any)?.depict || (groupMemberInfo.value as any)?.depict || '')

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
const remarkInputRef = ref<HTMLInputElement | null>(null)
const depictInputRef = ref<HTMLInputElement | null>(null)

watch(visible, (val) => {
  if (val) {
    remarkDraft.value = remark.value
    depictDraft.value = depict.value
    editingRemark.value = false
    editingDepict.value = false
  }
})

function close() {
  uiStore.closeMemberInfo()
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

function handleSendMsg() {
  close()
  const conv = chatStore.ensureConversation(0, userId.value)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
  uiStore.setRightPanel('none')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="member-dialog-overlay" @click.self="close">
      <div class="member-dialog-content">
        <img class="close-btn" :src="closeIcon" @click="close" />
        
        <div class="top">
          <TextAvatar :name="displayName" :src="avatar" :size="60" rounded />
          <h2 class="name-h2">{{ displayName }}</h2>
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
          <button class="primaryBtn" @click="handleSendMsg">{{ t('发送消息') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.member-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.member-dialog-content {
  position: relative;
  width: 360px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 30px 20px 20px;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 14px;
  height: 14px;
  cursor: pointer;
  opacity: 0.5;
  &:hover { opacity: 1; }
}

.top {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
  
  .name-h2 {
    margin: 0;
    font-size: 18px;
    color: #333;
    font-weight: 600;
    word-break: break-all;
  }
}

.info-list {
  border-top: 1px solid #f1f1f1;
  padding-top: 16px;
  margin-bottom: 20px;

  dl {
    display: flex;
    align-items: center;
    margin: 0 0 12px 0;
    font-size: 14px;
    
    dt {
      width: 70px;
      color: #999;
      flex-shrink: 0;
    }
    
    dd {
      margin: 0;
      flex: 1;
      color: #333;
      display: flex;
      align-items: center;
      min-width: 0;
      
      .info-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .edit-input {
        width: 200px;
        height: 26px;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 0 8px;
        font-size: 14px;
      }
      
      .edit-icon {
        width: 14px;
        height: 14px;
        margin-left: 8px;
        cursor: pointer;
        opacity: 0.6;
        &:hover { opacity: 1; }
      }
    }
  }
}

.bottom {
  display: flex;
  
  .primaryBtn {
    background: #3369fe;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0 24px;
    height: 32px;
    font-size: 14px;
    cursor: pointer;
    
    &:hover {
      background: rgba(51, 105, 254, 0.9);
    }
  }
}
</style>
