// ---------------------------------------------------------------------------
// THE APP OPENS FROM WHAT THE PHONE KEPT, AND ASKS THE SERVER EVERYTHING AT ONCE — 31 Oct 2026.
// Ashley: "When I first open the app, it takes a few seconds to load ... make it load quicker, and not show that
// loading as soon as you open it."
//
// verify:app-boot times the real app opening against a slow fake database. This holds the parts a timing cannot
// see, or could only see by luck:
//   1. the kept copy itself (boot-cache.ts): only ever for the profile the phone holds, never a broken one, never
//      one too big to keep, and a full phone is not an error;
//   2. the start (App.tsx): drawn from the copy on the first frame; every server answer swapped in only where the
//      screen still shows the copy (an edit made while the refresh was out survives); a failed read is never
//      "no profile"; a plan that comes back empty does not replace the one drawn; the claim once per phone;
//      everything asked for at once;
//   3. Home (Dashboard.tsx, dashboard-data.ts): its saved day drawn without waiting for the sets read; the early
//      load's answer drawn rather than thrown away; its independent reads started together.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(p, 'utf8'))

// A phone's storage, with a switch to make it full.
const store = new Map<string, string>()
let full = false
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { if (full) throw new Error('QuotaExceededError'); store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size },
} as Storage

async function main() {
  const { readBootSnapshot, saveBootSnapshot } = await import('../src/lib/boot-cache')
  const ID = 'p-1'
  const snap = {
    profile: { id: ID, weight_kg: 80 } as never, facts: [], exclusions: ['Burpees'], macros: { calories: 2500, protein: 160, carbs: 300, fat: 80 },
    latestWeightKg: 80, targetWeightAnchorKg: 80, exercisePlan: [], mesocycle: [{ week_number: 1, label: 'W1', days: [] }] as never, mesocycleCreatedAt: '2026-10-01T08:00:00Z',
    pools: { lunch: [] },
  }

  console.log('\n1. The copy kept on the phone')
  check('it is kept, and read back for the profile the phone holds', saveBootSnapshot(snap) && readBootSnapshot(ID)?.exclusions[0] === 'Burpees')
  check('...never for another profile', readBootSnapshot('p-2') === null)
  check('...nor when the phone holds no profile (New Plan, a cleared phone)', readBootSnapshot(null) === null)
  store.set('fitplan_boot_v1', '{not json')
  check('a broken copy is no copy, never a crash', readBootSnapshot(ID) === null)
  store.set('fitplan_boot_v1', JSON.stringify({ ...snap, v: 1, mesocycle: 'nope' }))
  check('a copy in the wrong shape is no copy', readBootSnapshot(ID) === null)
  store.set('fitplan_boot_v1', JSON.stringify({ ...snap, v: 2 }))
  check('a copy from another version is no copy', readBootSnapshot(ID) === null)
  store.set('fitplan_boot_v1', JSON.stringify({ ...snap, v: 1, profile: { id: 'p-2' } }))
  check('a copy whose profile is not the one it is filed under is no copy', readBootSnapshot(ID) === null)
  saveBootSnapshot(snap)
  const huge = { ...snap, exclusions: [Array.from({ length: 1_600_000 }, () => 'x').join('')] }
  check('a copy too big to keep is not kept, and the old one goes with it (never serve an older plan)', saveBootSnapshot(huge) === false && store.get('fitplan_boot_v1') === undefined)
  full = true
  let fullAnswer: unknown = 'threw'
  try { fullAnswer = saveBootSnapshot(snap) } catch { /* the answer stays 'threw' */ }
  check('a full phone answers "not kept", never throws', fullAnswer === false, fullAnswer)
  full = false

  console.log('\n2. The start (App.tsx)')
  const app = read('src/App.tsx')
  for (const [name, init] of [
    ['memoryFacts', 'boot?.facts'], ['storedProfile', 'boot?.profile'], ['macros', 'boot?.macros'], ['latestWeightKg', 'boot?.latestWeightKg'],
    ['targetWeightAnchorKg', 'boot?.targetWeightAnchorKg'], ['exercisePlan', 'boot?.exercisePlan'], ['mesocycle', 'boot?.mesocycle'],
    ['mesocycleCreatedAt', 'boot?.mesocycleCreatedAt'], ['storedMealPools', 'boot?.pools'], ['exerciseExclusions', 'boot?.exclusions'],
  ] as const) {
    check(`${name} starts from the kept copy`, new RegExp(`const \\[${name}, set\\w+\\] = useState<[^\\n]*>\\(\\(\\) => ${init.replace(/[.?]/g, m => `\\${m}`)} \\?\\?`).test(app))
  }
  check('...read once, before any of them, for the stored profile id', /const \[boot\] = useState<BootSnapshot \| null>\(\(\) => \{\s*try \{ return readBootSnapshot\(localStorage\.getItem\(STORAGE_KEY\)\) \}/.test(app)
    && app.indexOf('const [boot]') < app.indexOf('const [memoryFacts'))
  check('with a copy there is no loading screen to begin with', /const \[isRestoring, setIsRestoring\] = useState\(\(\) => !boot\)/.test(app))
  check('with no copy, every server answer goes in (stillAsKept answers yes)', /const stillAsKept = <T,>\(cur: T, kept: T \| undefined\): boolean => !boot \|\| Object\.is\(cur, kept\)/.test(app))
  const settersAt = app.indexOf('const keptMeso = boot?.mesocycle')
  const setters = settersAt < 0 ? '' : app.slice(settersAt, app.indexOf('setIsRestoring(false)', settersAt))
  for (const [setter, kept] of [['setMemoryFacts', 'facts'], ['setProfile', 'profile'], ['setLatestWeightKg', 'latestWeightKg'], ['setTargetWeightAnchorKg', 'targetWeightAnchorKg'],
    ['setMacros', 'macros'], ['setMealPools', 'pools'], ['setExercisePlan', 'exercisePlan'], ['setMesocycle', 'mesocycle']] as const) {
    check(`the refresh swaps ${kept} in only where the screen still shows the copy`, new RegExp(`${setter}\\(cur => \\(stillAsKept\\(cur, boot\\?\\.${kept}\\) \\?`).test(setters))
  }
  check('...and the plan\'s start date too', /setMesocycleCreatedAt\(cur => \(stillAsKept\(cur, boot\?\.mesocycleCreatedAt\) \?/.test(app))
  check('a plan that comes back EMPTY while the copy had one leaves the copy', /const freshMesoMissing = restoredMesocycle\.length === 0 && keptMeso\.length > 0/.test(setters) && /if \(!freshMesoMissing\) \{\s*setExercisePlan/.test(setters))
  check('meals that could not be read leave the copy\'s meals', /if \(!\(restoredPools\.failed && boot\)\) setMealPools/.test(setters))
  const errAt = app.indexOf('if (profileError) {')
  const errBranch = errAt < 0 ? '' : app.slice(errAt, app.indexOf('\n    }\n', errAt))
  check('A FAILED PROFILE READ IS NOT "NO PROFILE": the stored id is never removed on it', errAt !== -1 && !/removeItem\(STORAGE_KEY\)/.test(errBranch) && /return/.test(errBranch), errBranch.slice(0, 300))
  check('...with the copy on screen it stays, and asks again when back online', /if \(keptOnScreen\(\)\) \{ retryStartWhenOnline\(\); return \}/.test(errBranch))
  check('...with none, it says so and offers Try again', /setStartError\(START_UNREACHABLE\)/.test(errBranch) && /data-testid="start-error"/.test(app) && /Nothing is lost/.test(readFileSync('src/App.tsx', 'utf8')))
  check('a sign-in that fails with the copy on screen is not a wall either', /if \(signIn\.error\) \{\s*if \(keptOnScreen\(\)\) \{ retryStartWhenOnline\(\); return \}/.test(app))
  check('the claim runs once per phone, before the first read back', /if \(storedId && !hasClaimedOnThisPhone\(storedId\)\) await claimProfile\(storedId\)/.test(app) && /if \(profileRow\) markClaimedOnThisPhone\(ownedId\)/.test(app))
  {
    const at = (needle: string) => app.indexOf(needle)
    const awaitProfile = at('const { data: profileRow, error: profileError } = await profileP')
    const all = ['const profileP = quiet(', 'const startReadsP = quiet(Promise.all([', 'const latestWeightP = quiet(', 'const effectiveTargetWeightP = quiet(getEffectiveTargetWeightKg(']
    check('the profile, the plan, the meals, the facts and both weight reads are all asked for before any answer is awaited',
      awaitProfile !== -1 && all.every(n => at(n) !== -1 && at(n) < awaitProfile), all.map(at).concat(awaitProfile))
    check('...and nothing later in the start asks them again', !/await getLatestWeightKg\(/.test(app) && !/await getEffectiveTargetWeightKg\(/.test(app) && (app.match(/readPools\(ownedId\)/g) ?? []).length === 1)
  }
  check('the copy is kept again after the start settles and after anything it holds changes', /if \(isRestoring \|\| !storedProfile\?\.id\) return\s*const t = setTimeout\(\(\) => \{\s*saveBootSnapshot\(\{/.test(app))

  console.log('\n3. Home')
  const dash = read('src/components/Dashboard.tsx')
  check('a saved day is drawn without waiting for the sets read', /if \(!data\) \{/.test(dash) && !/if \(!activeSession\.ready \|\| !data\)/.test(dash))
  check('with no saved day, Home\'s own layout fills in, never the "Loading your day" box', /return <HomeFilling /.test(dash) && !/>Loading your day…</.test(dash))
  check('with no saved day, the load starts at once on the phone\'s own sets', /if \(!profile\.id \|\| \(!activeSession\.ready && hasDataRef\.current\)\) return/.test(dash))
  check('...and its answer is drawn unless a LATER load was drawn first (never thrown away by a re-run)', /const stale = \(\) => seq < drawnSeqRef\.current \|\| dayKeyRef\.current !== forDay/.test(dash) && /if \(stale\(\)\) return\s*drawnSeqRef\.current = seq/.test(dash) && !/cancelled = true/.test(dash))
  const dd = read('src/lib/dashboard-data.ts')
  for (const fn of ['getTodayLedger', 'getWaterTotalForDate', 'getWeighInPicture', 'getActiveGoals', 'refreshPRCacheFromDB', 'getRecentLogs', 'getEatenProteinByDate']) {
    check(`Home's ${fn} is started with the others, not awaited on its own`, !new RegExp(`await ${fn}\\(`).test(dd) && new RegExp(`${fn}\\(`).test(dd))
  }
  const nt = read('src/lib/nutrition-targets.ts')
  check('the weigh-in picture reads its two tables together', /const targetRowsP = getNutritionTargets\(/.test(nt) && nt.indexOf('const targetRowsP') < nt.indexOf('const recent = await getRecentWeighIns'))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('The app opens from what the phone kept, asks the server everything at once, and loses nothing it drew.')
}
main().catch(e => { console.error(e); process.exit(1) })
