import { questionAsksSlot, questionPartOf } from './onboarding-chip-match'
import { ONBOARDING_SLOTS, type SlotKey } from './onboarding-slots'

// ---------------------------------------------------------------------------
// ONE QUESTION AT A TIME (his setup, 13 Nov 2026: "it started asking multiple questions at once which broke the
// process"). Three screenshots, one cause: the app's step-in (the "Up to 3, then back" counter and the dead-end
// guard) put its own question, with its own card, UNDER a coach reply that had already asked a setup question with a
// card. The counter had been tripped by a question he could not answer (a bare "110kg" nothing kept), so from then on
// EVERY turn carried two questions: recovery and male/female, training style and cardio.
//
// The rules this file holds, so the component and a gate ask the same thing:
//   1. A coach reply that asks a SETUP question (it carries a card, names its question, or its question sentence
//      asks something setup has not got yet) is never given a second one. The app steps aside.
//   2. When the app must step in over a coach question that is NOT a setup question (his "Up to 3, then back", the
//      fourth follow-up on something he volunteered), the app's question REPLACES the coach's, rather than sitting
//      under it. The coach's reaction stays; only its question goes.
// ---------------------------------------------------------------------------

export interface TurnMessage {
  role: 'user' | 'assistant'
  content: string
  slotCard?: string
  asksSlot?: string
  isReceipt?: boolean
}

/** Does this message ask a question at all (a card counts: the card IS a question)? */
export function asksSomething(m: TurnMessage): boolean {
  return m.role === 'assistant' && !m.isReceipt && (!!m.slotCard || !!m.asksSlot || m.content.includes('?'))
}

/**
 * Does this coach turn already ask a setup question? A card or a named question counts; so does a question sentence
 * that asks for something setup has not been told yet (open or not yet reached: "was that 110kg for your squat, bench
 * or deadlift?" asks about lifts whose boxes are not on screen yet).
 */
export function coachAskedSetupQuestion(newMessages: readonly TurnMessage[], confirmed: ReadonlySet<string>): boolean {
  for (const m of newMessages) {
    if (m.role !== 'assistant' || m.isReceipt) continue
    if (m.slotCard || m.asksSlot) return true
    if (!m.content.includes('?')) continue
    const q = questionPartOf(m.content)
    if (ONBOARDING_SLOTS.some(s => !confirmed.has(s.key) && questionAsksSlot(s.key as SlotKey, q))) return true
  }
  return false
}

/**
 * The text with its question sentences taken out: what the coach said, without what it asked. Empty when the message
 * was nothing but a question.
 */
export function withoutQuestions(text: string): string {
  const sentences = (text.match(/[^.!?]+[.!?]*/g) ?? []).map(s => s.trim()).filter(Boolean)
  return sentences.filter(s => !s.includes('?')).join(' ').trim()
}

/**
 * Take the questions out of this turn's coach messages, in place, so the app's own question can be the only one.
 * Cards are left to the caller (a card is a question too; the callers decide which card stays). A message left with
 * no words is dropped.
 */
export function dropCoachQuestions<M extends TurnMessage>(newMessages: M[]): M[] {
  const out: M[] = []
  for (const m of newMessages) {
    if (m.role !== 'assistant' || m.isReceipt || m.slotCard || m.asksSlot || !m.content.includes('?')) { out.push(m); continue }
    const kept = withoutQuestions(m.content)
    if (kept) out.push({ ...m, content: kept })
  }
  return out
}

/** How many questions does this turn put in front of him? The invariant the gate and the driver hold to one. */
export function questionsInTurn(newMessages: readonly TurnMessage[]): number {
  return newMessages.filter(asksSomething).length
}

// ---------------------------------------------------------------------------
// A WEIGHT WITH NO SET BEHIND IT (the same setup: he typed "110kg", the coach said "Got it." and asked for all three
// lifts, nothing was kept, and when he asked "Which exercise did I mean?" the app moved on). His 11 Nov ruling
// "Weight and reps" already refuses to keep a weight with no reps; what was missing is the APP asking which lift and
// how many reps, with the boxes, at the moment he gives one.
// ---------------------------------------------------------------------------

const LIFT_NAMES: Array<[RegExp, string]> = [
  [/\bsquat/i, 'squat'],
  [/\bbench|\bpress\b/i, 'bench press'],
  [/\bdead\s?lift|\bdeads?\b/i, 'deadlift'],
]

/**
 * The weight in a message that gives one and nothing that makes it a set: "110kg", "about 110", "I squat 110". Returns
 * the weight as it should be said back ("110 kg") and the lift he named, if exactly one. Undefined for a set ("100 x 5",
 * "100 for 5", "5 reps"), for more than one number, and for anything that is not about a weight.
 */
export function bareLiftWeight(text: string): { weight: string; lift?: string } | undefined {
  const t = text.trim()
  if (!t || t.length > 60 || t.includes('?')) return undefined
  // A set ("110 x 5", "100 for 5", "5 reps at 100") always has a second number or a word that is not filler, so the
  // two checks below turn it away. A separate set test measured as doing nothing (a MISSED mutation) and was deleted.
  const numbers = t.match(/\d+(?:[.,]\d+)?/g) ?? []
  if (numbers.length !== 1) return undefined
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|lbs?|pounds?)?\b/i)
  if (!m) return undefined
  const value = Number(m[1].replace(',', '.'))
  const unit = m[2] ? (/^(lb|lbs|pound|pounds)$/i.test(m[2]) ? 'lb' : 'kg') : 'kg'
  // A barbell lift with a plate on it, up to well past a world record: anything outside is not a lift weight.
  const plausible = unit === 'kg' ? value >= 20 && value <= 500 : value >= 45 && value <= 1100
  if (!plausible) return undefined
  // Nothing but the weight, a unit, and at most a lift name and a few filler words.
  const rest = t.replace(m[0], ' ').replace(/\b(i|i'm|im|my|on|the|about|around|roughly|maybe|probably|do|did|can|lift|lifting|is|was|it|its|it's|ish|approx|approximately|barbell|back)\b/gi, ' ')
  const named = LIFT_NAMES.filter(([re]) => re.test(t))
  const restWithoutLifts = named.reduce((s, [re]) => s.replace(new RegExp(re.source, 'gi'), ' '), rest)
  if (restWithoutLifts.replace(/[\s,.!-]+/g, '').replace(/s\b/g, '').length > 0) return undefined
  return { weight: `${m[1].replace(',', '.')} ${unit}`, lift: named.length === 1 ? named[0][1] : undefined }
}
