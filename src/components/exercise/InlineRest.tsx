import { useEffect, useId, useRef } from 'react'
import { Timer } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { setInlineRestVisible } from '@/lib/inline-rest-presence'

// ---------------------------------------------------------------------------
// THE REST, UNDER THE SET JUST TICKED (tab polish, Exercise 2a, 31 Oct 2026).
//
// A VIEW OF THE ONE ENGINE, never a second timer: the deadline, the total, the
// ±15 and Skip are all useActiveSession's (the same ones BottomDock uses), so
// a reload mid-rest, another tab, or the dock all see the same countdown. The
// grid decides WHERE it sits (restBelongsToSet); this only draws it and says
// when it is in view, so the dock can stand aside rather than say it twice.
// ---------------------------------------------------------------------------

/** The rest that is running belongs under THIS working set: the same lift, and the set it leads into is the next one. Never after the last set (it leads into nothing). */
export function restBelongsToSet(
  rest: { restEndsAt: string | null; restLabel: string | null; restTargetSetNumber: number | null },
  exerciseName: string,
  setNumber: number,
): boolean {
  return !!rest.restEndsAt && rest.restLabel === exerciseName && rest.restTargetSetNumber === setNumber + 1
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function InlineRest() {
  const { restRemainingMs, restTotalMs, restTargetSetNumber, adjustRest, dismissRest } = useActiveSession()
  const ref = useRef<HTMLDivElement | null>(null)
  const id = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInlineRestVisible(id, true)
      return () => setInlineRestVisible(id, false)
    }
    const io = new IntersectionObserver(([entry]) => setInlineRestVisible(id, entry.isIntersecting), { threshold: 0.6 })
    io.observe(el)
    return () => { io.disconnect(); setInlineRestVisible(id, false) }
  }, [id])

  const left = restRemainingMs ?? 0
  const over = left <= 0
  const share = restTotalMs && restTotalMs > 0 ? Math.min(1, Math.max(0, left / restTotalMs)) : 0
  const step = 'flex h-11 min-w-11 items-center justify-center rounded-[12px] px-2 font-mono text-[0.75rem] font-semibold disabled:opacity-40'

  return (
    <div
      ref={ref}
      data-testid="inline-rest"
      data-rest-left={Math.max(0, Math.ceil(left / 1000))}
      role="timer"
      aria-label={over ? `Rest over. Go, set ${restTargetSetNumber ?? ''}` : `Rest, ${clock(left)} left`}
      className="mx-0.5 mb-2 mt-1 flex items-center gap-2.5 rounded-2xl py-2 pl-3 pr-2"
      style={{ background: 'rgba(var(--glow-rgb), .08)', border: '1px solid rgba(var(--glow-rgb), .28)' }}
    >
      <Timer className="size-4 shrink-0 text-primary-text" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[.12em] text-primary-text">{over ? 'Go' : 'Rest'}</span>
          <span className="font-mono text-[1.0625rem] font-bold tracking-[-.02em] text-foreground" data-testid="inline-rest-clock">
            {over ? `Set ${restTargetSetNumber ?? ''}`.trim() : clock(left)}
          </span>
        </div>
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-full" style={{ background: 'var(--hairline)' }}>
          <div className="h-[3px] rounded-full transition-[width] duration-1000 ease-linear" data-testid="inline-rest-bar" style={{ width: `${share * 100}%`, background: 'var(--primary)', boxShadow: '0 0 8px rgba(var(--glow-rgb), .8)' }} />
        </div>
      </div>
      <span className="flex shrink-0 gap-2">
        {/* Not past zero on a tap that reads "a bit less" (the dock's -30 rule). */}
        <button type="button" className={step} style={{ background: 'var(--surface-raised)', color: 'var(--role-ai-text)' }}
          disabled={left <= 15_000} onClick={() => adjustRest(-15)} aria-label="Rest 15 seconds less">−15</button>
        <button type="button" className={step} style={{ background: 'var(--surface-raised)', color: 'var(--role-ai-text)' }}
          onClick={() => adjustRest(15)} aria-label="Rest 15 seconds more">+15</button>
        <button type="button" className={`${step} text-primary-text`} onClick={dismissRest} data-testid="inline-rest-skip">Skip</button>
      </span>
    </div>
  )
}
