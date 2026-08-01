import type { MesocycleWeek, WorkoutDay } from './types'

// Pure MesocycleWeek <-> mesocycle_weeks row shape conversion, deliberately
// kept free of any Supabase import — mesocycle-persistence.ts (the actual IO
// layer) and scripts/test-mesocycle-roundtrip.ts (a plain-Node script, no
// Vite `import.meta.env`) both depend on this file.

export interface MesocycleWeekRow {
  profile_id: string
  week_number: number
  block_number: number | null
  week_in_block: number | null
  phase_label: string | null
  phase_focus: string | null
  coach_note: string | null
  is_deload: boolean
  is_calibration_week: boolean
  label: string
  days: WorkoutDay[]
}

export function toRow(profileId: string, week: MesocycleWeek): MesocycleWeekRow {
  return {
    profile_id: profileId,
    week_number: week.week_number,
    block_number: week.block_number ?? null,
    week_in_block: week.week_in_block ?? null,
    phase_label: week.phase_label ?? null,
    phase_focus: week.phase_focus ?? null,
    coach_note: week.coach_note ?? null,
    is_deload: week.is_deload ?? false,
    is_calibration_week: week.isCalibrationWeek ?? false,
    label: week.label,
    days: week.days,
  }
}

export function fromRow(row: MesocycleWeekRow): MesocycleWeek {
  return {
    week_number: row.week_number,
    block_number: row.block_number ?? undefined,
    week_in_block: row.week_in_block ?? undefined,
    phase_label: row.phase_label ?? undefined,
    phase_focus: row.phase_focus ?? undefined,
    coach_note: row.coach_note ?? undefined,
    is_deload: row.is_deload ?? undefined,
    isCalibrationWeek: row.is_calibration_week ?? undefined,
    label: row.label,
    days: row.days,
  }
}
