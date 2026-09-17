// ---------------------------------------------------------------------------
// "ANYTHING FEELING TIGHT?" — before the session, on a gym floor, one hand.
//
// TIGHT IS NOT HURT, AND THIS SCREEN MUST NEVER BLUR THE TWO. Ashley's ruling
// of 15 Sep 2026 is a rule about the APP, not about one sheet: any surface
// that lets somebody say something hurts asks the same three questions, and
// the third answer — sharp, one-sided or worsening — names a professional and
// changes nothing. So the escape here is not a softer version of that triage;
// it hands over to it whole, with the area already answered.
//
// WHAT THIS SHEET IS ALLOWED TO DO: add mobility drills to today's warm-up.
// That is the entire list. It cannot change a set, a weight, a session or the
// plan, which is why it can be a one-tap question rather than a confirm card.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TIGHT_AREAS } from '@/lib/tightness'
import { HURT_KINDS, RED_FLAG_ADVICE } from '@/lib/edit-reason'

export type TightnessAnswer =
  /** Areas that feel stiff — warm-up only, nothing else moves. */
  | { type: 'tight'; areas: string[] }
  /** Nothing today. Clears anything said earlier. */
  | { type: 'all_good' }
  /** It is pain, not stiffness — hand over to the triage with the area filled in. */
  | { type: 'injury'; hurt: 'niggle' | 'lasting'; area: string }
  /** Sharp, one-sided or worsening. Advice only; the plan is untouched. */
  | { type: 'red_flag' }

interface TightnessSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What she said last time today, so reopening shows her own answer. */
  selected: string[]
  onAnswer: (answer: TightnessAnswer) => void
  busy?: boolean
}

/** 44px minimum, the same as every other sheet here — one thumb, mid-changing-room. */
const CHIP = 'w-full min-h-[44px] justify-start text-left'

export function TightnessSheet({ open, onOpenChange, selected, onAnswer, busy }: TightnessSheetProps) {
  const [picked, setPicked] = useState<string[]>(selected)
  const [hurting, setHurting] = useState(false)
  const [hurtKind, setHurtKind] = useState<'niggle' | 'lasting' | null>(null)
  const [redFlag, setRedFlag] = useState(false)

  const reset = () => { setPicked(selected); setHurting(false); setHurtKind(null); setRedFlag(false) }

  // SHOW HER OWN ANSWER BACK WHEN SHE REOPENS IT. useState only takes its
  // initial value, and this component stays mounted between openings, so the
  // chips came back blank the second time — a tap that looked like it had been
  // forgotten. Found by the browser driver, not by reading: the sheet looked
  // right on first open, which is the only state a screenshot catches.
  useEffect(() => { if (open) reset() }, [open, selected.join('|')])  // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { onOpenChange(false); reset() }

  const toggle = (v: string) =>
    setPicked(p => (p.includes(v) ? p.filter(x => x !== v) : [...p, v]))

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {redFlag ? 'Get that looked at' : hurting ? 'Where does it hurt?' : hurtKind ? 'Where does it hurt?' : 'Anything feeling tight?'}
          </DialogTitle>
        </DialogHeader>

        {/* THE BRANCH THAT CHANGES NOTHING, and says so. Word for word the same
            advice the exercise row gives, from the same constant, because two
            versions of this would drift and one of them would be wrong. */}
        {redFlag ? (
          <div className="space-y-3 pt-2" data-testid="tight-red-flag">
            <p className="text-sm">{RED_FLAG_ADVICE}</p>
            <Button className={CHIP} variant="outline" data-testid="tight-red-flag-ack"
              onClick={() => { onAnswer({ type: 'red_flag' }); close() }}>
              Got it
            </Button>
          </div>
        ) : hurtKind ? (
          // Which area — the same eight the injury path understands, because
          // that is where this answer is going.
          <div className="space-y-2 pt-2" data-testid="tight-hurt-area">
            <p className="text-sm">Which area?</p>
            {TIGHT_AREAS.map(a => (
              <Button key={a.value} variant="outline" className={CHIP} disabled={busy} data-area={a.value}
                onClick={() => { onAnswer({ type: 'injury', hurt: hurtKind, area: a.value }); close() }}>
                {a.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setHurtKind(null)}>Back</Button>
          </div>
        ) : hurting ? (
          <div className="space-y-2 pt-2" data-testid="tight-hurt-kind">
            <p className="text-sm">Is it a niggle, or has it been there a while?</p>
            {HURT_KINDS.map(h => (
              <Button key={h.kind} variant="outline" className={CHIP} disabled={busy} data-hurt={h.kind}
                onClick={() => (h.kind === 'red_flag' ? setRedFlag(true) : setHurtKind(h.kind as 'niggle' | 'lasting'))}>
                <span className="flex flex-col items-start">
                  <span>{h.label}</span>
                  <span className="text-xs text-muted-foreground">{h.note}</span>
                </span>
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setHurting(false)}>Back</Button>
          </div>
        ) : (
          <div className="space-y-2 pt-2" data-testid="tight-areas">
            <p className="text-sm text-muted-foreground">
              Tap anything that feels stiff and I&rsquo;ll put some movement for it at the front of your warm-up. Nothing else changes.
            </p>
            {TIGHT_AREAS.map(a => (
              <Button key={a.value} variant={picked.includes(a.value) ? 'default' : 'outline'}
                className={CHIP} disabled={busy} data-area={a.value}
                aria-pressed={picked.includes(a.value)}
                onClick={() => toggle(a.value)}>
                {a.label}
              </Button>
            ))}

            <div className="pt-2 space-y-2">
              <Button className={CHIP} disabled={busy || picked.length === 0} data-testid="tight-save"
                onClick={() => { onAnswer({ type: 'tight', areas: picked }); close() }}>
                Add these to my warm-up
              </Button>
              {/* CLEARING IS AS EASY AS SAYING IT. Yesterday's stiff hip is not
                  today's, and an answer you cannot take back becomes one people
                  stop giving. */}
              <Button variant="outline" className={CHIP} disabled={busy} data-testid="tight-all-good"
                onClick={() => { onAnswer({ type: 'all_good' }); close() }}>
                {selected.length > 0 ? 'All good now — clear it' : 'All good'}
              </Button>
              {/* THE HANDOVER. Not a fourth chip in the list above: pain is a
                  different question with a different answer, and putting it
                  among the areas would invite it to be answered as one. */}
              <Button variant="ghost" size="sm" className="w-full" disabled={busy} data-testid="tight-hurts"
                onClick={() => setHurting(true)}>
                It&rsquo;s not tight, it actually hurts
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
