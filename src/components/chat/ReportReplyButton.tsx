import { useState, type MouseEvent } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { REPORT_REASONS, reportCoachReply, type ReportReason } from '@/lib/reply-reports'

// ---------------------------------------------------------------------------
// "Report this reply" on every coach bubble (20 Nov 2026, his choice "1, build it", for Google Play's rule on
// AI-generated content). A small flag above the Listen button opens a sheet: a reason (one tap), an optional note,
// Send. The reply's own words go with it. A report that did not save says so and keeps the sheet open.
// ---------------------------------------------------------------------------

export function ReportReplyButton({ profileId, messageId, replyText }: { profileId: string | null | undefined; messageId: string | null; replyText: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  if (!profileId || !replyText.trim()) return null

  const openSheet = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (state !== 'sent') { setReason(null); setNote(''); setState('idle') }
    setOpen(true)
  }
  const send = async () => {
    if (!reason) return
    setState('sending')
    const r = await reportCoachReply({ profileId, messageId, replyText, reason, note })
    setState(r.ok ? 'sent' : 'failed')
  }

  return (
    <>
      <button
        type="button"
        data-report-reply={state === 'sent' ? 'sent' : 'open'}
        onClick={openSheet}
        aria-label={state === 'sent' ? 'Reply reported' : 'Report this reply'}
        title={state === 'sent' ? 'Reported' : 'Report'}
        className="hit-slop-44 absolute top-0 -right-9 flex size-7 items-center justify-center rounded-full"
        style={{ color: state === 'sent' ? 'var(--primary-text)' : 'var(--muted-foreground)' }}
      >
        <Flag aria-hidden className="size-3.5" fill={state === 'sent' ? 'currentColor' : 'none'} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-report-sheet>
          <DialogHeader>
            <DialogTitle>{state === 'sent' ? 'Thanks, reported' : 'Report this reply'}</DialogTitle>
            <DialogDescription>
              {state === 'sent'
                ? 'The reply and what you said are kept so it can be checked and put right.'
                : 'What was wrong with it? The reply is kept with your report so it can be checked and put right.'}
            </DialogDescription>
          </DialogHeader>
          {state === 'sent' ? (
            <Button className="min-h-[44px]" onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Reason">
                {REPORT_REASONS.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={reason === r.key}
                    data-report-reason={r.key}
                    onClick={() => setReason(r.key)}
                    className="min-h-[44px] rounded-xl border px-3 text-left text-sm"
                    style={reason === r.key
                      ? { borderColor: 'var(--primary)', background: 'color-mix(in oklab, var(--primary) 14%, transparent)' }
                      : { borderColor: 'var(--hairline)' }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-[0.75rem] text-muted-foreground">
                Anything to add? (optional)
                <textarea
                  id="report-note"
                  data-report-note
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="w-full min-w-0 rounded-md border bg-background px-3 py-2 text-base text-foreground"
                />
              </label>
              {state === 'failed' && (
                <p role="alert" data-report-failed className="m-0 text-[0.8125rem] text-[color:var(--role-warn-text)]">
                  Couldn't send the report. Check your connection and try again.
                </p>
              )}
              <div className="flex gap-2">
                <Button className="min-h-[44px] flex-1" disabled={!reason || state === 'sending'} onClick={() => void send()} data-report-send>
                  {state === 'sending' ? 'Sending…' : 'Send report'}
                </Button>
                <Button variant="outline" className="min-h-[44px]" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
