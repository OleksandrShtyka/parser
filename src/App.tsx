import { useMemo, useState } from 'react'
import './App.css'

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

type VideoInfo = {
  id: string
  title: string
  duration?: number
  thumbnail?: string
  uploader?: string
  webpage_url?: string
  formats: Format[]
}

function humanSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [filter, setFilter] = useState<'all' | 'video' | 'audio'>('all')

  const filteredFormats = useMemo(() => {
    if (!info) return []
    return info.formats.filter((f) => {
      const isAudioOnly = f.vcodec === 'none'
      const isVideo = !isAudioOnly
      if (filter === 'audio') return isAudioOnly
      if (filter === 'video') return isVideo
      return true
    })
  }, [info, filter])

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

      let data: any = null
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        try {
          data = await res.json()
        } catch (_e) {
          // fallthrough to text parsing below
        }
      }
      if (!data) {
        try {
          const text = await res.text()
          if (text) data = { error: text }
        } catch (_e) {
          // ignore
        }
      }

      if (!res.ok) {
        const msg = (data && data.error) || res.statusText || 'Помилка отримання інформації'
        throw new Error(msg)
      }

      if (!data) {
        throw new Error('Порожня відповідь від сервера')
      }
      setInfo(data as any)
    } catch (e: any) {
      const msg = e?.message || 'Невідома помилка'
      // Friendly hint if backend is likely down
      const hint = msg.includes('Failed to fetch') || msg.includes('NetworkError')
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
        <div className="headline">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 15L15 12L10 9V15Z" fill="currentColor"/>
            <rect x="3" y="4" width="18" height="16" rx="3" ry="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          </svg>
          <h1>Завантажувач з YouTube</h1>
        </div>
        <div className="subtitle">Вставте посилання, оберіть формат і завантажте.</div>

        <div className="controls">
          <input
            className="input"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button onClick={fetchInfo} disabled={loading} className="primary">
            {loading ? 'Завантаження…' : 'Отримати формати'}
          </button>
        </div>

        {error && <div className="error">Помилка: {error}</div>}

        {info && (
          <div style={{ marginTop: 18 }}>
            <div className="videoHeader">
              {info.thumbnail && (
                <img className="thumb" src={info.thumbnail} alt="thumbnail" />
              )}
              <div>
                <h2 style={{ margin: 0 }}>{info.title}</h2>
                {info.uploader && (
                  <div style={{ opacity: 0.8 }}>Канал: {info.uploader}</div>
                )}
                {info.duration != null && (
                  <div style={{ opacity: 0.8 }}>Тривалість: {Math.round(info.duration)} с</div>
                )}
                {info.webpage_url && (
                  <div style={{ marginTop: 6 }}>
                    <a href={info.webpage_url} target="_blank" rel="noreferrer">
                      Відкрити відео ↗
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="filters">
              <label>
                <input type="radio" name="filter" checked={filter === 'all'} onChange={() => setFilter('all')} /> Усі
              </label>
              <label>
                <input type="radio" name="filter" checked={filter === 'video'} onChange={() => setFilter('video')} /> Відео + аудіо
              </label>
              <label>
                <input type="radio" name="filter" checked={filter === 'audio'} onChange={() => setFilter('audio')} /> Тільки аудіо
              </label>
            </div>

            <div className="list">
              {filteredFormats.length === 0 && (
                <div style={{ opacity: 0.8 }}>Немає доступних форматів</div>
              )}
              {filteredFormats.map((f) => {
                const label = [
                  f.ext?.toUpperCase(),
                  f.resolution || (f.abr ? `${f.abr}kbps` : ''),
                  f.format_note,
                ]
                  .filter(Boolean)
                  .join(' • ')

                const dlUrl = `/api/download?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(f.format_id)}`
                return (
                  <div key={f.format_id + label} className="item">
                    <div>
                      <div className="itemTitle">{label}</div>
                      <div className="itemMeta">
                        {f.vcodec === 'none' ? 'Аудіо' : 'Відео'} {f.filesize ? `• ${humanSize(f.filesize)}` : ''}
                      </div>
                    </div>
                    <a href={dlUrl}>
                      <button>Завантажити</button>
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
