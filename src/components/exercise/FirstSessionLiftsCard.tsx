import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { InsightBanner } from '@/components/ui/insight-banner'
import { addDays } from '@/lib/session-move'
import { getLastWorkingSessionDate } from '@/lib/set-log-store'
import {
  FIRST_LIFTS, FIRST_LIFTS_WORDS, firstLiftsPatch, firstSessionLiftsDue,
  type FirstLiftKey, type FirstLiftSet,
} from '@/lib/first-session-lifts'
import type { MesocycleWeek, UserProfile } from '@/lib/types'

/**
 * THE LIFT NUMBERS, ASKED AT THE FIRST SESSION (his ruling 14 Nov 2026, "Ask at the first session"). Shown once, just under
 * today's session, only where answering can take effect (first-session-lifts.ts). "Start from these" saves them and
 * rebuilds the plan from this week; "I don't know" leaves the first week to find them. Either answer is kept on this
 * phone so the card never comes back; a set logged also ends it.
 */
export function FirstSessionLiftsCard({
  profile, profileId, today, week, workingSetsToday, onSave,
}: {
  profile: UserProfile | null | undefined
  profileId: string | undefined
  today: string
  week: MesocycleWeek | null | undefined
  workingSetsToday: number
  /** Saves the patch and rebuilds; returns the sentence to show when it fails, null when done. */
  onSave?: (patch: Partial<UserProfile>) => Promise<string | null>
}) {
  const storeKey = profileId ? `fitplan_first_lifts_${profileId}` : null
  const [dismissed, setDismissed] = useState(false)
  const [trainedBefore, setTrainedBefore] = useState<boolean | null>(null)
  const [sets, setSets] = useState<Partial<Record<FirstLiftKey, FirstLiftSet>>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let d = false
    try { d = !!storeKey && localStorage.getItem(storeKey) === '1' } catch { /* storage blocked: ask again */ }
    setDismissed(d)
  }, [storeKey])
  useEffect(() => {
    if (!profileId) { setTrainedBefore(null); return }
    let cancelled = false
    // Up to and including today. A failed read is "unknown", and unknown never asks.
    getLastWorkingSessionDate(profileId, addDays(today, 1))
      .then(last => { if (!cancelled) setTrainedBefore(last != null) })
      .catch(() => { if (!cancelled) setTrainedBefore(null) })
    return () => { cancelled = true }
  }, [profileId, today])

  const remember = () => {
    try { if (storeKey) localStorage.setItem(storeKey, '1') } catch { /* storage blocked: hidden for this visit only */ }
    setDismissed(true)
  }

  if (done) {
    return (
      <InsightBanner tone="ai" data-testid="first-lifts-done">
        <span className="text-sm">{FIRST_LIFTS_WORDS.done}</span>
      </InsightBanner>
    )
  }
  const due = firstSessionLiftsDue({
    profile, week, dismissed,
    trainedBefore: trainedBefore === null ? null : (trainedBefore || workingSetsToday > 0),
  })
  if (!due || !onSave) return null

  const setField = (key: FirstLiftKey, field: keyof FirstLiftSet, value: string) =>
    setSets(prev => ({ ...prev, [key]: { weightKg: prev[key]?.weightKg ?? '', reps: prev[key]?.reps ?? '', [field]: value } }))

  const start = async () => {
    if (!profile) return
    const result = firstLiftsPatch(profile, sets)
    if (!result.ok) { setMessage(result.message); return }
    setBusy(true)
    setMessage(null)
    const failed = await onSave(result.patch)
    setBusy(false)
    if (failed) { setMessage(failed); return }
    remember()
    setDone(true)
  }

  return (
    <div data-testid="first-lifts-card" className="space-y-3 rounded-2xl border border-[color:var(--hairline)] bg-card p-4">
      <div className="space-y-1">
        <p className="text-[0.9375rem] font-semibold">{FIRST_LIFTS_WORDS.title}</p>
        <p className="text-[0.8125rem] leading-snug text-muted-foreground">{FIRST_LIFTS_WORDS.lead}</p>
      </div>
      <div className="space-y-2">
        {FIRST_LIFTS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[1fr_5.5rem_4.5rem] items-center gap-2">
            <span className="text-[0.8125rem]">{label}</span>
            <input
              id={`first-lift-${key}-kg`}
              aria-label={`${label}, weight in kg`}
              inputMode="decimal"
              placeholder="kg"
              value={sets[key]?.weightKg ?? ''}
              onChange={e => setField(key, 'weightKg', e.target.value)}
              className="h-11 w-full rounded-xl border border-[color:var(--hairline)] bg-background px-2 text-[0.9375rem]"
            />
            <input
              id={`first-lift-${key}-reps`}
              aria-label={`${label}, reps`}
              inputMode="numeric"
              placeholder="reps"
              value={sets[key]?.reps ?? ''}
              onChange={e => setField(key, 'reps', e.target.value)}
              className="h-11 w-full rounded-xl border border-[color:var(--hairline)] bg-background px-2 text-[0.9375rem]"
            />
          </div>
        ))}
      </div>
      {message && <p data-testid="first-lifts-message" className="text-[0.8125rem] leading-snug">{message}</p>}
      <div className="flex gap-2">
        <Button data-testid="first-lifts-start" className="h-11 flex-1" disabled={busy} onClick={() => void start()}>
          {FIRST_LIFTS_WORDS.use}
        </Button>
        <Button data-testid="first-lifts-dont-know" variant="outline" className="h-11 flex-1" disabled={busy} onClick={remember}>
          {FIRST_LIFTS_WORDS.dontKnow}
        </Button>
      </div>
    </div>
  )
}
