import { useRef, useState, type ReactElement } from 'react'
import { WORKING_WEIGHT_LIFTS } from '@/lib/coach-voice'
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
import { measureParserFor, todayLocal, ageOn, birthDateBounds, weightParts, heightParts, weightText, heightText, sayWeight, sayHeight, type WeightUnit, type HeightUnit } from '@/lib/body-units'

const WEIGHT_UNITS: { unit: WeightUnit; label: string }[] = [{ unit: 'kg', label: 'kg' }, { unit: 'lb', label: 'lb' }, { unit: 'st', label: 'st & lb' }]
const HEIGHT_UNITS: { unit: HeightUnit; label: string }[] = [{ unit: 'cm', label: 'cm' }, { unit: 'ft', label: 'ft & in' }]

const UNIT: Record<string, string | undefined> = {
  // kg, or pounds when they type "lb" (19 Oct 2026). A bare number is kg.
  knownSquatKg: 'kg or lb',
  knownBenchKg: 'kg or lb',
  knownDeadliftKg: 'kg or lb',
}

/**
 * The fields that accept another unit, and MUST therefore not be
 * `type="number"`.
 *
 * A number input physically cannot hold `5'10"` or `13st` — the browser
 * discards the apostrophe and the letters — so accepting feet and stone in
 * body-units.ts would have been dead code on the card, which is the main way
 * anyone answers this. Caught by reading the input, not by testing the parser:
 * every unit test passed while the field it feeds could not have received a
 * single one of those strings.
 *
 * These get `type="text"` with a numeric-ish keypad hint. The app's own
 * bounds still apply after conversion, so nothing is loosened — only the
 * browser's character filter, which was the thing in the way.
 */
const ACCEPTS_UNITS = new Set(['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg'])

// WHICH LIFT, BY THE NAME ON THE BAR (his report, 11 Nov 2026: "which exercises exactly"): a box labelled "Squat"
// did not say back squat on a barbell, and the number sets that lift's starting weight.
const CARD_LABEL: Record<string, string | undefined> = WORKING_WEIGHT_LIFTS

// No example number on a lift box: a figure there is one somebody might copy
// onto the bar, and these numbers set the starting weight.
const LIFT_PLACEHOLDER = 'In kg, or add lb'
const PLACEHOLDER: Record<string, string> = {
  knownSquatKg: LIFT_PLACEHOLDER,
  knownBenchKg: LIFT_PLACEHOLDER,
  knownDeadliftKg: LIFT_PLACEHOLDER,
}

export function SlotNumericCard({
  slotKey,
  values,
  confirmed,
  resolved,
  busy,
  editing = false,
  onResolve,
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
}) {
  const def = getSlotDef(slotKey)
  const fields = (editing ? (def ? [def] : []) : (def ? numericGroupFor(def.key) : []).map(k => getSlotDef(k)!))
    .filter(d => d.control === 'numeric' && isSlotApplicable(d, values) && (editing || !confirmed.has(d.key)))

  // CHANGING AN ANSWER STARTS FROM THE ANSWER (QA round 3, 8 Nov 2026): a row tapped on the summary opened an empty
  // box, while a single-choice change shows the current pick. The box holds what is recorded, ready to edit.
  const [draft, setDraft] = useState<Record<string, string>>(() => editing
    ? Object.fromEntries(fields.map(d => [d.key, values[d.key] == null || values[d.key] === '' ? '' : String(values[d.key])]))
    : {})
  const [showErrors, setShowErrors] = useState(false)

  // AGE, HEIGHT AND WEIGHT HAVE THEIR OWN CONTROLS (Ashley, 9 Nov 2026): a date picker for the date of birth, and a
  // unit toggle beside the weight and the height boxes. Each writes the text the slot's parser already reads, so the
  // number stored, the receipt ("from 5'10\"") and the bounds are what typing it gave.
  const today = todayLocal()
  // Changing the answer from the summary starts from the date of birth already picked.
  const [dob, setDob] = useState(() => (editing && typeof values.dateOfBirth === 'string' ? values.dateOfBirth : ''))
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg')
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm')
  const [weightBoxes, setWeightBoxes] = useState<[string, string]>(() => [draft.weightKg ?? '', ''])
  const [heightBoxes, setHeightBoxes] = useState<[string, string]>(() => [draft.heightCm ?? '', ''])
  /**
   * Switching unit carries what is in the boxes across, converted, rather than emptying them. QA, 10 Nov 2026, two more
   * rules: (1) a box that does not read as a weight is NOT emptied by a switch (it was, silently); the unit stays and a
   * line says why; (2) flicking through the units does not drift the number (80 kg came back 79.8 via lb and st): while
   * the boxes still hold what the last switch wrote, the next switch converts the number they were converted FROM.
   */
  const [unitNote, setUnitNote] = useState<{ key: 'weightKg' | 'heightCm'; text: string } | null>(null)
  const exact = useRef<{ weight?: { boxes: string; value: number }; height?: { boxes: string; value: number } }>({})
  const switchWeight = (u: WeightUnit) => {
    const typed = weightText(weightUnit, weightBoxes)
    const kept = exact.current.weight
    const value = kept && kept.boxes === `${weightUnit}|${weightBoxes.join('|')}` ? kept.value : measureParserFor('weightKg')?.(typed)?.value
    if (value == null && typed !== '') { setUnitNote({ key: 'weightKg', text: 'That weight doesn’t read right yet — fix it, then change the unit.' }); return }
    setUnitNote(null)
    const next = value == null ? ['', ''] as [string, string] : weightParts(value, u)
    setWeightUnit(u)
    setWeightBoxes(next)
    if (value != null) exact.current.weight = { boxes: `${u}|${next.join('|')}`, value }
  }
  const switchHeight = (u: HeightUnit) => {
    const typed = heightText(heightUnit, heightBoxes)
    const kept = exact.current.height
    const value = kept && kept.boxes === `${heightUnit}|${heightBoxes.join('|')}` ? kept.value : measureParserFor('heightCm')?.(typed)?.value
    if (value == null && typed !== '') { setUnitNote({ key: 'heightCm', text: 'That height doesn’t read right yet — fix it, then change the unit.' }); return }
    setUnitNote(null)
    const next = value == null ? ['', ''] as [string, string] : heightParts(value, u)
    setHeightUnit(u)
    setHeightBoxes(next)
    if (value != null) exact.current.height = { boxes: `${u}|${next.join('|')}`, value }
  }
  /** Digits and one decimal point only: a number box also takes "e" and "-", and "1e2" was stored as text. */
  const digits = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')

  if (!def || def.control !== 'numeric' || resolved || fields.length === 0) return null

  const rawOf = (k: SlotKey): string => {
    if (k === 'age') { const a = dob ? ageOn(dob, today) : null; return dob ? (a == null ? 'x' : String(a)) : (draft.age ?? '') }
    if (k === 'weightKg') return weightText(weightUnit, weightBoxes)
    if (k === 'heightCm') return heightText(heightUnit, heightBoxes)
    return draft[k] ?? ''
  }
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

  // ONE BODY ANSWER: the date picker, or a box (two for stone and for feet) with its unit toggle. A plain function, not
  // a component declared in here: a component made fresh each render remounts its boxes and drops the keyboard per key.
  const bodyField = (d: (typeof fields)[number], bad: boolean, off: boolean, blank: boolean) => {
    const box = 'h-11 min-w-0 flex-1'
    const toggle = <U extends string>(units: { unit: U; label: string }[], current: U, pick: (u: U) => void) => (
      <div role="group" aria-label={`${d.shortLabel} unit`} className="flex shrink-0 overflow-hidden rounded-xl border border-border">
        {units.map(u => (
          <button key={u.unit} type="button" data-unit={u.unit} aria-pressed={current === u.unit} disabled={off}
            onClick={() => { if (current !== u.unit) pick(u.unit) }}
            className={`min-h-[44px] min-w-[44px] px-2.5 text-xs font-semibold ${current === u.unit ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            {u.label}
          </button>
        ))}
      </div>
    )
    // Each box says its own unit inside it, so "13" and "2" still read as stone and pounds once the hints are gone.
    const withUnit = (unit: string, input: ReactElement) => (
      <div className="relative min-w-0 flex-1">
        {input}
        <span aria-hidden data-box-unit={unit} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
      </div>
    )
    let control: ReactElement
    let hint: string | null = null
    let limits = ''
    if (d.key === 'age') {
      const { min, max } = birthDateBounds(today, d.min ?? 13, d.max ?? 100)
      const age = dob ? ageOn(dob, today) : null
      hint = age != null ? `That makes you ${age}.` : (editing && draft.age ? `Recorded as ${draft.age}. Pick your date of birth to change it.` : null)
      limits = `Pick a date of birth that makes you between ${d.min} and ${d.max}.`
      control = (
        <Input id="slot-age" type="date" min={min} max={max} value={dob} disabled={off} aria-describedby="slot-age-hint"
          onChange={e => setDob(e.target.value)} className={`${box} ${bad ? 'border-destructive' : ''}`} />
      )
    } else if (d.key === 'weightKg') {
      const two = weightUnit === 'st'
      limits = `Give a weight between ${sayWeight(d.min ?? 25, weightUnit)} and ${sayWeight(d.max ?? 350, weightUnit)}.`
      control = (
        <div className="flex items-center gap-2">
          {withUnit(two ? 'st' : weightUnit, <Input id="slot-weightKg" type="number" inputMode="decimal" value={weightBoxes[0]} disabled={off} aria-label={two ? 'Weight, stone' : `Weight, ${weightUnit}`}
            placeholder={weightUnit === 'kg' ? '87' : weightUnit === 'lb' ? '192' : '13'}
            onChange={e => { setUnitNote(null); setWeightBoxes([digits(e.target.value), weightBoxes[1]]) }} className={`${box} pr-9 ${bad ? 'border-destructive' : ''}`} />)}
          {two && withUnit('lb', <Input id="slot-weightKg-lb" type="number" inputMode="decimal" value={weightBoxes[1]} disabled={off} aria-label="Weight, pounds" placeholder="2"
            onChange={e => { setUnitNote(null); setWeightBoxes([weightBoxes[0], digits(e.target.value)]) }} className={`${box} pr-9 ${bad ? 'border-destructive' : ''}`} />)}
          {toggle(WEIGHT_UNITS, weightUnit, switchWeight)}
        </div>
      )
    } else {
      const two = heightUnit === 'ft'
      limits = `Give a height between ${sayHeight(d.min ?? 100, heightUnit)} and ${sayHeight(d.max ?? 250, heightUnit)}.`
      control = (
        <div className="flex items-center gap-2">
          {withUnit(two ? 'ft' : 'cm', <Input id="slot-heightCm" type="number" inputMode="numeric" value={heightBoxes[0]} disabled={off} aria-label={two ? 'Height, feet' : 'Height, cm'}
            placeholder={two ? '5' : '178'}
            onChange={e => { setUnitNote(null); setHeightBoxes([digits(e.target.value), heightBoxes[1]]) }} className={`${box} pr-9 ${bad ? 'border-destructive' : ''}`} />)}
          {two && withUnit('in', <Input id="slot-heightCm-in" type="number" inputMode="decimal" value={heightBoxes[1]} disabled={off} aria-label="Height, inches" placeholder="10"
            onChange={e => { setUnitNote(null); setHeightBoxes([heightBoxes[0], digits(e.target.value)]) }} className={`${box} pr-9 ${bad ? 'border-destructive' : ''}`} />)}
          {toggle(HEIGHT_UNITS, heightUnit, switchHeight)}
        </div>
      )
    }
    return (
      <div key={d.key} className="space-y-1" data-body-field={d.key}>
        <label className="text-xs text-muted-foreground" htmlFor={`slot-${d.key}`}>{d.key === 'age' ? 'Date of birth' : d.shortLabel}</label>
        {control}
        {hint && !bad && <p id="slot-age-hint" className="text-[0.6875rem] text-muted-foreground" data-testid="slot-age-hint">{hint}</p>}
        {unitNote?.key === d.key && <p className="text-[0.6875rem] text-destructive" data-testid="unit-note">{unitNote.text}</p>}
        {bad && <p className="text-[0.6875rem] text-destructive">{blank ? `${d.key === 'age' ? 'Your date of birth' : d.shortLabel} is needed to build your plan.` : limits}</p>}
      </div>
    )
  }

  return (
    <div data-slot-card={def.key} className={`mt-2 space-y-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      {fields.map(d => {
        const bad = showErrors && !isOk(d)
        if (d.key === 'age' || d.key === 'weightKg' || d.key === 'heightCm') {
          return bodyField(d, bad, busy, rawOf(d.key).trim() === '')
        }
        return (
          <div key={d.key} className="space-y-1">
            {/* The unit lives on the LABEL, not only in the coach's sentence.
                A field labelled "Height" whose placeholder reads "100–250" is
                asking for a number in a unit the user has to remember from a
                message that has since scrolled — and the three barbell fields
                are on one card, so the sentence naming kg belongs to only one
                of them. */}
            <label className="text-xs text-muted-foreground" htmlFor={`slot-${d.key}`}>
              {/* The slot's own unit where this card has nothing richer to
                  say — the three load ceilings were missing from the map
                  above and so asked for "Heaviest dumbbells" in no unit. */}
              {CARD_LABEL[d.key] ?? d.shortLabel}{(UNIT[d.key] ?? d.unit) ? <span className="text-muted-foreground/70"> ({UNIT[d.key] ?? d.unit})</span> : null}
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
          const answers = fields
            .filter(d => rawOf(d.key).trim() !== '')
            .map(d => ({ key: d.key, raw: rawOf(d.key).trim() }))
          // THE BIRTHDAY GOES WITH THE AGE IT MADE (his 9 Nov option 1), so the age can go up on its own later.
          if (dob && answers.some(a => a.key === 'age')) answers.push({ key: 'dateOfBirth', raw: dob })
          onResolve(answers)
        }}
      >
        Save
      </Button>
      {showErrors && allBlank && (
        <p className="text-[0.6875rem] text-muted-foreground">
          {declinable
            ? 'Fill in what you can, or tap Skip at the top.'
            : 'Fill these in to carry on.'}
        </p>
      )}
    </div>
  )
}
