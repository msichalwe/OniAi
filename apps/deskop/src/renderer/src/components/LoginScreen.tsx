import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { connectToGateway, onStatusChange } from '../services/gateway'

export function LoginScreen() {
  const [url, setUrl] = useState('ws://76.13.32.166:19100')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setGatewayUrl, setGatewayToken, setGatewayConnected, setMode, addLog } = useStore()

  // Load saved credentials on mount
  useEffect(() => {
    (async () => {
      const savedUrl = await window.api.store.get('oni_gateway_url') as string | null
      const savedToken = await window.api.store.get('oni_gateway_token') as string | null
      if (savedUrl) setUrl(savedUrl)
      if (savedToken) setToken(savedToken)

      // Auto-connect if we have saved credentials
      if (savedUrl) {
        handleConnect(savedUrl, savedToken ?? undefined)
      }
    })()
  }, [])

  async function handleConnect(connectUrl?: string, connectToken?: string) {
    const finalUrl = connectUrl ?? url.trim()
    const finalToken = connectToken ?? (token.trim() || undefined)

    if (!finalUrl) {
      setError('Gateway URL is required')
      return
    }

    setLoading(true)
    setError('')

    // Listen for connection status
    const unsub = onStatusChange((state, message) => {
      if (state === 'connected') {
        setGatewayUrl(finalUrl)
        setGatewayToken(finalToken ?? null)
        setGatewayConnected(true)
        setMode('idle')
        addLog(`Connected to gateway: ${finalUrl}`)
        unsub()
      } else if (state === 'error') {
        setError(message)
        setLoading(false)
        unsub()
      }
    })

    const ok = await connectToGateway({ url: finalUrl, token: finalToken })
    if (!ok) {
      setLoading(false)
      return
    }

    // Save credentials
    await window.api.store.set('oni_gateway_url', finalUrl)
    if (finalToken) {
      await window.api.store.set('oni_gateway_token', finalToken)
    }

    // Set a timeout in case connection never resolves
    setTimeout(() => {
      if (loading) {
        setError('Connection timeout. Check gateway URL and token.')
        setLoading(false)
        unsub()
      }
    }, 15_000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await handleConnect()
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-md flex flex-col items-center gap-8 px-8 animate-fade-in">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-lg">
            <span className="text-3xl font-bold text-white">O</span>
          </div>
          <div className="text-center">
            <h1 className="text-[var(--text-primary)] text-2xl font-bold">Oni</h1>
            <p className="text-[var(--text-tertiary)] text-sm mt-1">Connect to your Oni gateway</p>
          </div>
        </div>

        <div className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-[var(--text-tertiary)] text-xs font-semibold uppercase tracking-wider">Gateway URL</label>
              <input
                type="text"
                placeholder="wss://your-server:19100"
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 font-mono"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[var(--text-tertiary)] text-xs font-semibold uppercase tracking-wider">Gateway Token <span className="text-[var(--text-muted)] font-normal normal-case">(optional)</span></label>
              <input
                type="password"
                placeholder="Token"
                value={token}
                onChange={e => setToken(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>

            {error && (
              <div className="bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-xl px-4 py-3 animate-fade-in">
                <p className="text-[var(--error)] text-xs">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading || !url.trim()}
              className="w-full py-3.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-30 hover:bg-[var(--accent-light)] transition-all active:scale-[0.98] glow-accent">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </span>
              ) : 'Connect to Gateway'}
            </button>
          </form>

          <p className="mt-5 text-[var(--text-muted)] text-[10px] text-center uppercase tracking-wider font-medium">
            Stored securely in OS keychain
          </p>
        </div>
      </div>
    </div>
  )
}
