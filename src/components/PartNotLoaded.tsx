import { useCallback, useEffect, useState, type ComponentType } from 'react'

// ---------------------------------------------------------------------------
// A PART OF THE APP THAT IS NOT ON THE PHONE SAYS SO, IN PLACE, AND NEVER TAKES THE SCREEN.
//
// Ashley, 10 Nov 2026, from a gym with no signal: "Something went wrong on this screen", mid-workout. The app's
// screens are split into files that download the first time they are opened. With no signal that download fails;
// the old answer was to reload the page (right when a new version went live, wrong in a gym) and, on the second
// failure, the whole-app error screen.
//
// Now every part is fetched in the background while there is signal (public/sw.js, "warm-assets"), and a part that
// is still missing draws THIS instead: one plain sentence where the part would have been, logging untouched around
// it. It tries again by itself the moment the phone is back online, and on a tap.
//
// It is handed the part's own props, because it stands in for the part: a sheet's close callback is how its OK
// button tells the screen the sheet is shut.
// ---------------------------------------------------------------------------

type AnyProps = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stands in for any lazily loaded component
type Factory = () => Promise<{ default: ComponentType<any> }>

export const PART_NOT_LOADED_OFFLINE = 'This part of the app isn\'t saved on your phone yet, so it needs a connection. Everything you log is still being saved.'
export const PART_NOT_LOADED_ONLINE = 'This part of the app didn\'t load. Check your connection and try again.'

const CLOSERS = ['onOpenChange', 'onClose', 'onCancel', 'onDismiss', 'onDone'] as const

/** A sheet or dialog: something the screen opens over itself and expects to be told is shut. */
function isSheetLike(props: AnyProps): boolean {
  return 'open' in props || CLOSERS.some(k => typeof props[k] === 'function')
}

/**
 * `reload` is chunk-reload's guarded page reload. A browser that has failed to fetch a file once may refuse to ask for
 * it again for as long as the page lives (Chrome keeps the failure), so once the phone is online and a fresh try still
 * fails, loading the page again is the only thing that can fetch it. Only ever from the person's own tap.
 */
export function partNotLoaded(factory: Factory, reload: () => boolean = () => false): ComponentType<AnyProps> {
  return function PartNotLoaded(props: AnyProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the real part, once it arrives
    const [Real, setReal] = useState<ComponentType<any> | null>(null)
    const [trying, setTrying] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)

    const tryAgain = useCallback((byTap: boolean) => {
      setTrying(true)
      factory()
        .then(m => setReal(() => m.default))
        .catch(() => { if (byTap && navigator.onLine !== false) reload() })
        .finally(() => setTrying(false))
    }, [])

    useEffect(() => {
      // Quietly, when the signal returns: it works where the browser allows a second ask, and costs nothing where
      // it does not. The reload is left to the tap.
      const up = () => { setOnline(true); tryAgain(false) }
      const down = () => setOnline(false)
      window.addEventListener('online', up)
      window.addEventListener('offline', down)
      return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
    }, [tryAgain])

    // A sheet opened again after OK says so again.
    const open = props.open
    useEffect(() => { if (open) setDismissed(false) }, [open])

    if (Real) return <Real {...props} />

    const sheet = isSheetLike(props)
    if (sheet && (props.open === false || dismissed)) return null

    const close = () => {
      setDismissed(true)
      for (const k of CLOSERS) {
        const fn = props[k]
        if (typeof fn === 'function') { try { (fn as (v?: boolean) => void)(false) } catch { /* the notice is gone either way */ } break }
      }
    }

    const body = (
      <div
        role="status"
        data-testid="part-not-loaded"
        data-online={online ? 'true' : 'false'}
        className="rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-lg"
      >
        <p className="text-[0.875rem] leading-snug text-foreground">
          {online ? PART_NOT_LOADED_ONLINE : PART_NOT_LOADED_OFFLINE}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => tryAgain(true)}
            disabled={trying}
            className="min-h-[44px] rounded-full border border-border px-4 text-[0.8125rem] font-semibold text-foreground disabled:opacity-60"
          >
            {trying ? 'Trying…' : 'Try again'}
          </button>
          {sheet && (
            <button
              type="button"
              onClick={close}
              className="min-h-[44px] rounded-full px-4 text-[0.8125rem] font-semibold text-muted-foreground"
            >
              OK
            </button>
          )}
        </div>
      </div>
    )

    // A sheet has no place in the page's flow, so its notice floats above the tab bar; anything else is drawn
    // where the part would have been.
    if (sheet) {
      return (
        <div className="fixed inset-x-4 z-[70]" style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
          {body}
        </div>
      )
    }
    return <div className="my-3">{body}</div>
  }
}
