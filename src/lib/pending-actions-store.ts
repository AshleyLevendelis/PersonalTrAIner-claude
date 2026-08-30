// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.2/§2.3 — the pending_actions CRUD layer. Trimmed
// to what Part 1-3's actual scope needs (see the plan's judgment calls): no
// proposal_artifacts side table, no subject_key/suppressed_until, no origin
// column. DB-backed (not a pure in-memory object) because "client-owned"
// is about AUTHORITY — the client decides, the model doesn't — not about
// storage location. An in-memory object dies on reload, which breaks both
// the persisted 10-minute undo window and "confirmed exactly once even on
// retry," both explicitly required.
//
// This module is intentionally thin — no local-first queue like
// set-log-store/meal-store. A proposal card is inherently a short-lived,
// online interaction (the model just responded); there is no offline-first
// requirement for creating or claiming a proposal the way there is for
// logging a set mid-workout.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

export type PendingActionClass = 'plan_mutation' | 'append' | 'clarification'
export type PendingActionStatus =
  | 'pending' | 'claimed' | 'executing' | 'done' | 'partial' | 'failed' | 'stale' | 'declined' | 'expired'

export interface DiffRow {
  field: string
  before: string
  after: string
  note?: string
}

export interface ProposalDiff {
  rows: DiffRow[]
  unchanged?: string[]
  implications?: { severity: 'info' | 'warn'; text: string }[]
  rationale?: string
  editable?: { field: string; options: string[] }[]
  reversible?: boolean
}

export interface PendingActionRow {
  id: string
  profile_id: string
  message_id: string | null
  action_class: PendingActionClass
  kind: string
  status: PendingActionStatus
  scope_key: string
  preconditions: Record<string, unknown>
  payload: Record<string, unknown>
  payload_version: number
  pre_image: unknown | null
  diff: ProposalDiff
  edited_payload: Record<string, unknown> | null
  result: PendingActionReceipt | null
  client_id: string | null
  expires_at: string
  created_at: string
  claimed_at: string | null
  resolved_at: string | null
}

export interface PendingActionReceipt {
  landed: string[]
  failed: { op: string; error: string }[]
}

const PENDING_WINDOW_MINUTES = 10

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface CreatePendingActionInput {
  profileId: string
  messageId?: string | null
  actionClass: PendingActionClass
  kind: string
  scopeKey: string
  preconditions: Record<string, unknown>
  payload: Record<string, unknown>
  preImage?: unknown
  diff: ProposalDiff
}

/**
 * Inserts a new pending_actions row. The partial unique index on
 * (profile_id, scope_key) WHERE status IN (pending,claimed,executing) means
 * a retried identical model call collides here — this function surfaces
 * that as returning the EXISTING open row instead of throwing, so a retry
 * never produces a duplicate card.
 */
export async function createPendingAction(input: CreatePendingActionInput): Promise<PendingActionRow> {
  // pre_image is mandatory only for kinds whose undo actually restores a
  // snapshot (propose_exercise_swap restores the mesocycle via
  // saveMesocycle/saveMesocycleWeek). propose_meal_swap's "undo" is just
  // flipping manualMealPicks back client-side — no DB write to reverse, so
  // no snapshot to capture. Keying this off `kind` rather than the whole
  // 'plan_mutation' class avoids the earlier version wrongly demanding a
  // mesocycle-shaped pre_image from every propose_* kind.
  const kindsRequiringPreImage = ['propose_exercise_swap', 'propose_injury_adaptation', 'propose_equipment_adaptation']
  if (kindsRequiringPreImage.includes(input.kind) && input.preImage === undefined) {
    throw new Error(`createPendingAction: pre_image is required for ${input.kind}`)
  }

  const expiresAt = new Date(Date.now() + PENDING_WINDOW_MINUTES * 60_000).toISOString()
  const { data, error } = await supabase
    .from('pending_actions')
    .insert({
      profile_id: input.profileId,
      message_id: input.messageId ?? null,
      action_class: input.actionClass,
      kind: input.kind,
      status: 'pending',
      scope_key: input.scopeKey,
      preconditions: input.preconditions,
      payload: input.payload,
      pre_image: input.preImage ?? null,
      diff: input.diff,
      client_id: generateClientId(),
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (!error) return data as PendingActionRow

  // 23505 = unique_violation on the open-scope_key index: an identical
  // proposal is already open. Return that row rather than surfacing an
  // error — the retry's intent is already represented.
  if (error.code === '23505') {
    const existing = await getOpenPendingActionForScope(input.profileId, input.scopeKey)
    if (existing) return existing
  }
  throw error
}

async function getOpenPendingActionForScope(profileId: string, scopeKey: string): Promise<PendingActionRow | null> {
  const { data } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('profile_id', profileId)
    .eq('scope_key', scopeKey)
    .in('status', ['pending', 'claimed', 'executing'])
    .maybeSingle()
  return (data as PendingActionRow | null) ?? null
}

export async function getPendingAction(id: string): Promise<PendingActionRow | null> {
  const { data } = await supabase.from('pending_actions').select('*').eq('id', id).maybeSingle()
  return (data as PendingActionRow | null) ?? null
}

/**
 * `expired` is deliberately separate from `already_resolved` even though both
 * mean "this can't be applied now". They are different things to say to a
 * user — one is "you took too long", the other is "you already answered
 * this" — and collapsing them was half of why the Confirm button did nothing:
 * the caller had one branch for `stale` and no branch for anything else, so
 * every other outcome fell through to a bare `return` and the card kept
 * offering a button that could never work. See test:proposal-expiry.
 */
export type ClaimResult = { outcome: 'claimed'; row: PendingActionRow } | { outcome: 'stale' | 'not_found' | 'already_resolved' | 'expired' }

/**
 * The confirm-exactly-once gate. A double-tap or a retried confirm both
 * call this; only the FIRST call whose row is still `pending` transitions
 * it to `claimed` (the conditional UPDATE below is the atomicity — a
 * second concurrent call's UPDATE matches zero rows and falls through to
 * `already_resolved`). `checkPreconditions` re-verifies the fingerprint
 * captured at proposal time against the live plan; a mismatch marks the
 * row `stale` instead of claiming it.
 */
export async function claimPendingAction(
  id: string,
  checkPreconditions: (preconditions: Record<string, unknown>) => Promise<boolean>,
): Promise<ClaimResult> {
  const row = await getPendingAction(id)
  if (!row) return { outcome: 'not_found' }
  if (row.status === 'expired' || (row.status === 'pending' && new Date(row.expires_at) < new Date())) {
    await supabase.from('pending_actions').update({ status: 'expired' }).eq('id', id).eq('status', 'pending')
    return { outcome: 'expired' }
  }
  if (row.status !== 'pending') return { outcome: 'already_resolved' }

  const preconditionsOk = await checkPreconditions(row.preconditions)
  if (!preconditionsOk) {
    await supabase.from('pending_actions').update({ status: 'stale' }).eq('id', id).eq('status', 'pending')
    return { outcome: 'stale' }
  }

  const { data, error } = await supabase
    .from('pending_actions')
    .update({ status: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending') // atomicity: only the first caller to still see 'pending' wins
    .select()
    .maybeSingle()

  if (error || !data) return { outcome: 'already_resolved' }
  return { outcome: 'claimed', row: data as PendingActionRow }
}

export async function markExecuting(id: string): Promise<void> {
  await supabase.from('pending_actions').update({ status: 'executing' }).eq('id', id)
}

export async function resolvePendingAction(
  id: string,
  status: 'done' | 'partial' | 'failed',
  receipt: PendingActionReceipt,
): Promise<void> {
  await supabase
    .from('pending_actions')
    .update({ status, result: receipt, resolved_at: new Date().toISOString() })
    .eq('id', id)
}

export async function declinePendingAction(id: string): Promise<void> {
  await supabase.from('pending_actions').update({ status: 'declined', resolved_at: new Date().toISOString() }).eq('id', id)
}

/**
 * Called after ANY tap-driven mutation (SwapDialog confirm, ban button) on
 * the same target, per §2.3: "sweep pending proposals on the same target
 * and mark them stale immediately — so the user never taps Confirm on a
 * card invalidated by their own tap a second earlier."
 */
export async function sweepStaleForTarget(profileId: string, scopeKeyPrefix: string): Promise<void> {
  await supabase
    .from('pending_actions')
    .update({ status: 'stale' })
    .eq('profile_id', profileId)
    .in('status', ['pending', 'claimed'])
    .like('scope_key', `${scopeKeyPrefix}%`)
}

/** Lazy sweep — call on chat mount / load, not on a timer (no scheduled-job infra exists yet, per the vision doc's §7.4 gap). */
export async function expireOldPendingActions(profileId: string): Promise<void> {
  await supabase
    .from('pending_actions')
    .update({ status: 'expired' })
    .eq('profile_id', profileId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
}

/** Whether the post-confirm [Undo] window is still open — resolved_at + 10min, no separate column needed. */
export function isWithinUndoWindow(resolvedAt: string | null): boolean {
  if (!resolvedAt) return false
  return Date.now() - new Date(resolvedAt).getTime() < PENDING_WINDOW_MINUTES * 60_000
}
