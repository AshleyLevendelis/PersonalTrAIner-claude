// ---------------------------------------------------------------------------
// CAN THE FIRST SCREEN ACTUALLY BE TAPPED?
//
// Ashley opened the deployed app on her phone and could not type her name.
// The sign-in offer — a `fixed` bar at the bottom of the screen — was sitting
// directly on top of the composer, which is also `fixed` at the bottom, at the
// same z-index. The later one in the DOM won every tap. The first control of
// the first screen, for every new user, and it shipped.
//
// EVERY EXISTING GATE WAS GREEN THROUGH IT, and they always would have been.
// They reason about DATA — loads, floors, policies, tool wiring. render-screens
// takes a picture, but of a hand-copied REPLICA of the composer, so it cannot
// see a second layer that only exists in App.tsx. There was nothing in the
// suite that could see one box covering another, because nothing in the suite
// had a layout engine.
//
// So this runs the REAL app, from a REAL production build, in a REAL browser,
// at a phone's dimensions, and asks the only question that matters: if you tap
// the middle of this control, what do you actually hit? That is precisely what
// failed, expressed as an assertion.
//
// Supabase is faked at the network layer rather than mocked in the code — the
// app under test is byte-for-byte the one that deploys, and it is steered to
// the onboarding screen by answering "no profile" to its first read.
// ---------------------------------------------------------------------------

import { chromium, type Page } from 'playwright-core'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
/**
 * Chromium, wherever this machine keeps it.
 *
 * Deliberately NOT a single hardcoded path. The one this was written against
 * exists only on the cloud runner, and a gate that goes red on Ashley's laptop
 * because of a missing browser is a gate she learns to ignore — the exact
 * habit that let two DB-dependent checks sit "red on main" for days when they
 * were only ever red for want of a network. If no browser can be found this
 * SKIPS, loudly and by name, rather than failing or pretending to pass.
 */
const CHROME_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[]
const CHROME = CHROME_CANDIDATES.find(p => existsSync(p))

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

if (!CHROME) {
  console.log('\nSKIPPED — no Chromium on this machine, so the layout could not be measured.')
  console.log('This gate needs a real browser: it is the only one that can see one control covering another.')
  console.log('Set CHROMIUM_PATH=/path/to/chrome, or install Chrome, then re-run.\n')
  process.exit(0)
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html missing — run `npm run build` first. Rendering a stale or absent build would let this gate pass on a screen nobody is shipping.')
  process.exit(1)
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
}

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  let file = join(DIST, url === '/' ? 'index.html' : url)
  if (!existsSync(file) || !extname(file)) file = join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise<void>(r => server.listen(0, r))
const port = (server.address() as { port: number }).port
const BASE = `http://127.0.0.1:${port}`

const browser = await chromium.launch({ executablePath: CHROME })

/**
 * The onboarding screen, on a phone, with a signed-in-but-profile-less user —
 * the state every genuinely new person is in on their first open.
 *
 * 390x844 is an iPhone 14/15. The bug reproduced on a taller Android too; the
 * failure is not width-dependent, it is two fixed layers sharing one anchor.
 */
async function onboardingPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })

  // Every Supabase call answered locally. Auth hands back a real-shaped
  // anonymous session; the profile read hands back an empty list, which is
  // what sends App.tsx to onboarding rather than to the app.
  await context.route('**/auth/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      access_token: 'test', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test',
      user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', is_anonymous: true },
    }),
  }))
  await context.route('**/rest/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }))
  await context.route('**/functions/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ reply: '' }),
  }))

  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('input', { timeout: 15000 })
  return { page, close: () => context.close() }
}

/**
 * What is actually on top at the middle of this element?
 *
 * elementFromPoint is the browser's own hit test — the same routine that
 * decides where a tap goes. Walking up from the hit through parentElement
 * means a click landing on an icon INSIDE the button still counts as the
 * button, which is correct: that tap works.
 */
const hitTest = (page: Page, selector: string) => page.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return { found: false as const }
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return { found: true as const, sized: false as const }
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  let node: Element | null = hit
  let reachesSelf = false
  while (node) { if (node === el) { reachesSelf = true; break } node = node.parentElement }
  // Inlined rather than pulled out into a named helper: this function is
  // serialised into the page, and the TypeScript runner rewrites named inner
  // functions with a helper that does not exist over there.
  const blockedBy = reachesSelf || !hit ? null
    : `${hit.tagName.toLowerCase()}${typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`
  return {
    found: true as const, sized: true as const, reachesSelf,
    rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
    blockedBy,
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
  }
}, selector)

console.log('\n1. The name box — the very first thing a new user has to touch')
{
  const { page, close } = await onboardingPage()

  const input = await hitTest(page, 'input')
  check('the composer input is on the page', input.found)
  check('...and has been given a size', input.found && input.sized)
  // THE ASSERTION THIS GATE EXISTS FOR. Everything else here is context.
  check('...and a tap in the middle of it reaches the input',
    input.found && input.sized && input.reachesSelf, input.found && input.sized ? input.blockedBy : null)
  check('...and it is on screen, not below the fold',
    input.found && input.sized && input.inViewport, input.found && input.sized ? input.rect : null)

  // Typing is the whole point of the box, so type.
  await page.click('input')
  await page.keyboard.type('Ashley')
  const typed = await page.inputValue('input')
  check('...and typing into it actually lands', typed === 'Ashley', typed)

  await close()
}

console.log('\n2. Every control on the first screen can be reached')
{
  const { page, close } = await onboardingPage()

  // DISABLED CONTROLS ARE EXCLUDED, and that is not a loophole — a disabled
  // button carries pointer-events:none, so taps passing through it is the
  // behaviour it was given on purpose. The first version of this check did
  // not know that and reported the send button (dim until there is something
  // to send) as covered, which would have been a gate crying wolf on correct
  // code from its first run. Only `disabled` earns the exemption; anything
  // merely hidden behind another layer still fails.
  const controlsNow = () => page.evaluate(() => {
    const out: { label: string; disabled: boolean; reachesSelf: boolean; blockedBy: string | null }[] = []
    for (const el of [...document.querySelectorAll('button, input, [role="button"]')]) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom < 0 || r.top > window.innerHeight) continue
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      let node: Element | null = hit
      let reachesSelf = false
      while (node) { if (node === el) { reachesSelf = true; break } node = node.parentElement }
      out.push({
        label: (el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName.toLowerCase()),
        disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true',
        reachesSelf,
        blockedBy: reachesSelf || !hit ? null : hit.tagName.toLowerCase() + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\s+/)[0] : ''),
      })
    }
    return out
  })

  const controls = await controlsNow()
  check('there are controls to check, so this has teeth', controls.length > 0, controls.length)
  const blocked = controls.filter(c => !c.reachesSelf && !c.disabled)
  check('no live control on the onboarding screen is covered by another',
    blocked.length === 0, blocked)

  // The exemption is then closed from the other side: type something, and the
  // send button must become reachable. Without this, "it was disabled" would
  // be an excuse a genuinely buried button could hide behind forever.
  await page.click('input')
  await page.keyboard.type('Ashley')
  const after = await controlsNow()
  const stillBlocked = after.filter(c => !c.reachesSelf && !c.disabled)
  check('...and the send button is reachable once there is something to send',
    stillBlocked.length === 0 && after.some(c => !c.disabled && c.reachesSelf), stillBlocked)

  await close()
}

console.log('\n3. The sign-in offer is present, and shares the composer rather than sitting on it')
{
  const { page, close } = await onboardingPage()

  const signIn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /already have an account/i.test(b.textContent ?? ''))
    if (!btn) return { present: false as const }
    const input = document.querySelector('input')
    if (!input) return { present: true as const, hasInput: false as const }
    const a = btn.getBoundingClientRect(), b = input.getBoundingClientRect()
    // Two boxes overlap when they intersect on BOTH axes. A shared column
    // gives them the same x-range and disjoint y-ranges, so this is really a
    // question about the vertical.
    const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    return {
      present: true as const, hasInput: true as const, overlaps,
      signInBottom: Math.round(a.bottom), inputTop: Math.round(b.top),
    }
  })

  check('the offer is still on the screen — nobody is walled behind a login', signIn.present)
  check('...and it does not overlap the name box at all',
    signIn.present && signIn.hasInput && !signIn.overlaps, signIn)
  check('...it sits above it, in the same column',
    signIn.present && signIn.hasInput && signIn.signInBottom <= signIn.inputTop, signIn)

  // Once the conversation has started it steps out of the way.
  await page.click('input')
  await page.keyboard.type('Ashley')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const stillThere = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => /already have an account/i.test(b.textContent ?? '')))
  check('...and it goes away once they have said something', !stillThere)

  await close()
}

await browser.close()
server.close()

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll onboarding-reachability checks passed.\n')
