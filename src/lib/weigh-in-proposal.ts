// ---------------------------------------------------------------------------
// THE COACH'S WEIGH-IN, WHEN IT IS FAR FROM THE LAST ONE: a card, not a write.
//
// Ashley's ruling, 9 Oct 2026 ("Ask, and hold the target"): a weigh-in more
// than about 3% from the last one is asked about and saved only on yes. The
// weigh-in box on Home and the Profile weight field ask in place; a weight
// told to the coach comes back from the edge function as a proposal instead
// of a write, and this file turns it into the card and, on her yes, into the
// saved weigh-in.
//
// The QUESTION on the card is worked out HERE, from the app's own read of the
// weigh-ins, with the function the weigh-in box uses — the figures the edge
// function sent are only the fallback for when that read finds nothing to ask
// about (the two reads are a moment apart). So the box and the coach cannot
// word the same weigh-in two ways.
// ---------------------------------------------------------------------------

import { upsertDailyMetric } from './daily-tracking'
import type { WeighInPicture } from './nutrition-targets'
import type { ProposalDiff, PendingActionReceipt } from './pending-actions-store'
import { weighInQuestion, weighInQuestionText, weighInStanding, heldWeighInOn, type WeighInQuestion } from './weigh-in-check'

export interface WeighInPayload {
  /** YYYY-MM-DD — the day the weigh-in is for. */
  date: string
  weightKg: number
}

/** On the card, under the question, when saving it will not move the calorie target yet. */
export const WEIGH_IN_CARD_HOLD_LINE = "Your calorie target stays where it is until another day's weigh-in agrees."

/** On the receipt, beside "Calorie target", once a held weigh-in is saved. */
export const WEIGH_IN_RECEIPT_HOLD_DETAIL = "unchanged until another day's weigh-in agrees"

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function buildWeighInProposal(profileId: string, rawArgs: Record<string, unknown>, picture: WeighInPicture): {
  scopeKey: string
  preconditions: Record<string, unknown>
  payload: WeighInPayload
  diff: ProposalDiff
} | null {
  const weightKg = num(rawArgs.weight_kg)
  // The same range every other weigh-in is held to.
  if (weightKg == null || weightKg < 25 || weightKg > 350) return null
  const date = typeof rawArgs.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawArgs.date) ? rawArgs.date : picture.today
  const readings = picture.recent.map(w => ({ date: w.date, kg: w.weight_kg }))

  const fromServer: WeighInQuestion | null =
    num(rawArgs.difference_kg) != null && num(rawArgs.against_kg) != null
      ? { differenceKg: num(rawArgs.difference_kg)!, againstKg: num(rawArgs.against_kg)!, daysSince: Math.max(0, num(rawArgs.days_since) ?? 0) }
      : null
  const question = weighInQuestion(weightKg, date, readings, picture.anchors) ?? fromServer
  if (!question) return null

  const after = weighInStanding([...readings.filter(r => r.date !== date), { date, kg: weightKg }], picture.anchors)
  const willHold = heldWeighInOn(after, date) != null

  return {
    scopeKey: `${profileId}:propose_weigh_in:${date}`,
    preconditions: { date },
    payload: { date, weightKg },
    diff: {
      lead: weighInQuestionText(question, weightKg),
      rows: [{ field: 'Weigh-in', before: `${question.againstKg} kg`, after: `${weightKg} kg` }],
      implications: willHold ? [{ severity: 'info', text: WEIGH_IN_CARD_HOLD_LINE }] : [],
      reversible: false,
    },
  }
}

/** Her yes: the weigh-in is written, by the same one function the weigh-in box uses. */
export async function executeWeighIn(profileId: string, payload: WeighInPayload): Promise<{ receipt: PendingActionReceipt }> {
  try {
    await upsertDailyMetric({ profile_id: profileId, date: payload.date, weight_kg: payload.weightKg })
    return { receipt: { landed: [`Weigh-in: ${payload.weightKg} kg`], failed: [] } }
  } catch (err) {
    console.error('executeWeighIn: the weigh-in did not save', err)
    return { receipt: { landed: [], failed: [{ op: 'propose_weigh_in', error: "That weigh-in didn't save. Check your connection and give it another go." }] } }
  }
}
