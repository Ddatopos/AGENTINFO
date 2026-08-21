import { useState, useEffect } from 'react'

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-40 cursor-pointer rounded-2xl border border-glass-border bg-glass-surface px-4 py-2.5 font-sans text-sm text-glass-muted shadow-lg backdrop-blur-md transition-all hover:text-glass-accent hover:shadow-xl hover:scale-105"
      title="回到顶部"
    >
      ▲ 回到顶部
    </button>
  )
}
