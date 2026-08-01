import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Bug, Clock, CalendarClock, Database, ChevronDown, ToggleLeft, ToggleRight, Zap, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { MesocycleWeek, WorkoutDay } from '@/lib/types'

interface DevTestPanelProps {
  profileId?: string
  mesocycle: MesocycleWeek[]
  exercisePlan: WorkoutDay[]
  overrideWeek: number | null
  overrideDay: string | null
  devBypassLocks: boolean
  onOverrideWeekChange: (week: number | null) => void
  onOverrideDayChange: (day: string | null) => void
  onBypassLocksChange: (bypass: boolean) => void
  onLogsSeeded: () => void
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const MESOCYCLE_LABELS: Record<number, string> = {
  1: 'Adaptation',
  2: 'Accumulation',
  3: 'Intensification',
  4: 'Deload',
}

function generateRealisticWeight(exerciseName: string): number {
  const name = exerciseName.toLowerCase()
  if (name.includes('deadlift') || name.includes('squat') || name.includes('trap bar')) return 80 + Math.floor(Math.random() * 40)
  if (name.includes('bench') || name.includes('row')) return 50 + Math.floor(Math.random() * 25)
  if (name.includes('press') && !name.includes('leg')) return 30 + Math.floor(Math.random() * 20)
  if (name.includes('curl') || name.includes('lateral') || name.includes('fly') || name.includes('flye')) return 8 + Math.floor(Math.random() * 10)
  if (name.includes('carry') || name.includes('lunge') || name.includes('split')) return 20 + Math.floor(Math.random() * 20)
  if (name.includes('plank') || name.includes('dead bug') || name.includes('side plank')) return 0
  if (name.includes('pull-up') || name.includes('push-up') || name.includes('dip')) return 0
  return 15 + Math.floor(Math.random() * 20)
}

function parseRepsToNumber(reps: string): number {
  const match = reps.match(/(\d+)/)
  return match ? parseInt(match[1]) : 10
}

export function DevTestPanel({
  profileId,
  mesocycle,
  exercisePlan,
  overrideWeek,
  overrideDay,
  devBypassLocks,
  onOverrideWeekChange,
  onOverrideDayChange,
  onBypassLocksChange,
  onLogsSeeded,
}: DevTestPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [seedingWeeks, setSeedingWeeks] = useState(false)
  const [seedUpToWeek, setSeedUpToWeek] = useState(2)
  const [seedResult, setSeedResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSeedMockLogs = useCallback(async () => {
    if (!profileId) {
      setSeedResult({ success: false, message: 'No profile ID available' })
      return
    }
    setSeedingWeeks(true)
    setSeedResult(null)

    try {
      const weeksToSeed = mesocycle.length > 0
        ? mesocycle.filter(w => w.week_number <= seedUpToWeek)
        : []

      const planToSeed = weeksToSeed.length > 0 ? weeksToSeed : null
      let totalLogs = 0

      if (planToSeed) {
        for (const week of planToSeed) {
          for (const day of week.days) {
            if (!day.exercises || day.exercises.length === 0) continue
            const baseDate = new Date()
            baseDate.setDate(baseDate.getDate() - ((4 - week.week_number) * 7) - DAYS_OF_WEEK.indexOf(day.day))

            for (const exercise of day.exercises) {
              const weight = generateRealisticWeight(exercise.name)
              const reps = parseRepsToNumber(exercise.reps)

              for (let setNum = 1; setNum <= exercise.sets; setNum++) {
                const actualReps = reps + Math.floor(Math.random() * 2) - 1
                const { error } = await supabase.from('set_logs').insert({
                  user_id: profileId,
                  exercise_name: exercise.name,
                  week_number: week.week_number,
                  day: day.day,
                  set_number: setNum,
                  weight_kg: weight + (week.week_number - 1) * 2.5,
                  reps_completed: Math.max(1, actualReps),
                  rpe: 6 + Math.random() * 2.5,
                  completed_at: baseDate.toISOString(),
                })
                if (!error) totalLogs++
              }
            }
          }
        }
      } else {
        for (const day of exercisePlan) {
          if (!day.exercises || day.exercises.length === 0) continue
          for (let wk = 1; wk <= seedUpToWeek; wk++) {
            const baseDate = new Date()
            baseDate.setDate(baseDate.getDate() - ((seedUpToWeek - wk) * 7) - DAYS_OF_WEEK.indexOf(day.day))

            for (const exercise of day.exercises) {
              const weight = generateRealisticWeight(exercise.name)
              const reps = parseRepsToNumber(exercise.reps)

              for (let setNum = 1; setNum <= exercise.sets; setNum++) {
                const actualReps = reps + Math.floor(Math.random() * 2) - 1
                const { error } = await supabase.from('set_logs').insert({
                  user_id: profileId,
                  exercise_name: exercise.name,
                  week_number: wk,
                  day: day.day,
                  set_number: setNum,
                  weight_kg: weight + (wk - 1) * 2.5,
                  reps_completed: Math.max(1, actualReps),
                  rpe: 6 + Math.random() * 2.5,
                  completed_at: baseDate.toISOString(),
                })
                if (!error) totalLogs++
              }
            }
          }
        }
      }

      setSeedResult({ success: true, message: `Seeded ${totalLogs} set logs across weeks 1-${seedUpToWeek}` })
      onLogsSeeded()
    } catch (err) {
      setSeedResult({ success: false, message: `Error: ${err instanceof Error ? err.message : 'Unknown'}` })
    } finally {
      setSeedingWeeks(false)
    }
  }, [profileId, mesocycle, exercisePlan, seedUpToWeek, onLogsSeeded])

  const handleClearMockLogs = useCallback(async () => {
    if (!profileId) return
    setSeedingWeeks(true)
    const { error } = await supabase.from('set_logs').delete().eq('user_id', profileId)
    if (error) {
      setSeedResult({ success: false, message: `Delete failed: ${error.message}` })
    } else {
      setSeedResult({ success: true, message: 'All set_logs cleared for this profile' })
      onLogsSeeded()
    }
    setSeedingWeeks(false)
  }, [profileId, onLogsSeeded])

  const activeWeekLabel = overrideWeek ? MESOCYCLE_LABELS[overrideWeek] || `Week ${overrideWeek}` : 'Live'

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-amber-300/60 dark:border-amber-700/40 bg-gradient-to-r from-amber-50/40 to-background dark:from-amber-950/10">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="size-4 text-amber-600 dark:text-amber-400" />
                <CardTitle className="text-sm font-semibold">Dev Workout Sandbox</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {overrideWeek && (
                  <Badge variant="outline" className="text-xs border-amber-400/60 text-amber-700 dark:text-amber-300">
                    W{overrideWeek}
                  </Badge>
                )}
                {overrideDay && (
                  <Badge variant="outline" className="text-xs border-purple-400/60 text-purple-700 dark:text-purple-300">
                    {overrideDay.slice(0, 3)}
                  </Badge>
                )}
                {devBypassLocks && (
                  <Badge variant="outline" className="text-xs border-red-400/60 text-red-700 dark:text-red-300">
                    Unlocked
                  </Badge>
                )}
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            {/* Section 1: Time Travel */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-blue-500" />
                <span className="text-sm font-semibold">Time Travel</span>
                <Badge variant="secondary" className="text-xs ml-auto">{activeWeekLabel}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Override Week (1-4)</Label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(w => (
                      <Button
                        key={w}
                        size="sm"
                        variant={overrideWeek === w ? 'default' : 'outline'}
                        className="flex-1 h-8 text-xs"
                        onClick={() => onOverrideWeekChange(overrideWeek === w ? null : w)}
                      >
                        W{w}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Override Day</Label>
                  <div className="flex flex-wrap gap-1">
                    {DAYS_OF_WEEK.map(d => (
                      <Button
                        key={d}
                        size="sm"
                        variant={overrideDay === d ? 'default' : 'outline'}
                        className="h-7 text-[10px] px-1.5"
                        onClick={() => onOverrideDayChange(overrideDay === d ? null : d)}
                      >
                        {d.slice(0, 2)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {(overrideWeek || overrideDay) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7"
                  onClick={() => { onOverrideWeekChange(null); onOverrideDayChange(null) }}
                >
                  <Clock className="size-3 mr-1" />
                  Reset to Live
                </Button>
              )}
            </div>

            <Separator />

            {/* Section 2: Lock Bypass */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {devBypassLocks ? (
                    <ToggleRight className="size-4 text-red-500" />
                  ) : (
                    <ToggleLeft className="size-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold">Bypass Schedule Locks</span>
                </div>
                <Button
                  size="sm"
                  variant={devBypassLocks ? 'destructive' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => onBypassLocksChange(!devBypassLocks)}
                >
                  {devBypassLocks ? 'Active' : 'Disabled'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                When enabled, all days become loggable regardless of calendar date. You can log sets for any day in the program.
              </p>
            </div>

            <Separator />

            {/* Section 3: Mock Log Seeder */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-green-500" />
                <span className="text-sm font-semibold">Mock Log Seeder</span>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Seed weeks 1 to</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={seedUpToWeek}
                  onChange={e => setSeedUpToWeek(Math.min(4, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-16 h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleSeedMockLogs}
                  disabled={seedingWeeks || !profileId}
                >
                  <Zap className="size-3 mr-1" />
                  {seedingWeeks ? 'Seeding...' : 'Seed Logs'}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={handleClearMockLogs}
                  disabled={seedingWeeks || !profileId}
                >
                  <AlertTriangle className="size-3 mr-1" />
                  Clear All Logs
                </Button>
              </div>

              {seedResult && (
                <div className={`text-xs px-3 py-2 rounded-md ${seedResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                  {seedResult.message}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Inserts realistic historical set data (progressive weights, varied reps) into the database so you can test progression prompts, overload detection, and history displays for later mesocycle phases.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
