// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §1 — the one writer for user_facts/user_goals/
// user_context_facts. Mirrors pending-actions-store.ts's "the edge function
// returns intent, the client writes" shape (I1): nothing in
// chat-gemini/index.ts ever inserts into these tables directly.
//
// Unlike set-log-store's local-first queue, this is a plain async CRUD
// layer — facts are written at most a few times per session (a stated
// preference, a goal), never in the tight bursts logging produces, so the
// offline-queue/dead-letter machinery that exists specifically to survive a
// mid-set connectivity drop has no problem to solve here. client_id still
// backs idempotency (a retried record_fact call collides on the DB's
// partial-unique index rather than duplicating a row) — just synchronously,
// not through a persisted queue.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

export type FactKind = 'food_preference' | 'exercise_preference' | 'timing_rule' | 'hard_constraint'
export type FactStatus = 'active' | 'superseded' | 'retired'
export type FactSource = 'chat' | 'manual' | 'onboarding'
export type Polarity = 'like' | 'dislike'
export type Hardness = 'hard' | 'soft'

export interface UserFactRow {
  id: string
  profile_id: string
  kind: FactKind
  status: FactStatus
  source: FactSource
  source_message_id: string | null
  raw_phrase: string
  display_text: string
  supersedes_id: string | null
  polarity: Polarity | null
  hardness: Hardness | null
  resolved_refs: string[] | null
  timing_subject: string | null
  timing_relation: 'before' | 'after' | null
  timing_anchor: 'training' | 'slot' | null
  timing_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  constraint_kind: 'availability' | 'equipment' | null
  weekday: string | null
  client_id: string | null
  created_at: string
  retired_at: string | null
}

export type GoalMetric = 'body_weight_kg' | 'lift_working_kg' | 'lift_1rm_kg' | 'sessions_per_week' | 'directional'
export type GoalTrackable = 'measurable' | 'directional'
export type GoalStatus = 'needs_baseline' | 'active' | 'achieved' | 'abandoned' | 'superseded'

export interface UserGoalRow {
  id: string
  profile_id: string
  metric: GoalMetric
  trackable: GoalTrackable
  metric_ref: string | null
  baseline_value: number | null
  baseline_captured_at: string | null
  baseline_source: 'logged_data' | 'user_stated' | null
  target_value: number | null
  target_date: string | null
  status: GoalStatus
  source: 'chat' | 'manual'
  source_message_id: string | null
  raw_phrase: string
  display_text: string
  supersedes_id: string | null
  client_id: string | null
  created_at: string
}

export interface UserContextFactRow {
  id: string
  profile_id: string
  raw_phrase: string
  display_text: string
  source: 'chat' | 'manual'
  source_message_id: string | null
  status: 'active' | 'retired'
  client_id: string | null
  created_at: string
  retired_at: string | null
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------------------------------------------------------------------------
// user_facts
// ---------------------------------------------------------------------------

export interface CreateFactInput {
  profileId: string
  kind: FactKind
  source: FactSource
  sourceMessageId?: string | null
  rawPhrase: string
  displayText: string
  polarity?: Polarity
  hardness?: Hardness
  resolvedRefs?: string[]
  timingSubject?: string
  timingRelation?: 'before' | 'after'
  timingAnchor?: 'training' | 'slot'
  timingSlot?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  constraintKind?: 'availability' | 'equipment'
  weekday?: string
}

export async function createFact(input: CreateFactInput): Promise<UserFactRow> {
  const { data, error } = await supabase
    .from('user_facts')
    .insert({
      profile_id: input.profileId,
      kind: input.kind,
      status: 'active',
      source: input.source,
      source_message_id: input.sourceMessageId ?? null,
      raw_phrase: input.rawPhrase,
      display_text: input.displayText,
      polarity: input.polarity ?? null,
      hardness: input.hardness ?? null,
      resolved_refs: input.resolvedRefs ?? null,
      timing_subject: input.timingSubject ?? null,
      timing_relation: input.timingRelation ?? null,
      timing_anchor: input.timingAnchor ?? null,
      timing_slot: input.timingSlot ?? null,
      constraint_kind: input.constraintKind ?? null,
      weekday: input.weekday ?? null,
      client_id: generateClientId(),
    })
    .select()
    .single()
  if (error) throw error
  return data as UserFactRow
}

export async function getActiveFacts(profileId: string): Promise<UserFactRow[]> {
  const { data, error } = await supabase
    .from('user_facts')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as UserFactRow[]
}

export async function getAllFacts(profileId: string): Promise<UserFactRow[]> {
  const { data, error } = await supabase
    .from('user_facts')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as UserFactRow[]
}

/** Soft-delete: retire, never hard-delete — matches the append-only/undo convention elsewhere (meal_events.voided_at). */
export async function retireFact(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_facts')
    .update({ status: 'retired', retired_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Undo for a just-created fact within the receipt's undo window — reverses createFact exactly. */
export async function unretireFact(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_facts')
    .update({ status: 'active', retired_at: null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteFactPermanently(id: string): Promise<void> {
  const { error } = await supabase.from('user_facts').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// user_goals
// ---------------------------------------------------------------------------

export interface CreateGoalInput {
  profileId: string
  metric: GoalMetric
  trackable: GoalTrackable
  metricRef?: string
  baselineValue?: number
  baselineSource?: 'logged_data' | 'user_stated'
  targetValue?: number
  targetDate?: string
  source: 'chat' | 'manual'
  sourceMessageId?: string | null
  rawPhrase: string
  displayText: string
}

export async function createGoal(input: CreateGoalInput): Promise<UserGoalRow> {
  const hasBaseline = input.baselineValue != null
  const status: GoalStatus = input.trackable === 'directional' ? 'active' : (hasBaseline ? 'active' : 'needs_baseline')
  const { data, error } = await supabase
    .from('user_goals')
    .insert({
      profile_id: input.profileId,
      metric: input.metric,
      trackable: input.trackable,
      metric_ref: input.metricRef ?? null,
      baseline_value: input.baselineValue ?? null,
      baseline_captured_at: hasBaseline ? new Date().toISOString() : null,
      baseline_source: input.baselineSource ?? null,
      target_value: input.targetValue ?? null,
      target_date: input.targetDate ?? null,
      status,
      source: input.source,
      source_message_id: input.sourceMessageId ?? null,
      raw_phrase: input.rawPhrase,
      display_text: input.displayText,
      client_id: generateClientId(),
    })
    .select()
    .single()
  if (error) throw error
  return data as UserGoalRow
}

export async function getActiveGoals(profileId: string): Promise<UserGoalRow[]> {
  const { data, error } = await supabase
    .from('user_goals')
    .select('*')
    .eq('profile_id', profileId)
    .in('status', ['active', 'needs_baseline'])
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as UserGoalRow[]
}

export async function getAllGoals(profileId: string): Promise<UserGoalRow[]> {
  const { data, error } = await supabase
    .from('user_goals')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as UserGoalRow[]
}

export async function abandonGoal(id: string): Promise<void> {
  const { error } = await supabase.from('user_goals').update({ status: 'abandoned' }).eq('id', id)
  if (error) throw error
}

export async function reactivateGoal(id: string, previousStatus: GoalStatus): Promise<void> {
  const { error } = await supabase.from('user_goals').update({ status: previousStatus }).eq('id', id)
  if (error) throw error
}

export async function deleteGoalPermanently(id: string): Promise<void> {
  const { error } = await supabase.from('user_goals').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// user_context_facts
// ---------------------------------------------------------------------------

export interface CreateContextFactInput {
  profileId: string
  source: 'chat' | 'manual'
  sourceMessageId?: string | null
  rawPhrase: string
  displayText: string
}

export async function createContextFact(input: CreateContextFactInput): Promise<UserContextFactRow> {
  const { data, error } = await supabase
    .from('user_context_facts')
    .insert({
      profile_id: input.profileId,
      raw_phrase: input.rawPhrase,
      display_text: input.displayText,
      source: input.source,
      source_message_id: input.sourceMessageId ?? null,
      status: 'active',
      client_id: generateClientId(),
    })
    .select()
    .single()
  if (error) throw error
  return data as UserContextFactRow
}

export async function getActiveContextFacts(profileId: string): Promise<UserContextFactRow[]> {
  const { data, error } = await supabase
    .from('user_context_facts')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as UserContextFactRow[]
}

export async function getAllContextFacts(profileId: string): Promise<UserContextFactRow[]> {
  const { data, error } = await supabase
    .from('user_context_facts')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as UserContextFactRow[]
}

export async function retireContextFact(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_context_facts')
    .update({ status: 'retired', retired_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function unretireContextFact(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_context_facts')
    .update({ status: 'active', retired_at: null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteContextFactPermanently(id: string): Promise<void> {
  const { error } = await supabase.from('user_context_facts').delete().eq('id', id)
  if (error) throw error
}
