import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { PendingActionReceipt } from '@/lib/pending-actions-store'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.4 (RECEIPT state) + §2.3 (partial/failed
// terminal states). Renders what actually happened — never a blanket
// "Done!" when a partial failure means some ops didn't land. Used both for
// natural-language logging's receipt and for a confirmed swap's result.
// ---------------------------------------------------------------------------

// A RECEIPT IS A LINE IN THE CONVERSATION, NOT A CARD (Ashley, 20 Oct 2026,
// "text + small buttons always", for the offer it answers): no rule down its
// side, and its Undo and View buttons are the offer's small ones — a pill the
// size of a word inside a 44px tap target.
const SMALL = 'inline-flex min-h-[44px] items-center disabled:opacity-60'
const PILL = 'inline-flex items-center rounded-full border border-[color:var(--hairline)] px-2.5 py-0.5 text-[0.75rem] leading-5 text-muted-foreground'

export interface ReceiptRow {
  label: string
  detail: string
  note?: string
}

export function ReceiptCard({
  title,
  rows,
  summary,
  status,
  receipt,
  undoAvailable,
  undoUntil,
  onUndo,
  onRetryFailed,
  onViewProfile,
  onViewGrocery,
  onViewDashboard,
  onViewExercise,
}: {
  title: string
  rows: ReceiptRow[]
  summary?: string
  status: 'done' | 'partial' | 'failed'
  receipt?: PendingActionReceipt
  undoAvailable?: boolean
  /** When Undo stops working (ms). The button goes at that moment, so an old card cannot offer an Undo that does nothing (run 7, M53). */
  undoUntil?: number
  onUndo?: () => Promise<void>
  onRetryFailed?: (op: string) => Promise<void>
  /** VISION-ARCHITECTURE.md §1 Part 4 — "linkable from chat receipts": present only for memory_*_saved receipts, deep-links to the Profile screen (Memory merged in) scrolled to the relevant section. */
  onViewProfile?: () => void
  /** VISION-ARCHITECTURE.md §5.4 — present only for grocery_item_added receipts, deep-links to the Meals tab's grocery section. */
  onViewGrocery?: () => void
  /** VISION-ARCHITECTURE.md §5.4 — present only for water_logged receipts, deep-links to the Dashboard tab. */
  onViewDashboard?: () => void
  /** Present only for steps_logged receipts. Steps live on the EXERCISE tab (§5.1a, 5 Sep 2026) — sending them to the Dashboard would be pointing at the tile rather than the number. */
  onViewExercise?: () => void
}) {
  const [busy, setBusy] = useState<'undo' | string | null>(null)
  const [undoExpired, setUndoExpired] = useState(false)
  useEffect(() => {
    if (undoUntil == null) return
    const left = undoUntil - Date.now()
    if (left <= 0) { setUndoExpired(true); return }
    setUndoExpired(false)
    const t = setTimeout(() => setUndoExpired(true), left)
    return () => clearTimeout(t)
  }, [undoUntil])

  const handleUndo = async () => {
    if (!onUndo) return
    setBusy('undo')
    try {
      await onUndo()
    } finally {
      setBusy(null)
    }
  }

  const handleRetry = async (op: string) => {
    if (!onRetryFailed) return
    setBusy(op)
    try {
      await onRetryFailed(op)
    } finally {
      setBusy(null)
    }
  }

  const icon = status === 'done'
    ? <CheckCircle2 className="size-3.5 text-primary-text shrink-0" />
    : status === 'partial'
      ? <AlertTriangle className="size-3.5 text-[color:var(--role-warn)] shrink-0" />
      : <XCircle className="size-3.5 text-destructive shrink-0" />

  return (
    <div data-testid="chat-receipt" className="mt-2 pl-0.5 text-sm space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {title}
      </p>

      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{row.label}</span>
                <span className="text-muted-foreground">{row.detail}</span>
              </div>
              {row.note && <p className="text-[0.625rem] text-muted-foreground/80 pl-2">{row.note}</p>}
            </div>
          ))}
        </div>
      )}

      {status === 'partial' && receipt && receipt.failed.length > 0 && (
        <div className="space-y-1 rounded-sm bg-[color:var(--role-warn-bg)] p-2">
          <p className="text-[0.6875rem] text-[color:var(--role-warn-text)]">Didn't land:</p>
          {receipt.failed.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[0.6875rem]">
              {/* AN INTERNAL TOOL NAME IS NEVER SHOWN (29 Sep 2026). Receipts
                  from the executor name the failed step by its tool
                  (propose_meal_refit, propose_exercise_swap...), which read
                  aloud as "propose_meal_top_up — 4 of the 6 didn't come back".
                  The title above already says what was being done, so a
                  tool-shaped name is dropped and the sentence stands alone. */}
              <span>{/^propose_/.test(f.op) ? f.error : `${f.op} — ${f.error}`}</span>
              {onRetryFailed && (
                <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[0.625rem]" disabled={busy != null} onClick={() => handleRetry(f.op)}>
                  {busy === f.op ? '…' : 'Retry'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {status === 'failed' && (
        <p className="text-xs text-destructive">Nothing was applied — {(receipt?.failed[0]?.error ?? 'the write failed').replace(/[.!?]+$/, '')}.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 pt-0.5">
        {summary && <p className="text-[0.625rem] text-muted-foreground">{summary}</p>}
        <div className="flex items-center gap-x-1.5">
          {onViewProfile && (
            <button type="button" className={SMALL} onClick={onViewProfile}>
              <span className={PILL}>View in profile</span>
            </button>
          )}
          {onViewGrocery && (
            <button type="button" className={SMALL} onClick={onViewGrocery}>
              <span className={PILL}>View list</span>
            </button>
          )}
          {onViewDashboard && (
            <button type="button" className={SMALL} onClick={onViewDashboard}>
              <span className={PILL}>View</span>
            </button>
          )}
          {onViewExercise && (
            <button type="button" className={SMALL} onClick={onViewExercise}>
              <span className={PILL}>View</span>
            </button>
          )}
          {undoAvailable && !undoExpired && onUndo && (
            <button type="button" className={SMALL} disabled={busy != null} onClick={handleUndo}>
              <span className={PILL}>{busy === 'undo' ? 'Undoing…' : 'Undo'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
