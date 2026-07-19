export interface LegacyImportRefreshHandlers {
  currentConversationId: string | null
  clearMessageCaches: () => void
  reloadConversations: () => Promise<void>
  reloadMessages: (conversationId: string) => Promise<void>
}

/**
 * 后台补导入旧版消息后刷新内存数据。
 *
 * 当前会话必须在清缓存后立即重载，否则左侧摘要已经更新，右侧消息区却会一直为空，
 * 直到用户切换会话或窗口重新获得焦点。
 */
export async function refreshAfterLegacyImport(
  handlers: LegacyImportRefreshHandlers,
): Promise<void> {
  const activeConversationId = String(handlers.currentConversationId || '').trim()
  handlers.clearMessageCaches()

  try {
    await handlers.reloadConversations()
  } finally {
    if (activeConversationId) {
      await handlers.reloadMessages(activeConversationId)
    }
  }
}
