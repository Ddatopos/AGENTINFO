import { create } from 'zustand'
import type { Message, Conversation } from '../api/types'

interface ChatState {
  isOpen: boolean
  currentConversation: Conversation | null
  messages: Message[]
  isLoading: boolean
  streamingContent: string

  openChat: () => void
  closeChat: () => void
  setCurrentConversation: (conv: Conversation | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  setLoading: (loading: boolean) => void
  appendStreamingContent: (content: string) => void
  clearStreamingContent: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  currentConversation: null,
  messages: [],
  isLoading: false,
  streamingContent: '',

  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  setCurrentConversation: (conv) => set({ currentConversation: conv }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setLoading: (loading) => set({ isLoading: loading }),
  appendStreamingContent: (content) =>
    set((state) => ({ streamingContent: state.streamingContent + content })),
  clearStreamingContent: () => set({ streamingContent: '' }),
  reset: () =>
    set({
      currentConversation: null,
      messages: [],
      isLoading: false,
      streamingContent: '',
    }),
}))
