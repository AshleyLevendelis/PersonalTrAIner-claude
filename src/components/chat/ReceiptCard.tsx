import { useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PendingActionReceipt } from '@/lib/pending-actions-store'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.4 (RECEIPT state) + §2.3 (partial/failed
// terminal states). Renders what actually happened — never a blanket
// "Done!" when a partial failure means some ops didn't land. Used both for
// natural-language logging's receipt and for a confirmed swap's result.
//
// Grouped-bubbles revamp (3 Sep 2026): the receipt is a bubble in the
// TrAIner's run — same shell as ProposalCard (the mint inset edge), the
// radius for its position supplied by the caller.
// ---------------------------------------------------------------------------

export interface ReceiptRow {
  label: string
  detail: string
  note?: string
}

const FOOTER_BUTTON = 'h-7 shrink-0 rounded-md bg-transparent px-2 text-[0.6875rem] font-medium transition-colors hover:bg-[rgba(var(--glow-rgb),.08)] disabled:opacity-60'

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
  className,
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
  /** The bubble radius for this card's position in its run (see bubbles.tsx). Defaults to a lone bubble. */
  className?: string
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
    ? <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
    : status === 'partial'
      ? <AlertTriangle className="size-3.5 shrink-0 text-[color:var(--role-warn)]" />
      : <XCircle className="size-3.5 shrink-0 text-destructive" />

  const hasFooter = !!summary || !!onViewProfile || !!onViewGrocery || !!onViewDashboard || (undoAvailable && !!onUndo)

  return (
    <div
      data-chat-receipt
      className={cn('flex w-full flex-col gap-2 bg-card px-3.5 py-3 text-sm shadow-[inset_3px_0_0_var(--primary)]', className ?? 'rounded-[18px]')}
    >
      <p className="flex items-center gap-2 text-xs font-semibold">
        {icon}
        <span>{title}</span>
      </p>

      {rows.length > 0 && (
        <div className="flex flex-col gap-1">
          {rows.map((row, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{row.label}</span>
                <span className="tabular-mono text-right text-muted-foreground">{row.detail}</span>
              </div>
              {row.note && <p className="text-[0.625rem] text-muted-foreground/80">{row.note}</p>}
            </div>
          ))}
        </div>
      )}

      {status === 'partial' && receipt && receipt.failed.length > 0 && (
        <div className="space-y-1 rounded-lg bg-[color:var(--role-warn-bg)] p-2">
          <p className="text-[0.6875rem] text-[color:var(--role-warn-text)]">Didn't land:</p>
          {receipt.failed.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[0.6875rem]">
              <span>{f.op} — {f.error}</span>
              {onRetryFailed && (
                <button type="button" className={cn(FOOTER_BUTTON, 'text-primary')} disabled={busy != null} onClick={() => handleRetry(f.op)}>
                  {busy === f.op ? '…' : 'Retry'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {status === 'failed' && (
        <p className="text-xs text-destructive">Nothing was applied — {receipt?.failed[0]?.error ?? 'the write failed'}.</p>
      )}

      {hasFooter && (
        <div className="flex items-center justify-between gap-3 pt-0.5">
          {summary ? <p className="text-[0.625rem] text-muted-foreground">{summary}</p> : <span />}
          <div className="flex shrink-0 items-center gap-1">
            {onViewProfile && (
              <button type="button" className={cn(FOOTER_BUTTON, 'text-[color:var(--text-tertiary)]')} onClick={onViewProfile}>
                View in profile
              </button>
            )}
            {onViewGrocery && (
              <button type="button" className={cn(FOOTER_BUTTON, 'text-[color:var(--text-tertiary)]')} onClick={onViewGrocery}>
                View list
              </button>
            )}
            {onViewDashboard && (
              <button type="button" className={cn(FOOTER_BUTTON, 'text-[color:var(--text-tertiary)]')} onClick={onViewDashboard}>
                View
              </button>
            )}
            {undoAvailable && onUndo && (
              <button type="button" className={cn(FOOTER_BUTTON, 'text-primary')} disabled={busy != null} onClick={handleUndo}>
                {busy === 'undo' ? 'Undoing…' : 'Undo'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
