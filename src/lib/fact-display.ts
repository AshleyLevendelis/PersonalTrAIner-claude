// ---------------------------------------------------------------------------
// HOW A REMEMBERED NOTE READS (the Profile walk, 18 Nov 2026, finding P4).
//
// Profile's "Remembers" list printed the app's own bookkeeping: "won't eat/do Barbell Squats" (one label for a food
// and an exercise), a pill reading "hard", and "manual · Sep 16, 2026". A food is eaten and an exercise is done, so
// the label is written by kind; where a note came from is said in words, with the date the way the rest of the app
// writes one (day, month, year; a fixed month list, because the phone's own short month is "Sep" on one and "Sept"
// on another).
//
// One writer (`wontText`) for every place that saves a firm "never", and one reader (`factText`) so a note saved
// under the old label reads right as well.
// ---------------------------------------------------------------------------

/** The label for a firm "never": "won't eat pork", "won't do Burpees". */
export function wontText(kind: string, what: string): string {
  return `${kind === 'exercise_preference' ? "won't do" : "won't eat"} ${what}`
}

/** A stored note as the screen reads it: one saved as "won't eat/do X" reads by its kind. */
export function factText(fact: { kind: string; display_text: string }): string {
  const old = /^won't eat\/do (.+)$/.exec(fact.display_text)
  return old && (fact.kind === 'food_preference' || fact.kind === 'exercise_preference') ? wontText(fact.kind, old[1]) : fact.display_text
}

const WHERE_FROM: Record<string, string> = {
  manual: 'Added by you', chat: 'From chat', onboarding: 'From setup', logged_data: 'From your logs',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "From chat · 16 Sep 2026". An unknown source is left out, never printed raw; an unreadable date likewise. */
export function factSourceLine(source: string, createdAt: string): string {
  const d = new Date(createdAt)
  const date = Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  return [WHERE_FROM[source], date].filter(Boolean).join(' · ')
}

/**
 * WHAT A TIMING RULE DOES, in the same words on Profile and on the chat's receipt (they were two hand-written copies
 * of "recorded — not yet applied (needs day-context meal generation doesn't have yet)"). A rule about a meal ("no
 * eggs at breakfast") is applied to that meal's options. A rule about training ("no caffeine before training") is
 * kept and NOT applied, and says so: a day's meals are chosen without knowing when he trains.
 */
export function timingRuleEffect(anchor: string | null | undefined, slot: string | null | undefined): string {
  return anchor === 'slot' && slot ? `applied to your ${slot} options` : 'remembered, not applied: your meals are not planned around when you train'
}

/** A day he cannot train ("no gym Tuesdays"): read when a plan is built, so it waits for the next rebuild. */
export const APPLIES_AT_NEXT_REBUILD = 'remembered. It applies the next time your plan is rebuilt'
