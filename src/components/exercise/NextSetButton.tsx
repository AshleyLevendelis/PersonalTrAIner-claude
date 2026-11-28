import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { readNextSet, nextSetTick, nextSetLabel, nextSetParts, needsWeight, needsReps, type NextSet } from '@/lib/next-set-label'

/**
 * The fixed button during a session: "Log set 3 · Bench 80 kg × 6".
 *
 * It WATCHES the list rather than working the set out, because SetGrid is
 * the one place that knows which set is next and what a blank box saves —
 * and the label must change the moment a box is typed in or a tick lands.
 * One tap presses that same tick, so the button can only ever do what the
 * tick does. With no weight to take it opens the box instead: pressing a
 * tick that would refuse would look like a dead button.
 */
/**
 * A THUMB BOUNCE IS ONE SET (28 Nov 2026, found tracing verify:next-set-now). On a single lift a second tap within the
 * bounce landed on the tick just saved, which holds; on a SUPERSET the first tap moves the button to the partner's set
 * at once (the rounds rule of 27 Nov), so a bounce 300 ms later logged a set of the other exercise that was never done.
 * CSCS: a real next press follows a set of work, never under a second later, so a press inside this window is ignored.
 */
const NEXT_SET_BOUNCE_MS = 1000

export function NextSetButton({ root, bottom }: { root: HTMLElement | null; bottom: string }) {
  const [next, setNext] = useState<NextSet | null>(null)
  const lastPress = useRef(0)

  useEffect(() => {
    if (!root) { setNext(null); return }
    const read = () => setNext(prev => {
      const now = readNextSet(root)
      return prev && now && JSON.stringify(prev) === JSON.stringify(now) ? prev : now
    })
    read()
    const mo = new MutationObserver(read)
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-next-set', 'data-next-weight', 'data-next-reps', 'data-next-unit', 'data-exercise-now'] })
    return () => mo.disconnect()
  }, [root])

  if (!next || !root) return null

  const press = () => {
    const now = Date.now()
    if (now - lastPress.current < NEXT_SET_BOUNCE_MS) return
    lastPress.current = now
    const tick = nextSetTick(root)
    if (!tick) return
    if (needsWeight(next) || needsReps(next)) {
      const box = document.getElementById(needsWeight(next) ? next.weightBox : next.repsBox)
      box?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      box?.focus()
      return
    }
    tick.click()
  }

  return (
    <div
      className="fixed inset-x-0 z-40 px-[22px] pb-3 pt-2.5"
      style={{ bottom, background: 'linear-gradient(to top, var(--background) 70%, transparent)' }}
    >
      <Button className="h-[52px] w-full text-[0.9375rem] font-semibold" data-next-set-button aria-label={nextSetLabel(next)} onClick={press}>
        {/* The lift may be cut short; the weight and reps never are. */}
        <span className="flex min-w-0 max-w-full">
          <span className="min-w-0 truncate" data-next-set-head>{nextSetParts(next).head}</span>
          <span className="shrink-0 whitespace-pre" data-next-set-tail>{nextSetParts(next).tail}</span>
        </span>
      </Button>
    </div>
  )
}
