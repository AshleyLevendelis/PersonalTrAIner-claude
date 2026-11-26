import { useEffect, useState, useSyncExternalStore } from 'react'
import { Footprints, Heart, X } from 'lucide-react'
import { EFFORTS, cardioReadback, rpeToStore, type EffortKey } from '@/lib/cardio-effort'
import { isHealthStepsConnected } from '@/lib/steps-store'
import { isHealthHeartConnected } from '@/lib/health-heart'
import { pairedStrap, useLiveHeartRate } from '@/lib/strap-live'
import {
  activeWalk, discardWalk, finishWalk, liveWalkSteps, refreshStoreSteps, saveWalk, startCountingSteps, startWalk, subscribeWalk,
  walkCongratulations, WALK_ACTIVITY, WALK_KEY,
} from '@/lib/walk-session'

/** How often the live screen asks the phone's health store for the walk's steps. */
const STORE_POLL_MS = 30000

// ---------------------------------------------------------------------------
// THE WALK SCREEN (his request 26 Nov 2026, walk-session.ts): opening it starts the walk at once, the clock running,
// steps ticking up from the phone's sensor and the strap's heart rate live. Finish shows his congratulations with the
// walk's own numbers and asks how it felt; that tap saves it. Closing the screen does not end the walk: it keeps
// counting, and the day's card says so with a Continue.
// ---------------------------------------------------------------------------
export default function WalkSheet({ profileId, date, dayLabel, onClose }: { profileId: string; date: string; dayLabel: string; onClose: () => void }) {
  const walk = useSyncExternalStore(subscribeWalk, readWalk, readWalk)
  const [sensorOn, setSensorOn] = useState<boolean | null>(null)
  const [, tick] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const bpm = useLiveHeartRate()

  // Opening the screen IS the start: one tap from the day's card, nothing more to press.
  useEffect(() => {
    const w = activeWalk()
    if (!w || w.userId !== profileId) startWalk(profileId, date)
    if (activeWalk()?.result) return
    let alive = true
    void startCountingSteps().then(on => { if (alive) setSensorOn(on) })
    void refreshStoreSteps()
    const poll = window.setInterval(() => void refreshStoreSteps(), STORE_POLL_MS)
    const clock = window.setInterval(() => tick(n => n + 1), 1000)
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(clock) }
  }, [profileId, date])

  const finish = async () => {
    setFinishing(true)
    await finishWalk()
    setFinishing(false)
  }
  const choose = (e: EffortKey) => {
    const r = activeWalk()?.result
    const view = saveWalk(e)
    if (view && r) setSaved(`✓ ${cardioReadback({ activity: WALK_ACTIVITY, minutes: r.minutes, rpe: rpeToStore(e), steps: r.steps })}`)
  }
  const end = async () => { await discardWalk(); onClose() }

  const result = walk?.result ?? null
  const steps = walk && !result ? liveWalkSteps(walk) : null
  const stepsKnown = sensorOn || isHealthStepsConnected()
  const heartFromWatch = isHealthHeartConnected() && !pairedStrap()

  return (
    <div role="dialog" aria-modal="true" aria-label="Walk" data-testid="walk-sheet"
      className="fixed inset-0 z-[80] overflow-y-auto bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto max-w-[520px] px-[22px] pt-4 pb-8">
        <div className="flex items-center justify-between">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[.2em] text-primary-text" data-testid="walk-kicker">Walk · {dayLabel}</span>
          <button type="button" aria-label="Close" data-testid="walk-close" onClick={onClose} className="flex size-11 items-center justify-center rounded-full">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {saved ? (
          <div className="mt-6" data-testid="walk-saved">
            <h1 className="text-[1.75rem] font-bold tracking-[-.02em]">Saved</h1>
            <p className="mt-2 text-[0.9375rem]" data-testid="walk-readback">{saved}</p>
            <button type="button" data-testid="walk-done" onClick={onClose}
              className="mt-8 h-[56px] w-full rounded-[18px] text-[1rem] font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Done</button>
          </div>
        ) : result ? (
          <div className="mt-6" data-testid="walk-result">
            <h1 className="text-[1.75rem] font-bold tracking-[-.02em]">Nice walk</h1>
            <p className="mt-2 text-[1rem] leading-snug" data-testid="walk-summary">{walkCongratulations(result)}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Figure label="Steps" value={result.steps != null ? result.steps.toLocaleString('en-GB') : '—'} testid="walk-final-steps" />
              <Figure label="Time" value={`${result.minutes} min`} testid="walk-final-time" />
              <Figure label="Avg heart rate" value={result.avgHeartRate != null ? String(result.avgHeartRate) : '—'} testid="walk-final-avg" />
              <Figure label="Highest" value={result.maxHeartRate != null ? String(result.maxHeartRate) : '—'} testid="walk-final-max" />
            </div>
            {result.avgHeartRate == null && heartFromWatch && (
              <p className="mt-2 text-[0.8125rem] text-muted-foreground" data-testid="walk-heart-later">Your watch's heart rate fills in once it reaches your phone.</p>
            )}
            <p className="ds-label-compact mt-6 mb-2">How did it feel? Tap to save</p>
            <div className="grid grid-cols-3 gap-2">
              {EFFORTS.map(e => (
                <button key={e.key} type="button" data-testid={`walk-effort-${e.key}`} onClick={() => choose(e.key)}
                  className="flex min-h-[64px] flex-col items-center justify-center rounded-2xl border bg-card px-2 text-center">
                  <span className="text-[0.9375rem] font-semibold">{e.label}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">{e.note}</span>
                </button>
              ))}
            </div>
            <DiscardLink confirm={confirmEnd} setConfirm={setConfirmEnd} onEnd={end} words="Don't save this walk" />
          </div>
        ) : (
          <div className="mt-6" data-testid="walk-live">
            <h1 className="text-[1.75rem] font-bold tracking-[-.02em]">Walk</h1>
            <p className="mt-6 text-center tabular-mono text-[3.5rem] font-bold leading-none" data-testid="walk-clock">
              {walk ? clock(walk.startedAt) : '0:00'}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-card p-4 text-center" data-testid="walk-steps-tile">
                <Footprints className="mx-auto size-5 text-primary-text" aria-hidden />
                <p className="mt-1 tabular-mono text-[1.75rem] font-bold" data-testid="walk-steps">{steps != null ? steps.toLocaleString('en-GB') : stepsKnown ? '0' : '—'}</p>
                <p className="text-[0.75rem] text-muted-foreground">steps</p>
              </div>
              <div className="rounded-2xl bg-card p-4 text-center" data-testid="walk-heart-tile">
                <Heart className="mx-auto size-5 text-primary-text" aria-hidden />
                <p className="mt-1 tabular-mono text-[1.75rem] font-bold" data-testid="walk-heart" data-live-heart={bpm ?? undefined}>{bpm ?? '—'}</p>
                <p className="text-[0.75rem] text-muted-foreground">{heartFromWatch ? 'from your watch at the end' : 'heart rate'}</p>
              </div>
            </div>
            {sensorOn === false && (
              <p className="mt-3 text-[0.8125rem] text-muted-foreground" data-testid="walk-steps-note">
                {isHealthStepsConnected()
                  ? "Steps come from your phone's health app here, so they can trail by a minute or two."
                  : "This phone isn't counting steps for the app. Switch on Steps from your phone on Profile."}
              </p>
            )}
            <button type="button" data-testid="walk-finish" disabled={finishing} onClick={() => void finish()}
              className="mt-8 h-[56px] w-full rounded-[18px] text-[1rem] font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 10px 30px rgba(var(--glow-rgb), .35)' }}>
              {finishing ? 'Finishing…' : 'Finish walk'}
            </button>
            <DiscardLink confirm={confirmEnd} setConfirm={setConfirmEnd} onEnd={end} words="End without saving" />
          </div>
        )}
      </div>
    </div>
  )
}

function readWalk() { return activeWalkSnapshot() }
// useSyncExternalStore needs the same object back while nothing changed, so the parsed walk is cached on its text.
let lastRaw: string | null = null
let lastWalk: ReturnType<typeof activeWalk> = null
function activeWalkSnapshot() {
  let raw: string | null = null
  try { raw = localStorage.getItem(WALK_KEY) } catch { raw = null }
  if (raw !== lastRaw) { lastRaw = raw; lastWalk = activeWalk() }
  return lastWalk
}

function clock(startedAt: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function Figure({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[.14em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 tabular-mono text-[1.375rem] font-bold" data-testid={testid}>{value}</p>
    </div>
  )
}

function DiscardLink({ confirm, setConfirm, onEnd, words }: { confirm: boolean; setConfirm: (v: boolean) => void; onEnd: () => void; words: string }) {
  if (!confirm) {
    return <button type="button" data-testid="walk-discard" onClick={() => setConfirm(true)} className="mt-4 min-h-11 w-full text-[0.8125rem] text-muted-foreground">{words}</button>
  }
  return (
    <div className="mt-4 rounded-2xl bg-[color:var(--surface-deep)] p-3 text-center" data-testid="walk-discard-confirm">
      <p className="text-[0.875rem]">End this walk without saving it?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" data-testid="walk-discard-keep" onClick={() => setConfirm(false)} className="min-h-11 rounded-xl border text-[0.875rem] font-semibold">Keep it</button>
        <button type="button" data-testid="walk-discard-yes" onClick={onEnd} className="min-h-11 rounded-xl text-[0.875rem] text-muted-foreground">End, don't save</button>
      </div>
    </div>
  )
}

