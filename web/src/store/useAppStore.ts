import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  welcomeDismissed: boolean
  dismissWelcome: () => void
  resetWelcome: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      welcomeDismissed: false,
      dismissWelcome: () => set({ welcomeDismissed: true }),
      resetWelcome: () => set({ welcomeDismissed: false }),
    }),
    {
      name: 'agentinfo-app-state',
      partialize: (s) => ({
        welcomeDismissed: s.welcomeDismissed,
      }),
    },
  ),
)
