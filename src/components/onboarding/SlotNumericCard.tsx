import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getSlotDef,
  numericGroupFor,
  isSlotApplicable,
  isSlotRequired,
  canDeclineSlot,
  type OnboardingSlotValues,
  type SlotKey,
} from '@/lib/onboarding-slots'

// ---------------------------------------------------------------------------
// The numeric counterpart to SlotChipsCard.
//
// Age, height and weight are bounded fields the plan can be built without.
// In chat they had NO control at all:
// present_slot marked a card for them, but the chips component draws only
// closed-set options and returned null for anything numeric, so the question
// fell through to free text. The bounds then went unchecked until the very
// end, and a mistyped height reached the calorie maths as a real number.
//
// Rendered as a group (see numericGroupFor) because that is how they're asked
// — one card, one Save, one turn.
//
// Validation is the slot definition's own `validate`, so this control can
// never accept a value the engine would reject; the bounds shown in the hint
// are the same numbers the check uses, rather than a second copy to drift.
//
// "Prefer not to say" exists because optional used to mean "the plan can be
// built without it" everywhere EXCEPT here — with no way to say no, a user
// who wouldn't give a weight could never finish. See canDeclineSlot.
// ---------------------------------------------------------------------------

/**
 * Units, by slot. Deliberately not derived from the question text: the
 * grouped cards put three fields under one question, so only one of them
 * could ever have taken its unit from the sentence above.
 */
import { measureParserFor } from '@/lib/body-units'

const UNIT: Record<string, string | undefined> = {
  age: 'years',
  heightCm: 'cm or 5\'10',
  weightKg: 'kg or 13st',
  knownSquatKg: 'kg',
  knownBenchKg: 'kg',
  knownDeadliftKg: 'kg',
}

/**
 * The two fields that accept another unit, and MUST therefore not be
 * `type="number"`.
 *
 * A number input physically cannot hold `5'10"` or `13st` — the browser
 * discards the apostrophe and the letters — so accepting feet and stone in
 * body-units.ts would have been dead code on the card, which is the main way
 * anyone answers this. Caught by reading the input, not by testing the parser:
 * every unit test passed while the field it feeds could not have received a
 * single one of those strings.
 *
 * These two get `type="text"` with a numeric-ish keypad hint. The app's own
 * bounds still apply after conversion, so nothing is loosened — only the
 * browser's character filter, which was the thing in the way.
 */
const ACCEPTS_UNITS = new Set(['heightCm', 'weightKg'])

const PLACEHOLDER: Record<string, string> = {
  heightCm: "178 or 5'10",
  weightKg: '87 or 13st 2',
}

export function SlotNumericCard({
  slotKey,
  values,
  confirmed,
  resolved,
  busy,
  editing = false,
  onResolve,
  onDecline,
}: {
  slotKey: string
  values: OnboardingSlotValues
  confirmed: ReadonlySet<string>
  resolved: boolean
  busy: boolean
  /**
   * The user re-opened this from the review to CHANGE an answer. Shows the
   * one slot they asked to change, even though it's already confirmed —
   * without this the confirmed-filter below leaves the card with no fields.
   */
  editing?: boolean
  onResolve: (entries: { key: SlotKey; raw: string }[]) => void
  /** Record these as answered with NO value — see canDeclineSlot. */
  onDecline: (keys: SlotKey[]) => void
}) {
  const def = getSlotDef(slotKey)
  const fields = (editing ? (def ? [def] : []) : (def ? numericGroupFor(def.key) : []).map(k => getSlotDef(k)!))
    .filter(d => d.control === 'numeric' && isSlotApplicable(d, values) && (editing || !confirmed.has(d.key)))

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [showErrors, setShowErrors] = useState(false)

  if (!def || def.control !== 'numeric' || resolved || fields.length === 0) return null

  const rawOf = (k: SlotKey) => draft[k] ?? ''
  // Blank is allowed only where the answer isn't required — a known-lift
  // number can be left out, an age cannot.
  const isOk = (d: (typeof fields)[number]) => {
    const raw = rawOf(d.key).trim()
    if (raw === '') return !isSlotRequired(d, values)
    // VALIDATE WHAT WILL BE STORED, NOT WHAT WAS TYPED. `validate` is
    // isNumberIn(100, 250) against the raw string, so it rejected "5'10"
    // outright — the card said "Give a number between 100 and 250" and the
    // converter downstream never saw it. Third layer in the way of the same
    // feature, after type="number" and the label; only driving the real field
    // found any of them, because the parser's own tests all passed throughout.
    const measure = measureParserFor(d.key)
    const parsed = measure?.(raw)
    return d.validate(parsed ? String(parsed.value) : raw)
  }
  const allOk = fields.every(isOk)
  // Every field on this card can be refused, so the card can offer a refusal.
  // Mixed cards (some required) deliberately get no button: a partial decline
  // would leave the required one unanswered with nothing saying so.
  const declinable = fields.every(d => canDeclineSlot(d, values))
  const allBlank = fields.every(d => rawOf(d.key).trim() === '')

  return (
    <div className={`mt-2 space-y-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      {fields.map(d => {
        const bad = showErrors && !isOk(d)
        return (
          <div key={d.key} className="space-y-1">
            {/* The unit lives on the LABEL, not only in the coach's sentence.
                A field labelled "Height" whose placeholder reads "100–250" is
                asking for a number in a unit the user has to remember from a
                message that has since scrolled — and the three barbell fields
                are on one card, so the sentence naming kg belongs to only one
                of them. */}
            <label className="text-xs text-muted-foreground" htmlFor={`slot-${d.key}`}>
              {d.shortLabel}{UNIT[d.key] ? <span className="text-muted-foreground/70"> ({UNIT[d.key]})</span> : null}
            </label>
            <Input
              id={`slot-${d.key}`}
              // Numeric keypad on a phone, and the browser's own guard rails
              // agree with the slot definition's bounds.
              type={ACCEPTS_UNITS.has(d.key) ? 'text' : 'number'}
              inputMode={ACCEPTS_UNITS.has(d.key) ? 'text' : 'numeric'}
              min={ACCEPTS_UNITS.has(d.key) ? undefined : d.min}
              max={ACCEPTS_UNITS.has(d.key) ? undefined : d.max}
              value={rawOf(d.key)}
              disabled={busy}
              placeholder={PLACEHOLDER[d.key] ?? (d.min != null ? `${d.min}–${d.max}` : '')}
              onChange={e => setDraft(prev => ({ ...prev, [d.key]: e.target.value }))}
              className={`h-11 ${bad ? 'border-destructive' : ''}`}
            />
            {bad && (
              <p className="text-[0.6875rem] text-destructive">
                {rawOf(d.key).trim() === ''
                  ? `${d.shortLabel} is needed to build your plan.`
                  : `Give a number between ${d.min} and ${d.max}.`}
              </p>
            )}
          </div>
        )
      })}
      <Button
        variant="outline"
        className="w-full min-h-[44px] text-sm"
        disabled={busy}
        onClick={() => {
          // Never a silent no-op: an invalid Save surfaces the reasons
          // in place rather than doing nothing.
          if (!allOk) {
            setShowErrors(true)
            return
          }
          // ...and neither is an all-blank Save, which used to return here
          // with nothing recorded, no message and an unchanged card — the
          // exact silent no-op the comment above promises never happens.
          // Blank is legitimate on an optional field, so this is a real
          // choice to make, not an error: point at the button that makes it.
          if (allBlank) {
            setShowErrors(true)
            return
          }
          onResolve(
            fields
              .filter(d => rawOf(d.key).trim() !== '')
              .map(d => ({ key: d.key, raw: rawOf(d.key).trim() })),
          )
        }}
      >
        Save
      </Button>
      {showErrors && allBlank && (
        <p className="text-[0.6875rem] text-muted-foreground">
          {declinable
            ? 'Fill in what you can, or tap “Prefer not to say”.'
            : 'Fill these in to carry on.'}
        </p>
      )}
      {declinable && (
        <Button
          variant="ghost"
          className="w-full min-h-[44px] text-sm text-muted-foreground"
          disabled={busy}
          onClick={() => onDecline(fields.map(d => d.key))}
        >
          Prefer not to say
        </Button>
      )}
    </div>
  )
}
