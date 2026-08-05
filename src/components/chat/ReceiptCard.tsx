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
}: {
  title: string
  rows: ReceiptRow[]
  summary?: string
  status: 'done' | 'partial' | 'failed'
  receipt?: PendingActionReceipt
  undoAvailable?: boolean
  onUndo?: () => Promise<void>
  onRetryFailed?: (op: string) => Promise<void>
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
    ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
    : status === 'partial'
      ? <AlertTriangle className="size-3.5 text-amber-600 shrink-0" />
      : <XCircle className="size-3.5 text-destructive shrink-0" />

  return (
    <div className="mt-2 rounded-md border border-border bg-card p-3 text-sm space-y-2">
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
              {row.note && <p className="text-[10px] text-muted-foreground/80 pl-2">{row.note}</p>}
            </div>
          ))}
        </div>
      )}

      {status === 'partial' && receipt && receipt.failed.length > 0 && (
        <div className="space-y-1 rounded-sm bg-amber-50 dark:bg-amber-950/20 p-2">
          <p className="text-[11px] text-amber-800 dark:text-amber-400">Didn't land:</p>
          {receipt.failed.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
              <span>{f.op} — {f.error}</span>
              {onRetryFailed && (
                <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" disabled={busy != null} onClick={() => handleRetry(f.op)}>
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
        {summary && <p className="text-[10px] text-muted-foreground">{summary}</p>}
        {undoAvailable && onUndo && (
          <Button size="sm" variant="ghost" className="h-6 text-[11px] ml-auto" disabled={busy != null} onClick={handleUndo}>
            {busy === 'undo' ? 'Undoing…' : 'Undo'}
          </Button>
        )}
      </div>
    </div>
  )
}
