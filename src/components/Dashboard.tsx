// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — the daily home. Structure and data this round
// (per the request: "no colour/type/aesthetic decisions; a visual pass
// follows separately") — plain Card sections, house-voice empty states,
// no new visual language invented here.
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getAppNow } from '@/lib/dev-clock'
import { tabHash } from '@/lib/app-route'
import { loadDashboardData, leadLiftPhrase, LIFT_SHORT_NAME, type DashboardData } from '@/lib/dashboard-data'
import { changeSinceStart } from '@/lib/weight-trend'
import { momentFactsFrom, sendFactsAhead } from '@/lib/moment-facts'
import { loadDashboardCache, saveDashboardCache } from '@/lib/dashboard-cache'
import { stepsTargetFor } from '@/lib/steps-target'
import { getStepsForDate, logStepsManual, isPlausibleStepCount, MAX_PLAUSIBLE_DAILY_STEPS, type DailyStepsRow } from '@/lib/steps-store'
import { logWater, undoLog, type WaterLogRow } from '@/lib/water-store'
import { getLedgerSnapshot, subscribeMealStore } from '@/lib/meal-store'
import { Flame, Droplets, Footprints, Beef, Trophy } from 'lucide-react'
import { WeighInCard } from '@/components/WeighInCard'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { HomeWeekStrip } from '@/components/HomeWeekStrip'
import { TrainerNudge, type TrainerNudgeProps } from '@/components/TrainerNudge'
import { sessionSetCount } from '@/lib/session-count'
import { readSessionSummary } from '@/lib/session-summary-store'
import { readingFor } from '@/lib/pr-engine'
import { dayNameOf } from '@/lib/session-move'
const SessionSummaryDialog = lazy(() => import('@/components/exercise/SessionSummaryDialog').then(m => ({ default: m.SessionSummaryDialog })))
import { ShopDayCard } from '@/components/ShopDayCard'
import { personalBest, bestReadingOf, streakLabel } from '@/lib/coach-voice'
import { useCardioLogsToday } from '@/components/exercise/CardioSetRow'
import { cardioLine } from '@/lib/cardio-lines'

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
  // 40px tall since design handoff 2a (was 60): the line inside a 6-32 band.
  const width = 320
  const height = 40
  const topY = 6
  const bottomY = 32
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
          <text x={width} y={Math.max(7, goalY - 3)} textAnchor="end" fontSize="7" fill="var(--role-warn, #FFB454)" opacity="0.85">goal</text>
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
 * The day's macro figures re-derived from the meal store's own snapshot.
 *
 * Returns the input untouched when there is nothing to say — no data yet, or
 * the store has not heard from the server for this day, in which case
 * inventing "nothing eaten" would be worse than a stale number.
 */
function withMealSnapshot(d: DashboardData | null, profileId: string | undefined, date: string | undefined): DashboardData | null {
  if (!d || !profileId || !date) return d
  const snap = getLedgerSnapshot(profileId, date)
  if (!snap) return d
  return {
    ...d,
    caloriesEaten: snap.eaten.kcal,
    proteinEaten: snap.eaten.protein,
    carbsEaten: snap.eaten.carbs,
    fatEaten: snap.eaten.fat,
  }
}

export function Dashboard({ profile, macros, exercisePlan, mesocycle, planCreatedAt, onWeightLogged, logsVersion, trainerNudge, stepsVersion, onStepsLogged }: DashboardProps) {
  const stepsTarget = stepsTargetFor(profile)
  const activeSession = useActiveSession()
  // LAST KNOWN HOME, PAINTED IMMEDIATELY. Every tab but chat unmounts when you
  // leave it, so coming back re-runs the whole aggregate — and until it lands
  // there was one line of grey text where the screen should be. The snapshot
  // is read synchronously here, the way ChatAssistant reads its own cache, so
  // the first frame after a tab switch already has yesterday's — properly,
  // this morning's — numbers on it.
  //
  // It does NOT skip the fetch. See dashboard-cache.ts: the effect below runs
  // unconditionally and swaps the fresh data in, so the stale window is no
  // longer than the blank window it replaces.
  //
  // AND THE CACHED CALORIES ARE CORRECTED ON THE WAY IN. The cache is written
  // by this screen; a meal logged on the Nutrition tab happens while this
  // screen is unmounted, so nothing here was around to update it. Home then
  // opened on the pre-meal figure and sat on it for the length of its own
  // load — showing a wrong number rather than a missing one, which is worse.
  // withMealSnapshot re-derives that one figure from what the meal store
  // already knows, with no request.
  const [data, setData] = useState<DashboardData | null>(
    () => withMealSnapshot(loadDashboardCache(profile.id, activeSession.date), profile.id, activeSession.date),
  )
  const [loading, setLoading] = useState(true)

  const [steps, setSteps] = useState<DailyStepsRow | null>(null)

  // Home's copy of the week — the RECORD. Exercise's strip is the navigator
  // and owns tap-to-peek; the two share only the glyph vocabulary.
  const week = useTrainingWeek(profile.id, activeSession.date, exercisePlan ?? [], planCreatedAt, logsVersion)
  const cardioToday = useCardioLogsToday()

  // Bumped after a weigh-in save (from WeighInCard here, or a goal-weight
  // set) so the effect below re-fetches — nothing else that changes when a
  // weight is logged (session logs, date) already triggers this effect, and
  // a chat-side log_weight only refreshes App.tsx's own latestWeightKg, not
  // this component's independently-fetched weightSeries/weightTrend/goal.
  // A STRING, not the array: week.moves is a fresh array every render, and an
  // array in the dependency list below would re-run the whole aggregate on
  // every one of them. This changes only when a move actually does.
  const movesKey = week.moves.map(m => `${m.fromDate}>${m.toDate}`).join('|')
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
      profile, macros, exercisePlan, mesocycle, planCreatedAt, moves: week.moves,
      todayLogs: activeSession.logs, liveWeek: activeSession.liveWeek,
      dayName: activeSession.dayName, todayStr: activeSession.date,
      now: getAppNow(profile.id),
    })
      .then(d => {
        if (cancelled) return
        // Through the snapshot as well: this promise was started before any
        // meal logged while it was in flight, so its ledger half can already
        // be out of date by the time it resolves.
        const fresh = withMealSnapshot(d, profile.id, activeSession.date) ?? d
        setData(fresh)
        setLoadError(false)
        // NOT CACHED WHEN THE PLAN WAS ABSENT. `data` initialises from this
        // cache, so a day derived from an empty plan would be the FIRST thing
        // the next cold open draws — the wrong answer, instantly, with no
        // network to blame. A day we could not compute is not a day worth
        // remembering; the re-run below replaces it within the same visit.
        if (fresh.session.status !== 'unknown') saveDashboardCache(profile.id, activeSession.date, fresh)
        // THE COACH, WHEN THE APP IS SHUT, needs the few facts only the plan
        // engine knows — sent from here because Home is where the streak is
        // counted and the default tab everyone opens. Same guard as the cache:
        // a day computed without a plan is not worth telling anyone about.
        // Deduped inside, so a re-render sends nothing new.
        if (fresh.session.status !== 'unknown' && exercisePlan?.length && profile.id) {
          void sendFactsAhead(profile.id, momentFactsFrom({
            exercisePlan, mesocycle: mesocycle ?? [], planCreatedAt,
            now: getAppNow(profile.id), streakDays: fresh.streak, today: activeSession.date,
          }))
        }
      })
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
    // exercisePlan AND mesocycle ARE DEPENDENCIES. They were not, and that is
    // what made the wrong answer permanent rather than momentary: the effect
    // ran once at mount with [] for both, decided a rest day, and had no
    // reason to look again when the plan landed a second later. Home then sat
    // on "Rest day" beside its own week strip showing four sessions. Both are
    // App.tsx useState arrays, so the identity is stable and this re-runs when
    // the plan actually changes, not on every render.
  }, [activeSession.ready, activeSession.date, activeSession.logs.length, profile.id, weighInVersion, macros, retryVersion, exercisePlan, mesocycle, movesKey])

  // THE CALORIE CELL FOLLOWS THE MEAL LIST ON THE OTHER TAB.
  //
  // It had no subscription at all: its number comes from loadDashboardData,
  // whose effect depends on the date, the profile, the logged sets and the
  // macros — none of which change when a meal is logged. Leaving Home and
  // coming back re-mounts this component and so did eventually correct it,
  // but only after another await on the network, and the cached figure it
  // renders first is the pre-meal one. Ashley, 8 Sep 2026: the counter needed
  // an app restart. The snapshot is the store's own totals with no request,
  // so this cell moves the moment a meal is logged anywhere in the app —
  // including from the coach.
  //
  // PATCHED, NOT RELOADED: `data` carries the whole day (session, streak,
  // PRs, weight trend) and none of that changed because a meal did. Re-running
  // the full load here would be several queries to move one number.
  useEffect(() => subscribeMealStore(() => {
    if (!profile.id || !activeSession.date) return
    setData(prev => {
      const next = withMealSnapshot(prev, profile.id, activeSession.date)
      // The cache is what this screen renders on its next cold open, so it
      // carries the correction too.
      if (next && next !== prev) saveDashboardCache(profile.id, activeSession.date, next)
      return next
    })
  }), [profile.id, activeSession.date])

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
  const [summaryOpen, setSummaryOpen] = useState(false)

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

  // `loading` is deliberately NOT in this condition. It is true on every mount
  // while the aggregate re-reads, and gating the render on it meant a
  // last-known snapshot could never be shown — the cache would exist and the
  // screen would still be blank. What decides whether there is something to
  // draw is whether there is data, from wherever it came.
  if (!activeSession.ready || !data) {
    return (
      <div className="rounded-xl bg-card py-12 text-center text-sm text-muted-foreground">Loading your day…</div>
    )
  }

  // THE TRAINER'S NOTE — design handoff 2a. An adaptation message wants an
  // answer, so it is shown ALONE and never rotates away mid-read. Otherwise
  // every tip true today, the day's pick first, then what is still left today.
  // THE BRIEF'S ORDER: the day's tip, then what is still left today, then the
  // other tips that are true.
  const allTips = (data.coachTips ?? (data.coachTip && data.coachTipKey ? [{ key: data.coachTipKey, text: data.coachTip }] : []))
    .map(t => ({ key: t.key, text: t.text, tag: tipTag(t.key), prefill: tipPrefill(t.key, t.text) }))
  const whatsLeftTip: HomeTip[] = data.whatsLeftLine
    ? [{ key: 'whats_left', text: capitalise(data.whatsLeftLine), tag: 'Today', prefill: 'What should I focus on for the rest of today?' }]
    : []
  const plainTips: HomeTip[] = [...allTips.slice(0, 1), ...whatsLeftTip, ...allTips.slice(1)]

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
  // FROM THE STARTING WEIGHT, not from the first of the fourteen rows the
  // chart holds — see changeSinceStart for the two ways that went wrong.
  const weightDeltaKg = changeSinceStart(data.startingWeightKg, data.weightSeries)

  // ONE COUNT FOR "DONE" (her M39 ruling): the shared capped count off the
  // week's own cell, the same one the strips and the coach read.
  const todayCell = week.days.find(d => d.date === data.today)
  const shared = sessionSetCount(todayCell?.session, todayCell?.workingLogs)
  const setsLogged = shared?.logged ?? data.session.setsLogged
  const setsPlanned = shared?.planned ?? data.session.setsPlanned
  const status = data.session.status
  const done = status === 'done'
  const card = done ? readSessionSummary(profile.id, data.today) : null
  // PRs: the finish card's own list when this phone has it (what she was told
  // at Finish), else today's records off the PR cache.
  const prCount = card ? card.prs.length : (data.prsToday ?? []).length
  const topPr: string | null = card && card.prs.length > 0
    ? personalBest(readingFor(card.prs[0].result))
    : (data.prsToday ?? []).length > 0 ? personalBest(bestReadingOf(data.prsToday[0].metric, data.prsToday[0].value)) : null
  const topPrLift = card && card.prs.length > 0 ? card.prs[0].exerciseName : (data.prsToday ?? [])[0]?.exerciseName ?? null
  const minutes = card?.summary.durationMinutes ?? data.sessionMinutes ?? null

  // THE GLANCE LINE — what is in it, the lead lift, and tomorrow (the old
  // Tomorrow row moved in here, 2a). Each part is dropped when unknown.
  const glanceParts: string[] = []
  if (status === 'in_progress' && data.session.minutesLeft != null) glanceParts.push(`~${data.session.minutesLeft} min left`)
  if (status !== 'in_progress') glanceParts.push(`${data.session.exerciseCount} exercise${data.session.exerciseCount === 1 ? '' : 's'}`)
  // DELIBERATE DEVIATION FROM THE HANDOFF, kept: no "next" — the app knows the
  // heaviest lift, not the running order.
  const lift = data.session.leadLift ? leadLiftPhrase(data.session.leadLift, status) : null
  if (lift) glanceParts.push(lift)
  const tomorrow = data.tomorrow ?? null
  if (tomorrow) glanceParts.push(tomorrow.rest ? 'rest tomorrow' : `${tomorrow.focus} tomorrow`)
  const sessionGlance = glanceParts.join(' · ')

  // THE LATEST PR for the weight panel's footer — the newest, not the biggest.
  const latestPr = [...data.recentPRs].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  const vol = data.volume ?? { thisWeek: 0, lastWeekSoFar: 0 }
  const volPct = vol.lastWeekSoFar > 0 ? Math.round(((vol.thisWeek - vol.lastWeekSoFar) / vol.lastWeekSoFar) * 100) : null

  const heroWash: CSSProperties = { background: 'radial-gradient(120% 90% at 100% 0%, var(--hero-wash), transparent 60%), var(--surface-raised)' }
  const weekRow = week.days.length > 0 && (
    <HomeWeekStrip days={week.days} todayName={data.dayName} done={week.sessionsDone} planned={week.sessionsPlanned} />
  )
  const cardioLines = cardioToday.length > 0 && (
    <div data-testid="home-cardio-today">
      {cardioToday.map(l => (
        <p key={l.clientId ?? l.id} className="text-[0.78125rem] text-muted-foreground">✓ {cardioLine(l)}</p>
      ))}
    </div>
  )

  return (
    // design handoff 2a, 10 Oct 2026: one column, side padding from the app
    // shell, 10px between blocks. Panels are filled again, by role: the hero,
    // the day so far and the weight each are one object.
    <div className="relative -mx-1 px-1">
      <div className="relative flex flex-col gap-2.5">
        {/* 1. WHO AND WHEN */}
        <div className="flex items-start justify-between gap-3 pb-1.5">
          <div className="min-w-0">
            <p className="ds-label">{dateLabel}</p>
            <h2 className="mt-1 text-[1.625rem] font-bold leading-[1.1] tracking-[-.03em]">{greeting}</h2>
          </div>
          <span
            className="mt-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5"
            style={{ background: 'var(--surface-raised)' }}
            data-testid="home-streak"
          >
            <span aria-hidden className={`inline-block size-[5px] rounded-full ${data.streak > 0 ? 'bg-primary glow-mint-box' : 'bg-[color:var(--text-dim)]'}`} />
            <span className="tabular-mono text-[0.8125rem] font-semibold">{data.streak}</span>
            {/* "sessions in a row", not the brief's "day streak": the streak
                counts sessions (test:history-streak). */}
            <span className="text-[0.6875rem] text-muted-foreground" data-testid="home-streak-label">{streakLabel(data.streak)}</span>
          </span>
        </div>

        {/* 2. THE TRAINER'S NOTE */}
        {trainerNudge
          ? <TrainerNudge {...trainerNudge} />
          : plainTips.length > 0 && <HomeCoachNote tips={plainTips} />}

        {/* SHOPPING, ON THE DAY SHE SHOPS — between the note and the hero. */}
        <ShopDayCard
          profileId={profile.id}
          exercisePlan={exercisePlan}
          todayName={activeSession.dayName}
          nowMs={Date.now()}
        />

        {/* 3. TODAY'S SESSION */}
        {done ? (
          <div
            data-tour="hero"
            data-home-hero="done"
            className="flex flex-col gap-3 rounded-[22px] px-[18px] py-4"
            style={prCount > 0
              ? { background: 'radial-gradient(120% 100% at 0% 0%, rgba(var(--glow-rgb), .18), transparent 60%), var(--surface-raised)', boxShadow: 'inset 0 0 0 1px rgba(var(--glow-rgb), .45), 0 0 calc(26px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .22)' }
              : { background: 'var(--surface-raised)' }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="glow-mint whitespace-nowrap text-[0.65625rem] font-semibold uppercase tracking-[.2em] text-primary-text">Done · {data.session.focus}</p>
              {card && (
                <button type="button" onClick={() => setSummaryOpen(true)} className="hit-slop-44 shrink-0 text-[0.6875rem] font-semibold text-text-tertiary" data-home-summary>
                  Summary ›
                </button>
              )}
            </div>
            {/* THE LIFT LINE SURVIVES THE FINISH (L9, 9 Oct 2026): "Romanian
                deadlifts 30kg per hand today" is what she lifted, and a done
                day is exactly when that is worth reading. The same glance
                line as before the session, now saying what was done. */}
            {sessionGlance && <p className="-mt-1.5 text-[0.78125rem] text-muted-foreground" data-testid="home-session-glance">{sessionGlance}</p>}
            {prCount > 0 && topPr && (
              <div className="flex items-center gap-3" data-home-pr>
                <span className="glow-mint-box flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(var(--glow-rgb), .16)', color: 'var(--primary-text)', '--glow-strength': 'calc(var(--glow-strength, 1) * .5)' } as CSSProperties}>
                  <Trophy className="glow-icon size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.6875rem] uppercase tracking-[.12em] text-muted-foreground">New PR</span>
                  <span className="block truncate text-[0.9375rem]">
                    {topPrLift} <span className="tabular-mono glow-mint-lg font-bold" style={{ color: 'var(--num-hero)' }}>{topPr}</span>
                  </span>
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 pt-2.5" style={{ borderTop: '1px solid var(--hairline)' }} data-home-done-stats>
              <span>
                <span className="block tabular-mono text-base font-bold">{minutes != null ? `${minutes} min` : '—'}</span>
                <span className="block text-[0.6875rem] text-muted-foreground">time</span>
              </span>
              <span>
                <span className="block tabular-mono text-base font-bold">{setsLogged}/{setsPlanned}</span>
                <span className="block text-[0.6875rem] text-muted-foreground">sets</span>
              </span>
              <span>
                <span className={`block tabular-mono text-base font-bold ${prCount > 0 ? 'glow-mint text-primary-text' : ''}`}>{prCount} PR{prCount === 1 ? '' : 's'}</span>
                <span className="block text-[0.6875rem] text-muted-foreground">this session</span>
              </span>
            </div>
            {cardioLines}
          </div>
        ) : (
          <div data-tour="hero" data-home-hero={status} className="flex flex-col gap-3 rounded-[22px] p-[18px]" style={heroWash}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="glow-mint whitespace-nowrap text-[0.65625rem] font-semibold uppercase tracking-[.2em] text-primary-text">Today&apos;s session</p>
              {status === 'in_progress'
                ? <span className="tabular-mono text-[0.6875rem] text-muted-foreground">{setsLogged} of {setsPlanned} sets</span>
                : status === 'not_started' && data.session.sessionLength && (
                  <span className="text-[0.6875rem] text-muted-foreground" data-testid="home-session-length">{data.session.sessionLength}</span>
                )}
            </div>

            {data.session.status === 'unknown' ? (
              /* THE PLAN IS NOT HERE YET — and it is not a rest day (her 8 Sep
                 ruling). No CTA: there is nothing yet to start. */
              <p className="text-[0.78125rem] text-muted-foreground">Checking your plan…</p>
            ) : data.session.status === 'moved' && data.session.movedTo ? (
              <div>
                <p className="glow-text text-[1.875rem] font-bold leading-[1.02] tracking-[-.03em]">Moved to {data.session.movedTo.dayName}</p>
                <p className="mt-1.5 text-[0.78125rem] text-muted-foreground">
                  {data.session.focus ?? "Today's session"} is waiting for you on {data.session.movedTo.dayName} · {week.sessionsDone} of {week.sessionsPlanned} session{week.sessionsPlanned === 1 ? '' : 's'} done
                </p>
              </div>
            ) : data.session.status === 'rest' ? (
              <div>
                <p className="glow-text text-[1.875rem] font-bold leading-[1.02] tracking-[-.03em]">Rest day</p>
                <p className="mt-1.5 text-[0.78125rem] text-muted-foreground">
                  Recovery is part of the program · {week.sessionsDone} of {week.sessionsPlanned} session{week.sessionsPlanned === 1 ? '' : 's'} done
                </p>
              </div>
            ) : (
              <div>
                <p className="glow-text text-[1.875rem] font-bold leading-[1.02] tracking-[-.03em]">{data.session.focus}</p>
                <p className="mt-1.5 text-[0.78125rem] text-muted-foreground" data-testid="home-session-glance">{sessionGlance}</p>
                {data.session.movedFrom && (
                  <p className="mt-1 text-[0.78125rem] text-muted-foreground">{data.session.movedFrom.dayName}&apos;s session, moved here.</p>
                )}
              </div>
            )}

            {cardioLines}
            {weekRow}

            {(status === 'not_started' || status === 'in_progress') && (
              <Button
                size="cta"
                className="glow-bloom-once glow-mint-box h-[52px] w-full rounded-[14px] text-[0.9375rem] font-bold"
                style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white) 0%, var(--primary) 55%, var(--primary-2) 100%)', color: 'var(--primary-foreground)' }}
                onClick={() => { window.location.hash = tabHash('exercise') }}
              >
                {status === 'not_started' ? 'Start session' : 'Continue session'}
              </Button>
            )}
          </div>
        )}

        {/* 4 + 5. THE DAY SO FAR, AND WEIGHT — one tour stop: the copy says
            water, steps and the weigh-in are logged here, and the weigh-in
            now opens from the weight panel, so the spotlight covers both. */}
        <div data-tour="tiles" className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 overflow-hidden rounded-[18px]" style={{ background: 'var(--surface-raised)' }} data-home-today>
            {/* Calories — a pointer to the tab that owns them. */}
            <button
              type="button"
              onClick={() => { window.location.hash = tabHash('nutrition') }}
              className="text-left"
              style={todayCell2(0, 0)}
            >
              <MetricHead icon={Flame} label="Calories" color="var(--primary)" />
              <MetricValue value={Math.round(data.caloriesEaten).toLocaleString()} unit={data.hasNutritionTargets ? `/ ${Math.round(data.caloriesTarget).toLocaleString()}` : 'no target yet'} />
              <MetricBar share={data.hasNutritionTargets && data.caloriesTarget > 0 ? data.caloriesEaten / data.caloriesTarget : 0} color="var(--primary)" glow />
            </button>

            {/* Protein — read-only, like calories. */}
            <button
              type="button"
              onClick={() => { window.location.hash = tabHash('nutrition') }}
              className="text-left"
              style={todayCell2(1, 0)}
            >
              <MetricHead icon={Beef} label="Protein" color="var(--chart-2)" />
              <MetricValue value={String(Math.round(data.proteinEaten))} unit={data.hasNutritionTargets ? `/ ${Math.round(data.proteinTarget)} g` : 'g · no target yet'} />
              <MetricBar share={data.hasNutritionTargets && data.proteinTarget > 0 ? data.proteinEaten / data.proteinTarget : 0} color="var(--chart-2)" />
            </button>

            {/* Water — quick-add, with the six-second undo. */}
            <div style={todayCell2(0, 1)}>
              <MetricHead icon={Droplets} label="Water" color="var(--chart-3)" />
              <MetricValue value={(waterShown / 1000).toFixed(1)} unit={`/ ${(data.waterTargetMl / 1000).toFixed(1)} L`} />
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                {[250, 500].map(ml => (
                  <button
                    key={ml}
                    type="button"
                    onClick={() => handleAddWater(ml)}
                    className="hit-slop-44 inline-flex h-6 items-center rounded-full px-2.5 text-[0.6875rem] font-semibold"
                    style={{ background: 'color-mix(in oklab, var(--chart-3) 15%, transparent)', color: 'var(--chart-3)' }}
                  >
                    +{ml}
                  </button>
                ))}
                {lastWaterLog && (
                  <button type="button" onClick={handleUndoWater} className="hit-slop-44 inline-flex h-6 items-center rounded-full px-2 text-[0.6875rem] text-muted-foreground">
                    undo
                  </button>
                )}
              </span>
              {waterError && <span className="mt-1 block text-[0.6875rem] text-[color:var(--role-warn-text)]">{waterError}</span>}
            </div>

            {/* Steps — tap the cell to type today's count. */}
            <div style={todayCell2(1, 1)}>
              {stepsOpen ? (
                <>
                  <MetricHead icon={Footprints} label="Steps" color="var(--chart-4)" />
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
                      style={{ background: 'var(--surface-sunken)' }}
                    />
                    <button type="button" onClick={() => void handleLogSteps()} className="hit-slop-44 text-[0.6875rem] font-semibold text-primary-text">
                      Log
                    </button>
                  </span>
                  {/* WHERE THE TARGET COMES FROM — shown while the input is open. */}
                  <span className="mt-1.5 block text-[0.625rem] leading-[1.35] text-muted-foreground/80">
                    Target from the activity level your calorie target uses — override it in your profile.
                  </span>
                </>
              ) : (
                <button type="button" onClick={() => setStepsOpen(true)} className="block w-full text-left" aria-label={`Steps: ${stepsToday.toLocaleString()} of ${stepsTarget.toLocaleString()}. Tap to log today's steps.`}>
                  <MetricHead icon={Footprints} label="Steps" color="var(--chart-4)" />
                  <MetricValue value={stepsToday.toLocaleString()} unit={`/ ${compactSteps(stepsTarget)}`} />
                  <MetricBar share={stepsTarget > 0 ? stepsToday / stepsTarget : 0} color="var(--chart-4)" />
                </button>
              )}
              {stepsError && <span className="mt-1 block text-[0.6875rem] text-[color:var(--role-warn-text)]">{stepsError}</span>}
            </div>
          </div>

          {/* WEIGHT — the chart, the latest PR and this week's volume. The
              header is the door to the weigh-in (the old Weight cell was its
              only one). */}
          <div className="overflow-hidden rounded-[18px] px-3.5 pt-3.5" style={{ background: 'var(--surface-raised)' }} data-home-weight>
            <button
              type="button"
              onClick={() => setWeighInOpen(o => !o)}
              aria-expanded={weighInOpen}
              className="flex w-full items-baseline justify-between gap-3 text-left"
            >
              <span className="text-[0.75rem] text-text-tertiary">Weight</span>
              <span className="flex items-baseline gap-2">
                <span className="tabular-mono text-[1.25rem] font-bold">
                  {lastWeighIn ? lastWeighIn.kg.toFixed(1) : '—'}
                  <span className="ml-1 text-[0.6875rem] font-medium text-muted-foreground">{lastWeighIn ? 'kg' : 'log one'}</span>
                </span>
                {weightDeltaKg != null && (
                  <span className="glow-mint tabular-mono text-[0.75rem] font-semibold text-primary-text">
                    {weightDeltaKg > 0 ? '+' : ''}{weightDeltaKg.toFixed(1)}<span className="sr-only"> kg since you started</span>
                  </span>
                )}
              </span>
            </button>
            {data.weightSeries.length > 0 ? (
              <WeighInTrendChart series={data.weightSeries} goalKg={data.weightGoalKg} />
            ) : (
              <p className="mt-2.5 pb-1 text-xs text-muted-foreground">Log a weigh-in to see your trend here.</p>
            )}
            {weighInOpen && profile.id && (
              <div className="mt-3">
                <WeighInCard profileId={profile.id} onWeightLogged={handleWeighInChanged} />
              </div>
            )}
            <div className="mt-3 grid grid-cols-2" style={{ borderTop: '1px solid var(--hairline)' }}>
              <div className="py-3 pr-3" style={{ borderRight: '1px solid var(--hairline)' }} data-home-latest-pr>
                <span className="block truncate text-[0.6875rem] text-muted-foreground">
                  {latestPr ? `${shortLiftName(latestPr.exerciseName)} PR · ${prDay(latestPr.date, data.today)}` : 'Latest PR'}
                </span>
                {/* The unit comes with the number, from the phrasebook — a
                    bodyweight best is reps, never "0 kg". */}
                <span className={`mt-0.5 block text-[0.875rem] ${latestPr ? 'tabular-mono font-bold glow-mint text-primary-text' : 'text-muted-foreground'}`}>
                  {latestPr ? personalBest(bestReadingOf(latestPr.metric, latestPr.value)) : 'none this week'}
                </span>
              </div>
              <div className="py-3 pl-3" data-home-volume>
                <span className="block text-[0.6875rem] text-muted-foreground">Volume this week</span>
                <span className="mt-0.5 block tabular-mono text-[0.875rem] font-bold">
                  {vol.thisWeek} set{vol.thisWeek === 1 ? '' : 's'}
                  {volPct != null && (
                    <span className={`ml-1.5 text-[0.6875rem] font-semibold ${volPct > 0 ? 'glow-mint text-primary-text' : 'text-muted-foreground'}`}>
                      {volPct > 0 ? '+' : ''}{volPct}%
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {card && (
        <Suspense fallback={null}>
          <SessionSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} data={card} />
        </Suspense>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The pieces of the 2a layout.
// ---------------------------------------------------------------------------

/** A cell of the 2x2 "today so far" panel: hairlines on the inner edges only. */
function todayCell2(col: 0 | 1, row: 0 | 1): CSSProperties {
  return {
    padding: '11px 12px',
    borderRight: col === 0 ? '1px solid var(--hairline)' : undefined,
    borderBottom: row === 0 ? '1px solid var(--hairline)' : undefined,
  }
}

function MetricHead({ icon: Icon, label, color }: { icon: typeof Flame; label: string; color: string }) {
  return (
    <span className="flex items-center gap-2 text-[0.75rem] text-text-tertiary">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      {label}
    </span>
  )
}

function MetricValue({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="mt-2 block tabular-mono text-[1.375rem] font-bold leading-none">
      {value}
      <span className="ml-1 text-[0.6875rem] font-medium text-muted-foreground">{unit}</span>
    </span>
  )
}

function MetricBar({ share, color, glow }: { share: number; color: string; glow?: boolean }) {
  return (
    <span className="mt-2.5 block h-[3px] w-full rounded-full" style={{ background: 'var(--surface-sunken)' }}>
      <span
        className={`block h-[3px] rounded-full ${glow ? 'glow-mint-box' : ''}`}
        style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`, background: color }}
      />
    </span>
  )
}

/** "9k" for a round 9,000; "7.5k" for 7,500; the number itself under 1,000. */
function compactSteps(n: number): string {
  if (n < 1000) return n.toLocaleString()
  const k = n / 1000
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`
}

/** "Bench" for the four lifts the app names short, else the lift's own name. */
function shortLiftName(name: string): string {
  return LIFT_SHORT_NAME[name] ?? name
}

/** "today", else the weekday ("Thu") — every PR shown here is from the last seven days. */
function prDay(date: string, today: string): string {
  return date === today ? 'today' : dayNameOf(date).slice(0, 3)
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

interface HomeTip { key: string; text: string; tag: string; prefill: string }

/** What a tip is about, for "TRAINER · TAG". */
function tipTag(key: string): string {
  if (key === 'protein_streak' || key === 'water_pace') return 'Nutrition'
  if (key === 'weight_trend') return 'Progress'
  return 'Training'
}

/**
 * What "Ask ↗" types into the chat for her: the reply chips' own question
 * where a tip had one (kept from the chips this note replaces), else a plain
 * "tell me more" about that line. A draft she can edit, never sent for her.
 */
const TIP_PREFILL: Record<string, string> = {
  lift_progress: 'What changed to move that lift?',
  protein_streak: 'What have I been doing differently with protein?',
  weight_trend: 'What is driving my weight trend right now?',
}
function tipPrefill(key: string, text: string): string {
  return TIP_PREFILL[key] ?? `Tell me more about this: "${text}"`
}

/**
 * THE ROTATING NOTE — 2a. Every 6s the next tip, with a quarter-second fade.
 * Tapping the line moves on and a dot jumps; either restarts the 6s.
 *
 * IT CAN BE STOPPED, because text that moves on its own past five seconds
 * must be (WCAG 2.2.2): it never moves for anyone whose phone asks for
 * reduced motion, and it holds still while a finger or keyboard is on it.
 * One tip: no dots and no movement. None: the caller draws nothing.
 */
export function HomeCoachNote({ tips }: { tips: HomeTip[] }) {
  const [index, setIndex] = useState(0)
  const [fading, setFading] = useState(false)
  const [held, setHeld] = useState(false)
  const [cycle, setCycle] = useState(0)
  const count = tips.length
  const i = Math.min(index, count - 1)
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const go = (next: number) => {
    setFading(true)
    window.setTimeout(() => { setIndex(((next % count) + count) % count); setFading(false) }, 250)
    setCycle(c => c + 1)
  }

  useEffect(() => {
    if (count < 2 || reduced || held) return
    const id = window.setTimeout(() => go(i + 1), 6000)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, count, reduced, held, cycle])

  const tip = tips[i]
  return (
    <div
      data-home-note
      data-tip-key={tip.key}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
    >
      <TrainerNudge
        text={tip.text}
        tag={tip.tag}
        openChat
        askPrefill={tip.prefill}
        fading={fading}
        onTextTap={count > 1 ? () => go(i + 1) : undefined}
        pager={count > 1 ? { count, index: i, onSelect: n => { if (n !== i) go(n) } } : undefined}
      />
    </div>
  )
}
