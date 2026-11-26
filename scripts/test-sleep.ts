// SLEEP FROM THE WATCH (his pick "A", 26 Nov 2026; src/lib/sleep-nights.ts). The rules, as logic:
//   1. what a night is: time asleep, awake time out, a nap never the night, under two hours not a night
//   2. his usual, and what a short night is
//   3. the picture Home draws and the flag the coach offers from (two short nights in a row, never one)
//   4. what the coach is told
//   5. source properties: the switch gates the read, nothing is saved, the offer is the coach's existing one
// The screen half is verify:sleep. One exit, at the bottom.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  nightsFromSessions, usualSleep, isShortNight, sleepPicture, sleepContextForCoach, hoursMinutes, shiftDate,
  MIN_NIGHT_MINUTES, SHORT_BY_MINUTES, SHORT_UNDER_MINUTES, type SleepSession,
} from '../src/lib/sleep-nights'
import { recoveryOfferText, RECOVERY_CHIPS } from '../src/lib/coach-nudge'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
let failures = 0, ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`) }
}

// A fixed "today": Wednesday 16 Sep 2026. Nothing here reads the machine's calendar.
const TODAY = '2026-09-16'
const at = (date: string, h: number, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m, 0) }
const iso = (d: Date) => d.toISOString()
/** A night he woke from on `date`: in bed at 23:00 the evening before, asleep `minutes` with one 20 minute spell awake. */
const night = (date: string, minutes: number): SleepSession => {
  const bed = at(shiftDate(date, -1), 23, 0)
  const t = (min: number) => iso(new Date(bed.getTime() + min * 60000))
  return { start: t(0), end: t(minutes + 20), stages: [
    { start: t(0), end: t(100), stage: 'light' }, { start: t(100), end: t(180), stage: 'deep' },
    { start: t(180), end: t(200), stage: 'awake' }, { start: t(200), end: t(minutes - 40 + 20), stage: 'rem' }, { start: t(minutes - 20), end: t(minutes + 20), stage: 'light' },
  ] }
}
const nightsMap = (rows: Record<string, number>) => new Map(Object.entries(rows))
/** `usual` minutes on each of the 14 nights before the last two, then the last two as given (null: not measured). */
const fortnight = (usual: number, before: number | null, last: number | null) => {
  const m = new Map<string, number>()
  for (let back = 2; back < 16; back++) m.set(shiftDate(TODAY, -back), usual)
  if (before != null) m.set(shiftDate(TODAY, -1), before)
  if (last != null) m.set(TODAY, last)
  return m
}

// ---------------------------------------------------------------------------
console.log('\n1. What a night is')
// ---------------------------------------------------------------------------
{
  const one = nightsFromSessions([night(TODAY, 445)])
  check('a night belongs to the day he woke into', one.size === 1 && one.has(TODAY), [...one])
  check('...and is the time ASLEEP: the 20 minutes awake are not counted (445, not 465)', one.get(TODAY) === 445, one.get(TODAY))
  const inBed = nightsFromSessions([{ ...night(TODAY, 445), stages: [...night(TODAY, 445).stages!, { start: iso(at(shiftDate(TODAY, -1), 22, 0)), end: iso(at(shiftDate(TODAY, -1), 23, 0)), stage: 'inBed' }] }])
  check('time merely in bed is not sleep', inBed.get(TODAY) === 445, inBed.get(TODAY))
  const unstaged = nightsFromSessions([{ start: iso(at(shiftDate(TODAY, -1), 23, 30)), end: iso(at(TODAY, 6, 30)), stages: null }])
  check('a session with no stages counts whole (7 h)', unstaged.get(TODAY) === 420, unstaged.get(TODAY))
  // Apple's shape: one session per stage.
  const apple = night(TODAY, 445).stages!.map(st => ({ start: st.start, end: st.end, stages: [st] }))
  check('one session per stage (Apple) reads the same as one session with stages (Android)', nightsFromSessions(apple).get(TODAY) === 445, [...nightsFromSessions(apple)])
  // Waking in the night: two sessions an hour apart are one night.
  const split = nightsFromSessions([
    { start: iso(at(shiftDate(TODAY, -1), 23, 0)), end: iso(at(TODAY, 2, 0)), stages: null },
    { start: iso(at(TODAY, 3, 0)), end: iso(at(TODAY, 7, 0)), stages: null },
  ])
  check('waking for an hour does not make two nights: 3 h + 4 h is one night of 7 h', split.size === 1 && split.get(TODAY) === 420, [...split])
  // A nap: 13:00 to 14:30 the same day.
  const nap = { start: iso(at(TODAY, 13, 0)), end: iso(at(TODAY, 14, 30)), stages: null }
  check('a nap is never added to the night', nightsFromSessions([night(TODAY, 340), nap]).get(TODAY) === 340, [...nightsFromSessions([night(TODAY, 340), nap])])
  check('...and a nap on a day the watch was off overnight is not a night at all', nightsFromSessions([nap]).size === 0)
  // A LONG nap (three hours, so it clears the two-hour floor): still never added to the night it follows.
  const longNap = { start: iso(at(TODAY, 12, 0)), end: iso(at(TODAY, 15, 0)), stages: null }
  check('a three-hour afternoon sleep is not added either: the night is its longest sleep (340, not 520)', nightsFromSessions([night(TODAY, 340), longNap]).get(TODAY) === 340, [...nightsFromSessions([night(TODAY, 340), longNap])])
  // LITERALS beside the constant: 119 minutes is not a night, 120 is.
  const of = (minutes: number) => nightsFromSessions([{ start: iso(at(TODAY, 2, 0)), end: iso(new Date(at(TODAY, 2, 0).getTime() + minutes * 60000)), stages: null }])
  check('under two hours asleep is not a night (119 no, 120 yes)', of(119).size === 0 && of(120).size === 1 && MIN_NIGHT_MINUTES === 120)
  const twice = nightsFromSessions([night(TODAY, 445), night(TODAY, 445)])
  check('the same night written by two apps is counted once', twice.get(TODAY) === 445, twice.get(TODAY))
  const early = nightsFromSessions([{ start: iso(at(shiftDate(TODAY, -1), 19, 0)), end: iso(at(shiftDate(TODAY, -1), 22, 30)), stages: null }])
  check('a sleep that ends late in the evening is the start of the next day\'s night', early.has(TODAY) && !early.has(shiftDate(TODAY, -1)), [...early])
  const earlyBed = nightsFromSessions([{ start: iso(at(shiftDate(TODAY, -1), 17, 30)), end: iso(at(TODAY, 1, 30)), stages: null }])
  check('in bed at 17:30 and up at 01:30: the night belongs to the day he woke into, not the day it began', earlyBed.has(TODAY) && earlyBed.size === 1, [...earlyBed])
  const day = nightsFromSessions([{ start: iso(at(TODAY, 9, 0)), end: iso(at(TODAY, 16, 0)), stages: null }])
  check('a night-shift sleep in the daytime (09:00 to 16:00) is that day\'s night', day.get(TODAY) === 420, [...day])
  check('a record that makes no sense (ends before it starts, or longer than a day) is ignored', nightsFromSessions([{ start: iso(at(TODAY, 7)), end: iso(at(TODAY, 1)), stages: null }, { start: iso(at(shiftDate(TODAY, -3), 1)), end: iso(at(TODAY, 1)), stages: null }]).size === 0)
  const each = nightsFromSessions([night(TODAY, 445), night(shiftDate(TODAY, -1), 400), night(shiftDate(TODAY, -2), 380)])
  check('each night is its own date', each.get(TODAY) === 445 && each.get(shiftDate(TODAY, -1)) === 400 && each.get(shiftDate(TODAY, -2)) === 380, [...each])
  check('dates move as calendar days (across a month end, and a clock change)', shiftDate('2026-10-01', -1) === '2026-09-30' && shiftDate('2026-03-29', 1) === '2026-03-30' && shiftDate('2026-10-25', 1) === '2026-10-26')
}

// ---------------------------------------------------------------------------
console.log('\n2. His usual, and a short night')
// ---------------------------------------------------------------------------
{
  check('his usual is the middle of the earlier nights (440)', usualSleep(fortnight(440, 300, 300), TODAY) === 440)
  check('...the two nights being judged are never part of it', usualSleep(fortnight(440, 100, 100), TODAY) === 440 && usualSleep(nightsMap({ [TODAY]: 400, [shiftDate(TODAY, -1)]: 400 }), TODAY) === null)
  const threeAndTwo = nightsMap({ [TODAY]: 440, [shiftDate(TODAY, -1)]: 440, [shiftDate(TODAY, -2)]: 440, [shiftDate(TODAY, -3)]: 440, [shiftDate(TODAY, -4)]: 440 })
  check('...so three earlier nights plus the two judged are not five nights of usual', usualSleep(threeAndTwo, TODAY) === null, usualSleep(threeAndTwo, TODAY))
  const five = new Map<string, number>(); for (let b = 2; b < 7; b++) five.set(shiftDate(TODAY, -b), 430)
  const four = new Map<string, number>(); for (let b = 2; b < 6; b++) four.set(shiftDate(TODAY, -b), 430)
  check('five nights make a usual, four do not', usualSleep(five, TODAY) === 430 && usualSleep(four, TODAY) === null)
  const wobble = fortnight(440, null, null); wobble.set(shiftDate(TODAY, -4), 120)
  check('one terrible night does not move it (a median)', usualSleep(wobble, TODAY) === 440)
  const old = new Map<string, number>(); for (let b = 16; b < 30; b++) old.set(shiftDate(TODAY, -b), 430)
  check('nights from more than 16 back are not his usual now', usualSleep(old, TODAY) === null)

  check('an hour under his usual and under seven hours is a short night', isShortNight(380, 440))
  check('...59 minutes under is not, 60 is', !isShortNight(381, 440) && isShortNight(380, 440) && SHORT_BY_MINUTES === 60)
  check('...seven hours or more is never short, whatever his usual (9 h usual, 7 h night)', !isShortNight(420, 540) && isShortNight(419, 540) && SHORT_UNDER_MINUTES === 420)
  check('a five-hour night is not "short" for someone whose usual is five and a half', !isShortNight(300, 330))
  check('no usual, or no night: never short', !isShortNight(200, null) && !isShortNight(null, 440) && !isShortNight(undefined, 440))
}

// ---------------------------------------------------------------------------
console.log('\n3. The picture for Home, and when the coach offers')
// ---------------------------------------------------------------------------
{
  const ok = sleepPicture(fortnight(440, 445, 450), TODAY)
  check('an ordinary night: last night, his usual and the gap', ok.lastNight === 450 && ok.usual === 440 && ok.against === 10 && !ok.short && ok.flag === null, ok)
  check('...and the line says "about your usual"', ok.line === '7 h 30 asleep last night, about your usual', ok.line)
  check('the week is seven nights, oldest first, ending today', ok.week.length === 7 && ok.week[6].date === TODAY && ok.week[0].date === shiftDate(TODAY, -6) && ok.week[6].minutes === 450)

  const one = sleepPicture(fortnight(440, 445, 340), TODAY)
  check('ONE short night is said and nothing is offered', one.short && one.flag === null && one.line === '5 h 40 asleep last night, 1 h 40 under your usual', one)
  const two = sleepPicture(fortnight(440, 350, 340), TODAY)
  check('TWO short nights in a row raise the flag', two.flag !== null && two.flag.nights === 2 && two.flag.since === shiftDate(TODAY, -1), two.flag)
  check('...in the app\'s words, with the numbers: "about 5 h 45 a night for the last 2 nights, against your usual 7 h 20"', two.flag?.line === "You've slept about 5 h 45 a night for the last 2 nights, against your usual 7 h 20.", two.flag?.line)
  const three = fortnight(440, 350, 340); three.set(shiftDate(TODAY, -2), 360)
  const p3 = sleepPicture(three, TODAY)
  check('three in a row is one run from its FIRST night (so it is raised once, not again each day)', p3.flag?.nights === 3 && p3.flag.since === shiftDate(TODAY, -2), p3.flag)
  check('a good night last night ends it, whatever came before', sleepPicture(fortnight(440, 340, 445), TODAY).flag === null)
  check('a short night then a night the watch did not measure is not two short nights', sleepPicture(fortnight(440, null, 340), TODAY).flag === null && sleepPicture(fortnight(440, 340, null), TODAY).flag === null)
  check('nothing from the watch for last night: no line, and the week shows the gap', sleepPicture(fortnight(440, 445, null), TODAY).line === null && sleepPicture(fortnight(440, 445, null), TODAY).week[6].minutes === null)
  const fresh = sleepPicture(nightsMap({ [TODAY]: 340, [shiftDate(TODAY, -1)]: 330 }), TODAY)
  check('with no usual yet, short nights are never claimed', fresh.flag === null && !fresh.short && fresh.line === '5 h 40 asleep last night', fresh)
  check('over his usual says "over"', sleepPicture(fortnight(440, 445, 500), TODAY).line === '8 h 20 asleep last night, 1 h over your usual')

  check('time is said as "6 h 10", "7 h", "45 min"', hoursMinutes(370) === '6 h 10' && hoursMinutes(420) === '7 h' && hoursMinutes(45) === '45 min' && hoursMinutes(365) === '6 h 05')

  const offer = recoveryOfferText(two.flag?.line ?? '', 'Legs', 'sleep')
  check('the offer is the coach\'s existing lighter-day offer with its own reason', offer === "You've slept about 5 h 45 a night for the last 2 nights, against your usual 7 h 20. Short sleep makes hard work feel harder. Want today's Legs lighter?", offer)
  check('...a question, with the two answers every recovery offer has', offer.endsWith('?') && RECOVERY_CHIPS.length === 2 && /shortest version/.test(RECOVERY_CHIPS[0]) && /keep it as it is/.test(RECOVERY_CHIPS[1]))
  check('...and the resting heart rate offer keeps its own words', recoveryOfferText('X.', 'Legs') === "X. That can mean you're still carrying some fatigue. Want today's Legs lighter?")
  check('no score, no grade, no advice about sleep itself in anything the app says', ![ok.line, one.line, two.flag?.line, offer].some(t => /score|quality|poor|bad|should|need|\/100|%/i.test(t ?? '')))
}

// ---------------------------------------------------------------------------
console.log('\n4. What the coach is told')
// ---------------------------------------------------------------------------
{
  const two = sleepContextForCoach(sleepPicture(fortnight(440, 350, 340), TODAY))
  check('last night and his usual, as facts', /Last night: 5 h 40 asleep\./.test(two) && /Usual: 7 h 20/.test(two), two)
  check('...the week\'s earlier nights by date', new RegExp(`${shiftDate(TODAY, -1)} 5 h 50`).test(two), two)
  check('...and "2 short nights in a row"', /2 short nights in a row\./.test(two), two)
  const one = sleepContextForCoach(sleepPicture(fortnight(440, 445, 340), TODAY))
  check('one short night is told as one, with the rule that it changes nothing', /One short night \(a single one is no reason to change a session\)/.test(one) && !/in a row/.test(one), one)
  check('nothing from the watch at all costs the coach no words', sleepContextForCoach(sleepPicture(new Map(), TODAY)) === '')
  check('no night yet today is said, not guessed', /Last night: nothing from the watch yet\./.test(sleepContextForCoach(sleepPicture(fortnight(440, 445, null), TODAY))))
}

// ---------------------------------------------------------------------------
console.log('\n5. The switch, what is saved, and the coach\'s rule')
// ---------------------------------------------------------------------------
{
  const lib = strip(read('src/lib/health-sleep.ts'))
  const readFn = lib.slice(lib.indexOf('export async function readSleepPicture'))
  check('the read is gated on the switch before anything is asked of the phone', readFn.indexOf('if (!isHealthSleepConnected()) return null') > 0 && readFn.indexOf('if (!isHealthSleepConnected()) return null') < readFn.indexOf('healthAdapter'))
  check('NOTHING about his sleep is saved: no database and no storage write beyond the switch', !/supabase|\.insert\(|\.upsert\(|\.update\(/.test(lib) && (lib.match(/localStorage\.setItem\(/g) ?? []).length === 1 && /localStorage\.setItem\(SLEEP_CONNECTED_KEY, '1'\)/.test(lib))
  check('a failed read is nothing to say, never a throw', /catch \{\s*return null\s*\}/.test(readFn))
  const adapter = strip(read('src/lib/health-steps.ts'))
  check('the phone is asked to READ sleep and never to write', /requestAuthorization\(\{ read: \['sleep'\] \}\)/.test(adapter) && !/write:/.test(adapter))
  const home = strip(read('src/components/Dashboard.tsx'))
  check('Home loads the sleep code only in the phone app', /if \(!isPhoneApp\(\)\) return[\s\S]{0,200}import\('@\/lib\/health-sleep'\)/.test(home) && !/^import .*health-sleep/m.test(home) && !/^import .*sleep-nights/m.test(home))
  check('...and mounts the row only with the switch on', /\{sleepOn && profile\.id && </.test(home))
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  check('the chat reads sleep on the phone only, and tells the coach in its own field', /if \(isPhoneApp\(\)\) \{[\s\S]{0,500}readSleepPicture\(/.test(chat) && /sleep_context: sleepContext,/.test(chat))
  check('one offer of a lighter day, never two: a raised resting heart rate comes first', /setHeartRecovery\(picture\.recovery \? \{ line: picture\.recovery\.line, since: picture\.recovery\.since \} : sleepFlag\)/.test(chat))
  check('...and a sleep run is its own once-only key', /since: `sleep-\$\{sleep\.flag\.since\}`, kind: 'sleep'/.test(chat))
  const coach = read('supabase/functions/chat-gemini/index.ts')
  const rule = coach.slice(coach.indexOf('SLEEP (time asleep'), coach.indexOf('CARDIO & CONDITIONING HISTORY (last 14 days)'))
  check('the coach is told the figures only when there are some', /typeof context\.sleep_context === "string" && context\.sleep_context\.trim\(\) \?/.test(coach) && rule.length > 200)
  check('its rule: one short night changes nothing; two or more is an OFFER, never a change unasked', /ONE short night changes nothing/.test(rule) && /TWO OR MORE short nights in a row is a reason to OFFER/.test(rule) && /never to change their plan unasked/.test(rule))
  check('...never a score, never a required number of hours, never a cause, and the GP for a lasting problem', /Never give sleep a score or a grade/.test(rule) && /never tell them how many hours they must get/.test(rule) && /name a cause/.test(rule) && /speak to their GP/.test(rule))
  const profile = strip(read('src/components/HealthStepsSection.tsx'))
  check('Profile says it reads and writes nothing, and that the plan never changes unless he says yes', /It reads sleep and writes nothing\./.test(profile) && /Your plan never changes unless you say yes/.test(profile) && /not saved/.test(profile))
  const privacy = read('public/privacy.html')
  check('the privacy page says what is read, that it is not saved, and what the coach is sent', /sleep from your\s+watch/.test(privacy) && /not saved to our database/.test(privacy) && /sent with a message you send the coach/.test(privacy))
}

console.log(`\n${ran} checks ran, ${failures} failed`)
process.exit(failures > 0 ? 1 : 0)
