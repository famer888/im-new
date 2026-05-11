interface ActiveSessionContext {
  uid: string
  sessionId: string
}

let activeSessionContext: ActiveSessionContext = {
  uid: '',
  sessionId: '',
}

export function setActiveSessionContext(session: Partial<ActiveSessionContext> | null | undefined) {
  activeSessionContext = {
    uid: String(session?.uid || '').trim(),
    sessionId: String(session?.sessionId || '').trim(),
  }
}

export function clearActiveSessionContext(uid?: string | null) {
  const targetUid = String(uid || '').trim()
  if (targetUid && activeSessionContext.uid && targetUid !== activeSessionContext.uid) return
  activeSessionContext = {
    uid: '',
    sessionId: '',
  }
}

export function getActiveSessionContext(): ActiveSessionContext {
  return activeSessionContext
}

export function getActiveSessionId(): string {
  return activeSessionContext.sessionId
}
