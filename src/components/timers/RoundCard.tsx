import { Maximize2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTimers, ROUND_LEAD_IN_SECONDS } from '@/hooks/useTimers'
import { FIELD, roundPhaseOf, formatRemaining } from '@/components/timers/RoundField'
import {
  roundSubline, roundHeadline, roundDoneLabel, roundStyleOf, roundLogSummary,
  describeRoundPreset, protocolNameOf, presetForConfig, secondsPhrase,
  totalRoundSeconds, leadInMsOf, sessionRoundNumber, sessionTotalRounds,
  type RoundConfig, type RoundLogSummary,
} from '@/lib/timer-engine'

// ---------------------------------------------------------------------------
// THE ROUND, AS A CARD — design handoff 2a, then 4a on 13 Sep 2026.
//
// 2a made a RUNNING round a card instead of a takeover: the flooded field is
// the right surface when the phone is on the floor three metres away and the
// wrong one when you are standing over it deciding what to do next.
//
// 4a made the card PERMANENT. There is no "Change the intervals" row any
// more, so when nothing is running this same card is what says what you would
// be starting and how long it takes — same box, same pips, same buttons in
// the same places. Starting swaps the clock in; nothing moves. A second
// component for the idle state would have been two boxes that had to be kept
// looking identical, which is the same bet this file already refused to make
// about the phase colours.
//
// ONE PHASE MAP, IMPORTED. The colours, and the rule for deriving which phase
// is current, both come from RoundField. Two surfaces showing the same
// running timer must not be able to disagree about what it is doing.
//
// PHASE IS DERIVED, NEVER STORED — the same rule the field keeps.
// ---------------------------------------------------------------------------

/**
 * The clock's tint on each phase. Light, so it reads against the card's dark
 * `--card` rather than against the phase colour — the card is not flooded,
 * only edged, so the numerals cannot use the field's dark inks.
 */
const CLOCK_TINT: Record<string, string> = {
  ready: 'var(--num-hero)',
  work: 'var(--num-hero)',
  rest: 'color-mix(in srgb, var(--role-warn) 22%, white)',
  done: 'color-mix(in srgb, var(--destructive) 22%, white)',
}

/** The idle edge — present but quiet, so the card reads as waiting rather than off. */
const IDLE_EDGE = 'rgba(var(--glow-rgb), .45)'

export function RoundCard({ live, idleConfig, onLogSession }: {
  /**
   * Whether a round is actually running. OWNED BY THE TAB, not re-derived
   * here: ToolsTab needs the same answer to decide between this card and the
   * flooded field, and two readings of "is a round live" that could disagree
   * is exactly the class of bug the phase map avoids.
   */
  live: boolean
  /** What Start would run, when nothing is. Absent means there is nothing to describe. */
  idleConfig?: RoundConfig | null
  /** Same contract as the field's: absent means the finished button stops offering to log. */
  onLogSession?: (summary: RoundLogSummary) => void
}) {
  const timers = useTimers()
  const config = live ? timers.roundConfig : (idleConfig ?? timers.selectedRoundConfig)
  if (!config) return null

  const phase = live ? roundPhaseOf(timers) : 'idle'
  const phaseColour = phase === 'idle' ? IDLE_EDGE : FIELD[phase].bg
  const ink = phase === 'idle' ? undefined : FIELD[phase].ink
  const remainingMs = timers.phaseRemainingMs ?? 0

  // THE IDLE CLOCK IS THE BLOCK'S LENGTH, and it is the engine's own
  // arithmetic rather than a second copy of it — rounds x work + (rounds-1) x
  // rest, countdown excluded, because the countdown is not training.
  const idleSeconds = Math.round(totalRoundSeconds(config) - leadInMsOf(config) / 1000)

  // A bare count during the countdown and m:ss after it — the same split the
  // field makes, for the same reason: one is a count to a start, the other a
  // duration.
  const clock = phase === 'idle'
    ? formatRemaining(idleSeconds * 1000)
    : phase === 'ready'
      ? String(Math.max(0, Math.ceil(remainingMs / 1000)))
      : formatRemaining(remainingMs)

  const phaseWord = roundStyleOf(config) === 'emom' ? '' : phase === 'rest' ? ' · rest' : ' · work'
  const totalRounds = sessionTotalRounds(config)
  const noun = roundStyleOf(config) === 'emom' ? 'intervals' : 'rounds'
  const eyebrow = phase === 'idle'
    ? `Ready · ${totalRounds} ${noun}`
    : phase === 'done'
      ? roundDoneLabel(config)
      : phase === 'ready' ? 'Get ready'
        : `${roundHeadline(config, timers.currentRound)}${phaseWord}`

  const preset = presetForConfig(config)

  const primaryLabel = phase === 'done'
    ? (onLogSession ? 'Log session' : 'Done')
    : timers.running ? 'Pause' : 'Resume'

  const onPrimary = () => {
    if (phase === 'done') {
      // THE SAME RULE THE FIELD KEEPS, and for the same reason it had to be
      // fixed there: no reset until the write lands, and no offer to log at
      // all when nothing can record it.
      if (!onLogSession) { timers.reset(); return }
      onLogSession(roundLogSummary(config))
      return
    }
    if (timers.running) timers.pauseRound()
    else timers.resumeRound()
  }

  // THE QUEUED SWITCH, said before it happens — 4a. The round it lands on is
  // counted in the SESSION, so it matches the eyebrow above it rather than
  // the block's own restarting count.
  const queued = live ? timers.queuedRoundConfig : null
  const queuedAtRound = queued
    ? Math.min(sessionRoundNumber(config, timers.currentRound) + 1, totalRounds)
    : 0

  const pipDim = 'var(--hairline)'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={phase === 'idle'
        ? `${eyebrow}. ${formatRemaining(idleSeconds * 1000)} in total.`
        : `${eyebrow}. ${formatRemaining(remainingMs)} remaining.`}
      data-round-card
      data-round-phase={phase}
      style={{
        background: 'var(--card)',
        borderRadius: 18,
        padding: 16,
        boxSizing: 'border-box',
        // The phase, read from the edge of the card at a glance — the flooded
        // field's whole-surface colour, reduced to the one stripe a card can
        // carry without becoming a different component.
        boxShadow: `inset 3px 0 0 ${phaseColour}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="font-semibold uppercase"
          style={{
            fontSize: '0.65625rem',
            letterSpacing: '.16em',
            color: phase === 'idle' ? 'var(--muted-foreground)' : phaseColour,
          }}
        >
          {eyebrow}
        </span>
        <span
          data-round-card-protocol
          className="shrink-0 text-[0.6875rem]"
          style={{ color: preset ? 'var(--muted-foreground)' : 'var(--primary-text)' }}
          title={preset ? describeRoundPreset(preset) : undefined}
        >
          {protocolNameOf(config)}
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2.5">
        <span
          data-round-card-clock
          className="tabular-mono"
          style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em', color: CLOCK_TINT[phase] ?? 'var(--num-hero)' }}
        >
          {clock}
        </span>
        <span className="text-[0.78125rem]" style={{ color: 'var(--text-tertiary)' }}>
          {phase === 'idle' ? secondsPhrase(config) : roundSubline(config, phase, timers.currentRound)}
        </span>
      </div>

      {/* One pip per round of the SESSION, filled to where she is. Overall
          progress; the clock above carries the current phase, so neither
          repeats the other. */}
      <div aria-hidden className="mt-3 flex gap-[5px]" data-round-pips={totalRounds}>
        {Array.from({ length: totalRounds }, (_, i) => {
          const here = sessionRoundNumber(config, timers.currentRound)
          const done = phase !== 'idle' && phase !== 'ready' && (phase === 'done' || i + 1 < here)
          const current = phase !== 'idle' && phase !== 'ready' && phase !== 'done' && i + 1 === here
          return (
            <span
              key={i}
              className="flex-1 rounded-[2px]"
              style={{
                height: 4,
                background: current
                  ? `color-mix(in srgb, ${phaseColour} 55%, transparent)`
                  : done ? phaseColour : pipDim,
              }}
            />
          )
        })}
      </div>

      {queued && (
        <div
          data-round-queued
          className="mt-3 flex items-center gap-2"
          style={{ padding: '9px 12px', borderRadius: 11, background: 'color-mix(in srgb, var(--role-warn) 12%, transparent)' }}
        >
          <ArrowRight className="size-3.5 shrink-0" style={{ color: 'var(--role-warn)' }} aria-hidden />
          <span className="min-w-0 flex-1 text-[0.75rem]" style={{ color: 'color-mix(in srgb, var(--role-warn) 30%, white)' }}>
            Switching to {protocolNameOf(queued)} at round {queuedAtRound}
          </span>
          <button
            type="button"
            data-round-queued-undo
            onClick={() => timers.clearQueuedRound()}
            className="shrink-0 text-[0.75rem] font-semibold"
            style={{ color: 'var(--role-warn)' }}
          >
            Undo
          </button>
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        {phase === 'idle' ? (
          <Button
            data-round-card-start
            onClick={() => timers.startRound(config)}
            className="flex-1"
            style={{ height: 44, borderRadius: 12 }}
          >
            {/* THE COUNTDOWN IS NAMED ON THE BUTTON, and this is a deliberate
                departure from 4a's copy, which reads only "Start". An app that
                pauses for ten seconds after a tap without having said it would
                is indistinguishable from one that has not started — the reason
                the promise was put on the button in the first place, and the
                property test:round-timer §7 exists to hold. The mock had no
                view of that; honesty wins over the shorter word. */}
            Start · {ROUND_LEAD_IN_SECONDS}s countdown
          </Button>
        ) : (
          <>
            <button
              type="button"
              data-round-card-primary
              onClick={onPrimary}
              className="flex-1 font-semibold"
              style={{ height: 44, borderRadius: 12, border: 0, background: phaseColour, color: ink, fontSize: '0.9375rem' }}
            >
              {primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => timers.reset()}
              className="font-medium"
              style={{ height: 44, padding: '0 16px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}
            >
              Reset
            </button>
          </>
        )}
        <button
          type="button"
          data-round-card-fullscreen
          onClick={() => { if (!live) timers.startRound(config); timers.setRoundFullScreen(true) }}
          className="flex items-center gap-1.5 font-medium"
          style={{ height: 44, padding: '0 14px', borderRadius: 12, border: 0, background: 'var(--surface-raised)', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}
        >
          <Maximize2 className="size-3.5" aria-hidden />
          Full screen
        </button>
      </div>
    </div>
  )
}
