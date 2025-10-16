import { useState } from 'react'
import './App.css'
import Header from './components/Header'
import Controls from './components/Controls'
import VideoInfo from './components/VideoInfo'
import AuthProvider from './auth/AuthProvider'
import { useAuth } from './hooks/useAuth'
import Account from './pages/Account'
import { useHashRoute } from './hooks/useHashRouter'

type Format = {
  format_id: string
  ext: string
  resolution?: string | null
  abr?: number | null
  vcodec?: string | null
  acodec?: string | null
  filesize?: number | null
  format_note?: string | null
}

type VideoInfoType = {
  id: string
  title: string
  duration?: number
  thumbnail?: string
  uploader?: string
  webpage_url?: string
  formats: Format[]
}

function AppInner() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<VideoInfoType | null>(null)
  const [filter, setFilter] = useState<'all' | 'video' | 'audio'>('all')
  const { route } = useHashRoute()
  const { user } = useAuth()
  const isAccount = route === '/account'

  // filtering is handled inside VideoInfo component now

  async function fetchInfo() {
    setError(null)
    setInfo(null)
    if (!url.trim()) {
      setError('Вставте посилання на відео YouTube')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      let data: unknown = null
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        try {
          data = await res.json()
        } catch {
          // fallthrough to text parsing below
        }
      }
      if (!data) {
        try {
          const text = await res.text()
          if (text) data = { error: text }
        } catch {
          // ignore
        }
      }

      if (!res.ok) {
        let msg = res.statusText || 'Помилка отримання інформації'
        if (data && typeof data === 'object' && 'error' in data) {
          const d = data as { error?: unknown }
          if (d.error && typeof d.error === 'string') msg = d.error
        }
        throw new Error(msg)
      }

      if (!data) {
        throw new Error('Порожня відповідь від сервера')
      }
      // best-effort assign: server returns the expected shape
      setInfo(data as unknown as VideoInfoType)
    } catch (e: unknown) {
      const msg = (e && (e as Error).message) || 'Невідома помилка'
      // Friendly hint if backend is likely down
      const hint = (typeof msg === 'string' && (msg.includes('Failed to fetch') || msg.includes('NetworkError')))
        ? ' (переконайтесь, що API запущено: python server.py)'
        : ''
      setError(msg + hint)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="glass">
        <div className="hero">
          <Header />
          <p className="subtitle">Вставте посилання, оберіть формат і завантажте.</p>
        </div>

        <div className="topbar">
          <nav className="nav">
            <a className={`navLink ${!isAccount ? 'is-active' : ''}`} href="#/">Головна</a>
            <a className={`navLink ${isAccount ? 'is-active' : ''}`} href="#/account">Кабінет</a>
          </nav>
          <div className="userChip">
            <span className="userIndicator" data-state={user ? 'online' : 'offline'} aria-hidden="true" />
            <span>{user ? `Привіт, ${user.name}` : 'Неавторизований'}</span>
          </div>
        </div>

        {isAccount ? (
          <section className="panel">
            <Account />
          </section>
        ) : (
          <>
            <Controls url={url} setUrl={setUrl} onFetch={fetchInfo} loading={loading} />

            {error && <div className="error" role="alert">Помилка: {error}</div>}

            {info && <VideoInfo info={info} filter={filter} setFilter={setFilter} url={url} />}
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
