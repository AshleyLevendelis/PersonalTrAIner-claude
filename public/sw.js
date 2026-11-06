// ---------------------------------------------------------------------------
// The offline shell — audit §9.1.
//
// WHAT THIS FIXES. Everything this app writes is local-first: sets, water,
// grocery items and cardio logs all queue locally and sync with retries, so a
// dropped connection mid-session loses nothing. All of which only helps if
// the app is ALREADY OPEN. Opening it with no signal gave the browser's own
// error page, because nothing was cached — the careful offline write path had
// no offline read path in front of it.
//
// WHAT THIS DELIBERATELY IS NOT. Not a precache manifest. Vite hashes asset
// filenames at build time, so a hand-written precache list would either be
// wrong or need a build plugin to inject. Instead:
//
//   - Navigations are NETWORK-FIRST, falling back to the cached shell. Online,
//     you always get the current index.html, so a deploy is never masked by a
//     stale document pointing at asset URLs that no longer exist. Offline, you
//     get the app instead of a browser error.
//   - Same-origin GET assets are STALE-WHILE-REVALIDATE. Hashed filenames make
//     this safe: a given URL's bytes never change, so serving the cached copy
//     while refreshing in the background can't serve stale code.
//
// WHAT IT MUST NEVER TOUCH. Anything cross-origin, and anything that isn't a
// GET. That means every Supabase call — the profile, the logs, the coach —
// goes straight to the network, always. Caching an API response here would
// put a second, invisible copy of the user's data one layer below the stores
// that were carefully built to own it, and a stale plan is worse than no
// plan.
// ---------------------------------------------------------------------------

// Bumping this evicts everything from the previous version on activate.
const VERSION = 'v1'
const SHELL_CACHE = `shell-${VERSION}`
const ASSET_CACHE = `assets-${VERSION}`
const SHELL_URL = '/index.html'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      // A failed install must not wedge the app in a "registering forever"
      // state — without this the whole worker is discarded and the site works
      // exactly as it did before, which is the correct failure mode.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', event => {
  // Lets the page trigger an immediate takeover after an update is found,
  // rather than waiting for every tab to close.
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase, fonts, anything else: untouched

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          void caches.open(SHELL_CACHE).then(c => c.put(SHELL_URL, copy))
          return response
        })
        .catch(async () => (await caches.match(SHELL_URL)) ?? Response.error()),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          // Only cache a real success. An opaque or errored response cached
          // here would be served back indefinitely as if it were the asset.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(ASSET_CACHE).then(c => c.put(request, copy))
          }
          return response
        })
        .catch(() => cached ?? Response.error())
      return cached ?? network
    }),
  )
})

// ---------------------------------------------------------------------------
// THE COACH TEXTS YOU — docs/plans/the-coach-can-reach-you.md.
//
// Two functions send one encrypted JSON message:
//   { title, body, moment, url, messageId }
// coach-reach-out for a reminder, chat-gemini for a REPLY when she has left the
// app. Since 6 Nov 2026 (her "like a WhatsApp notification") the words are a
// message in the chat too: the title is the coach's name ("Trainer"), the body
// is the very message, and a tap opens the chat where it sits at the bottom.
// Nothing here writes any words.
//
// ALREADY LOOKING: when a window of the app is visible and focused she is in
// it, so nothing pops up over her own screen; the window is told a message
// arrived and draws it.
//
// One tag per kind: a newer reminder replaces an unread reminder, and a newer
// reply replaces an unread reply but buzzes again ("renotify"), the way a
// messaging app updates one conversation.
// ---------------------------------------------------------------------------
const CHAT_URL = '/#/tab/chat'

async function appWindows() {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return all.filter(w => { try { return new URL(w.url).origin === self.location.origin } catch { return false } })
}

function tellWindows(windows, messageId) {
  for (const w of windows) { try { w.postMessage({ type: 'coach-message', messageId: messageId || null }) } catch { /* gone */ } }
}

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  // A push with no words is not shown. The server never sends one; if one
  // ever arrives the browser may put up its own generic notice, which is
  // still better than a notification in words nobody wrote.
  if (!data || typeof data.body !== 'string' || !data.body) return
  event.waitUntil((async () => {
    const windows = await appWindows()
    tellWindows(windows, data.messageId)
    if (windows.some(w => w.visibilityState === 'visible' && w.focused)) return
    const reply = data.moment === 'coach_reply'
    await self.registration.showNotification(data.title || 'Trainer', {
      body: data.body,
      tag: reply ? 'coach-chat' : 'coach',
      renotify: reply,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // ONLY EVER A TAB OF THIS APP: anything else falls back to the chat
      // rather than becoming a link out.
      data: { url: typeof data.url === 'string' && /^\/#\/tab\/[a-z]+$/.test(data.url) ? data.url : CHAT_URL, moment: data.moment || null, messageId: data.messageId || null },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const d = event.notification.data || {}
  const target = d.url || CHAT_URL
  event.waitUntil((async () => {
    const windows = await appWindows()
    for (const w of windows) {
      await w.focus()
      if ('navigate' in w) await w.navigate(target).catch(() => {})
      // The window was open in the background: tell it to read the chat again,
      // so the message she tapped is there when it comes forward.
      tellWindows([w], d.messageId)
      return
    }
    await self.clients.openWindow(target)
  })())
})
