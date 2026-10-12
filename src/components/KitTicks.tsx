// ---------------------------------------------------------------------------
// THE KIT, AS TICKS — Profile → Equipment. Ashley's ruling of 9 Oct 2026,
// "Remember what they say": keep the four choices, remember the specifics
// people say, and show them as ticks on Profile.
//
// The nine things a person can say they have (kit-list.ts), ticked as this
// person has them: what their equipment choice assumes until they have said
// otherwise, and what they said once they have. Changing a tick says
// something, so it goes through the same one function the coach's card does
// (kit-change.ts, handed over by App as a `KitController`): the change is
// worked out first and shown — which exercises move, from which day — and
// nothing is saved until "Save". Nobody's plan changes unless they say
// something, and nothing changes silently when they do.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  KIT_ITEMS, KIT_ITEM_LABELS, describeKitStatement, kitItemsFor, statementsForTicks,
  type KitItem,
} from '@/lib/kit-list'
import type { KitChangePlan, KitController } from '@/lib/kit-change'
import type { UserProfile } from '@/lib/types'
import { shortDate } from '@/lib/plan-guard'

export function KitTicks({ profile, kit }: { profile: UserProfile; kit: KitController }) {
  const current = kitItemsFor(profile)
  const currentKey = current.join(',')
  const stated = (profile.kit_statements ?? []).length > 0
  const [draft, setDraft] = useState<KitItem[]>(current)
  const [preview, setPreview] = useState<KitChangePlan | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ text: string; failed: boolean } | null>(null)
  const asked = useRef(0)

  // A saved change (or one made by the coach) re-derives `current`; the ticks
  // follow it rather than holding a draft of something already saved.
  useEffect(() => { setDraft(current); setPreview(null) }, [currentKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const statements = statementsForTicks(current, draft)
  const changed = statements.length > 0
  const statementsKey = JSON.stringify(statements)

  // WORKED OUT BEFORE THE TAP. Each change of the ticks asks the trial what it
  // would do; an answer to an older question is dropped.
  useEffect(() => {
    if (!changed) { setPreview(null); setChecking(false); return }
    const n = ++asked.current
    setChecking(true)
    const timer = setTimeout(() => {
      kit.plan(statements)
        .then(plan => { if (n === asked.current) setPreview(plan) })
        .catch(err => { console.error('Working out a kit change failed:', err); if (n === asked.current) setPreview(null) })
        .finally(() => { if (n === asked.current) setChecking(false) })
    }, 250)
    return () => clearTimeout(timer)
  }, [statementsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (item: KitItem) => {
    setNote(null)
    setDraft(prev => (prev.includes(item) ? prev.filter(i => i !== item) : KIT_ITEMS.filter(i => i === item || prev.includes(i))))
  }

  const save = async () => {
    if (!changed || saving) return
    setSaving(true)
    try {
      const rawPhrase = `Ticked on Profile — ${statements.map(describeKitStatement).join('; ')}`
      const result = await kit.apply(statements, { source: 'manual', rawPhrase })
      if (result.saved) {
        setNote({ text: `Saved. ${result.summary[1] ?? ''}`.trim(), failed: false })
        setPreview(null)
      } else {
        setNote({ text: result.message ?? "That didn't save — try again in a moment.", failed: true })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 pt-3" data-testid="kit-ticks" style={{ borderTop: '1px solid var(--hairline)' }}>
      <h3 className="ds-label">What you have</h3>
      <p className="text-[0.6875rem] leading-snug text-muted-foreground/70" data-testid="kit-ticks-caption">
        {stated
          ? "From what you've told me. Change anything that's wrong."
          : 'Ticked from your equipment choice. Untick anything you don’t have, tick anything extra.'}
      </p>
      <div className="grid grid-cols-1 gap-1" role="group" aria-label="What you have">
        {KIT_ITEMS.map(item => {
          const on = draft.includes(item)
          return (
            <button
              key={item}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-testid={`kit-tick-${item}`}
              onClick={() => toggle(item)}
              disabled={saving}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm active:bg-muted/60"
            >
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}
              >
                {on && <Check className="size-3.5" />}
              </span>
              <span>{KIT_ITEM_LABELS[item]}</span>
            </button>
          )
        })}
      </div>
      {changed && (
        <div className="space-y-2 rounded-lg border p-3" data-testid="kit-preview">
          {checking || !preview
            ? <p className="text-xs text-muted-foreground">Checking your plan…</p>
            : (
              <>
                {preview.summary.map(line => <p key={line} className="text-xs leading-snug">{line}</p>)}
                {preview.changedDays.slice(0, 3).map(d => (
                  <p key={`${d.weekNumber}|${d.dayName}`} className="text-[0.6875rem] leading-snug text-muted-foreground" data-testid="kit-preview-day">
                    {d.date ? shortDate(d.date) : d.dayName}: {d.before.filter(n => !d.after.includes(n)).join(', ') || 'warm-up'} → {d.after.filter(n => !d.before.includes(n)).join(', ') || 'left out'}
                  </p>
                ))}
                {preview.changedDays.length > 3 && (
                  <p className="text-[0.6875rem] text-muted-foreground">…and {preview.changedDays.length - 3} more day{preview.changedDays.length - 3 === 1 ? '' : 's'}.</p>
                )}
              </>
            )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving || checking || !preview || !!preview.refusal} data-testid="kit-save">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setDraft(current); setNote(null) }} disabled={saving} data-testid="kit-cancel">
              Cancel
            </Button>
          </div>
        </div>
      )}
      {note && (
        <p className={`text-xs leading-snug ${note.failed ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="kit-note" role="status">
          {note.text}
        </p>
      )}
    </div>
  )
}
