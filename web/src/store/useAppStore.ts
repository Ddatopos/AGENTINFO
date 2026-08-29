import { create } from 'zustand'

interface AppState {
  welcomeDismissed: boolean
  dismissWelcome: () => void
  resetWelcome: () => void
}

export const useAppStore = create<AppState>()(
  (set) => ({
    welcomeDismissed: false,
    dismissWelcome: () => set({ welcomeDismissed: true }),
    resetWelcome: () => set({ welcomeDismissed: false }),
  }),
)
