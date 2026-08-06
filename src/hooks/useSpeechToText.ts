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

export function useSpeechToText({ onTranscript }: { onTranscript: (text: string, isFinal: boolean) => void }) {
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

  const isSupported = ctorRef.current != null

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!ctorRef.current || deniedRef.current) return
    // Requesting a second concurrent session throws in most engines — stop
    // any stale instance first rather than guard on `isListening`, which
    // can lag one render behind a fast double-tap.
    recognitionRef.current?.stop()

    const recognition = new ctorRef.current()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    // Fix — voice input compounding instead of replacing. `event.results`
    // keeps every already-final result around on every subsequent event, so
    // naively re-summing the whole array on each onresult (as this used to)
    // re-appends already-locked-in segments every time they're still
    // present — and the still-open (non-final) segment is a REVISION of the
    // recognizer's guess, not new text, so it must replace the previous
    // interim rather than concatenate onto it. `finalizedCount` tracks how
    // many leading results have already been folded into `finalizedText` so
    // each final segment is counted exactly once; the current interim is
    // always just the single most-recent non-final result, never a running
    // concatenation of its own revisions.
    let finalizedText = ''
    let finalizedCount = 0
    recognition.onresult = event => {
      let interimText = ''
      for (let i = finalizedCount; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalizedText += (finalizedText ? ' ' : '') + result[0].transcript
          finalizedCount = i + 1
        } else {
          interimText = result[0].transcript
        }
      }
      const combined = finalizedText + (finalizedText && interimText ? ' ' : '') + interimText
      onTranscriptRef.current(combined, interimText === '')
    }
    recognition.onerror = event => {
      if ((event.error === 'not-allowed' || event.error === 'service-not-allowed') && !deniedRef.current) {
        deniedRef.current = true
        setPermissionError("Microphone access was denied — allow it in your browser's site settings, then reload to use voice input.")
      }
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    try {
      recognition.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }, [])

  useEffect(() => () => { recognitionRef.current?.stop() }, [])

  return { isSupported, isListening, permissionError, start, stop }
}
