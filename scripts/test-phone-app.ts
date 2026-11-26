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
  const pluginPerms = [...plugin.matchAll(/android\.permission\.health.([A-Z0-9_]+)/g)].map(m => m[1])
  const app = strip(read('android/app/src/main/AndroidManifest.xml'))
  const declared = [...app.matchAll(/<uses-permission android:name="android\.permission\.health.([A-Z0-9_]+)"\s*\/>/g)].map(m => m[1])
  const removed = new Set([...app.matchAll(/<uses-permission android:name="android\.permission\.health.([A-Z0-9_]+)" tools:node="remove"\s*\/>/g)].map(m => m[1]))
  check('the plugin was read (sanity check on this check: it brings more than one health permission)', pluginPerms.length > 10, pluginPerms.length)
  // + READ_HEART_RATE and READ_RESTING_HEART_RATE, his ruling 24 Nov 2026 "1 + 2" (health-heart.ts). An enumerated list ON PURPOSE: a
  // health permission joins only by a decision, and Google reviews every one.
  // + READ_DISTANCE and READ_ACTIVE_CALORIES_BURNED, his "A, build it" 25 Nov 2026 (a recorded walk or run, activity-recording.ts).
  // + READ_EXERCISE, his brief 26 Nov 2026 (workouts the watch recorded, watch-workouts.ts).
  const allowed = ['READ_ACTIVE_CALORIES_BURNED', 'READ_DISTANCE', 'READ_EXERCISE', 'READ_HEART_RATE', 'READ_RESTING_HEART_RATE', 'READ_STEPS']
  check('READ_STEPS, heart rate, distance, active calories and workouts are declared, and nothing else', JSON.stringify([...declared].sort()) === JSON.stringify(allowed), declared)
  const kept = pluginPerms.filter(p => !allowed.includes(p) && !removed.has(p))
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
  // Since 25 Nov 2026 (a recorded walk or run) the app reads more than steps, and the sentence must name every kind it
  // asks for. It said "steps only" from 24 Nov while the heart rate switch was already asking for heart rate.
  check('the read sentence names every kind the app reads: steps, distance, calories, heart rate', ['step', 'distance', 'calories', 'heart rate'].every(w => share.toLowerCase().includes(w)) && !/steps only/i.test(share), share)
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
  // Two requests since 24 Nov 2026 (his "1 + 2", health-heart.ts): steps, and heart rate with resting heart rate, each
  // asked only from its own switch. Read only, both.
  // A third since 25 Nov 2026: the first Start of a recorded walk or run (activity-recording.ts).
  // A fourth since 26 Nov 2026: the watch's workouts, from their own switch (watch-workouts.ts).
  check('four permission requests, steps, heart rate, a recording and the workouts from a watch, read only and nothing else', JSON.stringify(asks) === JSON.stringify(["read:['steps']", "read:['heartRate','restingHeartRate']", "read:['steps','distance','calories','heartRate']", "read:['workouts','distance','calories','heartRate','steps']"]), asks)
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

console.log('\n6. Store icons and the upload key (store work, 20 Nov 2026)')
{
  const gradle = readFileSync('android/app/build.gradle', 'utf8').replace(/\/\/.*$/gm, '')
  const ignore = readFileSync('android/.gitignore', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  check('a release build is signed from android/keystore.properties when that file exists, and only then',
    /rootProject\.file\('keystore\.properties'\)/.test(gradle) && /if \(keystorePropertiesFile\.exists\(\)\) \{\s*signingConfig signingConfigs\.release/.test(gradle))
  check('...and no password or key path is written into the build file itself', !/storePassword\s+['"]/.test(gradle) && !/keyPassword\s+['"]/.test(gradle))
  check('the key, and the file with its passwords, can never be committed', ['*.jks', '*.keystore', 'keystore.properties'].every(p => ignore.includes(p)), ignore.filter(l => /jks|keystore/.test(l)))
  const png = (f: string) => { const b = readFileSync(join(ROOT, f)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 6 } }
  const only = png('assets/icon-only.png')
  check('the store icon is a 1024 square with no see-through pixels allowed (Apple refuses an icon with transparency)', only.w === 1024 && only.h === 1024 && !only.alpha, only)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} check(s) failed`); process.exit(1) }
console.log('The phone app reads only what it says it reads (steps, heart rate, and the distance and calories of a recorded walk), and writes nothing.')
