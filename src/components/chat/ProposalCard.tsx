import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRightLeft, ShieldAlert, Info } from 'lucide-react'
import type { ChatPendingActionView } from '@/lib/types'

// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.4 — "rendering the effect, not prose." ONE
// generic component renders `diff.rows` + `implications` for ANY domain
// (exercise swap, meal swap) — no per-domain card. This is the structural
// half of D1: the card is what actually renders on a plan_mutation turn;
// the model's own text for that turn is discarded entirely by
// ChatAssistant.tsx's processResponse, never reaching this component.
// ---------------------------------------------------------------------------

export function ProposalCard({
  pendingAction,
  onConfirm,
  onReject,
}: {
  pendingAction: ChatPendingActionView
  onConfirm: (editedScope?: string) => Promise<void>
  onReject: () => Promise<void>
}) {
  const { diff, status } = pendingAction
  const [scope, setScope] = useState<string | undefined>(diff.editable?.find(e => e.field === 'scope')?.options[0])
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null)

  const busyOverall = busy != null || status === 'claimed' || status === 'executing'
  const isStale = status === 'stale'
  const isTerminal = status === 'done' || status === 'partial' || status === 'failed' || status === 'declined' || status === 'expired'

  const handleConfirm = async () => {
    setBusy('confirm')
    try {
      await onConfirm(scope)
    } finally {
      setBusy(null)
    }
  }

  const handleReject = async () => {
    setBusy('reject')
    try {
      await onReject()
    } finally {
      setBusy(null)
    }
  }

  const scopeField = diff.editable?.find(e => e.field === 'scope')

  return (
    <div className="mt-2 rounded-md border border-border bg-card p-3 text-sm space-y-2.5">
      <div className="space-y-1.5">
        {diff.rows.map((row, i) => (
          <div key={i} className="flex items-start justify-between gap-2 text-xs">
            <span className="text-muted-foreground shrink-0">{row.field}</span>
            <span className="text-right">
              <span className="line-through text-muted-foreground/70">{row.before}</span>
              {' → '}
              <span className="font-medium">{row.after}</span>
              {row.note && <span className="block text-[10px] text-muted-foreground/80">{row.note}</span>}
            </span>
          </div>
        ))}
      </div>

      {diff.unchanged && diff.unchanged.length > 0 && (
        <p className="text-[10px] text-muted-foreground/70">Unchanged: {diff.unchanged.join(', ')}</p>
      )}

      {diff.implications?.map((imp, i) => (
        <p key={i} className={`flex items-start gap-1.5 text-xs ${imp.severity === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {imp.severity === 'warn' ? <ShieldAlert className="size-3.5 mt-0.5 shrink-0" /> : <Info className="size-3.5 mt-0.5 shrink-0" />}
          <span>{imp.text}</span>
        </p>
      ))}

      {diff.rationale && <p className="text-xs italic text-muted-foreground">"{diff.rationale}"</p>}

      {scopeField && !isTerminal && (
        <div className="flex gap-1.5">
          {scopeField.options.map(opt => (
            <button
              key={opt}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                scope === opt ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
              }`}
              onClick={() => setScope(opt)}
              disabled={busyOverall}
            >
              {opt === 'today' ? 'Today only' : 'Rest of block'}
            </button>
          ))}
        </div>
      )}

      {isStale ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">This changed since I proposed it — ask me again if you still want it.</p>
      ) : isTerminal ? null : (
        <div className="flex items-center gap-2 pt-0.5">
          <Button size="sm" className="h-7 text-xs" onClick={handleConfirm} disabled={busyOverall}>
            <ArrowRightLeft className="size-3 mr-1" />
            {busy === 'confirm' ? 'Applying…' : 'Confirm'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleReject} disabled={busyOverall}>
            {busy === 'reject' ? 'Declining…' : 'Not now'}
          </Button>
        </div>
      )}
    </div>
  )
}
