export default function Header({ title = 'LumenStream Downloader' }: { title?: string }) {
  return (
    <div className="headline">
      <span className="logo" aria-hidden="true">
        <span className="logo__orb" />
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g opacity="0.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M24 6c9.941 0 18 8.059 18 18s-8.059 18-18 18S6 33.941 6 24" opacity="0.55" />
            <path d="M11 33.5c-1.9-2.8-3-6.2-3-9.8s1.1-7 3.1-9.9" opacity="0.5" />
            <path d="M37.4 13.4c1.9 2.9 3.1 6.4 3.1 10.1s-1.1 7.2-3 10.1" opacity="0.5" />
          </g>
          <path d="M19.2 24.4a1 1 0 0 1 0-1.8l11.4-6.4a1 1 0 0 1 1.5.87v12.8a1 1 0 0 1-1.5.87l-11.4-6.34Z" fill="currentColor" />
          <path
            d="M12 24c0-6.627 5.373-12 12-12"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
        </svg>
      </span>
      <div className="headline__text">
        <span className="headline__eyebrow">Aurora edition</span>
        <h1>{title}</h1>
        <p className="headline__caption">Завантажуйте та структуруйте відео з YouTube і TikTok без зайвого шуму.</p>
      </div>
    </div>
  )
}
