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
  // The only calculator in the app, so "open the calculator at 120kg" is the plate calculator (his live test, 16 Nov).
  ['plate', /\bplate(?:s)?\s*(?:calculator|calc|loader|maths?)\b|\bplate calculator\b|\b(?<!calorie |macro |tdee )(?:calculator|calc)\b/],
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
    return { target, kg: target === 'plate' ? kgInText(t) : null }
  }
  return null
}

/** A weight named in a message ("at 120kg", "100 kilos"), or null. */
export function kgInText(text: string): number | null {
  const m = /(\d{1,3}(?:\.\d+)?)\s*(?:kg|kilos?)\b/i.exec(text ?? '')
  return m ? Number(m[1]) : null
}

/** The app's own line when it opens a screen. The plate calculator's weight is in it, so the button reopens there. */
export function openedLine(target: OpenTarget, kg: number | null = null): string {
  return target === 'plate' && kg ? `Opened ${OPEN_TARGET_NAME[target]} at ${kg} kg.` : `Opened ${OPEN_TARGET_NAME[target]}.`
}

/** The button under that line. */
export function openButtonLabel(target: OpenTarget): string {
  return `Open ${OPEN_TARGET_NAME[target]}`
}

/** Read the app's own line back (after a reload), so the button comes back with it, at the same weight. */
export function openTargetInReply(content: string): { target: OpenTarget; kg: number | null } | null {
  const t = (content ?? '').trim()
  for (const target of Object.keys(OPEN_TARGET_NAME) as OpenTarget[]) {
    if (t === openedLine(target)) return { target, kg: null }
  }
  const atKg = /^Opened the plate calculator at (\d{1,3}(?:\.\d+)?) kg\.$/.exec(t)
  return atKg ? { target: 'plate', kg: Number(atKg[1]) } : null
}

/**
 * A SCREEN THE COACH NAMES IS ONE TAP AWAY (18 Nov 2026, the Fable pass on the coach; his brief: the chat should
 * "quickly and easily do things for the user"). The coach is told never to give directions to a tab, so when its reply
 * is ABOUT a screen ("that's on your shopping list now", "the plate calculator will tell you") there was nothing to tap.
 * Read off the coach's own words, the way the timer buttons are: only a name that can mean one screen, only when the
 * reply names exactly ONE of them, and never on the app's own "Opened ..." line (which carries its own button).
 * "Your plan", "your meals" and "today's session" are deliberately not here: the coach says them in half its replies,
 * and a button under every message is noise.
 */
const NAMED_SCREENS: [OpenTarget, RegExp][] = [
  ['grocery', /\b(?:shopping|grocery) list\b/i],
  ['plate', /\bplate calculator\b/i],
  ['history', /\bsession history\b/i],
  ['program', /\bfull program(?:me)?\b/i],
]
export function screenNamedInReply(content: string): OpenTarget | null {
  const t = content ?? ''
  if (openTargetInReply(t)) return null
  const named = NAMED_SCREENS.filter(([, re]) => re.test(t)).map(([target]) => target)
  return named.length === 1 ? named[0] : null
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
