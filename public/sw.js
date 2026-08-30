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
