import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getContactsApplyList, getContactsDetail, getContactsList } from '@/api/imBase'
import { DEFAULT_READ_BURN_SECONDS } from '@/utils/readBurn'

const NEW_FRIEND_REQ_TOTAL_SUFFIX = '-newFriendReqTotal'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface Contact {
  id: string
  nickname: string | null
  avatar: string | null
  pinyin: string | null
  letter?: string | null
  remark: string | null
  depict?: string | null
  identify?: string | null
  bfReadCancel?: boolean
  bfMyBlack?: boolean
  msgCancelTime?: number
  status: number
  updatedAt: number
  /** 与 im `user.userOnOrOffline.online` 一致 */
  online?: boolean
  /** 与 im `userOnOrOffline.createTime` 一致（毫秒，用于「xx前在线」） */
  onlineStatusUpdateTime?: number
  /** 为 false 时不展示在线状态（与 proto `bfShow` 一致） */
  bfShowOnline?: boolean
}

function assertOk(
  resp: { commonResult?: { errCode?: number | string | null; errMsg?: string | null } | null },
  label: string,
) {
  const errCode = Number(resp?.commonResult?.errCode ?? 200)
  if (errCode !== 200 && errCode !== 0) {
    throw new Error(`${label} failed: ${resp.commonResult?.errMsg || errCode}`)
  }
}

export const useContactStore = defineStore('contact', () => {
  const contacts = ref<Contact[]>([])
  const searchResults = ref<Contact[]>([])
  const newFriendReqTotal = ref(0)
  const loading = ref(false)
  const loadedDetailIds = new Set<string>()
  const detailRequestMap = new Map<string, Promise<void>>()
  const detailRevisionMap = new Map<string, number>()

  function getNewFriendReqTotalCacheKey(uid: string) {
    return `${uid}${NEW_FRIEND_REQ_TOTAL_SUFFIX}`
  }

  function loadNewFriendReqTotal(uid: string) {
    if (!uid) {
      newFriendReqTotal.value = 0
      return
    }
    try {
      const raw = localStorage.getItem(getNewFriendReqTotalCacheKey(uid))
      const total = Number(raw || 0)
      newFriendReqTotal.value = Number.isFinite(total) ? Math.max(0, total) : 0
    } catch {
      newFriendReqTotal.value = 0
    }
  }

  function setNewFriendReqTotal(total: number, uid?: string) {
    const nextTotal = Math.max(0, Number(total || 0))
    newFriendReqTotal.value = nextTotal
    if (!uid) return
    try {
      localStorage.setItem(getNewFriendReqTotalCacheKey(uid), String(nextTotal))
    } catch {
      // ignore storage errors
    }
  }

  async function refreshNewFriendReqTotal(uid?: string) {
    try {
      const resp = await getContactsApplyList({ version: 0 })
      const total = Array.isArray((resp as any)?.unRecordList)
        ? (resp as any).unRecordList.length
        : 0
      setNewFriendReqTotal(total, uid)
    } catch (e) {
      console.warn('[ContactStore] refresh new friend request total failed:', e)
    }
  }

  async function loadContacts(uid: string) {
    loading.value = true
    try {
      if (isTauri()) {
        const localContacts = await tauriInvoke<Contact[]>('get_contacts', { uid })
        if (Array.isArray(localContacts) && localContacts.length > 0) {
          contacts.value = localContacts
        } else {
          // Fallback to HTTP API when local DB has not been initialized yet.
          await loadContactsViaApi()
        }
      } else {
        await loadContactsViaApi()
      }
    } catch (e) {
      console.error('[ContactStore] loadContacts failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadContactsViaApi() {
    const allContacts: Contact[] = []
    let pageNum = 1
    const pageSize = 200
    let hasMore = true

    while (hasMore) {
      try {
        const resp = await getContactsList({ pageNum, pageSize })
        assertOk(resp, 'contactsList')
        const list = resp.contactsList || []
        for (const item of list) {
          const u = (item as any).userInfo || item
          const oo = u?.userOnOrOffline
          const onlinePatch =
            oo != null
              ? {
                  online: Boolean(oo.online),
                  onlineStatusUpdateTime: Number(oo.createTime || 0) || undefined,
                  bfShowOnline: (oo as { bfShow?: boolean }).bfShow !== false,
                }
              : {}
          allContacts.push({
            id: String(u.uid || ''),
            nickname: u.nickName || u.nickname || null,
            avatar: u.icon || u.avatar || null,
            pinyin: (item as any).pinyin || null,
            letter: (item as any).letter || null,
            remark: u.friendRelation?.remarkName || null,
            depict: u.depict || null,
            identify: u.identify || null,
            status: Number(u.uid) > 0 ? 1 : 0,
            updatedAt: Number((item as any).updateTime || 0),
            ...onlinePatch,
          })
        }
        const totalCount = resp.count || 0
        hasMore = totalCount > 0
          ? allContacts.length < totalCount
          : list.length >= pageSize
        pageNum++
      } catch (e) {
        console.error('[ContactStore] API page', pageNum, 'failed:', e)
        hasMore = false
      }
    }

    contacts.value = allContacts
  }

  async function searchContacts(uid: string, keyword: string) {
    if (!keyword.trim()) {
      searchResults.value = []
      return
    }
    if (isTauri()) {
      searchResults.value = await tauriInvoke<Contact[]>('search_contacts', { uid, keyword })
    } else {
      searchResults.value = contacts.value.filter(
        (c) =>
          c.nickname?.includes(keyword) ||
          c.remark?.includes(keyword) ||
          c.id.includes(keyword),
      )
    }
  }

  function getContact(id: string): Contact | undefined {
    return contacts.value.find((c) => c.id === id)
  }

  function getDisplayName(id: string): string {
    const contact = getContact(id)
    return contact?.remark || contact?.nickname || id
  }

  function patchContact(
    id: string,
    patch: Partial<Contact>,
    options?: { source?: 'local' | 'remote'; markDetailLoaded?: boolean },
  ) {
    // 详情接口可能比本地 toggle/save 晚回来，revision 用来挡住过期覆盖。
    const touchesDetailFields =
      Object.prototype.hasOwnProperty.call(patch, 'bfReadCancel')
      || Object.prototype.hasOwnProperty.call(patch, 'bfMyBlack')
      || Object.prototype.hasOwnProperty.call(patch, 'msgCancelTime')

    if (touchesDetailFields) {
      if (options?.markDetailLoaded || options?.source !== 'remote') {
        loadedDetailIds.add(id)
      }
      if (options?.source !== 'remote') {
        detailRevisionMap.set(id, (detailRevisionMap.get(id) || 0) + 1)
      }
    }

    const target = contacts.value.find((c) => c.id === id)
    if (target) {
      Object.assign(target, patch)
    }
    const searchTarget = searchResults.value.find((c) => c.id === id)
    if (searchTarget) {
      Object.assign(searchTarget, patch)
    }
  }

  async function ensureContactDetailLoaded(id: string, options?: { force?: boolean }) {
    const targetId = String(id || '')
    if (!targetId || !getContact(targetId)) return
    if (!options?.force && loadedDetailIds.has(targetId)) return

    const pendingRequest = detailRequestMap.get(targetId)
    if (pendingRequest) return pendingRequest
    const requestRevision = detailRevisionMap.get(targetId) || 0

    const request = (async () => {
      try {
        const resp = await getContactsDetail({ targetUid: Number(targetId) })
        const detail = (resp as any)?.contactsDetailBase
        if (!detail) return
        if ((detailRevisionMap.get(targetId) || 0) !== requestRevision) {
          return
        }
        patchContact(targetId, {
          bfReadCancel: Boolean(detail.bfReadCancel),
          bfMyBlack: Boolean(detail.bfMyBlack),
          msgCancelTime: Number(detail.msgCancelTime || DEFAULT_READ_BURN_SECONDS),
        }, {
          source: 'remote',
          markDetailLoaded: true,
        })
      } catch (e) {
        console.warn('[ContactStore] load detail failed:', targetId, e)
      } finally {
        detailRequestMap.delete(targetId)
      }
    })()

    detailRequestMap.set(targetId, request)
    return request
  }

  function removeContact(id: string) {
    contacts.value = contacts.value.filter((c) => c.id !== id)
    searchResults.value = searchResults.value.filter((c) => c.id !== id)
    loadedDetailIds.delete(id)
    detailRequestMap.delete(id)
    detailRevisionMap.delete(id)
  }

  /** 与 im 20601 `PushUserOnOrOffLineMessageResp` / 好友列表刷新一致 */
  function applyOnlineStatusUpdates(
    rows: Array<{ uid: string; online: boolean; createTime: number; bfShow?: boolean }>,
  ) {
    for (const row of rows) {
      if (!row.uid) continue
      const patch = {
        online: row.online,
        onlineStatusUpdateTime: row.createTime || undefined,
        bfShowOnline: row.bfShow !== false,
      }
      patchContact(row.uid, patch)
      const inSearch = searchResults.value.find((c) => c.id === row.uid)
      if (inSearch) Object.assign(inSearch, patch)
    }
  }

  return {
    contacts,
    searchResults,
    newFriendReqTotal,
    loading,
    loadNewFriendReqTotal,
    setNewFriendReqTotal,
    refreshNewFriendReqTotal,
    loadContacts,
    searchContacts,
    getContact,
    getDisplayName,
    patchContact,
    ensureContactDetailLoaded,
    removeContact,
    applyOnlineStatusUpdates,
  }
})
