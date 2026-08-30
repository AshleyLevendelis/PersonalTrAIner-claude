import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { PendingActionReceipt } from '@/lib/pending-actions-store'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.4 (RECEIPT state) + §2.3 (partial/failed
// terminal states). Renders what actually happened — never a blanket
// "Done!" when a partial failure means some ops didn't land. Used both for
// natural-language logging's receipt and for a confirmed swap's result.
// ---------------------------------------------------------------------------

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
  onUndo,
  onRetryFailed,
  onViewProfile,
  onViewGrocery,
  onViewDashboard,
}: {
  title: string
  rows: ReceiptRow[]
  summary?: string
  status: 'done' | 'partial' | 'failed'
  receipt?: PendingActionReceipt
  undoAvailable?: boolean
  onUndo?: () => Promise<void>
  onRetryFailed?: (op: string) => Promise<void>
  /** VISION-ARCHITECTURE.md §1 Part 4 — "linkable from chat receipts": present only for memory_*_saved receipts, deep-links to the Profile screen (Memory merged in) scrolled to the relevant section. */
  onViewProfile?: () => void
  /** VISION-ARCHITECTURE.md §5.4 — present only for grocery_item_added receipts, deep-links to the Meals tab's grocery section. */
  onViewGrocery?: () => void
  /** VISION-ARCHITECTURE.md §5.4 — present only for water_logged receipts, deep-links to the Dashboard tab. */
  onViewDashboard?: () => void
}) {
  const [busy, setBusy] = useState<'undo' | string | null>(null)

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
    ? <CheckCircle2 className="size-3.5 text-primary shrink-0" />
    : status === 'partial'
      ? <AlertTriangle className="size-3.5 text-[color:var(--role-warn)] shrink-0" />
      : <XCircle className="size-3.5 text-destructive shrink-0" />

  return (
    <div className="mt-2 pl-3.5 border-l-2 border-[color:var(--hairline)] text-sm space-y-2">
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
              <span>{f.op} — {f.error}</span>
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
        <p className="text-xs text-destructive">Nothing was applied — {receipt?.failed[0]?.error ?? 'the write failed'}.</p>
      )}

      <div className="flex items-center justify-between pt-0.5">
        {summary && <p className="text-[0.625rem] text-muted-foreground">{summary}</p>}
        <div className="flex items-center gap-1 ml-auto">
          {onViewProfile && (
            <Button size="sm" variant="ghost" className="h-6 text-[0.6875rem]" onClick={onViewProfile}>
              View in profile
            </Button>
          )}
          {onViewGrocery && (
            <Button size="sm" variant="ghost" className="h-6 text-[0.6875rem]" onClick={onViewGrocery}>
              View list
            </Button>
          )}
          {onViewDashboard && (
            <Button size="sm" variant="ghost" className="h-6 text-[0.6875rem]" onClick={onViewDashboard}>
              View
            </Button>
          )}
          {undoAvailable && onUndo && (
            <Button size="sm" variant="ghost" className="h-6 text-[0.6875rem]" disabled={busy != null} onClick={handleUndo}>
              {busy === 'undo' ? 'Undoing…' : 'Undo'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
