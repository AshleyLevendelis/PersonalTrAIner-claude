// "OPEN THE PLATE CALCULATOR" FROM THE CHAT (his request 16 Nov 2026, with a screenshot of the coach answering "You can
// open the plate calculator on the Tools tab ... tap the plate calculator row"): "I want to be able to do everything
// from chat. Open plate calculator, open recent session history, grocery list ... open my program. Everything."
//
// Two halves, both here so every screen asks one module:
//   1. The READER: which screen a message asks to open. An instruction only ("open", "show me", "take me to", "pull up",
//      "where's"), so "add eggs to my shopping list" is the coach's to do, never a screen to open.
//   2. The CHANNEL: how the chat asks a screen to open, including one that is not mounted yet (the Tools tab only
//      mounts once it is shown). A request is kept until the screen that owns it takes it, the pattern the shopping
//      list's day count already uses (takeRequestedGroceryDays).
//
// The app's own sentence for an opened screen is read back by `openTargetInReply`, so the "open it again" button
// survives a reload with nothing new stored.

import { groceryHash, programHash, tabHash, type Tab } from './app-route'

export type OpenTarget = 'plate' | 'history' | 'grocery' | 'program' | 'profile' | 'home' | 'nutrition' | 'exercise' | 'tools'

/** What each screen is called, in the app's own words: the chat's line and its button both read these. */
export const OPEN_TARGET_NAME: Record<OpenTarget, string> = {
  plate: 'the plate calculator',
  history: 'your session history',
  grocery: 'your shopping list',
  program: 'your program',
  profile: 'your Profile',
  home: 'Home',
  nutrition: 'Nutrition',
  exercise: 'Exercise',
  tools: 'Tools',
}

// Longest names first within each, so "session history" wins over a bare "history" and "shopping list" over "list".
const TARGET_WORDS: [OpenTarget, RegExp][] = [
  ['plate', /\bplate(?:s)?\s*(?:calculator|calc|loader|maths?)\b|\bplate calculator\b/],
  ['history', /\b(?:(?:recent|past|last|previous|my)\s+)*(?:session|workout|training)\s+(?:history|log)s?\b|\bhistory\b|\bpast (?:sessions|workouts)\b|\brecent (?:sessions|workouts)\b/],
  ['grocery', /\b(?:grocery|groceries|shopping)(?:\s+list)?\b/],
  ['program', /\b(?:program(?:me)?|training plan|full plan|plan for the (?:block|weeks?))\b/],
  ['profile', /\b(?:profile|settings)\b/],
  ['home', /\bhome(?:\s+(?:tab|screen|page))?\b|\bdashboard\b/],
  ['nutrition', /\bnutrition(?:\s+(?:tab|screen|page))?\b|\bmeal plan\b/],
  ['exercise', /\bexercise(?:\s+(?:tab|screen|page))\b|\btoday'?s (?:workout|session)\b/],
  ['tools', /\btools(?:\s+(?:tab|screen|page))?\b/],
]

// The ask, at the start of the message (after a "can you" or "please"), or a "where's ..." question.
const OPEN_VERB = /^(?:(?:hey|ok|okay)[,!]?\s+)?(?:(?:can|could|would|will) you\s+|please\s+|can i\s+|let me\s+|i want to\s+|i'd like to\s+)?(?:open(?: up)?|show(?: me)?|take me to|go to|bring up|pull up|view|see|get me to)\b|^where(?:'s| is| are| can i find)\b/

/** Which screen this message asks to open, or null. Only a short, plain ask: anything else is the coach's to answer. */
export function parseOpenRequest(text: string): { target: OpenTarget; kg: number | null } | null {
  const t = (text ?? '').trim().toLowerCase().replace(/[’]/g, "'")
  if (!t || t.length > 90) return null
  if (!OPEN_VERB.test(t)) return null
  // "show me how to squat", "can you see my knee": the verb alone is not enough, a screen must be named.
  for (const [target, words] of TARGET_WORDS) {
    if (!words.test(t)) continue
    const kgMatch = target === 'plate' ? /(\d{2,3}(?:\.\d)?)\s*(?:kg|kilos?)\b/.exec(t) : null
    return { target, kg: kgMatch ? Number(kgMatch[1]) : null }
  }
  return null
}

/** The app's own line when it opens a screen. */
export function openedLine(target: OpenTarget): string {
  return `Opened ${OPEN_TARGET_NAME[target]}.`
}

/** The button under that line. */
export function openButtonLabel(target: OpenTarget): string {
  return `Open ${OPEN_TARGET_NAME[target]}`
}

/** Read the app's own line back (after a reload), so the button comes back with it. */
export function openTargetInReply(content: string): OpenTarget | null {
  const t = (content ?? '').trim()
  for (const target of Object.keys(OPEN_TARGET_NAME) as OpenTarget[]) {
    if (t === openedLine(target)) return target
  }
  return null
}

// --- the channel -------------------------------------------------------------------------------------------------

const OPEN_EVENT = 'app-open-request'
let pending: { target: OpenTarget; kg: number | null } | null = null

const TAB_OF: Partial<Record<OpenTarget, Tab>> = { plate: 'tools', history: 'tools', home: 'dashboard', nutrition: 'nutrition', exercise: 'exercise', tools: 'tools' }

/** Open a screen from anywhere: moves to its tab or route, and hands the screen its request. */
export function requestOpen(target: OpenTarget, kg: number | null = null): void {
  if (target === 'grocery') { window.location.hash = groceryHash(); return }
  if (target === 'program') { window.location.hash = programHash(); return }
  pending = { target, kg }
  const tab = TAB_OF[target]
  if (tab) window.location.hash = tabHash(tab)
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}

/** A screen takes its own request (and only its own), once. */
export function takeOpenRequest(targets: OpenTarget[]): { target: OpenTarget; kg: number | null } | null {
  if (!pending || !targets.includes(pending.target)) return null
  const taken = pending
  pending = null
  return taken
}

/** Called when a request may be waiting: on mount, and again whenever the chat asks. */
export function onOpenRequest(fn: () => void): () => void {
  window.addEventListener(OPEN_EVENT, fn)
  return () => window.removeEventListener(OPEN_EVENT, fn)
}
