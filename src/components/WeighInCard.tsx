import { useState, useEffect, useCallback } from 'react'


import { Input } from '@/components/ui/input'
import { Scale } from 'lucide-react'
import { getRecentWeighIns } from '@/lib/nutrition-targets'
import { upsertDailyMetric } from '@/lib/daily-tracking'

/**
 * Minimal weigh-in capture (M0 Part 5): one field, one save, last-7 history
 * with a 7-day average. Writes through the existing upsertDailyMetric helper
 * ((profile_id, date) unique — a second save today overwrites today's
 * entry). Trend LOGIC (target adjustment from the series) is M3; this only
 * captures and displays.
 *
 * Lives on the Nutrition tab (turn 12: "one owner per fact") — Nutrition owns
 * the plan, the derivation, and the weigh-in; Dashboard keeps only a
 * read-only display of weight/trend, fed independently by data.weightTrend.
 */
export function WeighInCard({ profileId, onWeightLogged }: { profileId: string; onWeightLogged?: () => void | Promise<void> }) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ date: string; weight_kg: number }[]>([])

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
      await upsertDailyMetric({
        profile_id: profileId,
        date: new Date().toISOString().split('T')[0],
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

  const sevenDayAvg = history.length > 0
    ? Math.round((history.reduce((sum, h) => sum + h.weight_kg, 0) / history.length) * 10) / 10
    : null

  // Density pass 3a: a single raised row rather than a titled card — the
  // placeholder carries the label, so the heading is redundant chrome.
  return (
    <div className="space-y-2">
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
          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
        />
        <button
          onClick={handleSave}
          disabled={saving || !input}
          className="shrink-0 text-[13px] font-semibold text-primary glow-mint disabled:opacity-40 disabled:[text-shadow:none]"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground/85">
        Targets recalculate from your latest weigh-in
        {sevenDayAvg != null ? ` · 7-day avg ${sevenDayAvg} kg` : ''}
      </p>
      {history.length > 0 && (
        <div className="space-y-1">
          {history.map(h => (
            <div key={h.date} className="flex justify-between rounded-md px-0.5 text-[13px]">
              <span className="text-muted-foreground">{h.date}</span>
              <span className="font-medium">{h.weight_kg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
