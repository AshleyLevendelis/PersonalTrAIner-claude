import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  getAppearance,
  saveAppearance,
  applyAppearance,
  type AppearanceRecord,
  type GlowLevel,
  type CanvasLevel,
} from '@/lib/appearance-store'

// ---------------------------------------------------------------------------
// App-wide appearance state, mirroring TimersProvider's shape. Deliberately
// thin: the only side effect is writing two data-attributes onto <html>, and
// every visual consequence of that lives in index.css. That is what makes
// option 1f's promise — "Both apply instantly, everywhere" — true without any
// component re-rendering or re-reading a theme value.
//
// No profileId prop, unlike the other providers: see appearance-store.ts for
// why this preference is device-level rather than per-profile.
// ---------------------------------------------------------------------------

interface AppearanceContextValue extends AppearanceRecord {
  setGlow: (glow: GlowLevel) => void
  setCanvas: (canvas: CanvasLevel) => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // main.tsx has already applied the stored record to <html> before this
  // mounts; reading it again here just seeds React state with the same value.
  const [record, setRecord] = useState<AppearanceRecord>(() => getAppearance())

  const commit = useCallback((next: AppearanceRecord) => {
    setRecord(next)
    applyAppearance(next)
    saveAppearance(next)
  }, [])

  const value = useMemo<AppearanceContextValue>(() => ({
    ...record,
    setGlow: (glow: GlowLevel) => commit({ ...record, glow }),
    setCanvas: (canvas: CanvasLevel) => commit({ ...record, canvas }),
  }), [record, commit])

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext)
  if (!ctx) throw new Error('useAppearance must be used within an AppearanceProvider')
  return ctx
}
