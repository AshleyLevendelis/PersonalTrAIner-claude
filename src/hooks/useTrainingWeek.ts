// ---------------------------------------------------------------------------
// The week strip's data source (LAYOUT-DESIGN.md §1.3/§5.2). A sibling to
// useActiveSession, not a member of it — this is READ-ONLY orientation data
// for the whole Mon-Sun window, not live session identity. Deliberately NOT
// bound to subscribeSyncState (see useActiveSession's doc comment on the
// same hazard): a save shouldn't refetch a whole week just to redraw one
// glyph — the caller overlays today's cell from its own setsFor result
// instead (see WeekStrip).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import { getWeeklyDashboard, type WeeklyDashboardDay } from '@/lib/daily-tracking'
import { getAppNow, getLocalDateString } from '@/lib/dev-clock'
import type { WorkoutDay } from '@/lib/types'

export type DayGlyphState = 'done' | 'partial' | 'due' | 'missed' | 'rest' | 'recovery'

export interface TrainingWeekDay {
  date: string
  dayName: string
  state: DayGlyphState
}

export interface TrainingWeekResult {
  days: TrainingWeekDay[]
  sessionsDone: number
  sessionsPlanned: number
  loading: boolean
  refresh: () => void
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

function classifyDay(
  weekdayName: string,
  dateStr: string,
  todayStr: string,
  plan: WorkoutDay[],
  dashboardDay: WeeklyDashboardDay | undefined,
): DayGlyphState {
  const workout = plan.find(d => d.day === weekdayName)
  if (!workout) return 'rest'
  if (workout.exercises.length === 0) return 'recovery'

  if (dashboardDay?.session?.is_completed) return 'done'
  if (dashboardDay && dashboardDay.workoutLogs.length > 0) return 'partial'
  return dateStr < todayStr ? 'missed' : 'due'
}

/**
 * `plan` should be the LIVE week's WorkoutDay[] (mesocycle week matching
 * liveWeek, or the flat base plan for a legacy/no-mesocycle profile) — this
 * hook only fetches log/session data, never plan data, matching the
 * ownership split in LAYOUT-DESIGN.md §5.5 (plan stays App-owned).
 */
export function useTrainingWeek(
  profileId: string | undefined,
  sessionDate: string,
  plan: WorkoutDay[],
): TrainingWeekResult {
  const [dashboard, setDashboard] = useState<WeeklyDashboardDay[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!profileId || !sessionDate) return
    const monday = mondayOf(new Date(sessionDate + 'T12:00:00'))
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    setLoading(true)
    getWeeklyDashboard(profileId, getLocalDateString(monday), getLocalDateString(sunday))
      .then(setDashboard)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [profileId, sessionDate])

  useEffect(() => {
    refresh()
  }, [refresh])

  const monday = sessionDate ? mondayOf(new Date(sessionDate + 'T12:00:00')) : new Date(getAppNow(profileId))
  const days: TrainingWeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const dateStr = getLocalDateString(d)
    const dayName = WEEKDAY_NAMES[d.getDay()]
    const dashboardDay = dashboard.find(dd => dd.date === dateStr)
    // Loading rule (§1.3): an un-logged training day must render 'due', never
    // 'missed', until the range read resolves — loading must not read as
    // failure. classifyDay already defaults an unmatched date to due/missed
    // by the real-vs-today comparison; while loading, dashboard is simply
    // empty, so every training day naturally falls through to its
    // date-based branch — for a PAST date that would wrongly say 'missed'
    // before data arrives, so gate explicitly on `loading`.
    const state = loading ? classifyLoadingSafe(dayName, plan) : classifyDay(dayName, dateStr, sessionDate, plan, dashboardDay)
    return { date: dateStr, dayName, state }
  })

  const trainingDays = days.filter(d => d.state !== 'rest' && d.state !== 'recovery')
  const sessionsPlanned = trainingDays.length
  const sessionsDone = trainingDays.filter(d => d.state === 'done').length

  return { days, sessionsDone, sessionsPlanned, loading, refresh }
}

function classifyLoadingSafe(weekdayName: string, plan: WorkoutDay[]): DayGlyphState {
  const workout = plan.find(d => d.day === weekdayName)
  if (!workout) return 'rest'
  if (workout.exercises.length === 0) return 'recovery'
  return 'due'
}
