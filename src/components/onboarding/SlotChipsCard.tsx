import { OptionCard } from './OptionCard'
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

  // TWO DECISIONS, deliberately separated — they used to be one boolean.
  //
  // `compact` is size. Four bordered tiles at p-5 with a text-3xl emoji fill a
  // phone viewport, and the four-option questions (goal, experience, activity,
  // style) are the most common shape in the flow, so 4 is where tightening
  // starts paying — not 5.
  //
  // `showDescription` is content, and is UNCHANGED. It stays at "4 or fewer,
  // and at least one option actually has one". The single boolean made these
  // move together, which meant the obvious size fix would have deleted the
  // descriptions from exactly the questions that most need them.
  // The shape switch. `hasDescriptions` is the question "does a card have
  // anything to put in it here", which is the same question as "is a card
  // worth its height".
  const hasDescriptions = options.some(o => o.description)
  // An icon repeated on every option is decoration, not information — the same
  // judgement the pill rule makes, applied to the cards. mealsPerDay showed one
  // plate emoji three times under "2 meals / 3 meals / 4 meals"; the labels were
  // already doing the work and the icons were buying height. (trainingDays had
  // seven identical calendars, but it is pills now and renders no icon at all.)
  const iconsCarryMeaning = new Set(options.map(o => o.icon)).size > 1
  const compact = options.length >= 4
  const showDescription = options.length <= 4 && hasDescriptions

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

  return (
    <div className={`mt-2 space-y-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      {hasDescriptions ? (
        <div className={options.length > 6 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
          {options.map((opt, i) => (
            <OptionCard
              key={String(opt.value)}
              icon={iconsCarryMeaning ? opt.icon : undefined}
              label={opt.label}
              description={showDescription ? opt.description : undefined}
              selected={isSelected(opt.value)}
              compact={compact}
              // An odd count in a two-column grid strands the last card at half
              // width beside an empty cell, which reads as a missing option
              // rather than a deliberate layout. Six of the card questions have
              // exactly three options, so this is most of them. The last one
              // spans instead.
              className={options.length % 2 === 1 && options.length <= 6 && i === options.length - 1
                ? 'col-span-2'
                : undefined}
              onClick={() => choose(opt.value)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map(opt => (
            <OptionPill
              key={String(opt.value)}
              label={opt.label}
              selected={isSelected(opt.value)}
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
      {/* THE FOOTER MATCHES THE OPTIONS ABOVE IT. A full-width 44px bar under a
          single tidy row of pills was the heaviest thing on the screen, for
          the lightest question on it — and a disabled "Pick at least one"
          reads as a caption rather than a control. Under pills the footer is
          a pill too, sitting inline; under cards it stays the full-width
          button, which is proportionate there. */}
      {def.control === 'single' && canDeclineSlot(def, values) && (
        <Button
          variant="ghost"
          className={hasDescriptions
            ? 'w-full min-h-[44px] text-sm text-muted-foreground'
            : 'min-h-[44px] rounded-full px-3 text-xs text-muted-foreground'}
          disabled={busy}
          onClick={() => onDecline([def.key])}
        >
          Prefer not to say
        </Button>
      )}
      {def.control === 'multi' && (
        <Button
          variant="outline"
          className={hasDescriptions
            ? 'w-full min-h-[44px] text-sm'
            : 'min-h-[44px] rounded-full px-4 text-xs'}
          // A REQUIRED multi (trainingDays) with nothing selected must not
          // offer a skip that would silently fail validation downstream —
          // the button says what's needed and stays disabled until then.
          disabled={busy || (def.required && selectedMulti.length === 0)}
          onClick={() => onResolveMulti(def.key)}
        >
          {selectedMulti.length === 0 ? (def.required ? 'Pick at least one' : 'None — skip') : 'Done'}
        </Button>
      )}
    </div>
  )
}

/**
 * The pill. Deliberately the SAME shape as the coach chat's quick replies
 * (ChatAssistant.tsx) — rounded-full, surface-raised, text-xs, 44px tall —
 * because a new user meets those two surfaces within minutes of each other
 * and they should read as one app rather than two.
 *
 * No emoji, which is the point on a label-only question: the icon was
 * decoration that cost height, and all seven training-day options carried the
 * same one.
 *
 * min-h-[44px] is the tap target and is not negotiable — text-xs on its own
 * would make a 28px pill, under every touch guideline, trading one usability
 * problem for another.
 */
function OptionPill({
  label, selected, onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        'inline-flex min-h-[44px] items-center rounded-full px-3 py-2.5 text-xs font-medium transition-colors ' +
        (selected
          ? 'bg-primary/15 text-primary ring-1 ring-primary glow-mint'
          : 'bg-[color:var(--surface-raised)] text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80')
      }
    >
      {label}
    </button>
  )
}
