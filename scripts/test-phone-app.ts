// test:phone-app — THE PHONE APP ASKS FOR STEPS AND NOTHING ELSE, AND SAYS SO EVERYWHERE IT IS ASKED (20 Nov 2026).
//
// The phone app is the same web app inside a native shell (Capacitor), so it can read steps from Apple Health and
// Health Connect. What a store reviewer reads is the native settings: the permissions Android declares, the sentence
// iPhone shows on its permission sheet, the HealthKit entitlement and the privacy page. Each must say exactly what
// the code does. The health plugin declares read AND write for some forty kinds of health data by default; Google
// Play refuses an app that declares health permissions it does not use, so the most important check here is that
// every one of those but READ_STEPS is removed, derived from the plugin's OWN manifest so a plugin update that adds
// a new permission fails this check instead of shipping it.
//
// What this cannot prove: that Xcode and Android Studio build it, or that a real phone grants and counts. Those are
// on Ashley's machine and his phone (docs/plans/phone-app.md).
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { stepsToKeep, dayBounds, stepsSourceLine, healthStoreName } from '../src/lib/health-steps'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '')
let ran = 0, failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

console.log('\n1. Android declares READ_STEPS and removes every other health permission the plugin brings')
{
  const plugin = read('node_modules/@capgo/capacitor-health/android/src/main/AndroidManifest.xml')
  const pluginPerms = [...plugin.matchAll(/android\.permission\.health\.([A-Z_]+)/g)].map(m => m[1])
  const app = strip(read('android/app/src/main/AndroidManifest.xml'))
  const declared = [...app.matchAll(/<uses-permission android:name="android\.permission\.health\.([A-Z_]+)"\s*\/>/g)].map(m => m[1])
  const removed = new Set([...app.matchAll(/<uses-permission android:name="android\.permission\.health\.([A-Z_]+)" tools:node="remove"\s*\/>/g)].map(m => m[1]))
  check('the plugin was read (sanity check on this check: it brings more than one health permission)', pluginPerms.length > 10, pluginPerms.length)
  check('READ_STEPS is declared, and it is the only health permission declared', JSON.stringify(declared) === JSON.stringify(['READ_STEPS']), declared)
  const kept = pluginPerms.filter(p => p !== 'READ_STEPS' && !removed.has(p))
  check('every other health permission the plugin declares is removed', kept.length === 0, kept)
  check('the tools namespace the removals need is on the manifest', /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/.test(app))
  const minSdk = Number((read('android/variables.gradle').match(/minSdkVersion\s*=\s*(\d+)/) ?? [])[1])
  check('Android 8 (API 26) or later, which Health Connect needs', minSdk >= 26, minSdk)
  const url = (read('android/app/src/main/res/values/strings.xml').match(/name="health_connect_privacy_policy_url">([^<]+)</) ?? [])[1] ?? ''
  check('Health Connect\'s "Privacy policy" link points at the app\'s own privacy page', /^https:\/\/personal-tr-a-iner-claude-yco8\.vercel\.app\/privacy\.html$/.test(url), url)
}

console.log('\n2. iPhone: the sentence on the permission sheet, and the HealthKit entitlement')
{
  const plist = read('ios/App/App/Info.plist')
  const share = (plist.match(/<key>NSHealthShareUsageDescription<\/key>\s*<string>([^<]+)<\/string>/) ?? [])[1] ?? ''
  check('the read sentence is there and says steps', /step/i.test(share) && /steps only/i.test(share), share)
  check('...and says it never writes to Health', /never writes/i.test(share), share)
  check('no write sentence: the app asks to write nothing', !/NSHealthUpdateUsageDescription/.test(plist))
  const ent = read('ios/App/App/App.entitlements')
  check('the HealthKit entitlement is on', /<key>com\.apple\.developer\.healthkit<\/key>\s*<true\/>/.test(ent))
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
  check('both build settings (debug and release) sign with the entitlement', (pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) ?? []).length === 2)
}

console.log('\n3. The code asks for what the settings say, and the website never loads the plugin')
{
  const src = strip(read('src/lib/health-steps.ts'))
  const asks = [...src.matchAll(/requestAuthorization\(\{([^}]*)\}\)/g)].map(m => m[1].replace(/\s+/g, ''))
  check('one permission request, for reading steps and nothing else', JSON.stringify(asks) === JSON.stringify(["read:['steps']"]), asks)
  check('nothing is ever written to Health', !/saveSample|write:/.test(src))
  check('the plugin is loaded by a dynamic import only (the website\'s download does not grow)', /await import\('@capgo\/capacitor-health'\)/.test(src))
  const statics = ['src/components/Dashboard.tsx', 'src/components/ProfileScreen.tsx', 'src/components/HealthStepsSection.tsx', 'src/lib/health-steps.ts', 'src/main.tsx', 'src/App.tsx']
    .filter(f => /^import[^\n]*['"]@capgo\/capacitor-health['"]/m.test(read(f)) || /^import[^\n]*['"]@capacitor\/core['"]/m.test(read(f)))
  check('no file imports the plugin or Capacitor statically', statics.length === 0, statics)
  const main = strip(read('src/main.tsx'))
  check('the offline helper is not registered inside the phone app', /isNativePlatform/.test(main) && /!inPhoneApp/.test(main))
}

console.log('\n4. The privacy page says what the app does with steps')
{
  check('the page exists where the Android link and the store listings point', existsSync(join(ROOT, 'public/privacy.html')))
  const page = existsSync(join(ROOT, 'public/privacy.html')) ? read('public/privacy.html') : ''
  check('it says steps only, and never written', /reads your <strong>step count<\/strong>/.test(page) && /never writes to Apple Health or Health Connect/.test(page))
  check('it says step data is never used for advertising or sold', /never used for advertising/.test(page) && /never sold/.test(page))
  check('it names Google\'s Gemini as where chat messages go', /Gemini/.test(page))
}

console.log('\n5. Which number a day keeps')
{
  check('no row yet: the phone\'s count is saved', stepsToKeep(null, 6400.4) === 6400)
  check('no row and the phone says 0: nothing is written (0 would claim a day of no steps)', stepsToKeep(null, 0) === null)
  check('a typed number is never lowered by the phone', stepsToKeep({ steps: 9000, source: 'manual' }, 6400) === null)
  check('...and is replaced once the phone passes it', stepsToKeep({ steps: 9000, source: 'manual' }, 12000) === 12000)
  check('an earlier phone count is replaced by the newer one', stepsToKeep({ steps: 6400, source: 'healthkit' }, 7100) === 7100)
  check('the same count is not written again', stepsToKeep({ steps: 6400, source: 'health_connect' }, 6400) === null)
  check('a count no day can hold is refused', stepsToKeep(null, 250_000) === null)
  const now = new Date(2026, 10, 20, 15, 30)
  const b = dayBounds('2026-11-20', now)
  check('today runs from local midnight to now', b.start.getTime() === new Date(2026, 10, 20).getTime() && b.end.getTime() === now.getTime())
  const past = dayBounds('2026-11-19', now)
  check('an earlier day runs midnight to midnight', past.end.getTime() === new Date(2026, 10, 20).getTime())
  check('the line names where a number came from, and a typed one names nothing',
    stepsSourceLine({ source: 'healthkit' }) === 'From Apple Health' && stepsSourceLine({ source: 'health_connect' }) === 'From Health Connect' && stepsSourceLine({ source: 'manual' }) === null)
  check('each phone\'s store by its own name', healthStoreName('ios') === 'Apple Health' && healthStoreName('android') === 'Health Connect')
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} check(s) failed`); process.exit(1) }
console.log('The phone app asks for steps and nothing else, and says so everywhere it is asked.')
