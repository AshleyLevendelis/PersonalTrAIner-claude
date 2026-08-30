// ---------------------------------------------------------------------------
// Standalone timers surface — stopwatch, lap, and round modes. Turn 12 ("one
// owner per fact") moved this from an Exercise-tab dialog into the Tools
// tab as an inline panel — TimersPanel is the content, no Dialog wrapper;
// ToolsTab.tsx mounts it directly. All state lives in useTimers
// (deadline-anchored, persisted, ticked by the same useDeadlineTick hook the
// rest timer uses) — this component is presentation only.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useTimers } from '@/hooks/useTimers'
import { parseConditioningInterval, type RoundConfig } from '@/lib/timer-engine'
import type { WorkoutDay } from '@/lib/types'

function formatMs(ms: number, withTenths = false): string {
  const totalMs = Math.max(0, ms)
  const totalSeconds = Math.floor(totalMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (!withTenths) return `${minutes}:${seconds.toString().padStart(2, '0')}`
  const tenths = Math.floor((totalMs % 1000) / 100)
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
}

export function TimersPanel({
  todaysConditioning,
}: {
  /** Today's conditioning prescription, if any — offers a one-tap prefill for the round timer when it parses as a structured interval. */
  todaysConditioning?: WorkoutDay['recommendedCardio']
}) {
  const timers = useTimers()
  const prefill = parseConditioningInterval(todaysConditioning?.activity)

  return (
    <Tabs value={timers.mode} onValueChange={v => timers.setMode(v as typeof timers.mode)}>
      {/* A HAIRLINE UNDERLINE, not a filled 3-up. Tools was the last tab
          still on bordered cards and a filled segmented control, which made
          it read as a different app's screen. Underlined labels are the same
          affordance at a fraction of the ink. */}
      <TabsList className="grid w-full grid-cols-3 gap-0 rounded-none bg-transparent p-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
        {(['stopwatch', 'lap', 'round'] as const).map(mode => (
          <TabsTrigger
            key={mode}
            value={mode}
            className="rounded-none border-0 bg-transparent px-0 pb-2 text-[0.8125rem] capitalize shadow-none data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[color:var(--primary)] data-[state=active]:shadow-[inset_0_-2px_0_0_var(--primary)]"
          >
            {mode}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="stopwatch">
        <StopwatchPanel />
      </TabsContent>
      <TabsContent value="lap">
        <LapPanel />
      </TabsContent>
      <TabsContent value="round">
        <RoundPanel prefill={prefill} />
      </TabsContent>
    </Tabs>
  )
}

/**
 * Two timers with no explanation is a support question. The rest timer inside
 * a session is automatic and this one is not, and nothing on screen said so.
 */
const TIMER_SCOPE_NOTE = "Your rest timer runs itself inside a session — this is for everything else."

function StopwatchPanel() {
  const timers = useTimers()
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="tabular-mono text-[2.75rem] font-bold leading-none tracking-[-.03em]">{formatMs(timers.elapsedMs, true)}</div>
      <p className="max-w-[34ch] text-center text-[0.6875rem] leading-[1.45] text-muted-foreground">{TIMER_SCOPE_NOTE}</p>
      <div className="flex gap-2">
        {timers.running ? (
          <Button onClick={timers.stop}>Stop</Button>
        ) : (
          <Button onClick={timers.start}>{timers.elapsedMs > 0 ? 'Resume' : 'Start'}</Button>
        )}
        <Button variant="outline" onClick={timers.reset} disabled={timers.running && timers.elapsedMs === 0}>
          Reset
        </Button>
      </div>
    </div>
  )
}

function LapPanel() {
  const timers = useTimers()
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="ds-num-hero tabular-mono">{formatMs(timers.elapsedMs, true)}</div>
      <div className="flex gap-2">
        {timers.running ? (
          <>
            <Button onClick={timers.lap}>Lap</Button>
            <Button variant="outline" onClick={timers.stop}>Stop</Button>
          </>
        ) : (
          <Button onClick={timers.start}>{timers.elapsedMs > 0 ? 'Resume' : 'Start'}</Button>
        )}
        <Button variant="outline" onClick={timers.reset} disabled={timers.running && timers.elapsedMs === 0}>
          Reset
        </Button>
      </div>
      {timers.laps.length > 0 && (
        <div className="w-full max-h-48 overflow-y-auto space-y-1">
          {[...timers.laps].reverse().map(lap => (
            <div key={lap.lapNumber} className="flex justify-between text-sm px-2 py-1 rounded-md bg-muted">
              <span className="text-muted-foreground">Lap {lap.lapNumber}</span>
              <span className="tabular-mono">{formatMs(lap.elapsedMs, true)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RoundPanel({ prefill }: { prefill: RoundConfig | null }) {
  const timers = useTimers()
  const [rounds, setRounds] = useState(String(prefill?.rounds ?? timers.roundConfig?.rounds ?? 8))
  const [workSeconds, setWorkSeconds] = useState(String(prefill?.workSeconds ?? timers.roundConfig?.workSeconds ?? 30))
  const [restSeconds, setRestSeconds] = useState(String(prefill?.restSeconds ?? timers.roundConfig?.restSeconds ?? 30))

  const applyPrefill = () => {
    if (!prefill) return
    setRounds(String(prefill.rounds))
    setWorkSeconds(String(prefill.workSeconds))
    setRestSeconds(String(prefill.restSeconds))
  }

  const handleStart = () => {
    const config: RoundConfig = {
      rounds: Math.max(1, parseInt(rounds, 10) || 1),
      workSeconds: Math.max(1, parseInt(workSeconds, 10) || 1),
      restSeconds: Math.max(1, parseInt(restSeconds, 10) || 1),
    }
    timers.startRound(config)
  }

  const isRunning = timers.running && timers.roundConfig

  if (isRunning) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <p className="ds-label">Round {timers.currentRound} of {timers.roundConfig!.rounds}</p>
        <div
          className={`ds-num-hero tabular-mono ${timers.currentPhase === 'work' ? 'text-primary' : 'text-[color:var(--role-warn)]'}`}
        >
          {formatMs(timers.phaseRemainingMs ?? 0)}
        </div>
        <p className={`text-sm font-medium ${timers.currentPhase === 'work' ? 'text-primary' : 'text-[color:var(--role-warn-text)]'}`}>
          {timers.currentPhase === 'work' ? 'Work' : 'Rest'}
        </p>
        {timers.isRoundComplete && <p className="text-sm text-muted-foreground">All rounds complete</p>}
        <Button variant="outline" onClick={timers.reset}>Stop</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      {prefill && (
        <Button variant="outline" size="sm" onClick={applyPrefill}>
          Load from today's session ({prefill.rounds}× {prefill.workSeconds}s/{prefill.restSeconds}s)
        </Button>
      )}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Rounds
          <Input type="number" min="1" value={rounds} onChange={e => setRounds(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Work (s)
          <Input type="number" min="1" value={workSeconds} onChange={e => setWorkSeconds(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Rest (s)
          <Input type="number" min="1" value={restSeconds} onChange={e => setRestSeconds(e.target.value)} />
        </label>
      </div>
      <Button onClick={handleStart}>Start</Button>
    </div>
  )
}
