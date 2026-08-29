import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../store/useChatStore'
import { useConfigStore } from '../../store/useConfigStore'
import { createConversation, sendMessage } from '../../api/chat'
import type { Message } from '../../api/types'

function TypingIndicator() {
  return (
    <div className="mb-3 flex justify-start animate-slide-in-up">
      <div className="flex items-center gap-1 rounded-2xl border border-glass-border bg-white/80 px-4 py-3">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-typing-dot" />
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-typing-dot" />
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-typing-dot" />
      </div>
    </div>
  )
}

export default function ChatWindow() {
  const isOpen = useChatStore((s) => s.isOpen)
  const currentConversation = useChatStore((s) => s.currentConversation)
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoading)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation)
  const addMessage = useChatStore((s) => s.addMessage)
  const setLoading = useChatStore((s) => s.setLoading)
  const appendStreamingContent = useChatStore((s) => s.appendStreamingContent)
  const clearStreamingContent = useChatStore((s) => s.clearStreamingContent)
  const reset = useChatStore((s) => s.reset)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const configApiKey = useConfigStore((s) => s.apiKey)
  const configBaseUrl = useConfigStore((s) => s.baseUrl)
  const configModel = useConfigStore((s) => s.model)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  async function handleSend() {
    if (!input.trim() || isLoading) return

    const userContent = input.trim()
    setInput('')

    let convId = currentConversation?.id

    if (!convId) {
      try {
        const conv = await createConversation('AI 助手对话')
        convId = conv.id
        setCurrentConversation(conv)
      } catch (err) {
        console.error('创建对话失败:', err)
        return
      }
    }

    const userMessage: Message = {
      id: Date.now(),
      conversationId: convId,
      role: 'user',
      content: userContent,
      createdAt: Date.now(),
    }
    addMessage(userMessage)

    setLoading(true)
    clearStreamingContent()

    let fullResponse = ''

    try {
      await sendMessage(convId, userContent, (delta) => {
        fullResponse += delta
        appendStreamingContent(delta)
      }, configApiKey || undefined, configBaseUrl || undefined, configModel || undefined)

      const assistantMessage: Message = {
        id: Date.now() + 1,
        conversationId: convId,
        role: 'assistant',
        content: fullResponse,
        createdAt: Date.now(),
      }
      addMessage(assistantMessage)
      clearStreamingContent()
    } catch (err) {
      console.error('发送消息失败:', err)
      const errorContent = err instanceof Error ? err.message : String(err)
      const errorMessage: Message = {
        id: Date.now() + 1,
        conversationId: convId,
        role: 'assistant',
        content: `抱歉，生成回复失败：${errorContent}`,
        createdAt: Date.now(),
      }
      addMessage(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleNewChat() {
    reset()
  }

  if (!isOpen) return null

  return (
    <div className="fixed bottom-24 right-6 z-40 flex h-[500px] w-96 flex-col overflow-hidden rounded-2xl border border-glass-border bg-glass-surface shadow-2xl backdrop-blur-md animate-slide-in-up font-sans">
      <div className="flex items-center justify-between border-b border-glass-border bg-gradient-to-r from-indigo-500/10 to-cyan-400/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.015.095-.047.186-.094.273C9.416 3.91 8.92 4 8.25 4H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-3.25c-.669 0-1.166-.09-1.406-.623a1.234 1.234 0 01-.094-.273M9.75 3.104C9.801 2.868 10 2.5 10.75 2.5h2.5c.75 0 .949.368 1 .854M15 8a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-glass-text">AI 助手</div>
            <div className="flex items-center gap-1 text-xs text-glass-muted">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
              <span>在线</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleNewChat}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-glass-muted transition-all duration-200 hover:bg-indigo-50 hover:text-indigo-600"
        >
          新对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !streamingContent && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center animate-fade-in-up">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-cyan-400/20">
              <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 21H4.22a1.22 1.22 0 01-.94-2.004l.42-.5a6.018 6.018 0 01-.623-2.58C3.024 12.67 3 11.865 3 11.25 3 6.694 7.03 3 12 3s9 3.694 9 8.25z" />
              </svg>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-glass-text">你好！我是 AI 助手</div>
              <div className="text-xs text-glass-muted">有什么可以帮助你的吗？</div>
            </div>
          </div>
        )}
        {messages.map((msg, index) => (
          <div
            key={msg.id}
            className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-in-up`}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-200 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-indigo-500 to-cyan-400 text-white'
                  : 'border border-glass-border bg-white/90 text-glass-text backdrop-blur-sm'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
            </div>
          </div>
        ))}
        {isLoading && !streamingContent && <TypingIndicator />}
        {streamingContent && (
          <div className="mb-3 flex justify-start animate-slide-in-up">
            <div className="max-w-[80%] rounded-2xl border border-glass-border bg-white/90 px-4 py-2.5 text-glass-text shadow-sm backdrop-blur-sm">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{streamingContent}</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-glass-border bg-gradient-to-r from-indigo-500/5 to-cyan-400/5 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-glass-border bg-white/90 px-3 py-2.5 text-sm text-glass-text placeholder-glass-muted transition-all duration-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100"
          >
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3.478 2.204a.75.75 0 00-.496.932l2.91 9.607a.75.75 0 00.655.495l9.452.574-9.452.574a.75.75 0 00-.655.495l-2.91 9.607a.75.75 0 00.932.496l17.044-6.346a.75.75 0 000-1.408L3.478 2.204z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
