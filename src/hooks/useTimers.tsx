// ---------------------------------------------------------------------------
// App-wide provider for the standalone stopwatch/lap/round timers, mounted
// alongside ActiveSessionProvider so both the Timers screen and BottomDock
// read the same running timer regardless of which tab is active — exactly
// like the rest timer. Deadline-anchored throughout (timer-engine.ts),
// ticked by the same useDeadlineTick hook the rest facade uses, persisted via
// timer-store.ts so a reload resumes correctly.
// ---------------------------------------------------------------------------

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useDeadlineTick } from './useDeadlineTick'
import { getAppNow } from '@/lib/dev-clock'
import { playTimerCue } from '@/lib/timer-cues'
import {
  computeStopwatchElapsedMs,
  computeRoundState,
  type RoundConfig,
  type RoundPhase,
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
}

const TimersContext = createContext<TimersValue | null>(null)

export function useTimers(): TimersValue {
  const ctx = useContext(TimersContext)
  if (!ctx) throw new Error('useTimers must be used within a TimersProvider')
  return ctx
}

export function TimersProvider({ profileId, children }: { profileId: string | undefined; children: React.ReactNode }) {
  const [record, setRecord] = useState<TimerRecord>(() => defaultTimerRecord('stopwatch'))

  // Hydrate from the persisted record when identity resolves — mirrors the
  // rest facade's own hydration effect.
  useEffect(() => {
    if (!profileId) return
    const existing = getTimerRecord(profileId)
    if (existing) setRecord(existing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  const persist = useCallback((next: TimerRecord) => {
    setRecord(next)
    if (profileId) saveTimerRecord(profileId, next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  const tick = useDeadlineTick(record.running)

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

  const startRound = useCallback((config: RoundConfig) => {
    if (!profileId) return
    const now = getAppNow(profileId)
    const phaseEndsAt = new Date(now.getTime() + config.workSeconds * 1000).toISOString()
    persist({
      ...defaultTimerRecord('round'),
      running: true,
      roundConfig: config,
      phaseEndsAtIso: phaseEndsAt,
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

  const roundState = useMemo(() => {
    if (!profileId || record.mode !== 'round' || !record.roundConfig || !record.phaseEndsAtIso || !record.running) return null
    void tick
    return computeRoundState(record.roundConfig, record.phaseEndsAtIso, record.currentRound, record.currentPhase, getAppNow(profileId).getTime())
  }, [profileId, record.mode, record.roundConfig, record.phaseEndsAtIso, record.running, record.currentRound, record.currentPhase, tick])

  // Persist the walked-forward round/phase once computeRoundState advances
  // past what's stored — keeps the record's own round/phase fields in sync
  // for the next reload instead of re-walking from round 1 every time.
  useEffect(() => {
    if (!roundState) return
    if (roundState.currentRound === record.currentRound && roundState.currentPhase === record.currentPhase && !roundState.isComplete) return
    if (roundState.isComplete) {
      playTimerCue('round-complete')
      persist({ ...record, running: false, currentRound: roundState.currentRound, currentPhase: roundState.currentPhase })
      return
    }
    playTimerCue(roundState.currentPhase === 'rest' ? 'work-to-rest' : 'rest-to-work')
    persist({ ...record, currentRound: roundState.currentRound, currentPhase: roundState.currentPhase })
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
    lap,
    startRound,
  }

  return <TimersContext.Provider value={value}>{children}</TimersContext.Provider>
}
