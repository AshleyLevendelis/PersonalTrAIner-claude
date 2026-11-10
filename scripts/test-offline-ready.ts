// ---------------------------------------------------------------------------
// test:offline-ready — the app works in a gym with no signal (Ashley, 10 Nov 2026).
//
// verify:gym-offline drives a whole workout with the server taken away. This holds what a driver cannot reach or
// reaches only once: the worker's saving of the whole app run against a fake cache (every branch of it), the week's
// overlay of the phone's own work on both outcomes of a read, the build's list of its own files, and the wiring that
// would leave all of it unreachable (the page never asking, the plugin not in the build, a reload offline).
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import vm from 'vm'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// --- A worker to run sw.js in: a cache, a network a test can script, and the listeners it registers. -----------
function makeWorker(net: (path: string) => { status: number; type?: string; body?: string } | 'dead') {
  const store = new Map<string, Map<string, { body: string }>>()
  const fetched: string[] = []
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  const cacheOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    const m = store.get(name)!
    const key = (r: unknown) => (typeof r === 'string' ? r : new URL((r as { url: string }).url).pathname)
    return {
      match: async (r: unknown) => (m.has(key(r)) ? { ok: true } : undefined),
      put: async (r: unknown, res: { body: string }) => { m.set(key(r), { body: res.body }) },
      add: async () => {},
      delete: async (r: unknown) => m.delete(key(r)),
      keys: async () => [...m.keys()].map(p => ({ url: `https://app.test${p}` })),
    }
  }
  const fetchFn = async (input: unknown) => {
    const path = typeof input === 'string' ? input : new URL((input as { url: string }).url).pathname
    fetched.push(path)
    const answer = net(path)
    if (answer === 'dead') throw new TypeError('Failed to fetch')
    const type = answer.type ?? (path.endsWith('.json') ? 'application/json' : 'text/javascript')
    return {
      ok: answer.status >= 200 && answer.status < 300, status: answer.status, type: 'basic', body: answer.body ?? 'x',
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? type : null) },
      json: async () => JSON.parse(answer.body ?? '{}'),
      clone() { return this },
    }
  }
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: (e: unknown) => void) => { (listeners[type] ??= []).push(fn) },
    skipWaiting: () => {}, clients: { claim: async () => {}, matchAll: async () => [] }, registration: {},
  }
  const context = vm.createContext({ self, caches: { open: async (n: string) => cacheOf(n), keys: async () => [...store.keys()], match: async () => undefined, delete: async () => true }, fetch: fetchFn, URL, Request: class { url: string; constructor(u: string) { this.url = u } }, Response: class {}, console, Promise, Set, Map, Array, JSON, setTimeout })
  vm.runInContext(readFileSync('public/sw.js', 'utf8'), context)
  const message = async (data: unknown) => {
    const waits: Promise<unknown>[] = []
    for (const fn of listeners.message ?? []) fn({ data, waitUntil: (p: Promise<unknown>) => { waits.push(p) } })
    await Promise.all(waits)
  }
  return { message, fetched, held: (cache = 'assets-v1') => [...(store.get(cache)?.keys() ?? [])].sort(), seed: (path: string) => { void cacheOf('assets-v1').put(path, { body: 'old' }) } }
}

async function main() {
  console.log('\n1. The worker saves every file the build lists')
  const FILES = ['/assets/index-a1.js', '/assets/index-a1.css', '/assets/ProgramCalendar-b2.js', '/assets/TightnessSheet-c3.js', '/assets/vendor-react-d4.js']
  const manifest = JSON.stringify({ files: FILES })
  {
    const w = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: manifest } : { status: 200 }))
    await w.message('warm-assets')
    check('asked once, every listed file is held on the phone', JSON.stringify(w.held()) === JSON.stringify([...FILES].sort()), w.held())
    const before = w.fetched.length
    await w.message('warm-assets')
    check('asked again, only the list is fetched: what is held is not downloaded twice', w.fetched.length - before === 1 && w.fetched[w.fetched.length - 1] === '/asset-manifest.json', w.fetched.slice(before))
  }
  {
    const w = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: manifest } : { status: 200 }))
    w.seed('/assets/Old-zz.js'); w.seed('/assets/index-a1.js')
    await w.message('warm-assets')
    check('a file of a version no longer listed is removed, and a listed one already held is kept', !w.held().includes('/assets/Old-zz.js') && w.held().includes('/assets/index-a1.js') && w.held().length === FILES.length, w.held())
  }
  {
    // The signal drops half-way: nothing of the OLD version may be removed for a new one that is not whole.
    let served = 0
    const w = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: manifest } : ++served > 2 ? 'dead' : { status: 200 }))
    w.seed('/assets/Old-zz.js')
    await w.message('warm-assets')
    check('the signal drops half-way: what arrived is kept', w.held().filter(f => FILES.includes(f)).length >= 1 && w.held().filter(f => FILES.includes(f)).length < FILES.length, w.held())
    check('...and the older version is NOT cleared for a new one that is only half there', w.held().includes('/assets/Old-zz.js'), w.held())
  }
  {
    const w = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: manifest } : p.includes('Tightness') ? { status: 200, type: 'text/html; charset=utf-8', body: '<!doctype html>' } : { status: 200 }))
    await w.message('warm-assets')
    check('a web page answering for a missing script is never saved as that script', !w.held().includes('/assets/TightnessSheet-c3.js') && w.held().length === FILES.length - 1, w.held())
  }
  {
    const w = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: manifest } : p.includes('Calendar') ? { status: 404 } : { status: 200 }))
    w.seed('/assets/Old-zz.js')
    await w.message('warm-assets')
    check('a listed file the host does not have is not saved, and nothing older is cleared', !w.held().includes('/assets/ProgramCalendar-b2.js') && w.held().includes('/assets/Old-zz.js'), w.held())
  }
  {
    const w = makeWorker(() => 'dead')
    w.seed('/assets/Old-zz.js')
    await w.message('warm-assets')
    check('with no signal at all nothing changes and nothing throws', JSON.stringify(w.held()) === JSON.stringify(['/assets/Old-zz.js']), w.held())
  }
  {
    const w = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: JSON.stringify({ files: [] }) } : { status: 200 }))
    w.seed('/assets/Old-zz.js')
    await w.message('warm-assets')
    check('an EMPTY list clears nothing (a broken build must not empty the phone)', w.held().includes('/assets/Old-zz.js'), w.held())
  }
  {
    const w = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: manifest } : { status: 200 }))
    await Promise.all([w.message('warm-assets'), w.message('warm-assets'), w.message('warm-assets')])
    check('three asks at once are one run (each file fetched once)', w.fetched.filter(f => f === '/assets/index-a1.js').length === 1 && w.fetched.filter(f => f === '/asset-manifest.json').length === 1, w.fetched)
    const quiet = makeWorker(p => (p === '/asset-manifest.json' ? { status: 200, body: manifest } : { status: 200 }))
    await quiet.message('something-else')
    check('...and any other message saves nothing', quiet.fetched.length === 0, quiet.fetched)
  }

  console.log('\n2. The build writes that list, and the page asks for it')
  const { assetManifest, ASSET_MANIFEST_FILE } = await import('../vite-asset-manifest')
  const emitted: { fileName: string; source: string }[] = []
  const plugin = assetManifest() as unknown as { generateBundle: (this: { emitFile: (f: { fileName: string; source: string }) => void }, o: unknown, b: Record<string, unknown>) => void; apply: string }
  plugin.generateBundle.call({ emitFile: f => { emitted.push(f) } }, {}, { 'assets/z-1.js': {}, 'assets/a-2.css': {}, 'assets/font-3.woff2': {}, 'index.html': {}, 'assets/m-4.js': {} })
  const list = JSON.parse(emitted[0]?.source ?? '{}').files as string[] | undefined
  check('every script and stylesheet the build made is listed, by the path the page asks for', emitted[0]?.fileName === ASSET_MANIFEST_FILE && JSON.stringify(list) === JSON.stringify(['/assets/a-2.css', '/assets/m-4.js', '/assets/z-1.js']), list)
  check('...the list is the name the worker fetches', ASSET_MANIFEST_FILE === 'asset-manifest.json' && /ASSET_MANIFEST_URL = '\/asset-manifest\.json'/.test(readFileSync('public/sw.js', 'utf8')))
  check('...and only a real build writes one', plugin.apply === 'build')
  const viteConfig = strip(readFileSync('vite.config.ts', 'utf8'))
  check('the app\'s own build runs the plugin (a list nobody writes saves nothing)', /plugins:\s*\[[^\]]*assetManifest\(\)/.test(viteConfig))
  check('...and so does the harness build verify:gym-offline drives', /plugins:\s*\[[^\]]*assetManifest\(\)/.test(strip(readFileSync('.tour-harness/vite.config.ts', 'utf8'))))
  const mainTsx = strip(readFileSync('src/main.tsx', 'utf8'))
  check('the page asks the worker on every open, once it is ready', /serviceWorker\.ready\.then\([\s\S]{0,400}postMessage\('warm-assets'\)/.test(mainTsx))
  check('...after the first render is under way, not in front of it', mainTsx.indexOf("postMessage('warm-assets')") > mainTsx.indexOf("register('/sw.js')") && /addEventListener\('load'/.test(mainTsx))

  console.log('\n3. No reload and no crash screen with no signal')
  const store = new Map<string, string>()
  let reloads = 0
  ;(globalThis as unknown as { window: unknown }).window = {
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } },
    location: { reload: () => { reloads++ } }, addEventListener: () => {},
  }
  const setOnline = (v: boolean) => Object.defineProperty(globalThis, 'navigator', { value: { onLine: v }, configurable: true })
  const { reloadOnce } = await import('../src/lib/chunk-reload')
  setOnline(false)
  check('with no signal a missing file never reloads the page', reloadOnce(1_000_000) === false && reloads === 0, { reloads })
  check('...and leaves no stamp, so the first one back online still can', store.size === 0, [...store.keys()])
  setOnline(true)
  check('with signal it reloads once, as before', reloadOnce(1_000_000) === true && reloads === 1, { reloads })
  const chunk = strip(readFileSync('src/lib/chunk-reload.ts', 'utf8'))
  check('a part that cannot be fetched draws its own notice, where it used to throw to the error screen', /if \(isChunkLoadError\(error\)\) return \{ default: partNotLoaded\(factory, options\)/.test(chunk))
  check('...and a real error still throws (only a missing file is softened)', /partNotLoaded\(factory, options\)[^\n]*\n\s*throw error/.test(chunk))
  const part = readFileSync('src/components/PartNotLoaded.tsx', 'utf8')
  const { PART_NOT_LOADED_OFFLINE, PART_NOT_LOADED_ONLINE } = await import('../src/components/PartNotLoaded')
  check('the notice says what is true: not on the phone, needs a connection, logging is saved', /isn't saved on your phone yet/.test(PART_NOT_LOADED_OFFLINE) && /needs a connection/.test(PART_NOT_LOADED_OFFLINE) && /still being saved/.test(PART_NOT_LOADED_OFFLINE), PART_NOT_LOADED_OFFLINE)
  check('...promises nothing ("yet" names the download, not a feature) and blames nobody', !/sorry|error|crash|oops/i.test(PART_NOT_LOADED_OFFLINE + PART_NOT_LOADED_ONLINE))
  check('the reload is from her tap only, never from the signal coming back', /const up = \(\) => \{ setOnline\(true\); tryAgain\(false\) \}/.test(strip(part)) && /if \(byTap && navigator\.onLine !== false\) window\.location\.reload\(\)/.test(strip(part)) && (strip(part).match(/location\.reload\(\)/g) ?? []).length === 2 && /onClick=\{\(\) => window\.location\.reload\(\)\}/.test(strip(part)))
  const { PART_NOT_LOADED_RELOAD } = await import('../src/components/PartNotLoaded')
  check('with signal the button is named for what it does', PART_NOT_LOADED_RELOAD === 'Reload the app' && /\{online \? \(/.test(strip(part)))
  check('a sheet that is mounted but shut says nothing (open false, or a target of nothing)', /\('open' in props && props\.open === false\) \|\| \('target' in props && props\.target == null\)/.test(strip(part)) && /if \(sheet && \(shut \|\| dismissed\)\) return null/.test(strip(part)))
  check('a part nobody tapped to open draws nothing while it is missing (the shopping card on Home)', /if \(options\.ambient\) return null/.test(strip(part)) && /import\('@\/components\/ShopDayCard'\)[^\n]*\{ ambient: true \}/.test(strip(readFileSync('src/components/Dashboard.tsx', 'utf8'))))
  const today = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
  check('the finish check is part of the screen, never fetched on the tap', /import \{ FinishCheckSheet \} from '\.\/FinishCheckSheet'/.test(today) && !/lazyWithReload\(\(\) => import\('\.\/FinishCheckSheet'\)/.test(today))

  console.log('\n4. The week counts what the phone holds')
  const { weekWithLocalWork } = await import('../src/lib/week-local-work')
  type Row = { exercise_name: string; set_number: number; is_warmup?: boolean; date?: string }
  const row = (exercise_name: string, set_number: number, is_warmup = false): Row => ({ exercise_name, set_number, is_warmup })
  const QUEUED: Record<string, Row[]> = { '2026-09-16': [row('Chin-Ups', 2), row('Chin-Ups', 3), row('Band Face Pulls', 1, true)] }
  const LAST_KNOWN: Record<string, Row[]> = { '2026-09-14': [row('Squat', 1), row('Squat', 2)] }
  const asked: { date: string; served: boolean }[] = []
  const readers = (finished: Record<string, string>) => ({
    setsFor: (_p: string, date: string, serverRows: unknown[] | null, fallback: unknown[]) => {
      asked.push({ date, served: serverRows != null })
      const base = (serverRows ?? LAST_KNOWN[date] ?? fallback) as Row[]
      return [...base, ...(QUEUED[date] ?? [])] as never[]
    },
    finishedAt: (_p: string, date: string) => finished[date] ?? null,
  })
  const day = (date: string, working: Row[], session: unknown = null) => ({ date, metric: null, nutrition: null, session, exercises: [], workingLogs: working, warmupLogs: [], cardioLogs: [] }) as never
  const served = weekWithLocalWork('p', [day('2026-09-14', [row('Squat', 1)], { is_completed: true, date: '2026-09-14' }), day('2026-09-16', [row('Chin-Ups', 1)], { is_completed: false, date: '2026-09-16' })], '2026-09-14', '2026-09-20', true, readers({}) as never)
  const d16 = served.find(d => d.date === '2026-09-16')!
  check('the server answered: today is its rows with the queued sets on top', d16.workingLogs.length === 3 && d16.warmupLogs.length === 1, { working: d16.workingLogs.length, warm: d16.warmupLogs.length })
  check('...a build-up row is not a working set', d16.warmupLogs[0]?.exercise_name === 'Band Face Pulls')
  check('...a day with nothing queued is exactly what the server said', served.find(d => d.date === '2026-09-14')!.workingLogs.length === 1)
  check('...every row carries its date', d16.workingLogs.every(r => (r as Row).date === '2026-09-16'))
  check('one day per date of the range, in order', served.length === 7 && served[0].date === '2026-09-14' && served[6].date === '2026-09-20', served.map(d => d.date))
  check('not finished on the phone: the session stays as the server has it', d16.session?.is_completed === false)
  asked.length = 0
  const failed = weekWithLocalWork('p', [day('2026-09-16', [row('Chin-Ups', 1)])], '2026-09-14', '2026-09-20', false, readers({ '2026-09-16': '2026-09-16T12:40:00.000Z' }) as never)
  const f16 = failed.find(d => d.date === '2026-09-16')!
  check('the read FAILED: the phone is asked without server rows', asked.length === 7 && asked.every(a => a.served === false), asked.slice(0, 2))
  check('...today keeps what the screen held, plus the queue', f16.workingLogs.length === 3, f16.workingLogs.length)
  check('...a day the screen had nothing for shows the phone\'s last full answer', failed.find(d => d.date === '2026-09-14')!.workingLogs.length === 2)
  check('a session finished on the phone counts as finished before the server has heard', f16.session?.is_completed === true && f16.session?.finished_at === '2026-09-16T12:40:00.000Z' && f16.session?.date === '2026-09-16', f16.session)
  const empty = weekWithLocalWork('p', [], '2026-09-14', '2026-09-20', false, { setsFor: () => [], finishedAt: () => '2026-09-15T10:00:00.000Z' } as never)
  check('Finish with nothing logged finishes nothing (the app\'s own rule)', empty.every(d => d.session == null) && empty.length === 7, empty.map(d => d.session))
  const kept = weekWithLocalWork('p', [day('2026-09-16', [row('Chin-Ups', 1)], { is_completed: true, finished_at: '2026-09-16T09:00:00.000Z', duration_minutes: 52, id: 's1' })], '2026-09-16', '2026-09-16', true, readers({ '2026-09-16': '2026-09-16T12:40:00.000Z' }) as never)
  check('a session the server already has as finished is left exactly as it is', kept[0].session?.finished_at === '2026-09-16T09:00:00.000Z' && (kept[0].session as { duration_minutes?: number })?.duration_minutes === 52 && kept[0].session?.id === 's1', kept[0].session)
  const hook = strip(readFileSync('src/hooks/useTrainingWeek.ts', 'utf8'))
  check('the week hook lays it over a read that worked', /setDashboard\(weekWithLocalWork\(profileId, week, from, to, true\)\)/.test(hook))
  check('...AND over one that failed (it used to keep the week as it was before the workout)', /\.catch\([\s\S]{0,120}setDashboard\(prev => weekWithLocalWork\(profileId, prev, from, to, false\)\)/.test(hook))
  check('...and so does the one read Home and the coach share', /getWeeklyDashboard\(profileId, from, to\)\.then\(week => weekWithLocalWork\(profileId, week, from, to, true\)\)/.test(hook))

  console.log('\n5. A finish made offline is sent when the signal is back')
  const session = strip(readFileSync('src/hooks/useActiveSession.tsx', 'utf8'))
  check('the retry listens for the signal coming back', /addEventListener\('online', retryOnly\)/.test(session) && /removeEventListener\('online', retryOnly\)/.test(session))
  check('...and knocks again while a close is owed, for a connection that returns without saying so', /setInterval\(\(\) => \{\s*if \(getMostRecentActiveSessionRecord\(profileId\)\?\.serverCloseFailedAt\) retryOnly\(\)/.test(session) && /clearInterval\(knock\)/.test(session))
  check('...saying so when it lands, for the summary that said it had not', /dispatchEvent\(new Event\(SESSION_CLOSE_SYNCED_EVENT\)\)/.test(session) && /addEventListener\(SESSION_CLOSE_SYNCED_EVENT, synced\)/.test(today))
  const setStore = strip(readFileSync('src/lib/set-log-store.ts', 'utf8'))
  check('two askers for one day\'s session share one request', /const running = sessionResolves\.get\(key\)\s*\n\s*if \(running\) return running/.test(setStore) && /\.finally\(\(\) => \{ sessionResolves\.delete\(key\) \}\)/.test(setStore))

  console.log('\n6. A plan change made with no signal is kept on the phone and sent later')
  const ls = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => { ls.set(k, v) }, removeItem: (k: string) => { ls.delete(k) } }
  setOnline(true)
  // A server that can be taken away, or told to refuse: the three calls the plan's saver and reader make.
  const server = new Map<string, { profile_id: string; week_number: number; label: string; days: unknown[]; created_at?: string }>()
  let net: 'up' | 'down' | 'refuse' = 'up'
  let downFor: (weekNumber: number) => boolean = () => true
  const dead = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }
  const refusal = { message: 'new row violates check constraint', details: null, hint: null, code: '23514' }
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({
    from: () => ({
      upsert: async (rows: unknown) => {
        const list = (Array.isArray(rows) ? rows : [rows]) as { profile_id: string; week_number: number; label: string; days: unknown[] }[]
        if (net === 'refuse') return { error: refusal }
        if (net === 'down' && list.some(r => downFor(r.week_number))) return { error: dead }
        for (const r of list) server.set(`${r.profile_id}|${r.week_number}`, r)
        return { error: null }
      },
      select: () => ({ eq: (_c: string, id: string) => ({ order: async () => (net === 'down' ? { data: null, error: dead } : { data: [...server.values()].filter(r => r.profile_id === id).sort((a, b) => a.week_number - b.week_number), error: null }) }) }),
      delete: () => ({ eq: () => ({ gt: async () => ({ error: null }) }) }),
    }),
  } as never)
  const P = await import('../src/lib/mesocycle-persistence')
  const wk = (n: number, label: string, block = 1) => ({ week_number: n, block_number: block, label, days: [{ day: 'Monday', focus: label, exercises: [] }] }) as never
  const plan = (labels: Record<number, string>) => [1, 2, 3, 4].map(n => wk(n, labels[n] ?? `week ${n}`))
  const reset = () => { server.clear(); ls.clear(); net = 'up'; downFor = () => true }
  const serverLabel = (id: string, n: number) => server.get(`${id}|${n}`)?.label ?? null
  // A CALL THAT THROWS IS AN ANSWER ('threw'), not the end of the run: a break that makes a save throw must FAIL the
  // checks that follow, every one of them still counted (a gate that stops early reads as a crash, not a catch).
  const safe = async <T,>(fn: () => Promise<T>): Promise<T | 'threw'> => { try { return await fn() } catch { return 'threw' } }

  reset()
  check('with signal the edit is saved and nothing is kept', (await safe(() => P.saveScopedEdit('p1', plan({ 2: 'swapped' }), 2, 'today', { keepOffline: true }))) === 'saved' && serverLabel('p1', 2) === 'swapped' && P.keptPlanWeeks('p1').size === 0 && !P.hasKeptPlanWeeks())
  let told = 0
  const offKept = P.subscribeKeptPlanWeeks(() => { told++ })
  net = 'down'
  const keptAnswer = await safe(() => P.saveScopedEdit('p1', plan({ 2: 'swapped offline' }), 2, 'today', { keepOffline: true }))
  check('WITH NO SIGNAL it is kept on the phone, not thrown away', keptAnswer === 'kept' && (P.keptPlanWeeks('p1').get(2) as { label?: string } | undefined)?.label === 'swapped offline' && P.hasKeptPlanWeeks() && serverLabel('p1', 2) === 'swapped', { keptAnswer, kept: [...P.keptPlanWeeks('p1').keys()] })
  check('...only the week the edit touched', P.keptPlanWeeks('p1').size === 1)
  check('...and the "waiting to send" line is told', told >= 1, told)
  offKept()
  let threw = false
  try { await P.saveScopedEdit('p2', plan({ 2: 'coach edit' }), 2, 'today') } catch { threw = true }
  check('an edit that did not ask to be kept still throws with no signal (the coach\'s cards)', threw && P.keptPlanWeeks('p2').size === 0)
  net = 'refuse'; threw = false
  try { await P.saveScopedEdit('p3', plan({ 2: 'refused' }), 2, 'today', { keepOffline: true }) } catch { threw = true }
  check('a REFUSAL from the database is never kept: it throws, and the screen puts the plan back', threw && P.keptPlanWeeks('p3').size === 0)

  net = 'up'
  const laidRead = await safe(() => P.restoreMesocycle('p1'))
  const laid = laidRead === 'threw' ? null : laidRead
  check('a read of the plan lays the kept week over the server\'s older one', laid?.weeks?.find(w => w.week_number === 2)?.label === 'swapped offline', laid?.weeks?.map(w => w.label))
  server.set('p9|2', { profile_id: 'p9', week_number: 2, label: 'someone else', days: [] })
  check('...and never over another person\'s plan', (await safe(() => P.restoreMesocycle('p9')).then(r => (r === 'threw' ? null : r)))?.weeks?.[0]?.label === 'someone else')
  net = 'down'
  check('still no signal: sending keeps it and says one is waiting', (await safe(() => P.sendKeptPlanWeeks('p1'))) === 1 && P.keptPlanWeeks('p1').size === 1)
  net = 'up'
  check('the signal is back: it is sent, and nothing is left on the phone', (await safe(() => P.sendKeptPlanWeeks('p1'))) === 0 && serverLabel('p1', 2) === 'swapped offline' && !P.hasKeptPlanWeeks())

  reset(); net = 'down'
  await safe(() => P.saveScopedEdit('p1', plan({ 2: 'old offline edit' }), 2, 'today', { keepOffline: true }))
  net = 'up'
  await safe(() => P.saveMesocycleWeek('p1', wk(2, 'newer edit, saved')))
  check('a newer save of the same week drops the kept copy', P.keptPlanWeeks('p1').size === 0)
  await safe(() => P.sendKeptPlanWeeks('p1'))
  check('...so the older edit is never sent over the newer one', serverLabel('p1', 2) === 'newer edit, saved')

  reset(); net = 'down'; downFor = n => n === 3
  const halfSent = await safe(() => P.saveScopedEdit('p1', plan({ 2: 'b2', 3: 'b3', 4: 'b4' }), 2, 'permanent', { keepOffline: true }))
  check('a whole-block edit that half arrived: the weeks that reached the server are saved, the one that did not is kept', halfSent === 'kept' && [...P.keptPlanWeeks('p1').keys()].join() === '3' && serverLabel('p1', 2) === 'b2' && serverLabel('p1', 4) === 'b4', { halfSent, kept: [...P.keptPlanWeeks('p1').keys()] })
  net = 'up'
  await safe(() => P.saveMesocycle('p1', plan({ 1: 'new plan' })))
  check('a whole new plan drops everything kept from the old one', P.keptPlanWeeks('p1').size === 0)

  reset(); net = 'down'
  await safe(() => P.saveWeekKeepingOffline('p1', wk(2, 'will be refused')))
  await safe(() => P.saveWeekKeepingOffline('p7', wk(2, 'another person')))
  net = 'refuse'
  check('a kept change the server REFUSES is dropped, not knocked for ever', (await safe(() => P.sendKeptPlanWeeks('p1'))) === 0 && P.keptPlanWeeks('p1').size === 0)
  check('...leaving another person\'s kept change alone', P.keptPlanWeeks('p7').size === 1)

  check('the network\'s failure is told from a refusal', P.isNetworkFailure(dead) && P.isNetworkFailure(new TypeError('Failed to fetch')) && P.isNetworkFailure({ message: 'Load failed' }) && !P.isNetworkFailure(refusal) && !P.isNetworkFailure({ message: 'JWT expired', code: 'PGRST301' }) && !P.isNetworkFailure({ message: 'network request failed upstream: could not reach the database', code: 'PGRST002' }) && !P.isNetworkFailure(null) && !P.isNetworkFailure(new Error('cannot read kg')))
  setOnline(false)
  check('...and while the phone says it is offline, any failure is the network\'s', P.isNetworkFailure(new Error('anything')))
  setOnline(true)

  const swapSrc = strip(readFileSync('src/lib/screen-swap.ts', 'utf8'))
  check('the screen\'s swap asks to be kept', /saveScopedEdit\(profile\.id, updated, weekNumber, scope, \{ keepOffline: true \}\)/.test(swapSrc))
  check('...and a sweep of old offers that threw could not put the old exercise back (a precaution: it does not throw today)', /sweepStaleForTarget\([^)]*\)\s*\n?\s*\.catch\(/.test(swapSrc))
  check('so do remove, move and add', /saveScopedEdit\(profileId, next\.mesocycle, liveWeek, scope, \{ keepOffline: true \}\)/.test(today))
  check('...and their Undo', /saveWeekFor = \(profileId: string\) => \(week: MesocycleWeek\) => saveWeekKeepingOffline\(profileId, week\)/.test(strip(readFileSync('src/lib/screen-edit-undo.ts', 'utf8'))))
  check('the coach\'s cards do NOT (it cannot be reached offline; a card that "applied" on the phone alone would lie)', !/keepOffline/.test(strip(readFileSync('src/lib/pending-action-executor.ts', 'utf8'))))
  const sender = strip(readFileSync('src/hooks/useKeptPlanSender.ts', 'utf8'))
  check('the sender knocks when the app opens, when the signal returns, and while anything waits', /\n\s*send\(\)\n/.test(sender) && /addEventListener\('online', send\)/.test(sender) && /setInterval\(send, KNOCK_MS\)/.test(sender))
  check('...and the app mounts it', /useKeptPlanSender\(profile\?\.id\)/.test(strip(readFileSync('src/App.tsx', 'utf8'))))
  const voice = await import('../src/lib/coach-voice')
  check('the badge says a plan change is waiting, with the sets or alone', voice.waitingToSend(3, true) === '3 sets and a plan change waiting to send' && voice.waitingToSend(1, true) === '1 set and a plan change waiting to send' && voice.waitingToSend(0, true) === 'Plan change waiting to send' && voice.waitingToSend(2, false) === '2 sets waiting to send')
  check('...and shows it even with signal, until it has gone', /if \(!state\.isOnline \|\| state\.queuedCount > 0 \|\| planWaiting\)/.test(strip(readFileSync('src/components/OfflineStatusIndicator.tsx', 'utf8'))))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('The whole app is saved to the phone, a missing part never takes the screen, and the week counts what the phone holds.')
}
main().catch(e => { console.error(e); failures++; console.log(`\n${ran} checks ran\n1 FAILED (threw)`); process.exit(1) })
