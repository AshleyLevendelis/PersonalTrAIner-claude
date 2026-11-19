// ---------------------------------------------------------------------------
// The app's only audio/haptic mechanism — extracted from BottomDock.tsx's
// private playChime() (originally rest-timer-only) so the round timer's
// work/rest/complete transitions can reuse it with distinct tones instead of
// a second implementation. No audio assets anywhere in this app; every cue
// is a Web Audio oscillator. Best-effort only (§3.8): iOS suspends an
// AudioContext created without a user gesture, so this can silently no-op —
// that is correct, honest behaviour, not a bug to work around here.
// ---------------------------------------------------------------------------

export type TimerCue = 'rest-complete' | 'work-to-rest' | 'rest-to-work' | 'round-complete'

const CUE_TONES: Record<TimerCue, { frequency: number; durationMs: number; vibration: number[] }> = {
  'rest-complete': { frequency: 880, durationMs: 500, vibration: [200, 100, 200] },
  'work-to-rest': { frequency: 660, durationMs: 300, vibration: [150] },
  'rest-to-work': { frequency: 990, durationMs: 300, vibration: [150, 80, 150] },
  'round-complete': { frequency: 1200, durationMs: 700, vibration: [200, 100, 200, 100, 200] },
}

/**
 * `sound` / `vibrate` default on. Only the round timer passes them (her Beeps
 * and Buzz switches, 4c); the rest timer's chime is not those switches' business.
 */
export function playTimerCue(cue: TimerCue, opts: { sound?: boolean; vibrate?: boolean } = {}): void {
  const tone = CUE_TONES[cue]
  if (opts.sound !== false) try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = tone.frequency
    // LOUD ENOUGH FOR A GYM FLOOR (19 Nov 2026, his "make the timer's sound louder"): it was a sine
    // at 0.3 that faded straight away, so most of the beep was near-silent. Now a triangle wave (its
    // overtones carry over machines and music) at full level, held for most of the tone and cut off
    // quickly. Full level is the ceiling a single oscillator can take without clipping; past that
    // it is the phone's own volume.
    osc.type = 'triangle'
    const end = ctx.currentTime + tone.durationMs / 1000
    gain.gain.setValueAtTime(1, ctx.currentTime)
    gain.gain.setValueAtTime(1, ctx.currentTime + (tone.durationMs / 1000) * 0.8)
    gain.gain.exponentialRampToValueAtTime(0.01, end)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + tone.durationMs / 1000)
    setTimeout(() => ctx.close(), tone.durationMs + 100)
  } catch {
    // Silent fallback — see module doc comment.
  }
  // Android only — a permanent no-op on iOS Safari at every version.
  if (opts.vibrate !== false && navigator.vibrate) navigator.vibrate(tone.vibration)
}
