// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — the daily home. Structure and data this round
// (per the request: "no colour/type/aesthetic decisions; a visual pass
// follows separately") — plain Card sections, house-voice empty states,
// no new visual language invented here.
// ---------------------------------------------------------------------------

import type * as React from 'react'
import { Suspense, useEffect, useState } from 'react'
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
import { Trophy, Moon, Dumbbell, UtensilsCrossed, Activity } from 'lucide-react'
import { WeighInCard } from '@/components/WeighInCard'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { HomeWeekDots, HomeWeekBoundaryNote } from '@/components/HomeWeekStrip'
import { RingMeter, RingKey, SectionLabel, RowList, PageRow, PRIMARY_CTA_CLASS, PRIMARY_CTA_STYLE } from '@/components/OnePage'
import { ringShare, todaySoFarPercent, compactCount } from '@/lib/one-page'
import { dayAsShown, eatenMacrosBySlot, aroundEatenKeptKey, readAroundEatenKept } from '@/lib/day-as-shown'
import { mealSections } from '@/lib/meal-sections'
import { SLOT_ORDER, SLOT_LABEL } from '@/components/MealPlan'
import type { PoolOption } from '@/lib/meal-generation'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
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

  // THE GLANCE LINE — what is in it, the lead lift, and tomorrow (the old
  // Tomorrow row moved in here, 2a). Each part is dropped when unknown.
  const glanceParts: string[] = []
  if (data.session.activity) {
    // An activity session reads like one: "20 min · Easy", not "0 exercises" (the walking plan, user test 8 Oct 2026).
    glanceParts.push(`${data.session.activity.minutes} min`)
    if (data.session.activity.effort) glanceParts.push(data.session.activity.effort)
  } else {
    if (status === 'in_progress' && data.session.minutesLeft != null) glanceParts.push(`~${data.session.minutesLeft} min left`)
    if (status !== 'in_progress') glanceParts.push(`${data.session.exerciseCount} exercise${data.session.exerciseCount === 1 ? '' : 's'}`)
  }
  // DELIBERATE DEVIATION FROM THE HANDOFF, kept: no "next" — the app knows the
  // heaviest lift, not the running order.
  const lift = data.session.leadLift && !data.session.activity ? leadLiftPhrase(data.session.leadLift, status) : null
  if (lift) glanceParts.push(lift)
  const tomorrow = data.tomorrow ?? null
  if (tomorrow) glanceParts.push(tomorrow.rest ? 'rest tomorrow' : `${tomorrow.focus} tomorrow`)
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

  return (
    // ONE PAGE (design 5c·5, 17 Oct 2026): the hero, its key, one coach note, then Up next and Progress
    // as hairline rows. Room at the foot for the docked button. docs/plans/one-page-tabs.md.
    <div className={`relative flex flex-col gap-[18px] ${showCta ? 'pb-24' : ''}`} data-home-page>
      {/* 1. WHO AND WHEN */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ds-label">{dateLabel}</p>
          <h2 className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">{greeting}</h2>
        </div>
        <span
          className="mt-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5"
          style={{ background: 'var(--surface-raised)' }}
          data-testid="home-streak"
          role="img"
          aria-label={`${data.streak} ${streakLabel(data.streak)}`}
        >
          <span aria-hidden className={`inline-block size-[5px] rounded-full ${data.streak > 0 ? 'bg-primary glow-mint-box' : 'bg-[color:var(--text-dim)]'}`} />
          <span className="tabular-mono text-[0.8125rem] font-semibold">{data.streak}</span>
          {/* "in a row", her 17 Oct ruling over the handoff's "days": the streak counts sessions. */}
          <span className="text-[0.6875rem] text-muted-foreground" data-testid="home-streak-label">{STREAK_PILL_WORDS}</span>
        </span>
      </div>

      {/* 2. TODAY SO FAR — the rings open Nutrition; Steps, in the key, opens the steps entry (her ruling). */}
      <div data-tour="tiles" className="flex flex-col gap-[18px]">
        <div className="grid grid-cols-2 items-center gap-x-[22px]" data-home-today>
          <div className="min-w-0">
            <p className="glow-mint text-[0.65625rem] font-semibold uppercase tracking-[.2em] text-primary-text">Today so far</p>
            <p className="tabular-mono glow-mint-lg mt-2 text-[3.5rem] font-bold leading-[.9] tracking-[-.04em]" style={{ color: 'var(--num-hero)' }} data-testid="home-so-far">
              {soFar == null ? '—' : `${soFar}%`}
            </p>
            <p className="mt-2 text-[0.75rem] text-muted-foreground">of today&apos;s targets</p>
          </div>
          <button type="button" onClick={toNutrition} className="justify-self-end" aria-label="Open Nutrition" data-home-rings>
            <RingMeter
              label={`Calories ${pct(calShare)}, protein ${pct(proteinShare)}, water ${pct(waterShare)}, steps ${pct(stepsShare)}`}
              rings={[
                { key: 'calories', share: calShare, color: 'var(--primary)', glow: true },
                { key: 'protein', share: proteinShare, color: 'var(--chart-2)' },
                { key: 'water', share: waterShare, color: 'var(--chart-3)' },
                { key: 'steps', share: stepsShare, color: 'var(--chart-4)' },
              ]}
            />
          </button>
        </div>
        <RingKey
          data-testid="home-ring-key"
          items={[
            { key: 'calories', label: 'Calories', color: 'var(--primary)', glow: true, value: Math.round(data.caloriesEaten).toLocaleString(), target: data.hasNutritionTargets ? `/${Math.round(data.caloriesTarget).toLocaleString()}` : undefined, onClick: toNutrition, ariaLabel: 'Calories — open Nutrition' },
            { key: 'protein', label: 'Protein', color: 'var(--chart-2)', value: String(Math.round(data.proteinEaten)), target: data.hasNutritionTargets ? `/${Math.round(data.proteinTarget)}g` : 'g', onClick: toNutrition, ariaLabel: 'Protein — open Nutrition' },
            { key: 'water', label: 'Water', color: 'var(--chart-3)', value: (data.waterMl / 1000).toFixed(1), target: `/${(data.waterTargetMl / 1000).toFixed(1)}L`, onClick: toNutrition, ariaLabel: 'Water — open Nutrition to log it' },
            { key: 'steps', label: 'Steps', color: 'var(--chart-4)', value: compactCount(stepsToday), target: `/${compactCount(stepsTarget)}`, onClick: () => setStepsOpen(o => !o), ariaLabel: `Steps: ${stepsToday.toLocaleString()} of ${stepsTarget.toLocaleString()}. Tap to log today's steps.` },
          ]}
        />
        {stepsOpen && (
          <div className="flex flex-col gap-1.5" data-home-steps-entry>
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
                className="h-10 w-28 rounded-[10px] px-3 text-[0.875rem] tabular-mono"
                style={{ background: 'var(--surface-sunken)' }}
              />
              <Button size="sm" className="h-10" onClick={() => void handleLogSteps()}>Log steps</Button>
            </span>
            {/* WHERE THE TARGET COMES FROM — shown while the input is open. */}
            <span className="text-[0.6875rem] leading-[1.35] text-muted-foreground/80">
              Target from the activity level your calorie target uses — override it in your profile.
            </span>
          </div>
        )}
        {stepsError && <span className="text-[0.6875rem] text-[color:var(--role-warn-text)]">{stepsError}</span>}
      </div>

      {/* 3. THE TRAINER'S NOTE — one per screen. */}
      {trainerNudge
        ? <TrainerNudge {...trainerNudge} />
        : plainTips.length > 0 && <HomeCoachNote tips={plainTips} />}

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

      {/* 4. UP NEXT — the session, the next meal, tomorrow. */}
      <section>
        <SectionLabel>Up next</SectionLabel>
        <RowList>
          <SessionRow
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
          />
          {nextMeal && nextMealSlot && (
            <PageRow
              icon={<UtensilsCrossed className="size-4" />}
              title={<>{SLOT_LABEL[nextMealSlot]} · {nextMeal.name}</>}
              sub={`${Math.round(nextMeal.macros.calories)} kcal · ${Math.round(nextMeal.macros.protein)}g P`}
              right={<span className="tabular-mono text-[0.78125rem] text-text-tertiary">{Math.round(nextMeal.macros.calories)}</span>}
              onClick={toNutrition}
              data-home-next-meal={nextMealSlot}
            />
          )}
          {tomorrow && (
            <PageRow
              icon={<Moon className="size-4" />}
              title={tomorrow.rest ? 'Tomorrow · Rest day' : <>Tomorrow · {tomorrow.focus}</>}
              sub={!tomorrow.rest && data.tomorrowLabel ? data.tomorrowLabel.split(' · ').slice(1).join(' · ') || undefined : undefined}
              data-home-tomorrow
            />
          )}
        </RowList>
        {cardioLines && <div className="pt-2">{cardioLines}</div>}
        <HomeWeekBoundaryNote days={week.days} todayDate={activeSession.date} />
      </section>

      {/* 5. PROGRESS — the weight (its header is the door to the weigh-in), the latest PR, the volume. */}
      <section>
        <SectionLabel rightMono={false} right={data.phase ? `${data.phase.phaseLabel ? `${data.phase.phaseLabel} · ` : ''}week ${data.phase.weekNumber} of ${data.phase.totalWeeks}` : undefined}>Progress</SectionLabel>
        <div className="border-y border-[color:var(--hairline)] py-3" data-home-weight>
          <button
            type="button"
            onClick={() => setWeighInOpen(o => !o)}
            aria-expanded={weighInOpen}
            className="flex w-full items-baseline justify-between gap-3 text-left"
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
        <div data-home-latest-pr>
          <PageRow
            className="border-t-0"
            icon={<Trophy className="size-4" />}
            iconTone={latestPr ? 'accent' : 'plain'}
            title={latestPr ? `${shortLiftName(latestPr.exerciseName)} · new PR` : 'Latest PR'}
            sub={latestPr ? prDay(latestPr.date, data.today, true) : 'none this week'}
            right={latestPr && (
              // The unit comes with the number, from the phrasebook — a bodyweight best is reps, never "0 kg".
              <span className="tabular-mono glow-mint text-[0.875rem] font-bold text-primary-text">{personalBest(bestReadingOf(latestPr.metric, latestPr.value, latestPr.setReps))}</span>
            )}
          />
        </div>
        <div data-home-volume>
          <PageRow
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
      </section>

      {/* 6. THE DOCKED BUTTON — today's session by name; gone on a rest day and once it is done. */}
      {showCta && (
        <div
          className="fixed inset-x-0 z-40 px-[22px] pb-3 pt-3.5"
          style={{ bottom: `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom))`, background: 'linear-gradient(to top, var(--background) 70%, transparent)' }}
          data-home-cta
        >
          <Button
            size="cta"
            className={`glow-bloom-once ${PRIMARY_CTA_CLASS}`}
            style={PRIMARY_CTA_STYLE}
            onClick={() => { window.location.hash = tabHash('exercise') }}
          >
            {status === 'not_started' ? (data.session.focus ? `Start ${data.session.focus}` : 'Start session') : 'Continue session'}
          </Button>
        </div>
      )}
      {card && (
        <Suspense fallback={null}>
          <SessionSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} data={card} />
        </Suspense>
      )}
    </div>
  )
}

/** "62%" for a share, "no target" without one — the ring meter's spoken label. */
function pct(share: number | null): string {
  return share == null ? 'no target' : `${Math.round(share * 100)}%`
}

/**
 * TODAY'S SESSION AS A ROW (5c·5): the dumbbell tile, the session's name, the glance line, and the week's
 * seven dots. Every state the old hero had is here: not yet planned, moved, rest, done (with its count,
 * PRs and the summary), and the session itself. data-tour and data-home-hero keep their names.
 */
function SessionRow({ status, data, week, sessionGlance, done, minutes, setsLogged, setsPlanned, prCount, topPr, onSummary }: {
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
}) {
  const dots = week.days.length > 0
    ? <HomeWeekDots days={week.days} todayName={data.dayName} done={week.sessionsDone} planned={week.sessionsPlanned} />
    : null
  const weekCount = `${week.sessionsDone} of ${week.sessionsPlanned} session${week.sessionsPlanned === 1 ? '' : 's'} done`
  let title: React.ReactNode
  let sub: React.ReactNode = null
  if (status === 'unknown') {
    // THE PLAN IS NOT HERE YET — and it is not a rest day (her 8 Sep ruling). No button: nothing to start.
    title = 'Checking your plan…'
  } else if (status === 'moved' && data.session.movedTo) {
    title = `Moved to ${data.session.movedTo.dayName}`
    sub = `${data.session.focus ?? "Today's session"} is waiting for you on ${data.session.movedTo.dayName} · ${weekCount}`
  } else if (status === 'rest') {
    title = 'Rest day'
    sub = `Recovery is part of the program · ${weekCount}`
  } else if (done) {
    title = `Done · ${data.session.focus}`
    sub = <span data-testid="home-session-glance">{sessionGlance}</span>
  } else {
    title = data.session.focus
    sub = (
      <>
        {/* The length only before a session starts (never while the plan is unknown: that branch is above). */}
        {status === 'not_started' && data.session.sessionLength && <><span data-testid="home-session-length">{data.session.sessionLength}</span> · </>}
        <span data-testid="home-session-glance">{sessionGlance}</span>
        {data.session.movedFrom && <> · {data.session.movedFrom.dayName}&apos;s session, moved here</>}
      </>
    )
  }
  return (
    <div className="border-b border-[color:var(--hairline)] py-2" data-tour="hero" data-home-hero={done ? 'done' : status}>
      <div className="flex min-h-[44px] items-center gap-3">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'var(--surface-raised)', color: 'var(--primary-text)' }}>
          {status === 'rest' ? <Moon className="size-4" /> : <Dumbbell className="size-4" />}
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => { window.location.hash = tabHash('exercise') }}
          aria-label={`${typeof title === 'string' ? title : data.session.focus ?? 'Today'} — open Exercise`}
        >
          <span className="block truncate text-[0.90625rem]">{title}</span>
          {sub && <span className="block truncate text-[0.71875rem] text-muted-foreground">{sub}</span>}
          {status === 'in_progress' && (
            <span className="tabular-mono block text-[0.71875rem] text-muted-foreground">{setsLogged} of {setsPlanned} sets</span>
          )}
        </button>
        {done && onSummary ? (
          <button type="button" onClick={onSummary} className="hit-slop-44 shrink-0 text-[0.6875rem] font-semibold text-text-tertiary" data-home-summary>
            Summary ›
          </button>
        ) : dots}
      </div>
      {done && (
        <p className="tabular-mono mt-1 pl-11 text-[0.71875rem] text-muted-foreground" data-home-done-stats>
          {minutes != null ? `${minutes} min` : '—'} · {setsLogged}/{setsPlanned} sets · <span className={prCount > 0 ? 'glow-mint text-primary-text' : ''} data-home-pr={prCount > 0 ? '' : undefined}>{prCount} PR{prCount === 1 ? '' : 's'}{topPr ? ` · ${topPr}` : ''}</span>
        </p>
      )}
    </div>
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
