import { useCallback, useEffect, useState } from 'react'
import { Check, Watch } from 'lucide-react'
import { EffortBox } from '@/components/exercise/CardioSetRow'
import { activityFiguresLine, type BodyForEstimate } from '@/lib/activity-figures'
import { cardioReadback, heartLine, type EffortKey } from '@/lib/cardio-effort'
import type { WatchWorkout } from '@/lib/health-steps'
import {
  dismissWatchWorkout, isStrengthWorkout, logWatchWorkout, readWatchOffers, watchActivityName, watchWhenLine,
  watchWorkoutMinutes,
} from '@/lib/watch-workouts'

// ---------------------------------------------------------------------------
// HOME, "From your watch" (his brief 26 Nov 2026; watch-workouts.ts). Drawn only when his watch recorded something the
// app does not hold: one workout at a time, what the watch says about it, and "How hard was it?", where one tap logs
// it. "Not mine" puts it away for good. Nothing is drawn while there is nothing to offer, so Home is not longer for
// anyone who has no watch. Loaded only in the phone app with the switch on.
// ---------------------------------------------------------------------------

const cardStyle = { background: 'var(--surface-raised)', border: '1px solid rgba(var(--glow-rgb), .35)' }

export function WatchWorkoutsCard({ profileId, today, body, onLogged }: {
  profileId: string
  today: string
  body: BodyForEstimate
  /** A workout was logged: Home re-reads its day. */
  onLogged: () => void
}) {
  const [offers, setOffers] = useState<WatchWorkout[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void readWatchOffers(profileId, today).then(setOffers)
  }, [profileId, today])

  // When Home opens and when the app comes back to the front, the moments the watch has usually just synced.
  useEffect(() => {
    refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const offer = offers[0] ?? null
  if (!offer && !logged) return null

  const log = async (effort: EffortKey) => {
    if (!offer || busy) return
    setBusy(true)
    setError(null)
    const view = await logWatchWorkout({ profileId, workout: offer, effort, body })
    setBusy(false)
    if (!view) { setError("That didn't save. Try again in a moment."); return }
    const line = [
      cardioReadback({ activity: view.activity_name, minutes: view.duration_minutes, rpe: view.intensity_rpe, distanceKm: view.distance_km ?? null }),
      activityFiguresLine(view), heartLine(view.avg_heart_rate, view.max_heart_rate),
    ].filter(Boolean).join(' · ')
    setLogged(line)
    // Its start is now on a cardio log, so the next read no longer offers it; drop it from this list at once.
    setOffers(list => list.filter(w => w.id !== offer.id))
    onLogged()
  }

  const dismiss = () => {
    if (!offer) return
    dismissWatchWorkout(offer.id)
    setOffers(list => list.filter(w => w.id !== offer.id))
  }

  const name = offer ? watchActivityName(offer.type) : ''
  const facts = offer ? [
    `${watchWorkoutMinutes(offer)} min`,
    offer.distanceM != null && offer.distanceM > 0 ? `${Math.round(offer.distanceM / 10) / 100} km` : null,
    offer.kcal != null && offer.kcal > 0 ? `${Math.round(offer.kcal)} kcal` : null,
  ].filter(Boolean).join(' · ') : ''

  return (
    <div data-watch-card={offer ? 'offer' : 'logged'} className="rounded-[20px] p-4" style={cardStyle}>
      <div className="flex items-center gap-2">
        <Watch className="size-[15px]" style={{ color: 'var(--primary-text)' }} aria-hidden />
        <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--primary-text)' }}>From your watch</span>
        {offers.length > 1 && <span className="ml-auto text-[0.6875rem] text-muted-foreground" data-watch-more>{offers.length - 1} more after this</span>}
      </div>
      {logged && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-primary/10 px-2.5 py-2 text-[0.8125rem] text-primary-text" data-watch-logged role="status">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{logged}. It’s on your week and the coach can see it.</span>
        </p>
      )}
      {offer && (
        <>
          <p className="mt-2 text-[1.0625rem] font-semibold leading-tight" data-watch-offer={offer.id}>{name} · <span className="tabular-mono">{facts}</span></p>
          <p className="mt-0.5 text-[0.75rem] text-muted-foreground" data-watch-when>
            {watchWhenLine(offer, today)}{offer.source ? ` · ${offer.source}` : ''}
          </p>
          {isStrengthWorkout(offer.type) && (
            <p className="mt-1.5 text-[0.71875rem] leading-[1.35] text-muted-foreground" data-watch-strength>
              This logs the time and your heart rate. To keep the exercises and weights too, use “Log a workout you did” on Exercise instead.
            </p>
          )}
          <p className="mt-3 mb-1.5 text-sm font-medium">How hard was it?</p>
          <EffortBox effort={null} onEffort={e => void log(e)} subject={`the ${name.toLowerCase()}`} />
          {busy && <p className="mt-1 text-[0.71875rem] text-muted-foreground" data-watch-busy>Reading your phone…</p>}
          {error && <p className="mt-1 text-[0.75rem] text-destructive" role="alert" data-watch-error>{error}</p>}
          <div className="mt-1 flex justify-end">
            <button type="button" className="min-h-11 px-1 text-xs font-semibold text-muted-foreground" onClick={dismiss} data-watch-dismiss>Not mine</button>
          </div>
        </>
      )}
    </div>
  )
}
