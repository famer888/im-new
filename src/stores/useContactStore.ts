import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getContactsDetail, getContactsList } from '@/api/imBase'
import { isOfficialAccountTargetId, OFFICIAL_ACCOUNT_NAME } from '@/stores/useChatStore'
import { normalizeFriendIdentify } from '@/utils/friendIdentify'
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
  bfDisturb?: boolean
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
  /** 对齐旧 im `newFriendReq`：WS 20302 到达时递增，供「新的好友」页刷新申请列表 */
  const friendReqSignal = ref(0)
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

  function setNewFriendReqTotal(total: number, uid?: string, options?: { fromPush?: boolean }) {
    const nextTotal = Math.max(0, Number(total || 0))
    newFriendReqTotal.value = nextTotal
    if (options?.fromPush) {
      friendReqSignal.value += 1
    }
    if (!uid) return
    try {
      localStorage.setItem(getNewFriendReqTotalCacheKey(uid), String(nextTotal))
    } catch {
      // ignore storage errors
    }
  }

  /**
   * 对齐旧 im：好友未读红点只来自本地缓存 + WS 20302(friendReqNum)，
   * 打开「新的好友」后清零并持久化；不能用申请列表 unRecordList.length 回填，
   * 否则切回通讯录会把已读红点再次顶出来。
   */
  async function refreshNewFriendReqTotal(uid?: string) {
    loadNewFriendReqTotal(String(uid || ''))
  }

  async function loadContacts(uid: string, options?: { fallbackToApi?: boolean; refreshRemote?: boolean }) {
    const fallbackToApi = options?.fallbackToApi ?? true
    const refreshRemote = options?.refreshRemote ?? !isTauri()
    loading.value = true
    try {
      if (isTauri()) {
        let localContacts: Contact[] = []
        try {
          const localRows = await tauriInvoke<Contact[]>('get_contacts', { uid })
          localContacts = (Array.isArray(localRows) ? localRows : []).map((contact) => ({
            ...contact,
            identify: normalizeFriendIdentify(contact.identify),
          }))
          if (localContacts.length > 0) {
            contacts.value = localContacts
          }
        } catch (error) {
          console.error('[ContactStore] local get_contacts failed:', error)
        }

        if ((localContacts.length === 0 && fallbackToApi) || refreshRemote) {
          // 对齐旧 im：桌面端先用本地联系人兜底，再立即用远端全量通讯录回填备注/昵称。
          await loadContactsViaApi(uid)
        }
      } else {
        await loadContactsViaApi(uid)
      }
    } catch (e) {
      console.error('[ContactStore] loadContacts failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function persistContactsToLocal(uid: string | undefined, list: Contact[]) {
    const rows = list.filter((contact) => String(contact.id || '').trim())
    if (!uid || !isTauri() || rows.length === 0) return

    try {
      const results = await Promise.allSettled(
        rows.map((contact) => tauriInvoke('upsert_contact', {
          uid,
          contact: {
            id: contact.id,
            nickname: contact.nickname ?? null,
            avatar: contact.avatar ?? null,
            pinyin: contact.pinyin ?? null,
            letter: contact.letter ?? null,
            remark: contact.remark ?? null,
            depict: contact.depict ?? null,
            identify: normalizeFriendIdentify(contact.identify),
            status: Number(contact.status ?? 1),
            updated_at: Number(contact.updatedAt || Date.now()),
          },
        })),
      )
      const failedCount = results.filter((result) => result.status === 'rejected').length
      if (failedCount > 0) {
        console.warn('[ContactStore] persist API contacts partial failed:', failedCount)
      }
    } catch (error) {
      console.warn('[ContactStore] persist API contacts failed:', error)
    }
  }

  async function loadContactsViaApi(uid?: string) {
    const allContacts: Contact[] = []
    let pageNum = 1
    const pageSize = 200
    let hasMore = true
    let apiFailed = false

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
            identify: normalizeFriendIdentify(u.identify),
            bfDisturb: Boolean((item as any).bfDisturb),
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
        apiFailed = true
        hasMore = false
      }
    }

    if (apiFailed && allContacts.length === 0) {
      throw new Error('contacts API load failed')
    }

    contacts.value = allContacts
    void persistContactsToLocal(uid, allContacts)
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
    // 对齐旧 im：官方号 9900 不一定在通讯录里，也必须稳定显示固定名称。
    if (isOfficialAccountTargetId(id)) return OFFICIAL_ACCOUNT_NAME
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
      // 本地拉黑/阅后即焚开关不应挡住后续详情拉取（对齐旧 im 每次打开会话都会 getContactsDetail）。
      if (options?.markDetailLoaded || options?.source === 'remote') {
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

  async function upsertContact(
    contact: Partial<Contact> & { id: string },
    options?: { uid?: string; source?: 'local' | 'remote'; markDetailLoaded?: boolean; persist?: boolean },
  ) {
    const id = String(contact.id || '').trim()
    if (!id) return

    const now = Date.now()
    const patch: Partial<Contact> = {
      ...contact,
      id,
      status: Number(contact.status ?? 1),
      updatedAt: Number(contact.updatedAt || now),
    }
    const existing = contacts.value.find((c) => c.id === id)
    if (existing) {
      patchContact(id, patch, {
        source: options?.source,
        markDetailLoaded: options?.markDetailLoaded,
      })
    } else {
      contacts.value.push({
        id,
        nickname: patch.nickname ?? null,
        avatar: patch.avatar ?? null,
        pinyin: patch.pinyin ?? null,
        letter: patch.letter ?? null,
        remark: patch.remark ?? null,
        depict: patch.depict ?? null,
        identify: normalizeFriendIdentify(patch.identify),
        bfReadCancel: patch.bfReadCancel,
        bfMyBlack: patch.bfMyBlack,
        msgCancelTime: patch.msgCancelTime,
        status: Number(patch.status ?? 1),
        updatedAt: Number(patch.updatedAt || now),
        online: patch.online,
        onlineStatusUpdateTime: patch.onlineStatusUpdateTime,
        bfShowOnline: patch.bfShowOnline,
      })
    }

    const searchTarget = searchResults.value.find((c) => c.id === id)
    if (searchTarget) Object.assign(searchTarget, patch)

    if (options?.persist === false || !isTauri() || !options?.uid) return
    try {
      await tauriInvoke('upsert_contact', {
        uid: options.uid,
        contact: {
          id,
          nickname: patch.nickname ?? null,
          avatar: patch.avatar ?? null,
          pinyin: patch.pinyin ?? null,
          letter: patch.letter ?? null,
          remark: patch.remark ?? null,
          depict: patch.depict ?? null,
          identify: normalizeFriendIdentify(patch.identify),
          status: Number(patch.status ?? 1),
          updated_at: Number(patch.updatedAt || now),
        },
      })
    } catch (error) {
      console.warn('[ContactStore] persist upsert contact failed:', id, error)
    }
  }

  function shouldRefreshContactDisplay(id: string): boolean {
    const targetId = String(id || '').trim()
    if (!targetId) return false
    const contact = getContact(targetId)
    if (!contact) return true
    if (!normalizeFriendIdentify(contact.identify)) return true
    const display = String(contact.remark || contact.nickname || '').trim()
    return !display || display === targetId
  }

  async function ensureContactDetailLoaded(
    id: string,
    options?: { force?: boolean; createIfMissing?: boolean; uid?: string },
  ) {
    const targetId = String(id || '')
    if (!targetId) return
    if (!getContact(targetId) && !options?.createIfMissing) return
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
        const userInfo = (detail as { userInfo?: Record<string, any> }).userInfo || {}
        const detailPatch: Partial<Contact> = {
          bfReadCancel: Boolean(detail.bfReadCancel),
          // 免打扰由服务端详情下发，用于 App/PC 之间校准本地会话静音状态。
          bfDisturb: Boolean(detail.bfDisturb),
          bfMyBlack: Boolean(detail.bfMyBlack),
          msgCancelTime: Number(detail.msgCancelTime || DEFAULT_READ_BURN_SECONDS),
        }

        // 对齐旧 im：好友详情接口除了开关状态，还要回填 identify/昵称/头像，
        // 这样右侧资料面板显示好友号时不会退回成内部 uid。
        const nickname = String(userInfo.nickName || userInfo.nickname || '').trim()
        const avatar = String(userInfo.icon || userInfo.avatar || '').trim()
        const identify = normalizeFriendIdentify(userInfo.identify)
        const depict = String(detail.depict || userInfo.depict || '').trim()
        const friendRelation = userInfo.friendRelation as { remarkName?: string } | undefined

        if (nickname) detailPatch.nickname = nickname
        if (avatar) detailPatch.avatar = avatar
        if (identify) detailPatch.identify = identify
        if (depict) detailPatch.depict = depict
        if (friendRelation && Object.prototype.hasOwnProperty.call(friendRelation, 'remarkName')) {
          detailPatch.remark = friendRelation.remarkName ? String(friendRelation.remarkName) : null
        }

        if (getContact(targetId)) {
          patchContact(targetId, detailPatch, {
            source: 'remote',
            markDetailLoaded: true,
          })
        } else {
          await upsertContact({
            id: targetId,
            ...detailPatch,
            status: 1,
            updatedAt: Date.now(),
          }, {
            uid: options?.uid,
            source: 'remote',
            markDetailLoaded: true,
          })
        }
      } catch (e) {
        console.warn('[ContactStore] load detail failed:', targetId, e)
      } finally {
        detailRequestMap.delete(targetId)
      }
    })()

    detailRequestMap.set(targetId, request)
    return request
  }

  async function refreshContactFromRemote(
    friendId: string,
    options?: { uid?: string },
  ) {
    return ensureContactDetailLoaded(friendId, {
      force: true,
      createIfMissing: true,
      uid: options?.uid,
    })
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
    friendReqSignal,
    loading,
    loadNewFriendReqTotal,
    setNewFriendReqTotal,
    refreshNewFriendReqTotal,
    loadContacts,
    searchContacts,
    getContact,
    getDisplayName,
    patchContact,
    upsertContact,
    ensureContactDetailLoaded,
    refreshContactFromRemote,
    shouldRefreshContactDisplay,
    removeContact,
    applyOnlineStatusUpdates,
  }
})
