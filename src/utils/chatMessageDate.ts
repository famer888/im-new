/**
 * 与旧 im `src/utils/base.js` 中聊天日期条相关逻辑一致：
 * `isRecentDay`、`chatPageDateformat`、`freeTime`、`chatDate`
 * （展示用标签文案来自 `chatPageDateformat`，是否显示新一天来自 `chatDate` 真值，对齐 `utils/widget/chat-msg-list.js`）
 */
import dayjs from 'dayjs'
import type { Message } from '@/stores/useMessageStore'

/** 0:今天、1:昨天、2:前天 */
function isRecentDay(timestamp: number): number {
  const date = new Date(timestamp)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function freeTime(value: number, g: string): string {
  const time = new Date(Number(value))
  const y = time.getFullYear()
  const m = time.getMonth() + 1
  const d = time.getDate()
  const h = time.getHours()
  const i = time.getMinutes()
  const s = time.getSeconds()
  return g
    .replace('y', String(y))
    .replace('m', m > 9 ? String(m) : `0${m}`)
    .replace('d', d > 9 ? String(d) : `0${d}`)
    .replace('h', h > 9 ? String(h) : `0${h}`)
    .replace('i', i > 9 ? String(i) : `0${i}`)
    .replace('s', s > 9 ? String(s) : `0${s}`)
}

/**
 * 与 `base.js::chatDate` 一致：用于判断「是否显示日期分隔」的真值（非展示文案）。
 */
export function chatDate(onlineStatusUpdateTime: number): string {
  if (!onlineStatusUpdateTime) return ''
  const dateStr = new Date().toLocaleDateString()
  const nowDateTime = new Date(dateStr).getTime()
  const duringT = nowDateTime - onlineStatusUpdateTime
  const hour = Math.floor(duringT / 60 / 60 / 1000)
  const toYearTime = new Date(`${dateStr.substring(0, 4)}/1/1 00:00:00`).getTime()
  if (onlineStatusUpdateTime < toYearTime) {
    return freeTime(onlineStatusUpdateTime, 'y/m/d')
  }
  if (duringT <= 0) {
    return freeTime(onlineStatusUpdateTime, 'm/d')
  }
  if (hour < 24) {
    return freeTime(onlineStatusUpdateTime, 'm/d')
  }
  return freeTime(onlineStatusUpdateTime, 'm/d')
}

/**
 * 与 `base.js::chatPageDateformat` 一致：居中灰条上的文案（今天/昨天/前天/月日/年月日）。
 */
export function chatPageDateformat(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(Number(timestamp))
  const now = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const diff = isRecentDay(Number(timestamp))
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  if (year === now.getFullYear()) {
    return `${month}月${day}日`
  }
  return `${year}年${month}月${day}日`
}

export interface MessageListEntry {
  message: Message
  /** 与旧 im `n.showTime`：有值则本行前显示日期条 */
  showTime: string | null
  /** 与旧 im `n.showTimeDay`：日期条文案 */
  showTimeDay: string
}

/**
 * 与 `utils/widget/chat-msg-list.js::fnMsgListToBlockInfos` 中日期间隔规则一致：
 * 按自然日切换时在第一条消息上展示 `showTimeDay`。
 */
export function attachDateSeparators(messages: Message[]): MessageListEntry[] {
  let beforeTime = 0
  let lastShowTimeDay = ''
  const out: MessageListEntry[] = []
  for (const msg of messages) {
    const dayStr = dayjs(msg.sendTime).format('YYYY-MM-DD')
    const prevDayStr = beforeTime ? dayjs(beforeTime).format('YYYY-MM-DD') : ''
    let showTime: string | null = null
    if (!beforeTime || dayStr !== prevDayStr) {
      showTime = chatDate(msg.sendTime) || null
      lastShowTimeDay = chatPageDateformat(msg.sendTime) || ''
    }
    beforeTime = msg.sendTime
    out.push({
      message: msg,
      showTime,
      showTimeDay: lastShowTimeDay,
    })
  }
  return out
}
