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
import { getExerciseEntry, getExerciseId } from '@/lib/exercise-db'
import { isExternallyLoaded } from '@/lib/load-prescription'
import { getReplacementCandidates, type SwapScope } from '@/lib/mesocycle-edit'
import { insertCardioLog, getCardioLogsForDate } from '@/lib/daily-tracking'
import { checkDoubleProgression, getDoubleProgressionRecommendation } from '@/lib/progression-engine'
import { saveSessionCache, loadSessionCache } from '@/lib/offline-sync'
import { saveSet, getSetsForDate, getLastSessionSets, initSetLogStore, prescriptionUnit } from '@/lib/set-log-store'
import { getActiveMesocycleWeek } from '@/lib/calculations'
import { getAppNow, getSessionDateContext } from '@/lib/dev-clock'
import { checkForPR, seedPRCacheFromHistory, getTopPRSet, type PRResult, type SessionSet } from '@/lib/pr-engine'
import { RestTimer } from '@/components/RestTimer'
import { PlateCalculator } from '@/components/PlateCalculator'
import { OfflineStatusIndicator } from '@/components/OfflineStatusIndicator'
import type { ExerciseEntry } from '@/lib/exercise-db'
import type { WorkoutDay, ExerciseSetLog, CardioLog, MesocycleWeek, UserProfile, SessionDuration } from '@/lib/types'
import { estimateDaySeconds, getDurationBudgetSeconds } from '@/lib/session-duration'

interface ExercisePlanProps {
  plan: WorkoutDay[]
  mesocycle?: MesocycleWeek[]
  exclusions: string[]
  profile?: UserProfile
  profileId?: string
  planCreatedAt?: string
  logsVersion?: number
  devOverrideWeek?: number | null
  devOverrideDay?: string | null
  devBypassLocks?: boolean
  onSwapExercise: (weekNumber: number, dayName: string, exIndex: number, newExercise: ExerciseEntry, scope: SwapScope) => void | Promise<void>
  onBanExercise: (exerciseName: string) => void | Promise<void>
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// exercise_set_logs.weight_kg is numeric(6,2) — anything past this is a typo
// (a fat-fingered "10005" instead of "100.5"), not a real lift, and used to
// slip past the UI, sync, and permanently poison the flush queue.
const MAX_WEIGHT_KG = 9999.99
const MAX_REPS = 999

// Prefers the exercise's own `prescription_type` (see exercise-db.ts) —
// authoritative and set at generation time — over sniffing the reps STRING,
// which is what used to misreport a distance-based carry logged in meters
// as "Time" just because the string happened to contain a stray 'm'/'s'.
// The string heuristic remains only as a fallback for data generated before
// prescription_type existed.
function isTimeBased(reps: string, prescriptionType?: string): boolean {
  if (prescriptionType) return prescriptionType !== 'reps'
  return reps.includes('s') || reps.includes('min') || reps.includes('m')
}

function getRepsLabel(reps: string, prescriptionType?: string): string {
  switch (prescriptionType) {
    case 'time': return 'Hold'
    case 'distance_load': return 'Distance'
    case 'intervals': return 'Work'
    case 'reps': return 'Reps'
  }
  if (reps.includes('min')) return 'Duration'
  if (reps.endsWith('s')) return 'Time'
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

/**
 * Honest per-day duration estimate — the whole point is to say plainly when
 * a session is deliberately shorter than the user's stated budget (deload,
 * or an exercise selection that just didn't need the full window) rather
 * than let a short session read as a mistake.
 */
function SessionDurationNote({
  day,
  isDeload,
  durationPref,
}: {
  day: WorkoutDay
  isDeload: boolean
  durationPref: SessionDuration
}) {
  if (day.exercises.length === 0) return null
  const estSeconds = estimateDaySeconds(day)
  const budgetSeconds = getDurationBudgetSeconds(durationPref)
  const estMin = Math.round(estSeconds / 60)
  const underBySeconds = budgetSeconds - estSeconds
  const isLight = !isDeload && underBySeconds > 15 * 60

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Clock className="size-3 shrink-0" />
      <span>~{estMin} min estimated</span>
      {isDeload && <span className="italic">— deload week, deliberately lighter</span>}
      {isLight && (
        <span className="italic">
          — runs under your ~{Math.round(budgetSeconds / 60)} min budget today; that's the exercise selection, not a mistake
        </span>
      )}
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
  exerciseId,
  totalSets,
  profileId,
  sessionDate,
  dayName,
  todayLogs,
  onLogSaved,
  prescribedReps,
  prescriptionType,
  restTime,
  weekNumber,
  tier,
  suggestedLoadKg,
  perSetLoadKg,
  onSetCompleted,
  onOpenPlateCalc,
}: {
  exerciseName: string
  /** Stable logging identity (C0) — plan-attached id, or the slug of a custom exercise's name. */
  exerciseId: string
  totalSets: number
  profileId: string
  /** The session's date (YYYY-MM-DD) — owned by the parent so the whole day shares one clock. */
  sessionDate: string
  /** Weekday name for progression keying. */
  dayName: string
  todayLogs: ExerciseSetLog[]
  onLogSaved: (log: ExerciseSetLog) => void
  prescribedReps?: string
  /** Drives the logging column's label — a distance carry logs meters, a hold logs seconds, an interval logs work seconds, never a generic "Reps". See PrescriptionType in exercise-db.ts. */
  prescriptionType?: string
  restTime?: string
  weekNumber?: number
  tier?: string
  suggestedLoadKg?: number | null
  /** Per-set breakdown (ramping or straight) — indexed by set number - 1. Falls back to suggestedLoadKg for any set beyond this array (e.g. an extra set the user added). */
  perSetLoadKg?: (number | null)[]
  onSetCompleted?: (exerciseName: string, setNumber: number, weight: number, reps: number, rest: string, sets: number, prescribedReps: string, tier?: string) => void
  onOpenPlateCalc?: (weight: number) => void
}) {
  const logColumnLabel = prescriptionType
    ? getRepsLabel(prescribedReps ?? '', prescriptionType)
    : 'Reps'
  const today = sessionDate
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

  const [prBadgeSet, setPrBadgeSet] = useState<{ setNumber: number; result: PRResult } | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [animatingPr, setAnimatingPr] = useState(false)
  const [ghostValues, setGhostValues] = useState<GhostValues[]>([])

  // Load ghost values from last session (unified store — merges unsynced local sets)
  useEffect(() => {
    getLastSessionSets(profileId, exerciseId, today).then(lastSets => {
      const ghosts: GhostValues[] = Array.from({ length: Math.max(totalSets + extraSets, lastSets.length) }, (_, i) => {
        const prev = lastSets.find(s => s.set_number === i + 1)
        return {
          weight: prev ? String(prev.weight_kg) : '',
          reps: prev ? String(prev.reps_completed) : '',
        }
      })
      setGhostValues(ghosts)
    }).catch(() => {})
  }, [profileId, exerciseId])

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

  const handleSaveSet = (setIndex: number) => {
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

    // Reject out-of-range input at entry — never let a typo (10000+ kg,
    // negative weight, absurd reps) reach the sync queue, where it would
    // permanently fail against the DB's numeric(6,2)/integer columns.
    if (!input.isBodyweight && (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT_KG)) {
      setRowErrors(prev => ({ ...prev, [setIndex]: `Weight must be between 0 and ${MAX_WEIGHT_KG}kg` }))
      return
    }
    if (!Number.isInteger(reps) || reps < 0 || reps > MAX_REPS) {
      setRowErrors(prev => ({ ...prev, [setIndex]: `Reps must be a whole number from 0 to ${MAX_REPS}` }))
      return
    }
    if (rowErrors[setIndex]) {
      setRowErrors(prev => { const next = { ...prev }; delete next[setIndex]; return next })
    }

    // Auto-fill inputs with ghost values if they were blank
    const updatedInputs = inputs.map((item, i) =>
      i === setIndex ? { ...item, weight: input.isBodyweight ? '' : String(weight), reps: String(reps) } : item
    )
    setInputs(updatedInputs)

    // Local-first: the set is persisted (and the check turns green) the moment
    // this returns — even in airplane mode. The store syncs in the background
    // and re-saving the same set upserts rather than duplicating (L2/L4).
    const log = saveSet({
      userId: profileId,
      date: today,
      weekNumber: weekNumber ?? null,
      day: dayName,
      exerciseId,
      exerciseName,
      setNumber,
      weightKg: weight,
      repsCompleted: reps,
      unit: prescriptionUnit(prescriptionType),
      isBodyweight: input.isBodyweight,
    })
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
  }

  const updateInput = (index: number, field: 'weight' | 'reps', value: string) => {
    setInputs(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
    if (rowErrors[index]) setRowErrors(prev => { const next = { ...prev }; delete next[index]; return next })
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
        <span>{logColumnLabel}</span>
        <span className="w-8"></span>
      </div>
      {Array.from({ length: displaySets }, (_, i) => {
        const isSaved = savedSets.has(i + 1)
        const isBW = inputs[i]?.isBodyweight || false
        const isPRSet = prBadgeSet?.setNumber === i + 1
        const ghost = ghostValues[i]

        return (
          <React.Fragment key={i}>
          <div
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
              max={MAX_WEIGHT_KG}
              step="0.5"
              placeholder={isBW ? 'BW' : (ghost?.weight || defaultWeightFor(i))}
              value={isBW ? '' : (inputs[i]?.weight || '')}
              onChange={e => updateInput(i, 'weight', e.target.value)}
              className={`h-7 text-sm ${isSaved ? 'border-green-300 dark:border-green-700' : ''} ${isBW ? 'bg-muted text-muted-foreground' : ''} ${rowErrors[i] ? 'border-destructive' : ''}`}
              disabled={isBW}
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
              aria-label="Toggle bodyweight"
            >
              BW
            </Button>
            <Input
              type="number"
              min="0"
              max={MAX_REPS}
              step="1"
              placeholder={ghost?.reps || '0'}
              value={inputs[i]?.reps || ''}
              onChange={e => updateInput(i, 'reps', e.target.value)}
              className={`h-7 text-sm w-14 ${isSaved ? 'border-green-300 dark:border-green-700' : ''} ${rowErrors[i] ? 'border-destructive' : ''}`}
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
              >
                <Check className="size-3.5" />
              </Button>
            </div>
          </div>
          {rowErrors[i] && (
            <p className="text-[10px] text-destructive px-1 -mt-0.5">{rowErrors[i]}</p>
          )}
          </React.Fragment>
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

export function ExercisePlan({ plan, mesocycle, exclusions, profile, profileId, planCreatedAt, logsVersion, devOverrideWeek, devOverrideDay, devBypassLocks, onSwapExercise, onBanExercise }: ExercisePlanProps) {
  // generateMesocycle produces 4 weeks PER BLOCK, not 4 weeks total — a
  // hypertrophy sequence alone is 4 blocks (16 weeks). Falling back to 4 only
  // applies before the mesocycle has loaded.
  const totalWeeks = mesocycle && mesocycle.length > 0 ? mesocycle.length : 4
  // getAppNow: the DevTestPage clock override drives the whole live path —
  // week detection, "today" highlighting, AND the date logs are written under
  // (C0 Part 6: this was half-wired before; time travel only affected the
  // dev page itself, never the real plan view).
  const [currentWeek, setCurrentWeek] = useState(() => devOverrideWeek ?? getActiveMesocycleWeek(planCreatedAt, getAppNow(profileId), totalWeeks))
  useEffect(() => {
    if (devOverrideWeek != null) setCurrentWeek(devOverrideWeek)
    else setCurrentWeek(getActiveMesocycleWeek(planCreatedAt, getAppNow(profileId), totalWeeks))
  }, [devOverrideWeek, planCreatedAt, totalWeeks, profileId])
  const [swapDialog, setSwapDialog] = useState<{ dayName: string; exIndex: number; exerciseName: string } | null>(null)
  const [pendingSwap, setPendingSwap] = useState<ExerciseEntry | null>(null)
  const [swapBusy, setSwapBusy] = useState(false)
  const [banBusy, setBanBusy] = useState<string | null>(null)
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
  const [progressionNotes, setProgressionNotes] = useState<Record<string, { note: string; didProgress: boolean }>>({})

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

  // Computed ONCE per active session (mount, or when the dev-clock override
  // actually changes) rather than re-derived from a fresh clock read on
  // every render — the latter is what let an evening session silently
  // straddle a day boundary (UTC before this fix; local midnight in the rare
  // case someone keeps the tab open past it) mid-workout. See
  // getSessionDateContext's doc comment.
  const [sessionDateContext, setSessionDateContext] = useState(() => getSessionDateContext(profileId))
  useEffect(() => {
    setSessionDateContext(getSessionDateContext(profileId))
  }, [profileId, devOverrideWeek, devOverrideDay])
  const today = sessionDateContext.date
  const todayName = devOverrideDay ?? sessionDateContext.day

  useEffect(() => {
    if (profileId) {
      getSetsForDate(profileId, today).then(setTodayLogs).catch(console.error)
      getCardioLogsForDate(profileId, today).then(setCardioFinishers).catch(console.error)
      seedPRCacheFromHistory(profileId).catch(console.error)
    }
  }, [profileId, today])

  useEffect(() => {
    initSetLogStore()
    const cached = loadSessionCache()
    if (cached && cached.weekNumber === currentWeek) {
      setCompletedSetsMap(cached.completedSets)
      setSetWeights(cached.setWeights)
      setSetReps(cached.setReps)
      setSessionLogged(cached.sessionLogged)
    }
  }, [])

  // Week 2+: true double progression from what the trainee actually lifted
  // last session, not the mesocycle's flat estimate. Hit the top of the rep
  // range on every set last time -> weight goes up one increment; anything
  // short of that -> hold the weight, the note says to chase reps first.
  // Week 1 never has prior data, so this is a no-op there and the static
  // suggested_load_kg from generateMesocycle stands.
  useEffect(() => {
    if (!profileId || currentWeek <= 1) {
      setProgressedLoads({})
      setProgressionNotes({})
      return
    }
    const todayWorkout = activePlan.find(d => d.day === todayName)
    if (!todayWorkout) {
      setProgressedLoads({})
      setProgressionNotes({})
      return
    }

    let cancelled = false
    Promise.all(
      todayWorkout.exercises
        .filter(ex => ex.suggested_load_kg != null)
        .map(async ex => {
          const recommendation = await getDoubleProgressionRecommendation(
            profileId, ex.name, today, parseRepsHigh(ex.reps)
          )
          return [ex.name, recommendation] as const
        })
    ).then(results => {
      if (cancelled) return
      const nextLoads: Record<string, number> = {}
      const nextNotes: Record<string, { note: string; didProgress: boolean }> = {}
      for (const [name, recommendation] of results) {
        if (!recommendation) continue
        nextLoads[name] = recommendation.weightKg
        nextNotes[name] = { note: recommendation.note, didProgress: recommendation.didProgress }
      }
      setProgressedLoads(nextLoads)
      setProgressionNotes(nextNotes)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [profileId, currentWeek, todayName, activePlan, today])

  useEffect(() => {
    if (profileId && logsVersion && logsVersion > 0) {
      getSetsForDate(profileId, today).then(logs => {
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

  const replacements = swapDialog && profile
    ? getReplacementCandidates(swapDialog.exerciseName, profile, exclusions)
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

  function parseRepsHigh(reps: string): number {
    const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) return parseInt(rangeMatch[2])
    const single = parseInt(reps)
    return isNaN(single) ? 12 : single
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

    // Optimistic: update UI immediately (todayLogs itself was already updated
    // by SetLogger's onLogSaved with the store's persisted view)
    const newCompleted = { ...completedSetsMap, [key]: true }
    setCompletedSetsMap(newCompleted)

    const restSeconds = parseRestSeconds(restStr)
    if (restSeconds > 0) {
      setRestTimer({ seconds: restSeconds, exerciseName })
    }

    // Persist UI state to localStorage immediately (the set itself was already
    // persisted local-first by SetLogger via set-log-store — no second write here)
    saveSessionCache({
      completedSets: newCompleted,
      setWeights,
      setReps,
      sessionLogged,
      day: todayName,
      weekNumber: currentWeek,
    })

    // Check progression in the background (merged store reads — works offline too)
    {
      checkDoubleProgression(
        profileId, exerciseName, today, prescribedSets, prescribedReps, tier as any
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

  // Bulk-logs today's session with the same values a manual save would use:
  // last-session ghosts first, then the progressed/prescribed load, prescribed
  // reps at the low end of the range, rpe null. An externally-loaded exercise
  // with NO known weight is skipped and named in the toast — never logged as a
  // fabricated 0 kg set (discovery landmine L6). Bodyweight movements log 0 kg
  // with is_bodyweight, which is real data, not fabrication.
  const handleLogEntireSession = useCallback(async () => {
    if (!profileId) return
    const todayWorkout = activePlan.find(d => d.day === todayName)
    if (!todayWorkout) return

    setLoggingSession(true)
    try {
      const newWeights: Record<string, number> = { ...setWeights }
      const newReps: Record<string, number> = { ...setReps }
      const newCompleted: Record<string, boolean> = { ...completedSetsMap }
      const savedLogs: ExerciseSetLog[] = []
      const skipped: string[] = []
      let loggedCount = 0

      for (const ex of todayWorkout.exercises) {
        const exerciseId = ex.id ?? getExerciseId(ex.name)
        const entry = getExerciseEntry(ex.name)
        const isBodyweightMovement = entry ? !isExternallyLoaded(entry) : false
        const alreadyLogged = new Set(
          todayLogs.filter(l => l.exercise_name === ex.name).map(l => l.set_number)
        )

        let lastSets: ExerciseSetLog[] = []
        try {
          lastSets = await getLastSessionSets(profileId, exerciseId, today)
        } catch { /* offline — fall back to prescription */ }

        const repsLow = parseRepsLow(ex.reps)
        for (let s = 1; s <= ex.sets; s++) {
          if (alreadyLogged.has(s)) continue

          const ghostWeight = lastSets.find(ls => ls.set_number === s)?.weight_kg
          const weight = isBodyweightMovement
            ? 0
            : ghostWeight
              ?? progressedLoads[ex.name]
              ?? ex.per_set_load?.[s - 1]?.load_kg
              ?? ex.suggested_load_kg
              ?? null

          if (weight == null) {
            if (!skipped.includes(ex.name)) skipped.push(ex.name)
            continue
          }

          const log = saveSet({
            userId: profileId,
            date: today,
            weekNumber: currentWeek,
            day: todayName,
            exerciseId,
            exerciseName: ex.name,
            setNumber: s,
            weightKg: weight,
            repsCompleted: repsLow,
            rpe: null,
            unit: prescriptionUnit(ex.prescription_type),
            isBodyweight: isBodyweightMovement,
          })
          savedLogs.push(log)
          loggedCount++
          newWeights[`${ex.name}-${s}`] = weight
          newReps[`${ex.name}-${s}`] = repsLow
          newCompleted[`${ex.name}-${s}`] = true
        }
      }

      setSetWeights(newWeights)
      setSetReps(newReps)
      setCompletedSetsMap(newCompleted)
      setSessionLogged(true)

      setTodayLogs(prev => {
        const existing = new Set(prev.map(l => `${l.exercise_name}-${l.set_number}`))
        const toAdd = savedLogs.filter(l => !existing.has(`${l.exercise_name}-${l.set_number}`))
        return [...prev, ...toAdd]
      })

      saveSessionCache({
        completedSets: newCompleted,
        setWeights: newWeights,
        setReps: newReps,
        sessionLogged: true,
        day: todayName,
        weekNumber: currentWeek,
      })

      if (skipped.length > 0) {
        setProgressionToast(
          `Logged ${loggedCount} sets. Skipped ${skipped.join(', ')} — no known weight yet; log those manually so progression has real numbers.`
        )
        setTimeout(() => setProgressionToast(null), 8000)
      }
    } finally {
      setLoggingSession(false)
    }
  }, [profileId, activePlan, todayName, today, currentWeek, setWeights, setReps, completedSetsMap, todayLogs, progressedLoads])

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
              <SessionDurationNote
                day={workout}
                isDeload={!!currentMesoWeekObj?.is_deload}
                durationPref={profile?.session_duration_preference || '45-60'}
              />
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
                                {ex.per_set_load[0].display.includes('single side') && (
                                  <span className="text-[10px] text-muted-foreground/70">single side</span>
                                )}
                              </div>
                            ) : ex.suggested_load && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Dumbbell className="size-2.5" />{ex.suggested_load}
                              </span>
                            )}
                            {progressionNotes[ex.name] && (
                              <span className={`text-[10px] italic ${progressionNotes[ex.name].didProgress ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground/80'}`}>
                                {progressionNotes[ex.name].note}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{ex.sets}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          {isTimeBased(ex.reps, ex.prescription_type) && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                              {getRepsLabel(ex.reps, ex.prescription_type)}
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
                            onClick={() => { setPendingSwap(null); setSwapDialog({ dayName, exIndex, exerciseName: ex.name }) }}
                            aria-label="Swap exercise"
                          >
                            <ArrowRightLeft className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            disabled={banBusy === ex.name}
                            onClick={async () => {
                              setBanBusy(ex.name)
                              try {
                                await onBanExercise(ex.name)
                              } finally {
                                setBanBusy(null)
                              }
                            }}
                            aria-label="Ban exercise"
                          >
                            {banBusy === ex.name ? (
                              <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Ban className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {profileId && isToday && isExpanded && (
                      <tr>
                        <td colSpan={6} className="p-0 border-b border-border/50">
                          <SetLogger
                            exerciseName={ex.name}
                            exerciseId={ex.id ?? getExerciseId(ex.name)}
                            totalSets={ex.sets}
                            profileId={profileId}
                            sessionDate={today}
                            dayName={todayName}
                            todayLogs={todayLogs}
                            onLogSaved={handleLogSaved}
                            prescribedReps={ex.reps}
                            prescriptionType={ex.prescription_type}
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
                              exerciseId={getExerciseId(customName)}
                              totalSets={3}
                              profileId={profileId}
                              sessionDate={today}
                              dayName={todayName}
                              todayLogs={todayLogs}
                              onLogSaved={handleLogSaved}
                              onSetCompleted={handleSetComplete}
                              prescribedReps="8-12"
                              restTime="60s"
                              weekNumber={currentWeek}
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

      <Dialog open={!!swapDialog} onOpenChange={(open) => { if (!open && !swapBusy) { setSwapDialog(null); setPendingSwap(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-4" />
              {pendingSwap ? 'Apply this swap' : 'Smart Exercise Swap'}
            </DialogTitle>
            <DialogDescription>
              {pendingSwap ? (
                <>Swap <span className="font-semibold text-foreground">{swapDialog?.exerciseName}</span> for <span className="font-semibold text-foreground">{pendingSwap.name}</span></>
              ) : (
                <>Constraint-checked replacements for <span className="font-semibold text-foreground">{swapDialog?.exerciseName}</span></>
              )}
            </DialogDescription>
          </DialogHeader>

          {!pendingSwap && currentEntry && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              <Badge variant="outline" className="text-xs">{currentEntry.movement_pattern.replace(/_/g, ' ')}</Badge>
              <Badge variant="outline" className="text-xs">{currentEntry.mechanics_tier.replace(/_/g, ' ')}</Badge>
              <Badge variant={currentEntry.joint_stress === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                <ShieldAlert className="size-3 mr-1" />
                {currentEntry.joint_stress} joint stress
              </Badge>
            </div>
          )}

          {!pendingSwap && <Separator />}

          {!pendingSwap && (
            replacements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No alternative exercises fit your equipment, injuries, style, and skill level for this movement pattern.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {replacements.map(({ exercise, note }) => (
                  <button
                    key={exercise.name}
                    className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors"
                    onClick={() => setPendingSwap(exercise)}
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
            )
          )}

          {pendingSwap && (
            <div className="space-y-2 py-1">
              <button
                className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
                disabled={swapBusy}
                onClick={async () => {
                  if (!swapDialog) return
                  setSwapBusy(true)
                  try {
                    await onSwapExercise(currentWeek, swapDialog.dayName, swapDialog.exIndex, pendingSwap, 'today')
                  } finally {
                    setSwapBusy(false)
                    setSwapDialog(null)
                    setPendingSwap(null)
                  }
                }}
              >
                <p className="font-medium text-sm">Just for today</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Only this session changes. Next time this day comes around it reverts, and your original lift's progression keeps going from its last logged session.
                </p>
              </button>
              <button
                className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
                disabled={swapBusy}
                onClick={async () => {
                  if (!swapDialog) return
                  setSwapBusy(true)
                  try {
                    await onSwapExercise(currentWeek, swapDialog.dayName, swapDialog.exIndex, pendingSwap, 'permanent')
                  } finally {
                    setSwapBusy(false)
                    setSwapDialog(null)
                    setPendingSwap(null)
                  }
                }}
              >
                <p className="font-medium text-sm">Replace in my plan</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Swaps it for the rest of this training block.
                  {currentEntry?.mechanics_tier === 'tier1_compound'
                    ? ' Main lift — this resets to a conservative starting weight so you can find it fresh, rather than inheriting a number that belonged to a different movement.'
                    : ' Loads recompute for the new movement right away.'}
                </p>
              </button>
              <Button variant="ghost" size="sm" disabled={swapBusy} onClick={() => setPendingSwap(null)}>
                {swapBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Applying...
                  </span>
                ) : 'Back'}
              </Button>
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
