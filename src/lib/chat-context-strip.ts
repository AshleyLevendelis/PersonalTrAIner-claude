// ---------------------------------------------------------------------------
// THE CHAT'S CONTEXT STRIP (design handoff, Chat 2b, 31 Oct 2026): small pills
// under the header saying where today stands, built from the SAME readings
// Home and Nutrition draw — never a second calculation.
//
//   - mid-session: "<focus> · N of M sets", tapping opens Exercise. The count
//     is sessionSetCount (Home's "N of M sets", the strips' and the coach's);
//   - session done: "Session done · 45 min", static, no link. The minutes are
//     Home's own (the finish card's, else the session row's);
//   - rest day, a moved day, not started yet, or not known: no workout pill;
//   - "1,410 kcal left" (or "120 kcal over"), tapping opens Nutrition, through
//     the phrasebook's kcalLeftOrOver, the words Nutrition's hero uses;
//   - nothing to say: no strip at all.
//
// DELIBERATE DEVIATION FROM THE DESIGN'S COPY, kept: the design drew "set 2 of
// 12" (the set she is on). The app counts sets LOGGED, and Home says "N of M
// sets", so the pill says that too: one count, one wording.
// ---------------------------------------------------------------------------
import { kcalLeftOrOver } from './coach-voice'

export type StripSessionStatus = 'rest' | 'not_started' | 'in_progress' | 'done' | 'unknown' | 'moved'

export interface ContextStripInput {
  /** Home's own reading of today's session (dashboard-data's TodaySession), or null before it has loaded. */
  session: { status: StripSessionStatus; focus: string | null } | null
  /** The session has been started on this phone (the active session's own status), whether or not a set is in. */
  running: boolean
  /** sessionSetCount for today, the shared count. */
  count: { logged: number; planned: number } | null
  /** Home's minutes for a finished session, or null when nobody measured them. */
  minutes: number | null
  /** Today's calorie target and what the meal ledger says was eaten, or null when either is unknown. */
  kcal: { target: number; eaten: number } | null
}

export type ContextPill =
  | { kind: 'session'; text: string; to: 'exercise' }
  | { kind: 'done'; text: string }
  | { kind: 'kcal'; text: string; to: 'nutrition' }

/** "1,410 kcal left" / "120 kcal over" — Nutrition's hero, word for word. */
export function kcalPillText(target: number, eaten: number): string {
  const [amount, word] = kcalLeftOrOver(target - eaten).split(' ')
  return `${Number(amount).toLocaleString()} kcal ${word}`
}

export function chatContextPills(input: ContextStripInput): ContextPill[] {
  const pills: ContextPill[] = []
  const status = input.session?.status ?? null
  if (status === 'done') {
    pills.push({ kind: 'done', text: input.minutes != null && input.minutes > 0 ? `Session done · ${Math.round(input.minutes)} min` : 'Session done' })
  } else if (status === 'in_progress' || (input.running && status === 'not_started')) {
    const focus = input.session?.focus?.trim() || "Today's session"
    pills.push({ kind: 'session', text: input.count ? `${focus} · ${input.count.logged} of ${input.count.planned} sets` : focus, to: 'exercise' })
  }
  if (input.kcal && Number.isFinite(input.kcal.target) && input.kcal.target > 0 && Number.isFinite(input.kcal.eaten)) {
    pills.push({ kind: 'kcal', text: kcalPillText(input.kcal.target, input.kcal.eaten), to: 'nutrition' })
  }
  return pills
}
