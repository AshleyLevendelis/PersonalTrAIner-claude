// ---------------------------------------------------------------------------
// Setting a goal weight.
//
// MOVED OFF THE DASHBOARD, on Ashley's call: "Collapse 'Set goal weight' into
// a setting modal, and keep only the quick weight logger visible to reduce
// scrolling." The dashboard measured 1297px — about one and a half phone
// screens — and carried THREE input boxes, two of them about weight. A goal
// weight is set once and changed rarely; the daily logger is used daily. Only
// one of those earns permanent space on the home screen.
//
// It lives in the profile screen's Goals section now, which is where a goal
// weight already appeared once set — this closes the gap where the only place
// to CREATE one was a screen it did not belong on.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { createGoal } from '@/lib/memory-store'

/** Inline goal-weight setter — shown only when no body_weight_kg goal
 * exists yet. Baseline is the latest logged weight (or the onboarding
 * weight if nothing's been logged) at the moment the goal is set; matches
 * `computeWeightTrend`'s own baseline-at-capture convention. */
export function GoalWeightSetter({ profileId, baselineKg, onSet }: { profileId: string; baselineKg: number; onSet: () => void | Promise<void> }) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const kg = parseFloat(input)
    if (!Number.isFinite(kg) || kg < 25 || kg > 350) {
      setError('Enter a weight between 25 and 350 kg')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await createGoal({
        profileId,
        metric: 'body_weight_kg',
        trackable: 'measurable',
        baselineValue: baselineKg,
        baselineSource: 'logged_data',
        targetValue: kg,
        source: 'manual',
        rawPhrase: `goal weight ${kg}kg`,
        displayText: `Goal weight: ${kg} kg`,
      })
      setInput('')
      await onSet()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min={25}
        max={350}
        placeholder="Set a goal weight — kg"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        className="h-7 min-w-0 flex-1 rounded-md bg-[color:var(--surface-raised)] px-2 text-[0.8125rem]"
      />
      <button
        onClick={handleSave}
        disabled={saving || !input}
        className="shrink-0 text-[0.8125rem] font-semibold text-primary glow-mint disabled:opacity-40 disabled:[text-shadow:none]"
      >
        {saving ? 'Saving…' : 'Set'}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
