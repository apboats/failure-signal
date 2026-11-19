import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { Providers } from '@/app/providers'

/**
 * After a deploy rotates chunk hashes, a tab that is still open 404s on its next
 * lazy import. One reload fetches the new manifest. The timestamp guard stops a
 * reload loop when the host itself is down; in that case the error reaches the
 * ErrorBoundary instead.
 */
window.addEventListener('vite:preloadError', (event) => {
  const key = 'failure-signal:preload-reload-at'
  const now = Date.now()
  let last = 0
  try {
    last = Number(sessionStorage.getItem(key)) || 0
  } catch {
    // sessionStorage unavailable (private mode / blocked): reload once anyway
  }
  if (now - last < 10_000) return
  try {
    sessionStorage.setItem(key, String(now))
  } catch {
    // ignore
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <App />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
)
