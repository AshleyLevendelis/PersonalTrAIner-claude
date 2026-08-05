// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5.3 — daily_steps. Manual entry only this round
// (see the migration's doc comment for what real Health Connect/HealthKit
// integration would require and why it's out of scope here). One row per
// (profile, date) — a step count is a single daily figure, not an
// append-only log like water/meals — so this is a plain upsert, matching
// daily_metrics' own shape. Plain async, not local-first: a manual step
// entry happens at most once or twice a day, not in a tap-burst.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

export interface DailyStepsRow {
  id: string
  profile_id: string
  date: string
  steps: number
  source: 'manual' | 'health_connect' | 'healthkit'
  client_id: string | null
  created_at: string
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function getStepsForDate(profileId: string, date: string): Promise<DailyStepsRow | null> {
  const { data, error } = await supabase
    .from('daily_steps')
    .select('*')
    .eq('profile_id', profileId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data as DailyStepsRow | null
}

/** Manual entry — upserts on (profile_id, date), so re-entering today's count corrects it rather than duplicating a row. */
export async function logStepsManual(profileId: string, date: string, steps: number): Promise<DailyStepsRow> {
  const { data, error } = await supabase
    .from('daily_steps')
    .upsert({ profile_id: profileId, date, steps, source: 'manual', client_id: generateClientId() }, { onConflict: 'profile_id,date' })
    .select()
    .single()
  if (error) throw error
  return data as DailyStepsRow
}
