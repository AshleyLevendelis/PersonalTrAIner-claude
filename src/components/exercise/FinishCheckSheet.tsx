// ---------------------------------------------------------------------------
// "7 of 9 sets done — finish anyway?" — the question before Finish ends a
// session that still has planned sets in it (M12, 9 Oct 2026).
//
// One tap used to end the session at once: the tester's stopped at 9 of 24
// with nothing asked. LAYOUT-DESIGN.md §3.7 drew a pre-finish sheet whose
// partial variant "lists the unlogged remainder ... without judgment"; it was
// never built. This is that variant and only that: asked when planned sets
// remain, never when everything is done (TodayPanel decides which).
//
// Loaded on the tap, not with the Exercise tab — it is needed once a session
// at most.
// ---------------------------------------------------------------------------

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FINISH_CHECK } from '@/lib/coach-voice'

export function FinishCheckSheet({
  done,
  planned,
  left,
  onFinish,
  onKeepGoing,
}: {
  done: number
  planned: number
  /** What is still to do, in the session's own order. */
  left: { name: string; sets: number }[]
  onFinish: () => void
  onKeepGoing: () => void
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onKeepGoing() }}>
      <DialogContent className="max-w-sm" data-testid="finish-check">
        <DialogHeader>
          <DialogTitle>{FINISH_CHECK.title(done, planned)}</DialogTitle>
          <DialogDescription>What you&apos;ve logged is saved either way.</DialogDescription>
        </DialogHeader>
        {left.length > 0 && (
          <div className="space-y-1" data-testid="finish-check-left">
            <p className="ds-label-compact">Still to do</p>
            {left.map(l => (
              <p key={l.name} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{l.name}</span>
                <span className="shrink-0 tabular-mono text-muted-foreground">{l.sets} set{l.sets === 1 ? '' : 's'}</span>
              </p>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button className="h-11 flex-1" onClick={onKeepGoing} data-testid="finish-keep-going">{FINISH_CHECK.keepGoing}</Button>
          <Button className="h-11 flex-1" variant="outline" onClick={onFinish} data-testid="finish-anyway">{FINISH_CHECK.finish}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
