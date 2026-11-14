import { useState } from 'react'
import { OptionRow, OptionPill, OptionCell } from './OptionRow'
import { isHealthCondition, healthConditionLine } from '@/lib/health-conditions'
import { Button } from '@/components/ui/button'
import { getSlotDef, offeredOptionsFor, multiSelection, companionSlotFor, isSlotApplicable, type OnboardingSlotValues, type SlotKey } from '@/lib/onboarding-slots'
import { dietTargetCaveat } from '@/lib/coach-voice'

// ---------------------------------------------------------------------------
// The REAL onboarding chips, rendered inside the conversational flow — driven
// by the same slot definition as everything else, so a tapped value is
// guaranteed to be one the engine understands. Single-select resolves on tap;
// multi-select toggles live against the parent's values and resolves via the
// Done button (an empty Done is an explicit "none", which is a real answer —
// the tracker records the skip rather than leaving the slot silently
// un-asked).
//
// TWO SHAPES, AND THE SLOT'S OWN DATA PICKS WHICH. Measured at 390px, every
// question rendered as OptionCards whether or not the card earned anything:
//
//   main goal 213px    cardio 260px    training days 308px
//   injuries  308px    dietary 771px
//
// 771px of an 844px screen for the dietary question — the whole phone, before
// the coach's message above it or the keyboard below. And all seven day cards
// carried the SAME 📅 emoji: seven identical icons, each in a box sized to
// hold one, to say "Mon Tue Wed".
//
// So: a card when the options carry a DESCRIPTION, pills when they do not.
// Read off the options rather than hand-listed, because the description is
// exactly what the card exists to show. "New to this, or coming back after a
// long break" is the line that lets someone place themselves honestly instead
// of flatteringly — shrinking those questions would delete the reason they
// work. A day of the week needs no such help.
//
// That rule keeps cards on goal, experience, activity, equipment, session
// length, style, cardio, recovery, meals, cooking time, snacks, breakfast and
// the lifts question — every one of them 4 options or fewer. Pills take days,
// injuries, dietary, cuisines and sex: every label-only question, and every
// grid that was too tall.
// ---------------------------------------------------------------------------

export function SlotChipsCard({
  slotKey,
  values,
  resolved,
  busy,
  onToggleMulti,
  onResolveSingle,
  onResolveMulti,
}: {
  slotKey: string
  values: OnboardingSlotValues
  resolved: boolean
  /** A request is in flight — chips disable like the composer does, so a tap is never silently dropped by the send guard. */
  busy: boolean
  onToggleMulti: (key: SlotKey, value: string) => void
  onResolveSingle: (key: SlotKey, value: string) => void
  /** The card's own answer, plus its companion's when the screen carries one (companionSlotFor). */
  onResolveMulti: (key: SlotKey, companion?: { key: SlotKey; value: string }) => void
}) {
  const def = getSlotDef(slotKey)
  // Via offeredOptionsFor so any future "hidden until the engine can honour
  // it" filtering applies here automatically.
  const options = def ? offeredOptionsFor(def) : undefined
  // THE SECOND QUESTION ON THIS SCREEN (his "Light trim", 14 Nov 2026): session length under the days, "anything else
  // to leave out" under the diet. Held here until Next, which answers both. (Before any early return: a hook.)
  const companionKey = def ? companionSlotFor(def.key) : null
  const companionDef = companionKey ? getSlotDef(companionKey) : undefined
  const companionOn = !!companionDef && isSlotApplicable(companionDef, values)
  const [companionValue, setCompanionValue] = useState<string>(() => {
    const v = companionKey ? values[companionKey] : null
    return v === null || v === undefined ? '' : String(v)
  })
  if (!def || !options || (def.control !== 'single' && def.control !== 'multi')) return null

  const current = values[def.key]
  // The kit ticks start pre-ticked (multiSelection); every other multi from its value.
  const selectedMulti: string[] = multiSelection(def.key, values)
  const isSelected = (value: string | number) =>
    def.control === 'multi'
      ? selectedMulti.includes(String(value))
      : current !== null && current !== undefined && String(current) === String(value)

  // THREE SHAPES, AND THE SHAPE OF THE OPTION SET PICKS WHICH — not the count
  // alone. Rows are the default and the main event; the other two exist
  // because one specific set each would be absurd as rows.
  //
  //   ROWS   any option carries a description. 13 slots: goal, experience,
  //          activity, equipment, session length, style, cardio, recovery,
  //          meals/day, cooking time, breakfast, knows-lifts, snacks.
  //   STRIP  the seven training days — no descriptions, exactly 7, initials.
  //   PILLS  no descriptions and more than 7: injuries (8), cuisines (10),
  //          dietary (22). Twenty-two stacked rows is a scroll marathon.
  //
  // `gender` is why STRIP tests for SEVEN rather than "7 or fewer". It has two
  // options and no descriptions, so a "≤ 7 short labels" rule would have put a
  // two-answer question into a seven-across day grid. It falls through to rows,
  // which is where the design intends it.
  const hasDescriptions = options.some(o => o.description)
  const isDayStrip = !hasDescriptions && options.length === 7 &&
    options.every(o => o.label.length <= 3)
  const shape: 'rows' | 'strip' | 'pills' =
    hasDescriptions ? 'rows' : isDayStrip ? 'strip' : options.length > 7 ? 'pills' : 'rows'

  // Descriptions render whenever an option has one, with NO count threshold.
  // That deliberately drops the old `showDescription` rule: it existed because
  // a 2-up tile had no room, and a full-width row does.

  // Answered: the chips simply go away. They used to collapse into a small
  // "you picked X" line, but the user's own message bubble sits directly
  // below saying exactly that — the echo was the third copy of one answer on
  // screen, and stacked down the transcript it read as a completed form.
  if (resolved) return null

  const choose = (value: string | number) => {
    if (busy) return
    if (def.control === 'multi') onToggleMulti(def.key, String(value))
    else onResolveSingle(def.key, String(value))
  }

  const selectionRole = def.control === 'multi' ? 'pressed' as const : 'radio' as const
  // A single-select is a radiogroup; a multi-select is a set of independent
  // toggles and must NOT be, or a screen reader announces "1 of 22 selected"
  // semantics that do not apply.
  const groupRole = def.control === 'single' ? { role: 'radiogroup' as const, 'aria-label': def.question } : {}

  return (
    <div data-slot-card={def.key} className={`mt-2 space-y-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      {shape === 'rows' && (
        <div
          {...groupRole}
          className="flex flex-col gap-2"
        >
          {options.map(opt => (
            <OptionRow
              key={String(opt.value)}
              label={opt.label}
              description={opt.description}
              selected={isSelected(opt.value)}
              selectionRole={selectionRole}
              onClick={() => choose(opt.value)}
            />
          ))}
        </div>
      )}

      {shape === 'strip' && (
        <div
          {...groupRole}
          className="grid grid-cols-7 gap-1 rounded-xl border border-[color:var(--hairline)] bg-card p-1"
        >
          {options.map(opt => (
            <OptionCell
              key={String(opt.value)}
              initial={opt.label.slice(0, 1)}
              accessibleLabel={opt.label}
              selected={isSelected(opt.value)}
              onClick={() => choose(opt.value)}
            />
          ))}
        </div>
      )}

      {shape === 'pills' && (
        <div {...groupRole} className="flex flex-wrap gap-2">
          {(def.key === 'injuries' ? options.filter(o => !isHealthCondition(o.value)) : options).map(opt => (
            <OptionPill
              key={String(opt.value)}
              label={opt.label}
              selected={isSelected(opt.value)}
              selectionRole={selectionRole}
              onClick={() => choose(opt.value)}
            />
          ))}
        </div>
      )}

      {/* HEALTH CONDITIONS ON THE INJURIES CARD (his ruling 14 Nov 2026, "Fold into injuries"): under their own small
          heading, and the GP line the moment one is ticked. */}
      {def.key === 'injuries' && shape === 'pills' && options.some(o => isHealthCondition(o.value)) && (
        <div data-health-taps className="space-y-2 pt-1">
          <p className="text-[0.71875rem] font-medium text-muted-foreground">What a doctor has said to watch</p>
          <div className="flex flex-wrap gap-2">
            {options.filter(o => isHealthCondition(o.value)).map(opt => (
              <OptionPill
                key={String(opt.value)}
                label={opt.label}
                selected={isSelected(opt.value)}
                selectionRole={selectionRole}
                onClick={() => choose(opt.value)}
              />
            ))}
          </div>
          {selectedMulti.some(isHealthCondition) && (
            <p data-testid="health-condition-line" className="text-[0.6875rem] leading-snug text-muted-foreground">
              {healthConditionLine(selectedMulti.filter(isHealthCondition))}
            </p>
          )}
        </div>
      )}
      {def.key === 'dietaryPreferences' && (
        <p className="text-[0.6875rem] leading-snug text-muted-foreground/70">
          These filters check ingredients we recognise. We can't check brands,
          preparation, or cross-contamination. If you have a food allergy,
          always check ingredients yourself.
        </p>
      )}
      {/* KETO AND LOW-CARB SAY WHAT THEY ACTUALLY BUY — Ashley's ruling,
          20 Sep 2026, from four options. Both filter food and neither moves
          the daily carb target, and until now the only place that was said
          was the coach, when asked. It appears the moment one of them is
          selected rather than sitting under every dietary question: the
          other twenty options are honoured in full, and a standing warning
          would imply otherwise. The sentence is in the phrasebook so this
          screen and Profile cannot drift apart, and so the gate can read
          one copy. */}
      {def.key === 'dietaryPreferences' && dietTargetCaveat(selectedMulti) && (
        <p data-testid="diet-target-caveat" className="text-[0.6875rem] leading-snug text-muted-foreground/70">
          {dietTargetCaveat(selectedMulti)}
        </p>
      )}
      {/* A single-select the plan doesn't require needs a way to say no.
          Sex is the one that traps people — two options and no third answer,
          on a question that is optional everywhere downstream. Multi-selects
          are excluded on purpose: their Done button already records an
          explicit empty list, which MEANS "none" rather than "not saying". */}
      {/* THE FOOTER MATCHES THE OPTIONS ABOVE IT, and that rule survives the
          redesign unchanged in spirit — only the shape names moved. Under
          rows the decline is a full-width bar, proportionate to a card that
          already spans the column; under a strip or pills it stays inline, so
          a tidy one-line question doesn't get the heaviest control on screen
          hung underneath it. All resolve/decline behaviour is untouched. */}
      {/* THE SKIP MOVED TO THE HEADER (design handoff 2e, 10 Oct 2026): one
          "Skip", top right, wherever the question can already be declined
          (canDeclineSlot) — moved, not copied. */}
      {/* NEXT, FULL WIDTH, for a question that takes more than one tap. A
          single-choice question is still answered by its one tap. */}
      {companionOn && companionDef && companionDef.control === 'single' && (
        <div data-companion={companionDef.key} className="space-y-2 pt-2">
          <p className="text-[0.8125rem] font-medium">{companionDef.question}</p>
          <div role="radiogroup" aria-label={companionDef.question} className="flex flex-wrap gap-2">
            {(offeredOptionsFor(companionDef) ?? []).map(opt => (
              <OptionPill
                key={String(opt.value)}
                label={opt.label}
                selected={companionValue === String(opt.value)}
                selectionRole="radio"
                onClick={() => setCompanionValue(String(opt.value))}
              />
            ))}
          </div>
        </div>
      )}
      {companionOn && companionDef && companionDef.control === 'text' && (
        <div data-companion={companionDef.key} className="space-y-1.5 pt-2">
          <label htmlFor={`companion-${companionDef.key}`} className="block text-[0.8125rem] font-medium">{companionDef.question}</label>
          <input
            id={`companion-${companionDef.key}`}
            type="text"
            value={companionValue}
            onChange={e => setCompanionValue(e.target.value)}
            placeholder={companionDef.inputHint ?? 'Optional'}
            className="h-11 w-full rounded-xl border border-[color:var(--hairline)] bg-card px-3 text-[0.9375rem]"
          />
        </div>
      )}
      {/* THE PICKS, READ BACK IN WORDS, under pills or a day strip, where a
          filled chip is the only other sign of what was chosen. */}
      {def.control === 'multi' && shape !== 'rows' && selectedMulti.length > 0 && (
        <p className="truncate text-[0.71875rem] text-muted-foreground" data-slot-picks>
          {options.filter(o => selectedMulti.includes(String(o.value))).map(o => o.label).join(' · ')}
        </p>
      )}
      {def.control === 'multi' && (
        <Button
          className="h-[54px] w-full text-[0.9375rem] font-semibold glow-mint-box"
          disabled={busy || (def.required && selectedMulti.length === 0) || (companionOn && companionDef?.control === 'single' && companionValue === '')}
          onClick={() => onResolveMulti(def.key, companionOn && companionKey ? { key: companionKey, value: companionValue } : undefined)}
          data-slot-next
        >
          {selectedMulti.length === 0 ? (def.required ? 'Pick at least one' : 'None — next →') : 'Next →'}
        </Button>
      )}
    </div>
  )
}
