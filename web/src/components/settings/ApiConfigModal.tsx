import { useEffect, useMemo, useState } from 'react'
import { useConfigStore } from '../../store/useConfigStore'
import { getServerLlmConfig, healthCheckLlm } from '../../api/llm'
import { getFetchProxy, setFetchProxy as setFetchProxyApi } from '../../api/config'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold text-glass-muted">{children}</label>
}

export default function ApiConfigModal() {
  const apiKey = useConfigStore((s) => s.apiKey)
  const baseUrl = useConfigStore((s) => s.baseUrl)
  const model = useConfigStore((s) => s.model)
  const proxy = useConfigStore((s) => s.proxy)
  const modalOpen = useConfigStore((s) => s.modalOpen)
  const setApiKey = useConfigStore((s) => s.setApiKey)
  const setBaseUrl = useConfigStore((s) => s.setBaseUrl)
  const setModel = useConfigStore((s) => s.setModel)
  const setProxy = useConfigStore((s) => s.setProxy)
  const saveToStorage = useConfigStore((s) => s.saveToStorage)
  const closeModal = useConfigStore((s) => s.closeModal)

  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [serverDefaults, setServerDefaults] = useState<{ baseUrl: string; model: string; hasServerKey: boolean } | null>(null)

  useEffect(() => {
    if (modalOpen) {
      getServerLlmConfig().then(setServerDefaults).catch(() => {})
      getFetchProxy().then((r) => setProxy(r.proxyUrl)).catch(() => {})
      setTestResult(null)
    }
  }, [modalOpen, setProxy])

  const canSave = useMemo(() => baseUrl.trim().length > 0 && model.trim().length > 0, [baseUrl, model])

  async function handleTest() {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, message: '请先输入 API Key' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await healthCheckLlm({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
      if ('ok' in result && result.ok) {
        setTestResult({ ok: true, message: `连接成功（${result.model ?? model}）` })
      } else if ('error' in result) {
        setTestResult({ ok: false, message: result.error })
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    saveToStorage()
    try {
      await setFetchProxyApi(proxy.trim())
    } catch {
      // ignore sync error
    }
    closeModal()
  }

  if (!modalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
      <div className="relative w-full max-w-md rounded-2xl border border-glass-border bg-glass-surface shadow-2xl backdrop-blur-md animate-slide-in-up">
        <div className="border-b border-glass-border px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-glass-text">大模型 API 配置</h2>
            <button
              onClick={closeModal}
              className="cursor-pointer rounded-lg p-1 text-glass-muted transition-colors hover:text-glass-text hover:bg-white/50"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <FieldLabel>API Key</FieldLabel>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 rounded-xl border border-glass-border bg-white/90 px-3 py-2.5 text-sm text-glass-text placeholder-glass-muted transition-all duration-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="cursor-pointer rounded-xl border border-glass-border bg-white/80 px-3 py-2.5 text-xs font-medium text-glass-muted transition-colors hover:text-glass-text hover:bg-white"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div>
            <FieldLabel>Base URL</FieldLabel>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
              className="w-full rounded-xl border border-glass-border bg-white/90 px-3 py-2.5 text-sm text-glass-text placeholder-glass-muted transition-all duration-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>

          <div>
            <FieldLabel>Model</FieldLabel>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="qwen-plus"
              className="w-full rounded-xl border border-glass-border bg-white/90 px-3 py-2.5 text-sm text-glass-text placeholder-glass-muted transition-all duration-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>

          <div>
            <FieldLabel>抓取代理（留空则直连）</FieldLabel>
            <input
              type="text"
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              placeholder=""
              className="w-full rounded-xl border border-glass-border bg-white/90 px-3 py-2.5 text-sm text-glass-text placeholder-glass-muted transition-all duration-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>

          {serverDefaults && (
            <div className="rounded-xl border border-glass-border bg-white/40 px-3 py-2.5 text-xs text-glass-muted">
              <div className="mb-1 font-semibold text-glass-text">服务端默认配置</div>
              <div>Base URL：{serverDefaults.baseUrl}</div>
              <div>Model：{serverDefaults.model}</div>
              <div>服务端已配置 Key：{serverDefaults.hasServerKey ? '是' : '否'}</div>
            </div>
          )}

          {testResult && (
            <div
              className={`rounded-xl px-3 py-2.5 text-xs ${
                testResult.ok
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {testResult.ok ? '✅ ' : '❌ '}
              {testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-glass-border px-5 py-4">
          <button
            onClick={handleTest}
            disabled={testing}
            className="cursor-pointer rounded-xl border border-glass-border bg-white/80 px-4 py-2.5 text-sm font-medium text-glass-muted transition-all duration-200 hover:bg-white hover:text-glass-text disabled:opacity-50"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="cursor-pointer rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
