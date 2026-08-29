// ---------------------------------------------------------------------------
// NEVER A LIVE QUESTION BESIDE THE GENERATE BUTTON.
//
// Ashley photographed the coach asking "how much time do you want to spend
// cooking?" directly above a Generate My Plan button, with no way to tell
// whether she was finished or still being interviewed.
//
// Both halves were behaving as written, which is why neither looked wrong on
// its own. She had just answered dislikedFoods — the last slot that can hold
// a plan up — so complete_onboarding was legitimately accepted and the review
// legitimately opened. Meanwhile the model, handed a catalog introduced as
// "the answers you need", spent its reply text on cookingTime: unanswered,
// listed, and (unmarked, until now) incapable of delaying anything.
//
// Two definitions of finished, nothing keeping them in sync.
//
// The catalog now marks bonus slots and the prompt forbids finishing and
// asking in the same turn. This is the half that holds when the model does
// not comply. Once the review is open the app HAS everything it needs, so a
// question on screen is not untidy — it is untrue — and the app's own closing
// line replaces it.
// ---------------------------------------------------------------------------
import type { DraftMessage } from './onboarding-draft-store'

export const COMPLETE_MESSAGE =
  "That's everything I need. Here's what I've got — have a look, and if it's right I'll build your plan."

/** What the caller's messages must look like. Structural, so the component's
 *  ChatMsg (DraftMessage plus a local receipt marker) satisfies it as-is. */
export interface CompletableMessage extends DraftMessage {
  isReceipt?: boolean
}

/**
 * The same sweep, for a caller holding the WHOLE transcript rather than one
 * turn's new messages.
 *
 * THE HALF THE FIRST VERSION MISSED. Two independent paths open the review:
 * the model calling complete_onboarding (handled in the response handler,
 * which already has just this turn's messages), and the client's own safety
 * net — an effect that fires the moment readyToGenerate flips, whether or not
 * the model ever called anything. That net exists because the conversation
 * once went silent on the final answer with no way forward, so it can never
 * be removed; it simply had no sweep of its own, and Ashley photographed the
 * result a second time.
 *
 * Only the trailing turn is swept. Running the sweep over the full history
 * would rewrite questions the user already answered ten turns ago, turning a
 * finished conversation into a wall of identical closing lines — so the
 * boundary is the last user message, and everything before it is untouched.
 */
export function closeOutTrailingQuestions<T extends CompletableMessage>(messages: T[]): T[] {
  let lastUser = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUser = i; break }
  }
  const head = messages.slice(0, lastUser + 1)
  return [...head, ...closeOutOpenQuestions(messages.slice(lastUser + 1))]
}

/**
 * Strip every open question from the turn that opens the review.
 *
 * Returns a NEW array; inputs are not mutated, so a caller can diff before
 * and after. Receipts and user turns pass through untouched.
 *
 * Called once per turn AFTER all actions are applied, never from inside the
 * complete_onboarding branch: actions arrive in whatever order the model
 * emitted them, so a present_slot AFTER complete_onboarding would slip past a
 * check made mid-loop.
 */
export function closeOutOpenQuestions<T extends CompletableMessage>(messages: T[]): T[] {
  let saidIt = false
  const out: T[] = []
  for (const m of messages) {
    if (m.role !== 'assistant' || m.isReceipt) { out.push(m); continue }
    // A card is an invitation to answer something. Nothing is owed now.
    const cleaned = m.slotCard || m.slotCardEditing || m.asksSlot
      ? { ...m, slotCard: undefined, slotCardEditing: undefined, asksSlot: undefined }
      : m
    if (!cleaned.content.includes('?')) { out.push(cleaned); continue }
    // The first question becomes the app's closing line. Any further one is
    // dropped rather than repeating that same line twice in a row.
    if (saidIt) continue
    saidIt = true
    out.push({ ...cleaned, content: COMPLETE_MESSAGE })
  }
  return out
}
