// ---------------------------------------------------------------------------
// READ A COACH MESSAGE ALOUD, WITH THE PHONE'S OWN VOICE.
//
// Ashley's ruling, 31 Oct 2026, on the design's voice-note question, from
// options: "Option 1, add a listen button". Every coach bubble gets a small
// speaker button that reads that message aloud with the device's speech
// (window.speechSynthesis). No voice-note bubbles and no waveform; no new
// service, no network, no edge function.
//
// One message plays at a time: starting one stops any other, a second tap on
// the playing one stops it, and the chat stops it when it unmounts or its tab
// is left. Where the browser has no speechSynthesis nothing is drawn, so there
// is never a button that does nothing.
//
// Pure apart from the synth it is handed, so a gate can drive it with a fake.
// ---------------------------------------------------------------------------

/** The two calls this module makes on a SpeechSynthesis, and nothing else. */
export interface SynthLike {
  speak: (u: SpeechSynthesisUtterance) => void
  cancel: () => void
}

type UtteranceFactory = (text: string) => SpeechSynthesisUtterance

/** The device's synth, or null where the browser has none. */
export function deviceSynth(win: unknown = typeof window === 'undefined' ? undefined : window): SynthLike | null {
  const w = win as { speechSynthesis?: SynthLike; SpeechSynthesisUtterance?: unknown } | undefined
  if (!w || !w.speechSynthesis || typeof w.SpeechSynthesisUtterance !== 'function') return null
  return w.speechSynthesis
}

/**
 * The words a bubble shows, as they would be read: its rendered text (so no
 * markdown is left in), whitespace collapsed. The listen button has no text of
 * its own, so it is never read.
 */
export function spokenTextOf(bubble: { innerText?: string; textContent?: string | null } | null | undefined): string {
  if (!bubble) return ''
  return String(bubble.innerText ?? bubble.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export interface ReadAloud {
  /** Which message is being read, or null. */
  current: () => string | null
  /** Read this message; whatever else was playing stops first. A tap on the one playing stops it instead. */
  toggle: (key: string, text: string) => void
  /** Stop whatever is playing. */
  stop: () => void
  subscribe: (fn: () => void) => () => void
}

export function makeReadAloud(getSynth: () => SynthLike | null, makeUtterance: UtteranceFactory): ReadAloud {
  let playing: { key: string; utterance: SpeechSynthesisUtterance } | null = null
  const listeners = new Set<() => void>()
  const notify = () => { for (const fn of listeners) fn() }
  const stop = () => {
    const synth = getSynth()
    const was = playing
    playing = null
    if (synth) synth.cancel()
    if (was) notify()
  }
  return {
    current: () => playing?.key ?? null,
    stop,
    toggle: (key, text) => {
      const synth = getSynth()
      if (!synth) return
      if (playing?.key === key) { stop(); return }
      // ONE AT A TIME: anything playing (or queued) goes first.
      synth.cancel()
      const words = text.trim()
      if (!words) { if (playing) { playing = null; notify() } return }
      const utterance = makeUtterance(words)
      const done = () => { if (playing?.utterance === utterance) { playing = null; notify() } }
      utterance.onend = done
      utterance.onerror = done
      playing = { key, utterance }
      synth.speak(utterance)
      notify()
    },
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
}

/** The app's one reader, on the device's own voice. */
export const readAloud: ReadAloud = makeReadAloud(
  () => deviceSynth(),
  text => new SpeechSynthesisUtterance(text),
)
