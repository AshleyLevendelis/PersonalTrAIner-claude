import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { useTimers } from '@/hooks/useTimers'
import { getDoubleProgressionRecommendation, getAddedLoadProgression, withWorkingLoadKg, type DoubleProgressionRecommendation } from '@/lib/progression-engine'
import { groupExercises, mainLiftGroupIndex, resolveCalibrationAnchorIndex, computeSessionSummary, type ExerciseGroup } from '@/lib/session-derive'
import { sessionNudge } from '@/lib/session-nudge'
import { TrainerNudge } from '@/components/TrainerNudge'
import { calibrationCueText } from './CalibrationCue'
import { computeSessionPRs } from '@/lib/pr-engine'
import { getExerciseId } from '@/lib/exercise-db'
import { estimateDaySeconds, getSessionMaximumSeconds, getSessionMinimumSeconds } from '@/lib/session-duration'
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
// DEFERRED, the same trade the two nutrition sheets took on 14 Sep: a sheet
// nobody has opened yet has no business in the chunk that has to arrive before
// the first pixel. It costs one extra chunk header in the total and takes its
// whole weight off first paint.
const TightnessSheet = lazy(() => import('./TightnessSheet').then(m => ({ default: m.TightnessSheet })))
import type { TightnessAnswer } from './TightnessSheet'
import { tightnessWarmup, uncoveredNote } from '@/lib/tightness'
import { ExerciseRow } from './ExerciseRow'
import { SupersetGroup } from './SupersetGroup'
import { FinisherRow } from './FinisherRow'
import { isScheduledDay, dayDetail } from '@/lib/activity-day'
import { AdditionalWorkSection } from './AdditionalWorkSection'
import { AddUnplannedWork } from './AddUnplannedWork'
import { RestDayCard, ActiveRecoveryCard, MovedDayCard } from './RestDayCard'
import type { WhatHappenedTarget } from './WhatHappenedSheet'
import type { RemoveTarget } from './RemoveExerciseSheet'
import type { ReasonAnswer } from './EditReasonStep'
// NOT LAZY, DELIBERATELY — tried and measured 11 Sep 2026. Loading these two
// on demand saved nothing: ChatAssistant imports the same module statically
// for the coach's side of the same two operations, so the bundler keeps it in
// the main chunk either way, and the dynamic form only added an await between
// the tap and the sheet's cost line. The 13 kB is recorded in test:bundle.
import { removeExerciseFromSession, moveExerciseInSession, addExerciseToSession, peerProgrammingFor, type SessionEditResult } from '@/lib/session-edit'
import { describeEditImpact } from '@/lib/session-balance-cost'
import { shortenDayTo, mapTier } from '@/lib/exercise-plan'
import { rebuildDayAroundMainLift } from '@/lib/session-rebuild'
import { settleWeek } from '@/lib/settle-week'
import { adjustDayVolume, isVolumeAdjustable } from '@/lib/volume-adjust'
import { saveScopedEdit } from '@/lib/mesocycle-persistence'
import { executeCardioSession } from '@/lib/pending-action-executor'
import { recomputeLoad, type SwapScope } from '@/lib/mesocycle-edit'
import type { ExerciseEntry } from '@/lib/exercise-db'
// Split out of the app chunk, like onboarding and the dev page: a dialog
// opened from a menu item, by a person who has something to explain about a
// day — not a screen every load pays for. test:bundle holds the budget.
const WhatHappenedSheet = lazy(() => import('./WhatHappenedSheet').then(m => ({ default: m.WhatHappenedSheet })))
const RemoveExerciseSheet = lazy(() => import('./RemoveExerciseSheet').then(m => ({ default: m.RemoveExerciseSheet })))
// Same bargain as the two above: a sheet reached from one button at the foot
// of the list, carrying the whole exercise catalogue's search with it.
const AddExerciseSheet = lazy(() => import('./AddExerciseSheet').then(m => ({ default: m.AddExerciseSheet })))
import { getActiveMesocycleWeek } from '@/lib/calculations'
import { setSessionMove } from '@/lib/daily-tracking'
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
  logsVersion,
  onLogsUpdated,
  devOverrideDay,
  onOpenProgram,
  onOpenSwap,
  onBanExercise,
  onMesocycleUpdated,
  onInjury,
  onEquipment,
  onProfileChanged,
  onOpenPlateCalc,
  onOpenHistory,
  onOpenDetail,
  onOpenSessionHistory,
  onCalibrationSessionFinished,
}: {
  plan: WorkoutDay[]
  mesocycle?: MesocycleWeek[]
  exclusions: string[]
  profile?: UserProfile
  profileId?: string
  /** When this plan came into being — days before it were never prescribed. */
  planCreatedAt?: string
  /** App's logsVersion — bumped when the chat writes a move, a swap or a rest day, so this panel re-reads the week instead of drawing a stale day. */
  logsVersion?: number
  /** Fired when THIS panel changes a day (clearing a move), so Home and the chat re-read. */
  onLogsUpdated?: () => void
  /** Fired when steps are logged here, so the always-mounted chat tab re-reads them. */
  devOverrideDay?: string | null
  onOpenProgram: () => void
  onOpenSwap: (dayName: string, exIndex: number, exerciseName: string) => void
  onBanExercise: (exerciseName: string) => void | Promise<void>
  onMesocycleUpdated?: (mesocycle: MesocycleWeek[]) => void
  /**
   * "It hurts" — owned a level up, because the swap dialog needs the same
   * triage and lives beside this panel rather than inside it. See
   * ExerciseTab.applyInjury.
   */
  onInjury?: (answer: Extract<ReasonAnswer, { type: 'injury' }>) => Promise<string | null>
  /** "I haven't got the kit" — rebuild this week around a different tier. Same owner, same reason. */
  onEquipment?: (tier: string) => Promise<string | null>
  onProfileChanged?: (patch: Partial<UserProfile>) => void
  onOpenPlateCalc: (weightKg: number) => void
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
  /** Opens the technique panel — threaded to both ExerciseRow and PeekPanel. */
  onOpenDetail?: (exerciseName: string) => void
  onOpenSessionHistory?: () => void
  /**
   * Fired once a session with logged sets has closed. App uses it to write a
   * calibration week's heaviest set into the printed program (Ashley, 10 Sep
   * 2026: auto-apply from calibration week only). Fires for every closed
   * session; the callee decides whether the week was a calibration week.
   */
  onCalibrationSessionFinished?: (args: { date: string; dayName: string }) => void
}) {
  const { date: today, dayName: todayName, liveWeek, startRest, setsFor, logs, status, startSession, finishSession, tightAreas, setTightAreas } = useActiveSession()

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
  // "What happened?" — the day on screen (a peeked day, else today).
  const [whatHappened, setWhatHappened] = useState<WhatHappenedTarget | null>(null)
  // Taking one exercise out — the drop-or-swap sheet (her ruling, 11 Sep 2026).
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null)
  const [borrowedDayName, setBorrowedDayName] = useState<string | null>(null)
  const [expandedWarmup, setExpandedWarmup] = useState(false)
  const [tightOpen, setTightOpen] = useState(false)

  // COMPUTED HERE, NEVER STORED. The plan's warm-up is untouched; these exist
  // for as long as today's answer does and no longer. Injuries still veto a
  // drill, which is why the profile's list is handed in.
  const tightness = useMemo(
    () => tightnessWarmup(tightAreas, profile?.injuries ?? []),
    [tightAreas, profile?.injuries],
  )

  const handleTightness = async (a: TightnessAnswer) => {
    // THE TWO THAT ARE NOT ABOUT TIGHTNESS go straight to the triage that owns
    // them — the same handler the exercise row uses, so there is one pain path
    // in the app and not two. Ashley's ruling, 15 Sep 2026.
    if (a.type === 'red_flag') return                     // advice only; nothing moves
    if (a.type === 'injury') { if (onInjury) await onInjury(a); return }
    setTightAreas(a.type === 'tight' ? a.areas : [])
    // Open it, so the answer is visibly an answer rather than a sheet closing.
    if (a.type === 'tight') setExpandedWarmup(true)
  }
  const [banBusy, setBanBusy] = useState<string | null>(null)
  // Turn 5: "Add unplanned work" moved from an always-visible bottom button
  // to the day-level "⋮" menu (WeekContextRow) — this is that controlled
  // open state.
  const [unplannedWorkOpen, setUnplannedWorkOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
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
    onCalibrationSessionFinished?.({ date: today, dayName: workout.day })
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

  const weekTrain = useTrainingWeek(profileId, today, liveWeekPlan, planCreatedAt, logsVersion)

  const effectiveDayName = borrowedDayName ?? todayName
  // TODAY'S CELL, resolved by the hook that already holds the whole week.
  // Borrowing a day is a deliberate look at ANOTHER day's prescription, so it
  // stays a straight plan lookup — a move is a fact about a date, and there
  // is no date being borrowed.
  const todayCell = borrowedDayName ? undefined : weekTrain.days.find(d => d.date === today)
  // `session` is the moved-in session on the receiving end of a move, the
  // plan's own row on an ordinary day, and null on the ORIGIN of a move — and
  // on the origin it stays null. The first version let the plan lookup put the
  // session back "in case she still wanted it today"; Ashley, 8 Sep 2026: "it
  // didnt move my workout." A moved session leaves this screen. Borrowing a
  // day still works: it blanks todayCell above, so the plan lookup answers.
  const workout = todayCell?.movedTo
    ? undefined
    : (todayCell?.session ?? undefined) ?? liveWeekPlan.find(d => d.day === effectiveDayName)
  // WHAT THEY DID INSTEAD, if they told the coach. The week strip has drawn
  // this correctly all along; this panel read nothing, so on 8 Sep 2026 it
  // went on offering "Start workout" for a session Ashley had already
  // replaced with Muay Thai — the app agreeing with itself on one screen and
  // not the other. Same source as the glyph (useTrainingWeek), never a second
  // read of the same row.
  const swappedToday = weekTrain.days.find(d => d.date === today)?.state === 'swapped'
    ? (weekTrain.days.find(d => d.date === today)?.swappedForActivity || 'something else')
    : null

  // MOVED, the third thing that can have happened to today. Same source as the
  // glyph and the swap above — never a second read of the same row.
  const movedAwayTo = todayCell?.movedTo ?? null
  const movedInFrom = todayCell?.movedFrom ?? null
  const isMovedAway = movedAwayTo != null

  // "DO IT TODAY INSTEAD" — unmakes the move (MovedDayCard says why). The same
  // write the chat's Undo uses, then the same re-reads the chat triggers, so
  // the strip, Home and the coach all see an ordinary day again.
  /**
   * The two session edits that change the plan's SHAPE. Both run session-edit's
   * pure core, persist exactly the weeks the scope touched through the one
   * shared saver, and hand the result to App so every surface re-reads. A
   * refusal comes back as a sentence, not an exception — the sheet shows it and
   * nothing was written.
   */
  const applySessionEdit = async (
    next: SessionEditResult,
    scope: SwapScope,
  ): Promise<string | null> => {
    if (!profileId || !mesocycle) return 'No plan to edit.'
    if (!next.changed) return next.refusal ?? "That couldn't be changed."
    onMesocycleUpdated?.(next.mesocycle)
    try {
      await saveScopedEdit(profileId, next.mesocycle, liveWeek, scope)
    } catch (err) {
      console.error('[session-edit] save failed', err)
      onMesocycleUpdated?.(mesocycle)
      return "That didn't save — try again in a moment."
    }
    weekTrain.refresh()
    onLogsUpdated?.()
    return null
  }

  /**
   * "MAKE TODAY A CARDIO DAY" — the screen half of the coach's
   * propose_cardio_session, 15 Sep 2026.
   *
   * THE SAME EXECUTOR THE COACH'S CONFIRM CALLS, not a second implementation
   * of the same verb. That is what parity means here and it is also what stops
   * the two surfaces disagreeing about scope: executeCardioSession writes the
   * rest of the block from this week, both ways round.
   */
  const handleAddCardio = async (activity: string, minutes: number, targetRpe: number): Promise<string | null> => {
    if (!profileId || !profile || !mesocycle || mesocycle.length === 0) return 'No plan to add it to yet.'
    const result = await executeCardioSession(profile, mesocycle, {
      weekNumber: liveWeek,
      dayName: todayName,
      activity,
      minutes,
      targetRpe,
      scope: 'permanent',
    })
    if (result.receipt.failed.length > 0) return result.receipt.failed[0].error
    onMesocycleUpdated?.(result.mesocycle)
    weekTrain.refresh()
    onLogsUpdated?.()
    return null
  }

  const dropExercise = async (exIndex: number, scope: SwapScope): Promise<string | null> => {
    if (!profile || !mesocycle) return 'No plan to edit.'
    return applySessionEdit(
      removeExerciseFromSession({ mesocycle, profile, weekNumber: liveWeek, dayName: effectiveDayName, exIndex, scope }),
      scope,
    )
  }

  /**
   * "I'VE ONLY GOT 25 MINUTES TODAY" — 13 Sep 2026.
   *
   * Ashley's ruling: the main lift is protected and the accessory work at the
   * end comes out until it fits. shortenDayTo carries that; this is the route
   * from the day menu to it, through applySessionEdit like every other plan
   * edit on this screen, and with scope 'today' so the same day next week is
   * the full session again.
   *
   * settleWeek runs inside applySessionEdit's callee for the other edits; this
   * one goes through it explicitly, so a shortened day gets the same
   * hierarchy/coherence/warm-up/balance tail everything else does.
   */
  const shortenToday = async (minutes: number): Promise<string | null> => {
    if (!profile || !mesocycle) return 'No plan to edit.'
    const week = mesocycle.find(w => w.week_number === liveWeek)
    if (!week) return "I can't see this week on your plan just now."
    const result = shortenDayTo(week, effectiveDayName, profile, minutes)
    if (!result.changed) return result.refusal ?? "I couldn't shorten that one."
    const settled = settleWeek(result.week, effectiveDayName, profile)
    return applySessionEdit(
      { mesocycle: mesocycle.map(w => (w.week_number === liveWeek ? settled.week : w)), changed: true },
      'today',
    )
  }

  /**
   * "GIVE ME A DIFFERENT SESSION TODAY" — 16 Sep 2026.
   *
   * Ashley's ruling, from three options: keep the main lift and rebuild around
   * it. You still do today's main lift at the weight and sets already
   * prescribed; everything else changes. It matches her 13 Sep ruling for
   * shortening (protect the main lift, drop accessories), so the two
   * change-today verbs treat it the same way.
   *
   * rebuildDayAroundMainLift runs settleWeek itself — unlike shortenToday
   * above, which has to. Scope 'today', so the same day next week is the
   * session that was always planned.
   */
  const rebuildToday = async (): Promise<string | null> => {
    if (!profile || !mesocycle) return 'No plan to edit.'
    const result = await rebuildDayAroundMainLift({
      mesocycle, profile, weekNumber: liveWeek, dayName: effectiveDayName, exclusions,
    })
    if (!result.changed) return result.refusal ?? "I couldn't rebuild that one."
    const saved = await applySessionEdit({ mesocycle: result.mesocycle, changed: true }, 'today')
    if (saved) return saved
    // WHAT IT COULD NOT DO IS SAID, NOT SWALLOWED. A rebuild that quietly left
    // three exercises alone and reported success is the defect this codebase
    // keeps finding — the app knowing something and the screen saying nothing.
    const kept = result.kept.length
    const main = result.mainLift ? ` ${result.mainLift} is untouched, as planned.` : ''
    setRebuildNote(kept === 0
      ? `Rebuilt today — ${result.replaced.length} exercise${result.replaced.length === 1 ? '' : 's'} changed.${main} Back to the planned session next week.`
      : `Rebuilt today — ${result.replaced.length} changed, ${kept} stayed because nothing else fits ${kept === 1 ? 'that slot' : 'those slots'} with your equipment and injuries.${main} Back to the planned session next week.`)
    return null
  }

  /**
   * WHERE EACH ANSWER GOES. docs/how-the-app-talks-about-a-change.md §3's
   * table, and every destination already existed — this routes, it does not
   * build. The injury branch is the caller's because the swap dialog needs the
   * same one and lives a level up; see ExerciseTab.applyInjury.
   */
  const handleRemoveReason = async (a: ReasonAnswer): Promise<string | null> => {
    if (a.type === 'red_flag') return null       // advice only; the plan is untouched, deliberately
    if (a.type === 'injury') return onInjury ? onInjury(a) : 'I can\'t adjust for that just now.'
    if (a.type === 'equipment') return onEquipment ? onEquipment(a.tier) : 'I can\'t adjust for that just now.'
    switch (a.reason) {
      case 'no_time': return shortenToday(getSessionMinimumSeconds(profile?.session_duration_preference || '45-60') / 60)
      case 'tired': return lighterToday()
      // 'dislike' never reaches here — the sheet keeps its own drop/swap step
      // for it, because "and never again" is a different question from "what
      // goes in its place", and Ashley ruled on that one separately (11 Sep).
      default: return null
    }
  }

  /** One step lighter, this week's session only — the same tail, the same scope. */
  const lighterToday = async (): Promise<string | null> => {
    if (!profile || !mesocycle) return 'No plan to edit.'
    const week = mesocycle.find(w => w.week_number === liveWeek)
    const day = week?.days.find(d => d.day === effectiveDayName)
    if (!week || !day) return "I can't see today's session just now."
    if (!isVolumeAdjustable(week)) return "This is a deload week — it's already lighter on purpose."
    const result = adjustDayVolume(day, 'lighter', profile)
    if (!result.changed) {
      return result.blocked[0]
        ? `Nothing left to take out — ${result.blocked[0].name} is ${result.blocked[0].reason}.`
        : 'Every exercise is already at its minimum.'
    }
    const settled = settleWeek(
      { ...week, days: week.days.map(d => (d.day === effectiveDayName ? result.day : d)) },
      effectiveDayName,
      profile,
    )
    return applySessionEdit(
      { mesocycle: mesocycle.map(w => (w.week_number === liveWeek ? settled.week : w)), changed: true },
      'today',
    )
  }

  const [moveError, setMoveError] = useState<string | null>(null)
  const moveExercise = async (exIndex: number, direction: -1 | 1) => {
    if (!profile || !mesocycle) return
    // Reordering is a today-shaped act: it is about how THIS session runs, not
    // about the block. The coach takes the wider scope when asked for it.
    // A REFUSAL HAS TO LAND SOMEWHERE. Removing has a sheet to show it in;
    // moving is one tap on a menu item and then the menu is gone, so without
    // this a failed save would look exactly like a move that happened and
    // then un-happened — the silent write the app is not allowed to have.
    setMoveError(
      await applySessionEdit(
        moveExerciseInSession({ mesocycle, profile, weekNumber: liveWeek, dayName: effectiveDayName, fromIndex: exIndex, toIndex: exIndex + direction, scope: 'today' }),
        'today',
      ),
    )
  }

  /**
   * PUT ONE EXERCISE INTO THE SESSION — the last operation in the exercise
   * grain, and the only one that makes the day longer.
   *
   * Pricing happens here rather than inside session-edit because
   * `recomputeLoad` is async and that module is not. `peerProgrammingFor`
   * gives BOTH sides the same peer, so the weight on the card is computed for
   * the sets and reps the plan actually receives.
   *
   * The reset branch (`isMainLiftReset: true`) is right for any tier here:
   * it means "a movement with no history in this plan", and its basis already
   * reads "find your working weight this session".
   */
  const priceAddition = async (entry: ExerciseEntry) => {
    if (!profile || !mesocycle) return null
    const day = mesocycle.find(w => w.week_number === liveWeek)?.days.find(d => d.day === effectiveDayName)
    if (!day) return null
    const tier = mapTier(entry.mechanics_tier)
    const programming = peerProgrammingFor(day.exercises, tier)
    if (!programming) return null
    const load = await recomputeLoad(entry, profile, programming.intensity, programming.sets, programming.reps, true)
    return { load, day }
  }

  const addExercise = async (entry: ExerciseEntry, scope: SwapScope): Promise<string | null> => {
    if (!profile || !mesocycle) return 'No plan to edit.'
    const priced = await priceAddition(entry)
    if (!priced) return `I couldn't work out what to prescribe for ${entry.name} here.`
    return applySessionEdit(
      addExerciseToSession({ mesocycle, profile, weekNumber: liveWeek, dayName: effectiveDayName, entry, load: priced.load, scope }),
      scope,
    )
  }

  /**
   * What adding this one does to the week AND to the clock — read off a TRIAL
   * of the real edit, the same rule `removalBalanceCost` keeps below.
   *
   * ASHLEY'S RULING, 13 Sep 2026: the session gets longer and the app says so
   * rather than trimming something else to pay for it. The minutes come from
   * `estimateDaySeconds`, which is what the header prints, so the card and the
   * screen cannot disagree about one day's length.
   */
  const additionImpact = async (entry: ExerciseEntry) => {
    const nothing = { cost: null, balancing: null, minutes: null, overBy: null }
    if (!profile || !mesocycle) return nothing
    const priced = await priceAddition(entry)
    if (!priced) return nothing
    const result = addExerciseToSession({
      mesocycle, profile, weekNumber: liveWeek, dayName: effectiveDayName,
      entry, load: priced.load, scope: 'today',
    })
    if (!result.changed) return nothing
    const afterWeek = result.mesocycle.find(w => w.week_number === liveWeek)
    const afterDay = afterWeek?.days.find(d => d.day === effectiveDayName)
    const minutes = afterDay ? Math.round(estimateDaySeconds(afterDay) / 60) : null
    const capMinutes = Math.round(getSessionMaximumSeconds(profile.session_duration_preference) / 60)
    const overBy = minutes != null && minutes > capMinutes ? minutes - capMinutes : null
    return {
      ...describeEditImpact(mesocycle.find(w => w.week_number === liveWeek), afterWeek, effectiveDayName),
      minutes,
      overBy,
    }
  }

  /**
   * What dropping this one costs the week, and what the app will even out on
   * other days — both read off a TRIAL of the real edit, never a second
   * model of what the edit would do.
   */
  const removalBalanceCost = (exIndex: number, scope: SwapScope): { cost: string | null; balancing: string | null } => {
    const nothing = { cost: null, balancing: null }
    if (!profile || !mesocycle) return nothing
    const result = removeExerciseFromSession({ mesocycle, profile, weekNumber: liveWeek, dayName: effectiveDayName, exIndex, scope })
    if (!result.changed) return nothing
    return describeEditImpact(
      mesocycle.find(w => w.week_number === liveWeek),
      result.mesocycle.find(w => w.week_number === liveWeek),
      effectiveDayName,
    )
  }

  const openWhatHappened = () => {
    const dayName = peekDay ?? todayName
    const cell = weekTrain.days.find(d => d.dayName === dayName)
    if (cell) setWhatHappened({ date: cell.date, dayName })
  }

  const handleDoItToday = async (): Promise<boolean> => {
    if (!profileId) return false
    const ok = await setSessionMove(profileId, today, null)
    if (ok) { weekTrain.refresh(); onLogsUpdated?.() }
    return ok
  }

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
  // Through the hook first, so a session MOVED onto tomorrow previews as
  // tomorrow's session and one moved off it previews as nothing; the plan's
  // own row answers only when nothing has happened to that date (or when
  // tomorrow falls outside the week the hook holds). Same source as the strip.
  const tomorrowCell = weekTrain.days.find(d => d.dayName === tomorrowName)
  const tomorrowWorkout = tomorrowCell?.movedTo
    ? undefined
    : (tomorrowCell?.session ?? undefined) ?? liveWeekPlan.find(d => d.day === tomorrowName)
  // A DAY IS SCHEDULED IF IT SAYS IT IS. `is_scheduled` exists precisely
  // because "scheduled" was being inferred from the exercise count, which
  // makes an activity-shaped day — a walk, a swim, no exercises array —
  // invisible: the beginner's whole plan never appeared in tomorrow's preview.
  // Same expression dashboard-data.ts's streak input already uses, and the
  // fallback is for plans stored before the field existed.
  const tomorrowPreview = isScheduledDay(tomorrowWorkout)
    ? { dayName: tomorrowName, focus: tomorrowWorkout!.focus, detail: dayDetail(tomorrowWorkout!) }
    : undefined

  // DELIBERATELY STILL THE EXERCISE COUNT. "Train anyway" borrows another
  // day's PRESCRIPTION to do today, and an activity day has no exercises to
  // borrow — offering one here would open a session with nothing in it, which
  // is the defect this whole change exists to remove.
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
  // MEMOISED, and the reason is two full plan generations. volumeNotice builds
  // a fresh object every call, and volumeReduction below lists `volume` in its
  // dependencies — so for anyone with a qualifying second sport the memo was
  // busted on EVERY render and regenerated the whole mesocycle twice, at
  // roughly 80-190ms each, purely to render one percentage in a banner. Keyed
  // on the two things volumeNotice actually reads.
  // KEYED ON THE PROFILE OBJECT, not on the fields volumeNotice reads. Naming
  // recovery_capacity here was a raw read, and test:concurrent-activity refuses
  // one anywhere in this file for a good reason: a second sport has to reach
  // every reader of that field through effectiveRecoveryCapacity, or it reaches
  // some and not others. The profile reference is stable between renders, which
  // is all this needs — the churn came from `volume` being rebuilt each time,
  // not from the profile.
  const volume = useMemo(() => (profile ? volumeNotice(profile) : null), [profile])
  const volumeNames = volume ? volume.names.join(' and ') : ''
  const [volumeBusy, setVolumeBusy] = useState(false)
  const [volumeError, setVolumeError] = useState<string | null>(null)
  /**
   * What the rebuild changed and what it could not, after the tap.
   *
   * TRANSIENT ON PURPOSE, and the limit is worth stating: unlike the shortened
   * marker (workout.shortened_to_minutes, which is stored on the day and so
   * survives a reload), this is component state and goes on refresh. The
   * session itself visibly changed and stays changed; what is lost on a reload
   * is only the list of slots that STAYED. Storing that needs a field on the
   * day, which is a persistence change this build did not take.
   */
  const [rebuildNote, setRebuildNote] = useState<string | null>(null)
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

  // THE PEEK ASKS THE SAME SOURCE AS EVERYTHING ELSE. It used to be
  // `liveWeekPlan.find(d => d.day === peekDay)` — the plan's raw weekday row,
  // which is the right answer only for a day nothing has happened to. It was
  // the one surface that never adopted the shared "what actually runs on this
  // date" answer (session-move.ts says so in its own header: "Everything now
  // asks sessionForDate").
  //
  // Ashley, 11 Sep 2026, from the live app: she moved Tuesday's session to
  // Wednesday, the week strip drew Tuesday as moved — correctly — and then
  // tapping Tuesday opened a card headed "TUESDAY · Push & Press" listing the
  // whole session, so she reported the move had not worked. It had. One day
  // was giving two answers, which is the one thing the strip and the day view
  // may never do.
  const peekCell = peekDay ? weekTrain.days.find(d => d.dayName === peekDay) : null
  const peekMovedTo = peekCell?.movedTo ?? null
  const peekWorkout = peekDay && !peekMovedTo
    ? (peekCell?.session ?? liveWeekPlan.find(d => d.day === peekDay))
    : null

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
    if (!workout || workout.exercises.length === 0) return { minutes: undefined, note: undefined }
    const seconds = estimateDaySeconds(workout)
    // A DAY SOMEBODY SHORTENED SAYS SO. Otherwise the only trace of "I've only
    // got 25 minutes" is a session that is quietly two exercises thinner than
    // yesterday's, which reads as the app having lost something. The shortfall
    // warning is suppressed for exactly the same day (see the describer), so
    // this replaces it rather than stacking with it.
    //
    // AND IT NEVER STATES A LENGTH THE HEADER CONTRADICTS. A 48-minute session
    // asked down to 20 lands at 26, because the main lift is protected and
    // three exercises are the floor — so printing "shortened to 20 min" beside
    // this row's own "~26 min" would be the app arguing with itself. Found on
    // a real screen, 13 Sep 2026, by the browser driver comparing the two.
    const shortened = workout.shortened_to_minutes
    const actual = Math.round(seconds / 60)
    const shortenedLine = shortened == null ? null
      : actual <= shortened
        ? `Shortened to ${shortened} min for today. Your main lift is untouched, and it’s back to the full session next week.`
        : `Shortened for today — ${actual} min is as low as this one goes without touching your main lift. Back to the full session next week.`
    // THE DESCRIBER OWNS THE SUPPRESSION, not this branch. Both notes are
    // collected and joined rather than one short-circuiting the other, so the
    // exemption inside describeSessionShortfall is the only thing keeping "you
    // shortened this to 26 min" and "this runs shorter than the 45-60 you asked
    // for" off the same screen — which is what makes deleting that exemption
    // something a check can see.
    const shortfall = describeSessionShortfall(seconds, profile?.session_duration_preference, {
      isDeload: currentMesoWeekObj?.is_deload,
      lowRecovery: !!profile && effectiveRecoveryCapacity(profile) === 'low',
      shortenedToMinutes: shortened,
    })
    return {
      minutes: actual,
      note: [shortenedLine, shortfall?.note].filter(Boolean).join(' ') || undefined,
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
        shortfallNote={sessionEstimate.note}
        onOpenProgram={onOpenProgram}
        onOpenSessionHistory={onOpenSessionHistory}
        onOpenWhatHappened={profileId ? openWhatHappened : undefined}
        coachNoteShownBelow={todayNudge?.source === 'week-note'}
        expanded={weekNotesOpen}
        onToggleExpanded={setWeekNotesOpen}
      />
      <Suspense fallback={null}>
      <WhatHappenedSheet
        target={whatHappened}
        onClose={() => setWhatHappened(null)}
        profileId={profileId}
        today={today}
        plan={liveWeekPlan}
        weekDays={weekTrain.days}
        moves={weekTrain.moves}
        weekOf={d => getActiveMesocycleWeek(planCreatedAt, new Date(`${d}T12:00:00`), mesocycle?.length || 4)}
        weekNumber={liveWeek}
        onChanged={() => { weekTrain.refresh(); onLogsUpdated?.() }}
        onShorten={shortenToday}
        onLighter={lighterToday}
        onRebuild={rebuildToday}
      />
      </Suspense>
      <Suspense fallback={null}>
      <AddExerciseSheet
        target={addOpen && workout ? { dayName: effectiveDayName, day: workout } : null}
        onClose={() => setAddOpen(false)}
        profile={profile}
        exclusions={exclusions}
        onConfirm={addExercise}
        impactFor={additionImpact}
      />
      </Suspense>
      <Suspense fallback={null}>
      <RemoveExerciseSheet
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onDrop={scope => dropExercise(removeTarget!.exIndex, scope)}
        onSwapInstead={() => removeTarget && onOpenSwap(removeTarget.dayName, removeTarget.exIndex, removeTarget.exerciseName)}
        balanceCost={scope => (removeTarget ? removalBalanceCost(removeTarget.exIndex, scope) : { cost: null, balancing: null })}
        onReason={handleRemoveReason}
      />
      </Suspense>

      {peekDay ? (
        peekMovedTo ? (
          /* The day's session has LEFT. Says where, and offers to go there —
             the answer she needed and could not get from any screen. */
          <div className="rounded-xl bg-[color:var(--surface-deep)] p-4 text-center text-sm" data-testid="peek-moved-away">
            <p className="text-muted-foreground">{peekDay}'s session is on {peekMovedTo.dayName} now.</p>
            <button
              className="mt-2 text-xs font-semibold text-primary-text underline"
              onClick={() => setPeekDay(peekMovedTo.dayName)}
            >
              See {peekMovedTo.dayName} →
            </button>
            <button className="block mx-auto mt-2 text-xs underline text-muted-foreground" onClick={() => setPeekDay(null)}>Back to today</button>
          </div>
        ) : !peekWorkout || peekWorkout.exercises.length === 0 ? (
          <div className="rounded-xl bg-[color:var(--surface-deep)] p-4 text-center text-sm text-muted-foreground">
            {/* A peeked day with a prescribed activity is NOT a rest day, and
                saying so was the same defect as the empty card — it just said
                it in one sentence instead of a blank form. */}
            {peekWorkout?.plannedActivity
              ? `${peekDay}: ${peekWorkout.plannedActivity.activity}, ${peekWorkout.plannedActivity.duration} minutes.`
              : `${peekDay} is a rest or recovery day.`}
            <button className="block mx-auto mt-2 text-xs underline" onClick={() => setPeekDay(null)}>Back to today</button>
          </div>
        ) : (
          <PeekPanel
            workout={peekWorkout}
            dayLabel={peekDay}
            movedFromDayName={peekCell?.movedFrom?.dayName ?? null}
            onExit={() => setPeekDay(null)}
            onSwap={(exIndex, name) => peekDay && onOpenSwap(peekDay, exIndex, name)}
            onBan={handleBan}
            onOpenDetail={onOpenDetail}
            banBusyName={banBusy}
          />
        )
      ) : isMovedAway && movedAwayTo ? (
        <MovedDayCard
          focus={liveWeekPlan.find(d => d.day === todayName)?.focus ?? null}
          toDayName={movedAwayTo.dayName}
          weekTally={{ done: weekTrain.sessionsDone, planned: weekTrain.sessionsPlanned }}
          tomorrow={tomorrowPreview}
          onPeek={d => setPeekDay(d)}
          onDoItToday={handleDoItToday}
        />
      ) : isRestDay ? (
        <RestDayCard
          dayName={todayName}
          weekTally={{ done: weekTrain.sessionsDone, planned: weekTrain.sessionsPlanned }}
          tomorrow={tomorrowPreview}
          onPeek={d => setPeekDay(d)}
          trainAnywayOptions={trainAnywayOptions}
          onTrainAnyway={setBorrowedDayName}
          onAddCardio={handleAddCardio}
        />
      ) : isActiveRecovery ? (
        <ActiveRecoveryCard
          workout={workout!}
          weekTally={{ done: weekTrain.sessionsDone, planned: weekTrain.sessionsPlanned }}
          tomorrow={tomorrowPreview}
          onPeek={d => setPeekDay(d)}
          onAddCardio={handleAddCardio}
        />
      ) : (
        <div className="space-y-3">
          {/* SAY IT ON THE DAY IT HAPPENED. Ashley told the coach she had done
              Muay Thai instead; the swap was written, the strip showed it, and
              this panel carried on as if the session were still ahead of her.
              The list stays visible — she may still want to train — but the
              screen has to say what it knows first. */}
          {/* The RECEIVING end of a move uses the same component the swap
              below does, so the two things that can sit above a session look
              like two of one kind. The day a session LEFT is not a banner over
              the session any more — it is MovedDayCard, above, with nothing
              of the session under it. */}
          {movedInFrom && (
            <InsightBanner tone="ai" data-testid="moved-in">
              <span className="text-sm">
                This is <span className="font-semibold">{movedInFrom.dayName}</span>&apos;s session, moved here.
              </span>
            </InsightBanner>
          )}
          {swappedToday && (
            <InsightBanner tone="ai" data-testid="swapped-today">
              <span className="text-sm">
                You swapped today for <span className="font-semibold">{swappedToday}</span>. This session is still here if you want it.
              </span>
            </InsightBanner>
          )}
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
          {rebuildNote && <p className="text-xs text-muted-foreground" data-testid="rebuild-note">{rebuildNote}</p>}
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
          <WarmupSection
            warmup={workout!.warmup}
            open={expandedWarmup}
            onToggle={() => setExpandedWarmup(v => !v)}
            extra={tightness.items}
            extraNote={tightness.note}
            extraCaveat={uncoveredNote(tightness)}
          />
          {/* BEFORE THE SESSION, BESIDE THE WARM-UP IT CHANGES. Not on the
              session dock: this is a question you answer while you are still
              deciding what the next hour looks like, and it has nothing to say
              once you are three sets in. */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start min-h-[44px] text-xs"
            data-testid="tightness-open"
            onClick={() => setTightOpen(true)}
          >
            {tightAreas.length > 0
              ? `Tight: ${tightness.items.length > 0 ? 'warm-up updated' : 'noted'} — change it`
              : 'Anything feeling tight?'}
          </Button>
          {tightOpen && (
            <Suspense fallback={null}>
              <TightnessSheet
                open={tightOpen}
                onOpenChange={setTightOpen}
                selected={tightAreas}
                onAnswer={handleTightness}
              />
            </Suspense>
          )}
          {moveError && <p className="text-xs text-destructive">{moveError} The order hasn’t changed.</p>}
          <ExerciseList
            workout={workout!}
            dayName={effectiveDayName}
            currentMesoWeekObj={currentMesoWeekObj}
            progressedLoads={progressedLoads}
            progressedAddedLoads={progressedAddedLoads}
            progressionNotes={progressionNotes}
            profile={profile}
            onOpenSwap={onOpenSwap}
            onOpenPlateCalc={onOpenPlateCalc}
            onOpenHistory={onOpenHistory}
            onOpenDetail={onOpenDetail}
            banBusy={banBusy}
            onBan={handleBan}
            onRemove={profileId && mesocycle ? (exIndex, name) => setRemoveTarget({ dayName: effectiveDayName, exIndex, exerciseName: name }) : undefined}
            onMove={profileId && mesocycle ? moveExercise : undefined}
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
          <AdditionalWorkSection plannedExercises={workout!.exercises} profile={profile} onOpenPlateCalc={onOpenPlateCalc} />
          {/* VISIBLE AGAIN, and the "⋮" menu no longer carries it. Turn 5 put
              it behind that menu; the polish handoff puts it back at the foot
              of the list, which is where someone finishing a session looks
              for "I also did…". One entry point either way. */}
          {/* PUT ONE IN THE PLAN — beside "I also did…", and above it, because
              this one changes the session and the other only records what
              happened outside it. ONE entry point, deliberately: the day
              header's menu lost "Add unplanned work" on 6 Sep for exactly the
              reason written there — two ways into one dialog is how they
              drift apart. Only shown where an edit can actually be saved,
              the same gate onRemove and onMove use. */}
          {/* A COLUMN, NOT TWO BUTTONS LEFT TO FLOW. A <button> is inline, and
              while there was only one of these at the foot of the list that
              never showed; the second landed beside it on the same line, so
              the screen read "＋ Add an exercise＋ Add unplanned work" as one
              run-on string with abutting tap targets. Found by reading a
              screenshot at 390px on 13 Sep 2026 — every check was green. */}
          <div className="flex flex-col items-start gap-1" data-testid="session-foot-actions">
            {profileId && mesocycle && (
              <button
                type="button"
                data-testid="add-exercise"
                onClick={() => setAddOpen(true)}
                className="hit-slop-44 text-left text-[0.8125rem] text-text-tertiary"
              >
                ＋ Add an exercise
              </button>
            )}
            <button
              type="button"
              onClick={() => setUnplannedWorkOpen(true)}
              className="hit-slop-44 text-left text-[0.8125rem] text-text-tertiary"
            >
              ＋ Add unplanned work
            </button>
          </div>
          <AddUnplannedWork
            open={unplannedWorkOpen}
            onOpenChange={setUnplannedWorkOpen}
            hideTrigger
          />
          {/* Clears the fixed CTA bar below, so the last row is never sitting
              underneath it. Matches the bar's own height plus its fade. */}
          {status === 'idle' && <div aria-hidden className="h-[100px]" />}
        </div>
      )}

      {/* THE PRIMARY ACTION, fixed above the tab bar. It used to be a small
          button in the hero, which scrolled away the moment anyone read past
          the first exercise — on a phone, the one control the screen exists
          for was off-screen for most of the screen. Rides above BottomDock
          when a timer is up, using the height the dock already publishes for
          the chat composer (useBottomDockHeight) rather than a second guess
          at how tall it is. */}
      {/* ONLY WHEN THERE IS A WORKOUT TO START. This read `status !== 'running'`
          until 7 Sep 2026, and status has THREE values — so the moment a
          session was finished it fell back through to here and offered
          "Start workout" again, on a screen where every exercise was struck
          through and ticked. Ashley: "the home tab is still showing start
          workout for todays workout even though I have already logged todays
          workout."
          A finished day gets no primary action: the work is done, and the
          summary it produced is the thing to look at. `idle` is the only
          state that means "not started". */}
      {!peekWorkout && !isRestDay && !isActiveRecovery && workout && status === 'idle' && (
        <div
          className="fixed inset-x-0 z-40 px-[22px] pb-3 pt-2.5"
          style={{
            bottom: `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom) + ${dockHeightPx > 0 ? dockHeightPx + 12 : 0}px)`,
            background: 'linear-gradient(to top, var(--background) 70%, transparent)',
          }}
        >
          {/* A swapped day keeps the escape hatch and loses the pretence:
              "Start workout" on a session she has already replaced is the
              app telling her it did not hear. Same handler, honest label. */}
          <Button
            className="h-[52px] w-full text-[0.9375rem] font-semibold"
            variant={swappedToday ? 'outline' : 'default'}
            onClick={startSession}
          >
            {swappedToday ? 'Train it anyway' : 'Start workout'}
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
  profile,
  onOpenSwap,
  onOpenPlateCalc,
  onOpenHistory,
  onOpenDetail,
  onRemove,
  onMove,
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
  /** Reaches SetGrid via ExerciseRow, to judge a typed weight — see set-plausibility.ts. */
  profile?: UserProfile
  onOpenSwap: (dayName: string, exIndex: number, exerciseName: string) => void
  onOpenPlateCalc: (weightKg: number) => void
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
  onOpenDetail?: (exerciseName: string) => void
  /** Open the take-it-out sheet for one slot. Absent when there is no plan to edit. */
  onRemove?: (exIndex: number, exerciseName: string) => void
  /** Reorder one slot within this session. */
  onMove?: (exIndex: number, direction: -1 | 1) => void
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
    const withAdded = progressedAdded != null && ex.suggested_added_load_kg != null
      ? { ...ex, suggested_added_load_kg: progressedAdded }
      : ex
    // AND THE ORDINARY WEIGHT, for the same reason and on the same copy. The
    // chip above already said "from your last session" and the note below
    // already said "Held at 35kg" — the figure between them was still the
    // plan's. withWorkingLoadKg moves all three views of it together and
    // scales the ramp rather than flattening it; see its own note.
    const progressedLoad = progressedLoads[ex.name]
    const rowEx = progressedLoad != null
      ? withWorkingLoadKg(withAdded, progressedLoad, profile)
      : withAdded
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
      profile,
      onSwap: () => onOpenSwap(dayName, exIndex, ex.name),
      onBan: () => onBan(ex.name),
      onRemove: onRemove ? () => onRemove(exIndex, ex.name) : undefined,
      onMove: onMove ? (direction: -1 | 1) => onMove(exIndex, direction) : undefined,
      canMoveUp: exIndex > 0,
      canMoveDown: exIndex < workout.exercises.length - 1,
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
