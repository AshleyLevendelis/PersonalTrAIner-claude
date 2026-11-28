/**
 * WHAT THE OTHER SCREENS KNOW, TOLD TO THE COACH (Builder D's builders, wired by Builder B 28 Nov 2026).
 * The builders are held by their own gates (test:lift-feel-context and friends); this holds the WIRING: the chat
 * computes each block every turn, sends it as a named field, and the server prints it, with its rule, only when it has
 * something in it. verify:own-workout-chat A10b-A10e drives one of them end to end in a browser.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const chat = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
let ran = 0, failures = 0
const check = (label: string, ok: boolean) => { ran++; if (ok) console.log(`  ok: ${label}`); else { failures++; console.error(`  FAIL: ${label}`) } }

const aware = chat.slice(chat.indexOf('const readAwareness = async'), chat.indexOf('const readTurnFacts = async'))
const fields: [string, RegExp][] = [
  ['lift_feel', /lift_feel: or\(buildCoachLiftFeel\(recentLogsRef\.current\)\)/],
  ['setup_answers', /setup_answers: or\(buildCoachSetupAnswers\(profile, today\)\)/],
  ['own_workouts', /own_workouts: or\(buildCoachOwnWorkouts\(\{ workouts: loadOwnWorkouts\(id\), plans: ownPlans\(id\), today \}\)\)/],
  ['watch_waiting', /watch_waiting: or\(buildCoachWatchWaiting\(offers, today\)\)/],
  ['tightness_today', /tightness_today: or\(buildCoachTightness\(tight, tightnessWarmup\(tight, profile\.injuries \?\? \[\], warmupNames, isPregnant\(profile\)\)\)\)/],
]
console.log('\n1. The chat works out each block every turn and sends it by name')
for (const [f, re] of fields) {
  check(`${f}: built by its builder`, aware.length > 200 && re.test(aware))
  check(`${f}: sent as its own field`, new RegExp(`${f}: awareness\\.${f} \\?\\? null,`).test(chat))
  check(`${f}: printed by the server only when it has something in it`, new RegExp(`typeof context\\.${f} === 'string' && context\\.${f}\\.trim\\(\\) \\? \`\\n\\$\\{String\\(context\\.${f}\\)\\.slice\\(0, \\d+\\)\\}`).test(fn))
}
check('the turn reads them with the eaten log, and a failure tells the coach nothing rather than stopping the turn', /awareness: await readAwareness\(eatenToday\)\.catch\(\(\) => \(\{\}\)\)/.test(chat) && /context: buildContext\(eatenByDay, weekReview, patterns, awareness \?\? \{\}\)/.test(chat))
console.log('\n2. The rules that go with them')
check('how each lift felt: quote his answer, never promise a different number', /quote their own answer from HOW EACH LIFT FELT; the app already moves the weight off it, so never promise a different number\./.test(fn))
check('setup answers: explain from them, never contradict them', /Explain a plan or meal choice from SETUP ANSWERS when it is the reason; never contradict those counts\./.test(fn))
check('his own workouts: a day with one is not a rest day', /A day in THEIR OWN WORKOUTS is not a rest day; its sets were their own choice, not the plan's\./.test(fn))

console.log(`\ncoach-awareness-wiring: ${ran} checks ran`)
if (failures > 0) { console.error(`coach-awareness-wiring: ${failures} check(s) FAILED`); process.exit(1) }
console.log('coach-awareness-wiring: all checks passed')
