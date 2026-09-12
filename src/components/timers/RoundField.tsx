import type React from 'react'
import { useTimers } from '@/hooks/useTimers'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
import { tabHash } from '@/lib/app-route'
import { roundSubline, roundHeadline, roundDoneLabel, roundStyleOf, type RoundConfig } from '@/lib/timer-engine'

// ---------------------------------------------------------------------------
// THE ROUND TIMER AS A FIELD — design handoff "Timer colour states", 2a.
//
// The running round timer used to say what it was doing with a text colour
// and nothing else: mint numerals for work, amber for rest, and no signal at
// all for completion. That is a phone-in-hand signal. Between sets you are
// three to five metres away, so it floods the whole tab instead — you read
// the state from the rack, not from arm's length.
//
//   work → --primary        rest → --role-warn      finished → --destructive
//
// All three are LIGHT, so text and controls on top switch to a dark
// same-hue ink (--phase-*-ink). Nothing here is hardcoded: every colour is a
// token, so the field survives a theme change.
//
// PHASE IS DERIVED, NEVER STORED. useTimers already computes round, phase and
// remaining from one anchor; adding a phase variable here would create a
// second source of truth for a fact the engine already owns.
//
// THE DOCK IS NEVER COVERED. The field is absolutely positioned with
// `bottom: TAB_BAR_HEIGHT_PX`, so navigation stays put and stays dark on all
// three states — you can walk away mid-round and the timer keeps running,
// because useTimers is deadline-anchored at the provider.
// ---------------------------------------------------------------------------

type Phase = 'ready' | 'work' | 'rest' | 'done'

/** Field colour and its ink, per phase. Tokens only — never the hexes. */
const FIELD: Record<Phase, { bg: string; ink: string }> = {
  ready: { bg: 'var(--phase-ready)', ink: 'var(--phase-ready-ink)' },
  work: { bg: 'var(--primary)', ink: 'var(--phase-work-ink)' },
  rest: { bg: 'var(--role-warn)', ink: 'var(--phase-rest-ink)' },
  done: { bg: 'var(--destructive)', ink: 'var(--phase-done-ink)' },
}

/** `m:ss`, ceiled — so it never reads 0:00 while there is still time on the clock. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * What this phase is, said as a person would.
 *
 * THE LAST ROUND HAS NO REST AFTER IT, and this is where that matters. The
 * engine is explicit that six rounds means six work intervals and five rests
 * (see computeRoundState). The design prototype's copy said "N seconds rest
 * next" on every work phase, which is untrue on the final one — so the last
 * round says what actually happens instead.
 */
// MOVED INTO THE ENGINE, 12 Sep 2026, when EMOM arrived. An EMOM has no rest
// to promise, so every sentence here needed a second version — and two copies
// of the wording is how the dock's one-line summary and this field would come
// to call the same interval by two different names. roundSubline keeps the
// rule this function was written for (the final round says what actually
// happens, because "20s rest next" was untrue there) and adds the EMOM case.
const subline = roundSubline

export function RoundField() {
  const timers = useTimers()
  const config = timers.roundConfig
  if (!config) return null

  const phase: Phase = timers.isRoundComplete
    ? 'done'
    : timers.currentPhase === 'lead_in' ? 'ready' : timers.currentPhase === 'rest' ? 'rest' : 'work'
  const { bg, ink } = FIELD[phase]
  const inkSoft = `color-mix(in srgb, ${ink} 72%, transparent)`
  const line = `color-mix(in srgb, ${ink} 16%, transparent)`
  const pipDim = `color-mix(in srgb, ${ink} 22%, transparent)`

  const remainingMs = timers.phaseRemainingMs ?? 0
  const phaseSeconds = phase === 'ready'
    ? Math.max(1, config.leadInSeconds ?? 0)
    : phase === 'rest' ? config.restSeconds : config.workSeconds
  // A BARE COUNT DURING THE COUNTDOWN, not 0:10. `m:ss` reads as a duration —
  // how long a thing lasts — and this is the other thing, a count down to a
  // start. Ten big numerals falling to one is what she asked for; the work and
  // rest phases keep the clock they have always had.
  const clock = phase === 'ready'
    ? String(Math.max(0, Math.ceil(remainingMs / 1000)))
    : formatRemaining(remainingMs)
  // Elapsed fraction OF THE CURRENT PHASE — the bar fills across each phase
  // and sits full when the session ends. The pips carry overall progress;
  // one graphic, one meaning.
  const progress = phase === 'done'
    ? 1
    : Math.min(1, Math.max(0, 1 - remainingMs / Math.max(1, phaseSeconds * 1000)))

  const roundLabel = phase === 'done'
    ? roundDoneLabel(config)
    : phase === 'ready' ? 'Get ready'
    : roundHeadline(config, timers.currentRound)

  // NO PHASE WORD FOR AN EMOM. "Work" beside the clock implies a Rest it
  // alternates with, and an EMOM has none — the interval is the whole of it.
  // Dropped on the screen AND in the dock's chip from the same rule, because
  // the two saying different things about one running timer is how this
  // codebase's timer bugs have always started.
  const phaseWord = phase === 'done'
    ? 'Session complete'
    : phase === 'ready' ? 'Starting'
    : roundStyleOf(config) === 'emom' ? ''
    : phase === 'work' ? 'Work' : 'Rest'

  const primaryLabel = phase === 'done' ? 'Log session' : timers.running ? 'Pause' : 'Resume'
  const onPrimary = () => {
    if (phase === 'done') {
      // A REAL ACTION, not a decoration. Sets are logged on the Exercise tab,
      // so this goes there and releases the field on the way — the design
      // named the button "Log session" and a button that only dismissed
      // itself would be lying about what it does.
      timers.reset()
      window.location.hash = tabHash('exercise')
      return
    }
    if (timers.running) timers.pauseRound()
    else timers.resumeRound()
  }

  return (
    <div
      // TAPPING ANYWHERE STARTS ROUND 1 during the countdown — her choice when
      // asked how the countdown should behave. The buttons below stop their
      // own clicks propagating, so Pause and Reset still do their own jobs.
      // Outside the countdown this is not a control at all, so it carries the
      // status role instead and nothing about the running field changes.
      {...(phase === 'ready'
        ? {
            role: 'button' as const,
            tabIndex: 0,
            'aria-label': `Get ready. Round 1 starts in ${Math.max(0, Math.ceil(remainingMs / 1000))} seconds. Activate to start now.`,
            onClick: timers.skipLeadIn,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); timers.skipLeadIn() }
            },
          }
        : {
            // The colour IS the status here, so it has to reach a screen reader too.
            role: 'status' as const,
            'aria-live': 'polite' as const,
            'aria-label': `${roundLabel}.${phaseWord ? ` ${phaseWord}.` : ''} ${formatRemaining(remainingMs)} remaining.`,
          })}
      // FIXED, NOT ABSOLUTE, and that is the whole difference between the
      // design and what shipped. An absolutely-positioned element sizes to its
      // nearest POSITIONED ancestor, and ToolsTab wrapped this in a
      // `relative` box of minHeight 60vh — so the field filled 60% of the
      // screen inside the page's own padding, as a card, instead of flooding
      // the screen. The colour IS the signal in this design; a colour you have
      // to be holding the phone to notice does not carry across a gym.
      //
      // z-30 sits under BottomTabBar's z-40, which together with the
      // TAB_BAR_HEIGHT_PX inset is what keeps navigation visible AND tappable
      // while a round runs.
      className="fixed left-0 right-0 top-0 z-30 flex flex-col overflow-hidden"
      style={{ bottom: TAB_BAR_HEIGHT_PX, background: bg, padding: '3.5rem 1.5rem 1.625rem' }}
    >
      {/* Purely graphic, and hidden from assistive tech for that reason. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{ right: -118, top: 150, width: 420, height: 420, border: `26px solid ${line}` }}
      />

      <p
        className="relative m-0 font-semibold uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '.2em', color: inkSoft }}
      >
        {roundLabel}
      </p>

      <div className="relative mt-auto flex flex-col gap-1.5">
        <div className="flex items-baseline gap-3">
          <span
            className="tabular-mono"
            style={{ fontSize: '6.5rem', fontWeight: 700, letterSpacing: '-.05em', lineHeight: .86, color: ink }}
          >
            {clock}
          </span>
          <span
            className="font-semibold"
            style={{ fontSize: '0.9375rem', lineHeight: 1.2, color: inkSoft, maxWidth: '6ch' }}
          >
            {phaseWord}
          </span>
        </div>
        <p style={{ margin: '0.375rem 0 0', fontSize: '1.0625rem', lineHeight: 1.35, color: ink, maxWidth: '26ch' }}>
          {subline(config, phase, timers.currentRound)}
        </p>
      </div>

      <div
        className="relative overflow-hidden rounded-full"
        style={{ marginTop: '1.625rem', height: 8, background: line }}
      >
        <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: ink }} />
      </div>

      <div className="relative flex gap-2.5" style={{ marginTop: '1.375rem' }}>
        <button
          onClick={e => { e.stopPropagation(); onPrimary() }}
          className="flex-1 font-bold"
          style={{ height: 56, borderRadius: 14, border: 0, background: ink, color: bg, fontSize: '1.0625rem' }}
        >
          {primaryLabel}
        </button>
        <button
          onClick={e => { e.stopPropagation(); timers.reset() }}
          className="font-bold"
          style={{ height: 56, padding: '0 22px', borderRadius: 14, border: `2px solid ${ink}`, background: 'transparent', color: ink, fontSize: '1.0625rem' }}
        >
          Reset
        </button>
      </div>

      <div aria-hidden className="relative flex gap-[5px]" style={{ marginTop: '1.125rem' }}>
        {Array.from({ length: config.rounds }, (_, i) => (
          <span
            key={i}
            className="flex-1 rounded-[2px]"
            style={{ height: 4, background: phase !== 'ready' && (phase === 'done' || i < timers.currentRound) ? ink : pipDim }}
          />
        ))}
      </div>
    </div>
  )
}
