import assert from 'node:assert/strict'

function resolveIncomingSenderId(message) {
  const direct = String(message?.senderId ?? message?.sender_id ?? '').trim()
  if (direct) return direct

  const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
  const sendMember = extra.sendMember ?? extra.send_member
  if (sendMember && typeof sendMember === 'object') {
    const fromMember = String(
      sendMember.userId
        ?? sendMember.user_id
        ?? sendMember.uid
        ?? sendMember.id
        ?? '',
    ).trim()
    if (fromMember) return fromMember
  }

  return String(
    extra.fromUid
      ?? extra.from_uid
      ?? extra.sendUid
      ?? extra.send_uid
      ?? '',
  ).trim()
}

function getIncomingAlertMessageKey(message) {
  const convId = String(message?.conversationId ?? message?.conversation_id ?? '')
  const id = String(message?.id ?? message?.msgId ?? message?.msg_id ?? '')
  const customMsgId = String(message?.customMsgId ?? message?.custom_msg_id ?? '')
  const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
  const fallbackId = String(extra?.notificationIdentity ?? extra?.groupEventMsgId ?? '')
  return `${convId}:${id || customMsgId || fallbackId}`
}

assert.equal(resolveIncomingSenderId({ sender_id: '1001' }), '1001')
assert.equal(
  resolveIncomingSenderId({
    conversation_id: '1_9',
    extra: { sendMember: { userId: '2002' } },
  }),
  '2002',
)
assert.equal(
  getIncomingAlertMessageKey({ conversationId: '0_3', id: '99' }),
  '0_3:99',
)
assert.equal(
  getIncomingAlertMessageKey({ conversation_id: '1_8', custom_msg_id: 'local-1' }),
  '1_8:local-1',
)

console.log('incoming message alert logic checks passed')
