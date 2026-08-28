import { useChatStore } from '../../store/useChatStore'
import aiAssistantImg from '../../assets/ai-assistant.png'

export default function AiAssistantButton() {
  const isOpen = useChatStore((s) => s.isOpen)
  const openChat = useChatStore((s) => s.openChat)
  const closeChat = useChatStore((s) => s.closeChat)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="absolute inset-0 rounded-full animate-gradient-border opacity-75 blur-sm" />
      <button
        onClick={() => (isOpen ? closeChat() : openChat())}
        className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-xl backdrop-blur-md transition-all duration-300 hover:scale-110 hover:shadow-2xl active:scale-95 overflow-hidden border-2 border-white"
        aria-label="AI 助手"
      >
        <img 
          src={aiAssistantImg} 
          alt="AI 助手" 
          className="h-full w-full object-cover"
        />
      </button>
    </div>
  )
}
