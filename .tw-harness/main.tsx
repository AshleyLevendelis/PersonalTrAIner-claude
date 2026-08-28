// Measures the REAL TypewriterMarkdown: when each word actually lands, versus
// when it was asked to. Jitter is the difference.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TypewriterMarkdown } from '@/components/chat/TypewriterMarkdown'
import '@/index.css'

const MSG = "Good to meet you. I'll ask about your goals, what you've got to train with and what your week actually looks like, then build your training and your food around your answers. Nothing changes without your okay. Your plan adapts as you log — if a session feels too easy I'll add load, and if something hurts we'll work around it. First, what should I call you?"

declare global { interface Window { __marks: number[]; __start: number; __done: number } }
window.__marks = []
window.__start = 0
window.__done = 0

function Probe() {
  const [n, setN] = useState(0)
  // A MutationObserver on the rendered output records the wall-clock time of
  // every DOM change the reveal makes — the actual thing a user sees, rather
  // than the timer that was supposed to cause it.
  const ref = (el: HTMLDivElement | null) => {
    if (!el || (el as any).__wired) return
    ;(el as any).__wired = true
    new MutationObserver(() => { window.__marks.push(performance.now()) })
      .observe(el, { childList: true, subtree: true, characterData: true })
  }
  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <button id="go" onClick={() => { window.__marks = []; window.__start = performance.now(); window.__done = 0; setN(x => x + 1) }}>go</button>
      <div ref={ref} className="mt-4 text-[13.5px] leading-[1.5]">
        <TypewriterMarkdown
          key={n}
          text={MSG}
          active={n > 0}
          speed="normal"
          onDone={() => { window.__done = performance.now() }}
        />
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><Probe /></StrictMode>)
