import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { saveTesterConsent } from '@/lib/profile-store'
import { openReport } from '@/components/TesterButtons'

// ---------------------------------------------------------------------------
// "HELP TEST THE APP" (tester toolkit, his rulings 25 Nov 2026, "Everything"). The one place somebody agrees, and the
// one place they stop. Every word of what is recorded is said BEFORE the tap, because the ruling recorded the most a
// person can be asked for: what they type included. Off by default; turning it off stops it at once.
// ---------------------------------------------------------------------------

export const TESTER_CONSENT_LINES = [
  'Crashes, and anything that fails to save or load',
  'Each screen you open and each button you tap',
  'What you type into the app (your messages to the coach are already kept in your chat)',
]
export const TESTER_NEVER_LINE = 'Never your password or your email address.'
export const TESTER_KEPT_LINE = 'It is kept with your account, read only to find and fix problems, and deleted with your account. Turn it off here at any time.'

export function TesterSection({ profileId, since, onChanged }: { profileId: string; since: string | null | undefined; onChanged: (since: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const on = !!since
  const flip = async () => {
    setBusy(true); setNote(null)
    try {
      const r = await saveTesterConsent(profileId, !on)
      if (r.result === 'not-yet') { setNote("Testing isn't switched on for the app yet. Nothing has been recorded."); return }
      // Recording follows the profile: App's effect starts or stops it from tester_since (a second call here was measured
      // inert by mutation, 25 Nov 2026, and removed).
      onChanged(r.since)
      setNote(r.since ? 'Thank you. Recording is on, and the bug button is beside the gear on every screen.' : 'Recording is off. Nothing more will be recorded.')
    } catch {
      setNote("Couldn't save that. Check your connection and try again. Nothing has changed.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3 text-sm" data-tester-section={on ? 'on' : 'off'}>
      <p className="m-0 leading-snug">
        Testers help find what goes wrong. While this is on, the app records:
      </p>
      <ul className="m-0 list-disc space-y-1 pl-5 leading-snug" data-tester-consent>
        {TESTER_CONSENT_LINES.map(l => <li key={l}>{l}</li>)}
      </ul>
      <p className="m-0 leading-snug font-semibold">{TESTER_NEVER_LINE}</p>
      <p className="m-0 text-[0.8125rem] leading-snug text-muted-foreground">{TESTER_KEPT_LINE}</p>
      <p className="m-0 text-[0.8125rem] leading-snug text-muted-foreground">
        You also get a bug button beside the gear, and "Report a problem" on exercises and meals, to tell us anything that's wrong.
      </p>
      <Button className="min-h-[44px]" variant={on ? 'outline' : 'default'} disabled={busy} onClick={() => void flip()} data-tester-toggle={on ? 'turn-off' : 'turn-on'}>
        {busy ? 'Saving…' : on ? 'Stop recording' : 'I agree, help test the app'}
      </Button>
      {on && (
        <Button className="min-h-[44px]" variant="outline" onClick={() => openReport({ area: 'other' })} data-tester-report-from-profile>
          Report a problem
        </Button>
      )}
      {note && <p role="status" className="m-0 text-[0.8125rem]" data-tester-note-line>{note}</p>}
    </div>
  )
}
