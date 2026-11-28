import { useEffect, useRef, useState } from 'react'
import { Check, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LiveHeart } from '@/components/LiveHeart'
import { EffortBox } from '@/components/exercise/CardioSetRow'
import { WorkoutFigures, zonesFor } from '@/components/WorkoutFigures'
import { clockText, type BodyForEstimate } from '@/lib/activity-figures'
import {
  discardRecording, endRecording, gatherFigures, logRecording, looksForgotten, resumeRecording,
  useRecording, type GatheredFigures,
} from '@/lib/activity-recording'
import { effortForRpe, effortLabel, type EffortKey } from '@/lib/cardio-effort'
import { tracksSteps } from '@/lib/cardio-kinds'
import type { CardioLogView } from '@/lib/cardio-log-store'
import { estimatedMaxHeartRate, mostlyZone, ZONES, type HeartReading } from '@/lib/heart-series'
import { isPhoneApp } from '@/lib/steps-store'
import { pairedStrap, liveHeartSource, useLiveHeartRate } from '@/lib/strap-live'
import { startLiveSteps, useLiveSteps, useLiveStepsState } from '@/lib/live-steps'
import { useWatchCardioSteps } from '@/lib/watch-cardio-live'
import { readWatchHeart } from '@/lib/watch-workouts'
import { watchCardioKcalFor } from '@/lib/session-calories'

// ---------------------------------------------------------------------------
// A CARDIO WORKOUT BEING RECORDED (his request 25 Nov 2026; MOVED TO EXERCISE 27 Nov 2026 on his words: "it's under
// tools and it's different to logging workouts ... going to exercise, clicking start workout, choosing a workout ...
// and pressing start"). It is started from the Exercise day's own Start chooser (OwnWorkoutDay) and drawn there; this
// card is the workout once it has begun. Three states, and nothing at all when no recording is open:
//   recording  the name, a running clock, the live heart rate when a strap sends, End, and Cancel (which asks once)
//   ended      THE SUMMARY (WorkoutFigures: tiles, the heart rate graph, time in zones), then the effort. WITH A HEART
//              RATE (strap first, else the watch: readWatchHeart) the zone he spent longest in and one Log tap (his
//              26 Nov 2026 "why is it still easy steady or hard, it should be 5 heart rate zones"). WITHOUT ONE (no
//              reading, no age, or a health condition ticked) "How hard was it?" Easy / Steady / Hard, his ruling the
//              same day ("Keep Easy/Steady/Hard": nobody can tell a zone by feel). Keep going, Throw it away
//   logged     the same summary of what was saved, until he taps Done
// The figures are read once at End; a watch that has not synced yet is said, and filled in later on its own.
// ---------------------------------------------------------------------------

const cardStyle = { background: 'var(--surface-raised)', border: '1px solid rgba(var(--glow-rgb), .35)' }
const kicker = 'text-[0.625rem] font-semibold uppercase tracking-[.12em] text-primary-text'

interface Logged { view: CardioLogView; samples: HeartReading[]; start: Date; end: Date; name: string; zone: number | null }

function Title({ name }: { name: string }) {
  const words = name.split(/\s+/)
  return (
    <p className="mt-2 break-words text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]" data-record-title>
      {words.slice(0, -1).join(' ')}{words.length > 1 ? ' ' : ''}
      <span className="text-primary-text glow-text">{words[words.length - 1]}</span>
    </p>
  )
}

export function RecordActivityCard({ profileId, date, body, noHeartBands, onLogged }: {
  profileId: string
  date: string
  body: BodyForEstimate
  /** A health condition or pregnancy is ticked: heart rate is shown, never sorted into zones. */
  noHeartBands?: boolean
  /** A workout was logged: the day re-reads itself. */
  onLogged?: (view: CardioLogView) => void
}) {
  const rec = useRecording()
  const [now, setNow] = useState(() => Date.now())
  const [figures, setFigures] = useState<GatheredFigures | null>(null)
  const [reading, setReading] = useState(false)
  // Null until the heart readings have been read: the effort question waits for them, so a workout with a heart rate
  // is never shown Easy / Steady / Hard for the moment before its zone arrives.
  const [samples, setSamples] = useState<HeartReading[] | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState<Logged | null>(null)
  const phone = isPhoneApp()
  const liveBpm = useLiveHeartRate()
  const recordingStart = rec && !rec.endedAt ? rec.startedAt : null
  const phoneSteps = useLiveSteps(recordingStart)
  // THE WATCH'S COUNT FIRST (his report 28 Nov 2026, "The watch and phone steps disagree"): when the watch app is
  // recording this walk, the card shows the number on his wrist, never the phone's own sensor beside it.
  // Only while the watch is sending (its last count within a minute): a watch gone quiet hands the tile back.
  const watchSteps = useWatchCardioSteps(rec && !rec.endedAt ? rec.activity : null, recordingStart, now)
  const liveSteps = watchSteps ?? phoneSteps
  const stepsState = useLiveStepsState()
  // LIVE STEPS (his 27 Nov "steps if applicable"): counting from the phone's own step counter while a walk or run is
  // open, also after the app was closed and opened again mid-walk.
  const stepsWanted = !!(phone && recordingStart && rec && tracksSteps(rec.activity))
  useEffect(() => { if (stepsWanted && recordingStart) void startLiveSteps(recordingStart) }, [stepsWanted, recordingStart])
  // JUST STARTED: bring the clock into sight (the Start he pressed is further down the page). Only for a recording
  // begun in the last few seconds, so coming back to Exercise mid-walk does not jump the page.
  const top = useRef<HTMLDivElement>(null)
  const startedAt = rec?.startedAt ?? null
  useEffect(() => {
    if (startedAt && Date.now() - Date.parse(startedAt) < 4000) top.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [startedAt])

  // The clock ticks once a second while recording; nothing ticks otherwise.
  useEffect(() => {
    if (!rec || rec.endedAt) return
    setLogged(null)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [rec])

  // ENDED: read the phone for the window, once per End (also after an app restart with an ended recording waiting).
  const endedAt = rec?.endedAt ?? null
  useEffect(() => {
    if (!rec || !rec.endedAt) { setFigures(null); setSamples(null); return }
    let live = true
    setReading(true)
    setSamples(null)
    void gatherFigures(rec, body).then(f => { if (live) { setFigures(f); setReading(false) } })
    void readWatchHeart({ start: rec.startedAt, end: rec.endedAt }).then(s => { if (live) setSamples(s) }, () => { if (live) setSamples([]) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.startedAt, endedAt])

  const estimatedMax = noHeartBands ? null : estimatedMaxHeartRate(body.age)

  if (!rec) {
    if (!logged) return null
    const felt = effortForRpe(logged.view.intensity_rpe)
    return (
      <div data-record-card="logged" className="space-y-3.5 rounded-[20px] p-4" style={cardStyle}>
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className={kicker}>Your workout</span>
            <span className="flex items-center gap-1 text-[0.75rem] font-semibold text-primary-text"><Check className="size-3.5" aria-hidden /> Logged</span>
          </div>
          <Title name={logged.name} />
        </div>
        <WorkoutFigures
          minutes={logged.view.duration_minutes} km={logged.view.distance_km == null ? null : Number(logged.view.distance_km)} showPace={tracksSteps(logged.name)}
          kcal={logged.view.active_kcal ?? null} kcalEstimated={!!logged.view.kcal_estimated} steps={logged.view.steps ?? null}
          avgHeart={logged.view.avg_heart_rate ?? null} maxHeart={logged.view.max_heart_rate ?? null}
          samples={logged.samples} start={logged.start} end={logged.end} estimatedMax={estimatedMax}
        />
        <p className="flex items-start gap-1.5 rounded-[12px] bg-primary/10 px-3 py-2.5 text-[0.8125rem] leading-[1.45] text-primary-text" data-record-logged role="status">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Logged{logged.zone ? ` · mostly zone ${logged.zone}` : felt ? ` · felt ${effortLabel(felt)}` : ''}. It’s on your week and the coach can see it.</span>
        </p>
        {phone && logged.view.avg_heart_rate == null && (
          <p className="text-[0.71875rem] text-muted-foreground" data-record-heart-later>Heart rate fills in when your watch syncs.</p>
        )}
        <div className="-my-2 flex justify-end">
          <button type="button" className="min-h-11 px-1 text-[0.8125rem] font-semibold text-primary-text" onClick={() => setLogged(null)} data-record-done>Done</button>
        </div>
      </div>
    )
  }

  const name = rec.activity
  const onFoot = tracksSteps(name)

  if (!rec.endedAt) {
    return (
      <div ref={top} data-record-card="recording" className="rounded-[20px] p-4" style={cardStyle}>
        <span className={kicker}>Recording</span>
        <Title name={name} />
        <div data-record-clock className="tabular-mono mt-3 text-[3rem] font-bold leading-none tracking-[-.03em]">{clockText(now - Date.parse(rec.startedAt))}</div>
        {/* LIVE, WHILE IT RUNS (his words 27 Nov 2026: "While the exercise is running I should be able to see my heart
            rate and the zone and steps if applicable"). Heart rate is live only from a strap: a Galaxy Watch hands its
            readings to the phone late, so the line under it says where heart rate comes from. */}
        {phone && (
          <div className={`mt-3 grid gap-2 ${onFoot ? 'grid-cols-2' : 'grid-cols-1'}`} data-record-live>
            <div className="rounded-[12px] bg-muted/40 px-3 py-2">
              <p className="text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">Heart rate</p>
              <div className="mt-0.5 text-[1.125rem] font-semibold" data-record-live-heart>
                {liveBpm != null ? <LiveHeart className="text-foreground" estimatedMax={estimatedMax} /> : <span className="text-muted-foreground">–</span>}
              </div>
            </div>
            {onFoot && (
              <div className="rounded-[12px] bg-muted/40 px-3 py-2">
                <p className="text-[0.625rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">Steps</p>
                <p className="mt-0.5 tabular-mono text-[1.125rem] font-semibold" data-record-live-steps={liveSteps ?? ''}>
                  {liveSteps != null ? liveSteps.toLocaleString('en-GB') : <span className="text-muted-foreground">–</span>}
                </p>
              </div>
            )}
          </div>
        )}
        <p className="mt-2 text-[0.75rem] leading-[1.45] text-muted-foreground" data-record-what>
          {!phone
            ? 'Timed here. In the phone app it also picks up your steps and heart rate.'
            : liveBpm != null
            ? (liveHeartSource() === 'watch' ? 'Heart rate live from your watch.' : 'Heart rate live from your strap.')
            : pairedStrap()
            ? 'Your strap isn’t sending yet: check it’s on and the pads are damp. Your watch’s heart rate fills in when it syncs.'
            : 'Pair your strap for live heart rate: Profile, Steps from your phone, Heart rate strap. Your watch’s heart rate fills in when it syncs.'}
          {phone && onFoot && (watchSteps != null
            ? ' Steps live from your watch.'
            : stepsState === 'denied'
            ? ' Steps need "Physical activity" allowed for this app in your phone’s settings; they fill in from your watch when it syncs.'
            : stepsState === 'unavailable'
            ? ' This phone can’t count steps live; they fill in from your watch when it syncs.'
            : ' Steps count live while the phone is on you.')}
          {phone && !onFoot && ' Calories come from your watch or strap when you end it.'}
          {' '}It keeps going with the phone locked.
        </p>
        {confirmCancel ? (
          <div className="mt-3 space-y-2" data-record-cancel-confirm>
            <p className="text-sm">Throw this {name.toLowerCase()} away? Nothing is logged.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => { discardRecording(); setConfirmCancel(false) }} data-record-cancel-yes>Throw it away</Button>
              <Button className="min-h-11" onClick={() => setConfirmCancel(false)}>Keep recording</Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Button className="min-h-12 gap-1.5 text-[0.9375rem]" onClick={() => endRecording()} data-record-end><Square className="size-3.5 fill-current" aria-hidden />End workout</Button>
            <Button variant="outline" className="min-h-12" onClick={() => setConfirmCancel(true)} data-record-cancel>Cancel</Button>
          </div>
        )}
      </div>
    )
  }

  // ENDED: the summary, then one effort tap logs it.
  const forgotten = looksForgotten(rec)
  const start = new Date(rec.startedAt), end = new Date(rec.endedAt)
  const minutes = figures?.minutes ?? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
  // What is still to come from a watch that syncs late, heart rate included (27 Nov 2026: his Galaxy Watch walk).
  const missing = figures?.phoneRead ? [onFoot && figures.steps == null && 'steps', figures.avgHeartRate == null && 'heart rate', figures.kcal == null && 'calories'].filter(Boolean) as string[] : []
  const missingWords = missing.length <= 1 ? missing.join('') : `${missing.slice(0, -1).join(', ')} or ${missing[missing.length - 1]}`

  // THE ZONE, when the heart rate gives one: the zone the summary calls "mostly", from the same readings. The effort
  // stored is that zone's own word (zones 1-2 Easy, 3 Steady, 4-5 Hard: heart-series.ts ZONES), so the week and the
  // coach read it exactly as they read a tapped effort.
  const zone = samples ? mostlyZone(zonesFor({ samples, start, end, estimatedMax })) : null

  const log = (effort: EffortKey, byZone: number | null = null) => {
    if (!figures) return
    // The watch app's own count for this workout, when it ran it (27 Nov 2026: his walk had no calories).
    const view = logRecording({ profileId, date, recording: rec, figures, effort, watchKcal: rec.endedAt ? watchCardioKcalFor(rec.activity, rec.startedAt, rec.endedAt) : null })
    if (!view) { setError("That didn't save. Try again in a moment."); return }
    setLogged({ view, samples: samples ?? [], start, end, name, zone: byZone })
    onLogged?.(view)
  }

  return (
    <div data-record-card="ended" className="space-y-3.5 rounded-[20px] p-4" style={cardStyle}>
      <div>
        <span className={kicker}>Finished · {minutes} min</span>
        <Title name={name} />
      </div>
      {/* Until the phone has answered, "Reading": never a half-empty card that looks like no steps were taken. */}
      {reading || !figures || !samples ? (
        <p className="text-sm text-muted-foreground" data-record-reading>Reading your phone…</p>
      ) : (
        <>
          <div data-record-figures>
            <WorkoutFigures
              minutes={minutes} km={figures.distanceKm} showPace={onFoot} kcal={figures.kcal} kcalEstimated={figures.kcalEstimated} steps={figures.steps}
              avgHeart={figures.avgHeartRate} maxHeart={figures.maxHeartRate}
              samples={samples} start={start} end={end} estimatedMax={estimatedMax}
            />
          </div>
          {(figures.stepsFromWatch || figures.distanceFromWatch) && (
            <p className="text-[0.71875rem] text-muted-foreground" data-record-steps-watch>
              {figures.stepsFromWatch && figures.distanceFromWatch ? 'Steps and distance from your watch.' : figures.stepsFromWatch ? 'Steps from your watch.' : 'Distance from your watch.'}
            </p>
          )}
          {figures.stepsFromPhoneCounter && (
            <p className="text-[0.71875rem] text-muted-foreground" data-record-steps-counted>Steps counted by your phone while you moved.</p>
          )}
          {figures.kcalEstimated && (
            <p className="text-[0.71875rem] text-muted-foreground" data-record-estimate>Calories are an estimate from your heart rate, age and weight. A watch’s own figure replaces it if one arrives.</p>
          )}
          {missing.length > 0 && (
            <p className="text-[0.71875rem] text-muted-foreground" data-record-waiting>No {missingWords} on your phone for this yet. If your watch syncs later, they fill in on their own.</p>
          )}
          {!phone && <p className="text-[0.71875rem] text-muted-foreground">Steps, heart rate and calories are read in the phone app.</p>}
          {forgotten && <p className="text-[0.71875rem] text-[color:var(--role-warn-text)]" data-record-forgotten>That ran for over 6 hours. If you forgot to end it, throw it away.</p>}
          {zone ? (
            <div data-record-zone={zone}>
              <p className="mb-2 text-[0.9375rem] font-semibold">Mostly zone {zone} · {ZONES[zone - 1].word}</p>
              <Button className="min-h-12 w-full gap-1.5 text-[0.9375rem]" onClick={() => log(ZONES[zone - 1].effort, zone)} data-record-log>
                <Check className="size-3.5" aria-hidden />Log {name.toLowerCase()}
              </Button>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-[0.9375rem] font-semibold">How hard was it?</p>
              <EffortBox effort={null} onEffort={e => log(e)} subject={`the ${name.toLowerCase()}`} />
              <p className="mt-1.5 text-[0.71875rem] text-text-tertiary">One tap logs it.</p>
            </div>
          )}
        </>
      )}
      {error && <p className="text-[0.75rem] text-destructive" role="alert">{error}</p>}
      <div className="-my-2 flex justify-between">
        <button type="button" className="min-h-11 px-1 text-xs font-semibold text-primary-text" onClick={() => resumeRecording()} data-record-resume>Keep going</button>
        <button type="button" className="min-h-11 px-1 text-xs font-semibold text-muted-foreground" onClick={() => discardRecording()} data-record-discard>Throw it away</button>
      </div>
    </div>
  )
}

export default RecordActivityCard
