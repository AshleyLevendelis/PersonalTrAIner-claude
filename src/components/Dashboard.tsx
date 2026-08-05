// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — the daily home. Structure and data this round
// (per the request: "no colour/type/aesthetic decisions; a visual pass
// follows separately") — plain Card sections, house-voice empty states,
// no new visual language invented here.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getAppNow } from '@/lib/dev-clock'
import { tabHash } from '@/lib/app-route'
import { loadDashboardData, type DashboardData } from '@/lib/dashboard-data'
import { getAllLogs as getAllWaterLogs, logWater, undoLog as undoWaterLog, setWaterTargetMl, type WaterLogRow } from '@/lib/water-store'
import { getStepsForDate, logStepsManual, type DailyStepsRow } from '@/lib/steps-store'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'

interface DashboardProps {
  profile: UserProfile
  macros: MacroTargets | null
  exercisePlan: WorkoutDay[]
  mesocycle: MesocycleWeek[]
  planCreatedAt?: string
  onWaterChanged?: () => void
}

const WATER_QUICK_ADD_ML = [250, 500]

export function Dashboard({ profile, macros, exercisePlan, mesocycle, planCreatedAt, onWaterChanged }: DashboardProps) {
  const activeSession = useActiveSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const [waterLogs, setWaterLogs] = useState<WaterLogRow[]>([])
  const [waterTarget, setWaterTarget] = useState(profile.water_target_ml ?? 2000)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState(String(profile.water_target_ml ?? 2000))
  const [lastWaterLog, setLastWaterLog] = useState<WaterLogRow | null>(null)

  const [steps, setSteps] = useState<DailyStepsRow | null>(null)
  const [stepsInput, setStepsInput] = useState('')

  const [phaseExpanded, setPhaseExpanded] = useState(false)

  useEffect(() => {
    if (!activeSession.ready || !profile.id || !macros) return
    let cancelled = false
    setLoading(true)
    loadDashboardData({
      profile, macros, exercisePlan, mesocycle, planCreatedAt,
      todayLogs: activeSession.logs, liveWeek: activeSession.liveWeek,
      dayName: activeSession.dayName, todayStr: activeSession.date,
      now: getAppNow(profile.id),
    }).then(d => { if (!cancelled) setData(d) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession.ready, activeSession.date, activeSession.logs.length, profile.id])

  useEffect(() => {
    if (!profile.id) return
    void getAllWaterLogs(profile.id).then(setWaterLogs)
    void getStepsForDate(profile.id, activeSession.date || '').then(setSteps).catch(() => setSteps(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, activeSession.date])

  if (!activeSession.ready || loading || !data) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading your day…</CardContent>
      </Card>
    )
  }

  const todayWaterMl = waterLogs.filter(l => l.date === activeSession.date).reduce((s, l) => s + l.amount_ml, 0)

  const handleAddWater = (amountMl: number) => {
    if (!profile.id) return
    const row = logWater({ profileId: profile.id, date: activeSession.date, amountMl, source: 'manual' })
    setWaterLogs(prev => [...prev, row])
    setLastWaterLog(row)
    void onWaterChanged?.()
  }
  const handleUndoWater = () => {
    if (!lastWaterLog) return
    undoWaterLog(lastWaterLog)
    setWaterLogs(prev => prev.filter(l => l.id !== lastWaterLog.id))
    setLastWaterLog(null)
    void onWaterChanged?.()
  }
  const handleSaveTarget = async () => {
    const n = Number(targetInput)
    if (!profile.id || !Number.isFinite(n) || n <= 0) { setEditingTarget(false); return }
    setWaterTarget(n)
    setEditingTarget(false)
    await setWaterTargetMl(profile.id, n)
  }

  const handleLogSteps = async () => {
    const n = Number(stepsInput)
    if (!profile.id || !Number.isFinite(n) || n < 0) return
    const row = await logStepsManual(profile.id, activeSession.date, Math.round(n))
    setSteps(row)
    setStepsInput('')
  }

  return (
    <div className="space-y-4">
      {/* 1. Today's session */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{data.dayName}</CardTitle>
            <span className="text-xs text-muted-foreground">🔥 {data.streak} day{data.streak === 1 ? '' : 's'}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.session.status === 'rest' ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Rest day</p>
              <p className="text-xs text-muted-foreground">Nothing planned today — recovery is part of the program.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{data.session.focus}</p>
                <Badge variant={data.session.status === 'done' ? 'default' : 'outline'} className="text-[10px]">
                  {data.session.status === 'not_started' ? 'Not started' : data.session.status === 'in_progress' ? `${data.session.setsLogged}/${data.session.setsPlanned} sets` : 'Done'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {data.session.exerciseNames.slice(0, 3).join(' · ')}{data.session.exerciseNames.length > 3 ? ` · +${data.session.exerciseNames.length - 3}` : ''}
              </p>
              {data.session.status !== 'done' && (
                <Button size="sm" onClick={() => { window.location.hash = tabHash('exercise') }}>
                  {data.session.status === 'not_started' ? 'Start session' : 'Continue session'}
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-1">{data.tomorrowLabel}</p>
        </CardContent>
      </Card>

      {/* 2. Coach tip */}
      {data.coachTip && (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-3">
            <p className="text-sm">⚡ {data.coachTip}</p>
          </CardContent>
        </Card>
      )}

      {/* 3. Today's numbers */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Today</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span>Calories</span>
              <span className="font-mono">{Math.round(data.caloriesEaten)} / {Math.round(data.caloriesTarget)} kcal</span>
            </div>
            <Progress value={data.caloriesTarget > 0 ? Math.min(150, (data.caloriesEaten / data.caloriesTarget) * 100) : 0} className="h-2" />
            <div className="flex items-center justify-between text-sm">
              <span>Protein</span>
              <span className="font-mono">{Math.round(data.proteinEaten)} / {Math.round(data.proteinTarget)}g</span>
            </div>
            <Progress value={data.proteinTarget > 0 ? Math.min(150, (data.proteinEaten / data.proteinTarget) * 100) : 0} className="h-2" />
            {data.caloriesEaten === 0 && (
              <Button size="sm" variant="outline" onClick={() => { window.location.hash = tabHash('meals') }}>Log a meal</Button>
            )}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between text-sm">
              <span>Water</span>
              {editingTarget ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    className="w-16 h-6 text-xs border rounded px-1 bg-background"
                  />
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={handleSaveTarget}>Save</Button>
                </div>
              ) : (
                <button className="font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => { setTargetInput(String(waterTarget)); setEditingTarget(true) }}>
                  {todayWaterMl}ml / {waterTarget}ml (edit)
                </button>
              )}
            </div>
            <Progress value={waterTarget > 0 ? Math.min(150, (todayWaterMl / waterTarget) * 100) : 0} className="h-2" />
            <div className="flex items-center gap-1.5">
              {WATER_QUICK_ADD_ML.map(ml => (
                <Button key={ml} size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddWater(ml)}>+{ml}ml</Button>
              ))}
              {lastWaterLog && (
                <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={handleUndoWater}>Undo</Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between text-sm">
              <span>Steps</span>
              {steps ? (
                <span className="font-mono text-xs text-muted-foreground">{steps.steps.toLocaleString()}</span>
              ) : (
                <span className="text-xs text-muted-foreground">not tracked yet</span>
              )}
            </div>
            {!steps && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="Enter today's steps"
                  value={stepsInput}
                  onChange={e => setStepsInput(e.target.value)}
                  className="flex-1 h-7 text-xs border rounded px-2 bg-background"
                />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleLogSteps}>Log</Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/70">
              No automatic step tracking yet — enter manually, or nothing to show.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Progress */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.weightTrend ? (
            <div className="text-sm">
              <span className="font-mono">{data.weightTrend.rollingAvgKg.toFixed(1)}kg</span>
              {data.weightTrend.ratePerWeekKg != null && (
                <span className="text-muted-foreground"> · {data.weightTrend.ratePerWeekKg > 0 ? '+' : ''}{data.weightTrend.ratePerWeekKg.toFixed(1)}kg/week</span>
              )}
              {data.weightTrend.onTrackForGoal === true && <span className="text-xs text-muted-foreground"> · on track for your target</span>}
              {data.weightTrend.onTrackForGoal === false && <span className="text-xs text-muted-foreground"> · slower than your target pace</span>}
              {data.weightTrend.sampleCount === 1 && <span className="text-[10px] text-muted-foreground/70"> (1 weigh-in — trend firms up with more)</span>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Log a weigh-in to see your trend here.</p>
          )}

          {data.recentPRs.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent PRs</p>
              {data.recentPRs.map(pr => (
                <p key={pr.exerciseName} className="text-sm">{pr.exerciseName}: <span className="font-mono">{pr.weightKg}kg</span></p>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">Streak: {data.streak} day{data.streak === 1 ? '' : 's'} on plan</p>
        </CardContent>
      </Card>

      {/* 5. What's left today */}
      {data.whatsLeftLine && (
        <p className="text-xs text-muted-foreground px-1">{data.whatsLeftLine}</p>
      )}

      {/* 6. Phase context */}
      {data.phase && (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-3">
            <button className="w-full text-left" onClick={() => setPhaseExpanded(e => !e)}>
              <p className="text-sm">
                Week {data.phase.weekNumber} / {data.phase.totalWeeks}
                {data.phase.phaseLabel ? ` · ${data.phase.phaseLabel}` : ''}
                {data.phase.isDeload ? ' (deload)' : ''}
                {data.phase.isCalibrationWeek ? ' (calibration)' : ''}
              </p>
            </button>
            {phaseExpanded && data.phase.phaseFocus && (
              <p className="text-xs text-muted-foreground mt-1.5">{data.phase.phaseFocus}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
