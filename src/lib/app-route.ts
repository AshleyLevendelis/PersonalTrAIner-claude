// ---------------------------------------------------------------------------
// The Route union and hash parser (LAYOUT-DESIGN.md §5.3). Generalises the
// old inline useHashRoute (App.tsx) into a real grammar so later phases can
// add `#/exercise/program[/n]` (P2) and `#/train` (P3) to the SAME parser
// instead of growing a second ad hoc hash reader. P1 only ever produces
// `tab` and `devtest` routes — the union already carries the later kinds so
// the type doesn't need to change shape when they land, only the parser and
// its callers gain a branch.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'

export type Tab = 'dashboard' | 'nutrition' | 'exercise' | 'meals' | 'chat'

const TABS: Tab[] = ['dashboard', 'nutrition', 'exercise', 'meals', 'chat']

export type Route =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'devtest' }
  | { kind: 'program'; week?: number }
  // Reserved for P3 (`#/train`) — not produced by parseRoute yet; declared
  // here so the union is stable across phases and callers can already
  // switch on `kind` exhaustively.
  | { kind: 'train' }

export function isTab(value: string): value is Tab {
  return (TABS as string[]).includes(value)
}

export function tabHash(tab: Tab): string {
  return `#/tab/${tab}`
}

/** `#/exercise/program` (week list — no week number yet) or `#/exercise/program/{n}` (week detail). */
export function programHash(week?: number): string {
  return week != null ? `#/exercise/program/${week}` : '#/exercise/program'
}

export function parseRoute(hash: string): Route {
  if (hash === '#/dev-test') return { kind: 'devtest' }
  const programMatch = /^#\/exercise\/program(?:\/(\d+))?$/.exec(hash)
  if (programMatch) return { kind: 'program', week: programMatch[1] ? parseInt(programMatch[1], 10) : undefined }
  const tabMatch = /^#\/tab\/([a-z]+)$/.exec(hash)
  if (tabMatch && isTab(tabMatch[1])) return { kind: 'tab', tab: tabMatch[1] }
  return { kind: 'tab', tab: 'dashboard' }
}

/** True only for hashes this parser actually recognises — an empty/unknown hash needs the caller's own initial-tab decision, not this fallback. */
export function isKnownTabHash(hash: string): boolean {
  return /^#\/tab\/([a-z]+)$/.test(hash) && isTab(hash.slice('#/tab/'.length))
}

export function useAppRoute(): { hash: string; route: Route } {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return { hash, route: parseRoute(hash) }
}
