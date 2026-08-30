import { useEffect, useState } from 'react'
import { AlertTriangle, RotateCw, X } from 'lucide-react'
import {
  getPendingCardioFailures,
  retryFailedCardioLog,
  discardFailedCardioLog,
  subscribeCardioLogStore,
  type CardioLogView,
} from '@/lib/cardio-log-store'

// ---------------------------------------------------------------------------
// A cardio log that failed to save, and what to do about it.
//
// WHY THIS EXISTS. The store already did all of this: a log that exhausts its
// retries is marked 'failed' and kept in local storage, and there were three
// exported functions to list, retry and discard those rows — plus a fourth to
// merge them into a day's view. The 30 Aug 2026 audit found that NONE of the
// four had a single caller. So a cardio session that failed to sync was
// recorded, kept, and completely invisible: the user could not see it, retry
// it, or throw it away, and the work simply never appeared in their history.
//
// Nothing here is new logic. It is the missing surface for logic that was
// already written and already correct — the same shape as the two orphaned
// fact compilers the same audit turned up.
// ---------------------------------------------------------------------------

export function FailedCardioNotice() {
  const [failures, setFailures] = useState<CardioLogView[]>([])

  useEffect(() => {
    const read = () => setFailures(getPendingCardioFailures())
    read()
    return subscribeCardioLogStore(read)
  }, [])

  if (failures.length === 0) return null

  return (
    <div className="rounded-xl border border-[color:var(--role-warn-border,rgba(255,180,0,0.35))] bg-[color:var(--role-warn-bg,rgba(255,180,0,0.08))] p-3 mb-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[color:var(--role-warn-text)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[color:var(--role-warn-text)]">
            {failures.length === 1 ? "One session didn't save" : `${failures.length} sessions didn't save`}
          </p>
          {/* Says what is true: it is still here, and it is not counted yet. */}
          <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
            Still saved on this device, but not in your history yet.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {failures.map(f => (
              <li key={f.clientId ?? f.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[0.6875rem]">
                  {f.activity_name} · {f.duration_minutes} min · {f.date}
                </span>
                <button
                  type="button"
                  onClick={() => retryFailedCardioLog(f.clientId!)}
                  className="hit-slop-44 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.6875rem]"
                  aria-label={`Try saving ${f.activity_name} again`}
                >
                  <RotateCw className="size-2.5" aria-hidden /> Try again
                </button>
                <button
                  type="button"
                  onClick={() => discardFailedCardioLog(f.clientId!)}
                  className="hit-slop-44 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.6875rem] text-muted-foreground"
                  aria-label={`Discard ${f.activity_name}`}
                >
                  <X className="size-2.5" aria-hidden /> Discard
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
