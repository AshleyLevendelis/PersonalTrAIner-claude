import { OptionCard } from './OptionCard'
import { Button } from '@/components/ui/button'
import { getSlotDef, offeredOptionsFor, canDeclineSlot, type OnboardingSlotValues, type SlotKey } from '@/lib/onboarding-slots'

// ---------------------------------------------------------------------------
// The REAL onboarding chips, rendered inside the conversational flow — same
// OptionCard used elsewhere in the app, driven by the same slot definition, so
// a tapped value is guaranteed to be one the engine understands. Single-select
// resolves on tap; multi-select toggles live against the parent's values and
// resolves via the Done button (an empty Done is an explicit "none", which is
// a real answer — the tracker records the skip rather than leaving the slot
// silently un-asked).
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

  const compact = options.length > 4 || options.every(o => !o.description)

  // Answered: the chips simply go away. They used to collapse into a small
  // "you picked X" line, but the user's own message bubble sits directly
  // below saying exactly that — the echo was the third copy of one answer on
  // screen, and stacked down the transcript it read as a completed form.
  if (resolved) return null

  return (
    <div className={`mt-2 space-y-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      <div className={options.length > 6 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
        {options.map(opt => (
          <OptionCard
            key={String(opt.value)}
            icon={opt.icon}
            label={opt.label}
            description={compact ? undefined : opt.description}
            selected={isSelected(opt.value)}
            compact={compact}
            onClick={() => {
              if (busy) return
              if (def.control === 'multi') onToggleMulti(def.key, String(opt.value))
              else onResolveSingle(def.key, String(opt.value))
            }}
          />
        ))}
      </div>
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
      {def.control === 'single' && canDeclineSlot(def, values) && (
        <Button
          variant="ghost"
          className="w-full min-h-[44px] text-sm text-muted-foreground"
          disabled={busy}
          onClick={() => onDecline([def.key])}
        >
          Prefer not to say
        </Button>
      )}
      {def.control === 'multi' && (
        <Button
          variant="outline"
          className="w-full min-h-[44px] text-sm"
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
