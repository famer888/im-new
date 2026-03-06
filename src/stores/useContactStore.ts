import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

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
    loading.value = true
    try {
      contacts.value = await invoke<Contact[]>('get_contacts', { uid })
    } finally {
      loading.value = false
    }
  }

  async function searchContacts(uid: string, keyword: string) {
    if (!keyword.trim()) {
      searchResults.value = []
      return
    }
    searchResults.value = await invoke<Contact[]>('search_contacts', { uid, keyword })
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
