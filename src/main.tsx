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
