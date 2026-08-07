import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Voice input for the chat box — on-device transcription via the browser's
// Web Speech API (SpeechRecognition / webkitSpeechRecognition), never routed
// through Gemini or any other server. The resulting text is handed back to
// the caller to drop into the existing chat input; everything downstream
// (intent gate, tools, confirmation cards) is untouched.
//
// TS's DOM lib doesn't ship SpeechRecognition types, so only the handful of
// members actually used are typed here rather than pulling in a full
// ambient-types package for one hook.
//
// iOS Safari support is patchy (frequently absent, or present but unreliable
// mid-session) — callers MUST feature-detect via `isSupported` and simply
// not render a mic control when it's false. Reliable iOS voice input is
// planned via the future Capacitor wrapper's native speech recognition, not
// this API.
// ---------------------------------------------------------------------------

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>
  /** Per spec, the lowest index in `results` that changed in this event. Not
   * guaranteed present/correct on every engine — treated as a hint, not the
   * sole source of truth (see accumulation comment in `start()` below). */
  resultIndex?: number
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeechToText({
  onTranscript,
  onDebugLine,
}: {
  onTranscript: (text: string, isFinal: boolean) => void
  /** Temporary diagnostic hook (see ChatAssistant.tsx's voice-debug overlay,
   * gated behind localStorage `fitplan_voice_debug=1`) — fires one line per
   * onresult event so a real-device trace can be captured without a tethered
   * devtools session. Safe to leave wired in production: it's a no-op unless
   * a caller passes it, and ChatAssistant only does that behind the flag. */
  onDebugLine?: (line: string) => void
}) {
  const ctorRef = useRef(getSpeechRecognitionCtor())
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  // Set once on the first denial and never cleared this session — this is
  // what makes the "explain once, don't nag" rule work: later taps just
  // no-op instead of re-showing the message or re-prompting a browser that
  // has already said no.
  const deniedRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  const onDebugLineRef = useRef(onDebugLine)
  onDebugLineRef.current = onDebugLine
  // Bumped on every start() — each recognition instance's callbacks capture
  // the generation they were created with and refuse to act once a newer
  // generation exists. This is the fix for a duplication path the previous
  // round's fake-harness test couldn't reach: calling recognition.stop()
  // does NOT synchronously detach its listeners or guarantee no further
  // events — on a real device a late onresult from the instance being
  // replaced can still fire after start() has already handed out a new one
  // (e.g. a fast double-tap, or React not having flushed isListening yet).
  // Two live sessions transcribing the same speech and both writing to the
  // input independently reproduces exactly the "each event's text repeats"
  // symptom, with no bug in the accumulation math itself.
  const generationRef = useRef(0)

  const isSupported = ctorRef.current != null

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!ctorRef.current || deniedRef.current) return
    const myGeneration = ++generationRef.current

    const stale = recognitionRef.current
    if (stale) {
      // Detach immediately rather than relying on stop() to do it — stop()
      // is async and, per the comment above, may not prevent one more
      // onresult/onend from an instance we've already superseded.
      stale.onresult = null
      stale.onerror = null
      stale.onend = null
      stale.stop()
    }

    const recognition = new ctorRef.current()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    // Accumulation is keyed by result INDEX, not by a running counter/string
    // concatenation. This is deliberately idempotent: whatever the real
    // engine's replay behavior turns out to be (resending the full results
    // array from 0 every event, re-marking an already-final index as final
    // again with a revised transcript, an unreliable/absent resultIndex —
    // any of which could explain the on-device "whatwhatwhat workout..."
    // symptom that the fake single-shot test harness never exercised),
    // writing finalsByIndex[i] = transcript OVERWRITES rather than appends.
    // Reprocessing the same index any number of times converges to the same
    // string instead of compounding it. event.resultIndex is used as a hint
    // to start the scan late when the engine provides it; correctness does
    // not depend on it being accurate, since a full 0-rescan is equally safe.
    const finalsByIndex: string[] = []
    recognition.onresult = event => {
      if (generationRef.current !== myGeneration) return // stray event from a superseded session
      const startIdx = typeof event.resultIndex === 'number' && event.resultIndex >= 0 && event.resultIndex <= event.results.length
        ? event.resultIndex
        : 0
      for (let i = startIdx; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalsByIndex[i] = result[0].transcript
      }
      const last = event.results.length > 0 ? event.results[event.results.length - 1] : undefined
      const interimText = last && !last.isFinal ? last[0].transcript : ''
      const finalText = finalsByIndex.filter(Boolean).join(' ')
      const combined = finalText + (finalText && interimText ? ' ' : '') + interimText

      if (onDebugLineRef.current) {
        const perResult = Array.from({ length: event.results.length }, (_, i) => {
          const r = event.results[i]
          return `${i}:${r.isFinal ? 'F' : 'i'}"${r[0].transcript}"`
        }).join(' ')
        onDebugLineRef.current(
          `gen=${myGeneration} resultIndex=${event.resultIndex ?? 'undef'} len=${event.results.length} [${perResult}] -> combined="${combined}"`
        )
      }

      onTranscriptRef.current(combined, interimText === '')
    }
    recognition.onerror = event => {
      if (generationRef.current !== myGeneration) return
      if ((event.error === 'not-allowed' || event.error === 'service-not-allowed') && !deniedRef.current) {
        deniedRef.current = true
        setPermissionError("Microphone access was denied — allow it in your browser's site settings, then reload to use voice input.")
      }
      onDebugLineRef.current?.(`gen=${myGeneration} onerror: ${event.error}`)
      setIsListening(false)
    }
    recognition.onend = () => {
      if (generationRef.current !== myGeneration) return
      onDebugLineRef.current?.(`gen=${myGeneration} onend`)
      setIsListening(false)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setIsListening(true)
      onDebugLineRef.current?.(`gen=${myGeneration} start()`)
    } catch (e) {
      setIsListening(false)
      onDebugLineRef.current?.(`gen=${myGeneration} start() threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  useEffect(() => () => { recognitionRef.current?.stop() }, [])

  return { isSupported, isListening, permissionError, start, stop }
}
