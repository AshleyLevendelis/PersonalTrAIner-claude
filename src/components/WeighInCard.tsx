import { useState, useEffect, useCallback, useRef } from 'react'


import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Scale } from 'lucide-react'
import { getWeighInPicture, targetsToday, type WeighInPicture } from '@/lib/nutrition-targets'
import { upsertDailyMetric } from '@/lib/daily-tracking'
import { computeWeightTrend, weighInAverageLine } from '@/lib/weight-trend'
import { weighInQuestion, weighInQuestionText, weighInYesLabel, weighInHeldNote, WEIGH_IN_NO_LABEL, type WeighInQuestion } from '@/lib/weigh-in-check'
import { shortDate } from '@/lib/day-labels'

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
  // The last fourteen weigh-ins, the weights the targets have been set from,
  // and which weigh-ins the target is following — one read, the same one the
  // targets themselves make (nutrition-targets.ts), so the card and the target
  // cannot disagree about what is held.
  const [picture, setPicture] = useState<WeighInPicture | null>(null)
  // ASHLEY'S RULING, 9 Oct 2026 — "Ask, and hold the target". A weigh-in far
  // from the last one is not saved until she says it is right: one tap for
  // yes, one tap to go back and correct it. While this is set nothing has
  // been written.
  const [asking, setAsking] = useState<{ kg: number; question: WeighInQuestion } | null>(null)
  // What the check made of the last weight typed here — on the card's root
  // for verify:weigh-in to read ("the check was asked" is otherwise invisible
  // when the answer is "fine").
  const [lastVerdict, setLastVerdict] = useState<'ok' | 'surprising' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const next = await getWeighInPicture(profileId)
    setPicture(next)
    return next
  }, [profileId])

  useEffect(() => { void refresh() }, [refresh])

  const history = (picture?.recent ?? []).slice(0, 7)

  const save = async (kg: number) => {
    setSaving(true)
    try {
      // Local calendar date on the app's clock, not UTC — the same "today" the
      // targets read (targetsToday), so the row and the 7-day window agree.
      await upsertDailyMetric({ profile_id: profileId, date: targetsToday(profileId), weight_kg: kg })
      setInput('')
      setAsking(null)
      await refresh()
      await onWeightLogged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    const kg = parseFloat(input)
    if (!Number.isFinite(kg) || kg < 25 || kg > 350) {
      setError('Enter a weight between 25 and 350 kg')
      return
    }
    setError(null)
    // Read fresh, not from what the card loaded with: the coach may have
    // logged a weigh-in since, and "the last one" has to be the last one.
    setSaving(true)
    let current: WeighInPicture
    try { current = await refresh() } finally { setSaving(false) }
    const question = weighInQuestion(kg, current.today, current.recent.map(w => ({ date: w.date, kg: w.weight_kg })), current.anchors)
    setLastVerdict(question ? 'surprising' : 'ok')
    if (question) { setAsking({ kg, question }); return }
    await save(kg)
  }

  /** "No, change it": nothing was saved; the figure is back under her thumb to retype. */
  const handleCorrect = () => {
    setAsking(null)
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  // The SAME average the targets are computed from: the last 7 days on the
  // app's calendar, over the weigh-ins the target is following. A held one is
  // listed below like any other and is not in this figure.
  const averageLine = weighInAverageLine(computeWeightTrend(
    (picture?.standing.trusted ?? []).map(w => ({ date: w.date, weightKg: w.kg })),
    targetsToday(profileId),
    null,
  ))
  const held = picture?.heldLatest ?? null

  // Density pass 3a: a single raised row rather than a titled card — the
  // placeholder carries the label, so the heading is redundant chrome.
  return (
    <div
      className="space-y-2"
      data-testid="weigh-in-card"
      data-weigh-in-check={lastVerdict ?? undefined}
      data-weigh-in-difference={asking ? asking.question.differenceKg : undefined}
      data-weigh-in-held={held ? held.kg : undefined}
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
          ref={inputRef}
          value={input}
          // Retyping withdraws the question: it was about the old figure.
          onChange={e => { setInput(e.target.value); setAsking(null) }}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-[0.8125rem] shadow-none focus-visible:ring-0"
        />
        <button
          onClick={handleSave}
          disabled={saving || !input || asking != null}
          className="shrink-0 text-[0.8125rem] font-semibold text-primary-text glow-mint disabled:opacity-40 disabled:[text-shadow:none]"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {asking && (
        <div role="group" aria-label="Check this weigh-in" data-testid="weigh-in-question" className="space-y-2.5 rounded-xl border border-border bg-[color:var(--surface-raised)] px-3.5 py-3">
          <p className="text-[0.8125rem] leading-snug text-foreground" aria-live="polite">{weighInQuestionText(asking.question, asking.kg)}</p>
          <div className="flex gap-2">
            <Button size="sm" className="h-11 flex-1 text-[0.8125rem]" data-testid="weigh-in-yes" disabled={saving} onClick={() => { void save(asking.kg) }}>
              {saving ? 'Saving…' : weighInYesLabel(asking.kg)}
            </Button>
            <Button size="sm" variant="outline" className="h-11 flex-1 text-[0.8125rem]" data-testid="weigh-in-no" disabled={saving} onClick={handleCorrect}>
              {WEIGH_IN_NO_LABEL}
            </Button>
          </div>
        </div>
      )}
      {held && !asking && (
        <p className="text-[0.75rem] leading-snug text-foreground/90" data-testid="weigh-in-held">{weighInHeldNote(held.kg)}</p>
      )}
      <p className="text-[0.6875rem] text-muted-foreground/85" data-testid="weigh-in-average">{averageLine}</p>
      {history.length > 0 && (
        <div className="space-y-1">
          {history.map(h => (
            <div key={h.date} className="flex justify-between rounded-md px-0.5 text-[0.8125rem]">
              <span className="text-muted-foreground">{shortDate(h.date, picture?.today)}</span>
              <span className="font-medium">{h.weight_kg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
