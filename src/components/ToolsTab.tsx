import { programSummary } from '@/lib/one-page'
import { useEffect, useMemo, useState, Suspense, type ReactNode } from 'react'
import { lazyWithReload } from '@/lib/chunk-reload'
import { History, BookOpen, Timer, ChevronRight, TimerReset, ArrowLeft, Flag, ShoppingCart, TrendingUp, Play } from 'lucide-react'
// SPLIT OUT OF THE APP CHUNK. Neither of these is on screen when the tab
// loads: the round setup unfolds only under the Custom chip and the stopwatch
// opens from a row. Eagerly imported they pushed the app chunk 1 kB past its
// budget (test:bundle, 13 Sep 2026) for two panels most sessions never open.
const RoundTimerSheet = lazyWithReload(() => import('@/components/timers/RoundTimerSheet').then(m => ({ default: m.RoundTimerSheet })))
const StopwatchPanel = lazyWithReload(() => import('@/components/timers/TimersPanel').then(m => ({ default: m.StopwatchPanel })))
import { PlateCalculator } from '@/components/PlateCalculator'
import { PlateCard } from '@/components/PlateCard'
import { nextBarbellLift, weekEyebrow, programProgress, lastRoundLine, PLATE_CARD_DEFAULT_KG } from '@/lib/tools-card'
import { startLabel } from '@/lib/round-setup'
import { SessionHistoryDialog } from '@/components/exercise/SessionHistoryDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getSessionHistory, countSessions } from '@/lib/exercise-history'
import { getRecordsBeaten, refreshPRCacheFromDB } from '@/lib/pr-engine'
import { getAllItems, subscribeGroceryStore } from '@/lib/grocery-store'
import { programHash, groceryHash } from '@/lib/app-route'
import { RoundField } from '@/components/timers/RoundField'
import { RoundCard } from '@/components/timers/RoundCard'
import { useTimers } from '@/hooks/useTimers'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useTrainingWeek } from '@/hooks/useTrainingWeek'
import { parseConditioningInterval, ROUND_PRESETS } from '@/lib/timer-engine'
import type { WorkoutDay, MesocycleWeek, EquipmentAccess } from '@/lib/types'
import type { RoundLogSummary } from '@/lib/timer-engine'
import { AddUnplannedWork } from '@/components/exercise/AddUnplannedWork'
import { CircuitOffer } from '@/components/exercise/CircuitOffer'

// ---------------------------------------------------------------------------
// TOOLS IS ONE TIMER SURFACE — design handoff 2a (12 Sep 2026), then 4a
// (13 Sep 2026), which supersedes 2a for this layout.
//
// WHAT WAS HERE ORIGINALLY: six tiles, of which two opened the same panel in
// different modes, one ("Rest timer") could not do what its name said, and a
// grocery section sat BELOW the grid that a tile scrolled you down to.
//
// WHAT 2a LEFT: the round card, one row reading "Change the intervals", and a
// short "Also here" list. Grocery had gone to its own screen.
//
// WHAT 4b CHANGES, AND IT REVERSES 4a — ASHLEY'S RULING, 14 Sep 2026, on the
// shipped screen: *"I dont like that the round timer sits permanently at the
// top of the page. The round timer should only be there once you select it
// from inside the timers tab not permanently at the top of the tools section.
// Inside tools there should be a timers tab and inside that is where you
// select stopwatch lap timer or round timer and configure those settings."*
// Asked which shape the tab itself should take, she chose the plain list over
// the old six-tile grid.
//
// So: Tools is a LIST. One "Timers" row opens a sheet holding all three
// timers the app has — `TimerMode` is 'stopwatch' | 'lap' | 'round', and 4a
// had made only two of those reachable and neither of them by name. The round
// card is NOT on this surface at rest.
//
// THE ONE THING THE RULING DOES NOT SAY, decided here and stated so it can be
// overruled: a round that is actually RUNNING still shows its card on Tools.
// Burying a live clock behind a row would be worse than the thing she asked to
// fix, and "only there once you select it" is satisfied — you selected it.
// The dock chip (BottomDock) already carries a running timer everywhere else,
// so this is the second place it shows, not the only one.
//
// GROCERY IS BACK, also hers. It left on 12 Sep (6155405) and she reported it
// missing on 14 Sep. It is a row here AND on Nutrition — one list, two doors,
// which is what `test:chat-app-reality` now reads off these files to keep the
// coach honest about.
//
// 2a, 31 OCT 2026 (the five-tab polish, her "build, keep my rulings"): the
// same things, in the Home 2c language. One glowing TIMERS card with the three
// timers as tiles (each opens its own timer — no chooser step) and the last
// round to run again; a live plate card under it; Plan and Shop as grouped
// rows. Her 14 Sep ruling holds: no round card at rest, and the utilities are
// a list, not a tile grid. The running round takes the timers card's place.
//
// FULL SCREEN IS OPT-IN. A running round no longer seizes the tab — the card
// is the default and RoundField renders only after "Full screen" (the flag
// lives in useTimers, so a tab switch does not silently drop her out of it).
// ---------------------------------------------------------------------------

// THE THREE TIMERS THE APP ACTUALLY HAS. `TimerMode` in timer-store.ts is
// 'stopwatch' | 'lap' | 'round' and this list is one entry per member — so a
// fourth mode cannot be added without this row list going stale visibly,
// rather than the mode simply being unreachable the way 'stopwatch' was
// between 12 and 14 Sep 2026.
//
// 2a (31 Oct 2026): THE TILES ARE THE CHOOSER. Each opens its own timer in one
// tap — there is no "pick a timer" step in between any more. Still one entry
// per mode, for the reason above.
const TIMER_CHOICES: { mode: 'round' | 'stopwatch' | 'lap'; label: string; sub: string; icon: typeof Timer }[] = [
  { mode: 'round', label: 'Round', sub: 'Tabata, EMOM, intervals', icon: TimerReset },
  { mode: 'stopwatch', label: 'Stopwatch', sub: 'Counts up', icon: Timer },
  { mode: 'lap', label: 'Lap', sub: 'Records each lap', icon: Flag },
]

export interface ToolsTabProps {
  profileId?: string
  /**
   * The training week, so the round timer can offer today's conditioning as a
   * one-tap prefill.
   */
  exercisePlan?: WorkoutDay[]
  /** For the "Your program" row's subtitle — how many weeks, which block. */
  mesocycle?: MesocycleWeek[]
  /** Which mesocycle week is live, so the block number is the one they are in. */
  liveWeek?: number
  /** The kit tier, so the cardio quick picks on the "log this round" sheet are ones the person can do. */
  equipmentAccess?: EquipmentAccess
  /** When the plan began, so "is today's session still due" is the same answer Today gives. */
  planCreatedAt?: string
  /** App's logsVersion: bumped by a day write made elsewhere (the coach moving a session), so Tools re-reads today. */
  logsVersion?: number
  /** Tell App a day changed (the circuit counted as today's workout), so every screen re-reads it. */
  onLogsUpdated?: () => void
}

/** Stable identity, so a missing plan does not hand the week hook a fresh array each render. */
const EMPTY_PLAN: WorkoutDay[] = []

export function ToolsTab({ profileId, exercisePlan, mesocycle, liveWeek, equipmentAccess, planCreatedAt, logsVersion, onLogsUpdated }: ToolsTabProps) {
  const timers = useTimers()
  // The session facade already owns "which day is it" (frozen at session
  // start, dev-clock aware). Deriving it again here from a fresh Date would
  // be a second answer to a question this app deliberately has one owner for.
  const { date: todayDate, logs: setLogs } = useActiveSession()
  // TODAY'S SESSION IS THE ONE RUN TODAY, moves taken into account — the same
  // seven cells the week strip is drawn from. This looked the weekday up in
  // the plan's raw rows, so on a day a session had moved ONTO it offered no
  // conditioning timer, and on the day it had moved OFF it offered the timer
  // for a session being done elsewhere (H19's twentieth reader, 9 Oct 2026).
  // The same hook also answers the circuit offer under a logged block (her ruling A, 8 Oct 2026), so the two
  // places cannot disagree about whether the session is still due.
  const liveDays = mesocycle?.find(w => w.week_number === liveWeek)?.days ?? exercisePlan ?? EMPTY_PLAN
  const week = useTrainingWeek(profileId, todayDate, liveDays, planCreatedAt, logsVersion, mesocycle)
  const todayCell = week.days.find(d => d.date === todayDate)
  const todaysSession = (todayCell?.movedTo ? null : todayCell?.session) ?? undefined
  const todaysConditioning = (todayCell?.movedTo ? null : todayCell?.session)?.recommendedCardio

  const [historyCount, setHistoryCount] = useState<{ sessions: number; prs: number } | null>(null)
  const [groceryCount, setGroceryCount] = useState<{ total: number; checked: number } | null>(null)
  const [plateOpen, setPlateOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  // THE TIMERS SHEET, and which of the three it is showing. One piece of
  // state, so the sheet cannot be open on a timer it is not showing. 2a: no
  // chooser inside it any more — a tile on the tab opens its timer directly,
  // and the sheet's "back" returns to the tab, where the tiles are.
  const [timersOpen, setTimersOpen] = useState(false)
  const [timerPick, setTimerPick] = useState<'round' | 'stopwatch' | 'lap'>('round')
  const [plateStartKg, setPlateStartKg] = useState<number>(PLATE_CARD_DEFAULT_KG)
  // The finished round waiting to be written down, and the line that says it
  // was. Ashley, 12 Sep 2026: "I logged it but it doesn't show anywhere on the
  // app" — it never wrote anything, and it never said so either.
  const [roundToLog, setRoundToLog] = useState<RoundLogSummary | null>(null)
  const [loggedNote, setLoggedNote] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    void Promise.all([getSessionHistory(profileId, 100), refreshPRCacheFromDB(profileId).catch(() => {})])
      .then(([rows]) => {
        if (cancelled) return
        // RECORDS BEATEN, not exercises logged. This counted the cache's keys
        // — one per exercise ever logged — so two workouts read "7 PRs" with
        // no record broken. Same list Home's "Recent PRs" is drawn from.
        // LIFTING SESSIONS, as it has always counted: the history now also
        // lists a day of cardio with no lifting (H7), and that must not turn
        // "5 sessions" into 7 without anyone deciding it should.
        setHistoryCount({ sessions: countSessions(rows), prs: getRecordsBeaten(profileId).length })
      })
      .catch(() => { if (!cancelled) setHistoryCount(null) })
    return () => { cancelled = true }
  }, [profileId])

  // LIVE, NOT READ ONCE. The subtitle is a count, and a count that does not
  // follow the list is the stale-after-write class this app has a gate for —
  // tick an item off on the grocery screen, come back, and a fixed number
  // would still claim the old total. subscribeGroceryStore is the same seam
  // the grocery screen itself listens on.
  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    const read = () => {
      void getAllItems(profileId)
        .then(rows => {
          if (cancelled) return
          setGroceryCount({ total: rows.length, checked: rows.filter(r => r.checked).length })
        })
        .catch(() => { if (!cancelled) setGroceryCount(null) })
    }
    read()
    const unsubscribe = subscribeGroceryStore(read)
    return () => { cancelled = true; unsubscribe() }
  }, [profileId])

  // THE PROGRAM ROW'S LINE MOVED HERE (30 Oct 2026, "less is more", when the Program card left Exercise):
  // the block she is in and when its deload is, from the plan's own blocks (programSummary).
  const summary = mesocycle && mesocycle.length > 0 ? programSummary(mesocycle, liveWeek ?? 1) : null
  const programSub = summary
    ? [summary.title, summary.deload].filter(Boolean).join(' · ') || `${mesocycle!.length} weeks`
    : 'Your whole plan, week by week'

  // STARTED AND NOT RESET — the condition the running card renders on. Paused
  // counts: pauseRound sets running:false, and a round that only checked
  // `running` used to make the whole timer vanish the moment you tapped Pause.
  // You pause to catch your breath, not to lose your place.
  const roundLive =
    timers.mode === 'round' && !!timers.roundConfig
    && (timers.running || timers.isRoundComplete || timers.isActive)

  // START CLOSES THE SHEET — 4b. The card's Start button lives inside the
  // sheet now, so without this you tap Start and keep staring at the sheet,
  // with the running card behind it on the tab. Fires only on the transition
  // into live, so re-opening the sheet on a running round (which the Timers
  // row deliberately allows, to reach Pause and Log) does not slam it shut.
  useEffect(() => {
    if (roundLive) setTimersOpen(false)
  }, [roundLive])

  // WHAT THE IDLE CARD DESCRIBES, resolved in ONE place and handed to both the
  // card and the chips. A fallback computed twice is a card describing Tabata
  // above a chip row with nothing lit.
  const todaysConfig = parseConditioningInterval(todaysConditioning?.activity)
  const idleConfig = timers.selectedRoundConfig ?? todaysConfig ?? ROUND_PRESETS[0].config

  // THE SHEET WHERE THE FINISHED ROUND IS WRITTEN DOWN. Rendered once, beside
  // both branches, because the full-screen branch returns early and a sheet
  // mounted only in the normal layout could never open from the field.
  const logSheet = (
    <AddUnplannedWork
      open={!!roundToLog}
      onOpenChange={o => { if (!o) setRoundToLog(null) }}
      hideTrigger
      equipmentAccess={equipmentAccess}
      // ABOVE THE FIELD, NOT UNDER IT. The full-screen branch below renders
      // this beside RoundField, which is fixed and opaque over the whole
      // viewport — so an in-flow sheet opened where nobody could see it.
      overlay
      prefill={roundToLog
        ? { durationMinutes: roundToLog.durationMinutes, notes: roundToLog.detail }
        : undefined}
      onCardioLogged={view => {
        // ONLY NOW. The round is released after the write, not before it —
        // resetting first is what threw the session away last time. The note
        // names the block she chose ("Skipping rope · 5 × 3 min"), not the
        // timer's "Intervals" (circuit log, 8 Oct 2026).
        setLoggedNote(`Logged · ${view.activity_name} · ${roundToLog?.detail ?? `${view.duration_minutes} min`}`)
        setRoundToLog(null)
        timers.reset()
      }}
    />
  )

  // THE PLATE CARD STARTS ON HER NEXT BARBELL LIFT — today's if it is still to
  // do, else the next one this week, else next week's plan. A HOOK, so it sits
  // ABOVE the full-screen early return: below it, going full screen changed
  // the hook count and the whole tab crashed (found by verify:tools-timer).
  const nextLift = useMemo(() => nextBarbellLift(
    week.days, todayDate, mesocycle?.find(w => w.week_number === (liveWeek ?? 1) + 1)?.days,
  ), [week.days, todayDate, mesocycle, liveWeek])

  if (roundLive && timers.roundFullScreen) {
    // NO `relative` AND NO minHeight HERE. Both used to be, and together they
    // were the bug: they made this wrapper the containing block for
    // RoundField's positioning, so the full-bleed field became a card sitting
    // in the page's padding. RoundField is `fixed` and belongs to the
    // viewport, so this wrapper must stay unpositioned or it captures it again.
    return (
      <div>
        <RoundField onLogSession={setRoundToLog} />
        {logSheet}
      </div>
    )
  }

  // OPEN ONE TIMER, DIRECTLY — 2a. A mode switch wipes the timer record, so a
  // live round is never walked away from here: the tiles are not drawn while
  // one runs, and this refuses if it is reached any other way. Re-tapping the
  // timer that is already the mode does not switch, so a running stopwatch is
  // not reset by opening it again.
  const openTimer = (mode: 'round' | 'stopwatch' | 'lap') => {
    if (roundLive && mode !== 'round') return
    if (mode !== 'round' && timers.mode !== mode) timers.setMode(mode)
    setTimerPick(mode)
    setTimersOpen(true)
  }

  // THE LAST ROUND, rerun in one tap. Only when there is one: the protocol she
  // last chose or ran. Named by the preset table (lastRoundLine), never typed
  // here, and started exactly as the sheet's own Start starts it — with the
  // countdown she chose, said on the button.
  const prefs = timers.timerPrefs
  const lastRound = timers.selectedRoundConfig
  const lastLine = lastRound ? lastRoundLine(lastRound) : null
  const startLastRound = () => {
    if (!lastRound) return
    timers.startRound({ ...lastRound, leadInSeconds: prefs.countdownSeconds })
    if (prefs.openFullScreenOnStart) timers.setRoundFullScreen(true)
  }

  const eyebrow = weekEyebrow(mesocycle, liveWeek)
  const progress = programProgress(mesocycle, liveWeek)
  const bar = (fraction: number) => (
    <span className="block h-1 w-12 overflow-hidden rounded-full" style={{ background: 'var(--hairline)' }}>
      <span
        className="block h-1 rounded-full"
        style={{ width: `${Math.round(fraction * 100)}%`, background: 'var(--primary)', boxShadow: '0 0 calc(8px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .8)' }}
      />
    </span>
  )
  const programTrail = progress != null ? bar(progress) : null
  const historyTrail = historyCount ? (
    <span
      data-history-prs
      className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[0.6875rem] font-bold"
      style={historyCount.prs > 0 ? {
        background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
        border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)',
        boxShadow: '0 0 calc(12px * var(--glow-strength, 1)) rgba(var(--glow-rgb), .35)',
        color: 'var(--primary-text)',
      } : { border: '1px solid var(--hairline)', color: 'var(--muted-foreground)' }}
    >
      <TrendingUp className="size-[11px]" aria-hidden />
      {historyCount.prs} PR{historyCount.prs === 1 ? '' : 's'}
    </span>
  ) : null
  const groceryTrail = groceryCount && groceryCount.total > 0 ? (
    <span className="flex shrink-0 flex-col items-end gap-[5px]">
      <span data-grocery-fraction className="tabular-mono text-xs text-text-tertiary">{groceryCount.checked}/{groceryCount.total}</span>
      {bar(groceryCount.checked / groceryCount.total)}
    </span>
  ) : null

  // THE PLAN AND SHOP GROUPS — 2a. Every row still goes somewhere, and every
  // subtitle is still read from its store (test:tools-grid §2). The timers and
  // the plate calculator are the two cards above them now.
  const rows: { group: 'Plan' | 'Shop'; label: string; sub: string; icon: typeof Timer; trail: ReactNode; testid: string; onClick: () => void }[] = [
    { group: 'Plan', label: 'Your program', sub: programSub, icon: BookOpen, trail: programTrail, testid: 'program-row', onClick: () => { window.location.hash = programHash() } },
    {
      group: 'Plan',
      label: 'Session history',
      sub: historyCount ? `${historyCount.sessions} session${historyCount.sessions === 1 ? '' : 's'} logged` : 'Everything you have logged',
      icon: History,
      trail: historyTrail,
      testid: 'history-row',
      onClick: () => setHistoryOpen(true),
    },
    {
      // BACK ON TOOLS — hers, 14 Sep. The subtitle is the live count rather
      // than a fixed label, so the row answers "is there anything to buy"
      // without opening it.
      group: 'Shop',
      label: 'Grocery list',
      sub: groceryCount ? `${groceryCount.total} item${groceryCount.total === 1 ? '' : 's'} · ${groceryCount.checked} checked` : 'This week’s shopping',
      icon: ShoppingCart,
      trail: groceryTrail,
      testid: 'grocery-row',
      onClick: () => { window.location.hash = groceryHash() },
    },
  ]

  const heroStyle = {
    background: 'radial-gradient(120% 90% at 100% 0%, rgba(var(--glow-rgb), .20), transparent 55%), var(--card)',
    border: '1px solid rgba(var(--glow-rgb), .30)',
    boxShadow: '0 10px 30px rgba(0,0,0,.35)',
  }

  return (
    <div className="flex flex-col gap-5">
      {/* SAY THE WRITE HAPPENED. A cardio log is local-first and queued, so
          the round leaves the screen the instant it saves and there would
          otherwise be nothing at all to show for it — which is
          indistinguishable from the button that never logged. */}
      {loggedNote && (
        <button
          type="button"
          onClick={() => setLoggedNote(null)}
          className="rounded-xl px-3.5 py-2.5 text-left text-[0.8125rem]"
          style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--foreground)' }}
        >
          {loggedNote} — it's on your week and the coach can see it. Tap to dismiss.
        </button>
      )}
      {loggedNote && (
        <CircuitOffer
          profileId={profileId}
          date={todayDate}
          day={week.days.find(d => d.date === todayDate)}
          session={todaysSession}
          workingSetsToday={setLogs.filter(l => !l.is_warmup && (l.drop_index ?? 0) === 0).length}
          onChanged={() => { week.refresh(); onLogsUpdated?.() }}
        />
      )}

      <div className="flex flex-col gap-1">
        {eyebrow && (
          <span data-tools-eyebrow className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</span>
        )}
        <p className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.03em]">Tools</p>
      </div>

      {/* THE TIMERS CARD — 2a, and her 14 Sep ruling kept: at rest there is NO
          round card here, only the three timers to pick from and, when there
          is one, the last round to run again. While a round is live this same
          place becomes the running round, because hiding a clock that is
          counting would be a worse bug than the one her ruling fixed. The
          tour stop points at this wrapper, which is drawn in both states. */}
      <div data-tour="toolstimer">
        {!roundLive && (
          <div data-timers-card className="rounded-[24px] p-5" style={heroStyle}>
            <div className="flex items-center justify-between gap-3">
              <span className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--primary-text)' }}>Timers</span>
              {/* The rest timer is explained, not faked: it is not one of these. */}
              <span data-set-rest-note className="min-w-0 truncate text-[0.6875rem] text-text-tertiary">Set rest runs in your session</span>
            </div>
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              {TIMER_CHOICES.map(choice => (
                <button
                  key={choice.mode}
                  type="button"
                  data-timer-choice={choice.mode}
                  onClick={() => openTimer(choice.mode)}
                  className="flex min-h-[88px] flex-col items-start justify-start gap-3 rounded-2xl px-2.5 py-3 text-left"
                  style={{
                    background: 'color-mix(in srgb, var(--background) 55%, transparent)',
                    border: choice.mode === 'round' ? '1px solid rgba(var(--glow-rgb), .35)' : '1px solid var(--hairline)',
                  }}
                >
                  <choice.icon className="size-5 shrink-0" style={{ color: choice.mode === 'round' ? 'var(--primary-text)' : 'var(--role-ai-label)' }} aria-hidden />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{choice.label}</span>
                    <span className="text-[0.65625rem] leading-[1.3] text-muted-foreground">{choice.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            {lastRound && lastLine && (
              <div data-last-round className="mt-3.5 flex items-center gap-3 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">Last round</div>
                  <div className="mt-[3px] text-sm font-medium">
                    <span data-last-round-name>{lastLine.name}</span>
                    <span className="tabular-mono text-xs text-text-tertiary"> · {lastLine.total}</span>
                  </div>
                  <div data-last-round-numbers className="tabular-mono mt-px truncate whitespace-nowrap text-[0.6875rem] text-text-tertiary">{lastLine.numbers}</div>
                </div>
                <button
                  type="button"
                  data-last-round-start
                  onClick={startLastRound}
                  className="glow-mint-box flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] px-3 text-[0.8125rem] font-bold"
                  style={{
                    background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white) 0%, var(--primary) 55%, var(--primary-2) 100%)',
                    color: 'var(--primary-foreground)',
                  }}
                >
                  <Play className="size-3 fill-current" aria-hidden />
                  {startLabel(prefs.countdownSeconds)}
                </button>
              </div>
            )}
          </div>
        )}
        {roundLive && (
          <RoundCard live idleConfig={idleConfig} hero onLogSession={setRoundToLog}
            onOpenSetup={() => openTimer('round')}
            // A FINISHED ROUND IS NOT RUNNING (runs 3-4, LOW): the line says
            // which it is, and why the other two timers are not offered.
            note={timers.isRoundComplete ? 'Round finished — log it, or reset to use the stopwatch and lap.' : 'Stopwatch and lap open once this round ends or is reset.'}
          />
        )}
      </div>

      <PlateCard
        liftName={nextLift?.name ?? null}
        startKg={nextLift?.kg ?? PLATE_CARD_DEFAULT_KG}
        onOpen={kg => { setPlateStartKg(kg); setPlateOpen(true) }}
      />

      {(['Plan', 'Shop'] as const).map(group => (
        <div key={group}>
          <p className="px-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-text-tertiary">{group}</p>
          <div className="mt-2 overflow-hidden rounded-[20px]" style={{ background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}>
            {rows.filter(r => r.group === group).map((row, i) => (
              <button
                key={row.label}
                type="button"
                data-testid={row.testid}
                onClick={row.onClick}
                className="flex min-h-[64px] w-full items-center gap-3 px-3.5 text-left"
                style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'color-mix(in srgb, var(--chart-2) 14%, transparent)', color: 'var(--role-ai-label)' }}
                >
                  <row.icon className="size-[17px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium">{row.label}</span>
                  <span className="mt-0.5 block text-[0.71875rem] leading-[1.3] text-muted-foreground">{row.sub}</span>
                </span>
                {row.trail}
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* THE TIMERS SHEET — the timer a tile opened, configured here.
          NO max-w OVERRIDE. The stopwatch dialog this replaces carried
          `max-w-[22rem]` (352px), which is NARROWER than DialogContent's own
          `max-w-[calc(100%-2rem)]` (358px on a 390px phone) — so the round
          card inside it had ~50px less room than it had on the tab and
          "Full screen" wrapped onto two lines. Read off a screenshot, not
          reasoned about. */}
      <Dialog open={timersOpen} onOpenChange={setTimersOpen}>
        {/* THE ROUND TIMER IS A FULL-SCREEN SHEET — 4c. Its own top bar
            ("‹ Timers", the title, the sound toggle) and a docked Start, so
            the dialog's padding, header and ✕ step aside for it. The
            stopwatch keeps the ordinary dialog. */}
        <DialogContent
          showCloseButton={timerPick !== 'round'}
          className={timerPick === 'round'
            ? 'inset-0 top-0 left-0 h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 pt-[env(safe-area-inset-top,0px)] sm:max-w-none [&_[data-slot=dialog-body]]:p-0 [&_[data-slot=dialog-body]]:gap-0'
            : '[&_[data-slot=dialog-body]]:px-3'}
        >
          {timerPick !== 'round' && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {/* BACK GOES TO THE TAB, where the three timers are (2a). */}
              <button
                type="button"
                aria-label="Back to the timer list"
                onClick={() => setTimersOpen(false)}
                className="hit-slop-44 -ml-1 flex size-6 items-center justify-center"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              {timerPick === 'lap' ? 'Lap timer' : 'Stopwatch'}
            </DialogTitle>
          </DialogHeader>
          )}

          {timerPick === 'round' && (
            <Suspense fallback={null}>
              <RoundTimerSheet
                todaysConfig={todaysConfig}
                live={roundLive}
                selected={idleConfig}
                todaysSessionName={todaysConfig ? (todayCell?.session?.focus ?? null) : null}
                onBack={() => setTimersOpen(false)}
                onLogSession={setRoundToLog}
              />
            </Suspense>
          )}

          {(timerPick === 'stopwatch' || timerPick === 'lap') && (
            <Suspense fallback={null}>
              <StopwatchPanel />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>

      <PlateCalculator open={plateOpen} onOpenChange={setPlateOpen} initialWeight={plateStartKg} />
      <SessionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} profileId={profileId} />
      {logSheet}
    </div>
  )
}
