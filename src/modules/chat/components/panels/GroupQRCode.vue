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
        <p @click="handleGroupQrCodeGet">
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
import { groupQrCode } from '@/api/imBase'
import Toast from '@/components/Toast.vue'
import { exportBase64ImgToLocal, userSelectSavePath } from '@/utils/fileTools'
import { useUIStore } from '@/stores/useUIStore'

const { t: $t, locale } = useI18n()
const uiStore = useUIStore()

/** 英文/葡语/越南语界面下，系统另存为等对话框更适合拉丁文件名 */
function prefersAsciiFriendlyFileNames(): boolean {
  const loc = (locale.value || '').toLowerCase()
  return loc.startsWith('en') || loc.startsWith('pt') || loc.startsWith('vi')
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/

function safeFileNameId(): string {
  return String(props.groupId || 'group').replace(/[/\\?%*:|"<>.\s]/g, '_').slice(0, 48) || 'group'
}

function sanitizeFileNameStem(name: string): string {
  const s = name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 120)
  return s || $t('群二维码')
}

/** 保存/转发图片默认主文件名（不含扩展名）：英文界面下中文群名改为 Group-QR-{id} 等 */
function qrImageFileStem(): string {
  const raw = props.groupName?.trim() ?? ''
  const idPart = safeFileNameId()
  const latinUi = prefersAsciiFriendlyFileNames()

  if (!raw) {
    return latinUi ? $t('群二维码默认文件名', { id: idPart }) : sanitizeFileNameStem($t('群二维码'))
  }
  if (latinUi && CJK_RE.test(raw)) {
    return $t('群二维码默认文件名', { id: idPart })
  }
  return sanitizeFileNameStem(raw)
}

function qrImageFileName(): string {
  return `${qrImageFileStem()}.png`
}

const props = defineProps<{
  visible: boolean
  groupId: string
  groupName: string
}>()

defineEmits<{ (e: 'close'): void }>()

const qrUrl = ref('')
const loading = ref(false)
const qrcodeWrapRef = ref<HTMLElement | null>(null)

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
    try {
      const res = await groupQrCode({ groupId: props.groupId, force: false })
      const { qrUrl: resQrUrl, shortLink } = res || {}
      if (resQrUrl) {
        qrUrl.value = shortLink || resQrUrl
      } else {
        showToast($t('二维码获取失败'), 'error')
      }
    } catch (e) {
      console.error('get group qrcode failed:', e)
      showToast($t('二维码获取失败'), 'error')
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
      showToast($t('二维码获取失败'), 'error')
    }
  } catch (e) {
    console.error('reset group qrcode failed:', e)
    showToast($t('二维码获取失败'), 'error')
  }
}

function handleCopy() {
  if (!qrUrl.value) return
  navigator.clipboard.writeText(qrUrl.value).then(() => {
    showToast($t('复制成功'))
  }).catch(() => {
    showToast($t('复制失败'), 'error')
  })
}

function handleForward() {
  const qrCodeBase64 = buildQrCodeImage()
  if (!qrCodeBase64) {
    showToast($t('转发失败'), 'error')
    return
  }

  const imageName = qrImageFileName()
  uiStore.openForwardDialogWithPayload({
    msgType: 1,
    content: JSON.stringify({
      name: imageName,
      url: qrCodeBase64,
      thumbnailUrl: qrCodeBase64,
    }),
  })
}

function buildQrCodeImage(): string | null {
  const qrcodeElement = resolveQrCanvas()
  if (!qrcodeElement) {
    console.error('[GroupQRCode] buildQrCodeImage failed: canvas not found')
    return null
  }

  try {
    const dpr = window.devicePixelRatio || 1
    const baseWidth = 360
    const baseHeight = 340

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    canvas.width = baseWidth * dpr
    canvas.height = baseHeight * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0, 0, baseWidth, baseHeight)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, baseWidth, baseHeight - 40)

    // 转发图保持较大二维码展示，避免文字和码体在预览中不可读
    const drawCodeSize = 250
    const codeX = (baseWidth - drawCodeSize) / 2
    const codeY = 12
    ctx.drawImage(qrcodeElement, codeX, codeY, drawCodeSize, drawCodeSize)

    ctx.fillStyle = '#787878'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText($t('二维码长期有效'), baseWidth / 2, 286)

    ctx.fillStyle = '#000000'
    ctx.font = '22px sans-serif'
    ctx.fillText(props.groupName || '', baseWidth / 2, 318)

    const dataUrl = canvas.toDataURL('image/png')
    return dataUrl
  } catch (e) {
    console.error('Build QR code image failed:', e)
    return null
  }
}

function handleSave() {
  const dataUrl = buildQrCodeImage()
  if (!dataUrl) {
    showToast($t('保存失败无画布'), 'error')
    return
  }
  handleExportQrCode(dataUrl)
}

async function handleExportQrCode(qrCodeBase64: string) {
  const suffix = '.png'
  const fileName = qrImageFileName()

  if (!isTauri()) {
    const link = document.createElement('a')
    link.download = fileName
    link.href = qrCodeBase64
    link.click()
    showToast($t('保存成功'))
    return
  }

  try {
    const { filePath, canceled } = await userSelectSavePath(fileName)
    if (!filePath || canceled) return
    const finalPath = filePath.endsWith(suffix) ? filePath : `${filePath}${suffix}`
    const err = await exportBase64ImgToLocal(qrCodeBase64, finalPath)
    if (err) {
      showToast($t('保存失败详情', { detail: err.message }), 'error')
      return
    }
    showToast($t('保存成功'))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    showToast($t('保存失败详情', { detail: message }), 'error')
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
    align-items: flex-start;
    justify-content: space-evenly;
    width: 100%;
    box-sizing: border-box;
    border: none;
    flex-shrink: 0;
    padding: 20px 8px 30px;
    gap: 4px;

    .btn-item {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
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
      display: block;
      width: 100%;
      max-width: 100%;
      font-size: 12px;
      color: #000;
      font-weight: 300;
      line-height: 1.35;
      text-align: center;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
  }
}
</style>
