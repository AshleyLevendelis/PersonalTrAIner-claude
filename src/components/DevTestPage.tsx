import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Bug, Clock, Database, Shield, Zap, CheckCircle2, XCircle, AlertTriangle,
  Calendar, ToggleLeft, ToggleRight, Play, Trash2, ArrowLeft, Loader2,
} from 'lucide-react'
import { getDevClockOverride, setDevClockOverride, getDevBypassLocks, setDevBypassLocks } from '@/lib/dev-clock'
import { seedSyntheticData, clearSyntheticData, type SeedProgress, type SeedResult } from '@/lib/dev-seeder'
import { runFullConstraintAudit, type AuditReport, type AuditTestCase } from '@/lib/dev-constraint-audit'
import type { UserProfile, WorkoutDay, MealPlanDay } from '@/lib/types'

interface DevTestPageProps {
  profile: UserProfile | null
  exercisePlan: WorkoutDay[]
  mealPlan: MealPlanDay[]
  onBack: () => void
}

export function DevTestPage({ profile, exercisePlan, mealPlan, onBack }: DevTestPageProps) {
  const userId = profile?.id || ''

  // Virtual Clock state
  const [clockDate, setClockDate] = useState(() => {
    const override = userId ? getDevClockOverride(userId) : null
    return override?.date || ''
  })
  const [clockActive, setClockActive] = useState(() => {
    return userId ? !!getDevClockOverride(userId) : false
  })

  // Bypass Locks state
  const [bypassActive, setBypassActive] = useState(() => {
    return userId ? getDevBypassLocks(userId) : false
  })

  // Seeder state
  const [seedWeeks, setSeedWeeks] = useState(4)
  const [seedProgress, setSeedProgress] = useState<SeedProgress | null>(null)
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Audit state
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)
  const [auditRunning, setAuditRunning] = useState(false)
  const [auditProgress, setAuditProgress] = useState({ done: 0, total: 0 })
  const [showFailuresOnly, setShowFailuresOnly] = useState(true)

  // --- Virtual Clock ---
  const handleClockSet = useCallback(() => {
    if (!userId || !clockDate) return
    setDevClockOverride(userId, clockDate)
    setClockActive(true)
  }, [userId, clockDate])

  const handleClockClear = useCallback(() => {
    if (!userId) return
    setDevClockOverride(userId, null)
    setClockActive(false)
    setClockDate('')
  }, [userId])

  // Quick jump buttons for mesocycle weeks
  const handleJumpToWeek = useCallback((weekNum: number) => {
    if (!userId || !profile?.created_at) return
    const created = new Date(profile.created_at)
    const targetDate = new Date(created.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000)
    const dateStr = targetDate.toISOString().split('T')[0]
    setClockDate(dateStr)
    setDevClockOverride(userId, dateStr)
    setClockActive(true)
  }, [userId, profile?.created_at])

  // --- Bypass Locks ---
  const handleBypassToggle = useCallback(() => {
    if (!userId) return
    const newVal = !bypassActive
    setDevBypassLocks(userId, newVal)
    setBypassActive(newVal)
  }, [userId, bypassActive])

  // --- Seeder ---
  const handleSeed = useCallback(async () => {
    if (!profile) return
    setIsSeeding(true)
    setSeedResult(null)
    setSeedProgress(null)

    const result = await seedSyntheticData(
      profile,
      exercisePlan,
      mealPlan,
      seedWeeks,
      (p) => setSeedProgress(p)
    )
    setSeedResult(result)
    setIsSeeding(false)
    setSeedProgress(null)
  }, [profile, exercisePlan, mealPlan, seedWeeks])

  const handleClear = useCallback(async () => {
    if (!userId) return
    setIsClearing(true)
    const result = await clearSyntheticData(userId)
    setSeedResult({ ...result, workoutLogs: 0, mealLogs: 0 })
    setIsClearing(false)
  }, [userId])

  // --- Audit ---
  const handleRunAudit = useCallback(() => {
    setAuditRunning(true)
    setAuditReport(null)
    setAuditProgress({ done: 0, total: 0 })

    // Run in a timeout to allow UI to update
    setTimeout(() => {
      const report = runFullConstraintAudit((done, total) => {
        setAuditProgress({ done, total })
      })
      setAuditReport(report)
      setAuditRunning(false)
    }, 50)
  }, [])

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button onClick={onBack} variant="ghost" size="sm">
                <ArrowLeft className="size-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Bug className="size-5 text-amber-500" />
                <h1 className="text-lg font-bold">Developer Testing Panel</h1>
              </div>
            </div>
            <Badge variant="outline" className="border-amber-400/60 text-amber-700 dark:text-amber-300">
              DEV ONLY
            </Badge>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <Card>
            <CardContent className="py-8 text-center">
              <Shield className="size-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">Profile Required</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Virtual clock, lock bypass, and data seeder need a profile loaded. Complete onboarding first, then return here.
              </p>
              <p className="text-sm text-muted-foreground">
                The Constraint Audit below works without a profile.
              </p>
            </CardContent>
          </Card>

          {/* Constraint Audit available even without profile */}
          <Card className="border-purple-300/60 dark:border-purple-700/40">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="size-5 text-purple-500" />
                <CardTitle className="text-base">Constraint Audit</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Tests every combination of Equipment x Injury x Duration x Training Style against the exercise engine.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleRunAudit}
                  disabled={auditRunning}
                  size="sm"
                >
                  {auditRunning ? (
                    <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Running...</>
                  ) : (
                    <><Play className="size-3.5 mr-1.5" />Run Full Audit</>
                  )}
                </Button>
                {auditReport && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-green-400/60 text-green-700 dark:text-green-300">
                      {auditReport.passed} passed
                    </Badge>
                    {auditReport.failed > 0 && (
                      <Badge variant="outline" className="border-red-400/60 text-red-700 dark:text-red-300">
                        {auditReport.failed} failed
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(auditReport.runTimeMs)}ms)
                    </span>
                  </div>
                )}
              </div>
              {auditRunning && auditProgress.total > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Testing combinations...</span>
                    <span>{auditProgress.done}/{auditProgress.total}</span>
                  </div>
                  <Progress value={(auditProgress.done / auditProgress.total) * 100} className="h-2" />
                </div>
              )}
              {auditReport && (
                <AuditResults
                  report={auditReport}
                  showFailuresOnly={showFailuresOnly}
                  onToggleFilter={() => setShowFailuresOnly(v => !v)}
                />
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={onBack} variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Bug className="size-5 text-amber-500" />
              <h1 className="text-lg font-bold">Developer Testing Panel</h1>
            </div>
          </div>
          <Badge variant="outline" className="border-amber-400/60 text-amber-700 dark:text-amber-300">
            DEV ONLY
          </Badge>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Section 1: Virtual Clock */}
        <Card className="border-blue-300/60 dark:border-blue-700/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="size-5 text-blue-500" />
              <CardTitle className="text-base">Virtual Clock</CardTitle>
              {clockActive && (
                <Badge className="ml-auto bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                  Override Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Override the current date for all schedule-lock and mesocycle-week logic. Jump to any point in the program timeline.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Simulated Date</Label>
                <Input
                  type="date"
                  value={clockDate}
                  onChange={e => setClockDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button onClick={handleClockSet} disabled={!clockDate} size="sm" className="h-9">
                <Clock className="size-3.5 mr-1.5" />
                Set
              </Button>
              <Button onClick={handleClockClear} variant="outline" size="sm" className="h-9" disabled={!clockActive}>
                Clear
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Quick Jump: Mesocycle Week</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(wk => (
                  <Button
                    key={wk}
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs"
                    onClick={() => handleJumpToWeek(wk)}
                  >
                    Week {wk}
                  </Button>
                ))}
              </div>
            </div>

            {clockActive && (
              <div className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-md px-3 py-2">
                App time is overridden to: <strong>{clockDate}</strong>
                {profile.created_at && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400">
                    (Program day {Math.max(0, Math.floor((new Date(clockDate).getTime() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)))})
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Schedule Lock Bypass */}
        <Card className="border-red-300/60 dark:border-red-700/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {bypassActive ? (
                  <ToggleRight className="size-5 text-red-500" />
                ) : (
                  <ToggleLeft className="size-5 text-muted-foreground" />
                )}
                <CardTitle className="text-base">Schedule Lock Bypass</CardTitle>
              </div>
              <Button
                size="sm"
                variant={bypassActive ? 'destructive' : 'outline'}
                onClick={handleBypassToggle}
              >
                {bypassActive ? 'Active — Unlock All' : 'Disabled'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, all program days become loggable regardless of the current date. Test any day's workout without waiting for it to arrive.
            </p>
          </CardHeader>
          {bypassActive && (
            <CardContent className="pt-0">
              <div className="text-xs bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-md px-3 py-2">
                All schedule locks are bypassed. Every day in the program is accessible and loggable.
              </div>
            </CardContent>
          )}
        </Card>

        {/* Section 3: Synthetic Data Seeder */}
        <Card className="border-green-300/60 dark:border-green-700/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="size-5 text-green-500" />
              <CardTitle className="text-base">Synthetic Data Seeder</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Generate realistic workout and meal history to test progressive overload, AI adaptation, and historical displays without weeks of real usage.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Weeks to Generate</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={seedWeeks}
                  onChange={e => setSeedWeeks(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                  className="w-20 h-9"
                />
              </div>
              <Button
                onClick={handleSeed}
                disabled={isSeeding || isClearing}
                size="sm"
                className="h-9"
              >
                {isSeeding ? (
                  <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Seeding...</>
                ) : (
                  <><Zap className="size-3.5 mr-1.5" />Seed Data</>
                )}
              </Button>
              <Button
                onClick={handleClear}
                disabled={isSeeding || isClearing}
                variant="outline"
                size="sm"
                className="h-9 text-destructive hover:text-destructive"
              >
                {isClearing ? (
                  <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Clearing...</>
                ) : (
                  <><Trash2 className="size-3.5 mr-1.5" />Clear All</>
                )}
              </Button>
            </div>

            {seedProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{seedProgress.phase}</span>
                  <span>{seedProgress.current}/{seedProgress.total}</span>
                </div>
                <Progress value={(seedProgress.current / seedProgress.total) * 100} className="h-2" />
              </div>
            )}

            {seedResult && (
              <div className={`text-xs rounded-md px-3 py-2 ${seedResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'}`}>
                {seedResult.message}
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Generates for this profile:</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Workout logs: progressive weight, varied reps, simulated fatigue/RPE</li>
                <li>Meal logs: randomized from your plan with 80-120% macro variance</li>
                <li>Dates aligned to your training schedule</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Constraint Audit */}
        <Card className="border-purple-300/60 dark:border-purple-700/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-purple-500" />
              <CardTitle className="text-base">Constraint Audit</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tests every combination of Equipment x Injury x Duration x Training Style against the exercise engine. Verifies no excluded equipment or injured joints leak through, sessions stay within time budgets, and style-required patterns are present.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleRunAudit}
                disabled={auditRunning}
                size="sm"
              >
                {auditRunning ? (
                  <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Running...</>
                ) : (
                  <><Play className="size-3.5 mr-1.5" />Run Full Audit</>
                )}
              </Button>

              {auditReport && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-green-400/60 text-green-700 dark:text-green-300">
                    {auditReport.passed} passed
                  </Badge>
                  {auditReport.failed > 0 && (
                    <Badge variant="outline" className="border-red-400/60 text-red-700 dark:text-red-300">
                      {auditReport.failed} failed
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    ({Math.round(auditReport.runTimeMs)}ms)
                  </span>
                </div>
              )}
            </div>

            {auditRunning && auditProgress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Testing combinations...</span>
                  <span>{auditProgress.done}/{auditProgress.total}</span>
                </div>
                <Progress value={(auditProgress.done / auditProgress.total) * 100} className="h-2" />
              </div>
            )}

            {auditReport && (
              <AuditResults
                report={auditReport}
                showFailuresOnly={showFailuresOnly}
                onToggleFilter={() => setShowFailuresOnly(v => !v)}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

// --- Audit Results Sub-Component ---

function AuditResults({
  report,
  showFailuresOnly,
  onToggleFilter,
}: {
  report: AuditReport
  showFailuresOnly: boolean
  onToggleFilter: () => void
}) {
  const displayed = showFailuresOnly
    ? report.results.filter(r => !r.passed)
    : report.results

  return (
    <div className="space-y-3">
      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Results ({displayed.length} of {report.totalCombinations})
        </h3>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onToggleFilter}>
          {showFailuresOnly ? 'Show All' : 'Failures Only'}
        </Button>
      </div>

      {report.failed === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-md px-3 py-2">
          <CheckCircle2 className="size-4" />
          All {report.totalCombinations} combinations passed all constraint checks.
        </div>
      )}

      {displayed.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {displayed.map((tc, idx) => (
            <AuditCaseRow key={idx} testCase={tc} />
          ))}
        </div>
      )}
    </div>
  )
}

function AuditCaseRow({ testCase }: { testCase: AuditTestCase }) {
  const [expanded, setExpanded] = useState(false)
  const label = `${testCase.equipment} / ${testCase.injuries.length > 0 ? testCase.injuries.join('+') : 'none'} / ${testCase.duration} / ${testCase.style}`

  return (
    <div className={`border rounded-md text-xs ${testCase.passed ? 'border-green-200 dark:border-green-800/40' : 'border-red-200 dark:border-red-800/40'}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {testCase.passed ? (
          <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
        ) : (
          <XCircle className="size-3.5 text-red-600 shrink-0" />
        )}
        <span className="flex-1 font-mono truncate">{label}</span>
        <span className="text-muted-foreground shrink-0">
          {testCase.planDays}d / {testCase.totalExercises}ex / {Math.round(testCase.estimatedDurationSec / 60)}min
        </span>
      </button>

      {expanded && testCase.failures.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1 bg-red-50/50 dark:bg-red-900/10">
          {testCase.failures.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                {f.check}
              </Badge>
              <span className="text-muted-foreground">
                {f.exercise && <strong className="text-foreground">{f.exercise}: </strong>}
                {f.details}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
