import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { connectHealthHeart, disconnectHealthHeart, isHealthHeartConnected } from '@/lib/health-heart'
import { connectWatchWorkouts, disconnectWatchWorkouts, isWatchWorkoutsConnected } from '@/lib/watch-workouts'
import { connectHealthSleep, disconnectHealthSleep, isHealthSleepConnected } from '@/lib/health-sleep'
import { connectPairedStrap, forgetStrap, pairStrap, pairedStrap, useLiveHeartRate, useStrapState, type PairedStrap } from '@/lib/strap-live'
import {
  connectHealthSteps, disconnectHealthSteps, healthStoreName, isHealthStepsConnected,
  type HealthPlatform,
} from '@/lib/health-steps'

// ---------------------------------------------------------------------------
// Profile, "Steps from your phone" (20 Nov 2026). Drawn only inside the phone app: a browser cannot read the phone's
// step counter, and a switch that can never work is not offered. Nothing is asked of the phone until he taps.
// ---------------------------------------------------------------------------

export function HealthStepsSection({ platform, onChanged }: { platform: HealthPlatform; onChanged: (connected: boolean) => void }) {
  const store = healthStoreName(platform)
  const [connected, setConnected] = useState(isHealthStepsConnected())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const connect = async () => {
    setBusy(true)
    setNote(null)
    const r = await connectHealthSteps()
    setBusy(false)
    if (r.ok) { setConnected(true); onChanged(true); return }
    if (r.reason === 'unavailable') {
      setNote(platform === 'android'
        ? 'Health Connect isn’t on this phone. Install “Health Connect by Android” from the Play Store, then tap again.'
        : 'Apple Health isn’t available on this device.')
    } else if (r.reason === 'denied') {
      setNote(`Steps weren’t allowed. You can allow them in ${store}, then tap again.`)
    } else {
      setNote(`Couldn’t reach ${store}. Nothing was changed. Try again in a moment.`)
    }
  }

  const turnOff = () => {
    disconnectHealthSteps()
    setConnected(false)
    onChanged(false)
  }

  return (
    <div className="space-y-3 text-sm" data-health-steps={connected ? 'on' : 'off'}>
      <p className="text-muted-foreground">
        {connected
          ? `Your steps come from ${store} each time you open the app. If you type a bigger number on Home, yours is kept.`
          : `Let the app read your step count from ${store}, so Home’s steps ring fills in by itself. It reads steps only, and writes nothing.`}
      </p>
      {connected && platform === 'ios' && (
        <p className="text-[0.75rem] leading-[1.4] text-muted-foreground">
          If your steps stay at 0, Apple may not be sharing them: open the Settings app, then Health, Data Access &amp;
          Devices, and allow Steps for this app.
        </p>
      )}
      {connected ? (
        <Button variant="outline" className="min-h-[44px]" onClick={turnOff} data-health-off>Stop reading steps</Button>
      ) : (
        <Button className="min-h-[44px]" onClick={() => void connect()} disabled={busy} data-health-connect>
          {busy ? 'Asking your phone…' : `Use ${store}`}
        </Button>
      )}
      {note && <p role="alert" className="text-[0.75rem] text-[color:var(--role-warn-text)]" data-health-note>{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile, "Heart rate from your watch" (his ruling 24 Nov 2026, "1 + 2"). Beside steps, the same shape: drawn only in
// the phone app, nothing asked until he taps, read only. The words promise only what is built: after a session, and
// resting heart rate on Home; nothing is prescribed by it.
// ---------------------------------------------------------------------------
export function HealthHeartSection({ platform }: { platform: HealthPlatform }) {
  const store = healthStoreName(platform)
  const [connected, setConnected] = useState(isHealthHeartConnected())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const connect = async () => {
    setBusy(true)
    setNote(null)
    const r = await connectHealthHeart()
    setBusy(false)
    if (r.ok) { setConnected(true); return }
    setNote(r.reason === 'denied'
      ? `Heart rate wasn’t allowed. You can allow it in ${store}, then tap again.`
      : r.reason === 'unavailable'
      ? `${store} isn’t available on this phone.`
      : `Couldn’t reach ${store}. Nothing was changed. Try again in a moment.`)
  }
  return (
    <div className="space-y-3 text-sm pt-4 border-t border-[color:var(--hairline)]" data-health-heart={connected ? 'on' : 'off'}>
      <p className="font-medium text-foreground">Heart rate from your watch</p>
      <p className="text-muted-foreground">
        {connected
          ? `After each session your average and highest heart rate show under it, and Home shows your resting heart rate (worked out from your overnight readings if your watch doesn’t share one). It comes from ${store}, which your watch or strap writes to.`
          : `If a watch or chest strap writes your heart rate to ${store}, the app can show your average and highest heart rate after each session, and your resting heart rate on Home. It reads heart rate only, and writes nothing.`}
      </p>
      {connected ? (
        <Button variant="outline" className="min-h-[44px]" onClick={() => { disconnectHealthHeart(); setConnected(false) }} data-heart-off>Stop reading heart rate</Button>
      ) : (
        <Button className="min-h-[44px]" onClick={() => void connect()} disabled={busy} data-heart-connect>
          {busy ? 'Asking your phone…' : 'Read heart rate'}
        </Button>
      )}
      {note && <p role="alert" className="text-[0.75rem] text-[color:var(--role-warn-text)]" data-heart-note>{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile, "Workouts from your watch" (his brief 26 Nov 2026; watch-workouts.ts). The same shape as the two above:
// drawn only in the phone app, nothing asked until he taps, read only. The words promise only what is built: a workout
// the watch recorded is OFFERED on Home, and nothing is logged until he says how hard it was.
// ---------------------------------------------------------------------------
export function HealthWorkoutsSection({ platform }: { platform: HealthPlatform }) {
  const store = healthStoreName(platform)
  const [connected, setConnected] = useState(isWatchWorkoutsConnected())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const connect = async () => {
    setBusy(true)
    setNote(null)
    const r = await connectWatchWorkouts()
    setBusy(false)
    if (r.ok) { setConnected(true); return }
    setNote(r.reason === 'denied'
      ? `Workouts weren’t allowed. You can allow them in ${store}, then tap again.`
      : r.reason === 'unavailable'
      ? `${store} isn’t available on this phone.`
      : `Couldn’t reach ${store}. Nothing was changed. Try again in a moment.`)
  }
  return (
    <div className="space-y-3 text-sm pt-4 border-t border-[color:var(--hairline)]" data-health-workouts={connected ? 'on' : 'off'}>
      <p className="font-medium text-foreground">Workouts from your watch</p>
      <p className="text-muted-foreground">
        {connected
          ? `When your watch records a workout the app doesn’t have, Home offers it and one tap logs it, with its time, distance, calories and heart rate. It comes from ${store}. Nothing is logged until you say how hard it was.`
          : `Start a workout on your watch as you always do. The app can pick it up from ${store} and offer it on Home, so a run, a ride or a class is one tap to log. It reads workouts and writes nothing.`}
      </p>
      {connected ? (
        <Button variant="outline" className="min-h-[44px]" onClick={() => { disconnectWatchWorkouts(); setConnected(false) }} data-workouts-off>Stop reading workouts</Button>
      ) : (
        <Button className="min-h-[44px]" onClick={() => void connect()} disabled={busy} data-workouts-connect>
          {busy ? 'Asking your phone…' : 'Read my watch’s workouts'}
        </Button>
      )}
      {note && <p role="alert" className="text-[0.75rem] text-[color:var(--role-warn-text)]" data-workouts-note>{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile, "Sleep from your watch" (his pick "A", 26 Nov 2026; sleep-nights.ts). The same shape as the three above:
// drawn only in the phone app, nothing asked until he taps, read only. The words promise only what is built: last
// night against his usual on Home, the coach told, a lighter session OFFERED after two short nights, and nothing
// about his sleep saved.
// ---------------------------------------------------------------------------
export function HealthSleepSection({ platform }: { platform: HealthPlatform }) {
  const store = healthStoreName(platform)
  const [connected, setConnected] = useState(isHealthSleepConnected())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const connect = async () => {
    setBusy(true)
    setNote(null)
    const r = await connectHealthSleep()
    setBusy(false)
    if (r.ok) { setConnected(true); return }
    setNote(r.reason === 'denied'
      ? `Sleep wasn’t allowed. You can allow it in ${store}, then tap again.`
      : r.reason === 'unavailable'
      ? `${store} isn’t available on this phone.`
      : `Couldn’t reach ${store}. Nothing was changed. Try again in a moment.`)
  }
  return (
    <div className="space-y-3 text-sm pt-4 border-t border-[color:var(--hairline)]" data-health-sleep={connected ? 'on' : 'off'}>
      <p className="font-medium text-foreground">Sleep from your watch</p>
      <p className="text-muted-foreground">
        {connected
          ? `Home shows how long you slept last night against your usual, from ${store}. Your coach is told too, and after two short nights in a row offers a lighter session. Your plan never changes unless you say yes, and your sleep is read on this phone, not saved.`
          : `If your watch tracks sleep, the app can read how long you slept from ${store}: last night against your usual on Home, and a lighter session offered after two short nights in a row. It reads sleep and writes nothing.`}
      </p>
      {connected ? (
        <Button variant="outline" className="min-h-[44px]" onClick={() => { disconnectHealthSleep(); setConnected(false) }} data-sleep-off>Stop reading sleep</Button>
      ) : (
        <Button className="min-h-[44px]" onClick={() => void connect()} disabled={busy} data-sleep-connect>
          {busy ? 'Asking your phone…' : 'Read my sleep'}
        </Button>
      )}
      {note && <p role="alert" className="text-[0.75rem] text-[color:var(--role-warn-text)]" data-sleep-note>{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile, "Heart rate strap" (option 3, his "then start working on 3", 24 Nov 2026; strap-live.ts). Read straight from
// the strap while he trains, so the number on the timer and the workout is live. Drawn only in the phone app; nothing
// is asked of Bluetooth until he taps. The words promise only what is built: a live number, and the session's figure.
// ---------------------------------------------------------------------------
export function HeartStrapSection() {
  const [strap, setStrap] = useState<PairedStrap | null>(pairedStrap())
  const state = useStrapState()
  const bpm = useLiveHeartRate()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const find = async () => {
    setBusy(true)
    setNote(null)
    const r = await pairStrap()
    setBusy(false)
    if (r.ok) { setStrap(r.strap); return }
    setNote(r.reason === 'unavailable'
      ? 'Bluetooth isn’t available on this phone.'
      : r.reason === 'cancelled'
      ? null
      : 'Found it, but couldn’t connect. Check the strap is on and damp, then tap again.')
    if (r.reason === 'failed') setStrap(pairedStrap())
  }
  const status = !strap ? null
    : bpm != null ? `Connected · ♥ ${bpm}`
    : state === 'connecting' ? 'Connecting…'
    : state === 'connected' ? 'Connected · waiting for a reading'
    : 'Not in range'
  return (
    <div className="space-y-3 text-sm pt-4 border-t border-[color:var(--hairline)]" data-heart-strap={strap ? 'paired' : 'none'}>
      <p className="font-medium text-foreground">Heart rate strap</p>
      <p className="text-muted-foreground">
        {strap
          ? `${strap.name}. While it’s on, the timer and today’s workout show your heart rate live, and each session keeps its average and highest. Readings stay on this phone.`
          : 'Pair a chest strap or a watch that broadcasts heart rate, and the timer and today’s workout show it live while you train. Each session keeps its average and highest. Readings stay on this phone.'}
      </p>
      {status && <p className="text-[0.8125rem] text-foreground" data-heart-strap-status>{status}</p>}
      {strap ? (
        <div className="flex flex-wrap gap-2">
          {state !== 'connected' && state !== 'connecting' && (
            <Button className="min-h-[44px]" onClick={() => void connectPairedStrap()} data-heart-strap-reconnect>Connect</Button>
          )}
          <Button variant="outline" className="min-h-[44px]" onClick={() => { void forgetStrap(); setStrap(null) }} data-heart-strap-forget>Forget this strap</Button>
        </div>
      ) : (
        <Button className="min-h-[44px]" onClick={() => void find()} disabled={busy} data-heart-strap-find>
          {busy ? 'Looking…' : 'Find my strap'}
        </Button>
      )}
      {note && <p role="alert" className="text-[0.75rem] text-[color:var(--role-warn-text)]" data-heart-strap-note>{note}</p>}
    </div>
  )
}
