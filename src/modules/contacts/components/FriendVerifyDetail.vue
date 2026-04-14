<script setup lang="ts">
import { ref, computed } from 'vue'
import TextAvatar from '@/components/TextAvatar.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Toast from '@/components/Toast.vue'
import { updateBlackContacts, updateContactsApply } from '@/api/imBase'

import backIcon from '@/assets/images/setting/back.png'

export interface VerifyRecord {
  userInfo: {
    uid: number | string
    nickName: string
    icon: string
    identify?: string
    gender?: number
    depict?: string
  }
  msg: string
  type: number
  bfMyBlack: boolean
}

const props = defineProps<{
  info: VerifyRecord
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'close'): void
}>()

const bfMyBlack = ref(props.info.bfMyBlack ?? false)
const working = ref(false)
const blacklistConfirmVisible = ref(false)
const pendingBlacklistOp = ref<6 | 7>(6)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

const blacklistConfirmContent = computed(() =>
  pendingBlacklistOp.value === 6
    ? '加入黑名单后，你将不再接收到对方的任何消息'
    : '确认移除黑名单吗',
)

const addTypeMap: Record<number, string> = {
  0: '手机号',
  1: '扫码',
  2: '群聊',
  3: '名片',
  4: '朋友申请信息',
  5: '链接',
  6: '68号',
}

function getAddType(type: number) {
  return addTypeMap[type] || '搜索'
}

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function joinBlackList(op: 6 | 7) {
  if (working.value) return
  pendingBlacklistOp.value = op
  blacklistConfirmVisible.value = true
}

async function confirmBlacklist() {
  if (working.value) return
  const op = pendingBlacklistOp.value
  working.value = true
  try {
    const res = await updateBlackContacts({
      targetUid: Number(props.info.userInfo.uid),
      op,
    })
    const { errCode } = (res as any)?.commonResult || {}
    if (errCode == 200) {
      bfMyBlack.value = op === 6
      if (op === 7) showToast('移除成功')
    } else {
      const errorDesc = (res as any)?.errorDesc
      if (errorDesc) showToast(errorDesc, 'error')
    }
  } finally {
    working.value = false
  }
}

async function passVerify() {
  if (working.value) return
  working.value = true
  try {
    const res = await updateContactsApply({
      applyUid: Number(props.info.userInfo.uid),
      op: 8,
    })
    const { errCode } = (res as any)?.commonResult || {}
    if (errCode == 200) {
      showToast('操作成功')
      setTimeout(() => emit('close'), 300)
    } else {
      const errorDesc = (res as any)?.errorDesc
      if (errorDesc) showToast(errorDesc, 'error')
    }
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="new-friend-verify">
    <div class="head-title">
      <img class="icon-back" :src="backIcon" alt="" @click="emit('back')" />
      新的朋友
    </div>
    <div class="content">
      <div class="info-head">
        <TextAvatar
          :name="info.userInfo.nickName || String(info.userInfo.uid)"
          :src="info.userInfo.icon || null"
          :size="68"
          rounded
          class="head-icon"
        />
        <div class="info">
          <span class="name">{{ info.userInfo.nickName }}</span>
          <p class="source">对方通过{{ getAddType(info.type) }}添加</p>
        </div>
        <div v-if="bfMyBlack" class="block">已拉黑该用户</div>
      </div>
      <div class="info-middle">
        <div class="info-item">
          <span class="title">ID号</span>
          <span class="value">{{ info.userInfo.identify || info.userInfo.uid }}</span>
        </div>
        <div class="info-item">
          <span class="title">性别</span>
          <span class="value">{{ ['保密', '男', '女'][info.userInfo.gender ?? 0] }}</span>
        </div>
        <div class="info-item">
          <span class="title">个性签名</span>
          <span class="value">{{ info.userInfo.depict || '对方什么都没写' }}</span>
        </div>
      </div>
      <div class="info-msg">
        <div class="tip">系统提示：请求添加好友</div>
        <p class="msg">{{ info.msg }}</p>
      </div>
      <div class="footer">
        <div
          v-if="bfMyBlack"
          class="primaryBtn blacklist-btn remove"
          @click="joinBlackList(7)"
        >
          移除黑名单
        </div>
        <div v-else class="primaryBtn blacklist-btn" @click="joinBlackList(6)">
          加入黑名单
        </div>
        <div class="primaryBtn" @click="passVerify()">通过验证</div>
      </div>
    </div>

    <ConfirmDialog
      v-model:visible="blacklistConfirmVisible"
      variant="im"
      :content="blacklistConfirmContent"
      @confirm="confirmBlacklist"
    />

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
  </div>
</template>

<style scoped lang="scss">
.new-friend-verify {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: absolute;
  left: 0;
  top: 0;
  z-index: 9;
  background: #f6f6f6;

  .icon-back {
    height: 14px;
    margin-right: 10px;
    cursor: pointer;
  }

  .head-title {
    font-size: 14px;
    color: #000;
    padding: 20px;
    box-sizing: border-box;
    background: #fff;
    display: flex;
    align-items: center;
  }

  .content {
    padding: 20px;
    background: #f6f6f6;
  }

  .info-head,
  .info-middle,
  .info-msg {
    background: #fff;
    border-radius: 6px;
    margin-bottom: 10px;
    padding: 10px;
    box-sizing: border-box;
  }

  .info-head {
    display: flex;
    align-items: center;

    .head-icon {
      width: 68px;
      height: 68px;
      flex-shrink: 0;
    }

    .info {
      margin-left: 10px;
      flex: 1;

      .name {
        font-size: 14px;
        color: #000;
      }

      .source {
        font-size: 12px;
        color: #b9babe;
        margin-top: 12px;
      }
    }

    .block {
      font-size: 12px;
      color: #fb2826;
    }
  }

  .info-middle {
    padding: 0 10px;

    .info-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #f2f2f2;
      padding: 10px 0;
      box-sizing: border-box;

      &:last-child {
        border-bottom: none;
      }

      .title {
        font-size: 14px;
        color: #000;
      }

      .value {
        font-size: 14px;
        color: #787878;
      }
    }
  }

  .info-msg {
    .tip {
      font-size: 12px;
      color: #979797;
    }

    .msg {
      border-top: 1px solid #f2f2f2;
      margin-top: 10px;
      padding-top: 10px;
      font-size: 14px;
      color: #000;
    }
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 16px;
  }

  .blacklist-btn {
    background: #fb2826;
    border: none;
    margin-right: 10px;
  }

  .remove {
    background: #1da949;
  }

  .primaryBtn {
    width: 256px;
    height: 48px;
    line-height: 48px;
    border-radius: 6px;
    color: #fff;
    background-color: #3369fe;
    text-align: center;
    cursor: pointer;
    font-size: 14px;

    &:hover {
      opacity: 0.9;
    }
  }
}
</style>
