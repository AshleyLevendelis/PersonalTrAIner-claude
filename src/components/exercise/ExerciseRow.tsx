import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowRightLeft, Ban, MoreVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseId } from '@/lib/exercise-db'
import { formatRampSets } from '@/lib/session-derive'
import { RampStrip } from './RampStrip'
import { LoadChip, type LoadSource } from './LoadChip'
import { CalibrationCue } from './CalibrationCue'
import { SetGrid, type SetGridProps } from './SetGrid'
import type { Exercise, ExerciseSetLog } from '@/lib/types'

// ---------------------------------------------------------------------------
// The repeated unit for the today view's exercise list (LAYOUT-DESIGN.md
// §1.6): name + count badge, ramp strip (safety-critical, never
// collapsible), load chip + provenance, an optional calibration cue, then
// the set grid. Collapsed by default (controlled from TodayPanel's
// ExerciseList, which knows the whole day's completion state and picks the
// first incomplete exercise to auto-expand — a single row can't know that
// on its own). Swap/ban now live behind the row's `⋯` overflow menu
// (LAYOUT-DESIGN.md §4.1) instead of two always-visible icons.
// ---------------------------------------------------------------------------

/** "30kg × 11, 11, 10" for a flat-weight exercise; groups consecutive
 * same-weight sets (ramps) into "25kg × 12 · 30kg × 8"-style segments;
 * "Bodyweight × 11, 11, 10" when nothing was loaded. */
function formatCompletedSummary(sets: ExerciseSetLog[]): string {
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number)
  if (ordered.every(s => s.is_bodyweight)) {
    return `Bodyweight × ${ordered.map(s => s.reps_completed).join(', ')}`
  }
  const groups: { weight: number; reps: number[] }[] = []
  for (const s of ordered) {
    const last = groups[groups.length - 1]
    if (last && last.weight === s.weight_kg) last.reps.push(s.reps_completed)
    else groups.push({ weight: s.weight_kg, reps: [s.reps_completed] })
  }
  return groups.map(g => `${g.weight}kg × ${g.reps.join(', ')}`).join(' · ')
}

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
  expanded: boolean
  onToggleExpanded: () => void
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
  expanded,
  onToggleExpanded,
}: ExerciseRowProps) {
  const { setsFor, requestedSetFocus, clearSetFocusRequest } = useActiveSession()
  const exerciseId = ex.id ?? getExerciseId(ex.name)
  const loggedSets = setsFor(exerciseId, ex.name)
  const completedSets = loggedSets.length
  const allSetsLogged = completedSets >= ex.sets
  const ramp = formatRampSets(ex)
  const [explainedLoadChip, setExplainedLoadChip] = useState(false)

  // BottomDock's "Start next set" action, from a different subtree, routes
  // through this shared request rather than a prop — force-expand (the same
  // way a manual toggle would) then focus the target set's weight input
  // once it has painted.
  useEffect(() => {
    if (!requestedSetFocus || requestedSetFocus.exerciseName !== ex.name) return
    if (!expanded) {
      onToggleExpanded()
      return
    }
    const id = `setgrid-weight-${exerciseId}-${requestedSetFocus.setNumber}`
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.focus()
      clearSetFocusRequest()
    })
    return () => cancelAnimationFrame(raf)
  }, [requestedSetFocus, expanded, ex.name, exerciseId, onToggleExpanded, clearSetFocusRequest])

  const nameLine = (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      {supersetLabel && (
        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0.5 bg-background font-semibold shrink-0">
          {supersetLabel}
        </Badge>
      )}
      <span className={`font-medium truncate ${allSetsLogged ? 'line-through text-muted-foreground' : ''}`}>{ex.name}</span>
    </div>
  )

  return (
    <div className={`rounded-[12px] border p-3 space-y-2 ${allSetsLogged ? 'bg-primary/10 border-primary/30' : 'bg-card'}`}>
      {/* A plain div, not a <button> — LoadChip renders its own interactive
          "why this weight" button below, and a button can't legally contain
          another button (the browser silently splits/corrupts the DOM when
          it tries, which reads as "nothing ever expands"). role="button" +
          tabIndex + Enter/Space keeps this a real, keyboard-operable control. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded() } }}
        className="w-full text-left flex items-start justify-between gap-2 cursor-pointer"
      >
        <div className="min-w-0 flex-1 space-y-1">
          {nameLine}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{ex.sets}×{ex.reps}</span>
            <LoadChip
              ex={ex}
              source={loadSource}
              explained={false}
              onToggleExplain={() => {}}
              progressionNote={undefined}
            />
            {allSetsLogged ? (
              <span className="text-xs text-primary">{formatCompletedSummary(loggedSets)}</span>
            ) : completedSets > 0 ? (
              <Badge variant="secondary" className="text-[10px] font-mono">{completedSets}/{ex.sets} sets</Badge>
            ) : null}
          </div>
        </div>
        {expanded ? <ChevronDown className="size-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />}
      </div>

      {expanded && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Exercise options">
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onSwap}>
                  <ArrowRightLeft className="size-3.5" />
                  Swap exercise
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={banBusy} onClick={onBan}>
                  <Ban className="size-3.5" />
                  {banBusy ? 'Banning…' : 'Ban exercise'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        </>
      )}
    </div>
  )
}
