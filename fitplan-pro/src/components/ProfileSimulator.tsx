import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Activity, Zap, ChevronDown, Clock, Flame, Dumbbell, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { MOCK_TEST_PROFILES, type TestArchetype } from '@/lib/mock-test-profiles'
import { generateExercisePlan } from '@/lib/exercise-plan'
import type { UserProfile, WorkoutDay, FitnessGoal, SessionDuration, WorkoutSplit } from '@/lib/types'

export function ProfileSimulator() {
  const [selectedArchetype, setSelectedArchetype] = useState<TestArchetype>(MOCK_TEST_PROFILES[0])
  const [overrides, setOverrides] = useState<Partial<UserProfile>>({})
  const [plan, setPlan] = useState<WorkoutDay[] | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)

  const simulatedProfile = useMemo<UserProfile>(() => ({
    ...selectedArchetype.profile,
    ...overrides,
  }), [selectedArchetype, overrides])

  function handleSelectArchetype(id: string) {
    const arch = MOCK_TEST_PROFILES.find(p => p.id === id)
    if (arch) {
      setSelectedArchetype(arch)
      setOverrides({})
      setPlan(null)
    }
  }

  function handleSimulate() {
    const result = generateExercisePlan(simulatedProfile)
    setPlan(result.plan)
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Dev Sandbox: Profile Simulator</h2>
        <p className="text-sm text-muted-foreground">
          Test CSCS exercise and cardio generation across distinct user archetypes.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Archetype</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MOCK_TEST_PROFILES.map(arch => (
              <Button
                key={arch.id}
                variant={selectedArchetype.id === arch.id ? 'default' : 'outline'}
                className="h-auto py-3 flex flex-col items-start text-left gap-0.5"
                onClick={() => handleSelectArchetype(arch.id)}
              >
                <span className="font-semibold text-sm">{arch.label}</span>
                <span className="text-[11px] opacity-70 font-normal line-clamp-1">{arch.description}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Variable Tweaker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Session Duration</Label>
              <Select
                value={simulatedProfile.session_duration_preference}
                onValueChange={(v) => setOverrides(o => ({ ...o, session_duration_preference: v as SessionDuration }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30-45">30-45 min</SelectItem>
                  <SelectItem value="45-60">45-60 min</SelectItem>
                  <SelectItem value="60-90">60-90 min</SelectItem>
                  <SelectItem value="90+">90+ min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fitness Goal</Label>
              <Select
                value={simulatedProfile.fitness_goal}
                onValueChange={(v) => setOverrides(o => ({ ...o, fitness_goal: v as FitnessGoal }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fat_loss">Fat Loss</SelectItem>
                  <SelectItem value="hypertrophy">Build Muscle</SelectItem>
                  <SelectItem value="conditioning">Endurance</SelectItem>
                  <SelectItem value="functional">Maintain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Workout Split</Label>
              <Select
                value={simulatedProfile.workout_split_preference}
                onValueChange={(v) => setOverrides(o => ({ ...o, workout_split_preference: v as WorkoutSplit }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ppl">Push/Pull/Legs</SelectItem>
                  <SelectItem value="upper_lower">Upper/Lower</SelectItem>
                  <SelectItem value="full_body">Full Body</SelectItem>
                  <SelectItem value="bro_split">Bro Split</SelectItem>
                  <SelectItem value="ai_recommendation">AI Recommendation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Age</Label>
              <Input
                type="number"
                value={simulatedProfile.age}
                onChange={(e) => setOverrides(o => ({ ...o, age: Number(e.target.value) }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={handleSimulate}>
        <Zap className="size-4 mr-2" />
        Simulate Plan Generation
      </Button>

      {plan && <PlanInspectionPanel plan={plan} profile={simulatedProfile} />}
    </div>
  )
}

function PlanInspectionPanel({ plan, profile }: { plan: WorkoutDay[]; profile: UserProfile }) {
  const [jsonOpen, setJsonOpen] = useState(false)

  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const sortedPlan = [...plan].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))

  const stats = useMemo(() => {
    const totalExercises = plan.reduce((sum, d) => sum + d.exercises.length, 0)
    const cardioBlocks = plan.filter(d => d.recommendedCardio).length
    const restDayCardio = plan.filter(d => d.recommendedCardio?.timing === 'rest_day').length
    const independentSessions = plan.filter(d => d.recommendedCardio?.timing === 'independent_session').length
    return { totalExercises, cardioBlocks, restDayCardio, independentSessions }
  }, [plan])

  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Plan Output</h3>
        <div className="flex gap-2">
          <Badge variant="secondary">
            <Dumbbell className="size-3 mr-1" />{stats.totalExercises} exercises
          </Badge>
          <Badge variant="secondary">
            <Activity className="size-3 mr-1" />{stats.cardioBlocks} cardio blocks
          </Badge>
        </div>
      </div>

      {profile.session_duration_preference === '30-45' && stats.cardioBlocks > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-900/40">
          <CheckCircle2 className="size-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
              Time-limited profile: Cardio rescheduled successfully
            </p>
            <p className="text-xs text-orange-600/80 dark:text-orange-400/70 mt-0.5">
              {stats.restDayCardio} session(s) on rest days, {stats.independentSessions} as independent blocks.
              Cardio was NOT deleted -- it was intelligently placed outside the 45-min lifting window.
            </p>
          </div>
        </div>
      )}

      {profile.session_duration_preference === '30-45' && stats.cardioBlocks === 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">
            No cardio blocks generated for time-limited profile -- check conditioning logic.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {sortedPlan.map(day => (
          <DayInspectionCard key={day.day} day={day} />
        ))}
        {DAY_ORDER.filter(d => !plan.find(p => p.day === d)).map(d => (
          <Card key={d} className="border-dashed bg-muted/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{d}</span>
                <Badge variant="outline" className="text-[10px]">Full Rest</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Collapsible open={jsonOpen} onOpenChange={setJsonOpen}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Raw JSON Output</h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              <ChevronDown className={`size-4 transition-transform ${jsonOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <pre className="mt-2 p-4 rounded-md bg-muted text-xs overflow-auto max-h-96 font-mono">
            {JSON.stringify(plan, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function DayInspectionCard({ day }: { day: WorkoutDay }) {
  const isRecoveryOnly = day.exercises.length === 0

  const estimatedTime = useMemo(() => {
    let mins = 0
    for (const ex of day.exercises) {
      const restMatch = ex.rest?.match(/(\d+)/)
      const restSec = restMatch ? parseInt(restMatch[1]) : 60
      mins += ex.sets * (0.75 + restSec / 60)
    }
    return Math.round(mins)
  }, [day.exercises])

  return (
    <Card className={isRecoveryOnly ? 'border-orange-200/60 dark:border-orange-900/30' : ''}>
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{day.day}</span>
            <Badge variant="secondary" className="text-[10px]">{day.focus}</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {day.exercises.length > 0 && (
              <>
                <span className="flex items-center gap-1">
                  <Dumbbell className="size-3" />{day.exercises.length}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />~{estimatedTime} min
                </span>
              </>
            )}
          </div>
        </div>

        {day.exercises.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {day.exercises.map((ex, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-normal">{ex.name}</Badge>
            ))}
          </div>
        )}

        {day.recommendedCardio && (
          <div className="flex items-start gap-2 p-2 rounded border border-orange-200/60 dark:border-orange-900/30 bg-orange-50/30 dark:bg-orange-950/10">
            <Activity className="size-3.5 text-orange-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">{day.recommendedCardio.activity}</span>
                <Badge
                  className={`text-[9px] px-1.5 py-0 h-4 border-0 ${
                    day.recommendedCardio.timing === 'rest_day'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : day.recommendedCardio.timing === 'independent_session'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                      : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                  }`}
                >
                  {day.recommendedCardio.timing === 'rest_day' ? 'Rest Day' :
                   day.recommendedCardio.timing === 'independent_session' ? 'Separate Session' : 'Post-Lift'}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                <span className="flex items-center gap-0.5"><Clock className="size-2.5" />{day.recommendedCardio.duration}m</span>
                <span className="flex items-center gap-0.5"><Flame className="size-2.5" />RPE {day.recommendedCardio.targetRpe}</span>
              </p>
              <p className="text-[10px] text-muted-foreground/70 italic mt-0.5">{day.recommendedCardio.reason}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
