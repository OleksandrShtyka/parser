import { useEffect, useState } from 'react'

export function useHashRoute() {
  const [route, setRoute] = useState<string>(() => window.location.hash.replace('#', '') || '/')
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace('#', '') || '/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = (to: string) => {
    window.location.hash = to
  }
  return { route, navigate }
}
