import { useEffect, useState, lazy, Suspense } from 'react'
import { Disc, History, BookOpen, Timer, ChevronRight, List, TimerReset, ArrowLeft } from 'lucide-react'
// SPLIT OUT OF THE APP CHUNK. Neither of these is on screen when the tab
// loads: the round setup unfolds only under the Custom chip and the stopwatch
// opens from a row. Eagerly imported they pushed the app chunk 1 kB past its
// budget (test:bundle, 13 Sep 2026) for two panels most sessions never open.
const RoundSetupPanel = lazy(() => import('@/components/timers/TimersPanel').then(m => ({ default: m.RoundSetupPanel })))
const StopwatchPanel = lazy(() => import('@/components/timers/TimersPanel').then(m => ({ default: m.StopwatchPanel })))
import { PlateCalculator } from '@/components/PlateCalculator'
import { SessionHistoryDialog } from '@/components/exercise/SessionHistoryDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getSessionHistory } from '@/lib/exercise-history'
import { getPRCache } from '@/lib/pr-engine'
import { getAllItems, subscribeGroceryStore } from '@/lib/grocery-store'
import { programHash, groceryHash } from '@/lib/app-route'
import { RoundField } from '@/components/timers/RoundField'
import { RoundCard } from '@/components/timers/RoundCard'
import { ProtocolChips, protocolChoices } from '@/components/timers/ProtocolChips'
import { useTimers } from '@/hooks/useTimers'
import { useActiveSession } from '@/hooks/useActiveSession'
import { parseConditioningInterval, ROUND_PRESETS } from '@/lib/timer-engine'
import type { WorkoutDay, MesocycleWeek } from '@/lib/types'
import type { RoundLogSummary } from '@/lib/timer-engine'
import { AddUnplannedWork } from '@/components/exercise/AddUnplannedWork'

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
// FULL SCREEN IS OPT-IN. A running round no longer seizes the tab — the card
// is the default and RoundField renders only after "Full screen" (the flag
// lives in useTimers, so a tab switch does not silently drop her out of it).
// ---------------------------------------------------------------------------

// THE THREE TIMERS THE APP ACTUALLY HAS. `TimerMode` in timer-store.ts is
// 'stopwatch' | 'lap' | 'round' and this list is one entry per member — so a
// fourth mode cannot be added without this row list going stale visibly,
// rather than the mode simply being unreachable the way 'stopwatch' was
// between 12 and 14 Sep 2026.
const TIMER_CHOICES: { mode: 'round' | 'stopwatch' | 'lap'; label: string; sub: string; icon: typeof Timer }[] = [
  { mode: 'round', label: 'Round timer', sub: 'Tabata, EMOM, intervals \u2014 or your own', icon: TimerReset },
  { mode: 'stopwatch', label: 'Stopwatch', sub: 'Counts up, nothing else', icon: Timer },
  { mode: 'lap', label: 'Lap timer', sub: 'Counts up and records each lap', icon: History },
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
}

export function ToolsTab({ profileId, exercisePlan, mesocycle, liveWeek }: ToolsTabProps) {
  const timers = useTimers()
  // The session facade already owns "which day is it" (frozen at session
  // start, dev-clock aware). Deriving it again here from a fresh Date would
  // be a second answer to a question this app deliberately has one owner for.
  const { dayName } = useActiveSession()
  const todaysConditioning = (exercisePlan ?? []).find(d => d.day === dayName)?.recommendedCardio

  const [historyCount, setHistoryCount] = useState<{ sessions: number; prs: number } | null>(null)
  const [groceryCount, setGroceryCount] = useState<{ total: number; checked: number } | null>(null)
  const [plateOpen, setPlateOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  // THE TIMERS SHEET, and which of the three is open inside it. `null` is the
  // three-way chooser; the rest are the panels. One piece of state, so the
  // sheet cannot be open on a timer it is not showing.
  const [timersOpen, setTimersOpen] = useState(false)
  const [timerPick, setTimerPick] = useState<'round' | 'stopwatch' | 'lap' | null>(null)
  // The finished round waiting to be written down, and the line that says it
  // was. Ashley, 12 Sep 2026: "I logged it but it doesn't show anywhere on the
  // app" — it never wrote anything, and it never said so either.
  const [roundToLog, setRoundToLog] = useState<RoundLogSummary | null>(null)
  const [loggedNote, setLoggedNote] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    void getSessionHistory(profileId, 100)
      .then(rows => {
        if (cancelled) return
        // PRs come from the same cache the Home list and the set grid read;
        // counting them here rather than deriving a second definition.
        setHistoryCount({ sessions: rows.length, prs: Object.keys(getPRCache(profileId)).length })
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

  const blockOf = (week: number) => Math.floor((week - 1) / 4) + 1
  const programSub = mesocycle && mesocycle.length > 0
    ? `${mesocycle.length} weeks · block ${blockOf(liveWeek ?? 1)} of ${Math.max(1, Math.ceil(mesocycle.length / 4))}`
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
  const choices = protocolChoices(todaysConfig, timers.customRoundConfig)

  // THE SHEET WHERE THE FINISHED ROUND IS WRITTEN DOWN. Rendered once, beside
  // both branches, because the full-screen branch returns early and a sheet
  // mounted only in the normal layout could never open from the field.
  const logSheet = (
    <AddUnplannedWork
      open={!!roundToLog}
      onOpenChange={o => { if (!o) setRoundToLog(null) }}
      hideTrigger
      prefill={roundToLog
        ? { activityName: roundToLog.activityName, durationMinutes: roundToLog.durationMinutes, notes: roundToLog.detail }
        : undefined}
      onCardioLogged={() => {
        // ONLY NOW. The round is released after the write, not before it —
        // resetting first is what threw the session away last time.
        setLoggedNote(`Logged · ${roundToLog?.activityName} · ${roundToLog?.durationMinutes} min`)
        setRoundToLog(null)
        timers.reset()
      }}
    />
  )

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

  const rows: { label: string; sub: string; icon: typeof Timer; onClick: () => void; disabled?: boolean; tour?: string }[] = [
    {
      // THE ONE DOOR TO ALL THREE TIMERS — 4b. It is first because it is what
      // this tab is mostly for, and it carries the tour stop, which used to
      // point at the round card that is no longer here at rest.
      label: 'Timers',
      sub: roundLive ? 'A round is running' : 'Round timer, stopwatch, lap timer',
      icon: TimerReset,
      tour: 'toolstimer',
      onClick: () => { setTimerPick(roundLive ? 'round' : null); setTimersOpen(true) },
    },
    {
      // BACK ON TOOLS — hers, 14 Sep. The subtitle is the live count rather
      // than a fixed label, so the row answers "is there anything to buy"
      // without opening it.
      label: 'Grocery list',
      sub: groceryCount
        ? `${groceryCount.total} item${groceryCount.total === 1 ? '' : 's'} · ${groceryCount.checked} checked`
        : 'This week\u2019s shopping',
      icon: List,
      onClick: () => { window.location.hash = groceryHash() },
    },
    {
      // "your plates" promised a plate inventory that has never existed —
      // equipment is a four-value enum and nothing anywhere records what is
      // on your gym floor. The calculator offers every standard loading and
      // lets you pick; the subtitle says that instead of implying it knows.
      label: 'Plate calculator', sub: 'Options for any weight', icon: Disc,
      onClick: () => setPlateOpen(true),
    },
    {
      label: 'Session history',
      sub: historyCount ? `${historyCount.sessions} session${historyCount.sessions === 1 ? '' : 's'} · ${historyCount.prs} PR${historyCount.prs === 1 ? '' : 's'}` : 'Everything you have logged',
      icon: History,
      onClick: () => setHistoryOpen(true),
    },
    { label: 'Your program', sub: programSub, icon: BookOpen, onClick: () => { window.location.hash = programHash() } },
  ]

  return (
    <div className="flex flex-col gap-[26px]">
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

      <p className="text-[1.75rem] font-bold leading-none">Tools</p>

      {/* ONLY WHEN IT IS ACTUALLY RUNNING — 4b. At rest this whole section
          is absent and Tools is the list below; the timers live behind the
          "Timers" row. A live round still shows, because hiding a clock that
          is counting would be a worse bug than the one this fixes. */}
      {roundLive && (
        <div>
          <p className="ds-label">Round timer</p>
          <div className="mt-2.5 flex flex-col gap-3">
            <RoundCard live idleConfig={idleConfig} onLogSession={setRoundToLog} />
          </div>
        </div>
      )}

      <div>
        <p className="ds-label">Everything here</p>
        <div className="mt-1.5">
          {rows.map((row, i) => (
            <button
              key={row.label}
              type="button"
              data-tour={row.tour}
              onClick={row.onClick}
              disabled={row.disabled}
              className="flex min-h-[44px] w-full items-center gap-3 py-3 text-left disabled:opacity-55"
              style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
            >
              <row.icon className="size-[18px] shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-medium">{row.label}</span>
                <span className="mt-0.5 block text-[0.71875rem] leading-[1.3] text-muted-foreground">{row.sub}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      </div>

      {/* THE TIMERS SHEET — pick one of the three, then configure it here.
          Choosing a mode CLEARS the timer record, so the chooser refuses to
          walk away from a live round rather than wiping it silently; that was
          already true of the old stopwatch row and is stated on the row. */}
      <Dialog open={timersOpen} onOpenChange={o => { setTimersOpen(o); if (!o) setCustomOpen(false) }}>
        {/* NO max-w OVERRIDE. The stopwatch dialog this replaces carried
            `max-w-[22rem]` (352px), which is NARROWER than DialogContent's own
            `max-w-[calc(100%-2rem)]` (358px on a 390px phone) — so the round
            card inside it had ~50px less room than it had on the tab and
            "Full screen" wrapped onto two lines. Read off a screenshot, not
            reasoned about. The default matches the tab, so the card renders
            the same in both places. */}
        <DialogContent className="[&_[data-slot=dialog-body]]:px-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {timerPick && (
                <button
                  type="button"
                  aria-label="Back to the timer list"
                  onClick={() => setTimerPick(null)}
                  className="hit-slop-44 -ml-1 flex size-6 items-center justify-center"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                </button>
              )}
              {timerPick === 'round' ? 'Round timer' : timerPick === 'lap' ? 'Lap timer' : timerPick === 'stopwatch' ? 'Stopwatch' : 'Timers'}
            </DialogTitle>
          </DialogHeader>

          {timerPick === null && (
            <div data-testid="timer-choices">
              {TIMER_CHOICES.map((choice, i) => (
                <button
                  key={choice.mode}
                  type="button"
                  data-timer-choice={choice.mode}
                  disabled={roundLive && choice.mode !== 'round'}
                  onClick={() => {
                    if (roundLive && choice.mode !== 'round') return
                    if (choice.mode !== 'round') timers.setMode(choice.mode)
                    setTimerPick(choice.mode)
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 py-3 text-left disabled:opacity-55"
                  style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
                >
                  <choice.icon className="size-[18px] shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-medium">{choice.label}</span>
                    <span className="mt-0.5 block text-[0.71875rem] leading-[1.3] text-muted-foreground">
                      {roundLive && choice.mode !== 'round' ? 'Finish or reset your round first' : choice.sub}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </div>
          )}

          {timerPick === 'round' && (
            <div className="flex flex-col gap-3">
              <RoundCard live={roundLive} idleConfig={idleConfig} onLogSession={setRoundToLog} />
              <ProtocolChips
                choices={choices}
                live={roundLive}
                selected={roundLive ? timers.roundConfig : idleConfig}
                customOpen={customOpen}
                onOpenCustom={setCustomOpen}
              />
              {customOpen && (
                <Suspense fallback={null}>
                  <RoundSetupPanel onDone={() => setCustomOpen(false)} />
                </Suspense>
              )}
              <p className="text-[0.71875rem] leading-[1.45] text-muted-foreground">
                Rest between sets runs itself in the session dock — this is for conditioning.
              </p>
            </div>
          )}

          {(timerPick === 'stopwatch' || timerPick === 'lap') && (
            <Suspense fallback={null}>
              <StopwatchPanel />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>

      <PlateCalculator open={plateOpen} onOpenChange={setPlateOpen} />
      <SessionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} profileId={profileId} />
      {logSheet}
    </div>
  )
}
