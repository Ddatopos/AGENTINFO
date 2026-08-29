import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { useConfigStore } from './store/useConfigStore'
import Welcome from './screens/Welcome'
import Home from './screens/Home'
import Briefings from './screens/Briefings'
import Sources from './screens/Sources'
import Header from './components/layout/Header'
import BackToTop from './components/BackToTop'
import AiAssistantButton from './components/chat/AiAssistantButton'
import ChatWindow from './components/chat/ChatWindow'
import ApiConfigModal from './components/settings/ApiConfigModal'

export default function App() {
  const welcomeDismissed = useAppStore((s) => s.welcomeDismissed)
  const location = useLocation()
  const isWelcomePage = location.pathname === '/'
  const loadFromStorage = useConfigStore((s) => s.loadFromStorage)

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {!isWelcomePage && <Header />}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route
            path="/"
            element={welcomeDismissed ? <Navigate to="/home" replace /> : <Welcome />}
          />
          <Route path="/home" element={<Home />} />
          <Route path="/briefings" element={<Briefings />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BackToTop />
      <AiAssistantButton />
      <ChatWindow />
      <ApiConfigModal />
    </div>
  )
}
