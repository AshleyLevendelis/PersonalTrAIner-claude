import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
 * Lives on the Dashboard, next to the weight-trend line it feeds — extracted
 * from NutritionDisplay.tsx (where it originally lived) since it's a daily
 * action, not a nutrition number.
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-primary" />
          <CardTitle className="text-base">Today's Weigh-In</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={25}
            max={350}
            placeholder="Weight in kg"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            className="flex-1 min-w-0"
          />
          <Button onClick={handleSave} disabled={saving || !input} className="shrink-0">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-[11px] text-muted-foreground">
          Your targets recalculate from your latest weigh-in — log it and the numbers above update.
        </p>
        {history.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="ds-label">Last {history.length} entries</span>
              {sevenDayAvg != null && (
                <span className="text-muted-foreground">7-day avg: <span className="font-semibold text-foreground">{sevenDayAvg} kg</span></span>
              )}
            </div>
            <div className="space-y-1">
              {history.map(h => (
                <div key={h.date} className="flex justify-between text-sm rounded-md bg-muted/50 px-2.5 py-1">
                  <span className="text-muted-foreground">{h.date}</span>
                  <span className="font-medium">{h.weight_kg} kg</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
