import { Maximize2 } from 'lucide-react'
import { useTimers } from '@/hooks/useTimers'
import { FIELD, roundPhaseOf, formatRemaining } from '@/components/timers/RoundField'
import { roundSubline, roundHeadline, roundDoneLabel, roundStyleOf, roundLogSummary, describeRoundPreset, ROUND_PRESETS, type RoundLogSummary } from '@/lib/timer-engine'

// ---------------------------------------------------------------------------
// THE RUNNING ROUND, AS A CARD — design handoff 2a.
//
// A running round used to take the entire Tools tab. That is the right
// surface when the phone is on the floor three metres away, and the wrong one
// when you are standing over it deciding what to do next: everything else on
// the tab became unreachable until the round was reset. So the card is the
// default and the flooded field is opt-in, behind "Full screen".
//
// ONE PHASE MAP, IMPORTED. The colours, and the rule for deriving which phase
// is current, both come from RoundField. Two surfaces showing the same
// running timer must not be able to disagree about what it is doing, and the
// only way to guarantee that is for there to be one answer, computed once.
//
// PHASE IS DERIVED, NEVER STORED — the same rule the field keeps. useTimers
// owns round, phase and remaining, all from one anchor.
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

/**
 * The preset this config came from, by its numbers — for the name in the
 * corner. Matched rather than stored: the config is the fact, and a "this
 * came from Tabata" flag would be a second one to keep in step with it.
 */
function presetOf(rounds: number, work: number, rest: number) {
  return ROUND_PRESETS.find(p => p.config.rounds === rounds && p.config.workSeconds === work && p.config.restSeconds === rest) ?? null
}

export function RoundCard({ onLogSession }: {
  /** Same contract as the field's: absent means the finished button stops offering to log. */
  onLogSession?: (summary: RoundLogSummary) => void
}) {
  const timers = useTimers()
  const config = timers.roundConfig
  if (!config) return null

  const phase = roundPhaseOf(timers)
  const { bg: phaseColour, ink } = FIELD[phase]
  const remainingMs = timers.phaseRemainingMs ?? 0

  // A bare count during the countdown and m:ss after it — the same split the
  // field makes, for the same reason: one is a count to a start, the other a
  // duration.
  const clock = phase === 'ready'
    ? String(Math.max(0, Math.ceil(remainingMs / 1000)))
    : formatRemaining(remainingMs)

  const phaseWord = roundStyleOf(config) === 'emom' ? '' : phase === 'rest' ? ' · rest' : ' · work'
  const eyebrow = phase === 'done'
    ? roundDoneLabel(config)
    : phase === 'ready' ? 'Get ready'
    : `${roundHeadline(config, timers.currentRound)}${phaseWord}`

  const preset = presetOf(config.rounds, config.workSeconds, config.restSeconds)

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

  const pipDim = 'var(--hairline)'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${eyebrow}. ${formatRemaining(remainingMs)} remaining.`}
      data-round-card
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
          style={{ fontSize: '0.65625rem', letterSpacing: '.16em', color: phaseColour }}
        >
          {eyebrow}
        </span>
        {preset && (
          <span className="shrink-0 text-[0.6875rem] text-muted-foreground" title={describeRoundPreset(preset)}>{preset.label}</span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-2.5">
        <span
          className="tabular-mono"
          style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em', color: CLOCK_TINT[phase] }}
        >
          {clock}
        </span>
        <span className="text-[0.78125rem]" style={{ color: 'var(--text-tertiary)' }}>
          {roundSubline(config, phase, timers.currentRound)}
        </span>
      </div>

      {/* One pip per round, filled to where she is. Overall progress; the
          clock above carries the current phase, so neither repeats the other. */}
      <div aria-hidden className="mt-3 flex gap-[5px]">
        {Array.from({ length: config.rounds }, (_, i) => {
          const done = phase !== 'ready' && (phase === 'done' || i < timers.currentRound)
          const current = phase !== 'ready' && phase !== 'done' && i === timers.currentRound - 1
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

      <div className="mt-3.5 flex gap-2">
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
        <button
          type="button"
          data-round-card-fullscreen
          onClick={() => timers.setRoundFullScreen(true)}
          className="flex items-center gap-1.5 font-medium"
          style={{ height: 44, padding: '0 16px', borderRadius: 12, border: 0, background: 'var(--surface-raised)', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}
        >
          <Maximize2 className="size-3.5" aria-hidden />
          Full screen
        </button>
      </div>
    </div>
  )
}
