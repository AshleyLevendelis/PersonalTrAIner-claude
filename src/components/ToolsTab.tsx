import { useEffect, useRef, useState } from 'react'
import { Timer, TimerReset, Disc, List, History, BookOpen } from 'lucide-react'
import { TimersPanel } from '@/components/timers/TimersPanel'
import { PlateCalculator } from '@/components/PlateCalculator'
import { SessionHistoryDialog } from '@/components/exercise/SessionHistoryDialog'
import { getAllItems } from '@/lib/grocery-store'
import { getSessionHistory } from '@/lib/exercise-history'
import { getPRCache } from '@/lib/pr-engine'
import { programHash } from '@/lib/app-route'
import { RoundField } from '@/components/timers/RoundField'
import { useTimers } from '@/hooks/useTimers'
import { GroceryList } from '@/components/GroceryList'
import { useActiveSession } from '@/hooks/useActiveSession'
import type { MacroTargets, WorkoutDay, MesocycleWeek } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'

// ---------------------------------------------------------------------------
// Turn 12 ("one owner per fact") — the retired Meals tab's grocery section
// and the Exercise tab's dialog-only timers now share one "Tools" tab:
// neither owns daily-plan content (that's Nutrition/Exercise's job), they're
// both ephemeral utilities reached from wherever, so a shared utility tab is
// the honest home for both rather than two separate dialog entry points.
// ---------------------------------------------------------------------------

export interface ToolsTabProps {
  profileId?: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  targets: MacroTargets | null
  /** Passed straight through to GroceryList — the shopping list assembles the same days the Nutrition tab shows, so it needs the same preferences or the two diverge. */
  softLikedFoods: string[]
  /** And today's actual picks, for the same reason: a swapped dinner has to reach the shopping list too (audit §5.1). */
  todaysPicks?: Partial<Record<MealSlotName, PoolOption>>
  /**
   * The training week, so the round timer can offer today's conditioning as a
   * one-tap prefill.
   *
   * Added 5 Sep 2026. TimersPanel has always accepted `todaysConditioning` and
   * this screen — its only mount — never passed one, so `prefill` was
   * permanently null: the "Load from today's session" button could not render
   * on any device, in any state, and the round defaults stayed at a generic
   * 8x30/30 on the day the plan actually prescribed 10x40/20.
   */
  exercisePlan?: WorkoutDay[]
  /** For the "Your program" tile's subtitle — how many weeks, which block. */
  mesocycle?: MesocycleWeek[]
  /** Which mesocycle week is live, so the block number is the one they are in. */
  liveWeek?: number
}

export function ToolsTab({ profileId, mealPools, targets, softLikedFoods, todaysPicks, exercisePlan, mesocycle, liveWeek }: ToolsTabProps) {
  const timers = useTimers()
  // The session facade already owns "which day is it" (frozen at session
  // start, dev-clock aware). Deriving it again here from a fresh Date would
  // be a second answer to a question this app deliberately has one owner for.
  const { dayName } = useActiveSession()
  const todaysConditioning = (exercisePlan ?? []).find(d => d.day === dayName)?.recommendedCardio

  // LIVE SUBTITLES — design_handoff_app_polish. A tile whose caption is a
  // fixed string is a label; these say what is actually in there, so the grid
  // answers "is there anything for me here" without six taps. Each reads a
  // store that already exists; nothing new is computed or cached.
  const [groceryCount, setGroceryCount] = useState<{ total: number; checked: number } | null>(null)
  const [historyCount, setHistoryCount] = useState<{ sessions: number; prs: number } | null>(null)
  const [plateOpen, setPlateOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const grocerySectionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    void getAllItems(profileId)
      .then(items => { if (!cancelled) setGroceryCount({ total: items.length, checked: items.filter(i => i.checked).length }) })
      .catch(() => { if (!cancelled) setGroceryCount(null) })
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

  const TILES: { label: string; sub: string; icon: typeof Timer; onClick: () => void }[] = [
    {
      // NO REST-TIMER SETTINGS SCREEN EXISTS. The handoff points this tile at
      // one; the rest timer is automatic (it starts itself when a set is
      // logged and lives in the dock), and there is nothing to configure. So
      // this opens the timer surface that does exist rather than a control
      // that opens nothing — recorded in the commit message.
      label: 'Rest timer', sub: 'Auto-starts after a set', icon: Timer,
      onClick: () => { timers.setMode('stopwatch'); setTimerOpen(true) },
    },
    { label: 'Rounds & intervals', sub: 'EMOM, Tabata, laps', icon: TimerReset, onClick: () => { timers.setMode('round'); setTimerOpen(true) } },
    { label: 'Plate calculator', sub: '20 kg bar · your plates', icon: Disc, onClick: () => setPlateOpen(true) },
    {
      label: 'Grocery list',
      sub: groceryCount ? `${groceryCount.total} item${groceryCount.total === 1 ? '' : 's'} · ${groceryCount.checked} checked` : 'This week\u2019s shopping',
      icon: List,
      onClick: () => grocerySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    {
      label: 'Session history',
      sub: historyCount ? `${historyCount.sessions} session${historyCount.sessions === 1 ? '' : 's'} · ${historyCount.prs} PR${historyCount.prs === 1 ? '' : 's'}` : 'Everything you have logged',
      icon: History,
      onClick: () => setHistoryOpen(true),
    },
    { label: 'Your program', sub: programSub, icon: BookOpen, onClick: () => { window.location.hash = programHash() } },
  ]

  // A RUNNING ROUND IS A SINGLE-PURPOSE SCREEN (design handoff 2a). While one
  // is live the field takes the whole tab content area rather than sitting as
  // a card above the rest — a flooded surface is legible across a gym, a card
  // is not. The stopwatch, lap and grocery sections are intentionally out of
  // reach until it is reset.
  //
  // `isRoundComplete` holds the screen too, so the red finished state stays
  // until the user acts instead of vanishing the moment the clock stops.
  // PAUSED COUNTS AS HOLDING THE SCREEN, and leaving it out was a real bug.
  // pauseRound sets running:false, so a round that only required `running`
  // made the entire full-bleed timer vanish the moment you tapped Pause,
  // dropping you back to the setup form mid-workout. You pause to catch your
  // breath, not to lose your place. `isActive` is true while there is
  // accumulated time, which is exactly "started and not reset".
  const roundHoldsScreen =
    timers.mode === 'round' && !!timers.roundConfig
    && (timers.running || timers.isRoundComplete || timers.isActive)

  if (roundHoldsScreen) {
    // NO `relative` AND NO minHeight HERE. Both used to be, and together they
    // were the bug: they made this wrapper the containing block for
    // RoundField's absolute positioning, so the full-bleed field became a
    // 60vh card sitting in the page's padding. RoundField is `fixed` now and
    // belongs to the viewport, so this wrapper must stay unpositioned or it
    // will capture it again.
    return (
      <div data-tour="toolsall">
        <RoundField />
      </div>
    )
  }

  return (
    <div data-tour="toolsall" className="flex flex-col gap-[26px]">
      <div>
        <p className="ds-label">Tools</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2.5">
          {TILES.map(tile => (
            <button
              key={tile.label}
              type="button"
              onClick={tile.onClick}
              className="flex min-h-[104px] flex-col justify-between gap-3 rounded-2xl p-3.5 text-left"
              style={{ background: 'var(--surface-raised)' }}
            >
              <tile.icon className="size-5 shrink-0" style={{ color: 'var(--primary)' }} aria-hidden />
              <span>
                <span className="block text-[0.9375rem] font-semibold">{tile.label}</span>
                <span className="mt-0.5 block text-[0.71875rem] leading-[1.3] text-muted-foreground">{tile.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* The timer surface opens from its two tiles and stays open while
          something is running. Always-on it duplicated the tiles above it;
          unmountable it is still safe, because the running state lives in the
          useTimers provider, not in this panel. */}
      {(timerOpen || timers.running || timers.isActive) && (
        <div>
          <p className="ds-label">Timer</p>
          <div className="mt-1.5">
            <TimersPanel todaysConditioning={todaysConditioning} />
          </div>
        </div>
      )}

      <div ref={grocerySectionRef}>
        <p className="ds-label">Grocery · this week</p>
        <div className="mt-1.5">
          <GroceryList profileId={profileId} mealPools={mealPools} targets={targets} softLikedFoods={softLikedFoods} todaysPicks={todaysPicks} />
        </div>
      </div>

      <PlateCalculator open={plateOpen} onOpenChange={setPlateOpen} />
      <SessionHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} profileId={profileId} />
    </div>
  )
}
