import { defineStore } from 'pinia'
import { ref } from 'vue'

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
  remark: string | null
  status: number
  updatedAt: number
}

export const useContactStore = defineStore('contact', () => {
  const contacts = ref<Contact[]>([])
  const searchResults = ref<Contact[]>([])
  const loading = ref(false)

  async function loadContacts(uid: string) {
    if (!isTauri()) return
    loading.value = true
    try {
      contacts.value = await tauriInvoke<Contact[]>('get_contacts', { uid })
    } finally {
      loading.value = false
    }
  }

  async function searchContacts(uid: string, keyword: string) {
    if (!keyword.trim()) {
      searchResults.value = []
      return
    }
    if (!isTauri()) return
    searchResults.value = await tauriInvoke<Contact[]>('search_contacts', { uid, keyword })
  }

  function getContact(id: string): Contact | undefined {
    return contacts.value.find((c) => c.id === id)
  }

  function getDisplayName(id: string): string {
    const contact = getContact(id)
    return contact?.remark || contact?.nickname || id
  }

  return {
    contacts,
    searchResults,
    loading,
    loadContacts,
    searchContacts,
    getContact,
    getDisplayName,
  }
})
