import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Flame,
  Play,
  Scale,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Leaf,
} from 'lucide-react'
import { useDailyTracker } from '@/hooks/useDailyTracker'
import type { WeeklyDashboardDay } from '@/lib/daily-tracking'
import type { UserProfile, TrainingDay, WorkoutDay, MacroTargets } from '@/lib/types'
import { calculateDailyMacros, type DailyMacroResult } from '@/lib/macro-calculator'

interface WeeklyPlannerCardProps {
  profileId: string
  profile?: UserProfile | null
  trainingDays?: TrainingDay[]
  exercisePlan?: WorkoutDay[]
  macros?: MacroTargets | null
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getCarbDayType(carbsG: number, proteinG: number, fatsG: number): 'low' | 'medium' | 'high' {
  const totalMacroG = carbsG + proteinG + fatsG
  if (totalMacroG === 0) return 'medium'
  const carbRatio = carbsG / totalMacroG
  if (carbRatio >= 0.45) return 'high'
  if (carbRatio <= 0.25) return 'low'
  return 'medium'
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]
}

function getFullDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return FULL_DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]
}

function formatSplitType(split: string): string {
  return split.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface EnrichedDay extends WeeklyDashboardDay {
  isScheduledTraining: boolean
  scheduledPlan: WorkoutDay | null
  computedMacros: DailyMacroResult | null
}

export function WeeklyPlannerCard({ profileId, profile, trainingDays, exercisePlan, macros }: WeeklyPlannerCardProps) {
  const {
    days,
    selectedDate,
    setSelectedDate,
    selectedDay,
    loading,
    completeSession,
    goToPreviousWeek,
    goToNextWeek,
  } = useDailyTracker(profileId)

  const [startingSession, setStartingSession] = useState(false)

  const enrichedDays: EnrichedDay[] = useMemo(() => {
    return days.map((day) => {
      const dayName = getFullDayName(day.date)
      const isScheduledTraining = trainingDays?.some(
        td => td.day === dayName && td.available
      ) ?? false
      const scheduledPlan = exercisePlan?.find(wp => wp.day === dayName) ?? null
      const computedMacros = profile
        ? calculateDailyMacros(profile, dayName, exercisePlan ?? [])
        : null
      return { ...day, isScheduledTraining, scheduledPlan, computedMacros }
    })
  }, [days, trainingDays, exercisePlan, profile])

  const enrichedSelectedDay = enrichedDays.find(d => d.date === selectedDate) ?? null

  const handleStartSession = async () => {
    if (!enrichedSelectedDay?.session?.id) return
    setStartingSession(true)
    try {
      await completeSession(enrichedSelectedDay.session.id)
    } finally {
      setStartingSession(false)
    }
  }

  if (loading && days.length === 0) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarDays className="size-4 text-emerald-500" />
            Weekly Planner
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={goToPreviousWeek}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={goToNextWeek}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-1">
          {enrichedDays.map((day) => (
            <DayPill
              key={day.date}
              day={day}
              isSelected={day.date === selectedDate}
              isToday={day.date === new Date().toISOString().split('T')[0]}
              onClick={() => setSelectedDate(day.date)}
            />
          ))}
        </div>

        <Separator />

        {enrichedSelectedDay ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NutritionPanel day={enrichedSelectedDay} />
            <TrainingPanel day={enrichedSelectedDay} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No data for this week yet.
          </p>
        )}

        {enrichedSelectedDay && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {(enrichedSelectedDay.workoutLogs && enrichedSelectedDay.workoutLogs.length > 0) || (enrichedSelectedDay.cardioLogs && enrichedSelectedDay.cardioLogs.length > 0) ? (
                  <>
                    <Dumbbell className="size-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Training Session Completed</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {(enrichedSelectedDay.workoutLogs?.length || 0) + (enrichedSelectedDay.cardioLogs?.length || 0)} activities
                    </Badge>
                  </>
                ) : enrichedSelectedDay.metric ? (
                  <>
                    <Scale className="size-3.5 text-sky-400" />
                    <span>{enrichedSelectedDay.metric.weight_kg} kg logged</span>
                  </>
                ) : (
                  <>
                    <Scale className="size-3.5 text-sky-400" />
                    <span className="italic">No weight logged</span>
                  </>
                )}
              </div>
              {(enrichedSelectedDay.session && !enrichedSelectedDay.session.is_completed) ? (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleStartSession}
                  disabled={startingSession}
                >
                  {startingSession ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Complete Session
                </Button>
              ) : (
                !enrichedSelectedDay.session && enrichedSelectedDay.isScheduledTraining && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
                    Scheduled Training Day
                  </Badge>
                )
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DayPill({
  day,
  isSelected,
  isToday,
  onClick,
}: {
  day: EnrichedDay
  isSelected: boolean
  isToday: boolean
  onClick: () => void
}) {
  const hasDbSession = !!day.session
  const isCompleted = day.session?.is_completed ?? false
  const isScheduled = day.isScheduledTraining
  const label = getDayLabel(day.date)
  const dateNum = new Date(day.date + 'T00:00:00').getDate()

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center gap-0.5 rounded-lg py-2 px-1 text-xs transition-all cursor-pointer
        ${isSelected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : isToday
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-muted'
        }
      `}
    >
      <span className="font-medium">{label}</span>
      <span className={`text-[10px] ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
        {dateNum}
      </span>
      <div className="h-3 flex items-center justify-center">
        {isCompleted ? (
          <CheckCircle2 className="size-3 text-emerald-400" />
        ) : hasDbSession || isScheduled ? (
          <div className="size-1.5 rounded-full bg-amber-400" />
        ) : null}
      </div>
    </button>
  )
}

function NutritionPanel({ day }: { day: EnrichedDay }) {
  const nutrition = day.nutrition
  const computed = day.computedMacros

  const carbColors = {
    low: { bar: 'bg-sky-500', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    medium: { bar: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    high: { bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  }

  if (nutrition) {
    const carbType = getCarbDayType(nutrition.target_carbs_g, nutrition.target_protein_g, nutrition.target_fats_g)
    const colors = carbColors[carbType]
    const maxMacro = Math.max(nutrition.target_protein_g, nutrition.target_carbs_g, nutrition.target_fats_g, 1)

    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-orange-400" />
            <span className="text-sm font-medium">{nutrition.target_calories} kcal</span>
          </div>
          <Badge variant="outline" className={`text-[10px] ${colors.badge}`}>
            {carbType.toUpperCase()} CARB
          </Badge>
        </div>
        <div className="space-y-2.5">
          <MacroBar label="Protein" value={nutrition.target_protein_g} max={maxMacro} unit="g" colorClass="bg-sky-500" />
          <MacroBar label="Carbs" value={nutrition.target_carbs_g} max={maxMacro} unit="g" colorClass={colors.bar} />
          <MacroBar label="Fats" value={nutrition.target_fats_g} max={maxMacro} unit="g" colorClass="bg-rose-400" />
        </div>
        {nutrition.calculated_tdee && (
          <p className="text-[10px] text-muted-foreground mt-1">
            TDEE: {nutrition.calculated_tdee} kcal &middot; BMR: {nutrition.calculated_bmr}
          </p>
        )}
      </div>
    )
  }

  if (computed) {
    const carbType = getCarbDayType(computed.carbs, computed.protein, computed.fat)
    const colors = carbColors[carbType]
    const maxMacro = Math.max(computed.protein, computed.carbs, computed.fat, 1)
    const methodLabel = computed.method === 'DYNAMIC_CSCS'
      ? (computed.dayType === 'training' ? 'Dynamic CSCS (Training)' : 'Dynamic CSCS (Rest)')
      : 'Standard Static'

    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-orange-400" />
            <span className="text-sm font-medium">{computed.calories} kcal</span>
          </div>
          <Badge variant="outline" className={`text-[10px] ${colors.badge}`}>
            {carbType.toUpperCase()} CARB
          </Badge>
        </div>
        <div className="space-y-2.5">
          <MacroBar label="Protein" value={computed.protein} max={maxMacro} unit="g" colorClass="bg-sky-500" />
          <MacroBar label="Carbs" value={computed.carbs} max={maxMacro} unit="g" colorClass={colors.bar} />
          <MacroBar label="Fats" value={computed.fat} max={maxMacro} unit="g" colorClass="bg-rose-400" />
        </div>
        <p className="text-[10px] text-muted-foreground/70 italic">{methodLabel}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-4 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <Flame className="size-5 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">No nutrition targets set</p>
    </div>
  )
}

function MacroBar({
  label,
  value,
  max,
  unit,
  colorClass,
}: {
  label: string
  value: number
  max: number
  unit: string
  colorClass: string
}) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}{unit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TrainingPanel({ day }: { day: EnrichedDay }) {
  const session = day.session
  const scheduledPlan = day.scheduledPlan

  if (session && session.split_type.toLowerCase() !== 'rest') {
    const exercises = day.exercises.slice(0, 5)
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="size-4 text-amber-400" />
            <span className="text-sm font-medium">{formatSplitType(session.split_type)}</span>
          </div>
          <span className="text-xs text-muted-foreground">{session.duration_minutes} min</span>
        </div>

        {session.is_completed && (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
            <CheckCircle2 className="size-2.5 mr-1" />
            Completed
          </Badge>
        )}

        <div className="space-y-1.5">
          {exercises.map((ex, i) => (
            <div key={ex.id || i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate max-w-[60%]">
                {ex.is_superset && <span className="text-amber-400 mr-1">SS</span>}
                {ex.exercise_name}
              </span>
              <span className="text-foreground/70 font-mono text-[10px]">
                {ex.sets} &times; {ex.reps_scheme}
              </span>
            </div>
          ))}
          {day.exercises.length > 5 && (
            <p className="text-[10px] text-muted-foreground">+{day.exercises.length - 5} more</p>
          )}
        </div>
      </div>
    )
  }

  if (!session && scheduledPlan) {
    const exercises = scheduledPlan.exercises.slice(0, 5)
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="size-4 text-amber-400" />
            <span className="text-sm font-medium">{scheduledPlan.focus}</span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
            Planned
          </Badge>
        </div>

        <div className="space-y-1.5">
          {exercises.map((ex, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate max-w-[60%]">
                {ex.name}
              </span>
              <span className="text-foreground/70 font-mono text-[10px]">
                {ex.sets} &times; {ex.reps}
              </span>
            </div>
          ))}
          {scheduledPlan.exercises.length > 5 && (
            <p className="text-[10px] text-muted-foreground">+{scheduledPlan.exercises.length - 5} more</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-4 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <Leaf className="size-5 text-emerald-400/60" />
      <p className="text-sm font-medium text-muted-foreground">Active Recovery</p>
      <p className="text-xs text-muted-foreground/70">Rest & mobility work</p>
    </div>
  )
}
