// ---------------------------------------------------------------------------
// App-wide provider for the standalone stopwatch/lap/round timers, mounted
// alongside ActiveSessionProvider so both the Timers screen and BottomDock
// read the same running timer regardless of which tab is active — exactly
// like the rest timer. Deadline-anchored throughout (timer-engine.ts),
// ticked by the same useDeadlineTick hook the rest facade uses, persisted via
// timer-store.ts so a reload resumes correctly.
// ---------------------------------------------------------------------------

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useDeadlineTick } from './useDeadlineTick'
import { getAppNow } from '@/lib/dev-clock'
import { playTimerCue } from '@/lib/timer-cues'
import {
  computeStopwatchElapsedMs,
  computeRoundState,
  roundPhaseIndex,
  type RoundConfig,
  type RoundPhase,
  totalRoundSeconds,
} from '@/lib/timer-engine'
import {
  getTimerRecord,
  saveTimerRecord,
  clearTimerRecord,
  defaultTimerRecord,
  type TimerRecord,
  type TimerMode,
  type LapEntry,
} from '@/lib/timer-store'

/** computeRoundState only ever uses (now - start), so a zero anchor plus an elapsed figure is exactly equivalent to a real one — and works identically whether the clock is running, paused or finished. */
const EPOCH_ISO = new Date(0).toISOString()

export interface TimersValue {
  mode: TimerMode
  running: boolean
  elapsedMs: number
  laps: LapEntry[]
  roundConfig: RoundConfig | null
  currentRound: number
  currentPhase: RoundPhase
  phaseRemainingMs: number | null
  isRoundComplete: boolean
  /** True once any timer (any mode) has running/accumulated state worth showing in the dock. */
  isActive: boolean
  /** Set by BottomDock's timer chip (a different subtree from wherever the Timers screen's Dialog lives) to ask it to open — mirrors useActiveSession's requestedSetFocus channel. */
  screenOpenRequested: boolean
  requestScreenOpen: () => void
  clearScreenOpenRequest: () => void
  setMode: (mode: TimerMode) => void
  start: () => void
  stop: () => void
  reset: () => void
  lap: () => void
  startRound: (config: RoundConfig) => void
  /** Round mode only — banks elapsed time and drops the anchor. `stop()` would erase the round, not pause it. */
  pauseRound: () => void
  /** Round mode only — re-anchors to `now - banked` so the schedule continues where it stopped. */
  resumeRound: () => void
}

const TimersContext = createContext<TimersValue | null>(null)

/** Render seam — lets the screenshot harness mount timer views in a chosen state without a provider or a clock. Not used by the app. */
export const TimersContextForTests = TimersContext

export function useTimers(): TimersValue {
  const ctx = useContext(TimersContext)
  if (!ctx) throw new Error('useTimers must be used within a TimersProvider')
  return ctx
}

export function TimersProvider({ profileId, children }: { profileId: string | undefined; children: React.ReactNode }) {
  const [record, setRecord] = useState<TimerRecord>(() => defaultTimerRecord('stopwatch'))

  // Hydrate from the persisted record when identity resolves — mirrors the
  // rest facade's own hydration effect. A round-mode record persisted by the
  // pre-fix version has no startedAtIso anchor (it stored a per-phase
  // deadline the old stepping logic corrupted) — there is nothing honest to
  // resume it from, so it hydrates stopped rather than guessing a position.
  useEffect(() => {
    if (!profileId) return
    const existing = getTimerRecord(profileId)
    if (!existing) return
    if (existing.mode === 'round' && existing.running && !existing.startedAtIso) {
      setRecord({ ...existing, running: false })
      return
    }
    setRecord(existing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  const persist = useCallback((next: TimerRecord) => {
    setRecord(next)
    if (profileId) saveTimerRecord(profileId, next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  // 100ms redraw for stopwatch/lap so the tenths digit actually moves (the
  // 1s default left it frozen); round mode keeps 1s — it displays a whole-
  // second countdown and derives transitions from elapsed time, so a faster
  // tick would buy nothing but battery drain.
  const tick = useDeadlineTick(record.running, record.mode === 'round' ? 1000 : 100)

  const setMode = useCallback((mode: TimerMode) => {
    persist(defaultTimerRecord(mode))
  }, [persist])

  const start = useCallback(() => {
    if (!profileId) return
    persist({ ...record, running: true, startedAtIso: getAppNow(profileId).toISOString() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, persist, record])

  const stop = useCallback(() => {
    if (!profileId) return
    const elapsed = computeStopwatchElapsedMs(record.accumulatedMs, record.startedAtIso, record.running, getAppNow(profileId).getTime())
    persist({ ...record, running: false, accumulatedMs: elapsed, startedAtIso: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, persist, record])

  const reset = useCallback(() => {
    if (profileId) clearTimerRecord(profileId)
    setRecord(defaultTimerRecord(record.mode))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, record.mode])

  const lap = useCallback(() => {
    if (!profileId) return
    const elapsed = computeStopwatchElapsedMs(record.accumulatedMs, record.startedAtIso, record.running, getAppNow(profileId).getTime())
    const nextLap: LapEntry = { lapNumber: record.laps.length + 1, elapsedMs: elapsed }
    persist({ ...record, laps: [...record.laps, nextLap] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, persist, record])

  /**
   * Pause a running round, and resume it where it stopped.
   *
   * The round timer is deadline-anchored, so there was no pause: `stop()`
   * clears startedAtIso, which for round mode is the single source of truth
   * for round and phase — using it here would not pause the timer, it would
   * erase it. These two move the ANCHOR instead, which is the only thing the
   * derivation reads: pausing banks the elapsed time, resuming re-anchors to
   * `now - banked` so the schedule continues from exactly where it stopped.
   * computeRoundState is untouched.
   */
  const pauseRound = useCallback(() => {
    if (!profileId || !record.startedAtIso || !record.running) return
    const elapsed = getAppNow(profileId).getTime() - new Date(record.startedAtIso).getTime()
    persist({ ...record, running: false, accumulatedMs: Math.max(0, elapsed), startedAtIso: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, persist, record])

  const resumeRound = useCallback(() => {
    if (!profileId || record.running || !record.roundConfig) return
    const anchor = getAppNow(profileId).getTime() - record.accumulatedMs
    persist({ ...record, running: true, startedAtIso: new Date(anchor).toISOString() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, persist, record])

  const startRound = useCallback((config: RoundConfig) => {
    if (!profileId) return
    const now = getAppNow(profileId)
    // startedAtIso is the round timer's single source of truth: round, phase
    // and remaining are all derived from (now - startedAt) against the
    // schedule. phaseEndsAtIso/currentRound/currentPhase stay in the record
    // shape for storage compat but are no longer read back for computation.
    persist({
      ...defaultTimerRecord('round'),
      running: true,
      roundConfig: config,
      startedAtIso: now.toISOString(),
      currentRound: 1,
      currentPhase: 'work',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, persist])

  const elapsedMs = useMemo(() => {
    if (!profileId) return record.accumulatedMs
    void tick
    return computeStopwatchElapsedMs(record.accumulatedMs, record.startedAtIso, record.running, getAppNow(profileId).getTime())
  }, [profileId, record.accumulatedMs, record.startedAtIso, record.running, tick])

  /**
   * Round/phase/remaining, derived from elapsed time — and DELIBERATELY not
   * gated on `running` any more.
   *
   * It used to be, and that quietly destroyed the completion state. The cue
   * effect below persists `running: false` the instant a round completes; on
   * the very next render the old guard returned null, so `isRoundComplete`
   * fell back to false and stayed there. The finished state existed for one
   * render and was then unreachable — which is why TimersPanel's own "All
   * rounds complete" line could never appear. Completion is a fact about
   * elapsed time, not about whether a clock is still ticking.
   *
   * Elapsed comes from the anchor while running and from accumulatedMs while
   * paused, so the same derivation serves both. computeRoundState only ever
   * uses (now - start), so handing it epoch-zero and the elapsed figure is
   * exactly equivalent to handing it a real anchor.
   */
  const roundState = useMemo(() => {
    if (!profileId || record.mode !== 'round' || !record.roundConfig) return null
    void tick
    const elapsedMs = record.running && record.startedAtIso
      ? getAppNow(profileId).getTime() - new Date(record.startedAtIso).getTime()
      : record.accumulatedMs
    if (elapsedMs <= 0 && !record.running) return null
    return computeRoundState(record.roundConfig, EPOCH_ISO, Math.max(0, elapsedMs))
  }, [profileId, record.mode, record.roundConfig, record.startedAtIso, record.running, record.accumulatedMs, tick])

  // Cues only — round/phase are pure derivations of the start anchor, so
  // nothing needs persisting per transition (the old per-transition persist
  // advanced round/phase without re-anchoring the stored deadline, which is
  // exactly the corruption computeRoundState's rewrite removed). The ref
  // tracks the last observed schedule position; a step of exactly 1 is a
  // live transition and plays its single cue (only while the app is
  // foregrounded); a larger jump means phases elapsed in the background —
  // those cues are stale, so none fire, never a queued burst. The anchor key
  // resets the baseline on a new round start or reload without cueing.
  const lastCueRef = useRef<{ anchor: string; index: number } | null>(null)
  useEffect(() => {
    if (!roundState || !record.roundConfig || !record.startedAtIso) return
    const index = roundPhaseIndex(roundState, record.roundConfig)
    const prev = lastCueRef.current
    lastCueRef.current = { anchor: record.startedAtIso, index }
    // Completion always stops the record — including when it's the very
    // first observation after a reload (prev === null), where no cue plays.
    const isFirstObservation = !prev || prev.anchor !== record.startedAtIso
    if (roundState.isComplete) {
      if (!isFirstObservation && index - prev!.index === 1 && !document.hidden) playTimerCue('round-complete')
      // accumulatedMs is what keeps the finished state alive: once running
      // goes false the anchor is no longer consulted, so without this the
      // completed round would vanish rather than hold the screen.
      persist({ ...record, running: false, accumulatedMs: totalRoundSeconds(record.roundConfig!) * 1000 })
      return
    }
    if (isFirstObservation) return
    const delta = index - prev!.index
    if (delta === 1 && !document.hidden) {
      playTimerCue(roundState.currentPhase === 'rest' ? 'work-to-rest' : 'rest-to-work')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundState])

  const isActive = record.running || record.accumulatedMs > 0 || record.laps.length > 0

  const [screenOpenRequested, setScreenOpenRequested] = useState(false)
  const requestScreenOpen = useCallback(() => setScreenOpenRequested(true), [])
  const clearScreenOpenRequest = useCallback(() => setScreenOpenRequested(false), [])

  const value: TimersValue = {
    mode: record.mode,
    running: record.running,
    elapsedMs,
    laps: record.laps,
    roundConfig: record.roundConfig,
    currentRound: roundState?.currentRound ?? record.currentRound,
    currentPhase: roundState?.currentPhase ?? record.currentPhase,
    phaseRemainingMs: roundState?.phaseRemainingMs ?? null,
    isRoundComplete: roundState?.isComplete ?? false,
    isActive,
    screenOpenRequested,
    requestScreenOpen,
    clearScreenOpenRequest,
    setMode,
    start,
    stop,
    reset,
    pauseRound,
    resumeRound,
    lap,
    startRound,
  }

  return <TimersContext.Provider value={value}>{children}</TimersContext.Provider>
}
