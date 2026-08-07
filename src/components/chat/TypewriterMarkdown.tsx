import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

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
/** Base delay between words, in ms. One named constant — tune pace here. */
const WORD_TICK_MS = 55
/** Extra pause added after a token that ends a sentence, for a natural
 * "thoughtful typing" cadence rather than a flat machine-gun rate. */
const SENTENCE_PAUSE_MS = 190
const SENTENCE_END_RE = /[.!?]["')\]]?\s*$/

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function TypewriterMarkdown({
  text,
  active,
  components,
  onDone,
}: {
  text: string
  /** Only true for the single message that just arrived — false renders the full text with no animation. */
  active: boolean
  components?: Components
  onDone?: () => void
}) {
  const [revealed, setRevealed] = useState(active ? '' : text)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!active || !text || prefersReducedMotion()) {
      setRevealed(text)
      if (active) doneRef.current?.()
      return
    }
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
      const delay = SENTENCE_END_RE.test(tokens[i - 1]) ? WORD_TICK_MS + SENTENCE_PAUSE_MS : WORD_TICK_MS
      timer = setTimeout(step, delay)
    }
    timer = setTimeout(step, WORD_TICK_MS)

    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active])

  return <ReactMarkdown components={components}>{revealed}</ReactMarkdown>
}
