// ---------------------------------------------------------------------------
// STEPS — logged on the Exercise tab.
//
// Ashley, 5 Sep 2026, looking at the Nutrition tab: "we currently log steps in
// the nutrition tab but that isn't right." Asked where they belonged instead,
// she chose Exercise.
//
// This REVERSES the rule VISION-ARCHITECTURE §5.1a used to state. Steps were
// put on Nutrition on a real argument — steps-target.ts derives the step
// target from the same activity_level that drives the calorie target's PAL
// multipliers, "so the step target and the calorie target never disagree about
// who is more active", and two numbers from one input were judged to belong on
// one tab. That derivation is unchanged and still true; the caption below is
// where it is explained, and it matters MORE now the two numbers sit on
// different tabs. What changed is the ownership call built on top of it:
// steps are movement you do, and movement is what this tab is for.
//
// Extracted rather than rewritten. The handler, its error handling and the
// ring geometry are the ones that shipped on Nutrition, moved verbatim — a
// move is not the moment to also redesign the thing being moved.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { getStepsForDate, logStepsManual, type DailyStepsRow } from '@/lib/steps-store'
import { stepsTargetFor } from '@/lib/steps-target'
import type { UserProfile } from '@/lib/types'

// The calorie tile's ring geometry, kept identical so the steps ring and the
// calorie ring read as one system rather than two people's work. Moved here
// with the row; Nutrition's own rings are separate constants and stayed.
const STEP_RING_R = 14
const STEP_RING_CIRC = 2 * Math.PI * STEP_RING_R

export function StepsRow({
  profile,
  profileId,
  date,
  refreshToken,
  onLogged,
}: {
  profile?: UserProfile
  profileId?: string
  date: string
  /**
   * Bumped by App when the coach logs steps from chat. Without it this row
   * keeps whatever it read on mount, and a confirmed chat log would land in
   * the database and nowhere the user can see — the failure BACKLOG already
   * records four instances of from Ashley's phone.
   */
  refreshToken?: number
  /**
   * Fired after a successful log. The chat tab never unmounts, so the coach
   * would otherwise keep quoting the step count it read when the app started
   * — this is the only way a number typed here reaches it.
   */
  onLogged?: () => void
}) {
  const [stepsRow, setStepsRow] = useState<DailyStepsRow | null>(null)
  const [stepsInput, setStepsInput] = useState('')
  // Its own error state. On Nutrition this was SHARED with the water-target
  // handler, so it could not simply travel with the row — Nutrition keeps
  // that one for water, and this owns its own.
  const [entryError, setEntryError] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId || !date) return
    void getStepsForDate(profileId, date).then(setStepsRow).catch(() => setStepsRow(null))
  }, [profileId, date, refreshToken])

  /**
   * Audit §3.3 — this had no error handling. Offline, logStepsManual threw,
   * the rejection went nowhere, and the number simply never saved with
   * nothing said. The only clue was that the typed value stayed in the box,
   * which reads as "nothing happened yet" rather than "that failed".
   *
   * The input is deliberately NOT cleared on failure: it is the user's
   * number, and making them type it again would be the second small
   * unkindness after losing it the first time.
   */
  const handleLogSteps = async () => {
    const n = Number(stepsInput)
    if (!profileId || !Number.isFinite(n) || n < 0) return
    try {
      setStepsRow(await logStepsManual(profileId, date, Math.round(n)))
      setStepsInput('')
      setEntryError(null)
      onLogged?.()
    } catch (err) {
      console.error('Logging steps failed:', err)
      setEntryError("Couldn't save your steps — check your connection and tap Log again.")
    }
  }

  // No profile means no target rule to apply, and a ring against an unknown
  // target is a number pretending to be progress.
  if (!profile || !profileId) return null

  const stepTarget = stepsTargetFor(profile)
  const todaySteps = stepsRow?.steps ?? 0

  return (
    <div>
      <div className="flex items-baseline justify-between pt-3.5 pb-1" style={{ borderTop: '1px solid var(--hairline)' }}>
        <span className="text-[0.8125rem] text-text-tertiary">Steps</span>
        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <svg viewBox="0 0 34 34" className="size-[24px] shrink-0" aria-hidden>
            <circle cx="17" cy="17" r={STEP_RING_R} fill="none" stroke="var(--surface-raised)" strokeWidth="4" />
            <circle
              cx="17" cy="17" r={STEP_RING_R} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${STEP_RING_CIRC * Math.min(1, stepTarget > 0 ? todaySteps / stepTarget : 0)} ${STEP_RING_CIRC}`}
              transform="rotate(-90 17 17)"
            />
          </svg>
          <span className="tabular-mono text-[0.8125rem]">{todaySteps.toLocaleString()} / {stepTarget.toLocaleString()}</span>
          <input
            type="number"
            placeholder="Log"
            aria-label="Steps today"
            value={stepsInput}
            onChange={e => setStepsInput(e.target.value)}
            className="h-7 w-16 min-w-0 rounded-md bg-[color:var(--surface-raised)] px-2 text-xs"
          />
          <button className="hit-slop-44 text-xs font-semibold text-primary" onClick={handleLogSteps}>Log</button>
        </span>
      </div>
      {/* NO INLINE TARGET EDITOR, deliberately. The handoff sketches an
          "edit" affordance here, but daily_step_target is a profile column
          with no setter in this path, and adding a second place to change
          it is how two surfaces come to disagree about one number. The
          override behaviour is unchanged — this line says where it lives.
          It also carries the only explanation of why the step target and the
          calorie target move together, which is the part of the old
          Nutrition argument that survives the move. */}
      <p className="text-[0.6875rem] leading-[1.4] text-muted-foreground">
        Target from the activity level your calorie target uses — override it in your profile.
      </p>
      {entryError && (
        <p className="mt-1.5 text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]">{entryError}</p>
      )}
    </div>
  )
}
