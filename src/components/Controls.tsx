type Props = {
  url: string
  setUrl: (v: string) => void
  onFetch: () => void
  loading: boolean
}

export default function Controls({ url, setUrl, onFetch, loading }: Props) {
  return (
    <div className="controls surface">
      <div className="inputWrap" data-focused={Boolean(url)}>
        <svg className="inputIcon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M10.5 6.75h-3a2.75 2.75 0 0 0 0 5.5h3m3-5.5h3a2.75 2.75 0 1 1 0 5.5h-3m-6 2h9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          className="input"
          type="url"
          placeholder="https://... (YouTube або TikTok)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Посилання на відео"
        />
      </div>
      <button onClick={onFetch} disabled={loading} className={`primary cta ${loading ? 'is-loading' : ''}`}>
        <span>{loading ? 'Завантаження…' : 'Отримати формати'}</span>
      </button>
    </div>
  )
}
