import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { ReadOnlyDayList } from './ReadOnlyDayList'
import { whatYouDid } from '@/lib/session-derive'
import type { ExerciseSetLog, WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §2.2 — one other day's content, in place, one tap, one
// tap back. Read-only for logging: no set grid, no logSet reachable
// (asserted structurally — this component never imports SetGrid or the
// hook's write facade). progressedLoads is suppressed by construction: the
// caller passes plan-derived loads only, never the today-only progression
// map, so a peeked day never shows a 'logged' provenance it hasn't earned.
// Swap/ban stay available (they're plan edits, not session acts) via
// callbacks — the confirm dialog itself is owned by the caller (ExerciseTab)
// and shared with the main day's rows.
//
// LOOKS LIKE TODAY, DELIBERATELY. This used to render a stack of raised
// cards with every exercise forced open — ramp box, RPE line, per-set chips,
// two always-visible icons — while today's list was hairline-separated bare
// lines with a tier label and a mono "3×6-8 · 42.5kg" summary. Same data,
// same app, two visual languages, and nothing about being read-only required
// the difference: it was markup duplication, not a real constraint. The
// collapsed line and the tier label came from ExerciseLine, shared with
// today's rows so they could not drift apart again.
//
// THAT PROMISE HELD HERE AND MISSED THE THIRD SCREEN. Sharing the ROW was
// only ever half of it: the program view was still a data table with
// Exercise / Sets / Reps / Rest columns, because nothing shared the DAY. So
// the whole list moved to ReadOnlyDayList (31 Aug 2026) and this panel is now
// a header and a call to it. What stays different is only what genuinely
// differs — no set grid, no logged-set state, no calibration cue, no plate
// calculator.
// ---------------------------------------------------------------------------

/**
 * WHAT YOU DID, FIRST — a past day opened from the strip (run 5, M47). It
 * showed only the plan, even on a day with sets logged: the one thing she
 * opened it to see was the one thing it did not say. Read off that day's own
 * working sets, never the plan.
 */
export function PeekWhatYouDid({ logs }: { logs: ExerciseSetLog[] }) {
  const rows = whatYouDid(logs)
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl bg-card px-4 py-3" data-testid="peek-what-you-did">
      <p className="text-[0.65625rem] uppercase tracking-[.2em] text-primary-text">What you did</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map(r => (
          <li key={r.name} className="text-sm" data-testid="peek-did-row">
            <span className="font-medium">{r.name}</span>
            <span className="tabular-mono text-muted-foreground"> · {r.line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PeekPanel({
  workout,
  onExit,
  onSwap,
  onBan,
  onOpenDetail,
  banBusyName,
  dayLabel,
  movedFromDayName,
  sessionLength,
}: {
  workout: WorkoutDay
  onExit: () => void
  onSwap: (exIndex: number, exerciseName: string) => void
  onBan: (exerciseName: string) => void | Promise<void>
  /** Same technique panel the day view opens — one dialog, two entry points. */
  onOpenDetail?: (exerciseName: string) => void
  banBusyName: string | null
  /**
   * The day being LOOKED AT, which is not always the day the session is named
   * after. A session that moved carries its origin's weekday inside it, so
   * peeking Wednesday used to be headed "TUESDAY". Passed explicitly rather
   * than read off the workout for that reason.
   */
  dayLabel?: string
  /** Where a moved-in session came from, so the header can say so. */
  movedFromDayName?: string | null
  /**
   * THIS day's length, already worded by formatDayLength. The length left the
   * week row for the hero's meta line in 2c (10 Oct 2026), so the peek carries
   * its own — the L17 rule: the length shown is the day that is OPEN.
   */
  sessionLength?: string
}) {
  return (
    <div className="rounded-xl bg-card">
      {/* THE SAME HERO AS TODAY, and deliberately so.
       *
       * This was one small line — "Friday · Full Body Power" at text-sm —
       * while today's screen gave the focus a 36px bold headline. Ashley's
       * ask: "I want all days to look like that, but still make it obvious
       * which is the current day's plan." A day's focus is the one thing
       * that tells you what the session IS; it should read the same on
       * Friday as it does on Wednesday.
       *
       * WHAT STILL SEPARATES TODAY, now that the type matches — three
       * things, none of them the headline:
       *   1. the eyebrow. Today's reads "Today · Wednesday" in mint with a
       *      glow; a peeked day reads just "Friday", muted and unglowing.
       *      Same slot, same size, deliberately different colour, so the
       *      distinction sits exactly where the eye already goes.
       *   2. today has Start session. A peeked day has an X.
       *   3. today has the session-progress line under the title. A day
       *      that is not today has no progress to show.
       *
       * Kept a touch smaller than today's 36px (30px): identical size with
       * a different colour reads as a bug, whereas a clear step down reads
       * as a deliberate hierarchy — today first, this second. */}
      <div className="flex items-start justify-between gap-2.5 px-4 pt-3.5 pb-3 border-b">
        <div className="min-w-0">
          <span className="text-[0.65625rem] uppercase tracking-[.2em] text-muted-foreground">
            {dayLabel ?? workout.day}
            {movedFromDayName && <span className="normal-case tracking-normal"> · moved from {movedFromDayName}</span>}
          </span>
          <p className="mt-1.5 text-[1.875rem] font-bold leading-[1.05] tracking-[-.03em]">{workout.focus}</p>
          <p className="mt-1.5 text-[0.75rem] text-muted-foreground" data-testid="hero-meta">
            {workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'}{sessionLength ? ` · ${sessionLength}` : ''}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onExit} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </div>
      <ReadOnlyDayList
        workout={workout}
        onSwap={onSwap}
        onBan={onBan}
        onOpenDetail={onOpenDetail}
        banBusyName={banBusyName}
        className="px-4 pb-2"
      />
    </div>
  )
}
