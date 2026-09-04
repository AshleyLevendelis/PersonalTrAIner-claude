import { FailedCardioNotice } from '@/components/exercise/FailedCardioNotice'
import { useState } from 'react'
import { useAppRoute, programHash } from '@/lib/app-route'
import { useActiveSession } from '@/hooks/useActiveSession'
import { ProgramBrowse } from './ProgramBrowse'
import { PlateCalculator } from '@/components/PlateCalculator'
import { DevTestPanel } from '@/components/DevTestPanel'
import { isDevAccount } from '@/lib/dev-clock'
import { TodayPanel } from './TodayPanel'
import { SwapDialog, type SwapTarget } from './SwapDialog'
import { ExerciseHistoryDialog } from './ExerciseHistoryDialog'
import { ExerciseDetailDialog } from './ExerciseDetailDialog'
import { SessionHistoryDialog } from './SessionHistoryDialog'
import type { ExerciseEntry } from '@/lib/exercise-db'
import type { SwapScope } from '@/lib/mesocycle-edit'
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
  planCreatedAt?: string
  devOverrideWeek?: number | null
  devOverrideDay?: string | null
  devBypassLocks?: boolean
  onSwapExercise: (weekNumber: number, dayName: string, exIndex: number, newExercise: ExerciseEntry, scope: SwapScope) => void | Promise<void>
  onBanExercise: (exerciseName: string) => void | Promise<void>
  onDevOverrideWeekChange: (week: number | null) => void
  onDevOverrideDayChange: (day: string | null) => void
  onDevBypassLocksChange: (bypass: boolean) => void
  onLogsSeeded: () => void
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
  onDevOverrideWeekChange,
  onDevOverrideDayChange,
  onDevBypassLocksChange,
  onLogsSeeded,
}: ExerciseTabProps) {
  const { route } = useAppRoute()
  const { liveWeek } = useActiveSession()
  const isProgramView = route.kind === 'program'

  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null)
  const [plateCalcOpen, setPlateCalcOpen] = useState(false)
  const [plateCalcWeight, setPlateCalcWeight] = useState(0)
  const [historyTarget, setHistoryTarget] = useState<{ exerciseId: string; exerciseName: string } | null>(null)
  // One instance, two entry points (day view and peek), same target-state
  // shape as swapTarget/historyTarget above.
  const [detailTarget, setDetailTarget] = useState<string | null>(null)
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
          onOpenSwap={setSwapTarget}
          onBanExercise={onBanExercise}
          onOpenHistory={(id, name) => setHistoryTarget({ exerciseId: id, exerciseName: name })}
        />
        <SwapDialog
          target={swapTarget}
          onClose={() => setSwapTarget(null)}
          profile={profile}
          exclusions={exclusions}
          softExercisePreferences={softExercisePreferences}
          onConfirm={handleConfirmSwap}
        />
        <ExerciseDetailDialog
          open={!!detailTarget}
          onOpenChange={open => { if (!open) setDetailTarget(null) }}
          exerciseName={detailTarget}
        />
        <ExerciseHistoryDialog
          open={!!historyTarget}
          onOpenChange={open => { if (!open) setHistoryTarget(null) }}
          exerciseId={historyTarget?.exerciseId ?? null}
          exerciseName={historyTarget?.exerciseName ?? null}
          profileId={profileId}
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
        devOverrideDay={devOverrideDay}
        onOpenProgram={() => { window.location.hash = programHash(liveWeek) }}
        onOpenSwap={(dayName, exIndex, exerciseName) => setSwapTarget({ dayName, exIndex, exerciseName })}
        onBanExercise={onBanExercise}
        onOpenPlateCalc={handleOpenPlateCalc}
        onOpenHistory={(id, name) => setHistoryTarget({ exerciseId: id, exerciseName: name })}
        onOpenDetail={(name: string) => setDetailTarget(name)}
        onOpenSessionHistory={() => setSessionHistoryOpen(true)}
      />
      <SwapDialog
        target={swapTarget}
        onClose={() => setSwapTarget(null)}
        profile={profile}
        exclusions={exclusions}
        softExercisePreferences={softExercisePreferences}
        onConfirm={handleConfirmSwap}
      />
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
          The two branches already duplicate SwapDialog and
          ExerciseHistoryDialog; this follows that shape rather than
          restructuring the file. test:exercise-detail now pins that BOTH
          branches render it. */}
      <ExerciseDetailDialog
        open={!!detailTarget}
        onOpenChange={open => { if (!open) setDetailTarget(null) }}
        exerciseName={detailTarget}
      />
      <ExerciseHistoryDialog
        open={!!historyTarget}
        onOpenChange={open => { if (!open) setHistoryTarget(null) }}
        exerciseId={historyTarget?.exerciseId ?? null}
        exerciseName={historyTarget?.exerciseName ?? null}
        profileId={profileId}
      />
      <SessionHistoryDialog
        open={sessionHistoryOpen}
        onOpenChange={setSessionHistoryOpen}
        profileId={profileId}
      />
    </>
  )
}
