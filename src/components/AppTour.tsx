import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { useAppRoute, tabHash, type Tab } from '@/lib/app-route'
import { TOUR_STEPS, SET_STEP_KEY } from '@/lib/app-tour-steps'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
import { useBottomDockHeight } from '@/hooks/useBottomDockHeight'
import { useViewportInset } from '@/hooks/useViewportInset'

// ---------------------------------------------------------------------------
// The post-onboarding app tour ("tap-to-learn").
//
// Ten stops in the coach's voice, starting the moment a plan is built. The
// user taps the real thing — the actual tab-bar button, the actual set-log ✓
// — and a short brief follows. It ends in Chat, where buildFirstRunIntro
// (first-run-intro.ts) already renders; the last line is written to hand off
// to it, so the two are read as one continuous introduction.
//
// WHY IT NEVER RENDERS ANOTHER TAB'S COMPONENT. A tour that draws its own
// mock of each screen goes stale the moment a screen changes, and teaches a
// layout the user will not find. This one is an overlay: it measures a real
// element by `data-tour` attribute, cuts a hole over it, and lets the real
// app receive the tap. Every stop therefore shows the current app by
// construction — including the plan the user just built, with their own
// exercises and their own numbers in it.
//
// THE TAPS ARE REAL, which is the other half of the same decision. A nav stop
// advances because the hash actually changed; the set stop advances because
// the row actually saved. Nothing is simulated, so nothing can claim
// something happened that did not — and the set logged at stop 7 is a genuine
// week-1 calibration set, which is the point rather than a side effect.
// ---------------------------------------------------------------------------

const STEPS = TOUR_STEPS
const SET_STEP_INDEX = STEPS.findIndex(s => s.key === SET_STEP_KEY)

/** Spotlight padding around the measured rect, and its corner radius. */
const SPOT_PAD = 6
const SPOT_RADIUS = 14
/** The scrim is deliberately NOT themed — it is the absence of UI, not a surface. */
const SCRIM = 'rgba(10, 7, 26, .62)'
/** Room the callout needs below a target before it flips above it. */
const CALLOUT_ESTIMATED_HEIGHT = 200
/** Where a scrolled-to target should sit from the top of the viewport. */
const SCROLL_MARGIN_TOP = 130

type Phase = 'tap' | 'info'

export type TourStatus =
  | { status: 'idle' }
  | { status: 'active'; step: number; phase: Phase }
  | { status: 'skipped'; step: number }

interface Rect { top: number; left: number; width: number; height: number }

/**
 * Ask the running AppTour to start again from the beginning.
 *
 * Exported for the "Replay the tour" row in the settings menu, which is what
 * makes Skip safe to be permanent: before this existed, nothing anywhere in
 * the app could restart a tour once it was over, so "gone for good" would
 * have meant one mistaken tap lost it forever.
 */
export function replayAppTour(): void {
  window.dispatchEvent(new CustomEvent(TOUR_REPLAY_EVENT))
}

const TOUR_REPLAY_EVENT = 'fitplan:replay-tour'

function storageKey(profileId: string): string {
  return `fitplan_tour_v1:${profileId}`
}

function readStored(profileId: string): 'done' | number | null {
  try {
    const raw = localStorage.getItem(storageKey(profileId))
    if (raw === 'done') return 'done'
    if (raw == null || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(Math.max(0, Math.trunc(n)), STEPS.length - 1) : null
  } catch {
    return null
  }
}

function writeStored(profileId: string, value: string): void {
  try {
    localStorage.setItem(storageKey(profileId), value)
  } catch {
    // Private mode / quota. The tour still runs for this session; it just
    // cannot remember, which is the mild failure of the two available.
  }
}

function findTarget(key: string | null | undefined): HTMLElement | null {
  if (!key) return null
  return document.querySelector<HTMLElement>(`[data-tour="${key}"]`)
}

/**
 * The nearest ancestor that actually scrolls, or null for the document.
 *
 * `scrollIntoView` is deliberately not used: the app's chrome is fixed (tab
 * bar, dock, the floating gear), so the browser's own idea of "in view"
 * regularly parks a target underneath one of them. Scrolling the right
 * container by hand and leaving SCROLL_MARGIN_TOP above it is the only way
 * to know the spotlight lands somewhere visible.
 */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    const scrolls = /(auto|scroll|overlay)/.test(style.overflowY)
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node
    node = node.parentElement
  }
  return null
}

/** True when the element, or anything it sits inside, is taken out of flow. */
function isFixed(el: HTMLElement): boolean {
  let node: HTMLElement | null = el
  while (node) {
    if (getComputedStyle(node).position === 'fixed') return true
    node = node.parentElement
  }
  return false
}

function bringIntoView(el: HTMLElement): void {
  // A fixed target is already where it is going to be — the tab bar, the
  // floating gear. Scrolling "to" it moves the page underneath instead and
  // leaves the target exactly where it was, which in the harness threw the
  // whole dashboard 650px up the screen behind the tab-bar spotlight.
  if (isFixed(el)) return
  const rect = el.getBoundingClientRect()
  const parent = scrollParentOf(el)
  if (parent) {
    const parentRect = parent.getBoundingClientRect()
    const delta = rect.top - parentRect.top - SCROLL_MARGIN_TOP
    if (Math.abs(delta) > 4) parent.scrollTop += delta
    return
  }
  const delta = rect.top - SCROLL_MARGIN_TOP
  if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: 'auto' })
}

export function AppTour({ profileId, armed }: { profileId?: string; armed: boolean }) {
  const { route } = useAppRoute()
  const activeTab: Tab = route.kind === 'tab' ? route.tab : 'dashboard'
  const { dockHeightPx } = useBottomDockHeight()
  const { isKeyboardOpen } = useViewportInset()

  const [state, setState] = useState<TourStatus>({ status: 'idle' })
  const [rect, setRect] = useState<Rect | null>(null)
  /**
   * Set once we reach the set stop and find no open row — i.e. a rest day, or
   * a session already fully logged. The stop is then dropped and the counter
   * reads "N of 9". Resolved here rather than up front because whether an
   * open set row exists is the Exercise tab's own derivation (TodayPanel's
   * `isRestDay`), and re-deriving it in App.tsx would be a second copy of that
   * logic free to drift from the first.
   */
  const [setStepSkipped, setSetStepSkipped] = useState(false)
  /**
   * The EXACT node the gated stop is pointing at, not just "some element with
   * this key".
   *
   * A session has several open sets, so several ✓ buttons carry data-tour at
   * once. Re-querying the selector after the user logs set 1 would happily
   * find set 2's button and the tour would sit there forever, spotlight
   * hopping down a row, waiting for something that already happened. Holding
   * the node means the tour watches the button the user was actually asked to
   * press, and notices when React clears its attribute on save.
   *
   * Doubles as the "has it ever been on screen" guard: null means the first
   * measure has not found it yet, which is not the same as it having gone.
   */
  const gateNode = useRef<HTMLElement | null>(null)

  const stepIndex = state.status === 'active' ? state.step : state.status === 'skipped' ? state.step : 0
  const step = STEPS[stepIndex]
  const phase: Phase = state.status === 'active' ? state.phase : 'info'
  const running = state.status === 'active'

  // The visible numbering skips the set stop when it does not apply.
  const totalSteps = STEPS.length - (setStepSkipped ? 1 : 0)
  const displayIndex = useMemo(() => {
    let n = 0
    for (let i = 0; i <= stepIndex && i < STEPS.length; i++) {
      if (setStepSkipped && i === SET_STEP_INDEX) continue
      n++
    }
    return n
  }, [stepIndex, setStepSkipped])

  // -- start / restore ------------------------------------------------------

  useEffect(() => {
    if (!profileId) return
    setState(prev => {
      if (prev.status !== 'idle') return prev
      const stored = readStored(profileId)
      if (stored === 'done') return prev
      if (typeof stored === 'number') return { status: 'skipped', step: stored }
      // No stored state at all. Only a profile whose onboarding completed in
      // THIS session is eligible — an existing user opening the app has no
      // stored state either, and must not be handed a tour they never asked
      // for on a plan they have been using for weeks.
      return armed ? { status: 'active', step: 0, phase: 'info' } : prev
    })
  }, [profileId, armed])

  // -- entering a step ------------------------------------------------------

  const enterStep = useCallback((index: number) => {
    const next = STEPS[index]
    if (!next) return
    gateNode.current = null
    // A stop is gated only when the user has not already satisfied it. Coming
    // back to Nutrition when you are already on Nutrition should not ask you
    // to tap Nutrition.
    const alreadyThere = !!next.nav && !next.gate && activeTab === next.tab
    const gated = (!!next.nav || !!next.gate) && !alreadyThere
    if (!gated && activeTab !== next.tab) window.location.hash = tabHash(next.tab)
    setState({ status: 'active', step: index, phase: gated ? 'tap' : 'info' })
    if (profileId) writeStored(profileId, String(index))
  }, [activeTab, profileId])

  const advance = useCallback(() => {
    if (state.status !== 'active') return
    let next = state.step + 1
    if (setStepSkipped && next === SET_STEP_INDEX) next++
    if (next >= STEPS.length) return
    enterStep(next)
  }, [state, setStepSkipped, enterStep])

  const finish = useCallback(() => {
    if (profileId) writeStored(profileId, 'done')
    setState({ status: 'idle' })
  }, [profileId])

  // SKIP MEANS SKIP. It used to write the current step and drop to 'skipped',
  // which renders the "Resume the tour" pill — and since the ONLY route to
  // 'done' was finishing all ten stops, the pill could not be dismissed at
  // all. Ashley: "the skip tour doesn't actually skip it. the tour is still
  // at the bottom of the app and won't go away until you fully complete it."
  // It also sat over the weigh-in row, hiding the number.
  //
  // So Skip now does exactly what finishing does. Her ruling was Skip-means-
  // gone WITH a way back, so this is paired with the Replay row in the
  // settings menu (replayAppTour below) — without that, an accidental tap
  // would have destroyed the tour permanently, since nothing in the app
  // could restart it.
  const skip = useCallback(() => {
    if (state.status !== 'active') return
    finish()
  }, [state, finish])

  // The way back, for someone who skipped and changed their mind. A window
  // event rather than props threaded down from App.tsx: the trigger is a row
  // in the settings dropdown, three components away, and the tour already
  // owns all of its own state. Deliberately re-arms from step 0 and clears
  // the set-stop exemption, so a replay is the tour as first shown.
  useEffect(() => {
    const onReplay = () => {
      if (!profileId) return
      setSetStepSkipped(false)
      enterStep(0)
    }
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay)
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay)
  }, [profileId, enterStep])

  const back = useCallback(() => {
    if (state.status !== 'active' || state.step === 0) return
    let prev = state.step - 1
    if (setStepSkipped && prev === SET_STEP_INDEX) prev--
    if (prev < 0) return
    const target = STEPS[prev]
    gateNode.current = null
    if (activeTab !== target.tab) window.location.hash = tabHash(target.tab)
    setState({ status: 'active', step: prev, phase: 'info' })
    if (profileId) writeStored(profileId, String(prev))
  }, [state, setStepSkipped, activeTab, profileId])

  // -- a nav stop is satisfied by the route actually changing ---------------

  useEffect(() => {
    if (!running || phase !== 'tap' || !step.nav || step.gate) return
    if (activeTab === step.tab) setState({ status: 'active', step: stepIndex, phase: 'info' })
  }, [running, phase, step, activeTab, stepIndex])

  // -- measure ---------------------------------------------------------------

  /**
   * A rAF loop rather than a listener set, and deliberately so. The rect can
   * move for reasons no single listener covers: the tab's own scroll, the
   * document's, a dock row appearing, an image settling, the keyboard, a
   * rotation, a React re-render. A frame loop is correct for all of them at
   * once, costs nothing measurable, and only runs while the tour is on screen
   * — a minute, once, in the app's lifetime.
   */
  useEffect(() => {
    if (!running) { setRect(null); return }
    let raf = 0
    let scrolledFor = ''
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const key = phase === 'tap' ? (step.nav ?? step.target) : step.target
      if (!key) { setRect(prev => (prev === null ? prev : null)); return }

      const gating = phase === 'tap' && step.gate === true
      let el: HTMLElement | null
      if (gating) {
        const held = gateNode.current
        if (held) {
          // The set stop's target stops being a target exactly when the row
          // saves: SetGrid drops the attribute as isSaved flips, and React
          // usually reuses the node rather than replacing it. So "still
          // connected AND still carrying the key" is the live check, and its
          // absence IS the store's synchronous confirmation. A save that
          // fails validation leaves both true and the tour waiting, which is
          // the correct outcome rather than a missed one.
          if (!held.isConnected || held.getAttribute('data-tour') !== key) {
            gateNode.current = null
            setState({ status: 'active', step: stepIndex, phase: 'info' })
            return
          }
          el = held
        } else {
          el = findTarget(key)
          if (el) gateNode.current = el
        }
      } else {
        el = findTarget(key)
      }

      if (!el) { setRect(prev => (prev === null ? prev : null)); return }

      const scrollKey = `${stepIndex}:${phase}`
      if (scrolledFor !== scrollKey) { scrolledFor = scrollKey; bringIntoView(el) }

      const r = el.getBoundingClientRect()
      const next: Rect = {
        top: Math.round(r.top) - SPOT_PAD,
        left: Math.round(r.left) - SPOT_PAD,
        width: Math.round(r.width) + SPOT_PAD * 2,
        height: Math.round(r.height) + SPOT_PAD * 2,
      }
      setRect(prev =>
        prev && prev.top === next.top && prev.left === next.left
          && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      )
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, phase, step, stepIndex])

  // -- the rest-day variant --------------------------------------------------

  useEffect(() => {
    if (!running || stepIndex !== SET_STEP_INDEX || setStepSkipped) return
    if (activeTab !== 'exercise') return
    // ONLY while still waiting for the tap, and only if the row has never been
    // seen. "No setrow in the DOM" is the same signal the gate uses to detect
    // a SAVED set, so without both guards a user who logged the set was told
    // it was a rest day and had the stop skipped out from under them — the
    // one stop they had just completed. Caught in the browser harness.
    if (phase !== 'tap' || gateNode.current) return
    // Give the tab a moment to paint before concluding there is no open row.
    const timer = window.setTimeout(() => {
      if (findTarget('setrow')) return
      setSetStepSkipped(true)
      setState(prev => (prev.status === 'active' && prev.step === SET_STEP_INDEX
        ? { status: 'active', step: SET_STEP_INDEX + 1, phase: 'info' }
        : prev))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [running, stepIndex, setStepSkipped, activeTab, phase])

  // -------------------------------------------------------------------------

  if (!profileId) return null

  if (state.status === 'skipped') {
    return (
      <ResumePill
        label={`Resume the tour · ${displayIndex} of ${totalSteps}`}
        dockHeightPx={dockHeightPx}
        hidden={isKeyboardOpen}
        onResume={() => enterStep(state.step)}
      />
    )
  }

  if (!running) return null

  const tapPhase = phase === 'tap'
  const body = tapPhase ? (step.teaser ?? '') : step.copy
  const calloutTop = calloutPosition(rect, step.last === true)

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: 'none' }} role="dialog" aria-modal="true" aria-label="App tour">
      {/*
        BLOCKING IS SPLIT FROM DIMMING, which is what lets the real element
        receive the real tap. The dim is one non-interactive div whose huge
        box-shadow paints everything outside the hole. The blocking is four
        rects fenced AROUND the hole during a tap step, so the hole is
        genuinely empty and the tap reaches the app underneath — and one
        full-screen rect during an info step, when nothing should be reachable.
      */}
      {rect && tapPhase ? (
        <>
          <Blocker style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
          <Blocker style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
          <Blocker style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
          <Blocker style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
        </>
      ) : (
        <Blocker style={{ inset: 0 }} />
      )}

      {rect ? (
        <div
          className="absolute"
          style={{
            top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            borderRadius: SPOT_RADIUS,
            boxShadow: `0 0 0 2000px ${SCRIM}`,
            pointerEvents: 'none',
          }}
        >
          {tapPhase && (
            <>
              <div
                className="tour-breathe absolute"
                style={{
                  inset: -1,
                  border: '1.5px solid rgba(var(--glow-rgb), .95)',
                  borderRadius: SPOT_RADIUS,
                  background: 'rgba(var(--glow-rgb), .07)',
                }}
              />
              <div
                className="tour-echo absolute"
                style={{
                  inset: -7,
                  border: '1.5px solid rgba(var(--glow-rgb), .6)',
                  borderRadius: SPOT_RADIUS + 4,
                }}
              />
            </>
          )}
        </div>
      ) : (
        // No target — the welcome card and the final Chat card. Chat gets NO
        // dim at all: it is a handover, not a highlight, and the user should
        // already be reading the chat behind it.
        <div className="absolute inset-0" style={{ background: step.last ? 'transparent' : SCRIM, pointerEvents: 'none' }} />
      )}

      <div
        className="tour-fade absolute rounded-2xl border border-[color:var(--hairline)] bg-card px-4 pb-3 pt-3.5"
        style={{ left: 14, right: 14, top: calloutTop, boxShadow: '0 16px 40px rgba(0,0,0,.55)', pointerEvents: 'auto' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-primary-foreground glow-mint-box"
            style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))' }}
          >
            <MessageCircle className="size-3" />
          </span>
          <span className="flex-1 text-[10px] uppercase tracking-[.16em] text-muted-foreground">
            Coach · {displayIndex} of {totalSteps}
          </span>
          {!step.last && (
            <button type="button" onClick={skip} className="p-1 text-[11px] text-muted-foreground underline">
              Skip
            </button>
          )}
        </div>

        {step.title && stepIndex === 0 && (
          <p className="mt-2.5 text-[17px] font-semibold tracking-[-.01em] text-foreground">{step.title}</p>
        )}
        <p className="mt-2 text-[13.5px] leading-[1.55] text-foreground">{body}</p>

        {tapPhase ? (
          <p className="mb-1 mt-2.5 text-[12.5px] font-semibold text-primary glow-mint">→ {step.tapHint}</p>
        ) : (
          <div className="mt-3 flex items-center gap-2.5">
            {stepIndex > 0 && (
              <button type="button" onClick={back} className="px-1 py-1.5 text-[12.5px] text-muted-foreground">
                Back
              </button>
            )}
            <div className="flex flex-1 items-center gap-1">
              {STEPS.map((s, i) =>
                setStepSkipped && i === SET_STEP_INDEX ? null : (
                  <span
                    key={s.key}
                    className="size-[5px] rounded-full"
                    // Inactive dots are neutral, not accent-tinted: the spec's
                    // literal is the foreground white at .22, and tinting them
                    // mint makes eight of ten read as half-active.
                    style={{ background: i === stepIndex ? 'var(--primary)' : 'color-mix(in oklab, var(--foreground) 22%, transparent)' }}
                  />
                ),
              )}
            </div>
            <button
              type="button"
              onClick={step.last ? finish : advance}
              className="h-[34px] rounded-[10px] px-4 text-[12.5px] font-semibold text-primary-foreground glow-mint-box"
              style={{ background: 'var(--primary)' }}
            >
              {stepIndex === 0 ? 'Show me around' : step.last ? 'Finish' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Blocker({ style }: { style: React.CSSProperties }) {
  return <div className="absolute" style={{ ...style, pointerEvents: 'auto' }} />
}

/**
 * Below the spotlight when there is room, above it when there is not — a
 * callout that covers the thing it is describing is worse than useless. Tab-bar
 * targets always land in the bottom band, so they always flip above.
 */
function calloutPosition(rect: Rect | null, isLast: boolean): number {
  if (!rect) return isLast ? Math.max(120, window.innerHeight - 340) : Math.max(120, window.innerHeight * 0.3)
  const below = rect.top + rect.height + 12
  if (below + CALLOUT_ESTIMATED_HEIGHT <= window.innerHeight - 24) return below
  return Math.max(60, rect.top - CALLOUT_ESTIMATED_HEIGHT)
}

function ResumePill({
  label, dockHeightPx, hidden, onResume,
}: {
  label: string
  dockHeightPx: number
  hidden: boolean
  onResume: () => void
}) {
  // Offset by the dock's own measured height for the same reason the chat
  // composer is: the dock grows a row when a rest timer is running, and a pill
  // pinned to the tab bar alone would end up underneath it.
  if (hidden) return null
  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center"
      style={{ bottom: `calc(${TAB_BAR_HEIGHT_PX + 28 + dockHeightPx}px + env(safe-area-inset-bottom))` }}
    >
      <button
        type="button"
        onClick={onResume}
        className="inline-flex h-[38px] items-center gap-2 rounded-full bg-card px-4 text-[12.5px] font-medium text-foreground"
        style={{ border: '1px solid rgba(var(--glow-rgb), .4)', boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}
      >
        <span className="glow-dot size-1.5 rounded-full bg-primary glow-mint-box" />
        {label}
      </button>
    </div>
  )
}
