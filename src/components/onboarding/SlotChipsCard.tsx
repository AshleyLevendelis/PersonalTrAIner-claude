import { OptionRow, OptionPill, OptionCell } from './OptionRow'
import { Button } from '@/components/ui/button'
import { getSlotDef, offeredOptionsFor, canDeclineSlot, type OnboardingSlotValues, type SlotKey } from '@/lib/onboarding-slots'

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
  onDecline,
}: {
  slotKey: string
  values: OnboardingSlotValues
  resolved: boolean
  /** A request is in flight — chips disable like the composer does, so a tap is never silently dropped by the send guard. */
  busy: boolean
  onToggleMulti: (key: SlotKey, value: string) => void
  onResolveSingle: (key: SlotKey, value: string) => void
  onResolveMulti: (key: SlotKey) => void
  /** Record this slot as answered with NO value — see canDeclineSlot. */
  onDecline: (keys: SlotKey[]) => void
}) {
  const def = getSlotDef(slotKey)
  // Via offeredOptionsFor so any future "hidden until the engine can honour
  // it" filtering applies here automatically.
  const options = def ? offeredOptionsFor(def) : undefined
  if (!def || !options || (def.control !== 'single' && def.control !== 'multi')) return null

  const current = values[def.key]
  const selectedMulti: string[] = Array.isArray(current) ? (current as string[]) : []
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
    <div className={`mt-2 space-y-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      {shape === 'rows' && (
        <div
          {...groupRole}
          className="overflow-hidden rounded-[14px] border border-[color:var(--hairline)] bg-card"
        >
          {options.map((opt, i) => (
            <OptionRow
              key={String(opt.value)}
              label={opt.label}
              description={opt.description}
              selected={isSelected(opt.value)}
              selectionRole={selectionRole}
              divided={i > 0}
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
          {options.map(opt => (
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

      {def.key === 'dietaryPreferences' && (
        <p className="text-[11px] leading-snug text-muted-foreground/70">
          These filters check ingredients we recognise. We can't check brands,
          preparation, or cross-contamination. If you have a food allergy,
          always check ingredients yourself.
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
      {def.control === 'single' && canDeclineSlot(def, values) && (
        <Button
          variant="ghost"
          className={shape === 'rows'
            ? 'w-full min-h-[44px] text-sm text-muted-foreground'
            : 'min-h-[44px] rounded-full px-3 text-xs text-muted-foreground'}
          disabled={busy}
          onClick={() => onDecline([def.key])}
        >
          Prefer not to say
        </Button>
      )}
      {def.control === 'multi' && (
        shape === 'rows' ? (
          <Button
            variant="outline"
            className="w-full min-h-[44px] text-sm"
            // A REQUIRED multi with nothing selected must not offer a skip
            // that would silently fail validation downstream — the button says
            // what's needed and stays disabled until then.
            disabled={busy || (def.required && selectedMulti.length === 0)}
            onClick={() => onResolveMulti(def.key)}
          >
            {selectedMulti.length === 0 ? (def.required ? 'Pick at least one' : 'None — skip') : 'Done'}
          </Button>
        ) : (
          // Strip and pills share a footer: the picks read back on the left,
          // the Done button on the right. The read-back matters most on the
          // strip, where the answer is seven single letters — "Mon · Wed · Fri"
          // is the only place the choice is stated in words.
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
              {selectedMulti.length > 0
                ? options.filter(o => selectedMulti.includes(String(o.value))).map(o => o.label).join(' · ')
                : ''}
            </p>
            <Button
              className="h-[38px] shrink-0 rounded-[11px] px-[18px] text-[13px] font-semibold glow-mint-box"
              disabled={busy || (def.required && selectedMulti.length === 0)}
              onClick={() => onResolveMulti(def.key)}
            >
              {selectedMulti.length === 0 ? (def.required ? 'Pick at least one' : 'None — skip') : 'Done'}
            </Button>
          </div>
        )
      )}
    </div>
  )
}
