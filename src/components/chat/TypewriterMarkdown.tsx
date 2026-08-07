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
 * Per-speed {tick, pause} pairs, in ms — the pause is always ~3.45x the
 * tick (the original 190/55 ratio), so slowing/speeding up the base rate
 * keeps the same "thoughtful typing" rhythm rather than flattening it out
 * at one end. `fast` is the app's original (pre-user-request) default;
 * `normal`, the new default, is materially slower per the user's explicit
 * "roughly double it" request. `off` has no entry — it's handled as an
 * instant-reveal bypass, same code path as prefers-reduced-motion.
 */
const SPEED_TIMING: Record<Exclude<RevealSpeed, 'off'>, { tick: number; pause: number }> = {
  fast: { tick: 55, pause: 190 },
  normal: { tick: 110, pause: 380 },
  slow: { tick: 165, pause: 570 },
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
    let i = 0
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    setRevealed('')

    const step = () => {
      if (cancelled) return
      i++
      setRevealed(tokens.slice(0, i).join(''))
      if (i >= tokens.length) {
        doneRef.current?.()
        return
      }
      const delay = SENTENCE_END_RE.test(tokens[i - 1]) ? timing.tick + timing.pause : timing.tick
      timer = setTimeout(step, delay)
    }
    timer = setTimeout(step, timing.tick)

    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active, speed])

  return <ReactMarkdown components={components}>{revealed}</ReactMarkdown>
}
