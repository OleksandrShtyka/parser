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

export default function VideoInfo({ info, filter, setFilter, url }: { info: VideoInfo; filter: 'all' | 'video' | 'audio'; setFilter: (v: 'all' | 'video' | 'audio') => void; url: string }) {
  const filteredFormats = info.formats.filter((f) => {
    const isAudioOnly = f.vcodec === 'none'
    const isVideo = !isAudioOnly
    if (filter === 'audio') return isAudioOnly
    if (filter === 'video') return isVideo
    return true
  })

  return (
    <div className="videoInfo cardAppear">
      <div className="videoHeader surface">
        {info.thumbnail && <img className="thumb" src={info.thumbnail} alt="thumbnail" />}
        <div>
          <h2 className="videoTitle">{info.title}</h2>
          <div className="videoMeta">
            {info.uploader && <span>Канал: {info.uploader}</span>}
            {info.duration != null && <span>Тривалість: {Math.round(info.duration)} с</span>}
          </div>
          {info.webpage_url && (
            <a className="videoLink" href={info.webpage_url} target="_blank" rel="noreferrer">
              Відкрити відео ↗
            </a>
          )}
        </div>
      </div>

      <div className="filters">
        <label className={`filterChip ${filter === 'all' ? 'is-active' : ''}`}>
          <input type="radio" name="filter" checked={filter === 'all'} onChange={() => setFilter('all')} />
          <span>Усі</span>
        </label>
        <label className={`filterChip ${filter === 'video' ? 'is-active' : ''}`}>
          <input type="radio" name="filter" checked={filter === 'video'} onChange={() => setFilter('video')} />
          <span>Відео + аудіо</span>
        </label>
        <label className={`filterChip ${filter === 'audio' ? 'is-active' : ''}`}>
          <input type="radio" name="filter" checked={filter === 'audio'} onChange={() => setFilter('audio')} />
          <span>Тільки аудіо</span>
        </label>
      </div>

      <div className="list">
        {filteredFormats.length === 0 && <div style={{ opacity: 0.8 }}>Немає доступних форматів</div>}
        {filteredFormats.map((f, idx) => {
          const label = [f.ext?.toUpperCase(), f.resolution || (f.abr ? `${f.abr}kbps` : ''), f.format_note].filter(Boolean).join(' • ')
          const dlUrl = `/api/download?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(f.format_id)}`
          return (
            <div key={f.format_id + label} className="item surface" style={{ animationDelay: `${idx * 60}ms` }}>
              <div>
                <div className="itemTitle">{label}</div>
                <div className="itemMeta">{f.vcodec === 'none' ? 'Аудіо' : 'Відео'} {f.filesize ? `• ${humanSize(f.filesize)}` : ''}</div>
              </div>
              <a href={dlUrl} className="itemAction">
                <span>Завантажити</span>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v12m0 0-4-4m4 4 4-4M5 19h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
