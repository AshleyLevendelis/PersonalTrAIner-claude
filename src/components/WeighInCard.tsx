import { useState, useEffect, useCallback } from 'react'


import { Input } from '@/components/ui/input'
import { Scale } from 'lucide-react'
import { getRecentWeighIns, targetsToday } from '@/lib/nutrition-targets'
import { upsertDailyMetric } from '@/lib/daily-tracking'
import { computeWeightTrend, weighInAverageLine } from '@/lib/weight-trend'
import { checkWeighIn, calendarDaysBetween, type WeighInCheck } from '@/lib/weigh-in-check'

/**
 * Minimal weigh-in capture (M0 Part 5): one field, one save, last-7 history
 * with a 7-day average. Writes through the existing upsertDailyMetric helper
 * ((profile_id, date) unique — a second save today overwrites today's
 * entry). Trend LOGIC (target adjustment from the series) is M3; this only
 * captures and displays.
 *
 * Body-weight logging round: moved from the Nutrition tab to the Home/
 * Dashboard tab, next to the trend chart it feeds — a Fat Loss user tracking
 * progress looks at Dashboard first, and logging + seeing the trend in one
 * place beats a plan-detail screen (Nutrition) owning the write while
 * Dashboard only mirrored it read-only.
 */
export function WeighInCard({ profileId, onWeightLogged }: { profileId: string; onWeightLogged?: () => void | Promise<void> }) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ date: string; weight_kg: number }[]>([])
  // What the shared check made of the last weight saved here. HELD, NOT ACTED
  // ON: what a surprising weigh-in should do (ask first? hold the target for a
  // second day?) is Ashley's decision and is open, so today it is saved like
  // any other and nothing she can see changes. The verdict is on the card's
  // root as a data attribute — the place the ruling will plug in, and what
  // verify:weigh-in reads to prove the check is really asked.
  const [lastCheck, setLastCheck] = useState<WeighInCheck | null>(null)

  const refreshHistory = useCallback(async () => {
    setHistory(await getRecentWeighIns(profileId, 7))
  }, [profileId])

  useEffect(() => { refreshHistory() }, [refreshHistory])

  const handleSave = async () => {
    const kg = parseFloat(input)
    if (!Number.isFinite(kg) || kg < 25 || kg > 350) {
      setError('Enter a weight between 25 and 350 kg')
      return
    }
    setError(null)
    setSaving(true)
    try {
      // Local calendar date on the app's clock, not UTC — the same "today" the
      // targets read (targetsToday), so the row and the 7-day window agree.
      const today = targetsToday(profileId)
      // Against the weigh-in before this one — which, an hour after another,
      // is today's own row (history is newest first).
      const last = history[0] ?? null
      setLastCheck(checkWeighIn(kg, last?.weight_kg ?? null, last ? calendarDaysBetween(last.date, today) : null))
      await upsertDailyMetric({
        profile_id: profileId,
        date: today,
        weight_kg: kg,
      })
      setInput('')
      await refreshHistory()
      await onWeightLogged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  // The SAME average the targets are computed from: the last 7 days on the
  // app's calendar, not "however many rows there are".
  const averageLine = weighInAverageLine(computeWeightTrend(
    history.map(h => ({ date: h.date, weightKg: h.weight_kg })),
    targetsToday(profileId),
    null,
  ))

  // Density pass 3a: a single raised row rather than a titled card — the
  // placeholder carries the label, so the heading is redundant chrome.
  return (
    <div
      className="space-y-2"
      data-testid="weigh-in-card"
      data-weigh-in-check={lastCheck?.verdict}
      data-weigh-in-difference={lastCheck?.verdict === 'surprising' ? lastCheck.differenceKg : undefined}
    >
      <div className="flex items-center gap-2.5 rounded-xl bg-[color:var(--surface-raised)] px-3.5 py-2.5">
        <Scale className="size-4 shrink-0 text-muted-foreground" />
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={25}
          max={350}
          placeholder="Log today's weigh-in — kg"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-[0.8125rem] shadow-none focus-visible:ring-0"
        />
        <button
          onClick={handleSave}
          disabled={saving || !input}
          className="shrink-0 text-[0.8125rem] font-semibold text-primary-text glow-mint disabled:opacity-40 disabled:[text-shadow:none]"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[0.6875rem] text-muted-foreground/85" data-testid="weigh-in-average">{averageLine}</p>
      {history.length > 0 && (
        <div className="space-y-1">
          {history.map(h => (
            <div key={h.date} className="flex justify-between rounded-md px-0.5 text-[0.8125rem]">
              <span className="text-muted-foreground">{h.date}</span>
              <span className="font-medium">{h.weight_kg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
