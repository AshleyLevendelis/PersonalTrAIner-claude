// ---------------------------------------------------------------------------
// "WHAT'S GOING ON WITH IT?" — ON THE SCREEN, NOT ONLY IN THE CHAT.
//
// `docs/how-the-app-talks-about-a-change.md` §3: "Same chips on the screen's
// sheet as in chat, because both surfaces are equal paths. One tap, and the app
// knows which of six problems it is solving."
//
// A SHEET CAN ASK THIS, and the distinction matters because the nutrition
// sheet's own note (MealFoodEditSheet, "a question is a conversational move,
// and a sheet has no turn to ask in") argues the opposite. That note is right
// about a COACHING question — "are you sure, this works against your goal?" —
// which needs a reply and a voice. This is not that. "Which of these four is
// it?" is a routing input, which is exactly what a form step is for, and the
// same file already renders verb chips two hundred lines further down.
//
// THE HURTS BRANCH IS ASHLEY'S, TWICE OVER.
//   15 Sep 2026, from three options: ASK, THEN ACT. A niggle eases that area
//   off for a few days; something that has been there a while goes into her
//   injuries so every future plan avoids it; sharp, one-sided or worsening is a
//   professional and never a plan change.
//   And, from three more: the conversation happens ON THE SCREEN, fully —
//   "you reach for this mid-session on a gym floor, and dropping someone into a
//   chat to type is the wrong thing to hand them." So this component owns the
//   whole triage rather than handing off to the coach.
//
// NOTHING HERE APPLIES ANYTHING. It collects an answer and calls back. The
// sheets own their own writes, which is what keeps one injury path rather than
// two.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  reasonsFor, HURT_KINDS, RED_FLAG_ADVICE,
  type EditReason, type ReasonedEditKind, type HurtKind,
} from '@/lib/edit-reason'
import { INJURY_OPTIONS, EQUIPMENT_OPTIONS } from '@/lib/picker-options'

export type ReasonAnswer =
  | { type: 'reason'; reason: Exclude<EditReason, 'hurts'> }
  /** A niggle or a lasting injury, with the area it is in. */
  | { type: 'injury'; hurt: Exclude<HurtKind, 'red_flag'>; area: string }
  /** Sharp, one-sided or worsening — advice only, and the plan is left alone. */
  | { type: 'red_flag' }
  /** "I haven't got the kit" — which kit, so the plan can be rebuilt around it. */
  | { type: 'equipment'; tier: string }

interface EditReasonStepProps {
  kind: ReasonedEditKind
  exerciseName: string
  onAnswer: (answer: ReasonAnswer) => void
  /** Lets someone get on with it without saying why — the change is never gated behind an answer. */
  onSkip: () => void
  busy?: boolean
}

/** 44px minimum, the same as the nutrition sheet's verb chips — a gym floor, one hand. */
const CHIP = 'w-full min-h-[44px] justify-start text-left'

export function EditReasonStep({ kind, exerciseName, onAnswer, onSkip, busy }: EditReasonStepProps) {
  const [hurting, setHurting] = useState(false)
  const [kitting, setKitting] = useState(false)
  const [hurt, setHurt] = useState<Exclude<HurtKind, 'red_flag'> | null>(null)
  const [redFlag, setRedFlag] = useState(false)

  // --- The red-flag branch. Advice, and the plan untouched. ------------------
  if (redFlag) {
    return (
      <div className="space-y-3" data-testid="reason-red-flag">
        <p className="text-sm">{RED_FLAG_ADVICE}</p>
        {/* The only way out is "leave it alone". Offering "do it anyway" here
            would put a plan change one tap from a symptom the app has just
            said it will not train around. */}
        <Button className="w-full" onClick={() => onAnswer({ type: 'red_flag' })} data-testid="red-flag-ack">
          Leave my plan as it is
        </Button>
      </div>
    )
  }

  // --- Which area. Only reached from a niggle or a lasting one. --------------
  if (hurt) {
    return (
      <div className="space-y-2" data-testid="reason-area">
        <p className="text-sm">Whereabouts?</p>
        <div className="grid grid-cols-2 gap-2">
          {INJURY_OPTIONS.map(o => (
            <Button
              key={o.value}
              variant="outline"
              className="min-h-[44px]"
              disabled={busy}
              data-area={o.value}
              onClick={() => onAnswer({ type: 'injury', hurt, area: o.value })}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setHurt(null)}>Back</Button>
      </div>
    )
  }

  // --- Which kit. Only reached from "I haven't got the kit". -----------------
  //
  // WHY A PICKER AND NOT JUST A DIFFERENT EXERCISE. The swap list below is
  // already filtered to what the profile says they have, so offering it here
  // would hand someone the same wrong equipment again. The answer that helps
  // is what they have TODAY, and that is a tier the engine already understands.
  if (kitting) {
    return (
      <div className="space-y-2" data-testid="reason-kit">
        <p className="text-sm">What have you got today?</p>
        {EQUIPMENT_OPTIONS.map(o => (
          <Button
            key={o.value}
            variant="outline"
            className={CHIP}
            disabled={busy}
            data-kit={o.value}
            onClick={() => onAnswer({ type: 'equipment', tier: o.value })}
          >
            <span className="flex flex-col items-start">
              <span>{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.description}</span>
            </span>
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setKitting(false)}>Back</Button>
      </div>
    )
  }

  // --- Niggle, lasting, or the one that needs a person. ----------------------
  //
  // ONE QUESTION, THREE ANSWERS, rather than a safety screen first. My call:
  // opening with "is it sharp?" is an alarming way to answer "it hurts", and it
  // costs the common case a tap to serve the rare one. Nothing is lost — the
  // dangerous branch is still unmissable and still the only one that cannot
  // reach the plan.
  if (hurting) {
    return (
      <div className="space-y-2" data-testid="reason-hurt-kind">
        <p className="text-sm">Is it a niggle, or has it been there a while?</p>
        {HURT_KINDS.map(h => (
          <Button
            key={h.kind}
            variant="outline"
            className={CHIP}
            disabled={busy}
            data-hurt={h.kind}
            onClick={() => (h.kind === 'red_flag' ? setRedFlag(true) : setHurt(h.kind))}
          >
            <span className="flex flex-col items-start">
              <span>{h.label}</span>
              <span className="text-xs text-muted-foreground">{h.note}</span>
            </span>
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setHurting(false)}>Back</Button>
      </div>
    )
  }

  // --- The four reasons. ----------------------------------------------------
  return (
    <div className="space-y-2" data-testid="reason-chips">
      <p className="text-sm">What&rsquo;s going on with {exerciseName}?</p>
      {reasonsFor(kind).map(spec => (
        <Button
          key={spec.reason}
          variant="outline"
          className={CHIP}
          disabled={busy}
          data-reason={spec.reason}
          onClick={() => {
            if (spec.reason === 'hurts') { setHurting(true); return }
            if (spec.reason === 'no_kit') { setKitting(true); return }
            onAnswer({ type: 'reason', reason: spec.reason as Exclude<EditReason, 'hurts'> })
          }}
        >
          <span className="flex flex-col items-start">
            <span>{spec.chip.label}</span>
            <span className="text-xs text-muted-foreground">{spec.chip.note}</span>
          </span>
        </Button>
      ))}
      {/* NEVER GATED BEHIND AN ANSWER. "Reason required" was one of the four
          options put to Ashley on 14 Sep and the one she did not choose; a
          question you cannot walk past is that option wearing a different hat. */}
      <Button variant="ghost" size="sm" className="w-full" disabled={busy} onClick={onSkip} data-testid="reason-skip">
        Just get on with it
      </Button>
    </div>
  )
}
