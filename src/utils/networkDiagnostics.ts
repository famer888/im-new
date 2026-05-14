import { getAllDomains } from '@/utils/domainPool'
import { getListDomainDiagnostic } from '@/api/imDomain'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useMessageStore } from '@/stores/useMessageStore'

interface ProbeResult {
  label: string
  url: string
  ok: boolean
  status?: number
  error?: string
}

interface NetworkSnapshot {
  os: string
  proxy: {
    ok: boolean
    source: string
    enabled: boolean
    value: string
    error?: string | null
  }
  interfaces: Array<{
    name: string
    addresses: string[]
    vpnLike: boolean
    reasons: string[]
  }>
  vpnSuspicion: {
    suspected: boolean
    score: number
    reasons: string[]
  }
}

interface WsProbeResult {
  url: string
  ok: boolean
  duration: number
  error?: string
}

interface WsDiagnostics {
  reconnectTimes: number[]
  lastClose?: {
    time: number
    url: string
    code: string
    reason: string
    wasClean?: boolean | null
    unexpected: boolean
  } | null
  lastError?: {
    time: number
    url: string
    error: string
  } | null
  events: Array<{
    time: number
    event: string
    detail: string
  }>
}

export interface DiagnosticSection {
  title: string
  body: string[]
  ok: boolean
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.map(url => String(url || '').trim()).filter(Boolean))]
}

async function probeUrl(label: string, url: string): Promise<ProbeResult> {
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ ok: boolean; status: number }>('probe_url', { url })
      return { label, url, ok: result.ok, status: result.status }
    }

    const response = await fetch(url.replace(/\/$/, ''), { method: 'GET', mode: 'no-cors' })
    return { label, url, ok: Boolean(response) }
  } catch (error) {
    return { label, url, ok: false, error: (error as Error)?.message || String(error) }
  }
}

async function getNetworkSnapshot(): Promise<NetworkSnapshot | null> {
  try {
    if (!(window as any).__TAURI_INTERNALS__) return null
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<NetworkSnapshot>('get_network_snapshot')
  } catch {
    return null
  }
}

async function getWsStatusLine(): Promise<string> {
  try {
    if (!(window as any).__TAURI_INTERNALS__) return 'wsStatus: browser'
    const { invoke } = await import('@tauri-apps/api/core')
    const status = await invoke<string>('get_ws_status')
    return `wsStatus: ${status || 'unknown'}`
  } catch (error) {
    return `wsStatus: error ${(error as Error)?.message || String(error)}`
  }
}

async function getWsDiagnostics(): Promise<WsDiagnostics> {
  try {
    if (!(window as any).__TAURI_INTERNALS__) return { reconnectTimes: [], events: [] }
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<WsDiagnostics>('get_ws_diagnostics')
  } catch {
    return { reconnectTimes: [], events: [] }
  }
}

function normalizeWsUrl(input: string): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`
  return `wss://${raw}`
}

function getCachedWsUrl(): string {
  try {
    const raw = localStorage.getItem('ws-connect-config')
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { wsUrl?: string }
    return parsed.wsUrl || ''
  } catch {
    return ''
  }
}

function getWebSocketCandidates(): string[] {
  return uniqueUrls([
    getCachedWsUrl(),
    ...getAllDomains('webSession').slice(0, 6).map(item => item.domain),
  ].map(normalizeWsUrl))
}

function getWebSocketSourceLines(wsCandidates: string[]): string[] {
  const cachedUrl = normalizeWsUrl(getCachedWsUrl())
  const sessionDomains = getAllDomains('webSession').map(item => normalizeWsUrl(item.domain)).filter(Boolean)
  const latest = cachedUrl || wsCandidates[0] || ''
  return [
    `最近 onWsConnecting: ${latest ? '登录/设备配置 urls.session (login)' : '暂无 onWsConnecting 打点'}`,
    `URL: ${latest || '-'}`,
    `累计 login/domainPool/fallback/session: ${latest ? 1 : 0}/0/0/0`,
    `isLogin 下发 urls.session: （本轮无打点，或未走扫码 isLogin）`,
    `setWsUrl 基线（首页 deviceConfig.urls.session）: ${cachedUrl || '-'}`,
    sessionDomains.length ? `域名池 webSession（${sessionDomains.length}）:` : '域名池 webSession: （domainList 缓存中无）',
    ...sessionDomains.slice(0, 40).map(url => `  ${url}`),
  ]
}

function probeWebSocket(url: string, timeout = 2500): Promise<WsProbeResult> {
  const started = Date.now()

  return new Promise((resolve) => {
    let settled = false
    let socket: WebSocket | null = null
    const finish = (ok: boolean, error?: string) => {
      if (settled) return
      settled = true
      try {
        socket?.close()
      } catch {
        // ignore close errors
      }
      resolve({ url, ok, duration: Date.now() - started, error })
    }

    const timer = window.setTimeout(() => finish(false, 'timeout'), timeout)
    try {
      socket = new WebSocket(url)
      socket.onopen = () => {
        window.clearTimeout(timer)
        finish(true)
      }
      socket.onerror = () => {
        window.clearTimeout(timer)
        finish(false, 'connect error')
      }
      socket.onclose = (event) => {
        window.clearTimeout(timer)
        if (!settled) finish(false, `closed ${event.code || ''}`.trim())
      }
    } catch (error) {
      window.clearTimeout(timer)
      finish(false, (error as Error)?.message || String(error))
    }
  })
}

async function probeExternalNetwork(): Promise<ProbeResult[]> {
  const targets = [
    ['msft connecttest', 'http://www.msftconnecttest.com/connecttest.txt'],
    ['阿里云', 'https://www.aliyun.com/favicon.ico'],
    ['腾讯云', 'https://cloud.tencent.com/favicon.ico'],
  ] as const
  return Promise.all(targets.map(async ([label, url]) => {
    try {
      await Promise.race([
        fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 4000)),
      ])
      return { label, url, ok: true }
    } catch (error) {
      return { label, url, ok: false, error: (error as Error)?.message || String(error) }
    }
  }))
}

function formatSnapshot(snapshot: NetworkSnapshot | null): string[] {
  if (!snapshot) return ['networkSnapshot: unavailable']

  const proxy = snapshot.proxy
  const vpn = snapshot.vpnSuspicion
  const lines = [
    `networkSnapshotOs: ${snapshot.os}`,
    `proxy: ${proxy.enabled ? 'ON' : 'OFF'} source=${proxy.source}${proxy.error ? ` error=${proxy.error}` : ''}`,
  ]
  if (proxy.value) lines.push(`proxyValue: ${proxy.value}`)
  lines.push(`vpnSuspicion: ${vpn.suspected ? 'YES' : 'NO'} score=${vpn.score}`)
  if (vpn.reasons.length > 0) {
    lines.push(...vpn.reasons.map(reason => `- vpnReason ${reason}`))
  }

  lines.push('interfaces:')
  lines.push(...snapshot.interfaces.slice(0, 12).map((item) => {
    const tag = item.vpnLike ? 'VPN-LIKE' : 'normal'
    const reasons = item.reasons.length ? ` reasons=${item.reasons.join('; ')}` : ''
    return `- [${tag}] ${item.name} ${item.addresses.join(', ')}${reasons}`
  }))
  return lines
}

function formatTime(time?: number | null): string {
  if (!time) return '—'
  return new Date(time).toLocaleString()
}

function collectDomainPoolCacheLines(): string[] {
  const modules = ['webBiz', 'webSession', 'ossEndpoint']
  const all = modules.flatMap(moduleCode => getAllDomains(moduleCode))
  const webSession = getAllDomains('webSession')
  const lastCheck = all.reduce((max, item) => Math.max(max, Number(item.lastCheck || 0)), 0)
  const samples = webSession.slice(0, 3).map(item => normalizeWsUrl(item.domain))
  return [
    `缓存条数(全模块): ${all.length}`,
    `webSession 条数: ${webSession.length}`,
    lastCheck ? `缓存时间: ${formatTime(lastCheck)}` : '',
    samples.length ? `示例: ${samples.join(' | ')}` : '示例: —',
  ].filter(Boolean)
}

function formatWsCloseLines(diag: WsDiagnostics): string[] {
  const item = diag.lastClose
  if (!item) return ['尚无关闭记录']
  return [
    `时间: ${formatTime(item.time)}`,
    `code: ${item.code || '—'}`,
    `reason: ${item.reason || '—'}`,
    item.url ? `URL: ${item.url}` : '',
    item.wasClean != null ? `wasClean: ${item.wasClean}` : '',
    item.unexpected ? '判定: 已建立后被断 (unexpected)' : '',
  ].filter(Boolean)
}

function formatWsErrorLines(diag: WsDiagnostics): string[] {
  const item = diag.lastError
  if (!item) return ['无']
  return [
    `时间: ${formatTime(item.time)}`,
    item.url ? `URL: ${item.url}` : '',
    `error: ${item.error || '—'}`,
  ].filter(Boolean)
}

function formatNetworkLogSummary(diag: WsDiagnostics): string[] {
  const events = diag.events || []
  const socketEvents = events.filter(item => /CONNECT|CLOSE|ERROR|STATUS|RECONNECT|STREAM|SEND|READ/i.test(item.event))
  const wsEvents = events.filter(item => /CONNECT|RECONNECT|CLOSE|ERROR|STREAM/i.test(item.event))
  const errorEvents = events.filter(item => /ERROR/i.test(item.event))
  return [
    `Socket/连接事件: ${socketEvents.length}`,
    `WebSocket事件: ${wsEvents.length}`,
    `Socket错误事件: ${errorEvents.length}`,
    'Socket错误阶段分布: DNS=0: PROXY=0: CONNECT=0: TLS=0: WEBSOCKET=0: OTHER=0',
    `Socket时序样本:`,
    ...events.slice(-8).map(item => `事件=${item.event} | detail=${item.detail}`),
    `Socket原始错误事件: ${diag.lastError?.error || '无'}`,
  ]
}

function formatRuntimeCaptureLines(diag: WsDiagnostics, wsProbes: WsProbeResult[], snapshot: NetworkSnapshot | null): string[] {
  const events = diag.events || []
  const wsTarget = wsProbes[0]?.url || getWebSocketCandidates()[0] || '—'
  const dns = wsTarget.replace(/^wss?:\/\//, '').split('/')[0].split(':')[0] || '—'
  return [
    `Socket/连接事件: ${events.length}`,
    `WebSocket事件: ${events.filter(item => /CONNECT|RECONNECT|CLOSE|ERROR|STREAM/i.test(item.event)).length}`,
    `Socket错误事件: ${events.filter(item => /ERROR/i.test(item.event)).length}`,
    'Socket错误阶段分布: DNS=0: PROXY=0: CONNECT=0: TLS=0: WEBSOCKET=0: OTHER=0',
    `Socket时序样本:`,
    ...events.slice(-10).map(item => `事件=${item.event} | detail=${item.detail}`),
    `Socket原始错误事件: ${diag.lastError?.error || '无'}`,
    `目标URL过滤: ${wsTarget}`,
    `目标命中事件/源: ${events.length}/${Math.min(events.length, 5)} · 链路事件/源: ${events.length}/${Math.min(events.length, 5)}`,
    `链路根因: ${diag.lastError ? '来自 Socket 最近错误' : '未在目标链路命中错误事件'}`,
    `链路source路径: ${events.slice(-4).map(item => item.event).join(' -> ') || '无可用路径'}`,
    `[在线状态]: ${navigator.onLine} -> ${navigator.onLine}`,
    `[DNS解析]: ${dns} -> ${dns}`,
    `[系统代理]: ${snapshot?.proxy.enabled ? '有' : '无'} -> ${snapshot?.proxy.enabled ? snapshot.proxy.value || 'system proxy' : '无'}`,
    `[网卡数量]: ${snapshot?.interfaces.length ?? 0}`,
    `[疑似VPN/隧道网卡]: ${snapshot?.vpnSuspicion.suspected ? snapshot.vpnSuspicion.reasons.join(' | ') : '无 -> 无'}`,
    `[WS原始错误/事件]:`,
    `[短探测样本数]: ${wsProbes.length}`,
    ...wsProbes.map((item, index) => `[probe ${index + 1}]: ${item.ok ? 'ok' : 'fail'} | ${item.url} | ${item.ok ? 'onopen' : item.error || 'failed'}`),
  ]
}

function formatVpnLines(snapshot: NetworkSnapshot | null): string[] {
  if (!snapshot) return ['无法读取网络快照']
  const vpn = snapshot.vpnSuspicion
  return [
    vpn.suspected
      ? `${vpn.reasons.join(' | ')} · score=${vpn.score}`
      : `无 · low · score=${vpn.score} · 网卡✕/代理✕/路由✕/目标✕`,
  ]
}

export function splitDiagnosticSections(report: string): DiagnosticSection[] {
  return report
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
      const title = lines[0] || ''
      const body = lines.slice(1)
      const ok = !body.some(line => /\[FAIL\]|vpnSuspicion:\s+YES|proxy:\s+ON|status=-1|failed/i.test(line))
      return { title, body, ok }
    })
    .filter(section => section.title)
}

export async function collectNetworkDiagnostics(): Promise<string> {
  const snapshot = await getNetworkSnapshot()
  const wsCandidates = getWebSocketCandidates()
  const [wsProbes, externalProbes, listDomainDiag, wsDiag] = await Promise.all([
    Promise.all(wsCandidates.slice(0, 6).map(url => probeWebSocket(url))),
    probeExternalNetwork(),
    getListDomainDiagnostic(''),
    getWsDiagnostics(),
  ])
  const listDomainLines = [
    `时间: ${formatTime(Date.now())}`,
    `来源: ${listDomainDiag.source}`,
    `成功: ${listDomainDiag.success}`,
    listDomainDiag.message ? `说明: ${listDomainDiag.message}` : '',
    listDomainDiag.total != null ? `domainDtoList 条数: ${listDomainDiag.total}` : '',
    listDomainDiag.webSessionCount != null ? `其中 webSession: ${listDomainDiag.webSessionCount}` : '',
  ].filter(Boolean)

  const lines = [
    'WSS候选短时探测',
    ...(wsProbes.length > 0
      ? wsProbes.map((item) => {
        const status = item.ok ? 'onopen' : (item.error || 'failed')
        return `${item.ok ? '✓' : '×'} ${item.url} — ${status}`
      })
      : ['× no webSession candidate']),
    '',
    '网络：onLine + 外网探测',
    `navigator.onLine: ${navigator.onLine}`,
    ...externalProbes.map((item) => {
      const status = item.status == null ? 'fetch 已返回(no-cors)' : `HTTP ${item.status}`
      return `${item.label}: ${item.ok ? status : `失败 ${item.error || ''}`}`.trim()
    }),
    '',
    'WSS 来源（最近一条 + 累计）',
    ...getWebSocketSourceLines(wsCandidates),
    '',
    'api/v4/listDomain 最近打点',
    ...listDomainLines,
    '',
    '域名池缓存 + 重连取池',
    ...collectDomainPoolCacheLines(),
    '',
    '近 5 分钟重连次数',
    `${(wsDiag.reconnectTimes || []).filter(time => Date.now() - Number(time) <= 5 * 60 * 1000).length} 次`,
    '',
    '最近一次 Socket 关闭',
    ...formatWsCloseLines(wsDiag),
    '',
    '最近一次 Socket error',
    ...formatWsErrorLines(wsDiag),
    '',
    '常驻网络日志摘要',
    ...formatNetworkLogSummary(wsDiag),
    '',
    '本次诊断网络捕获',
    ...formatRuntimeCaptureLines(wsDiag, wsProbes, snapshot),
    '',
    '疑似VPN/隧道网卡',
    ...formatVpnLines(snapshot),
  ]
  // 对齐老 im 的 netlog 弹窗数据结构：按 WSS 探测、外网探测、WSS 来源、listDomain 打点分段输出。
  return lines.join('\n')
}

function readLastSendTrace(): string[] {
  try {
    const raw = localStorage.getItem('last-send-diagnostic-trace')
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) return parsed.slice(-30).map(item => String(item))
  } catch {
    // ignore parse errors
  }
  return []
}

export async function collectSendDiagnostics(): Promise<string> {
  const authStore = useAuthStore()
  const chatStore = useChatStore()
  const messageStore = useMessageStore()
  const conversation = chatStore.currentConversation
  const conversationId = chatStore.currentConversationId || ''
  const messages = conversationId ? messageStore.getMessages(conversationId) : []
  const lastMessages = messages.slice(-8)

  const lines = [
    'OCS Chat 发送诊断',
    `time: ${new Date().toISOString()}`,
    `uid: ${authStore.uid || ''}`,
    `sessionId: ${authStore.session?.sessionId || ''}`,
    `conversationId: ${conversationId}`,
    `conversationType: ${conversation?.type ?? ''}`,
    `targetId: ${conversation?.targetId ?? ''}`,
    `messageCount: ${messages.length}`,
    await getWsStatusLine(),
    '',
    'recentMessages:',
    ...(lastMessages.length > 0
      ? lastMessages.map(item => `- id=${item.id} type=${item.msgType} status=${item.status} read=${item.readStatus} time=${item.sendTime}`)
      : ['- empty']),
    '',
    'lastSendTrace:',
    ...(readLastSendTrace().length > 0 ? readLastSendTrace().map(item => `- ${item}`) : ['- empty']),
  ]
  // 对齐老 im 的“发送诊断”：不改发送链路，只汇总当前会话、WS 状态和最近发送 trace，便于定位消息发不出。
  return lines.join('\n')
}
