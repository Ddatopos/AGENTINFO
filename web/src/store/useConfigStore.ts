import { create } from 'zustand';

const STORAGE_KEY = 'llmConfig';

interface StoredLlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  proxy: string;
}

interface ConfigState {
  apiKey: string;
  baseUrl: string;
  model: string;
  proxy: string;
  modalOpen: boolean;

  loadFromStorage: () => void;
  saveToStorage: () => void;
  setApiKey: (apiKey: string) => void;
  setBaseUrl: (baseUrl: string) => void;
  setModel: (model: string) => void;
  setProxy: (proxy: string) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  apiKey: '',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus',
  proxy: '',
  modalOpen: false,

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredLlmConfig;
      if (parsed.apiKey) get().setApiKey(parsed.apiKey);
      if (parsed.baseUrl) get().setBaseUrl(parsed.baseUrl);
      if (parsed.model) get().setModel(parsed.model);
      if (parsed.proxy !== undefined) get().setProxy(parsed.proxy);
    } catch {
      // ignore corrupt storage
    }
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    const { apiKey, baseUrl, model, proxy } = get();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, baseUrl, model, proxy }));
  },

  setApiKey: (apiKey) => set({ apiKey }),
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setModel: (model) => set({ model }),
  setProxy: (proxy) => set({ proxy }),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));
