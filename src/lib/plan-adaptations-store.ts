// ---------------------------------------------------------------------------
// I/O layer for plan_adaptations (mirrors pending-actions-store.ts's
// conventions). The shared time-bounded storage/revert mechanism both the
// injury and equipment adaptation features reuse — neither writes
// fitness_profiles.injuries or a user_facts ban row; see the migration's own
// doc comment for why a third store was needed here.
//
// Reversion is a check-on-load sweep, not a real timer — no scheduled-job
// infra exists in this codebase (pending-actions-store.ts's own
// expireOldPendingActions comment). Callers invoke
// checkAndRevertExpiredAdaptations once per mesocycle load (App.tsx).
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { saveMesocycleWeek } from './mesocycle-persistence'
import type { MesocycleWeek, UserProfile } from './types'
import { revertAdaptationChanges, adaptationConflictTest, type AdaptationRecord } from './plan-adaptations'
import type { DayGuard } from './plan-guard'

export type PlanAdaptationKind = 'injury' | 'equipment'
export type PlanAdaptationStatus = 'active' | 'ended_early' | 'expired'

export interface PlanAdaptationRow {
  id: string
  profile_id: string
  kind: PlanAdaptationKind
  status: PlanAdaptationStatus
  injury_code: string | null
  equipment_override: string | null
  severity: string | null
  reason: string | null
  affected_week_numbers: number[]
  /**
   * What ending this adaptation must put back. An `AdaptationRecord` (each
   * changed day and slot) since 9 Oct 2026; whole weeks on older rows. A JSON
   * column, so the new shape needed no migration. Read by
   * `revertAdaptationChanges`, which understands both.
   */
  pre_image: AdaptationRecord | MesocycleWeek[]
  pending_action_id: string | null
  starts_at: string
  expires_at: string
  ended_at: string | null
  created_at: string
}

export interface CreatePlanAdaptationInput {
  profileId: string
  kind: PlanAdaptationKind
  injuryCode?: string | null
  equipmentOverride?: string | null
  severity?: string | null
  reason?: string | null
  /** The weeks touched — kept so older readers of the row still make sense of it. */
  affectedWeekNumbers: number[]
  /** Each day and slot this adaptation changed. See `AdaptationRecord`. */
  record: AdaptationRecord
  pendingActionId?: string | null
  durationDays: number
}

export async function createPlanAdaptation(input: CreatePlanAdaptationInput): Promise<PlanAdaptationRow> {
  const startsAt = new Date()
  const expiresAt = new Date(startsAt.getTime() + input.durationDays * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('plan_adaptations')
    .insert({
      profile_id: input.profileId,
      kind: input.kind,
      status: 'active',
      injury_code: input.injuryCode ?? null,
      equipment_override: input.equipmentOverride ?? null,
      severity: input.severity ?? null,
      reason: input.reason ?? null,
      affected_week_numbers: input.affectedWeekNumbers,
      pre_image: input.record,
      pending_action_id: input.pendingActionId ?? null,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data as PlanAdaptationRow
}

export async function getActiveAdaptations(profileId: string): Promise<PlanAdaptationRow[]> {
  const { data, error } = await supabase
    .from('plan_adaptations')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (error || !data) return []
  return data as PlanAdaptationRow[]
}

/**
 * The live plan an adaptation is being ended against: what it holds NOW, which
 * days are already trained, and whose plan it is. Required, because ending is
 * a change to the plan like any other and obeys the same day guard.
 */
export interface LivePlan {
  mesocycle: MesocycleWeek[]
  isProtected: DayGuard
  profile: UserProfile
  /** Everything the person has banned — never put back by an ending. */
  exclusions: string[]
}

/**
 * Ends an adaptation: puts back what IT changed, on days not yet trained, and
 * keeps anything the person has done to those days since. Shared by the
 * automatic expiry sweep and "End now". See `revertAdaptationChanges` for the
 * rule; this is only the claim-then-write around it.
 *
 * The conditional update (`.eq('status', 'active')`) runs FIRST and its result
 * is checked before any mesocycle write happens — two concurrent callers
 * (e.g. React StrictMode's dev-only double-invoke, or two open tabs) can
 * both SELECT the same row while it's still 'active'; only the update that
 * actually flips the row wins, and the loser returns null and writes
 * nothing, rather than both racing to write and both surfacing a duplicate
 * reversion message.
 *
 * AND IT PUTS THE ROW BACK IF THE RESTORE FAILS. Claiming first is what makes
 * the race safe, but it also means the row is already closed while the weeks
 * that undo the adaptation are still being written — and until 5 Sep 2026 a
 * failure there was permanent: the adaptation was marked expired, nothing
 * would ever sweep it again, and the trainee kept a plan reduced around an
 * injury they had recovered from, with no surface anywhere that could put it
 * back. Reopening costs one write on a path that only runs when something has
 * already gone wrong, and turns permanent loss into "the next load retries".
 */
async function revertAdaptation(profileId: string, row: PlanAdaptationRow, status: 'expired' | 'ended_early', live: LivePlan): Promise<MesocycleWeek[] | null> {
  const { data: updated } = await supabase
    .from('plan_adaptations')
    .update({ status, ended_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'active') // never double-revert a row another caller already resolved
    .select('id')
  if (!updated || updated.length === 0) return null

  const outcome = revertAdaptationChanges(
    live.mesocycle, row.pre_image, row.affected_week_numbers ?? [], live.isProtected, live.profile,
    adaptationConflictTest(row.kind, row.injury_code, row.equipment_override), live.exclusions,
  )
  try {
    await Promise.all(
      outcome.mesocycle
        .filter(week => outcome.changedWeeks.includes(week.week_number))
        .map(week => saveMesocycleWeek(profileId, week))
    )
  } catch (err) {
    console.error('Reverting an adaptation failed to restore the plan; reopening it so the next sweep retries:', err)
    // Best effort by necessity — if this write fails too the row stays
    // closed, which is the old behaviour and no worse. Not awaited into the
    // caller's result: either way this reversion did not happen, and saying
    // so is what stops the UI announcing one.
    await supabase
      .from('plan_adaptations')
      .update({ status: 'active', ended_at: null })
      .eq('id', row.id)
      .eq('status', status)
    return null
  }
  return outcome.mesocycle
}

export interface RevertResult {
  /** The whole plan after the ending(s), or null when nothing ended. */
  mesocycle: MesocycleWeek[] | null
  messages: string[]
}

/**
 * Check-on-load sweep — call once per mesocycle load (App.tsx). Ends every
 * adaptation whose expires_at has passed and returns the plan as it now
 * stands, with a human message per ended adaptation for the caller to surface
 * (never model prose — client-authored, matching the existing receipt
 * convention). Adaptations are ended one after another against the running
 * result, so two that overlap cannot overwrite each other's ending.
 */
export async function checkAndRevertExpiredAdaptations(profileId: string, live: LivePlan): Promise<RevertResult> {
  const { data, error } = await supabase
    .from('plan_adaptations')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
  if (error || !data || data.length === 0) return { mesocycle: null, messages: [] }

  const messages: string[] = []
  let current: MesocycleWeek[] | null = null
  for (const row of data as PlanAdaptationRow[]) {
    const restored = await revertAdaptation(profileId, row, 'expired', { ...live, mesocycle: current ?? live.mesocycle })
    if (!restored) continue // another caller already won this row's revert
    current = restored
    messages.push(describeReversion(row))
  }
  return { mesocycle: current, messages }
}

/**
 * "End now" — the coach has always said "tell me anytime to end it early",
 * and until 9 Oct 2026 nothing called this. Profile's line, the Exercise tab's
 * line and the coach's "recovered" card all do now.
 */
export async function endAdaptationEarly(profileId: string, adaptationId: string, live: LivePlan): Promise<RevertResult> {
  const { data } = await supabase.from('plan_adaptations').select('*').eq('id', adaptationId).eq('profile_id', profileId).maybeSingle()
  if (!data || data.status !== 'active') return { mesocycle: null, messages: [] }
  const row = data as PlanAdaptationRow
  const restored = await revertAdaptation(profileId, row, 'ended_early', live)
  if (!restored) return { mesocycle: null, messages: [] }
  return { mesocycle: restored, messages: [describeReversion(row)] }
}

function describeReversion(row: PlanAdaptationRow): string {
  if (row.kind === 'injury') return `Your adaptation for your ${row.injury_code?.replace('_', ' ')} ended — the usual exercises are back in the mix.`
  return `Your equipment adaptation ended — your plan is back to normal.`
}
