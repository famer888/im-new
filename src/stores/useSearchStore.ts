import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Contact } from './useContactStore'
import type { Group } from './useGroupStore'
import type { Channel } from './useChannelStore'
import type { Message } from './useMessageStore'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface SearchResults {
  contacts: Contact[]
  groups: Group[]
  channels: Channel[]
  messages: Message[]
}

export const useSearchStore = defineStore('search', () => {
  const keyword = ref('')
  const isSearching = ref(false)
  const results = ref<SearchResults>({ contacts: [], groups: [], channels: [], messages: [] })
  const specifiedChatId = ref<string | null>(null)
  const chatSearchResults = ref<Message[]>([])

  const hasResults = computed(() =>
    results.value.contacts.length > 0 ||
    results.value.groups.length > 0 ||
    results.value.channels.length > 0 ||
    results.value.messages.length > 0,
  )

  async function search(uid: string, query: string) {
    keyword.value = query
    if (!query.trim()) {
      clearResults()
      return
    }
    if (!isTauri()) return
    isSearching.value = true
    try {
      const [contacts, groups, channels] = await Promise.all([
        tauriInvoke<Contact[]>('search_contacts', { uid, keyword: query }),
        tauriInvoke<Group[]>('get_groups', { uid }),
        tauriInvoke<Channel[]>('get_channels', { uid }),
      ])
      results.value = {
        contacts,
        groups: groups.filter((g) => g.name?.toLowerCase().includes(query.toLowerCase())),
        channels: channels.filter((c) => c.name?.toLowerCase().includes(query.toLowerCase())),
        messages: [],
      }
    } finally {
      isSearching.value = false
    }
  }

  async function searchInChat(uid: string, conversationId: string, query: string) {
    specifiedChatId.value = conversationId
    if (!query.trim()) {
      chatSearchResults.value = []
      return
    }
    // TODO: invoke search_messages
    chatSearchResults.value = []
  }

  function clearResults() {
    keyword.value = ''
    results.value = { contacts: [], groups: [], channels: [], messages: [] }
  }

  function clearChatSearch() {
    specifiedChatId.value = null
    chatSearchResults.value = []
  }

  return {
    keyword,
    isSearching,
    results,
    hasResults,
    specifiedChatId,
    chatSearchResults,
    search,
    searchInChat,
    clearResults,
    clearChatSearch,
  }
})
