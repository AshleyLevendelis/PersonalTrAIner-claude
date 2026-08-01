import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ArrowRightLeft, Ban, Zap, ShieldAlert, Heart, Check, Dumbbell, Plus, Activity, Clock, Flame, ChevronLeft, ChevronRight, ChevronDown, Calendar, CheckCircle2, Trophy, Sparkles, Thermometer } from 'lucide-react'
import React, { useState, useEffect, useCallback } from 'react'
import { getSmartReplacements, getExerciseEntry } from '@/lib/exercise-db'
import { upsertWorkoutLog, getLogsForDate, insertCardioLog, getCardioLogsForDate } from '@/lib/daily-tracking'
import { checkDoubleProgression, getLastSessionLoad, getProgressedWeight } from '@/lib/progression-engine'
import { logSetOffline, logEntireSessionOffline, saveSessionCache, loadSessionCache, initOfflineSync } from '@/lib/offline-sync'
import { getActiveMesocycleWeek } from '@/lib/calculations'
import { checkForPR, seedPRCacheFromHistory, getTopPRSet, getLastSessionForExercise, type PRResult, type SessionSet } from '@/lib/pr-engine'
import { RestTimer } from '@/components/RestTimer'
import { PlateCalculator } from '@/components/PlateCalculator'
import { OfflineStatusIndicator } from '@/components/OfflineStatusIndicator'
import type { ExerciseEntry } from '@/lib/exercise-db'
import type { WorkoutDay, ExerciseSetLog, CardioLog, MesocycleWeek } from '@/lib/types'

interface ExercisePlanProps {
  plan: WorkoutDay[]
  mesocycle?: MesocycleWeek[]
  exclusions: string[]
  profileId?: string
  planCreatedAt?: string
  logsVersion?: number
  devOverrideWeek?: number | null
  devOverrideDay?: string | null
  devBypassLocks?: boolean
  onSwapExercise: (dayIndex: number, exIndex: number, newExercise: ExerciseEntry) => void
  onBanExercise: (exerciseName: string) => void
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function isTimeBased(reps: string): boolean {
  return reps.includes('s') || reps.includes('min') || reps.includes('m')
}

function getRepsLabel(reps: string): string {
  if (reps.includes('min')) return 'Duration'
  if (reps.endsWith('s') || reps.includes('-') && reps.endsWith('s')) return 'Time'
  if (reps.endsWith('m')) return 'Distance'
  return 'Reps'
}

/** Week-level periodization context (phase, focus, coach note) — shown at the top of every day so it's visible regardless of what that day's session looks like. */
function PhaseBanner({ mesoWeek }: { mesoWeek?: MesocycleWeek }) {
  if (!mesoWeek || (!mesoWeek.phase_label && !mesoWeek.phase_focus && !mesoWeek.coach_note)) return null
  return (
    <div className="flex items-start gap-2 rounded-md border border-primary/15 bg-primary/5 px-3 py-2">
      <Sparkles className="size-3.5 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {mesoWeek.phase_label && (
            <span className="text-xs font-semibold text-primary">{mesoWeek.phase_label}</span>
          )}
          {mesoWeek.is_deload && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
              Deload
            </Badge>
          )}
        </div>
        {mesoWeek.phase_focus && (
          <p className="text-[11px] text-muted-foreground">{mesoWeek.phase_focus}</p>
        )}
        {mesoWeek.coach_note && (
          <p className="text-[11px] text-muted-foreground/80 italic">{mesoWeek.coach_note}</p>
        )}
      </div>
    </div>
  )
}

/** Prominent week-1 note for trainees who skipped onboarding's known-lifts question — separate from PhaseBanner because this needs to stand out, not blend into the routine phase context. */
function CalibrationBanner({ mesoWeek }: { mesoWeek?: MesocycleWeek }) {
  if (!mesoWeek?.isCalibrationWeek) return null
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/40 px-3 py-2">
      <Thermometer className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Week 1 — Calibration Week</span>
        <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80">
          Find the weight where your last rep feels like RPE 6. Log your session so week 2 scales from your actual performance.
        </p>
      </div>
    </div>
  )
}

function RestDayCard({ day, mesoWeek }: { day: string; mesoWeek?: MesocycleWeek }) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-muted-foreground">{day}</CardTitle>
          <Badge variant="outline" className="text-muted-foreground">Rest & Recovery</Badge>
        </div>
        <PhaseBanner mesoWeek={mesoWeek} />
        <CalibrationBanner mesoWeek={mesoWeek} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 py-4">
          <div className="flex items-center justify-center size-10 rounded-full bg-muted">
            <Heart className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Full Rest</p>
            <p className="text-xs text-muted-foreground/70">
              Focus on sleep, hydration, and hitting your baseline nutrition targets today.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ActiveRecoveryCard({ workout, mesoWeek }: { workout: WorkoutDay; mesoWeek?: MesocycleWeek }) {
  const cardio = workout.recommendedCardio
  return (
    <Card className="border-orange-200/60 dark:border-orange-900/30 bg-gradient-to-br from-orange-50/30 to-background dark:from-orange-950/10 dark:to-background">
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{workout.day}</CardTitle>
          <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-0">
            <Activity className="size-3 mr-1" />
            {workout.focus}
          </Badge>
        </div>
        <PhaseBanner mesoWeek={mesoWeek} />
        <CalibrationBanner mesoWeek={mesoWeek} />
      </CardHeader>
      <CardContent>
        {cardio && (
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0 mt-0.5">
              <Activity className="size-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-semibold">{cardio.activity}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />{cardio.duration} min
                </span>
                <span className="flex items-center gap-1">
                  <Flame className="size-3" />RPE {cardio.targetRpe}/10
                </span>
              </div>
              <p className="text-xs text-muted-foreground/80 italic">{cardio.reason}</p>
            </div>
          </div>
        )}
        {!cardio && (
          <div className="flex items-center gap-3 py-4">
            <div className="flex items-center justify-center size-10 rounded-full bg-muted">
              <Heart className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Active Recovery</p>
              <p className="text-xs text-muted-foreground/70">
                Light movement, mobility work, and nutrition focus.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function WarmupSection({ warmup, open, onToggle }: { warmup: WorkoutDay['warmup']; open: boolean; onToggle: () => void }) {
  if (!warmup) return null
  const totalMinutes = Math.round(warmup.total_seconds / 60)

  return (
    <Collapsible open={open} onOpenChange={onToggle} className="border-b border-border/30">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-accent/30 transition-colors">
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Thermometer className="size-3.5 text-primary" />
          Warm-Up
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">~{totalMinutes} min</Badge>
        </span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3 space-y-3">
        {warmup.general.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">General</p>
            {warmup.general.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {warmup.mobility.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Mobility</p>
            {warmup.mobility.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {warmup.ramp_up && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Ramp-Up — {warmup.ramp_up.exercise}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {warmup.ramp_up.sets.map(set => (
                <span
                  key={set.set_number}
                  className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  title={set.note}
                >
                  Set {set.set_number}: {set.load_percent}% × {set.reps}
                </span>
              ))}
            </div>
          </div>
        )}
        {warmup.coach_note && (
          <p className="text-[11px] text-muted-foreground/80 italic">{warmup.coach_note}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface SetInputState {
  weight: string
  reps: string
  isBodyweight: boolean
}

interface GhostValues {
  weight: string
  reps: string
}

function SetLogger({
  exerciseName,
  totalSets,
  profileId,
  todayLogs,
  onLogSaved,
  prescribedReps,
  restTime,
  weekNumber,
  tier,
  suggestedLoadKg,
  perSetLoadKg,
  onSetCompleted,
  onOpenPlateCalc,
}: {
  exerciseName: string
  totalSets: number
  profileId: string
  todayLogs: ExerciseSetLog[]
  onLogSaved: (log: ExerciseSetLog) => void
  prescribedReps?: string
  restTime?: string
  weekNumber?: number
  tier?: string
  suggestedLoadKg?: number | null
  /** Per-set breakdown (ramping or straight) — indexed by set number - 1. Falls back to suggestedLoadKg for any set beyond this array (e.g. an extra set the user added). */
  perSetLoadKg?: (number | null)[]
  onSetCompleted?: (exerciseName: string, setNumber: number, weight: number, reps: number, rest: string, sets: number, prescribedReps: string, tier?: string) => void
  onOpenPlateCalc?: (weight: number) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const existingLogs = todayLogs.filter(l => l.exercise_name === exerciseName)

  const [extraSets, setExtraSets] = useState(0)
  const displaySets = totalSets + extraSets

  const [inputs, setInputs] = useState<SetInputState[]>(() =>
    Array.from({ length: displaySets }, (_, i) => {
      const existing = existingLogs.find(l => l.set_number === i + 1)
      return {
        weight: existing ? String(existing.weight_kg) : '',
        reps: existing ? String(existing.reps_completed) : '',
        isBodyweight: existing?.is_bodyweight || false,
      }
    })
  )

  const [savedSets, setSavedSets] = useState<Set<number>>(() => {
    const saved = new Set<number>()
    existingLogs.forEach(l => saved.add(l.set_number))
    return saved
  })

  const [savingSet, setSavingSet] = useState<number | null>(null)
  const [prBadgeSet, setPrBadgeSet] = useState<{ setNumber: number; result: PRResult } | null>(null)
  const [animatingPr, setAnimatingPr] = useState(false)
  const [ghostValues, setGhostValues] = useState<GhostValues[]>([])

  // Load ghost values from last session
  useEffect(() => {
    getLastSessionForExercise(profileId, exerciseName, today).then(lastSets => {
      const ghosts: GhostValues[] = Array.from({ length: Math.max(totalSets + extraSets, lastSets.length) }, (_, i) => {
        const prev = lastSets.find(s => s.set_number === i + 1)
        return {
          weight: prev ? String(prev.weight_kg) : '',
          reps: prev ? String(prev.reps_completed) : '',
        }
      })
      setGhostValues(ghosts)
    }).catch(() => {})
  }, [profileId, exerciseName])

  useEffect(() => {
    const logMaxSet = existingLogs.length > 0 ? Math.max(...existingLogs.map(l => l.set_number)) : 0
    const extra = Math.max(0, logMaxSet - totalSets)
    setExtraSets(extra)
    const total = totalSets + extra

    const newInputs = Array.from({ length: total }, (_, i) => {
      const existing = existingLogs.find(l => l.set_number === i + 1)
      if (existing) {
        return {
          weight: String(existing.weight_kg),
          reps: String(existing.reps_completed),
          isBodyweight: existing.is_bodyweight,
        }
      }
      return inputs[i] || { weight: '', reps: '', isBodyweight: false }
    })
    setInputs(newInputs)
    const saved = new Set<number>()
    existingLogs.forEach(l => saved.add(l.set_number))
    setSavedSets(saved)
  }, [todayLogs, exerciseName])

  // Re-evaluate single top-set PR across all saved sets
  const reEvaluatePR = (updatedSavedSets: Set<number>, updatedInputs: SetInputState[]) => {
    const sessionSets: SessionSet[] = []
    updatedSavedSets.forEach(setNum => {
      const input = updatedInputs[setNum - 1]
      if (!input) return
      const w = input.isBodyweight ? 0 : (parseFloat(input.weight) || 0)
      const r = parseInt(input.reps) || 0
      if (w > 0 && r > 0) sessionSets.push({ setNumber: setNum, weight: w, reps: r })
    })
    const topPR = getTopPRSet(profileId, exerciseName, sessionSets)
    setPrBadgeSet(topPR)
  }

  const handleAddExtraSet = () => {
    setExtraSets(prev => prev + 1)
    setInputs(prev => [...prev, { weight: '', reps: '', isBodyweight: false }])
  }

  const handleSaveSet = async (setIndex: number) => {
    const setNumber = setIndex + 1
    const input = inputs[setIndex]
    const ghost = ghostValues[setIndex]

    // Use ghost values if input is empty
    const weightStr = input.weight || (input.isBodyweight ? '0' : ghost?.weight || '')
    const repsStr = input.reps || ghost?.reps || ''
    const weight = input.isBodyweight ? 0 : (parseFloat(weightStr) || 0)
    const reps = parseInt(repsStr) || 0

    if (!input.isBodyweight && weight === 0 && reps === 0) return
    if (input.isBodyweight && reps === 0) return

    // Auto-fill inputs with ghost values if they were blank
    const updatedInputs = inputs.map((item, i) =>
      i === setIndex ? { ...item, weight: input.isBodyweight ? '' : String(weight), reps: String(reps) } : item
    )
    setInputs(updatedInputs)

    setSavingSet(setNumber)
    try {
      const log = await upsertWorkoutLog(profileId, today, exerciseName, setNumber, weight, reps, input.isBodyweight)
      const newSaved = new Set([...savedSets, setNumber])
      setSavedSets(newSaved)
      onLogSaved(log)

      // PR check + single top-set re-evaluation
      const pr = checkForPR(profileId, exerciseName, weight, reps)
      if (pr) {
        setAnimatingPr(true)
        setTimeout(() => setAnimatingPr(false), 2000)
      }
      reEvaluatePR(newSaved, updatedInputs)

      if (onSetCompleted && prescribedReps) {
        onSetCompleted(exerciseName, setNumber, weight, reps, restTime || '60s', totalSets, prescribedReps, tier)
      }
    } catch (err) {
      console.error('Failed to save set:', err)
    } finally {
      setSavingSet(null)
    }
  }

  const updateInput = (index: number, field: 'weight' | 'reps', value: string) => {
    setInputs(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const toggleBodyweight = (index: number) => {
    setInputs(prev => prev.map((item, i) => i === index ? { ...item, isBodyweight: !item.isBodyweight, weight: '' } : item))
  }

  // Ramping compounds prescribe a lighter weight for set 1 than the top set —
  // a flat suggestedLoadKg placeholder on every row would suggest the same
  // weight for the whole ramp. Falls back to the flat value for any set index
  // beyond the per-set array (e.g. an extra set the user added).
  const defaultWeightFor = (index: number): string => {
    const perSet = perSetLoadKg?.[index]
    if (perSet != null) return String(perSet)
    return suggestedLoadKg != null ? String(suggestedLoadKg) : '0'
  }

  return (
    <div className="px-4 pb-3 pt-1 space-y-1">
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_1fr_auto] gap-1.5 items-center text-xs text-muted-foreground font-medium px-1">
        <span className="w-5">#</span>
        <span>Weight</span>
        <span className="w-7"></span>
        <span className="w-7"></span>
        <span className="w-8"></span>
        <span>Reps</span>
        <span className="w-8"></span>
      </div>
      {Array.from({ length: displaySets }, (_, i) => {
        const isSaved = savedSets.has(i + 1)
        const isSaving = savingSet === i + 1
        const isBW = inputs[i]?.isBodyweight || false
        const isPRSet = prBadgeSet?.setNumber === i + 1
        const ghost = ghostValues[i]

        return (
          <div
            key={i}
            className={`grid grid-cols-[auto_1fr_auto_auto_auto_1fr_auto] gap-1.5 items-center rounded-md px-1 py-0.5 transition-colors ${
              isSaved ? 'bg-green-50 dark:bg-green-950/20' : ''
            }`}
          >
            <span className={`w-5 text-xs font-medium text-center ${isSaved ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
              {i + 1}
            </span>
            <Input
              type="number"
              min="0"
              step="0.5"
              placeholder={isBW ? 'BW' : (ghost?.weight || defaultWeightFor(i))}
              value={isBW ? '' : (inputs[i]?.weight || '')}
              onChange={e => updateInput(i, 'weight', e.target.value)}
              className={`h-7 text-sm ${isSaved ? 'border-green-300 dark:border-green-700' : ''} ${isBW ? 'bg-muted text-muted-foreground' : ''}`}
              disabled={isSaving || isBW}
            />
            <Button
              variant="outline"
              size="icon-xs"
              className="size-7 text-muted-foreground hover:text-foreground border-dashed"
              onClick={() => onOpenPlateCalc?.(parseFloat(inputs[i]?.weight || ghost?.weight || '0') || 0)}
              disabled={isBW}
              aria-label="Plate calculator"
            >
              <Dumbbell className="size-3.5" />
            </Button>
            <Button
              variant={isBW ? 'default' : 'outline'}
              size="sm"
              className="h-7 w-7 text-[10px] font-bold px-0"
              onClick={() => toggleBodyweight(i)}
              disabled={isSaving}
              aria-label="Toggle bodyweight"
            >
              BW
            </Button>
            <Input
              type="number"
              min="0"
              step="1"
              placeholder={ghost?.reps || '0'}
              value={inputs[i]?.reps || ''}
              onChange={e => updateInput(i, 'reps', e.target.value)}
              className={`h-7 text-sm w-14 ${isSaved ? 'border-green-300 dark:border-green-700' : ''}`}
              disabled={isSaving}
            />
            <div className="flex items-center gap-1">
              {isPRSet && prBadgeSet?.result && (
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 whitespace-nowrap ${animatingPr ? 'animate-pulse scale-110' : ''} transition-transform`}>
                  <Trophy className="size-2.5" />
                  PR
                </span>
              )}
              <Button
                variant={isSaved ? 'ghost' : 'outline'}
                size="icon"
                className={`size-7 shrink-0 ${isSaved ? 'text-green-600 dark:text-green-400' : ''}`}
                onClick={() => handleSaveSet(i)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <div className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        )
      })}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground h-6 mt-0.5"
        onClick={handleAddExtraSet}
      >
        <Plus className="size-3 mr-1" />
        Add Set
      </Button>
    </div>
  )
}

const CONDITIONING_PRESETS = [
  { label: '15m Incline Walk', icon: '🚶', activity: 'Incline Treadmill Walk', duration: 15, rpe: 4 },
  { label: '15m Heavy Bag', icon: '🥊', activity: 'Heavy Bag / Functional Circuit', duration: 15, rpe: 7 },
  { label: '10m HIIT Bike', icon: '🚴', activity: 'HIIT / Assault Bike', duration: 10, rpe: 8 },
  { label: '15m Zone 2', icon: '🫀', activity: 'Zone 2 Cardio', duration: 15, rpe: 5 },
] as const

export function ExercisePlan({ plan, mesocycle, exclusions, profileId, planCreatedAt, logsVersion, devOverrideWeek, devOverrideDay, devBypassLocks, onSwapExercise, onBanExercise }: ExercisePlanProps) {
  // generateMesocycle produces 4 weeks PER BLOCK, not 4 weeks total — a
  // hypertrophy sequence alone is 4 blocks (16 weeks). Falling back to 4 only
  // applies before the mesocycle has loaded.
  const totalWeeks = mesocycle && mesocycle.length > 0 ? mesocycle.length : 4
  const [currentWeek, setCurrentWeek] = useState(() => devOverrideWeek ?? getActiveMesocycleWeek(planCreatedAt, undefined, totalWeeks))
  useEffect(() => {
    if (devOverrideWeek != null) setCurrentWeek(devOverrideWeek)
    else setCurrentWeek(getActiveMesocycleWeek(planCreatedAt, undefined, totalWeeks))
  }, [devOverrideWeek, planCreatedAt, totalWeeks])
  const [swapDialog, setSwapDialog] = useState<{ dayIndex: number; exIndex: number; exerciseName: string } | null>(null)
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set())
  const [expandedWarmups, setExpandedWarmups] = useState<Set<string>>(new Set())
  const [todayLogs, setTodayLogs] = useState<ExerciseSetLog[]>([])
  const [customExercises, setCustomExercises] = useState<Record<string, string[]>>({})
  const [addingCustom, setAddingCustom] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [addingCardioFinisher, setAddingCardioFinisher] = useState<string | null>(null)
  const [cardioFinisherInput, setCardioFinisherInput] = useState({ activity: '', duration: '', rpe: 5, heartRate: '' })
  const [cardioFinishers, setCardioFinishers] = useState<CardioLog[]>([])
  const [savingCardio, setSavingCardio] = useState(false)
  const [restTimer, setRestTimer] = useState<{ seconds: number; exerciseName: string } | null>(null)
  const [sessionLogged, setSessionLogged] = useState(false)
  const [progressionToast, setProgressionToast] = useState<string | null>(null)
  const [setWeights, setSetWeights] = useState<Record<string, number>>({})
  const [setReps, setSetReps] = useState<Record<string, number>>({})
  const [completedSetsMap, setCompletedSetsMap] = useState<Record<string, boolean>>({})
  const [loggingSession, setLoggingSession] = useState(false)
  const [plateCalcOpen, setPlateCalcOpen] = useState(false)
  const [plateCalcWeight, setPlateCalcWeight] = useState(0)
  const [progressedLoads, setProgressedLoads] = useState<Record<string, number>>({})

  const hasMesocycle = mesocycle && mesocycle.length > 0
  const activePlan = hasMesocycle
    ? mesocycle.find(w => w.week_number === currentWeek)?.days || plan
    : plan
  const currentMesoWeekObj = hasMesocycle
    ? mesocycle.find(w => w.week_number === currentWeek)
    : undefined
  const weekLabel = currentMesoWeekObj?.label || ''

  // The mesocycle is several blocks of 4 weeks each (16 weeks for a typical
  // 4-block sequence), not 4 weeks total — the pagination needs both a block
  // indicator and, within that, the weeks belonging to the active block.
  const blockCount = hasMesocycle
    ? Math.max(...mesocycle.map(w => w.block_number ?? 1))
    : 1
  const currentBlockWeeks = hasMesocycle
    ? mesocycle
        .filter(w => w.block_number === (currentMesoWeekObj?.block_number ?? 1))
        .map(w => w.week_number)
    : [1]
  const jumpToBlock = (blockNumber: number) => {
    if (!hasMesocycle) return
    const firstWeekOfBlock = mesocycle.find(w => w.block_number === blockNumber)?.week_number
    if (firstWeekOfBlock != null) setCurrentWeek(firstWeekOfBlock)
  }

  const today = new Date().toISOString().split('T')[0]
  const todayName = devOverrideDay ?? new Date().toLocaleDateString('en-US', { weekday: 'long' })

  useEffect(() => {
    if (profileId) {
      getLogsForDate(profileId, today).then(setTodayLogs).catch(console.error)
      getCardioLogsForDate(profileId, today).then(setCardioFinishers).catch(console.error)
      seedPRCacheFromHistory(profileId).catch(console.error)
    }
  }, [profileId, today])

  useEffect(() => {
    initOfflineSync()
    const cached = loadSessionCache()
    if (cached && cached.weekNumber === currentWeek) {
      setCompletedSetsMap(cached.completedSets)
      setSetWeights(cached.setWeights)
      setSetReps(cached.setReps)
      setSessionLogged(cached.sessionLogged)
    }
  }, [])

  // Week 2+: prefer what the trainee actually lifted last session over the
  // mesocycle's static estimate. Week 1 never has prior data, so this is a
  // no-op there and the static suggested_load_kg on the exercise stands.
  useEffect(() => {
    if (!profileId || currentWeek <= 1) {
      setProgressedLoads({})
      return
    }
    const todayWorkout = activePlan.find(d => d.day === todayName)
    if (!todayWorkout) {
      setProgressedLoads({})
      return
    }

    let cancelled = false
    Promise.all(
      todayWorkout.exercises
        .filter(ex => ex.suggested_load_kg != null)
        .map(async ex => {
          const lastWeight = await getLastSessionLoad(profileId, ex.name, today)
          return [ex.name, lastWeight] as const
        })
    ).then(results => {
      if (cancelled) return
      const next: Record<string, number> = {}
      for (const [name, lastWeight] of results) {
        if (lastWeight != null) next[name] = getProgressedWeight(lastWeight)
      }
      setProgressedLoads(next)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [profileId, currentWeek, todayName, activePlan, today])

  useEffect(() => {
    if (profileId && logsVersion && logsVersion > 0) {
      getLogsForDate(profileId, today).then(logs => {
        setTodayLogs(logs)
        // Sync input fields from fetched logs so UI reflects chat-logged sets
        const newReps: Record<string, number> = { ...setReps }
        const newWeights: Record<string, number> = { ...setWeights }
        const newCompleted: Record<string, boolean> = { ...completedSetsMap }
        for (const log of logs) {
          const key = `${log.exercise_name}-${log.set_number}`
          newReps[key] = log.reps_completed
          newWeights[key] = log.weight_kg
          newCompleted[key] = true
        }
        setSetReps(newReps)
        setSetWeights(newWeights)
        setCompletedSetsMap(newCompleted)
      }).catch(console.error)
    }
  }, [logsVersion])

  const replacements = swapDialog
    ? getSmartReplacements(swapDialog.exerciseName, exclusions)
    : []

  const currentEntry = swapDialog ? getExerciseEntry(swapDialog.exerciseName) : undefined

  const toggleExercise = (key: string) => {
    setExpandedExercises(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleWarmup = (key: string) => {
    setExpandedWarmups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleLogSaved = (log: ExerciseSetLog) => {
    setTodayLogs(prev => {
      const idx = prev.findIndex(l =>
        l.exercise_name === log.exercise_name && l.set_number === log.set_number && l.date === log.date
      )
      if (idx >= 0) return prev.map((l, i) => i === idx ? log : l)
      return [...prev, log]
    })
  }

  const getCompletedSetsCount = (exerciseName: string): number => {
    return todayLogs.filter(l => l.exercise_name === exerciseName).length
  }

  function parseRestSeconds(rest: string): number {
    const match = rest.match(/(\d+)/)
    return match ? parseInt(match[1]) : 60
  }

  function parseRepsLow(reps: string): number {
    const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) return parseInt(rangeMatch[1])
    const single = parseInt(reps)
    return isNaN(single) ? 10 : single
  }

  const handleSetComplete = useCallback((
    exerciseName: string,
    setNumber: number,
    weightKg: number,
    repsCompleted: number,
    restStr: string,
    prescribedSets: number,
    prescribedReps: string,
    tier?: string
  ) => {
    if (!profileId) return
    const key = `${exerciseName}-${setNumber}`

    // Optimistic: update UI immediately
    const newCompleted = { ...completedSetsMap, [key]: true }
    setCompletedSetsMap(newCompleted)

    handleLogSaved({
      user_id: profileId,
      date: today,
      exercise_name: exerciseName,
      set_number: setNumber,
      weight_kg: weightKg,
      reps_completed: repsCompleted,
      is_bodyweight: weightKg === 0,
    })

    const restSeconds = parseRestSeconds(restStr)
    if (restSeconds > 0) {
      setRestTimer({ seconds: restSeconds, exerciseName })
    }

    // Persist to localStorage immediately
    saveSessionCache({
      completedSets: newCompleted,
      setWeights,
      setReps,
      sessionLogged,
      day: todayName,
      weekNumber: currentWeek,
    })

    // Fire-and-forget network write (queues offline)
    logSetOffline({
      userId: profileId,
      exerciseName,
      weekNumber: currentWeek,
      day: todayName,
      setNumber,
      weightKg,
      repsCompleted,
    })

    // Check progression in the background (only if online)
    if (navigator.onLine) {
      checkDoubleProgression(
        profileId, exerciseName, currentWeek, todayName, prescribedSets, prescribedReps, tier as any
      ).then(progression => {
        if (progression) {
          if (progression.type === 'primer_complete') {
            setProgressionToast(`Primer complete! Great neural velocity.`)
          } else {
            setProgressionToast(
              `Progressive Overload Unlocked: +${(progression.newWeight - progression.currentWeight).toFixed(1)}kg target set for next week on ${progression.exerciseName}!`
            )
          }
          setTimeout(() => setProgressionToast(null), 5000)
        }
      }).catch(() => {})
    }
  }, [profileId, currentWeek, todayName, today, completedSetsMap, setWeights, setReps, sessionLogged])

  const handleLogEntireSession = useCallback(() => {
    if (!profileId) return
    const todayWorkout = activePlan.find(d => d.day === todayName)
    if (!todayWorkout) return

    setLoggingSession(true)
    const exercises = todayWorkout.exercises.map(ex => {
      const weightKey = `${ex.name}-1`
      return {
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight_kg: setWeights[weightKey] || 0,
      }
    })

    // Populate set input state with prescribed values for every set row
    const newWeights: Record<string, number> = { ...setWeights }
    const newReps: Record<string, number> = { ...setReps }
    todayWorkout.exercises.forEach(ex => {
      const prescribedWeight = setWeights[`${ex.name}-1`] || 0
      const parsedReps = parseRepsLow(ex.reps)
      for (let s = 1; s <= ex.sets; s++) {
        newWeights[`${ex.name}-${s}`] = prescribedWeight
        newReps[`${ex.name}-${s}`] = parsedReps
      }
    })
    setSetWeights(newWeights)
    setSetReps(newReps)

    // Optimistic: mark all sets complete immediately
    const allKeys: Record<string, boolean> = {}
    todayWorkout.exercises.forEach(ex => {
      for (let s = 1; s <= ex.sets; s++) {
        allKeys[`${ex.name}-${s}`] = true
      }
    })
    const newCompleted = { ...completedSetsMap, ...allKeys }
    setCompletedSetsMap(newCompleted)
    setSessionLogged(true)
    setLoggingSession(false)

    // Also inject todayLogs so SetLogger rows turn green
    const syntheticLogs: ExerciseSetLog[] = todayWorkout.exercises.flatMap(ex => {
      const w = newWeights[`${ex.name}-1`] || 0
      const r = newReps[`${ex.name}-1`] || parseRepsLow(ex.reps)
      return Array.from({ length: ex.sets }, (_, i) => ({
        user_id: profileId,
        date: today,
        exercise_name: ex.name,
        set_number: i + 1,
        weight_kg: w,
        reps_completed: r,
        is_bodyweight: w === 0,
      }))
    })
    setTodayLogs(prev => {
      const existing = new Set(prev.map(l => `${l.exercise_name}-${l.set_number}`))
      const toAdd = syntheticLogs.filter(l => !existing.has(`${l.exercise_name}-${l.set_number}`))
      return [...prev, ...toAdd]
    })

    // Persist to localStorage
    saveSessionCache({
      completedSets: newCompleted,
      setWeights: newWeights,
      setReps: newReps,
      sessionLogged: true,
      day: todayName,
      weekNumber: currentWeek,
    })

    // Fire-and-forget network write (queues offline)
    logEntireSessionOffline({
      userId: profileId,
      weekNumber: currentWeek,
      day: todayName,
      exercises,
    })
  }, [profileId, activePlan, todayName, currentWeek, setWeights, completedSetsMap, setReps])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end min-h-[24px]">
        <OfflineStatusIndicator />
      </div>
      {hasMesocycle && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentWeek <= 1}
                onClick={() => setCurrentWeek(w => Math.max(1, w - 1))}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{weekLabel}</span>
                </div>
                {blockCount > 1 && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: blockCount }, (_, i) => i + 1).map(b => (
                      <button
                        key={b}
                        onClick={() => jumpToBlock(b)}
                        className={`text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded transition-colors ${
                          b === currentMesoWeekObj?.block_number
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-primary/10 text-muted-foreground hover:bg-primary/20'
                        }`}
                      >
                        B{b}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  {currentBlockWeeks.map(w => (
                    <button
                      key={w}
                      onClick={() => setCurrentWeek(w)}
                      className={`h-2 w-6 rounded-full transition-colors ${
                        w === currentWeek
                          ? 'bg-primary'
                          : 'bg-primary/20 hover:bg-primary/40'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentWeek >= totalWeeks}
                onClick={() => setCurrentWeek(w => Math.min(totalWeeks, w + 1))}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {DAY_ORDER.map((dayName) => {
        const workout = activePlan.find(d => d.day === dayName)

        if (!workout) {
          return <RestDayCard key={dayName} day={dayName} mesoWeek={currentMesoWeekObj} />
        }

        if (workout.exercises.length === 0) {
          return <ActiveRecoveryCard key={dayName} workout={workout} mesoWeek={currentMesoWeekObj} />
        }

        const dayIndex = activePlan.indexOf(workout)
        const isToday = devBypassLocks || dayName === todayName

        return (
        <React.Fragment key={dayName}>
        <Card className={isToday ? 'ring-2 ring-primary/20' : undefined}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{workout.day}</CardTitle>
                {isToday && (
                  <Badge variant="default" className="text-[10px]">Today</Badge>
                )}
              </div>
              <Badge variant="secondary">Primary Focus: {workout.focus}</Badge>
            </div>
            <div className="mt-2 space-y-2">
              <PhaseBanner mesoWeek={currentMesoWeekObj} />
              <CalibrationBanner mesoWeek={currentMesoWeekObj} />
            </div>
            {isToday && !sessionLogged && (
              <div className="mt-2">
                <Button
                  size="sm"
                  className="w-full gap-2"
                  disabled={loggingSession}
                  onClick={handleLogEntireSession}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {loggingSession ? 'Logging...' : 'Complete & Log All Sets'}
                </Button>
              </div>
            )}
            {isToday && sessionLogged && (
              <Badge className="mt-2 w-full justify-center bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0">
                Session logged!
              </Badge>
            )}
          </CardHeader>
          {workout.recommendedCardio && (
            <div className="px-4 pb-2 flex items-start gap-2 border-b border-border/30">
              <Activity className="size-3.5 text-orange-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{workout.recommendedCardio.activity}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                    {workout.recommendedCardio.timing === 'post_session' ? 'Post-Lift' :
                     workout.recommendedCardio.timing === 'independent_session' ? 'Separate Session' : 'Rest Day'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {workout.recommendedCardio.duration} min @ RPE {workout.recommendedCardio.targetRpe} — {workout.recommendedCardio.reason}
                </p>
              </div>
            </div>
          )}
          {workout.conditioning_note && !workout.recommendedCardio && (
            <div className="px-4 pb-2 flex items-start gap-2 border-b border-border/30">
              <Activity className="size-3.5 text-orange-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Conditioning:</span> {workout.conditioning_note}
              </p>
            </div>
          )}
          <WarmupSection
            warmup={workout.warmup}
            open={expandedWarmups.has(dayName)}
            onToggle={() => toggleWarmup(dayName)}
          />
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Exercise</TableHead>
                  <TableHead className="text-center w-16">Sets</TableHead>
                  <TableHead className="text-center w-20">Reps</TableHead>
                  <TableHead className="text-center w-16">Rest</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workout.exercises.map((ex, exIndex) => {
                  const hasSuperset = !!ex.superset_label
                  const exerciseKey = `${dayName}-${ex.name}`
                  const isExpanded = expandedExercises.has(exerciseKey)
                  const completedSets = getCompletedSetsCount(ex.name)
                  const allSetsLogged = completedSets >= ex.sets

                  return (
                  <React.Fragment key={exIndex}>
                    <TableRow
                      className={`${hasSuperset ? 'bg-muted/30' : ''} ${allSetsLogged && isToday ? 'bg-green-50/50 dark:bg-green-950/10' : ''}`}
                    >
                      <TableCell className="w-10 pr-0">
                        {hasSuperset && (
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0.5 bg-background font-semibold">
                            {ex.superset_label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${allSetsLogged && isToday ? 'line-through text-muted-foreground' : ''}`}>{ex.name}</span>
                          {isToday && completedSets > 0 && (
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {completedSets}/{ex.sets}
                            </Badge>
                          )}
                        </div>
                        {(ex.intensity || ex.suggested_load || (ex.per_set_load && ex.per_set_load.length > 0)) && (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {ex.intensity && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Flame className="size-2.5" />{ex.intensity}
                              </span>
                            )}
                            {ex.per_set_load && ex.per_set_load.length > 0 ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                <Dumbbell className="size-2.5 text-muted-foreground shrink-0" />
                                {ex.per_set_load.map(s => (
                                  <span
                                    key={s.set_number}
                                    className="inline-flex items-center rounded border px-1 py-0 text-[10px] text-muted-foreground leading-4"
                                    title={s.display}
                                  >
                                    S{s.set_number}: {s.load_kg}kg
                                  </span>
                                ))}
                                {ex.per_set_load[0].display.includes('per hand') && (
                                  <span className="text-[10px] text-muted-foreground/70">per hand</span>
                                )}
                              </div>
                            ) : ex.suggested_load && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Dumbbell className="size-2.5" />{ex.suggested_load}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{ex.sets}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          {isTimeBased(ex.reps) && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                              {getRepsLabel(ex.reps)}
                            </span>
                          )}
                          <span>{ex.reps}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {ex.rest === 'alternate' ? (
                          <span className="text-xs text-muted-foreground italic">alt.</span>
                        ) : ex.rest}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {profileId && isToday && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`size-7 ${isExpanded ? 'text-primary' : ''}`}
                              onClick={() => toggleExercise(exerciseKey)}
                              aria-label="Log sets"
                            >
                              <Dumbbell className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setSwapDialog({ dayIndex, exIndex, exerciseName: ex.name })}
                            aria-label="Swap exercise"
                          >
                            <ArrowRightLeft className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => onBanExercise(ex.name)}
                            aria-label="Ban exercise"
                          >
                            <Ban className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {profileId && isToday && isExpanded && (
                      <tr>
                        <td colSpan={6} className="p-0 border-b border-border/50">
                          <SetLogger
                            exerciseName={ex.name}
                            totalSets={ex.sets}
                            profileId={profileId}
                            todayLogs={todayLogs}
                            onLogSaved={handleLogSaved}
                            prescribedReps={ex.reps}
                            restTime={ex.rest}
                            weekNumber={currentWeek}
                            tier={ex.tier}
                            suggestedLoadKg={progressedLoads[ex.name] ?? ex.suggested_load_kg}
                            perSetLoadKg={progressedLoads[ex.name] != null ? undefined : ex.per_set_load?.map(s => s.load_kg)}
                            onSetCompleted={handleSetComplete}
                            onOpenPlateCalc={(w) => { setPlateCalcWeight(w); setPlateCalcOpen(true) }}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )})}
                {/* Custom exercises for today */}
                {profileId && isToday && (customExercises[dayName] || []).map((customName, cIdx) => {
                  const exerciseKey = `${dayName}-custom-${customName}`
                  const isExpanded = expandedExercises.has(exerciseKey)
                  const completedSets = getCompletedSetsCount(customName)

                  return (
                    <React.Fragment key={`custom-${cIdx}`}>
                      <TableRow className={completedSets > 0 ? 'bg-green-50/50 dark:bg-green-950/10' : 'bg-accent/30'}>
                        <TableCell className="w-10 pr-0">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-background">+</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{customName}</span>
                            {completedSets > 0 && (
                              <Badge variant="secondary" className="text-[10px] font-mono">{completedSets} sets</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">-</TableCell>
                        <TableCell className="text-center text-muted-foreground">-</TableCell>
                        <TableCell className="text-center text-muted-foreground">-</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`size-7 ${isExpanded ? 'text-primary' : ''}`}
                            onClick={() => toggleExercise(exerciseKey)}
                            aria-label="Log sets"
                          >
                            <Dumbbell className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-0 border-b border-border/50">
                            <SetLogger
                              exerciseName={customName}
                              totalSets={3}
                              profileId={profileId}
                              todayLogs={todayLogs}
                              onLogSaved={handleLogSaved}
                              onSetCompleted={handleSetComplete}
                              prescribedReps="8-12"
                              restTime="60s"
                              onOpenPlateCalc={(w) => { setPlateCalcWeight(w); setPlateCalcOpen(true) }}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
            {profileId && isToday && (
              <div className="px-4 pb-3 pt-2 border-t border-border/50 space-y-3">

                {/* Add Extra Lift form */}
                {addingCustom === dayName && (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Lift name (e.g. Shrugs, Bicep Curls)"
                      value={customInput}
                      onChange={e => setCustomInput(e.target.value)}
                      className="h-8 text-sm"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customInput.trim()) {
                          setCustomExercises(prev => ({
                            ...prev,
                            [dayName]: [...(prev[dayName] || []), customInput.trim()],
                          }))
                          const newKey = `${dayName}-custom-${customInput.trim()}`
                          setExpandedExercises(prev => new Set([...prev, newKey]))
                          setCustomInput('')
                          setAddingCustom(null)
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={!customInput.trim()}
                      onClick={() => {
                        if (customInput.trim()) {
                          setCustomExercises(prev => ({
                            ...prev,
                            [dayName]: [...(prev[dayName] || []), customInput.trim()],
                          }))
                          const newKey = `${dayName}-custom-${customInput.trim()}`
                          setExpandedExercises(prev => new Set([...prev, newKey]))
                          setCustomInput('')
                          setAddingCustom(null)
                        }
                      }}
                    >
                      Add
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => { setAddingCustom(null); setCustomInput('') }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {/* Inline Cardio / Conditioning form */}
                {addingCardioFinisher === dayName && (
                  <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Activity className="size-3.5 text-orange-500" />
                        Log Cardio / Conditioning
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                        onClick={() => setAddingCardioFinisher(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                    {/* Quick Presets */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {CONDITIONING_PRESETS.map(preset => (
                        <Button
                          key={preset.activity}
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] justify-start gap-1 px-2"
                          onClick={() => setCardioFinisherInput({ activity: preset.activity, duration: String(preset.duration), rpe: preset.rpe, heartRate: '' })}
                        >
                          <span>{preset.icon}</span>
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <Input
                      placeholder="Activity Name (e.g. Muay Thai, Running, Skipping...)"
                      value={cardioFinisherInput.activity}
                      onChange={e => setCardioFinisherInput(prev => ({ ...prev, activity: e.target.value }))}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                          <Clock className="size-2.5" /> Duration (mins)
                        </span>
                        <Input
                          type="number"
                          min="1"
                          placeholder="15"
                          value={cardioFinisherInput.duration}
                          onChange={e => setCardioFinisherInput(prev => ({ ...prev, duration: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                          <Heart className="size-2.5" /> Avg HR (optional)
                        </span>
                        <Input
                          type="number"
                          min="40"
                          max="220"
                          placeholder="145"
                          value={cardioFinisherInput.heartRate}
                          onChange={e => setCardioFinisherInput(prev => ({ ...prev, heartRate: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1.5">
                        <Flame className="size-2.5" /> Intensity RPE {cardioFinisherInput.rpe} / 10
                      </span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(val => (
                          <button
                            key={val}
                            type="button"
                            className={`flex-1 h-7 rounded text-[10px] font-semibold transition-all ${
                              val <= cardioFinisherInput.rpe
                                ? val <= 3 ? 'bg-emerald-500 text-white'
                                  : val <= 5 ? 'bg-yellow-500 text-white'
                                  : val <= 7 ? 'bg-orange-500 text-white'
                                  : 'bg-red-500 text-white'
                                : 'bg-muted text-muted-foreground hover:bg-accent'
                            }`}
                            onClick={() => setCardioFinisherInput(prev => ({ ...prev, rpe: val }))}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8"
                      disabled={!cardioFinisherInput.activity.trim() || !cardioFinisherInput.duration || savingCardio}
                      onClick={async () => {
                        if (!profileId || !cardioFinisherInput.activity.trim() || !cardioFinisherInput.duration) return
                        setSavingCardio(true)
                        try {
                          const log = await insertCardioLog(
                            profileId,
                            today,
                            cardioFinisherInput.activity.trim(),
                            parseInt(cardioFinisherInput.duration),
                            cardioFinisherInput.rpe,
                            cardioFinisherInput.heartRate ? parseInt(cardioFinisherInput.heartRate) : null,
                            null,
                          )
                          setCardioFinishers(prev => [log, ...prev])
                          setCardioFinisherInput({ activity: '', duration: '', rpe: 5, heartRate: '' })
                          setAddingCardioFinisher(null)
                        } catch (err) {
                          console.error('Failed to save cardio finisher:', err)
                        } finally {
                          setSavingCardio(false)
                        }
                      }}
                    >
                      {savingCardio ? (
                        <div className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                      ) : (
                        <Activity className="size-3 mr-1" />
                      )}
                      Save Cardio Session
                    </Button>
                  </div>
                )}

                {/* Action buttons (when no form is open) */}
                {addingCustom !== dayName && addingCardioFinisher !== dayName && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => setAddingCustom(dayName)}
                    >
                      <Dumbbell className="size-3 mr-1" />
                      Add Extra Lift
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => setAddingCardioFinisher(dayName)}
                    >
                      <Activity className="size-3 mr-1" />
                      Log Cardio / Conditioning
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Standalone Cardio Sessions for today */}
        {profileId && isToday && cardioFinishers.length > 0 && (
          <div className="space-y-2 mt-3">
            {cardioFinishers.map(log => (
              <Card key={log.id} className="border-orange-200 dark:border-orange-900/40 bg-gradient-to-r from-orange-50/50 to-background dark:from-orange-950/20 dark:to-background">
                <CardContent className="px-4 py-3 flex items-center gap-3">
                  <div className="size-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                    <Activity className="size-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{log.activity_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.duration_minutes} mins @ RPE {log.intensity_rpe}
                      {log.avg_heart_rate ? ` \u2022 ${log.avg_heart_rate} BPM` : ''}
                    </p>
                  </div>
                  <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-0 text-xs">
                    <Flame className="size-3 mr-0.5" />
                    {log.intensity_rpe}/10
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </React.Fragment>
      )})}

      <Dialog open={!!swapDialog} onOpenChange={(open) => { if (!open) setSwapDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-4" />
              Smart Exercise Swap
            </DialogTitle>
            <DialogDescription>
              Biomechanically similar replacements for <span className="font-semibold text-foreground">{swapDialog?.exerciseName}</span>
            </DialogDescription>
          </DialogHeader>

          {currentEntry && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              <Badge variant="outline" className="text-xs">{currentEntry.movement_pattern.replace(/_/g, ' ')}</Badge>
              <Badge variant="outline" className="text-xs">{currentEntry.mechanics_tier.replace(/_/g, ' ')}</Badge>
              <Badge variant={currentEntry.joint_stress === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                <ShieldAlert className="size-3 mr-1" />
                {currentEntry.joint_stress} joint stress
              </Badge>
            </div>
          )}

          <Separator />

          {replacements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No alternative exercises found in the database for this movement pattern.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {replacements.map(({ exercise, note }) => (
                <button
                  key={exercise.name}
                  className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors"
                  onClick={() => {
                    if (swapDialog) {
                      onSwapExercise(swapDialog.dayIndex, swapDialog.exIndex, exercise)
                      setSwapDialog(null)
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{exercise.name}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-xs">{exercise.mechanics_tier.replace(/_/g, ' ')}</Badge>
                        {exercise.joint_stress === 'low' && currentEntry?.joint_stress !== 'low' && (
                          <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            lower stress
                          </Badge>
                        )}
                      </div>
                      {note && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Zap className="size-3 mt-0.5 shrink-0 text-primary" />
                          <span>{note}</span>
                        </p>
                      )}
                    </div>
                    <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {restTimer && (
        <RestTimer
          durationSeconds={restTimer.seconds}
          exerciseName={restTimer.exerciseName}
          onDismiss={() => setRestTimer(null)}
          onComplete={() => setRestTimer(null)}
        />
      )}

      {progressionToast && (
        <div className="fixed top-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
          <Card className="border-orange-300/50 bg-orange-50/95 dark:bg-orange-950/90 dark:border-orange-700/30 backdrop-blur-sm shadow-lg">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500 shrink-0" />
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">{progressionToast}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <PlateCalculator
        open={plateCalcOpen}
        onOpenChange={setPlateCalcOpen}
        initialWeight={plateCalcWeight}
      />
    </div>
  )
}
