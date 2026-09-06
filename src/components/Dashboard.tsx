// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — the daily home. Structure and data this round
// (per the request: "no colour/type/aesthetic decisions; a visual pass
// follows separately") — plain Card sections, house-voice empty states,
// no new visual language invented here.
// ---------------------------------------------------------------------------

import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getAppNow } from '@/lib/dev-clock'
import { tabHash } from '@/lib/app-route'
import { loadDashboardData, type DashboardData } from '@/lib/dashboard-data'
import { stepsTargetFor } from '@/lib/steps-target'
import { getStepsForDate, logStepsManual, isPlausibleStepCount, MAX_PLAUSIBLE_DAILY_STEPS, type DailyStepsRow } from '@/lib/steps-store'
import { logWater, undoLog, type WaterLogRow } from '@/lib/water-store'
import { Flame, Droplets, Footprints, Scale, ChevronRight } from 'lucide-react'
import { WeighInCard } from '@/components/WeighInCard'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { HomeWeekStrip, HomeWeekStripLabels } from '@/components/HomeWeekStrip'
import { setChatPrefill } from '@/lib/chat-prefill-store'
import { TrainerNudge, type TrainerNudgeProps } from '@/components/TrainerNudge'

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
  /** Bumped when the coach logs steps from chat, so the Steps cell re-reads rather than showing a stale count. */
  stepsVersion?: number
  /** Fired after steps are logged here, so chat's context is not a version behind. */
  onStepsLogged?: () => void
  /**
   * The first adaptation message, already shaped into a nudge by App.tsx —
   * the line that used to be an InsightBanner tone="ai" stacked above every
   * tab. Absent when there is none, and Home falls through to its own coach
   * tip. See TrainerNudge and design_handoff_app_polish.
   */
  trainerNudge?: TrainerNudgeProps | null
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

export function Dashboard({ profile, macros, exercisePlan, mesocycle, planCreatedAt, onWeightLogged, logsVersion, trainerNudge, stepsVersion, onStepsLogged }: DashboardProps) {
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

  // WATER AND STEPS ARE LOGGED HERE NOW — design_handoff_app_polish, the
  // "Today so far" grid. Both keep their store as the owner of the number:
  // water-store and steps-store are called directly and their synchronous
  // return is what moves the figure on screen, so a green tick never waits on
  // a promise (VISION-ARCHITECTURE §3.4). The local mirrors below exist only
  // so the cell updates without re-running the whole dashboard load; they are
  // re-synced from `data` whenever it reloads.
  const [waterMl, setWaterMl] = useState<number | null>(null)
  const [lastWaterLog, setLastWaterLog] = useState<WaterLogRow | null>(null)
  const [waterError, setWaterError] = useState<string | null>(null)
  const [stepsInput, setStepsInput] = useState('')
  const [stepsOpen, setStepsOpen] = useState(false)
  const [stepsError, setStepsError] = useState<string | null>(null)
  const [weighInOpen, setWeighInOpen] = useState(false)

  const handleAddWater = (amountMl: number) => {
    if (!profile.id || !activeSession.date) return
    try {
      const row = logWater({ profileId: profile.id, date: activeSession.date, amountMl, source: 'manual' })
      setWaterMl(ml => (ml ?? 0) + amountMl)
      setLastWaterLog(row)
      setWaterError(null)
      // Six seconds, matching the undo window the Nutrition row already uses.
      window.setTimeout(() => setLastWaterLog(cur => (cur === row ? null : cur)), 6000)
    } catch (err) {
      console.error('Logging water failed:', err)
      setWaterError("That didn't save — check your connection and tap again.")
    }
  }

  const handleUndoWater = () => {
    if (!lastWaterLog) return
    undoLog(lastWaterLog)
    setWaterMl(ml => Math.max(0, (ml ?? 0) - lastWaterLog.amount_ml))
    setLastWaterLog(null)
  }

  /**
   * The same guard the Exercise row applied, moved with the input: the write
   * REPLACES the day rather than adding to it, so a mistyped 900000 does not
   * sit alongside a real number — it becomes the number.
   */
  const handleLogSteps = async () => {
    const n = Number(stepsInput)
    if (!profile.id || !activeSession.date || !Number.isFinite(n) || n < 0) return
    const rounded = Math.round(n)
    if (!isPlausibleStepCount(rounded)) {
      setStepsError(`That's more steps than anyone walks in a day — the most this takes is ${MAX_PLAUSIBLE_DAILY_STEPS.toLocaleString()}.`)
      return
    }
    try {
      setSteps(await logStepsManual(profile.id, activeSession.date, rounded))
      setStepsInput('')
      setStepsOpen(false)
      setStepsError(null)
      onStepsLogged?.()
    } catch (err) {
      console.error('Logging steps failed:', err)
      // The typed number is deliberately kept: making them retype it would be
      // the second small unkindness after losing it the first time.
      setStepsError("Couldn't save your steps — check your connection and tap Log again.")
    }
  }

  const handleWeighInChanged = async () => {
    setWeighInVersion(v => v + 1)
    await onWeightLogged?.()
  }

  useEffect(() => {
    if (!profile.id) return
    void getStepsForDate(profile.id, activeSession.date || '').then(setSteps).catch(() => setSteps(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, activeSession.date, stepsVersion])

  // The mirror follows the fetched figure, never the other way round.
  useEffect(() => { if (data) setWaterMl(data.waterMl) }, [data])

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

  // The nudge's line, in the handoff's stated order: an adaptation message
  // that wants an answer, else the coach tip, else nothing. Never filler.
  const homeNudge: TrainerNudgeProps | null = trainerNudge
    ?? ((data.coachTip || data.whatsLeftLine)
      ? {
          openChat: true,
          text: (
            <>
              {data.coachTip}
              {data.whatsLeftLine && (
                <span className={`block text-[0.78125rem] text-[color:var(--role-warn-text)] ${data.coachTip ? 'mt-1' : ''}`}>
                  {data.whatsLeftLine}
                </span>
              )}
            </>
          ),
        }
      : null)

  // The greeting's period comes from the app's own clock (dev-clock), the
  // same one every date on this screen already uses, so a shifted dev day
  // greets you for the day it is pretending to be.
  const greetingHour = getAppNow(profile.id).getHours()
  const greetingPeriod = greetingHour < 12 ? 'Morning' : greetingHour < 18 ? 'Afternoon' : 'Evening'
  const firstName = (profile.display_name ?? '').trim().split(/\s+/)[0]
  const greeting = firstName ? `${greetingPeriod}, ${firstName}` : greetingPeriod
  const dateLabel = data.phase
    ? `${data.dayName} · Week ${data.phase.weekNumber} of ${data.phase.totalWeeks}`
    : data.dayName

  const stepsToday = steps?.steps ?? 0
  const waterShown = waterMl ?? data.waterMl
  const lastWeighIn = data.weightSeries.length > 0 ? data.weightSeries[data.weightSeries.length - 1] : null
  const weightDeltaKg = data.weightSeries.length > 1
    ? data.weightSeries[data.weightSeries.length - 1].kg - data.weightSeries[0].kg
    : null
  // Hairline cell geometry, written once: the grid opens with a border-top,
  // the left column carries the vertical rule, the top row the horizontal one.
  const cellStyle = (col: 0 | 1, row: 0 | 1): CSSProperties => ({
    padding: '14px 0',
    paddingLeft: col === 1 ? 14 : 0,
    paddingRight: col === 0 ? 14 : 0,
    borderRight: col === 0 ? '1px solid var(--hairline)' : undefined,
    borderBottom: row === 0 ? '1px solid var(--hairline)' : undefined,
  })

  return (
    // design_handoff_app_polish, direction 1a: one column, no boxes. Sections
    // are a .ds-label plus hairline-separated rows; the only filled things
    // left on this screen are the nudge, the CTA and the Tomorrow row.
    // The two ambient radial washes and the grain overlay are GONE with the
    // cards — a borderless page does not need a textured panel behind it, and
    // test:hero-surface §2 (which pinned their -12px geometry) moved to
    // pinning their absence.
    <div className="relative -mx-1 px-1">
      <div className="relative flex flex-col gap-[26px]">
        {/* 1. WHO AND WHEN. The greeting is the page's headline; the streak is
            a chip beside it, not a competing number. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ds-label">{dateLabel}</p>
            <h2 className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">{greeting}</h2>
          </div>
          <span
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: 'var(--surface-raised)' }}
          >
            <span aria-hidden className={`inline-block size-[5px] rounded-full ${data.streak > 0 ? 'bg-primary' : 'bg-[color:var(--text-dim)]'}`} />
            <span className="tabular-mono text-[0.8125rem] font-semibold">{data.streak}</span>
            <span className="text-[0.6875rem] text-muted-foreground">day{data.streak === 1 ? '' : 's'} streak</span>
          </span>
        </div>

        {/* 2. THE TRAINER'S LINE — see TrainerNudge. First an adaptation
            message that needs an answer, then the coach tip, then nothing.
            The reply chips are keyed to the tip and stay under it. */}
        {homeNudge && (
          <div>
            <TrainerNudge {...homeNudge} />
            {!trainerNudge && replyChips.length > 0 && (
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
        )}

        {/* 3. TODAY'S SESSION — label, focus, one glance line, CTA, then the
            week strip UNDER the button. The strip's own label row is dropped:
            the header above already says which week this is. */}
        <div data-tour="hero">
          <div className="flex items-baseline justify-between gap-3">
            <p className="ds-label">Today&apos;s session</p>
            {data.session.status !== 'rest' && data.session.estimatedMinutes != null && (
              <span className="text-[0.6875rem] text-muted-foreground">~{data.session.estimatedMinutes} min</span>
            )}
          </div>

          {data.session.status === 'rest' ? (
            <>
              {/* NO truncate, so the glow is not clipped — the handoff calls
                  this out and the old comment here explained why: overflow
                  hidden cuts glow-text's halo into a hard rectangle. A long
                  focus name wraps now instead. */}
              <p className="mt-1.5 text-[1.5625rem] font-bold tracking-[-.02em] glow-text">Rest day</p>
              <p className="mt-1.5 text-[0.78125rem] text-muted-foreground">
                Recovery is part of the program · {week.sessionsDone} of {week.sessionsPlanned} session{week.sessionsPlanned === 1 ? '' : 's'} done
              </p>
            </>
          ) : (
            <>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[1.5625rem] font-bold tracking-[-.02em] glow-text">{data.session.focus}</span>
                {data.session.status !== 'not_started' && (
                  <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                    {data.session.status === 'in_progress' ? `${data.session.setsLogged} of ${data.session.setsPlanned} sets` : 'Done'}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[0.78125rem] text-muted-foreground">{sessionGlance}</p>
              {data.session.status !== 'done' && (
                <Button
                  size="cta"
                  className="mt-3.5 w-full glow-bloom-once"
                  style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white) 0%, var(--primary) 55%, var(--primary-2) 100%)' }}
                  onClick={() => { window.location.hash = tabHash('exercise') }}
                >
                  {data.session.status === 'not_started' ? 'Start session' : 'Continue session'}
                </Button>
              )}
            </>
          )}

          {week.days.length > 0 && (
            <div className="mt-3.5">
              <HomeWeekStrip days={week.days} todayName={data.dayName} />
              <HomeWeekStripLabels days={week.days} />
            </div>
          )}
        </div>

        {/* 4. TODAY SO FAR — four facts on hairlines, not tiles. Calories are
            read-only and point at the tab that owns them; the other three are
            logged here. Every write goes straight to its store and the number
            moves from the store's own synchronous return. */}
        <div data-tour="tiles">
          <p className="ds-label">Today so far</p>
          <div className="mt-1.5 grid grid-cols-2" style={{ borderTop: '1px solid var(--hairline)' }}>
            {/* Calories — a pointer, exactly as before. */}
            <button
              type="button"
              onClick={() => { window.location.hash = tabHash('nutrition') }}
              className="text-left"
              style={cellStyle(0, 0)}
            >
              <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <Flame className="size-3" aria-hidden /> Calories
              </span>
              <span className="mt-1 block tabular-mono text-[1.375rem] font-bold leading-none">
                {Math.round(data.caloriesEaten).toLocaleString()}
                <span className="ml-1 text-[0.6875rem] font-medium text-muted-foreground">
                  {data.hasNutritionTargets ? `/ ${Math.round(data.caloriesTarget).toLocaleString()}` : 'no target yet'}
                </span>
              </span>
              <span className="mt-2 block h-[2px] w-full rounded-full" style={{ background: 'var(--hairline)' }}>
                <span
                  className="block h-[2px] rounded-full"
                  style={{
                    width: `${Math.round((data.hasNutritionTargets && data.caloriesTarget > 0 ? Math.min(1, data.caloriesEaten / data.caloriesTarget) : 0) * 100)}%`,
                    background: 'var(--primary)',
                  }}
                />
              </span>
            </button>

            {/* Water — quick-add, with the undo the Nutrition row already has. */}
            <div style={cellStyle(1, 0)}>
              <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <Droplets className="size-3" aria-hidden /> Water
              </span>
              <span className="mt-1 block tabular-mono text-[1.375rem] font-bold leading-none" style={{ color: 'var(--chart-3)' }}>
                {waterShown.toLocaleString()}
                <span className="ml-1 text-[0.6875rem] font-medium text-muted-foreground">/ {data.waterTargetMl.toLocaleString()} ml</span>
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                {[250, 500].map(ml => (
                  <button
                    key={ml}
                    type="button"
                    onClick={() => handleAddWater(ml)}
                    className="hit-slop-44 rounded-full px-2 py-1 text-[0.6875rem] font-semibold"
                    style={{ background: 'color-mix(in oklab, var(--chart-3) 15%, transparent)', color: 'var(--chart-3)' }}
                  >
                    +{ml}
                  </button>
                ))}
                {lastWaterLog && (
                  <button
                    type="button"
                    onClick={handleUndoWater}
                    className="hit-slop-44 rounded-full px-2 py-1 text-[0.6875rem] text-muted-foreground"
                  >
                    undo
                  </button>
                )}
              </span>
              {waterError && <span className="mt-1 block text-[0.6875rem] text-[color:var(--role-warn-text)]">{waterError}</span>}
            </div>

            {/* Steps — the inline input opens in place. */}
            <div style={cellStyle(0, 1)}>
              <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <Footprints className="size-3" aria-hidden /> Steps
              </span>
              <span className="mt-1 block tabular-mono text-[1.375rem] font-bold leading-none">
                {stepsToday.toLocaleString()}
                <span className="ml-1 text-[0.6875rem] font-medium text-muted-foreground">/ {stepsTarget.toLocaleString()}</span>
              </span>
              {stepsOpen ? (
                <span className="mt-2 flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    autoFocus
                    value={stepsInput}
                    onChange={e => setStepsInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleLogSteps() }}
                    placeholder={String(stepsToday || '')}
                    aria-label="Steps today"
                    className="h-8 w-[4.5rem] rounded-[9px] px-2 text-[0.75rem] tabular-mono"
                    style={{ background: 'var(--surface-raised)' }}
                  />
                  <button type="button" onClick={() => void handleLogSteps()} className="hit-slop-44 text-[0.6875rem] font-semibold text-primary-text">
                    Log
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setStepsOpen(true)}
                  className="hit-slop-44 mt-2 block text-[0.6875rem] font-semibold text-primary-text"
                >
                  Log ›
                </button>
              )}
              {/* WHERE THE TARGET COMES FROM, kept from the row this cell
                  replaced: the step target is derived from the same
                  activity_level the calorie target's PAL multiplier uses
                  (steps-target.ts), and that is not guessable from a number
                  on a tile. Shown while the input is open — the moment it is
                  relevant — rather than taking a permanent line. */}
              {stepsOpen && (
                <span className="mt-1.5 block text-[0.625rem] leading-[1.35] text-muted-foreground/80">
                  Target from the activity level your calorie target uses — override it in your profile.
                </span>
              )}
              {stepsError && <span className="mt-1 block text-[0.6875rem] text-[color:var(--role-warn-text)]">{stepsError}</span>}
            </div>

            {/* Weight — the weigh-in input opens under the grid, unchanged. */}
            <div style={cellStyle(1, 1)}>
              <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <Scale className="size-3" aria-hidden /> Weight
              </span>
              <button
                type="button"
                onClick={() => setWeighInOpen(o => !o)}
                className="mt-1 block text-left"
                aria-expanded={weighInOpen}
              >
                <span className="block tabular-mono text-[1.375rem] font-bold leading-none">
                  {lastWeighIn ? lastWeighIn.kg.toFixed(1) : '—'}
                  <span className="ml-1 text-[0.6875rem] font-medium text-muted-foreground">
                    {lastWeighIn ? `kg · ${lastWeighIn.date === data.today ? 'today ✓' : lastWeighIn.date}` : 'log one'}
                  </span>
                </span>
              </button>
              {weightDeltaKg != null && (
                <span className="mt-2 block text-[0.6875rem] font-semibold text-primary-text">
                  {weightDeltaKg > 0 ? '+' : ''}{weightDeltaKg.toFixed(1)} kg since week 1
                </span>
              )}
            </div>
          </div>
          {weighInOpen && profile.id && (
            <div className="mt-3">
              <WeighInCard profileId={profile.id} onWeightLogged={handleWeighInChanged} />
            </div>
          )}
        </div>

        {/* 5. WEIGHT TREND. The rolling-average "Progress" block is gone: its
            number is the Weight cell above, and the shape of the change is
            this chart. */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="ds-label">Weight trend</p>
            {data.weightGoalKg != null && (
              <span className="text-[0.6875rem] text-muted-foreground">goal {data.weightGoalKg} kg</span>
            )}
          </div>
          {data.weightSeries.length > 0 ? (
            <WeighInTrendChart series={data.weightSeries} goalKg={data.weightGoalKg} />
          ) : (
            <p className="mt-2.5 text-xs text-muted-foreground">Log a weigh-in to see your trend here.</p>
          )}
          {data.weightSeries.length === 1 && (
            <p className="mt-1.5 text-[0.6875rem] text-muted-foreground/70">1 weigh-in so far — the trend firms up with more.</p>
          )}
        </div>

        {/* 6. RECENT PRs — up to three, and the section is not there at all
            when there are none. */}
        {data.recentPRs.length > 0 && (
          <div>
            <p className="ds-label">Recent PRs</p>
            <div className="mt-1.5" style={{ borderTop: '1px solid var(--hairline)' }}>
              {data.recentPRs.slice(0, 3).map(pr => (
                <div
                  key={pr.exerciseName}
                  className="flex items-baseline justify-between gap-3 py-3"
                  style={{ borderBottom: '1px solid var(--hairline)' }}
                >
                  <span className="min-w-0 truncate text-[0.8125rem]">{pr.exerciseName}</span>
                  {/* The prototype shows "60 kg × 9". RecentPR carries no rep
                      count (dashboard-data.ts), and a rep number nobody
                      recorded would be an invention — the weight alone. */}
                  <span className="shrink-0 tabular-mono text-[0.8125rem] font-semibold text-primary-text">
                    {pr.weightKg} kg
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. TOMORROW — the one filled row on the page. */}
        <button
          type="button"
          onClick={() => { window.location.hash = tabHash('exercise') }}
          className="flex w-full items-center justify-between gap-3 rounded-[14px] px-3.5 py-3 text-left"
          style={{ background: 'var(--surface-raised)' }}
        >
          <span className="min-w-0">
            <span className="block text-[0.6875rem] text-muted-foreground">Tomorrow</span>
            <span className="mt-0.5 block truncate text-[0.84375rem] font-medium">
              {data.tomorrowLabel.replace(/^Tomorrow:\s*/, '')}
            </span>
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </div>
    </div>
  )
}
