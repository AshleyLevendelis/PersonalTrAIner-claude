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
import { getStepsForDate, type DailyStepsRow } from '@/lib/steps-store'
import { WeighInCard } from '@/components/WeighInCard'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'
import { MessageCircle } from 'lucide-react'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { HomeWeekStrip, HomeWeekStripLabels } from '@/components/HomeWeekStrip'
import { setChatPrefill } from '@/lib/chat-prefill-store'

interface DashboardProps {
  profile: UserProfile
  macros: MacroTargets | null
  exercisePlan: WorkoutDay[]
  mesocycle: MesocycleWeek[]
  planCreatedAt?: string
  /** Fired after a weigh-in is logged here so App.tsx recomputes living targets + latestWeightKg — same callback chat's log_weight already uses. */
  onWeightLogged?: () => void | Promise<void>
  /** App's logsVersion — bumped when the chat writes a rest day or a session, so the week strip re-reads instead of showing a stale glyph. */
  logsVersion?: number
}

// Tab-restructure handoff — Dashboard.tsx no longer owns the macro ring
// meter or water logging (both moved to NutritionDisplay.tsx). Its "Today"
// section is now two read-only tiles that deep-link into Nutrition; the
// small calorie-tile ring below is a single indicator ring, not the
// multi-macro meter that used to live here.

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


/**
 * "Barbell Bench Press" -> "bench". The glance line has one line of a phone's
 * width to carry three facts; the catalogue's full names are written for a
 * plan screen where there is room for them.
 *
 * Falls back to the full name rather than a truncation, so an unrecognised
 * lift reads as itself instead of as "Kettlebell...".
 */
const LIFT_SHORT_NAME: Record<string, string> = {
  'Barbell Bench Press': 'bench',
  'Barbell Squats': 'squat',
  'Deadlifts': 'deadlift',
  'Trap Bar Deadlift': 'trap bar',
  'Overhead Press': 'overhead press',
  'Romanian Deadlift': 'RDL',
  'Front Squat': 'front squat',
  'Incline Barbell Press': 'incline bench',
}
function shortLiftName(name: string): string {
  return LIFT_SHORT_NAME[name] ?? name.toLowerCase()
}

/**
 * The two reply chips under a coach tip, keyed to the rule that produced it.
 *
 * Keyed rather than generic because "What changed?" under a protein-streak
 * line asks something different from the same words under a stalled-lift
 * line, and a chip that opens a conversation the coach cannot continue is
 * worse than no chip. A rule with no sensible follow-up returns none, which
 * is the expected outcome for most of them.
 */
const TIP_CHIPS: Record<string, { label: string; prefill: string }[]> = {
  lift_progress: [
    { label: 'What changed?', prefill: 'What changed to move that lift?' },
    { label: 'Adjust today', prefill: "Can we adjust today's session?" },
  ],
  protein_streak: [
    { label: 'What changed?', prefill: 'What have I been doing differently with protein?' },
  ],
  weight_trend: [
    { label: 'What changed?', prefill: 'What is driving my weight trend right now?' },
    { label: 'Adjust today', prefill: 'Should we adjust anything based on my weight trend?' },
  ],
  missed_sessions: [
    { label: 'Adjust today', prefill: "I have missed some sessions - can we adjust the plan?" },
  ],
}
function chipsForTip(key: string | null): { label: string; prefill: string }[] {
  return key ? (TIP_CHIPS[key] ?? []) : []
}

export function Dashboard({ profile, macros, exercisePlan, mesocycle, planCreatedAt, onWeightLogged, logsVersion }: DashboardProps) {
  const stepsTarget = stepsTargetFor(profile)
  const activeSession = useActiveSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const [steps, setSteps] = useState<DailyStepsRow | null>(null)

  // Home's copy of the week — the RECORD. Exercise's strip is the navigator
  // and owns tap-to-peek; the two share only the glyph vocabulary.
  const week = useTrainingWeek(profile.id, activeSession.date, exercisePlan ?? [], planCreatedAt, logsVersion)

  // Bumped after a weigh-in save (from WeighInCard here, or a goal-weight
  // set) so the effect below re-fetches — nothing else that changes when a
  // weight is logged (session logs, date) already triggers this effect, and
  // a chat-side log_weight only refreshes App.tsx's own latestWeightKg, not
  // this component's independently-fetched weightSeries/weightTrend/goal.
  const [weighInVersion, setWeighInVersion] = useState(0)
  const [loadError, setLoadError] = useState(false)
  /** Bumping this re-runs the load effect — the Retry button's whole mechanism. */
  const [retryVersion, setRetryVersion] = useState(0)

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
    })
      .then(d => { if (!cancelled) { setData(d); setLoadError(false) } })
      // WITHOUT THIS, A FAILED LOAD IS INDISTINGUISHABLE FROM A SLOW ONE —
      // forever. `finally` cleared `loading`, but `data` stayed null and the
      // render guard below is `loading || !data`, so one rejected promise left
      // the entire Home tab reading "Loading your day…" until the app was
      // restarted, with the failure visible only in a console nobody opens.
      .catch(err => {
        console.error('Loading the dashboard failed:', err)
        if (!cancelled) setLoadError(true)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession.ready, activeSession.date, activeSession.logs.length, profile.id, weighInVersion, macros, retryVersion])

  const handleWeighInChanged = async () => {
    setWeighInVersion(v => v + 1)
    await onWeightLogged?.()
  }

  useEffect(() => {
    if (!profile.id) return
    void getStepsForDate(profile.id, activeSession.date || '').then(setSteps).catch(() => setSteps(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, activeSession.date])

  if (!loading && loadError && !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card py-12 text-center">
        <p className="text-sm text-muted-foreground">Your day didn&apos;t load.</p>
        <p className="px-6 text-xs text-muted-foreground/70">
          Nothing is lost — anything you logged is still saved. This is just the summary.
        </p>
        <Button size="sm" variant="secondary" onClick={() => setRetryVersion(v => v + 1)}>Try again</Button>
      </div>
    )
  }

  if (!activeSession.ready || loading || !data) {
    return (
      <div className="rounded-xl bg-card py-12 text-center text-sm text-muted-foreground">Loading your day…</div>
    )
  }

  // Steps are LOGGED on the Exercise tab now (Ashley's ruling, 5 Sep 2026 —
  // they were on Nutrition before that, and on Home before that). Home still
  // reads the figure for its third tile: the read stays because the tile is a
  // pointer, and a pointer with no number on it points at nothing.
  // PROPOSAL 3, assembled here rather than inline so the three states read as
  // one decision. Each part is dropped when its value is genuinely unknown
  // rather than filled with a placeholder — an estimate we do not have is not
  // "~0 min".
  const glanceParts: string[] = []
  if (data.session.status === 'in_progress') {
    if (data.session.minutesLeft != null) glanceParts.push(`~${data.session.minutesLeft} min left`)
    // DELIBERATE DEVIATION FROM THE HANDOFF. It specifies "bench 92.5 kg
    // next"; the app knows the session's heaviest lift but NOT the running
    // order, so "next" would be a claim it cannot support — the same class of
    // invention as a fabricated weight. The number is shown without the word.
    if (data.session.leadLift) glanceParts.push(`${shortLiftName(data.session.leadLift.name)} ${data.session.leadLift.kg} kg`)
  } else {
    glanceParts.push(`${data.session.exerciseCount} exercise${data.session.exerciseCount === 1 ? '' : 's'}`)
    if (data.session.estimatedMinutes != null) glanceParts.push(`~${data.session.estimatedMinutes} min`)
    if (data.session.leadLift) glanceParts.push(`${shortLiftName(data.session.leadLift.name)} from ${data.session.leadLift.kg} kg`)
  }
  const sessionGlance = glanceParts.join(' · ')

  const replyChips = chipsForTip(data.coachTipKey)

  // Three tiles, one shape. Water is --chart-3 here exactly as it is on
  // Nutrition: mint means "on track", and water is a fill, not a verdict.
  // Each tile carries its own destination now. Two of the three still lead to
  // Nutrition; steps leads to Exercise, because that is where it is logged and
  // a pointer that lands on the wrong tab is worse than no pointer.
  const homeTiles: { value: string; label: string; sub: string; pct: number; tint?: string; tab: 'nutrition' | 'exercise' }[] = [
    {
      value: Math.round(data.caloriesEaten).toLocaleString(),
      label: 'kcal',
      sub: data.hasNutritionTargets ? `of ${Math.round(data.caloriesTarget).toLocaleString()}` : 'no target yet',
      pct: data.hasNutritionTargets && data.caloriesTarget > 0 ? Math.min(1, data.caloriesEaten / data.caloriesTarget) : 0,
      tab: 'nutrition',
    },
    {
      value: (data.waterMl / 1000).toFixed(1),
      label: 'litres',
      sub: `of ${(data.waterTargetMl / 1000).toFixed(1)}`,
      pct: data.waterTargetMl > 0 ? Math.min(1, data.waterMl / data.waterTargetMl) : 0,
      tint: 'var(--chart-3)',
      tab: 'nutrition',
    },
    {
      value: (steps?.steps ?? 0).toLocaleString(),
      label: 'steps',
      sub: `of ${stepsTarget.toLocaleString()}`,
      pct: stepsTarget > 0 ? Math.min(1, (steps?.steps ?? 0) / stepsTarget) : 0,
      tab: 'exercise',
    },
  ]

  return (
    // Density pass 3a "Borderless": no cards. Sections separate by the
    // uppercase micro-label + generous whitespace; the hero and the numbers
    // read as distinct units through fill, type scale and halo alone. The two
    // ambient radial washes sit behind everything (pointer-events-none) and
    // are what stop a fully borderless surface reading as flat.
    <div className="relative -mx-1 px-1">
      {/* -12px, not inset-x-0: this sits inside <main>'s px-4 and a -mx-1
          wrapper, so its padding box stops 12px short of the screen on each
          side. inset-x-0 left a visibly textured panel with plain background
          either side of it — the wash and the grain are meant to be the page,
          not a rectangle on it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 h-[420px]"
        style={{
          left: -12,
          right: -12,
          background:
            'radial-gradient(120% 60% at 50% 0%, var(--hero-wash) 0%, transparent 60%), radial-gradient(90% 40% at 20% 42%, rgba(var(--glow-rgb),.10) 0%, transparent 70%)',
        }}
      />
      {/* Turn 4: a near-invisible grain texture over the whole hero surface. */}
      <div className="grain-overlay" aria-hidden style={{ left: -12, right: -12 }} />

      <div className="relative">
        {/* 1. DATE + STREAK. The day name only — the week number moved to the
            strip label below, which is now the one place on Home it appears.
            The streak is a chip rather than a 26px number over an 8.5px
            label: at that size the label was unreadable and the number read
            as the page's headline, which it is not. */}
        <div className="flex items-start justify-between gap-3">
          <span className="pt-1 ds-label">{data.dayName}</span>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: 'var(--surface-raised)' }}
          >
            <span aria-hidden className={`inline-block size-[5px] rounded-full ${data.streak > 0 ? 'bg-primary' : 'bg-[color:var(--text-dim)]'}`} />
            <span className="tabular-mono text-[0.8125rem] font-semibold">{data.streak}</span>
            <span className="text-[0.6875rem] text-muted-foreground">day{data.streak === 1 ? '' : 's'} streak</span>
          </span>
        </div>

        {/* 2 + 3. WEEK STRIP, with a label above it. Seven glyphs as the first
            thing on the page read as a date picker; naming them is what makes
            them a record. This is Home's copy of the strip — read-only. The
            interactive one lives on Exercise; see HomeWeekStrip. */}
        {week.days.length > 0 && (
          <div className="mt-4">
            <p className="ds-label">
              {data.phase ? `Week ${data.phase.weekNumber} of ${data.phase.totalWeeks} · ` : ''}
              {week.sessionsDone} of {week.sessionsPlanned} session{week.sessionsPlanned === 1 ? '' : 's'} done
            </p>
            <div className="mt-2">
              <HomeWeekStrip days={week.days} todayName={data.dayName} />
              <HomeWeekStripLabels days={week.days} />
            </div>
          </div>
        )}

        {/* 4. HERO — focus, one glance line, CTA. No tomorrow line: Home
            answers what is next TODAY, and tomorrow is on Exercise's strip. */}
        <div data-tour="hero" className="relative mt-5 pt-1">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-8 -top-10 size-[200px] rounded-full"
            style={{ background: 'radial-gradient(circle, var(--hero-wash) 0%, transparent 70%)' }}
          />
          {data.session.status === 'rest' ? (
            <div className="relative space-y-1">
              <p className="text-[1.5625rem] font-bold tracking-[-.02em] glow-text">Rest day</p>
              <p className="text-[0.78125rem] text-muted-foreground">Nothing planned today — recovery is part of the program.</p>
            </div>
          ) : (
            <div className="relative space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  {/* NO glow-text HERE, deliberately. `truncate` sets
                      overflow:hidden, which clips glow-text's 26px text-shadow
                      flat at the element's box — so instead of a soft halo you
                      get a hard-edged lighter RECTANGLE behind the session
                      name, which is what Ashley photographed. The glow is
                      emphasis; clipped, it is worse than none. Every other
                      glow-text in the app is on non-truncating text. */}
                  <span className="text-[1.5625rem] font-bold tracking-[-.02em] min-w-0 truncate">{data.session.focus}</span>
                  {/* PROPOSAL 2 — the label goes in the NOT-STARTED case only,
                      where the button already says it. It stays for the other
                      two, because there it carries new information. */}
                  {data.session.status !== 'not_started' && (
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                      {data.session.status === 'in_progress' ? `${data.session.setsLogged} of ${data.session.setsPlanned} sets` : 'Done'}
                    </span>
                  )}
                </div>
                {/* PROPOSAL 3 — the session at a glance, replacing three
                    truncated names of six. Every figure was already in the
                    plan; none of it was on screen. */}
                <p className="mt-1.5 text-[0.78125rem] text-muted-foreground">{sessionGlance}</p>
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
        </div>

        {/* 5. COACH BUBBLE — the tip and what is still outstanding in ONE
            block, because they are both the coach talking. The avatar does
            the work the amber dot and the lightning emoji used to do
            separately, and matches the avatar in chat so the voice is
            recognisably the same one. */}
        {(data.coachTip || data.whatsLeftLine) && (
          <div className="mt-5 flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-[1px] flex size-[26px] shrink-0 items-center justify-center rounded-full"
              style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' }}
            >
              <MessageCircle className="size-3.5" style={{ color: 'var(--primary-foreground)' }} />
            </span>
            <div className="min-w-0 flex-1">
              {data.coachTip && <p className="text-[0.875rem] leading-[1.5]">{data.coachTip}</p>}
              {data.whatsLeftLine && (
                <p className={`text-[0.78125rem] leading-[1.5] text-[color:var(--role-warn-text)] ${data.coachTip ? 'mt-1' : ''}`}>
                  {data.whatsLeftLine}
                </p>
              )}
              {replyChips.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {replyChips.map(chip => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => { setChatPrefill(chip.prefill); window.location.hash = tabHash('chat') }}
                      className="inline-flex min-h-[34px] items-center rounded-full px-3 text-[0.75rem]"
                      style={{ background: 'var(--accent)' }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. PROGRESS — the consistency figure rides on the heading rather
            than sitting on its own line below the numbers it summarises. */}
        <div className="mt-9 flex items-baseline justify-between gap-3">
          <p className="ds-label">Progress</p>
          {data.consistency && (
            <span className="tabular-mono text-[0.6875rem] text-muted-foreground">
              <span className="font-semibold text-primary">{data.consistency.percent}%</span> consistent
            </span>
          )}
        </div>
        {data.weightTrend ? (
          <div className="mt-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="ds-num-tile tabular-mono glow-mint-lg">
              {data.weightTrend.rollingAvgKg.toFixed(1)}<span className="text-[0.9375rem] font-medium text-muted-foreground [text-shadow:none]"> kg</span>
            </span>
            {data.weightTrend.ratePerWeekKg != null && (
              <span className={`text-[0.8125rem] ${data.weightTrend.ratePerWeekKg < 0 ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
                {data.weightTrend.ratePerWeekKg > 0 ? '+' : ''}{data.weightTrend.ratePerWeekKg.toFixed(1)} kg/wk
                {data.weightTrend.onTrackForGoal === true ? ' · on track' : data.weightTrend.onTrackForGoal === false ? ' · slower than target' : ''}
              </span>
            )}
            {/* SAYS WHAT THE BIG NUMBER IS. Ashley, 3 Sep 2026, from her own
                screen: she logged 85kg, saw 86.0, logged 85kg again and saw
                85.7, and reported the display as broken. It was not — the
                headline is the 7-day rolling average VISION-ARCHITECTURE.md
                §5.4 requires ("never a raw daily reading as the headline"),
                and her onboarding weight of 87 is one of the readings feeding
                it: (87+85)/2 = 86.0, then (87+85+85)/3 = 85.7. Both numbers
                she saw were exactly right.
                What was wrong is that NOTHING SAID SO, while the Weigh-in row
                a few centimetres below showed "85.0 kg today" — two different
                numbers for her weight on one screen, neither explaining
                itself. Reading that as a bug is the correct reading of what
                was on screen.
                Asked, with the alternative (show the raw reading instead) on
                the table; she chose to keep the smoothing and label it.
                Always rendered, never only on a thin sample: the confusion
                does not go away once there are three weigh-ins, and the
                sample caveat below is a SEPARATE thing (how much to trust it,
                not what it is). */}
            <span className="text-[0.6875rem] text-muted-foreground/70">7-day average</span>
            {data.weightTrend.sampleCount === 1 && (
              <span className="text-[0.6875rem] text-muted-foreground/70">(1 weigh-in — trend firms up with more)</span>
            )}
          </div>
        ) : (
          <p className="mt-3.5 text-xs text-muted-foreground">Log a weigh-in to see your trend here.</p>
        )}

        {data.weightSeries.length > 0 && (
          <>
            <WeighInTrendChart series={data.weightSeries} goalKg={data.weightGoalKg} />
            {/* PROPOSAL 7 — "6 weigh-ins" goes: the chart already shows six
                dots. It STAYS at one, where the app has to admit the trend
                is not real yet. */}
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-[0.6875rem] text-muted-foreground">
                {data.weightSeries.length === 1 ? '1 weigh-in so far' : ''}
              </span>
              {data.weightSeries.length > 1 && (
                <span className="text-[0.6875rem] font-semibold text-primary">
                  {(() => {
                    const delta = data.weightSeries[data.weightSeries.length - 1].kg - data.weightSeries[0].kg
                    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg since week 1`
                  })()}
                </span>
              )}
            </div>
          </>
        )}

        {data.recentPRs.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.recentPRs.map(pr => (
              <p key={pr.exerciseName} className="text-[0.8125rem]">
                {pr.exerciseName} <span className="font-semibold tabular-mono text-primary glow-mint">{pr.weightKg} kg</span>
                <span className="text-[0.6875rem] text-muted-foreground"> — new PR</span>
              </p>
            ))}
          </div>
        )}

        {/* 7. TODAY — three matching tiles, all of them POINTERS. One
            behaviour, one link, no logging. The calorie ring left with the
            logging: rings are Nutrition's language, so a tile can never be
            mistaken for the surface that owns the number. */}
        <div data-tour="tiles">
          <div className="mt-8 flex items-baseline justify-between gap-3">
            <p className="ds-label">Today</p>
            <button
              type="button"
              onClick={() => { window.location.hash = tabHash('nutrition') }}
              className="hit-slop-44 text-[0.6875rem] font-semibold text-primary"
            >
              Nutrition ›
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {homeTiles.map(tile => (
              <button
                key={tile.label}
                type="button"
                onClick={() => { window.location.hash = tabHash(tile.tab) }}
                className="rounded-[14px] px-3 py-3 text-left"
                style={{ background: 'var(--surface-raised)' }}
              >
                <p className="tabular-mono text-[1.125rem] font-semibold" style={tile.tint ? { color: tile.tint } : undefined}>{tile.value}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-[1.25] text-muted-foreground">
                  {tile.label}<br />{tile.sub}
                </p>
                <span className="mt-2 block h-[2px] w-full rounded-full" style={{ background: 'var(--hairline)' }}>
                  <span
                    className="block h-[2px] rounded-full"
                    style={{ width: `${Math.round(tile.pct * 100)}%`, background: tile.tint ?? 'var(--primary)' }}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 8. WEIGH-IN — one hairline row, and the only thing Home logs. The
            chart it feeds moved up into Progress, where the trend belongs. */}
        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--hairline)' }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.8125rem] text-text-tertiary">Weigh-in</span>
            {data.weightSeries.length > 0 && (
              <span className="text-[0.8125rem]">
                <span className="tabular-mono font-semibold">{data.weightSeries[data.weightSeries.length - 1].kg.toFixed(1)} kg</span>
                <span className="ml-1.5 text-muted-foreground">
                  {data.weightSeries[data.weightSeries.length - 1].date === data.today ? 'today ✓' : data.weightSeries[data.weightSeries.length - 1].date}
                </span>
              </span>
            )}
          </div>
          {profile.id && (
            <div className="mt-3">
              <WeighInCard profileId={profile.id} onWeightLogged={handleWeighInChanged} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
