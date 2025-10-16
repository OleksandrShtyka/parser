export default function Header({ title = 'Завантажувач з YouTube' }: { title?: string }) {
  return (
    <div className="headline">
      <span className="logo" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 15L15 12L10 9V15Z" fill="currentColor"/>
          <rect x="3" y="4" width="18" height="16" rx="3" ry="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        </svg>
        <span className="logoGlow" />
      </span>
      <h1>{title}</h1>
    </div>
  )
}
