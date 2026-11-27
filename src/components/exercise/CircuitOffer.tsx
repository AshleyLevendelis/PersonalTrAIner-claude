import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { InsightBanner } from '@/components/ui/insight-banner'
import { useCardioLogsToday } from './CardioSetRow'
import { cardioExtraNote, circuitOfferFor } from '@/lib/circuit'
import { setSwappedForActivity } from '@/lib/daily-tracking'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import type { WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// "COUNT THIS AS TODAY'S WORKOUT" — Ashley's ruling A, 8 Oct 2026
// (docs/plans/timer-circuit-log.md). She did rope, push-ups, sit-ups and the
// bike off the round timer instead of her session. Each block is logged by
// name; this is the one tap that says they replaced the plan. ONE component
// on Tools (where the blocks are logged) and on Today (where the session
// is), one decision (circuitOfferFor), one write: the existing day swap,
// named for the blocks. It adds no cardio row: the blocks already are them.
// ---------------------------------------------------------------------------

const dismissKey = (profileId: string, date: string) => `fitplan_circuit_offer_dismissed_${profileId}_${date}`

function readDismissed(profileId: string, date: string): boolean {
  try { return localStorage.getItem(dismissKey(profileId, date)) === '1' } catch { return false }
}

export function CircuitOffer({
  profileId,
  date,
  day,
  session,
  workingSetsToday,
  onChanged,
}: {
  profileId: string | undefined
  date: string
  /** Today on the training week, for whether the session is still due. */
  day: TrainingWeekDay | undefined
  /** What today holds once moves are taken into account. */
  session: WorkoutDay | undefined
  workingSetsToday: number
  onChanged: () => void
}) {
  const logs = useCardioLogsToday()
  const [dismissed, setDismissed] = useState(() => !!profileId && readDismissed(profileId, date))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const input = {
    dayState: day?.state,
    sessionFocus: session?.focus ?? null,
    sessionHasExercises: (session?.exercises.length ?? 0) > 0,
    workingSetsToday,
    logs,
  }
  const offer = circuitOfferFor(input)
  // AN EASY WALK IS NOT ASKED ABOUT (his ruling 27 Nov 2026, "Only ask after real work"): it is kept as extra and the
  // session stays on, and the card says both, so nobody wonders whether the walk was lost.
  const extra = offer ? null : cardioExtraNote(input)
  // Not put away by "No, I'll still train": it asks nothing, it only says the walk was kept.
  if (extra && profileId) {
    return (
      <InsightBanner tone="ai" className="flex-col" data-testid="cardio-extra-note">
        <span className="text-sm">Logged today:</span>
        <ul className="mt-1 space-y-0.5 text-sm">
          {extra.lines.map((line, i) => <li key={i} className="font-semibold">✓ {line}</li>)}
        </ul>
        <p className="mt-2 text-sm">{extra.sentence}</p>
      </InsightBanner>
    )
  }
  if (!offer || !profileId || dismissed) return null

  const countIt = async () => {
    setBusy(true); setError(null)
    let ok = false
    try { ok = await setSwappedForActivity(profileId, date, offer.name) } catch { ok = false }
    setBusy(false)
    if (!ok) { setError("Couldn't save that — try again in a moment."); return }
    onChanged()
  }
  const notToday = () => {
    try { localStorage.setItem(dismissKey(profileId, date), '1') } catch { /* the offer simply comes back next load */ }
    setDismissed(true)
  }

  return (
    <InsightBanner tone="ai" className="flex-col" data-testid="circuit-offer">
      <span className="text-sm">Logged today:</span>
      <ul className="mt-1 space-y-0.5 text-sm" data-testid="circuit-offer-blocks">
        {offer.lines.map((line, i) => <li key={i} className="font-semibold">{line}</li>)}
      </ul>
      {/* THE WORDS SAY WHAT EACH BUTTON DOES (his walk, 27 Nov 2026: "Not today" read as losing the walk). */}
      <p className="mt-2 text-sm">Saved either way. Did this replace {offer.sessionFocus} today?</p>
      {error && <p className="mt-1 text-xs text-destructive" data-testid="circuit-offer-error">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={countIt} data-testid="circuit-offer-yes">
          {busy ? 'Saving…' : 'Yes, it replaced it'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={notToday} data-testid="circuit-offer-no">
          No, I&apos;ll still train
        </Button>
      </div>
    </InsightBanner>
  )
}
