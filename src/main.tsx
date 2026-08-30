import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { getAppearance, applyAppearance } from '@/lib/appearance-store'
import { AppearanceProvider } from '@/hooks/useAppearance'

// Stamp the appearance attributes onto <html> BEFORE the first render, so a
// non-default theme/accent never flashes the default one on a cold load.
applyAppearance(getAppearance())

// AppearanceProvider wraps <App/> rather than living inside it, so it sits
// above App's early-return paths (onboarding, loading) and is available to
// every screen regardless of which branch renders.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </StrictMode>,
)

// The offline shell (audit §9.1). Registered AFTER the first render and only
// in a production build:
//
//   - after render, because a service worker install competing with the
//     initial page load makes the thing it exists to improve slower;
//   - production only, because a caching worker in front of Vite's dev server
//     fights hot reload and produces "why is my change not showing" bugs that
//     cost more than the feature is worth in dev.
//
// Failure is silent and total: if registration rejects (an unsupported
// browser, a private window, an https requirement), the app carries on
// exactly as it did before it existed. See public/sw.js for what it caches
// and — more importantly — what it refuses to.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
