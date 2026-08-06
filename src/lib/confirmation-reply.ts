// ---------------------------------------------------------------------------
// Fix — confirmation-card stuck loop. Root cause (traced live): a free-text
// "Yes" reply to an open ProposalCard went back through the SAME
// imperative-classification/tool-calling pipeline as any other message. The
// model has no tool that means "the user just confirmed the pending
// proposal," so it re-called propose_exercise_swap; classifyImperative
// rejects "yes" (it can never contain an IMPERATIVE_VERBS match), which
// downgrades the call to a plain-text offer repeating the identical
// question — looping every time, since only "No" (which needs no tool call
// at all) could escape by accident.
//
// This module lets ChatAssistant.tsx intercept a CLEAR free-text yes/no
// BEFORE it ever reaches the model, resolving the open pending action
// directly — the exact same deterministic path tapping Confirm/Not now
// already uses. Deliberately conservative: whole-message match only,
// against closed word lists, so a longer or genuinely ambiguous reply
// ("actually can we do the whole block instead") falls through to the
// model rather than being silently misclassified.
// ---------------------------------------------------------------------------

export type ConfirmationVerdict = 'confirm' | 'decline' | 'ambiguous'

const AFFIRMATIVE_RE = /^(yes|yeah|yea|yep|yup|sure|confirm(?:ed)?|do it|go ahead|go for it|sounds good|okay|ok|k|correct|affirmative|please do|please|that works|works for me)[.!]?$/i
const NEGATIVE_RE = /^(no|nah|nope|not now|cancel|skip|never ?mind|stop|don'?t)[.!]?$/i

export function classifyConfirmationReply(text: string): ConfirmationVerdict {
  const trimmed = text.trim()
  if (!trimmed) return 'ambiguous'
  if (AFFIRMATIVE_RE.test(trimmed)) return 'confirm'
  if (NEGATIVE_RE.test(trimmed)) return 'decline'
  return 'ambiguous'
}
