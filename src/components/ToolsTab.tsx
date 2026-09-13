import { useEffect, useState, lazy, Suspense } from 'react'
import { Disc, History, BookOpen, Timer, ChevronRight } from 'lucide-react'
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
import { programHash } from '@/lib/app-route'
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
// WHAT 4a CHANGES, and why the row had to go with it. Choosing between six
// protocols that each fit on one line was a tap to a second screen, a scroll,
// a decision and a tap back — on a gym floor, between rounds. The protocols
// are chips now, always under the card, and the card is ALWAYS PRESENT: idle
// it holds the total time you would be starting, running it holds the clock.
// Same box, same buttons in the same places; starting swaps the clock in and
// nothing moves.
//
// THE STOPWATCH / LAP / ROUND TAB STRIP IS GONE TOO. Round is this tab's
// content, so a tab labelled "Round" beside it was the surface competing with
// itself; the stopwatch is one row in "Also here" and opens on its own.
//
// FULL SCREEN IS OPT-IN. A running round no longer seizes the tab — the card
// is the default and RoundField renders only after "Full screen" (the flag
// lives in useTimers, so a tab switch does not silently drop her out of it).
// ---------------------------------------------------------------------------

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
  const [plateOpen, setPlateOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [stopwatchOpen, setStopwatchOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
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

  const alsoHere: { label: string; sub: string; icon: typeof Timer; onClick: () => void; disabled?: boolean }[] = [
    {
      // NO TILE OF ITS OWN. A stopwatch has no state worth a card — it is a
      // number that goes up — so it sits in the list with the rest.
      //
      // AND IT IS BLOCKED WHILE A ROUND IS LIVE, on purpose. Switching mode
      // clears the timer record, so this row used to destroy a running round
      // silently on the way to a stopwatch. Under 4a the round is the tab's
      // permanent content, which makes a silent wipe far worse than it was;
      // saying why is the honest minimum until the two can run side by side.
      label: 'Stopwatch',
      sub: roundLive ? 'Finish or reset your round first' : 'With laps',
      icon: Timer,
      disabled: roundLive,
      onClick: () => { if (roundLive) return; timers.setMode('lap'); setStopwatchOpen(true) },
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

      {/* THE TOUR STOPS HERE, not on the whole tab. Under 4a the tab is taller
          than a phone screen — card, seven protocols, the list — and a
          spotlight hole around all of it falls off the bottom of a 390x844
          viewport (caught by verify:tour-real, 13 Sep 2026). The stop is
          about the timer, so it points at the timer. */}
      <div data-tour="toolstimer">
        <p className="ds-label">Round timer</p>
        <div className="mt-2.5 flex flex-col gap-3">
          <RoundCard live={roundLive} idleConfig={idleConfig} onLogSession={setRoundToLog} />

          {/* THE WHOLE CONTROL SURFACE, always visible. No row, no second
              screen — 4a. */}
          <ProtocolChips
            choices={choices}
            live={roundLive}
            selected={roundLive ? timers.roundConfig : idleConfig}
            customOpen={customOpen}
            onOpenCustom={setCustomOpen}
          />

          {/* CUSTOM UNFOLDS IN PLACE, beneath the chips it belongs to, so the
              row stays put and the card's total re-reads as she taps. */}
          {customOpen && (
            <Suspense fallback={null}>
              <RoundSetupPanel onDone={() => setCustomOpen(false)} />
            </Suspense>
          )}

          {/* THE TILE THAT LIED, REPLACED BY ONE MUTED LINE. There was a
              "Rest timer" tile pointing at a settings screen that has never
              existed — the rest timer is automatic and lives in the session
              dock. One sentence says so, and nothing pretends to configure it. */}
          <p className="text-[0.71875rem] leading-[1.45] text-muted-foreground">
            Rest between sets runs itself in the session dock — this is for conditioning.
          </p>
        </div>
      </div>

      <div>
        <p className="ds-label">Also here</p>
        <div className="mt-1.5">
          {alsoHere.map((row, i) => (
            <button
              key={row.label}
              type="button"
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

      <Dialog open={stopwatchOpen} onOpenChange={setStopwatchOpen}>
        <DialogContent className="max-w-[22rem]">
          <DialogHeader>
            <DialogTitle>Stopwatch</DialogTitle>
          </DialogHeader>
          <Suspense fallback={null}>
            <StopwatchPanel />
          </Suspense>
        </DialogContent>
      </Dialog>

      <PlateCalculator open={plateOpen} onOpenChange={setPlateOpen} />
      <SessionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} profileId={profileId} />
      {logSheet}
    </div>
  )
}
