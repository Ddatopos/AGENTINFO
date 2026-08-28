import { get, post } from './client'
import type { Conversation, ConversationDetail } from './types'

export async function getConversations(): Promise<{ conversations: Conversation[] }> {
  return get('/chat/conversations')
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return get(`/chat/conversations/${id}`)
}

export async function createConversation(title?: string): Promise<Conversation> {
  return post('/chat/conversations', { title })
}

export async function deleteConversation(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

export async function sendMessage(
  conversationId: string,
  content: string,
  onDelta: (delta: string) => void,
): Promise<void> {
  const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        try {
          const parsed = JSON.parse(data)
          if (parsed.delta) {
            onDelta(parsed.delta)
          }
          if (parsed.error) {
            throw new Error(parsed.error)
          }
        } catch (err) {
          if (err instanceof SyntaxError) {
            continue
          }
          throw err
        }
      }
    }
  }
}
