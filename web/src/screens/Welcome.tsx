import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

export default function Welcome() {
  const navigate = useNavigate()
  const dismissWelcome = useAppStore((s) => s.dismissWelcome)
  const [displayed, setDisplayed] = useState('')
  const fullText = '全球 AI 情报 · 实时聚合 · 智能排序'

  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      if (i <= fullText.length) {
        setDisplayed(fullText.slice(0, i))
        i++
      } else {
        clearInterval(timer)
      }
    }, 80)
    return () => clearInterval(timer)
  }, [])

  const handleEnter = () => {
    dismissWelcome()
    navigate('/home')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleEnter()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissWelcome, navigate])

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-green-50 via-yellow-50 to-green-100 overflow-hidden">
      <div className="relative z-10 text-center px-4">
        <div className="mb-8 animate-float">
          <div className="text-8xl mb-4">🐱</div>
          <h1 className="font-sans text-6xl md:text-7xl font-bold bg-gradient-to-r from-green-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            AGENTINFO
          </h1>
        </div>

        <div className="mb-12 h-10 overflow-hidden">
          <p className="font-sans text-base md:text-lg text-glass-muted">
            {displayed}
            <span className="inline-block w-2 h-5 bg-green-400 ml-1 animate-pulse" />
          </p>
        </div>

        <button
          onClick={handleEnter}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-green-200 bg-white/60 px-10 py-4 font-sans text-base font-bold text-green-700 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:shadow-xl hover:border-green-300"
        >
          <span className="relative z-10 flex items-center gap-2">
            <span>进入系统</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-100 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

      
      </div>
    </div>
  )
}
