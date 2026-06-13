<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactStore } from '@/stores/useContactStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'
import Toast from '@/components/Toast.vue'
import { updateContacts } from '@/api/imBase'
import { proto } from '@/api/request'
import { writeClipboardText } from '@/utils/clipboard'
import editIcon from '@/assets/images/message/edit-icon.png'

const props = defineProps<{ contactId: string }>()
const { t } = useI18n()
const contactStore = useContactStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const contact = computed(() => contactStore.getContact(props.contactId))
// 对齐旧 im：资料面板里的 ID 只展示好友号 identify，不回退内部 uid。
const displayId = computed(() => String(contact.value?.identify || '').trim())
const remarkDraft = ref('')
const depictDraft = ref('')
const editingRemark = ref(false)
const editingDepict = ref(false)
const savingRemark = ref(false)
const savingDepict = ref(false)
const copyToastVisible = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
let copyToastTimer: ReturnType<typeof setTimeout> | null = null

watch(contact, (val) => {
  remarkDraft.value = val?.remark || val?.nickname || ''
  depictDraft.value = (val as any)?.depict || ''
}, { immediate: true })

watch(
  () => contact.value?.id,
  (contactId) => {
    if (!contactId) return
    void contactStore.ensureContactDetailLoaded(contactId, { force: true })
  },
  { immediate: true },
)

function startChat() {
  const conv = chatStore.ensureConversation(0, props.contactId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}

async function handleCopyId() {
  const id = displayId.value
  if (!id) return
  try {
    await writeClipboardText(`@${id} `)
    if (copyToastTimer) {
      clearTimeout(copyToastTimer)
    }
    copyToastVisible.value = true
    copyToastTimer = setTimeout(() => {
      copyToastVisible.value = false
      copyToastTimer = null
    }, 1500)
  } catch {
    // ignore clipboard failures
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

async function saveRemark() {
  if (!contact.value || savingRemark.value) return
  const targetId = contact.value.id
  const nextRemark = remarkDraft.value.trim()
  const currentRemark = contact.value.remark || ''

  if (nextRemark === currentRemark) {
    editingRemark.value = false
    return
  }

  savingRemark.value = true
  try {
    const res = await updateContacts({
      op: proto.ContactsOperator.REMARK,
      param: {
        contactsId: Number(targetId),
        noteName: nextRemark,
      },
    })
    // 对齐旧 im：服务端成功码既可能是 200，也可能是 0。
    const errCode = Number((res as any)?.commonResult?.errCode ?? 200)
    const errMsg = String((res as any)?.commonResult?.errMsg || '').trim()
    if (errCode === 200 || errCode === 0) {
      contactStore.patchContact(targetId, { remark: nextRemark || null })
      editingRemark.value = false
      showToast(t('修改成功'), 'success')
    } else {
      remarkDraft.value = currentRemark
      showToast(errMsg || t('操作失败'), 'error')
      console.warn('[FriendDetail] update remark failed:', errMsg || errCode)
    }
  } catch (error) {
    remarkDraft.value = currentRemark
    showToast((error as Error)?.message || t('操作失败'), 'error')
    console.warn('[FriendDetail] update remark failed:', error)
  } finally {
    savingRemark.value = false
  }
}

async function saveDepict() {
  if (!contact.value || savingDepict.value) return
  const targetId = contact.value.id
  const nextDepict = depictDraft.value.trim()
  const currentDepict = contact.value.depict || ''

  if (nextDepict === currentDepict) {
    editingDepict.value = false
    return
  }

  savingDepict.value = true
  try {
    const res = await updateContacts({
      op: proto.ContactsOperator.DESCRIBE,
      param: {
        contactsId: Number(targetId),
        depict: nextDepict,
      },
    })
    // 对齐旧 im：服务端成功码既可能是 200，也可能是 0。
    const errCode = Number((res as any)?.commonResult?.errCode ?? 200)
    const errMsg = String((res as any)?.commonResult?.errMsg || '').trim()
    if (errCode === 200 || errCode === 0) {
      contactStore.patchContact(targetId, { depict: nextDepict || null })
      editingDepict.value = false
      showToast(t('修改成功'), 'success')
    } else {
      depictDraft.value = currentDepict
      showToast(errMsg || t('操作失败'), 'error')
      console.warn('[FriendDetail] update depict failed:', errMsg || errCode)
    }
  } catch (error) {
    depictDraft.value = currentDepict
    showToast((error as Error)?.message || t('操作失败'), 'error')
    console.warn('[FriendDetail] update depict failed:', error)
  } finally {
    savingDepict.value = false
  }
}

</script>

<template>
  <div class="communication-page" v-if="contact">
    <div class="communication-page-box">
      <div class="user-info">
        <TextAvatar
          :name="contact.nickname || contact.id"
          :src="contact.avatar"
          :size="60"
          class="avatar"
        />
        <div>
          <span class="name">{{ contact.remark || contact.nickname || contact.id }}</span>
          <p class="id-row">
            <span class="id-line">{{ t('ID：') }}{{ displayId }}</span>
            <button type="button" class="copy-btn" @click="handleCopyId">{{ t('复制') }}</button>
          </p>
        </div>
      </div>

      <div class="user-des">
        <div class="item">
          <div class="key">{{ t('昵称：') }}</div>
          <div class="val user-select">{{ contact.nickname || contact.id }}</div>
        </div>

        <div class="item">
          <div class="key">{{ t('备注名：') }}</div>
          <div class="val">
            <input
              v-if="editingRemark"
              v-model="remarkDraft"
              type="text"
              maxlength="32"
              @blur="saveRemark"
              @keyup.enter="saveRemark"
            />
            <span v-else class="user-select">
              {{ contact.remark || contact.nickname || t('未设置') }}
            </span>
            <img v-if="!editingRemark" class="edit-icon" :src="editIcon" alt="" @click="editingRemark = true" />
          </div>
        </div>

        <div class="item">
          <div class="key">{{ t('描述：') }}</div>
          <div class="val">
            <input
              v-if="editingDepict"
              v-model="depictDraft"
              type="text"
              maxlength="64"
              @blur="saveDepict"
              @keyup.enter="saveDepict"
              :placeholder="t('什么都没写')"
            />
            <span v-else class="user-select">
              {{ (contact as any).depict || t('什么都没写') }}
            </span>
            <img v-if="!editingDepict" class="edit-icon" :src="editIcon" alt="" @click="editingDepict = true" />
          </div>
        </div>
      </div>

      <div class="button-group">
        <div class="primaryBtn small" @click="startChat">{{ t('发送消息') }}</div>
      </div>
    </div>
    <div v-if="copyToastVisible" class="copy-toast">{{ t('复制成功') }}</div>
    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
  </div>
</template>

<style lang="scss" scoped>
.communication-page {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  .user-select {
    user-select: text;
  }

  .communication-page-box {
    padding: 40px 40px;

    .user-info {
      display: flex;
      flex-wrap: wrap;
      padding: 20px 0;
      border-bottom: 1px solid #eee;
      align-items: center;

      .avatar {
        margin-right: 20px;
        width: 60px;
        height: 60px;
        object-fit: cover;
        border-radius: 50%;
      }

      .name {
        font-size: 16px;
        font-weight: 600;
        user-select: text;
      }

      .id-row {
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        margin-top: 10px;
      }

      .id-line {
        flex: 1;
        min-width: 0;
        word-break: break-all;
        font-size: 14px;
        color: #333;
      }

      .copy-btn {
        border: none;
        background: #326aff;
        color: #ffffff;
        border-radius: 4px;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        line-height: 1.2;
        padding: 4px 10px;
        min-height: 24px;
        white-space: nowrap;
        flex-shrink: 0;
        cursor: pointer;

        &:hover {
          background: #2958e6;
        }

        &:focus-visible {
          outline: 2px solid rgba(50, 106, 255, 0.45);
          outline-offset: 2px;
        }
      }
    }

    .user-des {
      padding: 10px 0;

      .item {
        min-height: 33px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        row-gap: 4px;

        .key {
          flex-shrink: 0;
          margin-right: 10px;
          color: #999;
        }

        .val {
          display: flex;
          align-items: center;
          color: #333;
          font-weight: 600;
          font-size: 14px;

          > input {
            display: block;
            width: 240px;
            height: 28px;
            font-size: 14px;
            border: 1px solid #dcdfe6;
            border-radius: 4px;
            padding: 0 8px;
          }
        }
      }
    }

    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 10px;

      .primaryBtn {
        margin-top: 0;
      }
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
        margin-top: 10px;
      }

      &.danger {
        background-color: #f44e5a;
        border-color: #f44e5a;

        &:hover {
          background-color: #f78989;
        }
      }

      &:hover {
        background-color: rgba(51, 105, 254, 0.9);
      }
    }
  }

  .edit-icon {
    margin-left: 5px;
    cursor: pointer;
    width: 15px;
    vertical-align: middle;
  }

  .copy-toast {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 10px 18px;
    border-radius: 8px;
    background: rgba(52, 52, 52, 0.86);
    color: #fff;
    font-size: 16px;
    line-height: 1;
    z-index: 9999;
    pointer-events: none;
  }
}

::v-deep(.text-avatar) {
  width: 60px !important;
  height: 60px !important;
  border-radius: 50% !important;
}
</style>
