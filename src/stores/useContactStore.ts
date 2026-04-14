import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getContactsList } from '@/api/imBase'

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
  bfReadCancel?: boolean
  bfMyBlack?: boolean
  status: number
  updatedAt: number
}

export const useContactStore = defineStore('contact', () => {
  const contacts = ref<Contact[]>([])
  const searchResults = ref<Contact[]>([])
  const loading = ref(false)

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
        const list = resp.contactsList || []
        for (const item of list) {
          const u = (item as any).userInfo || item
          allContacts.push({
            id: String(u.uid || ''),
            nickname: u.nickName || u.nickname || null,
            avatar: u.icon || u.avatar || null,
            pinyin: (item as any).pinyin || null,
            letter: (item as any).letter || null,
            remark: (item as any).depict || null,
            status: Number(u.uid) > 0 ? 1 : 0,
            updatedAt: Number((item as any).updateTime || 0),
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
    console.log(`[ContactStore] Loaded ${allContacts.length} contacts via API`)
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

  function patchContact(id: string, patch: Partial<Contact>) {
    const target = contacts.value.find((c) => c.id === id)
    if (!target) return
    Object.assign(target, patch)
  }

  function removeContact(id: string) {
    contacts.value = contacts.value.filter((c) => c.id !== id)
    searchResults.value = searchResults.value.filter((c) => c.id !== id)
  }

  return {
    contacts,
    searchResults,
    loading,
    loadContacts,
    searchContacts,
    getContact,
    getDisplayName,
    patchContact,
    removeContact,
  }
})
