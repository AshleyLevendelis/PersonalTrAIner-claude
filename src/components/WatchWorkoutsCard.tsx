import { useCallback, useEffect, useState } from 'react'
import { Check, Watch } from 'lucide-react'
import { EffortBox } from '@/components/exercise/CardioSetRow'
import { WorkoutFigures, zonesFor } from '@/components/WorkoutFigures'
import type { BodyForEstimate } from '@/lib/activity-figures'
import { splitActivity } from '@/lib/cardio-lines'
import { effortForRpe, effortLabel, type EffortKey } from '@/lib/cardio-effort'
import type { CardioLogView } from '@/lib/cardio-log-store'
import { summariseHeartRate } from '@/lib/heart-strap'
import { estimatedMaxHeartRate, mostlyZone, type HeartReading } from '@/lib/heart-series'
import type { WatchWorkout } from '@/lib/health-steps'
import {
  countsSteps, dismissWatchWorkout, isPlannedKind, isStrengthWorkout, localDateOf, logWatchWorkout, readWatchHeart, readWatchOffers,
  watchActivityName, watchWhenLine, watchWorkoutMinutes,
} from '@/lib/watch-workouts'

// ---------------------------------------------------------------------------
// HOME, "From your watch" (his brief 26 Nov 2026; watch-workouts.ts). Drawn only when his watch recorded something the
// app does not hold. REDRAWN the same day on his word ("too simple, doesn't add any real value and doesn't fit the
// aesthetic of the rest of the app", with Garmin's and Apple's workout summaries beside it): the session hero's
// header (kicker, when, the name with its last word lit), the workout's figures as tiles, its heart rate as a graph
// and its time in heart rate zones (WorkoutFigures), and, on a day whose plan is a cardio session, THE PLAN BESIDE WHAT HE DID
// with a choice of what it counts as. One effort tap logs it; the card then stays as the summary of what was logged.
// "Not mine" puts it away for good. Loaded only in the phone app with the switch on.
// ---------------------------------------------------------------------------

const cardStyle = { background: 'var(--surface-raised)', border: '1px solid rgba(var(--glow-rgb), .35)' }
const kickerCls = 'text-[0.625rem] font-semibold uppercase tracking-[.12em]'

export interface PlannedToday { activity: string; minutes: number; rpe: number | null; done: boolean }

interface Logged { workout: WatchWorkout; view: CardioLogView; samples: HeartReading[]; effort: EffortKey; asPlan: string | null }

function Header({ workout, today, right, sub }: { workout: WatchWorkout; today: string; right?: React.ReactNode; sub?: React.ReactNode }) {
  const words = watchActivityName(workout.type).split(/\s+/)
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className={`flex items-center gap-1.5 whitespace-nowrap text-primary-text ${kickerCls}`}>
          <Watch className="size-3.5" aria-hidden /> From your watch
        </span>
        <span className="shrink-0 whitespace-nowrap text-[0.75rem] text-text-tertiary" data-watch-when>{right ?? watchWhenLine(workout, today)}</span>
      </div>
      <p className="mt-2 break-words text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]" data-watch-title>
        {words.slice(0, -1).join(' ')}{words.length > 1 ? ' ' : ''}
        <span className="text-primary-text glow-text">{words[words.length - 1]}</span>
      </p>
      {sub}
    </div>
  )
}

export function WatchWorkoutsCard({ profileId, today, body, planned, noHeartBands, onLogged }: {
  profileId: string
  today: string
  body: BodyForEstimate
  /** Today's planned cardio session, when the day is one. */
  planned?: PlannedToday | null
  /** A health condition or pregnancy is ticked: heart rate is shown, never sorted into effort (his 14 Nov ruling). */
  noHeartBands?: boolean
  /** A workout was logged: Home re-reads its day. */
  onLogged: () => void
}) {
  const [offers, setOffers] = useState<WatchWorkout[]>([])
  const [heart, setHeart] = useState<{ id: string; samples: HeartReading[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState<Logged | null>(null)
  /** What he chose it counts as, per workout; unset means the default below. */
  const [countAs, setCountAs] = useState<{ id: string; plan: boolean } | null>(null)

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

  const offer = logged ? null : offers[0] ?? null
  const offerId = offer?.id ?? null
  const offerStart = offer?.start ?? null, offerEnd = offer?.end ?? null
  useEffect(() => {
    if (!offerId || !offerStart || !offerEnd) return
    let live = true
    void readWatchHeart({ start: offerStart, end: offerEnd }).then(samples => { if (live) setHeart({ id: offerId, samples }) })
    return () => { live = false }
  }, [offerId, offerStart, offerEnd])

  if (!offer && !logged) return null
  // NO ZONES FOR LIFTING (CSCS, mine): heart rate between sets says little about how hard a lift was (the work is
  // short and the pulse lags it), so a strength session shows its heart rate and is never sorted into zones.
  const shown = logged?.workout ?? offer!
  const estimatedMax = noHeartBands || isStrengthWorkout(shown.type) ? null : estimatedMaxHeartRate(body.age)

  // ---- The summary of what was just logged -------------------------------
  if (logged) {
    const { workout: w, view, samples } = logged
    const start = new Date(w.start), end = new Date(w.end)
    const more = offers.filter(o => o.id !== w.id).length
    return (
      <div data-watch-card="logged" className="space-y-3.5 rounded-[20px] p-4" style={cardStyle}>
        <Header workout={w} today={today} right={<span className="flex items-center gap-1 font-semibold text-primary-text"><Check className="size-3.5" aria-hidden /> Logged</span>} />
        <WorkoutFigures
          minutes={view.duration_minutes} km={view.distance_km == null ? null : Number(view.distance_km)} showPace={!isStrengthWorkout(w.type)}
          kcal={view.active_kcal ?? null} kcalEstimated={!!view.kcal_estimated} steps={view.steps ?? null}
          avgHeart={view.avg_heart_rate ?? null} maxHeart={view.max_heart_rate ?? null}
          samples={samples} start={start} end={end} estimatedMax={estimatedMax}
        />
        <p className="flex items-start gap-1.5 rounded-[12px] bg-primary/10 px-3 py-2.5 text-[0.8125rem] leading-[1.45] text-primary-text" data-watch-logged role="status">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {logged.asPlan ? `Counted as today’s ${logged.asPlan}` : 'Logged as extra work'} · felt {effortLabel(logged.effort)}. It’s on your week and the coach can see it.
          </span>
        </p>
        <div className="-my-2 flex justify-end">
          <button type="button" className="min-h-11 px-1 text-[0.8125rem] font-semibold text-primary-text" onClick={() => setLogged(null)} data-watch-close>
            {more > 0 ? `Next from your watch (${more})` : 'Done'}
          </button>
        </div>
      </div>
    )
  }

  // ---- The offer ----------------------------------------------------------
  const w = offer!
  const name = watchActivityName(w.type)
  const start = new Date(w.start), end = new Date(w.end)
  const minutes = watchWorkoutMinutes(w)
  const km = w.distanceM != null && w.distanceM > 0 ? Math.round(w.distanceM / 10) / 100 : null
  const samples = heart?.id === w.id ? heart.samples : []
  const figure = summariseHeartRate(samples as { bpm: number; at: string }[], start, end)
  const strength = isStrengthWorkout(w.type)
  // THE PLAN BESIDE IT: only for today's own session, still to do, and never for a strength workout.
  const plan = planned && !planned.done && !strength && localDateOf(w.start) === today ? planned : null
  const planName = plan ? splitActivity(plan.activity).name : null
  const asPlan = plan ? (countAs?.id === w.id ? countAs.plan : isPlannedKind(w.type, plan.activity)) : false
  const planEffort = plan ? effortForRpe(plan.rpe) : null
  const mostly = mostlyZone(zonesFor({ samples, start, end, estimatedMax }))

  const log = async (effort: EffortKey) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const view = await logWatchWorkout({ profileId, workout: w, effort, body, asPlanned: asPlan && plan ? { activity: plan.activity, targetRpe: plan.rpe } : null })
    setBusy(false)
    if (!view) { setError("That didn't save. Try again in a moment."); return }
    setLogged({ workout: w, view, samples, effort, asPlan: asPlan ? planName : null })
    // Its start is now on a cardio log, so the next read no longer offers it; drop it from this list at once.
    setOffers(list => list.filter(o => o.id !== w.id))
    onLogged()
  }

  const dismiss = () => {
    dismissWatchWorkout(w.id)
    setOffers(list => list.filter(o => o.id !== w.id))
  }

  const choice = (on: boolean) => `min-h-11 flex-1 rounded-[10px] px-2 text-[0.8125rem] transition-colors ${on ? 'bg-primary/20 font-semibold text-primary-text' : 'text-muted-foreground'}`

  return (
    <div data-watch-card="offer" className="space-y-3.5 rounded-[20px] p-4" style={cardStyle}>
      <Header workout={w} today={today} sub={
        <p className="mt-1.5 text-[0.8125rem] leading-[1.45] text-muted-foreground" data-watch-offer={w.id}>
          {w.source || 'Recorded on your watch'}
          {offers.length > 1 && <span data-watch-more> · {offers.length - 1} more after this</span>}
        </p>
      } />
      <WorkoutFigures
        minutes={minutes} km={km} showPace={!strength && countsSteps(w.type)}
        kcal={w.kcal != null && w.kcal > 0 ? w.kcal : null}
        avgHeart={figure?.avg ?? null} maxHeart={figure?.max ?? null}
        samples={samples} start={start} end={end} estimatedMax={estimatedMax}
      />
      {plan && (
        <div className="rounded-[14px] border border-[color:var(--hairline)] px-3 py-3" data-watch-plan>
          <span className={`text-muted-foreground ${kickerCls}`}>Today’s plan</span>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem]">
            <span className="text-text-tertiary">Planned</span>
            <span className="text-foreground" data-watch-plan-planned>{[planName, `${plan.minutes} min`, planEffort ? effortLabel(planEffort) : null].filter(Boolean).join(' · ')}</span>
            <span className="text-text-tertiary">You did</span>
            <span className="text-foreground" data-watch-plan-did>{[name, `${minutes} min`, mostly ? `♥ mostly zone ${mostly}` : null].filter(Boolean).join(' · ')}</span>
          </div>
          <div role="radiogroup" aria-label="What this workout counts as" className="mt-3 flex gap-1 rounded-[12px] bg-[color:var(--surface-deep)] p-1">
            <button type="button" role="radio" aria-checked={asPlan} className={choice(asPlan)} onClick={() => setCountAs({ id: w.id, plan: true })} data-watch-count="plan">Today’s session</button>
            <button type="button" role="radio" aria-checked={!asPlan} className={choice(!asPlan)} onClick={() => setCountAs({ id: w.id, plan: false })} data-watch-count="extra">Extra work</button>
          </div>
        </div>
      )}
      {strength && (
        <p className="text-[0.75rem] leading-[1.45] text-muted-foreground" data-watch-strength>
          This logs the time and your heart rate. To keep the exercises and weights too, use “Log a workout you did” on Exercise instead.
        </p>
      )}
      <div>
        <p className="mb-2 text-[0.9375rem] font-semibold">How hard did it feel?</p>
        <EffortBox effort={null} onEffort={e => void log(e)} subject={`the ${name.toLowerCase()}`} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.71875rem] text-text-tertiary">{busy ? <span data-watch-busy>Reading your phone…</span> : `One tap logs it${plan ? (asPlan ? ` as today’s ${planName}` : ' as extra work') : ''}.`}</p>
          <button type="button" className="min-h-11 shrink-0 px-1 text-xs font-semibold text-muted-foreground" onClick={dismiss} data-watch-dismiss>Not mine</button>
        </div>
        {error && <p className="text-[0.75rem] text-destructive" role="alert" data-watch-error>{error}</p>}
      </div>
    </div>
  )
}
