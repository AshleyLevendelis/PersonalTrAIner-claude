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
import type { MesocycleWeek } from './types'

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
  pre_image: MesocycleWeek[]
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
  affectedWeekNumbers: number[]
  preImage: MesocycleWeek[]
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
      pre_image: input.preImage,
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
 * Restores an adaptation's pre_image weeks and marks it resolved. Shared by
 * both the automatic expiry sweep and an early "I'm good now" end. The
 * conditional update (`.eq('status', 'active')`) runs FIRST and its result
 * is checked before any mesocycle write happens — two concurrent callers
 * (e.g. React StrictMode's dev-only double-invoke, or two open tabs) can
 * both SELECT the same row while it's still 'active'; only the update that
 * actually flips the row wins, and the loser returns null and writes
 * nothing, rather than both racing to write pre_image and both surfacing a
 * duplicate reversion message.
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
async function revertAdaptation(profileId: string, row: PlanAdaptationRow, status: 'expired' | 'ended_early'): Promise<MesocycleWeek[] | null> {
  const { data: updated } = await supabase
    .from('plan_adaptations')
    .update({ status, ended_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'active') // never double-revert a row another caller already resolved
    .select('id')
  if (!updated || updated.length === 0) return null

  try {
    await Promise.all(
      row.pre_image
        .filter(week => row.affected_week_numbers.includes(week.week_number))
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
  return row.pre_image
}

export interface RevertResult {
  mesocycle: MesocycleWeek[] | null
  messages: string[]
}

/**
 * Check-on-load sweep — call once per mesocycle load (App.tsx). Restores
 * every adaptation whose expires_at has passed, returns the merged
 * pre-image weeks (last writer wins per week number if adaptations overlap,
 * which the UI never lets happen today) and a human message per reverted
 * adaptation for the caller to surface (never model prose — client-authored,
 * matching the existing receipt convention).
 */
export async function checkAndRevertExpiredAdaptations(profileId: string): Promise<RevertResult> {
  const { data, error } = await supabase
    .from('plan_adaptations')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
  if (error || !data || data.length === 0) return { mesocycle: null, messages: [] }

  const messages: string[] = []
  let mergedWeeks: MesocycleWeek[] | null = null
  for (const row of data as PlanAdaptationRow[]) {
    const restored = await revertAdaptation(profileId, row, 'expired')
    if (!restored) continue // another caller already won this row's revert
    mergedWeeks = mergedWeeks ? mergeWeeks(mergedWeeks, restored) : restored
    messages.push(describeReversion(row))
  }
  return { mesocycle: mergedWeeks, messages }
}

export async function endAdaptationEarly(profileId: string, adaptationId: string): Promise<RevertResult> {
  const { data } = await supabase.from('plan_adaptations').select('*').eq('id', adaptationId).eq('profile_id', profileId).maybeSingle()
  if (!data || data.status !== 'active') return { mesocycle: null, messages: [] }
  const row = data as PlanAdaptationRow
  const restored = await revertAdaptation(profileId, row, 'ended_early')
  if (!restored) return { mesocycle: null, messages: [] }
  return { mesocycle: restored, messages: [describeReversion(row)] }
}

function mergeWeeks(a: MesocycleWeek[], b: MesocycleWeek[]): MesocycleWeek[] {
  const byWeek = new Map(a.map(w => [w.week_number, w]))
  for (const w of b) byWeek.set(w.week_number, w)
  return [...byWeek.values()].sort((x, y) => x.week_number - y.week_number)
}

function describeReversion(row: PlanAdaptationRow): string {
  if (row.kind === 'injury') return `Your adaptation for your ${row.injury_code?.replace('_', ' ')} ended — the usual exercises are back in the mix.`
  return `Your equipment adaptation ended — your plan is back to normal.`
}
