import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { useTimers } from '@/hooks/useTimers'
import { getDoubleProgressionRecommendation, getAddedLoadProgression, type DoubleProgressionRecommendation } from '@/lib/progression-engine'
import { groupExercises, mainLiftGroupIndex, resolveCalibrationAnchorIndex, computeSessionSummary, type ExerciseGroup } from '@/lib/session-derive'
import { computeSessionPRs } from '@/lib/pr-engine'
import { getExerciseId } from '@/lib/exercise-db'
import { estimateDaySeconds } from '@/lib/session-duration'
import { describeSessionShortfall } from '@/lib/session-shortfall'
import { getLocalDateString } from '@/lib/dev-clock'
import { tabHash } from '@/lib/app-route'
import { ceilingToAskFor, saveStatedCeiling, declineStatedCeilings } from '@/lib/load-ceiling-prompt'
import { LoadCeilingPrompt } from './LoadCeilingPrompt'
import { WeekContextRow } from './WeekContextRow'
import { PeekPanel } from './PeekPanel'
import { SectionLabel, sectionLabelFor } from './ExerciseLine'
import { WarmupSection } from './WarmupSection'
import { ExerciseRow } from './ExerciseRow'
import { SupersetGroup } from './SupersetGroup'
import { FinisherRow } from './FinisherRow'
import { AdditionalWorkSection } from './AdditionalWorkSection'
import { AddUnplannedWork } from './AddUnplannedWork'
import { RestDayCard, ActiveRecoveryCard } from './RestDayCard'
import { SessionSummaryDialog, type SessionSummaryData } from './SessionSummaryDialog'
import { InsightBanner } from '@/components/ui/insight-banner'
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
  planCreatedAt,
  devOverrideDay,
  onOpenProgram,
  onOpenSwap,
  onBanExercise,
  onOpenPlateCalc,
  onOpenHistory,
  onOpenDetail,
  onOpenSessionHistory,
}: {
  plan: WorkoutDay[]
  mesocycle?: MesocycleWeek[]
  exclusions: string[]
  profile?: UserProfile
  profileId?: string
  /** When this plan came into being — days before it were never prescribed. */
  planCreatedAt?: string
  devOverrideDay?: string | null
  onOpenProgram: () => void
  onOpenSwap: (dayName: string, exIndex: number, exerciseName: string) => void
  onBanExercise: (exerciseName: string) => void | Promise<void>
  onOpenPlateCalc: (weightKg: number) => void
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
  /** Opens the technique panel — threaded to both ExerciseRow and PeekPanel. */
  onOpenDetail?: (exerciseName: string) => void
  onOpenSessionHistory?: () => void
}) {
  const { date: today, dayName: todayName, liveWeek, startRest, setsFor, logs, status, startSession, finishSession } = useActiveSession()

  // Audit §6.4 — hold the screen awake for as long as the session is
  // actually running, and no longer. Before this the phone dimmed and locked
  // on its normal schedule mid-set, so the user unlocked it between every
  // set. Best-effort: silently does nothing where the browser doesn't
  // support it (see useWakeLock).
  useWakeLock(status === 'running')
  const timers = useTimers()

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
  // Turn 5: "Add unplanned work" moved from an always-visible bottom button
  // to the day-level "⋮" menu (WeekContextRow) — this is that controlled
  // open state.
  const [unplannedWorkOpen, setUnplannedWorkOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryData, setSummaryData] = useState<SessionSummaryData | null>(null)
  const [summaryNothingLogged, setSummaryNothingLogged] = useState(false)

  const handleFinish = async () => {
    const result = await finishSession()
    if (!result || !workout) return
    if (result.nothingLogged) {
      // No summary to compute — the point is to say the day did not close.
      setSummaryData(null)
      setSummaryNothingLogged(true)
      setSummaryOpen(true)
      return
    }
    setSummaryNothingLogged(false)
    const plannedExercises = workout.exercises.map(ex => ({ id: ex.id, name: ex.name, sets: ex.sets }))
    const summary = computeSessionSummary(logs, plannedExercises, result.startedAtIso, result.finishedAtIso)
    const prs = computeSessionPRs(result.prSnapshotAtStart, logs)
    // "What next session prescribes" reuses the same function already called
    // above for the live progressedLoads badges — scoped to a date AFTER
    // today so today's own just-logged sets resolve as "last session" from
    // the function's point of view, per its documented `sessionDate`
    // contract (strictly-before lookup).
    const dayAfter = new Date(today)
    dayAfter.setDate(dayAfter.getDate() + 1)
    const dayAfterStr = getLocalDateString(dayAfter)
    // Same widening as the live rows above, and for the same reason: the
    // four lifts that take added weight were excluded from this filter too,
    // so "what next session prescribes" silently omitted them. One filter,
    // two call sites — the re-assert-at-every-path shape this codebase keeps
    // meeting.
    const progressions = await Promise.all(
      workout.exercises
        .filter(ex => ex.suggested_load_kg != null || ex.suggested_added_load_kg != null)
        .map(async ex => {
          const rec = ex.suggested_added_load_kg != null
            ? await getAddedLoadProgression(profileId!, ex.name, dayAfterStr, parseRepsHigh(ex.reps))
            : await getDoubleProgressionRecommendation(profileId!, ex.name, dayAfterStr, parseRepsHigh(ex.reps))
          return [ex.name, rec] as const
        })
    )
    setSummaryData({ summary, prs, progressions })
    setSummaryOpen(true)
  }

  // BottomDock's standalone-timer chip lives in a different subtree — same
  // cross-tree request pattern as useActiveSession's requestedSetFocus. Turn
  // 12 moved the Timers surface out of an Exercise-tab dialog and into the
  // Tools tab, so "reopen" now means navigating there instead of opening a
  // local dialog.
  useEffect(() => {
    if (timers.screenOpenRequested) {
      window.location.hash = tabHash('tools')
      timers.clearScreenOpenRequest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timers.screenOpenRequested])

  // Reset the warm-up collapse and any borrowed prescription whenever the
  // live day itself changes (a real day boundary, not a re-render).
  useEffect(() => {
    setExpandedWarmup(false)
    setBorrowedDayName(null)
  }, [todayName])

  const weekTrain = useTrainingWeek(profileId, today, liveWeekPlan, planCreatedAt)

  const effectiveDayName = borrowedDayName ?? todayName
  const workout = liveWeekPlan.find(d => d.day === effectiveDayName)
  const isRestDay = !workout
  const isActiveRecovery = !!workout && workout.exercises.length === 0

  // Week 2+ double progression — computed for the LIVE workout only, never
  // passed to the peek or program browse (§2.2/§7.4: those show
  // plan-derived loads and honest provenance only).
  const [progressedLoads, setProgressedLoads] = useState<Record<string, number>>({})
  // Its own map, never merged with progressedLoads: one is the weight of the
  // bar and the other is what you hang off yourself.
  const [progressedAddedLoads, setProgressedAddedLoads] = useState<Record<string, number>>({})
  const [progressionNotes, setProgressionNotes] = useState<Record<string, { note: string; didProgress: boolean }>>({})
  // Answered or dismissed THIS session. The durable record is on the profile;
  // this only stops the card lingering after a tap, since `profile` is a prop
  // and does not refetch mid-session.
  const [ceilingHandled, setCeilingHandled] = useState(false)
  useEffect(() => {
    if (!profileId || liveWeek <= 1 || !workout || workout.exercises.length === 0) {
      setProgressedLoads({})
      setProgressedAddedLoads({})
      setProgressionNotes({})
      return
    }
    let cancelled = false
    Promise.all(
      // A pull-up's suggested_load_kg is null, so this filter meant the
      // progression engine was NEVER asked about the four lifts that take
      // added weight — the read-back half of that loop was not merely
      // unwired, it was unreachable.
      workout.exercises
        .filter(ex => ex.suggested_load_kg != null || ex.suggested_added_load_kg != null)
        .map(async ex => {
          if (ex.suggested_added_load_kg != null) {
            const added = await getAddedLoadProgression(profileId, ex.name, today, parseRepsHigh(ex.reps))
            return [ex.name, added, 'added'] as const
          }
          const rec = await getDoubleProgressionRecommendation(profileId, ex.name, today, parseRepsHigh(ex.reps))
          return [ex.name, rec, 'load'] as const
        })
    ).then(results => {
      if (cancelled) return
      const nextLoads: Record<string, number> = {}
      const nextAdded: Record<string, number> = {}
      const nextNotes: Record<string, { note: string; didProgress: boolean }> = {}
      for (const [name, rec, kind] of results) {
        if (!rec) continue
        // Kept in separate maps on purpose: one is the weight of the bar,
        // the other is what you hang off yourself, and a consumer that
        // confused them would render "+15kg" as a 15kg lift.
        if (kind === 'added') nextAdded[name] = (rec as { addedKg: number }).addedKg
        else nextLoads[name] = (rec as { weightKg: number }).weightKg
        nextNotes[name] = { note: rec.note, didProgress: rec.didProgress }
      }
      setProgressedAddedLoads(nextAdded)
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

  // Turn 5: session-progress 2px line — total sets logged today across every
  // exercise on the live day, over total sets planned. Only meaningful (and
  // only rendered) for the live-session branch below; rest/recovery/peek
  // don't have a "sets" concept.
  const totalSetsPlanned = workout && !isRestDay && !isActiveRecovery ? workout.exercises.reduce((s, ex) => s + ex.sets, 0) : 0
  const totalSetsLogged = workout && !isRestDay && !isActiveRecovery
    ? workout.exercises.reduce((s, ex) => s + setsFor(ex.id ?? getExerciseId(ex.name), ex.name).length, 0)
    : 0

  // How long today actually is, and whether that is materially less than the
  // length this person asked for (audit §6.5). `estimatedMinutes` was already
  // a WeekContextRow prop and documented in its header — it had simply never
  // been passed, so the "~52 min" chip it describes never rendered at all.
  const sessionEstimate = (() => {
    if (!workout || workout.exercises.length === 0) return { minutes: undefined, shortfall: null }
    const seconds = estimateDaySeconds(workout)
    return {
      minutes: Math.round(seconds / 60),
      shortfall: describeSessionShortfall(seconds, profile?.session_duration_preference, {
        isDeload: currentMesoWeekObj?.is_deload,
        lowRecovery: profile?.recovery_capacity === 'low',
      }),
    }
  })()

  return (
    <div className="space-y-3">
      <WeekContextRow
        days={weekTrain.days}
        todayName={todayName}
        onSelectDay={d => setPeekDay(d)}
        weekNumber={liveWeek}
        totalWeeks={totalWeeks}
        blockNumber={currentMesoWeekObj?.block_number}
        phaseLabel={currentMesoWeekObj?.phase_label}
        isDeload={currentMesoWeekObj?.is_deload}
        isCalibrationWeek={currentMesoWeekObj?.isCalibrationWeek}
        phaseFocus={currentMesoWeekObj?.phase_focus}
        coachNote={currentMesoWeekObj?.coach_note}
        estimatedMinutes={sessionEstimate.minutes}
        shortfallNote={sessionEstimate.shortfall?.note}
        onOpenProgram={onOpenProgram}
        onAddUnplannedWork={!isRestDay && !isActiveRecovery && !peekWorkout ? () => setUnplannedWorkOpen(true) : undefined}
        onOpenSessionHistory={onOpenSessionHistory}
      />

      {peekWorkout ? (
        peekWorkout.exercises.length === 0 ? (
          <div className="rounded-xl bg-[color:var(--surface-deep)] p-4 text-center text-sm text-muted-foreground">
            {peekDay} is a rest or recovery day.
            <button className="block mx-auto mt-2 text-xs underline" onClick={() => setPeekDay(null)}>Back to today</button>
          </div>
        ) : (
          <PeekPanel
            workout={peekWorkout}
            onExit={() => setPeekDay(null)}
            onSwap={(exIndex, name) => peekDay && onOpenSwap(peekDay, exIndex, name)}
            onBan={handleBan}
            onOpenDetail={onOpenDetail}
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
        <div className="space-y-3">
          {/* Turn 5 hero block — supersedes IdentityLine's old day/focus text
              (now deleted; its timers entry point moved into WeekContextRow's
              "⋮" menu above). New: a 2px session-progress line under the
              title. */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.65625rem] uppercase tracking-[.2em] text-primary glow-mint">
                Today · {effectiveDayName}
              </span>
              {devOverrideDay && (
                <span className="text-[0.625rem] font-mono px-1.5 py-0.5 rounded border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] text-[color:var(--role-warn-text)]">
                  DEV · {devOverrideDay}
                </span>
              )}
              {borrowedDayName && (
                <span className="text-[0.625rem] text-muted-foreground italic">borrowed from {todayName}</span>
              )}
            </div>
            <p className="mt-1.5 text-[2.25rem] font-bold leading-[1.02] tracking-[-.035em] glow-text">{workout!.focus}</p>
            <div className="mt-3.5 h-[2px] rounded-full" style={{ background: 'var(--hairline)' }}>
              <div
                className="h-[2px] rounded-full bg-primary glow-mint-box"
                style={{ width: `${totalSetsPlanned > 0 ? Math.min(100, (totalSetsLogged / totalSetsPlanned) * 100) : 0}%` }}
              />
            </div>
            {status !== 'running' ? (
              <Button size="sm" className="mt-3" onClick={startSession}>Start session</Button>
            ) : (
              <Button size="sm" className="mt-3" onClick={handleFinish}>Finish session</Button>
            )}
          </div>
          <SessionSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} data={summaryData} nothingLogged={summaryNothingLogged} />
          {/* WHAT CAN YOU ACTUALLY LOAD — asked at first use, not in
              onboarding (Ashley's call: someone who has never trained cannot
              answer it, and onboarding is where people drop out). Rendered
              inline and scrollable-past on purpose: ignoring it is "not now",
              while "I'm not sure" is a deliberate tap that stops it for
              good. */}
          {profile && profileId && !ceilingHandled && (() => {
            const kind = ceilingToAskFor(profile, workout)
            if (!kind) return null
            return (
              <LoadCeilingPrompt
                kind={kind}
                className="mt-3"
                onSave={async kg => {
                  // Optimistic close either way. A write that fails because
                  // the migration is unapplied must not trap the trainee in a
                  // card that never goes away — the app simply keeps guessing,
                  // exactly as it did before.
                  await saveStatedCeiling(profileId, kind, kg)
                  setCeilingHandled(true)
                }}
                onDecline={async () => {
                  await declineStatedCeilings(profileId)
                  setCeilingHandled(true)
                }}
              />
            )
          })()}
          {workout!.pattern_gap_note && (
            <InsightBanner tone="warning" className="text-xs">
              {workout!.pattern_gap_note}
            </InsightBanner>
          )}
          {workout!.block_size_note && (
            <div className="flex items-start gap-2">
              <Clock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">{workout!.block_size_note}</p>
            </div>
          )}
          <WarmupSection warmup={workout!.warmup} open={expandedWarmup} onToggle={() => setExpandedWarmup(v => !v)} />
          <ExerciseList
            workout={workout!}
            dayName={effectiveDayName}
            currentMesoWeekObj={currentMesoWeekObj}
            progressedLoads={progressedLoads}
            progressedAddedLoads={progressedAddedLoads}
            progressionNotes={progressionNotes}
            onOpenSwap={onOpenSwap}
            onOpenPlateCalc={onOpenPlateCalc}
            onOpenHistory={onOpenHistory}
            onOpenDetail={onOpenDetail}
            banBusy={banBusy}
            onBan={handleBan}
            onSetCompleted={(exerciseName, setNumber, _weight, _reps, restStr, sets) => {
              const restSeconds = parseRestSeconds(restStr)
              if (restSeconds > 0) {
                const targetSetNumber = setNumber < sets ? setNumber + 1 : undefined
                startRest(exerciseName, restSeconds, targetSetNumber)
              }
            }}
          />
          {workout!.recommendedCardio && (
            <>
              <p className="ds-label-compact">Finish</p>
              <FinisherRow cardio={workout!.recommendedCardio} />
            </>
          )}
          <AdditionalWorkSection plannedExercises={workout!.exercises} />
          <AddUnplannedWork
            open={unplannedWorkOpen}
            onOpenChange={setUnplannedWorkOpen}
            hideTrigger
          />
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
  progressedAddedLoads,
  progressionNotes,
  onOpenSwap,
  onOpenPlateCalc,
  onOpenHistory,
  onOpenDetail,
  banBusy,
  onBan,
  onSetCompleted,
}: {
  workout: WorkoutDay
  dayName: string
  currentMesoWeekObj?: MesocycleWeek
  progressedLoads: Record<string, number>
  progressedAddedLoads: Record<string, number>
  progressionNotes: Record<string, { note: string; didProgress: boolean }>
  onOpenSwap: (dayName: string, exIndex: number, exerciseName: string) => void
  onOpenPlateCalc: (weightKg: number) => void
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
  onOpenDetail?: (exerciseName: string) => void
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
    // The progressed added weight REPLACES the plan's figure on the row, so a
    // trainee who hit their reps last week actually sees +17.5kg rather than
    // the plan's +15kg with a note about it. Substituted here, on a copy,
    // rather than mutating the plan — the peek and program-browse surfaces
    // deliberately show plan-derived numbers only.
    const progressedAdded = progressedAddedLoads[ex.name]
    const rowEx = progressedAdded != null && ex.suggested_added_load_kg != null
      ? { ...ex, suggested_added_load_kg: progressedAdded }
      : ex
    return {
      ex: rowEx,
      dayName,
      loadSource: loadSourceFor(ex),
      // A persisted block-level hold (VISION.md Step 4 — see block-review.ts)
      // takes precedence over the live single-session note: it reflects a
      // real judgment made across the whole prior block, not just whether
      // last session's sets hit the top of the rep range.
      progressionNote: ex.block_hold_note ? { note: ex.block_hold_note, didProgress: false } : progressionNotes[ex.name],
      showCalibrationCue: calibrationAnchorIndex === exIndex,
      onOpenPlateCalc,
      onOpenHistory,
      onOpenDetail,
      onSwap: () => onOpenSwap(dayName, exIndex, ex.name),
      onBan: () => onBan(ex.name),
      banBusy: banBusy === ex.name,
      onSetCompleted,
      expanded,
      onToggleExpanded: () => setExpandOverrides(prev => ({ ...prev, [exIndex]: !expanded })),
    }
  }

  // See PeekPanel for the reasoning — one definition, so a promoted main lift
  // can never appear on one screen and not the other.
  const firstMainLiftGroupIndex = mainLiftGroupIndex(groups, workout!.exercises)

  const isGroupExpanded = (g: ExerciseGroup) =>
    g.kind === 'single'
      ? rowProps(g.ex, g.exIndex).expanded
      : g.members.some(m => rowProps(m.ex, m.exIndex).expanded)

  // Tab-restructure handoff — meal-slot idiom: hairline-separated rows in
  // one column, not gap-separated cards. The section label picks up "· open"
  // + primary colour whenever a row inside its group is expanded, matching
  // MealPlan's slot-label treatment.
  return (
    <div className="flex flex-col">
      {groups.map((g, i) => {
        const expanded = isGroupExpanded(g)
        return (
          <div
            key={i}
            className={`flex flex-col gap-2.5 py-3 ${i > 0 ? '' : 'pb-3'}`}
            style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
          >
            <SectionLabel text={sectionLabelFor(g, i === firstMainLiftGroupIndex)} expanded={expanded} />
            {g.kind === 'single' ? (
              <ExerciseRow {...rowProps(g.ex, g.exIndex)} />
            ) : (
              <SupersetGroup
                label={g.label}
                members={g.members.map(m => ({ props: rowProps(m.ex, m.exIndex) }))}
              />
            )}
          </div>
        )
      })}
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
