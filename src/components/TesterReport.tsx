import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { currentTesterScreen, recentTesterEvents, recordTesterEvent, useTesterOn } from '@/lib/tester-log'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// REPORTING A PROBLEM, FOR TESTERS (his rulings 25 Nov 2026: "Both", from three options, over one button everywhere
// and over flags on each item only; and screenshots "Yes, they can untick"). Two ways in, one sheet:
//   - the bug beside the gear, on every screen (TesterButtons.tsx, inside ProfileMenu so it goes wherever the gear goes);
//   - "Report a problem" on each exercise's ⋮ and a flag on each meal's sheet, which say WHICH exercise or meal.
//     (A coach reply already has its own flag, ReportReplyButton, since 20 Nov.)
// Shown only to somebody who agreed to test. THIS FILE IS LOADED ONLY FOR A TESTER (the buttons import it on the tap,
// App mounts the sheet only while recording), so nobody else downloads it. The picture is taken BEFORE the sheet opens, so it shows what they were
// looking at; a tick under it leaves it out. The last things they did go with it (tester-log.ts). A report that did
// not save says so and keeps the sheet open, the coach-reply report's rule: a report they think went and did not is
// the worse failure.
// ---------------------------------------------------------------------------

export type ReportArea = 'chat' | 'meals' | 'exercise' | 'tools' | 'home' | 'setup' | 'other'

/** The areas, in the order the sheet shows them (the email's AREA_WORDS say the same words). */
export const REPORT_AREAS: { key: ReportArea; label: string }[] = [
  { key: 'chat', label: 'Coach chat' },
  { key: 'meals', label: 'Meals' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'tools', label: 'Timers & tools' },
  { key: 'home', label: 'Home & progress' },
  { key: 'setup', label: 'Setup & profile' },
  { key: 'other', label: 'Something else' },
]

/** The area the tester is most likely reporting, from where they are. */
export function areaForScreen(screen: string): ReportArea {
  if (/Profile|setup/i.test(screen)) return 'setup'
  const tab = screen.split(' ')[0]
  if (/^chat/.test(tab)) return 'chat'
  if (/^(nutrition|grocery|shopping)/.test(tab)) return 'meals'
  if (/^exercise/.test(tab)) return 'exercise'
  if (/^tools/.test(tab)) return 'tools'
  if (/^home/.test(tab)) return 'home'
  return 'other'
}

const SHOT_MAX = 900_000

/** A JPEG of what is on screen now, or null. Never throws, never takes more than six seconds. */
export async function captureScreen(): Promise<string | null> {
  const test = (globalThis as { __testerScreenshotForTest?: () => Promise<string | null> }).__testerScreenshotForTest
  if (test) return test()
  try {
    const { toJpeg } = await import('html-to-image')
    const shoot = (quality: number, pixelRatio: number) => toJpeg(document.body, {
      quality, pixelRatio, skipFonts: true, cacheBust: false,
      width: window.innerWidth, height: window.innerHeight,
      canvasWidth: window.innerWidth, canvasHeight: window.innerHeight,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#111',
      filter: n => !(n instanceof Element && n.hasAttribute('data-tester-no-shot')),
    })
    const timeout = new Promise<null>(r => setTimeout(() => r(null), 6000))
    let shot = await Promise.race([shoot(0.6, 1), timeout])
    if (shot && shot.length > SHOT_MAX) shot = await Promise.race([shoot(0.4, 0.75), timeout])
    return shot && shot.length <= SHOT_MAX ? shot : null
  } catch {
    return null
  }
}

// One sheet for the whole app, opened from anywhere.
type OpenRequest = { area?: ReportArea; itemLabel?: string; screen: string; shot: Promise<string | null> }
let request: OpenRequest | null = null
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Opens the report sheet, taking the picture first. */
export function openTesterReport(opts: { area?: ReportArea; itemLabel?: string } = {}): void {
  request = { ...opts, screen: currentTesterScreen(), shot: captureScreen() }
  for (const l of listeners) l()
}

export default function TesterReportHost({ profileId }: { profileId: string | null | undefined }) {
  const req = useSyncExternalStore(subscribe, () => request, () => null)
  const on = useTesterOn()
  const [area, setArea] = useState<ReportArea>('other')
  const [note, setNote] = useState('')
  const [shot, setShot] = useState<string | null | 'taking'>('taking')
  const [includeShot, setIncludeShot] = useState(true)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [events, setEvents] = useState<ReturnType<typeof recentTesterEvents>>([])

  useEffect(() => {
    if (!req) return
    setArea(req.area ?? areaForScreen(req.screen))
    setNote(''); setIncludeShot(true); setState('idle'); setShot('taking')
    setEvents(recentTesterEvents().slice(-30))
    let live = true
    void req.shot.then(s => { if (live) setShot(s) })
    return () => { live = false }
  }, [req])

  if (!profileId || !on) return null
  const close = () => { request = null; for (const l of listeners) l() }

  const send = async () => {
    if (!req || note.trim().length < 3) return
    setState('sending')
    const picture = includeShot && shot && shot !== 'taking' ? shot : null
    try {
      const { error } = await supabase.from('tester_reports').insert({
        profile_id: profileId,
        area,
        item_label: req.itemLabel ?? null,
        note: note.trim().slice(0, 4000),
        screen: req.screen || null,
        screenshot: picture,
        recent_events: events,
        device: `${navigator.userAgent.slice(0, 200)} · ${window.innerWidth}x${window.innerHeight}`,
        app_version: events.find(e => e.kind === 'start')?.detail?.version as string | undefined ?? null,
      })
      if (error) { setState('failed'); return }
      recordTesterEvent('report', { area, item: req.itemLabel })
      setState('sent')
    } catch {
      setState('failed')
    }
  }

  return (
    <Dialog open={!!req} onOpenChange={o => { if (!o) close() }}>
      <DialogContent data-tester-report data-tester-no-shot data-no-log>
        <DialogHeader>
          <DialogTitle>{state === 'sent' ? 'Thanks, sent' : 'Report a problem'}</DialogTitle>
          <DialogDescription>
            {state === 'sent'
              ? 'Your report, the screen and what you did just before have been sent, so it can be found and put right.'
              : `What went wrong, or what felt off?${req?.itemLabel ? ` This is about ${req.itemLabel}.` : ''} What you did just before is sent with it.`}
          </DialogDescription>
        </DialogHeader>
        {state === 'sent' ? (
          <Button className="min-h-[44px]" onClick={close} data-tester-report-done>Done</Button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What it's about">
              {REPORT_AREAS.map(a => (
                <button
                  key={a.key}
                  type="button"
                  role="radio"
                  aria-checked={area === a.key}
                  data-tester-area={a.key}
                  onClick={() => setArea(a.key)}
                  className="min-h-[44px] rounded-full border px-3 text-sm"
                  style={area === a.key
                    ? { borderColor: 'var(--primary)', background: 'color-mix(in oklab, var(--primary) 14%, transparent)' }
                    : { borderColor: 'var(--hairline)' }}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[0.75rem] text-muted-foreground">
              What happened?
              <textarea
                id="tester-report-note"
                data-tester-note
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="e.g. I tapped Save on my set and nothing happened"
                className="w-full min-w-0 rounded-md border bg-background px-3 py-2 text-base text-foreground"
              />
            </label>
            <div className="flex items-start gap-3" data-tester-shot={shot === 'taking' ? 'taking' : shot ? 'yes' : 'none'}>
              {shot && shot !== 'taking' && (
                <img src={shot} alt="The screen you were on" className="h-28 w-auto rounded-md border" style={{ borderColor: 'var(--hairline)', opacity: includeShot ? 1 : 0.35 }} />
              )}
              <label className="flex min-h-[44px] flex-1 items-center gap-2 text-sm">
                <input
                  id="tester-report-shot"
                  type="checkbox"
                  checked={includeShot && !!shot && shot !== 'taking'}
                  disabled={!shot || shot === 'taking'}
                  onChange={e => setIncludeShot(e.target.checked)}
                  className="size-5"
                  data-tester-shot-tick
                />
                {shot === 'taking' ? 'Taking a picture of the screen…'
                  : shot ? 'Include this picture of the screen'
                    : "Couldn't take a picture of the screen. Your report still sends."}
              </label>
            </div>
            {state === 'failed' && (
              <p role="alert" data-tester-report-failed className="m-0 text-[0.8125rem] text-[color:var(--role-warn-text)]">
                Couldn't send the report. Check your connection and try again.
              </p>
            )}
            <div className="flex gap-2">
              <Button className="min-h-[44px] flex-1" disabled={note.trim().length < 3 || state === 'sending'} onClick={() => void send()} data-tester-report-send>
                {state === 'sending' ? 'Sending…' : 'Send report'}
              </Button>
              <Button variant="outline" className="min-h-[44px]" onClick={close}>Cancel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
