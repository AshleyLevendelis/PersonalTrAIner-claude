// ---------------------------------------------------------------------------
// THE TESTER LOG (his ruling 25 Nov 2026, "Everything", from three options: over errors only and over errors plus
// taps). While somebody has agreed to test (Profile, "Help test the app"; fitness_profiles.tester_since), the app keeps
// a record of what happened, so a problem can be found without them having to describe it:
//   - crashes and errors (the page's own, a promise nobody caught, anything written to console.error);
//   - a save that failed: a message on screen (an alert or a status line) saying something could not be saved or done;
//   - a request to the database or the coach that failed (the path and the status, never the body);
//   - each screen opened, each button tapped (its words), and what was typed (never a password, an email address, or
//     a box marked data-no-log), with the coach's messages kept as they already are, in the chat history.
// NOTHING IS RECORDED WITHOUT THE TICK. Off is the default; turning it off stops it at once and drops what was waiting
// to be sent. The rows live with the account (tester_events) and go when the account is deleted.
//
// Sent in batches, every 15 seconds, when the app goes to the back, or at 40 waiting. A batch that cannot be sent waits
// on the phone (the last 400), so a tester with no signal is still recorded. The recording itself can never break the
// app: every hook is wrapped, and a failed send of this table is never itself recorded (no loop).
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export type TesterEventKind = 'error' | 'console_error' | 'failed_save' | 'network_error' | 'screen' | 'tap' | 'typed' | 'report' | 'start'

export interface TesterEvent {
  at: string
  kind: TesterEventKind
  screen: string
  detail: Record<string, unknown>
}

const ON_KEY = 'fitplan_tester_on'
const QUEUE_KEY = 'fitplan_tester_queue'
const QUEUE_MAX = 400
const RING_MAX = 60
const BATCH_AT = 40
const FLUSH_MS = 15000
const TEXT_MAX = 200
const ERROR_MAX = 600

let profileId: string | null = null
let installed = false
let queue: TesterEvent[] = []
const ring: TesterEvent[] = []
const listeners = new Set<() => void>()
let flushing = false
let lastScreen = ''
const sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

function emit(): void { for (const l of listeners) l() }

function readOn(): string | null {
  try { return localStorage.getItem(ON_KEY) } catch { return null }
}

/** Which version of the app is running: the main script's own file name, which changes with every release. */
function appVersion(): string {
  try {
    const src = (document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null)?.src ?? ''
    return src.split('/').pop()?.replace(/\.js$/, '') ?? ''
  } catch { return '' }
}

/** Where the tester is: the tab from the address, and the sheet open over it, if one is. */
export function currentTesterScreen(): string {
  try {
    const hash = location.hash.replace(/^#\/?/, '').replace(/^tab\//, '') || 'home'
    const dialogs = [...document.querySelectorAll('[role="dialog"], [data-meal-sheet], [data-profile-sheet]')] as HTMLElement[]
    const top = dialogs[dialogs.length - 1]
    const sheet = top ? (top.getAttribute('aria-label') || top.querySelector('h2, h3')?.textContent || top.getAttribute('data-profile-sheet') || '').trim().slice(0, 60) : ''
    return sheet ? `${hash} › ${sheet}` : hash
  } catch { return '' }
}

function subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l) } }
export function useTesterOn(): boolean {
  return useSyncExternalStore(subscribe, () => !!profileId, () => false)
}

/**
 * Turns recording on for this profile (it agreed) or off (null). Called by App whenever the profile's tester_since is
 * known, and by the Profile switch. Off drops anything still waiting to be sent.
 */
export function setTester(id: string | null): void {
  const was = profileId
  profileId = id
  try { if (id) localStorage.setItem(ON_KEY, id); else { localStorage.removeItem(ON_KEY); localStorage.removeItem(QUEUE_KEY) } } catch { /* the next open asks the profile again */ }
  if (!id) { queue = []; ring.length = 0 }
  if (id && !was) { installTesterLog(); recordTesterEvent('start', { version: appVersion() }) }
  if (was !== id) emit()
}

/** The last things done, oldest first, for a report. */
export function recentTesterEvents(): TesterEvent[] { return ring.slice() }

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export function recordTesterEvent(kind: TesterEventKind, detail: Record<string, unknown> = {}): void {
  if (!profileId) return
  try {
    const ev: TesterEvent = { at: new Date().toISOString(), kind, screen: currentTesterScreen(), detail }
    ring.push(ev)
    if (ring.length > RING_MAX) ring.shift()
    queue.push(ev)
    if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX)
    saveQueue()
    if (queue.length >= BATCH_AT) void flushTesterEvents()
  } catch { /* recording never breaks the app */ }
}

function saveQueue(): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch { /* a full phone keeps the batch in memory */ }
}

/** Sends what is waiting. A batch that fails stays on the phone for the next try. */
async function flushTesterEvents(): Promise<void> {
  if (!profileId || flushing || queue.length === 0) return
  flushing = true
  const batch = queue.slice(0, 100)
  const version = appVersion()
  try {
    const { error } = await supabase.from('tester_events').insert(batch.map(e => ({
      profile_id: profileId, session_id: sessionId, at: e.at, kind: e.kind, screen: e.screen || null, detail: e.detail, app_version: version || null,
    })))
    if (!error) {
      queue = queue.slice(batch.length)
      saveQueue()
    }
  } catch { /* waits on the phone */ } finally {
    flushing = false
  }
}

// ---------------------------------------------------------------------------
// The hooks. Installed once, at start when this phone was already recording (so a crash while the app opens is kept),
// or the moment somebody agrees. Each one asks profileId first, so off means nothing is recorded.
// ---------------------------------------------------------------------------

/** A field never recorded: passwords, email addresses, and anything marked data-no-log. */
function isPrivateField(el: Element): boolean {
  const input = el as HTMLInputElement
  const type = (input.type || '').toLowerCase()
  const ac = (input.autocomplete || el.getAttribute('autocomplete') || '').toLowerCase()
  return type === 'password' || type === 'email' || /password|email|username|one-time-code|cc-/.test(ac) || !!el.closest('[data-no-log]')
}

function fieldName(el: Element): string {
  const id = el.getAttribute('id')
  const label = el.getAttribute('aria-label') || (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '') || el.closest('label')?.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || id || el.tagName.toLowerCase()
  return clip(label, 60)
}

/** What was typed, kept per box until it is recorded once (a tap, Enter, leaving the box), so a message sent and cleared is still kept. */
const typedPending = new Map<Element, string>()
function recordTyped(el: Element): void {
  const v = typedPending.get(el)
  if (v == null) return
  typedPending.delete(el)
  if (!v.trim()) return
  recordTesterEvent('typed', { field: fieldName(el), value: clip(v, TEXT_MAX) })
}
function recordAllTyped(): void { for (const el of [...typedPending.keys()]) recordTyped(el) }

function messageOf(x: unknown): string {
  if (x instanceof Error) return `${x.name}: ${x.message}${x.stack ? ` | ${x.stack.split('\n').slice(1, 4).join(' | ')}` : ''}`
  if (typeof x === 'string') return x
  try { return JSON.stringify(x) } catch { return String(x) }
}

const FAILED_WORDS = /\b(couldn'?t|could not|can'?t|cannot|didn'?t|did not|failed|wasn'?t saved|not saved|try again|went wrong)\b/i

function installTesterLog(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  try {
    // A queue left from the last time (no signal, or the app was closed before it sent).
    try { const raw = localStorage.getItem(QUEUE_KEY); if (raw) queue = (JSON.parse(raw) as TesterEvent[]).slice(-QUEUE_MAX) } catch { queue = [] }

    window.addEventListener('error', e => {
      recordTesterEvent('error', { message: clip(e.message || messageOf(e.error), ERROR_MAX), where: e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : undefined })
    })
    window.addEventListener('unhandledrejection', e => {
      recordTesterEvent('error', { message: clip(`Unhandled: ${messageOf(e.reason)}`, ERROR_MAX) })
    })
    const realError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      try { if (profileId) recordTesterEvent('console_error', { message: clip(args.map(messageOf).join(' '), ERROR_MAX) }) } catch { /* never in the way */ }
      realError(...args)
    }
    const realFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const watched = profileId && /\/(rest|functions)\/v1\//.test(url) && !/\/tester_events/.test(url)
      const path = watched ? (() => { try { return new URL(url, location.href).pathname } catch { return url.split('?')[0] } })() : ''
      try {
        const res = await realFetch(input, init)
        if (watched && !res.ok) recordTesterEvent('network_error', { path, method: init?.method ?? 'GET', status: res.status })
        return res
      } catch (err) {
        if (watched) recordTesterEvent('network_error', { path, method: init?.method ?? 'GET', status: 'no answer', message: clip(messageOf(err), 200) })
        throw err
      }
    }

    window.addEventListener('hashchange', () => {
      const s = currentTesterScreen()
      if (s !== lastScreen) { lastScreen = s; recordTesterEvent('screen') }
    })

    document.addEventListener('click', e => {
      if (!profileId) return
      recordAllTyped()
      const el = (e.target as Element | null)?.closest?.('button, a, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], summary, label')
      if (!el || el.closest('[data-no-log]')) return
      recordTesterEvent('tap', {
        label: clip(el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '', 80),
        testid: el.getAttribute('data-testid') || undefined,
      })
    }, true)
    document.addEventListener('input', e => {
      if (!profileId) return
      const el = e.target as HTMLInputElement | null
      if (!el || !('value' in el) || isPrivateField(el)) return
      const type = (el.type || '').toLowerCase()
      if (type === 'checkbox' || type === 'radio') return
      typedPending.set(el, String(el.value ?? ''))
    }, true)
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target instanceof Element) recordTyped(e.target) }, true)
    document.addEventListener('focusout', e => { if (e.target instanceof Element) recordTyped(e.target) }, true)
    document.addEventListener('change', e => {
      const el = e.target as HTMLSelectElement | null
      if (!profileId || !el || el.tagName !== 'SELECT' || isPrivateField(el)) return
      recordTesterEvent('typed', { field: fieldName(el), value: clip(el.value, TEXT_MAX) })
    }, true)

    // A message on screen that says something failed. The app has no toasts: a failure is a line in its own place,
    // role="alert" or role="status", so those are read, and only the ones in failure words count.
    const seen = new WeakSet<Element>()
    new MutationObserver(records => {
      if (!profileId) return
      for (const r of records) for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue
        const alerts = n.matches('[role="alert"], [role="status"]') ? [n] : [...n.querySelectorAll('[role="alert"], [role="status"]')]
        for (const a of alerts) {
          if (seen.has(a)) continue
          seen.add(a)
          const text = clip(a.textContent, TEXT_MAX)
          if (text && FAILED_WORDS.test(text)) recordTesterEvent('failed_save', { message: text, via: 'screen' })
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true })

    setInterval(() => void flushTesterEvents(), FLUSH_MS)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { recordAllTyped(); void flushTesterEvents() } })
  } catch { /* the app runs on without the log */ }
}

/** At start: a phone that was recording carries on from the first line, before the profile has loaded. */
export function resumeTesterLogAtStart(): void {
  const id = readOn()
  if (id) setTester(id)
}
