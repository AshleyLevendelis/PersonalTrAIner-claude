import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import type { RevealSpeed } from '@/lib/reveal-speed-store'

// ---------------------------------------------------------------------------
// Progressive word-by-word reveal for a just-arrived assistant reply.
// ChatAssistant.tsx only ever marks the ONE message that just finished
// streaming from the model as `active` — restored history/cache messages
// render instantly, never replaying the animation on every reload.
//
// Word-level, not character-level: the text is markdown, and truncating
// mid-token (an unclosed "**bold" or a half-written link) would render
// broken syntax for a frame; a whole word is always a safe markdown
// boundary. Each token is a word PLUS its trailing whitespace (matched as
// one unit via WORD_RE) rather than word/whitespace as separate ticks —
// ticking on a bare space is invisible to the reader, and the old
// alternating scheme made the reveal feel twice as fast as its nominal
// interval while also reading as jittery (every other tick showed nothing).
//
// Respects prefers-reduced-motion — renders the full text immediately with
// no delay when set. Deliberately does NOT gate anything else: quick-reply
// buttons wait for `onDone` (see ChatAssistant.tsx, fix — buttons popping in
// mid-sentence read as broken), but ProposalCard, ReceiptCard, and
// ClarificationCard are still siblings rendered from the SAME message the
// instant it arrives, regardless of whether the text above them is still
// animating.
// ---------------------------------------------------------------------------

const WORD_RE = /\S+\s*/g
/**
 * Per-speed {tick, pause} pairs, in ms.
 *
 * RETUNED after measuring the reveal in a browser rather than reasoning about
 * it. At the old `normal` (110/380), one 67-word coach message took **8.9
 * seconds** end to end, and the four sentence-end pauses produced gaps of
 * **491ms** against a 110ms median — so the reveal ran steady, steady,
 * steady, STALL, four times a message. That stall was the "not smooth", not
 * timer drift: measured min 110, median 110, p90 111.
 *
 * So the pause ratio came down hard, from ~3.45x the tick to ~1.6x. It is
 * still a beat at a full stop — the rhythm the old ratio was reaching for —
 * but a beat rather than a halt.
 *
 * `normal` lands near the app's ORIGINAL default (55ms). It had been doubled
 * to 110 on an earlier "roughly double it" request; living with it, the same
 * request came back the other way. Kept slightly above the original because
 * the reveal is frame-aligned now, and steady 50ms reads calmer than jittery
 * 55ms did.
 *
 * `off` has no entry — it is an instant-reveal bypass, same code path as
 * prefers-reduced-motion.
 */
const SPEED_TIMING: Record<Exclude<RevealSpeed, 'off'>, { tick: number; pause: number }> = {
  fast: { tick: 28, pause: 45 },
  normal: { tick: 50, pause: 80 },
  slow: { tick: 95, pause: 150 },
}
const SENTENCE_END_RE = /[.!?]["')\]]?\s*$/

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function TypewriterMarkdown({
  text,
  active,
  components,
  onDone,
  speed = 'normal',
}: {
  text: string
  /** Only true for the single message that just arrived — false renders the full text with no animation. */
  active: boolean
  components?: Components
  onDone?: () => void
  /** User's reveal-speed preference (Settings → Profile). 'off' reveals instantly, same as prefers-reduced-motion. */
  speed?: RevealSpeed
}) {
  const [revealed, setRevealed] = useState(active ? '' : text)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!active || !text || speed === 'off' || prefersReducedMotion()) {
      setRevealed(text)
      if (active) doneRef.current?.()
      return
    }
    const timing = SPEED_TIMING[speed]
    const tokens = text.match(WORD_RE) ?? [text]

    // WHEN each token is due, computed once up front, as an offset from the
    // start. The whole schedule is decided before the first frame, so nothing
    // downstream has to accumulate it.
    const dueAt = new Array<number>(tokens.length)
    let at = 0
    for (let n = 0; n < tokens.length; n++) {
      at += timing.tick
      if (n > 0 && SENTENCE_END_RE.test(tokens[n - 1])) at += timing.pause
      dueAt[n] = at
    }

    let raf = 0
    let shown = 0
    let acc = ''
    const start = performance.now()
    setRevealed('')

    // A FRAME LOOP AGAINST A CLOCK, not a chain of setTimeouts, and the
    // difference is what makes it smooth on a real device.
    //
    // The old version scheduled each word from the moment the previous one
    // rendered, so every late timer — and a phone mid-scroll has plenty —
    // pushed the whole rest of the message further behind. Error accumulated
    // and could never be recovered.
    //
    // Here the schedule is absolute: each frame asks "which words are due by
    // now?" and shows all of them. A stalled frame catches up on the next one
    // instead of falling permanently behind, and the reveal always finishes
    // when it said it would. It also lands each update ON a frame, so the
    // browser paints once per change rather than whenever a timer happened to
    // fire between frames.
    const frame = () => {
      const elapsed = performance.now() - start
      let next = shown
      while (next < tokens.length && dueAt[next] <= elapsed) acc += tokens[next++]
      // Only touch state when the visible text actually changed — at fast
      // speeds several tokens land in one frame, and at slow ones most frames
      // land none. Either way ReactMarkdown re-parses once per CHANGE rather
      // than once per frame.
      if (next !== shown) {
        shown = next
        setRevealed(acc)
      }
      if (shown >= tokens.length) {
        doneRef.current?.()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active, speed])

  return <ReactMarkdown components={components}>{revealed}</ReactMarkdown>
}
