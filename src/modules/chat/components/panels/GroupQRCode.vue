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
        <div ref="qrcodeWrapRef">
          <QrcodeVue
            class="code"
            :value="qrUrl"
            level="H"
            :size="180"
            render-as="canvas"
          />
        </div>
        <h3>{{ $t('二维码长期有效') }}</h3>
        <p v-if="showResetCode" @click="handleGroupQrCodeGet">
          <img class="refresh-icon" src="@/assets/images/common/refresh.png" />
          {{ $t('重置二维码') }}
        </p>
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
import { getGroupDetail, groupQrCode } from '@/api/imBase'
import Toast from '@/components/Toast.vue'
import { exportBase64ImgToLocal, userSelectSavePath } from '@/utils/fileTools'

const { t: $t } = useI18n()

const props = defineProps<{
  visible: boolean
  groupId: string
  groupName: string
  canResetCode?: boolean
}>()

defineEmits<{ (e: 'close'): void }>()

const qrUrl = ref('')
const loading = ref(false)
const qrcodeWrapRef = ref<HTMLElement | null>(null)
const showResetCode = ref(false)

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function resolveQrCanvas(): HTMLCanvasElement | null {
  const wrap = qrcodeWrapRef.value
  if (!wrap) return null
  const canvas = wrap.querySelector('canvas')
  if (canvas instanceof HTMLCanvasElement) return canvas
  return null
}

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

watch(() => props.visible, async (v) => {
  if (v && props.groupId) {
    loading.value = true
    qrUrl.value = ''
    showResetCode.value = Boolean(props.canResetCode)
    try {
      if (props.canResetCode === undefined) {
        const detail = await getGroupDetail({ groupId: props.groupId })
        showResetCode.value = detail.memberType === 0 || Boolean(detail.bfResetQrcode)
      }
      const res = await groupQrCode({ groupId: props.groupId, force: false })
      const { qrUrl: resQrUrl, shortLink } = res || {}
      if (resQrUrl) {
        qrUrl.value = shortLink || resQrUrl
      } else {
        showToast('二维码获取失败', 'error')
      }
    } catch (e) {
      console.error('get group qrcode failed:', e)
      showToast('二维码获取失败', 'error')
    } finally {
      loading.value = false
    }
  }
})

async function handleGroupQrCodeGet() {
  if (!props.groupId) return
  try {
    const res = await groupQrCode({ groupId: props.groupId, force: true })
    const { qrUrl: resQrUrl, shortLink } = res || {}
    if (resQrUrl) {
      qrUrl.value = shortLink || resQrUrl
    } else {
      showToast('二维码获取失败', 'error')
    }
  } catch (e) {
    console.error('reset group qrcode failed:', e)
    showToast('二维码获取失败', 'error')
  }
}

function handleCopy() {
  if (!qrUrl.value) return
  navigator.clipboard.writeText(qrUrl.value).then(() => {
    showToast($t('复制成功'))
  }).catch(() => {
    showToast('复制失败', 'error')
  })
}

function handleForward() {
  showToast($t('暂未实现转发功能'))
}

function handleSave() {
  const qrcodeElement = resolveQrCanvas()
  if (!qrcodeElement) {
    console.error('[GroupQRCode] handleSave failed: canvas not found')
    showToast('保存失败: 未获取到二维码画布', 'error')
    return
  }
  try {
    const dpr = window.devicePixelRatio || 1
    const baseWidth = 270
    const baseHeight = 300

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = baseWidth * dpr
    canvas.height = baseHeight * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0, 0, baseWidth, baseHeight)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, baseWidth, baseHeight - 35)

    const codeW = qrcodeElement.width
    const codeH = qrcodeElement.height
    const codeX = (baseWidth - codeW) / 2
    const codeY = 15
    ctx.drawImage(qrcodeElement, codeX, codeY, codeW, codeH)

    ctx.fillStyle = '#787878'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText($t('二维码长期有效'), baseWidth / 2, 212)

    ctx.fillStyle = '#000000'
    ctx.font = '14px sans-serif'
    ctx.fillText(props.groupName || '', baseWidth / 2, 232)

    const dataUrl = canvas.toDataURL('image/png')
    handleExportQrCode(dataUrl)
  } catch (e) {
    console.error('Save QR code failed:', e)
    showToast('保存失败', 'error')
  }
}

async function handleExportQrCode(qrCodeBase64: string) {
  const suffix = '.png'
  const fileName = `${props.groupName || '群二维码'}${suffix}`

  if (!isTauri()) {
    const link = document.createElement('a')
    link.download = fileName
    link.href = qrCodeBase64
    link.click()
    showToast('保存成功')
    return
  }

  try {
    const { filePath, canceled } = await userSelectSavePath(fileName)
    if (!filePath || canceled) return
    const finalPath = filePath.endsWith(suffix) ? filePath : `${filePath}${suffix}`
    const err = await exportBase64ImgToLocal(qrCodeBase64, finalPath)
    if (err) {
      showToast(`保存失败: ${err.message}`, 'error')
      return
    }
    showToast('保存成功')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    showToast(`保存失败: ${message}`, 'error')
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
  overflow-y: auto;
  overflow-x: hidden;

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
    flex-shrink: 0;

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
    flex-shrink: 0;

    h3 {
      display: block;
      font-size: 13px;
      color: #787878;
      line-height: 30px;
      font-weight: normal;
    }

    p {
      display: flex;
      align-items: center;
      font-size: 14px;
      color: #333;
      cursor: pointer;
      user-select: none;
      margin: 0;

      &:hover {
        color: #000;
      }

      .refresh-icon {
        height: 18px;
        margin-right: 4px;
      }
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
    flex-shrink: 0;
    padding: 20px 0 30px;

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
        background: #f9f9f9;
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
