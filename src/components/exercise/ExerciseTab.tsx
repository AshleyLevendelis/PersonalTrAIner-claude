import { useState } from 'react'
import { useAppRoute, programHash } from '@/lib/app-route'
import { useActiveSession } from '@/hooks/useActiveSession'
import { ExercisePlan } from '@/components/ExercisePlan'
import { PlateCalculator } from '@/components/PlateCalculator'
import { TodayPanel } from './TodayPanel'
import { SwapDialog, type SwapTarget } from './SwapDialog'
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
  profile?: UserProfile
  profileId?: string
  planCreatedAt?: string
  devOverrideWeek?: number | null
  devOverrideDay?: string | null
  devBypassLocks?: boolean
  onSwapExercise: (weekNumber: number, dayName: string, exIndex: number, newExercise: ExerciseEntry, scope: SwapScope) => void | Promise<void>
  onBanExercise: (exerciseName: string) => void | Promise<void>
}

export function ExerciseTab({
  plan,
  mesocycle,
  exclusions,
  profile,
  profileId,
  planCreatedAt,
  devOverrideWeek,
  devOverrideDay,
  devBypassLocks,
  onSwapExercise,
  onBanExercise,
}: ExerciseTabProps) {
  const { route } = useAppRoute()
  const { liveWeek } = useActiveSession()
  const isProgramView = route.kind === 'program'

  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null)
  const [plateCalcOpen, setPlateCalcOpen] = useState(false)
  const [plateCalcWeight, setPlateCalcWeight] = useState(0)

  const handleOpenPlateCalc = (weightKg: number) => {
    setPlateCalcWeight(weightKg)
    setPlateCalcOpen(true)
  }

  const handleConfirmSwap = async (exIndex: number, dayName: string, newExercise: ExerciseEntry, scope: SwapScope) => {
    await onSwapExercise(liveWeek, dayName, exIndex, newExercise, scope)
  }

  if (isProgramView) {
    return (
      <ExercisePlan
        plan={plan}
        mesocycle={mesocycle}
        exclusions={exclusions}
        profile={profile}
        profileId={profileId}
        planCreatedAt={planCreatedAt}
        devOverrideWeek={devOverrideWeek}
        devOverrideDay={devOverrideDay}
        devBypassLocks={devBypassLocks}
        onSwapExercise={onSwapExercise}
        onBanExercise={onBanExercise}
      />
    )
  }

  return (
    <>
      <TodayPanel
        plan={plan}
        mesocycle={mesocycle}
        exclusions={exclusions}
        profile={profile}
        profileId={profileId}
        devOverrideDay={devOverrideDay}
        onOpenProgram={() => { window.location.hash = programHash(liveWeek) }}
        onOpenSwap={(dayName, exIndex, exerciseName) => setSwapTarget({ dayName, exIndex, exerciseName })}
        onBanExercise={onBanExercise}
        onOpenPlateCalc={handleOpenPlateCalc}
      />
      <SwapDialog
        target={swapTarget}
        onClose={() => setSwapTarget(null)}
        profile={profile}
        exclusions={exclusions}
        onConfirm={handleConfirmSwap}
      />
      <PlateCalculator
        open={plateCalcOpen}
        onOpenChange={setPlateCalcOpen}
        initialWeight={plateCalcWeight}
      />
    </>
  )
}
