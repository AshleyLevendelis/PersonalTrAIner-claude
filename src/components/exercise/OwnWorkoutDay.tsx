import { Suspense, useEffect, useState } from 'react'
import { ChevronRight, Footprints, Pencil, Plus } from 'lucide-react'
import { lazyWithReload } from '@/lib/chunk-reload'
import { getAppNow } from '@/lib/dev-clock'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getSetsForDates } from '@/lib/set-log-store'
import { getExerciseId } from '@/lib/exercise-db'
import type { EquipmentAccess, UserProfile } from '@/lib/types'
import { type OwnWorkout, ownWorkoutsOn, subscribeOwnWorkouts, newOwnWorkout, ownWorkoutSummary, saveOwnWorkout } from '@/lib/own-workout'
import {
  type OwnPlan, type PlansSync, ownPlans, subscribeOwnPlans, newOwnPlan, planSummary, setPlanOnDate, syncOwnPlans, workoutFromPlan,
} from '@/lib/own-workout-plans'
import { activeWalk, subscribeWalk, type WalkState } from '@/lib/walk-store'

// The workout screen and the builder are their own downloads: most days nobody opens them.
const OwnWorkoutSheet = lazyWithReload(() => import('./OwnWorkoutSheet'))
const OwnPlanEditor = lazyWithReload(() => import('./OwnPlanEditor'))
const WalkSheet = lazyWithReload(() => import('./WalkSheet'))

/** Read once a session per person: the table where phones meet (own-workout-plans.ts). */
const synced = new Map<string, Promise<PlansSync>>()

/**
 * A DAY'S OWN WORKOUTS, AND THE WAY TO START, LOG OR PLAN ONE (his request 25 Nov 2026; own-workout.ts and
 * own-workout-plans.ts). Under the day's card: every workout of his own done on that date, every saved workout he put on
 * it, then "Start your own workout" today ("Start a separate workout" beside the plan's), "Log a workout you did" on a
 * past day, or "Plan a workout" on a day ahead. Start opens a choice: an empty workout, or one of his saved ones.
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
  const session = useActiveSession()
  const [done, setDone] = useState<OwnWorkout[]>([])
  const [plans, setPlans] = useState<OwnPlan[]>([])
  const [sync, setSync] = useState<PlansSync | null>(null)
  const [open, setOpen] = useState<OwnWorkout | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [editing, setEditing] = useState<{ plan: OwnPlan; isNew: boolean } | null>(null)
  // A COUNTED WALK (walk-session.ts, his request 26 Nov 2026): one running or waiting for its effort tap is shown on its
  // own day with a Continue, so closing the walk screen never loses it.
  const [walk, setWalk] = useState<WalkState | null>(null)
  const [walkOpen, setWalkOpen] = useState(false)
  useEffect(() => { const read = () => setWalk(activeWalk()); read(); return subscribeWalk(read) }, [])
  useEffect(() => {
    if (!profileId) return
    const read = () => { setDone(ownWorkoutsOn(profileId, date)); setPlans(ownPlans(profileId)) }
    read()
    const a = subscribeOwnWorkouts(read)
    const b = subscribeOwnPlans(read)
    if (!synced.has(profileId)) synced.set(profileId, syncOwnPlans(profileId))
    let alive = true
    void synced.get(profileId)!.then(s => { if (alive) setSync(s) })
    return () => { alive = false; a(); b() }
  }, [profileId, date])
  if (!profileId) return null

  const isToday = date === today
  const ahead = date > today
  const nowIso = () => getAppNow(profileId).toISOString()
  // A saved workout put on this day and not yet started here.
  const onThisDay = plans.filter(p => p.onDates.includes(date) && !done.some(w => w.planId === p.id))

  const begin = (w: OwnWorkout) => { saveOwnWorkout(profileId, w); setChoosing(false); setOpen(w) }
  const startEmpty = () => begin(newOwnWorkout(date, isToday ? 'live' : 'after', nowIso()))
  // A SAVED WORKOUT STARTED: its sets numbered after the day's. Today the session's own logs say what is taken; a past
  // day is read first (a failed read numbers from the workout alone, and the log's write renumbers within itself).
  const startPlan = async (p: OwnPlan) => {
    let takenPast = new Map<string, number[]>()
    if (!isToday) {
      try {
        for (const l of (await getSetsForDates(profileId, [date])).get(date) ?? []) {
          const id = l.exercise_id ?? getExerciseId(l.exercise_name)
          takenPast.set(id, [...(takenPast.get(id) ?? []), l.set_number])
        }
      } catch { takenPast = new Map() }
    }
    const taken = (id: string) => isToday
      ? session.logs.filter(l => (l.exercise_id ?? getExerciseId(l.exercise_name)) === id).map(l => l.set_number)
      : takenPast.get(id) ?? []
    begin(workoutFromPlan(p, date, isToday ? 'live' : 'after', nowIso(), taken))
  }
  const reopen = (w: OwnWorkout) => setOpen(w.date !== today && w.mode === 'live' ? { ...w, mode: 'after' } : w)
  const pick = (p: OwnPlan) => {
    if (ahead) { setPlanOnDate(profileId, p.id, date, true, nowIso()); setChoosing(false); return }
    void startPlan(p)
  }

  const walkHere = walk && walk.userId === profileId && walk.date === date ? walk : null
  const startWalkNow = () => { setChoosing(false); setWalkOpen(true) }

  const startLabel = ahead ? 'Plan a workout' : !isToday ? 'Log a workout you did' : planHasSession ? 'Start a separate workout' : 'Start your own workout'

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="own-day">
      {done.map(w => (
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

      {walkHere && (
        <button type="button" data-testid="own-day-walk" onClick={() => setWalkOpen(true)}
          className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left">
          <Footprints className="size-5 shrink-0 text-primary-text" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.65625rem] font-semibold uppercase tracking-[.18em] text-primary-text">
              {walkHere.result ? 'Walk · finished' : 'Walk · in progress'}
            </span>
            <span className="block text-[0.8125rem] text-muted-foreground">{walkHere.result ? 'Tap to say how it felt and save it' : 'Counting your steps'}</span>
          </span>
          <span className="shrink-0 text-[0.8125rem] font-semibold text-primary-text">{walkHere.result ? 'Save' : 'Continue'}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      )}

      {/* HIS SAVED WORKOUTS PUT ON THIS DAY: Start today, Log it on a past day, take it off a day ahead. */}
      {onThisDay.map(p => (
        <div key={p.id} className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-card px-4 py-3" data-testid="own-day-planned" data-name={p.name}>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.65625rem] font-semibold uppercase tracking-[.18em] text-[color:var(--role-ai-text)]">Planned · your workout</span>
            <span className="mt-0.5 block truncate text-[1rem] font-semibold">{p.name}</span>
            <span className="block text-[0.8125rem] text-muted-foreground" data-testid="own-day-planned-summary">{planSummary(p)}</span>
          </span>
          {ahead ? (
            <button type="button" data-testid="own-day-unplan" onClick={() => setPlanOnDate(profileId, p.id, date, false, nowIso())} className="min-h-11 shrink-0 px-2 text-[0.8125rem] text-muted-foreground">Take off</button>
          ) : (
            <button type="button" data-testid="own-day-planned-start" onClick={() => void startPlan(p)}
              className="min-h-11 shrink-0 rounded-full px-4 text-[0.875rem] font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>{isToday ? 'Start' : 'Log it'}</button>
          )}
        </div>
      ))}

      {choosing ? (
        <div className="rounded-2xl bg-[color:var(--surface-deep)] p-3" data-testid="own-chooser">
          <p className="ds-label-compact mb-2">{ahead ? 'Put one of your workouts on this day' : 'Which workout?'}</p>
          <div className="flex flex-col gap-1.5">
            {!ahead && (
              <button type="button" data-testid="own-choose-empty" onClick={startEmpty} className="flex min-h-[52px] items-center gap-3 rounded-xl bg-card px-3.5 text-left">
                <Plus className="size-4 shrink-0" aria-hidden />
                <span className="flex-1"><span className="block text-[0.9375rem] font-semibold">Empty workout</span><span className="block text-[0.75rem] text-muted-foreground">Add exercises as you go</span></span>
              </button>
            )}
            {isToday && !walkHere && (
              <button type="button" data-testid="own-choose-walk" onClick={startWalkNow} className="flex min-h-[52px] items-center gap-3 rounded-xl bg-card px-3.5 text-left">
                <Footprints className="size-4 shrink-0" aria-hidden />
                <span className="flex-1"><span className="block text-[0.9375rem] font-semibold">Walk</span><span className="block text-[0.75rem] text-muted-foreground">Starts now, counts your steps and heart rate</span></span>
              </button>
            )}
            {plans.map(p => (
              <div key={p.id} className="flex min-h-[52px] items-center gap-2 rounded-xl bg-card pl-3.5" data-testid="own-choose-plan" data-name={p.name}>
                <button type="button" data-testid="own-choose-plan-go" onClick={() => pick(p)} className="flex min-h-[52px] flex-1 flex-col justify-center text-left">
                  <span className="text-[0.9375rem] font-semibold">{p.name}</span>
                  <span className="text-[0.75rem] text-muted-foreground">{planSummary(p)}</span>
                </button>
                <button type="button" aria-label={`Edit ${p.name}`} data-testid="own-choose-plan-edit" onClick={() => setEditing({ plan: p, isNew: false })} className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
                  <Pencil className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            <button type="button" data-testid="own-choose-build" onClick={() => setEditing({ plan: newOwnPlan(nowIso()), isNew: true })}
              className="flex min-h-11 items-center gap-2 px-1 text-[0.875rem] font-semibold text-primary-text">
              <Plus className="size-4" aria-hidden /> Build a new workout
            </button>
          </div>
          {sync === 'phone' && plans.length > 0 && (
            <p className="mt-2 text-[0.75rem] text-muted-foreground" data-testid="own-sync-phone">Saved on this phone. They reach your other phones once the update is switched on.</p>
          )}
          <button type="button" className="mt-1 min-h-11 text-[0.8125rem] text-muted-foreground" data-testid="own-chooser-cancel" onClick={() => setChoosing(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" data-testid="own-start" onClick={() => setChoosing(true)}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-[0.875rem] font-semibold">
          <Plus className="size-4" aria-hidden />
          {startLabel}
        </button>
      )}

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
      {walkOpen && (
        <Suspense fallback={null}>
          <WalkSheet profileId={profileId} date={date} dayLabel={dayLabelFor(date, isToday)} onClose={() => setWalkOpen(false)} />
        </Suspense>
      )}
      {editing && (
        <Suspense fallback={null}>
          <OwnPlanEditor
            profileId={profileId}
            plan={editing.plan}
            isNew={editing.isNew}
            equipmentAccess={equipmentAccess}
            profile={profile}
            exclusions={exclusions}
            // BUILT FROM A DAY AHEAD, IT GOES ON THAT DAY: that is why he opened it there.
            onSaved={p => { if (editing.isNew && ahead) setPlanOnDate(profileId, p.id, date, true, nowIso()); setEditing(null) }}
            onClose={() => setEditing(null)}
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
