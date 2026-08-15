// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §2.4 / §7.3: this component is no longer the session
// surface — TodayPanel (P2) owns that entirely. What remains here is the
// PROGRAM BROWSE STAND-IN: a read-only, week-paginated view of the whole
// mesocycle, reachable at #/exercise/program. Swap/ban stay functional
// (they're plan edits, not session acts); every logging affordance —
// SetLogger, the bulk-log button, off-plan detection, cardio entry, the
// session cache — is gone, because it can never be reached here again
// (isToday no longer exists as a concept in this component; TodayPanel is
// the only surface that ever logs a set). Deleting them here, now, rather
// than leaving them unreachable-but-present, is what keeps
// getLastSessionSets down to the hook's single fetcher (F1) instead of
// three call sites across two components.
//
// This file is retired entirely in P4, replaced by ProgramWeekList/Detail.
// ---------------------------------------------------------------------------

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ArrowRightLeft, Ban, History, Zap, ShieldAlert, Heart, Activity, Clock, Flame, ChevronLeft, ChevronRight, ChevronDown, Calendar, Sparkles, Thermometer } from 'lucide-react'
import React, { useState, useCallback } from 'react'
import { getExerciseEntry, getExerciseId, searchExerciseCatalog } from '@/lib/exercise-db'
import { getExerciseCompatibilityWarnings } from '@/lib/exercise-plan'
import { getReplacementCandidates, type SwapScope } from '@/lib/mesocycle-edit'
import { useActiveSession } from '@/hooks/useActiveSession'
import { formatRampSets, normalizeWarmup } from '@/lib/session-derive'
import { RampStrip } from '@/components/exercise/RampStrip'
import { LoadChip } from '@/components/exercise/LoadChip'
import { InsightBanner } from '@/components/ui/insight-banner'
import type { ExerciseEntry } from '@/lib/exercise-db'
import type { WorkoutDay, MesocycleWeek, UserProfile, SessionDuration } from '@/lib/types'
import { estimateDaySeconds, getDurationBudgetSeconds } from '@/lib/session-duration'

interface ExercisePlanProps {
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
  onOpenHistory?: (exerciseId: string, exerciseName: string) => void
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function isTimeBased(reps: string, prescriptionType?: string): boolean {
  if (prescriptionType) return prescriptionType !== 'reps'
  return reps.includes('s') || reps.includes('min') || reps.includes('m')
}

// Browse surfaces show plan-derived loads and honest provenance only
// (§2.2): 'estimate' or 'known_weight', never 'logged' (that requires the
// live progression engine, which only runs for today's session in
// TodayPanel). LoadChip's type is the full 3-state union; this component
// simply never passes 'logged'.
type LoadSource = 'estimate' | 'known_weight'

function getRepsLabel(reps: string, prescriptionType?: string): string {
  switch (prescriptionType) {
    case 'time': return 'Hold'
    case 'distance_load': return 'Distance'
    case 'intervals': return 'Work'
    case 'steady_state': return 'Duration'
    case 'reps': return 'Reps'
  }
  if (reps.includes('min')) return 'Duration'
  if (reps.endsWith('s')) return 'Time'
  if (reps.endsWith('m')) return 'Distance'
  return 'Reps'
}

/** Week-level periodization context (phase, focus, coach note) — browse-only now; the session view compresses this into the context line (§1.2). */
function PhaseBanner({ mesoWeek }: { mesoWeek?: MesocycleWeek }) {
  if (!mesoWeek || (!mesoWeek.phase_label && !mesoWeek.phase_focus && !mesoWeek.coach_note)) return null
  return (
    <InsightBanner tone="ai">
      <Sparkles className="size-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {mesoWeek.phase_label && (
            <span className="text-xs font-semibold">{mesoWeek.phase_label}</span>
          )}
          {mesoWeek.is_deload && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0 h-4">
              Deload
            </Badge>
          )}
        </div>
        {mesoWeek.phase_focus && (
          <p className="text-[11px] opacity-90">{mesoWeek.phase_focus}</p>
        )}
        {mesoWeek.coach_note && (
          <p className="text-[11px] opacity-75 italic">{mesoWeek.coach_note}</p>
        )}
      </div>
    </InsightBanner>
  )
}

/** Prominent week-1 note for trainees who skipped onboarding's known-lifts question — browse-only now; the session view carries the equivalent instruction as an inline cue on the first loaded exercise. */
function CalibrationBanner({ mesoWeek }: { mesoWeek?: MesocycleWeek }) {
  if (!mesoWeek?.isCalibrationWeek) return null
  return (
    <InsightBanner tone="warning">
      <Thermometer className="size-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <span className="text-xs font-semibold">Week 1 — Calibration Week</span>
        <p className="text-[11px] opacity-85">
          Find the weight where your last rep feels like RPE 6. Log your session so week 2 scales from your actual performance.
        </p>
        <p className="text-[11px] opacity-85">
          The printed weights are conservative on purpose. If a set feels easy, keep adding weight until the last rep feels like RPE 6 — then log the weight you actually used. What you log becomes your plan.
        </p>
      </div>
    </InsightBanner>
  )
}

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
    <Card className="bg-[color:var(--surface-deep)]">
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
    <Card className="border-[color:var(--role-warn-border)] bg-gradient-to-br from-[color:var(--role-warn-bg)] to-background">
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{workout.day}</CardTitle>
          <Badge variant="warning" className="border-0">
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
            <div className="size-10 rounded-full bg-[color:var(--role-warn-bg)] flex items-center justify-center shrink-0 mt-0.5">
              <Activity className="size-5 text-[color:var(--role-warn)]" />
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
  // Defensive against legacy/partial warmup shapes — see normalizeWarmup's
  // doc comment (cleanup round, defect 1). The program-browse view iterates
  // every week of a mesocycle, including weeks generated by an older
  // buildWarmup shape, so this call site sees legacy data more often than
  // TodayPanel's single-day view does.
  const normalized = normalizeWarmup(warmup)
  if (!normalized) return null
  const { general, mobility, totalMinutes, coachNote } = normalized

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
        {general.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">General</p>
            {general.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {mobility.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Mobility</p>
            {mobility.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.prescription}</span>
              </div>
            ))}
          </div>
        )}
        {coachNote && (
          <p className="text-[11px] text-muted-foreground/80 italic">{coachNote}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ExercisePlan({ plan, mesocycle, exclusions, profile, profileId, onSwapExercise, onBanExercise, onOpenHistory }: ExercisePlanProps) {
  // generateMesocycle produces 4 weeks PER BLOCK, not 4 weeks total — a
  // hypertrophy sequence alone is 4 blocks (16 weeks). Falling back to 4 only
  // applies before the mesocycle has loaded.
  const totalWeeks = mesocycle && mesocycle.length > 0 ? mesocycle.length : 4

  // The only session-identity value this browse-only surface needs: where to
  // start paging from. No logs, no rest facade, no write path — this
  // component never renders a set grid again (§7.3).
  const { liveWeek } = useActiveSession()
  const [browseWeek, setBrowseWeek] = useState(liveWeek)

  const [swapDialog, setSwapDialog] = useState<{ dayName: string; exIndex: number; exerciseName: string } | null>(null)
  const [pendingSwap, setPendingSwap] = useState<ExerciseEntry | null>(null)
  const [swapBusy, setSwapBusy] = useState(false)
  const [showAllReplacements, setShowAllReplacements] = useState(false)
  const [swapSearchQuery, setSwapSearchQuery] = useState('')
  const [banBusy, setBanBusy] = useState<string | null>(null)
  const [expandedWarmups, setExpandedWarmups] = useState<Set<string>>(new Set())
  const [explainedLoadChips, setExplainedLoadChips] = useState<Set<string>>(new Set())
  const toggleLoadExplainer = useCallback((key: string) => {
    setExplainedLoadChips(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const hasMesocycle = mesocycle && mesocycle.length > 0
  const activePlan = hasMesocycle
    ? mesocycle.find(w => w.week_number === browseWeek)?.days || plan
    : plan
  const currentMesoWeekObj = hasMesocycle
    ? mesocycle.find(w => w.week_number === browseWeek)
    : undefined
  const weekLabel = currentMesoWeekObj?.label || ''

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
    if (firstWeekOfBlock != null) setBrowseWeek(firstWeekOfBlock)
  }

  const toggleWarmup = (key: string) => {
    setExpandedWarmups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const replacements = swapDialog && profile
    ? getReplacementCandidates(swapDialog.exerciseName, profile, exclusions)
    : []
  const INITIAL_REPLACEMENTS_SHOWN = 4
  const visibleReplacements = showAllReplacements ? replacements : replacements.slice(0, INITIAL_REPLACEMENTS_SHOWN)

  const currentEntry = swapDialog ? getExerciseEntry(swapDialog.exerciseName) : undefined

  const swapSearchResults = swapDialog && swapSearchQuery.trim()
    ? searchExerciseCatalog(swapSearchQuery, 20).filter(e =>
        e.name.toLowerCase() !== swapDialog.exerciseName.toLowerCase() &&
        !replacements.some(r => r.exercise.name === e.name)
      )
    : []

  return (
    <div className="space-y-4">
      {hasMesocycle && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={browseWeek <= 1}
                onClick={() => setBrowseWeek(w => Math.max(1, w - 1))}
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
                      onClick={() => setBrowseWeek(w)}
                      className={`h-2 w-6 rounded-full transition-colors ${
                        w === browseWeek
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
                disabled={browseWeek >= totalWeeks}
                onClick={() => setBrowseWeek(w => Math.min(totalWeeks, w + 1))}
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

        return (
        <React.Fragment key={dayName}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{workout.day}</CardTitle>
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
          </CardHeader>
          {workout.recommendedCardio && (
            <div className="px-4 pb-2 flex items-start gap-2 border-b border-border/30">
              <Activity className="size-3.5 text-[color:var(--role-warn)] mt-0.5 shrink-0" />
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
              <Activity className="size-3.5 text-[color:var(--role-warn)] mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Conditioning:</span> {workout.conditioning_note}
              </p>
            </div>
          )}
          {workout.pattern_gap_note && (
            <div className="px-4 pb-2">
              <InsightBanner tone="warning" className="text-xs">
                {workout.pattern_gap_note}
              </InsightBanner>
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
                  // Browse surfaces never see 'logged' provenance — that
                  // requires the live progression engine, which only runs
                  // for today's session (§2.2).
                  const loadSource: LoadSource | undefined = ex.suggested_load_kg == null
                    ? undefined
                    : (ex.load_source ?? 'estimate')
                  const loadExplained = explainedLoadChips.has(exerciseKey)
                  const ramp = formatRampSets(ex)

                  return (
                  <React.Fragment key={exIndex}>
                    <TableRow className={hasSuperset ? 'bg-muted/30' : undefined}>
                      <TableCell className="w-10 pr-0">
                        {hasSuperset && (
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0.5 bg-background font-semibold">
                            {ex.superset_label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{ex.name}</span>
                        {ramp && <RampStrip ramp={ramp} />}
                        <LoadChip
                          ex={ex}
                          source={loadSource}
                          explained={loadExplained}
                          onToggleExplain={() => toggleLoadExplainer(exerciseKey)}
                        />
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
                          {onOpenHistory && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => onOpenHistory(ex.id ?? getExerciseId(ex.name), ex.name)}
                              aria-label="Exercise history"
                            >
                              <History className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => { setPendingSwap(null); setShowAllReplacements(false); setSwapSearchQuery(''); setSwapDialog({ dayName, exIndex, exerciseName: ex.name }) }}
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
                  </React.Fragment>
                )})}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
                No alternative exercises fit your equipment, injuries, style, and skill level for this movement pattern. Search below to pick anything from the full catalog instead.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {visibleReplacements.map(({ exercise, note }) => (
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
                            <Badge variant="success" className="text-xs">
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
                {!showAllReplacements && replacements.length > INITIAL_REPLACEMENTS_SHOWN && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAllReplacements(true)}>
                    Show {replacements.length - INITIAL_REPLACEMENTS_SHOWN} more
                  </Button>
                )}
              </div>
            )
          )}

          {!pendingSwap && (
            <div className="space-y-2 pt-1">
              <Separator />
              <p className="text-xs font-medium text-muted-foreground pt-1">Or search any exercise</p>
              <Input
                placeholder="e.g. Decline Bench Press"
                value={swapSearchQuery}
                onChange={e => setSwapSearchQuery(e.target.value)}
                className="h-8 text-sm"
              />
              {swapSearchQuery.trim() && (
                swapSearchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">No matching exercise found.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {swapSearchResults.map(exercise => {
                      const warnings = profile ? getExerciseCompatibilityWarnings(exercise, profile, exclusions) : []
                      return (
                        <button
                          key={exercise.name}
                          className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors"
                          onClick={() => setPendingSwap(exercise)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <p className="font-medium text-sm">{exercise.name}</p>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="secondary" className="text-xs">{exercise.movement_pattern.replace(/_/g, ' ')}</Badge>
                                <Badge variant="secondary" className="text-xs">{exercise.mechanics_tier.replace(/_/g, ' ')}</Badge>
                              </div>
                              {warnings.map((w, i) => (
                                <p key={i} className="text-xs text-[color:var(--role-warn-text)] mt-1 flex items-start gap-1">
                                  <ShieldAlert className="size-3 mt-0.5 shrink-0" />
                                  <span>{w}</span>
                                </p>
                              ))}
                            </div>
                            <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground mt-1" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          )}

          {pendingSwap && (
            <div className="space-y-2 py-1">
              {profile && getExerciseCompatibilityWarnings(pendingSwap, profile, exclusions).map((w, i) => (
                <p key={i} className="text-xs text-[color:var(--role-warn-text)] flex items-start gap-1.5 rounded-md border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] p-2">
                  <ShieldAlert className="size-3.5 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
              <button
                className="w-full text-left rounded-md border p-3 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
                disabled={swapBusy}
                onClick={async () => {
                  if (!swapDialog) return
                  setSwapBusy(true)
                  try {
                    await onSwapExercise(browseWeek, swapDialog.dayName, swapDialog.exIndex, pendingSwap, 'today')
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
                    await onSwapExercise(browseWeek, swapDialog.dayName, swapDialog.exIndex, pendingSwap, 'permanent')
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
    </div>
  )
}
