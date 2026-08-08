// ---------------------------------------------------------------------------
// Structural fix — the "offer with no pending_actions row" gap: a
// non-imperative quote for record_fact/record_goal/add_to_grocery_list/
// check_off_grocery_item/log_water used to downgrade to a plain-text offer
// (no pending_actions row), so a later "yes" had nothing to resolve and went
// back through the model, which could fail the same classification again
// (the "never give it to me" memory-save loop). These append-style tools
// (no plan mutation, no mesocycle/profile resolution needed) now get the
// same treatment propose_* tools already had: a resolvable pending_actions
// row regardless of whether classifyImperative confidently classified the
// request. Pure and synchronous — no mesocycle/profile lookups needed,
// unlike buildExerciseSwapProposal/buildInjuryAdaptationProposal in
// ChatAssistant.tsx, which is why this lives in lib/ and is unit-testable
// without a fake Supabase harness.
// ---------------------------------------------------------------------------

import type { ProposalDiff } from './pending-actions-store'

export const APPEND_PROPOSAL_KINDS = new Set([
  'record_fact', 'record_goal', 'add_to_grocery_list', 'check_off_grocery_item', 'log_water',
])

export interface IntentProposal {
  scopeKey: string
  preconditions: Record<string, unknown>
  payload: Record<string, unknown>
  diff: ProposalDiff
}

/** kind -> verb, for the append-style proposal's confirmation headline (ChatAssistant.tsx's describeProposalClientSide). */
export const INTENT_PROPOSAL_VERB: Record<string, string> = {
  record_fact: 'remember',
  record_goal: 'save',
  add_to_grocery_list: 'add',
  check_off_grocery_item: 'check off',
  log_water: 'log',
}

/**
 * Builds a lightweight pending-action shape directly from a tool's rawArgs.
 * The payload is `{ tool, rawArgs }` — exactly the `intent` shape
 * resolveAndSaveMemory/Grocery/Water already accept, confirming this reuses
 * the SAME write path a successfully-classified request takes (via
 * ChatAssistant.tsx's handleConfirmProposal), just gated behind an explicit
 * confirm instead of running immediately.
 */
export function buildIntentProposal(kind: string, rawArgs: Record<string, unknown>, profileId: string): IntentProposal {
  const quote = typeof rawArgs.origin_verbatim_quote === 'string' && rawArgs.origin_verbatim_quote
    ? rawArgs.origin_verbatim_quote
    : JSON.stringify(rawArgs)
  let field = 'Do'
  let after = 'that'
  if (kind === 'record_fact') {
    field = 'Remember'
    after = String(rawArgs.target_phrase || rawArgs.timing_subject || 'that')
  } else if (kind === 'record_goal') {
    field = 'Set goal'
    after = String(rawArgs.description || rawArgs.metric_ref || 'that goal')
  } else if (kind === 'add_to_grocery_list') {
    field = 'Add to list'
    const items = Array.isArray(rawArgs.items) ? (rawArgs.items as { name?: string }[]).map(i => i.name).filter(Boolean).join(', ') : ''
    after = items || 'that'
  } else if (kind === 'check_off_grocery_item') {
    field = 'Check off'
    after = String(rawArgs.item_phrase || 'that')
  } else if (kind === 'log_water') {
    field = 'Log water'
    const amount = typeof rawArgs.amount_ml === 'number' && rawArgs.amount_ml > 0 ? Math.round(rawArgs.amount_ml) : 250
    after = `${amount}ml`
  }
  return {
    scopeKey: `${profileId}:${kind}:${quote}`,
    preconditions: {},
    payload: { tool: kind, rawArgs },
    diff: { rows: [{ field, before: '', after }], implications: [], reversible: false },
  }
}
