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
// boundary. Respects prefers-reduced-motion — renders the full text
// immediately with no delay when set. Deliberately does NOT gate anything
// else: quick-reply buttons, ProposalCard, ReceiptCard, and
// ClarificationCard are all siblings of this component in ChatAssistant.tsx,
// rendered from the SAME message the instant it arrives regardless of
// whether the text above them is still animating — never wait on `onDone`
// to show or enable them.
// ---------------------------------------------------------------------------

const WORD_SPLIT_RE = /(\s+)/
const TICK_MS = 20

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
    const tokens = text.split(WORD_SPLIT_RE)
    let i = 0
    setRevealed('')
    const id = setInterval(() => {
      i++
      setRevealed(tokens.slice(0, i).join(''))
      if (i >= tokens.length) {
        clearInterval(id)
        doneRef.current?.()
      }
    }, TICK_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active])

  return <ReactMarkdown components={components}>{revealed}</ReactMarkdown>
}
