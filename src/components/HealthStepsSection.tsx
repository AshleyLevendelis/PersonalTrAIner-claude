import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
