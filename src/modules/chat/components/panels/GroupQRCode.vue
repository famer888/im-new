<template>
  <div v-if="visible" class="comGroupQrCode">
    <div class="head">
      <picture @click="$emit('close')">
        <img src="@/assets/images/chat/arrow-left-blue.png" />
      </picture>
      {{ $t('群二维码') }}
    </div>
    
    <section>
      <template v-if="qrUrl">
        <QrcodeVue
          ref="qrcodeRef"
          class="code"
          :value="qrUrl"
          level="H"
          :size="180"
        />
        <h3>{{ $t('二维码长期有效') }}</h3>
      </template>
      <span v-else-if="loading">{{ $t('加载中...') }}</span>
      <span v-else>{{ $t('二维码链接异常') }}</span>
    </section>

    <div v-if="qrUrl" class="buttons">
      <div class="btn-item">
        <button @click="handleForward">
          <img src="@/assets/images/system/share.png" />
        </button>
        <span class="btn-title">{{ $t('转发给朋友') }}</span>
      </div>
      <div class="btn-item">
        <button @click="handleSave">
          <img src="@/assets/images/system/down.png" />
        </button>
        <span class="btn-title">{{ $t('保存图片') }}</span>
      </div>
      <div class="btn-item">
        <button @click="handleCopy">
          <img src="@/assets/images/system/link.png" />
        </button>
        <span class="btn-title">{{ $t('复制链接') }}</span>
      </div>
    </div>
    
    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QrcodeVue from 'qrcode.vue'
import { getGroupDetail } from '@/api/imBase'
import Toast from '@/components/Toast.vue'

const { t: $t } = useI18n()

const props = defineProps<{
  visible: boolean
  groupId: string
  groupName: string
}>()

defineEmits<{ (e: 'close'): void }>()

const qrUrl = ref('')
const loading = ref(false)
const qrcodeRef = ref<any>(null)

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

watch(() => props.visible, async (v) => {
  if (v && props.groupId) {
    loading.value = true
    qrUrl.value = ''
    try {
      const res = await getGroupDetail({ groupId: props.groupId })
      if (res && res.qrUrl) {
        qrUrl.value = res.qrUrl
      }
    } catch (e) {
      console.error('get group qrcode failed:', e)
    } finally {
      loading.value = false
    }
  }
})

function handleCopy() {
  if (!qrUrl.value) return
  navigator.clipboard.writeText(qrUrl.value).then(() => {
    showToast($t('复制成功'))
  }).catch(() => {
    showToast($t('复制失败'), 'error')
  })
}

function handleForward() {
  // TODO: 实现转发逻辑
  showToast($t('暂未实现转发功能'))
}

function handleSave() {
  if (!qrcodeRef.value || !qrcodeRef.value.$el) {
    showToast($t('保存失败'), 'error')
    return
  }
  
  try {
    const qrcodeCanvas = qrcodeRef.value.$el as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const baseWidth = 270
    const baseHeight = 300
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    canvas.width = baseWidth * dpr
    canvas.height = baseHeight * dpr
    ctx.scale(dpr, dpr)
    
    // 背景
    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0, 0, baseWidth, baseHeight)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, baseWidth, baseHeight - 35)
    
    // 绘制二维码
    const codeW = qrcodeCanvas.width / dpr
    const codeH = qrcodeCanvas.height / dpr
    const codeX = (baseWidth - codeW) / 2
    const codeY = 15
    ctx.drawImage(qrcodeCanvas, codeX, codeY, codeW, codeH)
    
    // 绘制文字
    ctx.fillStyle = '#787878'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText($t('二维码长期有效'), baseWidth / 2, 212)
    
    ctx.fillStyle = '#000000'
    ctx.font = '14px sans-serif'
    ctx.fillText(props.groupName || '', baseWidth / 2, 232)
    
    // 下载图片
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `${props.groupName || '群二维码'}.png`
    link.href = dataUrl
    link.click()
    
    showToast($t('保存成功'))
  } catch (e) {
    console.error('Save QR code failed:', e)
    showToast($t('保存失败'), 'error')
  }
}
</script>

<style lang="scss" scoped>
.comGroupQrCode {
  position: absolute;
  right: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: #ffffff;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;

  .head {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: #ffffff;
    border-bottom: 1px solid #f5f5f5;
    position: relative;
    height: 50px;
    font-size: 16px;
    font-weight: 600;
    color: #000;
    width: 100%;

    picture {
      position: absolute;
      left: 0;
      top: 0;
      height: 50px;
      width: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      img {
        display: block;
        width: 25px;
      }
    }
  }

  section {
    height: 250px;
    width: 100%;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    position: relative;
    padding-bottom: 30px;
    margin-top: 20px;

    h3 {
      display: block;
      font-size: 13px;
      color: #787878;
      line-height: 30px;
      margin-top: 10px;
      font-weight: normal;
    }

    span {
      font-size: 14px;
      color: #999;
    }
  }

  .buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    width: 100%;
    margin-top: 20px;

    .btn-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-left: 20px;

      &:first-child {
        margin-left: 0;
      }
    }

    button {
      width: 54px;
      height: 54px;
      background: #F2F9FF;
      border-radius: 16px;
      border: none;
      font-size: 16px;
      font-weight: 500;
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 10px;
      cursor: pointer;
      position: relative;
      transition: background 0.2s;

      &:hover {
        background: #e8f4ff;
      }

      img {
        display: block;
        width: 20px;
      }
    }

    .btn-title {
      font-size: 12px;
      color: #000;
      font-weight: 300;
    }
  }
}
</style>