import { FailedCardioNotice } from '@/components/exercise/FailedCardioNotice'
import { useCallback, useState } from 'react'
import { useAppRoute, programHash } from '@/lib/app-route'
import { useActiveSession } from '@/hooks/useActiveSession'
import { ProgramBrowse } from './ProgramBrowse'
import { PlateCalculator } from '@/components/PlateCalculator'
import { DevTestPanel } from '@/components/DevTestPanel'
import { isDevAccount } from '@/lib/dev-clock'
import { TodayPanel } from './TodayPanel'
// LAZY, like the remove sheet beside it. A dialog nobody has opened has no
// business in the bundle that renders the first screen — and with its reason
// step it had grown enough for test:bundle to say so (915 -> 922 kB). Measured
// rather than assumed: this is what took it back under.
import { lazy, Suspense } from 'react'
import type { SwapTarget } from './SwapDialog'
const SwapDialog = lazy(() => import('./SwapDialog').then(m => ({ default: m.SwapDialog })))
import { ExerciseDetailDialog, type ExerciseDetailTab } from './ExerciseDetailDialog'
import { SessionHistoryDialog } from './SessionHistoryDialog'
import type { ExerciseEntry } from '@/lib/exercise-db'
import { swapExerciseInMesocycle, type SwapScope } from '@/lib/mesocycle-edit'
import { describeEditImpact } from '@/lib/session-balance-cost'
import type { ReasonAnswer } from './EditReasonStep'
import type { WorkoutDay, MesocycleWeek, UserProfile } from '@/lib/types'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §5.1 — the view switcher: 'today' (TodayPanel, the
// headline change) vs 'program' (the legacy ExercisePlan, now a read-only
// browse stand-in — §2.4/§7.3). Owns the one swap dialog and the plate
// calculator, shared across today/peek so neither view duplicates them.
// ---------------------------------------------------------------------------

interface ExerciseTabProps {
  plan: WorkoutDay[]
  mesocycle?: MesocycleWeek[]
  exclusions: string[]
  /** Soft likes/dislikes — reorders the swap list, removes nothing. */
  softExercisePreferences?: { liked: string[]; disliked: string[] }
  profile?: UserProfile
  profileId?: string
  /** Fired when steps are logged HERE, so the chat tab (which never unmounts) re-reads them. */
  planCreatedAt?: string
  devOverrideWeek?: number | null
  devOverrideDay?: string | null
  devBypassLocks?: boolean
  onSwapExercise: (weekNumber: number, dayName: string, exIndex: number, newExercise: ExerciseEntry, scope: SwapScope) => void | Promise<void>
  onBanExercise: (exerciseName: string) => void | Promise<void>
  /** The second-sport volume toggle on the workout card rewrites the plan from the live week; these carry the result into App state. */
  onMesocycleUpdated?: (mesocycle: MesocycleWeek[]) => void
  onProfileChanged?: (patch: Partial<UserProfile>) => void
  onDevOverrideWeekChange: (week: number | null) => void
  onDevOverrideDayChange: (day: string | null) => void
  onDevBypassLocksChange: (bypass: boolean) => void
  onLogsSeeded: () => void
  /** App's logsVersion — the week strip and today's panel re-read when the chat writes a move, a swap or a rest day. */
  logsVersion?: number
  /** Fired when THIS tab changes a day (clearing a move from the moved-day card), so Home and the chat re-read. */
  onLogsUpdated?: () => void
  /** Fired when a session with logged sets closes — App re-anchors the printed program from a calibration week. */
  onCalibrationSessionFinished?: (args: { date: string; dayName: string }) => void
}

export function ExerciseTab({
  plan,
  mesocycle,
  exclusions,
  softExercisePreferences,
  profile,
  profileId,
  planCreatedAt,
  devOverrideWeek,
  devOverrideDay,
  devBypassLocks,
  onSwapExercise,
  onBanExercise,
  onMesocycleUpdated,
  onProfileChanged,
  onDevOverrideWeekChange,
  onDevOverrideDayChange,
  onDevBypassLocksChange,
  onLogsSeeded,
  logsVersion,
  onLogsUpdated,
  onCalibrationSessionFinished,
}: ExerciseTabProps) {
  const { route } = useAppRoute()
  const { liveWeek } = useActiveSession()
  const isProgramView = route.kind === 'program'

  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null)
  const [plateCalcOpen, setPlateCalcOpen] = useState(false)
  const [plateCalcWeight, setPlateCalcWeight] = useState(0)
  // ONE TARGET, ONE DIALOG, THREE TABS. There were two dialogs about one
  // exercise until 5 Sep 2026 — technique in one, chart/PRs/sessions in
  // another — reached from two menu items that never knew about each other.
  // They are merged now, so both menu items set this and only the `tab`
  // differs: "How to do it" lands on How to, "History"/"Past sessions" on
  // History. Keeping two states would have kept the split alive underneath.
  const [detailTarget, setDetailTarget] = useState<
    { exerciseName: string; exerciseId?: string; tab: ExerciseDetailTab } | null
  >(null)
  const [sessionHistoryOpen, setSessionHistoryOpen] = useState(false)

  const handleOpenPlateCalc = (weightKg: number) => {
    setPlateCalcWeight(weightKg)
    setPlateCalcOpen(true)
  }

  // A swap opened from the program view carries the BROWSED week on its
  // target; today's rows set no week and land on the live one.
  const handleConfirmSwap = async (exIndex: number, dayName: string, newExercise: ExerciseEntry, scope: SwapScope) => {
    await onSwapExercise(swapTarget?.weekNumber ?? liveWeek, dayName, exIndex, newExercise, scope)
  }

  /**
   * WHAT A SWAP WOULD DO TO THE WEEK — run as a real trial, never modelled.
   *
   * swapExerciseInMesocycle carries the shared settling tail from 13 Sep 2026,
   * so trialling the actual call is the only honest way to know what the
   * balancing will change on other days. The same reason TodayPanel trials the
   * real removal rather than predicting it.
   *
   * Scoped to 'today': the sentence is about the week in front of the person,
   * and the block-wide scope does the same thing to each of its weeks.
   */
  const swapImpact = useCallback(async (candidate: ExerciseEntry) => {
    const nothing = { cost: null, balancing: null }
    if (!swapTarget || !profile || !mesocycle) return nothing
    const weekNumber = swapTarget.weekNumber ?? liveWeek
    const after = await swapExerciseInMesocycle({
      mesocycle, profile, currentWeekNumber: weekNumber,
      dayName: swapTarget.dayName, exIndex: swapTarget.exIndex,
      newExercise: candidate, scope: 'today',
    })
    return describeEditImpact(
      mesocycle.find(w => w.week_number === weekNumber),
      after.find(w => w.week_number === weekNumber),
      swapTarget.dayName,
    )
  }, [swapTarget, profile, mesocycle, liveWeek])

  // THE TWO APPLIERS LIVE IN A MODULE OF THEIR OWN, loaded on the tap.
  //
  // They need plan-adaptations, the adaptation executors and the adaptation
  // store. ChatAssistant needs the same code and is already its own chunk, so
  // reaching for it from HERE — a component in the main chunk — made Vite
  // hoist all of it into the bundle every person downloads before they see
  // anything: 915 -> 925 kB, and test:bundle caught it. Same shape as the
  // nutrition sheet a day earlier. Importing the module lazily keeps it in a
  // chunk of its own, fetched when somebody actually says something hurts.
  const applyInjury = useCallback(async (
    answer: Extract<ReasonAnswer, { type: 'injury' }>,
  ): Promise<string | null> => {
    if (!profile || !mesocycle) return 'No plan to edit.'
    const { applyInjuryFromRow } = await import('@/lib/screen-adaptations')
    const r = await applyInjuryFromRow(profile, mesocycle, liveWeek, answer.hurt, answer.area)
    if (r.mesocycle) onMesocycleUpdated?.(r.mesocycle)
    if (r.addInjuryCode) onProfileChanged?.({ injuries: [...(profile.injuries ?? []), r.addInjuryCode] })
    return r.message
  }, [profile, mesocycle, liveWeek, onMesocycleUpdated, onProfileChanged])

  const applyEquipment = useCallback(async (tier: string): Promise<string | null> => {
    if (!profile || !mesocycle) return 'No plan to edit.'
    const { applyEquipmentFromRow } = await import('@/lib/screen-adaptations')
    const r = await applyEquipmentFromRow(profile, mesocycle, liveWeek, tier)
    if (r.mesocycle) onMesocycleUpdated?.(r.mesocycle)
    return r.message
  }, [profile, mesocycle, liveWeek, onMesocycleUpdated])

  /**
   * THE SWAP'S FOUR ANSWERS. Two of them are not swaps: "it hurts" is the
   * injury triage and "I haven't got the kit" rebuilds the week around what
   * they have. The other two — busy, don't like it — fall through to the
   * swap list the dialog already shows, because that IS the right answer to
   * both; what differs is the scope, which the list's own step asks next.
   */
  const handleSwapReason = useCallback(async (answer: ReasonAnswer): Promise<string | null> => {
    if (answer.type === 'injury') return applyInjury(answer)
    if (answer.type === 'equipment') return applyEquipment(answer.tier)
    return null
  }, [applyInjury, applyEquipment])

  if (isProgramView) {
    // DevTestPanel mounts here — program surface, dev-gated — never above
    // the today hero (LAYOUT-DESIGN.md §2.4).
    return (
      <>
        {isDevAccount(profile ?? null) && (
          <DevTestPanel
            profileId={profileId}
            mesocycle={mesocycle ?? []}
            exercisePlan={plan}
            overrideWeek={devOverrideWeek ?? null}
            overrideDay={devOverrideDay ?? null}
            devBypassLocks={!!devBypassLocks}
            onOverrideWeekChange={onDevOverrideWeekChange}
            onOverrideDayChange={onDevOverrideDayChange}
            onBypassLocksChange={onDevBypassLocksChange}
            onLogsSeeded={onLogsSeeded}
          />
        )}
        <ProgramBrowse
          plan={plan}
          mesocycle={mesocycle}
          profileId={profileId}
          initialWeek={route.kind === 'program' ? route.week : undefined}
          // WIRED, not merely available. ExerciseTab has had logsVersion since
          // the week strip needed it and never passed it down, so the program
          // view could not learn about a move confirmed in chat while it was on
          // screen. Same prop, same signal, one more reader.
          refreshToken={logsVersion}
          onOpenSwap={setSwapTarget}
          onBanExercise={onBanExercise}
          onOpenHistory={(id, name) => setDetailTarget({ exerciseName: name, exerciseId: id, tab: 'history' })}
          onOpenDetail={(name: string) => setDetailTarget({ exerciseName: name, tab: 'howto' })}
        />
        <Suspense fallback={null}><SwapDialog
          target={swapTarget}
          onClose={() => setSwapTarget(null)}
          profile={profile}
          exclusions={exclusions}
          softExercisePreferences={softExercisePreferences}
          onConfirm={handleConfirmSwap}
          impactFor={swapImpact}
            onReason={handleSwapReason}
        /></Suspense>
        <ExerciseDetailDialog
          open={!!detailTarget}
          onOpenChange={open => { if (!open) setDetailTarget(null) }}
          exerciseName={detailTarget?.exerciseName ?? null}
          exerciseId={detailTarget?.exerciseId ?? null}
          profileId={profileId}
          initialTab={detailTarget?.tab ?? 'summary'}
        />
      </>
    )
  }

  return (
    <>
      {/* A cardio log that failed to sync used to be invisible and
          unrecoverable — the store's retry/discard functions had no caller. */}
      <FailedCardioNotice />
      <TodayPanel
        plan={plan}
        mesocycle={mesocycle}
        exclusions={exclusions}
        profile={profile}
        profileId={profileId}
        planCreatedAt={planCreatedAt}
        logsVersion={logsVersion}
        onLogsUpdated={onLogsUpdated}
        devOverrideDay={devOverrideDay}
        onOpenProgram={() => { window.location.hash = programHash(liveWeek) }}
        onOpenSwap={(dayName, exIndex, exerciseName) => setSwapTarget({ dayName, exIndex, exerciseName })}
          onInjury={applyInjury}
          onEquipment={applyEquipment}
        onBanExercise={onBanExercise}
        onMesocycleUpdated={onMesocycleUpdated}
        onProfileChanged={onProfileChanged}
        onOpenPlateCalc={handleOpenPlateCalc}
        onOpenHistory={(id, name) => setDetailTarget({ exerciseName: name, exerciseId: id, tab: 'history' })}
        onOpenDetail={(name: string) => setDetailTarget({ exerciseName: name, tab: 'howto' })}
        onOpenSessionHistory={() => setSessionHistoryOpen(true)}
        onCalibrationSessionFinished={onCalibrationSessionFinished}
      />
      <Suspense fallback={null}><SwapDialog
        target={swapTarget}
        onClose={() => setSwapTarget(null)}
        profile={profile}
        exclusions={exclusions}
        softExercisePreferences={softExercisePreferences}
        onConfirm={handleConfirmSwap}
        impactFor={swapImpact}
            onReason={handleSwapReason}
      /></Suspense>
      <PlateCalculator
        open={plateCalcOpen}
        onOpenChange={setPlateCalcOpen}
        initialWeight={plateCalcWeight}
      />
      {/* MUST BE RENDERED IN THIS BRANCH TOO. It used to live only in the
          Full Program branch above, while this branch still passed
          onOpenDetail to TodayPanel — so on the session screen the "How to do
          it" menu item appeared, set detailTarget, and nothing was listening.
          A dead control, reported by Ashley from her phone on 3 Sep 2026.
          The two branches already duplicate SwapDialog; this follows that
          shape rather than restructuring the file. test:exercise-detail pins
          that BOTH branches render it. Now that one dialog serves technique
          AND history, forgetting it here would take out both at once. */}
      <ExerciseDetailDialog
        open={!!detailTarget}
        onOpenChange={open => { if (!open) setDetailTarget(null) }}
        exerciseName={detailTarget?.exerciseName ?? null}
        exerciseId={detailTarget?.exerciseId ?? null}
        profileId={profileId}
        initialTab={detailTarget?.tab ?? 'summary'}
      />
      <SessionHistoryDialog
        open={sessionHistoryOpen}
        onOpenChange={setSessionHistoryOpen}
        profileId={profileId}
      />
    </>
  )
}
