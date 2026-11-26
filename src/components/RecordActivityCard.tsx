import { useEffect, useState } from 'react'
import { Check, Footprints, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LiveHeart } from '@/components/LiveHeart'
import { EffortBox } from '@/components/exercise/CardioSetRow'
import { WorkoutFigures, zonesFor } from '@/components/WorkoutFigures'
import { activityFiguresLine, clockText, type BodyForEstimate } from '@/lib/activity-figures'
import {
  RECORDING_NAMES, discardRecording, endRecording, gatherFigures, logRecording, looksForgotten, resumeRecording,
  startRecording, useRecording, type GatheredFigures, type RecordingKind,
} from '@/lib/activity-recording'
import { cardioReadback, heartLine, type EffortKey } from '@/lib/cardio-effort'
import { estimatedMaxHeartRate, mostlyZone, ZONES, type HeartReading } from '@/lib/heart-series'
import { readWatchHeart } from '@/lib/watch-workouts'
import { isPhoneApp } from '@/lib/steps-store'

// ---------------------------------------------------------------------------
// EXERCISE, under today: "Record a walk or run" (his request 25 Nov 2026; activity-recording.ts). On Exercise, not
// Tools, since his 26 Nov "start a walk shouldn't be in tools it should be in exercise". Three states, one card:
//   idle       Start walk / Start run
//   recording  the clock, the live heart rate when a strap sends, End, and Cancel (which asks once)
//   ended      what the phone read for the window, then the effort. WITH HEART RATE (strap first, else the watch:
//              readWatchHeart) the zone he spent longest in and one Log tap (his 26 Nov "it should be 5 heart rate
//              zones"). WITHOUT ONE (no reading, no age, or a condition ticked) "How hard was it?" Easy / Steady / Hard,
//              his ruling the same day ("Keep Easy/Steady/Hard": nobody can tell a zone by feel). Keep going, Throw away.
// The ended state is THE SUMMARY (26 Nov 2026, his "too simple" on the watch card; WorkoutFigures): the figures as
// tiles, the heart rate as a graph and time in zones, the same drawing a watch workout gets on Home.
// The figures are read once at End; a watch that has not synced yet is said, and filled in later on its own.
// ---------------------------------------------------------------------------

const cardStyle = { background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }

export function RecordActivityCard({ profileId, date, body, noHeartBands, onLogged }: {
  profileId: string
  date: string
  body: BodyForEstimate
  /** A health condition or pregnancy is ticked: heart rate is shown, never sorted into effort. */
  noHeartBands?: boolean
  /** The read-back line for the screen's "Logged" banner. */
  onLogged: (line: string) => void
}) {
  const rec = useRecording()
  const [now, setNow] = useState(() => Date.now())
  const [figures, setFigures] = useState<GatheredFigures | null>(null)
  const [reading, setReading] = useState(false)
  // Null until the heart readings have been read: the effort question waits for them, so a walk with heart rate is
  // never shown Easy / Steady / Hard for the moment before its zone arrives.
  const [samples, setSamples] = useState<HeartReading[] | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // THE LOGGED LINE SITS ON THE CARD, where the effort was tapped: the page's own banner is at the top, off screen.
  const [logged, setLogged] = useState<string | null>(null)
  const phone = isPhoneApp()

  // The clock ticks once a second while recording; nothing ticks otherwise.
  useEffect(() => {
    if (!rec || rec.endedAt) return
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

  const start = (kind: RecordingKind) => { setError(null); setLogged(null); void startRecording(kind) }

  if (!rec) {
    return (
      <div data-record-card="idle" className="rounded-[20px] p-4" style={cardStyle}>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--chart-2) 14%, transparent)', color: 'var(--role-ai-label)' }}>
            <Footprints className="size-[17px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-medium">Record a walk or run</span>
            <span className="mt-0.5 block text-[0.71875rem] leading-[1.3] text-muted-foreground">
              {phone
                ? 'Start, go, End. Steps, distance and calories come from your phone and watch, heart rate from your strap or watch.'
                : 'Start, go, End, and it’s logged. In the phone app it also reads your steps, distance and calories.'}
            </span>
          </span>
        </div>
        {logged && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-primary/10 px-2.5 py-2 text-[0.8125rem] text-primary-text" data-record-logged role="status">
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{logged}. It’s on your week and the coach can see it.</span>
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button className="min-h-11 gap-1.5" onClick={() => start('walk')} data-record-start="walk"><Play className="size-3.5 fill-current" aria-hidden />Start walk</Button>
          <Button className="min-h-11 gap-1.5" onClick={() => start('run')} data-record-start="run"><Play className="size-3.5 fill-current" aria-hidden />Start run</Button>
        </div>
      </div>
    )
  }

  const name = RECORDING_NAMES[rec.kind]

  if (!rec.endedAt) {
    return (
      <div data-record-card="recording" className="rounded-[20px] p-4" style={{ ...cardStyle, border: '1px solid rgba(var(--glow-rgb), .35)' }}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--primary-text)' }}>Recording · {name}</span>
          <LiveHeart className="text-sm text-foreground" />
        </div>
        <div data-record-clock className="tabular-mono mt-2 text-[2.5rem] font-bold leading-none tracking-[-.03em]">{clockText(now - Date.parse(rec.startedAt))}</div>
        <p className="mt-1.5 text-[0.71875rem] text-muted-foreground">Keeps recording with the phone locked or the app closed. Tap End when you stop.</p>
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
            <Button className="min-h-11 gap-1.5" onClick={() => endRecording()} data-record-end><Square className="size-3.5 fill-current" aria-hidden />End {name.toLowerCase()}</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setConfirmCancel(true)} data-record-cancel>Cancel</Button>
          </div>
        )}
      </div>
    )
  }

  // ENDED: the figures, then one effort tap logs it.
  const forgotten = looksForgotten(rec)
  const minutes = figures?.minutes ?? Math.max(1, Math.round((Date.parse(rec.endedAt) - Date.parse(rec.startedAt)) / 60000))
  const missing = figures?.phoneRead ? [figures.steps == null && 'steps', figures.kcal == null && 'calories'].filter(Boolean) as string[] : []

  // THE ZONE, when the heart rate gives one: the zone the summary below calls "mostly", from the same readings. The
  // effort stored is that zone's own word (zones 1-2 Easy, 3 Steady, 4-5 Hard: heart-series.ts ZONES), so the week and
  // the coach read it exactly as they read a tapped effort.
  const winStart = new Date(rec.startedAt), winEnd = new Date(rec.endedAt)
  const estimatedMax = noHeartBands ? null : estimatedMaxHeartRate(body.age)
  const zone = samples ? mostlyZone(zonesFor({ samples, start: winStart, end: winEnd, estimatedMax })) : null

  const log = (effort: EffortKey, byZone: number | null = null) => {
    if (!figures) return
    const view = logRecording({ profileId, date, recording: rec, figures, effort })
    if (!view) { setError("That didn't save — try again in a moment."); return }
    const extra = activityFiguresLine(view)
    const hr = heartLine(view.avg_heart_rate, view.max_heart_rate)
    const said = byZone
      ? cardioReadback({ activity: name, minutes: view.duration_minutes, shape: `${view.duration_minutes} min · Zone ${byZone}`, distanceKm: figures.distanceKm })
      : cardioReadback({ activity: name, minutes: view.duration_minutes, rpe: view.intensity_rpe, distanceKm: figures.distanceKm })
    const line = [said, extra, hr].filter(Boolean).join(' · ')
    setLogged(line)
    onLogged(line)
  }

  return (
    <div data-record-card="ended" className="rounded-[20px] p-4" style={{ ...cardStyle, border: '1px solid rgba(var(--glow-rgb), .35)' }}>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--primary-text)' }}>{name} · {minutes} min</span>
      {/* Until the phone has answered, "Reading": never a half-empty card that looks like no steps were taken. */}
      {reading || !figures || !samples ? (
        <p className="mt-3 text-sm text-muted-foreground" data-record-reading>Reading your phone…</p>
      ) : (
        <>
          <div className="mt-3" data-record-figures>
            <WorkoutFigures
              minutes={minutes} km={figures.distanceKm} showPace kcal={figures.kcal} kcalEstimated={figures.kcalEstimated} steps={figures.steps}
              avgHeart={figures.avgHeartRate} maxHeart={figures.maxHeartRate}
              samples={samples} start={winStart} end={winEnd}
              estimatedMax={estimatedMax}
            />
          </div>
          {figures?.kcalEstimated && (
            <p className="mt-1.5 text-[0.71875rem] text-muted-foreground" data-record-estimate>Calories are an estimate from your heart rate, age and weight. A watch’s own figure replaces it if one arrives.</p>
          )}
          {missing.length > 0 && (
            <p className="mt-1.5 text-[0.71875rem] text-muted-foreground" data-record-waiting>No {missing.join(' or ')} on your phone for this yet. If your watch syncs later, they fill in on their own.</p>
          )}
          {!phone && <p className="mt-1.5 text-[0.71875rem] text-muted-foreground">Steps and calories are read in the phone app.</p>}
          {forgotten && <p className="mt-1.5 text-[0.71875rem] text-[color:var(--role-warn-text)]" data-record-forgotten>That ran for over 6 hours. If you forgot to end it, throw it away.</p>}
          {zone ? (
            <div className="mt-3" data-record-zone={zone}>
              <p className="mb-1.5 text-sm font-medium">Mostly zone {zone} · {ZONES[zone - 1].word}</p>
              <Button className="min-h-11 w-full gap-1.5" onClick={() => log(ZONES[zone - 1].effort, zone)} data-record-log>
                <Check className="size-3.5" aria-hidden />Log {name.toLowerCase()}
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-3 mb-1.5 text-sm font-medium">How hard was it?</p>
              <EffortBox effort={null} onEffort={log} subject={`the ${name.toLowerCase()}`} />
            </>
          )}
        </>
      )}
      {error && <p className="mt-1 text-[0.625rem] text-destructive">{error}</p>}
      <div className="mt-2 flex justify-between">
        <button type="button" className="min-h-11 px-1 text-xs font-semibold text-primary-text" onClick={() => resumeRecording()} data-record-resume>Keep going</button>
        <button type="button" className="min-h-11 px-1 text-xs font-semibold text-muted-foreground" onClick={() => discardRecording()} data-record-discard>Throw it away</button>
      </div>
    </div>
  )
}
