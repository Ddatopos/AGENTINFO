import { get, post } from './client'
import type { Conversation, ConversationDetail } from './types'

export async function getConversations(): Promise<{ conversations: Conversation[] }> {
  return get('/chat/conversations')
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return get(`/chat/conversations/${id}`)
}

export async function createConversation(title?: string, agentId?: string): Promise<Conversation> {
  return post('/chat/conversations', { title, agentId })
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
  apiKey?: string,
  baseUrl?: string,
  model?: string,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['X-LLM-API-Key'] = apiKey
  if (baseUrl) headers['X-LLM-Base-Url'] = baseUrl
  if (model) headers['X-LLM-Model'] = model

  const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
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
            const detail = (parsed as { detail?: string }).detail
            throw new Error(detail || parsed.error)
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
