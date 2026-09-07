import { useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { useTimers } from '@/hooks/useTimers'
import { getDoubleProgressionRecommendation, getAddedLoadProgression, type DoubleProgressionRecommendation } from '@/lib/progression-engine'
import { groupExercises, mainLiftGroupIndex, resolveCalibrationAnchorIndex, computeSessionSummary, type ExerciseGroup } from '@/lib/session-derive'
import { sessionNudge } from '@/lib/session-nudge'
import { TrainerNudge } from '@/components/TrainerNudge'
import { calibrationCueText } from './CalibrationCue'
import { computeSessionPRs } from '@/lib/pr-engine'
import { getExerciseId } from '@/lib/exercise-db'
import { estimateDaySeconds } from '@/lib/session-duration'
import { describeSessionShortfall } from '@/lib/session-shortfall'
import { effectiveRecoveryCapacity, volumeNotice, activityCountsAsLoad, countWorkingSets } from '@/lib/concurrent-activity'
import { generateMesocycle, setRandomSource, resetRandomSource } from '@/lib/exercise-plan'
import { seededRngFromKey } from '@/lib/seeded-random'
import { executeSecondSportVolume } from '@/lib/pending-action-executor'
import { getLocalDateString } from '@/lib/dev-clock'
import { tabHash } from '@/lib/app-route'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
import { useBottomDockHeight } from '@/hooks/useBottomDockHeight'
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
  onMesocycleUpdated,
  onProfileChanged,
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
  /** Fired when steps are logged here, so the always-mounted chat tab re-reads them. */
  devOverrideDay?: string | null
  onOpenProgram: () => void
  onOpenSwap: (dayName: string, exIndex: number, exerciseName: string) => void
  onBanExercise: (exerciseName: string) => void | Promise<void>
  onMesocycleUpdated?: (mesocycle: MesocycleWeek[]) => void
  onProfileChanged?: (patch: Partial<UserProfile>) => void
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
  // How tall BottomDock currently is, so the fixed CTA bar below rides above
  // it instead of under it — the same published height the chat composer uses.
  const { dockHeightPx } = useBottomDockHeight()
  // The week's phase-focus / note disclosure. Lifted out of WeekContextRow
  // because the clamped nudge below it opens the same thing — a "Do…" that
  // ends in an ellipsis has to lead somewhere, and chat is not where the rest
  // of that sentence is.
  const [weekNotesOpen, setWeekNotesOpen] = useState(false)

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
  const [summaryCloseFailed, setSummaryCloseFailed] = useState(false)

  const handleFinish = async () => {
    const result = await finishSession()
    if (!result || !workout) return
    setSummaryCloseFailed(!!result.serverCloseFailed)
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

  // THE SECOND-SPORT VOLUME NOTICE — Ashley's ruling, 6 Sep 2026: when a sport
  // counts as training load the plan comes down one recovery notch, the card
  // SAYS SO with the measured figure, and one tap reverts it. The figure is
  // measured, not the multiplier: two generations from the same seed that
  // differ only in keep_full_volume, so the gap is the notch and nothing else.
  // Costs nothing for anyone without a qualifying sport — the memo returns
  // before generating.
  const volume = profile ? volumeNotice(profile) : null
  const volumeNames = volume ? volume.names.join(' and ') : ''
  const [volumeBusy, setVolumeBusy] = useState(false)
  const [volumeError, setVolumeError] = useState<string | null>(null)
  const volumeReduction = useMemo(() => {
    if (!profile || !volume || volume.atFloor || !hasMesocycle) return null
    const activities = profile.concurrent_activities ?? []
    const variant = (keepFull: boolean): UserProfile => ({
      ...profile,
      concurrent_activities: activities.map(a => activityCountsAsLoad(a) ? { ...a, keep_full_volume: keepFull } : a),
    })
    const seededWeek = (p: UserProfile) => {
      setRandomSource(seededRngFromKey(`volume-notice:${profileId ?? 'anon'}`))
      const l = console.log; console.log = () => {}
      try {
        const meso = generateMesocycle(p)
        return meso.find(w => w.week_number === liveWeek && !w.is_deload) ?? meso.find(w => !w.is_deload)
      } finally { console.log = l; resetRandomSource() }
    }
    const full = countWorkingSets(seededWeek(variant(true)))
    const reduced = countWorkingSets(seededWeek(variant(false)))
    if (full <= 0 || reduced >= full) return null
    return { full, reduced, pct: Math.round((1 - reduced / full) * 100) }
  }, [profile, volume, hasMesocycle, liveWeek, profileId])
  const handleVolumeToggle = async (keepFull: boolean) => {
    if (!profile || !mesocycle || !onMesocycleUpdated || !onProfileChanged || volumeBusy) return
    setVolumeBusy(true)
    setVolumeError(null)
    try {
      const result = await executeSecondSportVolume(profile, mesocycle, exclusions, { keepFullVolume: keepFull, fromWeek: liveWeek })
      if (result.receipt.failed.length > 0) { setVolumeError(result.receipt.failed[0].error); return }
      onMesocycleUpdated(result.mesocycle)
      onProfileChanged(result.profilePatch)
    } finally {
      setVolumeBusy(false)
    }
  }

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
        lowRecovery: !!profile && effectiveRecoveryCapacity(profile) === 'low',
      }),
    }
  })()

  // THE TRAINER'S LINE FOR TODAY (design_handoff_app_polish, Exercise §3).
  // Assembled here rather than in ExerciseList because the three sources live
  // at three different levels — the progression note is state on this
  // component, the calibration cue is a per-row fact, and the coach note
  // belongs to the week. The PRECEDENCE between them is sessionNudge's, so it
  // can be asserted; this only supplies today's three candidates.
  const todayNudge = (() => {
    if (!workout || isRestDay || isActiveRecovery || peekWorkout) return null
    const groups = groupExercises(workout.exercises)
    const mainIdx = mainLiftGroupIndex(groups, workout.exercises)
    const mainGroup = mainIdx >= 0 ? groups[mainIdx] : null
    const mainLift = mainGroup && mainGroup.kind === 'single' ? mainGroup.ex : null
    const anchorIdx = currentMesoWeekObj?.isCalibrationWeek
      ? resolveCalibrationAnchorIndex(workout.exercises)
      : null
    // Only when the cue is attached to THIS lift — otherwise the nudge would
    // give an instruction for a row further down the list without saying so.
    const cueIsOnMainLift = anchorIdx != null && mainLift != null && workout.exercises[anchorIdx] === mainLift
    return sessionNudge({
      mainLiftName: mainLift?.name ?? null,
      progressionNote: mainLift
        ? (mainLift.block_hold_note ?? progressionNotes[mainLift.name]?.note ?? null)
        : null,
      calibrationCue: cueIsOnMainLift
        ? calibrationCueText(mainLift!.suggested_load_kg != null)
        : null,
      coachNote: currentMesoWeekObj?.coach_note ?? null,
    })
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
        onOpenSessionHistory={onOpenSessionHistory}
        coachNoteShownBelow={todayNudge?.source === 'week-note'}
        expanded={weekNotesOpen}
        onToggleExpanded={setWeekNotesOpen}
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
          {volume && (
            <InsightBanner tone="ai" className="flex items-center justify-between gap-3" data-testid="second-sport-volume">
              <span className="text-sm">
                {volume.atFloor
                  ? `Recovery is already at its lowest setting, so ${volumeNames} changes the schedule, not the sets.`
                  : volume.reverted
                    ? `Full lifting volume kept despite ${volumeNames}.`
                    : volumeReduction
                      ? `Volume reduced ~${volumeReduction.pct}% for ${volumeNames} recovery — ${volumeReduction.reduced} of ${volumeReduction.full} working sets this week.`
                      : `Volume reduced one recovery notch for ${volumeNames} recovery.`}
              </span>
              {!volume.atFloor && onMesocycleUpdated && onProfileChanged && (
                <Button size="sm" variant="ghost" className="shrink-0" disabled={volumeBusy} onClick={() => handleVolumeToggle(!volume.reverted)}>
                  {volumeBusy ? 'Rebuilding…' : volume.reverted ? 'Reduce again' : 'Revert to full volume'}
                </Button>
              )}
            </InsightBanner>
          )}
          {volumeError && <p className="text-xs text-destructive">{volumeError} Nothing has changed.</p>}
          {/* Turn 5 hero block — supersedes IdentityLine's old day/focus text
              (now deleted; its timers entry point moved into WeekContextRow's
              "⋮" menu above). New: a 2px session-progress line under the
              title. */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.65625rem] uppercase tracking-[.2em] text-primary-text glow-mint">
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
            <div className="mt-3 h-[2px] rounded-full" style={{ background: 'var(--hairline)' }}>
              <div
                className="h-[2px] rounded-full bg-primary glow-mint-box"
                style={{ width: `${totalSetsPlanned > 0 ? Math.min(100, (totalSetsLogged / totalSetsPlanned) * 100) : 0}%` }}
              />
            </div>
            {/* START MOVED OUT OF THE HERO on 6 Sep 2026 — it is the fixed
                bar above the tab bar now (see the end of this branch), where
                it stays reachable after scrolling into the list. FINISH did
                not move: it belongs beside the thing it ends, and the dock
                already declines to carry a second entry point for it. */}
            {status === 'running' && (
              <>
                <Button size="sm" className="mt-3" onClick={handleFinish}>Finish session</Button>
                {/* The line between a look and a workout, said before Finish
                    is tapped rather than after: with nothing logged, Finish
                    closes the screen and counts nothing (useActiveSession).
                    Gone the moment a set lands. */}
                {totalSetsLogged === 0 && (
                  <p className="mt-2 text-xs leading-[1.5] text-muted-foreground">
                    Nothing logged yet — finishing now closes this screen without counting a workout. Log a set and it counts.
                  </p>
                )}
              </>
            )}
          </div>

          {/* THE TRAINER'S LINE, under the hero and above the list it is
              about — the progression note for today's main lift, the
              calibration instruction, or the week's note, whichever is the
              most specific thing true today (src/lib/session-nudge.ts). */}
          {todayNudge && (
            todayNudge.source === 'week-note'
              // Clamped, so its chevron must open the REST OF THIS SENTENCE
              // (the week disclosure above), never the chat tab.
              ? <TrainerNudge text={todayNudge.text} clamp={!weekNotesOpen} onOpen={weekNotesOpen ? undefined : () => setWeekNotesOpen(true)} />
              : <TrainerNudge text={todayNudge.text} openChat />
          )}
          <SessionSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} data={summaryData} nothingLogged={summaryNothingLogged} serverCloseFailed={summaryCloseFailed} />
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
          <AdditionalWorkSection plannedExercises={workout!.exercises} onOpenPlateCalc={onOpenPlateCalc} />
          {/* VISIBLE AGAIN, and the "⋮" menu no longer carries it. Turn 5 put
              it behind that menu; the polish handoff puts it back at the foot
              of the list, which is where someone finishing a session looks
              for "I also did…". One entry point either way. */}
          <button
            type="button"
            onClick={() => setUnplannedWorkOpen(true)}
            className="hit-slop-44 text-left text-[0.8125rem] text-text-tertiary"
          >
            ＋ Add unplanned work
          </button>
          <AddUnplannedWork
            open={unplannedWorkOpen}
            onOpenChange={setUnplannedWorkOpen}
            hideTrigger
          />
          {/* Clears the fixed CTA bar below, so the last row is never sitting
              underneath it. Matches the bar's own height plus its fade. */}
          {status !== 'running' && <div aria-hidden className="h-[100px]" />}
        </div>
      )}

      {/* THE PRIMARY ACTION, fixed above the tab bar. It used to be a small
          button in the hero, which scrolled away the moment anyone read past
          the first exercise — on a phone, the one control the screen exists
          for was off-screen for most of the screen. Rides above BottomDock
          when a timer is up, using the height the dock already publishes for
          the chat composer (useBottomDockHeight) rather than a second guess
          at how tall it is. */}
      {!peekWorkout && !isRestDay && !isActiveRecovery && workout && status !== 'running' && (
        <div
          className="fixed inset-x-0 z-40 px-[22px] pb-3 pt-2.5"
          style={{
            bottom: `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom) + ${dockHeightPx > 0 ? dockHeightPx + 12 : 0}px)`,
            background: 'linear-gradient(to top, var(--background) 70%, transparent)',
          }}
        >
          <Button className="h-[52px] w-full text-[0.9375rem] font-semibold" onClick={startSession}>
            Start workout
          </Button>
        </div>
      )}

      {/* STEPS MOVED TO HOME, 6 Sep 2026 — design_handoff_app_polish's
          "Today so far" grid, which logs them in place. The row is REMOVED
          here rather than left as a second writer: two tabs owning one number
          is the drift VISION-ARCHITECTURE §5.1a exists to stop, and this is
          the third move steps have made (see that section for why the
          destination changed and the rule did not). */}
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
      // Every row of a calibration week, not just the anchor: the cue lands
      // once, but the chip above the number has to say the same thing on all
      // of them.
      isCalibrationWeek: !!currentMesoWeekObj?.isCalibrationWeek,
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
