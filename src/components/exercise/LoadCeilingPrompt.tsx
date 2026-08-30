import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  LOAD_CEILING_QUESTION, isValidCeilingKg, LOAD_CEILING_MIN_KG, LOAD_CEILING_MAX_KG,
  type LoadCeilingKind,
} from '@/lib/load-ceiling-prompt'

// ---------------------------------------------------------------------------
// "What can you actually load?" — asked once, where it matters, ignorable.
//
// The app has always guessed this. A rucksack was priced against a strap and
// posture guess; a home trainee's dumbbells against a commercial gym rack.
// Neither figure had anything to do with the person holding them.
//
// THREE RULES THIS INTERFACE FOLLOWS, each from something that went wrong
// before:
//
// 1. NOT A MODAL. Someone opening this screen is standing in a gym or a spare
//    room wanting to start. The prompt sits inline and can be scrolled past;
//    ignoring it costs nothing and it will be there next session.
//
// 2. IGNORING IS NOT DECLINING. Scrolling past means "not now". "I'm not
//    sure" is a deliberate tap that stops the asking for good — the
//    body-metrics round showed what happens when a refusal has nowhere to go:
//    the question simply returns forever and the user is stuck.
//
// 3. IT SAYS WHAT THE ANSWER DOES. A number requested without a reason reads
//    as a form. Each question states the consequence — "I'll stop suggesting
//    weights you don't own" — because that is the actual benefit and it is
//    what makes answering worth the ten seconds.
// ---------------------------------------------------------------------------

export function LoadCeilingPrompt({
  kind,
  onSave,
  onDecline,
  className,
}: {
  kind: LoadCeilingKind
  /** Persists the number. Rejects out-of-range values before this is called. */
  onSave: (kg: number) => Promise<void> | void
  /** "I'm not sure" — permanent, and it silences every implement, not just this one. */
  onDecline: () => Promise<void> | void
  className?: string
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const { question, hint } = LOAD_CEILING_QUESTION[kind]
  const valid = isValidCeilingKg(value)

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    try { await onSave(Number(value)) } finally { setBusy(false) }
  }

  return (
    <Card className={className}>
      <CardContent className="p-3">
        <p className="text-sm font-medium">{question}</p>
        <p className="mt-0.5 text-[0.75rem] leading-normal text-muted-foreground">{hint}</p>
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={LOAD_CEILING_MIN_KG}
            max={LOAD_CEILING_MAX_KG}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void save() }}
            placeholder="kg"
            className="h-8 w-24 text-sm"
            aria-label={question}
          />
          <Button size="sm" className="h-8" disabled={!valid || busy} onClick={() => void save()}>
            Save
          </Button>
          {/* Deliberately worded as uncertainty rather than refusal. Most
              people genuinely have never weighed the bag, and "I'm not sure"
              is the true answer — offering only "No" would make an honest
              response feel like an objection. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            disabled={busy}
            onClick={() => void onDecline()}
          >
            I'm not sure
          </Button>
        </div>
        {/* Shown only once something has been typed, so an empty field is not
            greeted with an error the moment the card appears. */}
        {value !== '' && !valid && (
          <p className="mt-1 text-[0.6875rem] text-muted-foreground">
            Give a number between {LOAD_CEILING_MIN_KG} and {LOAD_CEILING_MAX_KG}kg.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
