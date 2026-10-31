// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — the daily home. Structure and data this round
// (per the request: "no colour/type/aesthetic decisions; a visual pass
// follows separately") — plain Card sections, house-voice empty states,
// no new visual language invented here.
// ---------------------------------------------------------------------------

import type * as React from 'react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { lazyWithReload } from '@/lib/chunk-reload'
import { Button } from '@/components/ui/button'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getAppNow } from '@/lib/dev-clock'
import { tabHash } from '@/lib/app-route'
import { loadDashboardData, leadLiftPhrase, homeGreeting, LIFT_SHORT_NAME, type DashboardData } from '@/lib/dashboard-data'
import { changeSinceStart } from '@/lib/weight-trend'
import { momentFactsFrom, sendFactsAhead } from '@/lib/moment-facts'
import { loadDashboardCache, saveDashboardCache } from '@/lib/dashboard-cache'
import { stepsTargetFor } from '@/lib/steps-target'
import { getStepsForDate, logStepsManual, isPlausibleStepCount, MAX_PLAUSIBLE_DAILY_STEPS, type DailyStepsRow } from '@/lib/steps-store'
import { getLedgerSnapshot, subscribeMealStore, loggedEventsBySlot, type MealSlotName } from '@/lib/meal-store'
import { Trophy, UtensilsCrossed, Activity, ChevronDown, Flame, Drumstick, Droplet, Footprints, CalendarDays, Play } from 'lucide-react'
import { WeighInCard } from '@/components/WeighInCard'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { HomeWeekStrip, HomeWeekBoundaryNote, sessionOrdinal } from '@/components/HomeWeekStrip'
import { PageRow, PRIMARY_CTA_STYLE } from '@/components/OnePage'
import { ringShare, todaySoFarPercent, compactCount } from '@/lib/one-page'
import { dayAsShown, eatenMacrosBySlot, aroundEatenKeptKey, readAroundEatenKept } from '@/lib/day-as-shown'
import { mealSections } from '@/lib/meal-sections'
import { SLOT_ORDER, SLOT_LABEL } from '@/components/MealPlan'
import type { PoolOption } from '@/lib/meal-generation'
import { TrainerNudge, type TrainerNudgeProps } from '@/components/TrainerNudge'
import { sessionSetCount } from '@/lib/session-count'
import { readSessionSummary } from '@/lib/session-summary-store'
import { readingFor } from '@/lib/pr-engine'
import { dayNameOf } from '@/lib/session-move'
const SessionSummaryDialog = lazyWithReload(() => import('@/components/exercise/SessionSummaryDialog').then(m => ({ default: m.SessionSummaryDialog })))
// ITS OWN CHUNK (run 5, 11 Oct 2026): the card reads the list's dates and the
// meals now, and is up one day a week; first paint does not wait for it.
const ShopDayCard = lazyWithReload(() => import('@/components/ShopDayCard').then(m => ({ default: m.ShopDayCard })))
import { personalBest, bestReadingOf, streakLabel, STREAK_PILL_WORDS } from '@/lib/coach-voice'
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
  /** Today's meals and their pools, so the Next meal row reads the dish Nutrition shows (one-page Home). */
  todaysMeals?: Partial<Record<MealSlotName, PoolOption>>
  mealPools?: Partial<Record<MealSlotName, PoolOption[]>>
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

export function Dashboard({ profile, macros, exercisePlan, mesocycle, planCreatedAt, onWeightLogged, logsVersion, trainerNudge, stepsVersion, onStepsLogged, todaysMeals, mealPools }: DashboardProps) {
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
  const hasDataRef = useRef(data != null)
  hasDataRef.current = data != null
  /** Home's loads in the order they started, and the latest one drawn (see the load effect). */
  const loadSeqRef = useRef(0)
  const drawnSeqRef = useRef(0)
  const dayKeyRef = useRef('')
  dayKeyRef.current = `${profile.id}|${activeSession.date}`

  const [steps, setSteps] = useState<DailyStepsRow | null>(null)

  // Home's copy of the week — the RECORD. Exercise's strip is the navigator
  // and owns tap-to-peek; the two share only the glyph vocabulary.
  // The LIVE week's days, not the week-1 snapshot App holds: that one is never refreshed after a rebuild
  // from a later week, so Home's strip kept the old weekdays. The mesocycle lets each day of the window be
  // looked up in the plan week its own date falls in (a plan begun on a Thursday changes week on a Thursday).
  const liveWeekDays = mesocycle?.find(w => w.week_number === activeSession.liveWeek)?.days ?? exercisePlan ?? []
  const week = useTrainingWeek(profile.id, activeSession.date, liveWeekDays, planCreatedAt, logsVersion, mesocycle)
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
    // WITH NO SNAPSHOT OF TODAY, IT DOES NOT WAIT FOR TODAY'S SETS EITHER (31 Oct 2026, app start). The first open
    // of a day has nothing to draw until this lands, and waiting for the sets read first cost a whole round trip.
    // It runs at once on the sets this phone already holds, and again when the read lands (ready is a dependency).
    // With a snapshot on screen it waits, as before: there is no blank to fill, so no reason to load twice.
    if (!profile.id || (!activeSession.ready && hasDataRef.current)) return
    // NEWEST WINS, RATHER THAN LAST STARTED ONLY (31 Oct 2026, app start). Every re-run used to throw away the run
    // before it, so the first open of a day loaded once on the phone's sets, threw that away the moment the sets
    // read landed, and loaded again: the early answer never reached the screen. Now an answer is drawn unless a
    // LATER-started run has already been drawn, and only for the profile and day still on screen.
    const seq = ++loadSeqRef.current
    const forDay = `${profile.id}|${activeSession.date}`
    const stale = () => seq < drawnSeqRef.current || dayKeyRef.current !== forDay
    setLoading(true)
    loadDashboardData({
      profile, macros, exercisePlan, mesocycle, planCreatedAt, moves: week.moves,
      todayLogs: activeSession.logs, liveWeek: activeSession.liveWeek,
      dayName: activeSession.dayName, todayStr: activeSession.date,
      now: getAppNow(profile.id),
    })
      .then(d => {
        if (stale()) return
        drawnSeqRef.current = seq
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
        if (!stale() && seq === loadSeqRef.current) setLoadError(true)
      })
      .finally(() => { if (seq === loadSeqRef.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // exercisePlan AND mesocycle ARE DEPENDENCIES. They were not, and that is
    // what made the wrong answer permanent rather than momentary: the effect
    // ran once at mount with [] for both, decided a rest day, and had no
    // reason to look again when the plan landed a second later. Home then sat
    // on "Rest day" beside its own week strip showing four sessions. Both are
    // App.tsx useState arrays, so the identity is stable and this re-runs when
    // the plan actually changes, not on every render.
  }, [activeSession.ready, activeSession.date, activeSession.logs.length, profile.id, weighInVersion, macros, retryVersion, exercisePlan, mesocycle, planCreatedAt, movesKey])

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

  // STEPS ARE LOGGED HERE, from the Steps row of the key (her 17 Oct ruling, "Tap the steps ring").
  // Water moved to Nutrition's water cell with the one-page layout; this screen reads it from `data`.
  const [stepsInput, setStepsInput] = useState('')
  const [stepsOpen, setStepsOpen] = useState(false)
  const [stepsError, setStepsError] = useState<string | null>(null)
  const [weighInOpen, setWeighInOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

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
  // NOT GATED ON THE DAY'S SETS ANY MORE (31 Oct 2026, app start). With a snapshot of today in hand there is
  // something true to draw, and waiting for the sets read cost a round trip on every open with "Loading your
  // day..." over a screen that already had its numbers. The load effect above still waits for it, and swaps
  // the fresh day in when it lands, as the snapshot's own comment promises.
  if (!data) {
    // HOME'S OWN SHAPE WHILE TODAY FILLS IN (31 Oct 2026, Ashley: "not show that loading as soon as you open it").
    // Only on the first open of a day, the one time there is no snapshot of today to draw; it is about half a
    // second on a phone where each answer takes 300 ms (verify:app-boot). No number is drawn until it is known.
    return <HomeFilling dayName={activeSession.dayName} greeting={homeGreeting(getAppNow(profile.id).getHours(), (profile.display_name ?? '').trim().split(/\s+/)[0])} />
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
  const firstName = (profile.display_name ?? '').trim().split(/\s+/)[0]
  const greeting = homeGreeting(getAppNow(profile.id).getHours(), firstName)
  const dateLabel = data.phase
    ? `${data.dayName} · Week ${data.phase.weekNumber} of ${data.phase.totalWeeks}`
    : data.dayName

  const stepsToday = steps?.steps ?? 0
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
    : (data.prsToday ?? []).length > 0 ? personalBest(bestReadingOf(data.prsToday[0].metric, data.prsToday[0].value, data.prsToday[0].setReps)) : null
  const topPrLift = card && card.prs.length > 0 ? card.prs[0].exerciseName : (data.prsToday ?? [])[0]?.exerciseName ?? null
  const minutes = card?.summary.durationMinutes ?? data.sessionMinutes ?? null

  // THE GLANCE LINE — what is in it and the lead lift. Each part is dropped when unknown. Tomorrow left it on
  // 31 Oct 2026 (tab polish 2c): it has its own half of the highlights card again, and is said once.
  const glanceParts: string[] = []
  if (data.session.activity) {
    // An activity session reads like one: "20 min · Easy", not "0 exercises" (the walking plan, user test 8 Oct 2026).
    glanceParts.push(`${data.session.activity.minutes} min`)
    if (data.session.activity.effort) glanceParts.push(data.session.activity.effort)
  } else if (status !== 'in_progress') {
    // In progress, the minutes left are the card's right-hand status instead (said once).
    glanceParts.push(`${data.session.exerciseCount} exercise${data.session.exerciseCount === 1 ? '' : 's'}`)
  }
  // DELIBERATE DEVIATION FROM THE HANDOFF, kept: no "next" — the app knows the
  // heaviest lift, not the running order.
  const lift = data.session.leadLift && !data.session.activity ? leadLiftPhrase(data.session.leadLift, status) : null
  if (lift) glanceParts.push(lift)
  const tomorrow = data.tomorrow ?? null
  const sessionGlance = glanceParts.join(' · ')

  // THE LATEST PR for the weight panel's footer — the newest, not the biggest.
  const latestPr = [...data.recentPRs].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  const vol = data.volume ?? { thisWeek: 0, lastWeekSoFar: 0 }
  const volPct = vol.lastWeekSoFar > 0 ? Math.round(((vol.thisWeek - vol.lastWeekSoFar) / vol.lastWeekSoFar) * 100) : null

  const cardioLines = cardioToday.length > 0 && (
    <div data-testid="home-cardio-today">
      {cardioToday.map(l => (
        <p key={l.clientId ?? l.id} className="text-[0.78125rem] text-muted-foreground">✓ {cardioLine(l)}</p>
      ))}
    </div>
  )

  // THE NEXT MEAL, AS NUTRITION SHOWS IT: the same sections (meal-sections) and the same day-as-shown
  // sizes, so the row and the meal card cannot give two calorie figures for one dinner.
  const mealSnap = getLedgerSnapshot(profile.id ?? '', data.today)
  const mealSlots = SLOT_ORDER.filter(s => (mealPools?.[s]?.length ?? 0) > 0)
  const eatenBySlot = mealSnap ? loggedEventsBySlot(mealSnap.events) : {}
  const mealShown = todaysMeals && mealSlots.length > 0
    ? dayAsShown({
      slots: mealSlots,
      chosen: todaysMeals,
      eatenBySlot: eatenMacrosBySlot(eatenBySlot),
      targets: macros ?? null,
      keepAsPlanned: readAroundEatenKept(aroundEatenKeptKey(profile.id, data.today)),
    })
    : null
  const nextMealSlot = mealShown
    ? mealSections({ slots: mealSlots, eaten: sl => (eatenBySlot[sl] ?? []).length > 0, hasDish: sl => !!mealShown.slots.find(r => r.slot === sl)?.option, upcoming: false }).upNext
    : null
  const nextMeal = nextMealSlot ? mealShown?.slots.find(r => r.slot === nextMealSlot)?.option ?? null : null

  // THE FOUR RINGS (5c·5): calories, protein, water, steps, outermost first. A ring with no target is an
  // empty track and is left out of the headline rather than counted as nothing done (one-page.ts).
  const calShare = data.hasNutritionTargets ? ringShare(data.caloriesEaten, data.caloriesTarget) : null
  const proteinShare = data.hasNutritionTargets ? ringShare(data.proteinEaten, data.proteinTarget) : null
  const waterShare = ringShare(data.waterMl, data.waterTargetMl)
  const stepsShare = ringShare(stepsToday, stepsTarget)
  const soFar = todaySoFarPercent([calShare, proteinShare, waterShare, stepsShare])
  const toNutrition = () => { window.location.hash = tabHash('nutrition') }
  const showCta = status === 'not_started' || status === 'in_progress'

  const recentCount = data.recentPRs.length
  const tomorrowSub = tomorrow && !tomorrow.rest && tomorrow.minutes != null ? `Tomorrow · ~${tomorrow.minutes} min` : 'Tomorrow'

  return (
    // TAB POLISH, DESIGN 2c (31 Oct 2026, her "build, keep my rulings"): two boxes only, the session card and the
    // highlights card; the coach line and the rings sit on the page. docs/plans/tab-polish-oct31.md.
    <div className="relative flex flex-col gap-6" data-home-page>
      {/* 1. WHO AND WHEN */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="ds-label">{dateLabel}</p>
          <h2 className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">{greeting}</h2>
        </div>
        <span
          className="mb-0.5 inline-flex h-[30px] shrink-0 items-center gap-[5px] rounded-full border px-[11px]"
          style={data.streak > 0
            ? { background: 'rgba(var(--glow-rgb), .12)', borderColor: 'rgba(var(--glow-rgb), .3)', color: 'var(--primary-text)' }
            : { background: 'var(--surface-raised)', borderColor: 'transparent', color: 'var(--muted-foreground)' }}
          data-testid="home-streak"
          role="img"
          aria-label={`${data.streak} ${streakLabel(data.streak)}`}
        >
          <Flame aria-hidden className="size-[13px]" />
          <span className="tabular-mono text-[0.75rem] font-semibold">{data.streak}</span>
          {/* "in a row", her 17 Oct ruling over the handoff's "days": the streak counts sessions. */}
          <span className="text-[0.75rem] font-semibold" data-testid="home-streak-label">{STREAK_PILL_WORDS}</span>
        </span>
      </div>

      {/* 2. TODAY'S SESSION — the one glowing card. */}
      <SessionHero
        status={status}
        data={data}
        week={week}
        sessionGlance={sessionGlance}
        done={done}
        minutes={minutes}
        setsLogged={setsLogged}
        setsPlanned={setsPlanned}
        prCount={prCount}
        topPr={prCount > 0 && topPr ? `${topPrLift ?? ''} ${topPr}`.trim() : null}
        onSummary={card ? () => setSummaryOpen(true) : undefined}
        cta={showCta && (
          // THE START BUTTON: inside the card it starts. Gone on a rest day, a moved day, an unknown plan and once done.
          <div className="mt-3.5" data-home-cta>
            <Button
              size="cta"
              className="glow-bloom-once glow-mint-box h-[54px] w-full gap-2 rounded-[16px] text-base font-bold"
              style={PRIMARY_CTA_STYLE}
              onClick={() => { window.location.hash = tabHash('exercise') }}
            >
              <Play aria-hidden className="size-4" fill="currentColor" strokeWidth={0} />
              {status === 'not_started' ? (data.session.focus ? `Start ${data.session.focus}` : 'Start session') : 'Continue session'}
            </Button>
          </div>
        )}
        footer={<>
          {cardioLines && <div className="pt-2">{cardioLines}</div>}
          <HomeWeekBoundaryNote days={week.days} todayDate={activeSession.date} />
        </>}
      />

      {/* 3. THE TRAINER'S LINE — one per screen, no box. An adaptation message is shown alone, never rotated away. */}
      {trainerNudge
        ? <TrainerNudge {...trainerNudge} line className="px-1" />
        : plainTips.length > 0 && <HomeCoachNote tips={plainTips} />}

      {/* 4. TODAY'S RINGS — calories, protein, water, steps (no sleep: the app records none). Steps opens the steps
          entry here (her "Tap the steps ring"); the other three open Nutrition, where water is logged. */}
      <section className="px-1" data-tour="tiles">
        <div className="flex items-baseline justify-between">
          <span className="ds-label">Today</span>
          <span className="text-[0.6875rem] text-muted-foreground">
            <span className="tabular-mono font-semibold text-foreground" data-testid="home-so-far">{soFar == null ? '—' : `${soFar}%`}</span> of targets
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1" data-home-today data-home-rings>
          <RingCell k="calories" share={calShare} color="var(--primary)" glow icon={<Flame />} value={Math.round(data.caloriesEaten).toLocaleString()} label="kcal"
            onClick={toNutrition} ariaLabel={`Calories: ${Math.round(data.caloriesEaten).toLocaleString()}${data.hasNutritionTargets ? ` of ${Math.round(data.caloriesTarget).toLocaleString()}` : ''}. Open Nutrition`} />
          <RingCell k="protein" share={proteinShare} color="var(--chart-2)" icon={<Drumstick />} value={`${Math.round(data.proteinEaten)}g`} label="protein"
            onClick={toNutrition} ariaLabel={`Protein: ${Math.round(data.proteinEaten)}${data.hasNutritionTargets ? ` of ${Math.round(data.proteinTarget)}` : ''} grams. Open Nutrition`} />
          <RingCell k="water" share={waterShare} color="var(--chart-3)" icon={<Droplet />} value={`${(data.waterMl / 1000).toFixed(1)} L`} label="water"
            onClick={toNutrition} ariaLabel={`Water: ${(data.waterMl / 1000).toFixed(1)} of ${(data.waterTargetMl / 1000).toFixed(1)} litres. Open Nutrition to log it`} />
          <RingCell k="steps" share={stepsShare} color="var(--chart-4)" icon={<Footprints />} value={compactCount(stepsToday)} label="steps"
            onClick={() => setStepsOpen(o => !o)} ariaLabel={`Steps: ${stepsToday.toLocaleString()} of ${stepsTarget.toLocaleString()}. Tap to log today's steps.`} />
        </div>
        {stepsOpen && (
          <div className="mt-3 flex flex-col gap-1.5" data-home-steps-entry>
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                value={stepsInput}
                onChange={e => setStepsInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleLogSteps() }}
                placeholder={String(stepsToday || '')}
                aria-label="Steps today"
                className="h-11 w-28 rounded-[10px] px-3 text-[0.875rem] tabular-mono"
                style={{ background: 'var(--surface-sunken)' }}
              />
              <Button size="sm" className="h-11" onClick={() => void handleLogSteps()}>Log steps</Button>
            </span>
            {/* WHERE THE TARGET COMES FROM — shown while the input is open. */}
            <span className="text-[0.6875rem] leading-[1.35] text-muted-foreground/80">
              Target {stepsTarget.toLocaleString()}, from the activity level your calorie target uses — override it in your profile.
            </span>
          </div>
        )}
        {stepsError && <span className="mt-1.5 block text-[0.6875rem] text-[color:var(--role-warn-text)]">{stepsError}</span>}
      </section>

      {/* 5. ONE CARD, TWO HALVES: the latest PR and tomorrow. Under them, one tap away, the rest of progress:
          recent PRs, the weight (its header is the door to the weigh-in) and the training volume. */}
      <section className="overflow-hidden rounded-[20px]" style={{ background: 'var(--surface-raised)' }} data-home-highlights>
        <div className="grid grid-cols-2">
          <div className="flex min-w-0 items-center gap-2.5 border-r border-[color:var(--hairline)] px-3.5 py-4" data-home-latest-pr>
            <span aria-hidden className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px]" style={latestPr ? { background: 'rgba(var(--glow-rgb), .14)', color: 'var(--primary-text)' } : { background: 'var(--surface-raised)', color: 'var(--muted-foreground)' }}>
              <Trophy className="size-4" />
            </span>
            {latestPr ? (
              <span className="flex min-w-0 flex-col">
                {/* The unit comes with the number, from the phrasebook — a bodyweight best is reps, never "0 kg". */}
                <span className="tabular-mono glow-mint whitespace-nowrap text-[1.125rem] font-bold leading-none text-primary-text">{personalBest(bestReadingOf(latestPr.metric, latestPr.value, latestPr.setReps))}</span>
                <span className="mt-1 line-clamp-2 text-[0.6875rem] leading-[1.3] text-muted-foreground">{shortLiftName(latestPr.exerciseName)} · new PR · {prDay(latestPr.date, data.today)}</span>
              </span>
            ) : (
              <span className="flex min-w-0 flex-col">
                <span className="text-[0.9375rem] font-bold leading-[1.1]">Latest PR</span>
                <span className="mt-1 line-clamp-2 text-[0.6875rem] text-muted-foreground">none this week</span>
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2.5 px-3.5 py-4" data-home-tomorrow>
            <span aria-hidden className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px]" style={{ background: 'color-mix(in srgb, var(--chart-2) 16%, transparent)', color: 'var(--role-ai-label, var(--chart-2))' }}>
              <CalendarDays className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="line-clamp-2 text-[0.9375rem] font-bold leading-[1.1]">{tomorrow ? (tomorrow.rest ? 'Rest day' : tomorrow.focus) : '—'}</span>
              <span className="mt-1 line-clamp-2 text-[0.6875rem] leading-[1.3] text-muted-foreground">{tomorrowSub}</span>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setProgressOpen(o => !o)}
          aria-expanded={progressOpen}
          className="flex min-h-[48px] w-full items-center gap-2 border-t border-[color:var(--hairline)] px-4 text-left"
          data-home-progress-toggle
        >
          <span className="min-w-0 flex-1 truncate text-[0.78125rem] text-muted-foreground">
            <span className="font-semibold text-foreground">Progress</span> · {lastWeighIn ? `${lastWeighIn.kg.toFixed(1)} kg` : 'no weigh-in yet'} · {recentCount > 0 ? `${recentCount} PR${recentCount === 1 ? '' : 's'} this week` : 'no new PR this week'}
          </span>
          <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{progressOpen ? 'Hide' : 'Show'}</span>
          <ChevronDown aria-hidden className={`size-4 shrink-0 transition-transform ${progressOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--muted-foreground)' }} />
        </button>
        {progressOpen && (<div className="px-4 pb-2">
        {data.phase && (
          <p className="pt-1 text-[0.71875rem] text-muted-foreground" data-home-phase>
            {data.phase.phaseLabel ? `${data.phase.phaseLabel} · ` : ''}week {data.phase.weekNumber} of {data.phase.totalWeeks}
          </p>
        )}
        {recentCount > 0 && (
          <ul className="border-b border-[color:var(--hairline)] py-2" data-home-recent-prs>
            {data.recentPRs.map(p => (
              <li key={`${p.exerciseName}-${p.date}`} className="flex items-baseline justify-between gap-3 py-1 text-[0.8125rem]">
                <span className="min-w-0 truncate">{shortLiftName(p.exerciseName)} <span className="text-muted-foreground">· {prDay(p.date, data.today)}</span></span>
                <span className="tabular-mono shrink-0 font-semibold text-primary-text">{personalBest(bestReadingOf(p.metric, p.value, p.setReps))}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-b border-[color:var(--hairline)] py-3" data-home-weight>
          <button
            type="button"
            onClick={() => setWeighInOpen(o => !o)}
            aria-expanded={weighInOpen}
            className="flex min-h-[44px] w-full items-baseline justify-between gap-3 text-left"
          >
            <span className="text-[0.90625rem]">Weight</span>
            <span className="flex items-baseline gap-2">
              <span className="tabular-mono text-base font-bold">
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
            <p className="mt-2.5 text-xs text-muted-foreground">Log a weigh-in to see your trend here.</p>
          )}
          {data.weightGoalKg != null && data.weightSeries.length > 0 && (
            <p className="mt-1 flex justify-between text-[0.65625rem] text-muted-foreground">
              <span>{data.weightSeries.length > 1 ? 'Last 14 weigh-ins' : 'One weigh-in so far'}</span>
              <span className="text-[color:var(--role-warn-text)]">goal {data.weightGoalKg} kg</span>
            </p>
          )}
          {weighInOpen && profile.id && (
            <div className="mt-3">
              <WeighInCard profileId={profile.id} onWeightLogged={handleWeighInChanged} />
            </div>
          )}
        </div>
        <div data-home-volume>
          <PageRow
            className="border-t-0 border-b-0"
            icon={<Activity className="size-4" />}
            title="Training volume"
            sub="This week vs last"
            right={(
              <span className="tabular-mono text-[0.875rem] font-bold">
                {vol.thisWeek} set{vol.thisWeek === 1 ? '' : 's'}
                {volPct != null && (
                  <span className={`ml-1.5 text-[0.6875rem] font-semibold ${volPct > 0 ? 'glow-mint text-primary-text' : 'text-muted-foreground'}`}>
                    {volPct > 0 ? '+' : ''}{volPct}%
                  </span>
                )}
              </span>
            )}
          />
        </div>
        </div>)}
      </section>

      {/* 6. THE NEXT MEAL, a quiet hairline row (17 Oct: Home's next meal is Nutrition's). */}
      {nextMeal && nextMealSlot && (
        <PageRow
          className="border-t-0"
          icon={<UtensilsCrossed className="size-4" />}
          title={<>{SLOT_LABEL[nextMealSlot]} · {nextMeal.name}</>}
          sub={`${Math.round(nextMeal.macros.calories)} kcal · ${Math.round(nextMeal.macros.protein)}g P`}
          onClick={toNutrition}
          data-home-next-meal={nextMealSlot}
        />
      )}

      {/* SHOPPING, ON THE DAY SHE SHOPS. */}
      <Suspense fallback={null}>
        <ShopDayCard
          profileId={profile.id}
          exercisePlan={exercisePlan}
          todayName={activeSession.dayName}
          today={activeSession.date}
          nowMs={Date.now()}
        />
      </Suspense>

      {card && (
        <Suspense fallback={null}>
          <SessionSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} data={card} />
        </Suspense>
      )}
    </div>
  )
}

/** Home's layout with no numbers in it: the header she knows, then quiet blocks where the day's numbers will go. */
function HomeFilling({ dayName, greeting }: { dayName: string; greeting: string }) {
  const block = (h: number, extra = '') => <div className={`rounded-[14px] ${extra}`} style={{ height: h, background: 'var(--surface-raised)', opacity: 0.55 }} />
  return (
    <div className="flex flex-col gap-6" data-home-filling aria-busy="true">
      <span className="sr-only">Loading your day</span>
      <div className="min-w-0">
        <p className="ds-label">{dayName}</p>
        <h2 className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">{greeting}</h2>
      </div>
      {block(250, 'rounded-[24px]')}
      {block(64)}
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map(i => <div key={i} className="rounded-full" style={{ width: 36, height: 36, background: 'var(--surface-raised)', opacity: 0.55 }} />)}
      </div>
      {block(72, 'rounded-[20px]')}
    </div>
  )
}

/**
 * ONE RING OF THE ROW (design 2c's ring row): a 36px ring with its icon, the value and a small label beside it.
 * A ring with no target is an empty track, marked so (data-share="none"), never a full or empty verdict.
 */
export function RingCell({ k, share, color, glow, icon, value, label, onClick, ariaLabel }: {
  k: string; share: number | null; color: string; glow?: boolean; icon: React.ReactElement; value: string; label: string; onClick: () => void; ariaLabel: string
}) {
  const r = 20
  const circ = 2 * Math.PI * r
  const s = share ?? 0
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="flex min-h-[44px] min-w-0 items-center gap-1.5 text-left" data-key-row={k}>
      <span aria-hidden className="relative block size-9 shrink-0">
        <svg viewBox="0 0 48 48" className="block size-9 -rotate-90">
          <circle cx="24" cy="24" r={r} fill="none" stroke="var(--hairline)" strokeWidth="5" />
          <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${circ * s} ${circ}`} opacity={s > 0 ? 1 : 0} className={glow ? 'glow-icon' : undefined}
            data-ring={k} data-share={share == null ? 'none' : s.toFixed(3)} style={{ transition: 'stroke-dasharray 400ms ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center [&>svg]:size-3" style={{ color }}>{icon}</span>
      </span>
      <span className="min-w-0">
        <span className="tabular-mono block truncate text-[0.8125rem] font-bold leading-none">{value}</span>
        <span className="mt-[3px] block truncate text-[0.625rem] text-muted-foreground">{label}</span>
      </span>
    </button>
  )
}


/**
 * TODAY'S SESSION, THE ONE GLOWING CARD (design 2c): "Today · Session N of M" and the right-hand status, the
 * session's name with its last word in mint, the glance line, the set bar once started, the Start button, and
 * the week under a hairline. Every state the old row had is here: not yet planned, moved, rest, done (with its
 * time, PRs and the summary), and the session itself. data-tour and data-home-hero keep their names.
 */
export function SessionHero({ status, data, week, sessionGlance, done, minutes, setsLogged, setsPlanned, prCount, topPr, onSummary, cta, footer }: {
  status: DashboardData['session']['status']
  data: DashboardData
  week: ReturnType<typeof useTrainingWeek>
  sessionGlance: string
  done: boolean
  minutes: number | null
  setsLogged: number
  setsPlanned: number
  prCount: number
  topPr: string | null
  onSummary?: () => void
  cta?: React.ReactNode
  footer?: React.ReactNode
}) {
  const weekCount = `${week.sessionsDone} of ${week.sessionsPlanned} session${week.sessionsPlanned === 1 ? '' : 's'} done`
  const ordinal = sessionOrdinal(week.days, data.today)
  const started = status === 'in_progress' || done
  let title: string
  let sub: React.ReactNode = null
  let right: React.ReactNode = null
  if (status === 'unknown') {
    // THE PLAN IS NOT HERE YET — and it is not a rest day (her 8 Sep ruling). No button: nothing to start.
    title = 'Checking your plan…'
  } else if (status === 'moved' && data.session.movedTo) {
    title = `Moved to ${data.session.movedTo.dayName}`
    sub = `${data.session.focus ?? "Today's session"} is waiting for you on ${data.session.movedTo.dayName}`
    right = weekCount
  } else if (status === 'rest') {
    title = 'Rest day'
    sub = 'Recovery is part of the program'
    right = weekCount
  } else {
    title = data.session.focus ?? "Today's session"
    sub = (
      <>
        <span data-testid="home-session-glance">{sessionGlance}</span>
        {data.session.movedFrom && <> · {data.session.movedFrom.dayName}&apos;s session, moved here</>}
      </>
    )
    // The length only before a session starts (never while the plan is unknown: that branch is above).
    right = done
      ? <span className="font-semibold text-primary-text">Done ✓</span>
      : status === 'not_started'
        ? data.session.sessionLength && <span data-testid="home-session-length">{data.session.sessionLength}</span>
        : data.session.minutesLeft != null && `~${data.session.minutesLeft} min left`
  }
  // The name with its last word in glowing mint, as drawn.
  const cut = title.lastIndexOf(' ')
  const head = cut > 0 ? title.slice(0, cut + 1) : ''
  const tail = cut > 0 ? title.slice(cut + 1) : title
  const glowTail = status !== 'unknown'
  const pctDone = setsPlanned > 0 ? Math.min(100, Math.round((setsLogged / setsPlanned) * 100)) : 0
  return (
    <section
      className="rounded-[24px] border p-5"
      style={{
        background: 'radial-gradient(120% 90% at 100% 0%, rgba(var(--glow-rgb), .20), transparent 55%), var(--card)',
        borderColor: 'rgba(var(--glow-rgb), .30)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, .35)',
      }}
      data-tour="hero"
      data-home-hero={done ? 'done' : status}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[.12em] text-primary-text" data-home-eyebrow>
          Today{ordinal ? ` · Session ${ordinal.n} of ${ordinal.of}` : ''}
        </span>
        {right && <span className="min-w-0 truncate text-[0.6875rem] text-text-tertiary">{right}</span>}
      </div>
      <button
        type="button"
        className="mt-2 block w-full text-left"
        onClick={() => { window.location.hash = tabHash('exercise') }}
        aria-label={`${title} — open Exercise`}
      >
        <span className="block text-[2rem] font-bold leading-[1.05] tracking-[-.03em]" data-home-title>
          {head}<span className={glowTail ? 'text-primary-text' : undefined} style={glowTail ? { textShadow: '0 0 18px rgba(var(--glow-rgb), .8)' } : undefined}>{tail}</span>
        </span>
        {sub && <span className="mt-2 block text-[0.78125rem] text-text-tertiary">{sub}</span>}
      </button>
      {started && (
        <div className="mt-4" data-home-set-progress>
          <div className="h-1 overflow-hidden rounded-full" style={{ background: 'var(--hairline)' }}>
            <div className="h-1 rounded-full" style={{ width: `${pctDone}%`, background: 'var(--primary)', boxShadow: '0 0 8px rgba(var(--glow-rgb), .8)' }} />
          </div>
          {/* Done says its count once, on the stats line below; the bar alone stays. */}
          {!done && <p className="mt-1.5 text-[0.6875rem] tabular-nums text-muted-foreground" data-home-sets-label>{setsLogged} of {setsPlanned} sets</p>}
        </div>
      )}
      {done && (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="min-w-0 tabular-nums text-[0.71875rem] text-muted-foreground" data-home-done-stats>
            {minutes != null ? `${minutes} min` : '—'} · {setsLogged}/{setsPlanned} sets · <span className={prCount > 0 ? 'glow-mint text-primary-text' : ''} data-home-pr={prCount > 0 ? '' : undefined}>{prCount} PR{prCount === 1 ? '' : 's'}{topPr ? ` · ${topPr}` : ''}</span>
          </p>
          {onSummary && (
            <button type="button" onClick={onSummary} className="hit-slop-44 shrink-0 text-[0.6875rem] font-semibold text-text-tertiary" data-home-summary>
              Summary ›
            </button>
          )}
        </div>
      )}
      {cta}
      {week.days.length > 0 && (
        <div className="mt-4 border-t border-[color:var(--hairline)] pt-3.5">
          <HomeWeekStrip days={week.days} todayName={data.dayName} done={week.sessionsDone} planned={week.sessionsPlanned} />
        </div>
      )}
      {footer}
    </section>
  )
}

// ---------------------------------------------------------------------------
// The pieces of the 2a layout.
// ---------------------------------------------------------------------------






/** "Bench" for the four lifts the app names short, else the lift's own name. */
function shortLiftName(name: string): string {
  return LIFT_SHORT_NAME[name] ?? name
}

/** "today", else the weekday ("Thu", or "Thursday" long) — every PR shown here is from the last seven days. */
function prDay(date: string, today: string, long = false): string {
  if (date === today) return long ? 'Today' : 'today'
  return long ? dayNameOf(date) : dayNameOf(date).slice(0, 3)
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

/** The coach line's two chips (design 2c): each types a question into the chat, never sends it for her. */
const HOME_PROMPTS = [
  { label: 'What changed?', prefill: 'What has changed in my plan lately, and why?' },
  { label: 'Adjust today', prefill: "Can you adjust today's session for me?" },
]

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
        line
        className="px-1"
        prompts={HOME_PROMPTS}
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
