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
import { stepsTargetFor } from '@/lib/steps-target'
import { getStepsForDate, logStepsManual, type DailyStepsRow } from '@/lib/steps-store'
import { WeighInCard } from '@/components/WeighInCard'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'

interface DashboardProps {
  profile: UserProfile
  macros: MacroTargets | null
  exercisePlan: WorkoutDay[]
  mesocycle: MesocycleWeek[]
  planCreatedAt?: string
  /** Fired after a weigh-in is logged here so App.tsx recomputes living targets + latestWeightKg — same callback chat's log_weight already uses. */
  onWeightLogged?: () => void | Promise<void>
}

// Tab-restructure handoff — Dashboard.tsx no longer owns the macro ring
// meter or water logging (both moved to NutritionDisplay.tsx). Its "Today"
// section is now two read-only tiles that deep-link into Nutrition; the
// small calorie-tile ring below is a single indicator ring, not the
// multi-macro meter that used to live here.
const CALORIE_TILE_RING_R = 14
const CALORIE_TILE_RING_CIRC = 2 * Math.PI * CALORIE_TILE_RING_R

/** Weigh-in trend — hand-authored SVG, no charting library (matches this
 * app's existing convention for the ring meters). x is spread evenly across
 * the series (not date-proportional — a gap in logging doesn't visually
 * compress); y maps min/max weight to an 8-48 band inside the 60-tall
 * viewBox, leaving 8px headroom top and 12px bottom, per the design
 * reference. A flat (single-value or all-equal) series renders as a
 * straight line at the vertical midpoint rather than dividing by zero.
 *
 * `goalKg`, when set, is folded into the min/max range BEFORE mapping so the
 * goal line is always visible even when it sits outside the logged series —
 * a Fat Loss user who just set a goal 8kg below today's weigh-in should see
 * both on the same chart, not a goal line clipped off the top/bottom. */
function WeighInTrendChart({ series, goalKg }: { series: { date: string; kg: number }[]; goalKg?: number | null }) {
  const width = 320
  const height = 60
  const topY = 8
  const bottomY = 48
  const kgs = series.map(p => p.kg)
  const rangeValues = goalKg != null ? [...kgs, goalKg] : kgs
  const min = Math.min(...rangeValues)
  const max = Math.max(...rangeValues)
  const range = max - min
  const toY = (kg: number) => (range > 0 ? bottomY - ((kg - min) / range) * (bottomY - topY) : (topY + bottomY) / 2)
  const points = series.map((p, i) => ({
    x: series.length > 1 ? (i / (series.length - 1)) * width : width / 2,
    y: toY(p.kg),
  }))
  const lineStr = points.map(p => `${p.x},${p.y}`).join(' ')
  const areaStr = `${points[0].x},${height} ${lineStr} ${points[points.length - 1].x},${height}`
  const last = points[points.length - 1]
  const goalY = goalKg != null ? toY(goalKg) : null
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="mt-2.5 block">
      <polygon points={areaStr} fill="rgba(var(--glow-rgb),.10)" />
      {goalY != null && (
        <>
          <line x1={0} y1={goalY} x2={width} y2={goalY} stroke="var(--role-warn, #FFB454)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.7" />
          <text x={width} y={goalY - 3} textAnchor="end" fontSize="8" fill="var(--role-warn, #FFB454)" opacity="0.85">goal</text>
        </>
      )}
      <polyline
        points={lineStr}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="glow-icon"
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill="var(--primary)" />
    </svg>
  )
}


export function Dashboard({ profile, macros, exercisePlan, mesocycle, planCreatedAt, onWeightLogged }: DashboardProps) {
  const stepsTarget = stepsTargetFor(profile)
  const activeSession = useActiveSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const [steps, setSteps] = useState<DailyStepsRow | null>(null)
  const [stepsInput, setStepsInput] = useState('')

  const [phaseExpanded, setPhaseExpanded] = useState(false)

  // Bumped after a weigh-in save (from WeighInCard here, or a goal-weight
  // set) so the effect below re-fetches — nothing else that changes when a
  // weight is logged (session logs, date) already triggers this effect, and
  // a chat-side log_weight only refreshes App.tsx's own latestWeightKg, not
  // this component's independently-fetched weightSeries/weightTrend/goal.
  const [weighInVersion, setWeighInVersion] = useState(0)

  useEffect(() => {
    // Deliberately NOT gated on `macros`. computeTargets returns null for
    // anyone who declined a body metric, and `loading` initialises to true —
    // so requiring macros here left the entire Home tab stuck on "Loading
    // your day…" forever for exactly the trainee item 2b exists to serve. It
    // also made the weigh-in card unreachable, which is the one thing that
    // would have given us their weight. Nothing else on this screen needs a
    // calorie target; see hasNutritionTargets for the part that does.
    if (!activeSession.ready || !profile.id) return
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
  }, [activeSession.ready, activeSession.date, activeSession.logs.length, profile.id, weighInVersion, macros])

  const handleWeighInChanged = async () => {
    setWeighInVersion(v => v + 1)
    await onWeightLogged?.()
  }

  useEffect(() => {
    if (!profile.id) return
    void getStepsForDate(profile.id, activeSession.date || '').then(setSteps).catch(() => setSteps(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, activeSession.date])

  if (!activeSession.ready || loading || !data) {
    return (
      <div className="rounded-xl bg-card py-12 text-center text-sm text-muted-foreground">Loading your day…</div>
    )
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
            'radial-gradient(120% 60% at 50% 0%, var(--hero-wash) 0%, transparent 60%), radial-gradient(90% 40% at 20% 42%, rgba(var(--glow-rgb),.10) 0%, transparent 70%)',
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
        {/* data-tour: the app tour spotlights this whole unit (focus + CTA +
            tomorrow line) as "Home answers one question — what's next". */}
        <div data-tour="hero" className="relative mt-4 pt-1">
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

        {/* 4. Today — tab restructure: the ring meter and water logging move
            to Nutrition (one owner per fact). What's left here is two
            read-only tiles that deep-link into Nutrition — Home never
            mutates nutrition state, it only shows where things stand and
            hands off. */}
        {/* data-tour wraps the LABEL and the tiles together — the tour's copy
            is about the pair ("calories and water at a glance"), and a
            spotlight that cut the label off would read as a mistake. */}
        <div data-tour="tiles">
        <p className="ds-label mt-8">Today</p>
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => { window.location.hash = tabHash('nutrition') }}
            className="flex flex-col items-start gap-2.5 rounded-2xl p-3.5 text-left"
            style={{ background: 'var(--surface-raised)' }}
          >
            <svg width="34" height="34" viewBox="0 0 34 34" className="shrink-0">
              <circle cx="17" cy="17" r={CALORIE_TILE_RING_R} fill="none" stroke="rgba(69,60,142,.9)" strokeWidth="4" />
              {/* No ring at all without a target — a ring at 0% reads as "you
                  have eaten nothing of your allowance", which is a claim we
                  cannot make. */}
              {data.hasNutritionTargets && (
                <circle
                  cx="17" cy="17" r={CALORIE_TILE_RING_R} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${CALORIE_TILE_RING_CIRC * Math.min(1, data.caloriesTarget > 0 ? data.caloriesEaten / data.caloriesTarget : 0)} ${CALORIE_TILE_RING_CIRC}`}
                  transform="rotate(-90 17 17)"
                />
              )}
            </svg>
            <div>
              <p className="tabular-mono text-[19px] font-bold">{Math.round(data.caloriesEaten)}</p>
              {/* "of 0 kcal" is the placeholder the absence doctrine forbids
                  (MissingBodyMetricsNotice): a figure that looks deliberate
                  and means nothing. Say what is missing instead. */}
              <p className="text-[9px] uppercase tracking-[.14em] text-muted-foreground">
                {data.hasNutritionTargets ? `of ${Math.round(data.caloriesTarget)} kcal` : 'kcal · no target yet'}
              </p>
            </div>
            <span className="text-[11px] font-semibold text-primary">Nutrition ›</span>
          </button>

          <div
            className="flex flex-col items-start gap-2.5 rounded-2xl p-3.5 text-left"
            style={{ background: 'var(--surface-raised)' }}
          >
            <div>
              <p className="tabular-mono text-[19px] font-bold">{data.waterMl} <span className="text-[13px] font-medium text-muted-foreground">ml</span></p>
              <p className="text-[9px] uppercase tracking-[.14em] text-muted-foreground">of {data.waterTargetMl} water</p>
            </div>
            <div className="h-[2px] w-full rounded-full" style={{ background: 'var(--hairline)' }}>
              <div className="h-[2px] rounded-full bg-primary glow-mint-box" style={{ width: `${data.waterTargetMl > 0 ? Math.min(100, (data.waterMl / data.waterTargetMl) * 100) : 0}%` }} />
            </div>
            <button type="button" onClick={() => { window.location.hash = tabHash('nutrition') }} className="hit-slop-44 text-[11px] font-semibold text-primary">Nutrition ›</button>
          </div>
        </div>
        </div>

        {/* Steps — unchanged; still logged here. */}
        <div className="mt-5 flex flex-col">
          <div className="flex items-baseline justify-between py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
            <span className="text-[13px] text-text-tertiary">Steps</span>
            {steps ? (
              /* A RING, matching the calorie tile — Ashley: "replace the plain
                 text box/button for Steps with a visual progress bar or ring
                 matching the calorie indicator style". Same radius, same
                 stroke, same rotate(-90) start, so the two read as one system
                 rather than two people's work.

                 The target is DERIVED from the activity level already on file
                 (steps-target.ts), exactly as the calorie target is derived
                 from BMR and TDEE. It is not a new kind of claim for this app
                 to make — it is the existing one applied to a second number. */
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 34 34" className="size-[26px] shrink-0" aria-hidden>
                  <circle cx="17" cy="17" r={CALORIE_TILE_RING_R} fill="none" stroke="var(--surface-raised)" strokeWidth="4" />
                  <circle
                    cx="17" cy="17" r={CALORIE_TILE_RING_R} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${CALORIE_TILE_RING_CIRC * Math.min(1, steps.steps / stepsTarget)} ${CALORIE_TILE_RING_CIRC}`}
                    transform="rotate(-90 17 17)"
                  />
                </svg>
                <span className="tabular-mono text-[13px]">{steps.steps.toLocaleString()}</span>
                <span className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  of {stepsTarget.toLocaleString()}
                </span>
              </div>
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

        {/* Weigh-in — logging + history + trend graph all live here now
            (moved from Nutrition's WeighInCard): a Fat Loss user tracking
            progress looks at Home first, and the log input sits right next
            to the trend it feeds instead of a plan-detail tab mirroring it
            read-only. A goal weight, when set, draws as a line on the chart. */}
        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--hairline)' }}>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-text-tertiary">Weigh-in</span>
            {data.weightSeries.length > 0 && (
              <span className="text-[13px]">
                <span className="tabular-mono font-semibold">{data.weightSeries[data.weightSeries.length - 1].kg.toFixed(1)} kg</span>
                <span className="ml-1.5 text-muted-foreground">
                  {data.weightSeries[data.weightSeries.length - 1].date === data.today ? 'today ✓' : data.weightSeries[data.weightSeries.length - 1].date}
                </span>
              </span>
            )}
          </div>
          {data.weightSeries.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Log a weigh-in to see your trend here.</p>
          ) : (
            <>
              <WeighInTrendChart series={data.weightSeries} goalKg={data.weightGoalKg} />
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">{data.weightSeries.length} weigh-in{data.weightSeries.length === 1 ? '' : 's'}</span>
                {data.weightSeries.length > 1 && (
                  <span className="text-[11px] font-semibold text-primary">
                    {(() => {
                      const delta = data.weightSeries[data.weightSeries.length - 1].kg - data.weightSeries[0].kg
                      return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg since week 1`
                    })()}
                  </span>
                )}

              </div>
            </>
          )}
          {/* NO LINK HERE, and that is the point of the change rather than
              an omission. Ashley asked to "collapse Set goal weight into a
              setting modal, and keep only the quick weight logger visible to
              reduce scrolling" — and measurement is what settled it: removing
              the input row saved 44px, and a link back to it cost 24 of them,
              so the page came out one pixel TALLER than it started (1289 ->
              1290). The instruction was already the right answer.

              Setting a goal weight lives in the profile screen's Goals
              section, reachable from the gear, and the coach can set one in
              chat. Two routes, neither of them a permanent row on the screen
              someone opens every morning. */}
          {profile.id && (
            <div className="mt-3">
              <WeighInCard profileId={profile.id} onWeightLogged={handleWeighInChanged} />
            </div>
          )}
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

        {/* CONSISTENCY, NOT READINESS, and the components are shown for the
            same reason the name is careful: a lone percentage invites being
            read as a verdict on the person. Spelling out what it counted
            keeps it a summary of things they did, which is all it is.

            Absent entirely when nothing measurable has happened this plan
            week — a 0% on a Monday with nothing scheduled yet would read as
            "you have been terrible", which is the opposite of true. */}
        {data.consistency && (
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">Consistency:</span>
            <span className="tabular-mono text-xs font-semibold text-primary">{data.consistency.percent}%</span>
            <span className="text-[11px] text-muted-foreground">
              {data.consistency.components.map(c => `${c.done}/${c.outOf} ${c.label}`).join(' · ')}
            </span>
          </div>
        )}

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
