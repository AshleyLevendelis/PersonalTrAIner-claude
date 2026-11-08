// ---------------------------------------------------------------------------
// COACH REMINDERS — the switches for "the coach can reach you when the app is
// shut" (docs/plans/the-coach-can-reach-you.md, slices 2 and 3).
//
// Ashley, 17 Sep 2026: "Everything but the user should be able to toggle
// notifications on or off to reduce noise." So all seven moments, each its
// own switch, all on to begin with.
//
// TWO DIFFERENT THINGS ARE SWITCHED HERE, and the screen keeps them apart:
//   - THIS PHONE, yes or no. A browser permission and a push subscription,
//     per device. The browser's prompt is only ever raised from her tap on
//     this switch — never on load (the plan's rule: an unasked prompt is the
//     one people decline, and a declined one cannot be asked again).
//   - WHICH MOMENTS. Stored on her profile, so they follow her between
//     phones.
//
// NOTHING IS OFFERED THAT IS NOT BUILT. Until the migration lands there is no
// column to save a switch into, so the section says it is not live yet and
// shows no control that would silently do nothing. The same for a phone that
// cannot be reached (iPhone outside the home screen), and a permission she
// has already refused: each says what is true and what would change it.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react'
import {
  MOMENT_LABELS, SWITCH_ORDER, COACH_REPLY_LABEL, frequencyLabel, frequencyOf, remindersSummary, loadSwitches, saveSwitches,
  currentPushState, turnOnPush, turnOffPush, type PushState,
} from '@/lib/coach-reach-out'
import {
  DEFAULT_MOMENT_SWITCHES, REMINDER_FREQUENCIES, QUIET_BEFORE_HOUR, QUIET_AFTER_HOUR, MIN_HOURS_BETWEEN, dailyCap,
  type MomentKey, type NotificationSettings, type ReminderFrequency,
} from '@/lib/coach-moments'

function Switch({ id, checked, disabled, label, onChange }: {
  id: string; checked: boolean; disabled?: boolean; label: string; onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="hit-slop-44 relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? 'var(--primary)' : 'var(--muted)', border: '1px solid var(--hairline)' }}
    >
      <span
        aria-hidden
        className="inline-block h-4 w-4 rounded-full transition-transform"
        style={{
          background: checked ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
          transform: checked ? 'translateX(1.125rem)' : 'translateX(0.25rem)',
        }}
      />
    </button>
  )
}

/** What the phone row says under its switch, per state. Plain words; hers to reword. */
const PHONE_NOTE: Partial<Record<PushState | 'not_live_yet' | 'failed', string>> = {
  blocked: "Notifications are blocked for this app in your phone's settings. Allow them there, then come back.",
  needs_home_screen: 'On iPhone, add the app to your home screen first (Share, then Add to Home Screen) and open it from there.',
  unsupported: "This browser can't show notifications from the app.",
  not_live_yet: "The reminder service isn't running yet, so this phone can't be signed up. Your choices below are saved.",
  failed: "Couldn't turn them on for this phone. Try again.",
}

function hourLabel(h: number): string {
  if (h === 0) return 'midnight'
  if (h === 12) return 'noon'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

export function RemindersSection({ profileId, onSummary }: { profileId: string; onSummary?: (summary: string) => void }) {
  const [switches, setSwitches] = useState<NotificationSettings>({})
  const [live, setLive] = useState<boolean | null>(null)
  const [phone, setPhone] = useState<PushState | null>(null)
  const [phoneNote, setPhoneNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [readFailed, setReadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadSwitches(profileId).then(r => {
      if (cancelled) return
      setSwitches(r.switches); setLive(r.live)
      onSummary?.(remindersSummary(r.live ? { notification_switches: r.switches } : null))
    }).catch(() => { if (!cancelled) setReadFailed(true) })
    currentPushState().then(s => { if (!cancelled) setPhone(s) }).catch(() => { if (!cancelled) setPhone('unsupported') })
    return () => { cancelled = true }
  }, [profileId])

  const isOn = (k: MomentKey) => switches[k] ?? DEFAULT_MOMENT_SWITCHES[k]

  // ABSENT MEANS THE DEFAULT, for the frequency as for every switch: Normal.
  const frequency: ReminderFrequency = frequencyOf(switches)
  const replyOn = switches.coach_reply ?? true

  async function toggleMoment(k: MomentKey | 'coach_reply' | 'frequency', next: boolean | ReminderFrequency) {
    const before = switches
    const after = { ...switches, [k]: next }
    setSwitches(after)
    setSaveNote(null)
    const outcome = await saveSwitches(profileId, after)
    if (outcome === 'saved') { onSummary?.(remindersSummary({ notification_switches: after })); return }
    // Never leave a switch showing a choice that did not save.
    setSwitches(before)
    if (outcome === 'not_live_yet') { setLive(false); onSummary?.(remindersSummary(null)) }
    else setSaveNote("Couldn't save that — try again.")
  }

  async function togglePhone(next: boolean) {
    setBusy(true)
    setPhoneNote(null)
    try {
      if (next) {
        const outcome = await turnOnPush(profileId)
        if (outcome === 'on') setPhone('on')
        else if (outcome === 'blocked') setPhone('blocked')
        else if (outcome === 'unsupported') setPhone('unsupported')
        else setPhoneNote(PHONE_NOTE[outcome] ?? null)
      } else {
        const ok = await turnOffPush()
        if (ok) setPhone('off')
        else setPhoneNote("Couldn't turn them off for this phone. Try again.")
      }
    } finally {
      setBusy(false)
    }
  }

  const phoneCanToggle = phone === 'on' || phone === 'off'
  const stateNote = phone && !phoneCanToggle ? PHONE_NOTE[phone] : null

  return (
    <div className="space-y-2" data-testid="reminders-section">
      <h3 className="ds-label">Coach reminders</h3>
      {live === null && readFailed ? (
        <p className="text-[0.6875rem] leading-snug text-muted-foreground/70" data-testid="reminders-read-failed">
          Couldn't load your reminder settings just now. Check your connection and open this again.
        </p>
      ) : live === null ? (
        <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">Loading…</p>
      ) : !live ? (
        <p className="text-[0.6875rem] leading-snug text-muted-foreground/70" data-testid="reminders-not-live">
          Not live yet. Once it is, the coach can message your phone when the app is shut, and you'll choose which messages here.
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">
            The coach can message your phone when the app is shut — {frequencyLabel(frequency).detail}{dailyCap(frequency) > 1 ? `, at least ${MIN_HOURS_BETWEEN} hours apart,` : ','} and never before {hourLabel(QUIET_BEFORE_HOUR)} or after {hourLabel(QUIET_AFTER_HOUR)}.
          </p>

          {/* HOW OFTEN: her ruling 6 Nov 2026, "Three levels", so nobody is overwhelmed. One tap; the sentence
              above follows it. Replies to her own messages are never counted. */}
          <div role="radiogroup" aria-label="How often the coach messages you" className="grid grid-cols-3 gap-1.5" data-testid="reminders-frequency">
            {REMINDER_FREQUENCIES.map(f => {
              const on = f === frequency
              const { name, detail } = frequencyLabel(f)
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-frequency={f}
                  onClick={() => { if (!on) void toggleMoment('frequency', f) }}
                  className="min-h-11 rounded-xl px-2 py-1.5 text-center leading-tight transition-colors"
                  style={{
                    border: `1px solid ${on ? 'var(--primary)' : 'var(--hairline)'}`,
                    background: on ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'transparent',
                  }}
                >
                  <span className="block text-sm font-medium">{name}</span>
                  <span className="block text-[0.6875rem] text-muted-foreground">{detail}</span>
                </button>
              )
            })}
          </div>

          <div className="space-y-1">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <label htmlFor="reminders-phone" className="text-sm">On this phone</label>
              <Switch
                id="reminders-phone"
                label="Coach reminders on this phone"
                checked={phone === 'on'}
                disabled={busy || !phoneCanToggle}
                onChange={togglePhone}
              />
            </div>
            {(phoneNote ?? stateNote) && (
              <p className="text-[0.6875rem] leading-snug text-muted-foreground" data-testid="reminders-phone-note">{phoneNote ?? stateNote}</p>
            )}
          </div>

          <div className="space-y-0.5 pt-2" style={{ borderTop: '1px solid var(--hairline)' }}>
            <p className="text-[0.6875rem] leading-snug text-muted-foreground/70 pb-1">Which messages — for every phone you've turned on.</p>
            <div className="flex min-h-11 items-center justify-between gap-3">
              <label htmlFor="reminder-coach_reply" className="text-sm leading-snug">{COACH_REPLY_LABEL}</label>
              <Switch id="reminder-coach_reply" label={COACH_REPLY_LABEL} checked={replyOn} onChange={next => toggleMoment('coach_reply', next)} />
            </div>
            {SWITCH_ORDER.map(k => (
              <div key={k} className="flex min-h-11 items-center justify-between gap-3">
                <label htmlFor={`reminder-${k}`} className="text-sm leading-snug">{MOMENT_LABELS[k]}</label>
                <Switch id={`reminder-${k}`} label={MOMENT_LABELS[k]} checked={isOn(k)} onChange={next => toggleMoment(k, next)} />
              </div>
            ))}
            {saveNote && <p className="text-[0.6875rem] leading-snug text-destructive">{saveNote}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
