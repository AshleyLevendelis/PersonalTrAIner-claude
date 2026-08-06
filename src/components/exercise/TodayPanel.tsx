import { useEffect, useState } from 'react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { getDoubleProgressionRecommendation } from '@/lib/progression-engine'
import { groupExercises, resolveCalibrationAnchorIndex } from '@/lib/session-derive'
import { getExerciseId } from '@/lib/exercise-db'
import { ContextLine } from './ContextLine'
import { WeekStrip } from './WeekStrip'
import { PeekPanel } from './PeekPanel'
import { IdentityLine } from './IdentityLine'
import { WarmupSection } from './WarmupSection'
import { ExerciseRow } from './ExerciseRow'
import { SupersetGroup } from './SupersetGroup'
import { FinisherRow } from './FinisherRow'
import { AdditionalWorkSection } from './AdditionalWorkSection'
import { AddUnplannedWork } from './AddUnplannedWork'
import { RestDayCard, ActiveRecoveryCard } from './RestDayCard'
import type { WorkoutDay, MesocycleWeek, UserProfile } from '@/lib/types'
import type { LoadSource } from './LoadChip'

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §1 — what #/exercise opens to. One day, the session day,
// as the primary object. Assembles ContextLine + WeekStrip + (peek OR the
// day's content: rest/recovery card or the exercise list). progressedLoads
// is computed here, for today's workout only, and passed only to this
// surface — the peek and program browse never see it (§2.2, §7.4).
// ---------------------------------------------------------------------------

export function TodayPanel({
  plan,
  mesocycle,
  exclusions,
  profile,
  profileId,
  devOverrideDay,
  onOpenProgram,
  onOpenSwap,
  onBanExercise,
  onOpenPlateCalc,
}: {
  plan: WorkoutDay[]
  mesocycle?: MesocycleWeek[]
  exclusions: string[]
  profile?: UserProfile
  profileId?: string
  devOverrideDay?: string | null
  onOpenProgram: () => void
  onOpenSwap: (dayName: string, exIndex: number, exerciseName: string) => void
  onBanExercise: (exerciseName: string) => void | Promise<void>
  onOpenPlateCalc: (weightKg: number) => void
}) {
  const { date: today, dayName: todayName, liveWeek, startRest } = useActiveSession()

  const totalWeeks = mesocycle && mesocycle.length > 0 ? mesocycle.length : 4
  const hasMesocycle = mesocycle && mesocycle.length > 0
  const liveWeekPlan = hasMesocycle
    ? mesocycle.find(w => w.week_number === liveWeek)?.days || plan
    : plan
  const currentMesoWeekObj = hasMesocycle ? mesocycle.find(w => w.week_number === liveWeek) : undefined

  const [peekDay, setPeekDay] = useState<string | null>(null)
  const [borrowedDayName, setBorrowedDayName] = useState<string | null>(null)
  const [expandedWarmup, setExpandedWarmup] = useState(false)
  const [banBusy, setBanBusy] = useState<string | null>(null)

  // Reset the warm-up collapse and any borrowed prescription whenever the
  // live day itself changes (a real day boundary, not a re-render).
  useEffect(() => {
    setExpandedWarmup(false)
    setBorrowedDayName(null)
  }, [todayName])

  const weekTrain = useTrainingWeek(profileId, today, liveWeekPlan)

  const effectiveDayName = borrowedDayName ?? todayName
  const workout = liveWeekPlan.find(d => d.day === effectiveDayName)
  const isRestDay = !workout
  const isActiveRecovery = !!workout && workout.exercises.length === 0

  // Week 2+ double progression — computed for the LIVE workout only, never
  // passed to the peek or program browse (§2.2/§7.4: those show
  // plan-derived loads and honest provenance only).
  const [progressedLoads, setProgressedLoads] = useState<Record<string, number>>({})
  const [progressionNotes, setProgressionNotes] = useState<Record<string, { note: string; didProgress: boolean }>>({})
  useEffect(() => {
    if (!profileId || liveWeek <= 1 || !workout || workout.exercises.length === 0) {
      setProgressedLoads({})
      setProgressionNotes({})
      return
    }
    let cancelled = false
    Promise.all(
      workout.exercises
        .filter(ex => ex.suggested_load_kg != null)
        .map(async ex => {
          const rec = await getDoubleProgressionRecommendation(profileId, ex.name, today, parseRepsHigh(ex.reps))
          return [ex.name, rec] as const
        })
    ).then(results => {
      if (cancelled) return
      const nextLoads: Record<string, number> = {}
      const nextNotes: Record<string, { note: string; didProgress: boolean }> = {}
      for (const [name, rec] of results) {
        if (!rec) continue
        nextLoads[name] = rec.weightKg
        nextNotes[name] = { note: rec.note, didProgress: rec.didProgress }
      }
      setProgressedLoads(nextLoads)
      setProgressionNotes(nextNotes)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [profileId, liveWeek, workout, today])

  const tomorrowIdx = (DAY_ORDER.indexOf(todayName) + 1) % 7
  const tomorrowName = DAY_ORDER[tomorrowIdx]
  const tomorrowWorkout = liveWeekPlan.find(d => d.day === tomorrowName)
  const tomorrowPreview = tomorrowWorkout && tomorrowWorkout.exercises.length > 0
    ? { dayName: tomorrowName, focus: tomorrowWorkout.focus, exerciseCount: tomorrowWorkout.exercises.length }
    : undefined

  const trainAnywayOptions = liveWeekPlan
    .filter(d => d.exercises.length > 0 && d.day !== todayName)
    .map(d => d.day)

  const handleBan = async (name: string) => {
    setBanBusy(name)
    try {
      await onBanExercise(name)
    } finally {
      setBanBusy(null)
    }
  }

  const peekWorkout = peekDay ? liveWeekPlan.find(d => d.day === peekDay) : null

  return (
    <div className="space-y-3">
      <ContextLine
        weekNumber={liveWeek}
        totalWeeks={totalWeeks}
        blockNumber={currentMesoWeekObj?.block_number}
        phaseLabel={currentMesoWeekObj?.phase_label}
        isDeload={currentMesoWeekObj?.is_deload}
        isCalibrationWeek={currentMesoWeekObj?.isCalibrationWeek}
        phaseFocus={currentMesoWeekObj?.phase_focus}
        coachNote={currentMesoWeekObj?.coach_note}
        onOpenProgram={onOpenProgram}
      />
      <WeekStrip days={weekTrain.days} todayName={todayName} onSelectDay={d => setPeekDay(d)} />

      {peekWorkout ? (
        peekWorkout.exercises.length === 0 ? (
          <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
            {peekDay} is a rest or recovery day.
            <button className="block mx-auto mt-2 text-xs underline" onClick={() => setPeekDay(null)}>Back to today</button>
          </div>
        ) : (
          <PeekPanel
            workout={peekWorkout}
            onExit={() => setPeekDay(null)}
            onSwap={(exIndex, name) => peekDay && onOpenSwap(peekDay, exIndex, name)}
            onBan={handleBan}
            banBusyName={banBusy}
          />
        )
      ) : isRestDay ? (
        <RestDayCard
          dayName={todayName}
          weekTally={{ done: weekTrain.sessionsDone, planned: weekTrain.sessionsPlanned }}
          tomorrow={tomorrowPreview}
          onPeek={d => setPeekDay(d)}
          trainAnywayOptions={trainAnywayOptions}
          onTrainAnyway={setBorrowedDayName}
        />
      ) : isActiveRecovery ? (
        <ActiveRecoveryCard
          workout={workout!}
          weekTally={{ done: weekTrain.sessionsDone, planned: weekTrain.sessionsPlanned }}
          tomorrow={tomorrowPreview}
          onPeek={d => setPeekDay(d)}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="p-3 border-b">
            <IdentityLine
              dayName={effectiveDayName}
              focus={workout!.focus}
              devDay={devOverrideDay}
              borrowedFrom={borrowedDayName ? todayName : undefined}
            />
          </div>
          <WarmupSection warmup={workout!.warmup} open={expandedWarmup} onToggle={() => setExpandedWarmup(v => !v)} />
          <div className="p-3 space-y-2">
            <ExerciseList
              workout={workout!}
              dayName={effectiveDayName}
              currentMesoWeekObj={currentMesoWeekObj}
              progressedLoads={progressedLoads}
              progressionNotes={progressionNotes}
              onOpenSwap={onOpenSwap}
              onOpenPlateCalc={onOpenPlateCalc}
              banBusy={banBusy}
              onBan={handleBan}
              onSetCompleted={(exerciseName, _setNumber, _weight, _reps, restStr) => {
                const restSeconds = parseRestSeconds(restStr)
                if (restSeconds > 0) startRest(exerciseName, restSeconds)
              }}
            />
            {workout!.recommendedCardio && <FinisherRow cardio={workout!.recommendedCardio} />}
            <AdditionalWorkSection plannedExercises={workout!.exercises} />
            <AddUnplannedWork />
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseList({
  workout,
  dayName,
  currentMesoWeekObj,
  progressedLoads,
  progressionNotes,
  onOpenSwap,
  onOpenPlateCalc,
  banBusy,
  onBan,
  onSetCompleted,
}: {
  workout: WorkoutDay
  dayName: string
  currentMesoWeekObj?: MesocycleWeek
  progressedLoads: Record<string, number>
  progressionNotes: Record<string, { note: string; didProgress: boolean }>
  onOpenSwap: (dayName: string, exIndex: number, exerciseName: string) => void
  onOpenPlateCalc: (weightKg: number) => void
  banBusy: string | null
  onBan: (name: string) => void
  onSetCompleted: (exerciseName: string, setNumber: number, weight: number, reps: number, rest: string, sets: number, prescribedReps: string, tier?: string) => void
}) {
  const { setsFor } = useActiveSession()
  // User overrides only — the default expanded state (which exercise is
  // "current") is recomputed fresh every render from live logs below, so a
  // completed exercise's row auto-advances to the next incomplete one
  // without any explicit "mark done, move on" step.
  const [expandOverrides, setExpandOverrides] = useState<Record<number, boolean>>({})

  const groups = groupExercises(workout.exercises)
  const calibrationAnchorIndex = currentMesoWeekObj?.isCalibrationWeek
    ? resolveCalibrationAnchorIndex(workout.exercises)
    : null

  const loadSourceFor = (ex: WorkoutDay['exercises'][number]): LoadSource | undefined => {
    if (ex.suggested_load_kg == null) return undefined
    if (progressedLoads[ex.name] != null) return 'logged'
    return ex.load_source ?? 'estimate'
  }

  const isExerciseComplete = (ex: WorkoutDay['exercises'][number]) => {
    const exerciseId = ex.id ?? getExerciseId(ex.name)
    return setsFor(exerciseId, ex.name).length >= ex.sets
  }

  // Flat, in-order list across singles and superset members — "first
  // incomplete" spans the whole day, not just one group.
  const flatExIndexes: number[] = []
  for (const g of groups) {
    if (g.kind === 'single') flatExIndexes.push(g.exIndex)
    else for (const m of g.members) flatExIndexes.push(m.exIndex)
  }
  const flatComplete = new Map(groups.flatMap(g => g.kind === 'single' ? [[g.exIndex, isExerciseComplete(g.ex)] as const] : g.members.map(m => [m.exIndex, isExerciseComplete(m.ex)] as const)))
  const firstIncompleteExIndex = flatExIndexes.find(i => !flatComplete.get(i))

  const rowProps = (ex: WorkoutDay['exercises'][number], exIndex: number) => {
    const defaultExpanded = exIndex === firstIncompleteExIndex
    const expanded = exIndex in expandOverrides ? expandOverrides[exIndex] : defaultExpanded
    return {
      ex,
      dayName,
      loadSource: loadSourceFor(ex),
      progressionNote: progressionNotes[ex.name],
      showCalibrationCue: calibrationAnchorIndex === exIndex,
      onOpenPlateCalc,
      onSwap: () => onOpenSwap(dayName, exIndex, ex.name),
      onBan: () => onBan(ex.name),
      banBusy: banBusy === ex.name,
      onSetCompleted,
      expanded,
      onToggleExpanded: () => setExpandOverrides(prev => ({ ...prev, [exIndex]: !expanded })),
    }
  }

  return (
    <div className="space-y-2">
      {groups.map((g, i) =>
        g.kind === 'single' ? (
          <ExerciseRow key={i} {...rowProps(g.ex, g.exIndex)} />
        ) : (
          <SupersetGroup
            key={i}
            label={g.label}
            members={g.members.map(m => ({ props: rowProps(m.ex, m.exIndex) }))}
          />
        )
      )}
    </div>
  )
}

function parseRepsHigh(reps: string): number {
  const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) return parseInt(rangeMatch[2])
  const single = parseInt(reps)
  return isNaN(single) ? 12 : single
}

function parseRestSeconds(rest: string): number {
  const match = rest.match(/(\d+)/)
  return match ? parseInt(match[1]) : 60
}
