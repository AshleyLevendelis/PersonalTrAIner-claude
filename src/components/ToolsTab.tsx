import { useEffect, useState } from 'react'
import { TimerReset, Disc, History, BookOpen, Timer, ChevronRight } from 'lucide-react'
import { TimersPanel } from '@/components/timers/TimersPanel'
import { PlateCalculator } from '@/components/PlateCalculator'
import { SessionHistoryDialog } from '@/components/exercise/SessionHistoryDialog'
import { getSessionHistory } from '@/lib/exercise-history'
import { getPRCache } from '@/lib/pr-engine'
import { programHash } from '@/lib/app-route'
import { RoundField } from '@/components/timers/RoundField'
import { RoundCard } from '@/components/timers/RoundCard'
import { useTimers } from '@/hooks/useTimers'
import { useActiveSession } from '@/hooks/useActiveSession'
import type { WorkoutDay, MesocycleWeek } from '@/lib/types'
import type { RoundLogSummary } from '@/lib/timer-engine'
import { AddUnplannedWork } from '@/components/exercise/AddUnplannedWork'

// ---------------------------------------------------------------------------
// TOOLS IS ONE TIMER SURFACE — design handoff 2a ("Tools becomes one timer
// surface"), 12 Sep 2026.
//
// What was here: six tiles, of which two opened the same panel in different
// modes, one ("Rest timer") could not do what its name said, and a grocery
// section sat BELOW the grid that a tile scrolled you down to. A grid of six
// where two are the same thing and one is a lie is a menu of nine possible
// wrong taps.
//
// What is here now: the round timer IS the tab's content — a live card that
// colour-codes its phase — plus one row to change the intervals, then a short
// "Also here" list for the things that genuinely are utilities. The stopwatch
// loses its tile: it has no running state worth a card.
//
// GROCERY LEFT THIS TAB ENTIRELY. It is built from the week's meals and it is
// a weekly errand, so it surfaces as a Home card on shop day and otherwise
// opens full screen from the link Nutrition already has. It was never a
// utility; it was filed as one because this tab existed.
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
  const [setupOpen, setSetupOpen] = useState(false)
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

  // STARTED AND NOT RESET — the condition the card renders on. Paused counts:
  // pauseRound sets running:false, and a round that only checked `running`
  // used to make the whole timer vanish the moment you tapped Pause. You
  // pause to catch your breath, not to lose your place.
  const roundLive =
    timers.mode === 'round' && !!timers.roundConfig
    && (timers.running || timers.isRoundComplete || timers.isActive)

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
      <div data-tour="toolsall">
        <RoundField onLogSession={setRoundToLog} />
        {logSheet}
      </div>
    )
  }

  const alsoHere: { label: string; sub: string; icon: typeof Timer; onClick: () => void }[] = [
    {
      // NO TILE OF ITS OWN. A stopwatch has no state worth a card — it is a
      // number that goes up — so it sits in the list with the rest.
      label: 'Stopwatch', sub: 'With laps', icon: Timer,
      onClick: () => { timers.setMode('stopwatch'); setSetupOpen(true) },
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
    <div data-tour="toolsall" className="flex flex-col gap-[26px]">
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

      <div>
        <p className="ds-label">Timers</p>
        <div className="mt-1.5 flex flex-col gap-2.5">
          {roundLive && <RoundCard onLogSession={setRoundToLog} />}

          {/* THE ONE ROW THAT CHANGES THE INTERVALS — and the whole Timers
              section when nothing is running. */}
          <button
            type="button"
            data-change-intervals
            onClick={() => { timers.setMode('round'); setSetupOpen(true) }}
            className="flex w-full items-center gap-3 rounded-2xl p-4 text-left"
            style={{ background: 'var(--surface-raised)' }}
          >
            <TimerReset className="size-5 shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold">Change the intervals</span>
              <span className="mt-0.5 block text-[0.71875rem] leading-[1.3] text-muted-foreground">
                Tabata, EMOM, rounds · 20s to 5 min
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>

          {/* THE TILE THAT LIED, REPLACED BY THE TRUTH. There was a "Rest
              timer" tile pointing at a settings screen that has never
              existed — the rest timer is automatic and lives in the session
              dock. One sentence says so, and nothing pretends to configure it. */}
          <p className="text-[0.71875rem] leading-[1.35] text-muted-foreground">
            Your rest timer isn't here because it runs itself — it starts the moment you log a set, in the session dock.
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
              className="flex min-h-[44px] w-full items-center gap-3 py-3 text-left"
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

      {/* SETUP ONLY, and only when asked for. It used to stay mounted for as
          long as anything was running, which under the old design was how you
          reached the round at all. The card is that now, so leaving the panel
          up put a Stopwatch / Lap / Round tab strip under a running round —
          exactly the junk-drawer stacking this redesign removes. Unmounting is
          safe because the running state lives in the useTimers provider, not
          in this panel. */}
      {setupOpen && (
        <div>
          <TimersPanel todaysConditioning={todaysConditioning} />
        </div>
      )}

      <PlateCalculator open={plateOpen} onOpenChange={setPlateOpen} />
      <SessionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} profileId={profileId} />
      {logSheet}
    </div>
  )
}
