import { Suspense, useEffect, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { lazyWithReload } from '@/lib/chunk-reload'
import { getAppNow } from '@/lib/dev-clock'
import type { EquipmentAccess, UserProfile } from '@/lib/types'
import { type OwnWorkout, ownWorkoutsOn, subscribeOwnWorkouts, newOwnWorkout, ownWorkoutSummary, saveOwnWorkout } from '@/lib/own-workout'

// The workout screen is its own download: most days nobody opens it, and the app's first load stays as it was.
const OwnWorkoutSheet = lazyWithReload(() => import('./OwnWorkoutSheet'))

/**
 * A DAY'S OWN WORKOUTS, AND THE WAY TO START ONE (his request 25 Nov 2026; see own-workout.ts). Under the day's card:
 * every workout of his own on that date, then "Start your own workout" today ("Start a separate workout" beside the
 * plan's session), or "Log a workout you did" on a past day. A day ahead gets nothing yet: planning one ahead is the
 * next step ("My workouts").
 */
export function OwnWorkoutDay({ profileId, date, today, weekNumber, planHasSession, equipmentAccess, profile, exclusions }: {
  profileId: string | undefined
  date: string
  today: string
  weekNumber: number | null
  /** The plan has a session on this day (lifting or a planned activity), so his own is a SEPARATE one beside it. */
  planHasSession: boolean
  equipmentAccess?: EquipmentAccess | null
  profile?: UserProfile | null
  exclusions?: string[]
}) {
  const [list, setList] = useState<OwnWorkout[]>([])
  const [open, setOpen] = useState<OwnWorkout | null>(null)
  useEffect(() => {
    if (!profileId) return
    const read = () => setList(ownWorkoutsOn(profileId, date))
    read()
    return subscribeOwnWorkouts(read)
  }, [profileId, date])
  if (!profileId || date > today) return null

  const isToday = date === today
  const start = () => {
    const w = newOwnWorkout(date, isToday ? 'live' : 'after', getAppNow(profileId).toISOString())
    saveOwnWorkout(profileId, w)
    setOpen(w)
  }
  // A LIVE WORKOUT FROM AN EARLIER DAY opens as a log of that day: its ticks were that day's, and today's timers and
  // set numbers are not its own.
  const reopen = (w: OwnWorkout) => setOpen(w.date !== today && w.mode === 'live' ? { ...w, mode: 'after' } : w)

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="own-day">
      {list.map(w => (
        <button key={w.id} type="button" data-testid="own-day-workout" data-finished={w.finishedAtIso ? 'true' : 'false'} onClick={() => reopen(w)}
          className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-[0.65625rem] font-semibold uppercase tracking-[.18em] text-primary-text">
              {w.finishedAtIso || !isToday ? 'Your workout' : 'Your workout · in progress'}
            </span>
            <span className="mt-0.5 block truncate text-[1rem] font-semibold">{w.name || 'My workout'}</span>
            <span className="block text-[0.8125rem] text-muted-foreground" data-testid="own-day-summary">{ownWorkoutSummary(w)}</span>
          </span>
          <span className="shrink-0 text-[0.8125rem] font-semibold text-primary-text">{w.finishedAtIso || !isToday ? 'Open' : 'Continue'}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ))}
      <button type="button" data-testid="own-start" onClick={start}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-[0.875rem] font-semibold">
        <Plus className="size-4" aria-hidden />
        {!isToday ? 'Log a workout you did' : planHasSession ? 'Start a separate workout' : 'Start your own workout'}
      </button>
      {open && (
        <Suspense fallback={null}>
          <OwnWorkoutSheet
            profileId={profileId}
            workout={open}
            dayLabel={dayLabelFor(date, isToday)}
            weekNumber={weekNumber}
            dayName={weekdayOf(date)}
            markDayDone={!planHasSession}
            equipmentAccess={equipmentAccess}
            profile={profile}
            exclusions={exclusions}
            onClose={() => setOpen(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

function weekdayOf(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
}

function dayLabelFor(date: string, isToday: boolean): string {
  const d = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return isToday ? `Today · ${d}` : d
}
