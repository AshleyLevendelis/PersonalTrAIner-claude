import type { RecommendedCardio } from '@/lib/types'
import { PlannedCardioRow } from './CardioSetRow'
import { isSeparateSession } from '@/lib/session-duration'

// ---------------------------------------------------------------------------
// The PRESCRIBED cardio entry point (LAYOUT-DESIGN.md §1.7 F) — activity,
// duration and effort prefilled from the plan, one tap on the ✓ to log it.
// Distinct from AddUnplannedWork (§1.7 G), which is for anything NOT
// prescribed. Writes through the optimistic cardio-log-store wrapper (§7.6
// #5), never the old direct insertCardioLog network call.
//
// LOGGED LIKE A LIFTING SET since 24 Sep 2026 — Ashley's ruling, from three
// options, that every cardio log in the app should look like a set row. This
// was an amber strip with an outline "Log" button and a "Logged" that forgot
// itself on every tab change; the row, the read-back and the refusal all live
// in CardioSetRow now, shared with the rest day and unplanned work, so the
// three cannot drift apart again.
//
// THE PROTOCOL IS NOT AN AFTERTHOUGHT — Ashley, 14 Sep 2026: "the finisher
// title is truncated (Finisher · 11m Rowing Intervals — 6 rounds...), making
// it impossible to see the full description, round breakdown, or work/rest
// durations." The row still splits the plan's string at the dash and gives
// the rounds their own line; see splitActivity.
// ---------------------------------------------------------------------------

/**
 * What a same-day session that is NOT part of the lifting is called. The
 * engine makes the goal's cardio its own session for somebody on a strict
 * 30-45 minute window ("Scheduled as a separate session to preserve your
 * strict lifting window") — and until 9 Oct 2026 the screen then drew it under
 * "Finish" as that session's "Finisher", so 22 minutes of lifting read as 22
 * plus a 30-minute finisher against a stated 40.
 *
 * THE WORDS ARE ASHLEY'S TO CHANGE — decided unprompted, reversible here.
 */
export const SEPARATE_SESSION_LABEL = 'Separate session'
export const SEPARATE_SESSION_HEADING = 'Also today'
export const SEPARATE_SESSION_NOTE = 'Not part of your lifting time. Do it any time today.'

/** `label` leads the row. "Finisher" unless the caller knows better — the
 *  mobility close-out on a day that already had its cardio says "Optional",
 *  because that is what it is, and a second row headed "Finisher" would read
 *  as a second thing the session requires. And a session the plan has set
 *  apart from the lifting is never a "Finisher" at all: FinishSection below
 *  decides, so no caller can get it wrong. */
export function FinisherRow({ cardio, onLogged, label = 'Finisher', testid }: { cardio: RecommendedCardio; onLogged?: () => void; label?: string; testid?: string }) {
  return (
    <PlannedCardioRow
      prescription={cardio}
      label={label}
      onLogged={onLogged}
      testid={testid ?? (label === 'Finisher' ? 'finisher-row' : `finisher-row-${label.toLowerCase()}`)}
    />
  )
}

/**
 * Everything that comes after the lifting, said as what it is:
 *   - "Finish": a finisher that is part of the session, and the optional
 *     mobility close-out;
 *   - "Also today": a session the plan has set apart from the lifting.
 * One component so the Exercise tab cannot head a separate walk "Finish".
 */
export function FinishSection({ cardio, mobilityFiller }: { cardio?: RecommendedCardio | null; mobilityFiller?: RecommendedCardio | null }) {
  const separate = cardio && isSeparateSession(cardio) ? cardio : null
  const finisher = cardio && !separate ? cardio : null
  if (!cardio && !mobilityFiller) return null
  return (
    <>
      {(finisher || mobilityFiller) && (
        <>
          <p className="ds-label-compact" data-testid="finish-heading">Finish</p>
          {/* A filler the engine added to use spare time is counted as
              "optional" in the day's length, so its row says the same word. */}
          {finisher && <FinisherRow cardio={finisher} label={finisher.is_filler ? 'Optional' : 'Finisher'} testid="finisher-row" />}
          {/* The optional mobility close-out on a day that already had its
              cardio and still ran short — applyDurationFiller. Its own row,
              after the cardio, because that is the order to do them in. */}
          {mobilityFiller && <FinisherRow cardio={mobilityFiller} label="Optional" />}
        </>
      )}
      {separate && (
        <>
          <p className="ds-label-compact" data-testid="separate-heading">{SEPARATE_SESSION_HEADING}</p>
          <FinisherRow cardio={separate} label={SEPARATE_SESSION_LABEL} testid="separate-session-row" />
          <p className="text-xs text-muted-foreground" data-testid="separate-note">{SEPARATE_SESSION_NOTE}</p>
        </>
      )}
    </>
  )
}
