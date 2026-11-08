// test:sentry-privacy — holds Ashley's 8 Nov 2026 rulings on Sentry.
//
//   "Errors + speed only" (over blanked-out screen recordings and over Sentry's defaults): crash reports and
//   timings, and NOTHING she typed or was served. So no replay or feedback integration, no user info, cookies,
//   headers, bodies or URL query strings, and breadcrumb URLs cut at the "?".
//   "Just after the app appears" (over loading at start): nothing on the opening path imports Sentry.
//
// Reads the configuration the app actually passes to Sentry (sentryOptions), never starts the SDK.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sentryOptions } from '../src/lib/sentry-init'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const prod = sentryOptions('https://key@example.ingest.de.sentry.io/1', 'production', 'abc123') ?? {}
const dev = sentryOptions('https://key@example.ingest.de.sentry.io/1', 'development') ?? {}

console.log('1. What Sentry is allowed to collect')
const dc = (prod.dataCollection ?? {}) as Record<string, unknown>
check('no user info (IP address, user fields)', dc.userInfo === false, dc.userInfo)
check('no cookies', dc.cookies === false, dc.cookies)
check('no headers', dc.httpHeaders === false, dc.httpHeaders)
check('no request or response bodies (meals, weights, chat text)', Array.isArray(dc.httpBodies) && (dc.httpBodies as unknown[]).length === 0, dc.httpBodies)
check('no URL query strings (Supabase row filters carry user ids)', dc.urlQueryParams === false, dc.urlQueryParams)
check('the legacy send-everything switch is not on', (prod as { sendDefaultPii?: boolean }).sendDefaultPii !== true)

console.log('2. Errors and speed only')
const names = (Array.isArray(prod.integrations) ? prod.integrations : []).map(i => i.name)
check('the only added integration is page-speed tracing', names.length === 1 && names[0] === 'BrowserTracing', names)
check('no screen recording', !names.some(n => /replay/i.test(n)), names)
check('no feedback widget', !names.some(n => /feedback/i.test(n)), names)
check('no screen-recording sample rates set', prod.replaysSessionSampleRate === undefined && prod.replaysOnErrorSampleRate === undefined)
check('one page load in five is traced in production', prod.tracesSampleRate === 0.2, prod.tracesSampleRate)
check('every page load is traced in development', dev.tracesSampleRate === 1, dev.tracesSampleRate)
check('no trace headers on outgoing requests', Array.isArray(prod.tracePropagationTargets) && prod.tracePropagationTargets.length === 0, prod.tracePropagationTargets)
check('release and environment are tagged', prod.release === 'abc123' && prod.environment === 'production', [prod.release, prod.environment])

console.log('3. Breadcrumb URLs are cut at the "?"')
const bb = prod.beforeBreadcrumb
const crumb = (c: Record<string, unknown>) => (bb ? bb(c as never, undefined) : c) as { data?: Record<string, unknown> } | null
const fetchCrumb = crumb({ category: 'fetch', data: { url: 'https://x.supabase.co/rest/v1/meals?user_id=eq.1234&select=*', method: 'GET' } })
check('a fetch URL loses its query string', fetchCrumb?.data?.url === 'https://x.supabase.co/rest/v1/meals', fetchCrumb?.data?.url)
const xhrCrumb = crumb({ category: 'xhr', data: { url: '/api/thing?weight=82' } })
check('an xhr URL loses its query string', xhrCrumb?.data?.url === '/api/thing', xhrCrumb?.data?.url)
const navCrumb = crumb({ category: 'navigation', data: { from: '/?tab=home&w=82', to: '/?tab=nutrition&q=x' } })
check('a navigation keeps its page and loses its query', navCrumb?.data?.from === '/' && navCrumb?.data?.to === '/', navCrumb?.data)
const plain = crumb({ category: 'ui.click', message: 'button' })
check('a breadcrumb with no URL passes through', plain !== null && (plain as { message?: string }).message === 'button', plain)

console.log('4. Nothing on the opening path imports Sentry')
const lazy = strip(readFileSync(join(ROOT, 'src/lib/sentry.ts'), 'utf8'))
const main = strip(readFileSync(join(ROOT, 'src/main.tsx'), 'utf8'))
check('the holder imports no Sentry code', !/from\s+['"]@sentry\//.test(lazy) && !/import\s+['"]@sentry\//.test(lazy))
// "typeof import('./sentry-init')" in a type also matches import(...): it must not count as the fetch.
check('the holder fetches the SDK with a dynamic import', /(?<!typeof\s*)import\(\s*['"]\.\/sentry-init['"]\s*\)\s*\.then/.test(lazy))
check('...and the detector is not satisfied by a type alone', !/(?<!typeof\s*)import\(\s*['"]\.\/sentry-init['"]\s*\)\s*\.then/.test("type T = typeof import('./sentry-init')['x']"))
check('the holder imports sentry-init only dynamically', !/from\s+['"]\.\/sentry-init['"]/.test(lazy.replace(/import\(['"]\.\/sentry-init['"]\)\[/g, '')))
check('main.tsx imports no Sentry code', !/['"]@sentry\//.test(main) && !/sentry-init/.test(main))
check('main.tsx starts the holder', /startSentry\(\)/.test(main))
check('all three React root hooks report', ['uncaught', 'caught', 'recoverable'].every(k => new RegExp(`reactErrorHook\\('${k}'\\)`).test(main)))

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
