import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// WHERE THE TOUR IS, FOR THE SCREENS IT SHOWS (his request 22 Nov 2026: "Make sure every step shows what it is
// describing ... The tour should also show the about exercise tab, and everything in it").
//
// The tour is an overlay that points at the real app (AppTour.tsx). A stop that describes something behind a tap (a
// menu, a sheet, a tab of the About sheet, Home's Progress) used to point at the closed control and describe what was
// behind it. Now the screen that owns the thing opens it while the tour is on that stop, and closes it when the tour
// moves on: the real menu, the real sheet, never a drawing of one. Each screen reads the stop through this one store,
// and opens only for the stops below.
//
// THE PRACTICE DAY. On a day with no set to log (a rest day, an active-recovery day, a day already trained or set
// aside), the Exercise tab puts up the next session for the tour's practice stops, the way "Train anyway" would, but
// never saved: it is the tour's, and goes when the tour leaves Exercise. Its weekday is published back here so the
// tour can say what it did.
// ---------------------------------------------------------------------------

/** The stops that open something on screen, by the key of the stop (app-tour-steps.ts). */
export const TOUR_OPENS = {
  progress: 'progress',
  mealSheet: 'mealsheet',
  effort: 'effort',
  exerciseMenu: 'exmenu',
  dayMenu: 'daymenu',
  whatHappened: 'whathappened',
  settingsMenu: 'settings',
  profile: 'profile',
} as const

/** The About sheet's stops, and the tab each one shows. */
export const TOUR_ABOUT_TABS: Record<string, 'howto' | 'summary' | 'history'> = {
  'about-howto': 'howto',
  'about-muscles': 'summary',
  'about-history': 'history',
}

/** The Exercise stops that need a set on screen, so a day with none puts up the practice day for them. */
export const TOUR_PRACTICE_STOPS = new Set(['exercise', 'set', 'effort', 'exmenu', 'about-howto', 'about-muscles', 'about-history', 'daymenu', 'whathappened'])

let stage: string | null = null
let practiceDay: string | null = null
let anchorExercise: string | null = null
const listeners = new Set<() => void>()
const notify = () => { for (const l of listeners) l() }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** The tour says which stop is on screen (null when it is not running). */
export function setTourStage(next: string | null): void {
  if (stage === next) return
  stage = next
  notify()
}

/** The Exercise tab says which weekday it has put up to practise on (null when none). */
export function setTourPracticeDay(next: string | null): void {
  if (practiceDay === next) return
  practiceDay = next
  notify()
}

/** The lift the tour's Exercise stops point at says its name (null when it goes), for the About sheet's stops. */
export function setTourExercise(next: string | null): void {
  if (anchorExercise === next) return
  anchorExercise = next
  notify()
}

/** The lift the About sheet's stops open, or null. */
export function useTourExercise(): string | null {
  return useSyncExternalStore(subscribe, () => anchorExercise, () => null)
}

/** The stop on screen, or null. */
export function useTourStage(): string | null {
  return useSyncExternalStore(subscribe, () => stage, () => null)
}

/** The weekday put up to practise on, or null. */
export function useTourPracticeDay(): string | null {
  return useSyncExternalStore(subscribe, () => practiceDay, () => null)
}
