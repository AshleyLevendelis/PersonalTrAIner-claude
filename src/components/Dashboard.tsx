// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — the daily home. Structure and data this round
// (per the request: "no colour/type/aesthetic decisions; a visual pass
// follows separately") — plain Card sections, house-voice empty states,
// no new visual language invented here.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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

// Turn 10 ring meter — classic radial-progress technique (stroke-dasharray of
// a fraction of the circle's circumference, rotated -90deg to start at 12
// o'clock). Four concentric rings share one <svg>: calories (outermost) then
// protein/carbs/fat nested inside, each fading in text-color opacity to match
// the legend rows below. r/stroke-width match the design doc's literal values.
const RINGS = [
  { key: 'calories', r: 40, strokeWidth: 8 },
  { key: 'protein', r: 30, strokeWidth: 5 },
  { key: 'carbs', r: 22, strokeWidth: 5 },
  { key: 'fat', r: 14, strokeWidth: 5 },
] as const
const RING_CIRC: Record<string, number> = Object.fromEntries(RINGS.map(r => [r.key, 2 * Math.PI * r.r]))

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
      <div className="rounded-xl bg-card py-12 text-center text-sm text-muted-foreground">Loading your day…</div>
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
    // Density pass 3a "Borderless": no cards. Sections separate by the
    // uppercase micro-label + generous whitespace; the hero and the numbers
    // read as distinct units through fill, type scale and halo alone. The two
    // ambient radial washes sit behind everything (pointer-events-none) and
    // are what stop a fully borderless surface reading as flat.
    <div className="relative -mx-1 px-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 h-[420px]"
        style={{
          background:
            'radial-gradient(120% 60% at 50% 0%, rgba(156,141,255,.20) 0%, rgba(26,22,54,0) 60%), radial-gradient(90% 40% at 20% 42%, rgba(var(--glow-rgb),.10) 0%, rgba(26,22,54,0) 70%)',
        }}
      />
      {/* Turn 4: a near-invisible grain texture over the whole hero surface. */}
      <div className="grain-overlay" aria-hidden />

      <div className="relative">
        {/* 1. Day + streak — turn 4: streak is a number+label pair, not a
            fire-emoji inline string. */}
        <div className="flex items-start justify-between">
          <span className="pt-1 ds-label">
            {data.dayName}
            {data.phase ? ` · Week ${data.phase.weekNumber} of ${data.phase.totalWeeks}` : ''}
          </span>
          <span className="flex flex-col items-end leading-none">
            <span className={`text-[26px] font-bold tracking-[-.03em] ${data.streak > 0 ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
              {data.streak}
            </span>
            <span className="mt-1 text-[9px] uppercase tracking-[.18em] text-muted-foreground">
              day{data.streak === 1 ? '' : 's'} streak
            </span>
          </span>
        </div>

        {/* 2. Today's session — the hero. Borderless: it's the type scale, the
            local glow blooms and the lit CTA that make this the focal unit. */}
        <div className="relative mt-4 pt-1">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-8 -top-10 size-[200px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(156,141,255,.30) 0%, rgba(156,141,255,0) 70%)' }}
          />
          {data.session.status === 'rest' ? (
            <div className="relative space-y-1">
              <p className="text-[25px] font-bold tracking-[-.02em] glow-text">Rest day</p>
              <p className="text-[12.5px] text-muted-foreground">Nothing planned today — recovery is part of the program.</p>
            </div>
          ) : (
            <div className="relative space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[25px] font-bold tracking-[-.02em] glow-text min-w-0 truncate">{data.session.focus}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {data.session.status === 'not_started' ? 'Not started' : data.session.status === 'in_progress' ? `${data.session.setsLogged}/${data.session.setsPlanned} sets` : 'Done'}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground truncate">
                  {data.session.exerciseNames.slice(0, 3).join(' · ')}{data.session.exerciseNames.length > 3 ? ` · +${data.session.exerciseNames.length - 3} more` : ''}
                </p>
              </div>
              {data.session.status !== 'done' && (
                <Button
                  size="cta"
                  className="w-full glow-bloom-once"
                  style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white) 0%, var(--primary) 55%, var(--primary-2) 100%)' }}
                  onClick={() => { window.location.hash = tabHash('exercise') }}
                >
                  {data.session.status === 'not_started' ? 'Start session' : 'Continue session'}
                </Button>
              )}
            </div>
          )}
          <p className="relative mt-2.5 text-xs text-muted-foreground">{data.tomorrowLabel}</p>
        </div>

        {/* 3. Coach tip — AI voice. Borderless, the violet halo carries the tone. */}
        {data.coachTip && (
          <div className="mt-5 flex items-start gap-2.5">
            <span className="text-sm leading-[1.4] text-[color:var(--role-ai)] glow-violet">⚡</span>
            <span className="text-[13px] leading-[1.5] text-[color:var(--role-ai-text)]">{data.coachTip}</span>
          </div>
        )}

        {/* 4. Today's numbers — turn 4: a glowing ring meter (calories outer,
            protein inner) replaces the flat progress-line tiles; violet is
            ambience-only now, so the label loses its glow. Water/Steps drop
            out of the tile grid into plain hairline-divided rows. */}
        <p className="ds-label mt-8">Today</p>
        <div className="mt-[18px] flex items-center gap-[18px]">
          <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0">
            {RINGS.map(r => (
              <circle key={`track-${r.key}`} cx="56" cy="56" r={r.r} fill="none" stroke="var(--surface-raised)" strokeWidth={r.strokeWidth} />
            ))}
            {RINGS.map((r, i) => {
              const eaten = r.key === 'calories' ? data.caloriesEaten : r.key === 'protein' ? data.proteinEaten : r.key === 'carbs' ? data.carbsEaten : data.fatEaten
              const target = r.key === 'calories' ? data.caloriesTarget : r.key === 'protein' ? data.proteinTarget : r.key === 'carbs' ? data.carbsTarget : data.fatTarget
              const circ = RING_CIRC[r.key]
              return (
                <circle
                  key={`fill-${r.key}`}
                  cx="56" cy="56" r={r.r} fill="none" strokeWidth={r.strokeWidth} strokeLinecap="round"
                  stroke={i === 0 ? 'var(--primary)' : 'currentColor'}
                  strokeOpacity={i === 0 ? undefined : 0.88 - i * 0.2}
                  strokeDasharray={`${circ * Math.min(1, target > 0 ? eaten / target : 0)} ${circ}`}
                  transform="rotate(-90 56 56)"
                  className={i === 0 ? 'glow-icon' : undefined}
                  style={{ transition: 'stroke-dasharray 400ms ease' }}
                />
              )
            })}
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div>
              <p className="ds-num-mega tabular-mono text-[#E4FCF4] glow-mint-lg">{Math.round(data.caloriesEaten)}</p>
              <p className="mt-1 text-[10.5px] uppercase tracking-[.16em] text-muted-foreground">
                kcal · of <span className="tabular-mono">{Math.round(data.caloriesTarget)}</span>
              </p>
              {data.caloriesEaten === 0 && (
                <button className="mt-1 text-left text-xs text-primary glow-mint" onClick={() => { window.location.hash = tabHash('nutrition') }}>Log a meal</button>
              )}
            </div>
            <div className="flex flex-col gap-[7px]">
              {([
                { label: 'Protein', eaten: data.proteinEaten, target: data.proteinTarget, opacity: 0.88 },
                { label: 'Carbs', eaten: data.carbsEaten, target: data.carbsTarget, opacity: 0.66 },
                { label: 'Fat', eaten: data.fatEaten, target: data.fatTarget, opacity: 0.48 },
              ] as const).map(row => (
                <div key={row.label} className="flex items-baseline gap-[9px]">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--text-tertiary) ${Math.round(row.opacity * 100)}%, transparent)` }} />
                  <span className="flex-1 text-[10px] uppercase tracking-[.16em] text-muted-foreground">{row.label}</span>
                  <span className="tabular-mono text-[12.5px]">
                    {Math.round(row.eaten)}<span className="text-muted-foreground"> / {Math.round(row.target)}g</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col">
          <div className="flex items-baseline justify-between py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
            <span className="text-[13px] text-text-tertiary">Water</span>
            {editingTarget ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  className="h-7 w-16 min-w-0 rounded-md bg-[color:var(--surface-raised)] px-1.5 text-xs"
                />
                <Button size="sm" variant="ghost" className="h-7 shrink-0 px-1.5 text-[10px]" onClick={handleSaveTarget}>Save</Button>
              </div>
            ) : (
              <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
                <span className="tabular-mono text-[13px]">{todayWaterMl} / {waterTarget} ml</span>
                {WATER_QUICK_ADD_ML.map(ml => (
                  <button key={ml} className="text-xs font-semibold text-primary glow-mint" onClick={() => handleAddWater(ml)}>+{ml}</button>
                ))}
                <button className="text-xs text-muted-foreground" onClick={() => { setTargetInput(String(waterTarget)); setEditingTarget(true) }}>edit</button>
                {lastWaterLog && (
                  <button className="text-xs text-muted-foreground" onClick={handleUndoWater}>undo</button>
                )}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
            <span className="text-[13px] text-text-tertiary">Steps</span>
            {steps ? (
              <span className="tabular-mono text-[13px]">{steps.steps.toLocaleString()}</span>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Steps"
                  value={stepsInput}
                  onChange={e => setStepsInput(e.target.value)}
                  className="h-7 w-24 min-w-0 rounded-md bg-[color:var(--surface-raised)] px-2 text-xs"
                />
                <button className="shrink-0 text-xs font-semibold text-primary glow-mint" onClick={handleLogSteps}>Log</button>
              </div>
            )}
          </div>
        </div>

        {/* 5. Progress — the section rule is gone; the label does that work. */}
        <p className="ds-label mt-9">Progress</p>
        {data.weightTrend ? (
          <div className="mt-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="ds-num-tile tabular-mono text-[#E4FCF4] glow-mint-lg">
              {data.weightTrend.rollingAvgKg.toFixed(1)}<span className="text-[15px] font-medium text-muted-foreground [text-shadow:none]"> kg</span>
            </span>
            {data.weightTrend.ratePerWeekKg != null && (
              <span className={`text-[13px] ${data.weightTrend.ratePerWeekKg < 0 ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
                {data.weightTrend.ratePerWeekKg > 0 ? '+' : ''}{data.weightTrend.ratePerWeekKg.toFixed(1)} kg/wk
                {data.weightTrend.onTrackForGoal === true ? ' · on track' : data.weightTrend.onTrackForGoal === false ? ' · slower than target' : ''}
              </span>
            )}
            {data.weightTrend.sampleCount === 1 && (
              <span className="text-[10px] text-muted-foreground/70">(1 weigh-in — trend firms up with more)</span>
            )}
          </div>
        ) : (
          <p className="mt-3.5 text-xs text-muted-foreground">Log a weigh-in to see your trend here.</p>
        )}

        {data.recentPRs.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.recentPRs.map(pr => (
              <p key={pr.exerciseName} className="text-[13px]">
                {pr.exerciseName} <span className="font-semibold tabular-mono text-primary glow-mint">{pr.weightKg} kg</span>
                <span className="text-[11px] text-muted-foreground"> — new PR</span>
              </p>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">Streak: {data.streak} day{data.streak === 1 ? '' : 's'} on plan</p>

        {/* 6. What's left today — needs-you amber, marked by a pulsing dot
            rather than a bordered banner. */}
        {data.whatsLeftLine && (
          <div className="mt-6 flex items-baseline gap-2">
            <span aria-hidden className="size-1.5 shrink-0 self-center rounded-full bg-[color:var(--role-warn)] glow-warn-dot" />
            <span className="text-[12.5px] text-[color:var(--role-warn-text)] glow-warn">{data.whatsLeftLine}</span>
          </div>
        )}

        {/* 7. Phase context */}
        {data.phase && (
          <button className="mt-6 block w-full text-left" onClick={() => setPhaseExpanded(e => !e)}>
            <p className="text-xs text-muted-foreground">
              Week {data.phase.weekNumber} of {data.phase.totalWeeks}
              {data.phase.phaseLabel ? ` · ${data.phase.phaseLabel}` : ''}
              {data.phase.isDeload ? ' (deload)' : ''}
              {data.phase.isCalibrationWeek ? ' (calibration)' : ''}
              <span className="ml-1 text-primary glow-mint">›</span>
            </p>
            {phaseExpanded && data.phase.phaseFocus && (
              <p className="mt-1.5 text-xs text-muted-foreground">{data.phase.phaseFocus}</p>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
