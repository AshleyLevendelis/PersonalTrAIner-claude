import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRightLeft, Ban } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseId } from '@/lib/exercise-db'
import { formatRampSets } from '@/lib/session-derive'
import { RampStrip } from './RampStrip'
import { LoadChip, type LoadSource } from './LoadChip'
import { CalibrationCue } from './CalibrationCue'
import { SetGrid, type SetGridProps } from './SetGrid'
import type { Exercise } from '@/lib/types'

// ---------------------------------------------------------------------------
// The repeated unit for the today view's exercise list (LAYOUT-DESIGN.md
// §1.6): name + count badge, ramp strip (safety-critical, never
// collapsible), load chip + provenance, an optional calibration cue, then
// the set grid — rendered inline, always (no tap-to-expand). Swap/ban stay
// visible icons on the row this phase — §4's overflow-menu relocation is
// not in P2's ship list.
// ---------------------------------------------------------------------------

export interface ExerciseRowProps {
  ex: Exercise
  dayName: string
  supersetLabel?: string
  loadSource: LoadSource | undefined
  progressionNote?: { note: string; didProgress: boolean }
  showCalibrationCue?: boolean
  onOpenPlateCalc: (weightKg: number) => void
  onSwap: () => void
  onBan: () => void | Promise<void>
  banBusy: boolean
  onSetCompleted?: SetGridProps['onSetCompleted']
  onFirstEverLog?: SetGridProps['onFirstEverLog']
}

export function ExerciseRow({
  ex,
  dayName,
  supersetLabel,
  loadSource,
  progressionNote,
  showCalibrationCue,
  onOpenPlateCalc,
  onSwap,
  onBan,
  banBusy,
  onSetCompleted,
  onFirstEverLog,
}: ExerciseRowProps) {
  const { setsFor } = useActiveSession()
  const exerciseId = ex.id ?? getExerciseId(ex.name)
  const completedSets = setsFor(exerciseId, ex.name).length
  const allSetsLogged = completedSets >= ex.sets
  const ramp = formatRampSets(ex)
  const [explainedLoadChip, setExplainedLoadChip] = useState(false)

  return (
    <div className={`rounded-md border p-3 space-y-2 ${allSetsLogged ? 'bg-green-50/40 dark:bg-green-950/10 border-green-200/60 dark:border-green-900/40' : 'bg-card'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {supersetLabel && (
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0.5 bg-background font-semibold">
                {supersetLabel}
              </Badge>
            )}
            <span className={`font-medium ${allSetsLogged ? 'line-through text-muted-foreground' : ''}`}>{ex.name}</span>
            <span className="text-xs text-muted-foreground">{ex.sets}×{ex.reps}</span>
            {completedSets > 0 && (
              <Badge variant="secondary" className="text-[10px] font-mono">{completedSets}/{ex.sets}</Badge>
            )}
          </div>
          {ramp && <RampStrip ramp={ramp} />}
          <LoadChip
            ex={ex}
            source={loadSource}
            explained={explainedLoadChip}
            onToggleExplain={() => setExplainedLoadChip(v => !v)}
            progressionNote={progressionNote}
          />
          {showCalibrationCue && <CalibrationCue hasLoad={ex.suggested_load_kg != null} />}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="size-7" onClick={onSwap} aria-label="Swap exercise">
            <ArrowRightLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            disabled={banBusy}
            onClick={onBan}
            aria-label="Ban exercise"
          >
            {banBusy ? (
              <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Ban className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
      <SetGrid
        exerciseName={ex.name}
        exerciseId={exerciseId}
        totalSets={ex.sets}
        prescribedReps={ex.reps}
        prescriptionType={ex.prescription_type}
        restTime={ex.rest}
        tier={ex.tier}
        suggestedLoadKg={ex.suggested_load_kg}
        perSetLoadKg={ex.per_set_load?.map(s => s.load_kg)}
        loadIsEstimate={loadSource === 'estimate'}
        onOpenPlateCalc={onOpenPlateCalc}
        onSetCompleted={onSetCompleted}
        onFirstEverLog={onFirstEverLog}
      />
    </div>
  )
}
